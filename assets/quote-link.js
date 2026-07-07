(() => {
  'use strict';
  document.addEventListener('click', event => {
    const link=event.target.closest('[data-quote-link]');
    if(!link) return;
    event.preventDefault();
    const type=link.getAttribute('data-quote-link')||'formal';
    try{sessionStorage.setItem('kbridgePendingQuote',type)}catch(_e){}
    const href=link.getAttribute('href')||'../index.html?quote=formal#services';
    location.assign(href);
  });
})();
