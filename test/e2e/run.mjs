// 浏览器 E2E —— 对**真 staging 门下服务**（不是 demo mock）。由 test/run-e2e.sh 起静态服务器后调用。
// 环境：MENXIA_E2E_URL（staging 根）/ MENXIA_E2E_TOKEN（测试钩子 Bearer，只经 Hermes 包装脚本注入，
// 本文件绝不打印它）/ APP_URL（本地静态站，如 http://127.0.0.1:4555/）/ CHROME。
// 输出 `[e2e] PASS|FAIL|PENDING <名字>`，最后 `[e2e] RESULT pass= fail= pending=`。
// PENDING＝依赖的 staging 钩子还没上线（404），不是通过；见 docs/E2E.md。
import { launch } from './cdp.mjs';

// `node --test` 的默认匹配含 test/**/*.mjs，会把本文件当单测收进去；它要真 staging + 机密，不属于单测（docs/E2E.md「为什么不进 CI」）。
// 测试运行器给子进程设 NODE_TEST_CONTEXT——在那里显式跳过，只经 test/run-e2e.sh 运行。
if (process.env.NODE_TEST_CONTEXT) {
  console.log('# skip test/e2e/run.mjs：真服务 E2E，只经 test/run-e2e.sh（Hermes 的 menxia-web-e2e.sh）运行');
  process.exit(0);
}

const SVC = (process.env.MENXIA_E2E_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.MENXIA_E2E_TOKEN || '';
const APP = process.env.APP_URL;
const CHROME = process.env.CHROME;
const ONLY = (process.env.E2E_ONLY || '').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!SVC || !TOKEN) { console.log('[e2e] FAIL env — 缺 MENXIA_E2E_URL / MENXIA_E2E_TOKEN（只能经 Hermes 的 menxia-web-e2e.sh 运行）'); process.exit(1); }
if (!/^https:\/\/menxia-service-staging\.menxia-service\.workers\.dev$/.test(SVC)) {
  console.log('[e2e] FAIL env — MENXIA_E2E_URL 不是 staging，拒跑（E2E 会 reset 数据）'); process.exit(1);
}

const redact = (s) => String(s).split(TOKEN).join('<token>');
let pass = 0, fail = 0, pending = 0;
const out = (kind, name, detail = '') => console.log(`[e2e] ${kind} ${name}${detail ? ` — ${redact(detail)}` : ''}`);

