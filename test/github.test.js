// github.js 的纯函数与请求装配测试（fetch 打桩，不出网）
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// github.js 模块级会读 localStorage —— 先打桩再 import
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};

const gh = await import('../src/github.js');

// ── parseRepoSlug：用户会往里粘各种东西 ──
test('parseRepoSlug: 正常 owner/repo', () => {
  assert.equal(gh.parseRepoSlug('charliezong18/review'), 'charliezong18/review');
});

test('parseRepoSlug: 容忍整条 URL / .git / 首尾斜杠与空白', () => {
  const want = 'charliezong18/review';
  ['https://github.com/charliezong18/review', 'http://www.github.com/charliezong18/review',
    'https://github.com/charliezong18/review.git', '  charliezong18/review  ',
    '/charliezong18/review/'].forEach((input) => {
    assert.equal(gh.parseRepoSlug(input), want, `应解析：${input}`);
  });
});

test('parseRepoSlug: 非法输入一律返回空串（由调用方报错，不静默乱猜）', () => {
  ['', 'onlyname', 'a/b/c', 'bad owner/repo', 'owner/re po', 'owner/'].forEach((input) => {
    assert.equal(gh.parseRepoSlug(input), '', `应拒绝：${JSON.stringify(input)}`);
  });
});

// ── 请求装配：路径编码 / 分页 / 写操作 body ──
let calls;
function stubFetch(responder) {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    return responder(url, opts, calls.length);
  };
}
const ok = (body, headers = {}) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: { get: (h) => headers[h] ?? null },
  json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  blob: async () => body,
});
const fail = (status, message = '', headers = {}) => ({
  ok: false, status, statusText: 'ERR',
  headers: { get: (h) => headers[h] ?? null },
  json: async () => ({ message }), text: async () => message,
});

beforeEach(() => {
  store.clear();
  gh.setRepoSlug('owner/repo');
  gh.setToken('github_pat_test');
});

test('文件路径分段编码：空格与 # 不截断请求', async () => {
  stubFetch(() => ok('内容'));
  await gh.getFileText('docs/a b#c.md', 'sha1');
  const { url } = calls[0];
  assert.ok(url.includes('docs/a%20b%23c.md'), `路径应分段编码，实际：${url}`);
  assert.ok(url.includes('/'), '目录分隔符不能被编码掉');
});

test('getFileBlobUrl: .svg 的 blob 被补成 image/svg+xml（GitHub raw 回的 type 不对）', async () => {
  stubFetch(() => ok(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'application/vnd.github.raw' })));
  const seen = [];
  const orig = URL.createObjectURL;
  URL.createObjectURL = (b) => { seen.push(b); return 'blob:stub'; };
  try {
    await gh.getFileBlobUrl('docs/assets/x.svg', 'sha1');
    await gh.getFileBlobUrl('docs/assets/y.PNG', 'sha1');
    const raw = new Blob(['x'], { type: 'application/vnd.github.raw' });
    stubFetch(() => ok(raw));
    await gh.getFileBlobUrl('docs/assets/z.bin', 'sha1');
    assert.equal(seen[0].type, 'image/svg+xml');
    assert.equal(seen[1].type, 'image/png');
    assert.equal(seen[2], raw, '未知扩展名保持原 blob');
  } finally { URL.createObjectURL = orig; }
});

test('listPRFiles / listPRComments 分页取全：满页续拉、不满页停', async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i }));
  // 用调用序号判页，别用 url.includes('page=1')——`per_page=100` 里就含这个子串
  stubFetch((_url, _opts, nth) => ok(nth === 1 ? page1 : [{ id: 999 }]));
  const files = await gh.listPRFiles(7);
  assert.equal(files.length, 101, '应把第二页也取回来');
  assert.equal(calls.length, 2, '第二页不满 100 就该停，不能继续空转');
});

