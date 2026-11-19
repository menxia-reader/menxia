// 门下 M2 离线包 —— 正文数据层（IndexedDB）+ 判 outbox + 续读标记。
//
// 分工（与 sw.js 严格分开）：
//   - 应用壳（HTML/JS/CSS）走 sw.js 的 Cache API，network-first。
//   - **正文数据**（折列表 / 文档正文 / 批注串 / 判）走这里的 IndexedDB。
//   - **PAT 与 Authorization 响应绝不进任何缓存**：token 只在 localStorage（github.js），
//     正文数据是解过的 JSON/文本、不含凭据。两条路彻底不交叉。
//
// 为什么正文用 IndexedDB 不用 Cache：正文要按「PR 号 + 文档路径 + sha/updated_at」做失效判断、
// 要能断网时结构化读出来渲染、还要挂一个判 outbox 队列——这些是 KV/结构化存储的活，不是 HTTP 缓存的活。
//
// 本文件的**纯函数**（readstate 标记 parse/roundtrip、outbox 去重、cacheKey）刻意不碰 IndexedDB，
// 由 test/offline.test.js 在 node 里直接测。带 IDB 的函数全部 feature-detect：没有 indexedDB
// （node/测试环境）就优雅降级成 no-op / 直连，绝不抛错打断读折主线。

// ───────────────────────── 续读标记（跨设备续读的载体）─────────────────────────
//
// 每折存**一条**会话区 comment 记「读到哪」，正文是机器可读的 HTML 注释：
//   <!-- menxia-readstate {"device":"…","docPath":"…","anchor":"…","time":"…","v":1} -->
// 写入用 GitHub API PATCH 编辑既有那条（首次才 POST 新建），零 commit。
// 阅读器 UI 与 menxia-mcp 都按这个前缀把它从判列表里滤掉（menxia-mcp/src/threads.ts 同款正则）。

// 与 menxia-mcp READSTATE_MARK 逐字对齐：注释前可有前导空白/BOM。改一头必同步另一头。
const READSTATE_RE = /^\s*<!--\s*menxia-readstate\s+([\s\S]*?)\s*-->/;

/** 是不是续读标记 comment（用来在读侧把它从判里滤掉，和 mcp 侧同判据）。 */
export const isReadStateComment = (body) => READSTATE_RE.test(String(body ?? ''));

/**
 * 把续读状态对象序列化成 comment 正文。
 * 除注释外附一行人类可读说明——他真在 GitHub 网页看到这条时不至于一头雾水。
 */
export function buildReadStateBody(state) {
  const payload = {
    device: state.device ?? '',
    docPath: state.docPath ?? '',
    anchor: state.anchor ?? '',
    time: state.time ?? new Date().toISOString(),
    v: 1,
  };
  return `<!-- menxia-readstate ${JSON.stringify(payload)} -->\n`
    + `_门下续读位置（自动维护，勿手改）：${payload.device} · ${payload.docPath}_`;
}

/**
 * 从 comment 正文解析续读状态；不是标记 / JSON 坏了 → 返回 null（宽容，绝不抛）。
 * roundtrip：parse(build(x)) 的字段与 x 相等。
 */
export function parseReadState(body) {
  const m = READSTATE_RE.exec(String(body ?? ''));
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    if (!o || typeof o !== 'object') return null;
    return {
      device: typeof o.device === 'string' ? o.device : '',
      docPath: typeof o.docPath === 'string' ? o.docPath : '',
      anchor: typeof o.anchor === 'string' ? o.anchor : '',
      time: typeof o.time === 'string' ? o.time : '',
      v: typeof o.v === 'number' ? o.v : 1,
    };
  } catch { return null; }
}

/**
 * 续读位置该不该提示「跳到上次位置?」。**last-write-wins 按时间戳**，且只在落点不同才提示。
 * 判据（全满足才提示）：
 *   ① 远端有 readstate；
 *   ② 远端 time 比本地记的更晚（本地没有则视为远端更新）；
 *   ③ 远端落点(docPath#anchor)与「当前正看的落点」不同——否则跳了也没动，纯打扰。
 * 绝不自动跳：这个函数只回答「要不要给那个不打扰的提示条」，跳与不跳由用户点。
 */
export function shouldPromptJump(remote, { localTime = '', current = {} } = {}) {
  if (!remote || !remote.docPath) return false;
  if (localTime && !(remote.time > localTime)) return false;
  const sameSpot = remote.docPath === current.docPath && (remote.anchor || '') === (current.anchor || '');
  return !sameSpot;
}

