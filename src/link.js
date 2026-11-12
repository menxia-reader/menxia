// 折间链接（纯逻辑）——格式就用 GitHub 原生 permalink，不发明私有语法。
// 理由：这样在 GitHub 上是正常链接、agent 读得懂，涂归只是把它「拦下来」变成 app 内跳转。
// 镜片仍是镜片：链接图谱不是新数据，只是 markdown 里的普通 URL。

// 认得三种（都限本仓，跨仓一律当外链放行）：
//   .../pull/7                                → 跳到第 7 折
//   .../pull/7/files#diff-<hash>R42           → GitHub 划行链接（取不到路径，只能到折）
//   .../blob/<ref>/docs/a.md#L42              → 文件行链接，能精确到文档 + 行
//   .../pull/7#discussion_r123                → 某条批注（跳到折，批注串本来就在右缘）
export function parseZhupiLink(href, slug) {
  if (!href || !slug) return null;
  let u;
  try { u = new URL(href, 'https://github.com'); } catch { return null; }
  if (u.hostname !== 'github.com') return null;
  const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
  const [owner, repo, kind, ...rest] = parts;
  if (`${owner}/${repo}`.toLowerCase() !== slug.toLowerCase()) return null; // 别的仓：当外链

  if (kind === 'pull' && rest[0]) {
    const num = parseInt(rest[0], 10);
    if (!Number.isFinite(num)) return null;
    return { prNumber: num, path: null, line: lineFromHash(u.hash) };
  }
  if (kind === 'blob' && rest.length >= 2) {
    // blob/<ref>/<path...>：ref 可能含斜杠（分支名），但文档路径恒以 docs/ 开头，从那切
    const docsAt = rest.findIndex((p) => p === 'docs');
    if (docsAt < 1) return null;
    return { prNumber: null, path: rest.slice(docsAt).join('/'), line: lineFromHash(u.hash) };
  }
  return null;
}

// #L42 / #L42-L50 / ...R42（GitHub diff 行锚）
function lineFromHash(hash) {
  if (!hash) return null;
  const m = /#L(\d+)/.exec(hash) || /[LR](\d+)$/.exec(hash);
  return m ? parseInt(m[1], 10) : null;
}

