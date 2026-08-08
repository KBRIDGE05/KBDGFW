(()=>{"use strict";
let xlsxPromise;
const STORAGE_KEY="kbridgeOceanFreightPreviewV1";
const adminPanel=document.getElementById("oceanRateAdmin");
const fileInput=document.getElementById("oceanRateFile");
const resetButton=document.getElementById("oceanRateReset");
const statusEl=document.getElementById("oceanRateStatus");
let periodMeta={period:"",periodLabel:"",compact:""};

const isAdminPreview=()=>"1"===new URLSearchParams(location.search).get("rateAdmin")||"#rate-admin"===location.hash;
const setStatus=(message,type="")=>{if(!statusEl)return;statusEl.textContent=message;statusEl.classList.toggle("is-success","success"===type);statusEl.classList.toggle("is-error","error"===type)};
const cleanHeader=value=>String(value??"").trim().replace(/[\s_-]+/g,"").toLowerCase();
const normalizedAliases=Object.fromEntries(Object.entries({active:["사용여부","활성","active","use"],region:["권역","지역","region"],label:["도착포트한글","포트한글","한글명","label"],value:["도착포트영문","포트영문","영문명","value","port"],fcl20:["20ftusd","fcl20","20ft","20gp"],fcl40:["40ftusd","fcl40","40ft","40gp","40hq"],order:["정렬순서","순서","sort","order"]}).map(([key,list])=>[key,list.map(cleanHeader)]));
const getField=(row,field)=>{const matched=Object.keys(row).find(key=>normalizedAliases[field].includes(cleanHeader(key)));return matched?row[matched]:""};
const parseNumber=value=>{const parsed=Number(String(value??"").replace(/[$,\s]/g,""));return Number.isFinite(parsed)?parsed:NaN};

const periodFromDate=value=>{
  if(!value)return null;
  if("string"===typeof value){const direct=value.match(/(20\d{2})[-/.](0?[1-9]|1[0-2])/);if(direct)return`${direct[1]}-${String(direct[2]).padStart(2,"0")}`}
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
};
const periodDetails=period=>{const m=String(period||"").match(/^(20\d{2})-(0[1-9]|1[0-2])$/);if(!m)return null;const month=Number(m[2]);return{period:`${m[1]}-${m[2]}`,periodLabel:`${m[1]}년 ${month}월`,compact:`${m[1]}.${m[2]}`}};
const applyPeriod=(period,source="published-xlsx")=>{
  const next=periodDetails(period);if(!next)return;
  if(periodMeta.period&&source!=="admin-preview"&&source!=="saved-preview"&&next.period<periodMeta.period)return;
  periodMeta=next;
  document.querySelectorAll("[data-fcl-rate-period-label]").forEach(el=>{el.textContent=next.periodLabel});
  window.dispatchEvent(new CustomEvent("kbridge:ocean-freight-period",{detail:{...next,source}}));
};
const loadPublishedPeriodMeta=async()=>{
  try{
    const response=await fetch(`data/ocean-freight-meta.json?v=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)return;
    const meta=await response.json();
    if(meta?.period)applyPeriod(meta.period,"published-meta");
  }catch(error){console.warn("[KBRIDGE] ocean freight period metadata fallback:",error)}
};

const workbookPeriod=(workbook,fallbackDate)=>{
  const props=workbook?.Props||{};
  return periodFromDate(props.ModifiedDate)||periodFromDate(props.CreatedDate)||periodFromDate(fallbackDate);
};

const ensureXlsx=()=>window.XLSX?Promise.resolve(window.XLSX):xlsxPromise||(xlsxPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";script.async=!0;script.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error("엑셀 처리 모듈 초기화에 실패했습니다."));script.onerror=()=>reject(new Error("엑셀 처리 모듈을 불러오지 못했습니다."));document.head.appendChild(script)}),xlsxPromise);

const workbookToData=(arrayBuffer,fallbackDate)=>{
  if(!window.XLSX)throw new Error("엑셀 처리 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
  const workbook=window.XLSX.read(arrayBuffer,{type:"array",cellDates:!0});
  const sheetName=workbook.SheetNames.includes("해상운임")?"해상운임":workbook.SheetNames[0];
  if(!sheetName)throw new Error("엑셀 시트를 찾을 수 없습니다.");
  const sheet=workbook.Sheets[sheetName];
  const rows=window.XLSX.utils.sheet_to_json(sheet,{defval:"",raw:!0});
  const regionOrder=[],grouped={},seen=new Set;
  rows.forEach((row,rowIndex)=>{
    const active=String(getField(row,"active")??"Y").trim().toUpperCase();
    if(["N","NO","FALSE","0","미사용","비활성"].includes(active))return;
    const region=String(getField(row,"region")??"").trim();
    const label=String(getField(row,"label")??"").trim();
    const value=String(getField(row,"value")??"").trim();
    const fcl20=parseNumber(getField(row,"fcl20"));
    const fcl40=parseNumber(getField(row,"fcl40"));
    const orderValue=parseNumber(getField(row,"order"));
    if(!(region&&label&&value&&Number.isFinite(fcl20)&&Number.isFinite(fcl40)))return;
    const dedupeKey=`${region}::${value}`.toLowerCase();
    if(seen.has(dedupeKey))return;
    seen.add(dedupeKey);
    if(!grouped[region]){grouped[region]=[];regionOrder.push(region)}
    grouped[region].push({label,value,FCL20:fcl20,FCL40:fcl40,__order:Number.isFinite(orderValue)?orderValue:rowIndex+1});
  });
  const data={};
  regionOrder.forEach(region=>{data[region]=grouped[region].sort((a,b)=>a.__order-b.__order).map(({__order,...item})=>item)});
  const portCount=Object.values(data).reduce((sum,ports)=>sum+ports.length,0);
  if(!portCount)throw new Error("반영 가능한 운임 행이 없습니다. 열 제목과 입력값을 확인해 주세요.");
  return{data,portCount,regionCount:Object.keys(data).length,period:workbookPeriod(workbook,fallbackDate)};
};

const applyResult=(result,source)=>{
  if(result.period)applyPeriod(result.period,source);
  const applied=window.applyOceanFreightData?.(result.data,{source,portCount:result.portCount,regionCount:result.regionCount,loadedAt:(new Date).toISOString(),period:result.period||periodMeta.period||""});
  if(!applied)throw new Error("웹페이지 운임 데이터 적용에 실패했습니다.");
  setStatus(`${result.regionCount}개 권역 · ${result.portCount}개 포트가 적용되었습니다.${result.period?` · ${periodDetails(result.period)?.periodLabel||result.period}`:""}`,"success");
};

const loadPublishedFile=async()=>{
  try{
    await ensureXlsx();
    const response=await fetch(`data/ocean-freight.xlsx?v=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`운임 파일 응답 오류 (${response.status})`);
    const result=workbookToData(await response.arrayBuffer(),response.headers.get("last-modified"));
    applyResult(result,"published-xlsx");
  }catch(error){console.warn("[KBRIDGE] ocean freight xlsx fallback:",error);if(isAdminPreview())setStatus(`엑셀 자동 불러오기 실패: ${error.message} · 기존 내장 운임을 사용합니다.`,"error")}
};

const importPreviewFile=async file=>{
  if(!file)return;
  try{
    await ensureXlsx();
    const result=workbookToData(await file.arrayBuffer(),file.lastModified);
    applyResult(result,"admin-preview");
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({data:result.data,period:result.period||""}))}catch(error){console.warn("[KBRIDGE] preview storage skipped:",error)}
    setStatus(`${file.name}: ${result.regionCount}개 권역 · ${result.portCount}개 포트 미리보기 적용 완료${result.period?` · ${periodDetails(result.period)?.periodLabel||result.period}`:""}. 전체 공개 반영은 data/ocean-freight.xlsx를 교체하세요.`,"success");
  }catch(error){setStatus(`파일 적용 실패: ${error.message}`,"error")}
  finally{if(fileInput)fileInput.value=""}
};

