(() => {
  'use strict';
  const closeMobileMenu = () => {
    const nav = document.getElementById('mobileNav');
    const btn = document.getElementById('menuBtn');
    nav?.classList.remove('open');
    nav?.setAttribute('aria-hidden','true');
    btn?.setAttribute('aria-expanded','false');
  };
  const goTop = () => {
    closeMobileMenu();
    const root=document.documentElement;
    const old=root.style.scrollBehavior;
    root.style.scrollBehavior='auto';
    try{history.replaceState(null,'',location.pathname+location.search)}catch(_e){}
    window.scrollTo({top:0,left:0,behavior:'auto'});
    root.scrollTop=0;
    document.body.scrollTop=0;
    requestAnimationFrame(()=>{
      window.scrollTo(0,0);
      root.scrollTop=0;
      document.body.scrollTop=0;
      requestAnimationFrame(()=>{root.style.scrollBehavior=old});
    });
  };
  document.addEventListener('click', event => {
    const link=event.target.closest('[data-brand-action]');
    if(!link) return;
    const action=link.getAttribute('data-brand-action');
    if(action==='top'){
      event.preventDefault();
      event.stopPropagation();
      goTop();
    }
  }, true);
})();
