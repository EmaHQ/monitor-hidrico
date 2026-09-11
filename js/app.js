// Datos del historial. Se llenan en init() con lo que devuelve history.json:
// hasta que el fetch termine, los renders no se ejecutan.
let DATES=[];      // fechas ISO, una por columna de las series
let DATE_LBL=[];   // etiquetas cortas para los gráficos ('3 ago'), derivadas de DATES
let RIVERS=[];     // ríos con sus puertos (clave "stations") y sus series r[]
let LAST_UPDATE=null;  // sello del scraper, 'YYYY-MM-DD HH:MM:SS' en hora AR

const ARCHIVO_HISTORIAL='./history.json';
// Ventana del panel de máximos: se evalúan los últimos 90 registros diarios,
// o el historial completo si todavía es más corto.
const VENTANA_MAXIMOS=90;
// Umbrales de fluctuación en 24 hs, en metros. Son asimétricos a propósito:
// una crecida de 1 m ya es noticia, una bajante recién a partir de 1,50 m.
const UMBRAL_CRECIDA=1.00;
const UMBRAL_BAJANTE=-1.50;
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_MAY=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

const CS = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Unidad de cada puerto. Casi todos miden altura en metros, pero las represas
// de Brasil (Capanema, Itaipú) informan caudal en m³/s: en history.json vienen
// con "u": "m³/s" y no pueden compartir el eje Y con las alturas, porque sus
// valores son un orden de magnitud más grandes y achatan el resto.
const UNIDAD_ALTURA='m';
const unidadDe = s => s.u||UNIDAD_ALTURA;
const esAltura = s => unidadDe(s)===UNIDAD_ALTURA;
// Números al estándar argentino: dos decimales fijos y coma. 14 -> '14,00'.
function formatoAR(num){
  return Number(num).toFixed(2).replace('.', ',');
}
function fmt(v){
  return v===null||v===undefined||typeof v!=='number'||!isFinite(v) ? 'S/D' : formatoAR(v);
}
// Variación con signo: '+1,32' / '-1,51'. El menos ya lo pone toFixed.
function fmtVar(v){
  if(v===null||v===undefined||!isFinite(v)) return '—';
  return (v>0?'+':'')+formatoAR(v);
}
function fmtISO(iso){
  const [y,m,d] = iso.split('-');
  return `${parseInt(d)} ${MESES_MAY[+m-1]} ${y}`;
}
// Sello del scraper -> '10 SEP 2026 • 14:05 hs'. Se parsea con regex y no con
// new Date(): el formato 'YYYY-MM-DD HH:MM:SS' (con espacio) no es estándar y
// algunos navegadores lo rechazan. Devuelve null si el sello no tiene la forma
// esperada, para poder caer al fallback.
function fmtSello(sello){
  const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(sello||''));
  if(!m) return null;
  const [,anio,mes,dia,hh,mm]=m;
  return `${+dia} ${MESES_MAY[+mes-1]} ${anio} • ${hh}:${mm} hs`;
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
// Máximo de una serie dentro de una ventana de los últimos `dias` registros.
// Devuelve {x, i} con el índice absoluto, para poder buscar la fecha en DATES,
// o null si en esa ventana no hay ninguna lectura. Si la serie es más corta
// que la ventana, se recorre entera.
function maxR(r, dias){
  const desde=dias>0 ? Math.max(0, r.length-dias) : 0;
  let mejor=null;
  for(let i=desde;i<r.length;i++){
    const x=r[i];
    if(typeof x!=='number'||!isFinite(x)) continue;  // saltea null, undefined y huecos
    if(!mejor||x>mejor.x) mejor={x,i};
  }
  return mejor;
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

// --- Estados de cada puerto -------------------------------------------------

// Estado oficial: se compara la última lectura válida contra los umbrales que
// publica el organismo. Un puerto sin umbrales (los de Paraguay y las represas)
// nunca puede estar en alerta, así que cuenta como estable mientras tenga dato.
function estadoOficial(s){
  const cur=lastTwo(s.r)[1];
  if(cur===null) return 'nd';
  if(s.ev!==null&&s.ev!==undefined&&cur>=s.ev) return 'evacuacion';
  if(s.al!==null&&s.al!==undefined&&cur>=s.al) return 'alerta';
  return 'estable';
}

// Fluctuación entre las dos últimas lecturas. Los umbrales son asimétricos
// porque una crecida rápida es más urgente que una bajante. Sólo aplica a los
// puertos que miden altura: un salto de 1 m³/s de caudal no significa nada.
function fluctuacion(s){
  if(!esAltura(s)) return null;
  const v=var24(s.r);
  if(v===null) return null;
  if(v>UMBRAL_CRECIDA) return 'crecida';
  if(v<UMBRAL_BAJANTE) return 'bajante';
  return null;
}
// Clase de fondo de la fila: primero el estado oficial; si el puerto está
// estable, recién ahí entra la fluctuación brusca. Sin coincidencia, sin clase.
function claseFila(s){
  const oficial=estadoOficial(s);
  if(oficial==='evacuacion') return 'c-evacuacion';
  if(oficial==='alerta') return 'c-alerta';
  if(oficial==='estable'){
    const f=fluctuacion(s);
    if(f==='crecida') return 'c-crecida';
    if(f==='bajante') return 'c-bajante';
  }
  return '';
}

// Recorre los puertos de todos los ríos, en el orden de history.json.
function cadaPuerto(fn){
  for(const rv of RIVERS) for(const s of rv.stations) fn(s,rv);
}
function puertosPorEstado(estado){
  const out=[];
  cadaPuerto(s=>{ if(estadoOficial(s)===estado) out.push(s.n); });
  return out;
}
function puertosPorFluctuacion(tipo){
  const out=[];
  cadaPuerto(s=>{
    const f=fluctuacion(s);
    if(f&&(tipo==='todas'||f===tipo)) out.push(s.n);
  });
  return out;
}

// --- Paneles de alertas -----------------------------------------------------

// Etiqueta clickeable de un puerto: al soltarla, el gráfico queda filtrado en
// ese puerto. `valor` es lo que se muestra en grande y `extra` la referencia
// (el umbral superado, o el nivel al que llegó tras la fluctuación).
function etiquetaPuerto({s,rv,valor,clase,extra}){
  return `<button type="button" class="pill c-${clase}" data-puerto="${s.n}"`+
    ` title="${rv.name} — ver sólo este puerto en el gráfico">`+
    `<span class="pill-n">${s.n}</span>`+
    `<span class="pill-val">${valor}</span>`+
    (extra?`<span class="pill-meta">${extra}</span>`:'')+
    `</button>`;
}

// Panel 1: sólo existe en pantalla si hay al menos un puerto sobre umbral.
function renderAlertasOficiales(){
  const panel=document.getElementById('js-oficial');
  const cuerpo=document.getElementById('js-oficial-body');
  const grupos={evacuacion:[],alerta:[]};
  cadaPuerto((s,rv)=>{
    const estado=estadoOficial(s);
    if(estado==='evacuacion'||estado==='alerta') grupos[estado].push({s,rv});
  });

  const total=grupos.evacuacion.length+grupos.alerta.length;
  panel.hidden=!total;
  if(!total){cuerpo.innerHTML='';return;}

  let html='';
  for(const [estado,titulo] of [['evacuacion','Evacuación'],['alerta','Alerta']]){
    const items=grupos[estado];
    if(!items.length) continue;
    const clase=estado==='evacuacion'?'evacuacion':'alerta';
    html+=`<div class="ap-group">
      <span class="ap-sub c-${clase}">${titulo} (${items.length})</span>
      <div class="ap-pills">${items.map(({s,rv})=>etiquetaPuerto({
        s,rv,clase,
        valor:`${formatoAR(lastTwo(s.r)[1])} ${unidadDe(s)}`,
        extra:estado==='evacuacion'?`evacuación ${formatoAR(s.ev)}`:`alerta ${formatoAR(s.al)}`,
      })).join('')}</div>
    </div>`;
  }
  cuerpo.innerHTML=html;
}

// Panel 2: crecidas y bajantes separadas, cada grupo con su subtítulo filtrable.
function renderFluctuacion(){
  const panel=document.getElementById('js-fluct');
  const cuerpo=document.getElementById('js-fluct-body');
  const grupos={crecida:[],bajante:[]};
  cadaPuerto((s,rv)=>{
    const tipo=fluctuacion(s);
    if(tipo) grupos[tipo].push({s,rv,v:var24(s.r)});
  });

  const total=grupos.crecida.length+grupos.bajante.length;
  panel.hidden=!total;
  if(!total){cuerpo.innerHTML='';return;}

  let html='';
  for(const [tipo,titulo] of [['crecida','Crecidas'],['bajante','Bajantes']]){
    const items=grupos[tipo];
    if(!items.length) continue;
    html+=`<div class="ap-group">
      <button type="button" class="ap-sub c-${tipo}" data-grupo="${tipo}"
              title="Ver en el gráfico todos los puertos de este grupo">${titulo} (${items.length})</button>
      <div class="ap-pills">${items.map(({s,rv,v})=>etiquetaPuerto({
        s,rv,clase:tipo,
        valor:`${fmtVar(v)} ${unidadDe(s)}`,
        extra:`ahora ${formatoAR(lastTwo(s.r)[1])} m`,
      })).join('')}</div>
    </div>`;
  }
  cuerpo.innerHTML=html;
}

// Panel 3: resumen por estado oficial. Las tarjetas con al menos un puerto son
// botones que filtran el gráfico; "Sin datos" nunca lo es, porque graficar
// series vacías no muestra nada.
function renderStats(){
  const conteo={total:0,evacuacion:0,alerta:0,estable:0,nd:0};
  cadaPuerto(s=>{ conteo.total++; conteo[estadoOficial(s)]++; });

  const tarjetas=[
    {estado:'total',      lbl:'Total',         n:conteo.total,      clase:''},
    {estado:'evacuacion', lbl:'En evacuación', n:conteo.evacuacion, clase:'c-evacuacion'},
    {estado:'alerta',     lbl:'En alerta',     n:conteo.alerta,     clase:'c-alerta'},
    {estado:'estable',    lbl:'Estables',      n:conteo.estable,    clase:'c-estable'},
    {estado:'nd',         lbl:'Sin datos',     n:conteo.nd,         clase:'s-nd'},
  ];
  document.getElementById('js-stats').innerHTML=tarjetas.map(t=>{
    const cuerpo=`<span class="stat-n">${t.n}</span><span class="stat-l">${t.lbl}</span>`;
    if(t.estado==='nd'||!t.n) return `<div class="stat ${t.clase}">${cuerpo}</div>`;
    return `<button type="button" class="stat ${t.clase}" data-estado="${t.estado}"`+
      ` title="Ver estos puertos en el gráfico">${cuerpo}</button>`;
  }).join('');
}
function renderRivers(){
  const wrap=document.getElementById('js-rivers');
  const N=5;
  const tblIdx=DATES.map((_,i)=>i).slice(-N);
  const dlbls=tblIdx.map(i=>{const[,m,day]=DATES[i].split('-');return`${+day}/${+m}`;});
  for(const rv of RIVERS){
    const col=CS(rv.cv);
    let rows='';
    for(const s of rv.stations){
      const t=tc(s.r), v=var24(s.r);
      const oficial=estadoOficial(s);
      const u=unidadDe(s);
      const vStr=v===null?'—':fmtVar(v)+' '+u;
      const vCls=(oficial==='evacuacion'||oficial==='alerta')?'va':v===null?'nd':v>0?'vu':v<0?'vd':'ve';
      const tlbl={C:'CRECE',B:'BAJA',E:'ESTABLE',nd:'S/D'}[t];
      const tblVals=tblIdx.map(i=>s.r[i]);
      const rowCls=claseFila(s);
      const alTd=s.al!==null
        ? `<td class="td-num ${oficial==='evacuacion'||oficial==='alerta'?'va':''}">${formatoAR(s.al)}</td>`
        : `<td class="td-num nd">—</td>`;
      const evTd=s.ev!==null
        ? `<td class="td-num ${oficial==='evacuacion'?'va':''}">${formatoAR(s.ev)}</td>`
        : `<td class="td-num nd">—</td>`;
      const uTag=esAltura(s)?'':`<span class="unit-tag">${u}</span>`;
      rows+=`<tr${rowCls?` class="${rowCls}"`:''}>
        <td class="td-nm">${s.n}${uTag}</td>
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
        <span class="rv-name">${rv.name}</span>
        <span class="rv-count">${rv.stations.length} puertos</span>
      </div>
      <div class="tbl-wrap"><table class="st">
        <thead><tr>
          <th>Puerto</th><th class="c">Evolución</th>
          ${dlbls.map(l=>`<th class="r">${l}</th>`).join('')}
          <th class="r">Var 24h</th><th class="c">Estado</th><th class="r">Alerta</th><th class="r">Evacuac.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    wrap.appendChild(el);
  }
}
// 12 colores: es la cantidad de puertos del río más poblado (Paraná), así
// ninguna serie repite color dentro de un mismo panel.
const CAT_L=['#0B5CAB','#0D9B8A','#1A6B7A','#1478A8','#3D8B6E','#5B7C99','#0E7C8B','#2A6F97','#6B4FA8','#A65C2E','#8C3D5F','#4F7A2A'];
const CAT_D=['#4BA3E6','#2EC4B0','#5EB4C4','#3DB5E0','#6BC4A0','#8AAFC4','#4DB8C6','#6AA8C9','#A78BE0','#E0955F','#DE8AAF','#9CC96A'];

// Qué muestra el gráfico principal. Hay dos formas de elegirlo:
//   {tipo:'rio', id}          -> 'todos' o el id de un río (botonera de abajo)
//   {tipo:'puertos', nombres} -> una lista puntual, que llega desde los paneles
//                                de alertas o las tarjetas de resumen
// Arranca en todos los puertos, que es la vista por defecto.
const FILTRO_TODOS='todos';
let seleccion={tipo:'rio',id:FILTRO_TODOS};
let chart=null;

// Puertos que entran en el gráfico según la selección activa, en el orden en
// que vienen de history.json. Sólo los que miden en metros: los de caudal
// tienen su propio panel y su propia escala.
function puertosDelFiltro(){
  const out=[];
  cadaPuerto((s,rv)=>{
    if(!esAltura(s)) return;
    if(seleccion.tipo==='rio'){
      if(seleccion.id!==FILTRO_TODOS&&rv.id!==seleccion.id) return;
    }else if(!seleccion.nombres.has(s.n)) return;
    out.push({n:s.n,r:s.r,cv:rv.cv,rio:rv.name});
  });
  return out;
}

// Baja hasta el gráfico, respetando a quien pidió menos animaciones.
function irAlGrafico(){
  const panel=document.getElementById('js-chart-panel');
  if(!panel) return;
  const suave=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.scrollIntoView({behavior:suave?'smooth':'auto',block:'start'});
}
function filtrarPorRio(id){
  seleccion={tipo:'rio',id};
  renderToggles();
  buildChart();
}
// `clase` es el estado semántico (evacuacion, alerta, crecida...) y se usa para
// pintar el indicador de filtro activo con el mismo color del panel de origen.
function filtrarPuertos(nombres,etiqueta,clase){
  const lista=[...new Set(nombres)];
  if(!lista.length) return;
  seleccion={tipo:'puertos',nombres:new Set(lista),etiqueta,clase};
  renderToggles();
  buildChart();
  irAlGrafico();
}
function puertosDeCaudal(){
  const out=[];
  for(const rv of RIVERS) for(const s of rv.stations)
    if(!esAltura(s)) out.push({n:s.n,r:s.r,cv:rv.cv,rio:rv.name,u:unidadDe(s)});
  return out;
}
function cuantasAlturas(rv){
  return rv.stations.filter(esAltura).length;
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
  const puertos=puertosDelFiltro();
  // Con muchas series no hay leyenda ni colores por puerto que se puedan leer:
  // se pinta cada línea con el color de su río y se identifica el puerto al
  // pasar el mouse. Con pocas (un río, o un filtro desde un panel) entra la
  // leyenda y cada puerto recibe su propio color.
  const muchos=puertos.length>CAT_L.length;
  const sets=puertos.map((s,i)=>{
    const col=muchos?CS(s.cv):COLS[i%COLS.length];
    return {
      label:muchos?`${s.n} · ${s.rio}`:s.n,
      data:s.r.map(v=>v===null?null:v),
      borderColor:col,backgroundColor:col+'18',
      borderWidth:muchos?1.5:2,
      // pointRadius > 0 incluso con muchas series: con una sola fecha cargada,
      // una línea sin puntos no dibujaría nada.
      pointRadius:muchos?2:4,pointHoverRadius:6,
      tension:.2,spanGaps:false,fill:false,
    };
  });
  if(chart) chart.destroy();
  chart=new Chart(ctx,{
    type:'line',data:{labels:DATE_LBL,datasets:sets},
    options:{responsive:true,maintainAspectRatio:false,
      interaction:muchos?{mode:'nearest',intersect:true}:{mode:'index',intersect:false},
      plugins:{
        legend:{display:!muchos,position:'top',labels:{color:txtc,boxWidth:12,padding:12,usePointStyle:true,pointStyle:'circle',font:{family:"'Montserrat',sans-serif",size:12,weight:'600'}}},
        tooltip:{backgroundColor:tooltipBg,borderColor:tooltipBd,borderWidth:1,titleColor:txtc,bodyColor:txtc,
          callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y!==null?formatoAR(c.parsed.y)+' m':'S/D'}`}}
      },
      scales:{
        x:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11}}},
        y:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11},callback:v=>formatoAR(v)+' m'}},
      }
    }
  });
}
// Panel aparte para los puertos que informan caudal. Mismo estilo que el
// gráfico principal, pero con su propia escala y su propia unidad.
let chartCaudal=null;
function buildCaudalChart(){
  const panel=document.getElementById('js-caudal-panel');
  const puertos=puertosDeCaudal();
  panel.hidden=!puertos.length;
  if(!puertos.length) return;

  const {COLS,gc,bc,tc2,txtc,tooltipBg,tooltipBd}=chartTheme();
  const unidad=puertos[0].u;
  const sets=puertos.map((s,i)=>({
    label:`${s.n} · ${s.rio}`,data:s.r.map(v=>v===null?null:v),
    borderColor:COLS[i%COLS.length],backgroundColor:COLS[i%COLS.length]+'18',
    borderWidth:2,pointRadius:4,pointHoverRadius:6,tension:.2,spanGaps:false,fill:false,
  }));
  if(chartCaudal) chartCaudal.destroy();
  chartCaudal=new Chart(document.getElementById('js-caudal').getContext('2d'),{
    type:'line',data:{labels:DATE_LBL,datasets:sets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'top',labels:{color:txtc,boxWidth:12,padding:12,usePointStyle:true,pointStyle:'circle',font:{family:"'Montserrat',sans-serif",size:12,weight:'600'}}},
        tooltip:{backgroundColor:tooltipBg,borderColor:tooltipBd,borderWidth:1,titleColor:txtc,bodyColor:txtc,
          callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y!==null?formatoAR(c.parsed.y)+' '+unidad:'S/D'}`}}
      },
      scales:{
        x:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11}}},
        y:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11},callback:v=>formatoAR(v)+' '+unidad}},
      }
    }
  });
}
// Botonera del panel de comparación: "TODOS LOS PUERTOS" primero y después un
// botón por río, en el orden en que vienen en history.json. Es de selección
// única (como un radio), no una lista de puertos individuales. Cuando el
// filtro llegó desde un panel de alertas, ningún botón queda activo y en su
// lugar aparece un indicador con el origen del filtro y una cruz para volver.
function renderToggles(){
  const el=document.getElementById('js-toggles');
  const porRio=seleccion.tipo==='rio';
  // Los contadores son de puertos graficados en este panel, es decir los que
  // miden en metros: los de caudal tienen su propio panel.
  const total=RIVERS.reduce((n,rv)=>n+cuantasAlturas(rv),0);
  const botones=[{id:FILTRO_TODOS,txt:`TODOS LOS PUERTOS (${total})`}];
  for(const rv of RIVERS)
    botones.push({id:rv.id,txt:`${rv.name.replace(/^Río\s+/,'')} (${cuantasAlturas(rv)})`});

  let html=botones.map(b=>
    `<button class="tog ${porRio&&b.id===seleccion.id?'on':''}" data-rio="${b.id}">${b.txt}</button>`).join('');

  // El contador es de líneas realmente dibujadas, que puede ser menor que los
  // puertos seleccionados si alguno mide caudal y quedó fuera de este gráfico.
  if(!porRio) html+=`<span class="filtro-activo ${seleccion.clase?'c-'+seleccion.clase:''}">`+
    `${seleccion.etiqueta} (${puertosDelFiltro().length})`+
    `<button class="filtro-x" data-rio="${FILTRO_TODOS}" title="Quitar el filtro"`+
    ` aria-label="Quitar el filtro y volver a todos los puertos">✕</button></span>`;

  el.innerHTML=html;
}

// Todos los clics de filtrado, por delegación: los paneles se redibujan enteros
// en cada render, así que los listeners van una sola vez sobre los contenedores.
function conectarFiltros(){
  document.getElementById('js-toggles').addEventListener('click',e=>{
    const b=e.target.closest('[data-rio]');
    if(b) filtrarPorRio(b.dataset.rio);
  });

  document.getElementById('js-oficial').addEventListener('click',e=>{
    const b=e.target.closest('[data-puerto]');
    if(b) filtrarPuertos([b.dataset.puerto],b.dataset.puerto,b.classList.contains('c-evacuacion')?'evacuacion':'alerta');
  });

  // Un solo listener para el panel de fluctuación: cubre el título (todas), los
  // subtítulos de cada grupo y las etiquetas de cada puerto.
  document.getElementById('js-fluct').addEventListener('click',e=>{
    const puerto=e.target.closest('[data-puerto]');
    if(puerto){
      filtrarPuertos([puerto.dataset.puerto],puerto.dataset.puerto,
        puerto.classList.contains('c-crecida')?'crecida':'bajante');
      return;
    }
    const grupo=e.target.closest('[data-grupo]');
    if(!grupo) return;
    const tipo=grupo.dataset.grupo;
    const etiquetas={todas:'Con fluctuación',crecida:'Crecidas',bajante:'Bajantes'};
    filtrarPuertos(puertosPorFluctuacion(tipo),etiquetas[tipo],tipo==='todas'?'':tipo);
  });

  document.getElementById('js-stats').addEventListener('click',e=>{
    const b=e.target.closest('[data-estado]');
    if(!b) return;
    const estado=b.dataset.estado;
    if(estado==='total'){ filtrarPorRio(FILTRO_TODOS); irAlGrafico(); return; }
    const etiquetas={evacuacion:'En evacuación',alerta:'En alerta',estable:'Estables'};
    filtrarPuertos(puertosPorEstado(estado),etiquetas[estado],estado);
  });
}
// Una tarjeta por puerto con su pico dentro de la ventana de los últimos
// VENTANA_MAXIMOS días. Los puertos sin ninguna lectura en la ventana no
// generan tarjeta.
function renderRecords(){
  const ventana=Math.min(VENTANA_MAXIMOS,DATES.length);
  const titulo=document.getElementById('js-records-title');
  if(titulo) titulo.textContent=ventana
    ? `Máximos de los últimos ${ventana} días registrados`
    : 'Máximos del período registrado';

  let h='';
  for(const rv of RIVERS) for(const s of rv.stations){
    const mx=maxR(s.r,VENTANA_MAXIMOS);
    if(!mx) continue;
    const[,m,d]=DATES[mx.i].split('-');
    h+=`<div class="rec-cell">`+
       `<div class="rec-stn">${s.n}</div>`+
       `<div class="rec-rv">${rv.name}</div>`+
       `<div class="rec-val">${formatoAR(mx.x)} ${unidadDe(s)}</div>`+
       `<div class="rec-when">máx el ${+d} ${MESES[+m-1]}</div>`+
       `</div>`;
  }
  document.getElementById('js-records').innerHTML=
    h||`<div class="rec-empty">Todavía no hay lecturas registradas.</div>`;
}
const histCharts = {};
function buildHistChart(rv, canvasId, visibleSet) {
  const ctx = document.getElementById(canvasId);if (!ctx) return;
  const {COLS,gc,bc,tc2,txtc,tooltipBg,tooltipBd}=chartTheme();
  const sets = rv.stations.filter(esAltura).map((s,i)=>({
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
          borderWidth:1,titleColor:txtc,bodyColor:txtc,callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y!==null?formatoAR(c.parsed.y)+' m':'S/D'}`}}
      },
      scales:{
        x:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:10},maxTicksLimit:12}},
        y:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:10},callback:v=>formatoAR(v)+' m'}},
      }
    }
  });
}
function renderHistorical() {
  const wrap = document.getElementById('js-hist-panels');
  let html = '';
  // Se listan los 5 ríos con todos sus puertos de altura, incluso los que
  // todavía no tienen lecturas: el tablero los tiene que mostrar desde el día
  // uno. Los de caudal quedan afuera porque tienen su propio panel.
  for (const rv of RIVERS) {
    const stations = rv.stations.filter(esAltura);
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
    const stations=rv.stations.filter(esAltura);
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
// Cartel de la esquina superior derecha. Muestra cuándo corrió el scraper por
// última vez; si el archivo todavía no tiene "last_update" (historial viejo o
// recién inicializado), cae a la última fecha registrada, sin hora.
function renderDate(){
  document.getElementById('js-date').textContent=
    fmtSello(LAST_UPDATE)
    || (DATES.length?fmtISO(DATES[DATES.length-1]):'SIN REGISTROS');
}

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

// --- Modal informativo (LÉEME) ----------------------------------------------

let disparadorDelModal=null;  // a quién le devolvemos el foco al cerrar

function abrirModal(){
  const modal=document.getElementById('modal-leeme');
  disparadorDelModal=document.activeElement;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-abierto');
  // El foco entra al modal para que Escape y el tabulado funcionen sin tener
  // que clickear primero dentro de la caja.
  document.getElementById('js-cerrar-leeme').focus();
}
function cerrarModal(){
  const modal=document.getElementById('modal-leeme');
  if(modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  document.body.classList.remove('modal-abierto');
  if(disparadorDelModal&&disparadorDelModal.focus) disparadorDelModal.focus();
  disparadorDelModal=null;
}

function conectarModal(){
  const modal=document.getElementById('modal-leeme');
  document.getElementById('js-abrir-leeme').addEventListener('click',abrirModal);
  document.getElementById('js-cerrar-leeme').addEventListener('click',cerrarModal);
  // Clic en el fondo, no en la caja: e.target es el overlay sólo si el clic
  // cayó fuera de .modal-content.
  modal.addEventListener('click',e=>{ if(e.target===modal) cerrarModal(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') cerrarModal(); });
}

// La fecha de inicio del historial sale del propio archivo, así el texto del
// modal no envejece. Si todavía no hay datos queda el texto fijo del HTML.
function actualizarInicioDelRegistro(){
  const el=document.getElementById('js-leeme-inicio');
  if(!el||!DATES.length) return;
  const dias=DATES.length;
  const faltan=VENTANA_MAXIMOS-dias;
  el.textContent=`El registro de esta base de datos arrancó el ${fmtLargo(DATES[0])} `+
    `y hoy acumula ${dias} ${dias===1?'día':'días'} de mediciones. `+
    (faltan>0
      ? `La ventana va a seguir creciendo día a día hasta completar los 90 días (faltan ${faltan}).`
      : `Ya cubre la ventana completa de ${VENTANA_MAXIMOS} días.`);
}
// '2026-09-10' -> '10 de septiembre de 2026'
function fmtLargo(iso){
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
    'septiembre','octubre','noviembre','diciembre'];
  const [y,m,d]=iso.split('-');
  return `${+d} de ${meses[+m-1]} de ${y}`;
}

async function init(){
  // El LÉEME no depende de los datos: se conecta antes de pedir el historial
  // para que siga abriéndose aunque el fetch falle.
  conectarModal();

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
  LAST_UPDATE=datos.last_update||null;
  DATE_LBL=DATES.map(etiquetaCorta);

  renderDate();
  renderAlertasOficiales();renderFluctuacion();renderStats();
  renderRivers();renderHistorical();
  renderToggles();buildChart();buildCaudalChart();renderRecords();
  actualizarInicioDelRegistro();
  conectarFiltros();
}

init();
