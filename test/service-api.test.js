// service-api.js（门下服务 driver，M3c）：出口对账 + 形状翻译纯函数 + PKCE + 请求装配（fetch 打桩，不出网）。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const kv = new Map();
globalThis.localStorage = {
  getItem: (k) => (kv.has(k) ? kv.get(k) : null),
  setItem: (k, v) => kv.set(k, String(v)),
  removeItem: (k) => kv.delete(k),
};
const session = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k),
};

const gh = await import('../src/github.js');
const svc = await import('../src/service-api.js');
const store = await import('../src/store.js');
const backend = await import('../src/backend.js');

// ── 出口对账：github.js 的每个出口门下 driver 都要有（除三个设计内缺口）；store 也都转发 ──
const GAPS = new Set(['checkVerdict', 'markReady']);   // CLIENT-MAPPING 缺口：无 CI、无 draft，故意不导出
test('出口对账：github.js 出口 ⊆ service-api.js 出口 ∪ 已知缺口', () => {
  const missing = Object.keys(gh).filter((k) => !(k in svc) && !GAPS.has(k));
  assert.deepEqual(missing, [], `github.js 有而 service-api.js 没有：${missing}`);
  for (const g of GAPS) assert.ok(!(g in svc), `${g} 是设计内缺口，不该导出（ui 靠 has() 藏入口）`);
});
test('store 转发门下独有出口（login/logout/pollEvents/markRead/enrichPR）', () => {
  for (const k of ['login', 'logout', 'pollEvents', 'markRead', 'enrichPR', 'has', 'feature']) assert.equal(typeof store[k], 'function', k);
});
test('backend：默认 github；setBackend 落盘；非法值回落 github', () => {
  kv.clear();
  assert.equal(backend.getBackend(), 'github');
  backend.setBackend('service'); assert.equal(backend.getBackend(), 'service');
  backend.setBackend('nonsense'); assert.equal(backend.getBackend(), 'github');
  assert.equal(backend.nextBackend('github'), 'service');
});
test('store 默认 driver 仍是 github（数据源未设时 M3c 不改任何 GitHub 路径）', () => {
  assert.equal(store.getAdapter(), gh);
  assert.equal(store.has('checkVerdict'), true);
  store.setAdapter(svc);
  try { assert.equal(store.has('checkVerdict'), false); assert.equal(store.feature('anchorsByQuote'), true); }
  finally { store.setAdapter(gh); }
});

