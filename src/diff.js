// 版本对比（diff）的纯算法：文档级增删改 → 行级 diff → 改动行内字符级高亮 → 未改大段折叠。
// 不碰 DOM、不发请求，单测直接测（test/diff.test.js）。设计决定见 docs/DIFF-STALE-TOAST.md。
//
// 算法选 LCS 动态规划（先剥公共前后缀再算中段），不上 Myers：文档是几十到几千行的 markdown，
// 剥完前后缀的中段通常很短；中段格子数超过上限就整段当「删了再加」，宁可粗也不卡页面。

/** 中段格子数上限（n×m）。4e6 个 Uint32 ≈ 16MB，在手机上也扛得住。 */
export const MAX_CELLS = 4e6;
/** 折叠：改动上下各留几行未改的上下文。 */
export const FOLD_CONTEXT = 3;
/** 折叠：至少藏掉这么多行才折（只省一两行不值得多点一下）。 */
export const FOLD_MIN_HIDDEN = 4;
/** 字符级高亮：两行公共字符占比低于此值就不做字符级（整行都换了，满屏高亮反而看不清）。 */
export const CHAR_MIN_COMMON = 0.3;

/**
 * 两个序列的编辑脚本。返回 [{t:'eq'|'del'|'add', a, b}]，a/b 是原序列下标（没有的一侧为 null）。
 * 同分时先删后加，所以「改了一行」总是 del 在前、add 在后。
 */
export function diffSeq(A, B, maxCells = MAX_CELLS) {
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const n = A.length - pre - suf, m = B.length - pre - suf;
  const ops = [];
  for (let i = 0; i < pre; i++) ops.push({ t: 'eq', a: i, b: i });
  if (n > 0 && m > 0 && n * m <= maxCells) {
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);   // dp[i][j] = A[pre+i..] 与 B[pre+j..] 的 LCS 长度
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = A[pre + i] === B[pre + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[pre + i] === B[pre + j]) { ops.push({ t: 'eq', a: pre + i, b: pre + j }); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ t: 'del', a: pre + i, b: null }); i++; }
      else { ops.push({ t: 'add', a: null, b: pre + j }); j++; }
    }
    for (; i < n; i++) ops.push({ t: 'del', a: pre + i, b: null });
    for (; j < m; j++) ops.push({ t: 'add', a: null, b: pre + j });
  } else {
    for (let i = 0; i < n; i++) ops.push({ t: 'del', a: pre + i, b: null });
    for (let j = 0; j < m; j++) ops.push({ t: 'add', a: null, b: pre + j });
  }
  for (let k = 0; k < suf; k++) ops.push({ t: 'eq', a: A.length - suf + k, b: B.length - suf + k });
  return ops;
}

// 相邻同类合并成段：[{s, hi}]，hi=true 的段是这一侧独有的字符（要高亮）
function segsOf(ops, chars, side) {
  const out = [];
  for (const o of ops) {
    if (o.t !== 'eq' && o.t !== side) continue;
    const ch = chars[side === 'del' ? o.a : o.b];
    const hi = o.t !== 'eq';
    const last = out[out.length - 1];
    if (last && last.hi === hi) last.s += ch; else out.push({ s: ch, hi });
  }
  return out;
}

/**
 * 一对「旧行 → 新行」的字符级 diff。按 Unicode 码点切（Array.from），中文一字一格、emoji 不劈开。
 * 返回 { del: [{s,hi}], add: [{s,hi}] }；公共部分太少 → null（整行换了，不做字符级）。
 */
export function charDiff(oldLine, newLine) {
  const a = Array.from(oldLine), b = Array.from(newLine);
  const ops = diffSeq(a, b, 1e6);
  const common = ops.filter((o) => o.t === 'eq').length;
  if (common / Math.max(a.length, b.length, 1) < CHAR_MIN_COMMON) return null;
  return { del: segsOf(ops, a, 'del'), add: segsOf(ops, b, 'add') };
}

