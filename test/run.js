/**
 * RapEx の自己検証スクリプト。ビルドは不要。
 *   node test/run.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
global.RapExOrg = require(path.join(ROOT, 'src/lib/org.js'));
global.RapExKana = require(path.join(ROOT, 'src/lib/kana.js'));
global.RapExSearch = require(path.join(ROOT, 'src/lib/search.js'));
global.RapExDictionary = require(path.join(ROOT, 'src/data/dictionary.js'));

const { RapExOrg: Org, RapExKana: Kana, RapExSearch: Search, RapExDictionary: Dict } = global;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (error) {
    failed++;
    console.log('  ✗ ' + name + '\n      ' + error.message.split('\n')[0]);
  }
}

function section(title) {
  console.log('\n' + title);
}

const entries = Dict.buildStatic().map(Search.index);
const titleOf = (q, n = 1) => Search.run(q, entries, { limit: n }).map((e) => e.title);

/* ------------------------------------------------------------------ */
section('ゆらぎ吸収 (kana)');

test('カタカナ・ひらがな・全角を同じキーに正規化する', () => {
  assert.strictEqual(Kana.normalize('トリヒキサキ'), 'とりひきさき');
  assert.strictEqual(Kana.normalize('ＡＣＣＯＵＮＴ'), 'account');
  assert.strictEqual(Kana.normalize('ｱｶｳﾝﾄ'), 'あかうんと');
});

test('ヘボン式と訓令式の打鍵ゆれが同じ正準形になる', () => {
  const pairs = [
    ['しょうだん', 'shoudan'], ['しょうだん', 'shodan'], ['しょうだん', 'syoudan'],
    ['みつもり', 'mitsumori'], ['みつもり', 'mitumori'],
    ['ちゅうもん', 'chumon'], ['ちゅうもん', 'tyuumon'],
    ['けいやく', 'keiyaku'], ['にっぽう', 'nippou']
  ];
  for (const [kana, typed] of pairs) {
    const fromKana = Kana.buildKeys([kana]).romaji[0];
    const fromTyped = Kana.buildQuery(typed).romaji;
    assert.strictEqual(fromTyped, fromKana, `${kana} vs ${typed}: ${fromTyped} != ${fromKana}`);
  }
});

test('促音・撥音・長音を扱える', () => {
  assert.strictEqual(Kana.kanaToRomaji('がっこう'), 'gakkou');
  assert.strictEqual(Kana.kanaToRomaji('ぱーとなー'), 'patona');
  assert.strictEqual(Kana.kanaToRomaji('しんき'), 'sinki');
});

/* ------------------------------------------------------------------ */
section('検索ランキング');

test('ローマ字・ひらがな・英語のどれでも取引先に着地する', () => {
  for (const q of ['torihiki', 'とりひき', 'トリヒキ', '取引先', 'account', 'acc']) {
    assert.strictEqual(titleOf(q)[0], '取引先', `query=${q}`);
  }
});

test('商談は shodan / shoudan / しょうだん のいずれでも先頭に出る', () => {
  for (const q of ['shodan', 'shoudan', 'しょうだん', 'opp', '商談']) {
    assert.strictEqual(titleOf(q)[0], '商談', `query=${q}`);
  }
});

test('設定画面がローマ字で引ける', () => {
  assert.strictEqual(titleOf('settei')[0], '設定ホーム');
  assert.strictEqual(titleOf('furo')[0], 'フロー');
  assert.strictEqual(titleOf('debug')[0], 'デバッグログ');
  assert.strictEqual(titleOf('sandbox')[0], 'Sandbox');
});

test('頭文字打ちが効く (om -> オブジェクトマネージャ)', () => {
  assert.strictEqual(titleOf('om')[0], 'オブジェクトマネージャ');
});

test('空白区切りは AND 条件になる', () => {
  assert.strictEqual(titleOf('shodan shinki')[0], '商談 を新規作成');
  assert.strictEqual(titleOf('取引先 新規')[0], '取引先 を新規作成');
  assert.deepStrictEqual(Search.run('account zzzzz', entries, { limit: 3 }), []);
});

test('リストビューが新規作成より優先される', () => {
  const top = Search.run('account', entries, { limit: 3 }).map((e) => e.id);
  assert.strictEqual(top[0], 'obj:Account:list');
});

