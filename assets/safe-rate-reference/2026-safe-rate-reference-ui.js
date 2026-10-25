(()=>{
 'use strict';
 const sources=window.KB_SAFE_CLAUSES;if(!Array.isArray(sources))return;
 const $=(id)=>document.getElementById(id);
 const state={scope:'container',current:'A3-11',collapsed:new Set(),query:''};
 const getScope=()=>sources.find(x=>x.key===state.scope);
 const scopeForId=(id)=>sources.find(x=>x.groups.some(g=>g.items.some(y=>y.id===id)));
 const flat=(s)=>s.groups.flatMap(g=>g.items);
 function findArticle(id){return flat(getScope()).find(y=>y.id===id);}
 function buildToc(){
  const root=$('tocRoot');root.replaceChildren();const s=getScope();let total=0;
  for(const g of s.groups){
   const hits=g.items.filter(i=>!state.query || (g.title+' '+i.title+' '+i.body).toLowerCase().includes(state.query) || (g.title+' '+i.title+' '+i.body).replace(/\s+/g,'').toLowerCase().includes(state.query.replace(/\s+/g,'')));
   if(!hits.length)continue;total+=hits.length;
   const section=document.createElement('section');section.className='toc-group';
   const header=document.createElement('button');header.type='button';header.className='toc-head';header.setAttribute('aria-expanded',String(!state.collapsed.has(g.key)));
   const arrow=document.createElement('span');arrow.textContent=state.collapsed.has(g.key)?'▸':'▾';
   const htext=document.createElement('span');htext.textContent=g.title;header.append(arrow,htext);
   const body=document.createElement('div');body.className='toc-items'+(state.collapsed.has(g.key)?' is-hidden':'');
   header.addEventListener('click',()=>{if(state.collapsed.has(g.key))state.collapsed.delete(g.key);else state.collapsed.add(g.key);buildToc();});
   for(const it of hits){const btn=document.createElement('button');btn.type='button';btn.textContent=it.title;if(it.id===state.current)btn.classList.add('selected');btn.addEventListener('click',()=>setCurrent(it.id,true));body.appendChild(btn);}
   section.append(header,body);root.appendChild(section);
  }
  $('tocCount').textContent=`(${total}개)`;
  if(!total){const n=document.createElement('p');n.className='notfound';n.textContent='검색 결과가 없습니다.';root.appendChild(n);}
 }
 function setScope(key,reset){if(!sources.some(s=>s.key===key))return;state.scope=key;state.collapsed.clear();$('selectContainer').classList.toggle('active',key==='container');$('selectCement').classList.toggle('active',key==='cement');$('selectContainer').setAttribute('aria-pressed',String(key==='container'));$('selectCement').setAttribute('aria-pressed',String(key==='cement'));if(reset){state.current=key==='container'?'A3-11':'C1-1';}render();}
 function setCurrent(id,writeHash){const source=scopeForId(id);if(!source)return;state.scope=source.key;state.current=id;render();if(writeHash){history.replaceState(null,'','#'+encodeURIComponent(id));}}

 // Remove line endings introduced by the PDF column width; retain real clause/list boundaries.
 // The source data remains unchanged so search, copying and original PDF cross-check are lossless.
 function renderParagraphs(raw){
  const root=$('articleContent');root.replaceChildren();
  const lines=String(raw).replace(/\r/g,'').split('\n');
  const markerRE=/^([가-하]\.|\d+\)|[가-하]\)|[①-⑳]|※)\s*(.*)$/u;
  let para=null, parts=[];
  function flush(){
   if(!para)return;
   const p=document.createElement('p');p.className='clause-paragraph clause-paragraph--'+para.kind;
   if(para.marker){const b=document.createElement('span');b.className='clause-marker';b.textContent=para.marker;p.appendChild(b);}
   const t=document.createElement('span');t.className='clause-para-text';t.textContent=parts.join(' ').replace(/\s+/g,' ').trim();p.appendChild(t);
   root.appendChild(p);para=null;parts=[];
  }
  for(const line of lines){
   const txt=line.trim();if(!txt){flush();continue;}
   const m=txt.match(markerRE);
   if(m){flush();para={marker:m[1],kind:/^\d+\)/.test(m[1])?'numbered':'item'};parts=[m[2]];continue;}
   if(!para){para={marker:'',kind:'lead'};parts=[];}
   parts.push(txt);
  }
  flush();
 }
 function render(){const scope=getScope();const item=findArticle(state.current)||flat(scope)[0];if(!item)return;state.current=item.id;
  $('selectContainer').classList.toggle('active',state.scope==='container');$('selectCement').classList.toggle('active',state.scope==='cement');$('selectContainer').setAttribute('aria-pressed',String(state.scope==='container'));$('selectCement').setAttribute('aria-pressed',String(state.scope==='cement'));
  $('articleScope').textContent=scope.title+' / 2026 안전운임 고시';$('articleTitle').textContent=item.title;
  $('sourceRow').textContent='출처: 국토교통부고시 제2026-55호 / '+(state.scope==='container'?'[별표 1]':'[별표 2]')+' / 원문 '+item.page_start+(item.page_end!==item.page_start?'~'+item.page_end:'')+'쪽';
  renderParagraphs(item.body);buildToc();
 }
 $('selectContainer').addEventListener('click',()=>setScope('container',true));$('selectCement').addEventListener('click',()=>setScope('cement',true));
 $('tocSearch').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();buildToc();});
 $('clearSearch').addEventListener('click',()=>{$('tocSearch').value='';state.query='';buildToc();$('tocSearch').focus();});
 $('expandAll').addEventListener('click',()=>{state.collapsed.clear();buildToc();});
 $('collapseAll').addEventListener('click',()=>{getScope().groups.forEach(g=>state.collapsed.add(g.key));buildToc();});
 async function copyText(value,msg){try{await navigator.clipboard.writeText(value);const el=$('copyTextBtn');const old=el.textContent;el.textContent=msg;setTimeout(()=>el.textContent=old,1500);}catch(e){window.prompt('아래 내용을 복사해 주세요.',value);}}
 $('copyLinkBtn').addEventListener('click',()=>copyText(location.origin+location.pathname+'#'+state.current,'링크 복사됨'));
 $('copyTextBtn').addEventListener('click',()=>copyText($('articleTitle').textContent+'\n\n'+findArticle(state.current).body,'내용 복사됨'));
 window.addEventListener('hashchange',()=>{const id=decodeURIComponent(location.hash.slice(1));if(scopeForId(id))setCurrent(id,false);});
 const hash=decodeURIComponent(location.hash.slice(1));if(scopeForId(hash)){state.scope=scopeForId(hash).key;state.current=hash;}render();
})();
