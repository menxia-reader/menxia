// ?demo=1&svc=1 —— 门下服务 driver 的冒烟靶（M3c）：拦 fetch 伪造一个内存版门下服务，
// 让 **真实的 service-api.js**（PKCE、bearer、批量呈出、判、画可、read-state、事件流）整条路径跑一遍。
// 与 demoApi（GitHub 形状的桩）互不相干：那边测消费层，这边测 driver + 消费层的接缝。
//
// 不写任何真实 token：token 全是 demo-* 字面量，且 service-api 的 auth 存储换成内存（setAuthStorage），
// 不碰真用户 localStorage 里的 menxia.svc.auth。
import {
  SERVICE_URL, API_BASE, setAuthStorage, memoryAuthStorage, s256,
  buildAuthorizeUrl, exchangeCode, getToken, verifyToken, logout,
} from './service-api.js';

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
};

function seed({ DOC, DOC_OLD }) {
  state.revisions = [
    { id: 'rev_1', revision_no: 1, text: DOC_OLD, change_note: '初稿', created_at: ago(2) },
    { id: 'rev_2', revision_no: 2, text: DOC, change_note: '补加长段', created_at: ago(1) },
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
const revisionOut = (r) => ({
  id: r.id, revision_no: r.revision_no, change_note: r.change_note, created_by_kind: 'agent', created_at: r.created_at,
  content_hash: `h${r.revision_no}`,
  documents: [{ path: 'docs/demo.md', lang: 'zh-CN', title: '涂归 demo 折', bytes: r.text.length, sha256: `s${r.revision_no}` }],
  attachments: [],
});
const listItem = () => ({
  ...state.review, current_revision_no: cur().revision_no, read_state: state.readState,
});
const full = () => ({
  ...listItem(), current_revision: revisionOut(cur()), revisions: state.revisions.map(revisionOut),
  counts: { comments: state.comments.length, decisions: state.decisions.length },
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
    if (!r || decodeURIComponent(content[2]) !== 'docs/demo.md') return ERR(404, 'not_found');
    state.contentHits.push(r.revision_no);
    return new Response(r.text, { status: 200, headers: { 'content-type': 'text/markdown; charset=utf-8' } });
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
    for (let i = 0; i < (b.comments || []).length; i++) {
      const a = b.comments[i].anchor;
      if (!b.comments[i].body) return ERR(400, 'invalid_argument', 'body required', { index: i });
      if (a && (a.document_path !== 'docs/demo.md' || !text.includes(norm(a.quote)))) return ERR(400, 'invalid_argument', 'quote not found', { index: i });
    }
    state.batches.push(b);
    return J({ items: b.comments.map((c) => mkComment(c, cur().revision_no)) }, 201);
  }
  if (sub === '/comments' && method === 'POST') return J(mkComment(body(), cur().revision_no), 201);
  if (sub === '/decisions' && method === 'GET') return J({ items: state.decisions });
  if (sub === '/decisions' && method === 'POST') {
    const b = body();
    if (!['open', 'changes_requested'].includes(state.review.status)) return ERR(409, 'review_closed');
    if (b.revision_no !== cur().revision_no) return ERR(409, 'stale_revision');
    if (b.verdict === 'approve' && state.review.status === 'changes_requested') return ERR(409, 'conflict', 'changes_requested 上不能直接 approve，须等新版本');
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
  try { localStorage.removeItem('menxia.svc.events'); } catch { /* 无痕 */ }
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

  // ②b 续读位置：远端（别的设备）读到 L30 → 出提示条不自动跳；点了才跳；滚动后把新位置 PUT 回去
  const jumpGo = await waitFor(() => document.querySelector('.offline-jump .offline-jump-go'));
  chk('svc-resume-bar-shown', Boolean(jumpGo));
  const work = document.querySelector('.work');
  const y0 = work?.scrollTop ?? 0;
  jumpGo?.click();
  chk('svc-resume-jump-scrolls', Boolean(await waitFor(() => (work?.scrollTop ?? 0) > y0 + 50)), `y0=${y0} y=${work?.scrollTop}`);
  const pos = await waitFor(() => (state.readState.position?.device !== 'ipad' ? state.readState.position : null), 4000);
  chk('svc-readstate-position-put', Boolean(pos) && pos.document_path === 'docs/demo.md' && /^L\d+$/.test(pos.anchor || ''), JSON.stringify(pos));

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
    document.querySelector('.decision-q[data-qid="q1"] input[value="a"]')?.click();
    const ft = document.querySelector('.decision-q[data-qid="q2"] .decision-text');
    if (ft) { ft.value = '标题也顺手改短'; ft.dispatchEvent(new Event('input', { bubbles: true })); }
    await sleep(60);
    [...document.querySelectorAll('.anno-save')].pop()?.click();
  }
  const d1 = await waitFor(() => state.decisions[0]);
  chk('svc-judge-is-request-changes', d1?.verdict === 'request_changes' && d1?.note === '开头先改，结尾留着。', JSON.stringify(d1));
  chk('svc-judge-answers-sent', JSON.stringify(d1?.answers) === JSON.stringify([{ question_id: 'q1', option_ids: ['a'] }, { question_id: 'q2', text: '标题也顺手改短' }]), JSON.stringify(d1?.answers));
  chk('svc-judge-revision-no', d1?.revision_no === 2);
  chk('svc-status-changes-requested', state.review.status === 'changes_requested' || state.revisions.length === 3, state.review.status);
  chk('svc-judge-shown-in-thread', Boolean(await waitFor(() => document.body.textContent.includes('开头先改，结尾留着。'))));

  // ⑤ agent 推新版（事件 revision.created）→ 增量刷新把当前折切到 v3
  await waitFor(() => state.revisions.length === 3, 2000);
  const hitsBefore = state.contentHits.filter((n) => n === 3).length;
  await window.__svcPoll?.();
  chk('svc-events-reopen-head', Boolean(await waitFor(() => state.contentHits.filter((n) => n === 3).length > hitsBefore)), `hits=${state.contentHits}`);
  chk('svc-events-cursor-advanced', localStorage.getItem('menxia.svc.events') === String(state.events.length), `cur=${localStorage.getItem('menxia.svc.events')} n=${state.events.length}`);
  chk('svc-events-notice', Boolean(await waitFor(() => /v3/.test(document.querySelector('.notice')?.textContent || ''))), document.querySelector('.notice')?.textContent);

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

  // ⑦ 登出作废 grant
  await logout();
  chk('svc-logout-revokes-grant', state.loggedOut === true && getToken() === '');
  try { localStorage.removeItem('menxia.svc.events'); } catch { /* 无痕 */ }

  console.log(`[svc] RESULT pass=${pass} fail=${fail}`);
}
