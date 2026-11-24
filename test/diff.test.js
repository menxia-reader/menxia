// 版本对比算法 + 「可能过时」判定（docs/DIFF-STALE-TOAST.md）
import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSeq, charDiff, lineRows, foldRows, docChanges, parseDiffParam, diffParam, FOLD_CONTEXT } from '../src/diff.js';
import { staleWeeks, STALE_DAYS } from '../src/stale.js';

const hiText = (segs) => segs.filter((s) => s.hi).map((s) => s.s).join('');
const allText = (segs) => segs.map((s) => s.s).join('');

test('diffSeq：前后缀剥掉、中段 LCS；先删后加', () => {
  const ops = diffSeq(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd']);
  assert.deepEqual(ops.map((o) => o.t), ['eq', 'del', 'add', 'eq', 'eq']);
  assert.deepEqual(diffSeq([], ['a']).map((o) => o.t), ['add']);
  assert.deepEqual(diffSeq(['a'], []).map((o) => o.t), ['del']);
});

test('diffSeq：中段格子数超上限 → 整段删了再加（不卡死）', () => {
  const ops = diffSeq(['a', 'b', 'c'], ['x', 'y', 'z', 'b'], 2);
  assert.deepEqual(ops.map((o) => o.t), ['del', 'del', 'del', 'add', 'add', 'add', 'add']);
});

test('charDiff：中文按字符——「三周」改「四周」只高亮那一个字', () => {
  const d = charDiff('价格三周前核过一次', '价格四周前核过一次');
  assert.equal(hiText(d.del), '三');
  assert.equal(hiText(d.add), '四');
  assert.equal(allText(d.del), '价格三周前核过一次');
  assert.equal(allText(d.add), '价格四周前核过一次');
});

test('charDiff：按码点切，emoji 不劈成两半', () => {
  const d = charDiff('好的👍完成', '好的👌完成');
  assert.equal(hiText(d.del), '👍');
  assert.equal(hiText(d.add), '👌');
});

test('charDiff：整行都换了（公共字符太少）→ null，不做满屏高亮', () => {
  assert.equal(charDiff('完全不同的一句话', 'abcdefgh'), null);
});

test('lineRows：改一行 → del+add 带字符级 segs；未改行带新旧行号', () => {
  const rows = lineRows('甲\n乙一\n丙\n', '甲\n乙二\n丙\n丁\n');
  assert.deepEqual(rows.map((r) => r.t), ['eq', 'del', 'add', 'eq', 'add']);
  assert.equal(rows[1].oldNo, 2); assert.equal(rows[2].newNo, 2);
  assert.equal(hiText(rows[1].segs), '一');
  assert.equal(hiText(rows[2].segs), '二');
  assert.equal(rows[4].segs, undefined, '新加的一行没有配对，不做字符级');
  assert.deepEqual([rows[3].oldNo, rows[3].newNo], [3, 3]);
});

test('lineRows：CRLF 与末尾换行不产生假改动', () => {
  assert.ok(lineRows('a\r\nb\r\n', 'a\nb').every((r) => r.t === 'eq'));
});

test('foldRows：长段未改折起来，改动上下各留 3 行；文首文末只留挨着改动的一头', () => {
  const old = Array.from({ length: 30 }, (_, i) => `第${i + 1}行`).join('\n');
  const neu = old.replace('第15行', '第15行改');
  const out = foldRows(lineRows(old, neu));
  const folds = out.filter((r) => r.t === 'fold');
  assert.equal(folds.length, 2);
  assert.equal(folds[0].rows.length, 14 - FOLD_CONTEXT, '文首 14 行未改，只留改动前 3 行');
  assert.equal(folds[1].rows.length, 15 - FOLD_CONTEXT, '文末 15 行未改，只留改动后 3 行');
  const visible = out.filter((r) => r.t !== 'fold');
  assert.equal(visible.length, 3 + 2 + 3);
  // 展开 = 原样补回：折叠里的行加可见行正好是全部行
  assert.equal(visible.length + folds.reduce((n, f) => n + f.rows.length, 0), 31);
});

test('foldRows：边界——藏 3 行不折，藏 4 行才折', () => {
  const mk = (n) => lineRows(Array.from({ length: n }, (_, i) => `l${i}`).concat('x').join('\n'), Array.from({ length: n }, (_, i) => `l${i}`).concat('y').join('\n'));
  assert.equal(foldRows(mk(6)).filter((r) => r.t === 'fold').length, 0, '文首 6 行留 3 藏 3：不折');
  assert.equal(foldRows(mk(7)).filter((r) => r.t === 'fold').length, 1, '文首 7 行留 3 藏 4：折');
  const same = lineRows('a\nb', 'a\nb');
  assert.equal(foldRows(same), same);
});

test('docChanges：新增 / 删除 / 修改；sha256 相同标「未改」', () => {
  const out = docChanges(
    [{ path: 'docs/a.md', sha256: 's1' }, { path: 'docs/b.md', sha256: 's2' }, { path: 'docs/gone.md', sha256: 's3' }],
    [{ path: 'docs/a.md', sha256: 's1' }, { path: 'docs/b.md', sha256: 's2x' }, { path: 'docs/new.md', sha256: 's4' }],
  );
  assert.deepEqual(out, [
    { path: 'docs/a.md', kind: 'same' },
    { path: 'docs/b.md', kind: 'modified' },
    { path: 'docs/new.md', kind: 'added' },
    { path: 'docs/gone.md', kind: 'removed' },
  ]);
  assert.equal(docChanges([{ path: 'x' }], [{ path: 'x' }])[0].kind, 'modified', '缺 sha 不敢说没改');
});

test('parseDiffParam：a..b；非法 / 相等 / 0 → null；diffParam 反写', () => {
  assert.deepEqual(parseDiffParam('2..3'), { a: 2, b: 3 });
  assert.deepEqual(parseDiffParam('3..1'), { a: 3, b: 1 });
  for (const bad of [null, '', '2', '2..2', '0..1', 'a..b', '1...2']) assert.equal(parseDiffParam(bad), null, String(bad));
  assert.equal(diffParam({ a: 1, b: 4 }), '1..4');
});

const NOW = Date.parse('2026-11-23T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString();
test(`staleWeeks：current_revision_at 距今 ≥${STALE_DAYS} 天 → 周数；不足 → 0`, () => {
  assert.equal(staleWeeks({ svc: { status: 'open', current_revision_at: daysAgo(20.9) } }, NOW), 0);
  assert.equal(staleWeeks({ svc: { status: 'open', current_revision_at: daysAgo(21) } }, NOW), 3);
  assert.equal(staleWeeks({ svc: { status: 'approved', current_revision_at: daysAgo(30) } }, NOW), 4);
});
test('staleWeeks：withdrawn 不标；GitHub 源（无 svc）不标；缺 current_revision_at 退回 updated_at', () => {
  assert.equal(staleWeeks({ svc: { status: 'withdrawn', current_revision_at: daysAgo(60) } }, NOW), 0);
  assert.equal(staleWeeks({ updated_at: daysAgo(60) }, NOW), 0);
  assert.equal(staleWeeks({ updated_at: daysAgo(35), svc: { status: 'open' } }, NOW), 5);
  assert.equal(staleWeeks({ updated_at: daysAgo(1), svc: { status: 'open', current_revision_at: daysAgo(40) } }, NOW), 5, '有新评论（updated_at 新）但版本旧，仍算过时');
  assert.equal(staleWeeks({ svc: { status: 'open' } }, NOW), 0, '两个时间都没有 → 不标');
});
