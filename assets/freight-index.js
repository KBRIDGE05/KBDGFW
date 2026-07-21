(() => {
  'use strict';

  const DATA_URL = 'data/freight-data.json';
  const FALLBACK = {
    meta:{generated_at:'2026-07-21T09:00:00+09:00',timezone:'Asia/Seoul'},
    scfi:{short_name:'SCFI',unit:'pt',source_url:'https://www.sse.net.cn/index/singleIndex?indexType=scfi',history:[{date:'2026-06-26',value:3239.64},{date:'2026-07-03',value:3326.87},{date:'2026-07-10',value:3184.83},{date:'2026-07-17',value:3080.31}]},
    bdi:{short_name:'BDI',unit:'pt',source_url:'https://www.balticexchange.com/en/data-services/market-information0/dry-services.html',data_url:'https://en.stockq.org/index/BDI.php',history:[{date:'2026-06-19',value:2722},{date:'2026-06-26',value:2524},{date:'2026-07-03',value:2717},{date:'2026-07-10',value:2944}]},
    kcci:{short_name:'KCCI',unit:'pt / USD·FEU',source_url:'https://www.kobc.or.kr/ebz/shippinginfo/kcci/gridList.do?mId=0304000000',history:[{date:'2026-06-15',value:3349},{date:'2026-06-22',value:3747},{date:'2026-06-29',value:3920},{date:'2026-07-06',value:4330}],routes:[{"group":"Index","code":"KCCI","route":"종합지수","weight":"100%","current":4330,"previous":3920,"change":410,"change_pct":10.46},{"group":"Mainlane","code":"KUWI","route":"미주 서안","weight":"15%","current":6922,"previous":5969,"change":953,"change_pct":15.97},{"group":"Mainlane","code":"KUEI","route":"미주 동안","weight":"10%","current":8421,"previous":7217,"change":1204,"change_pct":16.68},{"group":"Mainlane","code":"KNEI","route":"북유럽","weight":"10%","current":5332,"previous":4720,"change":612,"change_pct":12.97},{"group":"Mainlane","code":"KMDI","route":"지중해","weight":"5%","current":6468,"previous":5876,"change":592,"change_pct":10.07},{"group":"Non-Mainlane","code":"KMEI","route":"중동","weight":"5%","current":7164,"previous":6783,"change":381,"change_pct":5.62},{"group":"Non-Mainlane","code":"KAUI","route":"호주","weight":"5%","current":3574,"previous":3096,"change":478,"change_pct":15.44},{"group":"Non-Mainlane","code":"KLEI","route":"중남미 동안","weight":"5%","current":7854,"previous":7854,"change":0,"change_pct":0},{"group":"Non-Mainlane","code":"KLWI","route":"중남미 서안","weight":"5%","current":5851,"previous":5840,"change":11,"change_pct":0.19},{"group":"Non-Mainlane","code":"KSAI","route":"남아프리카","weight":"2.5%","current":3602,"previous":3483,"change":119,"change_pct":3.42},{"group":"Non-Mainlane","code":"KWAI","route":"서아프리카","weight":"2.5%","current":5419,"previous":5260,"change":159,"change_pct":3.02},{"group":"Intra Asia","code":"KCI","route":"중국","weight":"15%","current":57,"previous":54,"change":3,"change_pct":5.56},{"group":"Intra Asia","code":"KJI","route":"일본","weight":"10%","current":239,"previous":222,"change":17,"change_pct":7.66},{"group":"Intra Asia","code":"KSEI","route":"동남아","weight":"10%","current":1125,"previous":1098,"change":27,"change_pct":2.46}]},
    fsc:{unit:'KRW/kg',providers:{korean_air:{name:'대한항공 Cargo',source_url:'https://cargo.koreanair.com/ko/services/Surcharge-Information',last_checked:'2026-07-08',periods:[{start:'2026-01-16',end:'2026-02-15',mops:2.0079,short:390,medium:410,long:440,status:'expired'},{start:'2026-02-16',end:'2026-03-15',mops:1.9837,short:330,medium:350,long:370,status:'expired'},{start:'2026-03-16',end:'2026-04-15',mops:2.1197,short:450,medium:470,long:510,status:'expired'},{start:'2026-04-16',end:'2026-05-15',mops:4.6524,short:1960,medium:2060,long:2190,status:'expired'},{start:'2026-05-16',end:'2026-06-15',mops:4.772,short:2020,medium:2120,long:2260,status:'expired'},{start:'2026-06-16',end:'2026-07-15',mops:3.6127,short:1360,medium:1420,long:1520,status:'current'},{start:'2026-07-16',end:'2026-08-15',mops:2.9746,short:930,medium:980,long:1050,status:'upcoming'}]},asiana:{name:'아시아나 Cargo',source_url:'https://asianacargo.com/contents/surcharge.do',last_checked:'2026-07-13',periods:[{start:'2026-01-16',end:'2026-02-15',mops:2.0079,short:390,medium:410,long:440,status:'expired'},{start:'2026-02-16',end:'2026-03-15',mops:1.9837,short:330,medium:350,long:370,status:'expired'},{start:'2026-03-16',end:'2026-04-15',mops:2.1197,short:450,medium:470,long:510,status:'expired'},{start:'2026-04-16',end:'2026-05-15',mops:4.6524,short:1960,medium:2060,long:2190,status:'expired'},{start:'2026-05-16',end:'2026-06-15',mops:4.772,short:2020,medium:2120,long:2260,status:'expired'},{start:'2026-06-16',end:'2026-07-15',mops:3.6127,short:1360,medium:1420,long:1520,status:'current'},{start:'2026-07-16',end:'2026-08-15',mops:2.9746,short:930,medium:980,long:1050,status:'upcoming'}]}}}
  };

  const state = {data:FALLBACK,indexSeries:'scfi',range:'all',routeGroup:'all',search:'',category:'all'};
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const fmt = (value, digits=0) => Number(value ?? 0).toLocaleString('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const dateFmt = value => {
    if (!value) return '-';
    const d = new Date(`${value}T00:00:00+09:00`);
    return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  };
  const safe = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const latestTwo = arr => (arr || []).slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-2);
  const currentPeriod = provider => {
    const periods = provider?.periods || [];
    return periods.find(p=>p.status==='current') || periods.slice().sort((a,b)=>a.start.localeCompare(b.start)).at(-1) || null;
  };
  const upcomingPeriod = provider => (provider?.periods || []).find(p=>p.status==='upcoming') || null;
  const diffInfo = history => {
    const rows = latestTwo(history);
    if (rows.length < 2) return {diff:0,pct:0,cls:'flat'};
    const diff = rows[1].value - rows[0].value;
    const pct = rows[0].value ? diff / rows[0].value * 100 : 0;
    return {diff,pct,cls:diff>0?'up':diff<0?'down':'flat'};
  };
  const daysOld = value => {
    if (!value) return 999;
    const d = new Date(`${value}T00:00:00+09:00`);
    return Math.floor((Date.now()-d.getTime())/86400000);
  };
  const validBdiHistory = history => {
    const today = new Date();
    today.setHours(23,59,59,999);
    return (history || []).filter(item => {
      const value = Number(item?.value);
      const day = new Date(`${item?.date || ''}T00:00:00+09:00`);
      return Number.isFinite(value) && value >= 100 && value <= 20000 &&
        !Number.isNaN(day.getTime()) && day <= today;
    }).sort((a,b)=>a.date.localeCompare(b.date));
  };
  const normalizeFreightData = data => {
    const normalized = data && typeof data === 'object' ? data : FALLBACK;
    normalized.bdi = normalized.bdi || {...FALLBACK.bdi};
    const valid = validBdiHistory(normalized.bdi.history);
    normalized.bdi.history = valid.length ? valid : FALLBACK.bdi.history.slice();
    return normalized;
  };

  async function loadData(){
    try{
      const res = await fetch(`${DATA_URL}?v=${Date.now()}`,{cache:'no-store'});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = normalizeFreightData(await res.json());
    }catch(err){
      console.warn('Using embedded freight-data fallback:',err);
      state.data = normalizeFreightData(FALLBACK);
    }
    renderAll();
  }

  function renderAll(){
    renderHero();
    renderSummary();
    renderIndexChart();
    renderSignals();
    renderRoutes();
    renderFscCards();
    renderFscChart();
    renderSources();
    applySearch();
    $$('[data-loading]').forEach(el=>el.classList.remove('loading'));
  }

  function renderHero(){
    const s = latestTwo(state.data.scfi?.history || []).at(-1);
    const k = latestTwo(state.data.kcci?.history || []).at(-1);
    const b = latestTwo(state.data.bdi?.history || []).at(-1);
    const f = currentPeriod(state.data.fsc?.providers?.korean_air || {});
    $('#heroScfi').textContent = s ? fmt(s.value,2) : '-';
    $('#heroKcci').textContent = k ? fmt(k.value) : '-';
    $('#heroBdi').textContent = b ? fmt(b.value) : '-';
    $('#heroFsc').textContent = f ? `${fmt(f.short)}~${fmt(f.long)}` : '-';
    $('#heroUpdated').textContent = `데이터 생성 ${new Date(state.data.meta?.generated_at || Date.now()).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`;
  }

  function cardData(key){
    const item = state.data[key];
    const rows = latestTwo(item?.history || []);
    const latest = rows.at(-1);
    const change = diffInfo(item?.history || []);
    return {latest,change,item};
  }

  function summaryCard({key,label,title,unit,digits=0}){
    const {latest,change,item} = cardData(key);
    const stale = daysOld(latest?.date) > 10;
    const sign = change.diff>0?'+':'';
    return `<article class="summary-card searchable" data-search="${safe(`${label} ${title} 운임지수`) }" data-category="${key}">
      <div class="summary-top"><div class="summary-name"><span>${safe(label)}</span><h3>${safe(title)}</h3></div><span class="status-pill ${stale?'stale':''}">${stale?'확인 필요':'최신 반영'}</span></div>
      <div class="summary-value"><strong>${latest?fmt(latest.value,digits):'-'}</strong><span>${safe(unit)}</span></div>
      <div class="change ${change.cls}">${sign}${fmt(change.diff,digits)} (${sign}${fmt(change.pct,2)}%) · 전주 대비</div>
      <svg class="sparkline" id="spark-${key}" aria-label="${safe(label)} 추세선"></svg>
      <div class="summary-foot"><span>기준 ${dateFmt(latest?.date)}</span><a href="${safe(item?.data_url || item?.source_url || '#')}" target="_blank" rel="noopener">데이터 출처 ↗</a></div>
    </article>`;
  }

  function renderSummary(){
    const provider = state.data.fsc?.providers?.korean_air || {};
    const period = currentPeriod(provider);
    const stale = daysOld(provider.last_checked) > 35;
    const html = summaryCard({key:'scfi',label:'SCFI',title:'상하이컨테이너 운임지수',unit:'pt',digits:2}) +
      summaryCard({key:'kcci',label:'KCCI',title:'KOBC 컨테이너 운임지수',unit:'pt',digits:0}) +
      summaryCard({key:'bdi',label:'BDI',title:'발틱 건화물 운임지수',unit:'pt',digits:0}) +
      `<article class="summary-card fsc-summary searchable" data-search="FSC 항공 유류할증료 대한항공 아시아나 단거리 중거리 장거리" data-category="fsc">
        <div class="summary-top"><div class="summary-name"><span>AIR CARGO FSC</span><h3>한국발 항공 FSC</h3></div><span class="status-pill ${stale?'stale':''}">${stale?'확인 필요':'최신 반영'}</span></div>
        <div class="summary-value"><strong>${period?`${fmt(period.short)}–${fmt(period.long)}`:'-'}</strong><span>KRW/kg</span></div>
        <div class="change flat">단·중·장거리 요율</div>
        <svg class="sparkline" id="spark-fsc" aria-label="항공 FSC 추세선"></svg>
        <div class="summary-foot"><span>${period?`${dateFmt(period.start)} ~ ${dateFmt(period.end)}`:'기준일 없음'}</span><a href="${safe(provider.source_url || '#')}" target="_blank" rel="noopener">데이터 출처 ↗</a></div>
      </article>`;
    $('#summaryGrid').innerHTML = html;
    drawSparkline($('#spark-scfi'),(state.data.scfi?.history||[]).map(x=>x.value));
    drawSparkline($('#spark-kcci'),(state.data.kcci?.history||[]).map(x=>x.value));
    drawSparkline($('#spark-bdi'),(state.data.bdi?.history||[]).map(x=>x.value));
    drawSparkline($('#spark-fsc'),(provider.periods||[]).map(x=>x.long));
  }

  function drawSparkline(svg, values){
    if(!svg || !values.length) return;
    const w=128,h=52,p=4,min=Math.min(...values),max=Math.max(...values),span=max-min||1;
    const points=values.map((v,i)=>`${p+(w-p*2)*(i/Math.max(1,values.length-1))},${h-p-(h-p*2)*((v-min)/span)}`).join(' ');
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    svg.innerHTML=`<polyline points="${points}" fill="none" stroke="#2b5cdb" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><line x1="4" x2="124" y1="48" y2="48" stroke="#dce5f2" stroke-width="1"/>`;
  }

  function ranged(history){
    const rows=(history||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
    const n={4:4,12:12,26:26,52:52}[state.range];
    return n?rows.slice(-n):rows;
  }

  function lineChart(svg, series, options={}){
    if(!svg) return;
    const width=760,height=320,pad={l:58,r:18,t:18,b:42};
    const all=series.flatMap(s=>s.values.map(v=>v.value)).filter(Number.isFinite);
    if(all.length<2){svg.innerHTML='<foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="chart-empty">자동 업데이트가 누적되면 추세선이 확장됩니다.<br>현재 확보된 발표값을 먼저 표시합니다.</div></foreignObject>';return;}
    const min0=Math.min(...all),max0=Math.max(...all),extra=(max0-min0||Math.max(1,max0*.05))*.16,min=Math.max(0,min0-extra),max=max0+extra;
    const labels=[...new Set(series.flatMap(s=>s.values.map(v=>v.date)))].sort();
    const x=date=>pad.l+(width-pad.l-pad.r)*(labels.indexOf(date)/Math.max(1,labels.length-1));
    const y=value=>pad.t+(height-pad.t-pad.b)*(1-(value-min)/(max-min||1));
    const ticks=4;
    let out='';
    for(let i=0;i<=ticks;i++){
      const yy=pad.t+(height-pad.t-pad.b)*(i/ticks),val=max-(max-min)*(i/ticks);
      out+=`<line x1="${pad.l}" x2="${width-pad.r}" y1="${yy}" y2="${yy}" stroke="#e6ebf2" stroke-width="1"/><text x="${pad.l-10}" y="${yy+4}" text-anchor="end" fill="#7b899d" font-size="10">${fmt(val,options.digits??0)}</text>`;
    }
    labels.forEach((label,i)=>{
      if(labels.length>8 && i%Math.ceil(labels.length/6)!==0 && i!==labels.length-1) return;
      out+=`<text x="${x(label)}" y="${height-14}" text-anchor="middle" fill="#7b899d" font-size="10">${label.slice(5)}</text>`;
    });
    series.forEach((s,idx)=>{
      const color=s.color || ['#2b5cdb','#2384c6','#15836d'][idx%3];
      const points=s.values.map(v=>`${x(v.date)},${y(v.value)}`).join(' ');
      out+=`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      s.values.forEach(v=>{out+=`<circle cx="${x(v.date)}" cy="${y(v.value)}" r="4" fill="#fff" stroke="${color}" stroke-width="2"><title>${s.name} ${v.date}: ${fmt(v.value,options.digits??0)}</title></circle>`;});
    });
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=out;
  }

  function renderIndexChart(){
    const item=state.data[state.indexSeries];
    const values=ranged(item?.history||[]);
    lineChart($('#indexChart'),[{name:item?.short_name||state.indexSeries.toUpperCase(),values}],{digits:state.indexSeries==='scfi'?2:0});
    const latest=values.at(-1),first=values[0];
    const pct=first&&latest&&first.value?((latest.value-first.value)/first.value*100):0;
    $('#chartTitle').textContent=`${item?.short_name||state.indexSeries.toUpperCase()} 추세`;
    $('#chartPeriod').textContent=values.length?`${dateFmt(values[0].date)} ~ ${dateFmt(values.at(-1).date)}`:'데이터 없음';
    $('#chartChange').textContent=values.length>1?`선택기간 ${pct>=0?'+':''}${fmt(pct,2)}%`:'발표값 누적 중';
  }

  function renderSignals(){
    const s=cardData('scfi'),k=cardData('kcci'),b=cardData('bdi');
    const f=currentPeriod(state.data.fsc?.providers?.korean_air || {});
    const rows=[
      ['SCFI 주간 방향',s.change.diff>0?'상승':s.change.diff<0?'하락':'보합',`${s.change.diff>=0?'+':''}${fmt(s.change.pct,2)}%`],
      ['KCCI 주간 방향',k.change.diff>0?'상승':k.change.diff<0?'하락':'보합',`${k.change.diff>=0?'+':''}${fmt(k.change.pct,2)}%`],
      ['BDI 주간 방향',b.change.diff>0?'상승':b.change.diff<0?'하락':'보합',`${b.change.diff>=0?'+':''}${fmt(b.change.pct,2)}%`],
      ['항공 FSC 범위',f?`${fmt(f.short)}~${fmt(f.long)}원`:'확인 중','Chargeable Weight 기준']
    ];
    $('#signalList').innerHTML=rows.map(r=>`<div class="signal"><span>${safe(r[0])}</span><strong>${safe(r[1])}</strong><small>${safe(r[2])}</small></div>`).join('');
  }

  function renderRoutes(){
    const rows=(state.data.kcci?.routes||[]).filter(row=>state.routeGroup==='all'||row.group===state.routeGroup).filter(row=>!state.search||`${row.code} ${row.route} ${row.group}`.toLowerCase().includes(state.search));
    $('#routeBody').innerHTML=rows.length?rows.map(row=>{
      const cls=row.change_pct>0?'up':row.change_pct<0?'down':'flat';
      return `<tr class="searchable" data-category="kcci" data-search="${safe(`${row.code} ${row.route} ${row.group}`)}"><td>${safe(row.group)}</td><td><span class="route-code"><b>${safe(row.code)}</b><span>${safe(row.route)}</span></span></td><td>${safe(row.weight)}</td><td>${fmt(row.current)}</td><td>${fmt(row.previous)}</td><td class="pct ${cls}">${row.change>0?'+':''}${fmt(row.change)}</td><td class="pct ${cls}">${row.change_pct>0?'+':''}${fmt(row.change_pct,2)}%</td></tr>`;
    }).join(''):'<tr><td colspan="7" style="text-align:center;padding:36px;color:#7b899d">검색 조건에 맞는 KCCI 항로가 없습니다.</td></tr>';
    $('#routeCount').textContent=`${rows.length}개 항목`;
  }

  function periodMarkup(period,current=true){
    if(!period) return '<div class="period-box">발표값을 확인 중입니다.</div>';
    return `<div class="period-box"><div class="period-label"><span>${dateFmt(period.start)} ~ ${dateFmt(period.end)}</span><b>${current?'현재 적용':'예정'}</b></div><div class="rate-grid">
      <div class="rate"><span>단거리</span><strong>${fmt(period.short)}</strong><small>KRW/kg</small></div>
      <div class="rate"><span>중거리</span><strong>${fmt(period.medium)}</strong><small>KRW/kg</small></div>
      <div class="rate"><span>장거리</span><strong>${fmt(period.long)}</strong><small>KRW/kg</small></div>
    </div></div>`;
  }

  function renderFscCards(){
    const providers=state.data.fsc?.providers||{};
    $('#fscGrid').innerHTML=Object.entries(providers).map(([key,p])=>{
      const current=currentPeriod(p),next=upcomingPeriod(p);
      const nextText=next?`다음 적용 예정 <strong>${dateFmt(next.start)}</strong> · ${fmt(next.short)} / ${fmt(next.medium)} / ${fmt(next.long)}원`:'다음 발표값은 공식 페이지 갱신 후 자동 반영됩니다.';
      return `<article class="fsc-card searchable" data-category="fsc" data-search="${safe(`${p.name} FSC 유류할증료 단거리 중거리 장거리`)}">
        <div class="fsc-head"><div><span>AIRLINE FSC</span><h3>${safe(p.name)}</h3></div><div class="airline-badge">한국발 국제선</div></div>
        ${periodMarkup(current,true)}
        <div class="next-period">${nextText}</div>
        <div class="fsc-foot"><span>확인 ${dateFmt(p.last_checked)}</span><a href="${safe(p.source_url)}" target="_blank" rel="noopener">데이터 출처 ↗</a></div>
      </article>`;
    }).join('');
  }

  function renderFscChart(){
    // 대한항공과 아시아나의 한국발 FSC가 동일하게 적용되므로
    // 항공사 선택 없이 하나의 공통 추세선으로 표시합니다.
    const providers=state.data.fsc?.providers||{};
    const p=providers.korean_air||providers.asiana||Object.values(providers)[0]||{};
    const periods=(p.periods||[]).slice().sort((a,b)=>a.start.localeCompare(b.start));
    const series=[
      {name:'단거리',color:'#2b5cdb',values:periods.map(x=>({date:x.start,value:x.short}))},
      {name:'중거리',color:'#2384c6',values:periods.map(x=>({date:x.start,value:x.medium}))},
      {name:'장거리',color:'#15836d',values:periods.map(x=>({date:x.start,value:x.long}))}
    ];
    lineChart($('#fscChart'),series,{digits:0});
    $('#fscChartTitle').textContent='한국발 항공 FSC 추세';
  }

  function renderSources(){
    const cards=[
      ['SCFI','Shanghai Shipping Exchange','상하이발 수출 컨테이너 현물운임의 종합·항로별 지수입니다. 매주 금요일 발표값을 확인합니다.',state.data.scfi?.source_url],
      ['KCCI','한국해양진흥공사 KOBC','부산발 13개 항로를 기반으로 한 종합 컨테이너 운임지수입니다. 매주 월요일 14시 발표값을 확인합니다.',state.data.kcci?.source_url],
      ['BDI','Baltic Exchange · 공개 지연 시세','철광석·석탄·곡물 등 건화물 운송시장을 나타내는 종합지수입니다. 매주 최신 영업일 종가를 누적합니다.',state.data.bdi?.data_url || state.data.bdi?.source_url],
      ['AIR FSC','대한항공·아시아나 Cargo','한국발 국제선 화물의 단거리·중거리·장거리 유류할증료를 항공사별로 비교합니다.',state.data.fsc?.providers?.korean_air?.source_url]
    ];
    $('#sourceGrid').innerHTML=cards.map(c=>`<article class="source-card"><span>${safe(c[0])}</span><h3>${safe(c[1])}</h3><p>${safe(c[2])}</p><a href="${safe(c[3])}" target="_blank" rel="noopener">출처 페이지 확인 ↗</a></article>`).join('');
  }

  function applySearch(){
    const q=state.search;
    $$('.searchable').forEach(el=>{
      const text=(el.dataset.search||el.textContent||'').toLowerCase();
      const category=el.dataset.category||'all';
      const categories=category.split(/\s+/).filter(Boolean);
      const categoryMatch=state.category==='all'||categories.includes(state.category);
      const queryMatch=!q||text.includes(q);
      el.classList.toggle('hidden-by-search',!(categoryMatch&&queryMatch));
      el.classList.toggle('search-hit',Boolean(q&&queryMatch&&categoryMatch));
    });
    renderRoutes();
  }

  function bind(){
    $('#menuBtn')?.addEventListener('click',()=>{$('#mobileNav').classList.toggle('open');});
    $('#globalSearch')?.addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();applySearch();});
    $$('.search-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.search-tabs button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.category=btn.dataset.category;applySearch();
      if(state.category!=='all') document.querySelector(`[data-category="${state.category}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    }));
    $$('[data-index-series]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-index-series]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.indexSeries=btn.dataset.indexSeries;renderIndexChart();
    }));
    $$('[data-range]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-range]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.range=btn.dataset.range;renderIndexChart();
    }));
    $$('[data-route-group]').forEach(btn=>btn.addEventListener('click',()=>{
      $$('[data-route-group]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.routeGroup=btn.dataset.routeGroup;renderRoutes();
    }));
  }

  bind();loadData();
})();
