/* K-BRIDGE floating customer actions v14 — no external provider assets */
(() => {
  'use strict';
  if (window.__KB_FLOATING_ACTIONS_V13__) return;
  window.__KB_FLOATING_ACTIONS_V13__ = true;

  const script = document.currentScript;
  const assetsRoot = script?.src ? new URL('./', script.src) : new URL('assets/', document.baseURI);
  const siteRoot = new URL('../', assetsRoot);
  const path = location.pathname;
  const isHome = path === '/' || /^\/index\.html$/i.test(path) ||
    (location.protocol === 'file:' && /\/index\.html$/i.test(path) && !/\/blog\//i.test(path));

  // Prevent flash of unstyled floating buttons when this stylesheet is delayed.
  const addStyle = () => new Promise((resolve) => {
    let css = document.getElementById('kb-floating-actions-style');
    if (css?.sheet) { resolve(true); return; }
    if (!css) {
      css = document.createElement('link');
      css.id = 'kb-floating-actions-style';
      css.rel = 'stylesheet';
      css.href = new URL('css/kbridge-floating-actions-v13.css?v=20261025-hover-v14', assetsRoot).href;
      css.addEventListener('load', () => resolve(true), { once: true });
      css.addEventListener('error', () => resolve(false), { once: true });
      document.head.appendChild(css);
    } else {
      css.addEventListener('load', () => resolve(true), { once: true });
      css.addEventListener('error', () => resolve(false), { once: true });
    }
  });

  const icon = {
    quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 11h2m4 0h2M8 15h2m4 0h2M8 19h8"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><path d="M9 10h.01M15 10h.01M9 14c1.5 1.2 4.5 1.2 6 0"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.6 6.8 8.4 6.4 8.4-6.4"/></svg>',
    top: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14"/></svg>'
  };
  const markup = `
    <nav id="kb-floating-actions" class="kb-float-nav" aria-label="케이브릿지 빠른 상담 메뉴">
      <a class="kb-float-btn" href="${new URL('index.html?quote=formal#services', siteRoot).href}" data-kb-float="quote" aria-label="견적조회">
        ${icon.quote}<span class="kb-float-tooltip" aria-hidden="true">견적조회</span>
      </a>
      ${isHome ? `<button class="kb-float-btn kb-float-chat" type="button" data-kb-float="chat" aria-label="케비 챗봇문의">${icon.chat}<span class="kb-float-chat-text">챗봇문의</span></button>` : ''}
      <button class="kb-float-btn" type="button" data-kb-float="email" aria-label="이메일 상담">
        ${icon.email}<span class="kb-float-tooltip" aria-hidden="true">이메일 상담</span>
      </button>
      <button class="kb-float-btn kb-float-top" type="button" data-kb-float="top" aria-label="맨 위로 이동">
        ${icon.top}<span class="kb-float-tooltip" aria-hidden="true">맨 위로</span>
      </button>
    </nav>
    <section id="kb-floating-email-panel" class="kb-float-email-panel" role="dialog" aria-modal="false" aria-label="이메일 상담" aria-hidden="true" hidden>
      <div class="kb-float-email-head"><div><strong>이메일 상담</strong><p>K-BRIDGE 고객지원</p></div><button type="button" data-kb-float-close aria-label="이메일 상담 닫기">×</button></div>
      <div class="kb-float-email-copy">수출입 운송·통관·창고 상담 내용을 보내주세요.</div>
      <div class="kb-float-email-address">all@kbridges.co.kr</div>
      <div class="kb-float-email-actions"><a href="mailto:all@kbridges.co.kr?subject=K-BRIDGE%20%EB%AC%BC%EB%A5%98%20%EC%83%81%EB%8B%B4%20%EB%AC%B8%EC%9D%98" class="kb-float-email-send">이메일 작성</a><button type="button" class="kb-float-email-copybtn" data-kb-float-copy>주소 복사</button></div>
      <p class="kb-float-email-note" aria-live="polite">메일 프로그램이 연결되지 않은 경우 주소를 복사하여 사용하세요.</p>
    </section>`;

  function start() {
    if (document.getElementById('kb-floating-actions')) return;
    if (!document.body) return;
    const cssReady = addStyle();
    const container = document.createElement('div');
    container.id = 'kb-floating-actions-shell';
    container.style.display = 'none';
    container.innerHTML = markup;
    document.body.appendChild(container);
    cssReady.then((loaded) => {
      if (loaded && container.isConnected) container.style.removeProperty('display');
    });
    const nav = container.querySelector('#kb-floating-actions');
    const emailPanel = container.querySelector('#kb-floating-email-panel');
    const emailButton = nav.querySelector('[data-kb-float="email"]');
    let returnFocus = null;
    const closeEmail = (focus = false) => {
      emailPanel.hidden = true;
      emailPanel.setAttribute('aria-hidden', 'true');
      emailButton.setAttribute('aria-expanded', 'false');
      if (focus) (returnFocus || emailButton).focus();
    };
    const openEmail = () => {
      returnFocus = document.activeElement;
      emailPanel.hidden = false;
      emailPanel.setAttribute('aria-hidden', 'false');
      emailButton.setAttribute('aria-expanded', 'true');
      emailPanel.querySelector('[data-kb-float-close]').focus();
    };

    // Floating controls only invoke existing K-BRIDGE quote and Kebby flows.
    nav.querySelector('[data-kb-float="quote"]').addEventListener('click', (event) => {
      if (!isHome) return;
      const trigger = document.querySelector('[data-open="formalDialog"]');
      const dialog = document.getElementById('formalDialog');
      if (trigger) { event.preventDefault(); trigger.click(); }
      else if (dialog && typeof dialog.showModal === 'function') { event.preventDefault(); if (!dialog.open) dialog.showModal(); }
    });
    nav.querySelector('[data-kb-float="chat"]')?.addEventListener('click', () => {
      closeEmail();
      const launcher = document.querySelector('#kb-kebby-root .kb-kebby-launcher');
      if (launcher) launcher.click();
      else { // If the chat script is still loading, retry once after load.
        const chatScript = document.querySelector('script[src*="kebby-chat.js"]');
        if (chatScript && !chatScript.dataset.kbFloatWait) {
          chatScript.dataset.kbFloatWait = '1';
          chatScript.addEventListener('load', () => document.querySelector('#kb-kebby-root .kb-kebby-launcher')?.click(), { once: true });
        }
      }
    });
    emailButton.setAttribute('aria-expanded', 'false');
    emailButton.setAttribute('aria-controls', 'kb-floating-email-panel');
    emailButton.addEventListener('click', () => emailPanel.hidden ? openEmail() : closeEmail(true));
    emailPanel.querySelector('[data-kb-float-close]').addEventListener('click', () => closeEmail(true));
    emailPanel.querySelector('[data-kb-float-copy]').addEventListener('click', async () => {
      const note = emailPanel.querySelector('.kb-float-email-note');
      try { await navigator.clipboard.writeText('all@kbridges.co.kr'); note.textContent = '이메일 주소를 복사했습니다.'; }
      catch (_) { note.textContent = '복사할 주소: all@kbridges.co.kr'; }
    });
    nav.querySelector('[data-kb-float="top"]').addEventListener('click', () => {
      closeEmail();
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
    });
    document.addEventListener('pointerdown', (event) => {
      if (!emailPanel.hidden && !emailPanel.contains(event.target) && !emailButton.contains(event.target)) closeEmail();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !emailPanel.hidden) closeEmail(true);
    });
    window.addEventListener('kb:kebby-toggle', (event) => {
      nav.querySelector('[data-kb-float="chat"]')?.setAttribute('aria-pressed', String(!!event.detail?.open));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
