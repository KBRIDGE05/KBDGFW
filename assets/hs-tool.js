(()=>{
'use strict';
const $=s=>document.querySelector(s);const engine=window.KB_HS_SEARCH;let lastRows=[];
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function params(){return new URLSearchParams(location.search)}
function applyToDuty(item){const [code,name]=item.row;const h=item.hint||engine.rateHint(code);localStorage.setItem('kbSelectedHs',JSON.stringify({code,name,rate:h.rate,note:h.note,at:Date.now()}));const u=new URL('duty-calculator.html',location.href);u.searchParams.set('hs',code);u.searchParams.set('name',name);if(h.rate!==null)u.searchParams.set('rate',h.rate);location.href=u.href}
async function copyCode(btn,code){try{await navigator.clipboard.writeText(code);btn.textContent='복사 완료'}catch{const ta=document.createElement('textarea');ta.value=code;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();btn.textContent='복사 완료'}setTimeout(()=>btn.textContent='코드 복사',1200)}
function setBusy(busy){const btn=$('#hsSearch');if(!btn)return;btn.disabled=busy;btn.textContent=busy?'2026 전체 데이터 불러오는 중…':'후보 검색'}
function resultDescription(r,item){const third=String(r[2]||'').trim();const local=item.source==='local';if(!third)return '';return local?`관련 키워드: ${esc(third)}`:`영문 품목명: ${esc(third)}`}
async function render(){
 const query=$('#hsQuery').value.trim(),code=$('#hsCodeCheck').value.trim(),mode=$('#hsMode').value,box=$('#hsResults');
 if(!query&&!code){$('#hsCount').textContent='0건';$('#hsSummary').textContent='품명·재질·용도 또는 알고 있는 HS CODE를 입력해 주세요.';box.innerHTML='<div class="nt-empty">검색 결과는 연관도가 높은 상위 6건만 표시합니다. 2026년 전체 HSK 품목 데이터에서 검색합니다.</div>';return}
 setBusy(true);$('#hsCount').textContent='조회 중';$('#hsSummary').textContent='관세청 2026년 전체 HSK 품목 데이터를 불러오고 있습니다.';
 await engine.ready();
 const rows=engine.search(query,code,6);lastRows=rows;const st=engine.status();const total=Number(rows.total||rows.length);const direction=mode==='import'?'한국 수입':'한국 수출';
 $('#hsCount').textContent=total>rows.length?`상위 ${rows.length}건`:`${rows.length}건`;
 if(st.source==='official-2026')$('#hsSummary').textContent=`${direction} 기준 · 2026년 전체 HSK ${st.count.toLocaleString('ko-KR')}개 항목에서 ${total.toLocaleString('ko-KR')}개가 검색되어 상위 결과만 표시합니다.`;
 else $('#hsSummary').textContent=`${direction} 기준 · 관세청 2026 HSK 연결에 실패하여 ${st.localCount.toLocaleString('ko-KR')}개 실무 샘플 후보만 검색했습니다. 잠시 후 다시 시도하거나 유니패스 CLIP에서 확인하세요.`;
 box.innerHTML=rows.length?rows.map((item,i)=>{const r=item.row,h=item.hint;return `<article class="nt-list-item"><div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0;flex:1"><span class="nt-badge">HS ${esc(r[0])}</span><strong style="margin-top:7px">${esc(r[1])}</strong><p>${resultDescription(r,item)}</p><p style="margin-top:6px"><b>관세율:</b> ${h.rate===null?'10단위 HSK 확인 필요':`기본세율 참고 ${h.rate}%`} · ${esc(h.note)}</p></div><div class="nt-result-actions"><button class="nt-link-btn" type="button" data-copy="${esc(r[0])}">코드 복사</button><button class="nt-link-btn" type="button" data-duty="${i}">관부가세 계산기에 적용</button></div></div></article>`}).join(''):'<div class="nt-empty">검색 결과가 없습니다. 상품명만 입력하기보다 재질·기능·용도·가공상태를 나누어 검색해 주세요.</div>';
 box.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copyCode(b,b.dataset.copy));box.querySelectorAll('[data-duty]').forEach(b=>b.onclick=()=>applyToDuty(rows[Number(b.dataset.duty)]));setBusy(false)
}
$('#hsSearch').onclick=render;$('#hsQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();render()}});$('#hsCodeCheck').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();render()}});$('#hsMode').onchange=()=>{if($('#hsQuery').value.trim()||$('#hsCodeCheck').value.trim())render()};$('#hsReset').onclick=()=>{$('#hsQuery').value='';$('#hsCodeCheck').value='';$('#hsMode').value='import';render()};const p=params();if(p.get('q'))$('#hsQuery').value=p.get('q');if(p.get('code'))$('#hsCodeCheck').value=p.get('code');render();
})();
