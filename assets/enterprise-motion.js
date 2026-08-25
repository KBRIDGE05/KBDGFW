(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const motionSets = [
    {
      selector: [
        ".section-head", ".kb-section-title", ".tool-shell-head", ".shell-head",
        ".panel-heading", ".blog-summary", ".article-body > h2", ".post-body > h2"
      ].join(","),
      variant: "rise"
    },
    {
      selector: [
        ".tool-card", ".service-card", ".guide-card", ".route-card", ".post-card",
        ".summary-card", ".term-card", ".news-item", ".type-item", ".photo-card",
        ".source-card", ".fsc-card", ".rate-card", ".vehicle-card", ".process-item",
        ".trust-card", ".promo-card", ".native-card", ".nt-card", ".form-block",
        ".result-panel", ".related-tools-card", ".article-cover", ".quick-summary", ".toc"
      ].join(","),
      variant: "sequence"
    },
    {
      selector: [
        ".kb-source-strip", ".table-card", ".table-wrap", ".nt-table-wrap",
        ".result-table-wrap", ".vehicle-table-wrap", ".article-body > section",
        ".article-aside > *", ".cta .container"
      ].join(","),
      variant: "scale"
    }
];

  let observer = null;

  const show = (element) => {
    element.classList.add("is-visible");
    observer?.unobserve(element);
  };

  const sequenceVariant = (element, index) => {
    const parent = element.parentElement;
    if (!parent) return "scale";
    const rect = parent.getBoundingClientRect();
    const isWideGroup = rect.width > 720;
    if (!isWideGroup) return "rise";
    const pattern = ["left", "right", "scale"];
    return pattern[index % pattern.length];
  };

  const decorateElement = (element, variant, index) => {
    if (element.dataset.kbMotionDecorated === "true") return;
    element.dataset.kbMotionDecorated = "true";
    element.classList.add("kb-reveal");

    const resolved = variant === "sequence" ? sequenceVariant(element, index) : variant;
    element.dataset.kbMotion = resolved;
    element.style.setProperty("--kb-delay", `${Math.min(index, 6) * 68}ms`);

    if (reduceMotion) {
      show(element);
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.91 && rect.bottom > 0) {
      requestAnimationFrame(() => show(element));
    } else {
      observer?.observe(element);
    }
  };

  const decorate = (root) => {
    motionSets.forEach(({ selector, variant }) => {
      const found = [];
      if (root.nodeType === 1 && root.matches?.(selector)) found.push(root);
      root.querySelectorAll?.(selector).forEach((element) => found.push(element));

      found.forEach((element) => {
        const siblings = element.parentElement
          ? [...element.parentElement.children].filter((item) => item.matches?.(selector))
          : [];
        const index = Math.max(0, siblings.indexOf(element));
        decorateElement(element, variant, index);
      });
    });
  };

  const setupScrollProgress = () => {
    let progress = document.querySelector(".kb-scroll-progress");
    if (!progress) {
      progress = document.createElement("div");
      progress.className = "kb-scroll-progress";
      progress.setAttribute("aria-hidden", "true");
      document.body.append(progress);
    }

    let ticking = false;
    const update = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(1, Math.max(0, window.scrollY / max));
      progress.style.setProperty("--kb-scroll-progress", value.toFixed(4));
      document.body.classList.toggle("kb-scrolled", window.scrollY > 12);
      ticking = false;
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    requestUpdate();
  };

  const setupHeroPointer = () => {
    if (!finePointer || reduceMotion) return;
    const hero = document.querySelector(".kb-page-hero, [data-kb-hero='main']");
    if (!hero) return;

    let frame = null;
    hero.addEventListener("pointermove", (event) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        hero.style.setProperty("--kb-hero-pointer-x", x.toFixed(3));
        hero.style.setProperty("--kb-hero-pointer-y", y.toFixed(3));
      });
    }, { passive: true });

    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--kb-hero-pointer-x", "0");
      hero.style.setProperty("--kb-hero-pointer-y", "0");
    }, { passive: true });
  };

  const boot = () => {
    document.documentElement.classList.add("kb-motion-ready");

    if (!reduceMotion && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) show(entry.target);
        });
      }, {
        threshold: 0.1,
        rootMargin: "0px 0px -8% 0px"
      });
    }

    decorate(document);
    setupScrollProgress();
    setupHeroPointer();

    requestAnimationFrame(() => document.body.classList.add("kb-page-ready"));

    let mutationFrame = 0;
    const pendingNodes = new Set();
    new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) pendingNodes.add(node);
      }));
      if (mutationFrame) return;
      mutationFrame = requestAnimationFrame(() => {
        pendingNodes.forEach(decorate);
        pendingNodes.clear();
        mutationFrame = 0;
      });
    }).observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
