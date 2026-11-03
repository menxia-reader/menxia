// 纯逻辑单元测试 —— 零依赖，node --test 直接跑（Node 内置 test runner）
// 覆盖重点 = 历史上真出过 bug 或评审点名过的地方，不是为覆盖率凑数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validRightLines, parseCommentBody, threadComments, fmtDraft, loadDrafts, saveDrafts, pendingCountFor,
  reanchorByQuote, scrollClosesFloat, FLOAT_SCROLL_GRACE, blockTextIndex, headingIndex, sectionOf,
} from '../src/anchor.js';

// ── 浮批钮遇滚动（2026-11-03：程序滚动晚到把刚出现的「批」收掉）──
test('scrollClosesFloat: 浮钮刚出现时晚到的程序滚动不收（CI 实测晚 ~500ms）', () => {
  assert.equal(scrollClosesFloat(1000, 1000), false);
  assert.equal(scrollClosesFloat(1000, 1510), false);
  assert.equal(scrollClosesFloat(1000, 1000 + FLOAT_SCROLL_GRACE - 1), false);
});
test('scrollClosesFloat: 过了宽限期的滚动＝人在滚，照旧收', () => {
  assert.equal(scrollClosesFloat(1000, 1000 + FLOAT_SCROLL_GRACE), true);
  assert.equal(scrollClosesFloat(1000, 5000), true);
});
test('scrollClosesFloat: 没有出现时刻（NaN / undefined）一律收，往旧行为倒', () => {
  assert.equal(scrollClosesFloat(NaN, 1000), true);
  assert.equal(scrollClosesFloat(undefined, 1000), true);
});

