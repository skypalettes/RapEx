/**
 * RapEx Service Worker。
 *
 * 責務:
 *   - Salesforce の Cookie(sid) からセッション ID を取り出す
 *   - REST / Tooling API を叩いて組織固有のメタデータを取得する
 *   - 取得結果を chrome.storage.session（インメモリ）に「組織ドメイン」をキーにキャッシュする
 *   - 代理ログイン用のユーザー検索 (SOQL)
 *
 * セキュリティ方針: 組織のメタデータとセッション ID はディスクに書かない。
 * chrome.storage.session はブラウザを閉じると破棄される。
 */

importScripts('lib/org.js');

const { toApiHost, orgIdFromSessionId, escapeSoqlLike } = RapExOrg;

const FALLBACK_API_VERSION = '62.0';
const CATALOG_TTL_MS = 30 * 60 * 1000;
const SOSL_TIMEOUT_MS = 8000;
const ORG_INFO_TIMEOUT_MS = 8000;
const USER_SEARCH_TIMEOUT_MS = 8000;
const USER_SEARCH_LIMIT = 10;

/** 検索対象から外すシステム系オブジェクト */
const EXCLUDED_SUFFIX = /(__Share|__History|__Feed|__Tag|__ChangeEvent|__hd|__hd\d*)$/;

/** 同一組織への同時取得を 1 本にまとめるためのテーブル */
const inflight = new Map();

/* ------------------------------------------------------------------ */
/* セッション                                                          */
/* ------------------------------------------------------------------ */

