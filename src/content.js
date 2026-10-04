/**
 * RapEx コマンドパレット（UI / 入力制御）。
 *
 * Shadow DOM に UI を注入し、キー入力を横取りする。
 * データ取得（組織固有のメタデータ・レコード検索）は background.js に委譲する。
 */
(function () {
  'use strict';

  if (window.__rapexInstalled) return;
  window.__rapexInstalled = true;

  var HOST = location.hostname;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';
  var RECORD_DEBOUNCE_MS = 230;
  var USER_DEBOUNCE_MS = 350;      // SOQL を打鍵ごとに投げないための待ち時間
  var USER_MIN_LENGTH = 2;
  var RESULT_LIMIT = 12;

  /** 空クエリ時に出す既定の候補（迷ったときの入口） */
  var DEFAULT_IDS = [
    'setup-home', 'obj:Account:list', 'obj:Opportunity:list', 'setup-users',
    'setup-objectmanager', 'setup-flows', 'setup-debuglogs', 'nav-reports'
  ];

  var state = {
    open: false,
    query: '',
    selected: 0,
    results: [],
    mode: 'search',        // search | command | loginAs
    staticEntries: [],
    dynamicEntries: [],
    orgEntries: [],
    recordEntries: [],
    userEntries: [],
    commandEntries: [],
    mru: { counts: {}, order: [] },
    catalog: 'idle',       // idle | loading | ready | error
    catalogError: null,
    orgInfo: 'idle',       // idle | loading | ready | error
    records: 'idle',       // idle | loading | ready | error
    recordError: null,
    recordTerm: '',
    users: 'idle',         // idle | loading | ready | error
    userError: null,
    userTerm: '',
    context: RapExOrg.detectContext(location.href)
  };

  var ui = null;
  var recordTimer = null;
  var recordToken = 0;
  var userTimer = null;
  var userToken = 0;
  var userCache = {};      // 検索語 -> 応答。打ち直し・BackSpace で同じ SOQL を投げない
  var lastToggleAt = 0;

  /* ---------------------------------------------------------------- */
  /* background との通信                                              */
  /* ---------------------------------------------------------------- */

  function send(message) {
    return new Promise(function (resolve) {
      if (!chrome.runtime || !chrome.runtime.id) {
        resolve({ ok: false, error: { code: 'NO_CONTEXT', message: '拡張機能が再読み込みされました。ページを更新してください。' } });
        return;
      }
      try {
        chrome.runtime.sendMessage(message, function (response) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: { code: 'DISCONNECTED', message: chrome.runtime.lastError.message } });
            return;
          }
          resolve(response || { ok: false, error: { code: 'EMPTY', message: '応答がありません。' } });
        });
      } catch (error) {
        resolve({ ok: false, error: { code: 'THROWN', message: String(error) } });
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* コマンド（> プレフィクス）                                        */
  /* ---------------------------------------------------------------- */

  function buildCommands() {
    var commands = [
      {
        id: 'cmd:reload',
        title: 'キャッシュを再取得',
        subtitle: 'この組織のメタデータを API から取り直す',
        keywords: ['reload', 'refresh', 'cache', 'きゃっしゅ', 'さいしゅとく', 'こうしん'],
        run: function () {
          state.catalog = 'idle';
          state.dynamicEntries = [];
          state.orgInfo = 'idle';
          state.orgEntries = [];
          userCache = {};
          return send({ type: 'CLEAR_CATALOG', host: HOST }).then(function () {
            loadOrgInfo();
            return loadCatalog(true);
          });
        },
        keepOpen: true
      },
      {
        id: 'cmd:copy-record-id',
        title: 'レコード ID をコピー',
        subtitle: state.context.recordId || '（レコード画面で使えます）',
        keywords: ['copy record id', 'id', 'こぴー', 'れこーどあいでぃ'],
        disabled: !state.context.recordId,
        run: function () {
          return copyText(state.context.recordId);
        }
      },
      {
        id: 'cmd:copy-url',
        title: '現在の URL をコピー',
        subtitle: location.href,
        keywords: ['copy url', 'url', 'こぴー', 'りんく'],
        run: function () {
          return copyText(location.href);
        }
      },
      {
        id: 'cmd:shortcut',
        title: 'ショートカットキーを変更',
        subtitle: 'chrome://extensions/shortcuts を開く',
        keywords: ['shortcut', 'keybinding', 'しょーとかっと', 'きー'],
        run: function () {
          return send({ type: 'OPEN_SHORTCUTS' });
        }
      },
      {
        id: 'cmd:login-as',
        title: '代理ログイン (Login as)',
        subtitle: 'ユーザーを名前で検索して代理ログインする（> login as 名前）',
        keywords: ['login as', 'proxy login', 'だいりろぐいん', 'ろぐいん'],
        fill: '> login as '
      },
      {
        id: 'cmd:logout',
        title: 'ログアウト',
        subtitle: 'この組織からログアウトする',
        keywords: ['logout', 'ろぐあうと'],
        run: function () {
          navigate(RapExOrg.buildUrl(HOST, '/secur/logout.jsp'), false);
        }
      }
    ];

    if (state.context.objectApiName) {
      commands.unshift({
        id: 'cmd:current-object-setup',
        title: state.context.objectApiName + ' の設定を開く',
        subtitle: '今見ているオブジェクトのオブジェクトマネージャ',
        keywords: ['object manager', 'setup', 'せってい', state.context.objectApiName],
        run: function () {
          navigate(RapExOrg.buildUrl(
            HOST,
            '/lightning/setup/ObjectManager/' + state.context.objectApiName + '/Details/view'
          ), false);
        }
      });
    }

    return commands
      .filter(function (command) { return !command.disabled; })
      .map(function (command) {
        command.group = 'command';
        return RapExSearch.index(command);
      });
  }

  function copyText(text) {
    if (!text) return Promise.resolve();
    return navigator.clipboard.writeText(text).catch(function () {
      var field = document.createElement('textarea');
      field.value = text;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try { document.execCommand('copy'); } finally { field.remove(); }
    });
  }

  /* ---------------------------------------------------------------- */
  /* 辞書の組み立て                                                    */
  /* ---------------------------------------------------------------- */

  function ensureStatic() {
    if (state.staticEntries.length) return;
    state.staticEntries = RapExDictionary.buildStatic().map(RapExSearch.index);
  }

  function loadCatalog(force) {
    if (state.catalog === 'loading') return Promise.resolve();
    if (state.catalog === 'ready' && !force) return Promise.resolve();

    state.catalog = 'loading';
    state.catalogError = null;
    render();

    return send({ type: 'GET_CATALOG', host: HOST, force: !!force }).then(function (response) {
      if (!response.ok) {
        state.catalog = 'error';
        state.catalogError = response.error;
        render();
        return;
      }
      var entries = [];
      (response.data.objects || []).forEach(function (object) {
        var aliases = [object.apiName, object.labelPlural].filter(Boolean);
        entries = entries.concat(RapExDictionary.objectEntries(
          object.apiName,
          object.label,
          '',
          aliases,
          { custom: true, durableId: object.durableId }
        ));
      });
      state.dynamicEntries = entries.map(RapExSearch.index);
      state.catalog = 'ready';
      render();
    });
  }

  /** 組織の設定に依存するエントリ（個人取引先など）。補助的な情報なので失敗しても UI には出さない。 */
  function loadOrgInfo() {
    if (state.orgInfo !== 'idle') return Promise.resolve();
    state.orgInfo = 'loading';
    return send({ type: 'GET_ORG_INFO', host: HOST }).then(function (response) {
      if (!response.ok) {
        state.orgInfo = 'error';
        return;
      }
      state.orgEntries = RapExDictionary.orgEntries(response.data).map(RapExSearch.index);
      state.orgInfo = 'ready';
      render();
    });
  }

  function loadMru() {
    return send({ type: 'GET_MRU', host: HOST }).then(function (response) {
      if (response.ok && response.data) state.mru = response.data;
    });
  }

  /* ---------------------------------------------------------------- */
  /* レコード検索 (SOSL)                                              */
  /* ---------------------------------------------------------------- */

  var RECORD_ICONS = {
    Account: '取', Contact: '責', Lead: 'リ', Opportunity: '商', Case: 'ケ', User: 'ユ'
  };

  /** compute() から呼ばれるため、ここでは再描画せず状態だけ戻す */
  function cancelRecordSearch() {
    clearTimeout(recordTimer);
    recordToken++;
    state.records = 'idle';
    state.recordEntries = [];
    state.recordTerm = '';
  }

  function scheduleRecordSearch(term, localHits) {
    var forced = term.charAt(0) === '?';
    var query = forced ? term.slice(1).trim() : term;

    if (query.length < 2 || (!forced && localHits >= 4)) {
      cancelRecordSearch();
      return;
    }
    // 応答後の render() からも compute() 経由でここへ来る。同じ語で投げ直さない
    if (query === state.recordTerm && state.records !== 'idle') return;

    clearTimeout(recordTimer);
    var token = ++recordToken;
    state.recordTerm = query;
    state.records = 'loading';
    recordTimer = setTimeout(function () {
      send({ type: 'SEARCH_RECORDS', host: HOST, term: query }).then(function (response) {
        if (token !== recordToken || !state.open) return;
        if (!response.ok) {
          state.records = 'error';
          state.recordError = response.error;
          state.recordEntries = [];
          render();
          return;
        }
        state.recordEntries = (response.data.records || []).map(function (record) {
          return RapExSearch.index({
            id: 'rec:' + record.id,
            group: 'record',
            title: record.name,
            subtitle: record.type + (record.detail ? ' · ' + record.detail : ''),
            badge: RECORD_ICONS[record.type] || (record.type || '?').charAt(0),
            keywords: [record.detail, record.type].filter(Boolean),
            path: '/lightning/r/' + record.type + '/' + record.id + '/view',
            boost: 30
          });
        });
        state.records = 'ready';
        render();
      });
    }, RECORD_DEBOUNCE_MS);
  }

  /* ---------------------------------------------------------------- */
  /* 代理ログイン (> login as) のユーザー検索 (SOQL)                    */
  /* ---------------------------------------------------------------- */

  function cancelUserSearch() {
    clearTimeout(userTimer);
    userToken++;
    state.users = 'idle';
    state.userError = null;
    state.userEntries = [];
    state.userTerm = '';
  }

  function userEntries(data) {
    return (data.users || []).map(function (user) {
      return {
        id: 'user:' + user.id,
        group: 'command',
        badge: 'ユ',
        title: user.name + ' としてログイン',
        subtitle: [user.username, user.profile].filter(Boolean).join(' · '),
        url: RapExOrg.buildLoginAsUrl(HOST, data.orgId, user.id, location.pathname)
      };
    });
  }

  function scheduleUserSearch(term) {
    // 応答後の render() からも compute() 経由でここへ来る。同じ語で投げ直さない
    if (term === state.userTerm && state.users !== 'idle') return;

    clearTimeout(userTimer);
    var token = ++userToken;
    state.userTerm = term;
    state.userError = null;

    if (term.length < USER_MIN_LENGTH) {
      state.users = 'idle';
      state.userEntries = [];
      return;
    }
    if (userCache[term]) {
      state.userEntries = userEntries(userCache[term]);
      state.users = 'ready';
      return;
    }

    // 前の語の結果は応答が来るまで残しておく（ちらつき防止）
    state.users = 'loading';
    userTimer = setTimeout(function () {
      send({ type: 'SEARCH_USERS', host: HOST, term: term }).then(function (response) {
        if (token !== userToken || !state.open) return;
        if (!response.ok) {
          state.users = 'error';
          state.userError = response.error;
          state.userEntries = [];
          render();
          return;
        }
        userCache[term] = response.data;
        state.userEntries = userEntries(response.data);
        state.users = 'ready';
        render();
      });
    }, USER_DEBOUNCE_MS);
  }

  /* ---------------------------------------------------------------- */
  /* 検索実行                                                          */
  /* ---------------------------------------------------------------- */

  /** 今見ている画面に関連する候補を少し前に出す（コンテキスト認識） */
  function contextBonus(entry) {
    if (!state.context.objectApiName || !entry.apiName) return 0;
    return entry.apiName === state.context.objectApiName ? 70 : 0;
  }

  function allEntries() {
    return state.staticEntries.concat(state.dynamicEntries, state.orgEntries);
  }

  /** レコード Id が入力されたときに先頭へ出す遷移候補（通信なしで即時に出す） */
  function recordIdEntry(recordId) {
    return {
      id: 'id:' + recordId,
      group: 'record',
      badge: 'ID',
      title: 'レコード詳細へ遷移: ' + recordId,
      subtitle: 'Id ダイレクト遷移',
      path: '/lightning/r/' + recordId + '/view'
    };
  }

  function recentEntries() {
    var pool = allEntries();
    var byId = {};
    pool.forEach(function (entry) { byId[entry.id] = entry; });

    var recent = (state.mru.order || [])
      .map(function (id) { return byId[id]; })
      .filter(Boolean)
      .slice(0, 6);

    var seen = {};
    recent.forEach(function (entry) { seen[entry.id] = true; });
    var defaults = DEFAULT_IDS
      .map(function (id) { return byId[id]; })
      .filter(function (entry) { return entry && !seen[entry.id]; });

    return { recent: recent, defaults: defaults };
  }

  function compute() {
    ensureStatic();
    var query = state.query.trim();

    if (query.charAt(0) === '>') {
      var commandQuery = query.slice(1).trim();
      cancelRecordSearch();
      var loginAsTerm = RapExSearch.parseLoginAs(commandQuery);
      if (loginAsTerm !== null) {
        state.mode = 'loginAs';
        scheduleUserSearch(loginAsTerm);
        return state.userEntries;
      }
      state.mode = 'command';
      cancelUserSearch();
      state.commandEntries = buildCommands();
      return RapExSearch.run(commandQuery, state.commandEntries, { limit: RESULT_LIMIT });
    }

    state.mode = 'search';
    cancelUserSearch();

    if (!query) {
      cancelRecordSearch();
      var buckets = recentEntries();
      return buckets.recent
        .map(function (entry) { return withSection(entry, '最近使った項目'); })
        .concat(buckets.defaults.map(function (entry) { return withSection(entry, 'よく使う入口'); }));
    }

    var pool = allEntries();
    var searchTerm = query.charAt(0) === '?' ? query.slice(1).trim() : query;
    var local = searchTerm
      ? RapExSearch.run(searchTerm, pool, {
          limit: RESULT_LIMIT,
          mru: state.mru.counts,
          bonus: contextBonus
        })
      : [];

    // Id は 1 件に確定するので SOSL は投げず、遷移候補を最上位に置く
    var recordId = query.charAt(0) === '?' ? null : RapExSearch.detectRecordId(query);
    if (recordId) {
      cancelRecordSearch();
      return [recordIdEntry(recordId)].concat(local).slice(0, RESULT_LIMIT);
    }

    scheduleRecordSearch(query, local.length);

    if (!state.recordEntries.length) return local;

    var records = RapExSearch.run(searchTerm, state.recordEntries, { limit: 6 });
    if (!records.length) records = state.recordEntries.slice(0, 6);
    // ローカル候補が弱いときはレコードを先に出す
    var localFirst = local.length >= 2 && query.charAt(0) !== '?';
    var head = localFirst ? local.slice(0, 6) : records;
    var tail = localFirst ? records : local;
    return head.concat(tail).slice(0, RESULT_LIMIT);
  }

  function withSection(entry, section) {
    return Object.assign({}, entry, { section: section });
  }

  /* ---------------------------------------------------------------- */
  /* UI 構築                                                           */
  /* ---------------------------------------------------------------- */

  function buildUi() {
    var host = document.createElement('div');
    host.id = 'rapex-root';
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
    host.setAttribute('data-rapex', 'root');

    var shadow = host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = RAPEX_CSS || '';
    shadow.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'rapex-overlay';
    overlay.innerHTML = [
      '<div class="rapex-panel" role="dialog" aria-modal="true" aria-label="Rapid Experience">',
      '  <div class="rapex-inputRow">',
      '    <svg class="rapex-prompt" viewBox="0 0 20 20" fill="none" aria-hidden="true">',
      '      <circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="2"/>',
      '      <path d="M13.5 13.5 L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      '    </svg>',
      '    <input class="rapex-input" type="text" autocomplete="off" autocorrect="off" spellcheck="false"',
      '           aria-autocomplete="list" aria-controls="rapex-results"',
      '           placeholder="移動先を検索（例: torihiki / とりひき / account / レコード Id、> でコマンド）">',
      '    <span class="rapex-org"></span>',
      '  </div>',
      '  <ul class="rapex-results" id="rapex-results" role="listbox"></ul>',
      '  <div class="rapex-footer">',
      '    <span><kbd>↑</kbd><kbd>↓</kbd> 選択</span>',
      '    <span><kbd>⏎</kbd> 移動</span>',
      '    <span><kbd>' + MOD_LABEL + '</kbd><kbd>⏎</kbd> 新規タブ</span>',
      '    <span class="rapex-spacer"><kbd>esc</kbd> 閉じる</span>',
      '  </div>',
      '</div>'
    ].join('\n');
    shadow.appendChild(overlay);

    var input = overlay.querySelector('.rapex-input');
    var results = overlay.querySelector('.rapex-results');
    var org = overlay.querySelector('.rapex-org');

    var apiHost = RapExOrg.toApiHost(HOST);
    org.textContent = apiHost.split('.')[0];
    org.title = apiHost;
    if (/--|\.sandbox\./.test(apiHost)) org.setAttribute('data-sandbox', 'true');

    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay) close();
    });
    input.addEventListener('input', function () {
      state.query = input.value;
      state.selected = 0;
      render();
    });
    input.addEventListener('keydown', onPaletteKeyDown, true);
    results.addEventListener('mousedown', function (event) {
      var item = event.target.closest('.rapex-item');
      if (!item) return;
      event.preventDefault();
      activate(Number(item.dataset.index), event.metaKey || event.ctrlKey);
    });
    results.addEventListener('mousemove', function (event) {
      var item = event.target.closest('.rapex-item');
      if (!item) return;
      var index = Number(item.dataset.index);
      if (index === state.selected) return;
      state.selected = index;
      paintSelection();
    });

    return { host: host, shadow: shadow, overlay: overlay, input: input, results: results };
  }

  /* ---------------------------------------------------------------- */
  /* 描画                                                              */
  /* ---------------------------------------------------------------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 素直に一致した部分だけを強調する（ゆらぎ一致は強調しない） */
  function highlight(text, query) {
    var safe = escapeHtml(text);
    var needle = query.replace(/^[>?]/, '').trim().toLowerCase();
    if (!needle) return safe;
    var index = String(text).toLowerCase().indexOf(needle);
    if (index < 0) return safe;
    return escapeHtml(String(text).slice(0, index)) +
      '<mark>' + escapeHtml(String(text).substr(index, needle.length)) + '</mark>' +
      escapeHtml(String(text).slice(index + needle.length));
  }

  var GROUP_BADGE = { object: 'O', setup: '設', nav: '画', command: '>', record: 'R' };

  function render() {
    if (!ui) return;
    state.results = compute();
    if (state.selected >= state.results.length) state.selected = Math.max(state.results.length - 1, 0);

    var html = [];
    var section = null;

    if (state.catalog === 'loading') {
      html.push('<li class="rapex-loading"><span class="rapex-spinner"></span>組織のカスタムオブジェクトを取得中…</li>');
    }
    if (state.records === 'loading') {
      html.push('<li class="rapex-loading"><span class="rapex-spinner"></span>レコードを検索中…</li>');
    }
    if (state.users === 'loading') {
      html.push('<li class="rapex-loading"><span class="rapex-spinner"></span>ユーザーを検索中…</li>');
    }

    state.results.forEach(function (entry, index) {
      if (entry.section && entry.section !== section) {
        section = entry.section;
        html.push('<li class="rapex-group">' + escapeHtml(section) + '</li>');
      }
      html.push([
        '<li class="rapex-item" role="option" data-index="' + index + '"',
        ' aria-selected="' + (index === state.selected) + '" id="rapex-opt-' + index + '">',
        '<span class="rapex-badge" data-group="' + escapeHtml(entry.group) + '">',
        escapeHtml(entry.badge || GROUP_BADGE[entry.group] || '·'),
        '</span>',
        '<span class="rapex-text">',
        '<span class="rapex-title">' + highlight(entry.title, state.query) + '</span>',
        '<span class="rapex-subtitle">' + escapeHtml(entry.subtitle || entry.path || '') + '</span>',
        '</span>',
        '<span class="rapex-enter">⏎</span>',
        '</li>'
      ].join(''));
    });

    if (!state.results.length) {
      var message = '一致する項目がありません';
      var tone = 'muted';
      if (state.mode === 'loginAs') {
        if (state.users === 'error' && state.userError) {
          message = 'ユーザー検索に失敗しました: ' + state.userError.message;
          tone = 'error';
        } else if (state.users === 'loading') {
          message = '検索中…';
        } else if (state.userTerm.length < USER_MIN_LENGTH) {
          message = '代理ログインするユーザーの名前またはユーザー名を ' + USER_MIN_LENGTH + ' 文字以上入力してください';
        } else {
          message = '一致する有効なユーザーがいません';
        }
      } else if (state.catalog === 'error' && state.catalogError) {
        message = 'メタデータを取得できません: ' + state.catalogError.message;
        tone = 'error';
      } else if (state.records === 'error' && state.recordError) {
        message = 'レコード検索に失敗しました: ' + state.recordError.message;
        tone = 'error';
      } else if (state.records === 'loading') {
        message = '検索中…';
      }
      html.push('<li class="rapex-status" data-tone="' + tone + '">' + escapeHtml(message) + '</li>');
    }

    ui.results.innerHTML = html.join('');
    paintSelection();
  }

  function paintSelection() {
    if (!ui) return;
    var items = ui.results.querySelectorAll('.rapex-item');
    for (var i = 0; i < items.length; i++) {
      var selected = Number(items[i].dataset.index) === state.selected;
      items[i].setAttribute('aria-selected', String(selected));
      if (selected) {
        items[i].scrollIntoView({ block: 'nearest' });
        ui.input.setAttribute('aria-activedescendant', items[i].id);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 操作                                                              */
  /* ---------------------------------------------------------------- */

  function move(delta) {
    if (!state.results.length) return;
    state.selected = (state.selected + delta + state.results.length) % state.results.length;
    paintSelection();
  }

  function navigate(url, newTab) {
    if (newTab) {
      send({ type: 'OPEN_TAB', url: url });
      return;
    }
    location.assign(url);
  }

  function activate(index, newTab) {
    var entry = state.results[index];
    if (!entry) return;

    send({ type: 'TOUCH_MRU', host: HOST, entryId: entry.id });
    state.mru.counts[entry.id] = (state.mru.counts[entry.id] || 0) + 1;

    // 入力欄を書き換えて続きを打たせるコマンド（> login as など）
    if (entry.fill) {
      state.query = entry.fill;
      state.selected = 0;
      ui.input.value = entry.fill;
      render();
      ui.input.focus();
      return;
    }

    if (typeof entry.run === 'function') {
      var result = entry.run();
      if (!entry.keepOpen) close();
      else {
        state.query = '';
        ui.input.value = '';
        render();
      }
      return result;
    }

    var url = entry.url || RapExOrg.buildUrl(HOST, entry.path);
    if (!newTab) close();
    navigate(url, newTab);
  }

  function onPaletteKeyDown(event) {
    if (event.isComposing || event.keyCode === 229) return; // IME 変換中は触らない

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault(); event.stopPropagation(); move(1); return;
      case 'ArrowUp':
        event.preventDefault(); event.stopPropagation(); move(-1); return;
      case 'Home':
        if (!event.ctrlKey && !event.metaKey) break;
        event.preventDefault(); state.selected = 0; paintSelection(); return;
      case 'Enter':
        event.preventDefault(); event.stopPropagation();
        activate(state.selected, event.metaKey || event.ctrlKey);
        return;
      case 'Escape':
        event.preventDefault(); event.stopPropagation(); close(); return;
      case 'Tab':
        event.preventDefault(); event.stopPropagation(); move(event.shiftKey ? -1 : 1); return;
      default:
        break;
    }

    if (event.ctrlKey && !event.metaKey) {
      if (event.key === 'n') { event.preventDefault(); move(1); return; }
      if (event.key === 'p') { event.preventDefault(); move(-1); return; }
    }
    // Salesforce 側のショートカットに拾わせない
    event.stopPropagation();
  }

  /* ---------------------------------------------------------------- */
  /* 開閉                                                              */
  /* ---------------------------------------------------------------- */

  function open() {
    if (state.open) {
      ui.input.select();
      return;
    }
    ensureStatic();
    if (!ui) ui = buildUi();
    state.open = true;
    state.selected = 0;
    state.context = RapExOrg.detectContext(location.href);
    document.documentElement.appendChild(ui.host);
    ui.input.value = state.query;
    render();
    ui.input.focus();
    ui.input.select();

    loadMru().then(render);
    loadCatalog(false);
    loadOrgInfo();
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    cancelRecordSearch();
    cancelUserSearch();
    if (ui && ui.host.parentNode) ui.host.parentNode.removeChild(ui.host);
  }

  function toggle() {
    var now = Date.now();
    // chrome.commands と keydown フォールバックの二重発火を防ぐ
    if (now - lastToggleAt < 350) return;
    lastToggleAt = now;
    if (state.open) close();
    else open();
  }

  /* ---------------------------------------------------------------- */
  /* 起動トリガ                                                        */
  /* ---------------------------------------------------------------- */

  function isTriggerKey(event) {
    if (!event.shiftKey || event.altKey) return false;
    if (!(IS_MAC ? event.metaKey : event.ctrlKey)) return false;
    return event.code === 'KeyK' || (event.key || '').toLowerCase() === 'k';
  }

  window.addEventListener('keydown', function (event) {
    if (state.open && event.key === 'Escape') {
      close();
      return;
    }
    if (!isTriggerKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  }, true);

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (!message || message.type !== 'RAPEX_TOGGLE') return false;
    toggle();
    sendResponse({ ok: true });
    return false;
  });

  // SPA 遷移でコンテキストを追従する
  var lastHref = location.href;
  setInterval(function () {
    if (location.href === lastHref) return;
    lastHref = location.href;
    state.context = RapExOrg.detectContext(lastHref);
  }, 800);

  /* ---------------------------------------------------------------- */
  /* CSS の読み込み（Shadow DOM に閉じ込める）                          */
  /* ---------------------------------------------------------------- */

  var RAPEX_CSS = '';
  fetch(chrome.runtime.getURL('src/style.css'))
    .then(function (response) { return response.text(); })
    .then(function (css) {
      RAPEX_CSS = css;
      if (ui) ui.shadow.querySelector('style').textContent = css;
    })
    .catch(function () { /* 読み込めなくても素の DOM で動作はする */ });
})();
