// ?demo=1&svc=1 —— 门下服务 driver 的冒烟靶（M3c）：拦 fetch 伪造一个内存版门下服务，
// 让 **真实的 service-api.js**（PKCE、bearer、批量呈出、判、画可、read-state、事件流）整条路径跑一遍。
// 与 demoApi（GitHub 形状的桩）互不相干：那边测消费层，这边测 driver + 消费层的接缝。
//
// 不写任何真实 token：token 全是 demo-* 字面量，且 service-api 的 auth 存储换成内存（setAuthStorage），
// 不碰真用户 localStorage 里的 menxia.svc.auth。
import {
  SERVICE_URL, API_BASE, setAuthStorage, memoryAuthStorage, s256,
  buildAuthorizeUrl, exchangeCode, getToken, verifyToken, logout, requestRefresh,
} from './service-api.js';
import { quoteTooShort } from './anchor.js';

const RID = 'rv_01DEMO000000000000000000S1';
const now = () => new Date().toISOString();
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();

export const state = {
  tokens: { access: 'demo-access-1', refresh: 'demo-refresh-1' },
  challenge: null, pkceOk: null, loggedOut: false,
  review: null, revisions: [], comments: [], decisions: [], events: [],
  // 续读位置预埋「别的设备读到 L30」：开折该出「跳到上次位置?」条（不自动跳）
  readState: { state: 'unread', position: { document_path: 'docs/demo.md', anchor: 'L30', device: 'ipad', time: now() }, updated_at: now(), has_new_activity: true },
  batches: [], contentHits: [],
  refreshes: [],   // D-19「更新」请求，新的在前（同服务端 GET 的 created_at 倒序）
};

// 版本对比 / 可能过时示例（docs/DIFF-STALE-TOAST.md）：
//  · v1 比 v2 少一大节（行级新增 + 折叠）、末行措辞不同（字符级高亮），另有一篇 v2 删掉的附录（文档级「删除」）；
//  · 两版都放在一个多月前 → 当前版本「N 周未更新」；之后 agent 推的新版是「现在」，标签随之消失；
//  · sha256 按正文算：agent 原样推的新版与上一版同 sha → 对比页标「未改」、不拉正文。
const OLD_APPENDIX = '# 附录\n\n这一篇在第二版里删掉了。\n';
function seed({ DOC, DOC_OLD }) {
  const v1 = DOC_OLD.replace('末行锚点：见此行即已滚到底。', '末行锚点：看到这行就已滚到底。');
  state.revisions = [
    { id: 'rev_1', revision_no: 1, text: v1, extra: { 'docs/附录.md': OLD_APPENDIX }, change_note: '初稿', created_at: ago(24 * 40) },
    { id: 'rev_2', revision_no: 2, text: DOC, change_note: '补加长段', created_at: ago(24 * 30) },
  ];
  state.review = {
    id: RID, title: '门下服务 demo 折', summary: '走门下服务的演示折：涂归、判、画可全写回内存版服务。',
    status: 'open', labels: ['proj:menxia', 'kind:设计', 'wait:你拍'],
    // 服务端 QuestionSchema 原样：id/prompt/kind/options/required
    questions: [
      { id: 'q1', prompt: '先改哪头？', kind: 'single_choice', options: [{ id: 'a', label: '开头' }, { id: 'b', label: '结尾' }], required: true },
      { id: 'q2', prompt: '还有什么要交代', kind: 'free_text', required: false },
    ],
    decision_options: ['approve', 'request_changes', 'reject'],
    owner: { id: 'u1', display_name: 'charlie' }, decider: { id: 'u1', display_name: 'charlie' },
    role: 'owner', is_owner: true, is_decider: true, source_agent: 'hermes',
    created_at: ago(2), updated_at: ago(1), closed_at: null, last_activity_at: ago(1), due_at: null,
    web_url: `${SERVICE_URL}/r/${RID}`,
  };
}

const cur = () => state.revisions[state.revisions.length - 1];
// 假 sha256：正文的 FNV-1a 散列（够区分「改没改」，不是真 sha）
const fakeSha = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return `fnv${(h >>> 0).toString(16)}`; };
const docsOf = (r) => ({ 'docs/demo.md': r.text, ...(r.extra || {}) });
const revisionOut = (r) => ({
  id: r.id, revision_no: r.revision_no, change_note: r.change_note, created_by_kind: 'agent', created_at: r.created_at,
  content_hash: `h${r.revision_no}`,
  documents: Object.entries(docsOf(r)).map(([path, text]) => ({
    path, lang: 'zh-CN', title: path === 'docs/demo.md' ? '涂归 demo 折' : null, bytes: text.length, sha256: fakeSha(text),
  })),
  attachments: [],
});
const listItem = () => ({
  ...state.review, current_revision_no: cur().revision_no, current_revision_at: cur().created_at, read_state: state.readState,
});
const full = () => ({
  ...listItem(), current_revision: revisionOut(cur()), revisions: state.revisions.map(revisionOut),
  counts: { comments: state.comments.length, decisions: state.decisions.length },
  refresh: state.refreshes[0] || null,
});
const event = (type, ref_id, data = {}) => state.events.push({
  review_id: RID, review_title: state.review.title, review_status: state.review.status, type, ref_id, data, created_at: now(),
});

const J = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ERR = (status, code, message = code, details) => J({ error: { code, message, retryable: status === 429, details } }, status);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// agent 收到「判」后推新版本（真实世界里是 Hermes 改稿后 submit_revision）
function agentPushesRevision() {
  const n = cur().revision_no + 1;
  state.revisions.push({ id: `rev_${n}`, revision_no: n, text: cur().text, change_note: `按判改稿 v${n}`, created_at: now() });
  state.review.status = 'open';
  state.review.updated_at = now();
  event('revision.created', `rev_${n}`, { revision_no: n });
  event('status.changed', null, { status: 'open' });
}

