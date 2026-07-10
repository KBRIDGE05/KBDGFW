(() => {
  'use strict';
  const STORAGE_KEY='kbridgePendingQuote';
  const requestedType=()=>{
    const p=new URLSearchParams(location.search);
    const query=p.get('quote');
    if(query) return query;
    const hash=location.hash.match(/^#quote-(formal|sea|lcl|air|express)$/)?.[1];
    if(hash) return hash;
    try{
      const stored=sessionStorage.getItem(STORAGE_KEY);
      if(stored){sessionStorage.removeItem(STORAGE_KEY);return stored}
    }catch(_e){}
    return '';
  };
  const openQuote=()=>{
    const type=requestedType();
    if(!type) return;
    const map={
      formal:{id:'formalDialog'},
      sea:{id:'seaDialog',mode:'ocean'},
      lcl:{id:'seaDialog',mode:'lcl'},
      air:{id:'seaDialog',mode:'air'},
      express:{id:'expressDialog'}
    };
    const cfg=map[type];
    if(!cfg) return;
    let attempts=0;
    const tryOpen=()=>{
      attempts++;
      if(cfg.mode&&typeof window.setQuoteMode==='function') window.setQuoteMode(cfg.mode);
      const dialog=document.getElementById(cfg.id);
      if(dialog&&typeof dialog.showModal==='function'){
        try{
          if(!dialog.open) dialog.showModal();
          document.body.classList.add('lock');
          try{history.replaceState(null,'',location.pathname+'#services')}catch(_e){}
          return;
        }catch(err){console.error('견적창 열기 오류',err)}
      }
      if(attempts<20) setTimeout(tryOpen,50);
    };
    tryOpen();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',openQuote,{once:true});
  else openQuote();
})();
