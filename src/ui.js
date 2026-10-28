// 门下 —— Preact 视图层（B 方案，2026-07-26 闸门触发后迁移）
// 免构建形态：htm/preact standalone vendored，push 即部署的性质不变。
// 纯逻辑（锚定/hunk/草稿）在 anchor.js，API 在 github.js，渲染在 render.js——迁移零改动。
import {
  html, render, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo,
} from '../vendor/preact-standalone.mjs';
import * as gh from './store.js';
import { renderMarkdown, hydrateRelativeImages } from './render.js';
import { hydrateMermaid } from './mermaid.js';
import * as A from './anchor.js';
import { demoApi, autoAnnotate } from './demo.js';
import { buildIndex, searchIndex, prNumberOf, homeTabOf } from './search.js';
import { decorateVerifyMarkers, countVerifyMarkers } from './verify.js';
import { parseZhupiLink, buildRef, parseDeepLink, buildDeepLink, parseHappySession, resolveRelativeDocLink } from './link.js';
import { siblingFor, visibleDocs, getLang, setLang, variantOf } from './lang.js';
import { getReadStep, setReadStep, scaleOf, clampStep } from './readsize.js';
import { getRailWidth, setRailWidth, clearRailWidth, clampRail, railMax, isResizable, RAIL_MIN, railCeilLending, railLend } from './rail.js';
import { Setup } from './components/setup.js';
import { DraftCard, ShownThread, ZongpiCard } from './components/cards.js';
import { Sidebar } from './components/sidebar.js';
import { Topbar } from './components/topbar.js';
import { OtherThreads } from './components/other-threads.js';
import { ThreadView } from './components/thread-view.js';
import { ImageView, bindImageZoom } from './components/image-view.js';
import { ZongpiShown } from './components/zongpi-shown.js';
import { FolderBody, hasDecisions, parseFolderBody } from './components/folder-body.js';
import { assembleCarry } from './carry.js';
import { Outline, ChapterList, ChapterRail } from './components/outline.js';
import { ScrollEnds, scroller } from './components/scroll-ends.js';
import { Dashboard } from './components/dashboard.js';
import { NavPage } from './components/nav-page.js';
import { extractOutline, hasOutline, chapterList, shouldUseChapterList, chapterName } from './toc.js';
import {
  ART_MIN, TOC_MIN, ART_MIN_WINDOW, TOC_MIN_WINDOW, ART_KEY, TOC_KEY,
  INDENT_MIN, INDENT_MIN_WINDOW, INDENT_KEY,
  isColResizable, colSlack, clampCol, getColWidth, setColWidth, clearColWidth,
} from './cols.js';
import { matchAnchor } from './slug.js';
import { S } from './strings.js';
import { registerServiceWorker, hardUpdate } from './sw-register.js';
import {
  isReadStateComment, parseReadState, shouldPromptJump,
  makeOutboxItem, enqueue, listOutbox, flushOutbox, putMeta, getMeta,
  cachedFetch, cacheKey,
} from './offline.js';

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const AUTO = params.get('auto') === '1';
// 手机档判定，与 style.css 的 `@media (max-width: 900px)` 同一条线（JS 只在少数行为分叉处读它）
const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches;
const api = DEMO ? demoApi : gh;

// 本设备名：用于续读标记里区分「上次在哪台读的」。记在 localStorage，缺省给个短随机名。
function deviceName() {
  let n = localStorage.getItem('menxia.device');
  if (!n) { n = `dev-${Math.random().toString(36).slice(2, 6)}`; localStorage.setItem('menxia.device', n); }
  return n;
}

// Pages 发 max-age=600 且模块 URL 无版本号 → 手机上可能跑着 10 分钟前的旧代码，
// 而用户无从判断新旧。启动时强制回源取一遍源码算指纹，与上次记录比：变了就提示刷新。
// cache:'reload' 同时把新文件写进 HTTP 缓存，所以点刷新立刻生效。
// 覆盖全部源文件——早先只列 5 个，之后新增的 link/search/lang/demo 改了都不会提示新版
// （清单式配置随代码增长而腐烂，第六轮评审实证）
// 新增源文件必须登记在这里，否则改了它不算「新版本」、用户手上会一直跑旧代码。
// 子组件拆出去后曾漏登记，改 cards.js 不触发提示（2026-07-28 补）。
const BUILD_FILES = ['index.html', 'src/style.css', 'src/ui.js', 'src/github.js', 'src/store.js', 'src/anchor.js',
  'src/render.js', 'src/link.js', 'src/search.js', 'src/lang.js', 'src/demo.js', 'src/strings.js',
  'src/carry.js', 'src/mermaid.js',
  'src/components/cards.js', 'src/components/setup.js', 'src/components/sidebar.js',
  'src/components/topbar.js', 'src/components/other-threads.js', 'src/components/zongpi-shown.js',
  'src/components/comment-body.js', 'src/components/folder-body.js', 'src/components/thread-view.js',
  'src/toc.js', 'src/components/outline.js', 'src/track.js', 'src/readsize.js', 'src/rail.js',
  'src/cols.js',
  'src/slug.js', 'src/components/scroll-ends.js', 'src/components/image-view.js',
  'src/components/dashboard.js', 'src/components/nav-page.js',
  // verify.js 是**存量漏网**（F13 那次就没登记，不是本次改动带来的），由 build-files.test.js 揪出来
  'src/verify.js',
  // M2 离线包新增源文件（sw.js 在仓根、不在 src/ 下，故不进这张只管 src/ 的清单；
  // 它自身带 SW_VERSION 版本号 + activate 清旧 cache，失效链路独立于 detectNewBuild）
  'src/offline.js', 'src/sw-register.js', 'src/sw-register-const.js'];
// 「更新到最新版」顺带回源的第三方依赖（不进指纹：它们几乎不变，算进去只会拖慢每次开机检测）
const VENDOR_FILES = ['vendor/preact-standalone.mjs', 'vendor/markdown-it.min.js'];
async function detectNewBuild() {
  try {
    const texts = await Promise.all(BUILD_FILES.map((f) => fetch(`./${f}`, { cache: 'reload' }).then((r) => r.text())));
    let h = 7;
    for (const t of texts) for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    const sig = String(h);
    const prev = localStorage.getItem('zhupi.build');
    localStorage.setItem('zhupi.build', sig);
    return Boolean(prev && prev !== sig);
  } catch { return false; }
}

const isDoc = (f) => f.filename.endsWith('.md') && f.status !== 'removed';

// F12 携卷：写剪贴板。navigator.clipboard 在非安全上下文 / 被拒时会 reject——返回布尔，
// 调用方据此决定要不要走可全选文本框兜底。大卷（22 章 ≈ 上百 KB）照常直接放，只在真写不进时兜底。
async function writeClipboard(text) {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}

// 剪贴板写不进时的兜底：弹一个可全选（自动 select）的文本框，用户 ⌘A/⌘C 手动拷。
// 用命令式 DOM（不进 Preact 渲染树）：携卷是一次性动作，overlay 关了就销毁，不留状态、不动共享组件。
function showCopyFallback(text) {
  const prev = document.querySelector('.carry-fallback');
  if (prev) prev.remove();
  const overlay = document.createElement('div');
  overlay.className = 'carry-fallback';
  const panel = document.createElement('div');
  panel.className = 'carry-fallback-panel';
  const title = document.createElement('div');
  title.className = 'carry-fallback-title';
  title.textContent = S.carry.fallbackTitle;
  const ta = document.createElement('textarea');
  ta.className = 'carry-fallback-text';
  ta.readOnly = true;
  ta.value = text;
  const close = document.createElement('button');
  close.className = 'btn-ghost carry-fallback-close';
  close.textContent = S.carry.fallbackClose;
  const dismiss = () => overlay.remove();
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
  panel.append(title, ta, close);
  overlay.append(panel);
  document.body.append(overlay);
  ta.focus();
  ta.select();
}



