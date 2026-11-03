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
} from '../src/cols.js';

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'style.css'), 'utf8',
);

test('默认值与 style.css :root 同步（失同步会让双击归位跳一下）', () => {
  assert.match(CSS, new RegExp(`--art-w:\\s*${ART_DEFAULT}px`));
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
