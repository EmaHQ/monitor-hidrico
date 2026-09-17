// Datos del historial. Se llenan en init() con lo que devuelve history.json:
// hasta que el fetch termine, los renders no se ejecutan.
let DATES=[];      // fechas ISO, una por columna de las series
let DATE_LBL=[];   // etiquetas cortas para los gráficos ('3 ago'), derivadas de DATES
let RIVERS=[];     // ríos con sus puertos (clave "stations") y sus series r[]
let LAST_UPDATE=null;  // sello del scraper, 'YYYY-MM-DD HH:MM:SS' en hora AR

const ARCHIVO_HISTORIAL='./history.json';
// Enlaces a la ficha oficial de cada puerto. String vacío = todavía sin URL.
const URLS_OFICIALES={
  'POZO HONDO':'https://www.meteorologia.gov.py/nivel-rio/vermas_convencional.php?code=2000086067',
  'CÁCERES':'https://meteorologia.gov.py/nivel-rio/vermas_convencional.php?code=2000082003',
  'BAHÍA NEGRA':'https://www.meteorologia.gov.py/nivel-rio/vermas_convencional.php?code=2000086033',
  'MURTINHO':'https://www.meteorologia.gov.py/nivel-rio/vermas_convencional.php?code=2000082002',
  'VALLEMI':'https://www.meteorologia.gov.py/nivel-rio/vermas_convencional.php?code=2000086088',
  'CONCEPCIÓN':'https://www.meteorologia.gov.py/nivel-rio/vermas_convencional.php?code=2000086134',
  'ASUNCIÓN':'https://www.meteorologia.gov.py/nivel-rio/vermas_convencional.php?code=2000086218',
  'BOUVIER':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=500',
  'FORMOSA':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=510',
  'BERMEJO':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=520',
  'LAS PALMAS':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=525',
  'ISLA DEL CERRITO':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=530',
  'CAPANEMA':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=9',
  'ANDRESITO':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=10',
  'IGUAZÚ':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=20',
  'ITAIPÚ':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=22',
  'LIBERTAD':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=30',
  'POSADAS':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=80',
  'ITUZAINGÓ':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=90',
  'ITÁ IBATÉ':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=100',
  'ITATÍ':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=110',
  'PASO DE LA PATRIA':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=120',
  'CORRIENTES':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=130',
  'BARRANQUERAS':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=140',
  'EMPEDRADO':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=150',
  'GOYA':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=170',
  'ESQUINA':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=190',
  'EL SOBERBIO':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=531',
  'SAN JAVIER':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=540',
  'SANTO TOMÉ':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=570',
  'ALVEAR':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=580',
  'PASO DE LOS LIBRES':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=610',
  'MONTE CASEROS':'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=630',
  // Río Bermejo (SNIH). URL vacía = ficha oficial todavía no cargada.
  'ALARACHE':'',
  'AGUAS BLANCAS':'',
  'EMBARCACIÓN':'',
  'SAUZALITO':'',
  'LAVALLE':'',
  'EL COLORADO':'',
  'VELAZ':'',
};
// Coordenadas [lat, lon] de cada puerto. [0, 0] = todavía sin georreferenciar:
// el mapa no dibuja marcador ni hace flyTo sobre esos puntos.
const COORDENADAS_PUERTOS={
  'POZO HONDO':[-22.376854,-62.518039],
  'CÁCERES':[-16.075925,-57.702055],
  'BAHÍA NEGRA':[-20.235024,-58.167152],
  'MURTINHO':[-21.698951,-57.891915],
  'VALLEMI':[-22.155408,-57.957039],
  'CONCEPCIÓN':[-23.407534,-57.454136],
  'ASUNCIÓN':[-25.273910,-57.644604],
  'BOUVIER':[-25.460568,-57.580521],
  'FORMOSA':[-26.190548,-58.154538],
  'BERMEJO':[-26.927147,-58.507004],
  'LAS PALMAS':[-27.118696,-58.646406],
  'ISLA DEL CERRITO':[-27.291672,-58.619095],
  'CAPANEMA':[-25.541818,-53.491231],
  'ANDRESITO':[-25.591862,-53.996939],
  'IGUAZÚ':[-25.610443,-54.572353],
  'ITAIPÚ':[-25.413719,-54.598637],
  'LIBERTAD':[-25.913282,-54.615627],
  'POSADAS':[-27.379675,-55.898869],
  'ITUZAINGÓ':[-27.583899,-56.683105],
  'ITÁ IBATÉ':[-27.428772,-57.337852],
  'ITATÍ':[-27.270328,-58.237490],
  'PASO DE LA PATRIA':[-27.311679,-58.577243],
  'CORRIENTES':[-27.470055,-58.827129],
  'BARRANQUERAS':[-27.486687,-58.926382],
  'EMPEDRADO':[-27.945627,-58.799068],
  'GOYA':[-29.168227,-59.335403],
  'ESQUINA':[-30.013741,-59.526451],
  'EL SOBERBIO':[-27.297104,-54.199967],
  'SAN JAVIER':[-27.874508,-55.135132],
  'SANTO TOMÉ':[-28.551468,-56.044014],
  'ALVEAR':[-29.093004,-56.547436],
  'PASO DE LOS LIBRES':[-29.711752,-57.092052],
  'MONTE CASEROS':[-30.252983,-57.635179],
  'ALARACHE':[-22.273417,-64.533542],
  'AGUAS BLANCAS':[-22.735694,-64.354114],
  'EMBARCACIÓN':[-23.207331,-64.095955],
  'SAUZALITO':[-24.425058,-61.684463],
  'LAVALLE':[-25.658672,-60.132934],
  'EL COLORADO':[-26.307520,-59.373920],
  'VELAZ':[-26.661255,-58.635376],
};
function coordsValidas(c){
  return Array.isArray(c)&&c.length>=2&&!(c[0]===0&&c[1]===0);
}
function nombrePuertoHtml(s){
  const url=URLS_OFICIALES[s.n];
  const titulo=url
    ? `Centrar el mapa en ${s.n} (Ctrl+clic abre la ficha oficial)`
    : `Centrar el mapa en ${s.n}`;
  const attrs=`class="link-puerto" data-flyto="${s.n}" title="${titulo}"`;
  if(!url) return `<button type="button" ${attrs}>${s.n}</button>`;
  return `<a ${attrs} href="${url}" target="_blank" rel="noopener noreferrer">${s.n}</a>`;
}
// Ventana del panel de máximos: se evalúan los últimos 90 registros diarios,
// o el historial completo si todavía es más corto.
const VENTANA_MAXIMOS=90;
// Umbrales de fluctuación en 24 hs, en metros. Son asimétricos a propósito:
// una crecida de 1 m ya es noticia, una bajante recién a partir de 1,50 m.
const UMBRAL_CRECIDA=1.00;
const UMBRAL_BAJANTE=-1.50;
const ETIQUETA_FLUCT={
  crecida:'Aumento de caudal',
  bajante:'Disminución de caudal',
  todas:'Con fluctuación',
};
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
// Localidades del DMH paraguayo. Si el puerto trae "f"/"fuente" (PNA|DMH),
// esa propiedad gana; si no, se infiere por nombre, igual que en el scraper.
const FUENTES_DMH=new Set(['POZO HONDO','CÁCERES','BAHÍA NEGRA','MURTINHO','VALLEMI','CONCEPCIÓN','ASUNCIÓN']);
const FUENTES_SNIH=new Set(['ALARACHE','AGUAS BLANCAS','EMBARCACIÓN','SAUZALITO','LAVALLE','EL COLORADO','VELAZ']);
function fuenteDe(s){
  const f=String(s.f||s.fuente||'').toUpperCase();
  if(f==='DMH'||f==='PNA'||f==='SNIH') return f;
  if(FUENTES_DMH.has(s.n)) return 'DMH';
  if(FUENTES_SNIH.has(s.n)) return 'SNIH';
  return 'PNA';
}
function badgeFuente(s){
  const f=fuenteDe(s);
  const cls=f==='DMH'?'dmh':f==='SNIH'?'snih':'pna';
  const titulos={
    DMH:'Dirección de Meteorología e Hidrología de Paraguay',
    PNA:'Prefectura Naval Argentina',
    SNIH:'Sistema Nacional de Información Hídrica',
  };
  return `<span class="badge-fuente ${cls}" title="${titulos[f]||f}">${f}</span>`;
}
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

