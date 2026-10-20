// 组件级测试 —— 拆出子组件后才可能做的一层。
// 由来：第七轮评审在 sidebar 的 Escape 分支抓到一个「字符串替换漏网」的 ReferenceError，
// 三层测试全绿照样放行（test/ 里 Escape 零命中）。拆分让「直接 import 组件、取出
// 事件处理器喂事件」变得可行，这就是那一刀换来的能力。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 组件模块会 import vendored preact；node 里没有 DOM，但 preact 本身 import 期不碰 document。
const { Topbar } = await import('../src/components/topbar.js');
// zongpi-shown / sidebar（F1 起接了 folder-body）走 render.js，那个模块 import 期就要
// window.markdownit——node 里补个桩即可，
// 本组件测试只关心「折不折 / 排序 / 摘要」，不验 markdown 引擎本身（那由冒烟层的真浏览器覆盖）。
// 桩必须和生产一样严：markdown-it 对非字符串是直接抛（Input data should be a String），
// 桩要是更宽容（返回 '<p>null</p>'），就会系统性掩盖「传了 null 进去整个 app 白屏」那一类 bug。
globalThis.window = {
  markdownit: () => ({
    renderer: { rules: {} },
    // render.js 模块顶层要挂双链 inline rule；桩缺这一层，整个文件 import 就炸。
    // 空实现而非真规则：本文件不测渲染管线，那归 render-safety.test.js（它跑真 markdown-it）。
    // 补形状、不补行为——补行为才会变成上面警告的那种「更宽容的桩」。
    inline: { ruler: { before: () => {} } },
    render: (t) => {
      if (typeof t !== 'string') throw new TypeError('Input data should be a String');
      return `<p>${t}</p>`;
    },
  }),
};
const { Sidebar } = await import('../src/components/sidebar.js');
const { ZongpiShown, summarize } = await import('../src/components/zongpi-shown.js');
const { OtherThreads } = await import('../src/components/other-threads.js');
const { FolderBody, parseFolderBody, hasDecisions, folderSummary } = await import('../src/components/folder-body.js');
const { CommentBody } = await import('../src/components/comment-body.js');

// 在 vnode 树里按谓词找第一个节点
function find(vnode, pred) {
  if (!vnode || typeof vnode !== 'object') return null;
  if (Array.isArray(vnode)) {
    for (const v of vnode) { const hit = find(v, pred); if (hit) return hit; }
    return null;
  }
  if (pred(vnode)) return vnode;
  return find(vnode.props?.children, pred);
}
const byClass = (cls) => (v) => typeof v.props?.class === 'string' && v.props.class.split(' ').includes(cls);

test('搜索框：Enter 触发搜索、Escape 清空——两个分支都不能悬空引用', () => {
  const calls = [];
  const tree = Sidebar({
    q: '涂归', hits: null, searching: '', prs: [], donePrs: [], tab: 'open', cur: null,
    demo: false, timeAgo: () => '刚刚',
    onQuery: () => calls.push('query'), onSearch: () => calls.push('search'),
    onClearSearch: () => calls.push('clear'), onJumpToHit: () => {}, onTab: () => {},
    onOpenPR: () => {}, onSettings: () => {},
  });
  const input = find(tree, byClass('search-input'));
  assert.ok(input, '应渲染出搜索框');
  assert.doesNotThrow(() => input.props.onKeyDown({ key: 'Enter' }), 'Enter 分支不得抛错');
  assert.doesNotThrow(() => input.props.onKeyDown({ key: 'Escape' }), 'Escape 分支不得抛错（曾是 ReferenceError）');
  assert.deepEqual(calls, ['search', 'clear']);
});

test('侧栏：demo 模式隐藏「设置 · 钥匙」（否则会清掉真钥匙）', () => {
  const base = {
    q: '', hits: null, searching: '', prs: [], donePrs: [], tab: 'open', cur: null,
    timeAgo: () => '', onQuery: () => {}, onSearch: () => {}, onClearSearch: () => {},
    onJumpToHit: () => {}, onTab: () => {}, onOpenPR: () => {}, onSettings: () => {},
  };
  assert.equal(find(Sidebar({ ...base, demo: true }), byClass('settings')), null);
  assert.ok(find(Sidebar({ ...base, demo: false }), byClass('settings')));
});

test('顶栏：旧版下提交按钮禁用；归档折不出画可但保留判', () => {
  const base = {
    cur: { pr: { number: 1, title: 'x' } }, busy: false, draftCount: 2,
    happyUrl: null, stale: false, notice: '',
    onRefresh: () => {}, onCopyRef: () => {}, onZongpi: () => {}, onSubmit: () => {}, onQinci: () => {},
  };
  const onOld = Topbar({ ...base, archived: false, onHead: false });
  assert.equal(find(onOld, byClass('btn-submit')).props.disabled, true, '旧版必须禁提交');

  const archived = Topbar({ ...base, archived: true, onHead: true });
  assert.equal(find(archived, byClass('btn-qinci')), null, '归档折不该出画可');
  const zongpi = find(archived, (v) => v.props?.children === '判');
  assert.ok(zongpi, '归档折仍要能留判（GitHub 允许在 merged PR 上评论）');
});

