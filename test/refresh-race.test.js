// 回归：网页 service-api.js 的 refresh 行为 vs 服务端 oauth.ts 的轮换 + 重放检测（bughunt 2026-11-18 P0-2 / P1-5）。
// 来源：op/outputs/menxia-bughunt/repro/refresh-race.test.mjs（只读复现脚本），这里改写成「修好后应当如何」。
//
// 假服务端逐条照抄 menxia-service/src/auth/oauth.ts refreshTokens() 的判定，且按「无宽限期」最严格的口径：
//   旧 refresh 已被 replaced → revokeGrant（整族作废）→ 400 invalid_grant；
//   轮换成功 → 旧 access（generation <= 旧代）立即失效。
// 两个「标签页」= 同一模块用不同 query 导入两次（ESM 按 URL 缓存 → 两份独立的模块级单飞变量），
// 共享同一个 authStore（= 同源 localStorage）和同一个锁管理器（= 浏览器的 navigator.locks，跨标签）。
import test from 'node:test';
import assert from 'node:assert/strict';

const WEB = new URL('../src/service-api.js', import.meta.url).href;

function fakeServer({ tokenStatus = null, tokenThrows = false, onToken = null } = {}) {
  const s = { gen: 1, grantRevoked: false, tokens: new Map(), tokenCalls: 0, apiCalls: [] };
  s.tokens.set('A1', { kind: 'access', gen: 1, revoked: false });
  s.tokens.set('R1', { kind: 'refresh', gen: 1, replaced: false });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  s.fetch = async (url, opts = {}) => {
    url = String(url);
    await new Promise((r) => setTimeout(r, 5)); // 网络往返：让两个请求真正重叠
    if (url.endsWith('/oauth/token')) {
      s.tokenCalls++;
      if (onToken) await onToken(s);
      if (tokenThrows) throw new TypeError('Failed to fetch');
      if (tokenStatus) return json(tokenStatus, { error: 'temporarily_unavailable' });
      const f = new URLSearchParams(opts.body);
      const rt = s.tokens.get(f.get('refresh_token'));
      if (!rt || rt.kind !== 'refresh' || s.grantRevoked) return json(400, { error: 'invalid_grant' });
      if (rt.replaced) { s.grantRevoked = true; return json(400, { error: 'invalid_grant', error_description: 'refresh token reuse detected; grant revoked' }); }
      rt.replaced = true;
      const g = rt.gen + 1;
      for (const t of s.tokens.values()) if (t.kind === 'access' && t.gen <= rt.gen) t.revoked = true;
      s.tokens.set(`A${g}`, { kind: 'access', gen: g, revoked: false });
      s.tokens.set(`R${g}`, { kind: 'refresh', gen: g, replaced: false });
      s.gen = g;
      return json(200, { access_token: `A${g}`, refresh_token: `R${g}`, expires_in: 86400, token_type: 'Bearer' });
    }
    const bearer = (opts.headers?.Authorization || '').replace(/^Bearer /, '');
    s.apiCalls.push(bearer);
    if (s.beforeApi) await s.beforeApi(s, bearer);
    const at = s.tokens.get(bearer);
    if (!at || at.kind !== 'access' || at.revoked || s.grantRevoked) return json(401, { error: { code: 'unauthenticated', message: 'invalid access token' } });
    return json(200, { items: [], next_cursor: null });
  };
  return s;
}

// 浏览器 Web Locks 的最小替身：同名锁严格互斥、按请求顺序排队（同源所有标签共用一个锁管理器）。
function fakeLocks() {
  const tails = new Map();
  return {
    request(name, cb) {
      const prev = tails.get(name) || Promise.resolve();
      const run = prev.then(() => cb({ name, mode: 'exclusive' }));
      tails.set(name, run.catch(() => {}));
      return run;
    },
  };
}

let seq = 0;
async function tab(server, store, locks) {
  globalThis.fetch = server.fetch;
  const m = await import(`${WEB}?tab=${seq++}`);
  m.setAuthStorage(store);
  m.setLockManager?.(locks);
  return m;
}

test('P0-2 两个标签页在 access 将到期时同时刷新 → 跨标签只刷新一次，grant 不作废，两个标签都继续可用', async () => {
  const server = fakeServer();
  const locks = fakeLocks();
  const a0 = await import(`${WEB}?mk=${seq++}`);
  const shared = a0.memoryAuthStorage({ access_token: 'A1', refresh_token: 'R1', expires_at: Date.now() + 30_000 });
  const a = await tab(server, shared, locks);
  const b = await tab(server, shared, locks);
  const results = await Promise.allSettled([a.listOpenPRs(), b.listOpenPRs()]);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'fulfilled'], String(results.map((r) => r.reason)));
  assert.equal(server.tokenCalls, 1, '第二个标签进锁后重读 storage，发现 refresh 已换，不再发 refresh');
  assert.equal(server.grantRevoked, false);
  assert.equal(JSON.parse(shared.get()).refresh_token, 'R2');
  assert.equal(await a.listOpenPRs().then(() => 'ok'), 'ok');
  assert.equal(await b.listOpenPRs().then(() => 'ok'), 'ok');
});

