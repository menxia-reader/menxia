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

test('隐私模式：localStorage 抛异常时不许把异常冒出去', () => {
  reset();
  boom = true;
  assert.doesNotThrow(() => getTheme());
  assert.equal(getTheme(), DEFAULT_THEME);
  assert.doesNotThrow(() => setTheme('dark'));
});
