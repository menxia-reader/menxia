// 锚定与草稿的纯逻辑层（无 UI、无框架）——迁移时原样搬运的资产
// 锚定策略见 SPEC §9.1：主锚 = DOM 行号，引文永远进批注正文兜底。

// ── 浮批钮遇滚动：收起还是跟着选区重定位 ──
// 2026-11-03（main CI 两次红 + 真人连划两段时第二个「批」一闪就没）：上一轮编辑器 focus /
// 跳转定位引起的**程序滚动**，其 scroll 事件要等下一帧才派发，headless 实测可晚 ~500ms，
// 落在新浮钮出现之后就把它收掉了。scroll 事件本身分不出是谁滚的，所以按时间判：
// 浮钮出现后 FLOAT_SCROLL_GRACE 内的滚动当作「上一个动作的余波」——不收，按当前选区重定位；
// 过了这段再滚才是人在滚，照旧收（内滚不派发 mousedown，不收浮钮会残留在原位）。
export const FLOAT_SCROLL_GRACE = 600;
/** 浮钮在 shownAt 出现，now 时来了一次滚动：true＝收起，false＝留着（重定位）。 */
export const scrollClosesFloat = (shownAt, now, grace = FLOAT_SCROLL_GRACE) =>
  !Number.isFinite(shownAt) || now - shownAt >= grace;

// ── 短划选（docs/SHORT-QUOTE.md）──
// 与门下服务 C1 同判据（服务端 schemas.ts）：按码点、去空白计；含任一 CJK 字符 → ≥1；
// 带 prefix/suffix（任一非空）→ ≥1；否则（纯 ASCII 且无上下文）→ ≥3。
// 2026-11-26 报障：划「竞品」两个字（中文完整的词）→ 服务端按 JS length ≥3 拒、整批 400。
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
export const CONTEXT_MAX = 64;
export const hasCJK = (s) => CJK_RE.test(String(s || ''));
/** true＝服务端会以「划选太短」拒收这条锚点。 */
export function quoteTooShort(quote, { prefix = '', suffix = '' } = {}) {
  const q = String(quote || '');
  const n = [...q.replace(/\s+/g, '')].length;
  if (n < 1) return true;
  if (hasCJK(q) || String(prefix || '').trim() || String(suffix || '').trim()) return false;
  return n < 3;
}
/** 块文本 text 里 [start, start+len) 是划选，取两侧各 ≤max 字符原文上下文（压空白，不跨块）。 */
export function contextAround(text, start, len, max = CONTEXT_MAX) {
  const t = String(text || '');
  const s = Math.max(0, Math.min(start, t.length));
  const e = Math.max(s, Math.min(s + len, t.length));
  const sq = (x) => x.replace(/\s+/g, ' ');
  return { prefix: sq(t.slice(Math.max(0, s - max), s)).slice(-max), suffix: sq(t.slice(e, e + max)).slice(0, max) };
}

// ── 选区 → 锚 ──
export function closestLine(node) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return el ? el.closest('[data-line]') : null;
}