// 面包屑根词要跟折的实际归属走（2026-08-18：#88 是读物折，面包屑却写「待审」，
// 人去待审清单里找不到它）。判据与侧栏分流同一套：archived → 已画可；isShelved → 读毕书架。
test('顶栏：面包屑根词跟折的归属走——读物折显读毕书架、画可折显已画可、等你的读物仍显待审', () => {
  const base = {
    busy: false, draftCount: 0, happyUrl: null, stale: false, notice: '',
    onRefresh: () => {}, onCopyRef: () => {}, onZongpi: () => {}, onSubmit: () => {}, onQinci: () => {},
  };
  const rootOf = (v) => find(v, byClass('crumb')).props.children.flat(9).filter((c) => typeof c === 'string').join('');
  const pr = (labels) => ({ number: 88, title: 'x', labels });

  assert.match(rootOf(Topbar({ ...base, archived: false, onHead: true, cur: { pr: pr(['kind:读物', 'wait:闲']) } })), /^读毕书架/);
  assert.match(rootOf(Topbar({ ...base, archived: true, onHead: true, cur: { pr: pr(['kind:读物', 'wait:闲']) } })), /^已画可/);
  assert.match(rootOf(Topbar({ ...base, archived: false, onHead: true, cur: { pr: pr(['kind:参考', 'wait:你读']) } })), /^待审/);
  // 等你的读物不藏进书架（track.js 的 NEEDS_YOU 阀），面包屑也要一致
  assert.match(rootOf(Topbar({ ...base, archived: false, onHead: true, cur: { pr: pr(['kind:读物', 'wait:你读']) } })), /^待审/);
  // 没选折时保持原样
  assert.match(rootOf(Topbar({ ...base, archived: false, onHead: false, cur: null })), /^待审/);
});

// issue #1：已呈判全展开挡在正文前（PR #30 实测 9 条 / 8,132 字 ≈ 2–3 屏）
const ZS = [
  { id: 1, created_at: '2026-07-20T00:00:00Z', user: { login: 'a' }, body: '最旧的一条' },
  { id: 2, created_at: '2026-07-28T00:00:00Z', user: { login: 'b' }, body: '## v8 定稿 —— 锁定租客版\n\n正文。' },
  { id: 3, created_at: '2026-07-24T00:00:00Z', user: { login: 'c' }, body: '中间那条' },
];

test('已呈判：默认折叠，头上带条数 + 最新一条摘要', () => {
  const collapsed = ZongpiShown({ zongpis: ZS, open: false, onToggle: () => {} });
  assert.equal(find(collapsed, byClass('zongpi-shown-item')), null, '收起态不得渲染任何条目');
  const label = find(collapsed, byClass('zongpi-shown-toggle')).props.children.flat(9).join('');
  assert.match(label, /▸/);
  assert.match(label, /已呈判 · 3/);
  assert.match(label, /最新：v8 定稿 —— 锁定租客版/, '摘要取最新一条并剥掉 markdown 装饰');
});

test('已呈判：展开后按时间倒序，最新的在最上面（GitHub 返的是正序）', () => {
  const open = ZongpiShown({ zongpis: ZS, open: true, onToggle: () => {} });
  const list = find(open, byClass('zongpi-shown-list'));
  assert.deepEqual(list.props.children.map((v) => v.key), ['z2', 'z3', 'z1']);
});

test('已呈判：零条不占位；点击头走 onToggle', () => {
  assert.equal(ZongpiShown({ zongpis: [], open: false, onToggle: () => {} }), null);
  let toggled = 0;
  const tree = ZongpiShown({ zongpis: ZS, open: false, onToggle: () => { toggled++; } });
  find(tree, byClass('zongpi-shown-toggle')).props.onClick();
  assert.equal(toggled, 1);
});

test('摘要：跳过 fence / 分隔线 / 表格行，超长截断', () => {
  assert.equal(summarize('```js\nconst a = 1;\n```\n\n真正的首句'), '真正的首句');
  assert.equal(summarize('---\n\n> 引用起头的一句'), '引用起头的一句');
  assert.equal(summarize('1. 列表起头'), '列表起头');
  assert.equal(summarize('**加粗** 的开头'), '加粗 的开头');
  assert.equal(summarize('啊'.repeat(40)), '啊'.repeat(30) + '…');
  assert.equal(summarize(''), '');
});

// 以下四条全是评审用真实输入打出来的洞——良构输入的用例一条都盖不住
test('摘要：围栏没闭合也不能空手而归（空摘要 = 折叠头没信息量 = 回到 issue #1）', () => {
  assert.equal(summarize('```js\nconst a = 1;\nmore code'), 'const a = 1;', '未闭合围栏');
  assert.equal(summarize('````\ntext\n```\n````\n\n真首句'), 'text', '嵌套围栏配对错乱');
  assert.equal(summarize('```\nx\n```'), 'x', '通篇只有代码');
});