// Mismo criterio que la fila: evacuación pisa alerta; la fluctuación sólo
// cuenta si el puerto sigue estable. null = paleta original (estable / S/D).
function resalteGrafico(s){
  const oficial=estadoOficial(s);
  if(oficial==='evacuacion'||oficial==='alerta') return oficial;
  if(oficial==='estable'){
    const f=fluctuacion(s);
    if(f==='crecida'||f==='bajante') return f;
  }
  return null;
}
const COLOR_RESALTE={
  evacuacion:'--evacuacion',
  alerta:'--alerta-oficial',
  crecida:'--alerta-crecida',
  bajante:'--alerta-bajante',
};
// Evacuación queda última (se dibuja encima). Estable/S/D = 0, atrás.
const Z_RESALTE={bajante:1,crecida:2,alerta:3,evacuacion:4};
function colorDeResalte(tipo){
  const v=COLOR_RESALTE[tipo];
  return v?CS(v):'';
}
function colorConAlpha(color, alpha){
  const c=String(color||'').trim();
  let m=/^#([0-9a-f]{3})$/i.exec(c);
  if(m){
    const [r,g,b]=m[1].split('').map(ch=>parseInt(ch+ch,16));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  m=/^#([0-9a-f]{6})/i.exec(c);
  if(m){
    const n=parseInt(m[1],16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  }
  m=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if(m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
  return c;
}
function riosEnOrdenDeTablas(){
  const rios=RIVERS.slice();
  const i=rios.findIndex(rv=>rv.id==='bermejo');
  if(i<0||i===rios.length-1) return rios;
  const [bermejo]=rios.splice(i,1);
  rios.push(bermejo);
  return rios;
}

// Recorre los puertos de todos los ríos, en el orden de history.json.
function cadaPuerto(fn){
  for(const rv of RIVERS) for(const s of rv.stations) fn(s,rv);
}
function puertoPorNombre(n){
  let hallado=null;
  cadaPuerto(s=>{ if(!hallado&&s.n===n) hallado=s; });
  return hallado;
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
    badgeFuente(s)+
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
        extra:estado==='evacuacion'?`evacuación ${formatoAR(s.ev)} m`:`alerta ${formatoAR(s.al)} m`,
      })).join('')}</div>
    </div>`;
  }
  cuerpo.innerHTML=html;
}

// Panel 2: aumentos y disminuciones de caudal, cada grupo con su subtítulo filtrable.
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
  for(const tipo of ['crecida','bajante']){
    const items=grupos[tipo];
    if(!items.length) continue;
    html+=`<div class="ap-group">
      <button type="button" class="ap-sub c-${tipo}" data-grupo="${tipo}"
              title="Ver en el gráfico todos los puertos de este grupo">${ETIQUETA_FLUCT[tipo]} (${items.length})</button>
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
// botones que filtran el gráfico, incluida "Sin datos".
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
    if(!t.n) return `<div class="stat ${t.clase}">${cuerpo}</div>`;
    return `<button type="button" class="stat ${t.clase}" data-estado="${t.estado}"`+
      ` title="Ver estos puertos en el gráfico">${cuerpo}</button>`;
  }).join('');
}
function renderRivers(){
  const wrap=document.getElementById('js-rivers');
  const N=5;
  const tblIdx=DATES.map((_,i)=>i).slice(-N);
  const dlbls=tblIdx.map(i=>{const[,m,day]=DATES[i].split('-');return`${+day}/${+m}`;});
  for(const rv of riosEnOrdenDeTablas()){
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
        <td class="td-nm">${nombrePuertoHtml(s)}${badgeFuente(s)}${uTag}</td>
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
    out.push({n:s.n,r:s.r,cv:rv.cv,rio:rv.name,al:s.al??null,ev:s.ev??null,f:fuenteDe(s)});
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
  sincronizarMarcadoresMapa();
  ajustarVistaMapa();
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
  sincronizarMarcadoresMapa();
  ajustarVistaMapa();
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
// Tooltip sólo si el cursor pisa un punto, en todos los filtros y en represas.
const INTERACCION_PUNTO={mode:'nearest',intersect:true};

// Líneas horizontales de alerta/evacuación: sólo con un puerto visible.
const pluginUmbrales={
  id:'umbralesHidricos',
  afterDatasetsDraw(c){
    const vis=c.data.datasets.filter((_,i)=>c.isDatasetVisible(i));
    if(vis.length!==1) return;
    const d=vis[0];
    const area=c.chartArea;
    const yScale=c.scales.y;
    if(!area||!yScale) return;
    const ctx=c.ctx;
    const linea=(valor,color,titulo)=>{
      if(valor===null||valor===undefined||!isFinite(valor)) return;
      const y=yScale.getPixelForValue(valor);
      if(y<area.top||y>area.bottom) return;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle=color;
      ctx.lineWidth=1.6;
      ctx.setLineDash([6,4]);
      ctx.moveTo(area.left,y);
      ctx.lineTo(area.right,y);
      ctx.stroke();
      const txt=`${titulo} ${formatoAR(valor)} m`;
      ctx.font="600 10px Montserrat, system-ui, sans-serif";
      const tw=ctx.measureText(txt).width;
      const tx=area.left+8;
      const ty=y-6;
      ctx.fillStyle=CS('--surf');
      ctx.fillRect(tx-3,ty-10,tw+6,14);
      ctx.fillStyle=color;
      ctx.fillText(txt,tx,ty);
      ctx.restore();
    };
    linea(d.al,CS('--alerta-oficial'),'Alerta');
    linea(d.ev,CS('--evacuacion'),'Evacuación');
  }
};
// Halo semitransparente alrededor de las líneas en alerta. El trazo sólido
// queda con el grosor normal; la sombra del canvas hace de resplandor.
const pluginHaloAlerta={
  id:'haloAlerta',
  beforeDatasetDraw(c, args){
    const ds=c.data.datasets[args.index];
    if(!ds||!ds.halo||!c.isDatasetVisible(args.index)) return;
    const ctx=c.ctx;
    ctx.save();
    ctx.shadowColor=ds.haloColor||ds.borderColor;
    ctx.shadowBlur=18;
    ctx.shadowOffsetX=0;
    ctx.shadowOffsetY=0;
  },
  afterDatasetDraw(c, args){
    const ds=c.data.datasets[args.index];
    if(!ds||!ds.halo||!c.isDatasetVisible(args.index)) return;
    c.ctx.restore();
  }
};
function incluirUmbralesEnEscala(axis){
  const vis=axis.chart.data.datasets.filter((_,i)=>axis.chart.isDatasetVisible(i));
  if(vis.length!==1) return;
  const d=vis[0];
  for(const v of [d.al,d.ev]){
    if(v===null||v===undefined||!isFinite(v)) continue;
    if(v>axis.max) axis.max=v;
    if(v<axis.min) axis.min=v;
  }
  const span=axis.max-axis.min||1;
  axis.max+=span*0.08;
}
function buildChart(){
  const ctx=document.getElementById('js-chart').getContext('2d');
  const {COLS,gc,bc,tc2,txtc,tooltipBg,tooltipBd}=chartTheme();
  const puertos=puertosDelFiltro();
  // Con muchas series cada línea toma el color de su río; con pocas (un río
  // o un filtro puntual) cada puerto recibe su propio color.
  const muchos=puertos.length>CAT_L.length;
  const sets=puertos.map((s,i)=>{
    const paleta=muchos?CS(s.cv):COLS[i%COLS.length];
    const origen=puertoPorNombre(s.n)||s;
    const resalte=resalteGrafico(origen);
    const col=resalte?colorDeResalte(resalte)||paleta:paleta;
    return {
      label:muchos?`${s.n} · ${s.rio}`:s.n,
      nombre:s.n,
      rio:s.rio,
      fuente:s.f||fuenteDe(s),
      al:s.al??null,
      ev:s.ev??null,
      data:s.r.map(v=>v===null?null:v),
      borderColor:col,backgroundColor:col+'18',
      // En alerta el trazo central se engrosa; el halo del plugin va aparte.
      borderWidth:resalte?4:2,
      // pointRadius > 0 incluso con muchas series: con una sola fecha cargada,
      // una línea sin puntos no dibujaría nada.
      pointRadius:muchos?2:4,pointHoverRadius:6,
      tension:.2,spanGaps:false,fill:false,
      halo:!!resalte,
      haloColor:resalte?colorConAlpha(col,.55):null,
      // Chart.js: menor `order` se dibuja encima. 1 = alerta al frente, 99 = atrás.
      order:resalte?1:99,
      z:resalte?Z_RESALTE[resalte]||1:0,
    };
  });
  // Leyenda: sin alerta primero, con alerta al final. El apilado visual lo
  // resuelve `order`, no este sort.
  sets.sort((a,b)=>a.z-b.z);
  if(chart) chart.destroy();
  chart=new Chart(ctx,{
    type:'line',
    plugins:[pluginUmbrales,pluginHaloAlerta],
    data:{labels:DATE_LBL,datasets:sets},
    options:{responsive:true,maintainAspectRatio:false,
      interaction:INTERACCION_PUNTO,
      plugins:{
        legend:{display:false},
        tooltip:{
          enabled:true,
          mode:'nearest',
          intersect:true,
          backgroundColor:tooltipBg,borderColor:tooltipBd,borderWidth:1,
          titleColor:txtc,bodyColor:txtc,
          callbacks:{
            label:c=>{
              const y=c.parsed.y!==null?formatoAR(c.parsed.y)+' m':'S/D';
              const nom=c.dataset.nombre||c.dataset.label;
              const fte=c.dataset.fuente?` (${c.dataset.fuente})`:'';
              const rio=c.dataset.rio?` - ${c.dataset.rio}`:'';
              return ` ${nom}${fte}${rio}: ${y}`;
            }
          }
        }
      },
      scales:{
        x:{grid:{color:gc,lineWidth:1},border:{color:bc},ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11}}},
        y:{
          grid:{color:gc,lineWidth:1},border:{color:bc},
          ticks:{color:tc2,font:{family:"'Montserrat',sans-serif",size:11},callback:v=>formatoAR(v)+' m'},
          afterDataLimits:incluirUmbralesEnEscala,
        },
      }
    }
  });
  renderLeyenda();
}
function claseEscalaLeyenda(nombre){
  const s=puertoPorNombre(nombre);
  if(!s) return '';
  const resalte=resalteGrafico(s);
  if(resalte==='evacuacion') return 'alerta-escala-3';
  if(resalte==='alerta') return 'alerta-escala-2';
  if(resalte==='crecida'||resalte==='bajante') return 'alerta-escala-1';
  return '';
}
function renderLeyenda(){
  const el=document.getElementById('js-legend');
  if(!el) return;
  if(!chart||!chart.data.datasets.length){el.innerHTML='';return;}
  el.innerHTML=chart.data.datasets.map((d,i)=>{
    const on=chart.isDatasetVisible(i)?'on':'';
    const nom=d.nombre||d.label;
    const fte=d.fuente?badgeFuente({n:nom,f:d.fuente}):'';
    const escala=claseEscalaLeyenda(nom);
    return `<button type="button" class="leg ${on}${escala?' '+escala:''}" data-ds="${i}" style="--c:${d.borderColor}"`+
      ` aria-pressed="${on?'true':'false'}" title="${d.label}">${nom}${fte}</button>`;
  }).join('');
}
function toggleTodosLosDatasets(){
  if(!chart) return;
  const alguno=chart.data.datasets.some((_,i)=>chart.isDatasetVisible(i));
  const mostrar=!alguno;
  chart.data.datasets.forEach((_,i)=>chart.setDatasetVisibility(i,mostrar));
  chart.update();
  renderLeyenda();
  sincronizarMarcadoresMapa();
  ajustarVistaMapa();
}
function toggleDataset(i){
  if(!chart||i<0||i>=chart.data.datasets.length) return;
  chart.setDatasetVisibility(i,!chart.isDatasetVisible(i));
  chart.update();
  renderLeyenda();
  sincronizarMarcadoresMapa();
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
    options:{responsive:true,maintainAspectRatio:false,interaction:INTERACCION_PUNTO,
      plugins:{
        legend:{position:'top',labels:{color:txtc,boxWidth:12,padding:12,usePointStyle:true,pointStyle:'circle',font:{family:"'Montserrat',sans-serif",size:12,weight:'600'}}},
        tooltip:{backgroundColor:tooltipBg,borderColor:tooltipBd,borderWidth:1,titleColor:txtc,bodyColor:txtc,
          mode:'nearest',intersect:true,
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

  html+=`<button type="button" class="tog btn-toggle-all" data-accion="marcar-todos"`+
    ` title="Si hay puertos visibles, los oculta; si no hay ninguno, los muestra todos">`+
    `Marcar / Desmarcar Todos</button>`;

  // El contador es de líneas realmente dibujadas, que puede ser menor que los
  // puertos seleccionados si alguno mide caudal y quedó fuera de este gráfico.
  if(!porRio){
    const puerto=puertoPorNombre(seleccion.etiqueta);
    html+=`<span class="filtro-activo ${seleccion.clase?'c-'+seleccion.clase:''}">`+
      `${seleccion.etiqueta}${puerto?badgeFuente(puerto):''} (${puertosDelFiltro().length})`+
      `<button class="filtro-x" data-rio="${FILTRO_TODOS}" title="Quitar el filtro"`+
      ` aria-label="Quitar el filtro y volver a todos los puertos">✕</button></span>`;
  }

  el.innerHTML=html;
}

// Todos los clics de filtrado, por delegación: los paneles se redibujan enteros
// en cada render, así que los listeners van una sola vez sobre los contenedores.
function conectarFiltros(){
  document.getElementById('js-toggles').addEventListener('click',e=>{
    const all=e.target.closest('[data-accion="marcar-todos"]');
    if(all){ toggleTodosLosDatasets(); return; }
    const b=e.target.closest('[data-rio]');
    if(b) filtrarPorRio(b.dataset.rio);
  });

  document.getElementById('js-legend').addEventListener('click',e=>{
    const b=e.target.closest('[data-ds]');
    if(b) toggleDataset(+b.dataset.ds);
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
    filtrarPuertos(puertosPorFluctuacion(tipo),ETIQUETA_FLUCT[tipo],tipo==='todas'?'':tipo);
  });

  document.getElementById('js-stats').addEventListener('click',e=>{
    const b=e.target.closest('[data-estado]');
    if(!b) return;
    const estado=b.dataset.estado;
    if(estado==='total'){ filtrarPorRio(FILTRO_TODOS); irAlGrafico(); return; }
    const etiquetas={evacuacion:'En evacuación',alerta:'En alerta',estable:'Estables',nd:'Sin datos'};
    filtrarPuertos(puertosPorEstado(estado),etiquetas[estado],estado);
  });
}

// --- Mapa Leaflet -----------------------------------------------------------

let mapa=null;
let capaPuertos=null;
const marcadoresEnMapa={};
const MARCADORES_PUERTOS=marcadoresEnMapa;
const CENTRO_CUENCA_DEL_PLATA=[-26.0,-59.0];
const ZOOM_CUENCA=6;
const ZOOM_PUERTO=12;

function etiquetaEstadoMarcador(s){
  const oficial=estadoOficial(s);
  if(oficial==='evacuacion') return 'Evacuación';
  if(oficial==='alerta') return 'Alerta';
  if(oficial==='nd') return 'Sin datos';
  const f=fluctuacion(s);
  if(f==='crecida') return 'Aumento de caudal';
  if(f==='bajante') return 'Disminución de caudal';
  return 'Estable';
}
function colorMarcador(s, rv){
  const resalte=resalteGrafico(s);
  if(resalte) return colorDeResalte(resalte)||CS('--estable');
  return CS(rv.cv)||CS('--estable');
}
function radioMarcador(s){
  const resalte=resalteGrafico(s);
  if(resalte==='evacuacion') return 11;
  if(resalte==='alerta') return 9;
  if(resalte) return 8;
  return 7;
}

function inicializarMapa(){
  const el=document.getElementById('mapa');
  if(!el||typeof L==='undefined'){
    console.error('[monitor-hidrico] Leaflet no está disponible; el mapa no se inicializa.');
    return;
  }
  const atribEsri='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
  const urlSatelital='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const mapaSatelital=L.tileLayer(urlSatelital,{attribution:atribEsri,maxZoom:19});
  const mapaTopografico=L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom:19,
    });
  const capaEtiquetas=L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{
      attribution:'Tiles &copy; Esri &mdash; Esri, HERE, Garmin',
      maxZoom:19,
      pane:'overlayPane',
    });
  // Instancia propia de imagery: si se reusa mapaSatelital dentro del group,
  // el control de capas marca Satélite e Híbrido al mismo tiempo.
  const mapaHibrido=L.layerGroup([
    L.tileLayer(urlSatelital,{attribution:atribEsri,maxZoom:19}),
    capaEtiquetas,
  ]);
  const baseMaps={
    'Híbrido':mapaHibrido,
    'Satélite':mapaSatelital,
    'Topográfico':mapaTopografico,
  };
  mapa=L.map(el,{
    center:CENTRO_CUENCA_DEL_PLATA,
    zoom:ZOOM_CUENCA,
    zoomControl:true,
    layers:[mapaHibrido],
  });
  L.control.layers(baseMaps).addTo(mapa);
  capaPuertos=L.layerGroup().addTo(mapa);
  const invalidar=()=>{ if(mapa) mapa.invalidateSize(); };
  mapa.whenReady(invalidar);
  requestAnimationFrame(()=>{
    invalidar();
    requestAnimationFrame(invalidar);
  });
  window.addEventListener('resize',invalidar);
  if(typeof ResizeObserver==='function'){
    new ResizeObserver(invalidar).observe(el);
  }
}

