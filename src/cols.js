// 版心内两栏的宽度（可拖）。2026-08-26 Charlie：「三栏都能拉，正文也给」。
//
// rail.js 已经把「一栏可拖」整套判据做完了——无级不分档、存的是**想要的宽度**而不是
// 夹逼后的生效值、窄窗一律不给拖、上限从 CSS 实测而不在 JS 里复制算术。这份文件不重写
// 那套东西，只把它推广到正文列与大纲栏，差别只有四个常数：min / 默认 / storage key /
// 最窄可拖窗宽。
//
// ── ⚠️ 上限的算法与 rail **不一样**，别照抄过来 ──
//
// 左栏在版心**之外**：`.work` 的 100% 就是「窗宽 − 左栏宽」，所以版心多宽、左栏就少多宽，
// 上限是「窗宽 − 版心盒」。
//
// 正文与大纲在版心**之内**（`--stage = --chap-slot + --main-w + --toc-slot`，而
// `--main-w` 里就含 `--art-w`）——撑大它们等于撑大版心本身。所以上限是
//
//     这一栏当前实宽 + 版心之外还剩的空隙
//     空隙 = 窗宽 − 左栏实宽 − 版心盒
//
// 三个数**全部实测**（左栏量 aside、版心盒量 .geom-probe、栏宽量它自己），一个都不重算。
// 这条是有来由的：style.css 的 1709 / 1940 两个断点是手算的，注释自己写着「改任一栏宽
// 都要重算」——那句话只对 CSS 成立，JS 这边一旦也抄一份，改版式就必然有一处忘了跟。
//
// ⚠️ **覆盖值必须写在 `:root` 上，不能写在 `#app` 行内** —— 这条是 2026-08-26 当天栽出来的。
//
// 自定义属性里的 calc 在**定义它的那个元素**上就求完值了，后代只继承结果。而
// `--main-w` / `--toc-slot` / `--stage` 三条派生式全定义在 `:root`。覆盖写在 `#app` 上时，
// 只有直接读 `--art-w` / `--toc-w` 的 `article` 与 `.toc` 变宽，**版心算式完全不动**：
// 实测把 `--toc-w` 覆盖成 320px 之后，`#app` 上的 `--toc-slot` 仍是 `calc(26px + 200px)`。
// 于是探针量到的是过时的 stage，上限偏大，栏能拉出窗口——大纲右缘 1634 > 窗宽 1600，
// **被静默裁掉 34px，而 `scrollWidth` 仍是 1600**，只查溢出根本发现不了。
//
// 写到 `:root` 之后整条派生链在同一处重新求值：探针跟着变，「拉宽正文 → 左栏可用上限
// 自动缩小」才真的成立，也不用把 style.css 的断点算术复制第二份。
// 这条由 test/cols.test.js 的源码断言守着。

export const ART_MIN = 480;      // ≈29 中文字/行；比 style.css 笔记本档的 620 还窄一档
export const ART_DEFAULT = 680;  // 与 style.css :root 的 --art-w 同值（16.5px 下 ≈41 字/行）
export const TOC_MIN = 200;      // 与 style.css 笔记本档的 --toc-w 同值
export const TOC_DEFAULT = 260;  // 与 style.css :root 的 --toc-w 同值

// 正文：与 style.css 的 `@media (max-width: 1279px)` 同一个界。那一档正文是 `width:100%`
// 的单列，行内 `--art-w` 根本不生效，给了手柄只会让人以为坏了。
export const ART_MIN_WINDOW = 1280;
// 大纲：与 style.css 的 `@media (min-width: 1500px)` 同一个界——低于它 .toc 压根不渲染。
export const TOC_MIN_WINDOW = 1500;