test('MRU が同点の候補を押し上げる', () => {
  const before = titleOf('ゆーざー', 2);
  const after = Search.run('ゆーざー', entries, { limit: 2, mru: { 'obj:User:list': 5 } });
  assert.strictEqual(after[0].id, 'obj:User:list');
  assert.ok(before.length === 2);
});

test('コンテキストボーナスで今見ているオブジェクトが上がる', () => {
  const boosted = Search.run('list', entries, {
    limit: 1,
    bonus: (e) => (e.apiName === 'Case' ? 500 : 0)
  });
  assert.strictEqual(boosted[0].apiName, 'Case');
});

test('一致しないクエリは空を返す', () => {
  assert.deepStrictEqual(Search.run('zzzzqqq', entries, { limit: 5 }), []);
});

test('プロファイルは 拡張UI / 標準UI の両方の遷移先が出る', () => {
  const hits = Search.run('profile', entries, { limit: 5 });
  const paths = hits.map((e) => e.path);
  assert.ok(paths.includes('/lightning/setup/EnhancedProfiles/home'), paths.join(','));
  assert.ok(paths.includes('/lightning/setup/Profiles/home'), paths.join(','));
  for (const q of ['ぷろふぁいる', 'purofairu', 'プロファイル']) {
    assert.ok(titleOf(q, 2).every((t) => t.startsWith('プロファイル')), `query=${q}`);
  }
  assert.strictEqual(titleOf('profile 標準')[0], 'プロファイル (標準UI)');
  assert.strictEqual(titleOf('profile kakucho')[0], 'プロファイル (拡張UI)');
});

test('MRU で使った方のプロファイルが上に来る', () => {
  const top = Search.run('profile', entries, { limit: 1, mru: { 'setup-profiles': 3 } });
  assert.strictEqual(top[0].path, '/lightning/setup/Profiles/home');
});

/* ------------------------------------------------------------------ */
section('レコード Id ダイレクト遷移');

test('15 桁 / 18 桁の Id を判定できる', () => {
  assert.strictEqual(Search.detectRecordId('0015g00000XyZaB'), '0015g00000XyZaB');
  assert.strictEqual(Search.detectRecordId(' 0015g00000XyZaBAAV '), '0015g00000XyZaBAAV');
  assert.strictEqual(Search.detectRecordId('0055g00000AbCdEAAV'), '0055g00000AbCdEAAV');
});

test('18 桁 Id の末尾チェックサムを正しく計算する', () => {
  assert.strictEqual(Search.idChecksum('0015g00000XyZaB'), 'AAV');
  assert.strictEqual(Search.idChecksum('001000000000000'), 'AAA');
  assert.strictEqual(Search.idChecksum('ABCDEABCDEABCDE'), '555');
});

test('Id ではない入力は判定しない', () => {
  for (const q of [
    'permissionsetgr', 'lightningcomponentx', // 英字だけの 15 / 18 文字
    '0015g00000XyZa', '0015g00000XyZaBAA', // 桁数違い
    '0015g00000XyZaBZZZ', // チェックサム不一致
    '0015g00000XyZ-B', 'torihiki', '', null
  ]) {
    assert.strictEqual(Search.detectRecordId(q), null, `query=${q}`);
  }
});

/* ------------------------------------------------------------------ */
section('個人取引先（組織に応じた出し分け）');

test('個人取引先が無効な組織ではエントリを作らない', () => {
  assert.deepStrictEqual(Dict.orgEntries({ hasPersonAccount: false }), []);
  assert.deepStrictEqual(Dict.orgEntries({}), []);
  assert.deepStrictEqual(Dict.orgEntries(null), []);
});

test('個人取引先が有効ならオブジェクトマネージャへのエントリが引ける', () => {
  const orgEntries = Dict.orgEntries({ hasPersonAccount: true }).map(Search.index);
  assert.strictEqual(orgEntries.length, 1);
  assert.strictEqual(orgEntries[0].path, '/lightning/setup/ObjectManager/PersonAccount/Details/view');
  const pool = entries.concat(orgEntries);
  for (const q of ['kojintorihikisaki', 'こじんとりひきさき', '個人取引先', 'personaccount', 'person account', 'pa']) {
    assert.strictEqual(Search.run(q, pool, { limit: 1 })[0].id, 'obj:PersonAccount:setup', `query=${q}`);
  }
  // 既存の「取引先」の引き当てを奪わない
  assert.strictEqual(Search.run('torihiki', pool, { limit: 1 })[0].title, '取引先');
});