async function getSessionId(apiHost) {
  const direct = await chrome.cookies.get({ url: `https://${apiHost}/`, name: 'sid' });
  if (direct && direct.value && direct.value.indexOf('!') > 0) return direct.value;

  // My Domain の別名や sandbox でヒットしない場合のフォールバック
  const all = await chrome.cookies.getAll({ name: 'sid' });
  const suffix = apiHost.replace(/^[^.]+\./, '');
  const candidate = all.find((c) => {
    if (!c.value || c.value.indexOf('!') < 0) return false;
    const domain = c.domain.replace(/^\./, '');
    return domain === apiHost || apiHost.endsWith(domain) || domain.endsWith(suffix);
  });
  return candidate ? candidate.value : null;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

class SalesforceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function apiFetch(apiHost, sessionId, path, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://${apiHost}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionId}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) {
      throw new SalesforceError('UNAUTHORIZED', 'セッションが無効です。再ログインしてください。');
    }
    if (!response.ok) {
      throw new SalesforceError('HTTP_' + response.status, `API エラー (${response.status})`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new SalesforceError('TIMEOUT', 'API がタイムアウトしました。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveApiVersion(apiHost, sessionId) {
  const key = `rapex:version:${apiHost}`;
  const cached = await chrome.storage.session.get(key);
  if (cached[key]) return cached[key];
  try {
    const versions = await apiFetch(apiHost, sessionId, '/services/data/', 8000);
    const latest = Array.isArray(versions) && versions.length
      ? versions[versions.length - 1].version
      : FALLBACK_API_VERSION;
    await chrome.storage.session.set({ [key]: latest });
    return latest;
  } catch (_) {
    return FALLBACK_API_VERSION;
  }
}

/** Object Manager の URL に必要な DurableId を引く（失敗しても致命的ではない） */
async function fetchDurableIds(apiHost, sessionId, version) {
  try {
    const soql = 'SELECT DurableId, QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true LIMIT 2000';
    const result = await apiFetch(
      apiHost,
      sessionId,
      `/services/data/v${version}/tooling/query/?q=${encodeURIComponent(soql)}`,
      12000
    );
    const map = {};
    for (const record of result.records || []) {
      if (record.QualifiedApiName && record.DurableId) map[record.QualifiedApiName] = record.DurableId;
    }
    return map;
  } catch (_) {
    return {};
  }
}

/**
 * 組織のオブジェクト一覧を取得する。
 * カスタムオブジェクトとカスタムメタデータ型を対象にする（標準は静的辞書が持つ）。
 */
async function fetchCatalog(apiHost) {
  const sessionId = await getSessionId(apiHost);
  if (!sessionId) throw new SalesforceError('NO_SESSION', 'Salesforce のセッションが見つかりません。');

  const version = await resolveApiVersion(apiHost, sessionId);
  const described = await apiFetch(apiHost, sessionId, `/services/data/v${version}/sobjects/`);
  const durableIds = await fetchDurableIds(apiHost, sessionId, version);

  const objects = (described.sobjects || [])
    .filter((sobject) => {
      if (!sobject.custom) return false;
      if (sobject.deprecatedAndHidden) return false;
      if (EXCLUDED_SUFFIX.test(sobject.name)) return false;
      return sobject.queryable || sobject.createable;
    })
    .map((sobject) => ({
      apiName: sobject.name,
      label: sobject.label,
      labelPlural: sobject.labelPlural,
      keyPrefix: sobject.keyPrefix,
      durableId: durableIds[sobject.name] || null,
      layoutable: !!sobject.layoutable,
      createable: !!sobject.createable
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));

  return { objects, apiVersion: version, fetchedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* キャッシュ（組織ドメインをキーにセッションストレージへ）             */
/* ------------------------------------------------------------------ */

function catalogKey(apiHost) {
  return `rapex:catalog:${apiHost}`;
}

async function getCatalog(host, { force = false } = {}) {
  const apiHost = toApiHost(host);
  const key = catalogKey(apiHost);

  if (!force) {
    const cached = await chrome.storage.session.get(key);
    const hit = cached[key];
    if (hit && Date.now() - hit.fetchedAt < CATALOG_TTL_MS) {
      return { ...hit, cached: true };
    }
  }

  // 同一組織への同時リクエストは 1 本にまとめる
  if (!force && inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    try {
      const fresh = await fetchCatalog(apiHost);
      await chrome.storage.session.set({ [key]: fresh });
      return { ...fresh, cached: false };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

async function clearCatalog(host) {
  const apiHost = toApiHost(host);
  await chrome.storage.session.remove([catalogKey(apiHost), orgInfoKey(apiHost), `rapex:version:${apiHost}`]);
  inflight.delete(catalogKey(apiHost));
  inflight.delete(orgInfoKey(apiHost));
  return { cleared: apiHost };
}

/* ------------------------------------------------------------------ */
/* 組織の設定（個人取引先の有効化など）                                 */
/* ------------------------------------------------------------------ */

function orgInfoKey(apiHost) {
  return `rapex:orginfo:${apiHost}`;
}

async function fetchOrgInfo(apiHost) {
  const sessionId = await getSessionId(apiHost);
  if (!sessionId) throw new SalesforceError('NO_SESSION', 'Salesforce のセッションが見つかりません。');
  const version = await resolveApiVersion(apiHost, sessionId);

  // 個人取引先が有効な組織にだけ PersonAccount のエンティティが存在する
  const soql = "SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = 'PersonAccount'";
  const result = await apiFetch(
    apiHost,
    sessionId,
    `/services/data/v${version}/tooling/query/?q=${encodeURIComponent(soql)}`,
    ORG_INFO_TIMEOUT_MS
  );
  return { hasPersonAccount: (result.records || []).length > 0 };
}

/**
 * 組織の設定は滅多に変わらないため TTL を設けず、ブラウザを閉じるまで（または
 * 「> キャッシュを再取得」まで）セッションストレージのキャッシュを使い続ける。
 * 取得に失敗した場合はキャッシュしないので、次にパレットを開いたときに再試行される。
 */
async function getOrgInfo(host) {
  const apiHost = toApiHost(host);
  const key = orgInfoKey(apiHost);

  const cached = await chrome.storage.session.get(key);
  if (cached[key]) return { ...cached[key], cached: true };
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    try {
      const fresh = await fetchOrgInfo(apiHost);
      await chrome.storage.session.set({ [key]: fresh });
      return { ...fresh, cached: false };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/* ------------------------------------------------------------------ */
/* レコード検索 (SOSL)                                                 */
/* ------------------------------------------------------------------ */

const SOSL_RESERVED = /([?&|!{}[\]()^~*:\\"'+\-])/g;

function escapeSosl(term) {
  return term.replace(SOSL_RESERVED, '\\$1');
}

const SOSL_RETURNING = [
  'Account(Id,Name)',
  'Contact(Id,Name)',
  'Lead(Id,Name,Company)',
  'Opportunity(Id,Name)',
  'Case(Id,CaseNumber,Subject)',
  'User(Id,Name,Username)'
].join(',');

async function searchRecords(host, term) {
  const trimmed = String(term || '').trim();
  if (trimmed.length < 2) return { records: [] };

  const apiHost = toApiHost(host);
  const sessionId = await getSessionId(apiHost);
  if (!sessionId) throw new SalesforceError('NO_SESSION', 'Salesforce のセッションが見つかりません。');
  const version = await resolveApiVersion(apiHost, sessionId);

  const sosl = `FIND {${escapeSosl(trimmed)}*} IN NAME FIELDS RETURNING ${SOSL_RETURNING} LIMIT 20`;
  const result = await apiFetch(
    apiHost,
    sessionId,
    `/services/data/v${version}/search/?q=${encodeURIComponent(sosl)}`,
    SOSL_TIMEOUT_MS
  );

  const records = (result.searchRecords || []).map((record) => {
    const type = record.attributes && record.attributes.type;
    const name = record.Name || record.Subject || record.CaseNumber || record.Id;
    const detail = record.Company || record.Username || record.CaseNumber || '';
    return { id: record.Id, type, name, detail };
  });
  return { records, term: trimmed };
}

/* ------------------------------------------------------------------ */
/* 代理ログイン用のユーザー検索 (SOQL)                                  */
/* ------------------------------------------------------------------ */

/**
 * 有効なユーザーを名前 / ユーザー名の部分一致で引く。
 * 数万ユーザー規模の組織を想定し、全件取得はせず入力のたびに（content 側で debounce して）問い合わせる。
 * 代理ログインのサーブレットが使えるのは内部ユーザーだけなので UserType = 'Standard' に絞る。
 */
async function searchUsers(host, term) {
  const trimmed = String(term || '').trim();
  if (trimmed.length < 2) return { users: [], orgId: null, term: trimmed };

  const apiHost = toApiHost(host);
  const sessionId = await getSessionId(apiHost);
  if (!sessionId) throw new SalesforceError('NO_SESSION', 'Salesforce のセッションが見つかりません。');
  const orgId = orgIdFromSessionId(sessionId);
  if (!orgId) throw new SalesforceError('NO_ORG_ID', '組織 Id を特定できません。');
  const version = await resolveApiVersion(apiHost, sessionId);

  const pattern = `'%${escapeSoqlLike(trimmed)}%'`;
  const soql = 'SELECT Id, Name, Username, Profile.Name FROM User' +
    ` WHERE IsActive = true AND UserType = 'Standard' AND (Name LIKE ${pattern} OR Username LIKE ${pattern})` +
    ` ORDER BY Name LIMIT ${USER_SEARCH_LIMIT}`;
  const result = await apiFetch(
    apiHost,
    sessionId,
    `/services/data/v${version}/query/?q=${encodeURIComponent(soql)}`,
    USER_SEARCH_TIMEOUT_MS
  );

  const users = (result.records || []).map((record) => ({
    id: record.Id,
    name: record.Name,
    username: record.Username,
    profile: (record.Profile && record.Profile.Name) || ''
  }));
  return { users, orgId, term: trimmed };
}

/* ------------------------------------------------------------------ */
/* 最近使った項目 (MRU) — セッション内のみ                             */
/* ------------------------------------------------------------------ */

function mruKey(apiHost) {
  return `rapex:mru:${apiHost}`;
}

async function getMru(host) {
  const key = mruKey(toApiHost(host));
  const stored = await chrome.storage.session.get(key);
  return stored[key] || { counts: {}, order: [] };
}

async function touchMru(host, entryId) {
  if (!entryId) return { ok: false };
  const apiHost = toApiHost(host);
  const key = mruKey(apiHost);
  const state = await getMru(host);
  state.counts[entryId] = (state.counts[entryId] || 0) + 1;
  state.order = [entryId].concat(state.order.filter((id) => id !== entryId)).slice(0, 40);
  await chrome.storage.session.set({ [key]: state });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* メッセージング                                                      */
/* ------------------------------------------------------------------ */

const HANDLERS = {
  PING: async () => ({ ok: true }),
  GET_CATALOG: (message) => getCatalog(message.host, { force: !!message.force }),
  CLEAR_CATALOG: (message) => clearCatalog(message.host),
  GET_ORG_INFO: (message) => getOrgInfo(message.host),
  SEARCH_RECORDS: (message) => searchRecords(message.host, message.term),
  SEARCH_USERS: (message) => searchUsers(message.host, message.term),
  GET_MRU: (message) => getMru(message.host),
  TOUCH_MRU: (message) => touchMru(message.host, message.entryId),
  OPEN_TAB: async (message) => {
    await chrome.tabs.create({ url: message.url, active: message.active !== false });
    return { ok: true };
  },
  OPEN_SHORTCUTS: async () => {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = message && HANDLERS[message.type];
  if (!handler) return false;

  Promise.resolve(handler(message))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({
      ok: false,
      error: { code: error.code || 'UNKNOWN', message: error.message || String(error) }
    }));
  return true; // 非同期応答
});

/* ------------------------------------------------------------------ */
/* ショートカット                                                      */
/* ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-palette') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RAPEX_TOGGLE', source: 'command' });
  } catch (_) {
    // content script 未注入（対象外ページ）の場合は何もしない
  }
});
