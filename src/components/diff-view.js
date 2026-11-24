// 版本对比页（docs/DIFF-STALE-TOAST.md）：「v<a> → v<b> 改了什么」。只读——不挂划选、不出浮批钮。
// 数据：listRevisions(id) 给每版 documents（path/sha256）；sha 相同的文档直接标「未改」不拉正文，
// 其余用 loadText(no, path) 取两版正文，交 src/diff.js 算行级 + 字符级 + 折叠。
import { html, useEffect, useState } from '../../vendor/preact-standalone.mjs';
import { S } from '../strings.js';
import { docChanges, lineRows, foldRows } from '../diff.js';

const KIND_LABEL = { added: S.diff.added, removed: S.diff.removed, modified: S.diff.modified, same: S.diff.same };

function Segs({ row }) {
  if (!row.segs) return row.text || ' ';
  return row.segs.map((s, i) => (s.hi ? html`<mark key=${i} class="diff-ch">${s.s}</mark>` : s.s));
}

function Line({ row }) {
  return html`<div class=${`diff-line diff-${row.t}`}>
    <span class="diff-no" aria-hidden="true">${row.oldNo ?? ''}</span>
    <span class="diff-no" aria-hidden="true">${row.newNo ?? ''}</span>
    <span class="diff-sign" aria-hidden="true">${row.t === 'del' ? '−' : row.t === 'add' ? '+' : ''}</span>
    <span class="diff-text"><${Segs} row=${row} /></span>
  </div>`;
}

function DocRows({ items }) {
  const [open, setOpen] = useState(() => new Set());
  return html`<div class="diff-rows">${items.map((r, i) => {
    if (r.t !== 'fold') return html`<${Line} key=${i} row=${r} />`;
    if (open.has(i)) return r.rows.map((x, k) => html`<${Line} key=${`${i}.${k}`} row=${x} />`);
    return html`<button key=${i} class="diff-fold" onClick=${() => setOpen((s) => new Set(s).add(i))}>${S.diff.fold(r.rows.length)}</button>`;
  })}</div>`;
}

/** 选版本：两个下拉（v1…vN），默认上一版 → 当前版；改了就 onPick(a, b)（URL 随之更新）。 */
function Picker({ revs, a, b, onPick }) {
  const opt = (r) => html`<option key=${r.no} value=${r.no}>v${r.no}</option>`;
  return html`<span class="diff-picker">
    <label>${S.diff.from} <select class="diff-a" value=${a} onChange=${(e) => onPick(Number(e.currentTarget.value), b)}>${revs.map(opt)}</select></label>
    <span aria-hidden="true">→</span>
    <label>${S.diff.to} <select class="diff-b" value=${b} onChange=${(e) => onPick(a, Number(e.currentTarget.value))}>${revs.map(opt)}</select></label>
  </span>`;
}

export function DiffView({ id, a, b, listRevisions, loadText, onPick, onClose }) {
  const [revs, setRevs] = useState(null);
  const [docs, setDocs] = useState(null);   // [{path, kind, items?, err?, loading?}]
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    listRevisions(id).then((r) => { if (live) setRevs(r); }).catch((e) => { if (live) setErr(e.message || String(e)); });
    return () => { live = false; };
  }, [id]);

  const ra = revs?.find((r) => r.no === a);
  const rb = revs?.find((r) => r.no === b);

  useEffect(() => {
    if (!ra || !rb) { setDocs(null); return undefined; }
    let live = true;
    const list = docChanges(ra.documents, rb.documents);
    setDocs(list.map((d) => (d.kind === 'modified' ? { ...d, loading: true } : d)));
    list.forEach((d, i) => {
      if (d.kind !== 'modified') return;
      Promise.all([loadText(a, d.path), loadText(b, d.path)])
        .then(([x, y]) => ({ ...d, items: foldRows(lineRows(x, y)) }))
        .catch((e) => ({ ...d, err: e.message || String(e) }))
        .then((done) => { if (live) setDocs((cur) => cur && cur.map((c, k) => (k === i ? done : c))); });
    });
    return () => { live = false; };
  }, [id, ra, rb]);

  // URL 里的版本号不存在（或只剩一版）→ 回落到上一版 → 当前版
  useEffect(() => {
    if (!revs || (ra && rb) || revs.length < 2) return;
    onPick(revs[revs.length - 2].no, revs[revs.length - 1].no, true);
  }, [revs, ra, rb]);

  const changed = docs ? docs.filter((d) => d.kind !== 'same' && !(d.items && !d.items.some((r) => r.t !== 'eq'))).length : 0;
  return html`<section class="diff-view" aria-label=${S.diff.title}>
    <header class="diff-head">
      <b class="diff-title">${S.diff.title}</b>
      ${revs && revs.length >= 2 && html`<${Picker} revs=${revs} a=${a} b=${b} onPick=${onPick} />`}
      <span class="diff-readonly">${S.diff.readonly}</span>
      <button class="btn-ghost diff-close" onClick=${onClose}>${S.diff.close}</button>
    </header>
    ${err && html`<p class="state err">${S.diff.failed(err)}</p>`}
    ${revs && revs.length < 2 && html`<p class="state">${S.diff.needTwo}</p>`}
    ${docs && html`<p class="diff-summary">${S.diff.summary(changed)}</p>`}
    ${docs && docs.map((d) => html`
      <section key=${d.path} class=${`diff-doc diff-doc-${d.kind}`} data-path=${d.path}>
        <h3 class="diff-doc-head"><span class=${`diff-kind diff-kind-${d.kind}`}>${KIND_LABEL[d.kind]}</span> <span class="diff-path">${d.path}</span></h3>
        ${d.loading && html`<p class="state">${S.diff.loading}</p>`}
        ${d.err && html`<p class="state err">${S.diff.failed(d.err)}</p>`}
        ${d.items && (d.items.some((r) => r.t !== 'eq') ? html`<${DocRows} key=${`${a}..${b}`} items=${d.items} />` : html`<p class="state">${S.diff.noChange}</p>`)}
      </section>`)}
  </section>`;
}
