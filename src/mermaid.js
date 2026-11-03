// mermaid 围栏渲图（#188 M1）。
// 渲染只发生在一个无 PAT 的沙箱 iframe（sandbox.html）里：主页不加载 mermaid，
// 也不给 iframe 同源权限——sandbox 只有 allow-scripts 一项，壳是 opaque origin，碰不到 token。
// svg 字符串只进 Blob → <img>（图片上下文里脚本不执行），绝不当 HTML 注入。
// 失败 / 超时 / 离线：保留原 <pre> 源码围栏，加一行 .state.err，不白屏。
import { S } from './strings.js';

export const MERMAID_TIMEOUT_MS = 3000;

// 纯函数：找出 pre > code.language-mermaid
export function findMermaidBlocks(container) {
  const out = [];
  container.querySelectorAll('pre > code.language-mermaid').forEach((code) => {
    const pre = code.parentElement;
    out.push({ pre, code, src: code.textContent || '' });
  });
  return out;
}

// 纯函数：造 figure，把 pre 的行号锚原样搬过来（锚定行号不变）。
// 图源码原样留在 figure 里（折叠的 <details>，review M1）：figure 只放 <img> 时 textContent 为空，
// 草稿高亮（rangeForDraft）、过期评论按引文重锚（reanchorByQuote）都在块文本里找引文，会全部落空，
// 源码也不能再划选批注。内层 <code> 不带 language-mermaid、不带 data-line——
// 否则下一轮 findMermaidBlocks 会把它当新围栏再渲一遍，[data-line] 查找也会撞出两个同号块。
export function figureFor(pre, blobUrl, alt, src = '', srcLabel = '') {
  const doc = pre.ownerDocument;
  const fig = doc.createElement('figure');
  fig.className = 'mermaid-fig';
  for (const k of ['data-line', 'data-line-end']) {
    // 默认 fence 把行号打在 <code> 上（见 dom.test「fence 行号落在 <code> 上」），pre 上通常没有
    const v = pre.getAttribute(k) ?? pre.querySelector?.('code')?.getAttribute(k) ?? null;
    if (v != null) fig.setAttribute(k, v);
  }
  const img = doc.createElement('img');
  img.src = blobUrl;
  img.alt = alt;
  fig.appendChild(img);
  if (src) {
    const det = doc.createElement('details');
    det.className = 'mermaid-src';
    const sum = doc.createElement('summary');
    sum.textContent = srcLabel;
    const p = doc.createElement('pre');
    const code = doc.createElement('code');
    code.textContent = src;
    p.appendChild(code);
    det.appendChild(sum);
    det.appendChild(p);
    fig.appendChild(det);
  }
  return fig;
}

// blob URL 不能在 <img> load 后就 revoke：展图浮窗（image-view.js）要拿同一个 src 再开一张大图。
// 改为登记，下次 hydrate（= 换了文档）时把已离开 DOM 的 figure 的 URL 收掉（review M8）。
const liveBlobs = new Set();   // { url, fig }
export function sweepBlobUrls() {
  for (const b of liveBlobs) {
    if (b.fig.isConnected) continue;
    try { URL.revokeObjectURL(b.url); } catch { /* 已失效 */ }
    liveBlobs.delete(b);
  }
}
export const liveBlobCount = () => liveBlobs.size;

// 诊断用（冒烟 mm 层读它，定位"沙箱没应答"是没加载、没发出还是没回）
export const mermaidState = { loaded: null, sent: 0, replied: 0, errors: 0 };

// ── 沙箱 iframe 单例 ───────────────────────────────────────────────
let frame = null;       // { iframe, ready }
let seq = 0;
const pending = new Map();   // id -> { resolve }

function listen() {
  window.addEventListener('message', (e) => {
    // 壳在 opaque origin（e.origin === "null"），只认来源窗口，不认 origin
    if (!frame || e.source !== frame.iframe.contentWindow) return;
    const m = e.data || {};
    const p = pending.get(m.id);
    mermaidState.replied++;
    if (!p) return;
    if (m.type === 'svg' && typeof m.svg === 'string') p.resolve({ svg: m.svg });
    else if (m.type === 'error') p.resolve({ error: String(m.message || '') });
  });
}