// 画可执行器消费「更新」请求（真实世界：PATCH …/refresh-requests/{id}，queued→running→done|failed 只进不退）。
// done = 先推一版新 revision 再回填 result_revision_no；原 approved/rejected 的回到 open（同 services 侧 D-19）。
export function advanceRefresh(status, { error } = {}) {
  const r = state.refreshes[0];
  if (!r || r.status === 'done' || r.status === 'failed') return null;
  if (status === 'done') {
    const n = cur().revision_no + 1;
    state.revisions.push({ id: `rev_${n}`, revision_no: n, text: cur().text, change_note: `更新 v${n}`, created_at: now() });
    event('revision.created', `rev_${n}`, { revision_no: n });
    if (state.review.status === 'approved' || state.review.status === 'rejected') {
      state.review.status = 'open'; state.review.closed_at = null;
      event('status.changed', null, { status: 'open' });
    }
    r.result_revision_no = n;
  }
  if (status === 'failed') r.error = error || 'agent 失败';
  r.status = status; r.updated_at = now();
  state.review.updated_at = now();
  event('refresh.updated', r.request_id, { request_id: r.request_id, status });
  return r;
}

async function handle(url, init) {
  const path = url.pathname;
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  const body = () => { try { return JSON.parse(init.body); } catch { return {}; } };

  // ── OAuth ──
  if (path === '/oauth/token' && method === 'POST') {
    const f = new URLSearchParams(String(init.body || ''));
    if (f.get('client_id') !== 'menxia-web' || f.get('resource') !== API_BASE) return J({ error: 'invalid_client' }, 400);
    if (f.get('grant_type') === 'authorization_code') {
      if (f.get('code') !== 'demo-code') return J({ error: 'invalid_grant' }, 400);
      state.pkceOk = Boolean(state.challenge) && (await s256(f.get('code_verifier') || '')) === state.challenge;
      if (!state.pkceOk) return J({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
      state.tokens = { access: 'demo-access-2', refresh: 'demo-refresh-2' };
    } else if (f.get('grant_type') === 'refresh_token') {
      if (f.get('refresh_token') !== state.tokens.refresh) return J({ error: 'invalid_grant' }, 400);
      state.tokens = { access: `${state.tokens.access}r`, refresh: `${state.tokens.refresh}r` };
    } else return J({ error: 'unsupported_grant_type' }, 400);
    return J({ access_token: state.tokens.access, refresh_token: state.tokens.refresh, token_type: 'Bearer', expires_in: 86400, scope: 'reviewer', client_kind: 'first_party' });
  }
  // RFC 7009（同服务端 oauth_routes.ts）：持有 refresh/access 即作废整个 grant；未知 token 也回 200，无 bearer
  if (path === '/oauth/revoke' && method === 'POST') {
    const t = new URLSearchParams(String(init.body || '')).get('token');
    if (t && (t === state.tokens.refresh || t === state.tokens.access)) { state.loggedOut = true; state.revokedVia = 'rfc7009'; state.tokens = { access: 'revoked', refresh: 'revoked' }; }
    return new Response(null, { status: 200 });
  }

  // ── bearer ──
  if (!path.startsWith('/api/v1/')) return ERR(404, 'not_found');
  if (headers.get('Authorization') !== `Bearer ${state.tokens.access}`) return ERR(401, 'unauthenticated');
  const p = path.slice('/api/v1'.length);
  const q = url.searchParams;

  if (p === '/me' && method === 'GET') return J({ id: 'u1', email: 'demo@example.invalid', display_name: 'charlie', is_admin: false, allowed: true });
  if (p === '/me/logout' && method === 'POST') { state.loggedOut = true; state.tokens = { access: 'revoked', refresh: 'revoked' }; return J(null, 204); }

  if (p === '/reviews' && method === 'GET') {
    const statuses = (q.get('status') || '').split(',').filter(Boolean);
    const items = !statuses.length || statuses.includes(state.review.status) ? [listItem()] : [];
    return J({ items, next_cursor: null, unread_count: state.readState.state === 'unread' ? 1 : 0 });
  }
  if (p === '/events' && method === 'GET') {
    const since = Number(q.get('since') || 0);
    if (q.get('since') && !Number.isFinite(since)) return ERR(400, 'invalid_argument', 'bad cursor');
    return J({ items: state.events.slice(since), next_cursor: String(state.events.length), has_more: false });
  }

  const m = /^\/reviews\/([^/]+)(\/.*)?$/.exec(p);
  if (!m || decodeURIComponent(m[1]) !== RID) return ERR(404, 'not_found');
  const sub = m[2] || '';

  if (sub === '' && method === 'GET') return J(full());
  const content = /^\/revisions\/(\d+)\/content\/(.+)$/.exec(sub);
  if (content && method === 'GET') {
    const r = state.revisions.find((x) => x.revision_no === Number(content[1]));
    const text = r && docsOf(r)[decodeURIComponent(content[2])];
    if (text == null) return ERR(404, 'not_found');
    state.contentHits.push(r.revision_no);
    return new Response(text, { status: 200, headers: { 'content-type': 'text/markdown; charset=utf-8' } });
  }
  if (sub === '/comments' && method === 'GET') return J({ items: state.comments, next_cursor: null });
  const mkComment = (c, revNo) => {
    const id = `c${state.comments.length + 1}`;
    const out = {
      id, parent_id: c.parent_id || null, revision_no: revNo, body: c.body, deleted: false, imported: false,
      author: { kind: 'human', id: 'u1', role: 'owner', display_name: 'charlie' },
      anchor: c.anchor || null, anchor_current: c.anchor || null, anchor_state: c.anchor ? 'anchored' : null,
      anchor_revision_no: c.anchor ? revNo : null, created_at: now(), deleted_at: null,
    };
    state.comments.push(out);
    event('comment.created', id, { anchored: Boolean(c.anchor) });
    return out;
  };
  if (sub === '/comments/batch' && method === 'POST') {
    const b = body();
    if (!['open', 'changes_requested'].includes(state.review.status)) return ERR(409, 'review_closed');
    if (b.revision_no != null && b.revision_no !== cur().revision_no) return ERR(409, 'stale_revision');
    const text = norm(cur().text);
    const bad = [];
    for (let i = 0; i < (b.comments || []).length; i++) {
      const a = b.comments[i].anchor;
      if (!b.comments[i].body) return ERR(400, 'invalid_argument', 'body required', { index: i });
      // 与 services/comments.ts createCommentsBatch 同契约：details {field, index}（新版服务端另附 quote/document_path，这里故意不给，验缺失兼容）。
      // 判据也同：在 markdown 原文里找——划选跨了链接/粗体的渲染文本就找不到，正是 2026-11-23 报障的形状。
      // C1/C3（docs/SHORT-QUOTE.md）：quote 长度按码点、CJK 或带上下文 ≥1；仍整批原子，但 details.items 列出**所有**不合格条
      if (a && quoteTooShort(a.quote, a)) bad.push({ field: `comments.${i}.anchor.quote`, index: i, message: '划选太短：至少 3 个字符，或带上下文' });
      else if (a && (a.document_path !== 'docs/demo.md' || !text.includes(norm(a.quote)))) {
        bad.push({ field: `comments.${i}.anchor.quote`, index: i, message: `第 ${i + 1} 条的引文在当前版本里找不到` });
      }
    }
    if (bad.length) return ERR(400, 'invalid_argument', `${bad.length} 条涂归的锚点不合格`, { ...bad[0], items: bad });
    state.batches.push(b);
    return J({ items: b.comments.map((c) => mkComment(c, cur().revision_no)) }, 201);
  }
  if (sub === '/comments' && method === 'POST') return J(mkComment(body(), cur().revision_no), 201);
  if (sub === '/decisions' && method === 'GET') return J({ items: state.decisions });
  if (sub === '/decisions' && method === 'POST') {
    const b = body();
    if (!['open', 'changes_requested'].includes(state.review.status)) return ERR(409, 'review_closed');
    if (b.revision_no !== cur().revision_no) return ERR(409, 'stale_revision');
    // D-17（menxia-service #40）：changes_requested 上拍板人可对当前版本 approve/reject，不再 409 conflict。
    // 必答校验，与 services/reviews.ts createDecision 同判据
    const answers = b.answers || [];
    for (const qd of state.review.questions) {
      const a = answers.find((x) => x.question_id === qd.id);
      if ((qd.required ?? true) && !a) return ERR(400, 'invalid_argument', `question ${qd.id} requires an answer`);
      if (a && qd.kind !== 'free_text') {
        const ids = new Set((qd.options || []).map((o) => o.id));
        if ((a.option_ids || []).some((o) => !ids.has(o))) return ERR(400, 'invalid_argument', `unknown option for ${qd.id}`);
        if (qd.kind === 'single_choice' && (a.option_ids || []).length > 1) return ERR(400, 'invalid_argument', `${qd.id} is single_choice`);
      }
      if (a && qd.kind === 'free_text' && (a.option_ids || []).length) return ERR(400, 'invalid_argument', `${qd.id} takes no option_ids`);
    }
    if (answers.some((a) => !state.review.questions.some((qd) => qd.id === a.question_id))) return ERR(400, 'invalid_argument', 'unknown question');
    const d = { id: `d${state.decisions.length + 1}`, revision_no: b.revision_no, verdict: b.verdict, answers, note: b.note || null, decider: { display_name: 'charlie' }, created_at: now() };
    state.decisions.push(d);
    event('decision.created', d.id, { verdict: d.verdict });
    const next = { approve: 'approved', request_changes: 'changes_requested', reject: 'rejected' }[b.verdict];
    if (!next) return ERR(400, 'invalid_argument', 'bad verdict');
    state.review.status = next;
    state.review.updated_at = now();
    if (next !== 'changes_requested') state.review.closed_at = now();
    event('status.changed', null, { status: next });
    if (next === 'changes_requested') setTimeout(agentPushesRevision, 300);
    return J(d, 201);
  }
  if (sub === '/refresh-requests' && method === 'GET') return J({ items: state.refreshes });
  if (sub === '/refresh-requests' && method === 'POST') {
    if (state.review.status === 'withdrawn') return ERR(409, 'review_closed');
    if (state.review.is_decider === false && state.review.is_owner === false) return ERR(403, 'forbidden');
    const b = body();
    if (b.note != null && (typeof b.note !== 'string' || b.note.length > 1000)) return ERR(400, 'invalid_argument', 'note');
    const open = state.refreshes.find((r) => r.status === 'queued' || r.status === 'running');
    if (open) return J(open, 200);   // 幂等：已有进行中的就回那一条
    const r = { request_id: `rfr_01DEMO${String(state.refreshes.length + 1).padStart(20, '0')}`, status: 'queued', note: b.note || null, created_at: now(), updated_at: now() };
    state.refreshes.unshift(r);
    event('refresh.requested', r.request_id, { request_id: r.request_id });
    return J(r, 201);
  }
  if (sub === '/read-state' && method === 'GET') return J(state.readState);
  if (sub === '/read-state' && method === 'PUT') {
    const b = body();
    if (b.state) state.readState.state = b.state;
    if ('position' in b) state.readState.position = b.position;
    state.readState.updated_at = now();
    state.readState.has_new_activity = false;
    return J(state.readState);
  }
  return ERR(404, 'not_found', `${method} ${p}`);
}

/** 装 fetch 拦截 + 内存 auth（已登录态 demo-access-1，供 app 直接开折；登录流程由冒烟另测）。 */
export function installServiceFake(docs) {
  seed(docs);
  setAuthStorage(memoryAuthStorage({ access_token: state.tokens.access, refresh_token: state.tokens.refresh, expires_at: Date.now() + 86400e3 }));
  try { localStorage.removeItem('menxia.svc.events'); sessionStorage.removeItem('menxia.svc.events'); } catch { /* 无痕 */ }
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!url || !url.startsWith(SERVICE_URL)) return real(input, init);
    return handle(new URL(url), init || {});
  };
}