function popupPuerto(s, rv){
  const cur=lastTwo(s.r)[1];
  const nivel=cur===null?'S/D':`${formatoAR(cur)} ${unidadDe(s)}`;
  return `<strong>${s.n}</strong><br>${rv.name}<br>${nivel} · ${etiquetaEstadoMarcador(s)}`;
}

function renderMarcadores(){
  if(!mapa) return;
  for(const mk of Object.values(marcadoresEnMapa)){
    if(mapa.hasLayer(mk)) mapa.removeLayer(mk);
  }
  for(const k of Object.keys(marcadoresEnMapa)) delete marcadoresEnMapa[k];

  cadaPuerto((s,rv)=>{
    const c=COORDENADAS_PUERTOS[s.n];
    if(!coordsValidas(c)) return;
    const fill=colorMarcador(s,rv);
    const mk=L.circleMarker(c,{
      radius:radioMarcador(s),
      color:'#F4FAFC',
      weight:1.5,
      opacity:.9,
      fillColor:fill,
      fillOpacity:.88,
    }).bindPopup(popupPuerto(s,rv));
    mk.addTo(mapa);
    marcadoresEnMapa[s.n]=mk;
  });
  sincronizarMarcadoresMapa();
}

function nombresVisiblesParaMapa(){
  const visibles=new Set();
  if(seleccion.tipo==='rio'){
    cadaPuerto((s,rv)=>{
      if(seleccion.id!==FILTRO_TODOS&&rv.id!==seleccion.id) return;
      visibles.add(s.n);
    });
  }else if(seleccion.nombres){
    seleccion.nombres.forEach(n=>visibles.add(n));
  }
  if(chart){
    chart.data.datasets.forEach((d,i)=>{
      if(!d.nombre) return;
      if(!chart.isDatasetVisible(i)) visibles.delete(d.nombre);
    });
  }
  return visibles;
}

