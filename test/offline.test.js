// M2 离线包纯逻辑守卫（node 内置 runner，不需要浏览器/IndexedDB）。
// 覆盖：续读标记 parse/roundtrip、shouldPromptJump 判据、outbox 幂等去重、cacheKey。
// 带 IndexedDB 的函数（putContent/enqueue/flushOutbox…）在 node 里走 feature-detect 的 no-op 分支，
// 这里单测它们的**纯逻辑接缝**（dropSent / flushOutbox 的 sender 契约），不依赖真 IDB。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isReadStateComment, buildReadStateBody, parseReadState, shouldPromptJump,
  newUuid, makeOutboxItem, dropSent, cacheKey, flushOutbox, listOutbox,
} from '../src/offline.js';

test('续读标记：parse(build(x)) 字段 roundtrip', () => {
  const x = { device: 'iPhone', docPath: 'docs/foo.zh-CN.md', anchor: 'L42', time: '2026-08-12T00:00:00.000Z' };
  const body = buildReadStateBody(x);
  assert.ok(isReadStateComment(body), '自己 build 的必须被认成标记');
  const back = parseReadState(body);
  assert.equal(back.device, x.device);
  assert.equal(back.docPath, x.docPath);
  assert.equal(back.anchor, x.anchor);
  assert.equal(back.time, x.time);
  assert.equal(back.v, 1);
});

test('续读标记：注释前导空白/换行不影响识别', () => {
  const body = '\n\n' + buildReadStateBody({ docPath: 'a', anchor: 'L1' });
  assert.ok(isReadStateComment(body));
  assert.ok(parseReadState(body));
});

test('续读标记：普通判、正文中含该串的判、坏 JSON 都不误判', () => {
  assert.equal(isReadStateComment('普通一条判'), false);
  assert.equal(isReadStateComment('聊到 menxia-readstate 这个设计'), false);
  assert.equal(parseReadState('普通一条判'), null);
  // 前缀对但 JSON 坏 → 宽容返回 null，绝不抛
  assert.equal(parseReadState('<!-- menxia-readstate {坏的 -->'), null);
});

test('shouldPromptJump：远端更新且落点不同才提示', () => {
  const remote = { docPath: 'docs/a.md', anchor: 'L100', time: '2026-08-12T10:00:00Z' };
  // 本地更旧、落点不同 → 提示
  assert.equal(shouldPromptJump(remote, { localTime: '2026-08-12T09:00:00Z', current: { docPath: 'docs/a.md', anchor: 'L1' } }), true);
  // 本地更新 → 不提示（last-write-wins：本地才是最新）
  assert.equal(shouldPromptJump(remote, { localTime: '2026-08-12T11:00:00Z', current: { docPath: 'docs/a.md', anchor: 'L1' } }), false);
  // 落点相同 → 不提示（跳了也没动）
  assert.equal(shouldPromptJump(remote, { localTime: '', current: { docPath: 'docs/a.md', anchor: 'L100' } }), false);
  // 没有远端 → 不提示
  assert.equal(shouldPromptJump(null, {}), false);
  // 本地没记时间 → 视远端更新
  assert.equal(shouldPromptJump(remote, { localTime: '', current: { docPath: 'docs/a.md', anchor: 'L1' } }), true);
});

test('newUuid 唯一', () => {
  const a = newUuid(), b = newUuid();
  assert.notEqual(a, b);
  assert.equal(typeof a, 'string');
});

test('makeOutboxItem 形状：带本地 id、pr、body、tries=0', () => {
  const it = makeOutboxItem({ pr: 30, body: '一条离线判' });
  assert.equal(it.pr, 30);
  assert.equal(it.body, '一条离线判');
  assert.equal(it.kind, 'issueComment');
  assert.equal(it.tries, 0);
  assert.ok(it.id);
});

test('dropSent：只剔掉已成功发出的 id（幂等出队的核心）', () => {
  const q = [makeOutboxItem({ pr: 1, body: 'a' }), makeOutboxItem({ pr: 1, body: 'b' }), makeOutboxItem({ pr: 1, body: 'c' })];
  const kept = dropSent(q, [q[0].id, q[2].id]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, q[1].id);
  // 空 sent → 原样
  assert.equal(dropSent(q, []).length, 3);
});

test('cacheKey：稳定、含 pr+path，空段不产生空占位', () => {
  assert.equal(cacheKey('doc', { pr: 30, path: 'sha:docs/a.md' }), 'doc::30::sha:docs/a.md');
  assert.equal(cacheKey('folders'), 'folders');
  assert.equal(cacheKey('comments', { pr: 7 }), 'comments::7');
});

// ── bughunt 2026-11-18 P1-3 / P1-4 / P2-4 ──
import { outboxBelongs, makeOutboxSender } from '../src/offline.js';

