// 「可能过时」判定（门下服务）：当前版本放了 ≥ STALE_DAYS 天、且没撤回的折，挂一个灰色「N 周未更新」。
// 纯函数，单测直接测（test/diff.test.js）。设计决定见 docs/DIFF-STALE-TOAST.md。

/** 过时阈值（天）。改这里就够，界面与测试都读它。 */
export const STALE_DAYS = 21;
const DAY = 864e5;

/**
 * pr（toPR 形状）→ 过时周数；不过时 / 不适用 → 0。
 * 只看门下服务的折（有 pr.svc）；时间取 svc.current_revision_at，服务端还没给这个字段时退回 pr.updated_at。
 */
export function staleWeeks(pr, now = Date.now()) {
  const svc = pr?.svc;
  if (!svc || svc.status === 'withdrawn') return 0;
  const at = Date.parse(svc.current_revision_at || pr.updated_at || '');
  if (!Number.isFinite(at)) return 0;
  const days = (now - at) / DAY;
  return days >= STALE_DAYS ? Math.floor(days / 7) : 0;
}
