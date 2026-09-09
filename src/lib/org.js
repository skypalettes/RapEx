/**
 * RapEx: 組織ドメインの解決と遷移先 URL の組み立て。
 * content script（クラシックスクリプト）と service worker（importScripts）の双方から使う。
 */
var RapExOrg = (function () {
  'use strict';

  /**
   * Salesforce が組織ごとに払い出すホスト名の接尾辞。
   *
   * 拡張ドメイン (Enhanced Domains) では 1 組織が用途別に複数のホストを持つ。
   *   Lightning : MyDomain.lightning.force.com
   *   設定       : MyDomain.my.salesforce-setup.com   <- 「.my」が入る
   *   API/Classic: MyDomain.my.salesforce.com
   *   Visualforce: MyDomain--pkg.vf.force.com
   * Sandbox では MyDomain の部分が MyDomain--SandboxName.sandbox になる。
   *
   * 接尾辞を剥がして「組織を表す部分（base）」を取り出し、用途に応じて付け直す。
   * 単純な文字列置換だと設定ドメインの「.my」が残り、実在しない
   * MyDomain.my.lightning.force.com を組み立ててしまうため、この形にしている。
   */
  var HOST_SUFFIXES = [
    { re: /\.lightning\.force\.com$/, kind: 'lightning' },
    { re: /\.my\.salesforce-setup\.com$/, kind: 'setup' },
    { re: /\.salesforce-setup\.com$/, kind: 'setup' },
    { re: /\.my\.salesforce\.com$/, kind: 'api' },
    { re: /\.vf\.force\.com$/, kind: 'scoped' },
    { re: /\.visual\.force\.com$/, kind: 'scoped' },
    { re: /\.visualforce\.com$/, kind: 'scoped' },
    { re: /\.file\.force\.com$/, kind: 'scoped' },
    { re: /\.documentforce\.com$/, kind: 'scoped' },
    { re: /\.cloudforce\.com$/, kind: 'instance' },
    { re: /\.force\.com$/, kind: 'other' },
    { re: /\.salesforce\.com$/, kind: 'instance' }
  ];

  /**
   * ホスト名を「組織を表す部分」と用途に分解する。
   * @returns {{base: string, kind: string, host: string}}
   */
  function splitHost(host) {
    var h = String(host || '').toLowerCase();
    if (h.indexOf(':') > -1) h = h.split(':')[0];

    for (var i = 0; i < HOST_SUFFIXES.length; i++) {
      var suffix = HOST_SUFFIXES[i];
      if (!suffix.re.test(h)) continue;
      var base = h.replace(suffix.re, '');
      // Visualforce / コンテンツドメインの --pkg, --c は組織名ではないので落とす
      if (suffix.kind === 'scoped') base = base.replace(/--[^.]*$/, '');
      return { base: base, kind: suffix.kind, host: h };
    }
    return { base: h, kind: 'unknown', host: h };
  }

  /**
   * 画面のホスト名から API を叩くべきホスト名（*.my.salesforce.com）を求める。
   * sid Cookie は Lightning / 設定ドメインではなく API ドメイン側のものが有効。
   */
  function toApiHost(host) {
    if (!host) return '';
    var parts = splitHost(host);
    // My Domain 未設定の組織（naXX.salesforce.com 等）はそのホストが API ドメイン
    if (parts.kind === 'instance' || parts.kind === 'unknown') return parts.host;
    if (parts.kind === 'api') return parts.host;
    return parts.base + '.my.salesforce.com';
  }

  /**
   * Lightning の画面を開くためのホスト名。
   * 設定画面 (/lightning/setup/...) もこのホスト宛てで良い。
   * Salesforce 側が設定ドメインへリダイレクトしてくれるため、
   * 拡張機能側で「設定かどうか」を判定する必要はない。
   */
  function toLightningHost(host) {
    if (!host) return '';
    var parts = splitHost(host);
    if (parts.kind === 'lightning') return parts.host;
    // My Domain を持たない組織には Lightning ドメインが無いので現状維持
    if (parts.kind === 'instance' || parts.kind === 'unknown') return parts.host;
    return parts.base + '.lightning.force.com';
  }

  /**
   * 相対パスを現在の組織の絶対 URL にする。
   * /lightning/ 配下は Lightning ドメイン、それ以外は現在のオリジンを使う。
   */
  function buildUrl(host, path) {
    if (/^https?:\/\//i.test(path)) return path;
    var normalized = path.charAt(0) === '/' ? path : '/' + path;
    var useLightning = /^\/(lightning|ltng)\//.test(normalized);
    var target = useLightning ? toLightningHost(host) : toApiHost(host);
    return 'https://' + target + normalized;
  }

  /** 現在の URL から「今どのオブジェクトを見ているか」を推定する（コンテキスト認識用） */
  function detectContext(url) {
    try {
      var parsed = new URL(url);
      var path = parsed.pathname;
      var record = path.match(/\/lightning\/r\/([^/]+)\/([a-zA-Z0-9]{15,18})\//);
      if (record) return { objectApiName: record[1], recordId: record[2], kind: 'record' };
      var list = path.match(/\/lightning\/o\/([^/]+)\//);
      if (list) return { objectApiName: list[1], kind: 'list' };
      var objectManager = path.match(/\/lightning\/setup\/ObjectManager\/([^/]+)\//);
      if (objectManager) return { objectApiName: objectManager[1], kind: 'setup' };
      if (path.indexOf('/lightning/setup/') === 0) return { kind: 'setup' };
      return { kind: 'other' };
    } catch (_) {
      return { kind: 'other' };
    }
  }

  return {
    splitHost: splitHost,
    toApiHost: toApiHost,
    toLightningHost: toLightningHost,
    buildUrl: buildUrl,
    detectContext: detectContext
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RapExOrg;
