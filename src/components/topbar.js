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

// ── 「更新」小框与状态条（门下 D-19）。纯展示：状态取舍在 refreshBarState，组件测试直接测它。 ──
export const refreshPending = (req) => req?.status === 'queued' || req?.status === 'running';

/** req（RefreshRequest + live）→ 该显示什么；null＝不显示。
 *  done 只在「本次会话亲眼看着它完成」（live）或「正在读的版本比结果旧」时显示——否则每次开折都挂一条旧消息。 */
export function refreshBarState(req, viewedNo = null) {
  if (!req) return null;
  if (req.status === 'queued') return { kind: 'queued', text: S.refreshReq.queued };
  if (req.status === 'running') return { kind: 'running', text: S.refreshReq.running };
  if (req.status === 'failed') return { kind: 'failed', text: S.refreshReq.failed(req.error || '') };
  if (req.status === 'done') {
    const n = req.result_revision_no;
    const behind = n != null && viewedNo != null && viewedNo < n;
    if (!req.live && !behind) return null;
    return { kind: 'done', text: S.refreshReq.done(n ?? '?'), reload: behind };
  }
  return null;
}

export function RefreshBar({ req, viewedNo, onReload, onRetry, onDismiss, onSeeChanges }) {
  const st = refreshBarState(req, viewedNo);
  if (!st) return null;
  return html`<div class=${`refresh-bar refresh-${st.kind}`} role="status">
    <span class="refresh-text">${st.text}</span>
    ${st.kind === 'done' && onSeeChanges && req.result_revision_no > 1 && html`<button class="refresh-act refresh-see-changes"
      onClick=${() => onSeeChanges(req.result_revision_no - 1, req.result_revision_no)}>${S.refreshReq.seeChanges}</button>`}
    ${st.kind === 'done' && st.reload && onReload && html`<button class="refresh-act refresh-reload" onClick=${onReload}>${S.refreshReq.doneReload}</button>`}
    ${st.kind === 'failed' && onRetry && html`<button class="refresh-act refresh-retry" onClick=${onRetry}>${S.refreshReq.retry}</button>`}
    ${st.kind === 'done' && !st.reload && onDismiss && html`<button class="refresh-act refresh-dismiss" onClick=${onDismiss}>${S.refreshReq.dismiss}</button>`}
  </div>`;
}

export function RefreshAsk({ onSubmit, onCancel }) {
  const submit = (e) => {
    e.preventDefault();
    const ta = e.currentTarget.querySelector('textarea');
    onSubmit?.(ta ? ta.value : '');
  };
  return html`<form class="refresh-ask" role="dialog" aria-label=${S.refreshReq.askTitle} onSubmit=${submit}>
    <b class="refresh-ask-title">${S.refreshReq.askTitle}</b>
    <textarea class="refresh-note" rows="2" maxlength="1000" placeholder=${S.refreshReq.askPlaceholder}
      onKeyDown=${(e) => { if (e.key === 'Escape') onCancel?.(); }}></textarea>
    <span class="refresh-ask-btns">
      <button type="submit" class="btn-primary refresh-ok">${S.refreshReq.askOk}</button>
      <button type="button" class="btn-ghost refresh-cancel" onClick=${onCancel}>${S.refreshReq.askCancel}</button>
    </span>
  </form>`;
}

