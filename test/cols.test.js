// 版心内两栏可拖的纯逻辑。与 rail.test.js 同一层：只测判据，不碰 DOM。
//
// 这里刻意多测两条 rail 没有的：
// ① 上限算法**不是** rail 那条（rail 在版心外，这两栏在版心内），抄错会横向溢出；
// ② 常数必须与 style.css 对得上——默认值一旦和 :root 失同步，双击归位就会「跳一下」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ART_MIN, ART_DEFAULT, TOC_MIN, TOC_DEFAULT,
  ART_MIN_WINDOW, TOC_MIN_WINDOW, ART_KEY, TOC_KEY,
  isColResizable, colSlack, colMax, clampCol,
  WIDTH_PRESETS, DEFAULT_WIDTH_PRESET, WIDTH_KEY, MEDIUM_W, NARROW_W, INDENT_KEY,
  normWidthPreset, nextWidthPreset, fluidPad, fluidArt, artCap,
} from '../src/cols.js';

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'style.css'), 'utf8',
);

test('默认值与 style.css :root 同步（失同步会让双击归位跳一下）', () => {
  // 2026-11-03 起 --art-w 默认取 --art-base（JS 覆盖 --art-w 后仍要能读到 CSS 默认）
  assert.match(CSS, new RegExp(`--art-base:\\s*${ART_DEFAULT}px`));
  assert.match(CSS, /--art-w:\s*var\(--art-base\)/);
  assert.match(CSS, new RegExp(`--toc-w:\\s*${TOC_DEFAULT}px`));
});

test('可拖窗宽的界与 style.css 的断点同源', () => {
  // 正文：≤1279 是单列档，那一档 article 是 width:100%，行内 --art-w 不生效
  assert.equal(ART_MIN_WINDOW, 1280);
  assert.match(CSS, /@media \(max-width: 1279px\)/);
  // 大纲：<1500 时 .toc 压根不渲染
  assert.equal(TOC_MIN_WINDOW, 1500);
  assert.match(CSS, /@media \(min-width: 1500px\)/);
});

test('窄窗不给拖', () => {
  assert.equal(isColResizable(1279, ART_MIN_WINDOW), false);
  assert.equal(isColResizable(1280, ART_MIN_WINDOW), true);
  assert.equal(isColResizable(1499, TOC_MIN_WINDOW), false);
  assert.equal(isColResizable(1500, TOC_MIN_WINDOW), true);
  assert.equal(isColResizable(undefined, ART_MIN_WINDOW), false);
  assert.equal(isColResizable(1600, undefined), false);
});

test('空隙＝窗宽 − 左栏实宽 − 版心盒；放不下时归 0 不返回负数', () => {
  assert.equal(colSlack(1920, 300, 1400), 220);
  // 窗口已经放不下版心：再让栏「负增长」只会把它压成一条缝
  assert.equal(colSlack(1280, 300, 1400), 0);
  assert.equal(colSlack(1920, 300, null), null);
});

test('上限＝当前实宽 + 空隙（不是 rail 那条「窗宽 − 版心盒」）', () => {
  assert.equal(colMax(680, 220, ART_MIN), 900);
  assert.equal(colMax(260, 220, TOC_MIN), 480);
  // 空隙为 0 时上限就是现状——能缩不能放
  assert.equal(colMax(680, 0, ART_MIN), 680);
  // 量不到当前实宽就没有可信基准
  assert.equal(colMax(null, 220, ART_MIN), null);
  // 当前实宽已经比 min 还小（窗口烂到版式溢出）时不许把上限也压到 min 以下
  assert.equal(colMax(300, 0, ART_MIN), ART_MIN);
});

test('夹逼：拖不出 [min, max]', () => {
  assert.equal(clampCol(10_000, ART_MIN, 900), 900);
  assert.equal(clampCol(100, ART_MIN, 900), ART_MIN);
  assert.equal(clampCol(700, ART_MIN, 900), 700);
});

test('空值不许被当成 0 宽（Number(null)===0 那个坑）', () => {
  for (const bad of [null, undefined, '', '   ', 'abc', NaN, {}, []]) {
    assert.equal(clampCol(bad, ART_MIN, 900), null, `${JSON.stringify(bad)} 应当返回 null`);
  }
  // 数字串是合法输入（localStorage 存的就是串）
  assert.equal(clampCol('720', ART_MIN, 900), 720);
});