test('摘要：按 code point 截断，不把 emoji 劈成半个', () => {
  // 关键是垫奇数个 BMP 字符——纯 emoji 每个占 2 code unit，30 是偶数正好切齐，自测不出问题
  const out = summarize('a' + '😀'.repeat(40));
  assert.ok(out.isWellFormed(), `切出了孤立代理对：${JSON.stringify(out)}`);
  assert.equal([...out].length, 31, '30 个 code point + 省略号');
});

test('摘要：剥掉控制符 / bidi 覆写（U+202E 能把整行显示方向翻过来）', () => {
  assert.equal(summarize('正常‮被翻转'), '正常被翻转');
  assert.equal(summarize('\x00\x07'), '');
});

test('已呈判：body 为 null 不能把整个 app 渲染炸掉', () => {
  // 改动前这里是 Preact 文本节点（null 渲染成空，无害）；改成 dangerouslySetInnerHTML 之后，
  // markdown-it 对非字符串直接抛，抛在组件里没有 error boundary 就是整个 #root 卸空。
  const bad = [{ id: 1, created_at: '2026-07-20T00:00:00Z', user: { login: 'a' }, body: null }];
  assert.doesNotThrow(() => ZongpiShown({ zongpis: bad, open: true, onToggle: () => {} }));
});

// 两个折叠组是同一个交互模式的两份实现，最容易一个改了另一个忘（#1 就是这么弄出不一致的）。
// 这条把它们钉在一起测：只补一个、或将来又拆出第三个折叠组时，都要在这里现形。
test('折叠组：两个 toggle 都要有 aria-expanded，且随展开态变化（#5）', () => {
  const cases = [
    ['已呈判', (open) => ZongpiShown({ zongpis: ZS, open, onToggle: () => {} }), 'zongpi-shown-toggle'],
    ['其他 N 串', (open) => OtherThreads({
      threads: [{ root: { id: 9, body: '正文', user: { login: 'a' }, path: 'docs/x.md' }, replies: [] }],
      open,
      onToggle: () => {},
    }), 'other-threads-toggle'],
    ['折子说明', (open) => FolderBody({ body: FIVE_SECTION_BODY, open, onToggle: () => {} }), 'folder-body-toggle'],
  ];
  for (const [label, build, cls] of cases) {
    for (const open of [true, false]) {
      const btn = find(build(open), byClass(cls));
      assert.ok(btn, `${label}：应渲染出折叠钮`);
      assert.equal(btn.props['aria-expanded'], open, `${label}（open=${open}）的 aria-expanded 要跟着变`);
    }
  }
});

test('已呈判：带时区偏移 / 毫秒的时间戳也要排对（字符串序会静默排反）', () => {
  const mixed = [
    { id: 1, created_at: '2026-07-28T23:00:00Z', user: {}, body: '早' },
    { id: 2, created_at: '2026-07-29T07:30:00+09:00', user: {}, body: '更早' }, // = 22:30Z
  ];
  const list = find(ZongpiShown({ zongpis: mixed, open: true, onToggle: () => {} }), byClass('zongpi-shown-list'));
  assert.deepEqual(list.props.children.map((v) => v.key), ['z1', 'z2'], '23:00Z 晚于 22:30Z');
});

// ── 体例检查角标（2026-07-31 加）──
//
// 角标要**只在有话说的时候出现**。老折（CI 装上之前的）没有检查，
// 一排灰点是噪音；`unreadable` 更不能逐折画 —— 那是钥匙配置问题，
// 出一条通知就够了，19 张卡同时打问号会把真信号淹掉。
test('折卡角标：只有 fail / running / pass 画，none 与 unreadable 不画', () => {
  const base = {
    q: '', hits: null, searching: '', tab: 'open', cur: null, demo: false,
    donePrs: [], timeAgo: () => '刚刚',
    onQuery: () => {}, onSearch: () => {}, onClearSearch: () => {}, onJumpToHit: () => {},
    onTab: () => {}, onOpenPR: () => {}, onSettings: () => {},
  };
  const pr = (n) => ({ number: n, title: 't' + n, updated_at: '2026-07-31T00:00:00Z' });
  const tree = Sidebar({
    ...base,
    prs: [pr(1), pr(2), pr(3), pr(4), pr(5)],
    checks: {
      1: { state: 'fail', name: '九条规则' },
      2: { state: 'running' },
      3: { state: 'pass' },
      4: { state: 'none' },
      5: { state: 'unreadable' },
    },
  });
  const all = [];
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v.props?.class === 'string' && v.props.class.startsWith('chk')) all.push(v.props.class);
    walk(v.props?.children);
  })(tree);
  assert.deepEqual(all.sort(), ['chk chk-bad', 'chk chk-ok', 'chk chk-run'],
    'none 与 unreadable 不该画出角标');
});