// 「引用此处」按钮拷给你的东西：一条 GitHub permalink + 一句引文
// 引文是给人和 agent 看的兜底——链接哪天漂了，至少还知道当初指的是哪句（同锚定哲学）
// ref 必须是当前读的那个 commit：敕草是 PR 新增的文件，merge 前 main 上根本不存在，
// 指向 main 的链接生下来就 404（第六轮评审实证）。带 sha 还顺带保证「所引即所读」。
export function buildRef({ slug, prNumber, path, line, quote, ref }) {
  const base = `https://github.com/${slug}`;
  const url = path
    ? `${base}/blob/${ref || 'main'}/${path}#L${line || 1}`
    : `${base}/pull/${prNumber}`;
  const q = (quote || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return q ? `[「${q}」](${url})` : url;
}

// ── F7 外部直达链接（deep link）──
// 支持两种进场形态，都收敛成 F6 已有的 {prNumber, path, line} 再加一个 repo：
//   ?repo=owner/name&pr=13&path=docs/a.md&line=42   —— 短、好念、agent 好拼
//   ?ref=<GitHub permalink>                          —— F6 已认得的三种链接原样塞进来，零新语法
//
// #7：这里**故意不收 slug**。深链的病根就是拿收链人本地配的仓去解析别人发来的链接——
// 发给协审人的 `?pr=30` 会落到他自己那个仓的第 30 折上（串台），而 `?ref=` 形态更阴：
// parseZhupiLink 比对仓名不符直接 return null，连报错都没有（静默失效）。
// 进场链接必须自我描述，本函数对本地配置一无所知，只如实回报链接说了什么；
// 「要不要切到这个仓」是 UI 该问人的事，不是解析该替人做的决定。
// repo 为 null = 链接没说，按当前仓解析（老链接照旧能用）。
export function parseDeepLink(search) {
  const q = new URLSearchParams(search || '');
  const ref = q.get('ref');
  if (ref) {
    const repo = repoOf(ref);
    const parsed = repo && parseZhupiLink(ref, repo);
    return parsed ? { repo, ...parsed } : null;
  }
  const pr = q.get('pr');
  if (!pr) return null;
  const prNumber = parseFolderId(pr);
  if (prNumber == null) return null;
  const line = parseInt(q.get('line') || '', 10);
  return {
    repo: validRepo(q.get('repo')),
    prNumber,
    path: q.get('path') || null,
    line: Number.isFinite(line) && line > 0 ? line : null,
  };
}

// 折号两种形态并存（M3c）：GitHub 模式是 PR 整数号；门下服务模式是 review id `rv_` + 26 位 Crockford
// base32（与 openapi 的 review_id pattern 同）。字符串原样返回，整数转 number；别的一律 null。
export const REVIEW_ID_RE = /^rv_[0-9A-Z]{26}$/;
export function parseFolderId(s) {
  const v = String(s ?? '').trim();
  if (REVIEW_ID_RE.test(v)) return v;
  if (!/^\d+$/.test(v)) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// owner/repo 的字面校验（GitHub 允许的就这些字符）。烂值一律当「没带仓」而不是让整条链变 null——
// 链接打不开的代价远高于少切一次仓。
const validRepo = (s) => (/^[\w.-]+\/[\w.-]+$/.test(String(s || '')) ? s : null);

// 从 GitHub permalink 里取 owner/repo。非 github.com 一律 null（交给 parseDeepLink 拒掉）。
function repoOf(href) {
  try {
    const u = new URL(href, 'https://github.com');
    if (u.hostname !== 'github.com') return null;
    const [owner, repo] = u.pathname.replace(/^\/+/, '').split('/');
    return validRepo(`${owner}/${repo}`);
  } catch { return null; }
}

// ── F9 回奏（回呈折的 Happy 会话）──
// 批完要回去说「读批注」，得找回是哪个会话呈的折。agent 开折时在 PR body 埋一行：
//   <!-- happy-session: cms3yv065k1oqyc0teh4a5why -->
// 用 HTML 注释：GitHub 上不显示、不碍眼，agent 只需 append 一行。
// 也认 body 里可见的会话链接（agent 手写时更自然），以及标记里直接写整条 URL（fork 自架 Happy）。
// 会话可能早已散场——涂归无从判断，只保证链接指对地方。
const HAPPY_BASE = 'https://charliezong18.github.io/happy';
const SESSION_ID = /^[a-z0-9]{16,40}$/i;   // 锚定：`http://evil/...` 之类不得当成裸 id

export function parseHappySession(body) {
  const text = String(body || '');
  const marked = /<!--\s*happy-session:\s*([^\s>]+)\s*-->/i.exec(text);
  const raw = marked?.[1] || urlInBody(text);
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return sessionUrl(raw);       // 标记里写了整条 URL
  return SESSION_ID.test(raw) ? `${HAPPY_BASE}/session/${raw}` : null;
}

// 可见链接的兜底只认默认站点：body 正文里引用别的会话链接、别的站的 /session/ 路径都很常见，
// 放任何域进来就会把按钮指到错的地方。自架 Happy 走标记里写整条 URL 那条通道，不从正文猜。
// 结尾 (?![a-z0-9]) 是右边界：超长 id 应当拒绝，而不是截前 40 位拼出一个「合法但错」的链接。
const urlInBody = (text) =>
  new RegExp(`${HAPPY_BASE.replace(/[.]/g, '\\.')}/session/[a-z0-9]{16,40}(?![a-z0-9])`, 'i')
    .exec(text)?.[0] || null;

// 标记里写整条 URL 时**故意**放行任意 https 域（自架 Happy 的通道）——不是漏校验。
// 威胁模型：能改 PR body 的只有仓主自己和他的 agent，这时早就输了。别当 bug 修掉。
function sessionUrl(href) {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' && /\/session\/[a-z0-9]{16,40}$/i.test(u.pathname) ? u.href : null;
  } catch { return null; }
}

// 当前位置 → 可分享地址（写地址栏 + 「拷直达链」都用它）
// repo 放最前：链接一眼看得出指向哪个仓，收链人也不必靠自己的本地配置猜（#7）。
export function buildDeepLink(origin, { repo, prNumber, path, line }) {
  if (!prNumber) return origin;
  const q = new URLSearchParams();
  if (repo) q.set('repo', repo);
  q.set('pr', String(prNumber));
  if (path) q.set('path', path);
  if (line) q.set('line', String(line));
  return `${origin}?${q}`;
}

// ── 文档内的相对链接（[中文](README.zh-CN.md) 这种）──
// 不处理的话点击会跳到 Pages 源站的同名路径 → 404（2026-07-27 Charlie 点「中文」踩到；
// M1 评审其实点过这条，当时判为「小」被押后，结果真咬人）。
// 返回相对 docPath 解析后的仓内路径；绝对链接 / 锚点 / mailto / 非文档一律 null（不拦）。
export function resolveRelativeDocLink(href, docPath) {
  const h = String(href || '').trim();
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('#') || h.startsWith('//')) return null;
  const dir = docPath && docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : '';
  const raw = h.split('#')[0].split('?')[0];
  if (!raw) return null;
  const base = raw.startsWith('/') ? raw.slice(1) : dir + raw;
  const out = [];
  for (const seg of base.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.length ? out.join('/') : null;
}
