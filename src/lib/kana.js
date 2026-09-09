/**
 * RapEx: 日本語入力のゆらぎ吸収レイヤ。
 *
 * 方針:
 *   1) 入力も辞書側も NFKC + カタカナ->ひらがな + 小文字化 で「素の文字列」に正規化する。
 *   2) かなを含む文字列は訓令式ベースのローマ字へ変換する。
 *   3) 打鍵されたローマ字（ヘボン式・入力方式のゆれを含む）も同じ訓令式ベースへ寄せる。
 *   -> 「とりひき」「トリヒキ」「torihiki」「torihiqui のような綴りゆれ」が同じキーに落ちる。
 *
 * 英語のラベル（Account など）を壊さないよう、ローマ字正準化は
 * 「素の文字列」とは別のハシスタックとして持ち、両方をスコアリング対象にする。
 */
var RapExKana = (function () {
  'use strict';

  var KATAKANA_START = 0x30a1;
  var KATAKANA_END = 0x30f6;

  /** カタカナ -> ひらがな（半角カナは NFKC が先に全角化する） */
  function katakanaToHiragana(input) {
    var out = '';
    for (var i = 0; i < input.length; i++) {
      var code = input.charCodeAt(i);
      out += code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCharCode(code - 0x60)
        : input.charAt(i);
    }
    return out;
  }

  /** 検索用の素の正規化文字列 */
  function normalize(value) {
    if (value == null) return '';
    var s = String(value).normalize('NFKC').toLowerCase();
    s = katakanaToHiragana(s);
    return s.replace(/\s+/g, ' ').trim();
  }

  var DIGRAPHS = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'きぇ': 'kye',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'しゃ': 'sya', 'しゅ': 'syu', 'しょ': 'syo', 'しぇ': 'sye',
    'じゃ': 'zya', 'じゅ': 'zyu', 'じょ': 'zyo', 'じぇ': 'zye',
    'ちゃ': 'tya', 'ちゅ': 'tyu', 'ちょ': 'tyo', 'ちぇ': 'tye',
    'ぢゃ': 'zya', 'ぢゅ': 'zyu', 'ぢょ': 'zyo',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
    'てぃ': 'ti', 'でぃ': 'di', 'とぅ': 'tu', 'どぅ': 'du',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo',
    'ゔぁ': 'ba', 'ゔぃ': 'bi', 'ゔぇ': 'be', 'ゔぉ': 'bo'
  };

  var MONOGRAPHS = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'さ': 'sa', 'し': 'si', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'ざ': 'za', 'じ': 'zi', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'た': 'ta', 'ち': 'ti', 'つ': 'tu', 'て': 'te', 'と': 'to',
    'だ': 'da', 'ぢ': 'zi', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'hu', 'へ': 'he', 'ほ': 'ho',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
    'ゔ': 'bu',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
    'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa',
    'ー': '', '・': ' ', '〜': ''
  };

  var HIRAGANA_RE = /[ぁ-ゟ]/;

  function hasKana(value) {
    return HIRAGANA_RE.test(value);
  }

  /**
   * ひらがな（正規化済み）-> 訓令式ローマ字。かな以外の文字はそのまま通す。
   */
  function kanaToRomaji(normalized) {
    var out = '';
    var i = 0;
    while (i < normalized.length) {
      var pair = normalized.substr(i, 2);
      if (DIGRAPHS[pair]) {
        out += DIGRAPHS[pair];
        i += 2;
        continue;
      }
      var ch = normalized.charAt(i);
      if (ch === 'っ') {
        // 促音: 次の子音を重ねる
        var nextPair = normalized.substr(i + 1, 2);
        var next = DIGRAPHS[nextPair] || MONOGRAPHS[normalized.charAt(i + 1)] || '';
        if (next && /^[a-z]/.test(next) && !/^[aiueo]/.test(next)) out += next.charAt(0);
        i += 1;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(MONOGRAPHS, ch)) {
        out += MONOGRAPHS[ch];
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  /**
   * 打鍵ローマ字の綴りゆれを訓令式ベースへ寄せる。
   * かな由来のローマ字にも同じ関数を通し、両者を同一空間へ落とす。
   */
  function canonicalizeRomaji(value) {
    var s = String(value || '').toLowerCase();
    s = s
      .replace(/ck/g, 'k')
      .replace(/shi/g, 'si')
      .replace(/sh/g, 'sy')
      .replace(/chi/g, 'ti')
      .replace(/ch/g, 'ty')
      .replace(/tsu/g, 'tu')
      .replace(/ja/g, 'zya')
      .replace(/ju/g, 'zyu')
      .replace(/jo/g, 'zyo')
      .replace(/je/g, 'zye')
      .replace(/ji/g, 'zi')
      .replace(/j/g, 'z')
      .replace(/fu/g, 'hu')
      .replace(/ca/g, 'ka')
      .replace(/cu/g, 'ku')
      .replace(/co/g, 'ko')
      .replace(/qu/g, 'ku')
      .replace(/x([aiueo])/g, 'k$1')
      .replace(/mb/g, 'nb')
      .replace(/mp/g, 'np')
      .replace(/mm/g, 'nm')
      .replace(/nn/g, 'n')
      .replace(/wo/g, 'o');
    // 長音のゆれ（しょうだん / しょーだん / shodan）を吸収
    s = s
      .replace(/ou/g, 'o')
      .replace(/oo/g, 'o')
      .replace(/uu/g, 'u')
      .replace(/aa/g, 'a')
      .replace(/ee/g, 'e')
      .replace(/ii/g, 'i')
      .replace(/ei/g, 'e');
    return s.replace(/[^a-z0-9]+/g, '');
  }

  /**
   * 検索キーとして使う文字列群を作る。
   * @returns {{plain: string[], romaji: string[]}}
   */
  function buildKeys(values) {
    var plain = [];
    var romaji = [];
    var seenPlain = Object.create(null);
    var seenRomaji = Object.create(null);

    for (var i = 0; i < values.length; i++) {
      var normalized = normalize(values[i]);
      if (!normalized) continue;
      if (!seenPlain[normalized]) {
        seenPlain[normalized] = true;
        plain.push(normalized);
      }
      var canonical = canonicalizeRomaji(hasKana(normalized) ? kanaToRomaji(normalized) : normalized);
      if (canonical && !seenRomaji[canonical]) {
        seenRomaji[canonical] = true;
        romaji.push(canonical);
      }
    }
    return { plain: plain, romaji: romaji };
  }

  /** クエリ側の正規化。plain と romaji の両面を返す。 */
  function buildQuery(raw) {
    var normalized = normalize(raw);
    var romaji = canonicalizeRomaji(hasKana(normalized) ? kanaToRomaji(normalized) : normalized);
    return { raw: raw, plain: normalized, romaji: romaji };
  }

  return {
    normalize: normalize,
    hasKana: hasKana,
    katakanaToHiragana: katakanaToHiragana,
    kanaToRomaji: kanaToRomaji,
    canonicalizeRomaji: canonicalizeRomaji,
    buildKeys: buildKeys,
    buildQuery: buildQuery
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RapExKana;
