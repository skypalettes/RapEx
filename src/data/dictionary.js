/**
 * RapEx 静的辞書。
 *
 * どの組織にも共通する「設定画面」と「標準オブジェクト」を定義する。
 * 組織固有のメタデータ（カスタムオブジェクト等）は background.js が API から取得し、
 * 実行時にこの辞書へマージされる。
 *
 * keywords には「読みがな（ひらがな）」を必ず入れる。
 * ローマ字への展開は RapExKana が自動で行うため、ローマ字は書かなくてよい。
 */
var RapExDictionary = (function () {
  'use strict';

  /** 設定画面（Lightning Setup） */
  var SETUP = [
    ['setup-home', '設定ホーム', '/lightning/setup/SetupOneHome/home', ['せってい', 'setup', 'home', 'かんり']],
    ['setup-users', 'ユーザー', '/lightning/setup/ManageUsers/home', ['ゆーざー', 'users', 'user', 'じんいん']],
    // 「拡張プロファイルユーザーインターフェース」の有効 / 無効で遷移先が異なる。
    // API で判定するとラグが出るため両方を載せ、どちらを使うかは MRU の学習に任せる。
    ['setup-profiles-enhanced', 'プロファイル (拡張UI)', '/lightning/setup/EnhancedProfiles/home', ['ぷろふぁいる', 'profiles', 'profile', 'enhanced', 'かくちょう']],
    ['setup-profiles', 'プロファイル (標準UI)', '/lightning/setup/Profiles/home', ['ぷろふぁいる', 'profiles', 'profile', 'standard', 'ひょうじゅん']],
    ['setup-permsets', '権限セット', '/lightning/setup/PermSets/home', ['けんげんせっと', 'permission sets', 'permset']],
    ['setup-permsetgroups', '権限セットグループ', '/lightning/setup/PermSetGroups/home', ['けんげんせっとぐるーぷ', 'permission set groups']],
    ['setup-roles', 'ロール', '/lightning/setup/Roles/home', ['ろーる', 'roles', 'role hierarchy', 'かいそう']],
    ['setup-groups', '公開グループ', '/lightning/setup/PublicGroups/home', ['こうかいぐるーぷ', 'public groups']],
    ['setup-queues', 'キュー', '/lightning/setup/Queues/home', ['きゅー', 'queues']],
    ['setup-sharing', '共有設定', '/lightning/setup/SecuritySharing/home', ['きょうゆうせってい', 'sharing settings', 'owd']],
    ['setup-objectmanager', 'オブジェクトマネージャ', '/lightning/setup/ObjectManager/home', ['おぶじぇくとまねーじゃ', 'object manager', 'すきーま']],
    ['setup-schemabuilder', 'スキーマビルダー', '/lightning/setup/SchemaBuilder/home', ['すきーまびるだー', 'schema builder', 'er']],
    ['setup-flows', 'フロー', '/lightning/setup/Flows/home', ['ふろー', 'flows', 'flow builder', 'じどうか']],
    ['setup-processbuilder', 'プロセスビルダー', '/lightning/setup/ProcessAutomation/home', ['ぷろせすびるだー', 'process builder']],
    ['setup-approvals', '承認プロセス', '/lightning/setup/ApprovalProcesses/home', ['しょうにんぷろせす', 'approval processes']],
    ['setup-apexclasses', 'Apex クラス', '/lightning/setup/ApexClasses/home', ['あぺっくすくらす', 'apex classes', 'class']],
    ['setup-apextriggers', 'Apex トリガ', '/lightning/setup/ApexTriggers/home', ['あぺっくすとりが', 'apex triggers', 'trigger']],
    ['setup-apexjobs', 'Apex ジョブ', '/lightning/setup/AsyncApexJobs/home', ['あぺっくすじょぶ', 'apex jobs', 'async']],
    ['setup-apextestexec', 'Apex テスト実行', '/lightning/setup/ApexTestQueue/home', ['あぺっくすてすと', 'apex test execution']],
    ['setup-debuglogs', 'デバッグログ', '/lightning/setup/ApexDebugLogs/home', ['でばっぐろぐ', 'debug logs', 'log']],
    ['setup-devconsole', '開発者コンソール', '/_ui/common/apex/debug/ApexCSIPage', ['かいはつしゃこんそーる', 'developer console', 'devconsole']],
    ['setup-lwc', 'Lightning コンポーネント', '/lightning/setup/LightningComponentBundles/home', ['らいとにんぐこんぽーねんと', 'lightning web components', 'lwc']],
    ['setup-auraComponents', 'Aura コンポーネント', '/lightning/setup/AuraComponentBundles/home', ['おーらこんぽーねんと', 'aura components']],
    ['setup-staticresources', '静的リソース', '/lightning/setup/StaticResources/home', ['せいてきりそーす', 'static resources']],
    ['setup-visualforce', 'Visualforce ページ', '/lightning/setup/ApexPages/home', ['びじゅあるふぉーす', 'visualforce pages', 'vf']],
    ['setup-customlabels', 'カスタム表示ラベル', '/lightning/setup/ExternalStrings/home', ['かすたむひょうじらべる', 'custom labels']],
    ['setup-customsettings', 'カスタム設定', '/lightning/setup/CustomSettings/home', ['かすたむせってい', 'custom settings']],
    ['setup-custommetadata', 'カスタムメタデータ型', '/lightning/setup/CustomMetadata/home', ['かすたむめたでーた', 'custom metadata types', 'mdt']],
    ['setup-platformevents', 'プラットフォームイベント', '/lightning/setup/EventObjects/home', ['ぷらっとふぉーむいべんと', 'platform events']],
    ['setup-appbuilder', 'Lightning アプリケーションビルダー', '/lightning/setup/FlexiPageList/home', ['あぷりけーしょんびるだー', 'lightning app builder', 'flexipage']],
    ['setup-appmanager', 'アプリケーションマネージャ', '/lightning/setup/NavigationMenus/home', ['あぷりけーしょんまねーじゃ', 'app manager']],
    ['setup-tabs', 'タブ', '/lightning/setup/CustomTabs/home', ['たぶ', 'tabs']],
    ['setup-globalactions', 'グローバルアクション', '/lightning/setup/GlobalActions/home', ['ぐろーばるあくしょん', 'global actions']],
    ['setup-companyinfo', '組織情報', '/lightning/setup/CompanyProfileInfo/home', ['そしきじょうほう', 'company information', 'org id']],
    ['setup-mydomain', '私のドメイン', '/lightning/setup/OrgDomain/home', ['わたしのどめいん', 'my domain']],
    ['setup-sandboxes', 'Sandbox', '/lightning/setup/DataManagementCreateTestInstance/home', ['さんどぼっくす', 'sandboxes', 'refresh']],
    ['setup-deploystatus', 'デプロイ状況', '/lightning/setup/DeployStatus/home', ['でぷろいじょうきょう', 'deployment status']],
    ['setup-outboundcs', '送信変更セット', '/lightning/setup/OutboundChangeSet/home', ['そうしんへんこうせっと', 'outbound change sets']],
    ['setup-inboundcs', '受信変更セット', '/lightning/setup/InboundChangeSet/home', ['じゅしんへんこうせっと', 'inbound change sets']],
    ['setup-packages', 'インストール済みパッケージ', '/lightning/setup/ImportedPackage/home', ['ぱっけーじ', 'installed packages']],
    ['setup-dataloader', 'データローダ', '/lightning/setup/DataManagementDataLoader/home', ['でーたろーだ', 'data loader']],
    ['setup-dataimport', 'データインポートウィザード', '/lightning/setup/DataManagementDataImporter/home', ['でーたいんぽーと', 'data import wizard']],
    ['setup-scheduledjobs', 'スケジュール済みジョブ', '/lightning/setup/ScheduledJobs/home', ['すけじゅーるじょぶ', 'scheduled jobs']],
    ['setup-emailadmin', '組織のメール設定', '/lightning/setup/OrgEmailSettings/home', ['めーるせってい', 'deliverability', 'email']],
    ['setup-namedcredentials', '名前付き認証情報', '/lightning/setup/NamedCredential/home', ['なまえつきにんしょうじょうほう', 'named credentials']],
    ['setup-remotesites', 'リモートサイトの設定', '/lightning/setup/SecurityRemoteProxy/home', ['りもーとさいと', 'remote site settings']],
    ['setup-connectedapps', '接続アプリケーション', '/lightning/setup/ConnectedApplication/home', ['せつぞくあぷりけーしょん', 'connected apps', 'oauth']],
    ['setup-certificates', '証明書と鍵の管理', '/lightning/setup/CertificatesAndKeysManagement/home', ['しょうめいしょ', 'certificate and key management']],
    ['setup-networkaccess', 'ネットワークアクセス', '/lightning/setup/NetworkAccess/home', ['ねっとわーくあくせす', 'network access', 'ip']],
    ['setup-session', 'セッションの設定', '/lightning/setup/SecuritySession/home', ['せっしょんのせってい', 'session settings']],
    ['setup-passwordpolicies', 'パスワードポリシー', '/lightning/setup/SecurityPolicies/home', ['ぱすわーどぽりしー', 'password policies']],
    ['setup-loginhistory', 'ログイン履歴', '/lightning/setup/OrgLoginHistory/home', ['ろぐいんりれき', 'login history']],
    ['setup-audittrail', '設定変更履歴', '/lightning/setup/SecurityEvents/home', ['せっていへんこうりれき', 'setup audit trail']],
    ['setup-reporttypes', 'レポートタイプ', '/lightning/setup/CustomReportTypes/home', ['れぽーとたいぷ', 'report types']],
    ['setup-duplicaterules', '重複ルール', '/lightning/setup/DuplicateRules/home', ['じゅうふくるーる', 'duplicate rules']],
    ['setup-einstein', 'Einstein 設定', '/lightning/setup/EinsteinAssistantSetup/home', ['あいんしゅたいん', 'einstein']]
  ];

  /** 画面遷移（設定以外） */
  var NAVIGATION = [
    ['nav-home', 'ホーム', '/lightning/page/home', ['ほーむ', 'home']],
    ['nav-reports', 'レポート', '/lightning/o/Report/home', ['れぽーと', 'reports']],
    ['nav-dashboards', 'ダッシュボード', '/lightning/o/Dashboard/home', ['だっしゅぼーど', 'dashboards']],
    ['nav-files', 'ファイル', '/lightning/o/ContentDocument/home', ['ふぁいる', 'files', 'content']],
    ['nav-chatter', 'Chatter', '/lightning/page/chatter', ['ちゃったー', 'chatter', 'feed']],
    ['nav-notes', 'メモ', '/lightning/o/ContentNote/home', ['めも', 'notes']],
    ['nav-mysettings', '私の設定', '/lightning/settings/personal/PersonalInformation/home', ['わたしのせってい', 'my personal information', 'personal settings']],
    ['nav-appmenu', 'アプリケーションランチャー', '/lightning/page/home?0.source=alohaHeader', ['あぷりけーしょんらんちゃー', 'app launcher']],
    ['nav-classic', 'Salesforce Classic に切り替え', '/ltng/switcher?destination=classic', ['くらしっく', 'switch to classic']],
    ['nav-lightning', 'Lightning Experience に切り替え', '/ltng/switcher?destination=lex', ['らいとにんぐ', 'switch to lightning']],
    ['nav-recyclebin', 'ごみ箱', '/lightning/o/DeleteEvent/home', ['ごみばこ', 'recycle bin']]
  ];

  /**
   * 標準オブジェクト。[API 名, 表示ラベル, 読みがな, 別名...]
   * 1 件につき「リストビュー」「新規作成」「オブジェクト設定」の 3 エントリを生成する。
   */
  var STANDARD_OBJECTS = [
    ['Account', '取引先', 'とりひきさき', ['account', 'あかうんと']],
    ['Contact', '取引先責任者', 'とりひきさきせきにんしゃ', ['contact', 'こんたくと']],
    ['Opportunity', '商談', 'しょうだん', ['opportunity', 'opp', 'あんけん']],
    ['Lead', 'リード', 'りーど', ['lead', 'みこみきゃく']],
    ['Case', 'ケース', 'けーす', ['case', 'といあわせ']],
    ['Campaign', 'キャンペーン', 'きゃんぺーん', ['campaign']],
    ['Task', 'ToDo', 'とぅどぅ', ['task', 'たすく']],
    ['Event', '行動', 'こうどう', ['event', 'よてい', 'かれんだー']],
    ['Contract', '契約', 'けいやく', ['contract']],
    ['Order', '注文', 'ちゅうもん', ['order']],
    ['Quote', '見積', 'みつもり', ['quote']],
    ['Product2', '商品', 'しょうひん', ['product', 'ぷろだくと']],
    ['Pricebook2', '価格表', 'かかくひょう', ['price book', 'pricebook']],
    ['Asset', '資産', 'しさん', ['asset']],
    ['User', 'ユーザー', 'ゆーざー', ['user']],
    ['Solution', 'ソリューション', 'そりゅーしょん', ['solution']],
    ['Individual', '個人', 'こじん', ['individual']]
  ];

  function entry(id, group, title, subtitle, path, keywords, extra) {
    var base = {
      id: id,
      group: group,
      title: title,
      subtitle: subtitle,
      path: path,
      keywords: keywords || []
    };
    if (extra) for (var k in extra) base[k] = extra[k];
    return base;
  }

  /** 1 オブジェクトから遷移先エントリ群を生成する。 */
  function objectEntries(apiName, label, reading, aliases, options) {
    var opts = options || {};
    var keywords = [reading, apiName].concat(aliases || []);
    var setupId = opts.durableId || apiName;
    var list = [
      entry('obj:' + apiName + ':list', 'object', label, apiName + ' · リストビュー',
        '/lightning/o/' + apiName + '/list',
        keywords.concat(['りすと', 'list', 'いちらん']),
        { apiName: apiName, custom: !!opts.custom, boost: 40 }),
      entry('obj:' + apiName + ':new', 'object', label + ' を新規作成', apiName + ' · 新規',
        '/lightning/o/' + apiName + '/new',
        keywords.concat(['しんき', 'new', 'create', 'さくせい']),
        { apiName: apiName, custom: !!opts.custom, boost: 0 }),
      entry('obj:' + apiName + ':setup', 'object', label + ' の設定', apiName + ' · オブジェクトマネージャ',
        '/lightning/setup/ObjectManager/' + setupId + '/Details/view',
        keywords.concat(['せってい', 'setup', 'object manager', 'こうもく', 'field']),
        { apiName: apiName, custom: !!opts.custom, boost: 15 })
    ];
    return list;
  }

  var EXP_KEYWORDS = ['えくすぺりえんす', 'experience cloud', 'community', 'こみゅにてぃ', 'site', 'さいと'];

  /**
   * サイトのワークスペース / ビルダーは、設定の「すべてのサイト」と同じく
   * サイト切り替えのサーブレット経由で開く（Lightning の設定画面には直接の URL が無い）。
   */
  function networkSwitchPath(networkId, startUrl) {
    return '/servlet/networks/switch?networkId=' + encodeURIComponent(networkId) +
      '&startURL=' + encodeURIComponent(startUrl);
  }

  /** Experience Cloud 関連のエントリ。background.js の fetchExperienceCloud の結果から作る。 */
  function experienceCloudEntries(expData) {
    var entries = [];
    if (!expData || !expData.isEnabled) return entries;

    entries.push(entry('setup-network-settings', 'setup', 'デジタルエクスペリエンス: 設定', '設定',
      '/lightning/setup/NetworkSettings/home',
      ['でじたるえくすぺりえんす', 'digital experiences', 'network settings', 'せってい'].concat(EXP_KEYWORDS),
      { boost: 20 }));
    entries.push(entry('setup-network-sites', 'setup', 'すべてのサイト', '設定',
      '/lightning/setup/SetupNetworks/home',
      ['すべてのさいと', 'all sites', 'でじたるえくすぺりえんす', 'digital experiences'].concat(EXP_KEYWORDS),
      { boost: 20 }));

    // 拡張プロファイルユーザーインターフェースの有効 / 無効で遷移先が異なるため、
    // 静的辞書のプロファイルと同じく両方を載せて MRU の学習に任せる。
    (expData.guestProfiles || []).forEach(function (p) {
      var name = String(p.name || '').replace(/\s*(Profile|プロファイル)$/i, '') || p.name;
      var keywords = ['guest', 'げすと', 'profile', 'ぷろふぁいる', 'guest user', 'げすとゆーざー'].concat(EXP_KEYWORDS);
      entries.push(entry('guest-profile-enh:' + p.id, 'setup', name + ' (ゲストプロファイル - 拡張UI)', 'Experience Cloud',
        '/lightning/setup/EnhancedProfiles/page?address=' + encodeURIComponent('/' + p.id),
        keywords.concat(['enhanced', 'かくちょう']), { boost: 15 }));
      entries.push(entry('guest-profile-std:' + p.id, 'setup', name + ' (ゲストプロファイル - 標準UI)', 'Experience Cloud',
        '/lightning/setup/Profiles/page?address=' + encodeURIComponent('/' + p.id),
        keywords.concat(['standard', 'ひょうじゅん']), { boost: 10 }));
    });

    (expData.networks || []).forEach(function (n) {
      entries.push(entry('network-workspace:' + n.id, 'setup', n.name + ' - ワークスペース', 'Experience Cloud',
        networkSwitchPath(n.id, '/communitySetup/cwApp.app#/c/home'),
        ['workspace', 'わーくすぺーす', 'workspaces'].concat(EXP_KEYWORDS), { boost: 15 }));
      entries.push(entry('network-builder:' + n.id, 'setup', n.name + ' - ビルダー', 'Experience Cloud',
        networkSwitchPath(n.id, '/sfsites/picasso/core/config/commeditor.jsp'),
        ['builder', 'びるだー', 'experience builder', 'えくすぺりえんすびるだー'].concat(EXP_KEYWORDS), { boost: 15 }));
    });

    return entries;
  }

  /**
   * 組織の設定に応じて出し分けるエントリ。background.js の GET_ORG_INFO の結果から作る。
   * @param {{hasPersonAccount?: boolean, expData?: object}} info
   */
  function orgEntries(info) {
    var entries = [];
    if (info && info.hasPersonAccount) {
      entries.push(entry('obj:PersonAccount:setup', 'object', '個人取引先 の設定', 'PersonAccount · オブジェクトマネージャ',
        '/lightning/setup/ObjectManager/PersonAccount/Details/view',
        ['こじんとりひきさき', 'PersonAccount', 'person account', 'せってい', 'setup', 'object manager'],
        { apiName: 'PersonAccount', custom: false, boost: 15 }));
    }
    if (info) entries = entries.concat(experienceCloudEntries(info.expData));
    return entries;
  }

  /** 静的辞書全体を組み立てる。 */
  function buildStatic() {
    var entries = [];
    var i;

    for (i = 0; i < NAVIGATION.length; i++) {
      entries.push(entry(NAVIGATION[i][0], 'nav', NAVIGATION[i][1], '画面', NAVIGATION[i][2], NAVIGATION[i][3], { boost: 30 }));
    }
    for (i = 0; i < STANDARD_OBJECTS.length; i++) {
      var o = STANDARD_OBJECTS[i];
      entries = entries.concat(objectEntries(o[0], o[1], o[2], o[3], { custom: false }));
    }
    for (i = 0; i < SETUP.length; i++) {
      entries.push(entry(SETUP[i][0], 'setup', SETUP[i][1], '設定', SETUP[i][2], SETUP[i][3], { boost: 25 }));
    }
    return entries;
  }

  return {
    buildStatic: buildStatic,
    objectEntries: objectEntries,
    orgEntries: orgEntries,
    entry: entry,
    STANDARD_OBJECTS: STANDARD_OBJECTS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RapExDictionary;