// ── 形状翻译 ──
const REVIEW = {
  id: 'rv_01ARZ3NDEKTSV4RRFFQ69G5FAV', title: '测试折', summary: '摘要', status: 'open', current_revision_no: 2,
  labels: ['kind:读物', 'wait:你拍'], created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
  closed_at: null, role: 'owner', is_decider: true, read_state: { state: 'unread' },
  questions: [{ id: 'q1', text: '选哪个？', options: [{ id: 'a', label: '甲' }, { id: 'b', label: '乙' }] }],
  current_revision: { id: 'rev_2', revision_no: 2, documents: [{ path: 'docs/a.md', lang: 'zh-CN', sha256: 'x' }], attachments: [{ path: 'assets/p.png', media_type: 'image/png' }] },
  revisions: [
    { id: 'rev_2', revision_no: 2, change_note: '改', created_at: '2026-11-02T00:00:00Z' },
    { id: 'rev_1', revision_no: 1, change_note: null, created_at: '2026-11-01T00:00:00Z' },
  ],
};
test('toPR：review → GitHub PR 形状（number=id、head.sha=id@rev、labels 包 name、approved 才有 merged_at）', () => {
  const pr = svc.toPR(REVIEW);
  assert.equal(pr.number, REVIEW.id);
  assert.equal(pr.head.sha, `${REVIEW.id}@2`);
  assert.deepEqual(pr.labels.map((l) => l.name), ['kind:读物', 'wait:你拍']);
  assert.equal(pr.merged_at, null);
  assert.equal(pr.draft, false);
  assert.match(pr.body, /摘要/); assert.match(pr.body, /- \[ \] 甲/);   // questions → 勾选框，folder-body 能读
  const done = svc.toPR({ ...REVIEW, status: 'approved', closed_at: '2026-11-03T00:00:00Z' });
  assert.equal(done.merged_at, '2026-11-03T00:00:00Z');
});
test('parseRef/refOf 往返；filesOf 文档+附件、patch=null；commitsOf 按 revision_no 升序 v1…vN', () => {
  assert.deepEqual(svc.parseRef(svc.refOf('rv_x', 3)), { id: 'rv_x', no: 3 });
  const files = svc.filesOf(REVIEW);
  assert.deepEqual(files.map((f) => f.filename), ['docs/a.md', 'assets/p.png']);
  assert.equal(files[0].patch, null);
  const cs = svc.commitsOf(REVIEW);
  assert.deepEqual(cs.map((c) => c.sha), [`${REVIEW.id}@1`, `${REVIEW.id}@2`]);
  assert.equal(cs[0].commit.message, 'v1');
});
test('splitComments：带锚点→inline（body 复原 `> 引文`，回话挂 in_reply_to_id，unanchored→line=null）；无锚点→会话区；软删滤掉', () => {
  const items = [
    { id: 'c1', parent_id: null, body: '太谦虚', author: { kind: 'human', display_name: 'charlie' }, created_at: 't1',
      anchor: { document_path: 'docs/a.md', line: 20, quote: '镜片随时可以摘掉' }, anchor_current: { line: 22 }, anchor_state: 'relocated' },
    { id: 'c2', parent_id: 'c1', body: '已接受', author: { kind: 'agent' }, created_at: 't2', anchor: null },
    { id: 'c3', parent_id: null, body: '旧句', author: { kind: 'human' }, created_at: 't3', anchor: { document_path: 'docs/a.md', line: 7, quote: 'x' }, anchor_state: 'unanchored' },
    { id: 'c4', parent_id: null, body: '整单留一句', author: { kind: 'human' }, created_at: 't4', anchor: null },
    { id: 'c5', parent_id: null, body: null, deleted: true, author: { kind: 'human' }, created_at: 't5', anchor: null },
  ];
  const { inline, convo } = svc.splitComments(items);
  assert.deepEqual(inline.map((c) => c.id), ['c1', 'c2', 'c3']);
  assert.equal(inline[0].body, '> 镜片随时可以摘掉\n\n太谦虚');
  assert.equal(inline[0].line, 22);
  assert.equal(inline[0].user.login, 'charlie');
  assert.equal(inline[1].in_reply_to_id, 'c1'); assert.equal(inline[1].body, '已接受'); assert.equal(inline[1].user.login, 'agent');
  assert.equal(inline[2].line, null); assert.equal(inline[2].original_line, 7);
  assert.deepEqual(convo.map((c) => c.id), ['c4']);
});
test('decisionToComment：判/画可渲成会话区条目（verdict 中文 + 版本 + answers + note）', () => {
  const c = svc.decisionToComment({ id: 'd1', verdict: 'request_changes', revision_no: 2, note: '改开头', created_at: 't',
    answers: [{ question_id: 'q1', option_ids: ['a'] }], decider: { display_name: 'charlie' } });
  assert.match(c.body, /判（改）/); assert.match(c.body, /v2/); assert.match(c.body, /q1：a/); assert.match(c.body, /改开头/);
});
test('batchPayload：选区草稿 → 原子批（quote 为准、line 提示、revision_no 自 commitId；fallback 成无锚点一条）', () => {
  const p = svc.batchPayload({
    commitId: 'rv_x@2', fallbackBody: '两条旧版草稿',
    comments: [{ path: 'docs/a.md', line: 20, quote: '镜片随时可以摘掉', note: '提到开头', body: '> 镜片随时可以摘掉\n\n提到开头' }],
  });
  assert.equal(p.revision_no, 2);
  assert.deepEqual(p.comments[0], { body: '提到开头', anchor: { document_path: 'docs/a.md', quote: '镜片随时可以摘掉', line: 20 } });
  assert.deepEqual(p.comments[1], { body: '两条旧版草稿', anchor: null });
});