function sincronizarMarcadoresMapa(){
  if(!mapa) return;
  const visibles=nombresVisiblesParaMapa();
  for(const [nombre,mk] of Object.entries(marcadoresEnMapa)){
    if(visibles.has(nombre)){
      if(!mapa.hasLayer(mk)) mk.addTo(mapa);
    }else if(mapa.hasLayer(mk)){
      mapa.removeLayer(mk);
    }
  }
}

function ajustarVistaMapa(){
  if(!mapa||typeof L==='undefined') return;
  const puntos=[];
  for(const mk of Object.values(marcadoresEnMapa)){
    if(!mapa.hasLayer(mk)) continue;
    const ll=mk.getLatLng();
    if(ll) puntos.push(ll);
  }
  if(!puntos.length) return;
  const bounds=L.latLngBounds(puntos);
  const suave=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  mapa.fitBounds(bounds,{padding:[50,50],maxZoom:12,animate:suave});
}

function volarAlPuerto(nombre){
  const c=COORDENADAS_PUERTOS[nombre];
  if(!mapa||!coordsValidas(c)) return;
  const suave=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(suave) mapa.flyTo(c,ZOOM_PUERTO,{duration:1.15});
  else mapa.setView(c,ZOOM_PUERTO);
  const mk=marcadoresEnMapa[nombre];
  if(mk&&mapa.hasLayer(mk)) mk.openPopup();
}

