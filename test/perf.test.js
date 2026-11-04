// 大文档热路径守门（2026-11 质量巡检）。数操作次数、不卡时钟——时钟测试在 CI 上必抖。
//
// 守的是两条「每次 App 渲染都跑」的路径（基准数见 test/perf/bench.mjs 与 docs/QUALITY-PASS-2026-11.md）：
//   · outdated 串的引文反查 reanchorByQuote —— 曾每条串全量扫一遍块文本（20 条 × 6000 块 ≈ 214ms/渲染）
//   · 草稿卡出处 sectionOf —— 曾每张卡全量扫一遍标题（40 张 ≈ 86ms/渲染）
// 修法是「每篇建一次快照、渲染时只扫快照」。下面钉死：①用快照时不再碰 DOM；②建快照每块只读一次
// textContent；③快照路径与旧的现查路径结果逐条一致（在合成长文档上，用 src/ 原函数 + minidom）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseHTML, installGlobals } from './golden/minidom.mjs';
import { bigDoc } from './perf/fixtures.mjs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
globalThis.window.markdownit = require('../vendor/markdown-it.min.js');
installGlobals(globalThis.window);

const R = await import('../src/render.js');
const A = await import('../src/anchor.js');

const doc = parseHTML(R.renderMarkdown(bigDoc({ sections: 24 }), { headingIds: true }));

// 一个「碰 DOM 就炸」的 doc：用来证明带快照的调用完全不扫 DOM
const untouchable = new Proxy({}, { get(_, k) { throw new Error(`快照路径不该碰 DOM（读了 doc.${String(k)}）`); } });

// 计数桩：每个块的 textContent 被读几次
function countingDoc(blocks) {
  const reads = new Map();
  const nodes = blocks.map(([line, text]) => ({
    dataset: { line: String(line) },
    get textContent() { reads.set(line, (reads.get(line) || 0) + 1); return text; },
  }));
  return { doc: { querySelectorAll: () => nodes }, reads };
}

test('perf: reanchorByQuote 传入快照后不再碰 DOM（每次渲染只扫快照）', () => {
  const index = A.blockTextIndex(doc);
  assert.ok(index.length > 1000, `合成文档应足够大，实得 ${index.length} 块`);
  // doc 只用来判空；真正的扫描必须只走 index
  assert.equal(A.reanchorByQuote(untouchable, '第 13 段的独特引文', index), A.reanchorByQuote(doc, '第 13 段的独特引文'));
});

test('perf: blockTextIndex 每块只读一次 textContent；多条引文共用一份', () => {
  const { doc: d, reads } = countingDoc([[1, '甲 乙 丙 丁'], [3, '戊己  庚辛'], [5, '壬癸子丑']]);
  const index = A.blockTextIndex(d);
  for (const q of ['甲 乙 丙 丁', '戊己 庚辛', '壬癸子丑', '不存在的句子']) A.reanchorByQuote(d, q, index);
  assert.deepEqual([...reads.values()], [1, 1, 1]);
});

test('perf: 快照路径与现查路径结果逐条一致（长文档、含表格嵌套命中与未命中）', () => {
  const index = A.blockTextIndex(doc);
  const quotes = [
    ...Array.from({ length: 30 }, (_, i) => `第 ${i * 11} 段的独特引文`),
    '节3行7', '值 21', '内层条目甲', '新行', '根本不存在的一句话', 'ab',
  ];
  for (const q of quotes) assert.equal(A.reanchorByQuote(doc, q, index), A.reanchorByQuote(doc, q), q);
});

test('perf: sectionOf 传入标题快照后不碰 DOM，且与现查结果一致', () => {
  const heads = A.headingIndex(doc);
  assert.ok(heads.length > 24);
  for (let line = 1; line < 3000; line += 37) {
    assert.equal(A.sectionOf(untouchable, line, heads), A.sectionOf(doc, line), `line ${line}`);
  }
});
