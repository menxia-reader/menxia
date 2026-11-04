// 展图浮窗：把正文里的图从栏宽里捞出来看原尺寸。
//
// 由来（2026-08-06，PAIN #55）：mermaid 架构图以 `-s 3` 渲成两三千像素宽的 PNG，
// 进折被 `article img { max-width: 100% }` 压到栏宽（手机上 ~360px）——线全糊在一起。
// 叠加 SPEC 早认下的那条代价「图片不能划句涂归」，图在手机上既点不开也批不了，
// 退化成装饰；而 #55 那折押了六张架构图。原话：「图不能点开放大」。
//
// **为什么不挂在 hydrateRelativeImages 上**（第一版是这么提的，错了）：
// 那个函数只挑非 http/data/blob 的 src——即只处理**相对路径**图（私有仓走 Contents API
// 换 blob URL 的那批）。正文里写绝对 URL 的图它一张都不碰，于是那些图会静默地点不开，
// 成为「有时能放大有时不能」的玄学。改为在正文岛屿上做**事件委托**：一个监听器、
// 覆盖全部 img、且天然扛住岛屿的 innerHTML 重渲染（岛屿是 uncontrolled 的，
// 每次换文档整个 replaceChildren，逐图挂 handler 等于每次都要重挂）。
//
// **为什么不靠原生捏合**：viewport 没锁 user-scalable，页面本身能捏合，但这是
// `position: fixed` 的幕布——捏合缩的是 layout viewport，幕布跟着一起放大，
// 图仍然只有那么多像素，等于白缩。所以给显式的 合观⇄原尺寸 两档：原尺寸档下
// 容器自己可滚，双向拖动看细节，这才是「放大」真正要的东西。
//
// 纯展示，只吃 props。三条退路（Esc / 点幕布 / 掩卷钮）都收在 onClose 一个口，与展读浮窗同构。
import { html, useEffect, useRef, useState } from '../../vendor/preact-standalone.mjs';
import { S } from '../strings.js';

export function ImageView({ src, alt, onClose }) {
  const panelRef = useRef();
  const [full, setFull] = useState(false); // false=合观（塞进屏幕） true=原尺寸（可滚）
  // 开窗即收焦点：否则 Tab 会跑到幕布背后的按钮上，读屏也停在原处（同 thread-view）。
  // 关窗还焦点（2026-11 质量巡检）：此前收窗后焦点落回 <body>，键盘用户要从页首重新 Tab 回来。
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus();
    return () => { if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true }); };
  }, []);
  return html`
    <div class="img-view-backdrop"
      onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="img-view" ref=${panelRef} tabIndex="-1"
        role="dialog" aria-modal="true" aria-label=${S.imageView.aria}>
        <div class="img-view-bar">
          <span class="img-view-alt">${alt || S.imageView.untitled}</span>
          <button class="btn-ghost" title=${S.imageView.zoomTitle}
            onClick=${() => setFull((v) => !v)}>${full ? S.imageView.fit : S.imageView.full}</button>
          <button class="btn-ghost img-view-close" title=${S.imageView.closeTitle}
            onClick=${onClose}>${S.imageView.close}</button>
        </div>
        <div class=${'img-view-stage' + (full ? ' full' : '')}
          onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <img src=${src} alt=${alt || ''} onClick=${() => setFull((v) => !v)} />
        </div>
      </div>
    </div>`;
}

// 正文岛屿上的事件委托。返回解绑函数，交给 useEffect。
// 只认 <article> 内的 img：评论正文里的图暂不接（那儿的图多是截图小图，且 300px 眉批栏里
// 点击热区与展读浮窗的交互会打架）——**这是刻意的范围，不是漏的**，要接再单开一条。
export function bindImageZoom(island, onZoom) {
  if (!island) return () => {};
  const onClick = (e) => {
    const img = e.target.closest('img');
    if (!img || !island.contains(img)) return;
    // 图外链在 markdown 里写成 [![](a.png)](b) 时，点击应当走链接而不是开浮窗
    if (img.closest('a')) return;
    e.preventDefault();
    onZoom({ src: img.currentSrc || img.src, alt: img.getAttribute('alt') || '' });
  };
  island.addEventListener('click', onClick);
  return () => island.removeEventListener('click', onClick);
}
