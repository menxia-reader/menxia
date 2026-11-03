// 界面词表 —— 所有给人看的字符串的唯一落点（issue #14）。
//
// **这不是 i18n。** `lang.js` 切的是文档变体（`foo.md` ↔ `foo.zh-CN.md`），跟界面语言无关；
// 这一层也**不加英文、不加语言开关**——#14 的范围只有「抽」，没有「译」。真要发布给非中文用户，
// 第一道墙也不是语言而是共号假设（自营画可 / `**回话**` 前缀 / 本地 processed.json），
// 那是另一层身份模型，不是翻译工程。
//
// 为什么值得单独一层：界面词是唐制专名（敕草 / 涂归 / 判 / 画可 / 封驳 / 待审 / 回奏），
// #12 已经全量改过一次（专名 180 处 + 交互动词 5 处，散在 8 个文件里），还会再改。
// 所以 **键名一律按语义取，不按字面取**：`action.merge` 而不是 `huake`，
// `action.annotate` 而不是 `tugui`，`nav.tabDone` 而不是 `yihuake`。
// 下一次改名就只动这个文件里的**值**，调用点一行不碰——这是抽词表真正的长期收益。
//
// 三条体例：
//
// 1. **带变量的文案写成函数**（`(n) => ...`），不写占位符 + format()。插值原样留在词表里，
//    调用点只剩一次调用；零翻译需求下再发明一套格式化迷你语言纯属自找。函数还顺带被
//    `node --check` 管住元数，占位符字符串错了只会静默渲染出 `{0}`。
// 2. **富标记段落按文本段切分**（见 `setup.steps`）：整段带 `<b>`/`<code>`/`<a>` 塞进词表
//    就得再开一个 innerHTML 落点，而 #4 定过「只准有一个渲染 sink」（`CommentBody`）。
//    标记骨架留在组件里，词表只管文本。
// 3. **协议常量不进词表**：`folder-body.js` 的 `DECISIONS_TITLE`（'待你拍板'）逐字对齐写入侧
//    `menxia-mcp/src/body.ts` 的 SECTIONS，改了不报错只静默失效，它是契约不是文案，
//    留在原地（顺带被当徽章文字用，也照旧从那里取）。
// 4. **界线：进 GitHub 的字不是界面文案**（复审补，定死免得下次再吵）。判据是这串字最终落在哪：
//    落在**屏幕上**的（按钮、提示、徽章、卡片里的引文「」）进词表；落进 **GitHub 评论正文或
//    仓里文件**的不进——`link.js` 与 `ui.js` 那两处 `[「q」](url)` 引文包装是构造 markdown，
//    与 `DECISIONS_TITLE` 同族：它们是跨系统的内容约定，读者是三周后的人和另一个 agent，
//    不是此刻看界面的人。真做英文版时这类字该不该跟着变，是**内容侧**的决定，不该由界面
//    语言开关顺手改掉——放进词表等于把这个决定悄悄绑给了 UI。

// 浅冻结挡不住 `S.action.merge = x`——一层一层冻下去，改词表只能改这个文件。
function deepFreeze(o) {
  Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
}