// ── PKCE ──
test('PKCE：S256(verifier) 与 RFC 7636 附录 B 向量一致；授权 URL 带全字段且 verifier 只进 sessionStorage', async () => {
  assert.equal(await svc.s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const loc = { origin: 'https://menxia-reader.github.io', pathname: '/menxia/index.html' };
  const url = new URL(await svc.buildAuthorizeUrl({ loc }));
  assert.equal(url.origin + url.pathname, `${svc.SERVICE_URL}/oauth/authorize`);
  assert.equal(url.searchParams.get('client_id'), 'menxia-web');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://menxia-reader.github.io/menxia/oauth.html');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'reviewer');
  assert.equal(url.searchParams.get('resource'), `${svc.SERVICE_URL}/api/v1`);
  const pk = JSON.parse(sessionStorage.getItem('menxia.svc.pkce'));
  assert.equal(await svc.s256(pk.verifier), url.searchParams.get('code_challenge'));
  assert.equal(pk.state, url.searchParams.get('state'));
  assert.equal(kv.has('menxia.svc.pkce'), false);
});

// ── 请求装配 ──
let calls;
const res = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300, status, statusText: 'S',
  headers: { get: (h) => headers[h] ?? null },
  json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  blob: async () => body,
});
function stubFetch(responder) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url, opts }); return responder(url, opts, calls.length); };
}
beforeEach(() => { kv.clear(); session.clear(); svc.setAuthStorage(svc.memoryAuthStorage({ access_token: 'A1', refresh_token: 'R1', expires_at: Date.now() + 3600e3 })); });

test('exchangeCode：state 不符拒绝；相符则 form 体带 code_verifier/redirect_uri/resource，存 token 并清 PKCE', async () => {
  const loc = { origin: 'http://127.0.0.1:4188', pathname: '/index.html' };
  const url = new URL(await svc.buildAuthorizeUrl({ loc }));
  await assert.rejects(() => svc.exchangeCode('c', 'wrong-state'), /state/);
  session.set('menxia.svc.pkce', JSON.stringify({ verifier: 'v', state: 's', redirect_uri: 'http://127.0.0.1:4188/oauth.html' }));
  stubFetch(() => res(200, { access_token: 'A2', refresh_token: 'R2', expires_in: 86400, token_type: 'Bearer', client_kind: 'first_party' }));
  const auth = await svc.exchangeCode('the-code', 's');
  assert.equal(calls[0].url, `${svc.SERVICE_URL}/oauth/token`);
  const form = new URLSearchParams(calls[0].opts.body);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('code'), 'the-code'); assert.equal(form.get('code_verifier'), 'v');
  assert.equal(form.get('redirect_uri'), 'http://127.0.0.1:4188/oauth.html');
  assert.equal(form.get('client_id'), 'menxia-web'); assert.equal(form.get('resource'), `${svc.SERVICE_URL}/api/v1`);
  assert.equal(auth.access_token, 'A2'); assert.equal(svc.getToken(), 'A2');
  assert.equal(session.has('menxia.svc.pkce'), false);
  void url;
});

test('401 → 用 refresh 轮换一次再重放；refresh 失败(400) → 清 token，错误 tokenDead', async () => {
  stubFetch((url, opts, n) => {
    if (n === 1) return res(401, { error: { code: 'unauthenticated', message: 'expired' } });
    if (n === 2) { assert.equal(url, `${svc.SERVICE_URL}/oauth/token`); assert.equal(new URLSearchParams(opts.body).get('refresh_token'), 'R1'); return res(200, { access_token: 'A2', refresh_token: 'R2', expires_in: 86400 }); }
    assert.equal(opts.headers.Authorization, 'Bearer A2');
    return res(200, { id: 'u1', allowed: true });
  });
  const v = await svc.verifyToken();
  assert.equal(v.prAccess, true); assert.equal(v.checksAccess, false);
  assert.equal(calls.length, 3);
  assert.equal(svc.getToken(), 'A2');

  stubFetch((url, opts, n) => (n === 1 ? res(401, { error: { code: 'unauthenticated' } }) : res(400, { error: 'invalid_grant' })));
  await assert.rejects(() => svc.verifyToken(), (e) => e.status === 401 && e.tokenDead === true);
  assert.equal(svc.getToken(), '');
});

