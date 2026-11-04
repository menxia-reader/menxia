// F14 大纲／章列表（视图）。两个独立部件，长折的两半：
//   Outline    —— 篇内浮动大纲（右侧固定小栏）+ scroll spy，点标题跳到对应块。
//   ChapterList —— 篇多时取代 doc-tab 条的章下拉（下拉里列全部章，跳章）。
//
// 都不碰渲染管线/批注定位：跳转复用 ui.js 传进来的 onJump（走既有 data-line scroll-to-line 那条路），
// scroll spy 只**读** DOM 的 getBoundingClientRect，不写任何布局。栏是 position:fixed，
// 只在够宽的视口出现（CSS 媒体查询兜底），不占正文/右缘批注栏的流，天然不遮挡。
import { html, useState, useEffect, useRef } from '../../vendor/preact-standalone.mjs';
import { activeHeadingLine } from '../toc.js';
import { S } from '../strings.js';

// 滚动容器：只有 .work 滚（sidebar/topbar 钉死）。scroll spy 与「读标题相对位置」都以它为参照。
const scrollHost = () => document.querySelector('.work');

// ── 篇内浮动大纲 ──
// items：extractOutline 的产物（[{ line, level, text, id }]）。空/太短由调用方拦（hasOutline），这里不判。
// docRef：正文 article 元素，用来实时量各标题位置做 scroll spy。
// onJump(line)：跳到该行（ui.js 提供，复用 search-flash 那条 scroll-to-line）。
// onGripDown / onGripReset：左缘的拖宽手柄（2026-08-26）。逻辑全在 ui.js，这里只挂事件——
// 与 .rail-grip 同一套写法。手柄在**左缘**，所以往左拖才是变宽（方向在 ui.js 里以 sign 处理）。
export function Outline({ items, docRef, onJump, onGripDown, onGripReset }) {
  const [active, setActive] = useState(items[0]?.line ?? null);
  // 折叠态：宽屏默认展开；用户可收起（长文档大纲本身也会很长）。收起只留一个标题条。
  const [open, setOpen] = useState(true);
  const rafRef = useRef(0);

  // scroll spy：滚动时算「当前所在标题」。用 rAF 去抖（scroll 高频，getBoundingClientRect 会触发布局）。
  // 换文档时 items 变 → effect 重挂，重新以新标题集算一次（先跑一次免得切章后高亮停在旧位置）。
  useEffect(() => {
    const host = scrollHost();
    const doc = docRef?.current;
    if (!host || !doc) return undefined;
    // 标题节点集在本 effect 生命周期内不变（换文档 → items 变 → effect 重挂），查一次即可，
    // 不必每个滚动帧都 querySelectorAll 一遍（2026-11 质量巡检）。
    const heads = [...doc.querySelectorAll('h1[data-line],h2[data-line],h3[data-line]')]
      .filter((h) => +h.dataset.line);
    const recompute = () => {
      const hostTop = host.getBoundingClientRect().top;
      const tops = heads.map((h) => ({ line: +h.dataset.line, top: h.getBoundingClientRect().top - hostTop }));
      setActive(activeHeadingLine(tops));
    };
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; recompute(); });
    };
    recompute();
    host.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      host.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [items, docRef]);

  return html`
    <nav class=${'toc' + (open ? '' : ' toc-collapsed')} aria-label=${S.outline.aria}>
      ${onGripDown && html`<button class="toc-grip" aria-hidden="true" tabindex="-1"
        onPointerDown=${onGripDown} onDblClick=${onGripReset}></button>`}
      <button class="toc-head" aria-expanded=${open} onClick=${() => setOpen((o) => !o)}>
        ${open ? '▾' : '▸'} ${S.outline.title}
      </button>
      ${open && html`
        <ol class="toc-list">
          ${items.map((it) => html`
            <li key=${it.id} class=${`toc-item toc-l${it.level}` + (it.line === active ? ' toc-active' : '')}>
              <button class="toc-link" title=${it.text} aria-current=${it.line === active ? 'location' : undefined}
                onClick=${() => onJump(it.line)}>${it.text}</button>
            </li>`)}
        </ol>`}
    </nav>`;
}

// ── 章列表·左栏（2026-08-03 反馈：「把第一章第二章也变成悬浮窗，放正文左边的空地里」）──
// 与右侧大纲同一套视觉语言，镜像到版心左侧：大纲管**篇内**（这一章讲了什么），
// 章栏管**篇间**（这本书有哪些章）。两者不重叠，所以可以并存。
// 不做 JS 测宽——测宽要挂 resize 监听、还会和 CSS 断点各算一套，迟早对不上。
export function ChapterRail({ chapters, onOpenChapter }) {
  const idx = chapters.findIndex((c) => c.active);
  return html`
    <nav class="chapter-rail" aria-label=${S.outline.chapterAria}>
      <div class="chapter-rail-head">${S.outline.chapterLabel(idx >= 0 ? idx + 1 : 1, chapters.length)}</div>
      <ol class="chapter-rail-list">
        ${chapters.map((c, i) => html`
          <li key=${c.path}>
            <button class=${'chapter-rail-opt' + (c.active ? ' active' : '')} title=${c.name}
              onClick=${() => onOpenChapter(c.path)}>
              <span class="chapter-rail-num">${i + 1}</span><span class="chapter-rail-name">${c.name}</span>
            </button>
          </li>`)}
      </ol>
    </nav>`;
}

// ── 章下拉（取代 tab 条）──
// chapters：chapterList 的产物（[{ path, name, active }]）。onOpenChapter(path)：切到该章（= setDocPath）。
// 用原生 details/summary：零依赖、点外部自动收（浏览器管），键盘可达，不引状态管理。
//
// ⚠️ 它与 `ChapterRail` 是**同一份数据的两种版式**，由 CSS 断点二选一显示（见 --chap-slot）：
// 够宽摊成左栏，不够宽留在正文之上当下拉。改任一个先想想另一个。
export function ChapterList({ chapters, onOpenChapter }) {
  const cur = chapters.find((c) => c.active);
  const idx = chapters.findIndex((c) => c.active);
  const ref = useRef(null);
  const pick = (path) => { onOpenChapter(path); if (ref.current) ref.current.open = false; };
  return html`
    <details class="chapters" ref=${ref}>
      <summary class="chapters-summary">
        <span class="chapters-label">${S.outline.chapterLabel(idx >= 0 ? idx + 1 : 1, chapters.length)}</span>
        <span class="chapters-cur">${cur ? cur.name : ''}</span>
      </summary>
      <ol class="chapters-menu">
        ${chapters.map((c, i) => html`
          <li key=${c.path}>
            <button class=${'chapters-opt' + (c.active ? ' active' : '')} onClick=${() => pick(c.path)}>
              <span class="chapters-num">${i + 1}</span>${c.name}
            </button>
          </li>`)}
      </ol>
    </details>`;
}