test('max 比 min 还小时取 min，绝不返回负数或倒挂', () => {
  assert.equal(clampCol(600, ART_MIN, 100), ART_MIN);
});

test('返回整数像素', () => {
  assert.equal(clampCol(700.6, ART_MIN, 900), 701);
  assert.equal(Number.isInteger(clampCol('612.4', ART_MIN, 900)), true);
});

test('两栏的 storage key 不能撞（撞了就是拉正文连大纲一起动）', () => {
  assert.notEqual(ART_KEY, TOC_KEY);
  assert.match(ART_KEY, /^zhupi\./);
  assert.match(TOC_KEY, /^zhupi\./);
});

// ── 阅读宽度档（2026-11-03）：正文默认跟随窗口 ──

test('档位：默认铺满；坏值归默认；轮换 铺满→适中→窄→铺满', () => {
  assert.deepEqual(WIDTH_PRESETS, ['fill', 'medium', 'narrow']);
  assert.equal(DEFAULT_WIDTH_PRESET, 'fill');
  for (const bad of [null, undefined, '', 'wide', 0]) assert.equal(normWidthPreset(bad), 'fill');
  assert.equal(nextWidthPreset('fill'), 'medium');
  assert.equal(nextWidthPreset('medium'), 'narrow');
  assert.equal(nextWidthPreset('narrow'), 'fill');
  assert.equal(nextWidthPreset('garbage'), 'medium');
  assert.equal(MEDIUM_W, 900);
  assert.equal(NARROW_W, 680);
  assert.match(WIDTH_KEY, /^zhupi\./);
  assert.ok(![ART_KEY, TOC_KEY, INDENT_KEY].includes(WIDTH_KEY));
});

test('比例留白＝max(24, 工作区宽 × 4%)', () => {
  assert.equal(fluidPad(400), 24);
  assert.equal(fluidPad(600), 24);
  assert.equal(fluidPad(2260), 90.4);
});

// 1920 全屏、左栏 300、有大纲（≥1710 默认几何）：版心＝缩进26+正文680+间距34+眉批300+大纲槽294
// = 1334，探针再加 work-pad 36×2 → 1406；空隙 = 1920 − 300 − 1406 = 214。
const G1920 = { artNow: 680, slack: 214, workPad: 36, workW: 1620, base: 680 };

test('铺满：正文吃掉空隙，左右留白换成比例留白', () => {
  // room = 894；fill = 894 + 72 − 2×64.8 = 836.4 → 836
  assert.equal(fluidArt({ ...G1920, preset: 'fill' }), 836);
  // 2560 全屏：比 1920 宽得多，正文跟着宽
  const w = fluidArt({ artNow: 680, slack: 854, workPad: 36, workW: 2260, base: 680, preset: 'fill' });
  assert.ok(w > 1300, `2560 下正文应 >1300，得 ${w}`);
});

test('铺满随窗口变：窗口越宽正文越宽，缩回来也跟着缩', () => {
  const at = (winW) => fluidArt({ artNow: 680, slack: winW - 300 - 1406, workPad: 36, workW: winW - 300, base: 680, preset: 'fill' });
  assert.ok(at(1800) < at(2200));
  assert.ok(at(2200) < at(2560));
});

test('自洽：用算出来的宽度再量一遍，结果不变（不会自激来回跳）', () => {
  const w1 = fluidArt({ ...G1920, preset: 'fill' });
  // 正文变成 w1 后版心变宽 (w1 − 680)，同一窗口下空隙同步变小
  const w2 = fluidArt({ ...G1920, artNow: w1, slack: G1920.slack - (w1 - 680), preset: 'fill' });
  assert.equal(w2, w1);
});

test('与侧栏 / 大纲并存按剩余宽度算：大纲拉宽 60，空隙为负，正文让出 60', () => {
  const w1 = fluidArt({ ...G1920, preset: 'fill' });
  const after = fluidArt({ ...G1920, artNow: w1, slack: G1920.slack - (w1 - 680) - 60, preset: 'fill' });
  assert.equal(after, w1 - 60);
  // 左栏宽 100：工作区变窄，空隙同样变小
  const rail = fluidArt({ ...G1920, artNow: w1, slack: G1920.slack - (w1 - 680) - 100, workW: 1520, preset: 'fill' });
  assert.ok(rail < w1 - 90);
});

