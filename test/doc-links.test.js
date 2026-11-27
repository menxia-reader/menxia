// 正文链接（docs/DOC-LINKS.md）+ staging 服务地址覆盖（docs/E2E.md）的纯逻辑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFolderLink, isExternalHttp, PUBLIC_APP_URL } from '../src/link.js';

const PROD = 'https://menxia-service.menxia-service.workers.dev';
const STAGING = 'https://menxia-service-staging.menxia-service.workers.dev';
const RV = 'rv_01M8D6VDTCFQMR76J0SP1J94S1';
const ctx = { serviceOrigins: [PROD], appUrls: ['http://127.0.0.1:4188/index.html', PUBLIC_APP_URL] };

test('服务短链 /r/rv_… → 那一折（复现折 rv_01M8FDABTXWH7XW1823WXHT7KH 里的写法）', () => {
  assert.deepEqual(parseFolderLink(`${PROD}/r/${RV}`, ctx), { repo: null, prNumber: RV, path: null, line: null });
  assert.equal(parseFolderLink(`${PROD}/r/${RV}/`, ctx)?.prNumber, RV);
});

test('服务短链：别的主机 / 坏 id / 别的路径一律不认', () => {
  assert.equal(parseFolderLink(`https://evil.example/r/${RV}`, ctx), null);
  assert.equal(parseFolderLink(`${PROD}/r/rv_short`, ctx), null);
  assert.equal(parseFolderLink(`${PROD}/r/${RV.toLowerCase()}`, ctx), null);
  assert.equal(parseFolderLink(`${PROD}/api/v1/reviews/${RV}`, ctx), null);
  assert.equal(parseFolderLink(`${STAGING}/r/${RV}`, ctx), null, 'staging 只在覆盖生效时才进 serviceOrigins');
  assert.equal(parseFolderLink(`${STAGING}/r/${RV}`, { ...ctx, serviceOrigins: [PROD, STAGING] })?.prNumber, RV);
});

test('网页直达链 ?pr=：公开站 / 当前页 / 相对 ?pr= 都认，带 path/line', () => {
  assert.equal(parseFolderLink(`${PUBLIC_APP_URL}?pr=${RV}`, ctx)?.prNumber, RV);
  assert.equal(parseFolderLink(`${PUBLIC_APP_URL}index.html?pr=998`, ctx)?.prNumber, 998);
  assert.equal(parseFolderLink('http://127.0.0.1:4188/?pr=7', ctx)?.prNumber, 7);
  assert.equal(parseFolderLink('?pr=7', ctx)?.prNumber, 7, '相对写法按当前页解析');
  assert.deepEqual(parseFolderLink(`${PUBLIC_APP_URL}?repo=a/b&pr=3&path=docs/x.md&line=9`, ctx),
    { repo: 'a/b', prNumber: 3, path: 'docs/x.md', line: 9 });
});

test('网页直达链：没 pr / 别的站 / 站内别的页 不认', () => {
  assert.equal(parseFolderLink(PUBLIC_APP_URL, ctx), null);
  assert.equal(parseFolderLink('https://menxia-reader.github.io/other/?pr=3', ctx), null);
  assert.equal(parseFolderLink(`${PUBLIC_APP_URL}oauth.html?pr=3`, ctx), null);
  assert.equal(parseFolderLink('https://www.amazon.com/dp/B07GZ98PKL?pr=3', ctx), null);
});

test('外链判定：只认绝对 http(s)', () => {
  assert.ok(isExternalHttp('https://www.amazon.com/dp/B07GZ98PKL'));
  assert.ok(isExternalHttp('http://example.com'));
  for (const h of ['#x', 'docs/a.md', '?pr=3', 'mailto:a@b.c', 'javascript:alert(1)', '//cdn.x/y', '', null]) {
    assert.ok(!isExternalHttp(h), String(h));
  }
});

test('parseFolderLink 不吃 javascript: / mailto:', () => {
  assert.equal(parseFolderLink('javascript:alert(1)', ctx), null);
  assert.equal(parseFolderLink('mailto:a@b.c', ctx), null);
});

// ── staging 覆盖 ──
const mem = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const { resolveServiceUrl, SERVICE_OVERRIDE_KEY, PROD_SERVICE_URL, STAGING_SERVICE_URL, SERVICE_URL } = await import('../src/service-api.js');

test('服务地址：缺省恒为正式地址', () => {
  assert.equal(PROD_SERVICE_URL, PROD);
  assert.equal(STAGING_SERVICE_URL, STAGING);
  assert.equal(resolveServiceUrl('', mem()), PROD);
  assert.equal(resolveServiceUrl('?pr=3', null), PROD);
  assert.equal(SERVICE_URL, PROD, 'node 下无 location：模块常量即正式地址');
});

test('服务地址：?service=staging 生效并落盘，下次无参数仍生效（OAuth 回调页靠它）', () => {
  const s = mem();
  assert.equal(resolveServiceUrl('?service=staging', s), STAGING);
  assert.equal(s.getItem(SERVICE_OVERRIDE_KEY), 'staging');
  assert.equal(resolveServiceUrl('', s), STAGING);
});

test('服务地址：白名单外的值一律回正式，并清掉覆盖（不收任意 URL）', () => {
  const s = mem();
  resolveServiceUrl('?service=staging', s);
  for (const v of ['https://evil.example', 'prod', '', 'constructor', '__proto__', 'toString']) {
    assert.equal(resolveServiceUrl(`?service=${encodeURIComponent(v)}`, s), PROD, v);
    assert.equal(s.getItem(SERVICE_OVERRIDE_KEY), null, v);
  }
  s.setItem(SERVICE_OVERRIDE_KEY, 'https://evil.example');   // 手改 localStorage 也不行
  assert.equal(resolveServiceUrl('', s), PROD);
});

test('服务地址：存储抛错（无痕模式）不炸，参数仍生效', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(resolveServiceUrl('?service=staging', bad), STAGING);
  assert.equal(resolveServiceUrl('', bad), PROD);
});
