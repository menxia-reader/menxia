// 题签行（B · 宣纸书卷，2026-11-03 由「顶栏」改）：左边面包屑交代「待审 · #999 · 折名」，
// 右边只露 判 / 呈 n 批 / 「可」印 / ⋯ 三四个动作；刷新、引用此处、回奏、携卷、字号 A±、
// 阅读宽度、外观、更新到最新版全部收进「⋯」菜单（所有断点一致，不再只是手机档）。
// DOM 钩子不动：.mainbar / .crumb / .crumb-no / .actions / .btn-ghost / .btn-qinci / .more-btn /
// .more-item / .update-app / .read-size 这些类名 smoke 与组件测试都在用，只是位置与长相变了。
// 从 ui.js 拆出（2026-07-28 还账：ui.js 破 800 行触发指标 #1）。纯展示，只吃 props。
import { html } from '../../vendor/preact-standalone.mjs';
import { S } from '../strings.js';
import { isShelved } from '../track.js';
import { READ_STEPS, percentOf } from '../readsize.js';

export function Topbar({
  cur, archived, onHead, busy, draftCount, verifyN = 0, happyUrl, stale, notice, carrying,
  readStep = 1, onReadStep, widthPreset = 'fill', onWidthPreset, moreOpen = false, onMore, onUpdate, updating = false,
  theme = 'auto', onTheme,
  onRefresh, onCopyRef, onCarry, onZongpi, onSubmit, onQinci,
  nextUp, onNextUp, onNoticeClose,
}) {
  const pct = percentOf(readStep);
  // 面包屑根词跟折的实际归属走：遗留闲读折在读毕书架（未画可组）、画可折在已画可。写死「待审」
  // 会让人去待审清单里找一个根本不在那儿的折（2026-08-18 #88 实测就这么误导了一回）。
  // 已画可的读物两栏都在（已画可是全量归档，书架是切面），面包屑沿用「已画可」。
  const crumbRoot = !cur ? S.topbar.crumbRoot
    : archived ? S.topbar.crumbDone
    : isShelved(cur.pr) ? S.topbar.crumbShelf
    : S.topbar.crumbRoot;
  // 「⋯」只在有折时出现（没折时只有刷新一个动作，直接露着）
  const hasMore = Boolean(cur && onMore);
  const refreshBtn = html`<button class=${'btn-ghost' + (hasMore ? ' more-item' : '')} onClick=${() => { onRefresh(); }}>${S.action.refresh}</button>`;
  // 多个顶层节点：htm 会返回数组，Preact 直接当 Fragment 渲染（这个 standalone 包没导出 Fragment）
  return html`
        <div class=${'mainbar' + (moreOpen ? ' more-open' : '')}>
          <span class="crumb">${crumbRoot} ${cur ? html`/ <span class="crumb-no">#${cur.pr.number}</span> <b>${cur.pr.title}</b>` : ''}${
            cur && verifyN > 0 ? html`<span class="verify-count" title=${S.verify.countTitle}>${S.verify.count(verifyN)}</span>` : ''}</span>
          <span class="actions">
            ${!hasMore && refreshBtn}
            ${cur && html`<button class="btn-ghost" title=${archived ? S.action.zongpiArchivedTitle : ''} onClick=${onZongpi}>${S.action.zongpi}</button>`}
            ${cur && draftCount > 0 && html`
              <button class="btn-primary btn-submit" disabled=${busy || !onHead}
                title=${onHead ? '' : S.action.submitOldRevTitle} onClick=${onSubmit}>
                ${busy ? S.action.sending : S.action.submit(draftCount)}
              </button>`}
            ${/* 「可」方印：只一个字（B），全名「画可」放 title；手机底栏仍写全名。 */ ''}
            ${cur && !archived && html`<button class="btn-qinci" disabled=${busy || !onHead}
              title=${onHead ? S.action.merge : S.action.mergeOldRevTitle} aria-label=${S.action.merge}
              onClick=${onQinci}>${S.brand.seal}</button>`}
            ${hasMore && html`<button class="btn-ghost more-btn" aria-expanded=${moreOpen}
              title=${S.action.moreTitle} onClick=${onMore}>${S.action.more}</button>`}
            ${/* 「⋯」菜单：一张纸色小面板挂在题签行右下。.more-item 默认藏，.mainbar.more-open 时露
                 （style.css）。里面全是「对着正文但不常按」的动作，顺序按常用度排。 */ ''}
            ${hasMore && html`
              <span class="more-menu" role="menu">
                ${refreshBtn}
                <button class="btn-ghost more-item" title=${S.action.copyRefTitle} onClick=${onCopyRef}>${S.action.copyRef}</button>
                ${happyUrl && html`<button class="btn-ghost more-item" title=${S.action.happyTitle}
                  onClick=${() => { const w = window.open(happyUrl, '_blank'); if (w) w.opener = null; }}>${S.action.happy}</button>`}
                <button class="btn-ghost more-item" title=${S.action.carryTitle} disabled=${carrying}
                  onClick=${onCarry}>${carrying ? S.action.carrying : S.action.carry}</button>
                ${onReadStep && html`
                  <span class="read-size more-item">
                    <button class="read-size-btn" disabled=${readStep <= 0}
                      title=${S.readSize.smallerTitle(pct)} onClick=${() => onReadStep(readStep - 1)}>${S.readSize.smaller}</button>
                    <button class="read-size-btn" disabled=${readStep >= READ_STEPS.length - 1}
                      title=${S.readSize.largerTitle(pct)} onClick=${() => onReadStep(readStep + 1)}>${S.readSize.larger}</button>
                  </span>`}
                ${/* 阅读宽度档：点一下轮换 铺满 → 适中 → 窄。手机档（≤900）由 CSS 隐藏——那一档正文本来就铺满。 */ ''}
                ${onWidthPreset && html`
                  <span class="read-size read-width more-item">
                    <button class="read-size-btn" title=${S.readWidth.title(widthPreset)}
                      onClick=${onWidthPreset}>${S.readWidth.label(widthPreset)}</button>
                  </span>`}
                ${onTheme && html`<button class="btn-ghost more-item appearance-btn" title=${S.appearance.title(theme)}
                  onClick=${onTheme}>${S.appearance.label(theme)}</button>`}
                ${onUpdate && html`<button class="btn-ghost more-item more-only update-app"
                  title=${S.stale.updateTitle} disabled=${updating} onClick=${onUpdate}>${updating ? S.stale.updating : S.stale.update}</button>`}
              </span>`}
          </span>
        </div>
        ${stale && html`
          <p class="notice stale-banner">
            ${S.stale.banner}
            <button class="btn-ghost stale-reload" onClick=${() => (onUpdate ? onUpdate() : location.reload())}>${S.stale.reload}</button>
          </p>`}
        ${notice && html`<p class="notice">${notice}${nextUp && html`
          <button class="btn-ghost notice-next" title=${S.merge.nextUpTitle}
            onClick=${onNextUp}>${S.merge.nextUp(nextUp.number, nextUp.title)}</button>`}
          ${/* 手机档提示条是 fixed 浮条，得有地方关；桌面档 .notice-close 不显示（布局不变）。 */ ''}
          ${onNoticeClose && html`<button class="btn-ghost notice-close" title=${S.mobileBar.noticeCloseTitle}
            onClick=${onNoticeClose}>${S.mobileBar.noticeClose}</button>`}</p>`}`;
}