export const S = deepFreeze({
  // 品牌与固定标识
  brand: {
    seal: '可',
    name: '门下',
  },

  // 动作（按钮 / 按钮 title / 进行态）
  action: {
    refresh: '刷新',
    more: '⋯',
    moreTitle: '更多：引用此处 / 回奏 / 携卷 / 字号',
    copyRef: '引用此处',
    copyRefTitle: '拷涂归直达链（按住 Alt 拷 GitHub 链接）',
    happy: '回奏',
    happyTitle: '回到呈这折的 Hermes 会话，说一句「读批注」（会话可能已散，那就只剩存档可看）',
    zongpi: '判',
    zongpiArchivedTitle: '归档折仍可留判（划句批注才需要活折）',
    submit: (n) => `提交涂归 · ${n}`,
    submitOldRevTitle: '正在读旧版——先切回 head 再提交',
    sending: '呈递中…',
    merge: '画 可',
    mergeOldRevTitle: '正在读旧版——先切回 head 再画可',
    annotate: '涂归',
    discard: '作罢',
    saveDraft: '存批',
    sendZongpi: '呈判',
    carry: '携卷',
    carryTitle: '把整折（正文＋涂归＋判＋待拍板）拼成自包含 markdown 拷进剪贴板，粘给任意 agent 接着干',
    carrying: '携卷中…',
    expand: '展读',
    expandTitle: '展读此串——从眉批栏捞出来铺在宽栏上细读（Esc 收）',
  },

  // 顶栏
  topbar: {
    crumbRoot: '待审',
    crumbShelf: '读毕书架',
    crumbDone: '已画可',
  },

  // 新版横幅（detectNewBuild）
  stale: {
    banner: '有新版已部署，你手上这份是旧的（Pages 缓存 10 分钟）',
    reload: '刷新用新版',
    // 手机「⋯」里的手动更新：拆 SW、清壳缓存、回源重载（不清离线正文与凭据）
    update: '更新到最新版',
    updateTitle: '清掉本机缓存的旧代码并重新载入（离线正文、登录与设置都保留）',
    updating: '正在更新…',
  },

  // 正文字号（顶栏 A⁻/A⁺）。只报百分比不报像素——像素是实现细节，且各元素倍率不同。
  readSize: {
    smaller: 'A⁻',
    larger: 'A⁺',
    smallerTitle: (pct) => `正文调小一档（现 ${pct}%）`,
    largerTitle: (pct) => `正文调大一档（现 ${pct}%）`,
  },

  // 侧栏导航 / 三栏清单
  nav: {
    tabOpen: (n) => `待审 ${n}`,
    tabDone: (n) => `已画可 ${n}`,
    tabShelf: (n) => `读毕书架 ${n}`,
    emptyOpen: '此刻无折可批。',
    emptyDone: '还没有画可过的折子。',
    emptyShelf: '还没有读毕的书。',
    settings: '设置 · 钥匙',
    dash: '总览',
    dashTitle: '按项目摊开待审的折，看谁等谁、谁盖了谁',
    railGrip: '拖动调整清单栏宽度，双击复位',
  },

  // 总览（F16）：按项目分组 + 等谁 + 折间关系。
  // 「等谁」的取值来自写入侧词表（`menxia-mcp/src/track.ts`），这边**只认前缀不认取值**，
  // 所以文案一律拿原值插进去（`等你拍` / `等你读` / …），认不出的新值照样显示不丢。
  dash: {
    title: (n) => `总览 · 待审 ${n} 折`,
    close: '回读折',
    unlabeled: '未标注',
    noLabels: '这批折还没贴折务标签',
    // 「等」不能无脑往前拼：`等 + 闲` = 「等闲」是个词，意思整个反了（实测截图上就是这么出的）。
    // 这张表只管**怎么念**，认不出的取值走兜底照样显示——与 track.js 的顺序/配色表同一个约定。
    waitLabel: (wait) => ({ 你拍: '等你拍', 你读: '等你读', agent: '等 agent', 闲: '闲着' }[wait] || `等${wait}`),
    tally: (wait, n) => `${S.dash.waitLabel(wait)} ${n}`,
    waitTitle: (wait) => S.dash.waitLabel(wait),
    waitNone: '没贴「等谁」标签',
    zombieCount: (n) => `不用读 ${n}`,
    coveredBy: (n) => `已被 #${n} 盖掉 · 不用读`,
    blockedBy: (n) => `等 #${n} 先定`,
    unlocked: (n) => `#${n} 已画可 · 可动手`,
    willCover: (n) => `将被 #${n} 盖掉`,
    covers: (n) => `盖掉 #${n}`,
    unblocks: (what) => `画可后解锁：${what}`,
  },

  // 读毕书架（2026-09-21 由「弘文馆」改）：架上是已画可的读物——读过、点过头的才上架。
  // 存量的 open 闲折单独成「未画可」一组，带角标，读完画可即归位；仍不催办。
  // title 已并入 nav.tabShelf（2026-08-03 从底部折叠区升为第三个 tab）。
  shelf: {
    unreadGroup: (n) => `未画可 · ${n}`,
    unreadHint: '弘文馆遗留，还没看过；读完画可即归位。',
    unreadChip: '未画可',
    doneGroup: (n) => `读毕 · ${n}`,
  },

  // 手机底栏：窄屏读折时把「判 / 提交 / 画可」钉在视口底缘，随手可点（顶栏那几个钮会随正文滚走）。
  // 按钮字全复用 action.*——同一个动作在两处露出，只该有一处词。这里只补无障碍标签与返回钮。
  // 「目录」是折清单那一页，不是篇内大纲（那个叫「大纲」，见 outline.title）——两处别混词。
  mobileBar: {
    label: '读折动作',
    noticeClose: '✕',
    noticeCloseTitle: '关闭提示',
    back: '‹ 目录',
    backTitle: '本折的篇与节',
    backToDoc: '‹ 正文',
    backToDocTitle: '回到正文',
  },

  // 目录页（手机三层导航的第二层：折清单 → 这里 → 正文）。
  // 「篇」「节」沿用 outline/chapter 那套已有口径，不新造词。
  navPage: {
    aria: '本折目录',
    upToFolders: '‹ 全部折子',
    chapters: '篇',
    sections: '节',
    sectionsOfCurrent: '节 · 当前篇',
  },

  // 签：按主题归堆的横条 + 「按签」视图。跨状态——点一个签，在读的与已画可的一屏同列。
  qian: {
    chip: (word, n) => `${word}${n ? ` ${n}` : ''}`,   // chip 条上：签名 + 计数
    clear: '清除',
    clearTitle: '收起「按签」，回到待审 / 已画可 / 读毕书架三栏',
    crumb: (word) => `签 · ${word}`,                    // 「按签」视图的栏内标题
    empty: (word) => `没有挂「${word}」签的折。`,
  },

  // 折卡上的时间说明
  folder: {
    mergedAt: (ago) => `画可于 ${ago}`,
    submittedAt: (ago) => `呈于 ${ago}`,
  },

  // 相对时间
  time: {
    minutesAgo: (n) => `${n} 分钟前`,
    hoursAgo: (n) => `${n} 小时前`,
    daysAgo: (n) => `${n} 天前`,
  },

  // 体例检查角标
  check: {
    defaultName: '检查',
    failBadge: '✗ 体例',
    failTitle: (name) => `体例不合格（${name}）—— 点开折看哪条`,
    runningBadge: '⋯ 体例',
    runningTitle: '体例检查还在跑',
    passBadge: '✓',
    passTitle: '体例合格',
    unreadableNotice: '读不到体例检查结果 —— 钥匙缺 Actions: Read 权限。折卡上的红绿会一直空着，'
      + '那是「看不见」不是「没问题」。去 GitHub token 设置 → Add permissions → Actions → Read-only。',
  },

  // F13「需核实」标记：agent 标的未验证声明。顶栏计数 + 列表角标 + 正文标记 tooltip。
  verify: {
    markerTip: 'AI 标注的未验证声明，看到请自行核实',
    count: (n) => `需核实 ${n}`,
    countTitle: '本篇有 AI 标注的未验证声明，看到请自行核实',
    badge: (n) => `⚑ ${n}`,
    badgeTitle: (n) => `这折有 ${n} 处「需核实」标记 —— AI 标注的未验证声明`,
  },

  // 搜索
  search: {
    placeholder: '检题 / 回车检全文',
    clear: '清',
    mergedSuffix: ' · 已画可',
    titleHit: '标题命中',
    numberHit: '折号命中',
    // 当前栏没有、别的栏有：列出来并标明在哪一栏（他按折号找 #174 时常不在当前栏）
    elsewhereGroup: (n) => `其他栏 ${n} 折命中`,
    elsewhereNoHere: (q) => `这一栏标题没有「${q}」，其他栏有——点击直达；回车搜全文。`,
    tabName: { open: '待审', done: '已画可', shelf: '读毕书架' },
    lineHit: (file, line) => `${file} · 第 ${line} 行`,
    noResults: (q) => `没搜到「${q}」。`,
    noTitleMatch: (q) => `标题没有「${q}」——回车搜全文。`,
    tooShort: '搜索词至少两个字。',
    indexing: '翻折中…',
    indexingProgress: (done, total) => `翻折中 ${done}/${total}…`,
  },

  // 跳转：折间 / 篇内锚点 / 顶底
  jump: {
    folderMissing: (n) => `跳不过去：本仓没有第 ${n} 折（可能已删或不在清单里）。`,
    anchorMissing: (frag) => `本篇没有叫「${frag}」的标题——锚点可能指着另一篇，或标题改过字。`,
    toTop: '回到顶部',
    toBottom: '回到底部',
  },

  // 设置页 / 钥匙
  setup: {
    lead: '读 AI 呈上来的敕草，划句落涂归。先说清读哪个仓库，再给一把只开这个仓库的钥匙。',
    // 五步说明。混着 <b>/<code>/<a>，按文本段切分（体例 2）；键名描述这一段说的是什么事。
    steps: {
      repo: { pre: '填', em: '敕草仓库', mid: '：agent 往哪个仓库开 PR，就填哪个，格式 ', code: 'owner/repo', post: '（建议私有）' },
      token: { pre: '去 ', link: 'GitHub 生成 fine-grained token', post: '（名字随意，Expiration 建议 90 days）' },
      access: { pre: 'Repository access：默认停在 Public repositories，', em: '必须改成 Only select repositories', mid: ' → 选 ', post: '（不是门下本身）' },
      perms: {
        pre: 'Permissions → Repository permissions 加', em1: '两', mid1: '项：', em2: 'Contents: Read and write',
        mid2: ' ＋ ', em3: 'Pull requests: Read and write', mid3: '。Metadata 自动带上不用管；',
        em4: '最容易漏的是 Pull requests', post: '，漏了进清单就 403',
      },
      paste: { pre: 'Generate 后把 ', code: 'github_pat_…', post: ' 粘在下面。钥匙只存这台设备的浏览器，不经过任何服务器；权限配错不用重新生成——回 token 页改好点 Update，再回来存一次即可（字符串不变）' },
    },
    repoPreviewFallback: '你上面填的那个仓库',
    save: '存 钥',
    back: '返回',
    forget: '清除钥匙',
    verifying: '验钥中…',
    stored: (masked) => `已存：${masked}（末 4 位）`,
    storedNote: '此框不回显已存钥匙；要把钥匙拷到别处，请用你保存 token 的地方。',
    repoAdoptedFromLink: (slug) => `敕草仓库已按你点开的这条链接填好（${slug}）——配一把开得了它的钥匙就能读。`,
    repoNowRequired: '这版起敕草仓库改成填的了——补一次 owner/repo，钥匙照旧粘一遍。',
    repoFormat: '敕草仓库要填成 owner/repo（贴 GitHub 链接也行）。',
    tokenMissing: '先粘一把钥匙。',
    tokenDead: '钥匙失效了，换一把。',
    tokenCleared: '钥匙已清除。粘一把新的再进来。',
    tokenMissingPRScope: '钥匙差一项：Pull requests: Read and write。回 GitHub 的 token 页补上（不用重新生成，改完点 Update），再回来点存钥。',
    tokenNoWriteWarn: '提醒：这把钥匙没有 Contents 写权限，读批都行，但「画可」（merge）会失败。',
    tokenCannotOpen: (slug, msg) => `这把钥匙开不了 ${slug}：${msg}`,
  },

  // 折清单拉取
  list: {
    rateLimited: '碰到 GitHub 限流，缓一会儿再刷新。',
    failed: (msg) => `拉取失败：${msg}`,
  },

  // 直达链
  deepLink: {
    repoSwitchConfirm: (want, have) => `这条直达链指向 ${want}，你当前配的是 ${have}。\n切到 ${want}？（钥匙要能开它，否则切过去读不到）`,
    repoSwitchDeclined: (have, want) => `留在 ${have} 没动——那条链接指向 ${want}，要读得先切仓。`,
    folderNotFound: (n) => `直达链接指向第 ${n} 折，但清单里没有（可能已删或不在本仓）。`,
    noFolderNumber: '这条直达链接没带折号（blob 形态只指到文件），已打开清单首折。',
  },

  // 「引用此处」拷贝结果
  ref: {
    copied: (preview) => `已拷贝引用：${preview}`,
    copyFailed: (md) => `拷贝失败，手动复制：${md}`,
  },

  // 「携卷」结果（F12）
  carry: {
    done: (chars) => `已携卷 ${chars.toLocaleString('en-US')} 字——粘给任意 agent 接着干`,
    empty: '这折还没展开，等正文到了再携卷。',
    failed: (msg) => `携卷失败：${msg}`,
    fallbackTitle: '拷不进剪贴板——下面全选（⌘A）手动复制',
    fallbackClose: '关闭',
  },

  // 正文岛屿
  doc: {
    loading: '展折中…',
    loadFailed: (msg) => `展折失败：${msg}`,
    noMarkdown: '此折无 markdown 正文（代码 PR 的 diff 视图在北极星里）。',
    relLinkMissing: (path) => `这折里没有 ${path}`,
    imageMissing: (path) => `图取不到：${path}`,
    mermaidAlt: 'mermaid 图',
    mermaidFailed: (msg) => `mermaid 渲染失败，显示源码：${msg}`,
  },

  // rev 切换条 / 只读提示
  rev: {
    label: '本',
    headSuffix: '（最新）',
    optionTitle: (v, sha7, whenText, isHead) => `v${v} · ${sha7}${whenText}${isHead ? '（最新）' : ''}`,
    archivedNotice: '此折已画可归档 · 只读（要再批就开新折）',
    oldRevNotice: (v) => `在读 v${v}（旧版）· 批注请回最新版`,
  },

  // 文档语言变体切换 chip（切的是文档，不是界面语言）
  docLang: {
    switchTitle: '同一折的中英两版，切页不离开当前折',
    zh: '中',
    en: 'EN',
  },

  // F14 大纲 / 章列表
  outline: {
    title: '大纲',
    aria: '本篇大纲',
    chapterLabel: (i, n) => `第 ${i} / ${n} 章`,
    chapterAria: '本折章列表',
  },

  // 通读（连续读整本）——PAIN #31 残账②：多章折顺着读完全书，不用逐章点。
  readThrough: {
    on: '通读全书',            // 分章态 → 点它进通读
    off: '分章读',            // 通读态 → 点它回单章（才能划句涂归）
    onTitle: '把全书各章顺序拼在一起，一路滚到底',
    offTitle: '回到单章视图（通读态下不能划句涂归）',
    readonlyHint: '通读态只读：划句涂归请切回「分章读」；判不受影响',
    chapterDivider: (i, n, name) => `第 ${i} / ${n} 章 · ${name}`,
  },

  // 批注卡
  card: {
    quote: (text) => `「${text}」`,
    srcLine: (section, line) => `${section ? section + ' · ' : ''}第 ${line} 行`,
    draftPlaceholder: '涂归……',
    editTitle: '点击修改',
    // 空草稿退出编辑态时的占位。**它撑的是高度，不只是给个说明**——见 cards.js 那段注释。
    emptyNote: '（未写 · 点此补上）',
    outdatedBadge: '旧',
    outdatedTitle: '此行已随新版漂移',
    replyWho: (who) => `回话 · ${who}`,
    zongpiHeader: '判 · 整折总评（呈出即达，不攒批）',
    zongpiPlaceholder: '判……可以按序号列意见',
  },

  // 右缘
  margin: {
    otherDocs: (n) => `另有 ${n} 条涂归在此折其他文档`,
  },

  // 展读浮窗（一串涂归铺在宽栏上细读）
  threadView: {
    aria: '展读涂归',
    line: (n) => `第 ${n} 行`,
    close: '掩卷',
    closeTitle: '收起（Esc）',
  },

  // 展图浮窗（正文图从栏宽里捞出来看原尺寸）
  imageView: {
    aria: '展图',
    untitled: '（无题图）',
    full: '原尺寸',
    fit: '合观',
    zoomTitle: '在「塞进屏幕」与「原尺寸（可滚）」之间切换——点图也行',
    close: '掩卷',
    closeTitle: '收起（Esc）',
  },

  // 折子说明块（正文取自 PR body，这里只有壳）
  folderBody: {
    toggle: (badge) => `折子说明${badge ? `（${badge}）` : ''}`,
    decisionsBadge: (title, n) => `${title}${n ? ` · ${n} 条` : ''}`,
  },

  // 「已呈判」折叠组
  zongpiShown: {
    toggle: (n, gist) => `已呈判 · ${n}${gist ? `（最新：${gist}）` : ''}`,
  },

  // 「其他 N 串」折叠组
  otherThreads: {
    toggle: (n) => `其他 ${n} 串（其他文档 / 无法定位）`,
    wholeFolder: '整折',
  },

  // 草稿本地存储
  draft: {
    quotaFull: '草稿存不进本地存储（配额可能满了）——先提交已写的批注，别再往下攒。',
  },

  // 呈回涂归
  submit: {
    archivedReadonly: '这折已画可归档，只读——要再批就开新折。',
    oldRevBlocked: '正在读旧版——批注只能呈给最新版，先切回 head 再提交。',
    editingBlocked: '有一条涂归还在编辑：先「存批」或「作罢」它，再呈回。',
    emptyNotes: (n) => `还有 ${n} 条涂归没写内容（空批注不呈）——写完或作罢它们再提交。`,
    fallbackBody: (joined) => `以下涂归锚定不到可批注行（或写于旧版本），并入判：\n\n${joined}`,
    inlineBody: (n) => `门下 · ${n} 条`,
    done: (inlineN, fallbackN) => `已呈回 ${inlineN} 条涂归${fallbackN ? `（${fallbackN} 条并入判）` : ''}——回 Hermes 说「读批注」。`,
    failed: (msg) => `呈递失败（草稿都还在）：${msg}`,
  },

  // 呈判
  zongpi: {
    sent: '判已呈——回 Hermes 说「读批注」。',
    queued: '离线，判已存入待发——联网后自动补发。',
    failed: (msg) => `判呈递失败：${msg}`,
  },

  // M2 离线包
  offline: {
    outbox: (n) => `待发 ${n} 条判 · 联网自动补发`,
    copy: (ago) => `离线副本 · 截至 ${ago}`,
    jumpAsk: '上次读到别处',
    jumpGo: '跳到上次位置',
    jumpDismiss: '不用',
  },

  // 画可
  merge: {
    oldRevBlocked: '正在读旧版——画可定的是最新版，先切回 head 再画可。',
    pendingDraftsWarn: (n) => `\n注意：还有 ${n} 条涂归草稿没呈回，merge 之后就没处提交了。`,
    confirm: (n, title, warn) => `画可定稿：squash merge #${n}「${title}」？${warn}`,
    done: (n) => `已画可：#${n} 定稿归档，文档留在这儿随你复制。对外交付回 Hermes 说一声。`,
    nextUp: (n, title) => `下一折 #${n}「${title.length > 18 ? `${title.slice(0, 18)}…` : title}」→`,
    nextUpTitle: '待审队首。画可不再自动跳折——点这儿才走。',
    queueEmpty: '待审已空。',
    failed: (msg, isDraft, n) => `画可失败：${msg}${isDraft ? `（此折是 draft；若是 GraphQL 被钥匙拒了，回 Hermes 说「画可 #${n}」我来执行）` : ''}`,
  },
});
