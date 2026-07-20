(() => {
  if (window.__KBRIDGE_SITE_CHROME__) return;
  window.__KBRIDGE_SITE_CHROME__ = true;

  const menu = document.getElementById('mobileNav');
  const trigger = document.getElementById('menuBtn');
  const dropdowns = [...document.querySelectorAll('.header .nav-dropdown')];

  const closeDropdowns = (except = null) => {
    dropdowns.forEach((dropdown) => {
      if (dropdown === except) return;
      dropdown.classList.remove('is-open');
      dropdown.querySelector('.nav-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
    });
  };

  const closeMobile = () => {
    if (!menu || !trigger) return;
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', '메뉴 열기');
    document.body.classList.remove('lock');
  };

  if (menu && trigger) {
    menu.setAttribute('aria-hidden', menu.classList.contains('open') ? 'false' : 'true');
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const open = !menu.classList.contains('open');
      closeDropdowns();
      menu.classList.toggle('open', open);
      menu.setAttribute('aria-hidden', String(!open));
      trigger.setAttribute('aria-expanded', String(open));
      trigger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      document.body.classList.toggle('lock', open);
    }, true);
    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMobile));
  }

  dropdowns.forEach((dropdown) => {
    const button = dropdown.querySelector('.nav-dropdown-toggle');
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const open = !dropdown.classList.contains('is-open');
      closeDropdowns(dropdown);
      dropdown.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    }, true);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.header .nav-dropdown')) closeDropdowns();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDropdowns();
    closeMobile();
    trigger?.focus();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1180) closeMobile();
  }, { passive: true });

  const getTitleLineWeight = (line) => [...line.trim()].reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.35;
    if (/[A-Za-z0-9]/u.test(character)) return total + 0.58;
    if (/[.,·:;!?()\[\]{}'"\-–—/]/u.test(character)) return total + 0.35;
    return total + 1;
  }, 0);

  const fitHeroTitle = (title) => {
    const copy = title.cloneNode(true);
    copy.querySelectorAll('br').forEach((breakElement) => breakElement.replaceWith('\n'));
    const longestLine = Math.max(
      0,
      ...copy.textContent.split(/\n+/).map(getTitleLineWeight),
    );
    const scale = longestLine <= 11
      ? 'short'
      : longestLine <= 22
        ? 'medium'
        : longestLine <= 34
          ? 'long'
          : 'xlong';
    title.dataset.kbTitleScale = scale;
  };

  const heroTitle = document.querySelector('[data-kb-hero="main"] h1');
  if (heroTitle) {
    fitHeroTitle(heroTitle);
    new MutationObserver(() => fitHeroTitle(heroTitle)).observe(heroTitle, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
})();


(() => {
  if (window.__KBRIDGE_FAQ_ACCORDION__) return;
  window.__KBRIDGE_FAQ_ACCORDION__ = true;

  const selector = 'details.faq-item, .faq-wrap > details, .faq > details';

  const initialise = (details) => {
    if (!(details instanceof HTMLDetailsElement) || details.dataset.kbFaqReady === 'true') return;
    const summary = details.querySelector(':scope > summary');
    if (!summary) return;

    details.dataset.kbFaqReady = 'true';
    details.classList.add('kb-faq-enhanced');

    const sync = () => {
      summary.setAttribute('aria-expanded', String(details.open));
    };

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      details.open = !details.open;
      sync();
    });

    details.addEventListener('toggle', sync);
    sync();
  };

  const scan = (root = document) => {
    if (root.matches?.(selector)) initialise(root);
    root.querySelectorAll?.(selector).forEach(initialise);
  };

  const boot = () => {
    scan(document);
    new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) scan(node);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
