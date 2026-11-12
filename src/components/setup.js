// 设置页：填敕草仓库 + 粘钥匙；已有钥匙时可返回，也可显式清除。
// 从 ui.js 拆出（2026-07-28 还账：ui.js 破 800 行触发指标 #1）。纯展示，只吃 props。
import { html, useState, useRef } from '../../vendor/preact-standalone.mjs';
import * as gh from '../store.js';
import { S } from '../strings.js';

export function Setup({ msg, onSave, canCancel, onCancel, onForget, service = false, onLogin, onBackend }) {
  const [preview, setPreview] = useState(gh.parseRepoSlug(gh.getRepoSlug()) || S.setup.repoPreviewFallback);
  const repoRef = useRef();
  const tokenRef = useRef();
  const submit = () => onSave(repoRef.current.value, tokenRef.current.value);
  const stored = gh.maskToken(gh.getToken());
  // 门下服务模式（M3c）：没有仓库、没有 PAT，只有一颗「登录门下」（OAuth PKCE）。
  if (service) {
    return html`
    <section id="setup" class="setup-service">
      <div class="setup-card">
        <div class="brand-row"><span class="seal">${S.brand.seal}</span><span class="brand">${S.brand.name}</span></div>
        <p class="setup-lead">${S.backend.setupLead}</p>
        <p class="setup-stored">${S.backend.setupNote}</p>
        <div class="setup-actions">
          <button class="btn-primary svc-login" onClick=${onLogin}>${S.backend.login}</button>
          ${canCancel && html`<button class="btn-ghost" onClick=${onCancel}>${S.setup.back}</button>`}
          ${canCancel && html`<button class="btn-ghost setup-forget" onClick=${onForget}>${S.backend.logout}</button>`}
          ${onBackend && html`<button class="btn-ghost backend-btn" onClick=${onBackend}>${S.backend.useGithub}</button>`}
          <span class=${'setup-msg' + (msg ? ' err' : '')}>${msg}</span>
        </div>
      </div>
    </section>`;
  }
  return html`
    <section id="setup">
      <div class="setup-card">
        <div class="brand-row"><span class="seal">${S.brand.seal}</span><span class="brand">${S.brand.name}</span></div>
        <p class="setup-lead">${S.setup.lead}</p>
        <ol class="setup-steps">
          <li>${S.setup.steps.repo.pre}<b>${S.setup.steps.repo.em}</b>${S.setup.steps.repo.mid}<code>${S.setup.steps.repo.code}</code>${S.setup.steps.repo.post}</li>
          <li>${S.setup.steps.token.pre}<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">${S.setup.steps.token.link}</a>${S.setup.steps.token.post}</li>
          <li>${S.setup.steps.access.pre}<b>${S.setup.steps.access.em}</b>${S.setup.steps.access.mid}<code>${preview}</code>${S.setup.steps.access.post}</li>
          <li>${S.setup.steps.perms.pre}<b>${S.setup.steps.perms.em1}</b>${S.setup.steps.perms.mid1}<b>${S.setup.steps.perms.em2}</b>${S.setup.steps.perms.mid2}<b>${S.setup.steps.perms.em3}</b>${S.setup.steps.perms.mid3}<b>${S.setup.steps.perms.em4}</b>${S.setup.steps.perms.post}</li>
          <li>${S.setup.steps.paste.pre}<code>${S.setup.steps.paste.code}</code>${S.setup.steps.paste.post}</li>
        </ol>
        <input id="repo-input" ref=${repoRef} type="text" placeholder="owner/repo"
          autocomplete="off" spellcheck="false" defaultValue=${gh.getRepoSlug()}
          onInput=${(e) => setPreview(gh.parseRepoSlug(e.target.value) || S.setup.repoPreviewFallback)}
          onKeyDown=${(e) => { if (e.key === 'Enter') tokenRef.current.focus(); }} />
        <input id="token-input" ref=${tokenRef} type="password" placeholder="github_pat_…"
          autocomplete="off" spellcheck="false"
          onKeyDown=${(e) => { if (e.key === 'Enter') submit(); }} />
        ${stored && html`<p class="setup-stored" id="token-stored">${S.setup.stored(stored)}<br />${S.setup.storedNote}</p>`}
        <div class="setup-actions">
          <button class="btn-primary" onClick=${submit}>${S.setup.save}</button>
          ${canCancel && html`<button class="btn-ghost" onClick=${onCancel}>${S.setup.back}</button>`}
          ${canCancel && html`<button class="btn-ghost setup-forget" onClick=${onForget}>${S.setup.forget}</button>`}
          <span class=${'setup-msg' + (msg && msg !== S.setup.verifying ? ' err' : '')}>${msg}</span>
        </div>
      </div>
    </section>`;
}
