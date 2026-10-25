(() => {
  if (window.__KBRIDGE_SITE_CHROME__) return;
  window.__KBRIDGE_SITE_CHROME__ = true;

  const menu = document.getElementById('mobileNav');
  const trigger = document.getElementById('menuBtn');
  const dropdowns = [...document.querySelectorAll('.header .nav-dropdown')];
  const mobileGroups = menu ? [...menu.querySelectorAll('.mobile-nav-group')] : [];

  const closeMobileGroups = (except = null) => {
    mobileGroups.forEach((group) => {
      if (group === except) return;
      group.classList.remove('is-open');
      group.querySelector('.mobile-nav-label')?.setAttribute('aria-expanded', 'false');
    });
  };

  mobileGroups.forEach((group) => {
    const label = group.querySelector('.mobile-nav-label');
    if (!label) return;
    if (label.tagName !== 'BUTTON') {
      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', '0');
    }
    label.setAttribute('aria-expanded', 'false');
    const toggleGroup = () => {
      const open = !group.classList.contains('is-open');
      closeMobileGroups(group);
      group.classList.toggle('is-open', open);
      label.setAttribute('aria-expanded', String(open));
    };
    label.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleGroup();
    });
    label.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleGroup();
    });
  });

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
    closeMobileGroups();
  };

  if (menu && trigger) {
    menu.setAttribute('aria-hidden', menu.classList.contains('open') ? 'false' : 'true');
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const open = !menu.classList.contains('open');
      closeDropdowns();
      if (open) closeMobileGroups();
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


/* Guided freight selection; the global quick-find overlay was removed. */
(() => {
  if (window.__KBRIDGE_INTERACTIVE_GUIDE__) return;
  window.__KBRIDGE_INTERACTIVE_GUIDE__ = true;
  const script = document.currentScript;
  if (!script?.src) return;
  const base = new URL('../', script.src);
  function initHomeFinder(siteBase) {
    const target = document.querySelector('body.site-home #services.kbix-section-anchor');
    if (!target || document.getElementById('kbix-guide')) return;
    const section = document.createElement('section');
    section.id = 'kbix-guide';
    section.className = 'kbix-guide';
    section.setAttribute('aria-labelledby', 'kbix-guide-title');
    section.innerHTML = `
      <div class="container kbix-guide-container">
        <div class="kbix-guide-title"><span class="kbix-kicker">SMART LOGISTICS GUIDE</span><h2 id="kbix-guide-title">내 화물에 맞는 운송 방법, <em>직접 선택해 보세요</em></h2><p>운송 목적과 화물 형태를 선택하면 적합한 문의 방법과 다음 단계를 안내합니다.</p></div>
        <div class="kbix-guide-layout">
          <div class="kbix-choices">
            <div class="kbix-step-title"><span>01</span><div><strong>어떤 운송이 필요한가요?</strong><small>운송 목적을 선택해 주세요</small></div></div>
            <div class="kbix-option-grid" data-kbix-group="direction"><button type="button" aria-pressed="true" data-value="export">↗ 수출운송</button><button type="button" aria-pressed="false" data-value="import">↙ 수입운송</button><button type="button" aria-pressed="false" data-value="domestic">▣ 국내운송</button></div>
            <div class="kbix-step-title kbix-second-step"><span>02</span><div><strong>화물은 어떤 형태인가요?</strong><small>잘 모르셔도 괜찮습니다</small></div></div>
            <div class="kbix-option-grid kbix-cargo-grid" data-kbix-group="cargo"><button type="button" aria-pressed="true" data-value="fcl">컨테이너 (FCL)</button><button type="button" aria-pressed="false" data-value="lcl">박스·팔레트 (LCL)</button><button type="button" aria-pressed="false" data-value="air">긴급·항공</button><button type="button" aria-pressed="false" data-value="express">해외특송</button><button type="button" aria-pressed="false" data-value="unknown">상담 후 결정</button></div>
            <div class="kbix-choice-foot">선택한 조건은 이 브라우저 화면에서만 사용됩니다. 별도로 전송되지 않습니다.</div>
          </div>
          <div class="kbix-recommend" aria-live="polite" aria-atomic="true">
            <div class="kbix-recommend-top"><span class="kbix-recommend-badge">추천 경로</span><span class="kbix-recommend-number">KBRIDGE / 01</span></div>
            <div class="kbix-route"><span id="kbix-route-from">한국 출발</span><span class="kbix-route-line" aria-hidden="true"></span><span id="kbix-route-to">해외 도착</span></div>
            <h3 id="kbix-recommend-title">FCL 해상운송 견적</h3><p id="kbix-recommend-desc">컨테이너 단위로 운송하는 화물이라면 해상운임을 조회하고 견적을 요청할 수 있습니다.</p>
            <div class="kbix-recommend-checks" id="kbix-recommend-checks"><span>✓ 해상운임 참고 조회</span><span>✓ 정식 견적 문의</span></div>
            <div class="kbix-recommend-actions"><button type="button" class="kbix-primary-action" id="kbix-action">추천 경로로 시작하기 <span aria-hidden="true">→</span></button><button type="button" class="kbix-secondary-action" id="kbix-other-tools">모든 물류도구 보기</button></div>
            <p class="kbix-recommend-disclaimer">운송 조건에 따른 일반적인 안내이며, 실제 운임·운송 가능 여부는 담당자 확인 후 확정됩니다.</p>
          </div>
        </div>
        <div class="kbix-mini-tools"><span>바로가기</span><a href="${new URL('cbm-calculator.html', siteBase).href}">CBM 계산기 ↗</a><a href="${new URL('incoterms-guide.html', siteBase).href}">인코텀즈 ↗</a><a href="${new URL('duty-calculator.html', siteBase).href}">관부가세 계산기 ↗</a><a href="${new URL('vessel-location.html', siteBase).href}">선박 위치 ↗</a></div>
      </div>`;
    // Retain #services as a lightweight anchor for header links and quote-entry.js.
    // The redundant transport promotion cards are removed from the source HTML.
    target.after(section);

    let direction = 'export';
    let cargo = 'fcl';
    const options = {
      fcl: ['FCL 해상운송 견적', '컨테이너 단위 화물은 주요 항로의 참고 해상운임을 확인한 뒤 정식 견적을 요청할 수 있습니다.', ['해상운임 참고 조회', '20FT·40FT 선택'], 'seaDialog', 'ocean'],
      lcl: ['LCL 소량화물 견적', '컨테이너를 단독으로 사용하지 않는 박스·팔레트 화물은 LCL 운임과 W/M 조건을 확인해 보세요.', ['CBM·중량 기반 검토', 'LCL 참고운임 조회'], 'seaDialog', 'lcl'],
      air: ['항공운송 견적', '일정이 촉박하거나 항공운송이 필요한 화물은 출발·도착 공항과 중량을 바탕으로 실견적을 요청하세요.', ['스케줄 확인', '중량·화물 조건 검토'], 'seaDialog', 'air'],
      express: ['해외특송 견적', '서류·샘플·소형 화물은 국가, 무게, 상자 크기를 입력해 해외특송 견적을 요청하세요.', ['소량화물 문의', '품목 제한 확인'], 'expressDialog', ''],
      unknown: ['정식 종합 견적 상담', '화물 형태가 불확실해도 괜찮습니다. 품목과 운송 구간을 전달하면 적합한 방식을 함께 검토합니다.', ['운송 방식 검토', '통관·내륙운송 연계'], 'formalDialog', ''],
    };
    const get = (id) => section.querySelector(`#${id}`);

    function update() {
      let config = options[cargo];
      if (direction === 'import') config = ['수입 종합 견적 상담', '수입화물은 해외 출발지, 국내 도착지, 통관 조건에 따라 비용 구성이 달라집니다. 정식 종합 견적으로 상담해 주세요.', ['해외 출발 운송 검토', '수입통관·국내운송 연계'], 'formalDialog', ''];
      if (direction === 'domestic') config = ['국내운송 서비스 안내', '상·하차지, 화물 크기와 중량을 기준으로 차량 및 내륙운송 조건을 확인할 수 있습니다.', ['차량 제원·배차 검토', '국내운송 견적 문의'], 'domestic.html', ''];
      get('kbix-route-from').textContent = direction === 'import' ? '해외 출발' : direction === 'domestic' ? '국내 상차지' : '한국 출발';
      get('kbix-route-to').textContent = direction === 'import' ? '한국 도착' : direction === 'domestic' ? '국내 하차지' : '해외 도착';
      get('kbix-recommend-title').textContent = config[0];
      get('kbix-recommend-desc').textContent = config[1];
      get('kbix-recommend-checks').replaceChildren(...config[2].map((label) => {
        const chip = document.createElement('span');
        chip.textContent = `✓ ${label}`;
        return chip;
      }));
      get('kbix-action').dataset.target = config[3];
      get('kbix-action').dataset.mode = config[4];
      get('kbix-action').firstChild.textContent = direction === 'domestic' ? '국내운송 알아보기 ' : '추천 경로로 시작하기 ';
    }

    section.querySelectorAll('[data-kbix-group]').forEach((group) => {
      group.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((node) => node.setAttribute('aria-pressed', String(node === button)));
        if (group.dataset.kbixGroup === 'direction') direction = button.dataset.value;
        else cargo = button.dataset.value;
        update();
      }));
    });
    get('kbix-action').addEventListener('click', () => {
      const action = get('kbix-action');
      const destination = action.dataset.target;
      if (destination.endsWith('.html')) {
        window.location.assign(new URL(destination, siteBase).href);
        return;
      }
      const existingTrigger = document.querySelector(`[data-open="${destination}"]`);
      if (existingTrigger) {
        existingTrigger.click();
        if (destination === 'seaDialog' && action.dataset.mode) {
          document.querySelector(`[data-quote-mode="${action.dataset.mode}"]`)?.click();
        }
      }
    });
    get('kbix-other-tools').addEventListener('click', () => window.location.assign(new URL('convenience.html', siteBase).href));
    update();
  }

  const boot = () => {
    const target = document.querySelector('body.site-home #services.kbix-section-anchor');
    if (!target) return;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = new URL('css/interactive-guide.css?v=20261018-clean', script.src).href;
    document.head.appendChild(style);
    initHomeFinder(base);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
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


/* V13: site-wide K-BRIDGE contact rail; script path is resolved from site-chrome.js itself. */
(() => {
  if (window.__KB_FLOATING_ACTIONS_LOADER_V13__) return;
  window.__KB_FLOATING_ACTIONS_LOADER_V13__ = true;
  const source = document.currentScript?.src;
  if (!source) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = new URL('kbridge-floating-actions-v13.js?v=20261025-hover-v14', source).href;
  document.head.appendChild(script);
})();
