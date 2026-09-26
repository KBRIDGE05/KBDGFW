!function(){
  const menu=document.getElementById("mobileNav"),trigger=document.getElementById("menuBtn");
  if(menu&&trigger){
    trigger.setAttribute("aria-controls","mobileNav");
    const sync=()=>menu.setAttribute("aria-hidden",menu.classList.contains("open")?"false":"true");
    sync();
    trigger.addEventListener("click",()=>requestAnimationFrame(sync));
    /* Only real navigation links close the drawer. Accordion labels are buttons and must remain open. */
    menu.querySelectorAll("a").forEach(el=>el.addEventListener("click",()=>{
      menu.classList.remove("open");
      trigger.setAttribute("aria-expanded","false");
      menu.setAttribute("aria-hidden","true");
      document.body.classList.remove("lock");
    }));
    window.addEventListener("resize",()=>{if(innerWidth>1180){
      menu.classList.remove("open");trigger.setAttribute("aria-expanded","false");menu.setAttribute("aria-hidden","true");document.body.classList.remove("lock");
    }});
  }
  document.querySelectorAll("dialog").forEach(dialog=>dialog.addEventListener("close",()=>document.body.classList.remove("lock")));
}();