const splitLines = (text) => {
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = s.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();   // 末尾换行不算一行
  return lines;
};

/**
 * 行级 diff：[{t:'eq'|'del'|'add', oldNo, newNo, text, segs?}]（行号从 1 起）。
 * 每个改动块里先列删、后列加；删加按位置配对，配上的两行做字符级（segs）。
 */
export function lineRows(oldText, newText) {
  const A = splitLines(oldText), B = splitLines(newText);
  const ops = diffSeq(A, B);
  const rows = [];
  for (let k = 0; k < ops.length;) {
    if (ops[k].t === 'eq') {
      rows.push({ t: 'eq', oldNo: ops[k].a + 1, newNo: ops[k].b + 1, text: A[ops[k].a] });
      k++; continue;
    }
    const dels = [], adds = [];
    for (; k < ops.length && ops[k].t !== 'eq'; k++) (ops[k].t === 'del' ? dels : adds).push(ops[k]);
    const pairs = dels.map((d, i) => (adds[i] ? charDiff(A[d.a], B[adds[i].b]) : null));
    dels.forEach((d, i) => rows.push({ t: 'del', oldNo: d.a + 1, newNo: null, text: A[d.a], ...(pairs[i] ? { segs: pairs[i].del } : {}) }));
    adds.forEach((o, i) => rows.push({ t: 'add', oldNo: null, newNo: o.b + 1, text: B[o.b], ...(pairs[i] ? { segs: pairs[i].add } : {}) }));
  }
  return rows;
}

/**
 * 折叠未改大段：连续的 eq 行只在改动上下各留 ctx 行，中间换成 {t:'fold', rows:[…]}（可展开）。
 * 文首 / 文末的 eq 段只留挨着改动的那一头。整篇没改动 → 原样返回（调用方自己说「没变」）。
 */
export function foldRows(rows, ctx = FOLD_CONTEXT, minHidden = FOLD_MIN_HIDDEN) {
  if (!rows.some((r) => r.t !== 'eq')) return rows;
  const out = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i].t !== 'eq') { out.push(rows[i]); i++; continue; }
    let j = i;
    while (j < rows.length && rows[j].t === 'eq') j++;
    const run = rows.slice(i, j);
    const head = i === 0 ? 0 : ctx;               // 前面有改动才留开头几行
    const tail = j === rows.length ? 0 : ctx;     // 后面有改动才留结尾几行
    if (run.length - head - tail >= minHidden) {
      out.push(...run.slice(0, head));
      out.push({ t: 'fold', rows: run.slice(head, run.length - tail) });
      out.push(...run.slice(run.length - tail));
    } else out.push(...run);
    i = j;
  }
  return out;
}

/**
 * 文档级：两版 documents（[{path, sha256}]）→ [{path, kind:'added'|'removed'|'modified'|'same'}]。
 * sha256 相同 → same（不拉正文）。顺序按新版文档顺序，删掉的排在最后。
 */
export function docChanges(oldDocs = [], newDocs = []) {
  const before = new Map(oldDocs.map((d) => [d.path, d]));
  const after = new Set(newDocs.map((d) => d.path));
  const out = newDocs.map((d) => {
    const o = before.get(d.path);
    if (!o) return { path: d.path, kind: 'added' };
    return { path: d.path, kind: o.sha256 && o.sha256 === d.sha256 ? 'same' : 'modified' };
  });
  for (const d of oldDocs) if (!after.has(d.path)) out.push({ path: d.path, kind: 'removed' });
  return out;
}

/** URL 参数 `diff=<a>..<b>` → {a, b}；不合法 → null。a===b 也算不合法（没得比）。 */
export function parseDiffParam(v) {
  const m = /^(\d+)\.\.(\d+)$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return a > 0 && b > 0 && a !== b ? { a, b } : null;
}
export const diffParam = ({ a, b }) => `${a}..${b}`;
