# 短划选与逐条失败（网页客户端）

2026-11-26 报障：Charlie 在门下服务数据源划了「竞品」两个字，评论「推荐点竞品我来试用一下」。呈递时整批 400：`comments.0.anchor.quote: quote must contain at least 3 non-whitespace characters`，草稿都还在，但其余涂归也一条没呈上。根因在服务端（按 JS length 要求 ≥3，对中文不合理；一条不合格整批失败）。三端按同一契约各自改，本文是网页这一端的部分。服务端的决定见 menxia-service `docs/DECISIONS.md`。

## 契约（三端一致）

- **C1 服务端最小长度**（按码点、去空白计）：含任一 CJK 字符（汉字/假名/谚文）→ ≥1；带 prefix 或 suffix（任一非空）→ ≥1；否则 ≥3。
- **C2 唯一性**：短 quote 多处出现由 prefix/suffix/line 消歧，消歧后仍并列报 anchor ambiguous。
- **C3 批量语义**（服务端 D-22）：仍整批原子，400 的 `details.errors[]` 列出**所有**不合格条（每项 `{index, field, reason, message, document_path?, quote?}`，`reason` 含 `ambiguous` / `not_found` 等；顶层 `field`/`index` 仍是第一条）。网页同时认 `items[]`（同义）和旧服务端只有顶层单条的形状。
- **C4 客户端**：划选总带 prefix/suffix（各 ≤64 字符原文上下文）；ASCII 太短在划选时提示。

## 网页怎么做

### C4 划选时

- `computeAnchor`（`src/anchor.js`）在所在块的渲染文本里取划选两侧各 ≤64 字符做 `prefix`/`suffix`（压空白、不跨块），并按 C1 同判据算 `tooShort`。判据是 `quoteTooShort`，demo 假服务端也用它，两边不会各写一份。
- 草稿存 `prefix`/`suffix`。老草稿没有的，呈递时按当前渲染的块补（`contextForDraft`），块已不在就留空。
- `batchPayload`（`src/service-api.js`）把非空的 prefix/suffix 放进 anchor（截到 64），空的不发字段。
- 点「批」时 `tooShort`（纯 ASCII、<3 非空白、两侧也没上下文，例如整块就只有 `OK`）→ 当场提示「划选太短」，不建草稿。实际上因为总带上下文，这种情况只剩「块里只有这么几个字」。不做自动扩选：块里没有更多字可扩。

### C3 收到逐条 400

`submitAll`（`src/ui.js`）：

1. 第一次整批呈。
2. 400 且能拆（`splitBatchFailure`：`details.items[]`，兼容 `errors[]` 和旧服务端的单条 `{field, index}`；field 只认 `comments.<i>.anchor` 及子字段，body 之类不认）：
   - 不合格的草稿写入 `failReason`（落盘，刷新还在），卡片标红并显示原因；顶栏问询条标出第一条，照旧给「改成整折评论再呈 / 取消」（`docs/ANCHOR-FAIL-UX.md`）。
   - 其余条目（含并入判的旧版本草稿）**立即重呈一次**。成功只清呈上的草稿，不合格的留着；重呈再失败按整批失败报错，草稿一条不动。
   - 全部不合格才整体报错，不发第二次请求。
3. 「改成整折评论」会清掉该条的 `failReason`。

GitHub 数据源不变（`byQuote` 为假时不走拆分）。

### demo 假服务端

`src/demo-service.js` 的 `/comments/batch` 按 C1 判长度、按原文判找得到，收集所有不合格条后一次 400（`details` 顶层留第一条兼容旧客户端，`items` 是全集）。冒烟 ③b：三条草稿（一条锚得上、一条跨链接找不到、一条两个汉字的短划选「镜片」）→ 两条自动重呈落库，短划选带了上下文，跨链接那条留作标红草稿，点「改成整折评论」只重发它。

## 未做

- **CJK 单字划选仍不出浮钮。** `computeAnchor` 原有「<2 字符不出浮钮」的防误点闸会改 golden（`test/golden/expected/**`，原生端一致性依据）。放开需要跑 `node test/golden/export.mjs` 重生、更新 `docs/ANCHOR-SPEC.md` 并通知原生端跟进，单独做。两个字以上（「竞品」）不受影响。
- C2 的消歧在服务端，网页只负责把上下文送过去、把 ambiguous 当普通逐条失败显示。
- 解析以 menxia-service 实现为准：优先 `items[]`，其次 `errors[]`，再次顶层单条；每项展示文案取 `message`，没有才用 `reason`（机器码，如 `ambiguous`）。未对线上服务端做过联调，仅有 demo 假服务端与单测覆盖。

## 测试

- `test/anchor.test.js`：`quoteTooShort`（竞品/假名/谚文/ASCII/码点）、`contextAround`/`draftContext`（「竞品」多处出现按 offset 取对那处）、`anchorFailures` 逐条形状、`splitBatchFailure`。
- `test/service-api.test.js`：payload 带 prefix/suffix（截 64、空不发）、逐条 400 文案。
- 浏览器 svc 冒烟 ③b（`svc-anchorfail-*`）。
