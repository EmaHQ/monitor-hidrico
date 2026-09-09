// Datos del historial. Se llenan en init() con lo que devuelve history.json:
// hasta que el fetch termine, los renders no se ejecutan.
let DATES=[];      // fechas ISO, una por columna de las series
let DATE_LBL=[];   // etiquetas cortas para los gráficos ('3 ago'), derivadas de DATES
let RIVERS=[];     // ríos con sus estaciones y sus series r[]

const ARCHIVO_HISTORIAL='./history.json';
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const CS = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function fmt(v){ return v===null||v===undefined ? 'S/D' : v.toFixed(2); }
function fmtISO(iso){
  const [y,m,d] = iso.split('-');
  const M=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  return `${parseInt(d)} ${M[+m-1]} ${y}`;
}
function lastTwo(r){
  const v = r.map((x,i)=>({x,i})).filter(o=>o.x!==null);
  if(!v.length) return [null,null];
  const last=v[v.length-1].x;
  const prev=v.length>=2 ? v[v.length-2].x : null;
  return [prev,last];
}
function tc(r){
  const [p,l]=lastTwo(r);
  if(l===null||p===null) return 'nd';
  const d=l-p;
  return Math.abs(d)<0.01 ? 'E' : d>0 ? 'C' : 'B';
}
function var24(r){
  const [p,l]=lastTwo(r);
  return (l===null||p===null) ? null : l-p;
}
function maxR(r){
  const v=r.map((x,i)=>({x,i})).filter(o=>o.x!==null);
  if(!v.length) return null;
  return v.reduce((b,o)=>o.x>b.x?o:b);
}
function spark(r, color){
  const vals = r.map(v=>v===null?NaN:v);
  const def  = vals.filter(v=>!isNaN(v));
  if(def.length<2) return `<svg width="70" height="22" aria-hidden="true"><line x1="5" y1="11" x2="65" y2="11" stroke="currentColor" stroke-width="1" opacity=".2"/></svg>`;
  const mn=Math.min(...def), mx=Math.max(...def), rng=mx-mn||0.5;
  const W=70,H=20,P=2,n=vals.length;
  const pts=vals.map((v,i)=>({
    x: P+i/(n-1)*(W-P*2),
    y: isNaN(v)?null:P+(1-(v-mn)/rng)*(H-P*2)
  }));
  let path='',area='',on=false;
  for(let i=0;i<pts.length;i++){
    const{x,y}=pts[i];
    if(y===null){on=false;continue;}
    if(!on){path+=`M${x.toFixed(1)},${y.toFixed(1)}`;area+=`M${x.toFixed(1)},${H} L${x.toFixed(1)},${y.toFixed(1)}`;on=true;}
    else{path+=` L${x.toFixed(1)},${y.toFixed(1)}`;area+=` L${x.toFixed(1)},${y.toFixed(1)}`;}
  }
  const lv=[...pts].reverse().find(p=>p.y!==null);
  if(lv) area+=` L${lv.x.toFixed(1)},${H} Z`;
  const dot=lv?`<circle cx="${lv.x.toFixed(1)}" cy="${lv.y.toFixed(1)}" r="2.5" fill="${color}"/>`:'';
  return `<svg width="70" height="22" viewBox="0 0 70 22" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity=".13"/>
    <path d="${path}" stroke="${color}" stroke-width="1.8" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    ${dot}</svg>`;
}
function renderAlerts(){
  const el=document.getElementById('js-alerts');
  const evacs=[],alerts=[],bigVars=[];
  for(const rv of RIVERS) for(const s of rv.stations){
    const cur=lastTwo(s.r)[1];
    const v=var24(s.r);
    if(s.ev!==null&&cur!==null&&cur>=s.ev) evacs.push({n:s.n,cur,ev:s.ev});
    else if(s.al!==null&&cur!==null&&cur>=s.al) alerts.push({n:s.n,cur,al:s.al});
    else if(v!==null&&Math.abs(v)>=1) bigVars.push({n:s.n,v});
  }
  if(!evacs.length&&!alerts.length&&!bigVars.length){el.hidden=true;return;}
  el.hidden=false;
  let html='';
  if(evacs.length) html+='<span class="alert-lbl" style="color:#8B0000">🚨 EVACUACIÓN</span>'+
    evacs.map(h=>`<span class="alert-pill" style="border-color:#8B0000;color:#8B0000">${h.n} ${h.cur.toFixed(2)} m (evac: ${h.ev} m)</span>`).join('');
  if(alerts.length) html+=(html?'&nbsp;&nbsp;':'')+'<span class="alert-lbl">⚠ ALERTA</span>'+
    alerts.map(h=>`<span class="alert-pill">${h.n} ${h.cur.toFixed(2)} m (alerta: ${h.al} m)</span>`).join('');
  if(bigVars.length) html+=(html?'&nbsp;&nbsp;':'')+'<span class="alert-lbl">↕ Var &gt;1 m/24h</span>'+
    bigVars.map(h=>`<span class="alert-pill">${h.n} ${h.v>0?'+':''}${h.v.toFixed(2)} m</span>`).join('');
  el.innerHTML=html;
}
function renderStats(){
  let T=0,U=0,D=0,E=0,N=0;
  for(const rv of RIVERS) for(const s of rv.stations){
    T++;const t=tc(s.r);
    if(t==='C')U++;else if(t==='B')D++;else if(t==='E')E++;else N++;
  }
  document.getElementById('js-stats').innerHTML=`
    <div class="stat"><span class="stat-n">${T}</span><span class="stat-l">Total</span></div>
    <div class="stat s-up"><span class="stat-n">${U}</span><span class="stat-l">↑ Creciendo</span></div>
    <div class="stat s-dn"><span class="stat-n">${D}</span><span class="stat-l">↓ Bajando</span></div>
    <div class="stat s-eq"><span class="stat-n">${E}</span><span class="stat-l">= Estable</span></div>
    <div class="stat s-nd"><span class="stat-n">${N}</span><span class="stat-l">Sin datos</span></div>`;
}
function renderRivers(){
  const wrap=document.getElementById('js-rivers');
  const N=5;
  const tblIdx=DATES.map((_,i)=>i).slice(-N);
  const dlbls=tblIdx.map(i=>{const[,m,day]=DATES[i].split('-');return`${+day}/${+m}`;});
  for(const rv of RIVERS){
    const col=CS(rv.cv);
    const corebeTag=rv.corebe?`<span class="corebe-tag">COREBE</span>`:'';
    let rows='';
    for(const s of rv.stations){
      const t=tc(s.r), v=var24(s.r);
      const cur=lastTwo(s.r)[1];
      const aboveEvac=s.ev!==null&&cur!==null&&cur>=s.ev;
      const aboveAlert=s.al!==null&&cur!==null&&cur>=s.al;
      const nearAlert=!aboveAlert&&s.al!==null&&cur!==null&&cur>=s.al*0.9;
      const bigVar=v!==null&&Math.abs(v)>=1;
      const isAl=aboveAlert||aboveEvac;
      const vStr=v===null?'—':(v>=0?'+':'')+v.toFixed(2)+' m';
      const vCls=isAl?'va':v===null?'nd':v>0?'vu':v<0?'vd':'ve';
      const tlbl={C:'CRECE',B:'BAJA',E:'ESTABLE',nd:'S/D'}[t];
      const tblVals=tblIdx.map(i=>s.r[i]);
      const rowCls=aboveEvac||aboveAlert?'alerted':nearAlert||bigVar?'warned':'';
      const alTd=s.al!==null
        ? `<td class="td-num ${aboveEvac||aboveAlert?'va':''}">${s.al.toFixed(2)}</td>`
        : `<td class="td-num nd">—</td>`;
      const evTd=s.ev!==null
        ? `<td class="td-num ${aboveEvac?'va':''}">${s.ev.toFixed(2)}</td>`
        : `<td class="td-num nd">—</td>`;
      rows+=`<tr class="${rowCls}">
        <td class="td-nm">${s.n}</td>
        <td class="td-sp">${spark(s.r,col)}</td>
        ${tblVals.map(val=>`<td class="td-num ${val===null?'nd':''}">${fmt(val)}</td>`).join('')}
        <td class="td-var ${vCls}">${vStr}</td>
        <td class="td-badge"><span class="badge b${t}">${tlbl}</span></td>
        ${alTd}${evTd}
      </tr>`;
    }
    const el=document.createElement('div');
    el.className='panel';
    el.innerHTML=`<div class="rv-hdr">
        <span class="rv-dot" style="background:${col}"></span>
        <span class="rv-name">${rv.name}${corebeTag}</span>
        <span class="rv-count">${rv.stations.length} estaciones</span>
      </div>
      <div class="tbl-wrap"><table class="st">
        <thead><tr>
          <th>Hidrómetro</th><th class="c">Evolución</th>
          ${dlbls.map(l=>`<th class="r">${l}</th>`).join('')}
          <th class="r">Var 24h</th><th class="c">Estado</th><th class="r">Alerta</th><th class="r">Evacuac.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    wrap.appendChild(el);
  }
}
const CAT_L=['#0B5CAB','#0D9B8A','#1A6B7A','#1478A8','#3D8B6E','#5B7C99','#0E7C8B','#2A6F97'];
const CAT_D=['#4BA3E6','#2EC4B0','#5EB4C4','#3DB5E0','#6BC4A0','#8AAFC4','#4DB8C6','#6AA8C9'];
const active=new Set(['ANDRESITO','IGUAZÚ','CORRIENTES','FORMOSA']);
let chart=null;
function allSt(){
  const out=[];
  for(const rv of RIVERS) for(const s of rv.stations)
    if(s.r.some(v=>v!==null)) out.push({n:s.n,r:s.r});
  return out;
}
function chartTheme(){
  const dark=window.matchMedia('(prefers-color-scheme:dark)').matches||document.documentElement.getAttribute('data-theme')==='dark';
  return {
    dark,
    COLS: dark?CAT_D:CAT_L,
    gc: dark?'#1A3342':'#D3E4ED',
    bc: dark?'#2A4A5C':'#9BB8C6',
    tc2: dark?'#7A97A6':'#6B8A9A',
    txtc: dark?'#B7CDD8':'#3A5A6E',
    tooltipBg: dark?'#0C1E2A':'#F7FBFD',
    tooltipBd: dark?'rgba(244,250,252,.1)':'rgba(6,32,51,.1)',
  };
}
function buildChart(){
  const ctx=document.getElementById('js-chart').getContext('2d');
  const {COLS,gc,bc,tc2,txtc,tooltipBg,tooltipBd}=chartTheme();
  const sets=allSt().filter(s=>active.has(s.n)).map((s,i)=>({
    label:s.n,data:s.r.map(v=>v===null?null:v),
    borderColor:COLS[i%COLS.length],backgroundColor:COLS[i%COLS.length]+'18',
    borderWidth:2,pointRadius:4,pointHoverRadius:6,tension:.2,spanGaps:false,fill:false,
  }));
  if(chart) chart.destroy();
  chart=new Chart(ctx,{
    type:'line',data:{labels:DATE_LBL,datasets:sets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'top',labels:{color:txtc,boxWidth:12,padding:12,usePointStyle:true,pointStyle:'circle',font:{family:"'Montserrat',sans-serif",size:12,weight:'600'}}},
        tooltip:{backgroundColor:tooltipBg,borderColor:tooltipBd,borderWidth:1,titleColor:txtc,bodyColor:txtc,
          callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y!==null?c.parsed.y.toFixed(2)+' m':'S/D'}`}}
      },
      scales:{
        x:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11}}},
        y:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11},callback:v=>v.toFixed(1)+' m'}},
      }
    }
  });
}
function renderToggles(){
  const el=document.getElementById('js-toggles');
  el.innerHTML=allSt().map(s=>`<button class="tog ${active.has(s.n)?'on':''}" data-n="${s.n}">${s.n}</button>`).join('');
  el.addEventListener('click',e=>{
    const b=e.target.closest('.tog');if(!b)return;
    const n=b.dataset.n;
    active.has(n)?(active.delete(n),b.classList.remove('on')):(active.add(n),b.classList.add('on'));
    buildChart();
  });
}
function renderRecords(){
  let h='';
  for(const rv of RIVERS) for(const s of rv.stations){
    const mx=maxR(s.r);if(!mx)continue;
    const[,m,d]=DATES[mx.i].split('-');
    h+=`<div class="rec-cell"><div class="rec-stn">${s.n}</div><div class="rec-rv">${rv.name}</div><div class="rec-val">${mx.x.toFixed(2)} m</div><div class="rec-when">máx el ${+d} ${MESES[+m-1]}</div></div>`;
  }
  document.getElementById('js-records').innerHTML=h;
}
const histCharts = {};
function buildHistChart(rv, canvasId, visibleSet) {
  const ctx = document.getElementById(canvasId);if (!ctx) return;
  const {COLS,gc,bc,tc2,txtc,tooltipBg,tooltipBd}=chartTheme();
  const sets = rv.stations.filter(s=>s.r.some(v=>v!==null)).map((s,i)=>({
    label:s.n,data:s.r.map(v=>v===null?null:v),
    borderColor:COLS[i%COLS.length],backgroundColor:COLS[i%COLS.length]+'14',
    borderWidth:1.8,pointRadius:3,pointHoverRadius:5,tension:.2,spanGaps:false,fill:false,hidden:!visibleSet.has(s.n),
  }));
  if(histCharts[rv.id]) histCharts[rv.id].destroy();
  histCharts[rv.id]=new Chart(ctx,{
    type:'line',data:{labels:DATE_LBL,datasets:sets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:tooltipBg,borderColor:tooltipBd,
          borderWidth:1,titleColor:txtc,bodyColor:txtc,callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y!==null?c.parsed.y.toFixed(2)+' m':'S/D'}`}}
      },
      scales:{
        x:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:10},maxTicksLimit:12}},
        y:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:10},callback:v=>v.toFixed(1)+' m'}},
      }
    }
  });
}
function renderHistorical() {
  const wrap = document.getElementById('js-hist-panels');
  let html = '';
  for (const rv of RIVERS) {
    const stations = rv.stations.filter(s=>s.r.some(v=>v!==null));
    if(!stations.length) continue;
    const col = CS(rv.cv);
    html+=`<div style="border-top:1px solid var(--border);">
      <div style="padding:9px 16px 0;display:flex;align-items:center;gap:8px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;display:inline-block;"></span>
        <span style="font-family:var(--ff-cond);font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;">${rv.name}</span>
      </div>
      <div class="hist-tabs" id="hist-tabs-${rv.id}">
        ${stations.map(s=>`<button class="hist-tab on" data-rv="${rv.id}" data-stn="${s.n}">${s.n}</button>`).join('')}
      </div>
      <div class="hist-chart-area"><canvas id="hist-canvas-${rv.id}"></canvas></div>
    </div>`;
  }
  wrap.innerHTML = html;
  for(const rv of RIVERS){
    const stations=rv.stations.filter(s=>s.r.some(v=>v!==null));
    if(!stations.length) continue;
    const visible=new Set(stations.map(s=>s.n));
    buildHistChart(rv,`hist-canvas-${rv.id}`,visible);
  }
  wrap.addEventListener('click',e=>{
    const btn=e.target.closest('.hist-tab');if(!btn) return;
    const rvId=btn.dataset.rv;const stn=btn.dataset.stn;
    btn.classList.toggle('on');
    const ch=histCharts[rvId];if(!ch) return;
    const ds=ch.data.datasets.find(d=>d.label===stn);
    if(ds){ds.hidden=!ds.hidden;ch.update();}
  });
}
function renderDate(){document.getElementById('js-date').textContent=fmtISO(DATES[DATES.length-1]);}

// --- Carga de datos e inicialización ---------------------------------------

// '2026-09-08' -> '8 sep'. Reemplaza a la vieja constante DATE_LBL, que antes
// venía escrita a mano en data.js.
function etiquetaCorta(iso){
  const[,m,d]=iso.split('-');
  return `${+d} ${MESES[+m-1]}`;
}

async function cargarHistorial(){
  // no-store: el scraper reescribe el archivo todos los días y no queremos
  // que el navegador sirva una versión cacheada.
  const resp=await fetch(ARCHIVO_HISTORIAL,{cache:'no-store'});
  if(!resp.ok) throw new Error(`HTTP ${resp.status} al pedir ${ARCHIVO_HISTORIAL}`);
  const datos=await resp.json();
  if(!Array.isArray(datos.DATES)||!Array.isArray(datos.RIVERS))
    throw new Error('history.json no tiene la forma {"DATES":[...],"RIVERS":[...]}');
  return datos;
}

function mostrarErrorDeCarga(error){
  const el=document.getElementById('js-alerts');
  el.hidden=false;
  el.innerHTML=`<span class="alert-lbl">⚠ Sin datos</span>
    <span class="alert-pill">No se pudo cargar history.json: ${error.message}</span>
    <span class="alert-pill">Servilo por HTTP (por ejemplo: python -m http.server)</span>`;
  console.error('[monitor-hidrico] fallo la carga del historial:', error);
}

async function init(){
  let datos;
  try{
    datos=await cargarHistorial();
  }catch(error){
    // fetch() falla con file:// por CORS: el dashboard necesita un servidor.
    mostrarErrorDeCarga(error);
    return;
  }

  DATES=datos.DATES;
  RIVERS=datos.RIVERS;
  DATE_LBL=DATES.map(etiquetaCorta);

  renderDate();renderAlerts();renderStats();renderRivers();renderHistorical();renderToggles();buildChart();renderRecords();
}

init();