// ───────────────────────── [svc] 冒烟 ─────────────────────────
export async function runSvcSmoke(docEl) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 3000) => {
    const deadline = Date.now() + ms;
    for (;;) { const v = fn(); if (v) return v; if (Date.now() >= deadline) return null; await sleep(25); }
  };
  let pass = 0, fail = 0;
  const chk = (name, cond, detail = '') => {
    cond ? pass++ : fail++;
    console.log(`[svc] ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  };
  const rangeFor = (text) => {
    const block = [...docEl.querySelectorAll('[data-line]')].find((b) => b.textContent.includes(text));
    if (!block) return null;
    const idx = block.textContent.indexOf(text);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let pos = 0, sN = null, sO = 0, node;
    while ((node = walker.nextNode())) {
      const next = pos + node.data.length;
      if (!sN && idx < next) { sN = node; sO = idx - pos; }
      if (sN && idx + text.length <= next) { const r = document.createRange(); r.setStart(sN, sO); r.setEnd(node, idx + text.length - pos); return r; }
      pos = next;
    }
    return null;
  };
  const pick = async (text, note) => {
    await sleep(150);
    const r = rangeFor(text);
    if (!r) { console.log(`[svc] pick 找不到靶文：${text}`); return false; }
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    docEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await sleep(120);
    const float = await waitFor(() => document.querySelector('.zhupi-float'));
    if (!float) { console.log(`[svc] pick 等不到浮批钮：${text}`); return false; }
    float.click();
    const ta = await waitFor(() => document.querySelector('.anno-input'));
    if (!ta) { console.log(`[svc] pick 等不到编辑器：${text}`); return false; }
    await waitFor(() => document.activeElement === ta, 1000);
    ta.value = note;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('.anno-save')].pop()?.click();
    await sleep(150);
    return true;
  };

  await sleep(300);
  window.confirm = () => true;   // headless 默认 dismiss 掉 confirm；留 / 画可的确认框都要点「是」
  // ① 登录回调：真 PKCE——授权 URL 里的 challenge 交给假服务端，exchangeCode 的 verifier 必须对得上
  const u = new URL(await buildAuthorizeUrl());
  state.challenge = u.searchParams.get('code_challenge');
  let auth = null, loginErr = '';
  try { auth = await exchangeCode('demo-code', u.searchParams.get('state')); } catch (e) { loginErr = e.message; }
  chk('svc-login-pkce-verified', state.pkceOk === true, loginErr);
  chk('svc-login-token-rotated', auth?.access_token === 'demo-access-2' && getToken() === 'demo-access-2');
  let me = null;
  try { me = await verifyToken(); } catch (e) { loginErr = e.message; }
  chk('svc-login-me-ok', me?.prAccess === true && me?.checksAccess === false, loginErr);

  // ② 清单 → 读折（app 启动时已用 demo-access-1 拉过；此刻 token 已轮换，后续请求都得用新 token）
  chk('svc-list-shows-review', document.body.textContent.includes('门下服务 demo 折'));
  chk('svc-doc-rendered', docEl.querySelectorAll('[data-line]').length > 10, `blocks=${docEl.querySelectorAll('[data-line]').length}`);
  chk('svc-open-marks-read', state.readState.state === 'read', `state=${state.readState.state}`);
  chk('svc-no-ci-badge', !document.querySelector('.check-badge, .check-fail, .check-pass'));

  // ②a 可能过时（docs/DIFF-STALE-TOAST.md）：当前版本放了 30 天 → 清单行与题签旁灰色「4 周未更新」；点标签 = 打开「更新」小框
  const cardTag = await waitFor(() => document.querySelector('#pr-list .pr-item .stale-tag'));
  chk('svc-stale-tag-list', cardTag?.textContent.trim() === '4 周未更新', cardTag?.textContent);
  const crumbTag = document.querySelector('.crumb .stale-tag');
  chk('svc-stale-tag-crumb', crumbTag?.textContent.trim() === '4 周未更新', crumbTag?.textContent);
  const crumbEl = document.querySelector('.crumb');
  chk('svc-stale-tag-grey', Boolean(crumbTag) && getComputedStyle(crumbTag).color === getComputedStyle(crumbEl).color,
    crumbTag && `${getComputedStyle(crumbTag).color} vs ${getComputedStyle(crumbEl).color}`);
  cardTag?.click();
  const staleAsk = await waitFor(() => document.querySelector('.refresh-ask'));
  chk('svc-stale-tag-opens-refresh', Boolean(staleAsk) && state.refreshes.length === 0);
  staleAsk?.querySelector('.refresh-cancel')?.click();
  await waitFor(() => !document.querySelector('.refresh-ask'));

  // ②b 续读位置：远端（别的设备）读到 L30 → 出提示条不自动跳；点了才跳；滚动后把新位置 PUT 回去
  const jumpGo = await waitFor(() => document.querySelector('.offline-jump .offline-jump-go'));
  chk('svc-resume-bar-shown', Boolean(jumpGo));
  const work = document.querySelector('.work');
  const y0 = work?.scrollTop ?? 0;
  jumpGo?.click();
  chk('svc-resume-jump-scrolls', Boolean(await waitFor(() => (work?.scrollTop ?? 0) > y0 + 50)), `y0=${y0} y=${work?.scrollTop}`);
  const pos = await waitFor(() => (state.readState.position?.device !== 'ipad' ? state.readState.position : null), 4000);
  chk('svc-readstate-position-put', Boolean(pos) && pos.document_path === 'docs/demo.md' && /^L\d+$/.test(pos.anchor || ''), JSON.stringify(pos));

  // ②d 临时提示浮层：提示出现 / 消失前后，视口里第一行正文的位置不变（不占文档流）
  const firstTop = () => {
    const vis = [...docEl.querySelectorAll('[data-line]')].find((b) => b.getBoundingClientRect().bottom > 0);
    return vis ? Math.round(vis.getBoundingClientRect().top * 10) / 10 : null;
  };
  for (let prev = null, i = 0; i < 40; i++) { const t = firstTop(); if (t === prev) break; prev = t; await sleep(50); }  // 等跳转的平滑滚动停下
  const top0 = firstTop();
  window.__say?.('门下有 3 条新动态，清单已刷新。');
  const toast = await waitFor(() => document.querySelector('.notice-layer > .notice'));
  await sleep(60);
  const top1 = firstTop();
  chk('svc-toast-overlay', Boolean(toast) && getComputedStyle(toast).position === 'absolute', toast && getComputedStyle(toast).position);
  chk('svc-toast-no-shift', top0 != null && top0 === top1, `before=${top0} after=${top1}`);
  window.__say?.('');
  await waitFor(() => !document.querySelector('.notice-layer > .notice'));
  await sleep(60);
  chk('svc-toast-gone-no-shift', firstTop() === top0, `before=${top0} after=${firstTop()}`);

  // ②c 留：⋯ 菜单「留」→ read-state shelved
  document.querySelector('.shelve-btn')?.click();
  chk('svc-shelve-put', Boolean(await waitFor(() => state.readState.state === 'shelved')), `state=${state.readState.state}`);

  // ③ 呈出 3 条涂归 = 一次原子批
  const picked = [
    await pick('划选任意文字试试涂归', '第一条：开头点题'),
    await pick('迁移到 Preact 之后', '第二条：背景太长'),
    await pick('镜片随时可以摘掉', '第三条：提到开头当卖点'),
  ];
  chk('svc-three-drafts-made', picked.every(Boolean), `picked=${picked}`);
  document.querySelector('.btn-submit')?.click();
  const b = await waitFor(() => state.batches[0]);
  chk('svc-batch-posted', Boolean(b));
  chk('svc-batch-atomic-3', b?.comments?.length === 3, `n=${b?.comments?.length}`);
  chk('svc-batch-anchor-quote', Boolean(b) && b.comments.every((c) => c.anchor?.document_path === 'docs/demo.md' && c.anchor.quote && c.anchor.line > 0),
    JSON.stringify(b?.comments?.map((c) => c.anchor)));
  chk('svc-batch-revision-no', b?.revision_no === 2, `rev=${b?.revision_no}`);
  chk('svc-batch-body-is-note', Boolean(b) && b.comments.every((c) => !c.body.startsWith('>')) && b.comments[0]?.body === '第一条：开头点题');
  chk('svc-shown-threads-reloaded', Boolean(await waitFor(() => document.querySelectorAll('.anno-quote-shown').length >= 3)),
    `shown=${document.querySelectorAll('.anno-quote-shown').length}`);
  chk('svc-submit-button-gone', Boolean(await waitFor(() => !document.querySelector('.btn-submit'))));

  // ③b 锚点 400（docs/ANCHOR-FAIL-UX.md + docs/SHORT-QUOTE.md）：第 2 条划选跨了链接，渲染文本在 markdown 原文里找不到 → 逐条 400。
  // 第 3 条是两个汉字的短划选（2026-11-26「竞品」报障的形状），带了上下文就该过。
  // 不许整批失败了事：其余两条自动重呈落库；第 2 条留作草稿、标红原因，问询条标出它；点「改成整折评论再呈」→ 只重发它、草稿清空
  const draftCards = () => document.querySelectorAll('#margin-col .anno-card:not(.anno-shown):not(.zongpi-card)');
  const nBatches = state.batches.length;
  const pickedB = [
    await pick('第 3 段填充', '这条锚得上'),
    await pick('见 另一折 与 本折某行', '这条跨了链接'),
    await pick('镜片', '推荐点镜片我来试用一下'),
  ];
  chk('svc-anchorfail-drafts-made', pickedB.every(Boolean) && draftCards().length === 3, `picked=${pickedB} n=${draftCards().length}`);
  document.querySelector('.btn-submit')?.click();
  const bar = await waitFor(() => document.querySelector('.anchor-fail'));
  chk('svc-anchorfail-bar-shown', Boolean(bar) && bar.textContent.includes('第 2 条') && bar.textContent.includes('见 另一折 与 本折某行'), bar?.textContent);
  chk('svc-anchorfail-no-github-wording', !document.body.textContent.includes('GitHub 返回'));
  const b1 = await waitFor(() => state.batches[nBatches]);
  chk('svc-anchorfail-partial-resent', Boolean(b1) && b1.comments.length === 2 && b1.comments[0].anchor?.quote === '第 3 段填充' && b1.comments[1].anchor?.quote === '镜片',
    JSON.stringify(b1?.comments));
  const short = b1?.comments?.[1]?.anchor;
  chk('svc-anchorfail-short-cjk-context', Boolean(short) && Boolean(short.prefix || short.suffix) && (short.prefix || '').length <= 64 && (short.suffix || '').length <= 64,
    JSON.stringify(short));
  await waitFor(() => draftCards().length === 1);
  const failedCard = document.querySelector('.anno-card.anno-failed');
  chk('svc-anchorfail-card-marked', Boolean(failedCard) && failedCard.textContent.includes('这条跨了链接') && failedCard.querySelector('.anno-fail-reason')?.textContent.includes('找不到'),
    failedCard?.textContent);
  chk('svc-anchorfail-failed-kept', draftCards().length === 1 && state.batches.length === nBatches + 1, `drafts=${draftCards().length} batches=${state.batches.length}`);
  document.querySelector('.anchor-fail .anchor-fail-whole')?.click();
  const b2 = await waitFor(() => state.batches[nBatches + 1]);
  chk('svc-anchorfail-whole-resent', Boolean(b2) && b2.comments.length === 1
    && b2.comments[0].anchor === null && b2.comments[0].body === '> 见 另一折 与 本折某行\n\n这条跨了链接', JSON.stringify(b2?.comments));
  chk('svc-anchorfail-drafts-cleared', Boolean(await waitFor(() => !draftCards().length && !document.querySelector('.btn-submit') && !document.querySelector('.anchor-fail'))),
    `drafts=${draftCards().length}`);

  // 让 app 的事件游标先对齐到「现在」（首轮只记游标），之后的新版本才算增量
  await window.__svcPoll?.();

  // ④ 判 = request_changes + note
  [...document.querySelectorAll('.actions .btn-ghost')].find((el) => el.textContent.trim() === '判')?.click();
  const ta = await waitFor(() => document.querySelector('.anno-input'));
  chk('svc-judge-editor-open', Boolean(ta));
  if (ta) {
    ta.value = '开头先改，结尾留着。';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // 必答题没答就呈：判框自己拦下并提示，不打服务端
    [...document.querySelectorAll('.anno-save')].pop()?.click();
    chk('svc-judge-requires-answer', Boolean(await waitFor(() => document.querySelector('.decision-err'))) && state.decisions.length === 0);
    // 不许静默（rv_01M810…「点呈没反应」）：未答的那题标红、题下一行「先回答：…」、焦点落到该题、提示在视口内
    const q1 = document.querySelector('.decision-q[data-qid="q1"]');
    chk('svc-judge-missing-marked', Boolean(q1?.classList.contains('decision-q-missing')), q1?.className);
    const hint = q1?.querySelector('.decision-err');
    chk('svc-judge-missing-hint', /^先回答：「先改哪头？」/.test(hint?.textContent || ''), hint?.textContent);
    chk('svc-judge-missing-focused', Boolean(q1?.contains(document.activeElement)), document.activeElement?.outerHTML?.slice(0, 80));
    const hr = hint?.getBoundingClientRect();
    chk('svc-judge-missing-in-viewport', Boolean(hr) && hr.top >= 0 && hr.bottom <= window.innerHeight, JSON.stringify(hr));
    document.querySelector('.decision-q[data-qid="q1"] input[value="a"]')?.click();
    await sleep(60);
    chk('svc-judge-missing-cleared-on-answer', !document.querySelector('.decision-q-missing'));
    const ft = document.querySelector('.decision-q[data-qid="q2"] .decision-text');
    if (ft) { ft.value = '标题也顺手改短'; ft.dispatchEvent(new Event('input', { bubbles: true })); }
    // 题答了、判语空：同样不许静默
    ta.value = '';
    await sleep(60);
    [...document.querySelectorAll('.anno-save')].pop()?.click();
    const noteErr = await waitFor(() => document.querySelector('.zongpi-card .decision-note-err'));
    chk('svc-judge-empty-note-warns', /判语/.test(noteErr?.textContent || '') && state.decisions.length === 0, noteErr?.textContent);
    ta.value = '开头先改，结尾留着。';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(60);
    [...document.querySelectorAll('.anno-save')].pop()?.click();
  }
  const d1 = await waitFor(() => state.decisions[0]);
  chk('svc-judge-is-request-changes', d1?.verdict === 'request_changes' && d1?.note === '开头先改，结尾留着。', JSON.stringify(d1));
  chk('svc-judge-answers-sent', JSON.stringify(d1?.answers) === JSON.stringify([{ question_id: 'q1', option_ids: ['a'] }, { question_id: 'q2', text: '标题也顺手改短' }]), JSON.stringify(d1?.answers));
  chk('svc-judge-revision-no', d1?.revision_no === 2);
  chk('svc-status-changes-requested', state.review.status === 'changes_requested' || state.revisions.length === 3, state.review.status);
  chk('svc-judge-shown-in-thread', Boolean(await waitFor(() => document.body.textContent.includes('开头先改，结尾留着。'))));

  // ④b D-17：判后（changes_requested）同版本直接画可应成功，不再 409。探完回滚状态，不影响后面的流程。
  if (state.revisions.length === 2 && state.review.status === 'changes_requested') {
    const snap = { status: state.review.status, closed: state.review.closed_at, upd: state.review.updated_at, nd: state.decisions.length, ne: state.events.length };
    const r = await window.fetch(`${API_BASE}/reviews/${RID}/decisions`, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${state.tokens.access}` },
      body: JSON.stringify({ revision_no: 2, verdict: 'approve', answers: [{ question_id: 'q1', option_ids: ['a'] }] }),
    });
    chk('svc-approve-after-judge-same-version', r.status === 201 && state.review.status === 'approved', `status=${r.status} review=${state.review.status}`);
    state.decisions.length = snap.nd; state.events.length = snap.ne;
    state.review.status = snap.status; state.review.closed_at = snap.closed; state.review.updated_at = snap.upd;
  } else {
    chk('svc-approve-after-judge-same-version', false, `前置不满足 rev=${state.revisions.length} status=${state.review.status}`);
  }

  // ⑤ agent 推新版（事件 revision.created）→ 增量刷新把当前折切到 v3
  await waitFor(() => state.revisions.length === 3, 2000);
  const hitsBefore = state.contentHits.filter((n) => n === 3).length;
  await window.__svcPoll?.();
  chk('svc-events-reopen-head', Boolean(await waitFor(() => state.contentHits.filter((n) => n === 3).length > hitsBefore)), `hits=${state.contentHits}`);
  // 游标每标签一份（sessionStorage，bughunt P2-3）
  chk('svc-events-cursor-advanced', sessionStorage.getItem('menxia.svc.events') === String(state.events.length), `cur=${sessionStorage.getItem('menxia.svc.events')} n=${state.events.length}`);
  chk('svc-events-notice', Boolean(await waitFor(() => /v3/.test(document.querySelector('.notice')?.textContent || ''))), document.querySelector('.notice')?.textContent);

  // ⑤a 版本对比（docs/DIFF-STALE-TOAST.md）。v3 是 agent 刚推的（「现在」）→ 过时标签消失
  chk('svc-stale-tag-gone-after-new-rev', Boolean(await waitFor(() => !document.querySelector('.crumb .stale-tag'))));
  document.querySelector('.more-btn')?.click();
  const diffBtn = await waitFor(() => document.querySelector('.diff-btn'));
  chk('svc-diff-entry-in-menu', diffBtn?.textContent.trim() === '对比版本', diffBtn?.textContent);
  const hits0 = state.contentHits.length;
  diffBtn?.click();
  const qd = () => new URL(location.href).searchParams.get('diff');
  await waitFor(() => document.querySelector('.diff-view .diff-doc'));
  chk('svc-diff-default-prev-to-cur', qd() === '2..3' && document.querySelector('.diff-a')?.value === '2' && document.querySelector('.diff-b')?.value === '3',
    `diff=${qd()} a=${document.querySelector('.diff-a')?.value} b=${document.querySelector('.diff-b')?.value}`);
  // v3 是原样推的：sha 相同 → 直接标「未改」，不拉正文
  chk('svc-diff-same-sha-skips-fetch', document.querySelector('.diff-doc-same .diff-kind')?.textContent === '未改' && state.contentHits.length === hits0,
    `hits+=${state.contentHits.slice(hits0)}`);
  chk('svc-diff-hides-reader', Boolean(document.querySelector('.work.work-hidden')));
  // 切到 v1 → v3：附录删了、正文改了（行级 + 字符级 + 折叠）；URL 跟着变
  const selA = document.querySelector('.diff-a');
  if (selA) { selA.value = '1'; selA.dispatchEvent(new Event('change', { bubbles: true })); }
  const mod = await waitFor(() => document.querySelector('.diff-doc-modified .diff-rows'));
  chk('svc-diff-switch-url', qd() === '1..3', `diff=${qd()}`);
  chk('svc-diff-doc-kinds', Boolean(mod) && document.querySelector('.diff-doc-removed .diff-path')?.textContent === 'docs/附录.md'
    && document.querySelector('.diff-doc-removed .diff-kind')?.textContent === '删除');
  chk('svc-diff-lines-added', (mod?.querySelectorAll('.diff-line.diff-add').length || 0) > 5, `add=${mod?.querySelectorAll('.diff-line.diff-add').length}`);
  const hiOf = (sel) => [...(mod?.querySelectorAll(sel) || [])].map((m) => m.textContent).join('|');
  chk('svc-diff-char-level', /看到这/.test(hiOf('.diff-del .diff-ch')) && /见此/.test(hiOf('.diff-add .diff-ch')) && !/滚到底/.test(hiOf('.diff-ch')),
    `del=${hiOf('.diff-del .diff-ch')} add=${hiOf('.diff-add .diff-ch')}`);
  const delRow = mod?.querySelector('.diff-line.diff-del'), addRow = mod?.querySelector('.diff-line.diff-add'), eqRow = mod?.querySelector('.diff-line.diff-eq');
  chk('svc-diff-colors', Boolean(delRow && addRow && eqRow) && /220, 60, 60/.test(getComputedStyle(delRow).backgroundColor)
    && /46, 160, 67/.test(getComputedStyle(addRow).backgroundColor) && getComputedStyle(delRow).color === getComputedStyle(eqRow).color,
    delRow && `${getComputedStyle(delRow).backgroundColor} / ${addRow && getComputedStyle(addRow).backgroundColor}`);
  const fold = mod?.querySelector('.diff-fold');
  const nLines = mod?.querySelectorAll('.diff-line').length || 0;
  fold?.click();
  chk('svc-diff-fold-expand', Boolean(fold) && Boolean(await waitFor(() => mod.querySelectorAll('.diff-line').length > nLines)),
    `before=${nLines} after=${mod?.querySelectorAll('.diff-line').length}`);
  chk('svc-diff-readonly', !document.querySelector('.diff-view textarea, .diff-view .zhupi-float'));
  document.querySelector('.diff-close')?.click();
  // 三个条件一起等：?diff 由 ui.js 的 useEffect 在 DOM 提交**之后**才删，只等 .diff-view 消失再读 URL 会偶发读到旧值
  chk('svc-diff-close', Boolean(await waitFor(() => !document.querySelector('.diff-view') && qd() === null && !document.querySelector('.work.work-hidden'))),
    `diff=${qd()}`);

  // ⑥ 画可 = approve 带 revision_no=3（所批即所合）；这折带题，画可先走判框答题
  const qinci = await waitFor(() => document.querySelector('.btn-qinci:not([disabled])'));
  qinci?.click();
  const approveCard = await waitFor(() => document.querySelector('.zongpi-card.verdict-approve'));
  chk('svc-approve-opens-questions', Boolean(approveCard) && Boolean(approveCard?.querySelector('.decision-q[data-qid="q1"]')));
  approveCard?.querySelector('.decision-q[data-qid="q1"] input[value="b"]')?.click();
  await sleep(60);
  [...document.querySelectorAll('.anno-save')].pop()?.click();
  const ap = await waitFor(() => state.decisions.find((d) => d.verdict === 'approve'));
  chk('svc-approve-posted', Boolean(ap));
  chk('svc-approve-answers-sent', JSON.stringify(ap?.answers) === JSON.stringify([{ question_id: 'q1', option_ids: ['b'] }]), JSON.stringify(ap?.answers));
  chk('svc-approve-revision-no', ap?.revision_no === 3, `rev=${ap?.revision_no}`);
  chk('svc-status-approved', state.review.status === 'approved', state.review.status);
  chk('svc-archived-readonly', Boolean(await waitFor(() => !document.querySelector('.btn-qinci'))));

  // ⑥a 「更新」（D-19）：已画可的折放久了 → ⋯「更新」→ 小框填一句 → 排队中 → 执行器推进 → 已更新到第 N 版（折回到待读）
  const rbtn = await waitFor(() => document.querySelector('.refresh-req-btn'));
  chk('svc-refresh-btn-shown', Boolean(rbtn) && rbtn.textContent.trim() === '更新');
  rbtn?.click();
  const ask = await waitFor(() => document.querySelector('.refresh-ask'));
  const rta = ask?.querySelector('textarea');
  chk('svc-refresh-ask-open', Boolean(rta) && /价格再核一遍/.test(rta.placeholder));
  if (rta) rta.value = '价格再核一遍';
  ask?.querySelector('.refresh-ok')?.click();
  const rq = await waitFor(() => state.refreshes[0]);
  chk('svc-refresh-posted', rq?.status === 'queued' && rq?.note === '价格再核一遍' && !document.querySelector('.refresh-ask'), JSON.stringify(rq));
  chk('svc-refresh-bar-queued', Boolean(await waitFor(() => /排队中/.test(document.querySelector('.refresh-bar.refresh-queued')?.textContent || ''))),
    document.querySelector('.refresh-bar')?.textContent);
  chk('svc-refresh-btn-disabled-pending', Boolean(document.querySelector('.refresh-req-btn[disabled]')));
  // 重复点：服务端幂等回同一条（200），不新开第二条
  let again = null;
  try { again = await requestRefresh(RID, '再点一次'); } catch (e) { again = { err: e.message }; }
  chk('svc-refresh-repeat-same', again?.request_id === rq?.request_id && state.refreshes.length === 1, JSON.stringify(again));
  advanceRefresh('running');
  await window.__svcPoll?.();
  chk('svc-refresh-bar-running', Boolean(await waitFor(() => document.querySelector('.refresh-bar.refresh-running'))), document.querySelector('.refresh-bar')?.textContent);
  advanceRefresh('done');
  await window.__svcPoll?.();
  const doneBar = await waitFor(() => document.querySelector('.refresh-bar.refresh-done'));
  chk('svc-refresh-bar-done', /已更新到第 4 版/.test(doneBar?.textContent || ''), doneBar?.textContent || document.querySelector('.refresh-bar')?.textContent);
  chk('svc-refresh-reopened-open', state.review.status === 'open' && Boolean(await waitFor(() => state.contentHits.includes(4))) && Boolean(await waitFor(() => document.querySelector('.btn-qinci'))),
    `status=${state.review.status} hits=${state.contentHits}`);

  // ⑥b 已关栏：被关（rejected）的折不在待审也不在已画可；侧栏「已关」点开才取 status=rejected,withdrawn
  state.review.status = 'rejected';
  state.review.closed_at = now();
  const closedTab = document.querySelector('.list-tab[data-tab="closed"]');
  closedTab?.click();
  // 先等「已关」取回来（⑥a 更新后这折回到了待审，旧清单里的同名卡会被误抓）
  await waitFor(() => closedTab?.textContent.trim() === '已关 1');
  const closedCard = await waitFor(() => [...document.querySelectorAll('#pr-list .pr-item')].find((el) => el.textContent.includes('门下服务 demo 折')));
  chk('svc-closed-tab-lists-rejected', Boolean(closedCard) && closedTab?.textContent.trim() === '已关 1', closedTab?.textContent);
  closedCard?.click();
  await sleep(300);
  chk('svc-closed-open-readonly', Boolean(await waitFor(() => docEl.querySelectorAll('[data-line]').length > 10)) && !document.querySelector('.btn-qinci'));

  // ⑦ 登出作废 grant
  await logout();
  chk('svc-logout-revokes-grant', state.loggedOut === true && state.revokedVia === 'rfc7009' && getToken() === '');
  try { localStorage.removeItem('menxia.svc.events'); sessionStorage.removeItem('menxia.svc.events'); } catch { /* 无痕 */ }

  console.log(`[svc] RESULT pass=${pass} fail=${fail}`);
}
