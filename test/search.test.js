// search.js 纯函数单元测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, lineOfIndex, snippetAround, searchIndex,
  prNumberOf, matchesQuery, homeTabOf, hitsElsewhere } from '../src/search.js';

// 2026-10-27 报告：书架栏搜「174」只说「标题没有」，而 #174 是待审栏的读物。
const L = (...names) => names.map((name) => ({ name }));
const P174 = { number: 174, title: 'Hermes 语音外拨开通 SOP', labels: L('kind:读物', 'wait:你读') };
const PIDLE = { number: 90, title: '闲放的读物', labels: L('kind:读物', 'wait:闲') };
const PDONE = { number: 17, title: '已画可的读物 1740 字', labels: L('kind:读物'), merged_at: '2026-10-01T00:00:00Z' };
const PDONE2 = { number: 5, title: '已画可的设计', labels: L('kind:设计'), merged_at: '2026-10-02T00:00:00Z' };

test('prNumberOf: 纯数字 / #数字 认折号，其余不认', () => {
  assert.equal(prNumberOf('174'), 174);
  assert.equal(prNumberOf('#174'), 174);
  assert.equal(prNumberOf('  # 174 '), 174);
  assert.equal(prNumberOf('174a'), null);
  assert.equal(prNumberOf('SOP'), null);
  assert.equal(prNumberOf(''), null);
  assert.equal(prNumberOf('#'), null);
});

test('matchesQuery: 折号精确命中、标题子串仍然命中、空词全放行', () => {
  assert.ok(matchesQuery(P174, '174'));
  assert.ok(matchesQuery(P174, '#174'));
  assert.ok(!matchesQuery(P174, '17'));          // 折号是精确的，不做前缀
  assert.ok(matchesQuery(PDONE, '174'));         // 标题里恰有 1740：照旧按标题命中
  assert.ok(matchesQuery(P174, 'hermes'));       // 大小写不敏感
  assert.ok(matchesQuery(P174, ''));
  assert.ok(!matchesQuery(P174, '#999'));
});

test('homeTabOf: 待审 / 读毕书架（open 闲折）/ 已画可', () => {
  assert.equal(homeTabOf(P174), 'open');
  assert.equal(homeTabOf(PIDLE), 'shelf');
  assert.equal(homeTabOf(PDONE), 'done');
});

test('hitsElsewhere: 书架栏搜 174 → 报出待审栏的 #174，并标栏；已列出的不重报', () => {
  const prs = [P174, PIDLE];
  const done = [PDONE, PDONE2];
  const shelfList = [PIDLE, PDONE].filter((p) => matchesQuery(p, '174'));   // 书架栏当前列出的
  const got = hitsElsewhere(prs, done, '174', shelfList);
  assert.deepEqual(got.map((h) => [h.pr.number, h.tab]), [[174, 'open']]);
  assert.deepEqual(hitsElsewhere(prs, done, '#5', []).map((h) => [h.pr.number, h.tab]), [[5, 'done']]);
  assert.deepEqual(hitsElsewhere(prs, done, '#90', []).map((h) => h.tab), ['shelf']);
  assert.deepEqual(hitsElsewhere(prs, done, '没有的词', []), []);
  assert.deepEqual(hitsElsewhere(prs, done, '  ', []), []);
});

test('searchIndex: 数字 / #数字 按折号命中且排最前；一位数折号不受两字限制', () => {
  const index = [
    { pr: { number: 3, title: '提到 174 的折' }, files: { 'docs/x.md': '见 #174' } },
    { pr: { number: 174, title: 'Hermes 语音外拨开通 SOP' }, files: { 'docs/y.md': '正文' } },
    { pr: { number: 7, title: '七号' }, files: {} },
  ];
  for (const q of ['174', '#174']) {
    const g = searchIndex(index, q);
    assert.equal(g[0].pr.number, 174, q);
    assert.equal(g[0].hits[0].kind, 'number');
  }
  assert.equal(searchIndex(index, '174').length, 2);   // 正文里提到 174 的折照样列在后面
  assert.deepEqual(searchIndex(index, '7').map((x) => x.pr.number), [7]);   // 一位数只认折号（review M5），3 号含「7」不报
  assert.deepEqual(searchIndex(index, '#7').map((x) => x.pr.number), [7]);
});

