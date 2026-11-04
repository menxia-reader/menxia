// BUILD_FILES 登记完整性。
//
// 由来：`ui.js` 的 `detectNewBuild()` 拿一张**手写清单**里的文件算指纹，变了才提示「有新版」。
// 漏登记一个文件，改了它就不算新版本——Pages 发 max-age=600 且模块 URL 无版本号，
// 于是手机上会一直跑旧代码，而**读者无从判断新旧**（这正是这个机制存在的理由，漏登记就是它自己失效）。
// 那行注释里已经记了一次前科（子组件拆出去后漏登记，改 cards.js 不触发提示）；
// 2026-08-06 又栽一次：新增的 `slug.js` / `scroll-ends.js` 两个文件都没登记。
// 清单式配置随代码增长而腐烂——所以别再靠人记得，让它自己对账。
//
// 读源码文本而不是 import ui.js：那个模块顶层就要 preact / window，node 里拉不起来。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 把 src/ 下所有 .js/.css 递归列出来，转成 `src/xxx` 形态（与清单里的写法一致）
function sourceFiles(dir = 'src') {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.(js|css)$/.test(e.name) ? [rel] : [];
  });
}

test('BUILD_FILES 登记了 src/ 下每一个源文件（漏一个＝改了它不提示新版，手机上永远跑旧代码）', () => {
  const ui = readFileSync(join(ROOT, 'src/ui.js'), 'utf8');
  const block = /const BUILD_FILES = \[([\s\S]*?)\];/.exec(ui);
  assert.ok(block, '没找到 BUILD_FILES —— 它被改名或删了，这条测试要跟着改');
  const listed = new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const missing = sourceFiles().filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `这些源文件没登记进 BUILD_FILES：${missing.join(', ')}`);
});

test('BUILD_FILES 里没有已删除的僵尸条目（fetch 失败会让整次检测静默返回 false）', () => {
  const ui = readFileSync(join(ROOT, 'src/ui.js'), 'utf8');
  const listed = [...(/const BUILD_FILES = \[([\s\S]*?)\];/.exec(ui)?.[1] || '').matchAll(/'([^']+)'/g)]
    .map((m) => m[1]);
  const onDisk = new Set([...sourceFiles(), 'index.html', 'sandbox.html']);
  assert.deepEqual(listed.filter((f) => !onDisk.has(f)), []);
});

// review M7：mermaid 沙箱壳与它的 vendor 脚本不在 src/ 下，上面那条对账抓不到——单独钉住。
test('sandbox.html 进 BUILD_FILES（只改它也提示新版）、vendor/mermaid.min.js 进 VENDOR_FILES（强制更新会重取）', () => {
  const ui = readFileSync(join(ROOT, 'src/ui.js'), 'utf8');
  const list = (name) => new Set([...(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(ui)?.[1] || '')
    .matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.ok(list('BUILD_FILES').has('sandbox.html'));
  const vendor = list('VENDOR_FILES');
  assert.ok(vendor.has('vendor/mermaid.min.js'));
  // 清单里每个 vendor 文件都得真在盘上（同上：fetch 404 会让更新流程半途而废）
  for (const f of vendor) assert.ok(readdirSync(join(ROOT, 'vendor')).includes(f.replace('vendor/', '')), f);
});
