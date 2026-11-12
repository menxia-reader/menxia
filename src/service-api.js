// 门下服务适配器（M3c）—— 与 github.js **同一套出口名、同一套返回形状**，store.js 按数据源二选一。
//
// 消费层（ui.js / components）的词汇仍是 PR / comment / merge（SPEC §8.3 附则 1），
// 所以这里把门下的 review / revision / decision 翻成 GitHub 形状：
//   review            → pr：number=review id，head.sha=`<review_id>@<revision_no>`（版本凭证，所批即所合）
//   revisions[]       → commits：sha 同上，v1…vN
//   documents/attachments → files：filename，patch=null（锚点以 quote 为准，不做 hunk 校验）
//   comment(带 anchor) → inline review comment：path/line/in_reply_to_id，body 复原成 `> 引文\n\n正文`
//   comment(无 anchor) + decision → issue comment（会话区 / 判）
// 动作映射一行不多：docs/CLIENT-MAPPING.md（menxia-service）。缺口三项不在这里实现：
// checkVerdict（无 CI 概念）、markReady（无 draft）故意**不导出**——ui 用 store.has() 探，没有就藏入口。
//
// 鉴权：OAuth 2.1 授权码 + PKCE(S256)，公共客户端 menxia-web，scope reviewer，audience {SERVICE}/api/v1。
// token 存放：localStorage（key menxia.svc.auth，JSON {access_token, refresh_token, expires_at}）。
//   取舍：sessionStorage 关标签即丢、手机上每次都得重登；IndexedDB 对 XSS 的暴露面与 localStorage
//   完全一样（都是同源 JS 可读），只多一层异步。真正的防线是 CSP script-src 'self'（index.html）
//   + access 24h 短寿命 + refresh 轮换（旧 refresh 再用＝服务端作废整个 grant）。PKCE 的
//   verifier/state 只活在 sessionStorage，换完 token 立刻删。
// 任何 token 都不进 IndexedDB 正文缓存、不进 SW Cache（与 PAT 同一条铁律，见 offline.js 头注）。
import { ApiError as GhApiError } from './github.js';

export const SERVICE_URL = 'https://menxia-service.menxia-service.workers.dev';
export const API_BASE = `${SERVICE_URL}/api/v1`;
export const CLIENT_ID = 'menxia-web';
const AUTH_KEY = 'menxia.svc.auth';
const PKCE_KEY = 'menxia.svc.pkce';
const EVENTS_KEY = 'menxia.svc.events';
export const anchorsByQuote = true;   // ui.js 据此走 quote 锚点路径（不做 hunk 行号校验）

// ───────────────────────── 存储注入（demo / 测试换成内存，不污染真用户的 localStorage）─────────
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
let authStore = {
  get: () => ls()?.getItem(AUTH_KEY) ?? null,
  set: (v) => ls()?.setItem(AUTH_KEY, v),
  del: () => ls()?.removeItem(AUTH_KEY),
};
export function setAuthStorage(s) { authStore = s; }
export function memoryAuthStorage(initial = null) {
  let v = initial ? JSON.stringify(initial) : null;
  return { get: () => v, set: (x) => { v = x; }, del: () => { v = null; } };
}

function loadAuth() {
  try { const raw = authStore.get(); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveAuth(a) { authStore.set(JSON.stringify(a)); }

// ───────────────────────── 身份 / 配置（与 github.js 同名出口）─────────────────────────
// 门下没有「仓库」这个概念：slug 恒空，ui 用 isService() 跳过那道必填检查。
export const getRepoSlug = () => '';
export const setRepoSlug = () => {};
export const repoSlug = () => '';
export const parseRepoSlug = () => '';

export const getToken = () => loadAuth()?.access_token || '';
// 粘 access token 直接用（开发期手工调试）：没有 refresh，过期就得重登。
export const setToken = (t) => saveAuth({ access_token: String(t).trim(), refresh_token: '', expires_at: 0 });
export const clearToken = () => { authStore.del(); };
export const maskToken = (t) => {
  const s = String(t ?? '').trim();
  if (!s) return '';
  return '••••' + (s.length > 4 ? s.slice(-4) : '');
};
export const isLoggedIn = () => Boolean(loadAuth()?.access_token);

// 错误契约（store.js 头注）：{ status, tokenDead, rateLimited, message }。
// 门下：401 unauthenticated = token 失效；403 = 没这个权限（不是限流）；429 = 限流（带 retry_after_seconds）。
export class ApiError extends Error {
  constructor(status, body, statusText = '') {
    const e = body?.error || {};
    super(`${status} ${e.code || statusText}${e.message ? ` — ${e.message}` : ''}`);
    this.status = status;
    this.code = e.code || '';
    this.details = e.details;
    this.retryAfter = e.retry_after_seconds;
    this.tokenDead = status === 401;
    this.rateLimited = status === 429;
  }
}
export { GhApiError };

async function toError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 错误体 */ }
  return new ApiError(res.status, body, res.statusText);
}