// ───────────────────────── 判 outbox（断网发判的队列）─────────────────────────
//
// 断网时发判落这个 IDB 队列，UI 显示「待发 N 条」。恢复网络（online 事件 + 每次启动）自动 flush，
// 逐条带幂等：本地 uuid，flush 成功才出队；失败保留可重试。

/** 本地幂等 id。crypto.randomUUID 有就用，没有退回时间+随机（够唯一，不追求密码学强度）。 */
export function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `oid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 一条 outbox 项的形状（纯数据，便于测试）。
 * kind 目前只有 'issueComment'（判）；留字段是为了将来划句涂归也能进同一条队列，不改结构。
 */
// answers：门下服务的结构化判（判框按 questions 作答；服务端必答校验，丢了补发永远 400——bughunt P1-3）。
// backend（+ GitHub 的 repo）：这条属于哪个数据源，flush 只发当前数据源的（P1-4）。
// ref：判写于哪个版本（门下 `<id>@<no>`，P2-1）；补发时服务端按它校验，推了新版就退成标明版本的整单评论。
export function makeOutboxItem({ pr, body, kind = 'issueComment', repo = '', backend = 'github', answers = [], ref = null }) {
  return {
    id: newUuid(), kind, pr, body, repo, backend, ref,
    answers: Array.isArray(answers) ? answers : [],
    createdAt: new Date().toISOString(), tries: 0,
  };
}

/**
 * 这条 outbox 项是否属于当前数据源（GitHub 还要同一个仓）。
 * 老项没有 backend 字段：门下折号是 `rv_…`，GitHub 是数字——按号码空间推断（两者不重叠）。
 */
export function outboxBelongs(item, { backend, repo = '' }) {
  const b = item?.backend || (/^rv_/.test(String(item?.pr ?? '')) ? 'service' : 'github');
  if (b !== backend) return false;
  if (b === 'github' && item.repo && repo) return item.repo.toLowerCase() === repo.toLowerCase();
  return true;
}

/** 判正文是否已经在服务端那串判里（GitHub 会话区原文 / 门下 decision 渲染成 `**判（改）** · vN\n…\n\n<note>`）。 */
export function outboxLanded(item, comments) {
  const b = String(item?.body ?? '');
  if (!b) return false;
  return (comments || []).some((c) => {
    const cb = String(c?.body ?? '');
    return cb === b || cb.endsWith(`\n\n${b}`);
  });
}

/**
 * 补发 sender（P2-4 不重复）：带本地 id 作幂等键；上次失败过（tries>0，可能是请求到了、响应丢了）
 * 先查一遍会话区，已经落地就当发成功，不再发第二条。
 */
export function makeOutboxSender(api) {
  return async (it) => {
    if ((it.tries || 0) > 0 && api.listIssueComments) {
      const landed = await api.listIssueComments(it.pr).then((cs) => outboxLanded(it, cs), () => false);
      if (landed) return;
    }
    await api.createIssueComment(it.pr, it.body, {
      ...(it.answers?.length ? { answers: it.answers } : {}),
      ...(it.ref ? { ref: it.ref, staleAsComment: true } : {}),
      idempotencyKey: it.id,
    });
  };
}

/**
 * 出队去重：把「已成功发出的 id」从队列里剔掉。
 * 幂等的关键——flush 途中若某条其实已到服务端但响应丢了，重试会靠这个（配合服务端幂等）不重复入队。
 * 纯函数，不碰 IDB。
 */
export function dropSent(queue, sentIds) {
  const sent = new Set(sentIds);
  return (queue || []).filter((it) => !sent.has(it.id));
}

// ───────────────────────── 内容缓存 key ─────────────────────────
//
// 键含 PR 号 + 资源类型 + 文档路径 + 版本（sha 或 updated_at）做失效判断。
// 在线时正常请求并顺手写库；断网时按 key 读出最新一份渲染，UI 明示「离线副本 · 截至 <时间>」。

/** 规整化缓存键：稳定、可读、不含斜杠歧义。resource ∈ folders|files|comments|issueComments|doc。 */
export function cacheKey(resource, { pr = '', path = '' } = {}) {
  return [resource, String(pr), path].filter((s) => s !== '').join('::');
}

// ───────────────────────── IndexedDB 薄封装（feature-detected）─────────────────────────

const DB_NAME = 'menxia-offline';
const DB_VERSION = 1;
const STORE_CONTENT = 'content';   // key → { key, value, cachedAt }
const STORE_OUTBOX = 'outbox';     // id → outbox item
const STORE_META = 'meta';         // key → value（如 readstate 本地镜像、上次 time）

const hasIDB = () => typeof indexedDB !== 'undefined';

let dbPromise = null;
function openDb() {
  if (!hasIDB()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CONTENT)) db.createObjectStore(STORE_CONTENT, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);            // 开不了库就当没有离线能力，绝不抛
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}
const reqToPromise = (r) => new Promise((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });

/** 写内容缓存（在线取到数据后顺手调）。失败静默——缓存是加分项，不是主线。 */
export async function putContent(key, value) {
  const db = await openDb();
  if (!db) return;
  try { await reqToPromise(tx(db, STORE_CONTENT, 'readwrite').put({ key, value, cachedAt: new Date().toISOString() })); }
  catch { /* 配额/异常都不打断 */ }
}

/** 读内容缓存（断网回退时调）。返回 { value, cachedAt } 或 null。 */
export async function getContent(key) {
  const db = await openDb();
  if (!db) return null;
  try {
    const row = await reqToPromise(tx(db, STORE_CONTENT, 'readonly').get(key));
    return row ? { value: row.value, cachedAt: row.cachedAt } : null;
  } catch { return null; }
}

/**
 * 「取数据，顺手缓存；失败落缓存」的统一入口。
 * 在线：跑 fetcher()，成功就写库并返回 { data, offline:false }。
 * 失败（含断网）：读缓存，命中返回 { data, offline:true, cachedAt }；未命中把原错抛出去。
 * 这样调用方一行就拿到「在线新数据 or 离线副本 or 如实失败」，且能据 offline 显示「离线副本」条。
 */
export async function cachedFetch(key, fetcher) {
  try {
    const data = await fetcher();
    putContent(key, data);                        // 不 await：写缓存不拖慢渲染
    return { data, offline: false };
  } catch (err) {
    const hit = await getContent(key);
    if (hit) return { data: hit.value, offline: true, cachedAt: hit.cachedAt };
    throw err;
  }
}

// —— outbox 持久化 ——

export async function enqueue(item) {
  const db = await openDb();
  if (!db) return false;
  try { await reqToPromise(tx(db, STORE_OUTBOX, 'readwrite').put(item)); return true; }
  catch { return false; }
}

export async function listOutbox() {
  const db = await openDb();
  if (!db) return [];
  try { return (await reqToPromise(tx(db, STORE_OUTBOX, 'readonly').getAll())) || []; }
  catch { return []; }
}

export async function removeOutbox(id) {
  const db = await openDb();
  if (!db) return;
  try { await reqToPromise(tx(db, STORE_OUTBOX, 'readwrite').delete(id)); } catch { /* no-op */ }
}

/**
 * flush 队列：逐条调 sender(item)，成功即出队。
 * 幂等：sender 抛错的条目**留在队列**、tries+1，下次再试；成功的立刻删。返回 { sent, failed }。
 * sender 由调用方注入（真实是 github.createIssueComment），便于测试。
 */
// accept：只发属于当前数据源的项（outboxBelongs），别的原样留着等切回去。io 供测试注入（默认 IDB）。
const idbIo = { list: () => listOutbox(), remove: (id) => removeOutbox(id), put: (it) => enqueue(it) };
export async function flushOutbox(sender, { accept = () => true, io = idbIo } = {}) {
  const items = (await io.list()).filter(accept);
  let sent = 0, failed = 0;
  for (const it of items) {
    try {
      await sender(it);
      await io.remove(it.id);
      sent += 1;
    } catch {
      failed += 1;
      it.tries = (it.tries || 0) + 1;
      await io.put(it);                           // 回写 tries；仍在队列里
    }
  }
  return { sent, failed };
}

// —— meta（续读本地镜像等）——

export async function putMeta(key, value) {
  const db = await openDb();
  if (!db) return;
  try { await reqToPromise(tx(db, STORE_META, 'readwrite').put({ key, value })); } catch { /* no-op */ }
}
export async function getMeta(key) {
  const db = await openDb();
  if (!db) return null;
  try { const row = await reqToPromise(tx(db, STORE_META, 'readonly').get(key)); return row ? row.value : null; }
  catch { return null; }
}
