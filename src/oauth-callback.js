// oauth.html 的脚本：OAuth 授权码回调页（redirect_uri = <同目录>/oauth.html）。
// 只做三件事：取 code/state → 用 sessionStorage 里的 PKCE verifier 换 token（service-api.exchangeCode）
// → 把数据源切到「门下服务」并回到 index。code 一次性、verifier 换完即删；URL 上的 code 用
// history.replaceState 抹掉，避免留在历史/书签里。
import { exchangeCode } from './service-api.js';
import { setBackend } from './backend.js';

const msg = document.getElementById('oauth-msg');
const say = (t, err = false) => { if (msg) { msg.textContent = t; msg.classList.toggle('err', err); } };

export async function handleCallback(search = location.search) {
  const q = new URLSearchParams(search);
  if (q.get('error')) {
    say(`门下拒绝了授权：${q.get('error')}${q.get('error_description') ? ` — ${q.get('error_description')}` : ''}`, true);
    return false;
  }
  const code = q.get('code'), state = q.get('state');
  if (!code) { say('回调里没有 code——请回门下重新点「登录门下」。', true); return false; }
  try {
    await exchangeCode(code, state);
  } catch (err) {
    say(`换取 token 失败：${err?.message || err}`, true);
    return false;
  }
  history.replaceState(null, '', location.pathname);
  setBackend('service');
  say('登录成功，正在返回…');
  location.replace('./');
  return true;
}

if (typeof window !== 'undefined' && !new URLSearchParams(location.search).has('noauto')) handleCallback();
