// GitHub API 封装 —— 浏览器直连 api.github.com，token 只存 localStorage
const API = 'https://api.github.com';
const TOKEN_KEY = 'zhupi.token';
const REPO_KEY = 'zhupi.repo';

// 敕草仓库由用户在设置页填，不写死在代码里——fork 走的人不用改一行代码
export const getRepoSlug = () => localStorage.getItem(REPO_KEY) || '';
export const setRepoSlug = (s) => localStorage.setItem(REPO_KEY, s);
export const repoSlug = () => getRepoSlug();

// 容忍粘整条 URL / 结尾 .git / 多余空白，解析不出来返回空串由调用方报错
export function parseRepoSlug(input) {
  const cleaned = String(input).trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  const parts = cleaned.split('/');
  if (parts.length !== 2) return '';
  if (!parts.every((p) => /^[\w.-]+$/.test(p))) return '';
  return parts.join('/');
}

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t.trim());
// 设置页只回显末 4 位（••••a1b2）：够核对「存的是不是那把」，又不把整把钥匙摆在屏上。
// 密码框本身不回显已存值——2026-10-13 有人以为框里就是钥匙、拷不出来，转头给 App 存了错的值。
export const maskToken = (t) => {
  const s = String(t ?? '').trim();
  if (!s) return '';
  return '••••' + (s.length > 4 ? s.slice(-4) : '');
};
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// 带 status 的错误：401 才是钥匙失效，403 可能只是限流（清 token 会误杀）
export class ApiError extends Error {
  constructor(res, detail) {
    super(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    this.status = res.status;
    this.rateLimited = res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0';
    this.tokenDead = res.status === 401;
  }
}

async function request(path, { accept = 'application/vnd.github+json', ...opts } = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      ...opts.headers,
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || '';
    } catch { /* 非 JSON 错误体忽略 */ }
    throw new ApiError(res, detail);
  }
  return res;
}

const json = (path, opts) => request(path, opts).then((r) => r.json());

// 验钥分三层：仓库可达（Metadata 就够）≠ 能列 PR（要 Pull requests: Read）≠ 能 merge（要 Contents: Write）。
// 只查第一层会让「漏配 Pull requests」的钥匙存钥成功、进清单才 403（2026-07-26 实翻过车）。
export async function verifyToken() {
  const repo = await json(`/repos/${repoSlug()}`);
  let prAccess = true;
  try {
    await json(`/repos/${repoSlug()}/pulls?state=open&per_page=1`);
  } catch (err) {
    if (err.status === 403 || err.status === 404) prAccess = false;
    else throw err;
  }
  // 第四层：体例检查（要 Actions: Read）。2026-07-31 加，2026-08-09 换端点。
  // 理由与上面那三层一模一样 —— 缺这个权限时返 403，
  // 而 403 与「这折没跑过检查」在界面上会长成同一个样子（都是「没有」）。
  // 于是你看到一折没红没绿，以为体例查过了，实际是**我们看不见**。
  // 存钥这一刻就说出来，别等进了清单再猜。
  //
  // ⚠️ 2026-08-09：原先读 /check-runs，那要 **Checks** 权限——而
  // **fine-grained PAT 根本没有 Checks 这一项**（30 项仓库权限里没有它；
  // 端点文档页写的 "Checks repository permissions (read)" 是从 GitHub App
  // 权限模型抄来的模板，App 有、PAT 没有）。于是这个洞谁也补不上：
  // 界面让你去加一项加不了的权限，红绿永远空着。
  // 改读 /actions/runs?head_sha=，要 **Actions: Read**，这一项 PAT 给得了。
  // 代价：只看得见 GitHub Actions 产出的运行；将来接了非 Actions 的检查 app 读不到。
  let checksAccess = true;
  try {
    // 探测只问「读不读得到」，不必过滤到某个 sha（head_sha 只吃 SHA，不吃分支名）。
    await json(`/repos/${repoSlug()}/actions/runs?per_page=1`);
  } catch (err) {
    if (err.status === 403 || err.status === 404) checksAccess = false;
    else throw err;
  }
  return { repo, canWrite: Boolean(repo.permissions?.push), prAccess, checksAccess };
}

/**
 * 一折的体例检查判词。
 *
 * **五种状态，`unreadable` 必须与 `none` 分开** —— 混成一个「无」的后果是
 * 「钥匙没权限」长得跟「这折没跑过检查」一模一样，而前者意味着你以为查过了、其实没看见。
 * 这跟 verifyToken 那三层是同一条教训（2026-07-26 翻过车）。
 *
 *   pass       全绿
 *   fail       有失败的（带 url，点得进去看是哪条规则）
 *   running    还在跑
 *   none       这折没有检查（CI 装上之前的老折都是这个）
 *   unreadable 钥匙缺 Actions: Read —— 看不见，不是没有
 *
 * 读的是 **workflow runs**（`/actions/runs?head_sha=`）不是 check runs：
 * check-runs 要 Checks 权限，而 fine-grained PAT 没有那一项（2026-08-09 查实，
 * 详见 verifyToken 里那段）。两者的 `status` / `conclusion` / `html_url` / `name`
 * 字段同名同义，只有数组键不同，所以下面的判据原样成立。
 */
export async function checkVerdict(sha) {
  let data;
  try {
    data = await json(`/repos/${repoSlug()}/actions/runs?head_sha=${sha}`);
  } catch (err) {
    if (err.status === 403 || err.status === 404) return { state: 'unreadable' };
    throw err;
  }
  const runs = data?.workflow_runs || [];
  if (!runs.length) return { state: 'none' };
  if (runs.some((r) => r.status !== 'completed')) return { state: 'running' };
  // neutral / skipped 不算失败 —— 它们是「这次没什么可说的」，不是「不合格」。
  const bad = runs.filter((r) => !['success', 'neutral', 'skipped'].includes(r.conclusion));
  return bad.length
    ? { state: 'fail', url: bad[0].html_url, name: bad[0].name }
    : { state: 'pass' };
}