function conectarFiltroEspacial(){
  const tablas=document.getElementById('js-rivers');
  if(!tablas) return;
  tablas.addEventListener('click',e=>{
    const el=e.target.closest('[data-flyto]');
    if(!el) return;
    if(el.tagName==='A'&&(e.ctrlKey||e.metaKey||e.shiftKey||e.button===1)) return;
    if(!coordsValidas(COORDENADAS_PUERTOS[el.dataset.flyto])) return;
    e.preventDefault();
    volarAlPuerto(el.dataset.flyto);
  });
}

// --- Gestor flotante de capas GeoJSON ---------------------------------------

const capasGeoJSON={};
let idCapaGeoJSON=0;
const ESTILO_GEOJSON_DEF={
  color:'#ffffff',
  weight:2,
  fillColor:'#1565C0',
  fillOpacity:.5,
  opacity:1,
};

function conectarGestorCapas(){
  const widget=document.getElementById('gestor-capas-flotante');
  const input=document.getElementById('input-geojson');
  const btnColapsar=document.getElementById('js-colapsar-capas');
  if(!widget||!input) return;
  if(typeof L!=='undefined'){
    L.DomEvent.disableClickPropagation(widget);
    L.DomEvent.disableScrollPropagation(widget);
  }
  if(btnColapsar){
    btnColapsar.addEventListener('click',()=>{
      const colapsado=widget.classList.toggle('colapsado');
      btnColapsar.textContent=colapsado?'▸':'▾';
      btnColapsar.setAttribute('aria-expanded', colapsado?'false':'true');
      btnColapsar.title=colapsado?'Expandir el gestor de capas':'Colapsar el gestor de capas';
    });
  }
  input.addEventListener('change',()=>{
    const archivo=input.files&&input.files[0];
    input.value='';
    if(!archivo) return;
    const reader=new FileReader();
    reader.onload=ev=>cargarCapaGeoJSON(archivo.name, ev.target.result);
    reader.onerror=()=>console.error('[monitor-hidrico] no se pudo leer el GeoJSON:', archivo.name);
    reader.readAsText(archivo);
  });
}

