# 「更新」按钮（门下服务 D-19）

来由：Charlie——「有个按钮『更新』，派个任务去更新这个折子，因为可能过了几周就不新鲜了」。
服务端：menxia-service #41（D-19）。契约以 `menxia-service/protocol/openapi.yaml`（tag `refresh`）
和 `docs/CLIENT-MAPPING.md`「更新」一行为准。

## 接口（service-api.js）

| 函数 | 请求 | 说明 |
|---|---|---|
| `requestRefresh(id, note?)` | `POST /reviews/{id}/refresh-requests {note?}` | note 去首尾空白、截 1000；空就发 `{}`。201 新建 / 200 已有 queued·running 那条，都原样返回。409 `review_closed` →「这折已撤回，不能更新」；403 →「只有拍板人能发起更新」 |
| `latestRefresh(id)` | `GET /reviews/{id}/refresh-requests` | 取 `items[0]`（服务端按 created_at 倒序），没有就 null |
| `toPR(detail).svc.refresh` | 详情 `refresh` 字段 | 最新一条或 null；清单项没这字段时是 `undefined`（＝不知道，别覆盖） |

store.js 转发这两个函数；GitHub driver 没有 → `has('requestRefresh')` 为 false → 按钮不出现。

## 界面决定

- **位置：「⋯」菜单第一项。** 题签行约定只露 判 / 呈 / 可 / ⋯（topbar.js 头注），再加一颗会挤，手机档尤甚；
  放菜单第一项是打开菜单第一眼看到的。真正需要「显眼」的是**结果**——状态条直接挂在题签下方，不藏。
- **何时显示按钮**：只在门下服务数据源（能力探测，不看 BACKEND 字符串）；`status === 'withdrawn'` 隐藏（服务端也会 409）；
  `is_decider === false && is_owner === false` 隐藏（服务端 403）。已画可 / 已关的折**照样显示**——放了几周的正是这些，
  done 后服务端把它们拉回 open。
- **小框**：点「更新」弹一个纸色小框，一行可选的「要更新什么」（占位：比如价格再核一遍），确认 / 取消；Esc 取消。
  不用 `prompt()`：要能放占位提示和中文按钮，且冒烟里可控。
- **状态条**（题签下方，`.refresh-bar`）：
  - queued →「更新：排队中」；running →「更新：更新中…」；这两态按钮禁用、写「更新中…」。
  - done →「已更新到第 N 版」。正在读的版本比 N 旧时带「刷新看新版」（重拉清单、重开这折到 head）；
    已在新版时带「知道了」。
  - failed →「没更新成：原因」+「重试」（用上次的 note 再发一次）。
- **done 不常驻**：详情的 `refresh` 永远是最新一条，几周前的 done 若每次开折都挂一条就成噪音。规则（`refreshBarState`）：
  done 只在「本次会话亲眼看着它变的」（live：自己刚点的，或事件推来的）或「正在读的版本 < N」时显示。
  failed 一直显示（是没解决的事，可重试）。
- **不新增轮询**：状态随现有事件刷新（`pollEvents` 那一轮）走——本折收到 `refresh.requested` / `refresh.updated`
  就 `latestRefresh` 一次。done 时同一轮还会有 `revision.created`，原逻辑已经会把当前折切到新 head 并提示。
  同一折重开时保留 live（换折清空），所以切到新版后条子仍在。
- 重复点：按钮在 queued/running 时禁用；即便两台设备同时点，服务端幂等回同一条。

## 演示 / 测试

- `src/demo-service.js`：假服务端实现 GET/POST `refresh-requests`（幂等、withdrawn 409、非拍板人 403、
  note ≤1000），详情带 `refresh`；`advanceRefresh(status)` 模拟画可执行器 PATCH（done 先推新 revision，
  approved/rejected 回到 open，发 `refresh.updated` 等事件）。
- svc 冒烟 ⑥a（+9 条，SVC_EXPECT 45→54）：已画可的折 → ⋯「更新」→ 小框填一句 → 排队中、按钮禁用 →
  再请求一次回同一条 → running → done → 「已更新到第 4 版」、折回到 open 且重开到 v4。
  ⑥b 因此多等一步「已关 1」计数再找卡（否则会误抓待审清单里的同名卡）。
- 单测：service-api.test.js +6（请求装配 / 错误文案 / latest / toPR / store 转发），components.test.js +3（状态条与按钮）。
