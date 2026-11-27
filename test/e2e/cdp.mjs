// 零依赖 headless Chrome + CDP 驱动（Node ≥22 自带 WebSocket）。只给 test/e2e/run.mjs 用，不进站点产物。
// 取舍见 docs/E2E.md：沿用 run-browser.sh 的「只要有 Chrome」路线，不引入 Playwright 的 npm 安装与浏览器下载。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ chrome, headless = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'menxia-e2e-'));
  const args = [
    headless ? '--headless=new' : '', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1000',
    ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []), 'about:blank',
  ].filter(Boolean);
  const proc = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome 15s 内没给出 DevTools 地址')), 15000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (c) => { clearTimeout(t); reject(new Error(`Chrome 提前退出 code=${c}`)); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data || ''}`)) : resolve(msg.result);
    } else if (msg.method) listeners.forEach((fn) => fn(msg));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const browser = {
    send,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async newPage() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const page = makePage(browser, sessionId, targetId);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      return page;
    },
    async close() {
      try { await send('Browser.close'); } catch { /* 已退 */ }
      await sleep(300);
      proc.kill();
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* 留给系统清 */ }
    },
  };
  return browser;
}

function makePage(browser, sessionId, targetId) {
  const send = (m, p) => browser.send(m, p, sessionId);
  const page = {
    targetId, sessionId, send,
    on: (method, fn) => browser.on((msg) => { if (msg.sessionId === sessionId && msg.method === method) fn(msg.params); }),
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`页面里抛错：${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    },
    async waitFor(expression, ms = 15000, what = expression) {
      const end = Date.now() + ms;
      let last;
      while (Date.now() < end) {
        try { last = await page.eval(expression); if (last) return last; } catch { /* 导航中，上下文没了 */ }
        await sleep(200);
      }
      throw new Error(`等不到：${what}`);
    },
    // 必须等**这一次**导航的 load 事件：navigate 后立刻查 readyState 会读到旧文档的 "complete"，
    // goto 提前返回，随后的 localStorage 写进旧页 / 被导航冲掉 → app 以未登录态起、清单永远不出现（E2E 偶发失败的根因）。
    async goto(url) {
      let off;
      const loaded = new Promise((resolve) => { off = page.on('Page.loadEventFired', resolve); });
      try {
        await send('Page.navigate', { url });
        await Promise.race([loaded, sleep(20000).then(() => { throw new Error(`加载超时 ${url}`); })]);
      } finally { off(); }
      await page.waitFor('document.readyState === "complete"', 20000, `加载 ${url}`);
    },
    // 真鼠标点击：滚到可见 → 量中心 → mouseMoved/pressed/released，走浏览器的命中测试与默认动作
    async click(selectorExpr) {
      // 模块图异步挂载：readyState=complete 时 app 常常还没渲染，先等元素出现
      await page.waitFor(`!!(${selectorExpr})`, 10000, selectorExpr).catch(() => {});
      const box = await page.eval(`(() => { const el = ${selectorExpr}; if (!el) return null;
        el.scrollIntoView({ block: 'center' }); const r = el.getClientRects()[0] || el.getBoundingClientRect();
        return { x: r.left + Math.min(r.width / 2, 8), y: r.top + r.height / 2 }; })()`);
      if (!box) throw new Error(`点不到（元素不存在）：${selectorExpr}`);
      await sleep(100);
      const base = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    },
  };
  return page;
}