function cargarCapaGeoJSON(nombreArchivo, texto){
  if(!mapa||typeof L==='undefined') return;
  let geojson;
  try{
    geojson=JSON.parse(texto);
  }catch(error){
    console.error('[monitor-hidrico] GeoJSON inválido:', nombreArchivo, error);
    return;
  }
  const estilo={...ESTILO_GEOJSON_DEF};
  const capa=L.geoJSON(geojson,{
    style:()=>({...estilo}),
    pointToLayer:(feature, latlng)=>L.circleMarker(latlng,{
      radius:6,
      color:estilo.color,
      weight:estilo.weight,
      fillColor:estilo.fillColor,
      fillOpacity:estilo.fillOpacity,
      opacity:estilo.opacity,
    }),
  }).addTo(mapa);

  const id=String(++idCapaGeoJSON);
  capasGeoJSON[id]={capa,nombre:nombreArchivo,estilo};
  agregarItemCapaGeoJSON(id, nombreArchivo, estilo);
}

function agregarItemCapaGeoJSON(id, nombreArchivo, estilo){
  const lista=document.getElementById('lista-capas-geojson');
  if(!lista) return;
  const li=document.createElement('li');
  li.dataset.id=id;

  const vis=document.createElement('input');
  vis.type='checkbox';
  vis.checked=true;
  vis.title='Mostrar u ocultar la capa';
  vis.addEventListener('change',()=>{
    const item=capasGeoJSON[id];
    if(!item||!mapa) return;
    if(vis.checked) item.capa.addTo(mapa);
    else mapa.removeLayer(item.capa);
  });

  const nom=document.createElement('span');
  nom.className='gc-nombre';
  nom.textContent=nombreArchivo;
  nom.title=nombreArchivo;

  const color=document.createElement('input');
  color.type='color';
  color.value=estilo.fillColor;
  color.title='Color de relleno y borde';
  color.addEventListener('input',()=>{
    const item=capasGeoJSON[id];
    if(!item) return;
    item.estilo.fillColor=color.value;
    item.estilo.color=color.value;
    item.capa.setStyle({fillColor:color.value,color:color.value});
  });

  const opacidad=document.createElement('input');
  opacidad.type='range';
  opacidad.min='0';
  opacidad.max='1';
  opacidad.step='0.05';
  opacidad.value=String(estilo.fillOpacity);
  opacidad.title='Opacidad de relleno';
  opacidad.addEventListener('input',()=>{
    const item=capasGeoJSON[id];
    if(!item) return;
    const val=Number(opacidad.value);
    item.estilo.fillOpacity=val;
    item.capa.setStyle({fillOpacity:val});
  });

  const borrar=document.createElement('button');
  borrar.type='button';
  borrar.className='btn-eliminar-capa';
  borrar.title='Eliminar capa';
  borrar.setAttribute('aria-label', `Eliminar ${nombreArchivo}`);
  borrar.textContent='✖';
  borrar.addEventListener('click',()=>{
    const item=capasGeoJSON[id];
    if(item&&mapa) mapa.removeLayer(item.capa);
    delete capasGeoJSON[id];
    delete capasGeoJSON[nombreArchivo];
    li.remove();
  });

  li.append(vis, nom, color, opacidad, borrar);
  lista.appendChild(li);
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
       `<div class="rec-stn">${s.n}${badgeFuente(s)}</div>`+
       `<div class="rec-rv">${rv.name}</div>`+
       `<div class="rec-val">${formatoAR(mx.x)} ${unidadDe(s)}</div>`+
       `<div class="rec-when">máx el ${+d} ${MESES[+m-1]}</div>`+
       `</div>`;
  }
  document.getElementById('js-records').innerHTML=
    h||`<div class="rec-empty">Todavía no hay lecturas registradas.</div>`;
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

