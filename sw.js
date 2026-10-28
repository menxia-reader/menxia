// 门下 Service Worker —— M2 离线包的应用壳缓存层。
//
// ⚠️ 头号红线：这个站是「push main 即部署」，SW 绝不能把活站钉死。
// 所以策略是**应用壳一律 network-first**：网络成功就用新版并刷进缓存，只有网络失败才落缓存。
// cache-first 会让手机上永远跑着旧代码、推了新版看不见——那正是这个站不能有的病。
//
// 三道保险（越往下越硬）：
//   1. network-first 本身：只要有网，永远是最新代码。
//   2. 版本号 SW_VERSION：应用壳更新就手动 +1 → activate 时把不叫这个名字的旧 cache 全清掉。
//   3. kill-switch：远端可拨的总闸（见下 KILL_SWITCH_URL）。拨了之后 SW 自杀 + 清所有缓存，
//      整站退回「没有 SW」的裸状态。拨法见本文件末尾与 README「离线包 · kill-switch」。
//
// 什么进壳缓存、什么不进：
//   - 进：HTML / JS / CSS / vendored 依赖（同源、GET、非 API）。这些是「应用壳」。
//   - 不进：api.github.com 的任何请求（含 Authorization 响应）。正文数据走 IndexedDB
//     （src/offline.js），凭据绝不落 Cache。SW 里直接对 api.github.com 放行不拦。
//
// 本文件刻意把「策略判定」写成纯函数（swVersion / cacheName / shouldHandle / isAppShell），
// 由 test/sw.test.js 在 node 里直接 import 测——事件装配在文件底部，测试不触发它。

// 版本号：**改任何应用壳文件后，把这里 +1**。它决定 cache 名，换名即让旧缓存在 activate 被清。
// 与 ui.js 的 detectNewBuild 是两套独立机制（那个提示「有新版，点刷新」；这个管离线壳的失效），
// 故意不耦合：detectNewBuild 依赖网络回源，SW 版本管的恰恰是没网时给谁。
export const SW_VERSION = 'v6';

// cache 名带版本。同源多部署（GitHub Pages 只有一个源）下够用；换名 = 旧缓存 activate 即弃。
export const cacheName = (version = SW_VERSION) => `menxia-shell-${version}`;

// kill-switch：站点根下一个可拨的标志文件。壳侧（sw-register.js）与 SW 都读它；
// 内容含 `"kill": true` 就触发自毁。放在 Pages 上、push 即改，无需动 SW 代码。
// 相对 './' 跟随部署路径（/menxia/）。
//
// ⚠️ 本文件作为**模块 worker** 注册（sw-register.js 里 type:'module'）：只有这样 export
// 才合法——classic worker 里出现 export 会「script evaluation failed」（2026-08-13 在线实测）。
// export 是为了让 test/sw.test.js 在 node 里直接测下面这些纯策略函数。
// 与壳侧常量 src/sw-register-const.js 逐字同步，有一条测试钉死两处一致。
export const KILL_SWITCH_URL = './menxia-sw-kill.json';

// 只处理「本站同源 + GET + 不是 API」的请求。其余（api.github.com、POST/PATCH、跨源）一律放行不拦，
// 保证凭据响应绝不进 Cache、写操作绝不被 SW 截。
export function shouldHandle(request, selfOrigin) {
  if (request.method !== 'GET') return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  if (url.origin !== selfOrigin) return false;                 // 跨源（api.github.com 等）不碰
  if (url.hostname === 'api.github.com') return false;          // 双保险
  return true;
}

// 应用壳判定：同源 GET 里，document / script / style / 以及 vendored 依赖算壳。
// 用 destination（浏览器给的语义）优先，回退看扩展名——headless / 老浏览器 destination 可能为空。
export function isAppShell(request) {
  const dest = request.destination;
  if (dest === 'document' || dest === 'script' || dest === 'style') return true;
  const path = (() => { try { return new URL(request.url).pathname; } catch { return ''; } })();
  return /\.(html?|m?js|css)$/i.test(path) || path.endsWith('/') || path === '';
}

// network-first 的「network」必须真回源：裸 fetch(request) 走默认缓存模式，Pages 发 max-age=600、
// 模块 URL 又无版本号 → 部署后 10 分钟内 SW 拿到的「网络」其实是 HTTP 缓存里的旧壳（2026-10-09 真机
// 「没啥变化」）。一律 no-cache：带 ETag 回源校验，没变只回 304，不多花流量。页面自己要 reload 的照旧。
export const networkCacheMode = (request) => (request.cache === 'reload' ? 'reload' : 'no-cache');

// —— 以下是事件装配。只在真正的 SW 全局（有 self.addEventListener）里运行；
//    node 测试 import 本文件时，typeof self 为 'undefined'，整段跳过。——

/* c8 ignore start */
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && self.registration) {
  // 新 SW 一装好立刻接管，别等所有旧标签页关掉——离线场景下用户不会去关标签。
  self.addEventListener('install', () => self.skipWaiting());

  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      // 先看总闸：拨了就自毁，别接管任何请求。
      if (await killed()) { await selfDestruct(); return; }
      // 清掉所有不叫当前版本名的旧 shell cache。
      const keep = cacheName();
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('menxia-shell-') && n !== keep).map((n) => caches.delete(n)));
      await self.clients.claim();
    })());
  });

  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (!shouldHandle(req, self.location.origin)) return;      // API / 写操作 / 跨源：交给浏览器，SW 不插手
    if (!isAppShell(req)) return;                              // 非壳资源（图片等）也不缓存，避免污染
    event.respondWith(networkFirst(req));
  });

  // 壳侧拨闸后可发消息让在跑的 SW 立刻自毁（不必等下次 activate）。
  self.addEventListener('message', (event) => {
    if (event.data === 'menxia-sw-kill') event.waitUntil(selfDestruct());
  });

  // network-first：网络成功 → 用它 + 顺手刷缓存；失败 → 落缓存；都没有 → 让错误照常抛。
  async function networkFirst(request) {
    const cache = await caches.open(cacheName());
    try {
      const fresh = await fetch(request, { cache: networkCacheMode(request) });
      // 只缓存成功的完整响应（opaque/206 不缓存，避免存半截或存不了的）。
      if (fresh && fresh.ok && fresh.type === 'basic') cache.put(request, fresh.clone());
      return fresh;
    } catch (err) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw err;                                               // 没网又没缓存：如实失败，不假装成功
    }
  }

  async function killed() {
    try {
      const res = await fetch(KILL_SWITCH_URL, { cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return data && data.kill === true;
    } catch { return false; }                                  // 拉不到（含离线）就当没拨，别误自毁
  }

  async function selfDestruct() {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('menxia-shell-')).map((n) => caches.delete(n)));
    await self.registration.unregister();
  }
}
/* c8 ignore stop */
