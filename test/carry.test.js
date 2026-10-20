// F12 携卷组装函数：批注按文档位置排序、双语对只带一篇、文档正文里的 ``` 围栏不破碎。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleCarry } from '../src/carry.js';
import { parseCommentBody } from '../src/anchor.js';

const basePr = { number: 42, title: '某折', url: 'https://github.com/x/review/pull/42', body: '' };
const call = (over) => assembleCarry({
  pr: basePr, assembledAt: '2026-07-31 10:00', parseCommentBody, ...over,
});

// 造一条 inline 批注串（根 + 可选回话）
const thread = (path, line, quote, note, replies = []) => ({
  root: { id: `${path}:${line}`, path, line, body: `> ${quote}\n\n${note}`, user: { login: 'charlie' } },
  replies: replies.map((r, i) => ({ id: `r${i}`, body: r, user: { login: 'claude' } })),
});

test('头部带折号 / 标题 / PR 链接 / 深链 / 组装时间', () => {
  const md = call({ deepLink: 'https://menxia-reader.github.io/menxia?pr=42' });
  assert.match(md, /# 携卷 · #42「某折」/);
  assert.match(md, /- 折号：#42/);
  assert.match(md, /- PR：https:\/\/github\.com\/x\/review\/pull\/42/);
  assert.match(md, /- 门下深链：https:\/\/menxia-reader\.github\.io\/menxia\?pr=42/);
  assert.match(md, /- 组装于：2026-07-31 10:00/);
});

// 双语对是互译，两份都塞进去等于让接手的 agent 为同一份内容付两遍 token
// （#76 实测：英文那份占整卷 48%）。只带偏好语言那篇，另一篇留一行路径可自取。
const pair = [
  { path: 'docs/a.md', lang: 'en', text: 'Hello world body.' },
  { path: 'docs/a.zh-CN.md', lang: 'zh', text: '中文正文内容。' },
];

test('双语对只带偏好语言那一篇，另一篇只留一行指路', () => {
  const md = call({ docs: pair, lang: 'zh' });
  assert.match(md, /### 文档：`docs\/a\.zh-CN\.md`（中文）/);
  assert.ok(md.includes('中文正文内容。'), '中文正文应原样带上');
  assert.ok(!md.includes('Hello world body.'), '英文正文不应进卷');
  assert.match(md, /另有一份 English 版：`docs\/a\.md`/, '被省的那篇要留下路径');
});

test('lang 缺省按中文（与阅读器 getLang 的默认一致）', () => {
  const md = call({ docs: pair });
  assert.ok(md.includes('中文正文内容。'));
  assert.ok(!md.includes('Hello world body.'));
});

test("lang='en' 时带英文那篇，指路行指向中文版", () => {
  const md = call({ docs: pair, lang: 'en' });
  assert.match(md, /### 文档：`docs\/a\.md`（English）/);
  assert.ok(md.includes('Hello world body.'), '英文正文应原样带上');
  assert.ok(!md.includes('中文正文内容。'), '中文正文不应进卷');
  assert.match(md, /另有一份 中文 版：`docs\/a\.zh-CN\.md`/);
});

test('单语文档原样带上，且不加指路行', () => {
  const docs = [{ path: 'docs/solo.md', lang: 'en', text: 'Only version.' }];
  const md = call({ docs });
  assert.match(md, /### 文档：`docs\/solo\.md`（English）/);
  assert.ok(md.includes('Only version.'));
  assert.ok(!md.includes('另有一份'), '没有兄弟篇就不该出现指路行');
});

test('文档正文里的 ``` 围栏不破碎（用分隔线包，不套外层围栏）', () => {
  const docWithFence = [
    '# 标题',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '正文续。',
  ].join('\n');
  const md = call({ docs: [{ path: 'docs/f.md', lang: 'zh', text: docWithFence }] });
  // 原样保留：三反引号的 js 围栏一字不动地出现在输出里
  assert.ok(md.includes('```js\nconst x = 1;\n```'), '文档自带围栏应原样保留');
  // 外层不得是 ``` 围栏（那会与内层撞车）——用分隔线界定
  assert.ok(md.includes('─'.repeat(60)), '文档正文应由分隔线界定');
  // 分隔线成对出现（每篇正文前后各一条）
  const ruleCount = (md.match(new RegExp('─'.repeat(60), 'g')) || []).length;
  assert.equal(ruleCount, 2, '一篇文档应有前后两条分隔线');
});

test('批注按文档位置排序：先按文档出现序分组，组内按行号升序', () => {
  const docs = [
    { path: 'docs/first.md', lang: 'zh', text: 'a' },
    { path: 'docs/second.md', lang: 'zh', text: 'b' },
  ];
  const threads = [
    thread('docs/second.md', 5, 'q-second-5', 'note-second-5'),
    thread('docs/first.md', 20, 'q-first-20', 'note-first-20'),
    thread('docs/first.md', 3, 'q-first-3', 'note-first-3'),
  ];
  const md = call({ docs, threads });
  const iFirst3 = md.indexOf('note-first-3');
  const iFirst20 = md.indexOf('note-first-20');
  const iSecond5 = md.indexOf('note-second-5');
  assert.ok(iFirst3 > 0 && iFirst20 > 0 && iSecond5 > 0, '三条批注都应出现');
  assert.ok(iFirst3 < iFirst20, 'first.md 内：行 3 排在行 20 前');
  assert.ok(iFirst20 < iSecond5, 'first.md（先出现）整组排在 second.md 前');
  // 分组标题
  assert.match(md, /### 针对 `docs\/first\.md`/);
  assert.match(md, /### 针对 `docs\/second\.md`/);
});

test('批注带引句、行号、回话，回话按传入序全带上', () => {
  const docs = [{ path: 'docs/a.md', lang: 'zh', text: 'x' }];
  const threads = [thread('docs/a.md', 7, '被批的原句', '这里要改', ['第一条回话', '第二条回话'])];
  const md = call({ docs, threads });
  assert.match(md, /第 7 行/);
  assert.match(md, /> 引句：被批的原句/);
  assert.ok(md.includes('这里要改'), '批语正文应带上');
  assert.ok(md.includes('第一条回话') && md.includes('第二条回话'), '两条回话都应带上');
  assert.ok(md.indexOf('第一条回话') < md.indexOf('第二条回话'), '回话保持传入序');
});

test('锚不到行的批注（line=null，旧版漂移）沉到组末尾并标注', () => {
  const docs = [{ path: 'docs/a.md', lang: 'zh', text: 'x' }];
  const outdated = {
    root: { id: 'o', path: 'docs/a.md', line: null, original_line: 9, body: '> old\n\nstale-note', user: { login: 'c' } },
    replies: [],
  };
  const threads = [outdated, thread('docs/a.md', 2, 'fresh', 'fresh-note')];
  const md = call({ docs, threads });
  assert.ok(md.indexOf('fresh-note') < md.indexOf('stale-note'), '有效行批注排在漂移批注前');
  assert.match(md, /旧版，已漂移/);
});

test('不属于任何已知文档的批注归入「未定位 / 其他文档」', () => {
  const docs = [{ path: 'docs/a.md', lang: 'zh', text: 'x' }];
  const stray = thread('docs/ghost.md', 1, 'g', 'ghost-note');
  const md = call({ docs, threads: [stray] });
  assert.match(md, /### 未定位 \/ 其他文档/);
  assert.ok(md.includes('ghost-note'));
});

test('判（整折总评）汇总，最新在前', () => {
  const zongpis = [
    { id: 1, body: '早的判', user: { login: 'c' }, created_at: '2026-07-30T00:00:00Z' },
    { id: 2, body: '晚的判', user: { login: 'c' }, created_at: '2026-07-31T00:00:00Z' },
  ];
  const md = call({ zongpis });
  assert.match(md, /## 判（整折总评）/);
  assert.ok(md.indexOf('晚的判') < md.indexOf('早的判'), '判最新在前');
});

test('待决事项汇总在尾部（有「待你拍板」时）', () => {
  const md = call({ decisions: '1. 要不要上 X？\n2. Y 用哪个方案？' });
  assert.match(md, /## 待决事项（待你拍板）/);
  assert.ok(md.includes('要不要上 X？'));
  // 待决在正文与涂归之后（尾部）
  assert.ok(md.indexOf('## 待决事项') > md.indexOf('## 涂归线程'), '待决应在尾部');
});

test('空折（无文档 / 无批注）也产出结构完整、可读的 markdown', () => {
  const md = call({});
  assert.match(md, /# 携卷 · #42/);
  assert.match(md, /（此折无 markdown 正文。）/);
  assert.match(md, /（此折暂无划句批注。）/);
  assert.ok(md.endsWith('\n'));
});

test('PR body 原文（含围栏）也用分隔线包，不破碎', () => {
  const body = '## TLDR\n\n```\nsome fenced content\n```';
  const md = call({ pr: { ...basePr, body } });
  assert.match(md, /## 折子说明（PR body 原文）/);
  assert.ok(md.includes('```\nsome fenced content\n```'), 'body 自带围栏原样保留');
});