test('429 → rateLimited（不是 tokenDead）；403 两者皆非', async () => {
  stubFetch(() => res(429, { error: { code: 'rate_limited', retry_after_seconds: 7 } }));
  await assert.rejects(() => svc.listOpenPRs(), (e) => e.rateLimited === true && e.tokenDead === false && e.retryAfter === 7);
  stubFetch(() => res(403, { error: { code: 'permission_denied' } }));
  await assert.rejects(() => svc.listOpenPRs(), (e) => e.status === 403 && !e.rateLimited && !e.tokenDead);
});

test('listOpenPRs：status=open,changes_requested，跟 next_cursor 翻页；listMergedPRs：approved', async () => {
  stubFetch((url, _o, n) => {
    if (n === 1) { assert.match(url, /\/reviews\?status=open,changes_requested&limit=50$/); return res(200, { items: [{ ...REVIEW, id: 'rv_1' }], next_cursor: 'C2' }); }
    if (n === 2) { assert.match(url, /cursor=C2$/); return res(200, { items: [{ ...REVIEW, id: 'rv_2' }], next_cursor: null }); }
    assert.match(url, /status=approved/); return res(200, { items: [], next_cursor: null });
  });
  const list = await svc.listOpenPRs();
  assert.deepEqual(list.map((p) => p.number), ['rv_1', 'rv_2']);
  assert.deepEqual(await svc.listMergedPRs(), []);
});

test('getFileText：路径按段 percent-encode，落在 /revisions/{no}/content/{path}', async () => {
  stubFetch((url) => { assert.equal(url, `${svc.API_BASE}/reviews/rv_x/revisions/2/content/docs/%E4%B8%AD%E6%96%87.md`); return res(200, '# 中文'); });
  assert.equal(await svc.getFileText('docs/中文.md', 'rv_x@2'), '# 中文');
});

test('submitReview：POST /comments/batch 原子体；400 details.index 翻成「第 N 条」；409 提示刷新', async () => {
  stubFetch((url, opts) => {
    assert.equal(url, `${svc.API_BASE}/reviews/rv_x/comments/batch`); assert.equal(opts.method, 'POST');
    const b = JSON.parse(opts.body); assert.equal(b.revision_no, 2); assert.equal(b.comments.length, 1);
    return res(201, { items: [{ id: 'c1' }] });
  });
  const r = await svc.submitReview('rv_x', { commitId: 'rv_x@2', comments: [{ path: 'docs/a.md', line: 3, quote: 'abc', note: 'n' }] });
  assert.equal(r.items[0].id, 'c1');
  stubFetch(() => res(400, { error: { code: 'invalid_argument', message: 'quote not found', details: { index: 1 } } }));
  await assert.rejects(() => svc.submitReview('rv_x', { commitId: 'rv_x@2', comments: [{ quote: 'a' }, { quote: 'b' }] }), /第 2 条/);
  stubFetch(() => res(409, { error: { code: 'stale_revision', message: 'moved' } }));
  await assert.rejects(() => svc.submitReview('rv_x', { commitId: 'rv_x@2', comments: [{ quote: 'a' }] }), /新版本/);
});

