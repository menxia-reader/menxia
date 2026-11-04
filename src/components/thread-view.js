// 展读浮窗：把一串涂归从 300px 的眉批栏里捞出来，铺在宽栏上细读。
//
// 由来（2026-08-05）：眉批栏 `--marg-w: 300px` 是给「一句话批语」调的，而 agent 呈回的涂归
// 常带表格、代码块、多轮回话——在 300px 里被压成一条竖着的面条，屏幕右边却往往空着一大片。
// 为什么不干脆加宽眉批栏：那三个数（1500 / 1710 / 1940）是硬算出来的断点，动 --marg-w
// 要连着重算三处，而且**救不了 ≤1279 的单列档**（那一档批注卡整列落到正文下方，
// 宽度已经是 100%，「挤」的成因不是栏宽而是没有第二维空间）。浮窗与版心几何完全解耦，
// 四档断点通吃，所以选它。
//
// 纯展示，只吃 props。三条退路（Esc / 点幕布 / 掩卷钮）都收在 onClose 一个口。
import { html, useEffect, useRef } from '../../vendor/preact-standalone.mjs';
import * as A from '../anchor.js';
import { CommentBody } from './comment-body.js';
import { S } from '../strings.js';

export function ThreadView({ t, blockLine, outdated, hydrate, onClose }) {
  const panelRef = useRef();
  // 开窗即收焦点：否则 Tab 会跑到幕布背后的按钮上，读屏也停在原处。
  // 关窗还焦点（2026-11 质量巡检）：此前收窗后焦点落回 <body>，键盘用户要从页首重新 Tab 回来。
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus();
    return () => { if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true }); };
  }, []);
  const { quote, body } = A.parseCommentBody(t.root.body);
  return html`
    <div class="thread-view-backdrop"
      onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="thread-view" ref=${panelRef} tabIndex="-1"
        role="dialog" aria-modal="true" aria-label=${S.threadView.aria}>
        <div class="thread-view-bar">
          <span class="anno-who">${t.root.user?.login || '?'}</span>
          ${blockLine != null && html`<span class="thread-view-line">${S.threadView.line(blockLine)}</span>`}
          ${outdated ? html`<span class="anno-outdated" title=${S.card.outdatedTitle}>${S.card.outdatedBadge}</span>` : ''}
          <button class="btn-ghost thread-view-close" title=${S.threadView.closeTitle}
            onClick=${onClose}>${S.threadView.close}</button>
        </div>
        ${quote && html`<div class="thread-view-quote">${S.card.quote(quote)}</div>`}
        <${CommentBody} text=${body} hydrate=${hydrate} />
        ${t.replies.map((r) => html`
          <div class="thread-view-reply" key=${'v' + r.id}>
            <div class="anno-reply-who">${S.card.replyWho(r.user?.login || '?')}</div>
            <${CommentBody} text=${r.body} hydrate=${hydrate} />
          </div>`)}
      </div>
    </div>`;
}