test('findMatches: 大小写不敏感、多命中、cap 生效', () => {
  const t = 'Alpha beta ALPHA gamma alpha';
  assert.equal(findMatches(t, 'alpha').length, 3);
  assert.equal(findMatches(t, 'ALPHA', 2).length, 2);
  assert.deepEqual(findMatches(t, '没有的词'), []);
  assert.deepEqual(findMatches(t, ''), []);
});

test('findMatches: 中文无分词也能中', () => {
  const t = '涂归栏是阅读批注器。涂归落在行上。';
  assert.equal(findMatches(t, '涂归').length, 2);
});

test('lineOfIndex: 行号 1-based、跨行正确', () => {
  const t = '第一行\n第二行\n第三行';
  assert.equal(lineOfIndex(t, 0), 1);
  assert.equal(lineOfIndex(t, t.indexOf('第二行')), 2);
  assert.equal(lineOfIndex(t, t.indexOf('第三行')), 3);
});

test('snippetAround: 短行整行返回，长行开窗带省略号', () => {
  const short = '短句里找词';
  assert.equal(snippetAround(short, short.indexOf('找'), 1), '短句里找词');
  const long = '开头' + '填'.repeat(80) + '目标词' + '填'.repeat(80) + '结尾';
  const s = snippetAround(long, long.indexOf('目标词'), 3);
  assert.ok(s.includes('目标词'));
  assert.ok(s.startsWith('…') && s.endsWith('…'));
  assert.ok(s.length < 80);
});

test('searchIndex: 标题命中 + 正文命中分组返回；两字以下不搜', () => {
  const index = [
    { pr: { number: 1, title: '涂归 SPEC' }, files: { 'docs/a.md': '第一行\n有涂归的正文' } },
    { pr: { number: 2, title: '无关折子' }, files: { 'docs/b.md': '什么都没有' } },
  ];
  const g = searchIndex(index, '涂归');
  assert.equal(g.length, 1);
  assert.equal(g[0].pr.number, 1);
  assert.equal(g[0].hits.filter((h) => h.kind === 'title').length, 1);
  const doc = g[0].hits.find((h) => h.kind === 'doc');
  assert.equal(doc.line, 2);
  assert.deepEqual(searchIndex(index, '朱'), []);
});

test('hitsElsewhere（review M4）：纯数字查询且当前栏有命中时，别栏只报折号精确命中', () => {
  const titled = (number, title) => ({ number, title, labels: L('kind:读物'), merged_at: '2026-10-01T00:00:00Z' });
  const done = [titled(2, '2026 年度汇总'), titled(3, '第 2026 号令'), titled(2026, '真正的 #2026')];
  const here = [{ number: 40, title: '2026 规划', labels: L('kind:读物') }];
  // 修前：三条全报（标题都含 2026）
  assert.deepEqual(hitsElsewhere([], done, '2026', here).map((h) => h.pr.number), [2026]);
  assert.deepEqual(hitsElsewhere([], done, '#2026', here).map((h) => h.pr.number), [2026]);
  // 当前栏没命中：照旧连标题命中一起报（这是「这栏没有，别栏有」的本意）
  assert.deepEqual(hitsElsewhere([], done, '2026', []).map((h) => h.pr.number), [2, 3, 2026]);
  // 非数字查询不受影响
  assert.deepEqual(hitsElsewhere([], done, '号令', here).map((h) => h.pr.number), [3]);
});

test('searchIndex（review M5）：一位数查询只做折号匹配，不扫标题和全文', () => {
  const index = [
    { pr: { number: 7, title: '七号' }, files: { 'a.md': '第 7 条' } },
    { pr: { number: 8, title: '标题含 7' }, files: { 'b.md': '7 7 7 正文全是 7' } },
  ];
  const g = searchIndex(index, '7');
  assert.deepEqual(g.map((x) => x.pr.number), [7]);
  assert.deepEqual(g[0].hits.map((h) => h.kind), ['number'], '折号那折自己的正文命中也不展开');
  assert.deepEqual(searchIndex(index, '9'), [], '没有这个折号：空，不回退到全文');
  // 两位数照旧：折号 + 标题 + 正文
  assert.ok(searchIndex([{ pr: { number: 77, title: 'x' }, files: { 'c.md': '77' } }], '77')[0].hits.some((h) => h.kind === 'doc'));
});
