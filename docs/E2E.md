# 浏览器 E2E：网页阅读器对真 staging 门下服务

`test/run-e2e.sh` 加 `test/e2e/{cdp,run}.mjs`，零依赖：系统里的 headless Chrome 加原生 CDP（Node 内置 `WebSocket`/`fetch`），不装 Puppeteer/Playwright。
服务端钩子契约见 menxia-service `docs/E2E-STAGING.md`（`/__test/*`，staging 专用，需要 `TEST_HOOKS=1` 加 Bearer 两道门槛，否则返回 404）。
正文链接的产品行为见 [`docs/DOC-LINKS.md`](DOC-LINKS.md)。

## 怎么跑

只能经 Hermes 的包装脚本运行，由它把 staging 地址和钩子 Bearer 注入成环境变量（`MENXIA_E2E_URL` / `MENXIA_E2E_TOKEN`）：

```bash
/Users/charliezong/Developer/op/tools/menxia-web-e2e.sh <本仓 worktree> test/run-e2e.sh            # 全部
/Users/charliezong/Developer/op/tools/menxia-web-e2e.sh <本仓 worktree> test/run-e2e.sh annotate,approve   # 指定用例
```

- 本仓脚本**不读** token 文件、**不打印** token（输出里出现会被替换成 `<token>`）。
- `run.mjs` 只在 `MENXIA_E2E_URL` 恰好是 `https://menxia-service-staging.menxia-service.workers.dev` 时才跑，否则直接拒跑，因为用例会 reset 数据。
- 退出码：0 全过；1 有失败；3 没有失败但有 PENDING（依赖的 staging 钩子没上线返回 404，**不算通过**）。
- 输出逐行为 `[e2e] PASS|FAIL|PENDING <用例> — 细节`，最后一行是 `[e2e] RESULT pass= fail= pending=`。FAIL 会附带页面现场（地址、题签、提示条、被拦下的 `window.open`）。
- 页面用 `?service=staging` 打开：服务地址覆盖只认白名单名字，token 存在 `menxia.svc.auth.staging`，和正式 token 的 key 分开（见 `src/service-api.js`）。

## 用例与断言

每个用例开始前先 `POST /__test/reset {email}` 清空测试用户 `e2e-reader@menxia.test` 的折（钩子只接受 `@menxia.test` 邮箱）。
建折用 `POST /__test/review`，返回 `201 { review_id, revision_no, web_url, warnings }`。拿不到合法的 `review_id` 时当场报错。
除 login 外，各用例都用 `POST /__test/token` 签发的同一用户 token，预先写进 localStorage，跳过 OAuth。服务端读回也用这个 token 调 `/api/v1`。

| 用例 | 做什么 | 断言 |
|---|---|---|
| `probe-hooks` | 探测钩子 | 不带 Bearer 时 `/__test/token` 返回 404；带 Bearer 时 reset/token/review 返回 2xx。新钩子 404 记为 PENDING |
| `login` | 网页点「登录」→ staging `/login` 填邮箱 → 从 `/__test/mail/latest` 取魔法链接 → 确认或同意 → 回到网页 | 回到本站（不是 `oauth.html`），`menxia.svc.auth.staging` 已写入，正式 key `menxia.svc.auth` 仍为空，离开设置页 |
| `open-folder` | 建一折 → 清单 → 打开 | 清单出现这一折的标题，正文渲染出暗号 `OPEN-OK` |
| `external-link` | 正文里的 Amazon 链接，真鼠标点击 | `window.open('https://www.amazon.com/dp/B07GZ98PKL', '_blank', 'noopener')`，当前页地址不变，没有弹出浮批钮。外网请求在 CDP 网络层直接掐断，不真的出网 |
| `internal-link` | A 折正文里有 `[目标折](<staging>/r/<B 的 review_id>)`，真鼠标点击 | 页内出现 B 的暗号 `TARGET-OK`，`window.open` 调用 0 次，origin 仍是本站，地址栏 `pr` 变成 B 的 id |
| `annotate` | 划选一句 → 浮批钮 → 写批注 → 存 → 呈出 | 15 秒内 `GET /api/v1/reviews/{A}/comments?limit=100` 里出现这条批注原文 |
| `approve` | 点画可（有判框就确认）| 15 秒内 `GET /api/v1/reviews/{A}` 的 `status === 'approved'`（枚举见 openapi：open / changes_requested / approved / rejected / withdrawn）|

## 为什么不进 CI

1. **要机密**：钩子 Bearer 是 staging 机密，只经本机包装脚本注入，不放进 GitHub Actions。
2. **会改共享状态**：每个用例都会 reset 并在 staging 上建折、写评论、画可，并发跑会互相清掉对方的数据。
3. **依赖外部服务**：staging 部署、魔法链接邮件 sink、网络任一环节出问题都会失败，和本仓改动无关。CI 必须稳定，所以 CI 只跑 `node --test` 和 `bash test/run-browser.sh`（demo mock）。

它的定位是「推 TF 或发布前，由 Hermes 在本机跑的门禁」。`test/run.sh` 默认不跑它。
`node --test` 的默认匹配会把 `test/e2e/run.mjs` 收进去，所以文件开头见到 `NODE_TEST_CONTEXT` 就直接 `exit 0` 跳过。

## 踩过的坑（2026-11-27）

- **`/r/undefined` 和「服务端读不到评论或画可」是同一个原因**：测试读 `/__test/review` 返回的 `rv_id || id`，实际字段是 `review_id`，于是 id 成了 `undefined`。内链被写成 `/r/undefined`，产品按设计把它当外链在新标签打开；读回打的是 `/reviews/undefined`，结果 404。网页本身已经正确写进 staging。已核对：网页的写请求全部走 `API_BASE`，它由 `SERVICE_URL` 派生，跟随覆盖；仓里正式地址只剩 `PROD_SERVICE_URL` 常量这一处（加上 CSP 白名单和 demo 正文），不存在把测试数据写进正式服务的路径。
- **偶发「清单出现不了」或「点不到 .svc-login」**：原来的 `cdp.mjs goto` 在 `Page.navigate` 之后立刻查 `readyState`，可能读到旧文档的 `complete` 而提前返回，随后写 localStorage 的时机就错了。改成等这一次导航自己的 `Page.loadEventFired`。