// ── 主应用 ──
function App() {
  const [phase, setPhase] = useState('boot');
  const [setupMsg, setSetupMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [prs, setPrs] = useState([]);
  const [cur, setCur] = useState(null);          // { pr, files, docs }
  const [docPath, setDocPath] = useState(null);
  const [docErr, setDocErr] = useState(null);
  const [zoomImg, setZoomImg] = useState(null); // 展图浮窗：{src, alt} | null
  const [docTick, setDocTick] = useState(0);     // 文档 DOM 就位的信号（岛屿内容不归 vdom 管）
  const [readThrough, setReadThrough] = useState(false); // 通读（连续读整本，PAIN #31②）：只读，拼全书
  const [drafts, setDrafts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [zongpi, setZongpi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [float, setFloat] = useState(null);      // pendingAnchor
  const [commits, setCommits] = useState([]);    // rev 序列 v1..vN（vN=head）
  const [comments, setComments] = useState([]);  // 已呈 inline review comments（扁平）
  // 批注是异步拉的。眉批栏要不要塌掉只能等它拉完再判，否则每开一折都先塌后弹，版式跳一下。
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [zongpis, setZongpis] = useState([]);    // 已呈判（会话区），否则判只能发不能看
  const [viewed, setViewed] = useState(null);    // 正在读的 rev sha；null=head
  const [viewThread, setViewThread] = useState(null); // 展读浮窗：存 root comment id，不存对象——
                                                      // 存对象会在刷新/新回话到达后定格成旧快照
  const [otherOpen, setOtherOpen] = useState(false); // 「其他 N 串」折叠组展开态
  const [zongpiOpen, setZongpiOpen] = useState(false); // 「已呈判」折叠组展开态（默认收起，issue #1）
  const [bodyOpen, setBodyOpen] = useState(false);   // 「折子说明」展开态：有「待你拍板」才默认展开（issue #13）
  // 折号 → 体例检查判词。CI 只在 open 折上跑，已画可的不查。
  const [checks, setChecks] = useState({});
  const [verifyN, setVerifyN] = useState(0);         // F13：当前打开这篇文档里的「需核实」标记数（0=不显示）
  // F13：折号 → 全折「需核实」总数，喂列表角标。**不为它单发请求**——只吃已有取文路径的
  // 副产物：搜索建索引时顺带全算一遍，或某折打开渲染后回填这一折。没搜过又没打开过的折不显示。
  const [verifyCounts, setVerifyCounts] = useState({});
  const [lang, setLangState] = useState(getLang()); // F8：中/EN 偏好，记住上次
  const [readStep, setReadStepState] = useState(getReadStep()); // 正文字号档位，记住上次
  // 左栏宽度。null = 从没拖过，别管它，让 CSS 的响应式默认说了算（宽窗 300 / 笔记本档 240）。
  const [railW, setRailW] = useState(getRailWidth());
  const probeRef = useRef(null);   // 版心几何探针，见 style.css 的 .geom-probe
  const [stale, setStale] = useState(false);
  const [tab, setTab] = useState('open');        // open=待审 / done=已画可（归档，只读）
  const [qian, setQianState] = useState(params.get('qian') || null); // 「按签」视图选中的签，null=三栏
  const [dash, setDash] = useState(false);       // F16 总览：按项目摊开待审折，看谁等谁、谁盖了谁
  // 手机目录页（三层导航的第二层：折清单 → 这里 → 正文）。只有 ≤900 的底栏能把它拨开，
  // 桌面读不到那颗钮，所以这个 state 在宽屏上恒 false；显隐规则也整套关在 ≤900 里，
  // 万一从窄屏拉宽（iPad 转屏），正文照常回来，不会卡在一个桌面上没入口的页面里。
  const [navOpen, setNavOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);       // P0：手机顶栏「⋯」展开态（桌面无此钮，恒 false）
  const [updating, setUpdating] = useState(false);       // 「更新到最新版」进行中（页面随即重载）
  const [pendingJump, setPendingJump] = useState(null);   // 目录页点的那一节，等正文回来再跳
  const [donePrs, setDonePrs] = useState([]);
  const [nextUp, setNextUp] = useState(null);    // 画可后的落地条：下一折是谁——只提示，不自动跳，等他自己踩
  const [q, setQ] = useState('');                // 搜索词：即输即filter标题；回车全折全文
  const [hits, setHits] = useState(null);        // null=没在搜；[]=搜了没命中
  const [searching, setSearching] = useState('');     // 手上跑的是旧版（见 detectNewBuild）
  const [carrying, setCarrying] = useState(false);    // F12 携卷：正在取全文拼装（大折要一会儿）
  // ── M2 离线包 ──
  const [offlineAt, setOfflineAt] = useState(null);   // 非 null=正在读离线副本，值是缓存时间（显示「离线副本 · 截至 …」）
  const [outboxN, setOutboxN] = useState(0);          // 判 outbox 待发条数（>0 时 UI 显示「待发 N 条」）
  const [resumeBar, setResumeBar] = useState(null);   // 续读提示：{docPath, anchor} | null。点了才跳，绝不自动
  const readStateId = useRef(null);                   // 本折续读 comment 的 id（记住 → 下次直接 PATCH）

  const docRef = useRef(null);
  const autoRan = useRef(false); // 冒烟只跑一次（切折会让 docTick 回到 1）
  const deepLink = useRef(parseDeepLink(location.search));
  const pendingNotice = useRef(null); // 深链失败提示：要熬过随后的 setNotice('')
  const jumpRef = useRef(null);  // 搜索命中 → 开折后跳到那一段 {prNumber, path, line}
  const indexRef = useRef(null); // 全文索引缓存（本次会话内）
  // 全局监听器只绑一次，读最新状态走这面镜子
  const R = useRef({});
  // headSha / viewedRef 入镜：全局 mouseup 要据此判定「旧版只读 → 不出浮批」
  const headSha = cur?.pr?.head?.sha || null;
  const onHead = !viewed || viewed === headSha;
  const archived = Boolean(cur?.pr?.merged_at);
  const canAnnotate = onHead && !archived && !readThrough; // 旧版 / 归档 / 通读一律只读（通读拼全书，行号跨章会撞）
  const happyUrl = parseHappySession(cur?.pr?.body);   // 呈折的那次奏对（agent 埋在 PR body 里）
  R.current = { cur, drafts, editing, busy, float, docPath, viewed, headSha, onHead, archived, canAnnotate, viewThread, zoomImg, prs, donePrs, dash };
  // P0 导航栈：清单 → 折 这一步进历史（手机档），popstate 回清单原位。见下方「地址栏」那段。
  const histRef = useRef({ prev: null, popping: false, listY: 0 });
  const openRef = useRef(null);
  openRef.current = openPR;   // popstate 监听只绑一次，开折走这面镜子拿最新的 openPR

  const say = useCallback((t) => setNotice(t), []);

  // 把暂存的深链提示放出来。openPR 一进门就 setNotice('')，所以得等它之后再送——
  // 缺了这一步，pendingNotice 就是只写不读，深链失败会全程静默（#7 顺带修）。
  const flushPending = useCallback(() => {
    const m = pendingNotice.current;
    if (!m) return;
    pendingNotice.current = null;
    setTimeout(() => setNotice(m), 0);
  }, []);

  // 草稿变更统一走这里：内存 + localStorage 同步写，没有 effect 时序问题
  const mutateDrafts = useCallback((prNumber, fn) => {
    setDrafts((ds) => {
      const nd = fn(ds);
      const err = A.saveDrafts(prNumber, nd);
      // 存不下必须明说：草稿是这里唯一不可再生的数据（配额爆时曾静默吞掉）
      if (err) setTimeout(() => setNotice(S.draft.quotaFull), 0);
      return nd;
    });
  }, []);

  useEffect(() => { if (!DEMO) detectNewBuild().then(setStale); }, []);

  // ── M2 离线包：装 SW + 开机/联网时 flush 判 outbox ──
  // DEMO 一律跳过（冒烟测试不该注册 SW、不该碰 IndexedDB）。
  const refreshOutboxN = useCallback(async () => { setOutboxN((await listOutbox()).length); }, []);
  const flushOut = useCallback(async () => {
    // 逐条把待发判发出去；成功即出队。sender 抛错的留队可重试（见 offline.flushOutbox）。
    await flushOutbox(async (it) => { await gh.createIssueComment(it.pr, it.body); });
    await refreshOutboxN();
    // 刚 flush 完，若当前正看着那折，重拉一次让新判显示。
    const c = R.current.cur;
    if (c) loadComments(c.pr.number);
  }, [refreshOutboxN]);

  useEffect(() => {
    if (DEMO) return undefined;
    registerServiceWorker();
    refreshOutboxN();
    flushOut();                                   // 开机先试着把上次没发出去的补发
    const onOnline = () => flushOut();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushOut, refreshOutboxN]);

  // 深链自带的仓 vs 本地配的仓（#7）。病根：以前深链是拿**收链人**配的仓去解析**发链人**给的折号——
  // 发给协审人的 ?pr=30 会落到他自己那个仓的第 30 折上（串台），?ref= 形态则被仓名比对直接判死（静默）。
  // 链接现在自我描述，这里负责对账。返回 true = 本地原本没配仓、这次是从链接里认来的。
  function adoptDeepLinkRepo() {
    const want = deepLink.current?.repo;
    if (!want) return false;                       // 老链接没带仓：照旧按当前仓解析，行为不变
    const have = gh.getRepoSlug();
    if (!have) { gh.setRepoSlug(want); return true; } // 头一回进来：省得收链人还得回头问仓名叫啥
    if (want.toLowerCase() === have.toLowerCase()) return false;
    // 切仓绝不静默：钥匙未必开得了那个仓，而且本地只存一个仓，切了就得手动切回来。
    // 全名摆在弹窗里也是防钓鱼——别人发的链接不能悄悄把 app 指到他的仓上。
    if (confirm(S.deepLink.repoSwitchConfirm(want, have))) {
      gh.setRepoSlug(want);
    } else {
      deepLink.current = null;                     // 不切，就别拿这条链去本仓瞎找折号
      pendingNotice.current = S.deepLink.repoSwitchDeclined(have, want);
    }
    return false;
  }

  // ── 启动 ──
  useEffect(() => {
    if (DEMO) { loadPRs(); return; }
    const adopted = adoptDeepLinkRepo();
    if (!gh.getToken()) {
      setPhase('setup');
      if (adopted) setSetupMsg(S.setup.repoAdoptedFromLink(gh.getRepoSlug()));
      return;
    }
    if (!gh.getRepoSlug()) { setPhase('setup'); setSetupMsg(S.setup.repoNowRequired); return; }
    loadPRs();
  }, []);

  // 并行取每折的体例检查结论。
  //
  // `unreadable`（钥匙缺 Actions: Read）**不逐折显示** —— 那会让 19 张卡同时打问号，
  // 是噪音不是信息。它是一次性的配置问题，出一条通知就够了。
  async function loadChecks(list) {
    if (!api.checkVerdict) return;                       // demo 模式没有这个口
    const open = list.filter((p) => !p.merged_at && p.head?.sha);
    const got = await Promise.all(open.map(async (p) => {
      try { return [p.number, await api.checkVerdict(p.head.sha)]; }
      catch { return [p.number, { state: 'none' }]; }     // 网络抖动不该长成红叉
    }));
    const map = Object.fromEntries(got);
    setChecks(map);
    if (Object.values(map).some((v) => v?.state === 'unreadable')) {
      setNotice(S.check.unreadableNotice);
    }
  }

  async function loadPRs() {
    setPhase('app');
    setNotice('');
    try {
      indexRef.current = null; // 拉了新清单就让搜索索引重建（缓存命中时几乎零成本）
      const list = await api.listOpenPRs();
      if (api.listMergedPRs) api.listMergedPRs().then(setDonePrs).catch(() => {});
      setPrs(list);
      // 体例检查的红绿。**不 await** —— 清单先出来，红绿随后补上；
      // 19 折就是 19 个请求，串起来等要好几秒，而它只是个角标。
      // 拿不到就当没有：这里失败不该拖累整个清单（loadChecks 自己吞异常）。
      loadChecks(list);
      const dl = deepLink.current;
      if (dl) {
        deepLink.current = null;   // 只认一次，之后随手切折不再被它拽回来
        const all = [...list, ...(await api.listMergedPRs?.().catch(() => []) || [])];
        const target = dl.prNumber ? all.find((p) => p.number === dl.prNumber) : null;
        if (target) {
          if (dl.path) jumpRef.current = { prNumber: target.number, path: dl.path, line: dl.line || 1 };
          setTab(target.merged_at ? 'done' : 'open');
          openPR(target);
          flushPending();
          return;
        }
        // 用 ref 暂存：紧接着的 boot/loadPRs 会 setNotice('') 把它冲掉
        pendingNotice.current = dl.prNumber
          ? S.deepLink.folderNotFound(dl.prNumber)
          : S.deepLink.noFolderNumber;
      }
      if (list.length && !R.current.cur) openPR(list[0]); // 在途中用户已手点开折子就别顶掉他
      flushPending();
      return list;                                        // 画可后要据此算「下一折是谁」
    } catch (err) {
      if (err.tokenDead) { gh.clearToken(); setPhase('setup'); setSetupMsg(S.setup.tokenDead); return; }
      say(err.rateLimited ? S.list.rateLimited : S.list.failed(err.message));
    }
  }

  async function onSaveToken(repoRaw, tokenRaw) {
    const slug = gh.parseRepoSlug(repoRaw);
    if (!slug) return setSetupMsg(S.setup.repoFormat);
    if (!tokenRaw.trim()) return setSetupMsg(S.setup.tokenMissing);
    setSetupMsg(S.setup.verifying);
    gh.setRepoSlug(slug);
    gh.setToken(tokenRaw);
    try {
      const { canWrite, prAccess } = await gh.verifyToken();
      if (!prAccess) {
        gh.clearToken();
        return setSetupMsg(S.setup.tokenMissingPRScope);
      }
      setSetupMsg('');
      await loadPRs();
      if (!canWrite) say(S.setup.tokenNoWriteWarn);
    } catch (err) {
      gh.clearToken();
      setSetupMsg(S.setup.tokenCannotOpen(gh.repoSlug(), err.message));
    }
  }

  function openPR(pr) {
    if (!R.current.cur) histRef.current.listY = window.scrollY; // 从清单进折：记下清单滚到哪，回来还原
    setMoreOpen(false);
    setNotice('');
    setNextUp(null);      // 换折了，上一折的落地条就不该再挂着
    setFloat(null);
    editElsewhere(null);  // 换折前收掉空草稿：它存进的是**上一折**的 localStorage，回来还会堵在那儿
    setZongpi(false);
    setDocErr(null);
    setDocPath(null);
    setDocTick(0);
    setReadThrough(false); // 通读是「这折的临时读法」，换折回默认分章（否则单章折也顶着通读态）
    setViewed(null);      // 每次开折先回 head：docPath 置 null 期间就位，与岛屿 effect 的 null→值中转契约不冲突
    setCommits([]);
    setComments([]);
    setCommentsLoaded(false);
    setZongpis([]);
    setZongpiOpen(false);   // 每开一折都从收起态起：否则上一折展开过，下一折又被历史挡住正文
    // 「折子说明」相反：**这折有拍板点就默认摊开**（issue #13）——它不是历史，是这折要他决定的事，
    // 收起来就等于回到「拍板点静默消失」。没拍板点才收起，把常态成本压回一行标题。
    // 逐折重算（不是沿用上一折的状态）：展开与否是这折的属性，不是用户的偏好。
    // P0 手机档例外：折首一屏只容得下一行药丸，摊开就把正文推出首屏（走查实测 h1 在 844px）。
    // 拍板条数在药丸上常显，「有事要你决定」仍在余光里；桌面照旧按拍板点默认摊开。
    setBodyOpen(hasDecisions(pr.body) && !isPhone());
    setCur({ pr, files: null, docs: null });
    setDrafts(A.loadDrafts(pr.number));
    // 立刻清岛屿并示 loading：否则 listPRFiles 整个往返期间旧折正文挂着，
    // 这时划选会产出 path:null 的脏草稿（评审 N2）
    const el = docRef.current;
    if (el) {
      const p = document.createElement('p');
      p.className = 'state';
      p.textContent = S.doc.loading;
      el.replaceChildren(p);
    }
    (async () => {
      try {
        const files = await api.listPRFiles(pr.number);
        if (R.current.cur?.pr.number !== pr.number) return; // 世界已变，丢弃
        const docs = files.filter(isDoc);
        setCur({ pr, files, docs });
        if (!docs.length) setDocErr(S.doc.noMarkdown);
        else {
          const jp = jumpRef.current;
          const want = jp?.prNumber === pr.number && docs.find((f) => f.filename === jp.path);
          // 无指定目标时按语言偏好挑首篇（双语折默认开中文版）
          const visible = visibleDocs(docs.map((f) => f.filename), getLang());
          setDocPath(want ? jp.path : (visible[0] || docs[0].filename));
        }
      } catch (err) {
        if (R.current.cur?.pr.number !== pr.number) return;
        setDocErr(S.doc.loadFailed(err.message));
      }
    })();
    // rev 序列 + 已呈批注串：与正文并行拉，各自带世界守卫，失败不影响读折主线
    (async () => {
      try {
        const cs = await api.listPRCommits(pr.number);
        if (R.current.cur?.pr.number === pr.number) setCommits(cs);
      } catch { /* rev 拉不到就只读 head，不报错打断 */ }
    })();
    loadComments(pr.number);
    loadReadState(pr.number);   // M2：读远端续读位置，决定要不要给「跳到上次位置?」提示条
  }

  // 已呈批注串：开折拉一次、提交涂归成功后重拉一次（让刚呈的立即可见）。不轮询。
  async function loadComments(prNumber) {
    try {
      const [cs, zs] = await Promise.all([
        api.listPRComments(prNumber),
        api.listIssueComments ? api.listIssueComments(prNumber) : Promise.resolve([]),
      ]);
      // 续读标记不是判：从会话区里滤掉，否则那条自动维护的 comment 会当成一条判显示（和 mcp 侧同判据）。
      const visibleZ = zs.filter((c) => !isReadStateComment(c.body));
      if (R.current.cur?.pr.number === prNumber) { setComments(cs); setZongpis(visibleZ); }
    } catch { /* 批注串拉失败不打断读折 */ }
    // 成功或失败都置位：失败时按「这折没有批注」处理，总比眉批栏一直吊着 300px 强
    if (R.current.cur?.pr.number === prNumber) setCommentsLoaded(true);
  }

  // 打开折时读远端续读位置：比本地新且落点不同才给「跳到上次位置?」提示条（点了才跳，绝不自动）。
  async function loadReadState(prNumber) {
    if (DEMO || !gh.getReadState) return;
    try {
      const rs = await gh.getReadState(prNumber);
      readStateId.current = rs?.id ?? null;
      const localTime = (await getMeta(`readtime::${prNumber}`)) || '';
      if (rs?.state && shouldPromptJump(rs.state, { localTime, current: { docPath: R.current.docPath, anchor: '' } })) {
        setResumeBar({ docPath: rs.state.docPath, anchor: rs.state.anchor });
      } else {
        setResumeBar(null);
      }
    } catch { /* 读续读失败不打断读折 */ }
  }

  // 当前视口顶部所在的源文件行号：取「盒顶已越过视口顶」的最后一个 [data-line]。
  // 复用既有 data-line 语义，不新造定位逻辑；拿不到返回 null（通读/无文档时）。
  function topVisibleLine() {
    const el = docRef.current;
    if (!el) return null;
    let line = null;
    for (const b of el.querySelectorAll('[data-line]')) {
      if (b.getBoundingClientRect().top <= 80) line = +b.dataset.line;  // 80 ≈ 顶栏高度
      else break;
    }
    return line;
  }

  // 续读位置**写侧**：滚动到哪记到哪。节流（≥4s 且行号变了才写），网络 best-effort（PATCH 同一条），
  // 本地 meta 时间无条件更新（跨设备 last-write-wins 的本地基准）。断网时本地照存，联网后自然被下次滚动覆盖。
  const lastRS = useRef({ line: null, at: 0 });
  function recordReadState() {
    if (DEMO || !gh.putReadState) return;
    const c = R.current.cur;
    const path = R.current.docPath;
    if (!c || !path) return;
    const line = topVisibleLine();
    if (line == null) return;
    const now = Date.now();
    if (line === lastRS.current.line || now - lastRS.current.at < 4000) return;  // 节流
    lastRS.current = { line, at: now };
    const time = new Date().toISOString();
    const state = { device: deviceName(), docPath: path, anchor: `L${line}`, time };
    putMeta(`readtime::${c.pr.number}`, time);
    gh.putReadState(c.pr.number, state, readStateId.current)
      .then((id) => { if (id != null) readStateId.current = id; })
      .catch(() => { /* 断网/失败：本地已记 time，联网后下次滚动补写 */ });
  }

  // 「跳到上次位置?」被点击：把 anchor（L<行号>）解析回行号，复用既有「data-line ≤ 行号的最近块」跳转。
  function jumpToReadState() {
    const target = resumeBar;
    setResumeBar(null);
    if (!target) return;
    const m = /^L(\d+)$/.exec(target.anchor || '');
    const el = docRef.current;
    if (!m || !el) return;
    const line = +m[1];
    let hit = null;
    el.querySelectorAll('[data-line]').forEach((b) => { if (+b.dataset.line <= line) hit = b; });
    if (hit) hit.scrollIntoView({ block: 'start' });
  }

  // ── 文档岛屿：内容不归 vdom 管，effect 负责取文与注入；cleanup 即世代守卫 ──
  // viewed 纳入依赖 → 切 rev 触发重取。openPR 里 viewed 在 setDocPath(null) 之前先归 null，
  // 故新折展开时 docPath null→值 的中转期间 viewed 已是 head，effect（docPath 为空即 return）
  // 只在 docPath 就位那一拍以正确的 ref 跑一次，不会拿旧 rev 去打新折。
  useEffect(() => {
    const el = docRef.current;
    if (!el || !cur?.pr || !docPath) return;
    const ref = viewed || cur.pr.head.sha; // null=head
    let dead = false;
    el.replaceChildren();
    setVerifyN(0);                    // F13：切文档先清计数，取文/渲染后再据实设回
    const p = document.createElement('p');
    p.className = 'state';
    p.textContent = S.doc.loading;
    el.appendChild(p);
    (async () => {
      try {
        // ── 通读（连续读整本，PAIN #31②）──
        // 把全书各章按目录顺序一次拼进 #doc，一路滚到底，不用逐章点。
        // **只读**：涂归锚在单篇的 data-line 上，跨章拼接后行号会撞（第 1 章第 5 行 vs 第 3 章第 5 行），
        // 故 canAnnotate 已在通读态关掉划句（判不受影响）。每章各是一个 <section>，
        // 保留自己的 data-line、配一个章标题分割线；渲染不开 headingIds（跨章 id 会重、且通读不做页内锚跳）。
        const chapters = readThrough ? visibleDocs((cur.docs || []).map((f) => f.filename), getLang()) : null;
        if (readThrough && chapters && chapters.length > 1) {
          const texts = await Promise.all(chapters.map(async (path) => {
            try { return { path, text: await api.getFileText(path, ref) }; }
            catch { return { path, text: null }; }   // 单章取不到不拖垮整本
          }));
          if (dead) return;
          el.replaceChildren();
          texts.forEach(({ path, text }, i) => {
            const sec = document.createElement('section');
            sec.className = 'chapter-section';
            sec.dataset.chapter = path;
            const h = document.createElement('h2');
            h.className = 'chapter-divider';
            h.textContent = S.readThrough.chapterDivider(i + 1, chapters.length, chapterName(path));
            sec.appendChild(h);
            const body = document.createElement('div');
            body.className = 'chapter-body';
            // 与单篇同一条 XSS 安全渲染路径（markdown-it html:false）；不开 headingIds（跨章去重会分家）
            body.innerHTML = text == null ? '' : renderMarkdown(text, { headingIds: false });
            if (text == null) { body.className += ' state err'; body.textContent = S.doc.loadFailed(chapterName(path)); }
            sec.appendChild(body);
            el.appendChild(sec);
          });
          // 需核实标记：整本一起点；图片按各章自己的目录 base 逐段换（同一 ref）
          setVerifyN(decorateVerifyMarkers(el, S.verify.markerTip));
          await Promise.all([...el.querySelectorAll('.chapter-section')].map((sec) =>
            hydrateRelativeImages(sec, { docPath: sec.dataset.chapter, ref, fetchBlobUrl: api.getFileBlobUrl })));
          if (dead) return;
          setDocTick((t) => t + 1);
          // 渲图在 tick 之后异步做（沙箱加载慢不拖大纲/批注卡），做完再 tick 一次重排
          hydrateMermaid(el, DEMO ? { timeoutMs: 30000 } : {}).then(() => { if (!dead) setDocTick((t) => t + 1); });
          return;   // 通读态到此为止：不跑 jumpRef（那是单篇锚点的活）
        }

        // M2 离线：正文走缓存包装——在线取到顺手写库并清「离线副本」标；
        // 断网取不到就回退缓存并标出缓存时间。DEMO 直连（不碰 IndexedDB）。
        let text;
        if (DEMO) {
          text = await api.getFileText(docPath, ref);
        } else {
          const r = await cachedFetch(cacheKey('doc', { pr: cur.pr.number, path: `${ref}:${docPath}` }),
            () => api.getFileText(docPath, ref));
          text = r.data;
          setOfflineAt(r.offline ? r.cachedAt : null);
        }
        if (dead) return;
        // 只有正文开 headingIds：页内锚的 id 全文档唯一，批注面不能跟着打（见 render.js 那段）
        el.innerHTML = renderMarkdown(text, { headingIds: true });
        // F13：渲染后在纯文本层给「需核实」标记加可见状态；返回本篇标记数供顶栏显示。
        setVerifyN(decorateVerifyMarkers(el, S.verify.markerTip));
        await hydrateRelativeImages(el, { docPath, ref, fetchBlobUrl: api.getFileBlobUrl });
        if (dead) return;
        setDocTick((t) => t + 1);
        // 渲图在 tick 之后异步做（沙箱加载慢不拖大纲/批注卡），做完再 tick 一次重排
        hydrateMermaid(el, DEMO ? { timeoutMs: 30000 } : {}).then(() => { if (!dead) setDocTick((t) => t + 1); });
        const jp = jumpRef.current;
        if (jp && jp.prNumber === cur.pr.number && (!jp.path || jp.path === docPath)) {
          jumpRef.current = null;
          setTimeout(() => {
            // 跨篇锚点：带 frag 的走标题 slug 匹配（jumpToAnchor 自带「找不到就出声」）；
            // 其余仍走 data-line ≤ 目标行的最近块，两条落点共用 flashTo。
            if (jp.frag) { jumpToAnchor(jp.frag); return; }
            let target = null;
            el.querySelectorAll('[data-line]').forEach((b) => { if (+b.dataset.line <= jp.line) target = b; });
            flashTo(target, 'center');
          }, 60);
        }
      } catch (err) {
        if (dead) return;
        el.replaceChildren();
        const q = document.createElement('p');
        q.className = 'state err';
        q.textContent = S.doc.loadFailed(err.message);
        el.appendChild(q);
      }
    })();
    return () => { dead = true; };
  }, [cur?.pr?.number, docPath, viewed, readThrough]);

  // demo 自动划批（真实事件路径的冒烟）
  useEffect(() => {
    if (DEMO && AUTO && docTick === 1 && !autoRan.current) { autoRan.current = true; autoAnnotate(docRef.current); }
  }, [docTick]);

  // ── 高亮 ──（旧版只读：不画草稿高亮，行号可能已漂移）
  useEffect(() => {
    if (!('highlights' in CSS)) return;
    const doc = docRef.current;
    const hl = new Highlight();
    if (doc && docTick > 0 && onHead && !readThrough) {   // 通读态拼了全书，草稿行号跨章会撞，不画
      drafts.filter((d) => d.path === docPath).forEach((d) => {
        const r = A.rangeForDraft(doc, d);
        if (r) hl.add(r);
      });
    }
    CSS.highlights.set('zhupi-draft', hl);
    return () => CSS.highlights.delete('zhupi-draft');
  }, [drafts, docTick, docPath, onHead, readThrough]);

  // ── 批注卡对齐（图片/字体异步加载改块高 → ResizeObserver 重排）──
  // 退化对齐（评审取舍）：草稿卡的 blockLine 精确命中某个 [data-line]；已呈批注串的
  // blockLine 是「源文件行号」，块级 data-line 不一定精确命中 → 找 data-line ≤ 目标行的最近块
  // 挂靠（列表/表格内的行落在其容器块上，语义足够近）。二选一里取「就近向上」而非「最接近」，
  // 理由：向上挂靠保证卡片不会跑到被批句子的上方，读起来锚点永远在卡片视线的同高或稍上。
  // 评论正文里的相对路径图片（#5）：按「当前正文所在目录 + 当前 rev」解析，与正文岛屿同一套 base。
  // 判不锚任何文件、涂归锚的又多半就是在读的这篇，所以拿 docPath 当基准最贴读者的心智。
  // 必须 useCallback：身份不稳的话 CommentBody 的 effect 每次渲染都重跑，白打一轮 Contents API。
  const hydrateComment = useCallback((el) => {
    const pr = R.current.cur?.pr;
    if (!pr || !docPath) return;
    hydrateRelativeImages(el, { docPath, ref: viewed || pr.head.sha, fetchBlobUrl: api.getFileBlobUrl });
  }, [docPath, viewed]);

  const blockTops = useMemo(() => {
    const doc = docRef.current;
    if (!doc) return [];
    return [...doc.querySelectorAll('[data-line]')]
      .map((el) => ({ line: +el.dataset.line, el }))
      .filter((x) => x.line)
      .sort((a, b) => a.line - b.line);
    // docPath 也在依赖里（#2）：blockTops 描述的是「当前文档的块」，它的失效条件本来就该含
    // 「换了文档」。只认 docTick 的话，切 doc-tab 时 marginItems 已按新文档重建出一批新 DOM 节点，
    // 而 blockTops / layoutCards 身份不变 → 布局 effect 整个不触发 → 新卡片一个 style.top 都没有，
    // 全塌到容器顶端叠在一起，要等正文取回来（一整个网络往返）才归位。
    // 附带收益：岛屿 replaceChildren 之后旧 blockTops 里存的是已脱离文档的节点，
    // 这一版顺手让它跟着失效，不留 detached 引用。
  }, [docTick, docPath]);

  // F14 篇内大纲：与 blockTops 同源同失效条件（换文档/正文就位重算），只抽标题不动 DOM。
  const outlineItems = useMemo(() => extractOutline(docRef.current), [docTick, docPath]);

  const layoutCards = useCallback(() => {
    const col = document.getElementById('margin-col');
    const doc = docRef.current;
    if (!col || !doc) return;
    const colRect = col.getBoundingClientRect();
    let prevBottom = 0;
    // 判卡跳过：它 2026-08-06 起是**钉在视口里**的 fixed 卡（见 cards.js），不参与右缘堆叠。
    // 不跳过的话这里会给它写一个内联 `top`——内联样式压过 CSS 的 `top:50%`，再叠上
    // `translateY(-50%)` 就把它推到视口上方去了（实测 top=-95，整张卡看不见）。
    // 它也不该计进 prevBottom：那会在普通卡之间凭空顶出一段它自己已经不占的高度。
    [...col.children].filter((c) => !c.classList.contains('zongpi-card')).forEach((card) => {
      let top = prevBottom + 12;
      const line = +card.dataset.blockLine;
      // 旧版视图下行号系 head 坐标，对旧版 DOM 会系统性挂错块——改静态堆叠（第四轮评审 D）
      if (line && R.current.onHead) {
        let block = doc.querySelector(`[data-line="${line}"]`);
        if (!block) { // 退化：最近的 data-line ≤ line 的块
          let cand = null;
          for (const b of blockTops) { if (b.line <= line) cand = b.el; else break; }
          block = cand;
        }
        if (block) top = Math.max(block.getBoundingClientRect().top - colRect.top, prevBottom + 12);
      }
      card.style.top = `${Math.max(top, 0)}px`;
      prevBottom = Math.max(top, 0) + card.offsetHeight;
    });
    col.style.minHeight = `${prevBottom + 20}px`;
  }, [blockTops]);

  // 只依赖「改变 margin-col 自身子元素集合/高度」的 state。正文之上的块（判、rev 行、tab 条）
  // 高度变了也不用重排：layoutCards 算的是 block.top − colRect.top，而 #doc 与 #margin-col 是
  // .read-row 里顶对齐的 flex 兄弟，一起上下平移，差值恒定。（评审实测：展/收判前后 tops 逐像素相同）
  // 大纲（.toc）不参与这套测量：它是 .stage-row 的第二栏、根本不在 .read-row 里，且是 sticky，
  // 滚动时的位移不进布局流。
  // readStep 必须在依赖里：改字号会改正文里每个块的 top，卡片得跟着重排。ResizeObserver 通常
  // 也会因为正文变高而触发，但那是巧合不是保证——高度碰巧不变而块位移了它就不响。
  useLayoutEffect(() => { layoutCards(); }, [drafts, editing, zongpi, docTick, comments, viewed, readStep, layoutCards]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !docRef.current) return;
    const ro = new ResizeObserver(() => layoutCards());
    ro.observe(docRef.current);
    return () => ro.disconnect();
  }, [docPath, docErr]); // 每次换文档/错误恢复都扎实重挂，不赌 vdom 节点复用（评审：布尔依赖太脆）
  // 展图：正文岛屿上一个事件委托，覆盖全部 img（含绝对 URL 的），且扛住岛屿 replaceChildren。
  // **依赖必须跟 ResizeObserver 那条一模一样（docPath 不能省）**：首次挂载时还没开折，
  // 整个 main 都没渲染，docRef.current 是 null——只写 [docErr] 就等于绑了个空，
  // 而后来岛屿出现时 effect 不再跑，图永远点不开。2026-08-06 实伤：三层测试全绿
  // （DOM 层是直接拿真元素调 bindImageZoom，绕过了这个时序），真在 app 里点却毫无反应。
  useEffect(() => bindImageZoom(docRef.current, setZoomImg), [docPath, docErr]);
  useEffect(() => {
    const onResize = () => layoutCards();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── 全局监听：划选 / ⌘Enter / 滚动收浮钮 ──
  const submitRef = useRef();
  useEffect(() => {
    // 当前选区 → 浮钮，鼠标与触屏两条路径共用的唯一落点
    const showFloat = () => {
      const a = A.computeAnchor(docRef.current);
      setFloat(a ? { ...a, rect: { left: a.rect.right, top: a.rect.bottom } } : null);
    };
    const onMouseUp = (e) => {
      // .thread-view 同理入列：浮窗里划字是「读」不是「批」，computeAnchor 本来也会因
      // 选区不在 #doc 内返回 null，但那条路径会顺手把浮钮清掉，白折腾一次 setState。
      if (e.target.closest('.zhupi-float, .anno-card, .zongpi-card, .thread-view')) return;
      if (e.target.closest('aside, .mainbar')) { if (R.current.float) setFloat(null); return; } // 点按钮也要收浮钮
      if (!R.current.canAnnotate) { if (R.current.float) setFloat(null); return; } // 旧版/归档只读：不出浮批钮
      setTimeout(showFloat, 0);
    };
    // 触屏路径：iOS Safari 把长按选字与拖选择手柄整段手势交给原生选择 UI，不派发合成的
    // mouse 事件——只挂 mouseup 的话 iPad 上手指选中后浮钮永远不出（接妙控走 mousedown 则正常）。
    // 只对触摸输入启用：桌面拖选途中 selectionchange 连续派发，放行会让浮钮在松手前跟着选区跳。
    let byTouch = false;
    let selTimer = 0;
    const onTouchStart = () => { byTouch = true; };  // 早于长按被系统接管，必定收得到
    const onMouseDown = () => { byTouch = false; };  // 含 iPad 接妙控：一律退回 mouseup 路径
    const onSelectionChange = () => {
      if (!byTouch) return;
      clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        if (!byTouch) return; // 期间来了 mousedown（轻点收选区）：交回 mouseup 判
        if (!R.current.canAnnotate) { if (R.current.float) setFloat(null); return; } // 与 mouseup 同一道只读闸
        showFloat();
      }, 250); // 拖手柄期间连发，等停稳再出钮
    };
    const onKeyDown = (e) => {
      // Esc 收展读浮窗。放在 ⌘Enter 之前、且不排除输入框——浮窗里没有可编辑区，
      // 而「按 Esc 关不掉」是模态窗最招骂的一种坏法。
      // 展图窗盖在展读窗之上（z 60 > 50），所以 Esc 先收它——否则会从底下那层开始关，
      // 视觉上「按了没反应」。
      if (e.key === 'Escape' && R.current.zoomImg) { setZoomImg(null); return; }
      if (e.key === 'Escape' && R.current.viewThread != null) { setViewThread(null); return; }
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      // 阻断修复：卡内 ⌘Enter 的同一事件会冒泡到这里——不排除输入框就会把整批当场呈出
      if (e.target.closest('textarea, input')) return;
      const { editing, drafts, busy } = R.current;
      if (!editing && drafts.length && !busy) submitRef.current?.();
    };
    const onScroll = () => {
      if (R.current.float) setFloat(null); // 内滚不派发 mousedown，浮钮会残留
      recordReadState();                   // M2：滚动到哪、续读位置记到哪（内部节流，best-effort）
    };
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(selTimer);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  // ── 草稿动作 ──
  function addDraft() {
    const a = R.current.float;
    const c = R.current.cur;
    if (!a || !c) return;
    const d = {
      id: `d${Date.now()}${Math.floor(Math.random() * 1e4)}`,
      path: R.current.docPath,
      ref: c.pr.head.sha, // 写于哪个版本：推新版后旧草稿降级判，绝不静默钉错行
      blockLine: a.blockLine,
      line: a.line,
      offset: a.offset || 0,
      quote: a.quote,
      quoteRaw: a.quoteRaw,
      note: '',
      ts: Date.now(),
    };
    mutateDrafts(c.pr.number, (ds) => [...ds, d]);
    editElsewhere(d.id);
    setFloat(null);
    window.getSelection()?.removeAllRanges();
  }

  function saveDraft(id, note) {
    const c = R.current.cur;
    if (!c) return;
    const v = note.trim();
    if (!v) return dropDraft(id);
    mutateDrafts(c.pr.number, (ds) => ds.map((d) => (d.id === id ? { ...d, note: v } : d)));
    setEditing(null);
  }

  function dropDraft(id) {
    const c = R.current.cur;
    if (!c) return;
    mutateDrafts(c.pr.number, (ds) => ds.filter((d) => d.id !== id));
    setEditing((e) => (e === id ? null : e));
  }

  // 编辑焦点切走时，把还没写字的那条草稿一并收掉——**唯一的 setEditing 入口**（置 null 也走它）。
  //
  // 2026-08-05 报障：划句按「涂归」建了草稿却没写字，转头去划下一句，editing 一切走，
  // 空草稿就留在原地。它退出编辑态后画的是 `.anno-note`（高度全靠内容撑），空内容 ⇒ 0px ⇒
  // 点不着；作罢钮只在编辑态里 ⇒ 删不掉；呈回闸门又拦「空批注不呈」 ⇒ 交不上。三头堵死。
  //
  // 口径与 saveDraft 的「存了个空的＝作罢」完全一致，这里只是补上**隐式**切走这条路径。
  // 不必担心误删正在写的：编辑中点正文只是 blur，editing 不动，textarea 照样挂着。
  function editElsewhere(next) {
    const c = R.current.cur;
    const prev = R.current.editing;
    if (c && prev && prev !== next) {
      mutateDrafts(c.pr.number, (ds) => ds.filter((d) => d.id !== prev || d.note.trim()));
    }
    setEditing(next);
  }

  // 地址栏跟着当前折/文档走。换篇、折→折、页内锚仍是 replaceState，免得返回键变成翻折。
  // P0 例外（手机档）：**清单 → 折**这一步 pushState 一次，返回键 / Safari 与 WKWebView 的
  // 侧滑返回就落回清单（popstate 见下一段）。只在手机档压栈：桌面清单常驻左栏，没有「清单页」
  // 可回，压了反倒让浏览器后退键把折关掉——桌面行为不变。
  // replaceState 一律带上 history.state，不能再传 null：那会把压栈时记的 {menxia} 标抹掉。
  useEffect(() => {
    const n = cur?.pr?.number ?? null;
    const h = histRef.current;
    const prev = h.prev;
    h.prev = n;
    if (h.popping) h.popping = false;          // popstate 引起的切换：栈已经在位，只同步地址
    else if (n != null && prev == null && isPhone()) {
      const listUrl = DEMO ? location.href : location.origin + location.pathname;
      history.replaceState({ ...(history.state || {}), menxia: 'list' }, '', listUrl);
      history.scrollRestoration = 'manual';   // 清单位置由我们按 listY 还原；交给浏览器会在清单渲出来之前就滚，落点不对
      history.pushState({ menxia: 'folder', pr: n }, '', listUrl);
    } else if (n != null && history.state?.menxia === 'folder') {
      history.replaceState({ ...history.state, pr: n }, '');  // 折里换折：顶掉栈顶，不叠
    }
    if (DEMO) return;
    const url = cur?.pr
      ? buildDeepLink(location.origin + location.pathname,
        { repo: gh.getRepoSlug(), prNumber: cur.pr.number, path: docPath })
      : location.origin + location.pathname;
    if (location.href !== url) history.replaceState(history.state, '', url);
  }, [cur?.pr?.number, docPath]);

  // 返回键 / 侧滑：落到清单项 → 回清单并还原滚动；落到折项（前进）→ 重开那一折。
  useEffect(() => {
    const onPop = (e) => {
      const st = e.state;
      const h = histRef.current;
      const { cur: c, prs: open, donePrs: done, dash: d } = R.current;
      if (st?.menxia === 'folder') {
        if (c?.pr.number === st.pr) return;
        const pr = [...open, ...done].find((p) => p.number === st.pr);
        if (pr) { if (!c) h.popping = true; openRef.current(pr); }
        return;
      }
      if (!c && !d) return;
      if (c) h.popping = true;
      setNavOpen(false); setMoreOpen(false); setCur(null); setDocPath(null); setDash(false);
      // Preact 的重渲在微任务里提交，setTimeout 0 时清单已经回到版面上、有高度可滚
      setTimeout(() => window.scrollTo(0, h.listY), 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // 文档/批注里的本仓 GitHub 链接 → app 内跳转（外链不拦，照常新窗口打开）
  const onDocClick = useCallback((e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');

    // ① 文档内相对链接：同折里有这个文件就换文档（双语互链就靠它），
    //    没有就开 GitHub 上的对应文件——绝不能放它去 Pages 源站撞 404
    const rel = resolveRelativeDocLink(href, docPath);
    if (rel) {
      e.preventDefault();
      const inFolder = cur?.docs?.some((f) => f.filename === rel);
      if (inFolder) {
        // 跨篇锚点（PAIN #86 残账）：`[[别篇#某节]]` 切篇后要落到目标节，不是页首。
        // resolveRelativeDocLink 只回文件路径（`#片段` 被它剥了），片段得从原始 href 现取；
        // 存进 jumpRef 让新篇渲染完那一拍再滚（异步时序照搬 #102 那条 scroll-to-line 的落点）。
        const hash = href.indexOf('#');
        const frag = hash < 0 ? '' : href.slice(hash + 1);
        if (frag && cur?.pr) jumpRef.current = { prNumber: cur.pr.number, path: rel, frag };
        setDocPath(rel);
        return;
      }
      const slug = gh.getRepoSlug();
      const ref = cur?.pr?.head?.sha;
      if (slug && ref) window.open(`https://github.com/${slug}/blob/${ref}/${rel}`, '_blank', 'noopener');
      else say(S.doc.relLinkMissing(rel));
      return;
    }

    // ② 本仓 GitHub permalink：拦成 app 内跳转（F6）
    const parsed = parseZhupiLink(href, gh.getRepoSlug() || (DEMO ? 'demo/repo' : ''));
    if (!parsed) return;
    e.preventDefault();
    jumpTo(parsed);
  }, [prs, donePrs, cur, docPath]);

  // 页内锚点 `[…](#slug)`。**挂在 `.work` 上而不是 `.read-row`**：折首说明、判、其他串
  // 都在 read-row 之外，那里写的 `#某节` 会走浏览器原生跳转——既不闪、也不过三级放宽，
  // 还会往地址栏挂一截 hash（地址栏是深链的载体，脏了「拷直达链」就跟着脏）。
  // 正文里的锚同样从这里过：`.read-row` 的 onDocClick 对 `#` 开头一律不认（①② 都返 null），
  // 不 preventDefault，冒泡上来正好由这里接住，两条路不会互相抢。
  const onAnchorClick = useCallback((e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    // 修饰键/中键：读者是想「在新标签打开」，那是浏览器的活，别抢（抢了就永远开不了新窗）
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    const frag = a.getAttribute('href').slice(1);
    // 光秃秃一个 `#` 是「回到顶部」的老写法。拦下却什么都不做＝把它变成按不动的死钮
    // （2026-08-06 双查第二轮抓到，是上一轮修复亲手造的）——既然拦了，就得把它原本的活干了。
    if (frag) jumpToAnchor(frag);
    else scroller().scrollTo({ top: 0 });
  }, [docPath]);

  // 「引用此处」：把当前选中处拷成一条 GitHub permalink + 引文，粘进别的涂归即成链接
  async function copyRef(e) {
    const a = A.computeAnchor(docRef.current);
    const slug = gh.getRepoSlug() || 'demo/repo';
    // 默认给「涂归直达链」（点了直接进 app 读到那一段）；按住 Alt 给 GitHub permalink
    const wantGithub = Boolean(e?.altKey);
    const md = wantGithub
      ? (a ? buildRef({ slug, path: docPath, line: a.line, quote: a.quote, ref: curRevSha })
           : buildRef({ slug, prNumber: cur?.pr?.number }))
      : (() => {
          const url = buildDeepLink(location.origin + location.pathname,
            { repo: slug, prNumber: cur?.pr?.number, path: a ? docPath : null, line: a?.line });
          const q = (a?.quote || '').trim().slice(0, 60);
          return q ? `[「${q}」](${url})` : url;
        })();
    try { await navigator.clipboard.writeText(md); say(S.ref.copied(`${md.slice(0, 60)}${md.length > 60 ? '…' : ''}`)); }
    catch { say(S.ref.copyFailed(md)); }
  }

  // F12 携卷：把整折拼成自包含 markdown 拷进剪贴板，粘给任意 agent 接续。
  // 正文按需取（docs 只存元数据，正文是懒加载的）——走 getFileText 这条已有路径补齐每篇，
  // 不造新 API。批注串 / 判 / 拍板点本就在内存里，直接喂纯函数 assembleCarry（拼装逻辑单测在那）。
  async function carryOut() {
    const pr = R.current.cur?.pr;
    if (!pr) return;
    if (carrying) return;
    setCarrying(true);
    try {
      const ref = curRevSha || pr.head?.sha;
      const mdFiles = (R.current.cur.docs || []).filter((f) => f.filename.endsWith('.md'));
      // 每篇正文并行取（当前读的那一篇也照取一遍：便宜，且省得把 DOM 反解析回 markdown）。
      // 单篇失败不拖垮整卷——取不到就留 null，assembleCarry 落个占位。
      const docs = await Promise.all(mdFiles.map(async (f) => {
        let text = null;
        try { text = await api.getFileText(f.filename, ref); } catch { /* 单篇取不到不阻断 */ }
        return { path: f.filename, lang: variantOf(f.filename)?.lang || null, text };
      }));
      if (R.current.cur?.pr.number !== pr.number) return; // 组装期间切了折，丢弃
      if (!docs.some((d) => d.text != null) && mdFiles.length) {
        say(S.carry.empty);
        return;
      }
      const md = assembleCarry({
        pr: { number: pr.number, title: pr.title, url: pr.html_url, body: pr.body },
        docs,
        threads,
        zongpis,
        decisions: parseFolderBody(pr.body)?.decisions || null,
        deepLink: buildDeepLink(location.origin + location.pathname,
          { repo: gh.getRepoSlug() || undefined, prNumber: pr.number }),
        assembledAt: new Date().toLocaleString(),
        parseCommentBody: A.parseCommentBody,
        lang: curLangOf,   // 双语对只带在读的那篇；与 switchLang 同一个「当前语言」口径
      });
      const ok = await writeClipboard(md);
      if (ok) say(S.carry.done(md.length));
      else showCopyFallback(md);   // 大卷进不了剪贴板：弹可全选文本框，别把十万字塞进 notice
    } catch (err) {
      say(S.carry.failed(err.message));
    } finally {
      setCarrying(false);
    }
  }

  // F8 切语言：留在当前折当前篇，只换语言变体（找不到对应版就什么都不做）
  // 目标语言由参数决定，不是「翻到对面」——此前点已激活的语言键会把人翻到另一语言，
  // 且 chip 继续显示旧状态（第六轮评审）。当前语言一律从 docPath 派生，偏好只管默认选篇。
  function switchLang(next) {
    setLang(next);
    setLangState(next);
    if (curLangOf === next) return;                  // 已经在这个语言：只记偏好
    const sib = siblingFor(docPath, (cur?.docs || []).map((f) => f.filename));
    if (sib) setDocPath(sib);
  }

  // ── 搜索：标题即输即filter；回车翻全折全文（含归档），命中点击直达段落 ──
  async function runSearch() {
    const query = q.trim();
    if (query.length < 2 && prNumberOf(query) == null) return say(S.search.tooShort);
    const all = [...prs, ...donePrs];
    if (!indexRef.current) {
      setSearching(S.search.indexing);
      indexRef.current = await buildIndex(api, all, (d, t) => setSearching(S.search.indexingProgress(d, t)));
      setSearching('');
      // F13：索引里已备齐各折全文——顺带把「需核实」总数全算一遍喂列表角标，不另发请求。
      // 中英成对文档（foo.md ↔ foo.zh-CN.md）是同一批声明，按 base 归并取最大值，不重复计。
      setVerifyCounts((prev) => {
        const next = { ...prev };
        for (const { pr, files } of indexRef.current) {
          const byBase = new Map();
          for (const [path, text] of Object.entries(files)) {
            const base = variantOf(path)?.base || path;
            byBase.set(base, Math.max(byBase.get(base) || 0, countVerifyMarkers(text)));
          }
          next[pr.number] = [...byBase.values()].reduce((s, n) => s + n, 0);
        }
        return next;
      });
    }
    setHits(searchIndex(indexRef.current, query));
  }
  function clearSearch() { setQ(''); setHits(null); }
  // 选/清一个签。顺手把 `?qian=旅行` 映进地址栏（直达 + 可分享），清除则剥掉该参数。
  // 与 line 649 那处深链同一套 replaceState，不新开导航栈。
  function setQian(word) {
    setQianState(word);
    const url = new URL(location.href);
    if (word) url.searchParams.set('qian', word); else url.searchParams.delete('qian');
    if (location.href !== url.href) history.replaceState(history.state, '', url.href);
  }
  // 滚过去 + 闪一下。四个跳转入口（大纲 / 深链 / 搜索命中 / 页内锚点）共用一条落地动作，
  // 免得「跳到了但没闪」这种半截实现随新入口一个个长出来。
  function flashTo(el, block = 'start') {
    if (!el) return;
    el.scrollIntoView({ block });
    el.classList.add('search-flash');
    setTimeout(() => el.classList.remove('search-flash'), 1600);
  }
  // F14 大纲点标题：跳到当前文档里那一行。复用搜索/深链那条 scroll-to-line + 闪一下的路径
  // （找 data-line ≤ 目标行的最近块），不新造第二套定位逻辑。
  function jumpToLine(line) {
    const el = docRef.current;
    if (!el) return;
    let hit = null;
    el.querySelectorAll('[data-line]').forEach((b) => { if (+b.dataset.line <= line) hit = b; });
    flashTo(hit);
  }
  // 目录页点节之后的落地跳转。挂在 effect 里而不是点击回调里：点的那一刻正文还是
  // display:none（目录页占着版面），scrollIntoView 量到的几何全是 0，跳会静默丢失。
  // effect 在提交之后跑，那时 .work 已经回到版面上——顺序由 Preact 保证，不靠 rAF 赌。
  useEffect(() => {
    if (pendingJump == null || navOpen) return;
    jumpToLine(pendingJump);
    setPendingJump(null);
  }, [pendingJump, navOpen]);
  // 页内锚点 `[…](#slug)`：跳到本篇的那个标题（id 由 render.js 按 GitHub 口径生成）。
  // 用文档自己的标题集匹配，不用 getElementById——后者是**全文档**作用域，
  // 一个恰好叫 `doc`/`app`/`margin-col` 的 slug 会把读者送到界面骨架上去。
  function jumpToAnchor(raw) {
    const el = docRef.current;
    if (!el) return;
    let frag = raw;
    try { frag = decodeURIComponent(raw); } catch { /* 非法百分号编码：按字面匹配 */ }
    const heads = [...el.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')]
      .map((h) => ({ id: h.id, text: h.textContent || '', el: h }));
    const hit = matchAnchor(heads, frag);
    if (!hit) return say(S.jump.anchorMissing(frag));
    flashTo(hit.el);
  }
  // 章栏点某章：通读态滚到该章的 <section>（不换文档，整本还摊着）；分章态照旧切文档。
  function openChapter(path) {
    if (readThrough) {
      const sec = docRef.current?.querySelector(`.chapter-section[data-chapter="${(window.CSS?.escape ? CSS.escape(path) : path)}"]`);
      if (sec) flashTo(sec, 'start');
      return;
    }
    setViewed(null);
    setDocPath(path);
  }
  // 折间跳转：目标折在哪个栏自动切过去；带 path/line 就落到那一段
  function jumpTo({ prNumber, path, line }) {
    const all = [...prs, ...donePrs];
    const target = prNumber ? all.find((p) => p.number === prNumber) : cur?.pr;
    if (!target) return say(S.jump.folderMissing(prNumber));
    if (path) jumpRef.current = { prNumber: target.number, path, line: line || 1 };
    setTab(target.merged_at ? 'done' : 'open');
    if (target.number === cur?.pr?.number && path === docPath && line) {
      // 同折同文档：不用重开，直接滚
      const el = docRef.current;
      let hit = null;
      el?.querySelectorAll('[data-line]').forEach((b) => { if (+b.dataset.line <= line) hit = b; });
      flashTo(hit, 'center');
      return;
    }
    openPR(target);
  }

  function jumpToHit(pr, hit) {
    if (pr.number === cur?.pr?.number) return jumpTo({ prNumber: pr.number, path: hit.path, line: hit.line });
    jumpRef.current = hit.path ? { prNumber: pr.number, path: hit.path, line: hit.line || 1 } : null;
    // 点进去自动切到该折所在的栏（归档→已画可，open 闲折→读毕书架），视觉上不跳戏
    setTab(homeTabOf(pr));
    openPR(pr);
  }

  // ── 呈回 ──
  async function submitAll() {
    const c = R.current.cur;
    const ds = R.current.drafts;
    if (!c || !ds.length || R.current.busy) return;
    if (R.current.archived) return say(S.submit.archivedReadonly);
    if (!R.current.onHead) return say(S.submit.oldRevBlocked);
    if (R.current.editing) return say(S.submit.editingBlocked);
    const noteless = ds.filter((d) => !d.note.trim());
    if (noteless.length) return say(S.submit.emptyNotes(noteless.length));
    // 在途中世界可能变（切折/刷新）——入口快照，完成回调只认这份
    const prNumber = c.pr.number;
    const ref = c.pr.head.sha;
    const hunks = new Map();
    (c.files || []).forEach((f) => hunks.set(f.filename, A.validRightLines(f.patch)));
    const inline = [], fallback = [];
    ds.forEach((d) => {
      const stale = d.ref !== ref; // 旧版本草稿：行号可能漂移，宁降判不钉错行
      const set = hunks.get(d.path);
      if (!stale && set && set.has(d.line)) inline.push({ path: d.path, line: d.line, side: 'RIGHT', body: A.fmtDraft(d) });
      else fallback.push(d);
    });
    const body = fallback.length
      ? S.submit.fallbackBody(fallback.map(A.fmtDraft).join('\n\n---\n\n'))
      : S.submit.inlineBody(inline.length); // body 恒非空：COMMENT 的 body 是文档必填项，不赌空串
    setBusy(true);
    try {
      await api.submitReview(prNumber, { body, comments: inline, commitId: ref });
      A.saveDrafts(prNumber, []); // 直接清对应 key；内存只在世界没变时动
      if (R.current.cur?.pr.number === prNumber) setDrafts([]);
      loadComments(prNumber); // 重拉已呈串：让刚呈的立即出现在右缘（世界守卫在 loadComments 内）
      say(S.submit.done(inline.length, fallback.length));
    } catch (err) {
      say(S.submit.failed(err.message));
    } finally {
      setBusy(false);
    }
  }
  submitRef.current = submitAll;

  async function sendZongpi(text) {
    const c = R.current.cur;
    const v = text.trim();
    if (!c || !v || R.current.busy) return;
    setBusy(true);
    try {
      await api.createIssueComment(c.pr.number, v);
      setZongpi(false);
      loadComments(c.pr.number); // 重拉：让刚呈的判立刻显示在折首
      setZongpiOpen(true);       // 折叠组默认收起，自己刚发的那条必须展开给他看见——否则回到「只能发不能看」
      say(S.zongpi.sent);
    } catch (err) {
      // 断网（fetch 直接 reject，无 .status）→ 落 outbox 待发，别当发送失败丢掉他打的字。
      // 真错误（403/422 等有 .status）→ 照旧报错，那不是网络问题，排队也发不出去。
      const offline = !DEMO && typeof err?.status !== 'number' && (await enqueue(makeOutboxItem({ pr: c.pr.number, body: v, repo: gh.repoSlug?.() || '' })));
      if (offline) {
        setZongpi(false);
        await refreshOutboxN();
        say(S.zongpi.queued);
      } else {
        say(S.zongpi.failed(err.message));
      }
    } finally {
      setBusy(false);
    }
  }

  // ── 画可 ──
  async function qinci() {
    const c = R.current.cur;
    if (!c) return;
    if (!R.current.onHead) return say(S.merge.oldRevBlocked);
    const pr = c.pr;
    const pending = R.current.drafts.length;
    const warn = pending ? S.merge.pendingDraftsWarn(pending) : '';
    if (!confirm(S.merge.confirm(pr.number, pr.title, warn))) return;
    setBusy(true);
    try {
      if (pr.draft) {
        await api.markReady(pr.node_id);
        pr.draft = false; // 本地同步：merge 失败重试不再重打 markReady
      }
      await api.mergePR(pr.number, pr.head.sha); // 带 sha：agent 中途推新版则 409，所批即所合
      // 画可是「结束一件事」，不是「开始下一件事」：人不动、折不换，就地转只读。
      // 滚动位置和选中的文字都留着，他要复制什么复制完再自己踩「下一折」。
      // 本地补 merged_at 让 archived 当场为真（画可按钮、涂归入口随之关掉），不等清单回来；
      // 折号没变，取文那两个 effect 吃的是 cur.pr.number，不会重拉正文。
      // 另一半作用：cur 不为 null，loadPRs 里 `!R.current.cur` 那句守卫才真正生效——
      // 原先 setCur(null) 把它架空了，于是每次画可都自动顶开待审队首，人被拽走，正文也没了。
      setCur((c) => (c && c.pr.number === pr.number
        ? { ...c, pr: { ...c.pr, merged_at: new Date().toISOString() } }
        : c));
      const rest = await loadPRs();
      // 刚合的那折偶尔还挂在 open 清单里（GitHub 的清单有延迟），按折号剔掉
      const next = rest?.find((p) => p.number !== pr.number) || null;
      setNextUp(next);
      // loadPRs 开头会 setNotice('')，提示得压在它之后
      say(S.merge.done(pr.number) + (next ? '' : ` ${S.merge.queueEmpty}`));
    } catch (err) {
      say(S.merge.failed(err.message, pr.draft, pr.number));
    } finally {
      setBusy(false);
    }
  }

  // 已呈批注串的串线——hooks 必须在任何 early-return 之前（Rules of Hooks，第四轮评审 B：
  // 原先在 return 之后，靠 Preact「新 hook 恒在末位」侥幸不炸）
  const threads = useMemo(() => A.threadComments(comments), [comments]);

  // ── 视图 ──
  if (phase === 'boot') return null;
  if (phase === 'setup') return html`<${Setup} msg=${setupMsg} onSave=${onSaveToken}
    canCancel=${Boolean(gh.getToken() && gh.getRepoSlug())}
    onCancel=${() => { setSetupMsg(''); setPhase('app'); if (!prs.length) loadPRs(); }}
    onForget=${() => { gh.clearToken(); setSetupMsg(S.setup.tokenCleared); }} />`;

  const docDrafts = drafts.filter((d) => d.path === docPath);
  const others = drafts.length - docDrafts.length;
  const timeAgo = (iso) => {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 60) return S.time.minutesAgo(mins);
    if (mins < 1440) return S.time.hoursAgo(Math.round(mins / 60));
    return S.time.daysAgo(Math.round(mins / 1440));
  };

  // 已呈批注串：按能否定位到当前文档分两组
  const docThreads = [], otherThreads = [];
  threads.forEach((t) => {
    const r = t.root;
    const outdated = r.line == null;
    // outdated（line=null）先拿引文在当前版正文里反查行号；original_line 是旧版行号，
    // 直接拿它对齐会把卡片贴到错误的段落上（PAIN 2026-07-28 #14），只当反查失败的兜底。
    const reanchored = outdated
      ? A.reanchorByQuote(docRef.current, A.parseCommentBody(r.body).quote)
      : null;
    const anchorLine = r.line ?? reanchored ?? r.original_line;
    if (r.path === docPath && anchorLine != null) docThreads.push({ t, blockLine: anchorLine, outdated });
    else otherThreads.push(t);
  });
  docThreads.sort((a, b) => a.blockLine - b.blockLine);

  // 草稿卡与已呈串必须合并排序再渲染：layoutCards 是单调下压式堆叠，
  // 两组各自有序会把串卡整体压到全部草稿之下、离锚点任意远（第四轮评审 A）
  // 通读态右缘不摆涂归卡：草稿本就画不出（只读），已呈串锚在单章行号上、拼本后会对错段，
  // 一律不渲染最诚实（切回分章视图它们原样回来）。判走的是另一条（顶栏 / 判折叠块），不受影响。
  const marginItems = readThrough ? [] : [
    ...docDrafts.map((d) => ({
      blockLine: d.blockLine,
      el: html`<${DraftCard} key=${d.id} d=${d} doc=${docRef.current} editing=${editing === d.id}
        onEdit=${editElsewhere} onSave=${saveDraft} onDrop=${dropDraft} />`,
    })),
    ...docThreads.map(({ t, blockLine, outdated }) => ({
      blockLine,
      el: html`<${ShownThread} key=${'c' + t.root.id} t=${t} blockLine=${blockLine} outdated=${outdated}
        hydrate=${hydrateComment} onExpand=${setViewThread} />`,
    })),
  ].sort((a, b) => a.blockLine - b.blockLine);

  // 展读浮窗按 id 现查现渲：串本身仍归 comments 那份 state 管，回话到了浮窗跟着更新。
  // 串被删/切了文档就查不到 → 自然不渲染，不必再写一路清理。
  const viewing = viewThread == null ? null : docThreads.find(({ t }) => t.root.id === viewThread);

  // rev 序列升序（旧→新）标 v 号；vN=head——demo smoke 依赖升序取首个当 v1
  const revs = commits.map((c, i) => ({
    sha: c.sha,
    v: i + 1,
    isHead: c.sha === headSha,
    when: c.commit?.committer?.date || c.commit?.author?.date,
  }));
  const curRevSha = viewed || headSha;
  // F8：当前篇有语言变体才出切换 chip（单语折一切照旧，不添噪音）
  const langSibling = cur?.docs ? siblingFor(docPath, cur.docs.map((f) => f.filename)) : null;
  // 只有当前篇真属于双语对时才从 docPath 派生语言；单语文档（无 .zh-CN 变体）一律按偏好，
  // 否则 `demo.md` 会被 variantOf 判成「英文」把整排 tab 翻成英文版（本轮自查踩到）
  const curLangOf = langSibling ? (variantOf(docPath)?.lang || lang) : lang;

  // F14：章多时用下拉取代 tab 条（双语已合并计数）；篇内大纲够长才出浮栏。
  const docNames = cur?.docs ? cur.docs.map((f) => f.filename) : [];
  const useChapterList = shouldUseChapterList(docNames, curLangOf);
  const chapters = useChapterList ? chapterList(docNames, docPath, curLangOf) : [];
  // 通读入口：折里有 >1 篇（双语已合并）就给「通读全书」开关，不必等到 >7 章
  const multiChapter = cur?.docs ? visibleDocs(docNames, curLangOf).length > 1 : false;
  const showOutline = hasOutline(outlineItems);
  // 目录页的「篇」栏：**不看 CHAPTER_LIST_THRESHOLD**。那个阈值(>7)是给桌面决定
  // 「章列表还是 doc-tab 胶囊」用的版式判断；目录页要的是「这折有哪几篇」，两篇也得列。
  const navChapters = cur?.docs ? chapterList(docNames, docPath, curLangOf) : [];

  // 回折清单（手机三层导航的最上一层）。与 onRefresh 的清空同一套，只是不重拉列表。
  // P0：进折时压过栈（手机档）就走 history.back()，与侧滑返回同一条路——栈不漂、清单回原位。
  const backToList = () => {
    if (history.state?.menxia === 'folder') { history.back(); return; }
    setNavOpen(false); setCur(null); setDocPath(null); setDash(false);
  };
  // 这折里没有篇也没有节时，目录页只剩一行「‹ 全部折子」——那是个死胡同页，
  // 不如让「‹ 目录」直接回清单。规则讲得通：目录给你看这层里面有什么，里面空的就退回上一层。
  const hasNav = navChapters.length > 1 || showOutline;
  const onNavBtn = () => (hasNav ? setNavOpen(true) : backToList());
  // 点一节：先关目录页，等正文真的回到版面上再滚。
  // flashTo 靠 scrollIntoView 定位，而正文在目录页开着时是 display:none —— 几何全是 0，
  // 滚不动也闪不出来。**不能用 requestAnimationFrame 兜**：实测那一帧里 DOM 还没换完，
  // 跳整个静默丢失（scrollY 0→0、.search-flash 没挂上）。改成把行号存进 state，
  // 由 useEffect 在提交之后跑——那时 .work 已经回来了，是 Preact 保证的顺序，不是赌时序。
  const jumpFromNav = (line) => { setNavOpen(false); setPendingJump(line); };

  // ── 左栏拖宽（2026-08-26）──
  //
  // 存的是**他想要的宽度**，不是最终生效的宽度。两者分开是为了「窗口临时变窄再变回来」
  // 这个常见动作：若把夹逼后的值写回 state，缩一次窗口就把他的偏好永久削掉了，拉回去也
  // 回不来。所以 railW 原样留着，生效值每次渲染现夹（appliedRail）。
  //
  // 几何不在 JS 里算，量 .geom-probe 的 offsetWidth 拿——理由见 rail.js 文件头。
  const [stageBox, setStageBox] = useState(null);
  // 版心内两栏同样只存「想要的宽度」，生效值每次渲染现夹——理由同 railW，见上一段。
  const [artW, setArtW] = useState(() => getColWidth(ART_KEY));
  const [tocW, setTocW] = useState(() => getColWidth(TOC_KEY));
  const [indentW, setIndentW] = useState(() => getColWidth(INDENT_KEY));
  const [railBox, setRailBox] = useState(null);
  const [winW, setWinW] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  const measureGeom = () => {
    setStageBox(probeRef.current ? probeRef.current.offsetWidth : null);
    // 左栏实宽只能量，不能从 railW 推：它没拖过时是 CSS 的响应式默认（300 / 240），
    // 而那个默认值写在 style.css 的媒体查询里，JS 这边复制一份必然失同步。
    const aside = document.querySelector('#app > aside');
    setRailBox(aside ? aside.offsetWidth : null);
  };
  useLayoutEffect(() => {
    const measure = () => { measureGeom(); setWinW(window.innerWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // 量不到探针（老浏览器 / 还没挂上）就一律退回 CSS 默认：宁可没这个功能，也不要拿一个
  // 猜出来的上限把版式拖到横向溢出。
  const railCeil = stageBox == null ? null : railMax(winW, stageBox);
  const appliedRail = (railW != null && isResizable(winW) && railCeil != null)
    ? clampRail(railW, railCeil) : null;

  // 版心内两栏的生效值。存量偏好可能来自一台更宽的显示器，直接套上去就是横向溢出
  // （style.css 记过 1660–1709 那次实伤）。这里的收法有一处要讲清楚：
  //
  // `slack` 是**带着当前生效值量出来的**——探针的宽度算式里就含 --art-w / --toc-w。
  // 所以 slack < 0 就等于「这一帧已经溢出了这么多」，把它加到想要的宽度上正好是能容下的
  // 上限；下一帧重量时 slack 回到 ≈0，值就稳住了。单调递减且有 min 兜底，不会来回跳。
  // ⚠️ 收窄的结果**绝不写回 artW / tocW**：那是他想要的宽度，缩一次窗口就削掉的话，
  // 拉回宽屏也回不来了（railW 立过同一条规矩）。
  const slack = colSlack(winW, railBox, stageBox);
  const appliedArt = (artW != null && isColResizable(winW, ART_MIN_WINDOW) && slack != null)
    ? clampCol(artW, ART_MIN, artW + slack) : null;
  // 正文让出来的宽度归大纲用，否则两栏各按同一份 slack 收，会重复扣一次。
  const tocSlack = slack == null ? null : slack + (appliedArt == null ? 0 : artW - appliedArt);
  const appliedToc = (tocW != null && isColResizable(winW, TOC_MIN_WINDOW) && tocSlack != null)
    ? clampCol(tocW, TOC_MIN, tocW + tocSlack) : null;
  const appliedIndent = (indentW != null && isColResizable(winW, INDENT_MIN_WINDOW) && slack != null)
    ? clampCol(indentW, INDENT_MIN, indentW + slack) : null;

  // ── 三栏共用一套指针处理（2026-08-26 扩到正文与大纲）──
  //
  // rAF 节流、拖动中就地夹逼、收 pointercancel —— 这三件对三栏是同一件事，所以做成工厂。
  // 差别只有四处，全部做成入参：上限怎么算、往哪个 state 写、落哪个 key、以及**方向**。
  // 方向那条容易漏：左栏与正文的手柄在右缘，往右拖＝变宽（sign +1）；大纲的手柄在**左缘**，
  // 往左拖才是变宽（sign −1）。三个都写 +1 的话，大纲会往反方向跑。
  const makeGrip = ({ ceilOf, min, sign, target, setW, persist, onStart, onWant, persistNeighbor }) => (e) => {
    const ceil = ceilOf();
    if (ceil == null) return;
    e.preventDefault();
    const grip = e.currentTarget;
    const startX = e.clientX;
    const el = target(grip);
    if (!el) return;
    const startW = el.getBoundingClientRect().width;
    // 按下的那一刻把几何定格：拖动全程都拿它算「该向邻栏借多少」。
    // 不能每帧现量——量到的是上一帧已经被自己改过的值，会自激。
    const ctx = onStart ? onStart(startW) : null;
    let neighbor = null;
    grip.classList.add('dragging');
    document.getElementById('app')?.classList.add('rail-dragging');
    let raf = 0;
    let want = startW;
    const move = (ev) => {
      // 拖动中就地夹逼（而不是只夹显示值）：不夹的话越过上限还能继续拖，往回拉时会先走过
      // 一段没有任何反应的死区，手感像卡住了。
      want = clampCol(startW + sign * (ev.clientX - startX), min, ceil) ?? startW;
      neighbor = onWant ? onWant(want, ctx) : null;
      // 每帧最多提交一次：改栏宽会让版心重新居中、整页重排，不节流就是逐事件重排。
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; setW(want); });
    };
    const up = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      setW(want);
      persist(want);                 // 松手才落盘，拖动途中不写 localStorage
      if (neighbor != null && persistNeighbor) persistNeighbor(neighbor);
      grip.classList.remove('dragging');
      document.getElementById('app')?.classList.remove('rail-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // 触控板两指切页、系统手势打断时会来 pointercancel 而不是 pointerup；不收这个事件
    // 监听器就留在 window 上，下次点哪儿都在拖。
    window.addEventListener('pointercancel', up);
  };

  // ⚠️ --art-w 与 --toc-w **必须写在 :root（documentElement）上，不能写在 #app 行内**。
  //
  // 自定义属性里的 calc 在**定义它的那个元素**上就求完值了，后代只继承结果。而
  // --main-w / --toc-slot / --stage 三条派生式全定义在 :root：
  //     --main-w: calc(--art-indent + --art-w + --col-gap + --marg-w)
  //     --stage:  calc(--chap-slot + --main-w + --toc-slot)
  // 覆盖写在 #app 上时，只有直接读 --art-w / --toc-w 的 article 与 .toc 变宽，**版心算式
  // 完全不动**——于是几何探针量到的是过时的 stage，上限偏大，栏能拉出窗口。
  // 实测（2026-08-26）：--toc-w 覆盖成 320px 后，#app 上的 --toc-slot 仍是 calc(26px + 200px)，
  // 大纲右缘 1634 > 窗宽 1600，被**静默裁掉** 34px —— scrollWidth 仍是 1600，查不出来。
  //
  // 写到 :root 就让整条派生链在同一处重新求值，不用把 style.css 的断点算术复制第二份。
  // --rail-w 与 --read-scale 不参与派生链（左栏在版心之外），留在 #app 上不受影响。
  // 眉批栏空着就塌掉，把 300px 让给正文与大纲（2026-08-26 Charlie：「它周围明明有那么多空白？」）。
  // 判据要三个条件同时成立，少一个都会跳：
  //   · commentsLoaded —— 批注是异步拉的，没拉完就判等于每开一折先塌后弹
  //   · 栏里确实没有东西 —— 涂归卡 / 草稿卡 / 「其他文档还有 N 条」那行 / 判卡
  //   · 有折打开 —— 没开折时这栏压根不渲染，写不写都一样，但别留下脏变量
  // 通读态本来就不摆涂归卡（marginItems 恒为 []），所以它自然也会塌，这是对的。
  const margEmpty = Boolean(cur) && commentsLoaded && !zongpi
    && marginItems.length === 0 && others === 0;

  useLayoutEffect(() => {
    const st = document.documentElement.style;
    if (appliedArt == null) st.removeProperty('--art-w');
    else st.setProperty('--art-w', `${appliedArt}px`);
    if (appliedToc == null) st.removeProperty('--toc-w');
    else st.setProperty('--toc-w', `${appliedToc}px`);
    // 与上面两个同理，必须写在 :root：--marg-w 也在 --main-w 的算式里，
    // 写在 #app 上的话版心不会跟着缩，让出来的 300px 不会变成可用空隙。
    if (margEmpty) st.setProperty('--marg-w', '0px');
    else st.removeProperty('--marg-w');
    // --art-indent 同样在 --main-w 的算式里，理由同上
    if (appliedIndent == null) st.removeProperty('--art-indent');
    else st.setProperty('--art-indent', `${appliedIndent}px`);
  }, [appliedArt, appliedToc, appliedIndent, margEmpty]);

  // 版心一变就重量探针（2026-10-11）。原先只在挂载和 resize 时量：拖正文 / 大纲、眉批栏
  // 塌掉、左栏向版心借宽之后 stageBox 都是过时的，appliedRail 会被旧版心夹回去——左栏借到
  // 了宽度却显示不出来。必须写在上面那个 effect **之后**：同一次提交里 effect 按声明顺序跑，
  // 写在前面量到的是 :root 变量改之前的版心。
  useLayoutEffect(measureGeom, [appliedArt, appliedToc, appliedIndent, margEmpty, appliedRail, Boolean(cur)]);

  // 左栏的上限＝空隙 + 正文与大纲各自能让出来的（理由见 rail.js「版心让位」）。
  // 现量探针而不用 stageBox：按下这一刻的版心才是借宽的基准。
  const railLendOpts = (g) => ({
    art: isColResizable(window.innerWidth, ART_MIN_WINDOW) ? g.art : null, artMin: ART_MIN,
    toc: isColResizable(window.innerWidth, TOC_MIN_WINDOW) ? g.toc : null, tocMin: TOC_MIN,
  });
  const railFreeNow = () => {
    const box = probeRef.current ? probeRef.current.offsetWidth : null;
    return box == null ? null : railMax(window.innerWidth, box);
  };
  const onGripDown = makeGrip({
    ceilOf: () => {
      if (!isResizable(window.innerWidth)) return null;
      const free = railFreeNow();
      return free == null ? null : railCeilLending(free, railLendOpts(geomNow()));
    },
    min: RAIL_MIN, sign: +1,
    target: (grip) => grip.parentElement,
    setW: setRailW, persist: setRailWidth,
    // 按下时记下两栏原来的偏好（可能是 null＝CSS 默认）：往回拖到不用借时原样还回去。
    onStart: () => ({ free: railFreeNow() ?? 0, opts: railLendOpts(geomNow()), art0: artW, toc0: tocW }),
    onWant: (want, ctx) => {
      const lent = railLend(want, ctx.free, ctx.opts);
      setArtW(lent.art ?? ctx.art0);
      setTocW(lent.toc ?? ctx.toc0);
      return lent;
    },
    persistNeighbor: (lent) => {
      if (lent.art != null) setColWidth(ART_KEY, lent.art);
      if (lent.toc != null) setColWidth(TOC_KEY, lent.toc);
    },
  });

  // 版心内两栏的上限＝这一栏当前实宽 + 版心之外还剩的空隙，与 rail 那条不是一回事
  // （理由见 cols.js 文件头）。三个数在按下的那一刻现量：拖动全程上限不变，正好等于
  // 「你最多还能再撑开这么多」。
  // ── 版心内两栏：先吃空隙，吃完了**向邻栏借**（2026-08-26 改）──
  //
  // 上一版把空隙当成「一池公共余量，谁先拖谁吃光」，于是另一栏直接冻死：大纲拖到 320
  // 之后正文纹丝不动，而屏幕上明明还有一大片空白（Charlie：「它周围明明有那么多空白？」）。
  // 那个模型不对——用户看到的是三条并排的栏，把一条拉宽，宽度理应从**邻栏**来。
  //
  // 所以上限 = 本栏实宽 + 空隙 + 邻栏能让出来的（邻栏实宽 − 邻栏 min）。
  // 超出「本栏 + 空隙」的那一段，同步把邻栏收窄同样多。这样只要邻栏还在 min 之上，
  // 就永远不会出现「拖不动」。
  const geomNow = () => {
    const artEl = document.getElementById('doc');
    const tocEl = document.querySelector('.toc');
    return {
      art: artEl ? artEl.getBoundingClientRect().width : null,
      toc: tocEl ? tocEl.getBoundingClientRect().width : null,
      slack: colSlack(window.innerWidth, railBox,
        probeRef.current ? probeRef.current.offsetWidth : null),
    };
  };
  const lendable = (cur, min) => (cur == null ? 0 : Math.max(0, cur - min));

  const onArtGripDown = makeGrip({
    ceilOf: () => {
      if (!isColResizable(window.innerWidth, ART_MIN_WINDOW)) return null;
      const g = geomNow();
      if (g.art == null || g.slack == null) return null;
      return Math.max(ART_MIN, g.art + g.slack + lendable(g.toc, TOC_MIN));
    },
    min: ART_MIN, sign: +1,
    target: () => document.getElementById('doc'),
    setW: setArtW, persist: (px) => setColWidth(ART_KEY, px),
    onStart: (startW) => { const g = geomNow(); return { free: startW + (g.slack ?? 0), toc: g.toc }; },
    onWant: (want, ctx) => {
      if (ctx.toc == null) return null;
      const over = Math.max(0, want - ctx.free);
      const next = Math.max(TOC_MIN, Math.round(ctx.toc - over));
      setTocW(next);
      return next;
    },
    persistNeighbor: (px) => setColWidth(TOC_KEY, px),
  });

  const onTocGripDown = makeGrip({
    ceilOf: () => {
      if (!isColResizable(window.innerWidth, TOC_MIN_WINDOW)) return null;
      const g = geomNow();
      if (g.toc == null || g.slack == null) return null;
      return Math.max(TOC_MIN, g.toc + g.slack + lendable(g.art, ART_MIN));
    },
    min: TOC_MIN, sign: -1,
    target: () => document.querySelector('.toc'),
    setW: setTocW, persist: (px) => setColWidth(TOC_KEY, px),
    onStart: (startW) => { const g = geomNow(); return { free: startW + (g.slack ?? 0), art: g.art }; },
    onWant: (want, ctx) => {
      if (ctx.art == null) return null;
      const over = Math.max(0, want - ctx.free);
      const next = Math.max(ART_MIN, Math.round(ctx.art - over));
      setArtW(next);
      return next;
    },
    persistNeighbor: (px) => setColWidth(ART_KEY, px),
  });

  // 正文左缩进。手柄在正文**左缘**，但方向是 +1：往右拖＝缝变宽（缩进变大），
  // 手柄本身也跟着往右走，光标始终压在它上面。
  // 空隙吃完之后向**正文自己**借——于是右缘钉住不动，左缘跟着光标，
  // 这正是「拖一个盒子的左边」该有的手感。
  const onIndentGripDown = makeGrip({
    ceilOf: () => {
      if (!isColResizable(window.innerWidth, INDENT_MIN_WINDOW)) return null;
      const g = geomNow();
      if (g.slack == null) return null;
      const cur = document.getElementById('doc');
      if (!cur) return null;
      const indent = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--art-indent')) || 0;
      return Math.max(INDENT_MIN, indent + g.slack + lendable(g.art, ART_MIN));
    },
    min: INDENT_MIN, sign: +1,
    // 量的是缩进本身，不是某个元素的盒子——用 article 的左缘减去 .stage-main 的左缘
    target: () => {
      const a = document.getElementById('doc'); const sm = document.querySelector('.stage-main');
      if (!a || !sm) return null;
      const w = a.getBoundingClientRect().left - sm.getBoundingClientRect().left;
      return { getBoundingClientRect: () => ({ width: w }) };
    },
    setW: setIndentW, persist: (px) => setColWidth(INDENT_KEY, px),
    onStart: (startW) => { const g = geomNow(); return { free: startW + (g.slack ?? 0), art: g.art }; },
    onWant: (want, ctx) => {
      if (ctx.art == null) return null;
      const over = Math.max(0, want - ctx.free);
      const next = Math.max(ART_MIN, Math.round(ctx.art - over));
      setArtW(next);
      return next;
    },
    persistNeighbor: (px) => setColWidth(ART_KEY, px),
  });

  // 双击归位：删存量值，交还给 CSS 的响应式默认。
  const onGripReset = () => { setRailW(null); clearRailWidth(); };
  const onArtGripReset = () => { setArtW(null); clearColWidth(ART_KEY); };
  const onTocGripReset = () => { setTocW(null); clearColWidth(TOC_KEY); };
  const onIndentGripReset = () => { setIndentW(null); clearColWidth(INDENT_KEY); };

  return html`
    ${/* `reading` 只喂 ≤900 的手机档：那一档把清单页与阅读页做成二选一（见 style.css
         「手机二级菜单」那段），桌面完全不读这个 class。总览(dash)也算「进去了」——
         它渲在 main 里，不跟着切的话点开总览会被清单顶到屏幕外。 */ ''}
    <div id="app" class=${(cur || dash ? 'reading' : '') + (navOpen ? ' navpage' : '')}
      ${/* 三栏宽度都以 CSS 变量写在这里（同 --read-scale 的先例）：JS 不碰具体样式，
           改版式时只动 style.css。null＝没拖过，那一栏交还给 CSS 的响应式默认。 */ ''}
      style=${appliedRail == null
        ? { '--read-scale': scaleOf(readStep) }
        : { '--read-scale': scaleOf(readStep), '--rail-w': `${appliedRail}px` }}>
      ${/* 版心几何探针：宽度由 CSS 自己算，JS 只量。见 style.css 的 .geom-probe。
           position:fixed，不占 #app 这行 flex 的位子。 */ ''}
      <div class="geom-probe" ref=${probeRef} aria-hidden="true"></div>
      <${Sidebar} q=${q} hits=${hits} searching=${searching} prs=${prs} donePrs=${donePrs}
        tab=${tab} cur=${cur} demo=${DEMO} timeAgo=${timeAgo} checks=${checks} verifyCounts=${verifyCounts}
        qian=${qian} onQian=${setQian}
        onQuery=${(v) => { setQ(v); if (hits) setHits(null); }}
        onSearch=${runSearch} onClearSearch=${clearSearch} onJumpToHit=${jumpToHit}
        onTab=${(t) => { setTab(t); setDash(false); }} onOpenPR=${(pr) => { setDash(false); openPR(pr); }}
        onOpenElsewhere=${(pr, t) => { setTab(t); setDash(false); openPR(pr); }}
        onDash=${() => setDash((d) => !d)}
        onSettings=${() => { setPhase('setup'); setSetupMsg(''); }}
        onGripDown=${onGripDown} onGripReset=${onGripReset} />
      <main>
        <${Topbar} cur=${cur} archived=${archived} onHead=${onHead} busy=${busy}
          draftCount=${drafts.length} verifyN=${verifyN} happyUrl=${happyUrl} stale=${stale} notice=${notice}
          carrying=${carrying}
          nextUp=${nextUp} onNextUp=${() => { setTab('open'); openPR(nextUp); }}
          onNoticeClose=${() => setNotice('')}
          readStep=${readStep} moreOpen=${moreOpen} onMore=${() => setMoreOpen((o) => !o)}
          updating=${updating}
          onUpdate=${() => { setUpdating(true); say(S.stale.updating); hardUpdate([...BUILD_FILES, ...VENDOR_FILES]); }}
          onReadStep=${(i) => { const c = clampStep(i); setReadStepState(c); setReadStep(c); }}
          onRefresh=${() => { setCur(null); setDocPath(null); loadPRs(); }}
          onCopyRef=${copyRef} onCarry=${carryOut} onZongpi=${() => setZongpi((z) => !z)}
          onSubmit=${submitAll} onQinci=${qinci} />
        ${dash && html`
          <${Dashboard} prs=${prs} donePrs=${donePrs} cur=${cur} timeAgo=${timeAgo}
            onOpen=${(pr) => { setDash(false); openPR(pr); }}
            onOpenNum=${(n) => {
              const target = [...prs, ...donePrs].find((p) => p.number === n);
              if (!target) { say(S.deepLink.folderNotFound(n)); return; }
              setDash(false);
              setTab(target.merged_at ? 'done' : 'open');
              openPR(target);
            }}
            onClose=${() => setDash(false)} />`}
        ${navOpen && cur && html`
          <${NavPage} chapters=${navChapters} outline=${outlineItems}
            onFolders=${backToList}
            onChapter=${(p) => { setViewed(null); setDocPath(p); }}
            onSection=${jumpFromNav} />`}
        ${/* 总览开着时**藏**读折区而不是卸载它：#doc 是 ref 挂的岛屿，
             卸载会连同已渲染的正文与批注锚点一起丢，回来要整篇重取重渲。 */ ''}
        <div class=${'work' + (dash ? ' work-hidden' : '')} onClick=${onAnchorClick}>
        <div class="stage-row">
          ${cur?.docs?.length > 1 && useChapterList && html`
            <${ChapterRail} chapters=${chapters} onOpenChapter=${openChapter} />`}
        <div class="stage-main">

          ${/* M2 离线包：三条不占常驻空间的提示，状态为空时一律不渲染（默认态不影响任何既有断言）。 */ ''}
          ${outboxN > 0 && html`
            <div class="offline-bar offline-outbox">${S.offline.outbox(outboxN)}</div>`}
          ${offlineAt && html`
            <div class="offline-bar offline-copy">${S.offline.copy(timeAgo(offlineAt))}</div>`}
          ${resumeBar && html`
            <div class="offline-bar offline-jump">
              <span>${S.offline.jumpAsk}</span>
              <button class="offline-jump-go" onClick=${jumpToReadState}>${S.offline.jumpGo}</button>
              <button class="offline-jump-no" onClick=${() => setResumeBar(null)}>${S.offline.jumpDismiss}</button>
            </div>`}

          ${multiChapter && html`
            <div class="read-through-bar">
              <button class=${'read-through-toggle' + (readThrough ? ' on' : '')}
                aria-pressed=${readThrough}
                title=${readThrough ? S.readThrough.offTitle : S.readThrough.onTitle}
                onClick=${() => { setViewed(null); setReadThrough((v) => !v); }}>
                ${readThrough ? S.readThrough.off : S.readThrough.on}
              </button>
              ${readThrough && html`<span class="read-through-hint">${S.readThrough.readonlyHint}</span>`}
            </div>`}
          ${cur?.docs?.length > 1 && useChapterList && html`
            <${ChapterList} chapters=${chapters} onOpenChapter=${openChapter} />`}
          ${cur?.docs?.length > 1 && !useChapterList && html`
            <div class="doc-tabs">
              ${cur.docs.filter((f) => visibleDocs(cur.docs.map((x) => x.filename), curLangOf).includes(f.filename)).map((f) => html`
                <button key=${f.filename} class=${'doc-tab' + (f.filename === docPath ? ' active' : '')}
                  title=${f.filename} onClick=${() => { setViewed(null); setDocPath(f.filename); }}>
                  ${f.filename.split('/').pop().replace(/\.zh-CN\.md$/i, '.md')}
                </button>`)}
            </div>`}
          ${cur && revs.length > 1 && html`
            <div class="rev-row">
              <span class="rev-label">${S.rev.label}</span>
              <div class="rev-switch">
                ${revs.map((r) => html`
                  <button key=${r.sha}
                    class=${'rev-opt' + (r.sha === curRevSha ? ' active' : '')}
                    title=${S.rev.optionTitle(r.v, r.sha.slice(0, 7), r.when ? ' · ' + timeAgo(r.when) : '', r.isHead)}
                    onClick=${() => setViewed(r.isHead ? null : r.sha)}>
                    v${r.v}${r.isHead ? '' : ' · ' + r.sha.slice(0, 7)}
                  </button>`)}
              </div>
            </div>`}
          ${cur && archived && html`
            <p class="rev-notice">${S.rev.archivedNotice}</p>`}
          ${cur && !archived && !onHead && html`
            <p class="rev-notice">${S.rev.oldRevNotice(revs.find((r) => r.sha === curRevSha)?.v ?? '?')}</p>`}
          ${cur && html`<${FolderBody} body=${cur.pr.body} open=${bodyOpen}
            onToggle=${() => setBodyOpen((o) => !o)} hydrate=${hydrateComment} />`}
          ${cur && html`<${ZongpiShown} zongpis=${zongpis} open=${zongpiOpen}
            onToggle=${() => setZongpiOpen((o) => !o)} hydrate=${hydrateComment} />`}
          ${langSibling && html`
            <div class="lang-switch" title=${S.docLang.switchTitle}>
              <button class=${'lang-opt' + (curLangOf === 'zh' ? ' active' : '')} onClick=${() => switchLang('zh')}>${S.docLang.zh}</button>
              <button class=${'lang-opt' + (curLangOf === 'en' ? ' active' : '')} onClick=${() => switchLang('en')}>${S.docLang.en}</button>
            </div>`}
          <div class="read-row" onClick=${onDocClick}>
            ${docErr ? html`<article id="doc"><p class="state err">${docErr}</p></article>`
              : html`<article id="doc" key="doc-island" ref=${docRef}></article>`}
            <div id="margin-col" class="margin-col">
              ${zongpi && html`<${ZongpiCard} busy=${busy} onSend=${sendZongpi} onClose=${() => setZongpi(false)} />`}
              ${marginItems.map((m) => m.el)}
              ${others > 0 && html`<p class="margin-note">${S.margin.otherDocs(others)}</p>`}
            </div>
          </div>
          <${OtherThreads} threads=${otherThreads} open=${otherOpen}
            onToggle=${() => setOtherOpen((o) => !o)} hydrate=${hydrateComment} />
          ${/* 正文列的拖宽手柄。挂在 .stage-main 而不是 .read-row 上：正文之上还摞着
               折子说明 / tab 条 / 判 / 语言钮，那一摞在 .read-row 之外——手柄只跟着
               .read-row 的话，顶部会有一整段（实测 680px）抓不到，而**打开一折默认
               就停在顶部**，等于多数时候没有手柄（2026-08-26 Charlie 报「最上面的
               总结方块拖不动」，根因就是这个）。
               ⚠️ 仍排在末尾且带 key：这一列里有 #doc 那个 keyed 岛，无 key 的兄弟插在
               keyed 子节点前面会让 preact 复用错节点、废掉选区。 */ ''}
          <button key="indent-grip" class="indent-grip" aria-hidden="true" tabindex="-1"
            onPointerDown=${onIndentGripDown} onDblClick=${onIndentGripReset}></button>
          <button key="art-grip" class="art-grip" aria-hidden="true" tabindex="-1"
            onPointerDown=${onArtGripDown} onDblClick=${onArtGripReset}></button>
        </div>
        ${cur && !docErr && showOutline && !readThrough && html`
          <${Outline} items=${outlineItems} docRef=${docRef} onJump=${jumpToLine}
            onGripDown=${onTocGripDown} onGripReset=${onTocGripReset} />`}
        </div>
        </div>
      </main>
      ${cur && html`<${ScrollEnds} tick=${`${docTick}:${docPath}`} />`}
      ${cur && html`
        <nav class="mobile-bar" aria-label=${S.mobileBar.label}>
          ${/* 目录页上只留「‹ 正文」一颗：判/涂归/画可 是对着正文的动作，浏览目录时按不着，
               留在那儿只会占宽度。也不能把「回正文」和「回折清单」并排——两个反方向的返回
               挤一条栏必然认错一个，所以「‹ 全部折子」放在目录页自己的顶上。 */ ''}
          ${navOpen ? html`
            <button class="mobile-bar-btn mobile-bar-back" title=${S.mobileBar.backToDocTitle}
              onClick=${() => setNavOpen(false)}>${S.mobileBar.backToDoc}</button>` : html`
          ${/* 返回钮待在底栏而不是顶栏：顶栏随正文滚走，读到第五屏想换折就得先滚回顶
               ——正是 PAIN 那条「控件离正文越远＝越不存在」。底栏是 fixed，永远够得着。 */ ''}
          <button class="mobile-bar-btn mobile-bar-back" title=${S.mobileBar.backTitle}
            onClick=${onNavBtn}>${S.mobileBar.back}</button>
          <button class="mobile-bar-btn" title=${archived ? S.action.zongpiArchivedTitle : ''}
            onClick=${() => setZongpi((z) => !z)}>${S.action.zongpi}</button>
          ${drafts.length > 0 && html`
            <button class="mobile-bar-btn mobile-bar-submit" disabled=${busy || !onHead}
              title=${onHead ? '' : S.action.submitOldRevTitle} onClick=${submitAll}>
              ${busy ? S.action.sending : S.action.submit(drafts.length)}
            </button>`}
          ${!archived && html`
            <button class="mobile-bar-btn mobile-bar-qinci" disabled=${busy || !onHead}
              title=${onHead ? '' : S.action.mergeOldRevTitle} onClick=${qinci}>${S.action.merge}</button>`}`}
        </nav>`}
      ${float && html`
        <button class="zhupi-float" style=${{ left: `${Math.min(float.rect.left + 8, window.innerWidth - 76)}px`, top: `${float.rect.top + 6}px` }}
          onMouseDown=${(e) => e.preventDefault()} onClick=${addDraft}>${S.action.annotate}</button>`}
      ${viewing && html`
        <${ThreadView} key=${'v' + viewing.t.root.id} t=${viewing.t} blockLine=${viewing.blockLine}
          outdated=${viewing.outdated} hydrate=${hydrateComment} onClose=${() => setViewThread(null)} />`}
      ${zoomImg && html`
        <${ImageView} key=${'img' + zoomImg.src} src=${zoomImg.src} alt=${zoomImg.alt}
          onClose=${() => setZoomImg(null)} />`}
    </div>`;
}

render(html`<${App} />`, document.getElementById('root'));