test('P0-2 第二条路：别的标签已刷新、旧 access 失效 → 本标签 401 后进锁重读，直接用新 token 重放，不再 refresh', async () => {
  const server = fakeServer();
  const a0 = await import(`${WEB}?mk=${seq++}`);
  const shared = a0.memoryAuthStorage({ access_token: 'A1', refresh_token: 'R1', expires_at: Date.now() + 3_600_000 });
  const b = await tab(server, shared, fakeLocks());
  // B 的请求带着 A1 在路上时，A 标签完成了轮换并把 A2/R2 写进共享 storage
  server.beforeApi = async (s, bearer) => {
    if (bearer !== 'A1' || s.gen !== 1) return;
    s.tokens.get('R1').replaced = true; s.tokens.get('A1').revoked = true;
    s.tokens.set('A2', { kind: 'access', gen: 2, revoked: false });
    s.tokens.set('R2', { kind: 'refresh', gen: 2, replaced: false });
    s.gen = 2;
    shared.set(JSON.stringify({ access_token: 'A2', refresh_token: 'R2', expires_at: Date.now() + 86_400_000 }));
  };
  await b.listOpenPRs();
  assert.equal(server.tokenCalls, 0, '拿旧 R1 再刷一次会被判重放、整族作废');
  assert.equal(server.grantRevoked, false);
  assert.deepEqual(server.apiCalls, ['A1', 'A2']);
});

test('P0-2 本标签用掉的 refresh 被拒（invalid_grant）时，别的标签刚存的新 token 不能被清掉', async () => {
  // 没有锁（老浏览器）时的兜底：B 拿 R1 去刷，途中 A 已存好 R2；B 收到 invalid_grant 只能清「自己用掉的」那份
  const server = fakeServer({
    onToken: async (s) => {
      s.tokens.get('R1').replaced = true;   // A 先到，已轮换
      shared.set(JSON.stringify({ access_token: 'A9', refresh_token: 'R9', expires_at: Date.now() + 86_400_000 }));
    },
  });
  const a0 = await import(`${WEB}?mk=${seq++}`);
  const shared = a0.memoryAuthStorage({ access_token: 'A1', refresh_token: 'R1', expires_at: Date.now() + 30_000 });
  const b = await tab(server, shared, null);
  await b.listOpenPRs().catch(() => {});
  assert.equal(JSON.parse(shared.get() || 'null')?.refresh_token, 'R9', 'storage 里已不是本次用掉的 R1，不得 clearToken');
});

test('对照：同一标签页内并发请求只刷新一次（单飞有效）', async () => {
  const server = fakeServer();
  const a0 = await import(`${WEB}?mk=${seq++}`);
  const a = await tab(server, a0.memoryAuthStorage({ access_token: 'A1', refresh_token: 'R1', expires_at: Date.now() + 30_000 }), fakeLocks());
  await Promise.all([a.listOpenPRs(), a.listMergedPRs()]);
  assert.equal(server.tokenCalls, 1);
  assert.equal(server.grantRevoked, false);
});

for (const [name, opts] of [['5xx', { tokenStatus: 503 }], ['429', { tokenStatus: 429 }], ['网络错误', { tokenThrows: true }]]) {
  test(`P1-5 token 端点临时失败（${name}）→ 不报 tokenDead、refresh token 保留，可重试`, async () => {
    const server = fakeServer(opts);
    const a0 = await import(`${WEB}?mk=${seq++}`);
    const store = a0.memoryAuthStorage({ access_token: 'A1', refresh_token: 'R1', expires_at: Date.now() + 3_600_000 });
    const a = await tab(server, store, fakeLocks());
    server.tokens.get('A1').revoked = true; // access 已在服务端失效（例如过期）
    const err = await a.listOpenPRs().then(() => null, (e) => e);
    assert.ok(err, '请求仍应失败');
    assert.equal(err.tokenDead, false, '服务端只是暂时不可用，不是 token 已死（ui.js 据 tokenDead 清 token、踢回登录）');
    assert.notEqual(err.status, 401);
    assert.equal(JSON.parse(store.get()).refresh_token, 'R1');
  });
}

test('P1-5 对照：明确 invalid_grant → tokenDead，本地 token 清掉', async () => {
  const server = fakeServer();
  server.grantRevoked = true;
  const a0 = await import(`${WEB}?mk=${seq++}`);
  const store = a0.memoryAuthStorage({ access_token: 'A1', refresh_token: 'R1', expires_at: Date.now() + 3_600_000 });
  const a = await tab(server, store, fakeLocks());
  const err = await a.listOpenPRs().then(() => null, (e) => e);
  assert.equal(err.status, 401);
  assert.equal(err.tokenDead, true);
  assert.equal(store.get(), null);
});
