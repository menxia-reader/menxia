# 版本对比 · 可能过时 · 提示浮层（网页端）

来由：Charlie 2026-11-23 批准给门下加三件事，网页与 App 一致实现。服务端字段由 menxia-service 另一 PR 同步加；
客户端**必须兼容字段缺失**（见各节「缺字段时」）。

契约（以 `menxia-service/protocol/openapi.yaml` 为准）：
- 清单项与详情新增 `current_revision_at`（ISO，当前版本创建时间）；缺失时退回 `updated_at`。
- 详情 `revisions[]`（每版带 `documents[{path, sha256}]`）与 `current_revision.documents`。
- 版本正文：`GET /api/v1/reviews/{id}/revisions/{n}/content/{path}`（已有 `getFileText(path, "<id>@<n>")`）。

## 1. 版本对比页（diff）

**入口**：「⋯」菜单「对比版本」（默认上一版 → 当前版）；「更新」状态条 done 时加「看改了什么」（v(N-1) → vN）。
题签行约定只露 判 / 呈 / 可 / ⋯（topbar.js 头注），所以入口放菜单，不在题签行再加一颗。
只在门下服务数据源（能力探测 `can('listRevisions')`）且 `svc.revision_no ≥ 2` 时出现；GitHub 源不做（那边已有 GitHub 自己的 diff）。

**URL**：`?pr=<id>&diff=<a>..<b>`。开对比页 / 切版本时 `replaceState` 写进去，关掉删掉；开机时 `parseDiffParam` 认一次，
在深链开折之后套上（`openPR` 会清 diff，所以必须在它之后）。demo 模式下只同步 `diff` 这一项（保留 `?demo=1…`）。
URL 里的版本号不存在 → 回落到上一版 → 当前版。

**算法**（`src/diff.js`，纯函数）：
- 文档级 `docChanges`：按 path 配对；`sha256` 相同 → 「未改」，**不拉正文**；缺 sha 不敢说没改，当「修改」。
- 行级 `lineRows`：剥公共前后缀后对中段做 LCS 动态规划。中段 n×m 超过 `MAX_CELLS`(4e6) 时整段当「删了再加」——宁粗不卡。
  不用 Myers：markdown 文档剥完前后缀中段通常很短，DP 更好读、好测。
- 字符级 `charDiff`：一个改动块里删、加两行按位置配对，按 Unicode 码点（`Array.from`）切——中文一字一格、emoji 不劈开。
  公共字符占比 < `CHAR_MIN_COMMON`(0.3) 不做字符级（整行都换了，满屏高亮反而看不清）。
- 折叠 `foldRows`：未改连续段在改动上下各留 `FOLD_CONTEXT`(3) 行，至少藏 `FOLD_MIN_HIDDEN`(4) 行才折；文首/文末只留挨着改动的一头。点「展开 N 行未改动」就地展开。

**界面**（`src/components/diff-view.js`）：渲在读折区的位置，读折区用 `.work-hidden` 藏起（同总览手法，保住 `#doc` 岛屿，回正文不重渲）。
**只读**：不挂划选、不出浮批钮、没有输入框。颜色：删除浅红底、新增浅绿底，改动的字再深一档；正文仍是墨色（不把字染红/绿）。
附件不比（只比 `documents`）。新增 / 删除的文档只标类别，不展开全文。

## 2. 「可能过时」标记

`src/stale.js`：`STALE_DAYS = 21`（常量，改这一处即可）。`current_revision_at`（缺 → `updated_at`）距今 ≥ 21 天、
且状态不是 `withdrawn` → 「N 周未更新」（N = floor(天/7)）。看的是**版本**时间，不是最后活动：有新评论但版本没动，仍算过时。

- 显示位置：清单行 meta 里、题签面包屑标题后。灰色细框小字（`--ink-soft`），**不用朱砂**——不是错误，是提醒。
- 点标签 = 打开「更新」小框（复用 D-19 的 `RefreshAsk` 流程，见 REFRESH-BUTTON.md）；清单行上点会先开那一折。
  清单卡本身是 `<button>`，标签用 `span[role=button]`（不能嵌 button），点它 `stopPropagation`。
- 只在门下服务数据源显示：GitHub 源的 pr 没有 `svc` → 0；且只有能发起更新（`can('requestRefresh')`，题签处另需非 withdrawn/有权限）时才挂，否则点了没去处。

## 3. 提示条浮层

「门下有 N 条新动态」「已刷新」等临时提示（`notice`）原先在题签下占一行文档流，出现/消失把正文往下推又弹回。
现在放进常驻的 `.notice-layer`（`height: 0; position: relative`），条子在里面 `position: absolute` 浮在正文上方，
左右与题签行同一条式子对齐版心。因为会盖住正文，桌面也露 ✕ 关闭钮。手机档仍是原来贴底栏的 fixed 浮条（同权重选择器、≤900 块后写者胜）。
常驻横幅（新版可用 `.stale-banner`）与「更新」状态条不是临时提示，留在文档流里。

## 测试

- 单测 `test/diff.test.js`（+13）：LCS / 超限降级、中文字符级、emoji、整行替换不高亮、CRLF、折叠与边界、sha 相同标未改、URL 参数、过时判定（阈值边界 / withdrawn / 无 svc / 退回 updated_at）。
- svc 冒烟（`SVC_EXPECT` 54 → 74，+20）：
  - ②a 过时：清单与题签「4 周未更新」、颜色与面包屑同灰、点标签开「更新」小框（取消，不发请求）；⑤a 里 agent 推新版后标签消失。
  - ②d 浮层：`__say` 放一条提示 → `position:absolute`、视口第一行正文 top 前后不变；提示消失后仍不变（`svc-toast-no-shift` / `svc-toast-gone-no-shift`）。
  - ⑤a 对比：⋯「对比版本」→ 默认 2..3、URL `diff=2..3`；v3 与 v2 同 sha → 「未改」且 0 次正文请求；切 v1 → URL `1..3`、附录「删除」、
    行级新增 >5 行、字符级只高亮「看到这/就 → 见此/即」、红绿底 + 墨色字、折叠可展开、无输入框、关闭后 URL 去掉 diff、正文回来。
- 演示假服务端（`src/demo-service.js`）：两版放在 40/30 天前；v1 多一篇 `docs/附录.md`、末行措辞不同；sha 按正文散列。

## 未做 / 留给后续

- 刷新保持靠开机解析 `?diff=`（单测覆盖 `parseDiffParam`），浏览器里「整页刷新后仍在对比页」没有单独冒烟。
- App 端由另一 PR 实现，本文是网页侧；两端口径以本文与服务端 openapi 为准。