test('折卡角标：已画可的折不画（CI 只在 open 折上跑）', () => {
  const tree = Sidebar({
    q: '', hits: null, searching: '', tab: 'done', cur: null, demo: false, prs: [],
    donePrs: [{ number: 9, title: 'merged', merged_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z' }],
    timeAgo: () => '昨天', checks: { 9: { state: 'fail' } },
    onQuery: () => {}, onSearch: () => {}, onClearSearch: () => {}, onJumpToHit: () => {},
    onTab: () => {}, onOpenPR: () => {}, onSettings: () => {},
  });
  let found = false;
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v.props?.class === 'string' && v.props.class.startsWith('chk')) found = true;
    walk(v.props?.children);
  })(tree);
  assert.equal(found, false, '已画可的折不该有体例角标');
});

// ── 折子说明：PR body 的五段（issue #13，2026-07-31 加）──
//
// 逐字照写入侧 `menxia-mcp/src/body.ts` 的 buildBody 产物摆：`## 段名` + 空行 + 段正文，
// 段间空行相连，尾巴一行「回奏对」标记。对着 review #43 / #49 / #55 的真 body 核过。
const FIVE_SECTION_BODY = `## 目的地

merge 后作为实现依据。不对外发布。

## 直达链

[渲染版](https://menxia-reader.github.io/menxia/?pr=43)

## TLDR

一句话说清这折干了什么。

## 待你拍板

1. 第一个要你决定的事
2. 第二个要你决定的事

## 怎么用

逐篇批。批完说「读批注」。

<!-- happy-session: cms7to0mrdy6cwc0u6md6o9gy -->
`;

test('折子说明：五段全在时切得出段，「待你拍板」认得出并数得对条数', () => {
  const p = parseFolderBody(FIVE_SECTION_BODY);
  assert.deepEqual([...p.sections.keys()], ['目的地', '直达链', 'TLDR', '待你拍板', '怎么用']);
  assert.match(p.decisions, /第一个要你决定的事/);
  assert.equal(p.decisionCount, 2);
  assert.equal(hasDecisions(FIVE_SECTION_BODY), true);
});

test('折子说明：「回奏对」标记不许露脸（html:false 是把注释转义成可见文本，不是丢掉）', () => {
  const p = parseFolderBody(FIVE_SECTION_BODY);
  assert.ok(!p.text.includes('happy-session'), `标记没剥干净：${p.text.slice(-60)}`);
  // 只剥这一种注释：正文里当资料引用的注释不该被连坐吃掉
  assert.match(parseFolderBody('正文\n\n<!-- 这条要留着 -->').text, /这条要留着/);
});

