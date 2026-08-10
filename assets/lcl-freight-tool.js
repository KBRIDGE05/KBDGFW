(()=>{
  "use strict";
  let PERIOD_LABEL=window.KBridgeFreightPeriod?.getLabel?.()||"2026년 8월";
  let PERIOD_CODE=window.KBridgeFreightPeriod?.getPeriod?.()||"2026-08";
  const state={data:null,regionMap:new Map(),entryMap:new Map(),loading:null,fallbackOrigin:false,currentEntries:[]};
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const num=id=>Math.max(0,Number(document.getElementById(id)?.value)||0);
  const money=value=>Number(value).toLocaleString("en-US",{maximumFractionDigits:2});
  const elements=()=>({region:$("#lclRegion"),origin:$("#lclOrigin"),country:$("#lclCountry"),destination:$("#lclDestination"),result:$("#lclRateResult"),status:$("#lclRateDataStatus")});
  const destinationName=entry=>entry?.destinationKo?`${entry.destinationKo} (${entry.destination})`:entry?.destination||"";
  const countryName=value=>{const item=state.data?.countries?.[value];return item?.ko?`${item.ko} (${item.en||value})`:value||""};
  const sectionName=value=>({"Main Port":"주요항","Main/Inland":"주요항·내륙","Inland":"내륙","WEST COAST":"서안","EAST COAST":"동안","MID WEST":"중서부","CANADA":"캐나다","GULF":"걸프","Oceania":"오세아니아","Shanghai T/S":"상하이 환적","Hong Kong T/S":"홍콩 환적"}[value]||value||"");

  function cargoInfo(){
    const cbm=num("lclManualCbm"),kg=num("lclWeight");
    return{cbm,kg,ton:kg/1e3};
  }
  function selectedEntry(){
    const select=elements().destination,id=select?.selectedOptions?.[0]?.dataset?.entryId;
    return id&&state.entryMap.get(id)||null;
  }
  function estimate(entry,info=cargoInfo()){
    if(!entry)return{kind:"none",amount:null,chargeable:0,label:"도착 포트를 선택해 주세요."};
    if(state.fallbackOrigin&&elements().origin?.value==="인천")return{kind:"incheon",amount:null,chargeable:0,label:"인천 출발은 실견적 확인"};
    if(entry.status==="unavailable")return{kind:"unavailable",amount:null,chargeable:0,label:entry.rateDisplay||"서비스 중단"};
    if(entry.status==="on_request")return{kind:"on_request",amount:null,chargeable:0,label:"별도 문의"};
    if(entry.status==="inquiry")return{kind:"inquiry",amount:null,chargeable:0,label:entry.rateDisplay&&entry.rateDisplay!=="-"?entry.rateDisplay:"실견적 확인"};
    if(entry.calcType==="tiered"&&Array.isArray(entry.tiers)&&entry.tiers.length){
      if(!info.cbm&&!info.kg)return{kind:"tiered",amount:null,chargeable:0,label:"화물 정보를 입력해 주세요."};
      const tier=entry.tiers.find(item=>{const source=String(item.basis??"").trim().replace(/,/g,"");const kg=source.match(/([\d.]+)\s*kgs?/i),cbm=source.match(/([\d.]+)\s*cbm/i);return info.kg<=(kg?Number(kg[1]):Infinity)&&info.cbm<=(cbm?Number(cbm[1]):Infinity)});
      return tier?{kind:"tiered",amount:Number(tier.rate),chargeable:0,label:`USD ${money(tier.rate)}`,tier}:{kind:"tier_exceeded",amount:null,chargeable:0,label:"표준 구간 초과 · 별도 문의"};
    }
    const density=Number(entry.weightKgPerCbm)||1000;
    let chargeable=Math.max(info.cbm,info.kg/density,Number(entry.minimumCbm)||0);
    if(!info.cbm&&!info.kg&&!entry.minimumCbm)chargeable=0;
    if(entry.calcType==="dual"){
      if(!info.cbm&&!info.kg)return{kind:"dual",amount:null,chargeable:0,label:`USD ${entry.rateDisplay}`};
      const amount=Math.max((Number(entry.rateCbm)||0)*info.cbm,(Number(entry.rateTon)||0)*info.ton,Number(entry.minValue)||0);
      return{kind:"dual",amount,chargeable:Math.max(info.cbm,info.ton),label:`USD ${money(amount)}`};
    }
    const rate=Number(entry.rateValue);
    if(!Number.isFinite(rate))return{kind:"inquiry",amount:null,chargeable,label:"실견적 확인"};
    if(!chargeable){const prefix=entry.calcType==="add_on"?"추가 ":"";return{kind:entry.calcType,amount:null,chargeable:0,label:`${prefix}USD ${money(rate)} / W/M`}}
    const amount=Math.max(rate*chargeable,Number(entry.minValue)||0),prefix=entry.calcType==="add_on"?"추가 ":"";
    return{kind:entry.calcType,amount,chargeable,label:`${prefix}USD ${money(amount)}`};
  }
  function rateUnit(entry){
    if(!entry)return"-";
    if(entry.status!=="available")return entry.rateDisplay||"-";
    if(entry.calcType==="tiered")return entry.tiers.map(t=>`USD ${money(t.rate)} (${t.basis})`).join(" · ");
    if(entry.calcType==="dual")return`USD ${entry.rateDisplay}`;
    return`USD ${entry.calcType==="add_on"?"+":""}${entry.rateDisplay.replace(/^\+\s*/,"")} / W/M`;
  }
  function renderResult(){
    const{result}=elements(); if(!result)return;
    const entry=selectedEntry(),calc=estimate(entry,cargoInfo());
    if(!entry){result.innerHTML='<div class="lcl-rate-empty"><strong>도착 포트를 선택해 주세요.</strong><span>LCL 해상운임을 확인할 수 있습니다.</span></div>';window.updateQuoteSummary?.();return}
    const minimum=entry.minDisplay&&entry.minDisplay!=="-"?`USD ${entry.minDisplay.replace(/^\+\s*/,"+")}`:entry.minimumCbm?`${entry.minimumCbm} CBM`:"-";
    const collect=entry.collect==="Y"?"가능":entry.collect==="N"?"불가":"-";
    const estimateTitle=calc.kind==="add_on"?"예상 추가운임":calc.kind==="tiered"?"적용 예상운임":"예상 해상운임";
    const originNotice=state.fallbackOrigin&&elements().origin?.value==="인천"?'<div class="lcl-rate-warning">현재 선택 노선은 부산 출발 공개운임입니다. 인천 출발은 담당자가 별도 확인합니다.</div>':"";
    const addOnNotice=entry.calcType==="add_on"?'<div class="lcl-rate-warning">표시 금액은 기본항 해상운임에 더해지는 내륙·환적 추가운임입니다.</div>':"";
    const note=[entry.remark,entry.tsFee?`T/S FEE: USD ${entry.tsFee}`:""].filter(Boolean).join("\n");
    const statusText=entry.status==="unavailable"?"서비스 중단/미제공":entry.status==="on_request"?"운임 별도 문의":entry.status==="inquiry"?"담당자 확인 필요":entry.calcType==="add_on"?"기본항 운임 + 추가운임":entry.calcType==="tiered"?"화물 구간별 정액":"조회 가능";
    result.innerHTML=`<div class="lcl-rate-head"><div><span class="rate-period-badge" data-rate-period-label>${PERIOD_LABEL}</span><strong>${esc(destinationName(entry))}</strong><small>${esc([countryName(entry.country),sectionName(entry.section)].filter(Boolean).join(" · "))}</small></div><span class="lcl-rate-status is-${esc(entry.status)}">${esc(statusText)}</span></div><div class="lcl-rate-price-row"><div><span>기본 운임</span><strong>${esc(rateUnit(entry))}</strong></div><div><span>${estimateTitle}</span><strong>${esc(calc.label)}</strong></div></div><div class="lcl-rate-detail-grid"><div><span>최소운임/기준</span><b>${esc(entry.basisDisplay||minimum)}</b></div><div><span>운임 산정기준</span><b>${entry.weightKgPerCbm&&entry.weightKgPerCbm!==1000?`1 CBM = ${esc(entry.weightKgPerCbm)} KG`:"W/M (CBM 또는 TON)"}</b></div><div><span>운항 빈도</span><b>${esc(entry.frequency||"-")}</b></div><div><span>운송기간</span><b>${esc(entry.transitTime?`${entry.transitTime}일`:"-")}</b></div><div><span>경유/환적</span><b>${esc(entry.route||"Direct")}</b></div><div><span>운임 Collect</span><b>${esc(collect)}</b></div></div>${originNotice}${addOnNotice}${note?`<div class="lcl-rate-note">${esc(note).replace(/\n/g,"<br>")}</div>`:""}<p class="lcl-rate-disclaimer">해상 기본운임 참고값입니다. CFS·THC·DOC·ENS/AMS·도착지 비용·통관·픽업·특수화물 할증은 별도이며, 실제 선적 가능 여부와 최종 운임은 정식 견적으로 확정됩니다.</p>`;
    window.updateQuoteSummary?.();
  }
  function entriesForSelection(){
    const{region,origin}=elements(); const group=state.regionMap.get(region?.value)||state.data?.regions?.[0];
    let entries=[...(group?.entries||[])]; const wanted=origin?.value==="인천"?"Incheon":"Busan",exact=entries.filter(e=>e.origin===wanted);
    state.fallbackOrigin=wanted==="Incheon"&&exact.length===0; if(exact.length)entries=exact;
    return{group,entries};
  }
  function populateCountries(preferredCountry="",preferredId=""){
    const{country,destination,status}=elements(); if(!state.data||!country||!destination)return;
    const{group,entries}=entriesForSelection(); state.currentEntries=entries;
    const countries=[...new Set(entries.map(e=>e.country).filter(Boolean))].sort((a,b)=>countryName(a).localeCompare(countryName(b),"ko",{sensitivity:"base"}));
    country.innerHTML='<option value="">도착 국가를 선택하세요</option>'+countries.map(name=>`<option value="${esc(name)}">${esc(countryName(name))}</option>`).join("");
    if(preferredCountry&&countries.includes(preferredCountry))country.value=preferredCountry;else if(countries.length)country.selectedIndex=1;
    if(status)status.textContent=`${group?.label||"조회 권역"} · ${PERIOD_LABEL} 기준`;
    populateDestinations(preferredId);
  }
  function populateDestinations(preferredId=""){
    const{country,destination,status}=elements(); if(!destination)return;
    const selectedCountry=country?.value||"";
    const entries=state.currentEntries.filter(e=>!selectedCountry||e.country===selectedCountry).sort((a,b)=>`${a.destination}|${a.section}|${a.route}`.localeCompare(`${b.destination}|${b.section}|${b.route}`,"en"));
    const counts=entries.reduce((m,e)=>m.set(e.destination,(m.get(e.destination)||0)+1),new Map());
    destination.innerHTML='<option value="">도착 포트를 선택하세요</option>'+entries.map(entry=>{const suffix=counts.get(entry.destination)>1?sectionName(entry.section||entry.route||entry.origin):"";const label=[destinationName(entry),suffix].filter(Boolean).join(" · ");const stateLabel=entry.status==="unavailable"?" · 미제공":entry.status==="on_request"||entry.status==="inquiry"?" · 문의":"";return`<option value="${esc(entry.destination)}" data-entry-id="${esc(entry.id)}">${esc(label+stateLabel)}</option>`}).join("");
    const target=preferredId&&entries.find(e=>e.id===preferredId); if(target)destination.value=target.destination;else if(entries.length)destination.selectedIndex=1;
    if(status)status.textContent=`${elements().region?.selectedOptions?.[0]?.textContent||"조회 권역"} · ${selectedCountry?countryName(selectedCountry):"도착 국가 선택"} · ${PERIOD_LABEL} 기준`;
    renderResult();
  }
  async function load(){
    if(state.data)return state.data;if(state.loading)return state.loading;
    const{status,result}=elements(); if(status)status.textContent=`${PERIOD_LABEL} LCL 운임 데이터를 불러오는 중입니다.`;
    if(result)result.innerHTML='<div class="lcl-rate-empty is-loading"><strong>운임 데이터 확인 중</strong><span>잠시 후 도착 국가와 포트를 선택할 수 있습니다.</span></div>';
    state.loading=fetch("data/lcl-freight.json?v="+Date.now(),{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`운임 데이터 응답 오류 (${r.status})`);return r.json()}).then(data=>{PERIOD_LABEL=data?.meta?.periodLabel||PERIOD_LABEL;PERIOD_CODE=data?.meta?.period||PERIOD_CODE;window.KBridgeFreightPeriod?.apply?.(data.meta||{});state.data=data;state.regionMap=new Map(data.regions.map(r=>[r.id,r]));data.regions.forEach(r=>r.entries.forEach(e=>state.entryMap.set(e.id,e)));const{region}=elements();if(region){region.innerHTML=data.regions.map(item=>`<option value="${esc(item.id)}">${esc(item.label)}</option>`).join("");populateCountries()}return data}).catch(error=>{console.error("[KBRIDGE] LCL freight data:",error);if(status)status.textContent="LCL 운임 데이터를 불러오지 못했습니다.";if(result)result.innerHTML='<div class="lcl-rate-empty is-error"><strong>운임 조회를 불러오지 못했습니다.</strong><span>정식 견적문의로 접수해 주세요.</span></div>';throw error});
    return state.loading;
  }
  function bind(){
    const{region,origin,country,destination}=elements();
    region?.addEventListener("change",()=>populateCountries());origin?.addEventListener("change",()=>populateCountries(country?.value||""));country?.addEventListener("change",()=>populateDestinations());destination?.addEventListener("change",renderResult);
    ["lclPieces","lclWeight","lclManualCbm"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>setTimeout(renderResult,0)));
    document.querySelector('[data-quote-mode="lcl"]')?.addEventListener("click",load,{once:true});
    if(!navigator.connection?.saveData){"requestIdleCallback" in window?requestIdleCallback(load,{timeout:5000}):setTimeout(load,2500)}
  }
  window.KBridgeLclFreight={load,getSelectedEntry:selectedEntry,getPeriodLabel:()=>PERIOD_LABEL,getPeriod:()=>PERIOD_CODE,getPeriodCompact:()=>PERIOD_CODE.replace("-","."),getEstimate:()=>estimate(selectedEntry(),cargoInfo()),getSummary(){const entry=selectedEntry(),calc=estimate(entry,cargoInfo());if(!entry)return{price:"도착 포트 선택",note:`${PERIOD_LABEL} LCL 해상운임 조회를 위해 도착 국가와 포트를 선택해 주세요.`};const note=state.fallbackOrigin&&elements().origin?.value==="인천"?`${PERIOD_LABEL} 부산 출발 공개운임 참고값입니다. 인천 출발은 담당자가 실견적으로 확인합니다.`:`${PERIOD_LABEL} 기준 ${destinationName(entry)} LCL 해상 기본운임입니다. 부대비용과 실제 선적 가능 여부는 별도 확인됩니다.`;return{price:calc.label,note}},getInquiryText(){const entry=selectedEntry();if(!entry)return`${PERIOD_LABEL} 공개운임 미선택`;const calc=estimate(entry,cargoInfo());return`${PERIOD_LABEL} / ${entry.regionLabel} / ${countryName(entry.country)} ${destinationName(entry)} / 기본운임 ${rateUnit(entry)} / 조회결과 ${calc.label}`},getEstimatedPrice(){const entry=selectedEntry(),calc=estimate(entry,cargoInfo());return entry?`${PERIOD_LABEL} ${calc.label}`:"LCL 실견적 회신"}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();