test('适中：封顶 900，放不下就照铺满收', () => {
  const big = { artNow: 680, slack: 854, workPad: 36, workW: 2260, base: 680 };
  assert.equal(fluidArt({ ...big, preset: 'medium' }), 900);
  assert.equal(fluidArt({ ...G1920, preset: 'medium' }), 836);
});

test('窄：交还 CSS 默认（null），即改版前的 680 / 620', () => {
  assert.equal(fluidArt({ ...G1920, preset: 'narrow' }), null);
});

test('紧凑档：比例留白比 26px 宽时不比改版前更窄，且绝不超出能放下的宽度', () => {
  // 1500 窗、笔记本档：左栏 240、正文 620、版心＝16+620+26+300+226 = 1188，探针 +52 → 1240，空隙 20
  const r = fluidArt({ artNow: 620, slack: 20, workPad: 26, workW: 1260, base: 620, preset: 'fill' });
  assert.ok(r >= 620, `不应比原版 620 窄，得 ${r}`);
  assert.ok(r <= 640, `不应超出 room 640，得 ${r}`);
  // 已经溢出（空隙为负）时上限是 room，正文让出来
  assert.equal(fluidArt({ artNow: 620, slack: -50, workPad: 26, workW: 1260, base: 620, preset: 'fill' }), 570);
  // 再挤也不低于 ART_MIN
  assert.equal(fluidArt({ artNow: 620, slack: -500, workPad: 26, workW: 1260, base: 620, preset: 'fill' }), ART_MIN);
});

test('量不到几何就返回 null（退回 CSS 默认，不猜）', () => {
  for (const k of ['artNow', 'slack', 'workPad', 'workW', 'base']) {
    assert.equal(fluidArt({ ...G1920, [k]: null, preset: 'fill' }), null, k);
  }
});

test('单列档封顶：铺满不封，适中 900，窄 680', () => {
  assert.equal(artCap('fill'), null);
  assert.equal(artCap('medium'), 900);
  assert.equal(artCap('narrow'), 680);
  // CSS 侧：只在 901–1279 读 --art-cap，手机档不碰
  assert.match(CSS, /@media \(min-width: 901px\) and \(max-width: 1279px\)\s*\{\s*\.work \{ padding-inline: max\(24px, 4%, calc\(\(100% - var\(--art-cap, 100%\)\) \/ 2\)\); \}/);
  assert.match(CSS, /--art-base:\s*620px/);
});

test('ui.js 接线：没拖过才跟随；--art-cap 写在 documentElement 上', () => {
  const UI = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui.js'), 'utf8',
  );
  assert.match(UI, /artW == null && isColResizable\(winW, ART_MIN_WINDOW\)/);
  assert.match(UI, /setProperty\('--art-cap'/);
});

// ── 回归闸门：覆盖值必须写在 :root 上，不能写回 #app 行内 ──
//
// 2026-08-26 栽过一次：--art-w / --toc-w 写在 #app 行内时，:root 上的 --main-w /
// --toc-slot / --stage 三条派生式**已经把旧值算死了**（自定义属性的 calc 在定义它的元素上
// 求值，后代只继承结果）。于是几何探针量到过时的 stage、上限偏大，大纲能拉到窗外——
// 而且是静默裁切，scrollWidth 查不出来。
//
// 这条只能靠读源码守：它是「写在哪个元素上」的问题，纯逻辑层测不到，而真浏览器测又
// 恰好会被「看起来宽度变了」骗过去（当时就是这么漏的）。
test('--art-w / --toc-w 必须写在 documentElement 上', () => {
  const UI = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui.js'), 'utf8',
  );
  for (const v of ['--art-w', '--toc-w']) {
    assert.match(UI, new RegExp(`setProperty\\('${v}'`),
      `${v} 应当用 documentElement.style.setProperty 写`);
    assert.doesNotMatch(UI, new RegExp(`'${v}':\\s*\``),
      `${v} 不能写回 #app 的行内 style 对象——那样版心算式不会跟着变`);
  }
  // --rail-w 不参与派生链（左栏在版心之外），仍留在 #app 行内，别被这条误伤
  assert.match(UI, /'--rail-w':\s*`/);
});
