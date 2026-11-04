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
  const rect = range.getBoundingClientRect();
  return { blockLine, line, offset, quote: quote.slice(0, 300), quoteRaw: quoteRaw.trim().slice(0, 300), rect };
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