export const listOpenPRs = () =>
  json(`/repos/${repoSlug()}/pulls?state=open&per_page=50&sort=updated&direction=desc`);

// 已画可的折子（归档）：closed 里挑真正 merge 过的
export const listMergedPRs = async () => {
  // 分页取全：closed 里还混着「关而未合」的，只取前 50 条归档多了必漏
  const closed = await paged((page) =>
    `/repos/${repoSlug()}/pulls?state=closed&per_page=100&page=${page}&sort=updated&direction=desc`);
  return closed.filter((p) => p.merged_at);
};

// 分页取全，避免 >100 文件的 PR 漏掉正文
export async function listPRFiles(num) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await json(`/repos/${repoSlug()}/pulls/${num}/files?per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

// 分页取全（模式同 listPRFiles）——已呈批注串与 rev 序列都可能超 100 条
async function paged(pathFor) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await json(pathFor(page));
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

// 已呈的 inline review comments：id / path / line / original_line / body / in_reply_to_id / user / created_at
export const listPRComments = (num) =>
  paged((page) => `/repos/${repoSlug()}/pulls/${num}/comments?per_page=100&page=${page}`);

// rev 序列：v1..vN，vN = head（GitHub 按时间升序返回，直接用作 v 号）
export const listPRCommits = (num) =>
  paged((page) => `/repos/${repoSlug()}/pulls/${num}/commits?per_page=100&page=${page}`);

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

export const getFileText = (path, ref) =>
  request(`/repos/${repoSlug()}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
    { accept: 'application/vnd.github.raw' }).then((r) => r.text());

// 画可 = squash merge；带 sha=「所批即所合」：agent 在阅读期间推了新 commit 则 409 拒合
export const mergePR = (num, sha) =>
  request(`/repos/${repoSlug()}/pulls/${num}/merge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merge_method: 'squash', ...(sha ? { sha } : {}) }),
  }).then((r) => r.json());

export async function markReady(nodeId) {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}',
      variables: { id: nodeId },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) throw new Error(data.errors?.[0]?.message || `GraphQL ${res.status}`);
}

// 一次性提交整批涂归（原子：任一行号非法整批 422，调用方需先本地校验）
// commit_id：按用户实际阅读的版本校验/锚定行号；不传则 GitHub 默认最新 head，行号会静默漂移
export const submitReview = (num, { body = '', comments = [], commitId }) =>
  request(`/repos/${repoSlug()}/pulls/${num}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'COMMENT', body, comments, ...(commitId ? { commit_id: commitId } : {}) }),
  }).then((r) => r.json());

// 已呈判（会话区）——与 inline 批注串并列展示，否则判只能发不能看
export const listIssueComments = (num) =>
  paged((page) => `/repos/${repoSlug()}/issues/${num}/comments?per_page=100&page=${page}`);

// 判 = 会话区 conversation comment
export const createIssueComment = (num, body) =>
  request(`/repos/${repoSlug()}/issues/${num}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  }).then((r) => r.json());

// 编辑既有会话区 comment（PATCH）——续读位置就靠它「改同一条、零 commit」。
export const updateIssueComment = (commentId, body) =>
  request(`/repos/${repoSlug()}/issues/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  }).then((r) => r.json());

// ── 续读位置（M2 跨设备续读）──
// 每折一条带 `<!-- menxia-readstate … -->` 标记的会话区 comment。读=扫会话区找那条；
// 写=有就 PATCH 同一条、没有才 POST 新建（保证永远只有一条，不越攒越多）。
import { parseReadState, buildReadStateBody, isReadStateComment } from './offline.js';

/** 读远端续读位置：返回 { id, state } 或 null（没有）。id 供写侧决定 PATCH 还是 POST。 */
export async function getReadState(num) {
  const all = await listIssueComments(num);
  const hit = all.find((c) => isReadStateComment(c.body));
  return hit ? { id: hit.id, state: parseReadState(hit.body) } : null;
}

/**
 * 写续读位置：existingId 有就 PATCH，没有就先扫一遍（防并发下重复建）再 POST。
 * 返回落地的 comment id，供本地记住、下次直接 PATCH。
 */
export async function putReadState(num, state, existingId) {
  const body = buildReadStateBody(state);
  let id = existingId;
  if (id == null) {
    const cur = await getReadState(num);   // 双检：别的设备刚建过就复用，不叠第二条
    id = cur?.id;
  }
  const res = id != null ? await updateIssueComment(id, body) : await createIssueComment(num, body);
  return res?.id ?? id;
}

// raw 响应的 Content-Type 是 application/vnd.github.raw，<img> 不会拿它当 SVG；按扩展名补图片 MIME
const IMAGE_MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp',
};
export const imageMimeOf = (path) => IMAGE_MIME[/\.([a-z0-9]+)$/i.exec(path || '')?.[1]?.toLowerCase()];

// 私有仓的 raw.githubusercontent 不带凭证取不到（实测 404），图片必须走 API 拿 blob
export const getFileBlobUrl = (path, ref) =>
  request(`/repos/${repoSlug()}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
    { accept: 'application/vnd.github.raw' })
    .then((r) => r.blob())
    .then((b) => {
      const type = imageMimeOf(path);
      return URL.createObjectURL(type ? new Blob([b], { type }) : b);
    });
