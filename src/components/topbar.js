// 顶栏：面包屑 + 动作区（刷新/引用/回奏/判/字号/提交/画可）+ 新版横幅与提示条。
// 从 ui.js 拆出（2026-07-28 还账：ui.js 破 800 行触发指标 #1）。纯展示，只吃 props。
import { html } from '../../vendor/preact-standalone.mjs';
import { S } from '../strings.js';
import { isShelved } from '../track.js';
import { READ_STEPS, percentOf } from '../readsize.js';

export function Topbar({
  cur, archived, onHead, busy, draftCount, verifyN = 0, happyUrl, stale, notice, carrying,
  readStep = 1, onReadStep, moreOpen = false, onMore, onUpdate, updating = false,
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
  // 多个顶层节点：htm 会返回数组，Preact 直接当 Fragment 渲染（这个 standalone 包没导出 Fragment）
  return html`
        <div class=${'mainbar' + (moreOpen ? ' more-open' : '')}>
          <span class="crumb">${crumbRoot} ${cur ? html`/ <span class="crumb-no">#${cur.pr.number}</span> <b>${cur.pr.title}</b>` : ''}${
            cur && verifyN > 0 ? html`<span class="verify-count" title=${S.verify.countTitle}>${S.verify.count(verifyN)}</span>` : ''}</span>
          <span class="actions">
            <button class="btn-ghost" onClick=${() => { onRefresh(); }}>${S.action.refresh}</button>
            ${cur && html`<button class="btn-ghost more-item" title=${S.action.copyRefTitle} onClick=${onCopyRef}>${S.action.copyRef}</button>`}
            ${happyUrl && html`<button class="btn-ghost more-item" title=${S.action.happyTitle}
              onClick=${() => { const w = window.open(happyUrl, '_blank'); if (w) w.opener = null; }}>${S.action.happy}</button>`}
            ${cur && html`<button class="btn-ghost more-item" title=${S.action.carryTitle} disabled=${carrying}
              onClick=${onCarry}>${carrying ? S.action.carrying : S.action.carry}</button>`}
            ${cur && html`<button class="btn-ghost" title=${archived ? S.action.zongpiArchivedTitle : ''} onClick=${onZongpi}>${S.action.zongpi}</button>`}
            ${cur && onReadStep && html`
              <span class="read-size more-item">
                <button class="read-size-btn" disabled=${readStep <= 0}
                  title=${S.readSize.smallerTitle(pct)} onClick=${() => onReadStep(readStep - 1)}>${S.readSize.smaller}</button>
                <button class="read-size-btn" disabled=${readStep >= READ_STEPS.length - 1}
                  title=${S.readSize.largerTitle(pct)} onClick=${() => onReadStep(readStep + 1)}>${S.readSize.larger}</button>
              </span>`}
            ${cur && draftCount > 0 && html`
              <button class="btn-primary btn-submit" disabled=${busy || !onHead}
                title=${onHead ? '' : S.action.submitOldRevTitle} onClick=${onSubmit}>
                ${busy ? S.action.sending : S.action.submit(draftCount)}
              </button>`}
            ${cur && !archived && html`<button class="btn-qinci" disabled=${busy || !onHead}
              title=${onHead ? '' : S.action.mergeOldRevTitle} onClick=${onQinci}>${S.action.merge}</button>`}
            ${/* P0：手机档把桌面/agent 向的动作收进「⋯」；桌面 .more-btn 不显示、.more-item 照常排在原位。 */ ''}
            ${cur && onMore && html`<button class="btn-ghost more-btn" aria-expanded=${moreOpen}
              title=${S.action.moreTitle} onClick=${onMore}>${S.action.more}</button>`}
            ${/* 「更新到最新版」只住在手机「⋯」里：.more-only 让桌面不显示（桌面布局不变）。 */ ''}
            ${cur && onMore && onUpdate && html`<button class="btn-ghost more-item more-only update-app"
              title=${S.stale.updateTitle} disabled=${updating} onClick=${onUpdate}>${updating ? S.stale.updating : S.stale.update}</button>`}
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
