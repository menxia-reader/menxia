// 合成的大文档 / 大搜索索引——bench.mjs 与 perf.test.js 共用。确定性生成（无随机），数可复现。

// 一篇「重表格 + 重 mermaid + 多标题」的长折，形状仿真实 review 折：
// 每节 = h2 + 若干段落 + 一张 30 行表 + 嵌套列表 + 隔几节一个 mermaid / diff 围栏。
export function bigDoc({ sections = 120, parasPerSection = 16, tableRows = 30 } = {}) {
  const out = ['# 总纲', ''];
  let p = 0;
  for (let s = 0; s < sections; s++) {
    out.push(`## 第 ${s + 1} 节 设计取舍`, '');
    if (s % 3 === 0) out.push(`### 细目 ${s + 1}.1`, '');
    for (let i = 0; i < parasPerSection; i++, p++) {
      out.push(`第 ${p} 段的独特引文。The quick brown fox jumps over the lazy dog, 这是一段用于测长文的正文，含**加粗**与\`code\`。`, '');
    }
    out.push('| 列一 | 列二 | 列三 | 列四 |', '|---|---|---|---|');
    for (let r = 0; r < tableRows; r++) out.push(`| 节${s}行${r} | 值 ${r * 7} | 说明文字 the | 备注 |`);
    out.push('');
    out.push('- 外层条目', '  - 内层条目甲', '  - 内层条目乙', '- 外层条目二', '');
    if (s % 4 === 0) out.push('```mermaid', 'graph TD', '  A[开始] --> B{判断}', '  B -->|是| C[结束]', '```', '');
    if (s % 6 === 0) out.push('```diff', '@@ -1,3 +1,3 @@', ' 上下文', '-旧行', '+新行', '```', '');
  }
  return out.join('\n');
}

// 搜索索引：n 折，每折一篇 ~190 KB 的文档，罕见词只在文末出现一次。
export function bigIndex(n = 30) {
  const body = Array.from({ length: 2400 }, (_, i) => `line ${i}: the quick brown fox 正文第${i}行，用于搜索基准。`).join('\n');
  return Array.from({ length: n }, (_, k) => ({
    pr: { number: k + 1, title: `折 ${k + 1} the title` },
    files: { 'docs/a.md': `${body}\n尾部罕见词 在这里\n` },
  }));
}
