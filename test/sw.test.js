// Service Worker 策略守卫（node 内置 runner）。
// sw.js 的事件装配被 `typeof self` 挡住，node import 时不触发，只暴露纯函数——这里测那些。
//
// 头号红线在这里立测：SW 绝不能把活站钉死。所以断言集中在两点——
//   ① 应用壳走 network-first（本文件不直接跑 fetch，而是钉死「壳被识别成要走缓存策略的资源」，
//      并在 README/代码注释里承诺 network-first；策略函数 shouldHandle/isAppShell 决定谁进这条路）；
//   ② 版本号换名 → 旧 cache 该被弃（cacheName 随 SW_VERSION 变）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SW_VERSION, cacheName, shouldHandle, isAppShell, KILL_SWITCH_URL, networkCacheMode } from '../sw.js';
import { KILL_SWITCH_URL as REGISTER_KILL_URL } from '../src/sw-register-const.js';
import { updateUrl } from '../src/sw-register.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'https://menxia-reader.github.io';

const req = (url, { method = 'GET', destination = '' } = {}) => ({ url, method, destination });

test('cacheName 带版本号：改 SW_VERSION 就换名（activate 时旧 cache 被清的前提）', () => {
  assert.ok(cacheName().includes(SW_VERSION));
  assert.notEqual(cacheName('v1'), cacheName('v2'));
  assert.ok(cacheName().startsWith('menxia-shell-'));
});

test('shouldHandle：只接管同源 GET，且永不碰 api.github.com（凭据绝不进 Cache）', () => {
  // 同源壳资源：接管
  assert.equal(shouldHandle(req(`${SELF}/menxia/src/ui.js`), SELF), true);
  assert.equal(shouldHandle(req(`${SELF}/menxia/`), SELF), true);
  // api.github.com：坚决不碰（就算同源判定意外为真也被 hostname 兜底挡下）
  assert.equal(shouldHandle(req('https://api.github.com/repos/x/y/pulls'), SELF), false);
  // 跨源：不碰
  assert.equal(shouldHandle(req('https://example.com/x.js'), SELF), false);
  // 非 GET（发判/PATCH 续读）：不碰 → 写操作绝不被 SW 截
  assert.equal(shouldHandle(req(`${SELF}/menxia/x`, { method: 'POST' }), SELF), false);
  assert.equal(shouldHandle(req(`${SELF}/menxia/x`, { method: 'PATCH' }), SELF), false);
});

test('isAppShell：document/script/style + .html/.js/.css/目录根算壳；图片等不算', () => {
  assert.equal(isAppShell(req(`${SELF}/menxia/index.html`, { destination: 'document' })), true);
  assert.equal(isAppShell(req(`${SELF}/menxia/src/ui.js`, { destination: 'script' })), true);
  assert.equal(isAppShell(req(`${SELF}/menxia/src/style.css`, { destination: 'style' })), true);
  // destination 为空（headless/老浏览器）→ 回退看扩展名
  assert.equal(isAppShell(req(`${SELF}/menxia/vendor/markdown-it.min.js`)), true);
  assert.equal(isAppShell(req(`${SELF}/menxia/`)), true);
  // 图片不进壳缓存（正文图走 API blob，不该被 SW 缓存）
  assert.equal(isAppShell(req(`${SELF}/menxia/assets/x.png`, { destination: 'image' })), false);
});

test('kill-switch 常量两处逐字一致（sw.js 内联 vs sw-register-const.js）', () => {
  // 内联那份与壳侧共享常量必须相等——不然拨闸只拨到一半，SW 与壳各读各的。
  assert.equal(KILL_SWITCH_URL, REGISTER_KILL_URL);
});

