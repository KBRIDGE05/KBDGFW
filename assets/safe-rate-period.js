(function(){
"use strict";
var PERIODS={
 proposal:{key:"proposal",label:"2026년 11월1일 ~ (진행)",path:"assets/safe-rate-data/proposed-20261101"},
 after:{key:"after",label:"2026년 8월1일 ~ 2026년 10월31일 (종료)",path:"assets/safe-rate-data/from-20260801"},
 before:{key:"before",label:"2026년 2월1일 ~ 2026년 7월31일 (종료)",path:"assets/safe-rate-data/before-20260801"}
};
var params=new URLSearchParams(window.location.search);
var requested=params.get("rate");
var defaultKey="proposal";
// The November dataset is the selected VIEW by default. This does not establish the legal status of the notice.
var key=Object.prototype.hasOwnProperty.call(PERIODS,requested)?requested:defaultKey;
var registry=window.KB_SAFE_DATASETS||{};
if(!registry[key])key=registry.after?"after":registry.before?"before":"proposal";
var selected=PERIODS[key],data=registry[key];
window.KB_SAFE_RATE_VERSION=key;
window.KB_SAFE_RATE_SELECTED=selected;
window.KB_SAFE_EMBED_DATA=data.data;
window.KB_SAFE_PORT_CHUNKS=data.chunks;
window.KB_SAFE_PORT_ROWS={};
window.KB_SAFE_DATA_PATH=selected.path;
document.documentElement.setAttribute("data-safe-rate-period",key);
function text(sel,val){var el=document.querySelector(sel);if(el)el.textContent=val;}
function periodUi(){
 var el=document.getElementById('periodSelect');if(el){el.replaceChildren();Object.keys(PERIODS).forEach(function(k){var opt=document.createElement('option');opt.value=PERIODS[k].label;opt.textContent=PERIODS[k].label;opt.dataset.rate=k;el.appendChild(opt);});el.value=selected.label;
 el.addEventListener('change',function(){var option=el.options[el.selectedIndex];var next=option&&option.dataset.rate;if(!next||next===key)return;var url=new URL(window.location.href);url.searchParams.set('rate',next);url.hash='safe-rate-tool';window.location.assign(url.toString());});}
 if(key==='proposal'){
 text('#safeHeroDescription','2026년 11월 1일 기준 운임표와 컨테이너 운송 할증 조건을 조회합니다.');
 text('#safeHeroPeriodBadge','2026년 11월1일 ~ (진행)');text('#safeAlertBadge','2026.11.01 기준 운임표');
 text('#safeAlertTitle','2026년 11월 1일 기준 안전운임을 조회하고 있습니다.');
 text('#safeAlertDescription','조회 데이터: 2026.10.20 국토교통부 공개 운임표 기준. 운송 계약·청구 전에는 해당 운송일의 최종 고시와 부대조항을 확인해 주세요.');
 text('#safePeriodNote','* 2026년 11월 1일 기준 운임표 / 자료 출처: 국토교통부 2026.10.20 행정예고');
 text('#safeGuideCurrent','2026년 11월 1일 기준 운임표 조회 결과입니다. 실제 운송일 적용 고시의 확정 여부를 확인하세요.');
 }else if(key==='before'){
 text('#safeHeroDescription','2026년 2월 1일부터 2026년 7월 31일까지 적용되었던 운임과 할증 조건을 조회합니다.');text('#safeHeroPeriodBadge','2026년 2월1일 ~ 2026년 7월31일 (종료)');
 text('#safeAlertBadge','종료');text('#safeAlertTitle','2026년 7월 31일까지 적용되었던 안전운임입니다.');text('#safeAlertDescription','2026.02.01 고시 및 2026.04.12 운영지침 기준입니다. 운송 예정일에 맞는 적용기간을 확인하세요.');
 text('#safePeriodNote','* 2026년 2월1일 ~ 2026년 7월31일 적용 기준');text('#safeGuideCurrent','현재 조회값은 2026년 2월1일 ~ 2026년 7월31일 적용 기준입니다.');
 }else{
 text('#safeHeroDescription','2026년 8월 1일부터 2026년 10월 31일까지 적용된 운임과 할증 조건을 조회합니다.');text('#safeHeroPeriodBadge','2026년 8월1일 ~ 2026년 10월31일 (종료)');
 text('#safeAlertBadge','종료');text('#safeAlertTitle','2026년 8월 1일부터 2026년 10월 31일까지 적용된 안전운임을 조회하고 있습니다.');
 text('#safeAlertDescription','국토교통부고시 제2026-402호를 반영한 종료 구간입니다. 이후 적용 기준은 11월 1일 진행 항목에서 확인할 수 있습니다.');
 text('#safePeriodNote','* 2026년 8월1일 ~ 2026년 10월31일 적용 기준');text('#safeGuideCurrent','현재 조회값은 2026년 8월1일 ~ 2026년 10월31일 적용 기준입니다.');
 }
 var t=document.getElementById('transfer-rates');if(t)t.hidden=key==='before';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',periodUi,{once:true});else periodUi();
})();