test('createIssueComment（判）：open 折 → decisions request_changes + note；结案折 → 无锚点评论', async () => {
  stubFetch((url, opts, n) => {
    if (n === 1) return res(200, REVIEW);
    assert.match(url, /\/decisions$/);
    const b = JSON.parse(opts.body); assert.deepEqual(b, { revision_no: 2, verdict: 'request_changes', note: '改开头' });
    return res(201, { id: 'd1' });
  });
  assert.deepEqual(await svc.createIssueComment(REVIEW.id, '改开头'), { id: 'd1', kind: 'decision' });
  stubFetch((url, opts, n) => {
    if (n === 1) return res(200, { ...REVIEW, id: 'rv_closed', status: 'approved' });
    assert.match(url, /\/comments$/); assert.deepEqual(JSON.parse(opts.body), { body: '留一句' });
    return res(201, { id: 'c9' });
  });
  assert.deepEqual(await svc.createIssueComment('rv_closed', '留一句'), { id: 'c9', kind: 'comment' });
});

test('mergePR（画可）：decisions approve 带 revision_no；读物随手 PUT read-state done', async () => {
  stubFetch((url, opts, n) => {
    if (n === 1) return res(200, REVIEW);                                   // listPRFiles 先拉详情（labels 进缓存）
    if (n === 2) { assert.match(url, /\/decisions$/); assert.deepEqual(JSON.parse(opts.body), { revision_no: 2, verdict: 'approve' }); return res(201, { id: 'd2', verdict: 'approve' }); }
    assert.match(url, /\/read-state$/); assert.equal(opts.method, 'PUT'); assert.deepEqual(JSON.parse(opts.body), { state: 'done' });
    return res(200, { state: 'done' });
  });
  await svc.listPRFiles(REVIEW.id);
  await svc.mergePR(REVIEW.id, `${REVIEW.id}@2`);
  assert.equal(calls.length, 3);
});

test('read-state：get 翻成 {id, state:{docPath,anchor,time}}；put 只送 position（保留 state）；markRead 只在 unread 时写一次', async () => {
  stubFetch(() => res(200, { state: 'read', position: { document_path: 'docs/a.md', anchor: 'L20', device: 'mac', time: 'T' }, updated_at: 'U' }));
  assert.deepEqual(await svc.getReadState('rv_x'), { id: 'svc', state: { device: 'mac', docPath: 'docs/a.md', anchor: 'L20', time: 'T', v: 1 } });
  stubFetch((url, opts) => { assert.equal(opts.method, 'PUT'); assert.deepEqual(JSON.parse(opts.body), { position: { document_path: 'docs/a.md', anchor: 'L21', device: 'mac', time: 'T2' } }); return res(200, {}); });
  assert.equal(await svc.putReadState('rv_x', { docPath: 'docs/a.md', anchor: 'L21', device: 'mac', time: 'T2' }), 'svc');
  stubFetch((url, opts, n) => (n === 1 ? res(200, { ...REVIEW, id: 'rv_r', read_state: { state: 'done' } }) : res(200, {})));
  assert.equal(await svc.markRead('rv_r'), false); assert.equal(calls.length, 1);
});

test('pollEvents：首次无游标只记 next_cursor 不报事件；之后带 since 返回事件并推进游标', async () => {
  stubFetch((url) => { assert.ok(!/since=/.test(url)); return res(200, { items: [{ type: 'comment.created' }], next_cursor: 'CUR1', has_more: false }); });
  const first = await svc.pollEvents();
  assert.deepEqual(first, { items: [], initial: true });
  assert.equal(localStorage.getItem('menxia.svc.events'), 'CUR1');
  stubFetch((url) => { assert.match(url, /since=CUR1/); return res(200, { items: [{ type: 'revision.created', review_id: 'rv_x' }], next_cursor: 'CUR2', has_more: false }); });
  const next = await svc.pollEvents();
  assert.equal(next.items.length, 1);
  assert.equal(localStorage.getItem('menxia.svc.events'), 'CUR2');
});

test('logout：POST /me/logout 带 bearer，然后本地 token 与事件游标都清', async () => {
  localStorage.setItem('menxia.svc.events', 'X');
  stubFetch((url, opts) => { assert.equal(url, `${svc.API_BASE}/me/logout`); assert.equal(opts.headers.Authorization, 'Bearer A1'); return res(204, null); });
  await svc.logout();
  assert.equal(svc.getToken(), ''); assert.equal(localStorage.getItem('menxia.svc.events'), null);
});