export function computeAnchor(doc) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!doc || !doc.contains(range.commonAncestorContainer)) return null;
  const quoteRaw = sel.toString();
  const quote = quoteRaw.trim().replace(/\s+/g, ' ');
  // 防误点：单字符不出浮钮。CJK 单字放开会改 golden（原生一致性依据），另起变更（docs/SHORT-QUOTE.md「未做」）
  if (quote.length < 2) return null;
  const el = closestLine(range.startContainer);
  if (!el) return null;
  const blockLine = +el.dataset.line;
  let line = blockLine;
  // 代码块内精确行：fence 的 data-line 在 <code> 上且指向 ``` 行（首行 +1）；
  // 缩进代码块的 data-line 在 <pre> 上、直接是首行（均实测确认）。
  // ```diff 围栏例外：diffFence（render.js）把 data-line 打在 <pre class="diff-block"> 上，
  // 但它仍是围栏、data-line 指向 ``` 行，同样要 +1——按标签判会少算一行，涂归呈到上一行（review #182 N0 查出）。
  // mermaid 渲出的 figure（mermaid.js figureFor）承接原 fence 的 data-line（指向 ``` 行），
  // 源码在 figure 内折叠的 <details><pre><code> 里——同样按围栏 +1 算行（review M1）。
  const isMermaidFig = el.tagName === 'FIGURE' && el.classList.contains('mermaid-fig');
  if (el.tagName === 'CODE' || el.tagName === 'PRE' || isMermaidFig) {
    const container = el.tagName === 'CODE' ? el : (el.querySelector('code') || el);
    const isFence = el.tagName === 'CODE' || isMermaidFig || el.classList.contains('diff-block');
    try {
      const r2 = document.createRange();
      r2.selectNodeContents(container);
      r2.setEnd(range.startContainer, range.startOffset);
      const newlines = r2.toString().split('\n').length - 1;
      line = blockLine + (isFence ? 1 : 0) + newlines;
    } catch { /* 退回块首行 */ }
  }
  // 块内字符偏移：同块撞重复短语时高亮按它定位（双路评审均命中）
  let offset = 0;
  try {
    const r3 = document.createRange();
    r3.selectNodeContents(el);
    r3.setEnd(range.startContainer, range.startOffset);
    offset = r3.toString().length;
  } catch { /* 从头找 */ }
  // 原文上下文：短 quote 多处出现时服务端靠它消歧，也让 ASCII 短词过 C1（docs/SHORT-QUOTE.md）
  const ctx = draftContext(el.textContent, quoteRaw.trim(), offset);
  const rect = range.getBoundingClientRect();
  return { blockLine, line, offset, quote: quote.slice(0, 300), quoteRaw: quoteRaw.trim().slice(0, 300), ...ctx,
    tooShort: quoteTooShort(quote, ctx), rect };
}

/** 块文本里在 offset 附近找到 raw，取两侧上下文；找不到就从 offset 起算。 */
export function draftContext(blockText, raw, offset = 0) {
  const t = String(blockText || '');
  let at = t.indexOf(raw, Math.max(0, offset - 2));
  if (at < 0) at = t.indexOf(raw);
  if (at < 0) at = offset;
  return contextAround(t, at, raw.length);
}

/** 老草稿没带 prefix/suffix：按当前渲染的块补上（块已不在就留空，服务端照旧按 quote/line 找）。 */
export function contextForDraft(doc, d) {
  if (d.prefix || d.suffix) return { prefix: d.prefix || '', suffix: d.suffix || '' };
  const block = doc?.querySelector(`[data-line="${d.blockLine}"]`);
  if (!block || !d.quoteRaw) return { prefix: '', suffix: '' };
  return draftContext(block.textContent, d.quoteRaw, d.offset || 0);
}

// ── 高亮定位 ──
export function rangeForDraft(doc, d) {
  const block = doc.querySelector(`[data-line="${d.blockLine}"]`);
  if (!block) return null;
  const text = block.textContent;
  let idx = text.indexOf(d.quoteRaw, Math.max(0, (d.offset || 0) - 2));
  if (idx < 0) idx = text.indexOf(d.quoteRaw);
  if (idx < 0) return null;
  return rangeFromTextOffset(block, idx, d.quoteRaw.length);
}

export function rangeFromTextOffset(root, start, len) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0, startNode = null, startOff = 0, node;
  while ((node = walker.nextNode())) {
    const next = pos + node.data.length;
    if (!startNode && start < next) { startNode = node; startOff = start - pos; }
    if (startNode && start + len <= next) {
      const r = document.createRange();
      r.setStart(startNode, startOff);
      r.setEnd(node, start + len - pos);
      return r;
    }
    pos = next;
  }
  return null;
}