function memIo(items) {
  const q = new Map(items.map((it) => [it.id, { ...it }]));
  return {
    q,
    list: async () => [...q.values()].map((it) => ({ ...it })),
    remove: async (id) => { q.delete(id); },
    put: async (it) => { q.set(it.id, { ...it }); return true; },
  };
}

test('P1-3 离线判带 answers：入队项保留 answers，补发时原样交给 createIssueComment', async () => {
  const answers = [{ question_id: 'q1', option_ids: ['a'] }];
  const it = makeOutboxItem({ pr: 'rv_1', body: '改开头', answers, backend: 'service' });
  assert.deepEqual(it.answers, answers);
  const io = memIo([it]);
  const got = [];
  const api = { createIssueComment: async (pr, body, opts) => { got.push({ pr, body, answers: opts?.answers }); } };
  await flushOutbox(makeOutboxSender(api), { io });
  assert.deepEqual(got, [{ pr: 'rv_1', body: '改开头', answers }]);
  assert.equal(io.q.size, 0);
});

test('P2-1 离线判记下写于哪个版本：入队项带 ref，补发时传 ref + staleAsComment；老项没 ref 不传', async () => {
  const it = makeOutboxItem({ pr: 'rv_1', body: '改', backend: 'service', ref: 'rv_1@3' });
  assert.equal(it.ref, 'rv_1@3');
  const legacy = { ...makeOutboxItem({ pr: 'rv_2', body: '老', backend: 'service' }) };
  delete legacy.ref;
  const got = [];
  const api = { createIssueComment: async (pr, _b, opts) => { got.push({ pr, ref: opts?.ref, staleAsComment: opts?.staleAsComment }); } };
  await flushOutbox(makeOutboxSender(api), { io: memIo([it, legacy]) });
  assert.deepEqual(got, [{ pr: 'rv_1', ref: 'rv_1@3', staleAsComment: true }, { pr: 'rv_2', ref: undefined, staleAsComment: undefined }]);
});

test('P1-4 outbox 分数据源：只补发属于当前数据源（GitHub 再分仓）的项，别的原样留着', async () => {
  const gh = makeOutboxItem({ pr: 207, body: 'gh 判', backend: 'github', repo: 'o/r' });
  const ghOther = makeOutboxItem({ pr: 3, body: '别的仓', backend: 'github', repo: 'o/other' });
  const sv = makeOutboxItem({ pr: 'rv_9', body: '门下判', backend: 'service' });
  const legacyGh = { ...makeOutboxItem({ pr: 12, body: '老 gh 项', repo: 'o/r' }), backend: undefined };
  const legacySv = { ...makeOutboxItem({ pr: 'rv_8', body: '老门下项' }), backend: undefined };
  const io = memIo([gh, ghOther, sv, legacyGh, legacySv]);
  const sent = [];
  const sender = async (it) => { sent.push(it.pr); };
  await flushOutbox(sender, { io, accept: (it) => outboxBelongs(it, { backend: 'service', repo: '' }) });
  assert.deepEqual(sent.sort(), ['rv_8', 'rv_9']);
  assert.deepEqual([...io.q.values()].map((x) => x.pr).sort(), [12, 207, 3].sort());
  sent.length = 0;
  await flushOutbox(sender, { io, accept: (it) => outboxBelongs(it, { backend: 'github', repo: 'O/R' }) });
  assert.deepEqual(sent.sort(), [12, 207]);
  assert.deepEqual([...io.q.values()].map((x) => x.pr), [3]);
});

test('P2-4 outbox 补发不重复：带幂等键；上次失败过（tries>0）且判其实已落地 → 不再发、直接出队', async () => {
  const it = { ...makeOutboxItem({ pr: 'rv_1', body: '改开头', backend: 'service' }), tries: 1 };
  const io = memIo([it]);
  let creates = 0;
  const api = {
    listIssueComments: async () => [{ body: '**判（改）** · v2\n\n改开头' }],
    createIssueComment: async () => { creates += 1; },
  };
  const r = await flushOutbox(makeOutboxSender(api), { io });
  assert.equal(creates, 0, '响应丢了但服务端已落地的判，补发会多出一条重复的「要改」');
  assert.equal(r.sent, 1);
  assert.equal(io.q.size, 0);

  const it2 = { ...makeOutboxItem({ pr: 'rv_1', body: '另一条', backend: 'service' }), tries: 1 };
  const keys = [];
  const api2 = {
    listIssueComments: async () => [{ body: '**判（改）** · v2\n\n改开头' }],
    createIssueComment: async (_pr, _b, opts) => { keys.push(opts?.idempotencyKey); },
  };
  await flushOutbox(makeOutboxSender(api2), { io: memIo([it2]) });
  assert.deepEqual(keys, [it2.id], '没落地的照发，并带本地 id 作幂等键');
});

