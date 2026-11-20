# 已关栏 + 离线判永久失败退回判框（2026-11-19）

任务 t-20261119-220644-a63e。分支 `feat/closed-and-outbox`。

## 1. 侧栏「已关」

**问题**：被关（GitHub closed 未 merged；门下 rejected / withdrawn）的折，待审、已画可、读毕书架三栏都不收，开过之后再也找不回来。

**做法**：清单 tab 行加第四个 tab「已关」（`data-tab="closed"`），样式沿用读毕书架那颗安静 tab（`list-tab-shelf`）。

- 数据：`listClosedPRs()`，GitHub = `pulls?state=closed` 里 `!merged_at`；门下 = `/reviews?status=rejected,withdrawn`。store 转发一条。
- **点开才取**（`ui.js loadClosed`），每次点重取一次；不进开机请求。所以 tab 在取到之前不带数字，只显示「已关」，清单显示「正在取已关的折…」。
- 只读：打开后 `closed_at` 让 `archived` 为真，画可 / 涂归入口照旧关掉（不新增判断）。卡面 meta 显示「关于 X 前」，不挂体例角标。
- 不进签集、跨栏搜索（`hitsElsewhere`）和总览：已关的折不是在办的事，混进去是噪音。

**为什么选 tab 而不是书架里的筛选**：书架的语义是「已画可的读物」，往里塞「被拒的」会把这个语义搅浑；tab 行本来就是按状态分栏，第四栏是最小、最好找的改法。

## 2. 离线待发：永久失败不再无限重试

**问题**：outbox 补发失败一律 `tries+1` 留队，4xx（必答没答、折已删、没权限）重试永远失败，「待发 N 条」永远挂着，他打的字也回不来。升级前入队、没有 `answers` 的老项补发吃服务端必答校验 400，同样卡死。

**判据**（`offline.isPermanentFailure`）：有数字 status 且 4xx 即永久，除了：

| 情况 | 处理 | 理由 |
|---|---|---|
| 无 status（断网）、5xx | 留队重试 | 网络 / 服务端暂时问题 |
| 401 | 留队重试 | 钥匙或登录过期，重新登录后能发 |
| 408、429 | 留队重试 | 超时、限流 |
| 409 `stale_revision` | 留队重试 | 已有处理：补发带 `staleAsComment`，服务端退成整单评论，正常不会抛到这里 |

**永久失败的项**：标 `dead: { status, message }`，**留在 IDB 里不删**（不丢字）。`flushOutbox` 跳过 dead 项，「待发 N 条」不数它。

**退回判框**：打开（或 flush 完正看着）那折时，`restoreDead` 取该折最新的 dead 项，打开判框，判文本和答题（`answersToForm` 把 `[{question_id, option_ids|text}]` 还原成判框的作答表）原样填回，提示「没发出去：<原因>，改一下再判」。判框已经开着就不动，免得冲掉手上的字。

**出库时机**：发出成功、改完又断网重新入队、或点「放弃」，三种都把那条 dead 项删掉。点顶栏「判」关掉判框不算放弃，下次开这折还会退回来。

## 验证

- `test/offline.test.js` 新增 4 条：判据表、dead 标记且不再重试、缺 answers 的老项吃 400 后标 dead、`deadItemFor` / `answersToForm`。
- `[svc]` 冒烟新增 2 条（`svc-closed-tab-lists-rejected`、`svc-closed-open-readonly`），期望数 36→38。
- 退回判框这条 UI 路径**没有浏览器端到端测试**：demo 模式整个跳过 IDB / outbox（`if (DEMO) return`），要测得先给 demo 开一个假 IDB 口子。