/* ------------------------------------------------------------------ */
section('代理ログイン (Login as)');

test('> login as の検索語を取り出せる', () => {
  assert.strictEqual(Search.parseLoginAs('login as tanaka'), 'tanaka');
  assert.strictEqual(Search.parseLoginAs('Login As  田中 太郎 '), '田中 太郎');
  assert.strictEqual(Search.parseLoginAs('loginas tanaka'), 'tanaka');
  assert.strictEqual(Search.parseLoginAs('代理ログイン\u3000田中'), '田中');
  assert.strictEqual(Search.parseLoginAs('login as'), '');
  assert.strictEqual(Search.parseLoginAs('login as '), '');
});

test('代理ログイン以外のコマンドは対象にしない', () => {
  for (const q of ['login', 'login a', 'login asx', 'logout', 'reload', '']) {
    assert.strictEqual(Search.parseLoginAs(q), null, `query=${q}`);
  }
});

test('sid Cookie から組織 Id を取り出せる', () => {
  assert.strictEqual(Org.orgIdFromSessionId('00D5g000000ABCD!AQ4AQ.token'), '00D5g000000ABCD');
  assert.strictEqual(Org.orgIdFromSessionId('no-org-id'), null);
  assert.strictEqual(Org.orgIdFromSessionId(null), null);
});

test('代理ログイン URL は API ドメインの servlet.su を指す', () => {
  const url = new URL(Org.buildLoginAsUrl(
    'acme.my.salesforce-setup.com', '00D5g000000ABCD', '0055g00000AbCdE', '/lightning/setup/Flows/home'
  ));
  assert.strictEqual(url.origin, 'https://acme.my.salesforce.com');
  assert.strictEqual(url.pathname, '/servlet/servlet.su');
  assert.strictEqual(url.searchParams.get('oid'), '00D5g000000ABCD');
  assert.strictEqual(url.searchParams.get('suorgadminid'), '0055g00000AbCdE');
  assert.strictEqual(url.searchParams.get('retURL'), '/lightning/setup/Flows/home');
  assert.strictEqual(url.searchParams.get('targetURL'), '/lightning/page/home');
});