// --- Layout modular (maximizar / minimizar paneles) -------------------------

const CLASES_MAXIMIZACION=['maximizacion-izquierda','maximizacion-mapa','maximizacion-datos'];

function layoutRoot(){
  return document.getElementById('layout-webgis');
}
function refrescarTamanoMapa(){
  setTimeout(()=>{
    if(mapa) mapa.invalidateSize();
    if(chart) chart.resize();
    if(chartCaudal) chartCaudal.resize();
  }, 300);
}
function sincronizarBotonesLayout(){
  const root=layoutRoot();
  if(!root) return;
  const maxIzq=root.classList.contains('maximizacion-izquierda');
  const maxMapa=root.classList.contains('maximizacion-mapa');
  const maxDatos=root.classList.contains('maximizacion-datos');
  const oculto=root.classList.contains('panel-inferior-oculto');

  const izq=document.getElementById('js-max-izq');
  if(izq){
    izq.textContent=maxIzq?'Restaurar':'Maximizar';
    izq.setAttribute('aria-pressed', maxIzq?'true':'false');
    izq.title=maxIzq?'Restaurar el tablero al layout dividido':'Maximizar el tablero';
  }
  const btnMapa=document.getElementById('js-max-mapa');
  if(btnMapa){
    btnMapa.textContent=maxMapa?'Restaurar':'Maximizar';
    btnMapa.setAttribute('aria-pressed', maxMapa?'true':'false');
    btnMapa.title=maxMapa?'Restaurar el mapa al layout dividido':'Maximizar el mapa';
  }
  const btnDatos=document.getElementById('js-max-datos');
  if(btnDatos){
    btnDatos.textContent=maxDatos?'Restaurar':'Maximizar';
    btnDatos.setAttribute('aria-pressed', maxDatos?'true':'false');
    btnDatos.title=maxDatos?'Restaurar el análisis al layout dividido':'Maximizar el análisis de datos';
  }
  const min=document.getElementById('js-min-datos');
  if(min){
    min.textContent=oculto?'Mostrar':'Minimizar';
    min.setAttribute('aria-pressed', oculto?'true':'false');
    min.title=oculto?'Mostrar el análisis de datos':'Minimizar el análisis de datos';
  }
}
function toggleMaximizacion(clase){
  const root=layoutRoot();
  if(!root) return;
  const activo=root.classList.contains(clase);
  root.classList.remove(...CLASES_MAXIMIZACION);
  if(!activo) root.classList.add(clase);
  sincronizarBotonesLayout();
  refrescarTamanoMapa();
}
function togglePanelInferior(){
  const root=layoutRoot();
  if(!root) return;
  if(root.classList.contains('maximizacion-datos')){
    root.classList.remove(...CLASES_MAXIMIZACION);
    root.classList.add('panel-inferior-oculto');
  }else{
    root.classList.toggle('panel-inferior-oculto');
  }
  sincronizarBotonesLayout();
  refrescarTamanoMapa();
}
function mostrarPanelInferior(){
  const root=layoutRoot();
  if(!root) return;
  root.classList.remove('panel-inferior-oculto');
  sincronizarBotonesLayout();
  refrescarTamanoMapa();
}
function conectarLayoutPaneles(){
  const izq=document.getElementById('js-max-izq');
  if(izq) izq.addEventListener('click',()=>toggleMaximizacion('maximizacion-izquierda'));
  const btnMapa=document.getElementById('js-max-mapa');
  if(btnMapa) btnMapa.addEventListener('click',()=>toggleMaximizacion('maximizacion-mapa'));
  const btnDatos=document.getElementById('js-max-datos');
  if(btnDatos) btnDatos.addEventListener('click',()=>toggleMaximizacion('maximizacion-datos'));
  const min=document.getElementById('js-min-datos');
  if(min) min.addEventListener('click',togglePanelInferior);
  const mostrar=document.getElementById('js-mostrar-datos');
  if(mostrar) mostrar.addEventListener('click',mostrarPanelInferior);
  sincronizarBotonesLayout();
}

// --- Centro de mando operativo (Google Sheets CSV) --------------------------

const URL_DEMOGRAFIA='https://docs.google.com/spreadsheets/d/e/2PACX-1vTIVsdRwVKObLvG6GZ7IAGnVJR4pYF9wPE5y1ZWcJQARx2rQgAmUoP8Tb4ad5JBg12EEwNev4Q2WWyG/pub?output=csv';
let datosOperativos=[];

