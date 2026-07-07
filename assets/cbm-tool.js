(()=>{
  const $=s=>document.querySelector(s);
  const factors={mm:1e-9,cm:1e-6,m:1,inch:0.000016387064};
  const containers=[
    {key:'20FT',h:`8'6"`,tare:'2,200 kg',payload:'28,280 kg',gross:'30,480 kg',door:[2340,2280],inside:[5898,2352,2392],vol:33.2},
    {key:'40FT',h:`8'6"`,tare:'3,600 kg',payload:'28,900 kg',gross:'32,500 kg',door:[2340,2280],inside:[12032,2352,2392],vol:67.6},
    {key:'40HC',h:`9'6"`,tare:'3,800 kg',payload:'28,700 kg',gross:'32,500 kg',door:[2340,2585],inside:[12032,2352,2698],vol:76.3}
  ];

  function esc(s){
    return String(s??'').replace(/[&<>'"]/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[m]));
  }

  function field(label,cls,type='number',value='',extra=''){
    const numberAttrs=type==='number'?'min="0" step="0.01"':'';
    return `<label>${label}<input class="${cls}" type="${type}" ${numberAttrs} value="${esc(value)}" ${extra}></label>`;
  }

  function syncDeleteButtons(){
    const rows=[...$('#cbmRows').children];
    rows.forEach(row=>{
      const button=row.querySelector('.cbm-delete');
      if(button)button.hidden=rows.length===1;
    });
  }

  function row(d={}){
    const el=document.createElement('article');
    el.className='cbm-row';
    el.innerHTML=`
      <div class="cbm-row-grid">
        ${field('길이','cbm-l','number',d.l||'','inputmode="decimal" placeholder="0"')}
        ${field('너비','cbm-w','number',d.w||'','inputmode="decimal" placeholder="0"')}
        ${field('높이','cbm-h','number',d.h||'','inputmode="decimal" placeholder="0"')}
        <label>단위
          <select class="cbm-unit" aria-label="규격 단위">
            <option value="cm">cm</option>
            <option value="mm">mm</option>
            <option value="m">m</option>
            <option value="inch">inch</option>
          </select>
        </label>
        ${field('개당 중량(kg)','cbm-kg','number',d.kg??0,'inputmode="decimal"')}
        ${field('수량','cbm-q','number',d.q||1,'min="1" step="1" inputmode="numeric"')}
        <div class="cbm-output"><span>개당 CBM</span><strong class="cbm-each">0.000</strong></div>
        <div class="cbm-output"><span>합계 CBM</span><strong class="cbm-sum">0.000</strong></div>
        <button class="cbm-delete" type="button" aria-label="이 규격 삭제">삭제</button>
      </div>`;

    el.querySelector('.cbm-unit').value=d.unit||'cm';

    el.querySelector('.cbm-delete').addEventListener('click',()=>{
      el.remove();
      syncDeleteButtons();
      calc();
    });

    el.querySelectorAll('input,select').forEach(input=>{
      input.addEventListener('input',calc);
      input.addEventListener('change',calc);
    });

    $('#cbmRows').appendChild(el);
    syncDeleteButtons();
  }

  function add(){
    row({q:1,unit:'cm'});
    calc();
  }

  function toMm(n,u){
    return u==='mm'?n:u==='cm'?n*10:u==='m'?n*1000:n*25.4;
  }

  function permutations(a){
    return [
      [a[0],a[1],a[2]],[a[0],a[2],a[1]],
      [a[1],a[0],a[2]],[a[1],a[2],a[0]],
      [a[2],a[0],a[1]],[a[2],a[1],a[0]]
    ];
  }

  function fits(dims,c){
    if(dims.some(x=>!x))return null;
    return permutations(dims).some(([l,w,h])=>
      l<=c.inside[0]&&w<=c.door[0]&&h<=c.door[1]&&
      w<=c.inside[1]&&h<=c.inside[2]
    );
  }

  function number(row,selector){
    return Math.max(0,Number(row.querySelector(selector)?.value)||0);
  }

  function calc(){
    let cbm=0,pcs=0,kg=0;
    const dims=[];

    [...$('#cbmRows').children].forEach(r=>{
      const q=Math.max(0,Math.floor(number(r,'.cbm-q')));
      const unit=r.querySelector('.cbm-unit').value;
      const l=number(r,'.cbm-l');
      const w=number(r,'.cbm-w');
      const h=number(r,'.cbm-h');
      const each=l*w*h*(factors[unit]||1e-6);
      const sum=each*q;

      cbm+=sum;
      pcs+=q;
      kg+=number(r,'.cbm-kg')*q;

      r.querySelector('.cbm-each').textContent=each.toFixed(3);
      r.querySelector('.cbm-sum').textContent=sum.toFixed(3);

      if(l&&w&&h)dims.push([toMm(l,unit),toMm(w,unit),toMm(h,unit)]);
    });

    const factor=Number($('#cbmFactor').value)||6000;
    const volumeWeight=cbm*1e6/factor;
    const airCharge=Math.max(kg,volumeWeight);
    const wm=Math.max(cbm,kg/1000);

    $('#cbmTotal').textContent=cbm.toFixed(3)+' m³';
    $('#cbmPcs').textContent=pcs.toLocaleString();
    $('#cbmWeight').textContent=kg.toFixed(1)+' kg';
    $('#cbmAirCharge').textContent=airCharge.toFixed(1)+' kg';
    $('#cbmAirBreak').textContent=
      `실중량 ${kg.toFixed(1)} kg · 부피중량 ${volumeWeight.toFixed(1)} kg (÷ ${factor.toLocaleString()})`;
    $('#cbmWm').textContent=wm.toFixed(3)+' RT';
    $('#cbm20').textContent=(cbm/33.2*100).toFixed(1)+'%';
    $('#cbm40ft').textContent=(cbm/67.6*100).toFixed(1)+'%';
    $('#cbm40hc').textContent=(cbm/76.3*100).toFixed(1)+'%';

    renderContainers(dims);
  }

  function renderContainers(dims){
    let okCount=0;
    $('#cbmContainerRows').innerHTML=containers.map(c=>{
      const states=dims.map(d=>fits(d,c));
      const all=states.length&&states.every(Boolean);
      const unknown=!states.length;
      if(all)okCount++;

      const status=unknown
        ?'<span class="nt-muted">입력 대기</span>'
        :all
          ?'<span class="nt-fit-ok">통과 가능</span>'
          :'<span class="nt-fit-check">규격 확인</span>';

      return `<tr>
        <td><strong>${c.key}</strong></td>
        <td>${c.h}</td>
        <td>${c.tare}</td>
        <td>${c.payload}</td>
        <td>${c.gross}</td>
        <td>${c.door.join(' × ')}</td>
        <td>${c.inside.join(' × ')}</td>
        <td>${c.vol} m³</td>
        <td>${status}</td>
      </tr>`;
    }).join('');

    $('#cbmFitSummary').textContent=dims.length
      ?`${okCount}개 규격 통과 가능`
      :'입력 대기';
  }

  function reset(){
    $('#cbmRows').innerHTML='';
    row({q:1,unit:'cm'});
    $('#cbmFactor').value='6000';
    calc();
  }

  $('#cbmAdd').addEventListener('click',add);
  $('#cbmCalc').addEventListener('click',calc);
  $('#cbmReset').addEventListener('click',reset);
  $('#cbmFactor').addEventListener('change',calc);
  reset();
})();