// 标题快照：[{ line, text }]，DOM 序。sectionOf 的预计算形态（2026-11 质量巡检）：
// 每张草稿卡每次渲染都 querySelectorAll + 逐个 textContent 一遍，40 张卡 × 160 个标题的长折
// 实测 ~86ms/次渲染（test/perf/bench.mjs）。ui.js 按 [docTick, docPath] 备一份传进来即可。
// 与 extractOutline 不同：不 trim、不跳空标题——sectionOf 的旧语义原样保留。
export function headingIndex(doc) {
  if (!doc) return [];
  return [...doc.querySelectorAll('h1[data-line],h2[data-line],h3[data-line]')]
    .map((h) => ({ line: +h.dataset.line, text: h.textContent }));
}

// heads 缺省时现查 DOM（旧调用点与 DOM 单测不变）；传了就只扫这份快照。
export function sectionOf(doc, blockLine, heads = headingIndex(doc)) {
  let best = '';
  for (const h of heads) if (h.line <= blockLine) best = h.text;
  return best;
}

// 文档出新版后 GitHub 把漂移批注的 line 置 null，退回 original_line 等于拿旧版行号在新版
// 文档里找块 → 卡片贴到毫不相干的段落旁边，读者无从对应（PAIN 2026-07-28 #14）。
// 引文才是稳定的锚：在当前渲染结果里按引文反查它所属块的行号。
// 取「包含引文且自身文本最短」的块——表格 table/tr 嵌套会同时命中，最短的那个最贴切。
//
// 性能（2026-11 质量巡检）：每个块都要 textContent + 压空白，而 ui.js 在**每次 App 渲染**里
// 对每条 outdated 串各调一次——20 条 × 6000 块的长折实测 ~214ms/次渲染。块文本与引文无关，
// 所以拆出 blockTextIndex 建一次、多条引文共用；index 缺省时现建（旧调用点语义不变）。
export function blockTextIndex(doc) {
  if (!doc) return [];
  const out = [];
  doc.querySelectorAll('[data-line]').forEach((b) => {
    const line = +b.dataset.line;
    if (line) out.push({ line, text: (b.textContent || '').replace(/\s+/g, ' ') });
  });
  return out;
}

export function reanchorByQuote(doc, quote, index) {
  if (!doc || !quote) return null;
  const needle = quote.trim().replace(/\s+/g, ' ');
  if (needle.length < 4) return null; // 太短易误命中，不如不认
  let best = null, bestLen = Infinity;
  for (const { line, text } of index || blockTextIndex(doc)) {
    if (text.length < bestLen && text.includes(needle)) { best = line; bestLen = text.length; }
  }
  return best;
}

// ── hunk 校验：不在 diff 里的行提交必 422 且整批原子失败，提交前本地校验（SPEC §9.1）──
export function validRightLines(patch) {
  if (!patch) return null;
  const valid = new Set();
  let n = 0;
  const lines = patch.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // 尾部换行的假空行会把 hunk 外一行误判成可批 → 422 全灭
  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw);
      if (m) n = parseInt(m[1], 10);
    } else if (raw.startsWith('+') || raw.startsWith(' ')) {
      valid.add(n++);
    } else if (raw === '') {
      valid.add(n++); // 空上下文行在 API patch 里偶见裸空串
    }
  }
  return valid;
}

// ── 草稿持久化（localStorage，按 PR 号）──
const draftsKey = (num) => `zhupi.drafts.${num}`;

export function loadDrafts(num) {
  try { return JSON.parse(localStorage.getItem(draftsKey(num)))?.items || []; } catch { return []; }
}
// 草稿是这个 app 的皇冠数据：配额爆掉时必须让调用方知道（此前裸写，异常从
// Preact state updater 里炸出来 = 用户刚打的批注静默消失，且无任何提示）
export function saveDrafts(num, items) {
  try {
    localStorage.setItem(draftsKey(num), JSON.stringify({ items }));
    return null;
  } catch (err) {
    return err;
  }
}
export const pendingCountFor = (num) => loadDrafts(num).length;

export const fmtDraft = (d) => `> ${d.quote}\n\n${d.note}`;

