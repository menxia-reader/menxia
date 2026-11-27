# 正文链接：外链与门下内链（DOC-LINKS）

来源：2026-11-27 Charlie「点门下里的 link，弹不出 link 来」（复现折 `rv_01M8FDABTXWH7XW1823WXHT7KH`）。
相关：浏览器真服务 E2E 见 [`docs/E2E.md`](E2E.md)；代码 `src/link.js`（`parseFolderLink` / `isExternalHttp`）、`src/ui.js`（`onAnchorClick`）。

## 行为

网页阅读器里，正文、折首说明、判、批注串中的 `<a href>` 统一在 `.work` 层的 `onAnchorClick` 处理：

| 链接 | 例子 | 行为 |
|---|---|---|
| 门下服务短链 | `https://<门下服务>/r/rv_<26位>` | **当前页内**开那一折（`jumpTo`），地址栏变成 `?pr=rv_…` |
| 网页直达链 | `https://menxia-reader.github.io/menxia/?pr=rv_…&path=…&line=…`，或当前站点的 `?pr=` | 同上，带 path/line 时精确到文档与行 |
| 认得是门下链接、但清单里没有这一折（无权限 / 别的仓 / 已删） | — | 新标签打开（`noopener`），不死链 |
| 其余绝对 http(s) 外链 | `https://www.amazon.com/dp/…` | 新标签打开（`window.open(href, '_blank', 'noopener')`），当前页**不**导航 |
| `#锚点`、相对文档链接、本仓 GitHub permalink | — | 维持原有处理（锚点滚动 / `resolveRelativeDocLink` / `parseZhupiLink`） |
| 按着 ⌘/Ctrl/Shift/Alt 或中键 | — | 不拦，交给浏览器（读者本来就想开新标签） |

### 为什么外链要新标签

以前外链让当前页导航走：读者被带离门下，未呈的涂归草稿和阅读位置都没了。对读者来说就是「点了弹不出来」。

### 怎么判断是「本服务实例」

`parseFolderLink(href, { serviceOrigins, appUrls })`：
- `serviceOrigins = [PROD_SERVICE_URL, SERVICE_URL]`：正式服务，加上**当前生效的**服务地址。用 `?service=staging` 覆盖时（见 E2E.md）`SERVICE_URL` 就是 staging，所以 staging 主机的 `/r/rv_…` 也算内链；不覆盖时 staging 链接按外链处理（不会被正式实例误认）。
- `appUrls = [当前页 origin+目录, PUBLIC_APP_URL]`：按 origin 加目录比较，`index.html` 和目录根视为同一个地址。
- 短链路径必须严格匹配 `/r/rv_[0-9A-Z]{26}`（与 openapi 的 review_id pattern 相同）。`/r/undefined` 这类不合法 id 一律当外链处理。

### 为什么挂在 `.work` 而不是只挂正文的 onDocClick

折首说明、判和批注串里的链接也要同样处理。正文链接先经过 `onDocClick`：相对链接和本仓 permalink 在那里已经 `preventDefault`。冒泡到 `.work` 时先看 `defaultPrevented`，两条路不会抢同一次点击。

## 测试

- 纯逻辑：`test/doc-links.test.js`（`node --test`）。覆盖短链和直达链识别、staging 只在覆盖生效时才认、外链判定、`?service=` 白名单与落盘。
- demo 冒烟：`bash test/run-browser.sh`，演示折里放了一条外链和两条门下内链。
- 真服务：`docs/E2E.md` 的 `external-link`、`internal-link` 两个用例（真鼠标点击，staging 真数据）。
