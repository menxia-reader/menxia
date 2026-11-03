// mermaid 渲图的锚定 / 沙箱排队 / blob 回收（review M1 / M6 / M8）。
// node 里没有 DOM：下面是一个只实现 mermaid.js + anchor.js 用到那几个面的最小假 DOM，
// 沙箱 iframe 也是假的——收到 postMessage 就同步回一张 svg，能数出发了几条。
import { test } from 'node:test';
import assert from 'node:assert/strict';

class El {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.parentElement = null;
    this.children = []; this.attrs = {}; this.style = {}; this._text = ''; this.listeners = {};
    const self = this;
    this.classList = { contains: (c) => (self.className || '').split(/\s+/).includes(c) };
    this.dataset = new Proxy({}, { get: (_, k) => self.attrs['data-' + String(k)] });
  }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return n === this.ownerDocument.root; }
  get nextElementSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
  replaceWith(n) { const p = this.parentElement; const i = p.children.indexOf(this); p.children[i] = n; n.parentElement = p; this.parentElement = null; }
  remove() { const p = this.parentElement; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parentElement = null; } }
  insertAdjacentElement(_, n) { const p = this.parentElement; p.children.splice(p.children.indexOf(this) + 1, 0, n); n.parentElement = p; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  matches(sel) {
    if (sel === '[data-line]') return this.getAttribute('data-line') != null;
    if (sel === 'code' || sel === 'img') return this.tagName === sel.toUpperCase();
    if (sel === 'pre > code.language-mermaid') return this.tagName === 'CODE' && this.classList.contains('language-mermaid') && this.parentElement?.tagName === 'PRE';
    throw new Error('假 DOM 不认的选择器：' + sel);
  }
  querySelectorAll(sel) { return [...this.walk()].filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function makeDoc() {
  const doc = { createElement: (t) => new El(t, doc) };
  doc.root = new El('html', doc);
  doc.body = doc.root.appendChild(new El('body', doc));
  return doc;
}

// 一块 mermaid 围栏：pre > code.language-mermaid[data-line]
function fence(doc, parent, line, src) {
  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  code.className = 'language-mermaid';
  code.setAttribute('data-line', String(line));
  code.textContent = src;
  pre.appendChild(code);
  parent.appendChild(pre);
  return pre;
}

// 假窗口 + 假沙箱：iframe 一 append 就 load；postMessage 同步回 svg（或按 pausedReply 挂起）
const sent = [];
const winListeners = {};
let holdReplies = false;
const held = [];
function installFakeWindow(doc) {
  globalThis.window = {
    addEventListener: (t, fn) => { (winListeners[t] ||= []).push(fn); },
    matchMedia: () => ({ matches: false }),
  };
  globalThis.document = doc;
  const origCreate = doc.createElement;
  doc.createElement = (t) => {
    const el = origCreate(t);
    if (t === 'iframe') {
      el.contentWindow = {
        postMessage(m) {
          sent.push(m);
          const reply = () => (winListeners.message || []).forEach((fn) => fn({ source: el.contentWindow,
            data: { type: 'svg', id: m.id, svg: '<svg viewBox="0 0 120 40"></svg>' } }));
          if (holdReplies) held.push(reply); else reply();
        },
      };
      queueMicrotask(() => (el.listeners.load || []).forEach((fn) => fn()));
    }
    return el;
  };
}

const doc = makeDoc();
installFakeWindow(doc);
const { hydrateMermaid, figureFor, liveBlobCount } = await import('../src/mermaid.js');
const { reanchorByQuote } = await import('../src/anchor.js');

const SRC = 'graph TD\n  审校员 --> 门下省\n  门下省 --> 尚书省';

test('M1：figure 留着图源码（不带 language-mermaid / data-line），按引文能重锚回 fence 行', async () => {
  const article = doc.body.appendChild(doc.createElement('article'));
  const p = article.appendChild(doc.createElement('p'));
  p.setAttribute('data-line', '1'); p.textContent = '前文段落';
  fence(doc, article, 3, SRC);
  // 修前：figure 只含 <img>，textContent 为空，这里是 null
  assert.equal(reanchorByQuote(article, '审校员 --> 门下省'), 3);
  const n = await hydrateMermaid(article);
  assert.equal(n, 1, '应换成 1 个 figure');
  const fig = article.children[1];
  assert.equal(fig.tagName, 'FIGURE');
  assert.equal(fig.getAttribute('data-line'), '3');
  assert.ok(fig.textContent.includes(SRC), 'figure 文本里应有图源码');
  assert.equal(reanchorByQuote(article, '审校员 --> 门下省'), 3, '渲图后按引文仍锚回 fence 行');
  assert.equal(article.querySelectorAll('pre > code.language-mermaid').length, 0, '内层源码不得再被当成待渲围栏');
  assert.equal(article.querySelectorAll('[data-line]').length, 2, '不得出现第二个同号 data-line 块');
  article.remove();
});

test('figureFor：不给 src 时仍只有 <img>（老调用形状不变）', () => {
  const pre = fence(doc, doc.createElement('div'), 5, 'x');
  const fig = figureFor(pre, 'blob:x', 'alt');
  assert.equal(fig.children.length, 1);
  assert.equal(fig.children[0].tagName, 'IMG');
});

test('M6：渲染前已脱离 DOM 的旧文档块不再发进共用沙箱', async () => {
  const a = doc.body.appendChild(doc.createElement('article'));
  fence(doc, a, 2, 'graph A'); fence(doc, a, 6, 'graph B'); fence(doc, a, 9, 'graph C');
  holdReplies = true;
  const before = sent.length;
  const p = hydrateMermaid(a);
  for (let i = 0; i < 5 && !held.length; i++) await Promise.resolve();   // 等 frame.ready
  assert.equal(sent.length - before, 1, '第一块已发出');
  a.remove();                       // 换文档：旧 article 整个离开 DOM
  holdReplies = false;
  held.splice(0).forEach((r) => r());
  assert.equal(await p, 0);
  assert.equal(sent.length - before, 1, '修前这里是 3：剩下两块照样排进沙箱');
});

test('M8：换文档后，上一篇 figure 的 blob URL 在下次 hydrate 时被 revoke', async () => {
  const revoked = [];
  const orig = URL.revokeObjectURL;
  URL.revokeObjectURL = (u) => { revoked.push(u); orig.call(URL, u); };
  try {
    const a = doc.body.appendChild(doc.createElement('article'));
    fence(doc, a, 2, 'graph A');
    await hydrateMermaid(a);
    const url = a.children[0].children[0].src;
    assert.ok(url.startsWith('blob:'));
    assert.ok(liveBlobCount() >= 1);
    await hydrateMermaid(a);                       // 同一篇重渲：图还在，不能收
    assert.ok(!revoked.includes(url), '图还在页上就 revoke 会让展图浮窗打不开');
    a.remove();
    await hydrateMermaid(doc.body.appendChild(doc.createElement('article')));   // 换到一篇没有图的文档
    assert.ok(revoked.includes(url), '修前从不 revoke');
    assert.equal(liveBlobCount(), 0);
  } finally { URL.revokeObjectURL = orig; }
});

// review M2：sandbox.html 的 CSP 写死了主站域名，fork 部署时 vendor 脚本被拦。
// 修前内联脚本第一行 mermaid.initialize 就 ReferenceError、监听器没挂上，每张图干等 3s 超时；
// 修后壳照样挂监听、立刻回 error。拿 vm 跑真 sandbox.html 里的内联脚本验证。
test('M2：sandbox.html 里 mermaid 没加载上时，立刻回 error 而不是沉默', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const html = readFileSync(new URL('../sandbox.html', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inline.length, 1);
  let handler = null;
  const ctx = vm.createContext({ addEventListener: (t, fn) => { if (t === 'message') handler = fn; } });
  vm.runInContext(inline[0], ctx);          // 无 mermaid 全局 = vendor 被 CSP 拦下
  assert.ok(handler, '监听器没挂上：主页只能等超时');
  const replies = [];
  await handler({ data: { type: 'mermaid', id: 'mm1', src: 'graph TD; a-->b', theme: 'light' },
    source: { postMessage: (m) => replies.push(m) } });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].type, 'error');
  assert.equal(replies[0].id, 'mm1');
  // 正常路径没被改坏：有 mermaid 时照常回 svg
  const ok = vm.createContext({ addEventListener: (t, fn) => { if (t === 'message') handler = fn; },
    mermaid: { initialize() {}, render: async () => ({ svg: '<svg/>' }) } });
  vm.runInContext(inline[0], ok);
  const r2 = [];
  await handler({ data: { type: 'mermaid', id: 'mm2', src: 'x' }, source: { postMessage: (m) => r2.push(m) } });
  assert.deepEqual(JSON.parse(JSON.stringify(r2)), [{ type: 'svg', id: 'mm2', svg: '<svg/>' }]);   // vm 里造的对象跨 realm
});

// review M3：深链/跳转的 60ms 滚动跑在渲图之前，图换进来把目标推走。ui.js 顶层要 preact/window，
// node 里拉不起来，这里钉源码约定：跳转那段在 hydrateMermaid 的结果上再对齐一次，且读者动过就不拽。
test('M3：ui.js 深链跳转在 mermaid 渲完、真换了图时把目标重新对齐', async () => {
  const { readFileSync } = await import('node:fs');
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const seg = /const mm = hydrateMermaid\([\s\S]*?\n {8}\}\n/.exec(ui)?.[0] || '';
  assert.ok(seg, '没找到 const mm = hydrateMermaid(...) 那段');
  assert.match(seg, /setTimeout\(\(\) => \{[\s\S]*flashTo\(target, 'center'\)/);
  assert.match(seg, /mm\.then\(\(n\) => \{[\s\S]*userMoved[\s\S]*!n[\s\S]*target\.scrollIntoView/);
});