test('submitReview: commit_id 与原子批注一起送出（漏了会按最新 head 静默钉错行）', async () => {
  stubFetch(() => ok({}));
  await gh.submitReview(3, { body: '正文', comments: [{ path: 'a.md', line: 2, side: 'RIGHT', body: 'x' }], commitId: 'deadbeef' });
  const sent = JSON.parse(calls[0].opts.body);
  assert.equal(sent.event, 'COMMENT');
  assert.equal(sent.commit_id, 'deadbeef');
  assert.equal(sent.comments.length, 1);
  assert.equal(calls[0].opts.method, 'POST');
});

test('submitReview: 不给 commitId 时不发空字段', async () => {
  stubFetch(() => ok({}));
  await gh.submitReview(3, { body: 'x' });
  assert.ok(!('commit_id' in JSON.parse(calls[0].opts.body)));
});

test('mergePR: 带 sha（所批即所合）；不带时不发该字段', async () => {
  stubFetch(() => ok({}));
  await gh.mergePR(3, 'abc123');
  let sent = JSON.parse(calls[0].opts.body);
  assert.equal(sent.merge_method, 'squash');
  assert.equal(sent.sha, 'abc123');
  assert.equal(calls[0].opts.method, 'PUT');
  await gh.mergePR(3);
  sent = JSON.parse(calls[1].opts.body);
  assert.ok(!('sha' in sent));
});

// ── ApiError 分流：401 才是钥匙死了，403 限流不能清 token（曾误删有效钥匙）──
test('401 → tokenDead', async () => {
  stubFetch(() => fail(401, 'Bad credentials'));
  const err = await gh.listOpenPRs().catch((e) => e);
  assert.equal(err.status, 401);
  assert.equal(err.tokenDead, true);
  assert.equal(err.rateLimited, false);
});

test('403 + ratelimit 用尽 → rateLimited，且不得标成 tokenDead', async () => {
  stubFetch(() => fail(403, 'rate limit exceeded', { 'x-ratelimit-remaining': '0' }));
  const err = await gh.listOpenPRs().catch((e) => e);
  assert.equal(err.rateLimited, true);
  assert.equal(err.tokenDead, false, '限流误判成钥匙失效会把用户有效 token 删掉');
});

test('403 权限不足（余额充足）→ 既非 tokenDead 也非 rateLimited', async () => {
  stubFetch(() => fail(403, 'Resource not accessible', { 'x-ratelimit-remaining': '4999' }));
  const err = await gh.listOpenPRs().catch((e) => e);
  assert.equal(err.rateLimited, false);
  assert.equal(err.tokenDead, false);
});

test('错误信息带上 GitHub 的 message（排查靠它）', async () => {
  stubFetch(() => fail(422, 'Validation Failed'));
  const err = await gh.submitReview(1, { body: 'x' }).catch((e) => e);
  assert.ok(err.message.includes('Validation Failed'));
});

// ── verifyToken 分层：仓库可达 ≠ 能列 PR ──
test('verifyToken: 缺 Pull requests 权限 → prAccess=false（当场报，不放进门后才 403）', async () => {
  stubFetch((url) => (url.includes('/pulls') ? fail(403, 'Resource not accessible by personal access token')
    : ok({ permissions: { push: true } })));
  const r = await gh.verifyToken();
  assert.equal(r.prAccess, false);
  assert.equal(r.canWrite, true);
});

test('verifyToken: 两项齐全 → 全 true', async () => {
  stubFetch((url) => (url.includes('/pulls') ? ok([]) : ok({ permissions: { push: true } })));
  const r = await gh.verifyToken();
  assert.equal(r.prAccess, true);
  assert.equal(r.canWrite, true);
});

test('verifyToken: 只读钥匙 canWrite=false（画可会失败，要提前提醒）', async () => {
  stubFetch((url) => (url.includes('/pulls') ? ok([]) : ok({ permissions: { push: false } })));
  const r = await gh.verifyToken();
  assert.equal(r.canWrite, false);
});

test('每个请求都带 Authorization 与 API 版本头', async () => {
  stubFetch(() => ok([]));
  await gh.listOpenPRs();
  const h = calls[0].opts.headers;
  assert.equal(h.Authorization, 'Bearer github_pat_test');
  assert.equal(h['X-GitHub-Api-Version'], '2022-11-28');
});