export function Topbar({
  cur, archived, onHead, busy, draftCount, verifyN = 0, happyUrl, stale, notice, carrying,
  readStep = 1, onReadStep, widthPreset = 'fill', onWidthPreset, moreOpen = false, onMore, onUpdate, updating = false,
  theme = 'auto', onTheme, style = 'b', onStyle,
  backend = 'github', onBackend, loggedIn = false, onLogin, onLogout,
  onRefresh, onCopyRef, onCarry, onZongpi, onSubmit, onQinci, onReject, onShelve,
  nextUp, onNextUp, onNoticeClose,
  // 「更新」（门下 D-19，docs/REFRESH-BUTTON.md）：onRefreshReq 为 null＝不露按钮（GitHub 源 / withdrawn / 非拍板人）
  onRefreshReq = null, refreshReq = null, refreshAsk = false, viewedNo = null,
  onRefreshSubmit, onRefreshCancel, onRefreshReload, onRefreshRetry, onRefreshDismiss,
  // 版本对比 / 可能过时（docs/DIFF-STALE-TOAST.md）：onDiff 为 null＝不露「对比版本」（GitHub 源 / 只有一版）；
  // staleWeeks>0 且能发起「更新」时题签旁挂灰色「N 周未更新」，点了＝onRefreshReq
  onDiff = null, onDiffPair = null, staleWeeks = 0,
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
            cur && verifyN > 0 ? html`<span class="verify-count" title=${S.verify.countTitle}>${S.verify.count(verifyN)}</span>` : ''}${
            cur && staleWeeks > 0 && onRefreshReq ? html`<button class="stale-tag" title=${S.staleTag.title}
              onClick=${onRefreshReq}>${S.staleTag.label(staleWeeks)}</button>` : ''}</span>
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
                ${/* 「更新」排菜单第一项：题签行只露 判/呈/可/⋯ 的约定不破，又是打开菜单第一眼看到的。 */ ''}
                ${cur && onRefreshReq && html`<button class="btn-ghost more-item refresh-req-btn" title=${S.refreshReq.btnTitle}
                  disabled=${refreshPending(refreshReq)} onClick=${onRefreshReq}>${refreshPending(refreshReq) ? S.refreshReq.btnBusy : S.refreshReq.btn}</button>`}
                ${cur && onDiff && html`<button class="btn-ghost more-item diff-btn" title=${S.diff.entryTitle}
                  onClick=${onDiff}>${S.diff.entry}</button>`}
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
                ${onStyle && html`<button class="btn-ghost more-item style-btn" title=${S.style.title(style)}
                  onClick=${onStyle}>${S.style.label(style)}</button>`}
                ${onTheme && html`<button class="btn-ghost more-item appearance-btn" title=${S.appearance.title(theme)}
                  onClick=${onTheme}>${S.appearance.label(theme)}</button>`}
                ${/* 门下独有动作：留（read-state shelved）/ 关（reject）。GitHub driver 没这两个口就不渲染。 */ ''}
                ${onShelve && !archived && html`<button class="btn-ghost more-item shelve-btn" title=${S.decision.shelveTitle}
                  onClick=${onShelve}>${S.decision.shelve}</button>`}
                ${onReject && !archived && html`<button class="btn-ghost more-item reject-btn" title=${S.decision.rejectTitle}
                  disabled=${busy || !onHead} onClick=${onReject}>${S.decision.reject}</button>`}
                ${/* 数据源（M3c）：GitHub ⇄ 门下服务；门下模式下再给登录/登出。 */ ''}
                ${onBackend && html`<button class="btn-ghost more-item backend-btn" title=${S.backend.title(backend)}
                  onClick=${onBackend}>${S.backend.label(backend)}</button>`}
                ${backend === 'service' && loggedIn && onLogout && html`<button class="btn-ghost more-item svc-logout"
                  title=${S.backend.logoutTitle} onClick=${onLogout}>${S.backend.logout}</button>`}
                ${(backend !== 'service' || !loggedIn) && onLogin && html`<button class="btn-ghost more-item svc-login"
                  title=${S.backend.loginTitle} onClick=${onLogin}>${S.backend.login}</button>`}
                ${onUpdate && html`<button class="btn-ghost more-item more-only update-app"
                  title=${S.stale.updateTitle} disabled=${updating} onClick=${onUpdate}>${updating ? S.stale.updating : S.stale.update}</button>`}
              </span>`}
          </span>
        </div>
        ${cur && refreshAsk && html`<${RefreshAsk} onSubmit=${onRefreshSubmit} onCancel=${onRefreshCancel} />`}
        ${cur && html`<${RefreshBar} req=${refreshReq} viewedNo=${viewedNo}
          onReload=${onRefreshReload} onRetry=${onRefreshRetry} onDismiss=${onRefreshDismiss} onSeeChanges=${onDiffPair} />`}
        ${stale && html`
          <p class="notice stale-banner">
            ${S.stale.banner}
            <button class="btn-ghost stale-reload" onClick=${() => (onUpdate ? onUpdate() : location.reload())}>${S.stale.reload}</button>
          </p>`}
        ${/* 临时提示（「门下有 N 条新动态」「已刷新」…）浮在正文上方：.notice-layer 是常驻的 0 高度层，
             条子绝对定位在里面——出现/消失都不占文档流，正文不跳（docs/DIFF-STALE-TOAST.md §3）。 */ ''}
        <div class="notice-layer">
        ${notice && html`<p class="notice">${notice}${nextUp && html`
          <button class="btn-ghost notice-next" title=${S.merge.nextUpTitle}
            onClick=${onNextUp}>${S.merge.nextUp(nextUp.number, nextUp.title)}</button>`}
          ${/* 手机档提示条是 fixed 浮条，得有地方关；桌面档 .notice-close 不显示（布局不变）。 */ ''}
          ${onNoticeClose && html`<button class="btn-ghost notice-close" title=${S.mobileBar.noticeCloseTitle}
            onClick=${onNoticeClose}>${S.mobileBar.noticeClose}</button>`}</p>`}
        </div>`;
}
