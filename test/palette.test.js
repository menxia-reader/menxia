// 配色对比度守卫（2026-11-03，主题 a/b/c × 浅/深 六套）。
//
// 从 style.css 把六套变量解析出来，按 WCAG 2.x 相对亮度算对比度：
//   正文 --ink 对 --paper / --paper-raised / --chip ≥ 7:1（AAA 正文）
//   次要 --ink-soft 对 --paper / --paper-raised ≥ 4.5:1
//   链接 --cinnabar-deep 对 --paper ≥ 4.5:1；朱砂 --cinnabar 对 --paper ≥ 3:1（只做点/线/大字）
// 另一条纪律：深色定义有两个入口（`[data-theme="dark"]` 与媒体查询里 `:not([data-theme="light"])`），
// CSS 没有 mixin，只能复制一份——这里比对两份逐字相同，改一处漏一处立刻红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'style.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// 取「某选择器开头的第一条规则」的 body（不处理嵌套；配色块都是平的）
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function block(selector, { inMedia = false } = {}) {
  const re = new RegExp(`(^|[}{;\\n])\\s*${esc(selector)}\\s*\\{([^}]*)\\}`, 'g');
  const hits = [...CSS.matchAll(re)];
  if (!hits.length) return null;
  // 媒体查询里的块排在同选择器的裸块之后（文件里的写法），inMedia 取最后一处，否则取第一处
  return (inMedia ? hits[hits.length - 1] : hits[0])[2];
}
const vars = (body) => Object.fromEntries(
  [...(body || '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

// 六套的叠加顺序与浏览器层叠一致：:root → :root[dark] → html[style] → html[style][dark]
function palette(style, dark) {
  let p = vars(block(':root'));
  if (dark) p = { ...p, ...vars(block(':root[data-theme="dark"]')) };
  if (style !== 'b') {
    p = { ...p, ...vars(block(`html[data-style="${style}"]`)) };
    if (dark) p = { ...p, ...vars(block(`html[data-style="${style}"][data-theme="dark"]`)) };
  }
  return p;
}

const hex = (s) => {
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  assert.ok(m, `只认 6 位 hex（拿到 ${s}）`);
  return [1, 3, 5].map((i) => parseInt(m[1].slice(i - 1, i + 1), 16) / 255);
};
const lum = (c) => {
  const [r, g, b] = hex(c).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a); const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
// --chip 在 b/a 是 rgba（叠在纸上的淡底，与纸几乎同色），只有 c 是实色；只对实色算
const solid = (s) => /^#[0-9a-f]{6}$/i.test(s);

for (const style of ['b', 'a', 'c']) {
  for (const dark of [false, true]) {
    const name = `${style} · ${dark ? '深色' : '浅色'}`;
    test(`配色 ${name}：正文 ≥7:1、次要 ≥4.5:1、链接 ≥4.5:1、朱砂 ≥3:1`, () => {
      const p = palette(style, dark);
      for (const k of ['--paper', '--paper-raised', '--ink', '--ink-soft', '--cinnabar', '--cinnabar-deep']) {
        assert.ok(p[k], `${name} 缺 ${k}`);
      }
      const need = (fg, bg, min, why) => {
        const r = ratio(p[fg], p[bg]);
        assert.ok(r >= min, `${name} ${why}：${fg} ${p[fg]} 对 ${bg} ${p[bg]} = ${r.toFixed(2)}:1，需 ≥ ${min}`);
      };
      need('--ink', '--paper', 7, '正文对纸');
      need('--ink', '--paper-raised', 7, '正文对浮纸');
      need('--ink-soft', '--paper', 4.5, '次要文字对纸');
      need('--ink-soft', '--paper-raised', 4.5, '次要文字对浮纸');
      need('--cinnabar-deep', '--paper', 4.5, '链接对纸');
      need('--cinnabar', '--paper', 3, '朱砂点/线对纸');
      if (solid(p['--chip'])) {
        need('--ink', '--chip', 7, '正文对选中底');
        need('--ink-soft', '--chip', 4.5, '次要文字对选中底');
      }
    });
  }
}

test('深色定义的两个入口逐字相同（[data-theme="dark"] 与 媒体查询里的 :not([data-theme="light"])）', () => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const pairs = [
    [':root[data-theme="dark"]', ':root:not([data-theme="light"])'],
    ['html[data-style="c"][data-theme="dark"]', 'html[data-style="c"]:not([data-theme="light"])'],
  ];
  for (const [explicit, media] of pairs) {
    const a = block(explicit); const b = block(media, { inMedia: true });
    assert.ok(a && b, `缺 ${explicit} 或 ${media}`);
    assert.equal(norm(a), norm(b), `${explicit} 与 ${media} 不一致——深色改了一处漏了一处`);
  }
});