// ───────────────────────── OAuth PKCE ─────────────────────────
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function randomString(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64url(arr);
}
export async function s256(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

// 回调页与 index.html 同目录：Pages 上是 https://menxia-reader.github.io/menxia/oauth.html，
// 本地 http://127.0.0.1:<port>/oauth.html——两者都在服务端 menxia-web 的注册名单里。
export function redirectUri(loc = location) {
  return loc.origin + loc.pathname.replace(/[^/]*$/, '') + 'oauth.html';
}

/** 生成授权 URL 并把 verifier/state 暂存 sessionStorage；不跳转（跳转由 login() 做，便于测试）。 */
export async function buildAuthorizeUrl({ loc = location, store = sessionStorage } = {}) {
  const verifier = randomString(32);
  const state = randomString(16);
  const challenge = await s256(verifier);
  store.setItem(PKCE_KEY, JSON.stringify({ verifier, state, redirect_uri: redirectUri(loc), at: Date.now() }));
  const q = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri(loc), response_type: 'code',
    code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'reviewer', resource: API_BASE,
  });
  return `${SERVICE_URL}/oauth/authorize?${q}`;
}

export async function login() {
  location.assign(await buildAuthorizeUrl());
}

async function tokenRequest(form) {
  const res = await fetch(`${SERVICE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) throw await toError(res);
  const t = await res.json();
  const auth = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || '',
    expires_at: Date.now() + (Number(t.expires_in) || 86400) * 1000,
  };
  saveAuth(auth);
  return auth;
}

/** 回调页用：校验 state、拿 verifier 换 token、存起来、清 PKCE 暂存。 */
export async function exchangeCode(code, state, { store = sessionStorage } = {}) {
  let pk = null;
  try { pk = JSON.parse(store.getItem(PKCE_KEY) || 'null'); } catch { pk = null; }
  if (!pk?.verifier) throw new Error('登录会话已失效（找不到 PKCE verifier），请重新点「登录门下」');
  if (!state || state !== pk.state) throw new Error('state 不匹配，拒绝此回调');
  try {
    return await tokenRequest({
      grant_type: 'authorization_code', code, code_verifier: pk.verifier,
      client_id: CLIENT_ID, redirect_uri: pk.redirect_uri, resource: API_BASE,
    });
  } finally {
    store.removeItem(PKCE_KEY);
  }
}

// refresh 单飞：并发的几个请求同时撞 401 只能刷一次——refresh 轮换，第二次用旧的会作废整个 grant。
let refreshing = null;
export function refresh() {
  if (refreshing) return refreshing;
  const cur = loadAuth();
  if (!cur?.refresh_token) return Promise.resolve(null);
  refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: cur.refresh_token, client_id: CLIENT_ID, resource: API_BASE })
    .catch((err) => {
      if (err?.status === 400 || err?.status === 401) clearToken();   // invalid_grant：这个 grant 已死
      return null;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function ensureFresh() {
  const a = loadAuth();
  if (!a) return null;
  if (a.refresh_token && a.expires_at && a.expires_at - Date.now() < 60_000) return (await refresh()) || loadAuth();
  return a;
}

export async function logout() {
  const a = loadAuth();
  if (a?.access_token) {
    try {
      await fetch(`${API_BASE}/me/logout`, { method: 'POST', headers: { Authorization: `Bearer ${a.access_token}` } });
    } catch { /* 离线也要能登出：本地先清，服务端 grant 到期自灭 */ }
  }
  clearToken();
  ls()?.removeItem(EVENTS_KEY);
}

// ───────────────────────── 请求 ─────────────────────────
async function request(path, opts = {}, retry = true) {
  const a = await ensureFresh();
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${a?.access_token || ''}`, Accept: 'application/json', ...opts.headers },
  });
  if (res.status === 401 && retry && loadAuth()?.refresh_token) {
    if (await refresh()) return request(path, opts, false);
  }
  if (!res.ok) throw await toError(res);
  return res;
}
const json = (path, opts) => request(path, opts).then((r) => (r.status === 204 ? null : r.json()));
const post = (path, body, method = 'POST') => json(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function pagedItems(pathFor) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const page = await json(pathFor(cursor));
    out.push(...(page?.items || []));
    cursor = page?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

// 同一折的 comments 在 loadComments 里被 listPRComments / listIssueComments 并行各要一次：
// 单飞合并成一个 GET。
const inflight = new Map();
function shared(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ───────────────────────── 版本凭证 ─────────────────────────
export const refOf = (id, no) => `${id}@${no}`;
export function parseRef(ref) {
  const m = /^(.+)@(\d+)$/.exec(String(ref || ''));
  return m ? { id: m[1], no: Number(m[2]) } : { id: String(ref || ''), no: null };
}

// ───────────────────────── review → pr ─────────────────────────
const OPEN_STATUSES = new Set(['open', 'changes_requested']);

const QUESTION_TEXT = (q) => q?.text || q?.title || q?.prompt || q?.question || q?.id || '';
const OPTION_TEXT = (o) => (typeof o === 'string' ? o : (o?.label || o?.text || o?.title || o?.id || ''));

/** 折子说明：summary + 结构化 questions 转成现有 folder-body 能读的勾选框 markdown。 */
export function bodyOf(r) {
  const parts = [];
  if (r.summary) parts.push(String(r.summary));
  const qs = Array.isArray(r.questions) ? r.questions : [];
  if (qs.length) {
    const lines = ['## 待你拍板'];
    qs.forEach((q, i) => {
      lines.push(`${i + 1}. ${QUESTION_TEXT(q)}`);
      (q?.options || []).forEach((o) => lines.push(`   - [ ] ${OPTION_TEXT(o)}`));
    });
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

export function toPR(r) {
  const approved = r.status === 'approved';
  return {
    number: r.id, id: r.id, node_id: r.id,
    title: r.title || '', body: bodyOf(r),
    labels: (r.labels || []).map((name) => ({ name })),
    head: { sha: refOf(r.id, r.current_revision_no) },
    draft: false,
    state: OPEN_STATUSES.has(r.status) ? 'open' : 'closed',
    created_at: r.created_at, updated_at: r.updated_at || r.last_activity_at || r.created_at,
    closed_at: r.closed_at || null,
    merged_at: approved ? (r.closed_at || r.updated_at) : null,
    html_url: r.web_url || `${SERVICE_URL}/r/${r.id}`,
    user: { login: r.owner?.display_name || r.source_agent || '' },
    svc: {
      status: r.status, role: r.role, is_decider: r.is_decider, read_state: r.read_state || null,
      revision_no: r.current_revision_no, unread: r.read_state?.state === 'unread' || !r.read_state?.state,
      questions: Array.isArray(r.questions) ? r.questions : [],
    },
  };
}

export const listOpenPRs = () =>
  pagedItems((c) => `/reviews?status=open,changes_requested&limit=50${c ? `&cursor=${encodeURIComponent(c)}` : ''}`)
    .then((items) => items.map(toPR));

// 已画可（归档）= approved。rejected / withdrawn 不是「画可」，不进归档栏（CLIENT-MAPPING §1）。
export const listMergedPRs = () =>
  pagedItems((c) => `/reviews?status=approved&limit=50${c ? `&cursor=${encodeURIComponent(c)}` : ''}`)
    .then((items) => items.map(toPR));

// 详情短缓存：开一折时 listPRFiles / listPRCommits / enrichPR / createIssueComment 连着要同一份。
const DETAIL_TTL = 5000;
const details = new Map();   // id → { at, data }
async function getDetail(id, { fresh = false } = {}) {
  const hit = details.get(id);
  if (!fresh && hit && Date.now() - hit.at < DETAIL_TTL) return hit.data;
  const data = await shared(`detail:${id}`, () => json(`/reviews/${encodeURIComponent(id)}`));
  details.set(id, { at: Date.now(), data });
  return data;
}

export function filesOf(detail) {
  const rev = detail.current_revision || detail.revisions?.at(-1) || {};
  const docs = (rev.documents || []).map((d) => ({
    filename: d.path, status: 'added', patch: null, sha: d.sha256, lang: d.lang ?? null, title: d.title ?? null,
  }));
  const assets = (rev.attachments || []).map((a) => ({ filename: a.path, status: 'added', patch: null, media_type: a.media_type }));
  return [...docs, ...assets];
}

export const listPRFiles = (id) => getDetail(id, { fresh: true }).then(filesOf);

/** 开折后把详情里的 summary/questions/状态补进 pr（清单项没有 summary）。 */
export async function enrichPR(pr) {
  const d = await getDetail(pr.number);
  return { ...pr, ...toPR(d) };
}

export function commitsOf(detail) {
  const revs = [...(detail.revisions || [])].sort((a, b) => a.revision_no - b.revision_no);
  return revs.map((rv) => ({
    sha: refOf(detail.id, rv.revision_no),
    commit: { message: rv.change_note || `v${rv.revision_no}`, committer: { date: rv.created_at }, author: { date: rv.created_at } },
  }));
}
export const listPRCommits = (id) => getDetail(id).then(commitsOf);

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
const contentPath = (path, ref) => {
  const { id, no } = parseRef(ref);
  return `/reviews/${encodeURIComponent(id)}/revisions/${no}/content/${encodePath(path)}`;
};

export const getFileText = (path, ref) =>
  request(contentPath(path, ref), { headers: { Accept: 'text/markdown, text/plain, */*' } }).then((r) => r.text());

export const getFileBlobUrl = (path, ref) =>
  request(contentPath(path, ref), { headers: { Accept: '*/*' } }).then((r) => r.blob()).then((b) => URL.createObjectURL(b));

// ───────────────────────── 评论 → inline / 会话区 ─────────────────────────
const loginOf = (a) => a?.display_name || (a?.kind === 'agent' ? 'agent' : (a?.role || 'user'));
const lineOf = (c) => (c.anchor_state === 'unanchored' ? null : (c.anchor_current?.line ?? c.anchor?.line ?? null));
const fmtAnchored = (quote, body) => (quote ? `> ${quote}\n\n${body ?? ''}` : String(body ?? ''));

/** 纯函数：门下 comments → { inline, convo }（GitHub 形状），便于测试。 */
export function splitComments(items) {
  const roots = new Map();
  (items || []).forEach((c) => { if (!c.parent_id) roots.set(c.id, c); });
  const inline = [], convo = [];
  for (const c of items || []) {
    if (c.deleted) continue;
    const root = c.parent_id ? roots.get(c.parent_id) : c;
    const base = { id: c.id, user: { login: loginOf(c.author) }, created_at: c.created_at, author_kind: c.author?.kind };
    if (root?.anchor) {
      inline.push({
        ...base,
        path: root.anchor.document_path,
        line: lineOf(root),
        original_line: root.anchor.line ?? null,
        in_reply_to_id: c.parent_id || null,
        body: c.parent_id ? String(c.body ?? '') : fmtAnchored(c.anchor?.quote, c.body),
        anchor_state: root.anchor_state ?? null,
        quote: root.anchor.quote,
      });
    } else {
      convo.push({ ...base, in_reply_to_id: c.parent_id || null, body: String(c.body ?? '') });
    }
  }
  return { inline, convo };
}

const VERDICT_ZH = { approve: '画可', request_changes: '判（改）', reject: '关' };
export function decisionToComment(d) {
  const lines = [`**${VERDICT_ZH[d.verdict] || d.verdict}** · v${d.revision_no}`];
  (d.answers || []).forEach((a) => {
    const picked = (a.option_ids || []).join('、');
    lines.push(`- ${a.question_id}：${picked}${a.text ? (picked ? ' — ' : '') + a.text : ''}`);
  });
  if (d.note) lines.push('', String(d.note));
  return { id: d.id, user: { login: loginOf(d.decider) }, created_at: d.created_at, body: lines.join('\n'), verdict: d.verdict };
}

const fetchComments = (id) => shared(`comments:${id}`, () =>
  pagedItems((c) => `/reviews/${encodeURIComponent(id)}/comments?limit=100${c ? `&cursor=${encodeURIComponent(c)}` : ''}`));

export const listPRComments = (id) => fetchComments(id).then((items) => splitComments(items).inline);

export async function listIssueComments(id) {
  const [items, decisions] = await Promise.all([
    fetchComments(id),
    json(`/reviews/${encodeURIComponent(id)}/decisions`).then((d) => d?.items || []).catch(() => []),
  ]);
  return [...splitComments(items).convo, ...decisions.map(decisionToComment)];
}

// ───────────────────────── 呈出涂归（原子批）─────────────────────────
/** 纯函数：ui 的 comments[]（path/line/quote/note/body）→ 批量端点请求体。 */
export function batchPayload({ comments = [], commitId, fallbackBody = '' }) {
  const { no } = parseRef(commitId);
  const list = comments.map((c) => ({
    body: String(c.note ?? c.body ?? ''),
    anchor: { document_path: c.path, quote: String(c.quote || ''), ...(c.line ? { line: c.line } : {}) },
  }));
  if (fallbackBody) list.push({ body: String(fallbackBody), anchor: null });
  return { ...(no ? { revision_no: no } : {}), comments: list };
}

export async function submitReview(id, payload) {
  const body = batchPayload(payload);
  if (!body.comments.length) return { items: [] };
  try {
    return await post(`/reviews/${encodeURIComponent(id)}/comments/batch`, body);
  } catch (err) {
    if (err?.status === 400 && Number.isInteger(err.details?.index)) {
      err.message = `第 ${err.details.index + 1} 条的引文在当前版本里找不到，整批未呈（${err.message}）`;
    } else if (err?.status === 409) {
      err.message = `这折已被推了新版本，先刷新再呈（${err.message}）`;
    }
    throw err;
  }
}

// ───────────────────────── 判 / 画可 ─────────────────────────
// 判 = 带结论的决定 request_changes + note（agent 只认 verdict，note 是参考）。
// 结案折（approved/rejected/withdrawn）或本人不是 decider → 退成无锚点的整单评论。
// answers[]（{question_id, option_ids?|text}）来自判框按 review.questions 的作答（服务端必答校验）。
const withAnswers = (body, answers) => (Array.isArray(answers) && answers.length ? { ...body, answers } : body);
export async function createIssueComment(id, body, { answers } = {}) {
  const d = await getDetail(id, { fresh: true });
  const closed = !OPEN_STATUSES.has(d.status);
  if (!closed && d.is_decider !== false) {
    try {
      const dec = await post(`/reviews/${encodeURIComponent(id)}/decisions`,
        withAnswers({ revision_no: d.current_revision_no, verdict: 'request_changes', note: body }, answers));
      details.delete(id);
      return { id: dec?.id, kind: 'decision' };
    } catch (err) {
      if (!(err?.status === 403 || (err?.status === 409 && err.code === 'review_closed'))) throw err;
    }
  }
  const c = await post(`/reviews/${encodeURIComponent(id)}/comments`, { body });
  return { id: c?.id, kind: 'comment' };
}

export const updateIssueComment = async () => { throw new Error('门下服务不支持改评论'); };

// 画可 = approve；带 revision_no（= GitHub sha）：agent 中途推了新版 → 409 stale_revision。
// 读物（kind:读物）画可同时标「读完」——GitHub 侧 isReadDone 是从「读物且已 merge」推的，门下用显式状态。
export async function mergePR(id, ref, { answers, note } = {}) {
  const { no } = parseRef(ref);
  const res = await post(`/reviews/${encodeURIComponent(id)}/decisions`,
    withAnswers({ revision_no: no, verdict: 'approve', ...(note ? { note } : {}) }, answers));
  const d = details.get(id)?.data;
  details.delete(id);
  if ((d?.labels || []).includes('kind:读物')) {
    try { await putState(id, { state: 'done' }); } catch { /* 标读完失败不影响画可 */ }
  }
  return res;
}

// 关 / 不留 = reject（结案不合）；同样带 revision_no 与必答 answers
export async function rejectPR(id, ref, { answers, note } = {}) {
  const res = await post(`/reviews/${encodeURIComponent(id)}/decisions`,
    withAnswers({ revision_no: parseRef(ref).no, verdict: 'reject', ...(note ? { note } : {}) }, answers));
  details.delete(id);
  return res;
}

/** 这折要人答的问题（服务端 QuestionSchema）；清单项没有，详情才有——从缓存拿，没有就拉。 */
export async function questionsOf(id) {
  const d = details.get(id)?.data || await getDetail(id);
  return Array.isArray(d?.questions) ? d.questions : [];
}

// ───────────────────────── 阅读状态 / 续读位置 ─────────────────────────
const putState = (id, body) => post(`/reviews/${encodeURIComponent(id)}/read-state`, body, 'PUT');

/** 与 github.getReadState 同形：{ id, state:{device,docPath,anchor,time,v} } 或 null。 */
export async function getReadState(id) {
  const rs = await json(`/reviews/${encodeURIComponent(id)}/read-state`);
  const p = rs?.position;
  if (!p?.document_path) return null;
  return { id: 'svc', state: { device: p.device || '', docPath: p.document_path, anchor: p.anchor || '', time: p.time || rs.updated_at || '', v: 1 } };
}

export async function putReadState(id, state) {
  await putState(id, {
    position: {
      document_path: state.docPath, anchor: String(state.anchor || '').slice(0, 512),
      ...(state.device ? { device: String(state.device).slice(0, 64) } : {}),
      ...(state.time ? { time: state.time } : {}),
    },
  });
  return 'svc';
}

/** 开折即「已读」：只在 unread/未标记时写一次，不动 done/shelved。 */
export async function markRead(id) {
  const d = details.get(id)?.data || await getDetail(id);
  const st = d?.read_state?.state;
  if (st && st !== 'unread') return false;
  await putState(id, { state: 'read' });
  if (details.get(id)) details.get(id).data.read_state = { ...(d.read_state || {}), state: 'read' };
  return true;
}
export const markDone = (id) => putState(id, { state: 'done' });
export const markShelved = (id) => putState(id, { state: 'shelved' });

// ───────────────────────── 增量刷新：事件流 ─────────────────────────
// 游标存 localStorage（HMAC 游标绑定用户，登出时清）。首次没游标：把现有事件翻到底只记游标，不当作新事件。
export async function pollEvents({ store = ls() } = {}) {
  let since = store?.getItem(EVENTS_KEY) || '';
  const initial = !since;
  const items = [];
  for (let i = 0; i < 10; i++) {
    let page;
    try {
      page = await json(`/events?limit=100${since ? `&since=${encodeURIComponent(since)}` : ''}`);
    } catch (err) {
      // 游标坏了（换了账号 / 服务端换了 HMAC 密钥）：丢掉重来，下一轮再从头对齐
      if (err?.status === 400 && since) { store?.removeItem(EVENTS_KEY); return { items: [], initial: true }; }
      throw err;
    }
    if (!initial) items.push(...(page?.items || []));
    if (page?.next_cursor) since = page.next_cursor;
    if (!page?.has_more) break;
  }
  if (since) store?.setItem(EVENTS_KEY, since);
  return { items, initial };
}

// ───────────────────────── 验钥 ─────────────────────────
export async function verifyToken() {
  const me = await json('/me');
  return { repo: {}, canWrite: true, prAccess: me?.allowed !== false, checksAccess: false, me };
}