// 正文列的左缩进（2026-08-26 Charlie：「正文左边和目录右边贴得太近了」）。
// 它不是一条「栏」，但受同一套约束：--art-indent 也在 --main-w 的算式里，撑大它同样等于
// 撑大版心。min 给 0 是有意的——他要的是能调，不是换一个我拍脑袋定的死值。
// ⚠️ 默认值随断点变（:root 26 / 笔记本档 16），所以这里的 DEFAULT 只对 :root 那档成立，
// 双击归位是删存量值交还给 CSS，不是写回这个常数。
export const INDENT_MIN = 0;
export const INDENT_DEFAULT = 26;
export const INDENT_MIN_WINDOW = 1280;

export const ART_KEY = 'zhupi.artWidth';
export const TOC_KEY = 'zhupi.tocWidth';
export const INDENT_KEY = 'zhupi.artIndent';

export const isColResizable = (windowWidth, minWindow) =>
  Number.isFinite(windowWidth) && Number.isFinite(minWindow) && windowWidth >= minWindow;

/**
 * 版心之外还剩多少空隙可以拿来撑宽版心内的栏。
 * 三个入参都由调用方从 DOM 实测，见文件头。负数（窗口已经放不下）一律归 0。
 */
export const colSlack = (windowWidth, railWidth, stageBox) => {
  if (![windowWidth, railWidth, stageBox].every(Number.isFinite)) return null;
  return Math.max(0, windowWidth - railWidth - stageBox);
};

/**
 * 这一栏能拉到多宽 = 当前实宽 + 空隙。量不到当前实宽就没有可信的基准，返回 null 让调用方
 * 退回 CSS 默认——宁可没这个功能，也不要拿猜出来的上限把版心拖到横向溢出。
 */
export const colMax = (current, slack, min) => {
  if (!Number.isFinite(current) || !Number.isFinite(slack)) return null;
  return Math.max(min, current + slack);
};

/**
 * 夹到 `[min, max]`。空值判据照抄 rail.js 的 clampRail，理由也一样：
 * `Number(null)` 与 `Number('')` 都是 0，图省事写 `Number(want)` 会让空值变成「0 像素宽」
 * ——栏静默塌成一条缝，还不报错（readsize.js 与 rail.js 都踩过）。
 * 只认真数字与非空数字串，其余返回 null 交给调用方退回 CSS 默认。
 */
export const clampCol = (want, min, max) => {
  const n = typeof want === 'number' ? want
    : (typeof want === 'string' && want.trim() !== '' ? Number(want) : NaN);
  if (!Number.isFinite(n)) return null;
  const hi = Math.max(min, Number.isFinite(max) ? max : min);
  return Math.round(Math.min(Math.max(n, min), hi));
};

// 隐私/无痕模式下 localStorage 直接抛 DOMException，而这些 getter 被 useState 初值同步
// 调用——不兜住就是整站白屏（lang.js / readsize.js / rail.js 都照这个兜法）。

/** 从没拖过、或存量值坏了，一律返回 null＝「别管我，用 CSS 默认」。 */
export const getColWidth = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const n = raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
};

export const setColWidth = (key, px) => {
  try { localStorage.setItem(key, String(Math.round(px))); } catch { /* 存不下就只在本次会话生效 */ }
};

/** 双击手柄归位：删掉存量值，回到 CSS 的响应式默认。 */
export const clearColWidth = (key) => {
  try { localStorage.removeItem(key); } catch { /* 同上 */ }
};

// ── 阅读宽度档（2026-11-03 Charlie：「就算全屏，中间阅读的 text 也只有中间竖着的一条」）──
//
// 正文列**默认跟随窗口**：没拖过手柄时按档位现算宽度，窗口一变就重算。
//   · fill   铺满（默认）——版心吃满 .work，左右只留 max(24, 4% 工作区宽) 的比例留白
//   · medium 适中——同上，但正文封顶 MEDIUM_W
//   · narrow 窄——原口径：交还 CSS 的固定默认（:root 680 / 笔记本档 620），即改版前的样子
// 拖过手柄（ART_KEY 有存量值）就按拖的宽度，档位不管；双击手柄归位后回到档位。
//
// 算法沿用本文件头的口径：不在 JS 里复制 CSS 的栏宽算术，全部从实测量出来。
//   room = 正文当前宽 + 空隙          ← 按 CSS 原留白（--work-pad）还能放多宽
//   fill = room + 2·workPad − 2·pad   ← 把留白从 --work-pad 换成比例留白 pad
// 当前宽与空隙在同一时刻量（空隙算式里就含当前 --art-w），所以 room 与当前正文宽无关：
// 下一帧正文变宽、空隙同步变小，room 不变，算出来的值就稳住了——不会自激。
// 左栏 / 大纲 / 眉批栏 / 章栏 / 缩进都在空隙里扣过，所以「与侧栏并存时按剩余宽度算」是自动的。

