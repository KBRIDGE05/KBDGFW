(() => {
  "use strict";

  if (window.__KBRIDGE_KEBBY_LOADED__) return;
  window.__KBRIDGE_KEBBY_LOADED__ = true;

  const API_BASE = "https://kbridge-ai-chat.jin-kim-937.workers.dev";
  const TURNSTILE_SITE_KEY = "0x4AAAAAAD7Rv6zNeCAC4U_L";
  const STORAGE_KEY = "kbridge-kebby-session-v4";
  const CLIENT_VERSION = "v10";
  const AVATAR_URL = (() => {
    const current = document.currentScript?.src;
    if (current) return new URL("kebby-avatar-v2.webp?v=20260725-ui-v10", current).href;
    return "/assets/kebby-avatar-v2.webp?v=20260725-ui-v10";
  })();

  const initialMessage =
    "안녕하세요! 케이브릿지 AI 물류 상담원 케비예요. 해상·항공운송, LCL·FCL, 통관, 해외특송은 물론 국내운송·화물차량·창고 문의도 편하게 물어보세요.";

  function compactPageText(value, maxLength = 9000) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim()
      .slice(0, maxLength);
  }

  function getPageContext() {
    const description = document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[property="og:description"]')?.content || "";
    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .map((node) => compactPageText(node.textContent, 180))
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .slice(0, 28)
      .join(" | ");
    const source = document.querySelector("main") || document.querySelector("article") || document.body;
    let pageText = "";
    if (source) {
      const clone = source.cloneNode(true);
      clone.querySelectorAll("script,style,noscript,svg,canvas,template,nav,footer,dialog,#kb-kebby-root,[hidden],[aria-hidden='true']")
        .forEach((node) => node.remove());
      pageText = compactPageText(clone.textContent, 9000);
    }
    return {
      pageTitle: compactPageText(document.title || "KBRIDGE", 180),
      pageUrl: String(location.href || "").slice(0, 500),
      pagePath: String(location.pathname || "/").slice(0, 300),
      pageDescription: compactPageText(description, 700),
      pageHeadings: compactPageText(headings, 1600),
      pageText,
      siteKnowledgeVersion: "v10",
    };
  }

  let history = loadHistory();
  let turnstileToken = "";
  let turnstileWidgetId = null;
  let handoffOpen = false;
  let apiWarmed = false;
  let welcomeShown = false;

  function loadHistory() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(parsed) && parsed.length) return parsed.slice(-20);
    } catch (_) {}
    return [{ role: "assistant", content: initialMessage }];
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-20)));
    } catch (_) {}
  }

  function track(eventName, params = {}) {
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", eventName, {
          event_category: "kebby_ai",
          page_title: document.title,
          page_location: location.href,
          ...params,
        });
      }
    } catch (_) {}
  }

  const style = document.createElement("style");
  style.textContent = `
    :root{--kb-kebby-navy:#15386f;--kb-kebby-blue:#2e67e9;--kb-kebby-blue2:#4a82f4;--kb-kebby-ink:#1c3154;--kb-kebby-muted:#74829a;--kb-kebby-line:#dbe4f1;--kb-kebby-soft:#f5f8fd;--kb-kebby-green:#35c68a}
    #kb-kebby-root,*[data-kb-kebby]{box-sizing:border-box}
    #kb-kebby-root{position:fixed;z-index:2147483000;right:18px;bottom:max(18px,env(safe-area-inset-bottom));font-family:Pretendard,"Noto Sans KR",Apple SD Gothic Neo,Segoe UI,sans-serif;color:var(--kb-kebby-ink);font-size:14px;line-height:1.5}
    #kb-kebby-root button,#kb-kebby-root input,#kb-kebby-root select,#kb-kebby-root textarea{font:inherit}
    .kb-kebby-launcher{width:66px;height:66px;border:0;border-radius:50%;padding:3px;background:linear-gradient(145deg,#3c78f3,#1854d6);box-shadow:0 16px 38px rgba(22,61,137,.34);cursor:pointer;display:grid;place-items:center;transition:transform .2s ease,box-shadow .2s ease}
    .kb-kebby-launcher:hover{transform:translateY(-3px);box-shadow:0 20px 42px rgba(22,61,137,.4)}
    .kb-kebby-launcher img{display:block;width:100%;height:100%;border-radius:50%;object-fit:contain;object-position:center;border:2px solid rgba(255,255,255,.88);background:#fff}
    .kb-kebby-welcome{position:absolute;right:0;bottom:82px;width:min(360px,calc(100vw - 28px));padding:18px;border-radius:24px;background:#fff;border:1px solid #dbe5f3;box-shadow:0 22px 65px rgba(20,49,96,.24);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(18px) scale(.96);transform-origin:100% 100%;transition:opacity .26s ease,transform .26s ease,visibility 0s linear .26s}
    .kb-kebby-welcome.is-visible{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0) scale(1);animation:kbKebbyWelcomeIn .42s cubic-bezier(.2,.82,.24,1) both;transition-delay:0s}
    @keyframes kbKebbyWelcomeIn{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
    .kb-kebby-welcome-head{display:flex;gap:12px;align-items:center;padding-right:36px}
    .kb-kebby-welcome-avatar{display:block;width:58px;height:58px;border-radius:18px;object-fit:contain;object-position:center;background:#fff;box-shadow:0 8px 18px rgba(29,89,203,.22)}
    .kb-kebby-welcome-title{font-weight:800;font-size:17px;color:#17345f}.kb-kebby-welcome-title b{color:var(--kb-kebby-blue)}
    .kb-kebby-welcome-sub{margin-top:2px;color:var(--kb-kebby-muted);font-size:12px}
    .kb-kebby-welcome-close{position:absolute;right:14px;top:14px;width:32px;height:32px;border:0;border-radius:12px;background:#f0f4fa;color:#536a8e;cursor:pointer;font-size:20px}
    .kb-kebby-welcome-copy{margin:13px 0 14px;font-size:15px;font-weight:700;color:#203859}
    .kb-kebby-welcome-actions{display:block}
    .kb-kebby-welcome-actions button{width:100%;border:0;border-radius:14px;background:linear-gradient(135deg,#2c66e7,#477cf0);color:#fff;padding:12px 14px;text-align:center;font-weight:800;cursor:pointer;transition:.18s ease;box-shadow:0 8px 18px rgba(42,99,226,.18)}
    .kb-kebby-welcome-actions button:hover{transform:translateY(-1px);filter:brightness(1.03)}
    .kb-kebby-panel{position:absolute;right:0;bottom:82px;width:min(410px,calc(100vw - 24px));height:min(700px,calc(100dvh - 106px));min-height:520px;background:#fff;border:1px solid #d8e3f1;border-radius:28px;box-shadow:0 26px 78px rgba(15,43,91,.34);overflow:hidden;display:none;flex-direction:column}
    .kb-kebby-panel.is-open{display:flex;animation:kbKebbyIn .2s ease both}
    @keyframes kbKebbyIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
    .kb-kebby-header{position:relative;display:flex;align-items:center;gap:12px;padding:18px 18px 17px;background:linear-gradient(125deg,#163a72 0%,#2358bd 62%,#3d73e8 100%);color:#fff;overflow:hidden}
    .kb-kebby-header:after{content:"";position:absolute;width:240px;height:130px;border:1px solid rgba(255,255,255,.18);border-radius:50%;right:-70px;bottom:-84px;transform:rotate(-8deg)}
    .kb-kebby-header-avatar{position:relative;z-index:1;display:block;width:54px;height:54px;border-radius:17px;object-fit:contain;object-position:center;background:#fff;border:3px solid rgba(255,255,255,.88);box-shadow:0 8px 20px rgba(0,0,0,.18)}
    .kb-kebby-head-copy{position:relative;z-index:1;min-width:0;flex:1}.kb-kebby-head-title{display:flex;gap:8px;align-items:center;font-size:19px;font-weight:850}.kb-kebby-ai-badge{font-size:11px;padding:4px 7px;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:rgba(255,255,255,.13)}
    .kb-kebby-head-sub{margin-top:2px;color:rgba(255,255,255,.8);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .kb-kebby-head-actions{position:relative;z-index:2;display:flex;gap:7px}.kb-kebby-icon-btn{width:38px;height:38px;border:0;border-radius:13px;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;display:grid;place-items:center}.kb-kebby-icon-btn:hover{background:rgba(255,255,255,.22)}
    .kb-kebby-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:linear-gradient(#f8faff,#fff 150px);padding:16px 16px 22px;scroll-behavior:smooth}
    .kb-kebby-messages{min-width:0}.kb-kebby-message{display:flex;gap:8px;margin:0 0 13px;align-items:flex-end;min-width:0}.kb-kebby-message.user{justify-content:flex-end}.kb-kebby-message-avatar{display:block;width:30px;height:30px;border-radius:50%;object-fit:contain;object-position:center;background:#fff;flex:0 0 auto;box-shadow:0 4px 12px rgba(25,66,135,.16)}
    .kb-kebby-bubble{max-width:86%;min-width:0;padding:12px 14px;border-radius:17px;word-break:keep-all;overflow-wrap:anywhere;font-size:14px;line-height:1.62}
    .kb-kebby-message.user .kb-kebby-bubble{white-space:pre-wrap}
    .kb-kebby-message.assistant .kb-kebby-bubble{white-space:normal}
    .kb-kebby-answer-p{margin:0 0 10px}.kb-kebby-answer-p:last-child{margin-bottom:0}
    .kb-kebby-answer-title{margin:14px 0 7px;color:#17365f;font-weight:850;font-size:14.5px;line-height:1.45}
    .kb-kebby-answer-title:first-child{margin-top:0}
    .kb-kebby-answer-list{margin:7px 0 11px;padding-left:20px}.kb-kebby-answer-list:last-child{margin-bottom:0}
    .kb-kebby-answer-list li{margin:5px 0;padding-left:2px;line-height:1.58}
    .kb-kebby-answer-list li::marker{color:#2f67de;font-weight:800}
    .kb-kebby-bubble strong{color:#163b73;font-weight:850}
    .kb-kebby-sources{margin-top:12px;padding-top:10px;border-top:1px solid #e5ebf4}
    .kb-kebby-sources-title{display:block;margin-bottom:6px;color:#65758d;font-size:11px;font-weight:800}
    .kb-kebby-sources a{display:block;margin:4px 0;color:#245ed7;font-size:11.5px;line-height:1.45;text-decoration:none;overflow-wrap:anywhere}
    .kb-kebby-sources a:hover{text-decoration:underline}.kb-kebby-message.assistant .kb-kebby-bubble{background:#fff;border:1px solid #dce5f1;border-bottom-left-radius:5px;box-shadow:0 5px 14px rgba(31,63,110,.06)}.kb-kebby-message.user .kb-kebby-bubble{background:linear-gradient(135deg,#2c66e7,#477cf0);color:#fff;border-bottom-right-radius:5px;box-shadow:0 8px 18px rgba(42,99,226,.18)}
    .kb-kebby-typing{display:inline-flex;gap:4px;align-items:center}.kb-kebby-typing-label{display:inline-block;margin-left:8px;color:#71819a;font-size:12px;vertical-align:middle}.kb-kebby-typing i{width:6px;height:6px;border-radius:50%;background:#7090c5;animation:kbKebbyDot 1s infinite ease-in-out}.kb-kebby-typing i:nth-child(2){animation-delay:.14s}.kb-kebby-typing i:nth-child(3){animation-delay:.28s}@keyframes kbKebbyDot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}
    .kb-kebby-error{margin:10px 0;padding:11px 12px;border-radius:13px;border:1px solid #f1c6c6;background:#fff7f7;color:#bd4444;font-size:13px}
    .kb-kebby-footer{border-top:1px solid #e0e7f1;background:#fff;padding:12px 14px 10px}.kb-kebby-footer-actions{display:flex;gap:8px;margin-bottom:9px;overflow-x:auto}.kb-kebby-footer-actions button,.kb-kebby-footer-actions a{white-space:nowrap;border:1px solid #d8e2ef;background:#fff;border-radius:12px;color:#294669;font-weight:750;padding:9px 11px;text-decoration:none;cursor:pointer}.kb-kebby-footer-actions .primary{background:#255fdf;color:#fff;border-color:#255fdf}
    .kb-kebby-input-row{display:flex;gap:8px;align-items:flex-end}.kb-kebby-input{min-height:48px;max-height:112px;resize:none;flex:1;border:1px solid #cad8ea;border-radius:16px;padding:13px 14px;outline:none;color:#21395f;background:#fff}.kb-kebby-input:focus{border-color:#5c8df2;box-shadow:0 0 0 3px rgba(58,112,230,.12)}.kb-kebby-send{width:48px;height:48px;border:0;border-radius:15px;background:linear-gradient(145deg,#3b75ed,#1f5ddd);color:#fff;display:grid;place-items:center;cursor:pointer;flex:0 0 auto}.kb-kebby-send:disabled{opacity:.45;cursor:not-allowed}.kb-kebby-legal{display:grid;gap:2px;margin:9px 3px 0;color:#8491a6;font-size:10.5px;line-height:1.45}
    .kb-kebby-legal span{display:block}
    .kb-kebby-legal strong{color:#64758e;font-weight:800}
    .kb-kebby-handoff{display:none}.kb-kebby-handoff.is-open{display:block}.kb-kebby-handoff-head{display:grid;grid-template-columns:48px minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;column-gap:11px;row-gap:2px;margin-bottom:15px;padding-bottom:12px;border-bottom:1px solid #e5ebf4}.kb-kebby-handoff-head img{grid-column:1;grid-row:1/3;display:block;width:48px;height:48px;border-radius:15px;object-fit:contain;object-position:center;background:#fff}.kb-kebby-handoff-title{grid-column:2;grid-row:1;min-width:0}.kb-kebby-handoff-head h3{margin:0;font-size:18px;line-height:1.3;color:#17365f}.kb-kebby-handoff-head p{grid-column:2/4;grid-row:2;margin:1px 0 0;color:#75839a;font-size:12px;line-height:1.45;overflow-wrap:anywhere}.kb-kebby-back{grid-column:3;grid-row:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:36px;border:1px solid #b9cff5;background:#f5f8ff;color:#245ed7;border-radius:11px;padding:7px 10px;font-size:12px;font-weight:800;line-height:1.2;white-space:nowrap;cursor:pointer}.kb-kebby-back:hover{border-color:#78a0ef;background:#eaf1ff;color:#194fb9}
    .kb-kebby-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kb-kebby-field{display:flex;flex-direction:column;gap:5px}.kb-kebby-field.full{grid-column:1/-1}.kb-kebby-field label{font-size:12px;font-weight:750;color:#425c7f}.kb-kebby-field input,.kb-kebby-field select{height:43px;border:1px solid #d3deec;border-radius:12px;padding:0 11px;color:#223c61;background:#fff;outline:none}.kb-kebby-field input:focus,.kb-kebby-field select:focus{border-color:#6594f2;box-shadow:0 0 0 3px rgba(61,117,235,.1)}
    .kb-kebby-consent{display:flex;gap:8px;align-items:flex-start;margin:12px 0;color:#536985;font-size:11.5px;line-height:1.5}.kb-kebby-consent input{margin-top:3px}.kb-kebby-turnstile{min-height:65px;margin:4px 0 10px;display:flex;align-items:center;justify-content:center}.kb-kebby-submit{width:100%;height:46px;border:0;border-radius:14px;background:linear-gradient(135deg,#235edc,#3c78ef);color:#fff;font-weight:800;cursor:pointer}.kb-kebby-submit:disabled{opacity:.55;cursor:not-allowed}.kb-kebby-form-status{margin-top:10px;font-size:12px;color:#b94343;text-align:center}
    .kb-kebby-success{text-align:center;padding:25px 12px}.kb-kebby-success-icon{width:62px;height:62px;border-radius:20px;margin:0 auto 14px;background:#e8f7f0;color:#21a66f;display:grid;place-items:center;font-size:30px;font-weight:900}.kb-kebby-success h3{font-size:20px;margin:0;color:#18385f}.kb-kebby-success p{color:#6d7d95;margin:8px 0 15px}.kb-kebby-receipt{padding:13px;background:#f1f6ff;border:1px solid #d7e4fa;border-radius:13px;font-size:16px;font-weight:850;color:#2158c5;letter-spacing:.3px}.kb-kebby-success-actions{display:flex;gap:8px;justify-content:center;margin-top:14px}.kb-kebby-success-actions button,.kb-kebby-success-actions a{border:1px solid #d7e1ee;background:#fff;color:#315073;border-radius:12px;padding:9px 12px;text-decoration:none;font-weight:750;cursor:pointer}
    @media(max-width:520px){#kb-kebby-root{right:12px;bottom:max(12px,env(safe-area-inset-bottom))}.kb-kebby-launcher{width:60px;height:60px}.kb-kebby-panel{position:fixed;right:6px;left:6px;bottom:max(6px,env(safe-area-inset-bottom));width:auto;height:calc(100dvh - 12px - env(safe-area-inset-bottom));min-height:0;border-radius:24px}.kb-kebby-welcome{position:fixed;right:10px;left:10px;bottom:calc(82px + env(safe-area-inset-bottom));width:auto}.kb-kebby-header{padding:15px}.kb-kebby-header-avatar{width:48px;height:48px}.kb-kebby-body{padding:13px 13px max(18px,env(safe-area-inset-bottom))}.kb-kebby-footer{padding:11px 12px max(10px,env(safe-area-inset-bottom))}.kb-kebby-input{font-size:16px}.kb-kebby-bubble{max-width:91%;font-size:14px;line-height:1.64}.kb-kebby-answer-title{font-size:14px}.kb-kebby-legal{font-size:10px;line-height:1.42}.kb-kebby-handoff-head{grid-template-columns:42px minmax(0,1fr) auto;column-gap:8px;row-gap:2px;margin-bottom:13px;padding-bottom:11px}.kb-kebby-handoff-head img{width:42px;height:42px;border-radius:13px}.kb-kebby-handoff-head h3{font-size:16.5px}.kb-kebby-handoff-head p{font-size:11px;line-height:1.4}.kb-kebby-back{min-height:34px;padding:6px 8px;border-radius:10px;font-size:11px}.kb-kebby-form-grid{grid-template-columns:1fr}.kb-kebby-field.full{grid-column:auto}}
    @media(prefers-reduced-motion:reduce){#kb-kebby-root *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "kb-kebby-root";
  root.setAttribute("data-kb-kebby", "");
  root.innerHTML = `
    <section class="kb-kebby-welcome" aria-label="케비 빠른 상담">
      <button type="button" class="kb-kebby-welcome-close" aria-label="안내 닫기">×</button>
      <div class="kb-kebby-welcome-head">
        <img class="kb-kebby-welcome-avatar" src="${AVATAR_URL}" alt="케비 AI 물류 상담원 캐릭터">
        <div><div class="kb-kebby-welcome-title">AI 물류 상담원 <b>케비</b></div><div class="kb-kebby-welcome-sub">케이브릿지 물류 상담 · 24시간 기본 안내</div></div>
      </div>
      <div class="kb-kebby-welcome-copy">안녕하세요! 어떤 물류 업무가 궁금하신가요?</div>
      <div class="kb-kebby-welcome-actions">
        <button type="button" data-welcome-open>케비에게 바로 물어보기 →</button>
      </div>
    </section>
    <section class="kb-kebby-panel" role="dialog" aria-label="케비 AI 물류 상담" aria-modal="false">
      <header class="kb-kebby-header">
        <img class="kb-kebby-header-avatar" src="${AVATAR_URL}" alt="케비">
        <div class="kb-kebby-head-copy"><div class="kb-kebby-head-title">케비 <span class="kb-kebby-ai-badge">✦ AI</span></div><div class="kb-kebby-head-sub">케이브릿지 물류 상담 · 24시간 기본 안내</div></div>
        <div class="kb-kebby-head-actions">
          <button class="kb-kebby-icon-btn kb-kebby-clear" type="button" aria-label="대화 초기화">♲</button>
          <button class="kb-kebby-icon-btn kb-kebby-close" type="button" aria-label="채팅 닫기">✕</button>
        </div>
      </header>
      <div class="kb-kebby-body">
        <div class="kb-kebby-chat-view">
          <div class="kb-kebby-messages" aria-live="polite"></div>
        </div>
        <div class="kb-kebby-handoff"></div>
      </div>
      <footer class="kb-kebby-footer">
        <div class="kb-kebby-footer-actions">
          <a class="primary" href="https://www.kbexpress.kr/?quote=formal#services">▣ 정식 견적 문의</a>
          <button class="kb-kebby-handoff-open" type="button">◉ 상담원 연결</button>
        </div>
        <div class="kb-kebby-input-row">
          <textarea class="kb-kebby-input" rows="1" maxlength="800" placeholder="케비에게 물류 관련 질문을 입력해 주세요."></textarea>
          <button class="kb-kebby-send" type="button" aria-label="질문 전송">➤</button>
        </div>
        <div class="kb-kebby-legal">
          <span><strong>AI 안내는 참고용입니다.</strong> 실제 운임·통관 가능 여부는 담당자 확인 후 확정됩니다.</span>
          <span>상담원 연결에 동의한 경우에만 연락처와 대화 내용이 전달됩니다.</span>
        </div>
      </footer>
    </section>
    <button class="kb-kebby-launcher" type="button" aria-label="케비 AI 물류 상담 열기"><img src="${AVATAR_URL}" alt=""></button>
  `;
  document.body.appendChild(root);

  const $ = (selector) => root.querySelector(selector);
  const panel = $(".kb-kebby-panel");
  const welcome = $(".kb-kebby-welcome");
  const messagesEl = $(".kb-kebby-messages");
  const chatView = $(".kb-kebby-chat-view");
  const handoffView = $(".kb-kebby-handoff");
  const footer = $(".kb-kebby-footer");
  const input = $(".kb-kebby-input");
  const sendButton = $(".kb-kebby-send");

  function warmApi() {
    if (apiWarmed) return;
    apiWarmed = true;
    fetch(`${API_BASE}/?warm=1`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      mode: "cors",
    }).catch(() => {});
  }

  function openPanel() {
    welcome.classList.remove("is-visible");
    panel.classList.add("is-open");
    panel.setAttribute("aria-modal", "true");
    window.dispatchEvent(new CustomEvent("kb:kebby-toggle", { detail: { open: true } }));
    warmApi();
    setTimeout(() => input.focus(), 60);
    track("kebby_open");
  }

  function closePanel() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-modal", "false");
    window.dispatchEvent(new CustomEvent("kb:kebby-toggle", { detail: { open: false } }));
  }

  function renderMessages() {
    messagesEl.textContent = "";
    history.forEach((item) => appendMessage(item.role, item.content, false));
    scrollBody();
  }

  function appendInlineText(parent, text) {
    const value = String(text || "").replace(/`+/g, "");
    const tokenPattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__)/g;
    let cursor = 0;
    for (const match of value.matchAll(tokenPattern)) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(value.slice(cursor, match.index)));
      const strong = document.createElement("strong");
      strong.textContent = match[0].slice(2, -2);
      parent.appendChild(strong);
      cursor = match.index + match[0].length;
    }
    if (cursor < value.length) parent.appendChild(document.createTextNode(value.slice(cursor)));
  }

  function renderAssistantContent(bubble, content) {
    const source = String(content || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/\r/g, "")
      .replace(/```[\w-]*\n?/g, "")
      .trim();

    const lines = source.split("\n");
    let activeList = null;
    let activeType = "";

    const closeList = () => {
      activeList = null;
      activeType = "";
    };

    const ensureList = (type) => {
      if (!activeList || activeType !== type) {
        activeList = document.createElement(type);
        activeList.className = "kb-kebby-answer-list";
        bubble.appendChild(activeList);
        activeType = type;
      }
      return activeList;
    };

    for (const originalLine of lines) {
      const line = originalLine.trim();
      if (!line) {
        closeList();
        continue;
      }

      const heading = line.match(/^#{1,6}\s*(.+)$/);
      if (heading) {
        closeList();
        const title = document.createElement("div");
        title.className = "kb-kebby-answer-title";
        appendInlineText(title, heading[1]);
        bubble.appendChild(title);
        continue;
      }

      const bullet = line.match(/^[-*•]\s+(.+)$/);
      if (bullet) {
        const li = document.createElement("li");
        appendInlineText(li, bullet[1]);
        ensureList("ul").appendChild(li);
        continue;
      }

      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        const li = document.createElement("li");
        appendInlineText(li, numbered[1]);
        ensureList("ol").appendChild(li);
        continue;
      }

      closeList();
      const paragraph = document.createElement("p");
      paragraph.className = "kb-kebby-answer-p";
      appendInlineText(
        paragraph,
        line
          .replace(/^#{1,6}\s*/, "")
          .replace(/^[-*•]\s+/, "· ")
      );
      bubble.appendChild(paragraph);
    }

    if (!bubble.childNodes.length) bubble.textContent = source;
  }

  function appendSources(bubble, sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    const unique = [];
    const seen = new Set();
    for (const source of sources) {
      const url = String(source?.url || "");
      if (!/^https:\/\/(www\.)?kbexpress\.kr\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      unique.push(url);
      if (unique.length >= 3) break;
    }
    if (!unique.length) return;

    const box = document.createElement("div");
    box.className = "kb-kebby-sources";
    const label = document.createElement("span");
    label.className = "kb-kebby-sources-title";
    label.textContent = "관련 케이브릿지 정보";
    box.appendChild(label);
    unique.forEach((url, index) => {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `${index + 1}. ${url.replace(/^https:\/\/(www\.)?kbexpress\.kr\//i, "/") || "/"}`;
      box.appendChild(link);
    });
    bubble.appendChild(box);
  }

  function appendMessage(role, content, save = true, sources = []) {
    const wrap = document.createElement("div");
    wrap.className = `kb-kebby-message ${role}`;
    if (role === "assistant") {
      const avatar = document.createElement("img");
      avatar.className = "kb-kebby-message-avatar";
      avatar.src = AVATAR_URL;
      avatar.alt = "케비";
      wrap.appendChild(avatar);
    }
    const bubble = document.createElement("div");
    bubble.className = "kb-kebby-bubble";
    if (role === "assistant") {
      renderAssistantContent(bubble, content);
      appendSources(bubble, sources);
    } else {
      bubble.textContent = content;
    }
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    if (save) {
      history.push({ role, content });
      history = history.slice(-20);
      saveHistory();
    }
    scrollBody();
    return wrap;
  }

  function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "kb-kebby-message assistant kb-kebby-typing-row";
    const avatar = document.createElement("img");
    avatar.className = "kb-kebby-message-avatar";
    avatar.src = AVATAR_URL;
    avatar.alt = "케비";
    const bubble = document.createElement("div");
    bubble.className = "kb-kebby-bubble";
    bubble.innerHTML = '<span class="kb-kebby-typing"><i></i><i></i><i></i></span>';
    wrap.append(avatar, bubble);
    messagesEl.appendChild(wrap);
    scrollBody();
    return wrap;
  }

  function showError(message) {
    const old = $(".kb-kebby-error");
    if (old) old.remove();
    const el = document.createElement("div");
    el.className = "kb-kebby-error";
    el.textContent = message;
    messagesEl.appendChild(el);
    scrollBody();
  }

  function scrollBody() {
    requestAnimationFrame(() => {
      const body = $(".kb-kebby-body");
      body.scrollTop = body.scrollHeight;
    });
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchJsonWithRetry(url, options, { timeoutMs = 50000, retries = 1 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          ...options,
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (_) {}
        if (!response.ok || !data.ok) {
          const error = new Error(data.error || `요청 처리 중 오류가 발생했습니다. (${response.status})`);
          error.status = response.status;
          throw error;
        }
        return data;
      } catch (error) {
        lastError = error;
        const retryable =
          error?.name === "AbortError" ||
          error instanceof TypeError ||
          [429, 500, 502, 503, 504, 522, 524].includes(Number(error?.status));
        if (!retryable || attempt >= retries) break;
        await wait(300 * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastError?.name === "AbortError") {
      throw new Error("답변 준비 시간이 길어지고 있습니다. 잠시 후 같은 질문을 다시 보내 주세요.");
    }
    if (lastError instanceof TypeError) {
      throw new Error("네트워크 연결이 잠시 불안정합니다. 연결 상태를 확인한 뒤 다시 보내 주세요.");
    }
    throw lastError || new Error("케비의 답변을 불러오지 못했습니다.");
  }

  async function sendMessage(forcedMessage) {
    const message = String(forcedMessage ?? input.value).trim();
    if (!message || sendButton.disabled) return;
    openPanel();
    if (handoffOpen) closeHandoff();
    input.value = "";
    autoResize();
    appendMessage("user", message, true);
    const requestHistory = history.slice(0, -1).slice(-4);
    const typing = showTyping();
    const typingBubble = typing.querySelector(".kb-kebby-bubble");
    const progressTimer1 = setTimeout(() => {
      if (typing.isConnected && typingBubble) {
        typingBubble.innerHTML = '<span class="kb-kebby-typing"><i></i><i></i><i></i></span><span class="kb-kebby-typing-label">질문을 이해하고 있어요</span>';
        scrollBody();
      }
    }, 3500);
    const progressTimer2 = setTimeout(() => {
      if (typing.isConnected && typingBubble) {
        typingBubble.innerHTML = '<span class="kb-kebby-typing"><i></i><i></i><i></i></span><span class="kb-kebby-typing-label">알맞은 답변을 준비하고 있어요</span>';
        scrollBody();
      }
    }, 10000);

    sendButton.disabled = true;
    sendButton.setAttribute("aria-busy", "true");
    track("kebby_question_send");
    try {
      const data = await fetchJsonWithRetry(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ message, history: requestHistory, ...getPageContext(), clientVersion: CLIENT_VERSION }),
      }, { timeoutMs: 50000, retries: 1 });
      if (typing.isConnected) typing.remove();
      appendMessage("assistant", data.reply, true, data.sources);
      track("kebby_answer_success", { knowledge_used: data.knowledgeUsed === true });
    } catch (error) {
      if (typing.isConnected) typing.remove();
      if (!input.value.trim()) {
        input.value = message;
        autoResize();
      }
      showError(error?.message || "잠시 후 다시 시도해 주세요.");
      track("kebby_answer_error");
    } finally {
      clearTimeout(progressTimer1);
      clearTimeout(progressTimer2);
      sendButton.disabled = false;
      sendButton.removeAttribute("aria-busy");
      input.focus();
    }
  }

  function clearConversation() {
    if (!confirm("케비와 나눈 대화를 초기화할까요?")) return;
    history = [{ role: "assistant", content: initialMessage }];
    saveHistory();
    renderMessages();
    track("kebby_clear");
  }

  function loadTurnstile() {
    return new Promise((resolve, reject) => {
      if (window.turnstile) return resolve(window.turnstile);
      const existing = document.querySelector('script[data-kb-turnstile]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.turnstile), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.kbTurnstile = "1";
      script.onload = () => resolve(window.turnstile);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function openHandoff() {
    handoffOpen = true;
    chatView.style.display = "none";
    footer.style.display = "none";
    handoffView.classList.add("is-open");
    handoffView.innerHTML = `
      <div class="kb-kebby-handoff-head">
        <img src="${AVATAR_URL}" alt="케비">
        <div class="kb-kebby-handoff-title"><h3>상담원 연결 요청</h3></div>
        <button class="kb-kebby-back" type="button">← 대화로 돌아가기</button>
        <p>케비와 나눈 대화를 요약해 케이브릿지 담당자에게 전달합니다.</p>
      </div>
      <form class="kb-kebby-form" novalidate>
        <div class="kb-kebby-form-grid">
          <div class="kb-kebby-field full"><label>문의 유형</label><select name="category"><option>LCL·FCL 해상운송</option><option>항공운송·해외특송</option><option>수출입 통관</option><option>국내운송·화물차량</option><option>창고·보관</option><option>기타 물류 문의</option></select></div>
          <div class="kb-kebby-field"><label>회사명 <span>(선택)</span></label><input name="companyName" maxlength="100" autocomplete="organization"></div>
          <div class="kb-kebby-field"><label>담당자명 *</label><input name="contactName" maxlength="60" autocomplete="name" required></div>
          <div class="kb-kebby-field"><label>전화번호</label><input name="phone" maxlength="30" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></div>
          <div class="kb-kebby-field"><label>이메일</label><input name="email" maxlength="160" type="email" autocomplete="email" placeholder="sample@company.com"></div>
        </div>
        <label class="kb-kebby-consent"><input name="consent" type="checkbox" required><span>케비와 나눈 대화 및 입력한 연락처가 상담 처리 목적으로 케이브릿지 담당자에게 전달되는 것에 동의합니다. 접수 정보는 90일 후 삭제 대상으로 처리됩니다.</span></label>
        <div class="kb-kebby-turnstile" id="kb-kebby-turnstile"></div>
        <button class="kb-kebby-submit" type="submit">상담 요청 전달</button>
        <div class="kb-kebby-form-status" aria-live="polite"></div>
      </form>`;
    handoffView.querySelector(".kb-kebby-back").addEventListener("click", closeHandoff);
    handoffView.querySelector("form").addEventListener("submit", submitHandoff);
    track("kebby_handoff_open");
    loadTurnstile()
      .then((turnstile) => {
        turnstileToken = "";
        turnstileWidgetId = turnstile.render("#kb-kebby-turnstile", {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "light",
          size: "flexible",
          callback: (token) => { turnstileToken = token; },
          "expired-callback": () => { turnstileToken = ""; },
          "error-callback": () => { turnstileToken = ""; },
        });
      })
      .catch(() => {
        const status = handoffView.querySelector(".kb-kebby-form-status");
        if (status) status.textContent = "보안 인증을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      });
  }

  function closeHandoff() {
    handoffOpen = false;
    handoffView.classList.remove("is-open");
    handoffView.textContent = "";
    chatView.style.display = "block";
    footer.style.display = "block";
    turnstileToken = "";
    turnstileWidgetId = null;
    scrollBody();
  }

  async function submitHandoff(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector(".kb-kebby-submit");
    const status = form.querySelector(".kb-kebby-form-status");
    const data = new FormData(form);
    const contactName = String(data.get("contactName") || "").trim();
    const phone = String(data.get("phone") || "").trim();
    const email = String(data.get("email") || "").trim();
    const consent = data.get("consent") === "on";

    status.textContent = "";
    if (!contactName) return void (status.textContent = "담당자명을 입력해 주세요.");
    if (!phone && !email) return void (status.textContent = "전화번호 또는 이메일 중 하나를 입력해 주세요.");
    if (!consent) return void (status.textContent = "대화 및 연락처 전달에 동의해 주세요.");
    if (!turnstileToken) return void (status.textContent = "보안 인증을 완료해 주세요.");

    submit.disabled = true;
    submit.textContent = "상담 요청 전달 중…";
    track("kebby_handoff_submit", { consultation_category: String(data.get("category") || "") });
    try {
      const response = await fetch(`${API_BASE}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: String(data.get("companyName") || "").trim(),
          contactName,
          phone,
          email,
          category: String(data.get("category") || "기타 물류 문의"),
          consent: true,
          turnstileToken,
          history: history.slice(-12),
          pageTitle: getPageContext().pageTitle,
          pageUrl: getPageContext().pageUrl,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "상담 요청을 전달하지 못했습니다.");
      showHandoffSuccess(result.receiptId);
      track("kebby_handoff_success", { consultation_category: String(data.get("category") || "") });
    } catch (error) {
      status.textContent = error?.message || "잠시 후 다시 시도해 주세요.";
      submit.disabled = false;
      submit.textContent = "상담 요청 전달";
      if (window.turnstile && turnstileWidgetId !== null) {
        try { window.turnstile.reset(turnstileWidgetId); } catch (_) {}
      }
      turnstileToken = "";
      track("kebby_handoff_error");
    }
  }

  function showHandoffSuccess(receiptId) {
    handoffView.innerHTML = `
      <div class="kb-kebby-success">
        <div class="kb-kebby-success-icon">✓</div>
        <h3>상담 요청이 전달되었습니다</h3>
        <p>케이브릿지 담당자가 입력하신 연락처로 확인 후 안내드릴 예정입니다.</p>
        <div class="kb-kebby-receipt">${String(receiptId || "").replace(/[<>]/g, "")}</div>
        <div class="kb-kebby-success-actions"><button type="button" class="kb-kebby-copy">접수번호 복사</button><a href="https://www.kbexpress.kr/?quote=formal#services">정식 견적문의</a><button type="button" class="kb-kebby-success-close">닫기</button></div>
      </div>`;
    handoffView.querySelector(".kb-kebby-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(receiptId); } catch (_) {}
    });
    handoffView.querySelector(".kb-kebby-success-close").addEventListener("click", closePanel);
  }

  function autoResize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }

  $(".kb-kebby-launcher").addEventListener("click", () => panel.classList.contains("is-open") ? closePanel() : openPanel());
  $(".kb-kebby-close").addEventListener("click", closePanel);
  $(".kb-kebby-clear").addEventListener("click", clearConversation);
  $(".kb-kebby-handoff-open").addEventListener("click", openHandoff);
  $(".kb-kebby-welcome-close").addEventListener("click", () => {
    welcome.classList.remove("is-visible");
    welcomeShown = true;
    track("kebby_welcome_close");
  });
  $("[data-welcome-open]").addEventListener("click", openPanel);
  sendButton.addEventListener("click", () => sendMessage());
  input.addEventListener("input", autoResize);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) closePanel();
  });

  renderMessages();
  autoResize();

  if ("requestIdleCallback" in window) {
    requestIdleCallback(warmApi, { timeout: 2500 });
  } else {
    setTimeout(warmApi, 1800);
  }

  setTimeout(() => {
    if (!panel.classList.contains("is-open") && !welcomeShown) {
      welcomeShown = true;
      welcome.classList.add("is-visible");
      track("kebby_welcome_show");
    }
  }, 1380);
})();
