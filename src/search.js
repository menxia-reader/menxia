// 全文搜索（零后端）——现场拉取各折的 markdown 文本，客户端匹配。
// 缓存进 localStorage、按 head sha 失效：第一次搜要翻折（有进度），之后基本即时。
// 纯文本函数（findMatches / snippetAround / lineOfIndex）单测覆盖，拉取编排不进单测。
import { isShelved } from './track.js';

// 折号查询：纯数字或 `#数字`（`174` / `#174` / `# 174`），返回折号；否则 null。
// 他记得的常常只有折号（「看 #174」），标题里却没有这串数——不认折号就永远搜不到。
export function prNumberOf(query) {
  const m = /^#?\s*(\d+)$/.exec((query || '').trim());
  return m ? Number(m[1]) : null;
}

// 侧栏即输即过滤的判定：折号精确命中，或标题含该词（大小写不敏感）。空词全放行。
export function matchesQuery(pr, query) {
  const q = (query || '').trim();
  if (!q) return true;
  const n = prNumberOf(q);
  if (n != null && pr.number === n) return true;
  return pr.title.toLowerCase().includes(q.toLowerCase());
}

// 一折「住」在哪个栏：open 闲折在读毕书架，其余 open 在待审，已画可的在已画可栏
// （已画可栏全列 merged，书架只是它的切面，所以 merged 一律报「已画可」——点过去一定看得见）。
export function homeTabOf(pr) {
  if (pr.merged_at) return 'done';
  return isShelved(pr) ? 'shelf' : 'open';
}

// 当前栏之外的命中：给「这栏没有，别的栏有」用。`here` = 当前栏已列出的折（不重复报）。
// 按 open → merged 序，去重，每条标明所在栏。
export function hitsElsewhere(prs, donePrs, query, here = []) {
  if (!(query || '').trim()) return [];
  const seen = new Set(here.map((p) => p.number));
  const out = [];
  for (const pr of [...(prs || []), ...(donePrs || [])]) {
    if (seen.has(pr.number) || !matchesQuery(pr, query)) continue;
    seen.add(pr.number);
    out.push({ pr, tab: homeTabOf(pr) });
  }
  return out;
}

const cacheKey = (num) => `zhupi.doccache.${num}`;

function readCache(num, sha) {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(num)));
    return c && c.sha === sha ? c.files : null;
  } catch { return null; }
}
// 配额满时不能一走了之：doccache 只增不减，撑满同源 5MB 后连草稿都写不进去。
// 所以先把全部文档缓存清掉再重试一次——搜索缓存是可再生的，草稿不是。
function writeCache(num, sha, files) {
  const payload = JSON.stringify({ sha, files });
  try { localStorage.setItem(cacheKey(num), payload); return; }
  catch { /* 落到下面清缓存重试 */ }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('zhupi.doccache.'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(cacheKey(num), payload);
  } catch { /* 清完还写不下：放弃缓存，搜索照常（内存里已有） */ }
}

const isDoc = (f) => f.filename.endsWith('.md') && f.status !== 'removed';

// 把（open + 归档）所有折的文档文本备齐；onProgress(done, total, title) 汇报翻折进度
export async function buildIndex(api, prs, onProgress) {
  const index = [];
  let done = 0;
  for (const pr of prs) {
    const sha = pr.head?.sha || '';
    let files = readCache(pr.number, sha);
    if (!files) {
      files = {};
      try {
        const list = (await api.listPRFiles(pr.number)).filter(isDoc);
        for (const f of list) {
          try { files[f.filename] = (await api.getFileText(f.filename, sha)).slice(0, 200_000); }
          catch { /* 单文件失败跳过，别废掉整次搜索 */ }
        }
        writeCache(pr.number, sha, files);
      } catch { /* 整折失败跳过 */ }
    }
    index.push({ pr, files });
    onProgress?.(++done, prs.length, pr.title);
  }
  return index;
}

// 大小写不敏感的多命中查找；cap 防某个词在长文档里刷屏
export function findMatches(text, query, cap = 5) {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return [];
  const out = [];
  let from = 0;
  while (out.length < cap) {
    const i = t.indexOf(q, from);
    if (i < 0) break;
    out.push(i);
    from = i + Math.max(q.length, 1);
  }
  return out;
}

// 命中处的源文件行号（1-based）——跳转就靠它对上 data-line
export function lineOfIndex(text, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

// 命中行做摘要：太长就以命中词为中心开窗
export function snippetAround(text, idx, qlen, width = 60) {
  const ls = text.lastIndexOf('\n', idx) + 1;
  let le = text.indexOf('\n', idx);
  if (le < 0) le = text.length;
  let s = ls, e = le;
  if (le - ls > width) {
    const half = Math.floor((width - qlen) / 2);
    s = Math.max(ls, idx - half);
    e = Math.min(le, idx + qlen + half);
  }
  return (s > ls ? '…' : '') + text.slice(s, e).trim() + (e < le ? '…' : '');
}

// 汇总：折号命中 + 标题命中 + 正文命中，按折分组返回；折号命中的那折排最前。
// 折号查询（`7` / `#7`）不受「至少两个字」限制——一位数折号也是精确的。
export function searchIndex(index, query) {
  const q = query.trim();
  const num = prNumberOf(q);
  if (q.length < 2 && num == null) return [];
  const groups = [];
  let numGroup = null;
  for (const { pr, files } of index) {
    const hits = [];
    if (num != null && pr.number === num) {
      hits.push({ kind: 'number', path: null, line: null, snippet: `#${pr.number} ${pr.title}` });
    }
    if (pr.title.toLowerCase().includes(q.toLowerCase())) {
      hits.push({ kind: 'title', path: null, line: null, snippet: pr.title });
    }
    for (const [path, text] of Object.entries(files)) {
      for (const idx of findMatches(text, q)) {
        hits.push({
          kind: 'doc', path,
          line: lineOfIndex(text, idx),
          snippet: snippetAround(text, idx, q.length),
        });
      }
    }
    if (!hits.length) continue;
    if (hits[0].kind === 'number') numGroup = { pr, hits };
    else groups.push({ pr, hits });
  }
  return numGroup ? [numGroup, ...groups] : groups;
}