export const WIDTH_PRESETS = ['fill', 'medium', 'narrow'];
export const DEFAULT_WIDTH_PRESET = 'fill';
export const WIDTH_KEY = 'zhupi.readWidth';
export const MEDIUM_W = 900;
export const NARROW_W = ART_DEFAULT;   // 窄档＝原 680 口径（笔记本档仍是 CSS 的 620）
export const FLUID_PAD_MIN = 24;
export const FLUID_PAD_RATIO = 0.04;

export const normWidthPreset = (p) => (WIDTH_PRESETS.includes(p) ? p : DEFAULT_WIDTH_PRESET);

/** 顶栏按钮轮换：铺满 → 适中 → 窄 → 铺满。 */
export const nextWidthPreset = (p) =>
  WIDTH_PRESETS[(WIDTH_PRESETS.indexOf(normWidthPreset(p)) + 1) % WIDTH_PRESETS.length];

export const getWidthPreset = () => {
  try { return normWidthPreset(localStorage.getItem(WIDTH_KEY)); } catch { return DEFAULT_WIDTH_PRESET; }
};

export const setWidthPreset = (p) => {
  try { localStorage.setItem(WIDTH_KEY, normWidthPreset(p)); } catch { /* 存不下就只在本次会话生效 */ }
};

/** 比例留白（每侧）：max(24, 工作区宽 × 4%)。 */
export const fluidPad = (workW) => Math.max(FLUID_PAD_MIN, workW * FLUID_PAD_RATIO);

/**
 * 没拖过手柄时正文列该多宽。返回 null＝交还 CSS 默认（窄档，或量不到几何）。
 *
 * @param preset   'fill' | 'medium' | 'narrow'
 * @param artNow   正文列当前宽（:root 上 --art-w 的生效值）
 * @param slack    同一时刻量的空隙（colSlack），允许为 0
 * @param workPad  CSS 的 --work-pad（.work 的最小左右留白）
 * @param workW    工作区宽＝窗宽 − 左栏实宽
 * @param base     CSS 的固定默认正文宽（--art-base：680 / 笔记本档 620）
 *
 * 下限 min(base, room)：比例留白在紧凑档（1280–1709）会比原来的 26px 宽，铺满反而比原版窄
 * ——那就保留原版宽度，绝不比改版前更窄。上限 room：永远不超出按原留白能放下的宽度，
 * 不会横向溢出。最后兜 ART_MIN，与拖动的下限同一口径。
 */
export const fluidArt = ({ preset, artNow, slack, workPad, workW, base }) => {
  const p = normWidthPreset(preset);
  if (p === 'narrow') return null;
  if (![artNow, slack, workPad, workW, base].every(Number.isFinite)) return null;
  const room = artNow + slack;
  const fill = room + 2 * workPad - 2 * fluidPad(workW);
  const target = p === 'medium' ? Math.min(MEDIUM_W, fill) : fill;
  const floor = Math.min(base, room);
  return Math.round(Math.max(ART_MIN, Math.min(room, Math.max(target, floor))));
};

/**
 * 单列档（901–1279：正文 width:100%）里的封顶。铺满不封（null），适中 / 窄各封各的。
 * 手机档（≤900）不读这个变量——style.css 只在 901–1279 用它。
 */
export const artCap = (preset) => {
  const p = normWidthPreset(preset);
  return p === 'medium' ? MEDIUM_W : p === 'narrow' ? NARROW_W : null;
};
