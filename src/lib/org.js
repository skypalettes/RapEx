/**
 * RapEx: 組織ドメインの解決と遷移先 URL の組み立て。
 * content script（クラシックスクリプト）と service worker（importScripts）の双方から使う。
 */
var RapExOrg = (function () {
  'use strict';

  /**
   * 画面のホスト名から API を叩くべきホスト名（*.my.salesforce.com）を求める。
   * sid Cookie は Lightning ドメインではなく API ドメイン側のものが有効。
   */
  function toApiHost(host) {
    if (!host) return '';
    var h = String(host).toLowerCase();
    if (h.indexOf(':') > -1) h = h.split(':')[0];

    if (/\.lightning\.force\.com$/.test(h)) {
      return h.replace(/\.lightning\.force\.com$/, '.my.salesforce.com');
    }
    if (/\.salesforce-setup\.com$/.test(h)) {
      return h.replace(/\.salesforce-setup\.com$/, '.my.salesforce.com');
    }
    if (/\.my\.salesforce\.com$/.test(h) || /\.salesforce\.com$/.test(h)) {
      return h;
    }
    // Visualforce ドメイン (xxx--c.vf.force.com など)
    var vf = h.match(/^([^.]+?)(?:--[^.]+)?\.(?:vf|visual)\.force\.com$/);
    if (vf) return vf[1] + '.my.salesforce.com';
    if (/\.force\.com$/.test(h)) {
      return h.replace(/\.force\.com$/, '.my.salesforce.com');
    }
    return h;
  }

  /** Lightning の画面を開くためのホスト名 */
  function toLightningHost(host) {
    var h = String(host || '').toLowerCase();
    if (h.indexOf(':') > -1) h = h.split(':')[0];
    if (/\.lightning\.force\.com$/.test(h)) return h;
    if (/\.my\.salesforce\.com$/.test(h)) {
      return h.replace(/\.my\.salesforce\.com$/, '.lightning.force.com');
    }
    if (/\.salesforce-setup\.com$/.test(h)) {
      return h.replace(/\.salesforce-setup\.com$/, '.lightning.force.com');
    }
    return h;
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
    toApiHost: toApiHost,
    toLightningHost: toLightningHost,
    buildUrl: buildUrl,
    detectContext: detectContext
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RapExOrg;