test('sw.js 作为模块 worker 注册：sw-register.js 必须带 type:\'module\'（否则 export 会 script eval failed）', () => {
  // 2026-08-13 在线实测：classic worker 里 sw.js 的 export → "ServiceWorker script evaluation failed"。
  // 修法是 type:'module'。这条钉死它，防有人把 { type:'module' } 删了退回 classic。
  const reg = readFileSync(join(ROOT, 'src/sw-register.js'), 'utf8');
  assert.ok(/register\(\s*['"]\.\/sw\.js['"]\s*,\s*\{\s*type:\s*['"]module['"]\s*\}/.test(reg),
    "sw-register.js 必须以 { type: 'module' } 注册 sw.js");
});

test('sw.js 承诺 network-first（红线）：源码含 networkFirst，且没有 cache-first 地把壳先给缓存', () => {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(/networkFirst/.test(src), '必须有 networkFirst 策略');
  // 反向自验：不能出现「先 caches.match 命中就直接返回、命中才 fetch」的 cache-first 壳逻辑。
  // 我们的实现是先 fetch、catch 才 match，所以 fetch 应出现在 respondWith 主路径。
  assert.ok(/await fetch\(request\b/.test(src), 'network-first 必须先 await fetch');
});

test('network-first 真回源：SW 的 fetch 带 networkCacheMode（no-cache），不吃 Pages max-age=600 的 HTTP 缓存', () => {
  // 2026-10-09 真机「没啥变化」：裸 fetch(request) 走默认缓存模式，部署后 10 分钟内 SW 拿到的仍是旧壳。
  assert.equal(networkCacheMode({ cache: 'default' }), 'no-cache');
  assert.equal(networkCacheMode({}), 'no-cache');
  assert.equal(networkCacheMode({ cache: 'reload' }), 'reload');   // detectNewBuild / 手动更新的强制回源照旧
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(/await fetch\(request,\s*\{\s*cache:\s*networkCacheMode\(request\)\s*\}\)/.test(src),
    'networkFirst 里的 fetch 必须带 cache: networkCacheMode(request)');
});

test('SW_VERSION 已为本次应用壳改动升到 v5（旧 menxia-shell-v4 在 activate 时被清）', () => {
  assert.equal(SW_VERSION, 'v5');
  assert.equal(cacheName(), 'menxia-shell-v5');
});

test('updateUrl：保留折号/篇/锚，只加时间戳 _v；重复点击覆盖而不叠加', () => {
  const href = `${SELF}/menxia/?repo=a%2Fb&pr=12&path=docs%2Fx.md#sec-3`;
  const u = new URL(updateUrl(href, 111));
  assert.equal(u.searchParams.get('pr'), '12');
  assert.equal(u.searchParams.get('repo'), 'a/b');
  assert.equal(u.searchParams.get('path'), 'docs/x.md');
  assert.equal(u.searchParams.get('_v'), '111');
  assert.equal(u.hash, '#sec-3');
  const again = new URL(updateUrl(u.href, 222));
  assert.deepEqual(again.searchParams.getAll('_v'), ['222']);
});

test('hardUpdate 只清 SW 与 menxia-shell-* 缓存：不碰 IndexedDB 离线库、不碰 localStorage 凭据/设置', () => {
  const reg = readFileSync(join(ROOT, 'src/sw-register.js'), 'utf8');
  const body = /export async function hardUpdate[\s\S]*?\n}\n/.exec(reg)?.[0] || '';
  assert.ok(body, '没找到 hardUpdate');
  assert.ok(/unregisterAll\(\)/.test(body), '要先拆 SW + 清壳缓存');
  assert.ok(/cache:\s*'reload'/.test(body), '要把应用壳源文件强制回源（子模块 URL 无版本号）');
  assert.ok(/location\.replace\(updateUrl\(location\.href\)\)/.test(body), '要带时间戳原地重载');
  const code = reg.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // 注释里写「不碰 IndexedDB」不算
  assert.ok(!/indexedDB|localStorage|sessionStorage|deleteDatabase|\.clear\(/.test(code), 'sw-register.js 不许碰 IndexedDB / localStorage');
});
