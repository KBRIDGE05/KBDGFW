(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const selectors = [
    '.hero-inner > *', '.blog-hero-inner > *', '.section-head',
    '.promo-card', '.transport-card', '.service-card', '.tool-card',
    '.strength-panel', '.trust-card', '.guide-card', '.route-card',
    '.shell-head', '.kb-source-strip', '.nt-card', '.native-card',
    '.vehicle-filter', '.vehicle-card', '.blog-summary', '.post-card',
    '.article-cover', '.article-body', '.article-aside > *',
    '.faq-wrap details', '.cta .container', '.result-panel'
  ].join(',');

  const revealNow = element => {
    element.classList.add('is-visible');
    window.setTimeout(() => {
      element.classList.remove('kb-reveal', 'is-visible');
      element.style.removeProperty('--kb-delay');
    }, 760);
  };

  const observer = !reduceMotion && 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          revealNow(entry.target);
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -7% 0px' })
    : null;

  const decorate = root => {
    const elements = [];
    if (root.nodeType === 1 && root.matches?.(selectors)) elements.push(root);
    root.querySelectorAll?.(selectors).forEach(el => elements.push(el));

    elements.forEach(el => {
      if (el.classList.contains('kb-reveal')) return;
      el.classList.add('kb-reveal');
      const siblings = el.parentElement ? [...el.parentElement.children].filter(x => x.matches?.(selectors)) : [];
      const index = Math.max(0, siblings.indexOf(el));
      el.style.setProperty('--kb-delay', `${Math.min(index, 4) * 55}ms`);

      if (reduceMotion) {
        revealNow(el);
        return;
      }

      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.94 && rect.bottom > 0) {
        requestAnimationFrame(() => revealNow(el));
      } else if (observer) {
        observer.observe(el);
      } else {
        revealNow(el);
      }
    });
  };

  const boot = () => {
    document.documentElement.classList.add('kb-motion-ready');
    decorate(document);

    const syncHeader = () => document.body.classList.toggle('kb-scrolled', window.scrollY > 12);
    window.addEventListener('scroll', syncHeader, { passive: true });
    syncHeader();

    const mutations = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1) decorate(node);
      }));
    });
    mutations.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
