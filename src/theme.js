// 外观（2026-11-03，B · 宣纸书卷）：跟随系统（默认）/ 浅色 / 深色，记住选择。
//
// **纯逻辑，只管「哪一档」与「挂到 <html> 上」**：颜色全在 style.css 的两套变量里
// （`:root[data-theme="dark"]` 与 `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`），
// 这里一个色值都不碰。「跟随系统」= 不挂属性，让媒体查询自己决定；挂了 light/dark 就压过系统。
//
// 存法与 readsize.js 同一套：隐私模式下 localStorage 直接抛，getTheme 在模块顶层同步调用，
// 不兜住就是整站白屏；坏值一律退回默认档。

export const THEMES = ['auto', 'light', 'dark'];
export const DEFAULT_THEME = 'auto';

const KEY = 'zhupi.theme';

export const clampTheme = (v) => (THEMES.includes(v) ? v : DEFAULT_THEME);

/** 「⋯」里点一下轮换：跟随系统 → 浅色 → 深色 → 跟随系统 */
export const nextTheme = (v) => THEMES[(THEMES.indexOf(clampTheme(v)) + 1) % THEMES.length];

export const getTheme = () => {
  try { return clampTheme(localStorage.getItem(KEY)); } catch { return DEFAULT_THEME; }
};

export const setTheme = (v) => {
  try { localStorage.setItem(KEY, clampTheme(v)); } catch { /* 存不下就只在本次会话生效 */ }
};

/** 把档位挂到根元素：auto 不挂（交给系统），light/dark 写 data-theme。root 可注入便于测试。 */
export const applyTheme = (v, root = globalThis.document?.documentElement) => {
  if (!root) return;
  const t = clampTheme(v);
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
};