function ensureFrame() {
  if (frame) return frame;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('src', './sandbox.html');
  iframe.setAttribute('title', 'menxia-sandbox');
  // 不能 hidden（display:none 下 mermaid 量不出文字尺寸）：移出屏幕但保持有布局。
  // 走 CSSOM 而非 style 属性，主页 CSP style-src 'self' 不允许内联样式属性。
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, { position: 'fixed', left: '-10000px', top: '0', width: '1024px', height: '768px', border: '0', visibility: 'hidden' });
  const ready = new Promise((resolve) => {
    iframe.addEventListener('load', () => { mermaidState.loaded = true; resolve(true); }, { once: true });
    iframe.addEventListener('error', () => { mermaidState.loaded = false; resolve(false); }, { once: true });
  });
  document.body.appendChild(iframe);
  frame = { iframe, ready };
  listen();
  return frame;
}

function currentTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function renderInSandbox(f, src, theme, timeoutMs) {
  const id = 'mm' + (++seq);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ error: 'timeout' }); }, timeoutMs);
    pending.set(id, { resolve: (r) => { clearTimeout(timer); pending.delete(id); resolve(r); } });
    mermaidState.sent++;
    f.iframe.contentWindow.postMessage({ type: 'mermaid', id, src, theme }, '*');
  });
}

function markFailed(pre, msg) {
  if (pre.nextElementSibling && pre.nextElementSibling.classList.contains('mermaid-err')) return;
  const note = pre.ownerDocument.createElement('div');
  note.className = 'state err mermaid-err';
  note.textContent = S.doc.mermaidFailed(msg);
  pre.insertAdjacentElement('afterend', note);
}

// 无围栏时不创建 iframe、不加载 mermaid
// timeoutMs 只给无头冒烟放宽：virtual-time 下跨进程 iframe 的真实渲染耗时不推进虚拟时钟，3s 会先到
// 返回实际换成 figure 的块数（ui.js 据此决定渲完要不要把深链目标重新对齐）
export async function hydrateMermaid(container, { theme, timeoutMs = MERMAID_TIMEOUT_MS } = {}) {
  sweepBlobUrls();
  const blocks = findMermaidBlocks(container);
  if (!blocks.length) return 0;
  const f = ensureFrame();
  const ok = await f.ready;
  if (!ok) { blocks.forEach((b) => markFailed(b.pre, 'sandbox')); return 0; }
  const th = theme || currentTheme();
  let replaced = 0;
  for (const b of blocks) {
    // 先查再发（review M6）：换文档后旧文档剩下的块若照发，会在共用的单个沙箱里排队，
    // 新文档的图跟着等、可能超时报假的「渲染失败」。
    if (!b.pre.isConnected) continue;
    const r = await renderInSandbox(f, b.src, th, timeoutMs);
    if (!b.pre.isConnected) continue;   // 渲染期间换了文档
    if (r.svg) {
      const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
      const fig = figureFor(b.pre, url, S.doc.mermaidAlt, b.src, S.doc.mermaidSource);
      liveBlobs.add({ url, fig });
      // mermaid 的 svg 根上是 width="100%"，当 <img> 用会被拉满栏宽放大；按 viewBox 的固有宽度定尺寸，
      // 太宽时由 article img 的 max-width:100% 兜住（走 CSSOM，主页 CSP 不许内联 style 属性）
      const vb = /viewBox="[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+[\d.]+"/.exec(r.svg);
      if (vb) fig.querySelector('img').style.width = `${Math.round(parseFloat(vb[1]))}px`;
      b.pre.replaceWith(fig);
      replaced++;
    } else {
      markFailed(b.pre, r.error || 'error');
    }
  }
  return replaced;
}
