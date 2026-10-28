// golden 守门（review #182 N0）：原生阅读器（menxia-ios）以 test/golden/expected/** 为唯一一致性依据。
// 这里用现行 web 代码重新生成一遍，与已提交的文件逐字节比对——
// web 的渲染/锚定规则一变，这里就红：要么改回，要么有意变更后跑 `node test/golden/export.mjs`
// 重生 golden、更新 docs/ANCHOR-SPEC.md，并在 PR 里标「原生需跟进」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const { buildGolden } = await import('./golden/export.mjs');
const fresh = buildGolden();

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [relative(here, p)];
});

test('golden：语料 20–31 篇', () => {
  const n = readdirSync(join(here, 'corpus')).filter((f) => f.endsWith('.md')).length;
  assert.ok(n >= 20 && n <= 31, `语料 ${n} 篇`);
});

test('golden：已提交的 expected/ 与 manifest 不多不少', () => {
  const onDisk = [...walk(join(here, 'expected')), 'manifest.json'].sort();
  assert.deepEqual(onDisk, [...fresh.keys()].sort(), '有多出或缺失的 golden 文件——跑 node test/golden/export.mjs 重生');
});

for (const [rel, body] of fresh) {
  test(`golden 逐字一致：${rel}`, () => {
    const committed = readFileSync(join(here, rel), 'utf8');
    if (committed === body) return;
    // 不一致时只报第一处差异的上下文，别把几百 KB 的 JSON 整个倒进输出
    let i = 0;
    while (i < committed.length && committed[i] === body[i]) i++;
    const line = committed.slice(0, i).split('\n').length;
    assert.fail(`${rel} 第 ${line} 行起与现行 web 规则不一致：\n  已提交：${JSON.stringify(committed.slice(i, i + 120))}\n  现生成：${JSON.stringify(body.slice(i, i + 120))}`);
  });
}

test('golden：每个块都有正整数行号且 lineEnd ≥ line', () => {
  for (const [rel, body] of fresh) {
    if (!rel.endsWith('.blocks.json')) continue;
    for (const b of JSON.parse(body).blocks) {
      assert.ok(Number.isInteger(b.line) && b.line >= 1, `${rel} #${b.i} line=${b.line}`);
      assert.ok(b.lineEnd >= b.line, `${rel} #${b.i} lineEnd=${b.lineEnd} < line=${b.line}`);
      assert.ok(!b.type.startsWith('unknown'), `${rel} #${b.i} 出现未知块类型 ${b.type}`);
    }
  }
});
