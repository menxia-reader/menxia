// 外观档位（2026-11-03）。纯逻辑：只测「档位怎么钳、怎么存、怎么挂到根元素、坏值怎么退」。
import { test } from 'node:test';
import assert from 'node:assert/strict';

let store = {};
let boom = false;
globalThis.localStorage = {
  getItem: (k) => { if (boom) throw new Error('SecurityError'); return k in store ? store[k] : null; },
  setItem: (k, v) => { if (boom) throw new Error('SecurityError'); store[k] = String(v); },
};

const {
  THEMES, DEFAULT_THEME, clampTheme, nextTheme, getTheme, setTheme, applyTheme,
  STYLES, DEFAULT_STYLE, clampStyle, nextStyle, getStyle, setStyle, applyStyle,
} = await import('../src/theme.js');

const reset = () => { store = {}; boom = false; };

// 假根元素：只认 set/remove/get 三个方法
const fakeRoot = () => {
  const attrs = {};
  return {
    attrs,
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
  };
};

test('档位表：默认是跟随系统，三档齐全', () => {
  assert.equal(DEFAULT_THEME, 'auto');
  assert.deepEqual(THEMES, ['auto', 'light', 'dark']);
});

test('clampTheme：坏值退回跟随系统', () => {
  for (const bad of [undefined, null, '', 'blue', 0, {}]) assert.equal(clampTheme(bad), 'auto');
  assert.equal(clampTheme('dark'), 'dark');
});

test('nextTheme：跟随系统 → 浅色 → 深色 → 跟随系统', () => {
  assert.equal(nextTheme('auto'), 'light');
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'auto');
  assert.equal(nextTheme('garbage'), 'light', '坏值当作默认档再轮');
});

test('存取往返 + 脏值退回默认', () => {
  reset();
  setTheme('dark');
  assert.equal(getTheme(), 'dark');
  store['zhupi.theme'] = 'garbage';
  assert.equal(getTheme(), 'auto');
  setTheme('nope');
  assert.equal(store['zhupi.theme'], 'auto', '坏值不会被原样写进存储');
});

test('applyTheme：auto 不挂属性（交给系统），light/dark 写 data-theme', () => {
  const root = fakeRoot();
  applyTheme('dark', root);
  assert.equal(root.attrs['data-theme'], 'dark');
  applyTheme('light', root);
  assert.equal(root.attrs['data-theme'], 'light');
  applyTheme('auto', root);
  assert.equal('data-theme' in root.attrs, false);
  assert.doesNotThrow(() => applyTheme('dark', undefined), '没有 document 时静默');
});

// ── 主题（书卷 b / 克制 a / 墨线 c）──
test('主题档位表：默认书卷 b，三档齐全；坏值退回默认', () => {
  assert.equal(DEFAULT_STYLE, 'b');
  assert.deepEqual(STYLES, ['b', 'a', 'c']);
  for (const bad of [undefined, null, '', 'd', 'B', 0, {}]) assert.equal(clampStyle(bad), 'b');
  assert.equal(clampStyle('c'), 'c');
});

test('nextStyle：书卷 → 克制 → 墨线 → 书卷', () => {
  assert.equal(nextStyle('b'), 'a');
  assert.equal(nextStyle('a'), 'c');
  assert.equal(nextStyle('c'), 'b');
  assert.equal(nextStyle('garbage'), 'a');
});

test('主题存取往返 + 脏值退回默认 + 坏值不写进存储', () => {
  reset();
  setStyle('c');
  assert.equal(getStyle(), 'c');
  assert.equal(store['zhupi.style'], 'c');
  store['zhupi.style'] = 'garbage';
  assert.equal(getStyle(), 'b');
  setStyle('nope');
  assert.equal(store['zhupi.style'], 'b');
});

test('applyStyle：默认 b 不挂属性，a/c 写 data-style；主题与外观互不覆盖', () => {
  const root = fakeRoot();
  applyStyle('a', root);
  assert.equal(root.attrs['data-style'], 'a');
  applyTheme('dark', root);
  assert.equal(root.attrs['data-style'], 'a', '切外观不该动主题');
  assert.equal(root.attrs['data-theme'], 'dark');
  applyStyle('b', root);
  assert.equal('data-style' in root.attrs, false);
  assert.equal(root.attrs['data-theme'], 'dark', '切主题不该动外观');
  assert.doesNotThrow(() => applyStyle('c', undefined));
});

test('主题：隐私模式 localStorage 抛异常不冒出去', () => {
  reset();
  boom = true;
  assert.equal(getStyle(), DEFAULT_STYLE);
  assert.doesNotThrow(() => setStyle('a'));
});

test('隐私模式：localStorage 抛异常时不许把异常冒出去', () => {
  reset();
  boom = true;
  assert.doesNotThrow(() => getTheme());
  assert.equal(getTheme(), DEFAULT_THEME);
  assert.doesNotThrow(() => setTheme('dark'));
});
