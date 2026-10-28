const fs=require('fs'),vm=require('vm'),assert=require('assert');
const dir=require('path').resolve(__dirname,'..');
const code=fs.readFileSync(dir+'/assets/blog.js','utf8');
const posts=JSON.parse(fs.readFileSync(dir+'/assets/blog-posts.json','utf8'));
const labels={info:'물류 정보',news:'물류 뉴스',service:'물류 서비스',insight:'물류 인사이트',glossary:'물류 용어집'};
const cases=[
 ['https://www.kbexpress.kr/blog/#category=news','news',''],
 ['https://www.kbexpress.kr/blog/?category=info','info',''],
 ['https://www.kbexpress.kr/blog/?q=20FT','all','20FT'],
 ['https://www.kbexpress.kr/blog/#category=glossary&q=HS','glossary','HS'],
 ['https://www.kbexpress.kr/blog/','all',''],
];
async function test([start,category,q]) {
 const listeners={};
 function el(id,opts={}) {return {id,dataset:opts.dataset||{},classList:{toggle(){return false},remove(){},add(){},contains(){return false}},addEventListener(event,cb){listeners[id+':'+event]=cb},setAttribute(){},querySelectorAll(){return []},textContent:'',value:'',innerHTML:''}}
 const nodes={menuBtn:el('menuBtn'),mobileNav:el('mobileNav'),blogGrid:el('blogGrid'),emptyState:el('emptyState'),resultCount:el('resultCount'),blogSearch:el('blogSearch')};
 const cats=['all','info','news','service','insight','glossary'].map(k=>{let b=el('tab-'+k,{dataset:{category:k}});b.classList.toggle=(what,on)=>{if(what==='active')b.active=on};return b});
 const loc=new URL(start);
 const location={href:loc.href,hash:loc.hash,search:loc.search,pathname:loc.pathname};
 const history={replaceState(_a,_b,newPath){const u=new URL(newPath,'https://www.kbexpress.kr'); Object.assign(location,{href:u.href,hash:u.hash,search:u.search,pathname:u.pathname})}};
 const document={getElementById(id){return nodes[id]||null},querySelectorAll(sel){if(sel==='[data-category]')return cats;return []}};
 const window={KBRIDGE_BLOG:{labels,loadPosts:()=>Promise.resolve(posts)},addEventListener(name,cb){listeners['window:'+name]=cb}};
 const ctx={document,window,location,history,URL,URLSearchParams,Promise,setTimeout,clearTimeout,console};
 vm.runInNewContext(code,ctx);await new Promise(r=>setTimeout(r,5));
 assert.strictEqual(cats.find(x=>x.active)?.dataset.category,category,start);
 assert.strictEqual(nodes.blogSearch.value,q,start);
 assert.ok(!location.search.includes('category=')&&!location.search.includes('q='),start+'->'+location.href);
 console.log('PASS',start,'->',location.href,'shown:',nodes.resultCount.textContent);
 if(category==='all'&&q===''){
  listeners['tab-news:click']();assert.strictEqual(location.hash,'#category=news');
  nodes.blogSearch.value='CBM';listeners['blogSearch:input']();await new Promise(r=>setTimeout(r,140));
  assert.strictEqual(location.hash,'#category=news&q=CBM'); console.log('PASS tab and live search changed fragment');
  // Header navigation can change a fragment on the SAME document without a reload.
  location.hash='#category=glossary';location.href='https://www.kbexpress.kr/blog/#category=glossary';
  assert.ok(listeners['window:hashchange'],'hashchange listener missing');
  listeners['window:hashchange']();
  assert.strictEqual(cats.find(x=>x.active)?.dataset.category,'glossary');
  assert.strictEqual(nodes.blogSearch.value,'');
  console.log('PASS in-page header category navigation hashchange');
 }
}
(async()=>{for(const sample of cases)await test(sample)})().catch(e=>{console.error(e);process.exit(1)});
