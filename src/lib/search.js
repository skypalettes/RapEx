/**
 * RapEx: 候補のスコアリング。
 *
 * 「スパッと一発で遷移できる」ことを優先し、完全一致 > 前方一致 > 単語先頭 >
 * 部分一致 > 飛び飛び一致（サブシーケンス）の順に強く重み付けする。
 * 素の文字列（英語・かな）とローマ字正準形の両方で評価し、良い方を採用する。
 */
var RapExSearch = (function () {
  'use strict';

  var EXACT = 1000;
  var PREFIX = 800;
  var WORD_START = 640;
  var CONTAINS = 480;
  var SUBSEQUENCE = 260;

  var WORD_BOUNDARY = /[\s._\-\/()（）「」【】:：,、]/;

  function isBoundary(ch) {
    return WORD_BOUNDARY.test(ch);
  }

  /**
   * 1 つの haystack に対するスコア。ヒットしなければ -1。
   */
  function scoreOne(query, haystack) {
    if (!query) return 0;
    if (!haystack) return -1;
    if (haystack === query) return EXACT;

    var index = haystack.indexOf(query);
    if (index === 0) {
      // 短いラベルほど「狙った候補」である可能性が高い
      return PREFIX - Math.min(haystack.length - query.length, 120);
    }
    if (index > 0) {
      var base = isBoundary(haystack.charAt(index - 1)) ? WORD_START : CONTAINS;
      return base - Math.min(index * 2, 100) - Math.min(haystack.length - query.length, 60);
    }
    return scoreSubsequence(query, haystack);
  }

  /** 飛び飛び一致。連続ヒットと単語先頭ヒットにボーナスを与える。 */
  function scoreSubsequence(query, haystack) {
    var qi = 0;
    var score = SUBSEQUENCE;
    var lastMatch = -2;
    var firstMatch = -1;

    for (var hi = 0; hi < haystack.length && qi < query.length; hi++) {
      if (haystack.charAt(hi) !== query.charAt(qi)) continue;
      if (firstMatch < 0) firstMatch = hi;
      if (hi === lastMatch + 1) score += 14;
      else score -= Math.min((hi - lastMatch - 1) * 3, 24);
      if (hi === 0 || isBoundary(haystack.charAt(hi - 1))) score += 10;
      lastMatch = hi;
      qi++;
    }
    if (qi < query.length) return -1;
    score -= Math.min(firstMatch * 2, 40);
    score -= Math.min(Math.floor((haystack.length - query.length) / 2), 40);
    return Math.max(score, 1);
  }

  /**
   * 索引済みアイテム（RapExSearch.index で作る）を評価する。
   * @param {{plain:string, romaji:string}} query RapExKana.buildQuery の結果
   */
  function scoreItem(query, item) {
    var best = -1;

    if (query.plain) {
      for (var i = 0; i < item.keys.plain.length; i++) {
        var weight = i === 0 ? 1 : (i === 1 ? 0.94 : 0.88);
        var s = scoreOne(query.plain, item.keys.plain[i]);
        if (s >= 0) best = Math.max(best, s * weight);
      }
    }
    if (query.romaji) {
      for (var j = 0; j < item.keys.romaji.length; j++) {
        // ローマ字面は打鍵ゆれの救済なので、素の一致よりわずかに低く見る
        var rw = (j === 0 ? 1 : (j === 1 ? 0.94 : 0.88)) * 0.96;
        var rs = scoreOne(query.romaji, item.keys.romaji[j]);
        if (rs >= 0) best = Math.max(best, rs * rw);
      }
    }
    if (best < 0) return -1;
    return best + (item.boost || 0);
  }

  /** 表示名から頭文字（Object Manager -> om）を作る。 */
  function initials(value) {
    var words = String(value || '').split(/[\s._\-\/]+/).filter(Boolean);
    if (words.length < 2) return '';
    return words.map(function (w) { return w.charAt(0); }).join('').toLowerCase();
  }

  /**
   * エントリに検索キーを付与する。エントリは以下を持つ想定:
   *   { id, title, subtitle, keywords: string[], boost?: number }
   */
  function index(entry) {
    var values = [entry.title];
    if (entry.subtitle) values.push(entry.subtitle);
    if (entry.keywords) values = values.concat(entry.keywords);
    // 「object manager」-> 「om」のような頭文字打ちを拾う
    var acronyms = [];
    for (var i = 0; i < values.length; i++) {
      var acronym = initials(values[i]);
      if (acronym) acronyms.push(acronym);
    }
    entry.keys = RapExKana.buildKeys(values.concat(acronyms));
    return entry;
  }

  /**
   * 空白区切りは AND 条件。「account new」「取引先 新規」のような絞り込みを許す。
   */
  function scoreTokens(tokens, entry) {
    if (!tokens.length) return entry.boost || 0;
    var best = -1;
    var rest = 0;
    for (var i = 0; i < tokens.length; i++) {
      var s = scoreItem(tokens[i], entry);
      if (s < 0) return -1;
      if (s > best) {
        rest += best > 0 ? best * 0.35 : 0;
        best = s;
      } else {
        rest += s * 0.35;
      }
    }
    return best + rest;
  }

  /**
   * @param {string} rawQuery
   * @param {Array} entries 索引済みエントリ
   * @param {{limit?: number, mru?: Object, bonus?: function}} options
   */
  function run(rawQuery, entries, options) {
    var opts = options || {};
    var limit = opts.limit || 12;
    var mru = opts.mru || {};
    var bonus = opts.bonus;
    var tokens = String(rawQuery || '').split(/[\s\u3000]+/).filter(Boolean)
      .map(RapExKana.buildQuery)
      .filter(function (q) { return !!q.plain; });
    var results = [];

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var score = scoreTokens(tokens, entry);
      if (score < 0) continue;
      var recency = mru[entry.id];
      if (recency) score += Math.min(recency, 8) * 12;
      if (bonus) score += bonus(entry) || 0;
      results.push({ entry: entry, score: score, order: i });
    }

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    });
    return results.slice(0, limit).map(function (r) { return r.entry; });
  }

  /* ---------------------------------------------------------------- */
  /* クエリ解析                                                        */
  /* ---------------------------------------------------------------- */

  var RECORD_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
  var CHECKSUM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

  /** 15 桁 Id から 18 桁 Id の末尾 3 文字（大文字小文字の復元用チェックサム）を求める。 */
  function idChecksum(id15) {
    var suffix = '';
    for (var chunk = 0; chunk < 3; chunk++) {
      var bits = 0;
      for (var i = 0; i < 5; i++) {
        var ch = id15.charAt(chunk * 5 + i);
        if (ch >= 'A' && ch <= 'Z') bits |= 1 << i;
      }
      suffix += CHECKSUM_CHARS.charAt(bits);
    }
    return suffix;
  }

  /**
   * 入力が Salesforce のレコード Id（15 桁 / 18 桁）ならそれを返す。違えば null。
   * 「permissionsetgr」のような英字だけの語を Id と誤認して先頭に割り込ませないよう、
   * 数字を含むことを条件にし、18 桁はチェックサムまで検証する。
   */
  function detectRecordId(raw) {
    var value = String(raw || '').trim();
    if (!RECORD_ID.test(value)) return null;
    if (!/[0-9]/.test(value)) return null;
    if (value.length === 18 && value.slice(15).toUpperCase() !== idChecksum(value.slice(0, 15))) return null;
    return value;
  }

  var LOGIN_AS = /^(?:login\s*as|代理ログイン|だいりろぐいん)(?:[\s　]+([\s\S]*))?$/i;

  /**
   * コマンド（> の後ろ）が代理ログインなら検索語を返す（未入力は ''）。違えば null。
   *   「login as tanaka」「loginas tanaka」「代理ログイン 田中」
   */
  function parseLoginAs(commandQuery) {
    var match = LOGIN_AS.exec(String(commandQuery || '').trim());
    if (!match) return null;
    return (match[1] || '').trim();
  }

  return {
    index: index,
    run: run,
    detectRecordId: detectRecordId,
    idChecksum: idChecksum,
    parseLoginAs: parseLoginAs,
    scoreTokens: scoreTokens,
    scoreItem: scoreItem,
    scoreOne: scoreOne,
    initials: initials
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RapExSearch;