function parsearCSV(texto){
  const lineas=String(texto||'').replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
  if(lineas.length<2) return [];
  const claves=lineas[0].split(',').map(c=>c.trim());
  const filas=[];
  for(let i=1;i<lineas.length;i++){
    const partes=lineas[i].split(',');
    const obj={};
    for(let j=0;j<claves.length;j++){
      obj[claves[j]]=j===claves.length-1
        ? partes.slice(j).join(',').trim()
        : String(partes[j]??'').trim();
    }
    filas.push(obj);
  }
  return filas;
}
function numCSV(v){
  const s=String(v??'').trim().replace(/\s/g,'');
  if(!s) return 0;
  const norm=s.includes(',')
    ? s.replace(/\./g,'').replace(',', '.')
    : s.replace(/\./g,'');
  const n=Number(norm);
  return Number.isFinite(n)?n:0;
}
function fmtEnteroAR(n){
  return Math.round(Number(n)||0).toLocaleString('es-AR');
}
function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
function selOperativo(id){
  return document.getElementById(id);
}
function opcionesUnicas(filas, clave){
  return [...new Set(filas.map(r=>String(r[clave]||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}
function llenarSelect(el, valores, placeholder){
  if(!el) return;
  el.innerHTML='';
  const vacio=document.createElement('option');
  vacio.value='';
  vacio.textContent=placeholder;
  el.appendChild(vacio);
  for(const v of valores){
    const o=document.createElement('option');
    o.value=v;
    o.textContent=v;
    el.appendChild(o);
  }
}
function resetSelect(el, placeholder, deshabilitar){
  llenarSelect(el, [], placeholder);
  el.value='';
  el.disabled=!!deshabilitar;
}
function filasOperativasFiltradas(){
  const p=selOperativo('filtro-provincia')?.value||'';
  const d=selOperativo('filtro-departamento')?.value||'';
  const l=selOperativo('filtro-localidad')?.value||'';
  const b=selOperativo('filtro-barrio')?.value||'';
  return datosOperativos.filter(r=>
    (!p||r.PROVINCIA===p)&&
    (!d||r.DEPARTAMENTO===d)&&
    (!l||r.LOCALIDAD===l)&&
    (!b||r.BARRIO===b)
  );
}
function calcularKPIs(datosFiltrados){
  const filas=datosFiltrados||[];
  const sumar=clave=>filas.reduce((n,r)=>n+numCSV(r[clave]),0);
  const setTxt=(id, val)=>{
    const el=document.getElementById(id);
    if(el) el.textContent=fmtEnteroAR(val);
  };
  setTxt('kpi-poblacion', sumar('POB_TOTAL'));
  setTxt('kpi-hombres', sumar('HOMBRES'));
  setTxt('kpi-mujeres', sumar('MUJERES'));
  setTxt('kpi-pcd', sumar('PCD'));
  setTxt('kpi-evacuados', sumar('EVACUADOS'));

  const destinos=[...new Set(filas.map(r=>String(r.DESTINOS||'').trim())
    .filter(d=>d&&d.toLowerCase()!=='ninguno'))];
  const lista=document.getElementById('kpi-destinos');
  if(!lista) return;
  if(!destinos.length){
    lista.innerHTML='<li class="co-destinos-vacio">Sin centros de destino</li>';
    return;
  }
  lista.innerHTML=destinos.map(d=>`<li>${escapeHtml(d)}</li>`).join('');
}

function actualizarFiltrosCascada(){
  const selP=selOperativo('filtro-provincia');
  const selD=selOperativo('filtro-departamento');
  const selL=selOperativo('filtro-localidad');
  const selB=selOperativo('filtro-barrio');
  if(!selP||!selD||!selL||!selB) return;
  llenarSelect(selP, opcionesUnicas(datosOperativos,'PROVINCIA'), 'Todas las provincias');
  selP.disabled=false;
  resetSelect(selD, 'Todos los departamentos', true);
  resetSelect(selL, 'Todas las localidades', true);
  resetSelect(selB, 'Todos los barrios', true);
  calcularKPIs(datosOperativos);
}

function conectarFiltrosOperativos(){
  const selP=selOperativo('filtro-provincia');
  const selD=selOperativo('filtro-departamento');
  const selL=selOperativo('filtro-localidad');
  const selB=selOperativo('filtro-barrio');
  if(!selP||!selD||!selL||!selB) return;

  selP.addEventListener('change',()=>{
    if(!selP.value){
      resetSelect(selD, 'Todos los departamentos', true);
      resetSelect(selL, 'Todas las localidades', true);
      resetSelect(selB, 'Todos los barrios', true);
      calcularKPIs(datosOperativos);
      return;
    }
    const filas=datosOperativos.filter(r=>r.PROVINCIA===selP.value);
    llenarSelect(selD, opcionesUnicas(filas,'DEPARTAMENTO'), 'Todos los departamentos');
    selD.disabled=false;
    selD.value='';
    resetSelect(selL, 'Todas las localidades', true);
    resetSelect(selB, 'Todos los barrios', true);
    calcularKPIs(filas);
  });

  selD.addEventListener('change',()=>{
    if(!selD.value){
      resetSelect(selL, 'Todas las localidades', true);
      resetSelect(selB, 'Todos los barrios', true);
      calcularKPIs(filasOperativasFiltradas());
      return;
    }
    const filas=datosOperativos.filter(r=>
      r.PROVINCIA===selP.value&&r.DEPARTAMENTO===selD.value);
    llenarSelect(selL, opcionesUnicas(filas,'LOCALIDAD'), 'Todas las localidades');
    selL.disabled=false;
    selL.value='';
    resetSelect(selB, 'Todos los barrios', true);
    calcularKPIs(filas);
  });

  selL.addEventListener('change',()=>{
    if(!selL.value){
      resetSelect(selB, 'Todos los barrios', true);
      calcularKPIs(filasOperativasFiltradas());
      return;
    }
    const filas=datosOperativos.filter(r=>
      r.PROVINCIA===selP.value&&r.DEPARTAMENTO===selD.value&&r.LOCALIDAD===selL.value);
    llenarSelect(selB, opcionesUnicas(filas,'BARRIO'), 'Todos los barrios');
    selB.disabled=false;
    selB.value='';
    calcularKPIs(filas);
  });

  selB.addEventListener('change',()=>{
    calcularKPIs(filasOperativasFiltradas());
  });
}

async function cargarDatosOperativos(){
  conectarFiltrosOperativos();
  try{
    const resp=await fetch(URL_DEMOGRAFIA,{cache:'no-store'});
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const texto=await resp.text();
    datosOperativos=parsearCSV(texto);
  }catch(error){
    console.error('[monitor-hidrico] no se pudo cargar la demografía:', error);
    datosOperativos=[];
  }
  actualizarFiltrosCascada();
}

async function init(){
  // El LÉEME no depende de los datos: se conecta antes de pedir el historial
  // para que siga abriéndose aunque el fetch falle.
  conectarModal();
  conectarLayoutPaneles();
  inicializarMapa();
  conectarGestorCapas();
  conectarFiltroEspacial();
  cargarDatosOperativos();

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
  renderRivers();
  renderToggles();buildChart();buildCaudalChart();renderRecords();
  renderMarcadores();
  actualizarInicioDelRegistro();
  conectarFiltros();
}

init();
