(() => {
  const cfg = window.KBRIDGE_CONFIG || {};
  const endpoint = String(cfg.mailEndpoint || '').trim();

  async function send(payload) {
    if (!endpoint || !/^https:\/\/script\.google\.com\/macros\/s\//.test(endpoint)) {
      throw new Error('메일 전송 주소가 설정되지 않았습니다.');
    }

    const enriched = {
      ...payload,
      recipient: cfg.mailRecipient || 'all@kbridges.co.kr',
      siteName: cfg.siteName || 'KBRIDGE',
      siteKey: cfg.siteKey || '',
      sourcePage: location.pathname,
      pageUrl: location.href,
      referrer: document.referrer || '-',
      userAgent: navigator.userAgent,
      submittedAtIso: new Date().toISOString(),
      honeypot: ''
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(enriched),
        signal: controller.signal,
        keepalive: false
      });
      return { ok: true };
    } finally {
      clearTimeout(timer);
    }
  }

  window.KBridgeMail = { send };
})();
