// ?demo=1 —— 免 token 的演示/冒烟数据源：实现 App 用到的 api 子集，写操作只打 console。
// 顺带是迁移后的永久冒烟靶：?demo=1&auto=1 会用真实事件路径自动划两条涂归。

const DOC = `# 涂归 demo 折

这是一份演示敕草：不需要 token，写操作不会真的发出。划选任意文字试试涂归。

## 为什么要有 demo 模式

迁移到 Preact 之后，需要一个不依赖真仓库的冒烟靶：渲染、划句、攒批、提交管线（到 console 为止）都走真实代码路径。据说迁移后包体积下降了约四成【需核实】，这句就是 F13 标记的冒烟靶。

| 能力 | 状态 |
|---|---|
| 渲染阅读 | 可用 |
| 划句涂归 | 可用（写到 console） |
| 画可 | 可用（写到 console） |

\`\`\`js
const DEBOUNCE_MS = 300;
export const pushUsage = debounce(update, DEBOUNCE_MS);
\`\`\`

结尾一段：镜片随时可以摘掉，数据与循环全部留在 GitHub。

## 加长段（冒烟用，别删）

这一节的唯一职责是把 demo 文档撑到超过一屏——迁移评审抓过一个只有长文档才暴露的滚动断链（#root 高度），短文档冒烟永远测不出那类雷。

${Array.from({ length: 14 }, (_, i) => `第 ${i + 1} 段填充：读折台的滚动、批注卡对齐、浮批按钮收纳，都要在超过一屏的文档上才真正受测。`).join('\n\n')}

页内锚点还有个老写法 [回到顶部](#)，点了要真的回顶。

折间链接测试：见 [另一折](https://github.com/demo/repo/pull/998) 与 [本折某行](https://github.com/demo/repo/blob/main/docs/demo.md#L20)；外链 [GitHub](https://github.com/slopus/happy) 不该被拦。

跨篇锚点测试（PAIN #86）：[跳到别篇的落位节](guide.zh-CN.md#落位节) —— 切篇后要落到那一节，不是页首。

页内锚点测试：[照 GitHub 锚写](#加长段冒烟用别删)、[照标题原文写](#加长段（冒烟用，别删）)、[指不着的锚](#根本没有这一节)。

末行锚点：见此行即已滚到底。

<a id="demo-bare-anchor"></a>

## diff 渲染（冒烟用，别删）

\`\`\`diff
@@ -1,3 +1,3 @@
 保持不变的一行
-被删掉的旧行
+新增进来的行
\`\`\`

## mermaid 渲染（冒烟用，别删）

\`\`\`mermaid
graph TD
  A[读折] --> B[批注]
\`\`\`

下面这张故意写坏，渲染失败时必须保留源码围栏并出一行错误：

\`\`\`mermaid
this is not mermaid ???
\`\`\`
`;