// ── validRightLines：提交前的 hunk 校验。错一行 → 整批 review 422 全灭 ──
test('validRightLines: 新增文件全行可批', () => {
  const patch = '@@ -0,0 +1,5 @@\n+# 标题\n+\n+第三行\n+第四行\n+第五行';
  const s = validRightLines(patch);
  assert.deepEqual([...s].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.ok(!s.has(6));
});

test('validRightLines: 修改文件只有 hunk 内可批，hunk 之间不可批', () => {
  const patch = [
    '@@ -10,4 +10,5 @@ ctx',
    ' context10',
    '-old11',
    '+new11',
    '+new12',
    ' context13',
    '@@ -50,2 +51,2 @@',
    ' context51',
    '-old52',
    '+new52',
  ].join('\n');
  const s = validRightLines(patch);
  [10, 11, 12, 13, 51, 52].forEach((n) => assert.ok(s.has(n), `第 ${n} 行应可批`));
  [9, 14, 30, 50, 53].forEach((n) => assert.ok(!s.has(n), `第 ${n} 行不应可批`));
});

test('validRightLines: 删除行不占新文件行号', () => {
  // 三条删除夹在两条新增之间，删除若被计数会把后续行号整体推错
  const patch = '@@ -1,5 +1,2 @@\n+keep1\n-gone1\n-gone2\n-gone3\n+keep2';
  const s = validRightLines(patch);
  assert.deepEqual([...s].sort((a, b) => a - b), [1, 2]);
});

test('validRightLines: `\\ No newline at end of file` 不占行号', () => {
  const patch = '@@ -0,0 +1,2 @@\n+a\n+b\n\\ No newline at end of file';
  const s = validRightLines(patch);
  assert.deepEqual([...s].sort((a, b) => a - b), [1, 2]);
});

test('validRightLines: 尾部换行产生的假空行不被误算（否则多出一行 → 422 全灭）', () => {
  const withTrailing = '@@ -0,0 +1,2 @@\n+a\n+b\n';
  const s = validRightLines(withTrailing);
  assert.ok(!s.has(3), '尾换行不得凭空多出可批行');
});

test('validRightLines: 裸空串上下文行按可批计（GitHub patch 偶见此形态）', () => {
  const patch = '@@ -1,3 +1,3 @@\n a\n\n+c';
  const s = validRightLines(patch);
  assert.ok(s.has(2), '空上下文行应占行号');
  assert.ok(s.has(3));
});

test('validRightLines: 无 patch（renamed / 二进制 / 图片）返回 null → 调用方全量降级判', () => {
  assert.equal(validRightLines(null), null);
  assert.equal(validRightLines(undefined), null);
  assert.equal(validRightLines(''), null);
});

// ── parseCommentBody：已呈批注的 `> 引文\n\n正文` 解析 ──
test('parseCommentBody: 标准形状（fmtDraft 写出的）', () => {
  const { quote, body } = parseCommentBody('> 划中的原句\n\n我的批注');
  assert.equal(quote, '划中的原句');
  assert.equal(body, '我的批注');
});

test('parseCommentBody: 与 fmtDraft 往返一致', () => {
  const d = { quote: '镜片随时可以摘掉', note: '这句提到开头' };
  const parsed = parseCommentBody(fmtDraft(d));
  assert.equal(parsed.quote, d.quote);
  assert.equal(parsed.body, d.note);
});

test('parseCommentBody: 正文中段的 > 行不被当引文吃掉', () => {
  const { quote, body } = parseCommentBody('> 引文\n\n正文一\n> 正文里的引用\n正文二');
  assert.equal(quote, '引文');
  assert.ok(body.includes('> 正文里的引用'), '中段引用行必须留在正文里');
});

test('parseCommentBody: 无引文前缀（回话形态）→ quote 空、正文完整', () => {
  const { quote, body } = parseCommentBody('已改，第 3 节重写了');
  assert.equal(quote, '');
  assert.equal(body, '已改，第 3 节重写了');
});

test('parseCommentBody: 只有引文没有正文', () => {
  const { quote, body } = parseCommentBody('> 只有引文');
  assert.equal(quote, '只有引文');
  assert.equal(body, '');
});

test('parseCommentBody: \\r\\n 换行与空输入', () => {
  const { quote, body } = parseCommentBody('> 引文\r\n\r\n正文');
  assert.ok(quote.startsWith('引文'));
  assert.ok(body.startsWith('正文'));
  assert.deepEqual(parseCommentBody(''), { quote: '', body: '' });
  assert.deepEqual(parseCommentBody(null), { quote: '', body: '' });
});

// ── threadComments：批注串线 ──
const c = (id, over = {}) => ({
  id, path: 'docs/a.md', line: 10, body: `b${id}`, in_reply_to_id: null,
  user: { login: 'u' }, created_at: '2026-07-26T00:00:00Z', ...over,
});

test('threadComments: 回话挂到根下、根按出现序', () => {
  const roots = threadComments([c(1), c(2, { in_reply_to_id: 1 }), c(3)]);
  assert.equal(roots.length, 2);
  assert.equal(roots[0].root.id, 1);
  assert.deepEqual(roots[0].replies.map((r) => r.id), [2]);
  assert.equal(roots[1].root.id, 3);
});

test('threadComments: 回话按 created_at 升序（乱序输入也要排对）', () => {
  const roots = threadComments([
    c(1),
    c(3, { in_reply_to_id: 1, created_at: '2026-07-26T03:00:00Z' }),
    c(2, { in_reply_to_id: 1, created_at: '2026-07-26T01:00:00Z' }),
  ]);
  assert.deepEqual(roots[0].replies.map((r) => r.id), [2, 3]);
});

test('threadComments: 根缺失的孤儿回话被提升为独立串，绝不丢内容', () => {
  const roots = threadComments([c(9, { in_reply_to_id: 999 })]);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].root.id, 9);
});

test('threadComments: 空输入不炸', () => {
  assert.deepEqual(threadComments([]), []);
});

// ── 草稿持久化（localStorage 打桩）──
test('saveDrafts/loadDrafts/pendingCountFor 往返', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  assert.deepEqual(loadDrafts(42), [], '没存过时返回空数组而不是抛错');
  saveDrafts(42, [{ id: 'a' }, { id: 'b' }]);
  assert.equal(pendingCountFor(42), 2);
  assert.equal(pendingCountFor(43), 0, '按 PR 号隔离');
  store.set('zhupi.drafts.44', '{坏掉的 json');
  assert.deepEqual(loadDrafts(44), [], '坏数据要吞掉，不能让整个 app 起不来');
  delete globalThis.localStorage;
});

test('saveDrafts 配额爆时返回错误而不是抛出（此前裸写＝草稿静默丢失）', () => {
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  const err = saveDrafts(7, [{ id: 'a' }]);
  assert.ok(err instanceof Error, '应把错误交回调用方，让 UI 能提示');
  globalThis.localStorage = real;
});