const resetPreview=async()=>{localStorage.removeItem(STORAGE_KEY);setStatus("저장된 미리보기를 삭제하고 게시된 엑셀 파일을 다시 불러옵니다.");await loadPublishedFile()};
const init=()=>{
  loadPublishedPeriodMeta();
  if(isAdminPreview()&&adminPanel)adminPanel.hidden=!1;
  fileInput?.addEventListener("change",event=>importPreviewFile(event.target.files?.[0]));
  resetButton?.addEventListener("click",resetPreview);
  const restorePreview=()=>{
    if(!isAdminPreview())return!1;
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      const savedData=saved?.data||saved;
      if(savedData&&Object.keys(savedData).length){
        const count=Object.values(savedData).reduce((sum,ports)=>sum+ports.length,0);
        const result={data:savedData,portCount:count,regionCount:Object.keys(savedData).length,period:saved?.period||""};
        applyResult(result,"saved-preview");
        setStatus(`저장된 관리자 미리보기 ${count}개 포트를 적용했습니다.${result.period?` · ${periodDetails(result.period)?.periodLabel||result.period}`:""}`,"success");
        return!0;
      }
    }catch(error){localStorage.removeItem(STORAGE_KEY)}
    return!1;
  };
  if(restorePreview())return;
  const run=()=>loadPublishedFile();
  if(isAdminPreview()){run();return}
  let started=!1;
  const start=()=>{if(started)return;started=!0;run()};
  document.querySelectorAll('[data-quote-mode="ocean"],[data-quote-mode-open="ocean"],[data-open="seaDialog"]:not([data-quote-mode-open])').forEach(el=>el.addEventListener("click",start,{once:!0,passive:!0}));
  const idle=()=>{if(!navigator.connection?.saveData&&"visible"===document.visibilityState)start()};
  "requestIdleCallback"in window?requestIdleCallback(idle,{timeout:5000}):setTimeout(idle,3500);
};

window.KBridgeOceanFreight={reload:loadPublishedFile,importFile:importPreviewFile,dataUrl:"data/ocean-freight.xlsx",getPeriod:()=>periodMeta.period||window.KBridgeFreightPeriod?.getPeriod?.()||"2026-07",getPeriodLabel:()=>periodMeta.periodLabel||window.KBridgeFreightPeriod?.getLabel?.()||"2026년 7월",getPeriodCompact:()=>periodMeta.compact||window.KBridgeFreightPeriod?.getCompact?.()||"2026.07"};
"loading"===document.readyState?document.addEventListener("DOMContentLoaded",init,{once:!0}):init();
})();