test('SOQL の LIKE 用エスケープでインジェクションできない', () => {
  assert.strictEqual(Org.escapeSoqlLike("O'Brien"), "O\\'Brien");
  // バックスラッシュを先に潰さないと \' で文字列を閉じられてしまう
  assert.strictEqual(Org.escapeSoqlLike("\\' OR Name != '"), "\\\\\\' OR Name != \\'");
  assert.strictEqual(Org.escapeSoqlLike('100%_ok'), '100\\%\\_ok');
  assert.strictEqual(Org.escapeSoqlLike(null), '');
  // エスケープ後は、エスケープされていない引用符が残らない
  for (const evil of ["'", "\\'", "\\\\'", "a'b'c", "%' OR '1'='1"]) {
    const escaped = Org.escapeSoqlLike(evil);
    assert.ok(!/(^|[^\\])(\\\\)*'/.test(escaped), `${evil} -> ${escaped}`);
  }
});

/* ------------------------------------------------------------------ */
section('組織ドメインと URL 生成');

test('Lightning / Setup / Visualforce ドメインから API ホストを導ける', () => {
  assert.strictEqual(Org.toApiHost('acme.lightning.force.com'), 'acme.my.salesforce.com');
  assert.strictEqual(Org.toApiHost('acme--dev.sandbox.lightning.force.com'), 'acme--dev.sandbox.my.salesforce.com');
  assert.strictEqual(Org.toApiHost('acme.salesforce-setup.com'), 'acme.my.salesforce.com');
  assert.strictEqual(Org.toApiHost('acme--c.vf.force.com'), 'acme.my.salesforce.com');
  assert.strictEqual(Org.toApiHost('acme.my.salesforce.com'), 'acme.my.salesforce.com');
});

test('/lightning/ 配下は Lightning ドメインへ、それ以外は現在のドメインへ', () => {
  assert.strictEqual(
    Org.buildUrl('acme.my.salesforce.com', '/lightning/o/Account/list'),
    'https://acme.lightning.force.com/lightning/o/Account/list'
  );
  assert.strictEqual(
    Org.buildUrl('acme.lightning.force.com', '/_ui/common/apex/debug/ApexCSIPage'),
    'https://acme.my.salesforce.com/_ui/common/apex/debug/ApexCSIPage'
  );
  assert.strictEqual(Org.buildUrl('acme.lightning.force.com', 'https://x.test/a'), 'https://x.test/a');
});

test('設定ドメイン (.my.salesforce-setup.com) から正しいホストを導ける', () => {
  // 「.my」を落とさないと実在しない acme.my.lightning.force.com になる
  assert.strictEqual(Org.toLightningHost('acme.my.salesforce-setup.com'), 'acme.lightning.force.com');
  assert.strictEqual(Org.toApiHost('acme.my.salesforce-setup.com'), 'acme.my.salesforce.com');
  assert.strictEqual(
    Org.toLightningHost('acme--dev.sandbox.my.salesforce-setup.com'),
    'acme--dev.sandbox.lightning.force.com'
  );
  assert.strictEqual(
    Org.toApiHost('acme--dev.sandbox.my.salesforce-setup.com'),
    'acme--dev.sandbox.my.salesforce.com'
  );
});

test('レポートの 4 パターンすべてで遷移先ホストが実在するものになる', () => {
  const LEX = 'acme.lightning.force.com';
  const SETUP = 'acme.my.salesforce-setup.com';
  const cases = [
    [LEX, '/lightning/o/Account/list', 'https://acme.lightning.force.com/lightning/o/Account/list'],
    [LEX, '/lightning/setup/Flows/home', 'https://acme.lightning.force.com/lightning/setup/Flows/home'],
    [SETUP, '/lightning/o/Account/list', 'https://acme.lightning.force.com/lightning/o/Account/list'],
    [SETUP, '/lightning/setup/Flows/home', 'https://acme.lightning.force.com/lightning/setup/Flows/home']
  ];
  for (const [from, path, expected] of cases) {
    assert.strictEqual(Org.buildUrl(from, path), expected, `${from} -> ${path}`);
  }
});

test('組織を表す部分が二重にならない (.my.my / .my.lightning を作らない)', () => {
  const hosts = [
    'acme.lightning.force.com', 'acme.my.salesforce-setup.com', 'acme.salesforce-setup.com',
    'acme.my.salesforce.com', 'acme--c.vf.force.com', 'acme--dev.sandbox.my.salesforce-setup.com',
    'acme--dev.sandbox.lightning.force.com', 'acme--dev.sandbox.my.salesforce.com'
  ];
  for (const host of hosts) {
    for (const resolved of [Org.toApiHost(host), Org.toLightningHost(host)]) {
      assert.ok(!/\.my\.my\./.test(resolved), '重複した .my: ' + host + ' -> ' + resolved);
      assert.ok(!/\.my\.lightning\./.test(resolved), '不正な .my.lightning: ' + host + ' -> ' + resolved);
      assert.ok(!/salesforce-setup/.test(resolved), '設定ドメインが残存: ' + host + ' -> ' + resolved);
    }
  }
});

test('全辞書エントリが設定ドメインからも実在ホストへ解決される', () => {
  for (const entry of entries) {
    const url = new URL(Org.buildUrl('acme.my.salesforce-setup.com', entry.path));
    assert.ok(
      url.hostname === 'acme.lightning.force.com' || url.hostname === 'acme.my.salesforce.com',
      `${entry.id}: ${url.hostname}`
    );
  }
});

test('My Domain を持たない組織はホストを書き換えない', () => {
  assert.strictEqual(Org.toApiHost('na1.salesforce.com'), 'na1.salesforce.com');
  assert.strictEqual(Org.toLightningHost('na1.salesforce.com'), 'na1.salesforce.com');
});

test('現在の画面のコンテキストを判定できる', () => {
  assert.deepStrictEqual(
    Org.detectContext('https://acme.lightning.force.com/lightning/r/Account/0015g00000XyZaBAAV/view'),
    { objectApiName: 'Account', recordId: '0015g00000XyZaBAAV', kind: 'record' }
  );
  assert.strictEqual(
    Org.detectContext('https://acme.lightning.force.com/lightning/o/Opportunity/list').objectApiName,
    'Opportunity'
  );
  assert.strictEqual(
    Org.detectContext('https://acme.lightning.force.com/lightning/setup/Flows/home').kind,
    'setup'
  );
});

/* ------------------------------------------------------------------ */
section('辞書の健全性');

test('ID が重複していない', () => {
  const seen = new Set();
  for (const entry of entries) {
    assert.ok(!seen.has(entry.id), '重複: ' + entry.id);
    seen.add(entry.id);
  }
});

test('全エントリが検索キーと遷移先を持つ', () => {
  for (const entry of entries) {
    assert.ok(entry.path && entry.path.startsWith('/'), 'path 不正: ' + entry.id);
    assert.ok(entry.keys.plain.length > 0, 'キーなし: ' + entry.id);
    assert.ok(entry.title, 'title なし: ' + entry.id);
  }
});

test('標準オブジェクトは 3 アクション（一覧 / 新規 / 設定）を持つ', () => {
  for (const [apiName] of Dict.STANDARD_OBJECTS) {
    for (const kind of ['list', 'new', 'setup']) {
      assert.ok(entries.some((e) => e.id === `obj:${apiName}:${kind}`), `${apiName}:${kind} がない`);
    }
  }
});

test('動的オブジェクトは DurableId があれば設定 URL に使う', () => {
  const [, , setup] = Dict.objectEntries('My_Obj__c', '案件', '', ['My_Obj__c'], {
    custom: true, durableId: '01I5g000000AbcDEFG'
  });
  assert.ok(setup.path.includes('01I5g000000AbcDEFG'));
  const [, , fallback] = Dict.objectEntries('My_Obj__c', '案件', '', [], { custom: true });
  assert.ok(fallback.path.includes('My_Obj__c'));
});

/* ------------------------------------------------------------------ */
section('拡張機能の配線');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const contentSource = fs.readFileSync(path.join(ROOT, 'src/content.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(ROOT, 'src/background.js'), 'utf8');

test('manifest が参照するファイルが全て存在する', () => {
  const files = [
    manifest.background.service_worker,
    ...manifest.content_scripts[0].js,
    ...manifest.web_accessible_resources[0].resources,
    ...Object.values(manifest.icons)
  ];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), '見つからない: ' + file);
  }
});