// ── 漂移批注按引文反查行号（PAIN 2026-07-28 #14：出新版后卡片贴到错误段落）──
// 用最小的 DOM 替身：只需要 querySelectorAll('[data-line]') + dataset.line + textContent
const fakeDoc = (blocks) => ({
  querySelectorAll: () => blocks.map((b) => ({ dataset: { line: String(b.line) }, textContent: b.text })),
});

test('reanchorByQuote：按引文找回当前版的行号', () => {
  const doc = fakeDoc([
    { line: 3, text: '第一段无关内容' },
    { line: 9, text: '这里提到 agy 线的 1600 行代码，要不要留' },
  ]);
  assert.equal(reanchorByQuote(doc, 'agy 线的 1600 行代码'), 9);
});

test('reanchorByQuote：空白差异不影响命中（引文存的是压缩过的空白）', () => {
  const doc = fakeDoc([{ line: 5, text: '换行\n和   多空格   的段落' }]);
  assert.equal(reanchorByQuote(doc, '换行 和 多空格 的段落'), 5);
});

test('reanchorByQuote：嵌套命中取最短的块（表格 table/tr 会同时命中）', () => {
  const doc = fakeDoc([
    { line: 10, text: '表头 A 表头 B 目标单元格 其他行内容' }, // table
    { line: 12, text: '目标单元格' },                          // tr
  ]);
  assert.equal(reanchorByQuote(doc, '目标单元格'), 12, '应锚到具体那一行而不是整张表');
});

test('reanchorByQuote：找不到/引文过短/无 doc 一律返回 null，交给调用方兜底', () => {
  const doc = fakeDoc([{ line: 4, text: '某段内容' }]);
  assert.equal(reanchorByQuote(doc, '文档里根本没有这句话'), null);
  assert.equal(reanchorByQuote(doc, 'ab'), null, '太短易误命中，不如不认');
  assert.equal(reanchorByQuote(null, '某段内容'), null);
  assert.equal(reanchorByQuote(doc, ''), null);
});

// ── 2026-11 质量巡检：快照函数（每篇建一次，渲染时复用）──
test('blockTextIndex：跳过无行号块、压缩空白、保持 DOM 序', () => {
  const doc = fakeDoc([{ line: 2, text: 'a\n  b' }, { line: '', text: '无行号' }, { line: 7, text: 'c' }]);
  assert.deepEqual(blockTextIndex(doc), [{ line: 2, text: 'a b' }, { line: 7, text: 'c' }]);
  assert.deepEqual(blockTextIndex(null), []);
});

test('reanchorByQuote：同长度并列命中取 DOM 序第一个（快照路径与旧语义一致）', () => {
  const doc = fakeDoc([{ line: 3, text: '重复的句子' }, { line: 8, text: '重复的句子' }]);
  assert.equal(reanchorByQuote(doc, '重复的句子'), 3);
  assert.equal(reanchorByQuote(doc, '重复的句子', blockTextIndex(doc)), 3);
});

// sectionOf 此前只有浏览器层（dom.test.html）覆盖；这里补 node 层，钉住边界语义。
const headDoc = (hs) => ({
  querySelectorAll: () => hs.map(([line, text]) => ({ dataset: { line: String(line) }, textContent: text })),
});

test('headingIndex / sectionOf：取 line ≤ 目标行的最后一个标题；在首个标题之前为空串', () => {
  const doc = headDoc([[1, '总纲'], [5, ' 第一节 '], [20, '第二节']]);
  const heads = headingIndex(doc);
  assert.deepEqual(heads, [{ line: 1, text: '总纲' }, { line: 5, text: ' 第一节 ' }, { line: 20, text: '第二节' }]);
  assert.equal(sectionOf(doc, 5), ' 第一节 ', '恰在标题行上算本节；不 trim（旧语义）');
  assert.equal(sectionOf(doc, 19), ' 第一节 ');
  assert.equal(sectionOf(doc, 999), '第二节');
  assert.equal(sectionOf(headDoc([[4, 'x']]), 3), '');
  for (const line of [0, 1, 4, 5, 19, 20, 999]) assert.equal(sectionOf(null, line, heads), sectionOf(doc, line), `line ${line}`);
});

test('sectionOf：空文字标题照旧覆盖前一个（与 extractOutline 跳空标题不同，刻意保留）', () => {
  const doc = headDoc([[1, '总纲'], [5, '']]);
  assert.equal(sectionOf(doc, 9), '');
  assert.deepEqual(headingIndex(null), []);
});
