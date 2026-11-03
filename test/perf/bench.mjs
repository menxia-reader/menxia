// 大文档性能基准（2026-11 质量巡检）——不是测试，不进 `node --test test/*.test.js`。
//
//   node test/perf/bench.mjs          打印各热路径的中位耗时（ms）
//
// 用 test/golden/minidom.mjs 在 node 里跑 **src/ 的原函数**（与 golden 导出同法，一行逻辑不复制），
// 喂一篇合成的长文档：几千段落 + 上百张表 + 几十个 mermaid 围栏 + 几百个标题。
// minidom 的 textContent 与浏览器同为「后代文本按序拼接」，所以 O(n) 量级与真 DOM 一致；
// 绝对毫秒数只用于前后对比，不代表真机。守门的是 test/perf.test.js（数操作次数，不卡时钟）。
import { createRequire } from 'node:module';
import { parseHTML, installGlobals } from '../golden/minidom.mjs';
import { bigDoc, bigIndex } from './fixtures.mjs';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
globalThis.window.markdownit = require('../../vendor/markdown-it.min.js');
installGlobals(globalThis.window);

const R = await import('../../src/render.js');
const A = await import('../../src/anchor.js');
const T = await import('../../src/toc.js');
const Sx = await import('../../src/search.js');

function bench(name, fn, runs = 7) {
  fn(); // 预热
  const ts = [];
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    ts.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  ts.sort((a, b) => a - b);
  const med = ts[Math.floor(ts.length / 2)];
  console.log(`${name.padEnd(58)} ${med.toFixed(2).padStart(9)} ms`);
  return med;
}

const src = bigDoc();
const html = R.renderMarkdown(src, { headingIds: true });
const doc = parseHTML(html);
const blocks = doc.querySelectorAll('[data-line]').length;
const heads = T.extractOutline(doc).length;
console.log(`文档：${(src.length / 1024).toFixed(0)} KB 源码 · ${src.split('\n').length} 行 · ${blocks} 个 [data-line] 块 · ${heads} 个标题\n`);

// 20 条 outdated 涂归按引文反查（ui.js 每次 App 渲染都要跑一遍）
const quotes = Array.from({ length: 20 }, (_, i) => `第 ${i * 97 + 13} 段的独特引文`);
const index = bigIndex(30);
const drafts = Array.from({ length: 40 }, (_, i) => ({ blockLine: 50 + i * 250 }));

bench('renderMarkdown（整篇）', () => R.renderMarkdown(src, { headingIds: true }), 5);
bench('reanchorByQuote × 20（逐条全量扫块）', () => quotes.forEach((q) => A.reanchorByQuote(doc, q)));
// 下面两组是 ui.js 现行做法：快照按 [docTick, docPath] 备一次，之后每次渲染只扫快照
const bi = A.blockTextIndex(doc);
const hi = A.headingIndex(doc);
bench('  └ blockTextIndex（每篇建一次）', () => A.blockTextIndex(doc));
bench('  └ reanchorByQuote × 20（每次渲染，用快照）', () => quotes.forEach((q) => A.reanchorByQuote(doc, q, bi)));
bench('sectionOf × 40 草稿卡（逐卡全量扫标题）', () => drafts.forEach((d) => A.sectionOf(doc, d.blockLine, A.headingIndex(doc))));
bench('  └ headingIndex（每篇建一次）', () => A.headingIndex(doc));
bench('  └ sectionOf × 40（每次渲染，用快照）', () => drafts.forEach((d) => A.sectionOf(doc, d.blockLine, hi)));
bench('extractOutline', () => T.extractOutline(doc));
bench('searchIndex（30 折 × ~190 KB，常见词）', () => Sx.searchIndex(index, 'the'));
bench('searchIndex（30 折 × ~190 KB，尾部罕见词）', () => Sx.searchIndex(index, '尾部罕见词'));
const tail = index[0].files['docs/a.md'];
bench('lineOfIndex × 5（文末命中）', () => { for (let i = 0; i < 5; i++) Sx.lineOfIndex(tail, tail.length - 10 - i); });