test('flushOutbox：node 无 IDB → 空队列，sender 一次都不该被调（不误发）', async () => {
  let calls = 0;
  const r = await flushOutbox(async () => { calls += 1; });
  assert.equal(calls, 0);
  assert.deepEqual(r, { sent: 0, failed: 0 });
  assert.deepEqual(await listOutbox(), []);
});

// ── 2026-11-19 永久失败退回判框 ──
import { isPermanentFailure, deadItemFor, answersToForm } from '../src/offline.js';

const httpErr = (status, code, message = `HTTP ${status}`) => Object.assign(new Error(message), { status, code });

test('isPermanentFailure：4xx 永久；断网 / 5xx / 401 / 408 / 429 / 409 stale_revision 可重试', () => {
  for (const s of [400, 403, 404, 409, 410, 422]) assert.equal(isPermanentFailure(httpErr(s)), true, `${s}`);
  assert.equal(isPermanentFailure(httpErr(409, 'review_closed')), true);
  for (const e of [new TypeError('Failed to fetch'), httpErr(500), httpErr(503), httpErr(401), httpErr(408), httpErr(429), httpErr(409, 'stale_revision'), null]) {
    assert.equal(isPermanentFailure(e), false, String(e?.status ?? e));
  }
});

test('flushOutbox：4xx 标 dead 留库（不丢字）、之后不再重试；断网 / 429 留队照旧重试', async () => {
  const bad = makeOutboxItem({ pr: 'rv_1', body: '改开头', backend: 'service', answers: [{ question_id: 'q1', option_ids: ['a'] }] });
  const net = makeOutboxItem({ pr: 'rv_2', body: '断网那条', backend: 'service' });
  const lim = makeOutboxItem({ pr: 'rv_3', body: '限流那条', backend: 'service' });
  const io = memIo([bad, net, lim]);
  const calls = [];
  const sender = async (it) => {
    calls.push(it.pr);
    if (it.pr === 'rv_1') throw httpErr(400, 'invalid_argument', '必答题「先改哪头？」没答');
    if (it.pr === 'rv_2') throw new TypeError('Failed to fetch');
    throw httpErr(429, 'rate_limited');
  };
  await flushOutbox(sender, { io });
  assert.deepEqual(io.q.get(bad.id).dead, { status: 400, message: '必答题「先改哪头？」没答' });
  assert.equal(io.q.get(net.id).dead, undefined);
  assert.equal(io.q.get(lim.id).dead, undefined);
  assert.equal(io.q.size, 3, '永久失败的也不能删：判文本 + 答题要退回判框');
  calls.length = 0;
  await flushOutbox(sender, { io });
  assert.deepEqual(calls.sort(), ['rv_2', 'rv_3'], 'dead 项不再发——否则每次开机 / 联网都再吃一次 4xx');
});

test('升级前入队、缺 answers 的老项：补发吃 400 → 同样标 dead 退回', async () => {
  const legacy = { ...makeOutboxItem({ pr: 'rv_7', body: '老判', backend: 'service' }), tries: 2 };
  delete legacy.answers;
  const io = memIo([legacy]);
  const api = {
    listIssueComments: async () => [],
    createIssueComment: async (_pr, _b, opts) => { if (!opts?.answers) throw httpErr(400, 'invalid_argument', 'answers required'); },
  };
  await flushOutbox(makeOutboxSender(api), { io });
  assert.deepEqual(io.q.get(legacy.id).dead, { status: 400, message: 'answers required' });
});

test('deadItemFor 只挑该折的 dead 项（最新一条）；answersToForm 还原成判框作答表', () => {
  const a = { ...makeOutboxItem({ pr: 'rv_1', body: '旧' }), createdAt: '2026-11-01T00:00:00Z', dead: { status: 400, message: 'x' } };
  const b = { ...makeOutboxItem({ pr: 'rv_1', body: '新' }), createdAt: '2026-11-02T00:00:00Z', dead: { status: 422, message: 'y' } };
  const live = makeOutboxItem({ pr: 'rv_1', body: '还在排队' });
  const other = { ...makeOutboxItem({ pr: 207, body: 'gh' }), dead: { status: 404, message: 'z' } };
  assert.equal(deadItemFor([a, live, b, other], 'rv_1').body, '新');
  assert.equal(deadItemFor([a, live, b, other], 207).body, 'gh');
  assert.equal(deadItemFor([live], 'rv_1'), null);
  assert.deepEqual(answersToForm([{ question_id: 'q1', option_ids: ['a'] }, { question_id: 'q2', text: '标题改短' }, null]), {
    q1: { option_ids: ['a'], text: '' },
    q2: { option_ids: [], text: '标题改短' },
  });
  assert.deepEqual(answersToForm(undefined), {});
});