test('折子说明：缺「待你拍板」的折默认收起（条件展开的另一半）', () => {
  const noDecisions = FIVE_SECTION_BODY.replace(/## 待你拍板[\s\S]*?(?=## 怎么用)/, '');
  const p = parseFolderBody(noDecisions);
  assert.equal(p.decisions, null);
  assert.equal(hasDecisions(noDecisions), false);
  assert.ok(p.text.includes('## TLDR'), '其余段照旧要渲染，不能因为缺一段就整块不出');
});

test('折子说明：手开折（整篇散文、零个 ## 段）照样渲染，只是不判成有拍板点', () => {
  // review #7 的真实形态：全篇加粗小标题，一个 `##` 都没有
  const prose = '**性质**：读物快照。\n\n**TLDR**\n- 一条\n- 两条\n\n<!-- happy-session: cms0wmqzxynjiwc0u3lqohjbv -->';
  const p = parseFolderBody(prose);
  assert.equal(p.sections.size, 0);
  assert.equal(p.decisions, null);
  assert.match(p.text, /读物快照/, '认不出结构 ≠ 不给看');
  assert.ok(find(FolderBody({ body: prose, open: false, onToggle: () => {} }), byClass('folder-body-toggle')));
});

test('折子说明：body 为 null / 空 / 只有一行标记时整块不渲染，且绝不炸（#5 那次白屏）', () => {
  for (const bad of [null, undefined, '', '   \n\n  ', '<!-- happy-session: cms7to0mrdy6cwc0u6md6o9gy -->']) {
    assert.equal(parseFolderBody(bad), null, `parse(${JSON.stringify(bad)}) 应为 null`);
    assert.equal(FolderBody({ body: bad, open: true, onToggle: () => {} }), null,
      `FolderBody(${JSON.stringify(bad)}) 应整块不渲染`);
  }
  // markdown-it 对非字符串直接抛，抛在渲染里就是整个 #root 卸空——非字符串输入也要接住
  assert.doesNotThrow(() => FolderBody({ body: 42, open: true, onToggle: () => {} }));
  assert.doesNotThrow(() => FolderBody({ body: { nope: 1 }, open: true, onToggle: () => {} }));
});

test('折子说明：围栏里的 `## 待你拍板` 不是段（认错一次 = 默认展开态判反，且没人会发现）', () => {
  const body = '## TLDR\n\n给个例子：\n\n```md\n## 待你拍板\n\n1. 假的\n```\n\n完。';
  const p = parseFolderBody(body);
  assert.deepEqual([...p.sections.keys()], ['TLDR']);
  assert.equal(p.decisions, null);
  // 条数也要认围栏：代码示例里的 `- foo` 不是拍板点
  const fenced = parseFolderBody('## 待你拍板\n\n只有散文，没有编号。\n\n```sh\n- 这不是拍板点\n```');
  assert.equal(fenced.decisionCount, 0, '数不出来就不显示条数，绝不编一个');
});

test('折子说明：收起态不渲染正文；展开态走 CommentBody（唯一那条渲染路径）', () => {
  const collapsed = FolderBody({ body: FIVE_SECTION_BODY, open: false, onToggle: () => {} });
  assert.equal(find(collapsed, byClass('folder-body-text')), null, '收起态不得渲染正文');
  const label = find(collapsed, byClass('folder-body-toggle')).props.children.flat(9).join('');
  assert.match(label, /▸/);
  assert.match(label, /折子说明（待你拍板 · 2 条）/, '标题上要点明有几条拍板点');

  const open = FolderBody({ body: FIVE_SECTION_BODY, open: true, onToggle: () => {} });
  const inner = find(open, (v) => typeof v.props?.cls === 'string' && v.props.cls.includes('folder-body-text'));
  assert.ok(inner, '展开态应挂出正文');
  assert.equal(inner.type, CommentBody, '必须复用 CommentBody，不许另开一个 dangerouslySetInnerHTML');
});

// ── F1 · 摘要卡（2026-07-31）：TLDR + 待你拍板 渲成折首常显行 + 清单每折一句 gist ──

test('F1 摘要：parseFolderBody 顺带切出 TLDR 段（复用已有 sections，不新加解析）', () => {
  const p = parseFolderBody(FIVE_SECTION_BODY);
  assert.equal(p.tldr, '一句话说清这折干了什么。');
});

test('F1 摘要：folderSummary 给标准五段 body 出 gist + 拍板条数', () => {
  const s = folderSummary(FIVE_SECTION_BODY);
  assert.equal(s.tldr, '一句话说清这折干了什么。');
  assert.equal(s.decisionCount, 2);
});

test('F1 摘要：缺段优雅降级——只有 TLDR 没拍板点，只出 gist；只有拍板点没 TLDR，只出条数', () => {
  const onlyTldr = '## TLDR\n\n就一句话。\n\n## 怎么用\n\n随便。';
  const s1 = folderSummary(onlyTldr);
  assert.equal(s1.tldr, '就一句话。');
  assert.equal(s1.decisionCount, 0);

  const onlyDecisions = '## 待你拍板\n\n1. 甲\n2. 乙\n3. 丙';
  const s2 = folderSummary(onlyDecisions);
  assert.equal(s2.tldr, '');
  assert.equal(s2.decisionCount, 3);
});

test('F1 摘要：段乱序不影响——TLDR 排在拍板点之后照样各归各位', () => {
  // 写入侧模板顺序是 目的地/直达链/TLDR/待你拍板/怎么用；这里把 TLDR 故意挪到最后
  const scrambled = '## 待你拍板\n\n1. 只一条\n\n## 目的地\n\n随便\n\n## TLDR\n\n倒着放也认得出。';
  const s = folderSummary(scrambled);
  assert.equal(s.tldr, '倒着放也认得出。');
  assert.equal(s.decisionCount, 1);
});

test('F1 摘要：空 / null / 无内容 body 一律返回 null（清单整行不画，不白屏、不占位）', () => {
  for (const bad of [null, undefined, '', '   \n\n  ', '<!-- happy-session: cms7to0mrdy6cwc0u6md6o9gy -->']) {
    assert.equal(folderSummary(bad), null, `folderSummary(${JSON.stringify(bad)}) 应为 null`);
  }
  // 手开折（散文、零 ## 段）：既没 TLDR 段也没拍板点 → 清单不添摘要行（保持原样）
  assert.equal(folderSummary('**性质**：读物快照。\n\n随便写点。'), null);
  // 非字符串也不炸
  assert.doesNotThrow(() => folderSummary(42));
});

test('F1 摘要：gist 抽成纯文本——去 markdown 记号、压多行为单行（清单里没有 CommentBody sink）', () => {
  const md = '## TLDR\n\n- **要点**：把 [链接](http://x) 里的 `code`\n  换行接着写';
  const s = folderSummary(md);
  assert.ok(!/[#>*`\[\]]/.test(s.tldr), `gist 不该带 markdown 记号：${s.tldr}`);
  assert.ok(!s.tldr.includes('\n'), 'gist 必须是单行');
  assert.match(s.tldr, /要点.*把.*链接.*里的 code.*换行接着写/);
});

test('P0 摘要：TLDR 里的表格 / 分隔线 / 围栏不漏进 gist（清单与折首常显行无 | # 原文）', () => {
  const md = '## TLDR\n\n先说结论。\n\n| 段 | 之前 | 之后 |\n|---|---|---|\n| 待你拍板 | 看不见 | 折首默认展开 |\n\n---\n\n```js\nconst a = 1;\n```\n\n### 小标题 尾句。';
  const s = folderSummary(md);
  assert.ok(!/[|#`]|---/.test(s.tldr), `gist 不该带表格/标题/围栏原文：${s.tldr}`);
  assert.match(s.tldr, /先说结论。.*小标题 尾句。/);
  const tldrLine = find(FolderBody({ body: md, open: false, onToggle: () => {} }), byClass('folder-body-tldr'));
  assert.ok(!/[|#`]/.test(tldrLine.props.children), `折首常显行同样要干净：${tldrLine.props.children}`);
});

test('F1 摘要：折首块把 TLDR 那句常显（收起态也在），不必展开就看得见', () => {
  const collapsed = FolderBody({ body: FIVE_SECTION_BODY, open: false, onToggle: () => {} });
  const tldrLine = find(collapsed, byClass('folder-body-tldr'));
  assert.ok(tldrLine, '收起态也应有 TLDR 常显行');
  assert.equal(tldrLine.props.children, '一句话说清这折干了什么。');
  // 没 TLDR 段的 body：常显行不出（不硬占一行空白）
  const noTldr = '## 待你拍板\n\n1. 甲';
  assert.equal(find(FolderBody({ body: noTldr, open: false, onToggle: () => {} }), byClass('folder-body-tldr')), null);
});

test('F1 摘要：清单卡带上 gist + 拍板角标；无摘要的折不画摘要行', () => {
  const withSummary = { number: 43, title: '有摘要', body: FIVE_SECTION_BODY, updated_at: new Date().toISOString() };
  const plain = { number: 7, title: '手开折', body: '**性质**：读物快照。', updated_at: new Date().toISOString() };
  const tree = Sidebar({
    q: '', hits: null, searching: '', prs: [withSummary, plain], donePrs: [], tab: 'open', cur: null,
    demo: false, timeAgo: () => '刚刚',
    onQuery() {}, onSearch() {}, onClearSearch() {}, onJumpToHit() {},
    onTab() {}, onOpenPR() {}, onSettings() {},
  });
  const summaries = [];
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (byClass('pr-summary')(v)) summaries.push(v);
    walk(v.props?.children);
  })(tree);
  assert.equal(summaries.length, 1, '只有带 TLDR/拍板点的折出摘要行');
  const flat = JSON.stringify(summaries[0]);
  assert.match(flat, /一句话说清这折干了什么/);
  assert.match(flat, /待你拍板 · 2 条/);
});

test('折卡角标：没传 checks 也不炸（老调用点 / demo 模式）', () => {
  assert.doesNotThrow(() => Sidebar({
    q: '', hits: null, searching: '', tab: 'open', cur: null, demo: true,
    prs: [{ number: 1, title: 't', updated_at: '2026-07-31T00:00:00Z' }], donePrs: [],
    timeAgo: () => '', onQuery: () => {}, onSearch: () => {}, onClearSearch: () => {},
    onJumpToHit: () => {}, onTab: () => {}, onOpenPR: () => {}, onSettings: () => {},
  }));
});

// ── 弘文馆（闲读书架，2026-08-02）──────────────────────────────────
const { splitShelf, kindOf, waitOf, isShelved } = await import('../src/track.js');

const labeled = (number, ...names) => ({
  number, title: 't' + number, updated_at: '2026-08-02T00:00:00Z',
  labels: names.map((name) => ({ name })),
});

test('折务 label 读侧：认前缀、缺标返 null、字符串形态也吃得下', () => {
  const pr = labeled(1, 'proj:menxia', 'kind:读物', 'wait:闲');
  assert.equal(kindOf(pr), '读物');
  assert.equal(waitOf(pr), '闲');
  assert.equal(kindOf({ number: 2 }), null, '没有 labels 字段不该炸');
  assert.equal(waitOf({ number: 2, labels: [] }), null);
  assert.equal(waitOf({ labels: ['wait:你拍'] }), '你拍', 'label 是裸字符串时也认');
});

test('splitShelf：只有 kind:读物 进书架，没标的一律留在待审', () => {
  const shelved = labeled(1, 'kind:读物', 'wait:闲');
  const waiting = labeled(2, 'kind:设计', 'wait:你拍');
  const bare = { number: 3, title: '老折没标' };
  const { desk, shelf } = splitShelf([shelved, waiting, bare]);
  assert.deepEqual(shelf.map((p) => p.number), [1]);
  assert.deepEqual(desk.map((p) => p.number), [2, 3], '漏标不该把折静默藏进书架');
  assert.equal(isShelved(bare), false);
  assert.deepEqual(splitShelf(undefined), { desk: [], shelf: [] }, '空输入不炸');
});

// #69 批定的判据是 kind:读物，但 kind 单独用有个静默失效面：#7「读物：两份待发的对外
// 草稿（发出去代表你，先过目）」kind 是读物，却卡着他签字才能发出去。藏进书架就再没人想起来。
test('splitShelf：等你的读物不藏——wait:你拍/你读 一律留在待审', () => {
  const gating = labeled(1, 'kind:读物', 'wait:你拍');
  const toRead = labeled(2, 'kind:读物', 'wait:你读');
  const idle = labeled(3, 'kind:读物', 'wait:闲');
  const noWait = labeled(4, 'kind:读物');
  const { desk, shelf } = splitShelf([gating, toRead, idle, noWait]);
  assert.deepEqual(desk.map((p) => p.number), [1, 2], '要你签字的读物不该被静默藏起来');
  assert.deepEqual(shelf.map((p) => p.number), [3, 4], '不等你的读物才上架（含没标 wait 的）');
});

test('splitShelf：kind 不是读物就不上架，哪怕标了 wait:闲', () => {
  const idleRef = labeled(1, 'kind:参考', 'wait:闲');
  assert.equal(isShelved(idleRef), false, '书架按「这是什么」分，不按「等谁」分');
});

test('侧栏：遗留闲折不进待审计数，待审栏里不画书架折卡；在书架里带「未画可」角标', () => {
  const props = {
    q: '', hits: null, searching: '', cur: null, demo: false,
    prs: [labeled(1, 'kind:读物', 'wait:闲'), labeled(2, 'kind:设计', 'wait:你拍')],
    donePrs: [], timeAgo: () => '刚刚',
    onQuery() {}, onSearch() {}, onClearSearch() {}, onJumpToHit() {},
    onTab() {}, onOpenPR() {}, onSettings() {},
  };
  const open = JSON.stringify(Sidebar({ ...props, tab: 'open' }));
  assert.match(open, /待审 1/, '遗留的闲折不计进待审（历史遗留，读完画可即归位）');
  assert.match(open, /读毕书架 1/, '第三个 tab 带自己的计数，遗留闲折也计入');
  assert.doesNotMatch(open, /"t1"/, '待审栏里不该出现书架里的折');

  const shelf = JSON.stringify(Sidebar({ ...props, tab: 'shelf' }));
  assert.match(shelf, /"t1"/, '切到书架才画书架折卡');
  assert.doesNotMatch(shelf, /"t2"/, '书架里不该混进待审的折');
  assert.match(shelf, /kind-chip/, '书架折卡带分类角标');
  assert.match(shelf, /读物/);
  assert.match(shelf, /unread-chip/, '未画可的遗留折要有明显角标');
  assert.match(shelf, /未画可 · 1/, '遗留折单独成组、带计数');
  assert.doesNotMatch(shelf, /读毕 · /, '没有读毕的折就不画读毕组');
});

// 2026-08-03：这条断言从「没有闲折就整块不画」翻了面。
// 原规矩把书架当角标那样克制（有话说才出现），那时它是待审列表底部的一个折叠区。
// 升成第三个 tab 后判据变了：tab 是**导航**不是装饰，而会忽隐忽现的入口正是这次报障的
// 病根（「左下角是有个弘文馆，但点开之后里面都没有」）。已画可为 0 时也照样在，三个
// tab 一视同仁。克制改由别处承担：不进待审计数、tab 与折卡都压着透明度。
test('侧栏：书架空着时 tab 仍在，只是计数为 0', () => {
  const props = {
    q: '', hits: null, searching: '', cur: null, demo: false,
    prs: [labeled(2, 'kind:设计', 'wait:你拍')], donePrs: [], timeAgo: () => '',
    onQuery() {}, onSearch() {}, onClearSearch() {}, onJumpToHit() {},
    onTab() {}, onOpenPR() {}, onSettings() {},
  };
  const flat = JSON.stringify(Sidebar({ ...props, tab: 'open' }));
  assert.match(flat, /读毕书架 0/, '入口常驻，不随存量忽隐忽现');

  const empty = JSON.stringify(Sidebar({ ...props, tab: 'shelf' }));
  assert.match(empty, /还没有读毕的书/, '空架给一句话，不是一片空白');
});

// ── 读毕书架（2026-09-21 拍板）──────────────────────────────────
// 弘文馆原是「open 且 wait:闲 的读物」，agent 能直接把东西标 wait:闲 塞进去、他永远看不到。
// 改成读毕书架：架上是**已画可**的读物（读过、点过头的才上架）；遗留的 open 闲折仍显示，
// 但单独成组、带「未画可」角标，与读毕的分开——读完画可即归位。
const { isReadDone, shelfOf } = await import('../src/track.js');
const merged = (number, ...names) => ({ ...labeled(number, ...names), merged_at: '2026-09-20T00:00:00Z' });

test('isReadDone：已画可且 kind:读物 才算读毕；open 读物、已画可的非读物都不算', () => {
  assert.equal(isReadDone(merged(1, 'kind:读物')), true);
  assert.equal(isReadDone(merged(2, 'kind:读物', 'wait:闲')), true, '画可后 wait 值无所谓');
  assert.equal(isReadDone(merged(3, 'kind:拍板')), false, '已画可的拍板折不是书');
  assert.equal(isReadDone(labeled(4, 'kind:读物', 'wait:闲')), false, '还开着的读物不算读毕');
  assert.equal(isReadDone({ number: 5, merged_at: 'x' }), false, '没标 kind 的归档折不上架');
});

test('shelfOf：读毕来自已画可清单、未画可来自待审清单，两摊分开', () => {
  const prs = [labeled(1, 'kind:读物', 'wait:闲'), labeled(2, 'kind:设计', 'wait:你拍')];
  const donePrs = [merged(3, 'kind:读物'), merged(4, 'kind:拍板')];
  const { unread, done } = shelfOf(prs, donePrs);
  assert.deepEqual(unread.map((p) => p.number), [1]);
  assert.deepEqual(done.map((p) => p.number), [3]);
  assert.deepEqual(shelfOf(undefined, undefined), { unread: [], done: [] }, '空输入不炸');
});

test('侧栏：读毕书架列出已画可的读物；已画可栏照旧全列；tab 计数 = 读毕 + 未画可', () => {
  const props = {
    q: '', hits: null, searching: '', cur: null, demo: false,
    prs: [labeled(1, 'kind:读物', 'wait:闲'), labeled(2, 'kind:设计', 'wait:你拍')],
    donePrs: [merged(3, 'kind:读物'), merged(4, 'kind:拍板')],
    timeAgo: () => '刚刚',
    onQuery() {}, onSearch() {}, onClearSearch() {}, onJumpToHit() {},
    onTab() {}, onOpenPR() {}, onSettings() {},
  };
  const shelf = JSON.stringify(Sidebar({ ...props, tab: 'shelf' }));
  assert.match(shelf, /读毕书架 2/, '计数 = 读毕 1 + 未画可 1');
  assert.match(shelf, /已画可 2/, '已画可栏计数不因书架而变');
  assert.match(shelf, /"t3"/, '已画可的读物上架');
  assert.doesNotMatch(shelf, /"t4"/, '已画可的拍板折不上架');
  assert.match(shelf, /读毕 · 1/, '读毕组带计数');
  assert.match(shelf, /未画可 · 1/, '遗留组带计数');
  assert.ok(shelf.indexOf('未画可 · 1') < shelf.indexOf('读毕 · 1'), '遗留的未画可排在读毕之前——它才是还没看的');
  assert.ok(shelf.indexOf('"t1"') < shelf.indexOf('"t3"'), '卡的顺序与分组一致');

  // 读毕卡走 merged_at 那条时间线（画可于），不带未画可角标；角标只挂在遗留折上
  const tree = Sidebar({ ...props, tab: 'shelf' });
  const cardOf = (t) => find(tree, (v) => v.props?.children?.some?.((c) => c?.type === 'h3' && c.props?.children === t));
  assert.ok(find(cardOf('t1'), byClass('unread-chip')), '遗留折带未画可角标');
  assert.equal(find(cardOf('t3'), byClass('unread-chip')), null, '读毕折不带未画可角标');
  assert.match(JSON.stringify(cardOf('t3')), /画可于/, '读毕折显示画可时间');

  const done = JSON.stringify(Sidebar({ ...props, tab: 'done' }));
  assert.match(done, /"t3"/, '已画可栏仍是全量归档，读物不从中抽走');
  assert.match(done, /"t4"/);
  assert.doesNotMatch(done, /unread-chip/, '已画可栏不画未画可角标');
});

test('侧栏：只有读毕、没有遗留闲折时不画未画可组', () => {
  const props = {
    q: '', hits: null, searching: '', cur: null, demo: false,
    prs: [], donePrs: [merged(3, 'kind:读物')], timeAgo: () => '',
    onQuery() {}, onSearch() {}, onClearSearch() {}, onJumpToHit() {},
    onTab() {}, onOpenPR() {}, onSettings() {},
  };
  const shelf = JSON.stringify(Sidebar({ ...props, tab: 'shelf' }));
  assert.doesNotMatch(shelf, /未画可/, '没有遗留就不提未画可');
  assert.match(shelf, /读毕 · 1/);
  assert.match(shelf, /"t3"/);
});

test('侧栏：搜索词同时过滤书架的两组', () => {
  const props = {
    q: 'zzz', hits: null, searching: '', cur: null, demo: false,
    prs: [{ ...labeled(1, 'kind:读物', 'wait:闲'), title: 'zzz 遗留' }],
    donePrs: [merged(3, 'kind:读物'), { ...merged(5, 'kind:读物'), title: 'zzz 读毕' }],
    timeAgo: () => '',
    onQuery() {}, onSearch() {}, onClearSearch() {}, onJumpToHit() {},
    onTab() {}, onOpenPR() {}, onSettings() {},
  };
  const shelf = JSON.stringify(Sidebar({ ...props, tab: 'shelf' }));
  assert.match(shelf, /zzz 遗留/);
  assert.match(shelf, /zzz 读毕/);
  assert.doesNotMatch(shelf, /"t3"/, '不匹配的读毕折被过滤掉');
  assert.match(shelf, /读毕书架 3/, 'tab 计数不受搜索词影响');
});