// ── 体例检查的判词（2026-07-31 加，2026-08-09 换端点）──
//
// 读的是 **workflow runs**（`/actions/runs?head_sha=`）不是 check runs ——
// check-runs 要 Checks 权限，而 fine-grained PAT 压根没有那一项（详见 github.js）。
// 两者 status / conclusion / html_url / name 同名同义，只有数组键不同。
//
// 命脉是 `unreadable` 与 `none` 必须分开：混成一个「无」，
// 「钥匙没权限」就长得跟「这折没跑过检查」一模一样 ——
// 而前者意味着你以为体例查过了、其实是我们看不见。
// 与 verifyToken 那三层是同一条教训（2026-07-26 翻过车）。

test('checkVerdict: 全绿 → pass', async () => {
  stubFetch(() => ok({ workflow_runs: [{ status: 'completed', conclusion: 'success' }] }));
  assert.deepEqual(await gh.checkVerdict('abc'), { state: 'pass' });
});

test('checkVerdict: 有失败的 → fail，且带 url 点得进去', async () => {
  stubFetch(() => ok({ workflow_runs: [
    { status: 'completed', conclusion: 'success', name: '别的' },
    { status: 'completed', conclusion: 'failure', name: '九条规则', html_url: 'https://x/run/1' },
  ] }));
  const v = await gh.checkVerdict('abc');
  assert.equal(v.state, 'fail');
  assert.equal(v.url, 'https://x/run/1');
  assert.equal(v.name, '九条规则');
});

test('checkVerdict: 还在跑 → running（别过早说绿）', async () => {
  stubFetch(() => ok({ workflow_runs: [
    { status: 'completed', conclusion: 'success' },
    { status: 'in_progress' },
  ] }));
  assert.equal((await gh.checkVerdict('abc')).state, 'running');
});

test('checkVerdict: 这折压根没有检查 → none（CI 装上之前的老折）', async () => {
  stubFetch(() => ok({ workflow_runs: [] }));
  assert.equal((await gh.checkVerdict('abc')).state, 'none');
});

test('checkVerdict: 403/404 → unreadable，**不能当成 none**', async () => {
  for (const code of [403, 404]) {
    stubFetch(() => fail(code, 'Resource not accessible'));
    const v = await gh.checkVerdict('abc');
    assert.equal(v.state, 'unreadable', `${code} 应判 unreadable`);
    assert.notEqual(v.state, 'none', `${code} 绝不能退化成「没有检查」`);
  }
});

test('checkVerdict: neutral / skipped 不算失败（那是「没什么可说的」不是「不合格」）', async () => {
  stubFetch(() => ok({ workflow_runs: [
    { status: 'completed', conclusion: 'neutral' },
    { status: 'completed', conclusion: 'skipped' },
  ] }));
  assert.equal((await gh.checkVerdict('abc')).state, 'pass');
});

test('checkVerdict: 500 照常抛（只吞权限那两种，别把网络故障也说成看不见）', async () => {
  stubFetch(() => fail(500, 'boom'));
  await assert.rejects(() => gh.checkVerdict('abc'));
});

test('verifyToken: 缺 Actions: Read 时 checksAccess=false，而不是整个存钥失败', async () => {
  stubFetch((url) => {
    if (url.includes('/actions/runs')) return fail(403, 'Resource not accessible');
    if (url.includes('/pulls')) return ok([]);
    return ok({ permissions: { push: true }, default_branch: 'main' });
  });
  const r = await gh.verifyToken();
  assert.equal(r.prAccess, true);
  assert.equal(r.checksAccess, false);
  assert.equal(r.canWrite, true);
});

test('verifyToken: 权限齐全时 checksAccess=true', async () => {
  stubFetch((url) => {
    if (url.includes('/actions/runs')) return ok({ workflow_runs: [] });
    if (url.includes('/pulls')) return ok([]);
    return ok({ permissions: { push: true }, default_branch: 'main' });
  });
  assert.equal((await gh.verifyToken()).checksAccess, true);
});
