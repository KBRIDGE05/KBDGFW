/* KBRIDGE blog style lock v1
   Keeps the canonical lock stylesheet as the final stylesheet even if a later
   script injects another stylesheet. It does not remove legacy CSS or content. */
(()=>{
  'use strict';
  const selector='link[data-kb-blog-style-lock]';
  let scheduled=false;
  const keepLast=()=>{
    scheduled=false;
    const lock=document.querySelector(selector);
    if(!lock||!document.head)return;
    const styles=[...document.head.querySelectorAll('link[rel~="stylesheet"],style')];
    if(styles.length&&styles[styles.length-1]!==lock) document.head.appendChild(lock);
    document.documentElement.classList.add('kb-blog-style-locked');
  };
  const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(keepLast);}};
  keepLast();
  if(document.head){
    new MutationObserver(records=>{
      for(const r of records){
        for(const n of r.addedNodes){
          if(n.nodeType===1 && (n.matches?.('style,link[rel~="stylesheet"]') || n.querySelector?.('style,link[rel~="stylesheet"]'))){schedule();return;}
        }
      }
    }).observe(document.head,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',keepLast,{once:true});
})();
