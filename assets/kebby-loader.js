(() => {
  "use strict";
  if (window.__KBRIDGE_KEBBY_LOADER__) return;
  window.__KBRIDGE_KEBBY_LOADER__ = true;

  let loaded = false;
  const current = document.currentScript?.src || "";
  const chatUrl = current
    ? new URL("kebby-chat.js?v=20260826-rev5", current).href
    : "/assets/kebby-chat.js?v=20260826-rev5";

  const load = () => {
    if (loaded) return;
    loaded = true;
    const script = document.createElement("script");
    script.src = chatUrl;
    script.async = true;
    document.head.appendChild(script);
  };

  const afterLoad = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(load, { timeout: 1800 });
    } else {
      window.setTimeout(load, 900);
    }
  };

  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true, passive: true });
})();
