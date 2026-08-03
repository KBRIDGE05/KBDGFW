(function(){
  "use strict";
  var PERIODS={
    before:{key:"before",label:"2026년 2월 1일 ~ 2026년 7월 31일",path:"assets/safe-rate-data/before-20260801"},
    after:{key:"after",label:"2026년 8월 1일부터 (최종 고시)",path:"assets/safe-rate-data/from-20260801"}
  };
  var params=new URLSearchParams(window.location.search);
  var requested=params.get("rate");
  var today=new Date();
  var defaultKey=today<new Date(2026,7,1)?"before":"after";
  var key=requested==="before"||requested==="after"?requested:defaultKey;
  var selected=PERIODS[key];
  var registry=window.KB_SAFE_DATASETS||{};
  if(!registry[key]){
    console.error("선택한 안전운임 데이터가 없습니다:",key);
    key=registry.before?"before":"after";
    selected=PERIODS[key];
  }
  window.KB_SAFE_RATE_VERSION=key;
  window.KB_SAFE_RATE_SELECTED=selected;
  window.KB_SAFE_EMBED_DATA=registry[key].data;
  window.KB_SAFE_PORT_CHUNKS=registry[key].chunks;
  window.KB_SAFE_PORT_ROWS={};
  window.KB_SAFE_DATA_PATH=selected.path;
  document.documentElement.setAttribute("data-safe-rate-period",key);

  function text(selector,value){var el=document.querySelector(selector);if(el)el.textContent=value;}
  function applyPeriodUi(){
    var select=document.getElementById("periodSelect");
    if(select){
      select.innerHTML="";
      Object.keys(PERIODS).forEach(function(periodKey){
        var option=document.createElement("option");
        option.value=PERIODS[periodKey].label;
        option.textContent=PERIODS[periodKey].label;
        option.dataset.rate=periodKey;
        option.selected=periodKey===key;
        select.appendChild(option);
      });
      select.value=selected.label;
      select.addEventListener("change",function(){
        var option=select.options[select.selectedIndex];
        var nextKey=option&&option.dataset.rate;
        if(!nextKey||nextKey===key)return;
        var url=new URL(window.location.href);
        url.searchParams.set("rate",nextKey);
        url.hash="safe-rate-tool";
        window.location.assign(url.toString());
      });
    }

    if(key==="before"){
      text("#safeHeroDescription","2026년 7월 31일까지 적용되는 기존 운임과 20FT·40FT 기점별 운임, 할증 조건을 조회합니다.");
      text("#safeHeroPeriodBadge","2026.07.31까지 운임표");
      text("#safeAlertBadge","기존 운임");
      text("#safeAlertTitle","2026년 7월 31일까지 적용되는 안전운임을 선택했습니다.");
      text("#safeAlertDescription","2026년 적용 화물자동차 안전운임과 2026년 4월 12일 운영지침 기준입니다. 2026년 8월 1일 이후 운송 건은 기간 선택에서 개정 운임을 선택해 확인하세요.");
      text("#safePeriodNote","* 2026.02.01~2026.07.31 기존 운임 · 2026.04.12 운영지침 기준");
      text("#safeGuideCurrent","현재 조회값은 2026년 7월 31일까지 적용되는 기존 안전운임 기준입니다.");
      var transfer=document.getElementById("transfer-rates");
      if(transfer)transfer.hidden=true;
    }else{
      text("#safeHeroDescription","2026년 8월 1일부터 시행되는 최종 고시 기준으로 20FT·40FT 기점별 운임과 할증 조건을 조회합니다.");
      text("#safeHeroPeriodBadge","2026.08.01 시행 운임표");
      text("#safeAlertBadge","최종 고시");
      text("#safeAlertTitle","2026년 8월 1일부터 시행되는 안전운임을 선택했습니다.");
      text("#safeAlertDescription","국토교통부고시 제2026-402호와 첨부 기점별 운임표를 반영했습니다. 2026년 8월 1일부터 시행되며, 첨부 운임표에서 전 항목이 #N/A인 광양항-강원 고성군 현내면 구간은 조회에서 제외했습니다.");
      text("#safePeriodNote","* 국토교통부고시 제2026-402호 · 2026.08.01 시행");
      text("#safeGuideCurrent","현재 조회값은 국토교통부고시 제2026-402호 최종 고시 기준입니다.");
      var transferAfter=document.getElementById("transfer-rates");
      if(transferAfter)transferAfter.hidden=false;
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",applyPeriodUi,{once:true});
  else applyPeriodUi();
})();
