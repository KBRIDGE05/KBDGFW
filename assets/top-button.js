(() => {
  "use strict";
  if (window.__KBRIDGE_TOP_BUTTON__) return;
  window.__KBRIDGE_TOP_BUTTON__ = true;

  const style = document.createElement("style");
  style.id = "kb-top-button-style";
  style.textContent = `
    .kb-top-button{
      position:fixed!important;
      z-index:2147482500!important;
      right:18px!important;
      bottom:max(96px,calc(96px + env(safe-area-inset-bottom)))!important;
      width:52px!important;
      height:52px!important;
      margin:0!important;
      padding:0!important;
      border:1px solid rgba(255,255,255,.82)!important;
      border-radius:50%!important;
      background:linear-gradient(145deg,#2f6fe9,#164fca)!important;
      color:#fff!important;
      box-shadow:0 12px 28px rgba(18,63,151,.28)!important;
      display:flex!important;
      flex-direction:column!important;
      align-items:center!important;
      justify-content:center!important;
      gap:0!important;
      font-family:Pretendard,"Noto Sans KR",Arial,sans-serif!important;
      line-height:1!important;
      cursor:pointer!important;
      opacity:0!important;
      visibility:hidden!important;
      pointer-events:none!important;
      transform:translateY(10px) scale(.94)!important;
      transition:opacity .18s ease,transform .18s ease,visibility .18s ease,box-shadow .18s ease!important;
      -webkit-tap-highlight-color:transparent!important;
    }
    .kb-top-button .kb-top-arrow{font-size:19px!important;font-weight:800!important;line-height:.8!important}
    .kb-top-button .kb-top-label{margin-top:4px!important;font-size:9px!important;font-weight:850!important;letter-spacing:.06em!important}
    .kb-top-button.is-visible{
      opacity:1!important;
      visibility:visible!important;
      pointer-events:auto!important;
      transform:none!important;
    }
    .kb-top-button:hover{box-shadow:0 16px 34px rgba(18,63,151,.36)!important;transform:translateY(-2px)!important}
    .kb-top-button:focus-visible{outline:3px solid rgba(91,142,255,.35)!important;outline-offset:3px!important}
    .kb-top-button.is-kebby-open{
      right:448px!important;
      bottom:max(18px,calc(18px + env(safe-area-inset-bottom)))!important;
    }
    @media(max-width:900px){
      .kb-top-button.is-kebby-open{right:438px!important}
    }
    @media(max-width:520px){
      .kb-top-button{
        right:16px!important;
        bottom:max(84px,calc(84px + env(safe-area-inset-bottom)))!important;
        width:48px!important;
        height:48px!important;
      }
      .kb-top-button .kb-top-arrow{font-size:18px!important}
      .kb-top-button .kb-top-label{font-size:8px!important}
      .kb-top-button.is-kebby-open{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
    }
    @media(prefers-reduced-motion:reduce){.kb-top-button{transition:none!important}}
  `;
  document.head.appendChild(style);

  let button = document.querySelector("#kbTopButton,#topBtn,.kb-top-button,.top-btn");
  if (!button) {
    button = document.createElement("button");
    document.body.appendChild(button);
  }
  button.id = "kbTopButton";
  button.className = "kb-top-button";
  button.type = "button";
  button.setAttribute("aria-label", "페이지 최상단으로 이동");
  button.setAttribute("title", "페이지 최상단으로 이동");
  button.innerHTML = '<span class="kb-top-arrow" aria-hidden="true">↑</span><span class="kb-top-label">TOP</span>';

  let kebbyOpen = false;
  const update = () => {
    button.classList.toggle("is-visible", window.scrollY > 360);
    button.classList.toggle("is-kebby-open", kebbyOpen);
  };

  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("kb:kebby-toggle", (event) => {
    kebbyOpen = event?.detail?.open === true;
    update();
  });
  update();
})();