class Pending extends Error {}
async function hook(path, body) {
  const res = await fetch(SVC + path, {
    method: body === undefined && path.includes('/mail/') ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body === undefined || path.includes('/mail/') ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, json, text };
}
async function need(path, body) {
  const r = await hook(path, body);
  if (r.status === 404) throw new Pending(`${path} 404（钩子未上线）`);
  if (r.status >= 300) throw new Error(`${path} → ${r.status} ${r.text.slice(0, 200)}`);
  return r.json;
}
async function api(token, path, init = {}) {
  const res = await fetch(`${SVC}/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}

const EMAIL = 'e2e-reader@menxia.test';
const AUTH_KEY = 'menxia.svc.auth.staging';
const appUrl = (q = '') => `${APP}index.html?service=staging${q}`;

let browser;
async function freshPage() {
  const page = await browser.newPage();
  // 外链一律不出网：amazon 之类在网络层直接掐掉（断言看的是 window.open 的目标，不需要真打开）
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*amazon.com*' }] });
  page.on('Fetch.requestPaused', (p) => page.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }).catch(() => {}));
  return page;
}
// 进 app 前把数据源设成门下服务、塞好 staging token（登录用例之外都走 /__test/token 省掉 OAuth）
async function openAppAs(page, token, q = '') {
  await page.goto(appUrl(q));
  await page.eval(`localStorage.setItem('menxia.backend','service');
    ${token ? `localStorage.setItem('${AUTH_KEY}', JSON.stringify({ access_token: ${JSON.stringify(token)}, refresh_token: '', expires_at: 0 }))` : ''}`);
  await page.goto(appUrl(q));
}
const tokenFor = async (email) => { await need('/__test/user', { email }); return (await need('/__test/token', { email })).access_token; };
async function makeReview(email, title, content) {
  const j = await need('/__test/review', { email, title, documents: [{ path: 'docs/e2e.md', content }] });
  // 服务端契约（menxia-service src/http/test_hooks.ts）：201 { review_id, revision_no, web_url, warnings }。
  // 读不到 id 就当场炸——别让 undefined 流进正文成 /r/undefined、流进读回成 /reviews/undefined（run1 的 3 个假失败）。
  if (!j || !/^rv_[0-9A-Z]{26}$/.test(j.review_id || '')) throw new Error(`/__test/review 没回 review_id：${JSON.stringify(j).slice(0, 200)}`);
  return j.review_id;
}
// 两折：A 的正文带外链 + 指向 B 的服务短链（复现折 rv_01M8FDABTXWH7XW1823WXHT7KH 的写法）
async function twoReviews() {
  const B = await makeReview(EMAIL, 'E2E 目标折', '# 目标折\n\n这是被内链指到的那一折，独有暗号 TARGET-OK。\n');
  const A = await makeReview(EMAIL, 'E2E 链接折', [
    '# 链接折', '',
    '第一段用来划选涂归：门下的阅读批注要在真服务上走通一遍。', '',
    '外链：[Amazon 商品页](https://www.amazon.com/dp/B07GZ98PKL)。', '',
    `内链：[目标折](${SVC}/r/${B})。`, '',
  ].join('\n'));
  return { A, B };
}
async function openFolder(page, title) {
  try { await page.waitFor(`[...document.querySelectorAll('#pr-list .pr-item')].some((el) => el.textContent.includes(${JSON.stringify(title)}))`, 20000, `清单出现「${title}」`); }
  catch (e) {
    const st = await page.eval(`JSON.stringify({ url: location.href, setup: !!document.getElementById('setup'), authed: !!localStorage.getItem('${AUTH_KEY}'),
      items: [...document.querySelectorAll('#pr-list .pr-item')].map((el) => el.textContent.trim().slice(0, 40)), errs: [...document.querySelectorAll('.state.err, .notice')].map((el) => el.textContent.trim().slice(0, 120)) })`).catch((x) => x.message);
    throw new Error(`${e.message} ${st}`);
  }
  await page.click(`[...document.querySelectorAll('#pr-list .pr-item')].find((el) => el.textContent.includes(${JSON.stringify(title)}))`);
  await page.waitFor(`document.querySelector('#doc h1')?.textContent.trim().length > 0`, 20000, '正文渲染');
}

// 失败时把页面现场带进报错：地址、提示条、锚点失败条、被拦的 window.open
const diag = (page) => page.eval(`JSON.stringify({ url: location.href, crumb: document.querySelector('.crumb')?.textContent?.slice(0, 80),
  notice: [...document.querySelectorAll('.notice, .state.err, .anchor-fail')].map((e) => e.textContent.trim().slice(0, 160)),
  opened: window.__opened, h1: document.querySelector('#doc h1')?.textContent })`).catch((e) => `diag 失败：${e.message}`);

const cases = {
  async 'probe-hooks'() {
    // 不带 token 应 404（钩子对外隐身）。带 token：旧钩子 user/reset 应 2xx；新钩子 token/review 未上线时 404。
    // 注意先建用户：token/review 对不存在的用户也回 404，不先建会把「用户不存在」误读成「钩子未上线」。
    const anon = await fetch(`${SVC}/__test/token`, { method: 'POST' });
    const reset = await hook('/__test/reset', { email: EMAIL });
    await hook('/__test/user', { email: EMAIL });
    const tok = await hook('/__test/token', { email: EMAIL });
    const rev = await hook('/__test/review', { email: EMAIL, title: 'probe', documents: [{ path: 'docs/p.md', content: '# p' }] });
    const detail = `anon/token=${anon.status} reset=${reset.status} token=${tok.status} review=${rev.status}`;
    if (reset.status >= 300) throw new Error(`旧钩子 reset 不通：${detail}`);
    if (tok.status === 404 || rev.status === 404) throw new Pending(`新钩子未上线：${detail}`);
    if (tok.status >= 300 || rev.status >= 300) throw new Error(detail);
    return detail;
  },

  // ① 真 OAuth：网页点登录 → staging /login → 魔法链接取自 /__test/mail/latest → 确认 → 回网页已登录
  async login() {
    await need('/__test/user', { email: EMAIL });
    const page = await freshPage();
    await openAppAs(page, null);
    try { await page.click(`document.querySelector('.svc-login')`); }
    catch (e) {
      const st = await page.eval(`JSON.stringify({ url: location.href, rs: document.readyState, backend: localStorage.getItem('menxia.backend'),
        setup: document.getElementById('setup')?.className, body: document.body?.innerText?.slice(0, 200) })`).catch((x) => x.message);
      throw new Error(`${e.message} ${st}`);
    }
    await page.waitFor(`location.origin === ${JSON.stringify(SVC)} && !!document.querySelector('input[type=email], input[name=email]')`, 20000, 'staging 登录页');
    await page.eval(`(() => { const i = document.querySelector('input[type=email], input[name=email]');
      i.value = ${JSON.stringify(EMAIL)}; i.dispatchEvent(new Event('input', { bubbles: true }));
      const f = i.form; f.requestSubmit ? f.requestSubmit() : f.submit(); })()`);
    let link = null;
    for (let i = 0; i < 30 && !link; i++) {
      await sleep(1000);
      const m = await hook(`/__test/mail/latest?to=${encodeURIComponent(EMAIL)}`);
      if (m.status === 404 && i > 5) throw new Error('mail/latest 一直 404');
      const urls = (m.text.match(/https?:\/\/[^\s"'<>\\)]+/g) || []).filter((u) => u.startsWith(SVC));
      link = urls[0] || null;
    }
    if (!link) throw new Error('30s 内没收到魔法链接');
    await page.goto(link.replace(/&amp;/g, '&'));
    // 确认页 / 授权同意页：有提交钮就点，直到回到网页
    for (let i = 0; i < 6; i++) {
      const where = await page.eval('location.origin').catch(() => '');
      if (where === new URL(APP).origin) break;
      const btn = await page.eval(`!!document.querySelector('form button[type=submit], form input[type=submit], form button:not([type])')`).catch(() => false);
      if (btn) await page.click(`document.querySelector('form button[type=submit], form input[type=submit], form button:not([type])')`);
      await sleep(1500);
    }
    await page.waitFor(`location.origin === ${JSON.stringify(new URL(APP).origin)} && !location.pathname.endsWith('oauth.html') && !!localStorage.getItem('${AUTH_KEY}')`, 20000, '回到网页且 staging token 落盘');
    const prodUntouched = await page.eval(`localStorage.getItem('menxia.svc.auth') === null`);
    if (!prodUntouched) throw new Error('staging 登录写进了正式 token 的 key');
    await page.waitFor(`!document.getElementById('setup')`, 15000, '离开设置页（已登录）');
    return 'OAuth 回到网页，token 存 menxia.svc.auth.staging';
  },

  // ② 建折 → 清单可见 → 打开看到正文
  async 'open-folder'() {
    const token = await tokenFor(EMAIL);
    await makeReview(EMAIL, 'E2E 开折', '# 开折\n\n正文暗号 OPEN-OK。\n');
    const page = await freshPage();
    await openAppAs(page, token);
    await openFolder(page, 'E2E 开折');
    await page.waitFor(`document.querySelector('#doc').textContent.includes('OPEN-OK')`, 10000, '正文暗号');
  },

  // ③ 外链：真鼠标点 → window.open(href, _blank, noopener)，当前页不走
  async 'external-link'() {
    const token = await tokenFor(EMAIL);
    await twoReviews();
    const page = await freshPage();
    await openAppAs(page, token);
    await openFolder(page, 'E2E 链接折');
    await page.eval(`window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; window.__before = location.href; true`);
    await page.click(`[...document.querySelectorAll('#doc a')].find((a) => a.href.includes('amazon.com'))`);
    await sleep(600);
    const r = await page.eval(`({ opened: window.__opened, same: location.href === window.__before, float: !!document.querySelector('.zhupi-float') })`);
    const o = r.opened[0] || [];
    if (!(o[0] === 'https://www.amazon.com/dp/B07GZ98PKL' && o[1] === '_blank' && /noopener/.test(o[2] || '') && r.same && !r.float)) {
      throw new Error(JSON.stringify(r));
    }
    return JSON.stringify(o);
  },

  // ④ 内链 /r/rv_… → 当前网页内开另一折
  async 'internal-link'() {
    const token = await tokenFor(EMAIL);
    const { B } = await twoReviews();
    const page = await freshPage();
    await openAppAs(page, token);
    await openFolder(page, 'E2E 链接折');
    await page.eval(`window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; true`);
    await page.click(`[...document.querySelectorAll('#doc a')].find((a) => a.href.includes('/r/${B}'))`);
    try { await page.waitFor(`document.querySelector('#doc')?.textContent.includes('TARGET-OK')`, 15000, '跳到目标折正文'); }
    catch (e) { throw new Error(`${e.message} ${await diag(page)}`); }
    const r = await page.eval(`({ opened: window.__opened.length, origin: location.origin, pr: new URL(location.href).searchParams.get('pr') })`);
    if (r.opened || r.origin !== new URL(APP).origin) throw new Error(JSON.stringify(r));
    return JSON.stringify(r);
  },

  // ⑤ 涂归呈递：划选 → 写批注 → 呈出 → 服务端读回评论
  async annotate() {
    const token = await tokenFor(EMAIL);
    const { A } = await twoReviews();
    const page = await freshPage();
    await openAppAs(page, token);
    await openFolder(page, 'E2E 链接折');
    const note = `E2E 涂归 ${Date.now()}`;
    await page.eval(`(() => { const doc = document.querySelector('#doc'); const target = '门下的阅读批注要在真服务上走通一遍';
      const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const i = n.data.indexOf(target); if (i >= 0) {
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + target.length);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        doc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return true; } }
      return false; })()`);
    await page.waitFor(`!!document.querySelector('.zhupi-float')`, 5000, '浮批钮');
    await page.click(`document.querySelector('.zhupi-float')`);
    await page.waitFor(`!!document.querySelector('.anno-input')`, 5000, '批注框');
    await page.eval(`(() => { const ta = document.querySelector('.anno-input'); ta.value = ${JSON.stringify(note)};
      ta.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('.anno-save')].pop().click(); return true; })()`);
    await page.waitFor(`!!document.querySelector('.btn-submit')`, 5000, '呈出钮');
    await page.click(`document.querySelector('.btn-submit')`);
    for (let i = 0; i < 20; i++) {
      await sleep(750);
      const r = await api(token, `/reviews/${A}/comments?limit=100`);
      if (r.status === 200 && r.text.includes(note)) return `服务端读回 ${note}`;
    }
    throw new Error(`15s 内服务端没有这条评论 ${await diag(page)}`);
  },

  // ⑥ 画可：判框（有题先答）→ 画可 → 服务端 status=approved
  async approve() {
    const token = await tokenFor(EMAIL);
    const { A } = await twoReviews();
    const page = await freshPage();
    await openAppAs(page, token);
    await openFolder(page, 'E2E 链接折');
    await page.eval('window.confirm = () => true; true');
    await page.waitFor(`!!document.querySelector('.btn-qinci:not([disabled])')`, 10000, '画可钮');
    await page.click(`document.querySelector('.btn-qinci')`);
    await sleep(800);
    const card = await page.eval(`!!document.querySelector('.zongpi-card.verdict-approve')`);
    if (card) await page.click(`[...document.querySelectorAll('.anno-save')].pop()`);
    for (let i = 0; i < 20; i++) {
      await sleep(750);
      const r = await api(token, `/reviews/${A}`);
      if (r.json?.status === 'approved') return 'status=approved';
    }
    throw new Error(`15s 内服务端状态没变 approved card=${card} ${await diag(page)}`);
  },
};

browser = await launch({ chrome: CHROME });
try {
  for (const [name, fn] of Object.entries(cases)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    try {
      if (name !== 'probe-hooks') await need('/__test/reset', { email: EMAIL });   // 每个用例 setUp：reset（钩子按邮箱清，只收 @menxia.test）
      const d = await fn();
      pass++; out('PASS', name, d || '');
    } catch (err) {
      if (err instanceof Pending) { pending++; out('PENDING', name, err.message); }
      else { fail++; out('FAIL', name, err.message); }
    }
  }
} finally {
  await browser.close();
}
console.log(`[e2e] RESULT pass=${pass} fail=${fail} pending=${pending}`);
process.exit(fail ? 1 : pending ? 3 : 0);
