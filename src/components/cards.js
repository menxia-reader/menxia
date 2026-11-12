// 批注卡三件套：草稿卡 / 已呈批注串 / 判卡。
// 从 ui.js 拆出（2026-07-28 还账：ui.js 破 800 行触发指标 #1）。纯展示，只吃 props。
import { html, useEffect, useLayoutEffect, useRef, useState } from '../../vendor/preact-standalone.mjs';
import * as A from '../anchor.js';
import { CommentBody } from './comment-body.js';
import { S } from '../strings.js';

// 非编辑态那行 `.anno-note` 是「点开改」的唯一靶子，而它的高度**完全由内容撑**
// （没 padding、没 min-height）。所以 note 为空时必须画占位词，否则那是个 0px 的死靶子：
// 2026-08-05 报障「我想过去加东西，结果点不开那个评论栏了」——空草稿改不了（点不着）、
// 删不掉（作罢钮只在编辑态里）、又过不了呈回闸门（空批注不呈），三头堵死。
// 空草稿本身已由 ui.js 的 editElsewhere 在切走焦点时收掉；这里是给存量草稿留的退路。
export function DraftCard({ d, doc, heads, editing, onEdit, onSave, onDrop }) {
  const taRef = useRef();
  useEffect(() => { if (editing) setTimeout(() => taRef.current?.focus(), 0); }, [editing]);
  const sec = doc ? A.sectionOf(doc, d.blockLine, heads) : '';   // heads：ui.js 备的标题快照，缺省现查
  return html`
    <div class="anno-card" data-block-line=${d.blockLine} key=${d.id}>
      <div class="anno-quote">${S.card.quote(d.quote.length > 80 ? d.quote.slice(0, 80) + '…' : d.quote)}</div>
      <div class="anno-src">${S.card.srcLine(sec, d.line)}</div>
      ${editing ? html`
        <textarea class="anno-input" ref=${taRef} placeholder=${S.card.draftPlaceholder} defaultValue=${d.note}
          onKeyDown=${(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.stopPropagation(); onSave(d.id, taRef.current.value); }
          }}
          onBlur=${() => {
            // 打了一半没存批就点了别处（换卡/新划句）→ 自动存，别生吞长批注（评审阻断项）
            const v = taRef.current?.value.trim();
            if (v && v !== d.note) onSave(d.id, taRef.current.value);
          }}></textarea>
        <div class="anno-row">
          <button class="anno-ghost" onMouseDown=${(e) => e.preventDefault()} onClick=${() => onDrop(d.id)}>${S.action.discard}</button>
          <button class="anno-save" onMouseDown=${(e) => e.preventDefault()} onClick=${() => onSave(d.id, taRef.current.value)}>${S.action.saveDraft}</button>
        </div>` : html`
        <div class="anno-note${d.note ? '' : ' anno-note-empty'}" title=${S.card.editTitle}
          role="button" tabIndex="0"
          onClick=${() => onEdit(d.id)}
          onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(d.id); } }}
          >${d.note || S.card.emptyNote}</div>`}
    </div>`;
}

// 已呈批注串（墨色安静系，视觉降一档；朱砂只留给草稿的活跃态）
// blockLine 用串的源文件行号（line ?? original_line）直接当锚，参与 layoutCards 对齐
export function ShownThread({ t, blockLine, outdated, hydrate, onExpand }) {
  const { quote, body } = A.parseCommentBody(t.root.body);
  return html`
    <div class="anno-card anno-shown" data-block-line=${blockLine} key=${'c' + t.root.id}>
      ${quote && html`<div class="anno-quote-shown">${S.card.quote(quote)}</div>`}
      <div class="anno-src anno-src-row">
        <span class="anno-who">${t.root.user?.login || '?'}</span>
        ${outdated ? html`<span class="anno-outdated" title=${S.card.outdatedTitle}>${S.card.outdatedBadge}</span>` : ''}
        ${onExpand && html`
          <button class="anno-expand" title=${S.action.expandTitle} aria-label=${S.action.expandTitle}
            onClick=${() => onExpand(t.root.id)}>${S.action.expand}</button>`}
      </div>
      <${CommentBody} text=${body} hydrate=${hydrate} />
      ${t.replies.map((r) => html`
        <div class="anno-reply" key=${'c' + r.id}>
          <div class="anno-reply-who">${S.card.replyWho(r.user?.login || '?')}</div>
          <${CommentBody} text=${r.body} hydrate=${hydrate} />
        </div>`)}
    </div>`;
}

