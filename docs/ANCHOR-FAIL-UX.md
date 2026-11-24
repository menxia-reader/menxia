# 锚点 400：文案与降级（2026-11-23）

## 报障

Charlie 2026-11-23 21:3x：「涂归草稿没呈出去……GitHub 返回 400：invalid_argument：comments[0].anchor.quote not found in the document at the current revision。……已经切到门下服务了，但他还是给我 400」。

两件事：

1. **文案撒谎**：数据源是门下服务，提示却说「GitHub 返回」（那句出自 App `Menxia/GitHubClient.swift`；网页端同类问题是限流提示写死「GitHub 限流」，以及 `ApiError` 消息只有 `400 invalid_argument — …`、看不出是谁返回的）。
2. **整批失败了事**：门下 `createCommentsBatch` 原子，一条引文找不到全批 400；网页只报一行错，他手里的 N 条草稿全卡住，没有出路。

## 根因（已核实，代码层）

- 网页取引文：`src/anchor.js` `selectionAnchor` 用 `selection.toString()`——**渲染后纯文本**。
- 服务端校验：`menxia-service src/lib/anchor.ts` `relocateAnchor` 在 **markdown 原文**里找，只做精确匹配 + 空白规范化匹配。
- 所以划选只要跨了行内 markdown（`**粗体**`、`[链接](url)`、`` `代码` ``……），渲染文本「一句话结论：…」在原文「**一句话结论**：…」里就找不到 → `unanchored` → 400。今天新呈的两折正文满是粗体、链接、列表，正中。
- 坐标系不一致的修复在服务端（并行任务：把渲染文本映射回原文 / 在去掉行内标记的视图上匹配）。本端只做下面两件。

## 决定

### a) 文案点名数据源

- 门下 driver 的 `ApiError` 消息统一为 `门下服务返回 <status>：<code>：<message>`（`src/service-api.js`）。所有出错路径（呈出、画可、判、关、留、更新、对比、拉清单……）都是 `S.xxx.failed(err.message)`，改一处全覆盖。
- 限流：门下数据源用 `S.list.rateLimitedSvc`（「碰到门下服务限流」）；GitHub 模式文案不变。
- GitHub driver（`src/github.js`）一字不动。

### b) 锚点 400 不整批失败了事

- 识别（`src/anchor.js` `anchorFailure`，纯函数）：`status 400` + `code invalid_argument` + `details.field` 以 `.anchor.quote` 结尾 + `details.index` 是整数。服务端新加的 `details.quote` / `details.document_path` 有则带上、缺则空串，**不依赖**——引文以本机草稿为准。
- `index` 是请求体 `comments[]` 的下标。`submitAll` 组批时 inline 项按草稿序排、带 `draftId`，降级整单那条永远追加在最后，所以 `inline[index]` 就是出事的草稿。
- 界面：顶栏下出一条问询条（与「更新」小框同款 `.refresh-bar`），写「第 n 条的引文在门下当前版本里找不到」+ 该条引文；右缘那张草稿卡标红（`.anno-failed`）。两条路：
  - **改成整折评论再呈**：只给那条草稿打 `whole: true`（落盘，刷新不丢），整批重发；`batchPayload` 把 whole 项发成 `{ anchor: null, body: "> 引文\n\n批注" }`，**原位不挪**，其余条照常带锚点。
  - **取消**：问询条收起，草稿一条不动，他可以自己改划选。
- 草稿只在服务端 2xx 之后才清（沿用 `submitAll` 原有次序）。重发若又有别的条 400，同样再问一次。
- 只在门下数据源（`anchorsByQuote`）启用；GitHub 模式走 hunk 校验，没有这类 400。
- 「判框」：任务里说「判框里标出」，网页实现为顶栏下的问询条 + 草稿卡标红，没有塞进判卡（判卡是整折判语输入框，和涂归批不是一回事；塞进去会和判/画可的答题流程搅在一起）。

### c) 本端构造 quote 的方式——不动

- 确认是渲染后纯文本（见根因）。
- 能廉价附上的只有：`line`（已在发，块的源行号）和 prefix/suffix。但 prefix/suffix 只在「quote 找得到且出现多次」时消歧，**救不了「quote 本身在原文里找不到」**；而把渲染选区精确映射回 markdown 源偏移需要一套反向渲染映射，不廉价。所以本端不改，交服务端在匹配侧解决。

## 验证

- 单测：`test/anchor.test.js`（anchorFailure 认/不认的边界）、`test/service-api.test.js`（错误文案、whole 的请求体）。
- svc 冒烟（`src/demo-service.js` ③b）：假服务端按真服务端同判据在 markdown 原文里找引文；划两条，第 2 条跨链接 → 400 → 问询条标出第 2 条与引文、卡片标红、草稿仍 2 条且没落库 → 点「改成整折评论再呈」→ 第二批成功（第 1 条带锚点，第 2 条 anchor null、正文 `> 引文\n\n批注`）→ 草稿清空。