// 旧版正文：删掉「为什么要有 demo 模式」一节——rev 切换后正文明显变短（冒烟断言据此）
const DOC_OLD = DOC.replace(/## 为什么要有 demo 模式[\s\S]*?结尾一段：镜片随时可以摘掉，数据与循环全部留在 GitHub。\n\n/, '');

// 呈折说明（PR body）。**照 menxia-mcp `buildBody` 的真实产物摆**：五段 `## 段名`、段间空行、
// 尾巴一行「回奏对」标记。issue #13 之前门下只从这里抠会话 id，五段一个字都不渲染——
// 「待你拍板」（要他决定的问题清单）因此彻底不可见。冒烟靶必须带全五段，否则那条断言测的是空气。
// 段里塞了标题 / 列表 / 表格：markdown 真渲染这条断言要有东西可断。
const BODY = `## 目的地

merge 后作为门下 issue #13 的实现依据。不对外发布。

## 直达链

[渲染版](https://menxia-reader.github.io/menxia/?pr=999)

## TLDR

PR body 的五段结构化正文此前在门下不可见，本折把它渲染到折首。细节见正文的 [〈加长段〉](#加长段冒烟用别删)。

| 段 | 之前 | 之后 |
|---|---|---|
| 待你拍板 | 看不见 | 折首默认展开 |

## 待你拍板

1. 折首折叠块（B）还是独立 tab（A）？
2. 有「待你拍板」时默认展开，其余默认收起——这个条件展开可以吗？
3. 段序原样保留，不把「待你拍板」提到最前，行不行？

## 怎么用

逐篇批。批完在这个会话说「读批注」，我逐条回话并出 v2。

<!-- happy-session: cmsdemo0000demo0000demo -->
`;

// 手开折的 body：没有任何 `## 段名`，只有散文（review #7 就长这样）。
// 归档折用它当靶——「认不出五段 ⇒ 不该判成有拍板点 ⇒ 默认收起」这条路径要有真数据走。
const BODY_FREEFORM = `读物快照。**这两篇是要发到别人仓库去的**，比内部文档更该被你逐句挑。

划句涂归。你说「发」我才发，不说就一直压着。

<!-- happy-session: cmsdemo0000demo0000demo -->`;

const PR = {
  number: 999,
  title: '涂归 demo 折（不落库）',
  updated_at: new Date(Date.now() - 36e5).toISOString(),
  draft: false,
  node_id: 'DEMO',
  head: { sha: 'demo0000' },
  // 多签：验卡面多个 chip 并排。`签:旅行` 同时挂在已画可样例 #998 上（下面 listMergedPRs
  // 直接 `...PR` 继承），是「按签跨状态同架」那条冒烟断言的命根——一签串起 open + merged。
  // 多签验卡面 chip 并排（`签:旅行` 也挂在已画可 #998，串起 open+merged）；
  // proj/kind/wait 供 F16 总览分组与「等谁」——主 demo 折也要在总览里现身。
  labels: [
    { name: 'proj:menxia' }, { name: 'kind:设计' }, { name: 'wait:你拍' },
    { name: '签:旅行' }, { name: '签:开发' },
  ],
  body: BODY,
};

// 书架「未画可」遗留的样例折（review #69 时是弘文馆样例；2026-09-21 书架改为读毕后，
// 它成了「open 且 wait:闲、还没画可」那一组的样本）。demo 里没有它的话，第三个 tab
// 点开永远只有读毕——而「点开里面什么都没有」正是这个功能上一轮报障的原话。
// 带 labels 是全部要点：遗留分流的判据只看 `kind:读物`（见 track.js isShelved）。
const SHELF_PR = {
  ...PR,
  number: 997,
  title: '读物：弘文馆遗留样例（未画可）',
  // 覆盖 PR 的 labels（否则连坐继承 签:旅行）；弘文馆样例也带一个签，验 chip 在书架卡上照样出。
  labels: [{ name: 'proj:menxia' }, { name: 'kind:读物' }, { name: 'wait:闲' }, { name: '签:开发' }],
  updated_at: new Date(Date.now() - 1728e5).toISOString(),
};

// F16 总览的 demo 数据。**分组、等谁、四种关系各要有一个活样本**——
// 只放一折的话总览永远只画一行，它到底把「谁等谁、谁盖了谁」画对了没有，冒烟看不出来。
// 折号刻意用 99x 段，与真仓不撞；**避开 997（弘文馆样例）/998（已画可样例）/999（主 demo 折）**。
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const demoPr = (number, title, labels, opts = {}) => ({
  ...PR, number, title, updated_at: ago(opts.h ?? 5), labels: labels.map((name) => ({ name })),
  body: BODY + (opts.rel ? `\n\n<!-- menxia-rel: ${opts.rel} -->` : ''),
});

const EXTRA_OPEN = [
  demoPr(992, '设计：中枢选型（等 #995 的裁决先落）',
    ['proj:zhongshumenxia', 'kind:设计', 'wait:agent'], { rel: 'needs=#995', h: 8 }),
  demoPr(996, '交付：存量补齐（依赖已画可，可动手）',
    ['proj:menxia', 'kind:交付', 'wait:agent'], { rel: 'needs=#990; unblocks=清完存量就能开 M2', h: 20 }),
  demoPr(995, '拍板：中枢四问（等你拍）',
    ['proj:zhongshumenxia', 'kind:拍板', 'wait:你拍'], { h: 2 }),
  demoPr(994, '选型旧稿（已被 #990 盖掉 · 不用读）',
    ['proj:zhongshumenxia', 'kind:拍板'], { h: 48 }),
  demoPr(993, '读物：闲时翻',
    ['proj:guanzhi', 'kind:读物', 'wait:闲'], { h: 72 }),
];

// 整份新增文件的 patch：全行可批
const PATCH = ['@@ -0,0 +1,' + DOC.split('\n').length + ' @@', ...DOC.split('\n').map((l) => '+' + l)].join('\n');

// 3 个 rev：v3=head（sha 对齐 PR.head.sha），v1/v2 更早。旧 rev 的正文用 DOC_OLD。
const COMMITS = [
  { sha: 'demoAAAA', commit: { message: '初稿', committer: { date: new Date(Date.now() - 72e5).toISOString() } } },
  { sha: 'demoBBBB', commit: { message: '补加长段', committer: { date: new Date(Date.now() - 54e5).toISOString() } } },
  { sha: 'demo0000', commit: { message: '收尾', committer: { date: new Date(Date.now() - 36e5).toISOString() } } },
];

// 2 串已呈批注：一串带 agent 回话（in_reply_to_id 串到根），一串 outdated（line=null）
const COMMENTS = [
  {
    id: 101, path: 'docs/demo.md', line: 20, original_line: 20, in_reply_to_id: null,
    user: { login: 'charlie' }, created_at: new Date(Date.now() - 30e5).toISOString(),
    body: '> 镜片随时可以摘掉，数据与循环全部留在 GitHub。\n\n这句放结尾太谦虚了，提到开头当卖点。',
  },
  {
    id: 102, path: 'docs/demo.md', line: 20, original_line: 20, in_reply_to_id: 101,
    user: { login: 'agent-bot' }, created_at: new Date(Date.now() - 24e5).toISOString(),
    body: '已接受：把「镜片可摘」挪到 Why 的第一句，结尾只留循环闭环。',
  },
  {
    id: 103, path: 'docs/demo.md', line: null, original_line: 7, in_reply_to_id: null,
    user: { login: 'charlie' }, created_at: new Date(Date.now() - 20e5).toISOString(),
    body: '> 迁移到 Preact 之后\n\n这行在新版已经改写，锚定失效——保留看处理即可。',
  },
  // 坏数据哨兵：回话的 body 不过 parseCommentBody（那个函数自带 String(raw||'')），
  // 是直连 renderMarkdown 的裸调用点。markdown-it 对非字符串直接抛 → 整个 app 白屏。
  // 放这儿当报警器：防线没了整套冒烟会全灭，而不是悄悄少一条。
  {
    id: 104, path: 'docs/demo.md', line: 20, original_line: 20, in_reply_to_id: 101,
    user: { login: 'agent-bot' }, created_at: new Date(Date.now() - 22e5).toISOString(),
    body: null,
  },
];

// 已呈判（会话区）。真实评审历史长这样：agent 一轮一轮追加 changelog，用户偶尔插一句短的。
// issue #1 实测 PR #30 是 9 条 / 8,132 字，全展开把正文推下 2–3 屏。冒烟必须撑到这个量级，
// 否则「正文在首屏」那条断言在短数据上恒真——折叠被改回去也照样绿。
const changelog = (v, head) => `## ${v} ${head}

**改了什么**

${Array.from({ length: 8 }, (_, i) => `${i + 1}. 第 ${i + 1} 处：结论前置，删掉重复的背景铺陈，并补一行取舍依据与它的反面。`).join('\n')}

| 项 | 前 | 后 |
|---|---|---|
| 篇幅 | 长 | 短 |

剩下的分歧留到下一轮，先按这版读。`;

// 数组序 / id 序 / created_at 序三者**故意错开**：真实 GitHub 是三序共线的，而共线数据下
// 「按时间降序」「按 id 降序」「把数组 reverse 一下」三种实现给出同一个答案，断言就白写了。
// 最新的那条（v4 定稿）故意摆在数组中间且 id 不是最大——只有真按 created_at 排才拿得到它。
// body: null 是坏数据哨兵：markdown-it 对非字符串直接抛，抛在组件渲染里就是整个 app 白屏。
const ZONGPIS = [
  { id: 205, user: { login: 'agent-bot' }, created_at: new Date(Date.now() - 34e5).toISOString(), body: changelog('v2', '按批注重写 Why 一节') },
  { id: 203, user: { login: 'agent-bot' }, created_at: new Date(Date.now() - 18e5).toISOString(), body: changelog('v4 定稿', '只留结论与清单') },
  // 相对路径图片：私有仓的 raw 链接取不到，必须换 blob URL。#5 之前评论正文这条路径没接 hydrate，读者看到断图
  { id: 201, user: { login: 'charlie' }, created_at: new Date(Date.now() - 40e5).toISOString(), body: '图好像有问题\n\n![截图](assets/shot.png)' },
  { id: 202, user: { login: 'charlie' }, created_at: new Date(Date.now() - 22e5).toISOString(), body: null },
  { id: 204, user: { login: 'agent-bot' }, created_at: new Date(Date.now() - 28e5).toISOString(), body: changelog('v3', '补齐数据来源') },
];

// ?fail=401|403：让列表接口抛出 ApiError 形状，测消费层的分流（401 才清 token）
const FAIL = new URLSearchParams(location.search).get('fail');
const failErr = () => Object.assign(new Error(`${FAIL} demo failure`), {
  status: +FAIL, tokenDead: FAIL === '401', rateLimited: FAIL === '403',
});

const MERGED = new Set();   // 本次会话里画可过的折号（demo 无后端，状态只活在内存）

export const demoApi = {
  verifyToken: async () => ({ repo: {}, canWrite: true, prAccess: true }),
  // 待审清单三摊都要有：PR（主 demo 折）、SHELF_PR（弘文馆）、EXTRA_OPEN（总览分组/关系样本）。
  // MERGED 过滤保留：画可后把折移出清单，「画可后跳没跳折」才可测（no-jump 那条断言的命根）。
  listOpenPRs: async () => { if (FAIL) throw failErr(); return [PR, SHELF_PR, ...EXTRA_OPEN].filter((p) => !MERGED.has(p.number)); },
  listMergedPRs: async () => [
    {
      ...PR, number: 998, title: '涂归 demo 折 · 已画可（归档样例）',
      merged_at: new Date(Date.now() - 864e5).toISOString(),
      body: BODY_FREEFORM,  // 手开折：无五段结构 → 说明块该默认收起（issue #13 的条件展开）
      // labels 由 ...PR 继承（签:旅行 / 签:开发）——这份已画可样例与 open 的 #999 共 签:旅行，
      // 是「按签视图同时列出 open 与 merged」那条断言的 merged 半边。
    },
    {
      // 已画可且声明盖掉了 #994 —— 总览据此把 #994 判成僵尸折（真仓 #59 盖 #58 就是这形状）
      ...demoPr(990, '裁决：选型定案（已画可）', ['proj:zhongshumenxia', 'kind:拍板'],
        { rel: 'supersedes=#994', h: 30 }),
      merged_at: ago(30),
    },
    {
      // 读毕书架的样例（2026-09-21）：已画可的 kind:读物 才上架。没有它，第三个 tab 的「读毕」组
      // 在 demo 里永远是空的——只剩 #997 那条「未画可」遗留，看不出两组是怎么分开的。
      ...demoPr(989, '读物：读毕样例（已画可，回看用）', ['proj:menxia', 'kind:读物'], { h: 96 }),
      merged_at: ago(96),
    },
  ],
  listPRFiles: async () => [
    { filename: 'docs/demo.md', status: 'added', patch: PATCH },
    { filename: 'docs/guide.md', status: 'added', patch: '@@ -0,0 +1,3 @@\n+# Guide\n+\n+English variant for the language switch.' },
    { filename: 'docs/guide.zh-CN.md', status: 'added', patch: '@@ -0,0 +1,3 @@\n+# 指南\n+\n+中文版，用来验语言切页。' },
  ],
  // ref 落在旧 rev（非 head sha）时返回删节版，模拟版本间正文差异
  getFileText: async (path, ref) => {
    if (path === 'docs/guide.md') return '# Guide\n\nEnglish variant for the language switch.\n\n## Landing\n\nCross-doc anchor target.';
    if (path === 'docs/guide.zh-CN.md') return '# 指南\n\n中文版，用来验语言切页。\n\n## 落位节\n\n跨篇锚点的目标节。';
    return ref && ref !== 'demo0000' ? DOC_OLD : DOC;
  },
  // 换 blob URL 的桩：回一张 1×1 gif 的 data URL。原本是 throw（demo 文档里没图，从没被调用过），
  // 但评论正文接上 hydrate 之后要能断言「相对路径真被换掉了」，throw 只能验到降级占位符
  getFileBlobUrl: async (path) => {
    return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  },
  listPRComments: async () => COMMENTS,
  listIssueComments: async () => ZONGPIS,
  listPRCommits: async () => COMMITS,
  submitReview: async (num, payload) => { window.__lastReview = { num, payload }; console.log('[demo] submitReview', num, payload); return {}; },
  // 真往 ZONGPIS 里追加，否则「发完判能不能立刻看见」这条路径在测试基建上不可达
  createIssueComment: async (num, body) => {
    console.log('[demo] 判', num, body);
    ZONGPIS.push({ id: 900 + ZONGPIS.length, user: { login: 'charlie' }, created_at: new Date().toISOString(), body });
    return {};
  },
  // 画可要真把折移出待审清单，否则「画可后跳没跳折」在 demo 里根本不可测：
  // 清单静态不变 ⇒ 队首永远还是刚合的那折 ⇒ 「跳队首」和「留原地」长得一模一样，断言空转假绿。
  mergePR: async (num, sha) => { console.log('[demo] 画可', num, sha); MERGED.add(num); return {}; },
  markReady: async () => {},
};

if (FAIL) {
  localStorage.setItem('zhupi.token', 'github_pat_demo_token');
  localStorage.setItem('zhupi.repo', 'demo/repo');
  setTimeout(() => {
    let pass = 0, fail = 0;
    const chk = (name, cond, detail = '') => {
      cond ? pass++ : fail++;
      console.log(`[smoke] ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    };
    const onSetup = Boolean(document.getElementById('setup'));
    const tokenLeft = Boolean(localStorage.getItem('zhupi.token'));
    if (FAIL === '403') {
      // 限流：绝不能清钥匙、也不该把人踢回设置页（历史上误删过有效 token）
      chk('403-keeps-token', tokenLeft);
      chk('403-stays-in-app', !onSetup);
      chk('403-shows-notice', Boolean(document.querySelector('.notice, .state.err')));
    } else {
      chk('401-clears-token', !tokenLeft);
      chk('401-back-to-setup', onSetup);
    }
    console.log(`[smoke] RESULT pass=${pass} fail=${fail}`);
  }, 1200);
}

// ?demo=1&deep=1：验直达进场——URL 带 ?pr=998（归档折）应直接开到它并切到已画可栏
// ?demo=1&deep=miss&pr=9999：验折号找不到时**真的出提示**——pendingNotice 曾经只写不读
// （声明了、赋值了、全文件没有第三处），深链失败一路静默。UI 胶水没测试就是会这样烂掉。
const DEEP = new URLSearchParams(location.search).get('deep');
if (DEEP === '1' || DEEP === 'miss') {
  setTimeout(() => {
    let pass = 0, fail = 0;
    const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`[smoke] ${c ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`); };
    if (DEEP === 'miss') {
      const notice = document.querySelector('.notice')?.textContent || '';
      chk('deep-miss-notice-shown', notice.includes('9999'), `notice=${notice.slice(0, 60) || '(空)'}`);
    } else {
      const crumb = document.querySelector('.crumb')?.textContent || '';
      chk('deep-opened-target', crumb.includes('已画可') || crumb.includes('归档'), `crumb=${crumb.slice(0, 40)}`);
      const doneTab = [...document.querySelectorAll('.list-tab')].find((b) => b.textContent.includes('已画可'));
      chk('deep-switched-tab', doneTab?.classList.contains('active'));
      chk('deep-readonly', !document.querySelector('.btn-qinci'));
    }
    console.log(`[smoke] RESULT pass=${pass} fail=${fail}`);
  }, 1500);
}

// ?demo=1&mobile=1：手机窄口（run-browser.sh 用 390px 窗宽跑这一支）验 M0 底栏 + 二级菜单——
// 桌面冒烟跑在 1440，进不了 ≤900 分支，这两样的真实版式只有在这里才量得到。
//
// 走的是真实动线，顺序不能改：demo 载入即自动开着 #999 那折，所以**进来就是阅读页**
//   阅读页 →「‹ 目录」→ 目录页（篇 / 节）→ 点节 → 回阅读页并滚到位
//                        └→「‹ 全部折子」→ 清单页 → 点卡 → 回阅读页
// 头一版把「量清单」写在最前面，量到的其实是一个 display:none 的 aside，`0 ≤ 0` 恒真，
// 八条全绿而版式根本没修好——顺序错了，断言本身再严也没用。
const MOBILE = new URLSearchParams(location.search).get('mobile');
if (MOBILE === '1') {
  setTimeout(async () => {
    let pass = 0, fail = 0;
    const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`[mobile] ${c ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none';

    // ── 阅读页 ──────────────────────────────────────────────
    // ① 二级菜单的一半：读折时清单整块退场，正文独占一屏
    const asideRead = document.querySelector('aside');
    chk('reader-hides-list', Boolean(asideRead) && !shown(asideRead),
      `display=${asideRead ? getComputedStyle(asideRead).display : 'NO-EL'}`);

    // ── P0 手机档修（门下 iOS 重设计 #180 第一期）──────────────
    // 可见的可点控件里不足 44×44 的。正文里的行内链接不算（行内例外），aria-hidden 的拖宽手柄不算。
    const smallTargets = () => [...document.querySelectorAll('button, a[href], [role=button]')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !e.closest('[aria-hidden="true"], article')
          && (r.width < 44 || r.height < 44);
      })
      .map((e) => `${e.className || e.tagName}:${e.textContent.trim().slice(0, 6)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    // 首屏见正文：走查原病是 h1 在 844px、首屏零正文。标题与首段都得在视口内（底栏之上）。
    const h1 = document.querySelector('article h1');
    const p1 = document.querySelector('article p');
    const barTop = document.querySelector('.mobile-bar')?.getBoundingClientRect().top ?? window.innerHeight;
    chk('p0-first-screen-shows-body',
      Boolean(h1 && p1) && h1.getBoundingClientRect().top < barTop && p1.getBoundingClientRect().bottom < barTop,
      `h1Top=${h1 ? Math.round(h1.getBoundingClientRect().top) : 'NO-EL'} p1Bottom=${p1 ? Math.round(p1.getBoundingClientRect().bottom) : 'NO-EL'} barTop=${Math.round(barTop)}`);
    // 折子说明默认收成一行药丸，拍板条数在标题上常显
    const fb = document.querySelector('.folder-body');
    const fbToggle = fb?.querySelector('.folder-body-toggle');
    chk('p0-folder-body-pill-collapsed',
      Boolean(fb) && !fb.classList.contains('open') && !shown(fb.querySelector('.folder-body-tldr'))
      && /\d+\s*条/.test(fbToggle?.textContent || ''),
      `open=${fb?.classList.contains('open')} toggle=${fbToggle?.textContent.trim()}`);
    // 引用此处 / 携卷 / 回奏 / A± 收进「⋯」：默认藏，点开才露
    const moreBtn = document.querySelector('.more-btn');
    const moreShown = () => [...document.querySelectorAll('.more-item')].filter(shown).length;
    const hiddenBefore = moreShown() === 0;
    const updBefore = shown(document.querySelector('.update-app'));
    moreBtn?.click();
    await sleep(200);
    const shownAfter = moreShown();
    // 「更新到最新版」住在「⋯」里：默认藏、点开露、触控 ≥44×44（真点它会拆 SW 重载，冒烟不点）
    const upd = document.querySelector('.update-app');
    const updR = upd?.getBoundingClientRect();
    chk('update-button-in-more-menu',
      !updBefore && shown(upd) && upd.textContent.includes('更新到最新版') && updR.width >= 44 && updR.height >= 44,
      `before=${updBefore} shown=${shown(upd)} text=${upd?.textContent.trim()} size=${updR ? `${Math.round(updR.width)}x${Math.round(updR.height)}` : 'NO-EL'}`);
    moreBtn?.click();
    await sleep(200);
    chk('p0-more-menu-folds-desktop-actions', shown(moreBtn) && hiddenBefore && shownAfter >= 3 && moreShown() === 0,
      `moreBtn=${shown(moreBtn)} hiddenBefore=${hiddenBefore} shownAfter=${shownAfter}`);
    chk('p0-touch-targets-44-reader', smallTargets().length === 0, smallTargets().join(' | ') || 'none');
    chk('p0-scroll-ends-hidden-on-phone', !shown(document.querySelector('.scroll-ends')),
      `display=${document.querySelector('.scroll-ends') ? getComputedStyle(document.querySelector('.scroll-ends')).display : 'NO-EL'}`);
    chk('p0-open-folder-pushed-history', history.state?.menxia === 'folder', `state=${JSON.stringify(history.state)}`);

    const bar = document.querySelector('.mobile-bar');
    chk('mobile-bar-visible-on-phone', shown(bar),
      `display=${bar ? getComputedStyle(bar).display : 'NO-EL'}`);
    if (bar) {
      const r = bar.getBoundingClientRect();
      // 贴底缘：底栏底边应落在视口底部附近（fixed bottom:0，容 2px 误差）
      chk('mobile-bar-pinned-to-bottom', Math.abs(r.bottom - window.innerHeight) <= 2,
        `bottom=${Math.round(r.bottom)} vh=${window.innerHeight}`);
      const btns = [...bar.querySelectorAll('.mobile-bar-btn')];
      // 判＋画可常驻（未归档折）；提交（涂归·n）只在有草稿时出，刚开的折没草稿。
      // 认「判在不在」而不是「判是不是第一个」：返回钮进底栏后首位就归它了，
      // 而这条断言要守的一直是「核心动作没被挤掉」，位置是当年的偶然不是意图。
      chk('mobile-bar-has-core-actions', btns.length >= 3 && btns.some((b) => b.textContent.includes('判')),
        `n=${btns.length} texts=${btns.map((b) => b.textContent.trim()).join('|')}`);
      // 触控目标：每个按钮实测高度 ≥44px（Apple HIG 下限；min-height:44 的落地校验）
      const allBig = btns.length > 0 && btns.every((b) => b.getBoundingClientRect().height >= 44);
      chk('mobile-bar-touch-targets-44', allBig,
        `heights=${btns.map((b) => Math.round(b.getBoundingClientRect().height)).join(',')}`);
      // ② 返回钮：底栏是 fixed 的，读到第几屏都够得着——这正是它待在底栏而不是顶栏的理由
      const back = bar.querySelector('.mobile-bar-back');
      chk('mobile-bar-has-back', Boolean(back), `text=${back ? back.textContent.trim() : 'NO-EL'}`);
      back?.click();
      await sleep(400);
    } else {
      chk('mobile-bar-pinned-to-bottom', false, 'no bar');
      chk('mobile-bar-has-core-actions', false, 'no bar');
      chk('mobile-bar-touch-targets-44', false, 'no bar');
      chk('mobile-bar-has-back', false, 'no bar');
    }

    // ── 目录页（第二层：篇 / 节）────────────────────────────
    const navPage = document.querySelector('.nav-page');
    chk('nav-page-opens', shown(navPage) && !shown(document.querySelector('.work')),
      `nav=${navPage ? getComputedStyle(navPage).display : 'NO-EL'} work=${document.querySelector('.work') ? getComputedStyle(document.querySelector('.work')).display : 'NO-EL'}`);

    // 篇：demo #999 有 demo.md / guide.md 两篇，当前那篇要标出来（.active）
    const chapters = [...document.querySelectorAll('.nav-chapter')];
    chk('nav-lists-chapters', chapters.length >= 2 && chapters.some((c) => c.classList.contains('active')),
      `n=${chapters.length} active=${chapters.filter((c) => c.classList.contains('active')).length}`);

    // 节：本篇标题 ≥3 条（hasOutline 的门槛）。排除篇那一栏，只数节。
    const sections = [...document.querySelectorAll('.nav-item')].filter((b) => !b.classList.contains('nav-chapter'));
    chk('nav-lists-sections', sections.length >= 3, `n=${sections.length}`);

    // 目录页的底栏只留「‹ 正文」一颗：判/涂归/画可 对着正文，浏览目录时按不着
    const navBtns = [...document.querySelectorAll('.mobile-bar .mobile-bar-btn')];
    chk('nav-bar-only-back-to-doc',
      navBtns.length === 1 && navBtns[0].textContent.includes('正文'),
      `n=${navBtns.length} texts=${navBtns.map((b) => b.textContent.trim()).join('|')}`);

    // 顶栏那排动作同理要收起。头一版只藏了 .work，顶栏照旧摆着「判 / 画可 / 刷新」——
    // 底栏刚以「按不着」为由清空，顶栏又原样放着，自相矛盾。截图看出来的，断言当时没盖到。
    const navActions = document.querySelector('.actions');
    chk('nav-page-hides-doc-actions', !shown(navActions),
      `display=${navActions ? getComputedStyle(navActions).display : 'NO-EL'}`);

    // 点最后一节（文档最深处）→ 目录页关掉、正文回来、**真滚过去了**。
    // scrollY>0 与 .search-flash 两条一起验：只看「页面关了」会把「跳没跳中」放过去，
    // 而 flashTo 只在真找到目标块时才挂 .search-flash（1600ms 内有效）。
    const lastSection = sections[sections.length - 1];
    const beforeY = Math.round(window.scrollY);
    lastSection?.click();
    await sleep(500);
    const flashed = Boolean(document.querySelector('.search-flash'));
    const afterY = Math.round(window.scrollY);
    chk('nav-section-jumps-to-reader',
      !shown(document.querySelector('.nav-page')) && shown(document.querySelector('.work'))
      && flashed && afterY > beforeY,
      `flashed=${flashed} scrollY ${beforeY}→${afterY}`);

    // 篇的旧入口撤了：正文顶上不该再有 doc-tab 胶囊（同一件事别两处露出）
    const docTabs = document.querySelector('.doc-tabs');
    chk('doc-tabs-hidden-on-phone', !shown(docTabs),
      `display=${docTabs ? getComputedStyle(docTabs).display : 'NO-EL(单篇折本来就不渲染)'}`);

    // 输入框 ≥16px：<16px 时 iOS Safari 聚焦会把整页放大且不缩回。
    // ⚠️ 这里只能验字号这个**确定门槛**——Chrome headless 不跑 WebKit 的自动放大，
    // 「他 iPhone 上到底还跳不跳」这一步本测试证明不了，别把绿灯当成真机通过。
    const searchInput = document.querySelector('.search-input');
    const fs = searchInput ? parseFloat(getComputedStyle(searchInput).fontSize) : 0;
    chk('inputs-16px-no-ios-zoom', fs >= 16, `search-input=${fs}px`);

    // 回目录页，走「‹ 全部折子」那条边
    document.querySelector('.mobile-bar-back')?.click();
    await sleep(400);
    document.querySelector('.nav-up')?.click();
    await sleep(400);

    // ── 清单页（返回之后）────────────────────────────────────
    // ③ 回得来：清单重新露面，底栏（读折页的部件）随之消失
    const asideList = document.querySelector('aside');
    const barGone = !document.querySelector('.mobile-bar');
    chk('back-returns-to-list', shown(asideList) && barGone,
      `asideDisplay=${asideList ? getComputedStyle(asideList).display : 'NO-EL'} barGone=${barGone}`);

    // ④ 折清单必须整条摊开随页滚，不许再是个内滚小框。
    //    原病（2026-08-19 反馈「吞目录」）就量在这一行：aside 被 max-height:38vh 压住，
    //    390×780 的机器上 #pr-list clientHeight=71 而 scrollHeight=755——一屏一张卡都不满。
    //    ⚠️ 三个条件缺一不可，少任何一条都会 fail open：
    //      · clientHeight>0 —— 盒子塌成 0 高（flex:1 在 height:auto 的列容器里就会塌）时
    //        `0 ≤ 0` 恒真，而卡片全溢在盒外照样看得见，肉眼与截图都发现不了。
    //      · 末卡落在 aside 盒内 —— 要守的性质是「盒子长到装得下」，不是「盒子自己前后一致」；
    //        溢出可见时后者真而前者假。
    const list = document.querySelector('#pr-list');
    const cards = [...document.querySelectorAll('.pr-item')];
    const asideBox = asideList?.getBoundingClientRect();
    const lastCard = cards.length ? cards[cards.length - 1].getBoundingClientRect() : null;
    chk('list-page-not-inner-scrolled',
      Boolean(list) && list.clientHeight > 0
      && list.scrollHeight <= list.clientHeight + 1
      && Boolean(lastCard) && Boolean(asideBox) && lastCard.bottom <= asideBox.bottom + 1,
      `client=${list ? list.clientHeight : 'NO-EL'} scroll=${list ? list.scrollHeight : 'NO-EL'}`
      + ` cards=${cards.length} lastCardBottom=${lastCard ? Math.round(lastCard.bottom) : 'NO-EL'}`
      + ` asideBottom=${asideBox ? Math.round(asideBox.bottom) : 'NO-EL'}`);

    // P0：「‹ 全部折子」走的是 history.back()——落到清单那一格，栈不漂
    chk('p0-back-lands-on-list-entry', history.state?.menxia === 'list', `state=${JSON.stringify(history.state)}`);
    chk('p0-touch-targets-44-list', smallTargets().length === 0, smallTargets().join(' | ') || 'none');
    const gistDirty = [...document.querySelectorAll('.pr-summary')].map((e) => e.textContent).filter((t) => /[|`]|(^|\s)#{1,6}\s|---/.test(t));
    chk('p0-list-summary-no-markdown', gistDirty.length === 0, gistDirty.map((t) => t.slice(0, 30)).join(' | ') || 'clean');

    // ── 再进阅读页 ──────────────────────────────────────────
    // ⑤ 前进那一边：从清单点一张卡要真能进阅读页（他要的「一级菜单选折 → 点进去阅读」）
    // 先把清单滚下去一段，留给后面「返回后回到原位」那条断言量
    window.scrollTo(0, 120);
    await sleep(100);
    const listY = Math.round(window.scrollY);
    cards[0]?.click();
    await sleep(700);
    chk('card-opens-reader',
      !shown(document.querySelector('aside')) && shown(document.querySelector('.mobile-bar')),
      `asideShown=${shown(document.querySelector('aside'))} barShown=${shown(document.querySelector('.mobile-bar'))}`);

    // P0：系统返回（Safari 返回键 / WKWebView 侧滑）＝ history.back()：回清单，且停在进折前的位置
    window.scrollTo(0, 600);
    await sleep(100);
    history.back();
    await sleep(600);
    chk('p0-history-back-restores-list',
      shown(document.querySelector('aside')) && !document.querySelector('.mobile-bar') && listY > 0
      && Math.abs(Math.round(window.scrollY) - listY) <= 2,
      `asideShown=${shown(document.querySelector('aside'))} listY=${listY} scrollY=${Math.round(window.scrollY)}`);

    // 提示条可见（2026-10-14）：手机上整页随正文滚，提示条原挂页面最顶，读到中段点底栏「画可」
    // 成功/失败提示都在视口外＝「点了没反应」。滚到中段 → 点画可 → 提示条必须在视口内、且不压底栏。
    // 先走失败路径（mergePR 抛错），再走成功路径；画可会合掉这一折，所以放在导航断言之后。
    window.confirm = () => true;
    document.querySelector('.pr-item')?.click();
    await sleep(700);
    const noticeVisible = (tag) => {
      const n = document.querySelector('.notice:not(.stale-banner)');
      const bar = document.querySelector('.mobile-bar');
      if (!n || !bar) { chk(`notice-visible-${tag}`, false, `notice=${Boolean(n)} bar=${Boolean(bar)}`); return; }
      const r = n.getBoundingClientRect(), b = bar.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
      const overlap = r.bottom > b.top + 0.5;
      chk(`notice-visible-${tag}`, inView && !overlap && getComputedStyle(n).position === 'fixed',
        `scrollY=${Math.round(window.scrollY)} rect=[${[r.left, r.top, r.right, r.bottom].map(Math.round)}] barTop=${Math.round(b.top)}`);
    };
    window.scrollTo(0, Math.max(600, Math.round(document.documentElement.scrollHeight / 2)));
    await sleep(200);
    const origMerge = demoApi.mergePR;
    demoApi.mergePR = async () => { throw new Error('demo merge boom'); };
    document.querySelector('.mobile-bar-qinci')?.click();
    await sleep(500);
    noticeVisible('on-failure');
    document.querySelector('.notice-close')?.click();
    await sleep(200);
    chk('notice-close-dismisses', !document.querySelector('.notice:not(.stale-banner)'));
    demoApi.mergePR = origMerge;
    window.scrollTo(0, Math.max(600, Math.round(document.documentElement.scrollHeight / 2)));
    await sleep(200);
    document.querySelector('.mobile-bar-qinci')?.click();
    await sleep(900);
    noticeVisible('on-success');

    console.log(`[mobile] RESULT pass=${pass} fail=${fail}`);
  }, 1500);
}

// 自动演示：用真实的 Selection + mouseup + 按钮点击走完「划句 → 存批」两轮
export async function autoAnnotate(docEl) {
  try { await runSmoke(docEl); } catch (err) {
    // 冒烟里任何一处抛错原本会让 RESULT 整个丢失（脚本静默结束）——兜住并自曝
    console.log(`[smoke] FAIL harness-exception — ${err && err.message}`);
    console.log('[smoke] RESULT pass=0 fail=1');
  }
}

async function runSmoke(docEl) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rangeFor = (text) => {
    const block = [...docEl.querySelectorAll('[data-line]')].find((b) => b.textContent.includes(text));
    if (!block) return null;
    const idx = block.textContent.indexOf(text);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let pos = 0, sN = null, sO = 0, node, r = null;
    while ((node = walker.nextNode())) {
      const next = pos + node.data.length;
      if (!sN && idx < next) { sN = node; sO = idx - pos; }
      if (sN && idx + text.length <= next) {
        r = document.createRange(); r.setStart(sN, sO); r.setEnd(node, idx + text.length - pos);
        break;
      }
      pos = next;
    }
    return r;
  };
  // 等条件成立，最多 ms 毫秒。拿到真值就返回，超时返回 null。
  // 2026-08-19 加：pick() 原先靠**固定 120ms**等浮批钮和编辑器挂载，机器一忙就等不到，
  // 而 `if (ta)` 是静默跳过——于是这一轮的批注压根没写进去，红的却是**下游**那条断言
  // （实测 empty-draft-starts-editing 五次里红一次，它本身没毛病，是被上游拖红的）。
  // 换成轮询：正常情况反而更快（~25ms 就返回，不再无条件睡满 360ms），慢的时候等得起。
  const waitFor = async (fn, ms = 1500) => {
    const deadline = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() >= deadline) return null;
      await sleep(25);
    }
  };
  // 等两帧（兜底 150ms）：scroll 事件是在下一帧才派发的，等它落地再往下走。
  const settle = () => Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), sleep(150)]);
  const pick = async (text, note, save) => {
    // 2026-10-15 加（CI 10/12、10/14 两次红，日志都是「pick 等不到浮批钮：const DEBOUNCE_M」，
    // 下游 3～6 条断言连坐）：上一轮 pick 打开的编辑器是在 useEffect + setTimeout(0) 里才
    // focus 的（components/cards.js），Preact 把 useEffect 推到绘制之后；那颗 textarea 在文末，
    // focus 会把 .work 滚下去，而 scroll 事件又要等下一帧才派发。慢机器上这一串落在本轮
    // 浮钮出现**之后**，ui.js 的捕获期 onScroll 当场 setFloat(null)，浮钮再也不回来。
    // 所以开划之前先让上一轮的滚动落地。
    await settle();
    const r = rangeFor(text);
    // 三处「等不到」以前全是静默 return/跳过，失败现场离报错点隔着好几条断言。
    // 现在各自出一句诊断——**不带 PASS/FAIL 前缀**，所以不进 smoke 的 golden 名单，
    // 只在日志里现身，指着真正的病灶说话。
    if (!r) { console.log(`[smoke] pick 找不到靶文：${text.slice(0, 16)}`); return; }
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    docEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    // ⚠️ 这三处 sleep(120) **必须留着**。它不只是「等元素出现」，更是「让上一轮落定」的节拍：
    // 上一颗浮批钮／上一个编辑器可能还挂在屏幕上，直接轮询「有没有 .zhupi-float」会**立刻**
    // 拿到旧的那一颗，点下去等于给上一句重建草稿。第一版就这么写的，四并发跑出来稳定
    // 131/1（empty-draft-dropped-on-switch 读到 left=[]），比原来的偶发更糟。
    // 所以补等是**追加**的：快的时候行为与从前逐字节相同，只有到点还没出现才多等一会。
    await sleep(120);
    const float = document.querySelector('.zhupi-float')
      || await waitFor(() => document.querySelector('.zhupi-float'));
    if (!float) {
      // 现场带上选区 / 焦点 / 滚动位置：下回再红能直接分辨是选区丢了还是浮钮被滚动收了
      const s = getSelection(), ae = document.activeElement;
      console.log(`[smoke] pick 等不到浮批钮：${text.slice(0, 16)}`
        + ` sel=${s.isCollapsed ? 'collapsed' : JSON.stringify(s.toString().slice(0, 16))}`
        + ` active=${ae?.tagName}.${ae?.className || ''} workTop=${document.querySelector('.work')?.scrollTop}`);
      return;
    }
    float.click();
    await sleep(120);
    const ta = document.querySelector('.anno-input')
      || await waitFor(() => document.querySelector('.anno-input'));
    if (!ta) { console.log(`[smoke] pick 等不到编辑器：${text.slice(0, 16)}`); return; }
    // 等编辑器自己的延迟 focus 落地（见上），它引起的滚动在下一轮 pick 开头的 settle 里消化
    if (!await waitFor(() => document.activeElement === ta, 1000)) {
      console.log(`[smoke] pick 编辑器没拿到焦点：${text.slice(0, 16)}`);
    }
    ta.value = note;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    if (save) [...document.querySelectorAll('.anno-save')].pop()?.click();
    await sleep(120);
  };
  // ── 断言机制：不再是 console.log 打印真假值（那样断言变 false 也照样"绿"）。
  // 每条走 chk()，失败打 [smoke] FAIL 并计数，末行输出 RESULT 供 run-browser.sh 判退出码。
  let pass = 0, fail = 0;
  const chk = (name, cond, detail = '') => {
    cond ? pass++ : fail++;
    console.log(`[smoke] ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  };

  await sleep(300);

  // 触屏路径（iPad 实测：接触控板能批、手指不能）。iOS Safari 把长按选字与拖手柄整段手势
  // 交给原生选择 UI，不派发合成 mouse 事件——只挂 mouseup 时手指选中后浮钮永远不出。
  // 两条钉死两侧：手指要能出钮；鼠标按下拖选途中不许出钮（桌面零回归的闸门——selectionchange
  // 在拖选期间连续派发，误让它对鼠标生效的话浮钮会在松手前就冒出来跟着选区跳）。
  const tRange = rangeFor('迁移到 Preact 之后');
  chk('touch-probe-range-built', Boolean(tRange)); // 防靶文失配导致下面两条空转假绿
  if (tRange) {
    document.dispatchEvent(new Event('touchstart', { bubbles: true })); // 早于长按被系统接管
    getSelection().removeAllRanges();
    getSelection().addRange(tRange);
    await sleep(450); // 过 250ms 防抖
    chk('touch-selection-shows-float', Boolean(document.querySelector('.zhupi-float')));

    getSelection().removeAllRanges();
    await sleep(400); // 让上一轮防抖落地收钮，再验鼠标侧
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    getSelection().addRange(tRange); // 模拟按住拖选：选区在变，但还没 mouseup
    await sleep(450);
    chk('mouse-drag-holds-float-until-mouseup', !document.querySelector('.zhupi-float'));
    getSelection().removeAllRanges();
    await sleep(50);
  }

  await pick('镜片随时可以摘掉', '这句放结尾太谦虚了，提到开头', true);
  await pick('const DEBOUNCE_MS = 300;', '300ms 的依据补个注释', false);

  // 长文档必须可滚（#root 高度链断裂那类雷靠这条抓；demo 文档特意长过一屏）。
  // 滚动主体跟着布局模型走：桌面内滚在 .work，窄屏（≤900px）整页滚在 document——
  // 谁在窄窗口跑冒烟，这条不该假红。
  const work = document.querySelector('.work');
  const narrow = matchMedia('(max-width: 900px)').matches;
  const sEl = narrow ? document.scrollingElement : work;
  const sMax = narrow ? innerHeight : (work?.clientHeight ?? 0);
  chk('long-doc-scrollable', Boolean(sEl && sEl.scrollHeight > sMax),
    `narrow=${narrow} scrollH=${sEl?.scrollHeight} viewH=${sMax}`);

  // 两次划批各产出一张卡（含已呈串共 4 张），提交按钮随草稿出现
  const draftCards = document.querySelectorAll('.anno-card:not(.anno-shown)').length;
  chk('draft-cards>=2', draftCards >= 2, `draft-cards=${draftCards}`);
  chk('submit-btn-visible', Boolean(document.querySelector('.btn-submit')));

  // 草稿落进 localStorage（刷新不丢的保证）
  const stored = JSON.parse(localStorage.getItem('zhupi.drafts.999') || '{}')?.items?.length || 0;
  chk('drafts-persisted', stored >= 2, `stored=${stored}`);

  // 锚定精度：fence 内那条必须精确到 DEBOUNCE 所在行（DOC 第 16 行），不是代码块首行
  const fenceDraft = (JSON.parse(localStorage.getItem('zhupi.drafts.999') || '{}')?.items || [])
    .find((d) => d.quote.includes('DEBOUNCE_MS'));
  chk('fence-line-precise', fenceDraft?.line === 16, `line=${fenceDraft?.line} want=16`);

  // M3：已呈批注串 + 回话渲染
  chk('shown-threads>=1', document.querySelectorAll('.anno-shown').length >= 1);
  chk('reply-rendered>=1', document.querySelectorAll('.anno-reply').length >= 1);

  // 展读浮窗：把串从 300px 眉批栏捞出来铺宽。三条退路（掩卷钮 / Esc / 点幕布）各守一条——
  // 关不掉的模态窗是这类功能唯一致命的坏法，所以三条都试，且每条都要真的把 DOM 清干净。
  const expBtn = document.querySelector('#margin-col .anno-shown .anno-expand');
  const expStyle = expBtn && getComputedStyle(expBtn);
  chk('thread-expand-btn-actually-clickable',
    Boolean(expBtn) && expStyle.pointerEvents !== 'none' && expStyle.visibility === 'visible'
    && expBtn.offsetHeight > 0,
    `btn=${Boolean(expBtn)} pe=${expStyle?.pointerEvents} h=${expBtn?.offsetHeight}`);
  const expCardW = expBtn?.closest('.anno-card')?.getBoundingClientRect().width || 0;
  expBtn?.click();
  await sleep(200);
  const tvPanel = document.querySelector('.thread-view');
  chk('thread-view-opens-on-expand', Boolean(tvPanel));
  // 这条是整个功能的判据：浮窗若还是眉批栏那点宽度，等于什么都没做。
  const tvW = tvPanel?.getBoundingClientRect().width || 0;
  chk('thread-view-wider-than-margin-card', tvW > expCardW * 2,
    `panel=${Math.round(tvW)} card=${Math.round(expCardW)}`);
  chk('thread-view-body-rendered',
    (document.querySelector('.thread-view .anno-shown-body')?.textContent || '').trim().length > 0);
  document.querySelector('.thread-view-close')?.click();
  await sleep(200);
  chk('thread-view-close-btn-closes', !document.querySelector('.thread-view'));

  expBtn?.click();
  await sleep(200);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(200);
  chk('thread-view-esc-closes', !document.querySelector('.thread-view'));

  expBtn?.click();
  await sleep(200);
  const tvBack = document.querySelector('.thread-view-backdrop');
  tvBack?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await sleep(200);
  chk('thread-view-backdrop-closes', !document.querySelector('.thread-view'));

  // issue #13：折子说明（PR body 五段）。这折的 body 有「待你拍板」→ 必须默认摊开，
  // 不点任何东西就能读到拍板点。这是本 issue 的全部要害：该被看见的东西不许静默消失。
  const fbToggle = document.querySelector('.folder-body-toggle');
  const fbLabel = (fbToggle?.textContent || '').replace(/\s+/g, ' ').trim();
  chk('body-expanded-by-default-with-decisions',
    Boolean(fbToggle) && fbToggle.getAttribute('aria-expanded') === 'true'
    && Boolean(document.querySelector('.folder-body-text')),
    `label=${fbLabel} aria=${fbToggle?.getAttribute('aria-expanded')}`);
  chk('body-decisions-visible-without-click',
    (document.querySelector('.folder-body-text')?.textContent || '').includes('折首折叠块（B）还是独立 tab（A）'),
    `label=${fbLabel}`);
  // 「回奏对」标记是 HTML 注释，而 markdown-it 在 html:false 下把它**转义成可见文本**，
  // 不剥就是每折正文尾巴上挂一行 `<!-- happy-session: … -->` 给读者看。
  chk('body-session-marker-not-visible',
    !(document.querySelector('.folder-body')?.textContent || '').includes('happy-session'),
    `tail=${(document.querySelector('.folder-body-text')?.textContent || '').slice(-40)}`);
  // 真走 markdown 渲染（与评论正文同一条路），不是 pre-wrap 把 ## 和表格裸露给读者
  chk('body-markdown-rendered',
    Boolean(document.querySelector('.folder-body-text h2')) &&
    Boolean(document.querySelector('.folder-body-text table')),
    `h2=${document.querySelectorAll('.folder-body-text h2').length}`);
  const fbBox = document.querySelector('.folder-body');
  chk('body-block-in-flow-above-doc',
    getComputedStyle(fbBox).position === 'static'
    && fbBox.getBoundingClientRect().bottom <= document.getElementById('doc').getBoundingClientRect().top + 1,
    `pos=${getComputedStyle(fbBox).position}`);
  // 收得回去：折叠钮不是装饰，aria-expanded 要跟着状态走（#5 补的那条无障碍规矩）
  fbToggle?.click();
  await sleep(200);
  chk('body-toggle-collapses',
    !document.querySelector('.folder-body-text')
    && document.querySelector('.folder-body-toggle')?.getAttribute('aria-expanded') === 'false');
  document.querySelector('.folder-body-toggle')?.click();  // 复原，别影响后面的断言
  await sleep(200);

  // F1（摘要卡）：TLDR 那句在折首常显——收起态也在，不必展开就看得见「这折说了什么」。
  chk('folder-body-tldr-always-visible',
    (document.querySelector('.folder-body-tldr')?.textContent || '').includes('PR body 的五段结构化正文此前在门下不可见'),
    `tldr=${(document.querySelector('.folder-body-tldr')?.textContent || 'NONE').slice(0, 30)}`);

  // issue #1：已呈判默认折叠。这块坐在正文之上，全展开就把文档推出首屏，
  // 读者滚不到文档自己的 TL;DR（PR #30 实测 9 条 / 8,132 字 ≈ 2–3 屏）。
  const zpToggle = document.querySelector('.zongpi-shown-toggle');
  const zpLabel = (zpToggle?.textContent || '').replace(/\s+/g, ' ').trim();
  chk('zongpi-collapsed-by-default',
    Boolean(zpToggle) && document.querySelectorAll('.zongpi-shown-item').length === 0,
    `items=${document.querySelectorAll('.zongpi-shown-item').length}`);
  chk('zongpi-toggle-shows-count-and-gist',
    zpLabel.includes('已呈判 · 5') && zpLabel.includes('最新：v4 定稿'), `label=${zpLabel}`);
  // 正文起点必须紧贴判折叠块。量两个盒子之间的距离，而非 viewport 坐标——与当前滚动位置无关。
  // 阈值不用 window.innerHeight：拿视口高当尺子等于白送 80–130px 松弛；也不用 clientHeight
  // （那是「勉强够一屏」，松 700+px，「默认展开最新一条」这种半吊子回归照样能钻过去）——
  // 验收标准是「折叠块只占一行」，钉死 320。
  //
  // **起点从 .work 顶改成判块底（issue #13）**：折子说明块进来之后坐在判之上，且按设计
  // 有拍板点就默认展开，量到 .work 顶会把它的高度算进来，这条断言就变成在管别的事了。
  // 这条要守的一直是「判块不许默认摊开挡住正文」，量它自己的底到正文顶最贴题。
  const workEl = document.querySelector('.work');
  const docBox = document.getElementById('doc');
  const foldBox = document.querySelector('.zongpi-shown');
  const docOffset = foldBox && docBox
    ? docBox.getBoundingClientRect().top - foldBox.getBoundingClientRect().bottom
    : -1;
  chk('doc-starts-right-below-fold', docOffset >= 0 && docOffset < 320,
    `offset=${Math.round(docOffset)} limit=320 workH=${workEl?.clientHeight} vh=${window.innerHeight}`);
  // ↑ 那条改窄之后，「上面所有块加起来不许把正文顶下去」这个**累计预算**就没人守了 —— 而
  // 折子说明块恰恰默认展开、长度由写折方决定。所以把累计那条单独补回来（复审补）：
  // 量 .work 顶到正文顶，语义是「最多趟过一屏就够到正文」。阈值用视口高而不是钉死 320：
  // 说明块按设计要占地方（CSS 封顶 42vh），钉 320 会把合法设计判红；而一屏是 issue #1
  // 那句抱怨（「读者滚不到文档自己的 TL;DR」）的字面含义，超了就是真的又犯了。
  const stackOffset = workEl && docBox
    ? docBox.getBoundingClientRect().top - workEl.getBoundingClientRect().top + workEl.scrollTop
    : -1;
  chk('doc-within-one-screen-of-top', stackOffset >= 0 && stackOffset < window.innerHeight,
    `stack=${Math.round(stackOffset)} limit=${window.innerHeight}`);
  // F13：正文里的【需核实】被渲染成可见标记（虚线 + 角标），且顶栏出「需核实 N」计数。
  // 纯文本层做的——标记里就是 token 本体，没引入任何原始 HTML。
  const vMark = document.querySelector('#doc .verify-marker');
  chk('verify-marker-rendered', Boolean(vMark) && vMark.textContent.includes('需核实'),
    `text=${vMark?.textContent}`);
  chk('verify-count-in-topbar', (document.querySelector('.verify-count')?.textContent || '').includes('需核实'),
    `count=${document.querySelector('.verify-count')?.textContent}`);
  // 「更新到最新版」只在手机「⋯」里：桌面顶栏不摆它（桌面布局不变）
  const updDesk = document.querySelector('.update-app');
  chk('update-button-hidden-on-desktop', Boolean(updDesk) && getComputedStyle(updDesk).display === 'none',
    `display=${updDesk ? getComputedStyle(updDesk).display : 'NO-EL'}`);
  // 封顶必须真的生效：展开态的说明块正文不许超过 42vh（+2px 取整余量）。没有这条，
  // 上面那条累计预算能被一个「刚好这次 fixture 不长」蒙混过去，长 body 上线才炸。
  const fbText = document.querySelector('.folder-body .folder-body-text');
  const fbH = fbText ? fbText.getBoundingClientRect().height : -1;
  chk('folder-body-height-capped', fbText !== null && fbH <= window.innerHeight * 0.42 + 2,
    `h=${Math.round(fbH)} cap=${Math.round(window.innerHeight * 0.42)}`);
  // 判块不许脱离文档流去「假装」不占位（绝对定位/负 margin 能骗过上面那条，但会盖住正文）
  // 判块不许脱离文档流去「假装」不占位（绝对定位/负 margin 能骗过上面那条，但会盖住正文）
  const zpBox = document.querySelector('.zongpi-shown');
  chk('zongpi-in-flow-above-doc',
    getComputedStyle(zpBox).position === 'static' &&
    zpBox.getBoundingClientRect().bottom <= docBox.getBoundingClientRect().top + 1,
    `pos=${getComputedStyle(zpBox).position}`);
  // 程序化 .click() 不做命中测试：按钮可以被 pointer-events:none / 遮挡 / 零高度弄成真人点不开
  const tStyle = getComputedStyle(zpToggle);
  chk('zongpi-toggle-actually-clickable',
    tStyle.pointerEvents !== 'none' && tStyle.visibility === 'visible' && zpToggle.offsetHeight > 0,
    `pe=${tStyle.pointerEvents} vis=${tStyle.visibility} h=${zpToggle.offsetHeight}`);

  // 展开：最新的在最上面 + markdown 真渲染（此前 pre-wrap 把 ## / ** / 表格裸露给读者）
  zpToggle?.click();
  await sleep(200);
  const zpItems = [...document.querySelectorAll('.zongpi-shown-item')];
  chk('zongpi-expands-all', zpItems.length === ZONGPIS.length, `items=${zpItems.length}/${ZONGPIS.length}`);
  chk('zongpi-newest-first', (zpItems[0]?.textContent || '').includes('v4 定稿'),
    `first=${(zpItems[0]?.textContent || '').replace(/\s+/g, ' ').slice(0, 30)}`);
  chk('zongpi-markdown-rendered',
    Boolean(document.querySelector('.zongpi-shown-body h2')) &&
    Boolean(document.querySelector('.zongpi-shown-body table')),
    `h2=${document.querySelectorAll('.zongpi-shown-body h2').length}`);
  // #5：评论正文里的相对路径图片要换成 blob/data URL；没接 hydrate 的话 src 还是 assets/... 必 404
  const zpImg = document.querySelector('.zongpi-shown-body img');
  chk('comment-relative-image-hydrated',
    Boolean(zpImg) && /^(data:|blob:)/.test(zpImg.getAttribute('src') || ''),
    `src=${(zpImg?.getAttribute('src') || 'NO-IMG').slice(0, 24)}`);
  zpToggle?.click();
  await sleep(200);
  chk('zongpi-recollapses', document.querySelectorAll('.zongpi-shown-item').length === 0,
    `items=${document.querySelectorAll('.zongpi-shown-item').length}`);

  // 卡片排序：右缘卡必须按锚点行号递增（草稿与已呈串合并排序，否则串卡被压到天边）
  const tops = [...document.querySelectorAll('#margin-col .anno-card')]
    .map((el) => ({ line: +el.dataset.blockLine || 0, top: parseFloat(el.style.top) || 0 }))
    .filter((x) => x.line);
  chk('margin-cards-present', tops.length >= 4, `n=${tops.length}`); // 防空集假绿：属性没了 every() 恒真
  const sortedByLine = [...tops].sort((a, b) => a.line - b.line);
  chk('margin-cards-ordered', sortedByLine.every((x, i, arr) => i === 0 || x.top >= arr[i - 1].top),
    JSON.stringify(sortedByLine));

  // ⌘Enter 在批注框里只该「存批」，绝不能把整批呈出去（历史阻断级 bug：事件冒泡到全局监听器）
  const editingTa = document.querySelector('.anno-input');
  if (editingTa) {
    editingTa.focus();
    editingTa.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    await sleep(200);
  }
  chk('cmd-enter-in-draft-card-not-submit', !window.__lastReview);

  // 真暴露面：判输入框没有自己的 keydown 处理，⌘Enter 从这里直冲全局监听器
  // （写判写到一半把攒着的 inline 草稿全发出去——第二轮评审点名的第二触发面）
  // 先滚到底再按「判」：这是报障的真实姿势——「看到最底下才想给个总判」。
  // 旧实现在这里用 scrollIntoView 把人拽回卡片所在的开头，读到哪儿全丢了。
  const zpHost = document.querySelector('.work');
  zpHost.scrollTo({ top: zpHost.scrollHeight });
  await sleep(200);
  const zpTopBefore = Math.round(zpHost.scrollTop);
  [...document.querySelectorAll('.btn-ghost')].find((b) => b.textContent.includes('判'))?.click();
  await sleep(400);   // 给足时间：旧实现是 smooth 滚动，短 sleep 会让它假绿
  const zongpiTa = document.querySelector('.zongpi-card .anno-input');
  chk('zongpi-card-open', Boolean(zongpiTa));
  chk('zongpi-open-keeps-reading-position',
    Math.abs(Math.round(zpHost.scrollTop) - zpTopBefore) <= 2,
    `before=${zpTopBefore} after=${Math.round(zpHost.scrollTop)}`);
  if (zongpiTa) {
    const card = document.querySelector('.zongpi-card');
    const cr = card.getBoundingClientRect();
    const col = document.querySelector('#margin-col').getBoundingClientRect();
    chk('zongpi-card-aligned-to-margin-col',
      Math.abs(cr.left - col.left) <= 1 && Math.abs(cr.width - col.width) <= 1,
      `card=${Math.round(cr.left)}/${Math.round(cr.width)} col=${Math.round(col.left)}/${Math.round(col.width)}`);
    // **先钉「看得见」，再钉「不动」**：只验后者是假绿——卡被 layoutCards 写的内联 top
    // 推到视口上方（实测 top=-95）时，它照样「纹丝不动」，断言照样绿，而人什么都看不到。
    chk('zongpi-card-visible-in-viewport',
      cr.top >= 0 && cr.bottom <= innerHeight && cr.width > 0,
      `top=${Math.round(cr.top)} bottom=${Math.round(cr.bottom)} vh=${innerHeight}`);
    // 钉住不动：往回滚半屏，卡在**视口里**的位置必须纹丝不动
    const yBefore = Math.round(cr.top);
    zpHost.scrollTo({ top: Math.max(0, zpHost.scrollTop - 600) });
    await sleep(250);
    chk('zongpi-card-stays-put-while-scrolling',
      Math.abs(Math.round(card.getBoundingClientRect().top) - yBefore) <= 2,
      `y=${yBefore}→${Math.round(card.getBoundingClientRect().top)}`);
    // 压着别的卡时要在上层：普通批注卡不许盖住正在写的这张
    const other = document.querySelector('.anno-card:not(.zongpi-card)');
    chk('zongpi-card-above-other-cards',
      !other || +getComputedStyle(card).zIndex > (+getComputedStyle(other).zIndex || 0),
      `zongpi=${getComputedStyle(card).zIndex} other=${other ? getComputedStyle(other).zIndex : 'none'}`);
  }
  if (zongpiTa) {
    zongpiTa.focus();
    zongpiTa.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
    await sleep(250);
  }
  chk('cmd-enter-in-zongpi-not-submit', !window.__lastReview);
  // 真呈一条判（此前只点「作罢」，createIssueComment 在整套冒烟里一次都没被调用过）：
  // 折叠组默认收起之后，自己刚呈的那条必须自动冒出来——否则就退回「判只能发不能看」的老缺口，
  // 而 ui.js 里那句「重拉：让刚呈的判立刻显示在折首」原本正是为它写的。
  const zpBefore = document.querySelectorAll('.zongpi-shown-item').length;
  if (zongpiTa) {
    zongpiTa.value = '刚呈的这条判必须自己冒出来';
    document.querySelector('.zongpi-card .anno-save')?.click();
    await sleep(500);
  }
  const zpAfter = [...document.querySelectorAll('.zongpi-shown-item')];
  chk('zongpi-auto-opens-after-send', zpBefore === 0 && zpAfter.length === ZONGPIS.length,
    `before=${zpBefore} after=${zpAfter.length} total=${ZONGPIS.length}`);
  chk('zongpi-just-sent-on-top', (zpAfter[0]?.textContent || '').includes('刚呈的这条判'),
    `first=${(zpAfter[0]?.textContent || '').replace(/\s+/g, ' ').slice(0, 24)}`);
  await sleep(150);
  const savedNotes = (JSON.parse(localStorage.getItem('zhupi.drafts.999') || '{}')?.items || [])
    .filter((d) => d.note && d.note.trim()).length;
  chk('cmd-enter-saves-draft', savedNotes >= 2, `notes=${savedNotes}`);

  // rev 切换器（3 个 rev）
  // 搜索：标题filter + 全文命中 + 点击直达段落（跳转闪一下）
  const si = document.querySelector('.search-input');
  chk('search-input-exists', Boolean(si));
  if (si) {
    const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setVal.call(si, '镜片');
    si.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(150);
    si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(500);
  }
  const groups = document.querySelectorAll('.search-group');
  chk('search-hits-found', groups.length >= 1, `groups=${groups.length}`);
  // 点当前折（#999）的正文命中 → 应跳到那一段并闪一下
  const g999 = [...groups].find((g) => g.textContent.includes('#999'));
  const hitBtn = g999 && [...g999.querySelectorAll('.search-hit')].find((b) => b.textContent.includes('第'));
  if (hitBtn) { hitBtn.click(); await sleep(1000); }
  chk('search-jump-flash', Boolean(document.querySelector('#doc .search-flash')));
  // 清掉搜索回到清单
  document.querySelector('.search-clear')?.click();
  await sleep(200);
  chk('search-clear-restores', Boolean(document.querySelector('.list-tabs')));
  // 折号即输即中、跨栏（2026-10-27：书架栏搜 174 只说「标题没有」，而 #174 在待审）。
  // 切到书架栏搜 #999（它在待审）→ 不回车也该列出「其他栏」命中、标明待审，点了切回待审并打开。
  if (si) {
    document.querySelector('.list-tab[data-tab="shelf"]')?.click();
    await sleep(150);
    const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setVal.call(si, '#999');
    si.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(150);
  }
  const elsewhere = document.querySelector('.search-elsewhere [data-elsewhere-tab="open"] .pr-item');
  const elsewhereOk = Boolean(elsewhere) && elsewhere.textContent.includes('#999');
  elsewhere?.click();
  await sleep(300);
  chk('search-pr-number-cross-tab',
    elsewhereOk && Boolean(document.querySelector('.list-tab[data-tab="open"].active')),
    `found=${elsewhereOk}`);
  document.querySelector('.search-clear')?.click();
  await sleep(200);

  // ── 签（按主题归堆，跨状态同架）─────────────────────────────────────
  // demo 里 #999(open) 与 #998(已画可) 共 签:旅行，#997(弘文馆) 挂 签:开发。
  // 卡面 chip：待审清单里 #999 挂着 签:旅行/签:开发，meta 上应画出 .qian-chip。
  const openQianChip = [...document.querySelectorAll('#pr-list .pr-item .qian-chip')]
    .map((c) => c.textContent.trim());
  chk('qian-chip-on-card', openQianChip.includes('旅行'),
    `chips=${openQianChip.join('|') || 'NONE'}`);
  // chip 条：open+merged 并集里出现过的签，各带计数。签:旅行 跨两状态 → 计数应为 2。
  const travelFilter = document.querySelector('.qian-filter[data-qian="旅行"]');
  chk('qian-bar-shows-union-with-count',
    Boolean(travelFilter) && (travelFilter.textContent || '').includes('2'),
    `label=${travelFilter?.textContent?.trim() || 'NONE'}`);
  // 点「旅行」→ 切成按签视图，一屏同列该签下全部折，不分在读/已画可。
  travelFilter?.click();
  await sleep(200);
  const qList = document.querySelector('#pr-list.qian-list');
  chk('qian-view-replaces-tabs',
    Boolean(qList) && !document.querySelector('.list-tabs'),
    `qList=${Boolean(qList)} tabs=${Boolean(document.querySelector('.list-tabs'))}`);
  // **命根**：这一列必须同时含 open 的 #999 与 merged 的 #998（跨状态同架）。
  const qItems = [...document.querySelectorAll('#pr-list.qian-list .pr-item')];
  const qHasOpen = qItems.some((b) => b.textContent.includes('#999') && !b.classList.contains('pr-done'));
  const qHasMerged = qItems.some((b) => b.textContent.includes('#998') && b.classList.contains('pr-done'));
  chk('qian-view-lists-open-and-merged-together', qHasOpen && qHasMerged,
    `n=${qItems.length} open999=${qHasOpen} merged998=${qHasMerged}`);
  // 清除 → 回到原三 tab 视图。
  document.querySelector('.qian-clear')?.click();
  await sleep(200);
  chk('qian-clear-restores-tabs',
    Boolean(document.querySelector('.list-tabs')) && !document.querySelector('#pr-list.qian-list'),
    `tabs=${Boolean(document.querySelector('.list-tabs'))}`);

  // F8 语言切页：双语折出中/EN chip，切换只换语言不离开折；tab 里成对的只列一个
  const tabsNow = [...document.querySelectorAll('.doc-tab')].map((b) => b.textContent.trim());
  // 成对的只出一个 tab，且标签不带语言后缀（语言由 chip 表达）
  chk('lang-tabs-collapsed', tabsNow.length === 2 && !tabsNow.some((t) => t.includes('zh-CN')),
    `tabs=${tabsNow.join('|')}`);
  const guideTab = [...document.querySelectorAll('.doc-tab')].find((b) => b.textContent.includes('guide'));
  if (guideTab) { guideTab.click(); await sleep(600); }
  const chip = document.querySelector('.lang-switch');
  chk('lang-chip-on-bilingual', Boolean(chip));
  chk('lang-default-zh', (document.querySelector('#doc h1')?.textContent || '').includes('指南'),
    `h1=${document.querySelector('#doc h1')?.textContent}`);
  const enBtn = [...document.querySelectorAll('.lang-opt')].find((b) => b.textContent.trim() === 'EN');
  if (enBtn) { enBtn.click(); await sleep(600); }
  chk('lang-switch-to-en', (document.querySelector('#doc h1')?.textContent || '').includes('Guide'),
    `h1=${document.querySelector('#doc h1')?.textContent}`);
  // 切回中文并回到主文档，别影响后面的断言
  [...document.querySelectorAll('.lang-opt')].find((b) => b.textContent.trim() === '中')?.click();
  await sleep(400);
  [...document.querySelectorAll('.doc-tab')].find((b) => b.textContent.includes('demo'))?.click();
  // #2：换文档那一拍——卡片已按新文档重建，正文岛屿还没取回来。此刻卡片必须已经有定位，
  // 否则就是「全塌到容器顶端叠成一坨、等一个网络往返才归位」。取样点必须在 sleep 之前，
  // 等下去就看不见了（demo 的 api 零延迟，真 GitHub 上这个窗口是一整个往返）。
  await Promise.resolve();
  const midTops = [...document.querySelectorAll('#margin-col .anno-card')].map((el) => el.style.top);
  chk('cards-positioned-during-doc-switch',
    midTops.length > 0 && midTops.every((t) => t && t !== 'auto'),
    `n=${midTops.length} tops=${midTops.map((t) => t || 'UNSET').join('|') || 'NONE'}`);
  await sleep(600);

  // 折间链接：本仓链接被拦成 app 内跳转；外链放行不拦
  const links = [...document.querySelectorAll('#doc a[href]')];
  const inner = links.find((a) => a.getAttribute('href').includes('/blob/main/docs/demo.md#L20'));
  const outer = links.find((a) => a.getAttribute('href').includes('slopus/happy'));
  chk('link-samples-rendered', Boolean(inner && outer));
  if (inner) {
    inner.click();
    await sleep(150); // 虚拟时间下 1600ms 的移除定时器会跑到长 sleep 前面——在闪现窗口内断言
    const flashed = document.querySelectorAll('.search-flash').length;
    chk('link-jump-flash', flashed >= 1,
      `flash=${flashed} href=${inner.getAttribute('href')} tab=${document.querySelector('.doc-tab.active')?.textContent || '-'}`);
  }
  if (outer) {
    // 外链必须放行——但真放行就会导航走、页面死掉。做法：在 document 上挂一次性监听器，
    // 它跑在 app 的 .read-row 处理器之后：先读 defaultPrevented（即 app 的决定），再拦下导航。
    let appPrevented = null;
    document.addEventListener('click', function once(e) {
      appPrevented = e.defaultPrevented;
      e.preventDefault();
      document.removeEventListener('click', once);
    });
    outer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(150);
    chk('external-link-not-hijacked', appPrevented === false, `appPrevented=${appPrevented}`);
  }
  // 跨篇锚点（PAIN #86 残账）：点 `别篇.md#节` 切篇后，目标节要闪（＝落到那一节，不是页首）。
  // 换的是真·另一篇（guide.zh-CN.md），落点 h2「落位节」在新篇渲染完那一拍由 jumpRef 滚到。
  // 放在 inner/outer 都消费完之后：这段会切走 #doc 岛屿，早跑会让上面捕获的链接节点脱离文档。
  const crossDoc = [...document.querySelectorAll('#doc a[href]')]
    .find((a) => a.getAttribute('href').includes('guide.zh-CN.md#'));
  if (crossDoc) {
    crossDoc.click();
    await sleep(400);   // 等新篇取文+渲染，再等 jumpRef 那 60ms 定时器把锚滚到位
    const target = [...document.querySelectorAll('#doc h2[id]')].find((h) => (h.textContent || '').includes('落位节'));
    chk('cross-doc-anchor-lands-on-section',
      Boolean(target) && target.classList.contains('search-flash'),
      `switched=${document.querySelector('#doc h1')?.textContent || '-'} target=${target ? target.id : 'MISSING'} flashed=${target ? target.classList.contains('search-flash') : false}`);
    // 复原到 demo 篇，别扰动后面按 demo 正文写的断言
    [...document.querySelectorAll('.doc-tab')].find((b) => b.textContent.includes('demo'))?.click();
    await sleep(400);
  }
  // 引用此处：拷出的 markdown 能被自己解析回来
  const refBtn = [...document.querySelectorAll('.btn-ghost')].find((b) => b.textContent.includes('引用此处'));
  chk('copy-ref-btn-exists', Boolean(refBtn));

  // 归档视图：已画可的折子有地方看，且点进去是只读
  const doneTab = [...document.querySelectorAll('.list-tab')].find((b) => b.textContent.includes('已画可'));
  chk('archive-tab-exists', Boolean(doneTab), doneTab?.textContent?.trim());
  if (doneTab) {
    doneTab.click(); await sleep(200);
    chk('archive-has-items', document.querySelectorAll('#pr-list .pr-item').length >= 1);
    document.querySelector('#pr-list .pr-item')?.click();
    await sleep(800);
    chk('archive-readonly-no-qinci', !document.querySelector('.btn-qinci'));
    chk('archive-readonly-notice', (document.querySelector('.rev-notice')?.textContent || '').includes('归档'));
    // issue #13 的条件展开另一半：归档折的 body 是手开的散文（无五段），认不出拍板点 ⇒ 默认收起。
    // 逐折重算的证据也在这条里——上一折是展开态，切过来必须自己变回收起。
    const fbArc = document.querySelector('.folder-body-toggle');
    chk('archive-body-collapsed-without-decisions',
      Boolean(fbArc) && fbArc.getAttribute('aria-expanded') === 'false'
      && !document.querySelector('.folder-body-text'),
      `aria=${fbArc?.getAttribute('aria-expanded')}`);
    // 归档折上划句不该出浮批钮
    const blk = [...document.querySelectorAll('#doc [data-line]')]
      .find((x) => x.textContent.trim().length > 4);
    if (blk) {
      const r = document.createRange(); r.selectNodeContents(blk);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.getElementById('doc').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await sleep(200);
    }
    chk('archive-float-suppressed', !document.querySelector('.zhupi-float'));
    // 切回待审继续后面的断言。
    // 用 data-tab 不用文字：这行原来是 textContent.includes('待批')（旧词），2026-08-02 把词表漏网的
    // 「待批」（旧词）改成定稿词「待审」时，find 静默返回 undefined —— 没点、没报错，后面 6 条断言
    //（摘要卡 + 整条 submit 管线）连锁塌掉，看起来像提交管线坏了。裸字符串当跨层契约就是这样：
    // 改了不报错，只是什么都不做。选择器一律锚在不上屏的属性上。
    const openTab = document.querySelector('.list-tab[data-tab="open"]');
    if (!openTab) chk('list-tab-open-selector', false, '找不到 [data-tab="open"]——选择器与渲染脱钩了');
    openTab?.click();
    await sleep(200);
    // F1（摘要卡）：待审清单里，带五段 body 的折要出摘要行——一句 TLDR gist + 拍板角标，
    // 不点进去就看得出「这折干了什么、要不要你拍板」。归档折（BODY_FREEFORM 无 TLDR）不出摘要行。
    const openSummary = document.querySelector('#pr-list .pr-item .pr-summary');
    chk('list-summary-tldr-and-decisions',
      Boolean(openSummary)
      && (openSummary.querySelector('.pr-tldr')?.textContent || '').includes('本折把它渲染到折首')
      && (openSummary.querySelector('.pr-decisions')?.textContent || '').includes('待你拍板'),
      `summary=${(openSummary?.textContent || 'NONE').replace(/\s+/g, ' ').slice(0, 40)}`);
    document.querySelector('#pr-list .pr-item')?.click();
    await sleep(900);
  }

  chk('rev-switcher-3-opts', document.querySelectorAll('.rev-opt').length === 3,
    `opts=${document.querySelectorAll('.rev-opt').length}`);

  // &norev=1：停在 head 态供截图
  if (new URLSearchParams(location.search).get('norev') === '1') {
    console.log(`[smoke] RESULT pass=${pass} fail=${fail}`);
    return;
  }

  // 切到 v1（最旧）：正文变短（DOC_OLD 删了一节）+ 旧版只读（划句不出浮批钮）
  const headLen = (docEl?.textContent || '').length;
  document.querySelector('.rev-opt')?.click(); // 升序，首个 = v1
  await sleep(600); // 等岛屿 effect 重新取文并注入
  const oldLen = (docEl?.textContent || '').length;
  chk('old-rev-body-shorter', oldLen < headLen, `${oldLen} < ${headLen}`);
  chk('old-rev-notice-shown', Boolean(document.querySelector('.rev-notice')));

  const b = [...docEl.querySelectorAll('[data-line]')].find((x) => x.textContent.trim().length > 4);
  if (b) {
    const r = document.createRange(); r.selectNodeContents(b);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    docEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await sleep(150);
  }
  chk('old-rev-float-suppressed', !document.querySelector('.zhupi-float'));
  const submitBtn = document.querySelector('.btn-submit');
  chk('old-rev-submit-disabled', !submitBtn || submitBtn.disabled);

  // 旧版下走键盘路径也必须被挡（按钮 disabled 挡不住 ⌘Enter 直呼 submitAll）
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
  await sleep(200);
  chk('old-rev-cmd-enter-blocked', !window.__lastReview);

  // 切回 head 后真点一次「提交涂归」——覆盖提交管线最后一公里：
  // hunk gate 装配 / commit_id / 行号集合 / 成功后清草稿
  const opts = [...document.querySelectorAll('.rev-opt')];
  opts[opts.length - 1]?.click();
  await sleep(600);
  document.querySelector('.btn-submit')?.click();
  await sleep(500);
  const sent = window.__lastReview;
  chk('submit-fired', Boolean(sent));
  const lines = (sent?.payload?.comments || []).map((c) => c.line).sort((a, b) => a - b);
  chk('submit-line-set', JSON.stringify(lines) === '[16,20]', `lines=${JSON.stringify(lines)}`);
  chk('submit-commit-id', sent?.payload?.commitId === 'demo0000', `commitId=${sent?.payload?.commitId}`);
  chk('submit-body-nonempty', Boolean(sent?.payload?.body));
  const leftover = JSON.parse(localStorage.getItem('zhupi.drafts.999') || '{}')?.items?.length ?? -1;
  chk('drafts-cleared-after-submit', leftover === 0, `leftover=${leftover}`);

  // ── 空草稿死锁（2026-08-05 报障，放在提交之后跑：那时草稿已清空，是干净起点）──
  // 原话：「第二个的那个评论我没加东西，不让我提交。然后我想过去加东西，结果点不开那个评论栏了」。
  // 划句建了草稿却没写字就去划下一句 ⇒ 空草稿留在原地 ⇒ 它退出编辑态后画的 `.anno-note` 内容为空
  // ⇒ 高 0px ⇒ 点不着；作罢钮只在编辑态里 ⇒ 删不掉；呈回闸门拦「空批注不呈」 ⇒ 交不上。三头堵死。
  // 两层各钉一条：① 焦点切走时空草稿自己收掉；② 存量空草稿仍留得住手（占位撑起可点的靶子）。
  await pick('镜片随时可以摘掉', '', false);                 // 建了不写
  chk('empty-draft-starts-editing', Boolean(document.querySelector('.anno-input')));
  await pick('const DEBOUNCE_MS = 300;', '改去写这句', true);  // 焦点切到新草稿
  const afterSwitch = JSON.parse(localStorage.getItem('zhupi.drafts.999') || '{}')?.items || [];
  chk('empty-draft-dropped-on-switch',
    afterSwitch.length === 1 && afterSwitch[0].note === '改去写这句',
    `left=${JSON.stringify(afterSwitch.map((d) => d.note))}`);

  // 存量退路：把一条空草稿塞回 storage 再开折（模拟修复前已经卡在那儿的），它必须仍是实体靶子。
  // 判据用 offsetHeight 而不是「元素在不在」——病根正是元素在、但高度为 0。
  if (afterSwitch.length) {
    localStorage.setItem('zhupi.drafts.999',
      JSON.stringify({ items: [{ ...afterSwitch[0], id: 'stuck', note: '' }] }));
    document.querySelector('#pr-list .pr-item')?.click();
    await sleep(700);
    const stuck = document.querySelector('.anno-note-empty');
    chk('stale-empty-draft-still-clickable',
      Boolean(stuck) && stuck.offsetHeight > 0 && getComputedStyle(stuck).pointerEvents !== 'none',
      `el=${Boolean(stuck)} h=${stuck?.offsetHeight}`);
    stuck?.click();
    await sleep(200);
    chk('stale-empty-draft-opens-editor', Boolean(document.querySelector('.anno-input')));
  }

  // ── 页内锚点 + 顶底悬浮钮（PAIN 2026-08-05 #86：「？？？ 选项呢 原来在下面」）──
  // **必须放最后**：这一段会把版心滚到底，早跑会掀翻前面那批量位置的断言
  // （doc-starts-right-below-fold / cards-positioned-during-doc-switch 都读 scrollTop）。
  const dEl = document.getElementById('doc');
  const allHash = [...dEl.querySelectorAll('a[href^="#"]')];
  const bareHash = allHash.find((a) => a.getAttribute('href') === '#');
  const anchors = allHash.filter((a) => a.getAttribute('href') !== '#');
  const head = [...dEl.querySelectorAll('h2[id]')].find((h) => h.id === '加长段冒烟用别删');
  chk('anchor-heading-has-github-slug', Boolean(head),
    `ids=${[...dEl.querySelectorAll('[id]')].map((h) => h.id).join('|') || 'NONE'}`);
  chk('anchor-links-rendered', anchors.length === 3, `n=${anchors.length}`);
  if (head && anchors.length === 3) {
    anchors[0].click();
    await sleep(150);   // 闪现只留 1600ms，虚拟时间下别用长 sleep（同 link-jump-flash）
    chk('anchor-click-flashes-heading', head.classList.contains('search-flash'));
    // 地址栏不许挂 hash：它是深链的载体，多一截就把「拷直达链」拷脏了
    chk('anchor-click-keeps-url-clean', !location.hash, `hash=${location.hash}`);

    head.classList.remove('search-flash');   // 不清就是假绿——上一条留下的 class 还挂着
    anchors[1].click();
    await sleep(150);
    chk('anchor-loose-frag-matches', head.classList.contains('search-flash'));

    anchors[2].click();
    await sleep(150);
    const notices = [...document.querySelectorAll('.notice')].map((n) => n.textContent);
    chk('anchor-miss-says-so-not-silent', notices.some((t) => t.includes('根本没有这一节')),
      `notices=${notices.join('|') || 'NONE'}`);

    // 折首说明里的锚也要拦（它在 .read-row **之外**）。不拦就走浏览器原生跳转：
    // 不闪、不过三级放宽，还往地址栏挂 hash 把「拷直达链」拷脏。
    head.classList.remove('search-flash');
    const bodyAnchor = document.querySelector('.folder-body a[href^="#"]')
      || [...document.querySelectorAll('a[href^="#"]')].find((x) => !dEl.contains(x));
    chk('folder-body-anchor-rendered', Boolean(bodyAnchor));
    if (bodyAnchor) {
      bodyAnchor.click();
      await sleep(150);
      chk('anchor-in-folder-body-intercepted',
        head.classList.contains('search-flash') && !location.hash, `hash=${location.hash}`);
    }
  }

  // 光秃秃一个 `#`＝「回到顶部」的老写法。拦了却不办事就是个按不动的死钮
  // （双查第二轮抓到，是第一轮修复亲手造的），所以这条钉的是「真的回到了顶」。
  const host0 = document.querySelector('.work');
  chk('bare-hash-link-rendered', Boolean(bareHash));
  if (bareHash) {
    host0.scrollTo({ top: 800 });
    await sleep(120);
    bareHash.click();
    await sleep(200);
    chk('bare-hash-scrolls-to-top', host0.scrollTop === 0, `top=${host0.scrollTop}`);
  }

  // ── 裸锚点剥离（PAIN #102）：正文里的 <a id="…"> 不该冒出转义乱码 ──
  // html:false 会把 raw HTML 转义成可见文本；剥掉后正文里既无这段文字、DOM 里也无该 id。
  chk('bare-anchor-not-shown-as-text', !dEl.textContent.includes('demo-bare-anchor'),
    `leaked=${dEl.textContent.includes('demo-bare-anchor')}`);
  chk('bare-anchor-stripped-from-dom', !dEl.querySelector('#demo-bare-anchor'));

  // ── diff 渲染（PAIN #46）：```diff 围栏里 +/- / @@ 行各自上色 ──
  const diffBlock = dEl.querySelector('.diff-block');
  chk('diff-block-rendered', Boolean(diffBlock));
  if (diffBlock) {
    chk('diff-add-line-colored', Boolean(diffBlock.querySelector('.diff-add')));
    chk('diff-del-line-colored', Boolean(diffBlock.querySelector('.diff-del')));
    chk('diff-hunk-header-marked', Boolean(diffBlock.querySelector('.diff-hunk')));
    // +/- 行真有可视区分：新增行背景与上下文行背景不同（着色落到了屏幕上，不只是 class）
    const add = diffBlock.querySelector('.diff-add');
    const ctx = diffBlock.querySelector('.diff-ctx');
    const bgDiffer = add && ctx && getComputedStyle(add).backgroundColor !== getComputedStyle(ctx).backgroundColor;
    chk('diff-add-visually-tinted', Boolean(bgDiffer),
      `add=${add ? getComputedStyle(add).backgroundColor : 'none'} ctx=${ctx ? getComputedStyle(ctx).backgroundColor : 'none'}`);
  } else {
    chk('diff-add-line-colored', false, 'no block');
    chk('diff-del-line-colored', false, 'no block');
    chk('diff-hunk-header-marked', false, 'no block');
    chk('diff-add-visually-tinted', false, 'no block');
  }


  const ends = () => [...document.querySelectorAll('.scroll-end')];
  chk('scroll-ends-rendered', ends().length === 2, `n=${ends().length}`);
  // **位置就是这个部件的成败**：上一版摆在视口右下角、离正文 623px，他一百来折都没找着。
  // 钉死「贴着正文左缘」：右边缘要在正文左边、且不许远过 120px（远了就等于又回到角落里）。
  if (ends().length === 2) {
    const rail = document.querySelector('.scroll-ends').getBoundingClientRect();
    const art = document.getElementById('doc').getBoundingClientRect();
    const gap = Math.round(art.left - rail.right);
    chk('scroll-ends-hug-the-text', gap >= 0 && gap <= 60,
      `箭头右缘=${Math.round(rail.right)} 正文左缘=${Math.round(art.left)} 间距=${gap}`);
    // 固定在视口里，不随正文滚
    const yBefore = Math.round(rail.top);
    document.querySelector('.work').scrollTo({ top: 400 });
    await sleep(200);
    chk('scroll-ends-stay-put-while-scrolling',
      Math.abs(Math.round(document.querySelector('.scroll-ends').getBoundingClientRect().top) - yBefore) <= 2,
      `y=${yBefore}→${Math.round(document.querySelector('.scroll-ends').getBoundingClientRect().top)}`);
  }
  if (ends().length === 2) {
    const host = document.querySelector('.work');
    ends()[1].click();                        // ↓ 到底
    await sleep(250);
    const max = host.scrollHeight - host.clientHeight;
    chk('scroll-end-jumps-to-bottom', host.scrollTop >= max - 8, `top=${host.scrollTop} max=${max}`);
    ends()[0].click();                        // ↑ 回顶
    await sleep(250);
    chk('scroll-end-jumps-to-top', host.scrollTop === 0, `top=${host.scrollTop}`);
  }

  // ── 通读（连续读整本，PAIN #31②）：多章折一次拼全书，只读，切回分章能复原 ──
  // demo 折有 2 篇可见章（demo.md + guide 双语合并），够验通读四条不变量。放在末尾：
  // 通读会切走 #doc 岛屿，早跑会扰动上面按单篇写的断言。
  const rtToggle = document.querySelector('.read-through-toggle');
  chk('read-through-toggle-present', Boolean(rtToggle),
    `chapters-visible=${[...document.querySelectorAll('.doc-tab')].length}`);
  if (rtToggle) {
    const wantN = 2;   // demo.md + guide（zh 默认，成对只算一章）
    rtToggle.click();               // 进通读：把全书各章顺序拼进 #doc
    await sleep(700);               // 各章并行取文 + 逐段渲染
    const secs = [...document.querySelectorAll('#doc .chapter-section')];
    chk('read-through-renders-all-chapters',
      secs.length === wantN && secs.every((s) => (s.querySelector('.chapter-body')?.textContent || '').trim().length > 0),
      `sections=${secs.length} want=${wantN} bodies=${secs.map((s) => (s.querySelector('.chapter-body')?.textContent || '').trim().length).join('|')}`);
    chk('read-through-has-chapter-dividers',
      document.querySelectorAll('#doc .chapter-divider').length === wantN,
      `dividers=${document.querySelectorAll('#doc .chapter-divider').length} want=${wantN}`);
    chk('read-through-shows-readonly-hint', Boolean(document.querySelector('.read-through-hint')));
    // 只读闸：通读态选字不许冒浮批钮（涂归锚在单篇行号上，拼本后会错段）
    const rtRange = rangeFor('迁移到 Preact 之后');   // 该句在 demo.md 段里，通读态仍在 #doc 中
    if (rtRange) {
      document.dispatchEvent(new Event('touchstart', { bubbles: true }));
      getSelection().removeAllRanges();
      getSelection().addRange(rtRange);
      await sleep(450);   // 过 250ms 防抖窗口，分章态本会出钮
      chk('read-through-blocks-annotation', !document.querySelector('.zhupi-float'),
        `float=${Boolean(document.querySelector('.zhupi-float'))}`);
      getSelection().removeAllRanges();
      await sleep(100);
    } else {
      chk('read-through-blocks-annotation', false, 'probe-range-missing');
    }
    // 切回分章：#doc 回到单篇，通读的 section 全清（涂归可用性随之恢复）
    document.querySelector('.read-through-toggle')?.click();
    await sleep(700);
    chk('read-through-off-restores-single-view',
      document.querySelectorAll('#doc .chapter-section').length === 0
        && (document.querySelector('#doc')?.textContent || '').trim().length > 0,
      `sections=${document.querySelectorAll('#doc .chapter-section').length} docLen=${(document.querySelector('#doc')?.textContent || '').trim().length}`);
  }

  // ── 手机底栏（M0 · review #121 §5）：读折时 DOM 里常驻，桌面宽度下 display:none ──
  // 冒烟跑在 1440px（桌面分支），验不了它在手机上的版式，但能钉死两条不变量：
  // ①读折时它在 DOM 里、带得动「判」这个入口；②桌面上绝不冒出来（≥1940 章栏死区的反面，
  // 同一类「某宽度区间该显/该隐没做对」的病，用同样手段守）。手机真实版式靠窄口冒烟另跑。
  const mbar = document.querySelector('.mobile-bar');
  chk('mobile-bar-rendered-in-dom', Boolean(mbar));
  chk('mobile-bar-has-zongpi', Boolean(mbar?.querySelector('.mobile-bar-btn')));
  chk('mobile-bar-hidden-on-desktop', Boolean(mbar) && getComputedStyle(mbar).display === 'none',
    `display=${mbar ? getComputedStyle(mbar).display : 'NO-EL'}`);

  // ── F16 总览（review #61 T2）：点「总览」把待审折按项目摊开，画出谁等谁/谁盖了谁 ──
  // 开→断言→关，别把读折区一直藏着（后面的画可断言要它在）。EXTRA_OPEN 里备了活样本：
  // 两个项目分组、一条「等你拍」、#994 被已画可的 #990 盖成僵尸、#992 needs=#995 的关系条。
  const dashBtn = document.querySelector('.dash-btn');
  chk('dash-button-present', Boolean(dashBtn));
  if (dashBtn) {
    dashBtn.click();
    await sleep(300);
    const dash = document.querySelector('.dash');
    chk('dash-opens', Boolean(dash));
    chk('dash-hides-reading-area', Boolean(document.querySelector('.work.work-hidden')));
    const groups = document.querySelectorAll('.dash-group');
    chk('dash-groups-by-project', groups.length >= 2, `groups=${groups.length}`);
    chk('dash-marks-zombie', Boolean(document.querySelector('.dash-row.zombie')));
    chk('dash-draws-relations', document.querySelectorAll('.rel-chip').length >= 1,
      `chips=${document.querySelectorAll('.rel-chip').length}`);
    // 关掉总览，读折区回来（onClose）
    document.querySelector('.dash .dash-close, .dash-top button')?.click();
    await sleep(250);
    chk('dash-closes-back-to-reading', !document.querySelector('.dash') && !document.querySelector('.work.work-hidden'));
  } else {
    chk('dash-opens', false, 'no btn');
    chk('dash-hides-reading-area', false, 'no btn');
    chk('dash-groups-by-project', false, 'no btn');
    chk('dash-marks-zombie', false, 'no btn');
    chk('dash-draws-relations', false, 'no btn');
    chk('dash-closes-back-to-reading', false, 'no btn');
  }

  // ── 画可之后不跳折（2026-08-05 报障，放在最后跑：它把当前折变成归档态，后面没法再批）──
  // 原话：「画可以后别跳下一个没看的可以不……有时候我想复制什么内容回去」。
  // 病根：qinci() 里 setCur(null) 把 loadPRs 那句 `!R.current.cur` 守卫架空了，于是每次画可
  // 都自动顶开待审队首——人被拽走，正要复制的正文也没了。画可是「结束一件事」，不是
  // 「开始下一件事」，中间得有个他自己踩的踏板。四条钉死：折不换、正文还在、就地转只读、
  // 下一折只做提示不自动跳。
  window.confirm = () => true;   // headless 默认 dismiss 掉 confirm，不劫持的话画可根本发不出去
  const beforeNo = document.querySelector('.crumb-no')?.textContent;
  document.querySelector('.btn-qinci')?.click();
  await sleep(900);
  const afterNo = document.querySelector('.crumb-no')?.textContent;
  chk('merge-stays-on-folder', Boolean(beforeNo) && afterNo === beforeNo, `before=${beforeNo} after=${afterNo}`);
  chk('merge-doc-still-rendered', Boolean(document.querySelector('.stage-main article h1')));
  chk('merge-turns-readonly', !document.querySelector('.btn-qinci'));
  chk('merge-offers-next-not-jumps', Boolean(document.querySelector('.notice-next')));

  console.log(`[smoke] RESULT pass=${pass} fail=${fail}`);
}

// ?demo=1&rail=1：左栏拖宽（run-browser.sh 用 1920px 窗宽跑这一支）。
//
// 为什么必须在真浏览器里验、单元测试不够：夹逼的上限来自 CSS 自己的版心算式（--stage
// + 2×--work-pad，见 rail.js 文件头），rail.js 只收一个量好的数字。**那个数量得对不对，
// 只有让浏览器真去解析 calc() 才知道**——JS 侧把式子抄错了，纯逻辑测试照样全绿。
//
// 顺序照手机档的教训：先确认手柄真的可见，再拖。对着一个 display:none 的元素派发
// pointer 事件不会报错，只会静默什么都不发生，于是断言可以全绿而功能根本没上。
// ?demo=1&mm=1：mermaid 沙箱渲图（#188 M1）。单独一支而不并进主冒烟：渲染在跨进程的沙箱 iframe 里，
// 它的真实耗时不推进 virtual-time，所以要放宽超时（ui.js 在 DEMO 下给 30s）并给足轮询。
// 好图 → figure>img[blob:] 且行号锚不变；坏图 → 保留源码围栏 + 错误行；iframe 的 sandbox 恰为 allow-scripts。
if (new URLSearchParams(location.search).get('mm') === '1') {
  setTimeout(async () => {
    let pass = 0, fail = 0;
    const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`[mm] ${c ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 300 && !(document.querySelector('.mermaid-fig') && document.querySelector('.mermaid-err')); i++) await sleep(100);
    const f = document.querySelector('iframe[title="menxia-sandbox"]');
    const { mermaidState } = await import('./mermaid.js');
    console.log(`[mm] DIAG loaded=${mermaidState.loaded} sent=${mermaidState.sent} replied=${mermaidState.replied} frame=${Boolean(f)} figs=${document.querySelectorAll('.mermaid-fig').length} pres=${document.querySelectorAll('pre > code.language-mermaid').length} errs=${[...document.querySelectorAll('.mermaid-err')].map((x) => x.textContent.slice(0, 80)).join('|')}`);
    const img = document.querySelector('figure.mermaid-fig img');
    chk('mermaid-rendered-as-figure-img', Boolean(img) && (img.getAttribute('src') || '').startsWith('blob:'),
      `src=${img ? (img.getAttribute('src') || '').slice(0, 20) : 'none'}`);
    const fence = DOC.split('\n').findIndex((l) => l.startsWith('```mermaid')) + 1;
    const fig = document.querySelector('figure.mermaid-fig');
    chk('mermaid-figure-keeps-data-line', Boolean(fig) && fig.getAttribute('data-line') === String(fence),
      `fig=${fig ? fig.getAttribute('data-line') : 'none'} fence=${fence}`);
    chk('mermaid-bad-fence-keeps-source-with-error',
      Boolean(document.querySelector('pre > code.language-mermaid')) && Boolean(document.querySelector('.mermaid-err')));
    chk('mermaid-iframe-sandbox-exactly-allow-scripts', Boolean(f) && f.getAttribute('sandbox') === 'allow-scripts',
      `sandbox=${f ? f.getAttribute('sandbox') : 'none'}`);
    console.log(`[mm] RESULT pass=${pass} fail=${fail}`);
  }, 1500);
}

const RAIL = new URLSearchParams(location.search).get('rail');
if (RAIL === '1') {
  setTimeout(async () => {
    let pass = 0, fail = 0;
    const chk = (n, c, d = '') => { c ? pass++ : fail++; console.log(`[rail] ${c ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const railW = () => Math.round(document.querySelector('aside').getBoundingClientRect().width);
    // 一次完整的拖：按下 → 移动 → 松手。事件派发在 window 上，与 ui.js 的装配一致。
    const drag = async (dx) => {
      const grip = document.querySelector('.rail-grip');
      const x0 = grip.getBoundingClientRect().left + 3;
      grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0, pointerId: 1, bubbles: true, cancelable: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + dx, pointerId: 1, bubbles: true }));
      await sleep(60);   // 移动是按帧节流提交的，等一帧
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: x0 + dx, pointerId: 1, bubbles: true }));
      await sleep(60);
    };

    try { localStorage.removeItem('zhupi.railWidth'); } catch { /* 无痕模式 */ }

    const grip = document.querySelector('.rail-grip');
    chk('grip-visible-on-desktop', Boolean(grip) && getComputedStyle(grip).display !== 'none',
      `display=${grip ? getComputedStyle(grip).display : 'NO-EL'}`);

    // 上限由浏览器解析 CSS 算式得出，这里复算一遍喂断言——与 ui.js 走同一个探针，
    // 所以这条也顺带守住「探针还在、还是那个宽度」。
    const probe = document.querySelector('.geom-probe');
    const free = probe ? window.innerWidth - probe.offsetWidth : NaN;
    chk('probe-measures-stage-box', Number.isFinite(free) && free > 300,
      `innerWidth=${window.innerWidth} probe=${probe ? probe.offsetWidth : 'NO-EL'} free=${free}`);
    // 2026-10-11 起空隙吃完向版心借：正文压到 480、大纲压到 200（cols.js 的两个 min）
    const artEl = document.getElementById('doc'); const tocEl = document.querySelector('.toc');
    const art0 = artEl ? artEl.getBoundingClientRect().width : 0;
    const toc0 = tocEl ? tocEl.getBoundingClientRect().width : 0;
    const ceil = Math.round(free + Math.max(0, art0 - 480) + Math.max(0, toc0 - 200));

    const before = railW();
    await drag(120);
    chk('drag-widens', railW() > before, `${before} → ${railW()}`);

    await drag(2000);
    const wide = railW();
    chk('drag-stops-at-ceiling', Math.abs(wide - ceil) <= 2, `width=${wide} ceil=${ceil} free=${free}`);
    // 回归（「左边栏不能拉」）：上限必须能越过「窗宽 − 版心盒」，版心让位而不是冻住左栏
    chk('drag-past-free-space', wide > free + 100, `width=${wide} free=${free}`);
    chk('stage-yields-to-rail', artEl && Math.round(artEl.getBoundingClientRect().width) === 480,
      `art=${artEl ? artEl.getBoundingClientRect().width : 'NO-EL'}`);
    // 真正要守的东西：拖到极限也不许把版式挤到横向溢出（style.css 记过 1660–1709 那次实伤）
    chk('no-horizontal-overflow', document.documentElement.scrollWidth <= window.innerWidth + 1,
      `scrollWidth=${document.documentElement.scrollWidth} innerWidth=${window.innerWidth}`);

    await drag(-4000);
    chk('drag-stops-at-min', railW() === 240, `width=${railW()}`);

    let stored = null;
    try { stored = localStorage.getItem('zhupi.railWidth'); } catch { /* 无痕模式 */ }
    chk('persists-on-release', stored === '240', `stored=${stored}`);

    // 双击归位：存量值删掉，宽度交还 CSS 的响应式默认（这一档是 300）
    document.querySelector('.rail-grip').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(60);
    let cleared = 'x';
    try { cleared = localStorage.getItem('zhupi.railWidth'); } catch { /* 无痕模式 */ }
    chk('dblclick-resets', cleared === null && railW() === 300, `stored=${cleared} width=${railW()}`);
    try { localStorage.removeItem('zhupi.artWidth'); localStorage.removeItem('zhupi.tocWidth'); } catch { /* 无痕模式 */ }

    console.log(`[rail] RESULT pass=${pass} fail=${fail}`);
  }, 1200);
}