// 判卡（整折级）——**钉在视口里，不随正文滚**。
//
// 2026-08-06 原话：「很多时候我是看到最底下才想给个总判，但总判的窗口永远固定在最开头」，
// 要的是「不管我往上滑还是往下滑，它在屏幕中间都是固定位置」，好边看边写。
//
// 上一版的做法恰好是反的：卡留在眉批栏顶端，按下「判」用 `scrollIntoView` 把**人**拽到
// 卡那儿去（2026-08-02 为治窄屏「判不了」加的）。人被拽走＝刚读到的那段没了，正是这次报障
// 的来源。现在改成把**卡**送到人眼前，那句 scrollIntoView 一并删掉——卡本来就在视口里，
// 再滚一次只会把正文推走。窄屏「判不了」也随之根治：不管眉批栏落到哪，卡都在屏幕中间。
//
// 为什么量 DOM 而不用纯 CSS：卡要横向对齐眉批栏，而眉批栏的 x 是「版心居中」算出来的，
// 随视口宽、字号档（A±）、单双列断点一起动。在 CSS 里把那套居中数学再推一遍必然跟布局漂移；
// 量一次 `#margin-col` 的实际矩形是唯一不会说谎的来源。窄屏单列时它自然量到整个正文宽，
// 卡就横跨正文——那一档本来也没有右缘可贴。
// 判框。门下服务模式下还承担「拍板」：questions（服务端 QuestionSchema：id/prompt/kind/options/required）
// 渲成选项/自由文本，onSend(text, answers[]) 带结构化作答；verdict 决定标题与按钮字样
// （request_changes=判 / approve=画可 / reject=关）。GitHub 模式 questions 恒空，长相与行为不变。
export function ZongpiCard({ busy, onSend, onClose, questions = [], verdict = 'request_changes' }) {
  const taRef = useRef();
  const boxRef = useRef();
  const [answers, setAnswers] = useState({});   // qid → { option_ids: [], text: '' }
  const [qErr, setQErr] = useState('');
  const ansOf = (q) => answers[q.id] || { option_ids: [], text: '' };
  const toggle = (q, oid) => setAnswers((a) => {
    const cur = ansOf(q).option_ids;
    const next = q.kind === 'single_choice' ? [oid] : (cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid]);
    return { ...a, [q.id]: { ...ansOf(q), option_ids: next } };
  });
  const setText = (q, text) => setAnswers((a) => ({ ...a, [q.id]: { ...ansOf(q), text } }));
  const send = () => {
    const out = [];
    for (const q of questions) {
      const a = ansOf(q);
      const empty = q.kind === 'free_text' ? !a.text.trim() : !a.option_ids.length;
      if (empty) { if (q.required !== false) { setQErr(S.decision.answerRequired(q.prompt)); return; } continue; }
      out.push(q.kind === 'free_text' ? { question_id: q.id, text: a.text.trim() } : { question_id: q.id, option_ids: a.option_ids });
    }
    setQErr('');
    onSend(taRef.current.value, out);
  };
  const header = verdict === 'approve' ? S.decision.approveHeader : verdict === 'reject' ? S.decision.rejectHeader : S.card.zongpiHeader;
  const sendLabel = verdict === 'approve' ? S.decision.approveSend : verdict === 'reject' ? S.decision.rejectSend : S.action.sendZongpi;

  // useLayoutEffect 而不是 useEffect：量位置必须赶在**这一帧绘制之前**。
  // 用 useEffect 的话第一帧会拿 `.anno-card` 的 `left:0; width:100%` 去画一张 fixed 卡，
  // 于是判卡先横贯整个视口闪一下，再跳到眉批栏——每次按「判」都闪，非常显眼。
  useLayoutEffect(() => {
    const sync = () => {
      const col = document.querySelector('#margin-col');
      const box = boxRef.current;
      if (!col || !box) return;
      const r = col.getBoundingClientRect();
      if (!r.width) return;                       // 栏还没布局好，等下一拍
      box.style.left = `${Math.round(r.left)}px`;
      box.style.width = `${Math.round(r.width)}px`;
    };
    sync();
    // 只 focus，不滚动。iOS Safari 会吞掉非用户手势里的 focus()（键盘不弹），
    // 所以仍留一拍 setTimeout 让它落在事件之后，但**不再**替用户滚屏。
    setTimeout(() => { sync(); taRef.current?.focus(); }, 0);
    window.addEventListener('resize', sync);
    const col = document.querySelector('#margin-col');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    if (ro && col) ro.observe(col);
    return () => { window.removeEventListener('resize', sync); ro?.disconnect(); };
  }, []);

  return html`
    <div class=${'anno-card zongpi-card' + (verdict !== 'request_changes' ? ` verdict-${verdict}` : '')} ref=${boxRef}>
      <div class="anno-src">${header}</div>
      ${questions.length > 0 && html`
        <div class="decision-questions">
          ${questions.map((q) => html`
            <fieldset class="decision-q" key=${q.id} data-qid=${q.id}>
              <legend>${q.prompt}${q.required === false ? S.decision.optional : ''}</legend>
              ${q.kind === 'free_text'
                ? html`<input class="decision-text" type="text" maxlength="4000" value=${ansOf(q).text}
                    onInput=${(e) => setText(q, e.target.value)} />`
                : (q.options || []).map((o) => html`
                  <label class="decision-opt" key=${o.id}>
                    <input type=${q.kind === 'single_choice' ? 'radio' : 'checkbox'} name=${`q-${q.id}`} value=${o.id}
                      checked=${ansOf(q).option_ids.includes(o.id)} onChange=${() => toggle(q, o.id)} />
                    <span>${o.label}</span>
                  </label>`)}
            </fieldset>`)}
          ${qErr && html`<div class="decision-err">${qErr}</div>`}
        </div>`}
      <textarea class="anno-input" ref=${taRef} rows="4" placeholder=${verdict === 'request_changes' ? S.card.zongpiPlaceholder : S.decision.notePlaceholder}></textarea>
      <div class="anno-row">
        <button class="anno-ghost" onMouseDown=${(e) => e.preventDefault()} onClick=${onClose}>${S.action.discard}</button>
        <button class="anno-save" onMouseDown=${(e) => e.preventDefault()} onClick=${send}>${busy ? S.action.sending : sendLabel}</button>
      </div>
    </div>`;
}
