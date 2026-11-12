// 数据源开关（M3c）：GitHub（默认）/ 门下服务。只是一把钥匙放哪、折从哪拉的选择，
// 阅读—涂归—判—画可的语义两边一致（见 menxia-service/docs/CLIENT-MAPPING.md）。
//
// 存 localStorage；`?svc=1` 只管本次会话（demo / 冒烟用），不落盘。
// 切换后由调用方 location.reload()：store.js 在模块加载时选 driver，整个 app 的状态
// （清单、当前折、草稿 key）都按数据源重算，热切换只会留一堆跨源的半截状态。
const KEY = 'menxia.backend';
export const BACKENDS = ['github', 'service'];

const param = () => {
  try { return typeof location !== 'undefined' ? new URLSearchParams(location.search).get('svc') : null; }
  catch { return null; }
};

export function getBackend() {
  if (param() === '1') return 'service';
  try {
    const v = localStorage.getItem(KEY);
    return BACKENDS.includes(v) ? v : 'github';
  } catch { return 'github'; }
}

export function setBackend(b) {
  localStorage.setItem(KEY, BACKENDS.includes(b) ? b : 'github');
}

export const isService = () => getBackend() === 'service';
export const nextBackend = (b) => (b === 'service' ? 'github' : 'service');