test('content が送るメッセージを background が全て処理できる', () => {
  const sent = new Set([...contentSource.matchAll(/type:\s*'([A-Z_]+)'/g)].map((m) => m[1]));
  sent.delete('RAPEX_TOGGLE'); // background -> content 方向
  const handled = new Set(
    [...backgroundSource.matchAll(/^\s{2}([A-Z_]+):\s*(?:async\s*)?\(/gm)].map((m) => m[1])
  );
  for (const type of sent) {
    assert.ok(handled.has(type), 'background に未実装のハンドラ: ' + type);
  }
  assert.ok(sent.size >= 8, '検出したメッセージが少なすぎる: ' + sent.size);
  for (const type of ['GET_ORG_INFO', 'SEARCH_USERS']) {
    assert.ok(sent.has(type), 'content から送っていない: ' + type);
  }
});

test('必要な権限とショートカットが宣言されている', () => {
  for (const permission of ['activeTab', 'scripting', 'cookies', 'storage']) {
    assert.ok(manifest.permissions.includes(permission), '権限なし: ' + permission);
  }
  assert.strictEqual(manifest.manifest_version, 3);
  assert.ok(manifest.commands['toggle-palette'].suggested_key.default);
  assert.ok(manifest.commands['toggle-palette'].suggested_key.mac);
});

test('ユーザー検索は debounce され、有効な内部ユーザーに絞っている', () => {
  assert.ok(/USER_DEBOUNCE_MS\s*=\s*(\d+)/.test(contentSource), 'debounce 定数がない');
  const ms = Number(contentSource.match(/USER_DEBOUNCE_MS\s*=\s*(\d+)/)[1]);
  assert.ok(ms >= 300 && ms <= 500, 'debounce は 300〜500ms: ' + ms);
  assert.ok(/IsActive = true/.test(backgroundSource));
  assert.ok(/escapeSoqlLike\(trimmed\)/.test(backgroundSource), 'LIKE 句をエスケープしていない');
});

test('組織情報は storage.session にキャッシュし、再取得コマンドで破棄する', () => {
  assert.ok(/rapex:orginfo:/.test(backgroundSource));
  assert.ok(/remove\(\[[^\]]*orgInfoKey\(apiHost\)/.test(backgroundSource), 'clearCatalog が組織情報を破棄しない');
});

test('機密データをディスクへ書いていない (storage.local / sync 不使用)', () => {
  assert.ok(!/storage\.local|storage\.sync/.test(backgroundSource));
  assert.ok(!/storage\.local|storage\.sync/.test(contentSource));
  assert.ok(/storage\.session/.test(backgroundSource));
});

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