// 呈出被拒是不是「第 index 条引文在服务端正文里找不到」（门下 createCommentsBatch：400 invalid_argument，
// details {field:'comments.<i>.anchor.quote', index:i}，新版服务端再附 quote / document_path，缺了照认）。
// 认出来 ui 就标出那条草稿、给「改成整折评论再呈 / 取消」，而不是整批失败了事（docs/ANCHOR-FAIL-UX.md）。
//
// 逐条 400（C3，docs/SHORT-QUOTE.md）：服务端仍整批原子，但 details.items[] 列出**所有**不合格条
// （每项 {field, index, message}；errors[] 同义），旧服务端只给单条 {field, index} 照认。
// field 认 comments.<i>.anchor 及其子字段（quote 太短 / 找不到 / ambiguous）；body 等非锚点错误不认。
const ANCHOR_FIELD = /^comments\.\d+\.anchor(\.|$)/;
export function anchorFailures(err) {
  const d = err?.details;
  if (err?.status !== 400 || err.code !== 'invalid_argument' || !d || typeof d !== 'object') return [];
  const list = Array.isArray(d.items) ? d.items : Array.isArray(d.errors) ? d.errors : [d];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!x || typeof x.field !== 'string' || !ANCHOR_FIELD.test(x.field) || !Number.isInteger(x.index) || seen.has(x.index)) continue;
    seen.add(x.index);
    out.push({
      index: x.index,
      quote: typeof x.quote === 'string' ? x.quote : '',
      documentPath: typeof x.document_path === 'string' ? x.document_path : '',
      reason: typeof x.message === 'string' ? x.message : (typeof x.reason === 'string' ? x.reason : ''),
    });
  }
  return out;
}

// inline：ui 发出去的那份 comments（下标 = 服务端 index，带 draftId/quote/whole）。
// → null（不是逐条锚点错误，照整批失败处理）| { bad: [{draftId, n, quote, reason}], rest: 其余可立即重呈的 inline }
export function splitBatchFailure(err, inline) {
  const fails = anchorFailures(err).filter((f) => inline[f.index] && !inline[f.index].whole);
  if (!fails.length) return null;
  const badIdx = new Set(fails.map((f) => f.index));
  return {
    bad: fails.map((f) => ({ draftId: inline[f.index].draftId, n: f.index + 1, quote: inline[f.index].quote, reason: f.reason })),
    rest: inline.filter((_, i) => !badIdx.has(i)),
  };
}

// ── 已呈批注串（M3）──
// 根批注体恒为 `> 引文\n\n正文`（fmtDraft 写出的形状）；回话是纯文本无引文前缀。
// 解析成 { quote, body }：只认「开头连续的 > 行」为引文，其余为正文，认不出则 quote 空。
export function parseCommentBody(raw) {
  const text = String(raw || '');
  const lines = text.split('\n');
  const quoteLines = [];
  let i = 0;
  while (i < lines.length && lines[i].startsWith('>')) {
    quoteLines.push(lines[i].replace(/^>\s?/, ''));
    i++;
  }
  if (!quoteLines.length) return { quote: '', body: text.trim() };
  while (i < lines.length && lines[i].trim() === '') i++; // 吃掉引文与正文之间的空行
  return { quote: quoteLines.join('\n').trim(), body: lines.slice(i).join('\n').trim() };
}

// 把扁平 comments 串成「根批注 + 回话[]」：in_reply_to_id 指回根 id。
// 保序：根按数组出现序，回话按 created_at 升序挂在各自根下。
export function threadComments(comments) {
  const roots = [];
  const byId = new Map();
  comments.forEach((c) => { if (!c.in_reply_to_id) { const t = { root: c, replies: [] }; byId.set(c.id, t); roots.push(t); } });
  comments.forEach((c) => {
    if (c.in_reply_to_id) {
      const t = byId.get(c.in_reply_to_id);
      if (t) t.replies.push(c);
      else { const orphan = { root: c, replies: [] }; byId.set(c.id, orphan); roots.push(orphan); } // 根缺失（分页边界/被删）→ 当独立串，不丢
    }
  });
  roots.forEach((t) => t.replies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
  return roots;
}
