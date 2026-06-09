/* ── Constantes ── */
const CATS = {
  gasto: ['Luz','Agua','Internet','Alarma','Alquiler local','Pago nóminas','Softwares informáticos','Proveedores','Marketing','Gestoría / Legal','Otros gastos'],
  ingreso: ['Liquidación comisiones SELAE','Ventas','Servicios','Consultoría','Inversiones','Otros ingresos']
};
const RECURRENTES = {
  gasto: [
    {nombre:'Luz',icono:'⚡'},{nombre:'Agua',icono:'💧'},{nombre:'Internet',icono:'📡'},
    {nombre:'Alarma',icono:'🔒'},{nombre:'Alquiler local',icono:'🏢'},
    {nombre:'Pago nóminas',icono:'👥'},{nombre:'Softwares informáticos',icono:'💻'}
  ],
  ingreso: [{nombre:'Liquidación comisiones SELAE',icono:'🎫'}]
};
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CHART_COLORS = ['#639922','#E24B4A','#378ADD','#EF9F27','#5DCAA5','#D85A30','#7F77DD','#D4537E','#1D9E75','#BA7517','#888780'];

/* ── Estado ── */
let movimientos = [];
let tipo = 'gasto', pdfTipo = 'ingreso';
let currentYear = new Date().getFullYear(), currentMonth = new Date().getMonth();
let chartEvolucion = null, chartComparativa = null, chartDonut = null;

/* ── API helpers ── */
async function apiGet(url) {
  const r = await fetch(url); if (r.status===401) { location.href='/login'; return null; }
  return r.json();
}
async function apiPost(url, body) {
  const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (r.status===401) { location.href='/login'; return null; }
  return {ok:r.ok, status:r.status, data: await r.json()};
}
async function apiDelete(url) {
  const r = await fetch(url,{method:'DELETE'});
  if (r.status===401) { location.href='/login'; return null; }
  return {ok:r.ok, data: await r.json()};
}

async function loadMovimientos() {
  const data = await apiGet(`/api/movimientos?year=${currentYear}`);
  if (data) movimientos = data;
}

/* ── Utilidades ── */
function fmt(n){ return '€'+Math.abs(n).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function today(){ return new Date().toISOString().slice(0,10); }
function monthOf(d){ return parseInt(d.slice(5,7))-1; }
function yearOf(d){ return parseInt(d.slice(0,4)); }

function showToast(msg,type='ok'){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast '+type+' show';
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2800);
}
function showFormMsg(id,msg,type){
  const el=document.getElementById(id);
  el.textContent=msg; el.className='form-msg '+type;
  setTimeout(()=>{if(el)el.textContent=''},3000);
}

/* ── Navegación ── */
const PAGE_TITLES={dashboard:'Dashboard',registrar:'Registrar',pdf:'Subir PDF',movimientos:'Movimientos'};
function goToPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelector(`.nav-link[data-page="${name}"]`).classList.add('active');
  document.getElementById('topbar-title').textContent=PAGE_TITLES[name];
  if(name==='dashboard') refreshDashboard();
  if(name==='movimientos'){updateFiltroMes();updateFiltroCat();renderMovimientos();}
  document.getElementById('sidebar').classList.remove('open');
}
document.querySelectorAll('.nav-link').forEach(link=>{
  link.addEventListener('click',e=>{e.preventDefault();goToPage(link.dataset.page);});
});
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); }

/* ── Año ── */
function buildYearSelect(){
  const years=new Set(movimientos.map(m=>yearOf(m.fecha)));
  const cur=new Date().getFullYear();
  for(let y=cur-2;y<=cur+1;y++) years.add(y);
  const sel=document.getElementById('year-select');
  sel.innerHTML=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}"${y===currentYear?' selected':''}>${y}</option>`).join('');
}
function changeYear(y){ currentYear=parseInt(y); loadMovimientos().then(refreshDashboard); }
function changeMonth(d){
  currentMonth+=d;
  if(currentMonth<0){currentMonth=11;currentYear--;}
  if(currentMonth>11){currentMonth=0;currentYear++;}
  document.getElementById('year-select').value=currentYear;
  refreshDashboard();
}

/* ── Dashboard ── */
async function refreshDashboard(){
  await loadMovimientos();
  document.getElementById('month-label').textContent=MESES[currentMonth]+' '+currentYear;
  const yearMovs=movimientos.filter(m=>yearOf(m.fecha)===currentYear);
  const monthMovs=movimientos.filter(m=>yearOf(m.fecha)===currentYear&&monthOf(m.fecha)===currentMonth);

  const ingY=yearMovs.filter(m=>m.tipo==='ingreso').reduce((a,m)=>a+m.monto,0);
  const gasY=yearMovs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.monto,0);
  const balY=ingY-gasY;

  document.getElementById('kpi-ing-year').textContent=fmt(ingY);
  document.getElementById('kpi-gas-year').textContent=fmt(gasY);
  const bY=document.getElementById('kpi-bal-year');
  bY.textContent=(balY<0?'-':'')+fmt(balY);
  bY.style.color=balY>=0?'var(--ing)':'var(--gas)';
  document.getElementById('kpi-ing-year-count').textContent=yearMovs.filter(m=>m.tipo==='ingreso').length+' movimientos';
  document.getElementById('kpi-gas-year-count').textContent=yearMovs.filter(m=>m.tipo==='gasto').length+' movimientos';
  const pct=ingY>0?((balY/ingY)*100).toFixed(1):'—';
  document.getElementById('kpi-bal-year-pct').textContent=ingY>0?'Margen: '+pct+'%':'—';

  const ingM=monthMovs.filter(m=>m.tipo==='ingreso').reduce((a,m)=>a+m.monto,0);
  const gasM=monthMovs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.monto,0);
  const balM=ingM-gasM;
  document.getElementById('kpi-ing-month').textContent=fmt(ingM);
  document.getElementById('kpi-gas-month').textContent=fmt(gasM);
  const bM=document.getElementById('kpi-bal-month');
  bM.textContent=(balM<0?'-':'')+fmt(balM);
  bM.style.color=balM>=0?'var(--ing)':'var(--gas)';

  buildYearSelect();
  buildChartEvolucion(yearMovs);
  buildChartComparativa(yearMovs);
  buildChartDonut(yearMovs);
  buildRecentList();
}

function buildChartEvolucion(ym){
  const labels=MESES.map(m=>m.slice(0,3));
  const ingD=Array(12).fill(0),gasD=Array(12).fill(0),balD=Array(12).fill(0);
  ym.forEach(m=>{const mo=monthOf(m.fecha);if(m.tipo==='ingreso')ingD[mo]+=m.monto;else gasD[mo]+=m.monto;});
  for(let i=0;i<12;i++) balD[i]=ingD[i]-gasD[i];
  const ctx=document.getElementById('chart-evolucion');
  if(chartEvolucion) chartEvolucion.destroy();
  chartEvolucion=new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Ingresos',data:ingD,backgroundColor:'#97C459',borderRadius:4,stack:'a'},
    {label:'Gastos',data:gasD,backgroundColor:'#F09595',borderRadius:4,stack:'b'},
    {label:'Balance',data:balD,type:'line',borderColor:'#378ADD',backgroundColor:'rgba(55,138,221,.08)',tension:.35,pointRadius:3,pointBackgroundColor:'#378ADD',fill:true,borderWidth:2,yAxisID:'y'}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y)}}},scales:{y:{ticks:{callback:v=>'€'+v.toLocaleString('es-ES')},grid:{color:'rgba(0,0,0,.05)'}},x:{grid:{display:false},ticks:{autoSkip:false}}}}});
}
function buildChartComparativa(ym){
  const ingD=Array(12).fill(0),gasD=Array(12).fill(0);
  ym.forEach(m=>{const mo=monthOf(m.fecha);if(m.tipo==='ingreso')ingD[mo]+=m.monto;else gasD[mo]+=m.monto;});
  const ctx=document.getElementById('chart-comparativa');
  if(chartComparativa) chartComparativa.destroy();
  chartComparativa=new Chart(ctx,{type:'bar',data:{labels:MESES.map(m=>m.slice(0,3)),datasets:[{label:'Ingresos',data:ingD,backgroundColor:'#97C459',borderRadius:3},{label:'Gastos',data:gasD,backgroundColor:'#F09595',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y)}}},scales:{y:{ticks:{callback:v=>'€'+(v/1000).toFixed(0)+'k',font:{size:10}},grid:{color:'rgba(0,0,0,.05)'}},x:{grid:{display:false},ticks:{font:{size:10},autoSkip:false}}}}});
}
function buildChartDonut(ym){
  const catMap={};
  ym.filter(m=>m.tipo==='gasto').forEach(m=>{catMap[m.cat]=(catMap[m.cat]||0)+m.monto;});
  const sorted=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const labels=sorted.map(e=>e[0]),data=sorted.map(e=>e[1]),colors=labels.map((_,i)=>CHART_COLORS[i%CHART_COLORS.length]);
  const ctx=document.getElementById('chart-donut');
  if(chartDonut) chartDonut.destroy();
  if(!data.length){
    document.getElementById('donut-legend').innerHTML='<span style="color:var(--text-3)">Sin gastos este año</span>';
    chartDonut=new Chart(ctx,{type:'doughnut',data:{labels:['Sin datos'],datasets:[{data:[1],backgroundColor:['#E8E6E1']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},cutout:'70%'}});
    return;
  }
  chartDonut=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:1,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.label+': '+fmt(c.parsed)}}},cutout:'68%'}});
  const total=data.reduce((a,b)=>a+b,0);
  document.getElementById('donut-legend').innerHTML=sorted.slice(0,6).map((e,i)=>`<span><span style="width:9px;height:9px;border-radius:2px;background:${colors[i]};display:inline-block;margin-right:4px"></span>${e[0]} (${((e[1]/total)*100).toFixed(0)}%)</span>`).join('');
}
function buildRecentList(){
  const recent=[...movimientos].sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,6);
  const el=document.getElementById('recent-list');
  el.innerHTML=recent.length?recent.map(txnHTML).join(''):emptyState('Aún no hay movimientos. <a href="#" onclick="goToPage(\'registrar\')">Registra el primero</a>.');
}

/* ── Registrar ── */
function setTipo(t){
  tipo=t;
  document.getElementById('btn-ing').className='type-btn '+(t==='ingreso'?'active ing':'');
  document.getElementById('btn-gas').className='type-btn '+(t==='gasto'?'active gas':'');
  document.getElementById('f-cat').innerHTML=CATS[t].map(c=>`<option>${c}</option>`).join('');
  renderRecurrentes();
}
function renderRecurrentes(){
  const recs=RECURRENTES[tipo];
  document.getElementById('rec-label').textContent=tipo==='gasto'?'Accesos rápidos — gastos recurrentes':'Accesos rápidos — ingresos';
  document.getElementById('rec-grid').innerHTML=recs.map(r=>`<button class="rec-btn" onclick="fillRecurrente('${r.nombre}')">${r.icono} ${r.nombre}</button>`).join('');
}
function fillRecurrente(nombre){
  document.getElementById('f-desc').value=nombre;
  document.getElementById('f-cat').value=nombre;
  if(!document.getElementById('f-fecha').value) document.getElementById('f-fecha').value=today();
  document.querySelectorAll('.rec-btn').forEach(b=>b.classList.remove('sel'));
  event.currentTarget.classList.add('sel');
  document.getElementById('f-monto').focus();
}

async function saveMovimiento(data){
  const d=data||{
    tipo, desc:document.getElementById('f-desc').value.trim(),
    monto:parseFloat(document.getElementById('f-monto').value),
    fecha:document.getElementById('f-fecha').value,
    cat:document.getElementById('f-cat').value,
    ref:document.getElementById('f-ref').value.trim(),
    nota:document.getElementById('f-nota').value.trim(),
    origen:'manual'
  };
  if(!d.desc||!d.monto||isNaN(d.monto)||!d.fecha){showFormMsg('f-msg','Completa descripción, importe y fecha.','err');return;}
  const res=await apiPost('/api/movimientos',d);
  if(!res) return;
  if(res.ok){showToast('Movimiento guardado correctamente.','ok');clearForm();}
  else showFormMsg('f-msg',res.data.error||'Error al guardar.','err');
}
function clearForm(){
  ['f-desc','f-monto','f-ref','f-nota'].forEach(id=>document.getElementById(id).value='');
  document.querySelectorAll('.rec-btn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('f-msg').textContent='';
}

/* ── Movimientos ── */
function txnHTML(m){
  const isIng=m.tipo==='ingreso';
  const pdfBadge=m.origen==='pdf'?'<span class="badge pdf">PDF</span>':'';
  return `<div class="txn">
    <div class="txn-icon ${isIng?'ing':'gas'}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${isIng?'<polyline points="18 15 12 9 6 15"/>':'<polyline points="6 9 12 15 18 9"/>'}</svg>
    </div>
    <div class="txn-info">
      <div class="txn-desc">${m.desc}</div>
      <div class="txn-meta">${m.fecha}<span class="badge ${isIng?'ing':'gas'}">${m.cat}</span>${pdfBadge}${m.ref?'<span>'+m.ref+'</span>':''}</div>
    </div>
    <div class="txn-right">
      <div class="txn-amount ${isIng?'ing':'gas'}">${isIng?'+':'-'}${fmt(m.monto)}</div>
      <button class="txn-del" onclick="deleteMov(${m.id})" aria-label="Eliminar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>
  </div>`;
}
function emptyState(msg){return`<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg><p>${msg}</p></div>`;}

async function deleteMov(id){
  const res=await apiDelete(`/api/movimientos/${id}`);
  if(res&&res.ok){
    movimientos=movimientos.filter(m=>m.id!==id);
    renderMovimientos(); buildRecentList(); refreshDashboard();
  }
}

function updateFiltroMes(){
  const meses=[...new Set(movimientos.map(m=>m.fecha.slice(0,7)))].sort().reverse();
  const sel=document.getElementById('fil-mes'),cur=sel.value;
  sel.innerHTML='<option value="">Todos los meses</option>'+meses.map(m=>{const[y,mo]=m.split('-');const n=new Date(y,mo-1).toLocaleDateString('es-ES',{month:'long',year:'numeric'});return`<option value="${m}"${m===cur?' selected':''}>${n}</option>`;}).join('');
}
function updateFiltroCat(){
  const cats=[...new Set(movimientos.map(m=>m.cat))].sort();
  const sel=document.getElementById('fil-cat'),cur=sel.value;
  sel.innerHTML='<option value="">Todas las categorías</option>'+cats.map(c=>`<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
}
function renderMovimientos(){
  const ft=document.getElementById('fil-tipo').value;
  const fm=document.getElementById('fil-mes').value;
  const fc=document.getElementById('fil-cat').value;
  const fb=document.getElementById('fil-busca').value.toLowerCase();
  let list=movimientos.filter(m=>{
    if(ft&&m.tipo!==ft)return false;
    if(fm&&!m.fecha.startsWith(fm))return false;
    if(fc&&m.cat!==fc)return false;
    if(fb&&!m.desc.toLowerCase().includes(fb)&&!m.cat.toLowerCase().includes(fb))return false;
    return true;
  }).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const el=document.getElementById('txn-list-full');
  el.innerHTML=list.length?list.map(txnHTML).join(''):emptyState('Sin movimientos que coincidan con los filtros.');
  const tI=list.filter(m=>m.tipo==='ingreso').reduce((a,m)=>a+m.monto,0);
  const tG=list.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.monto,0);
  document.getElementById('filter-summary').textContent=list.length+' movimiento'+(list.length!==1?'s':'')+' · Ingresos '+fmt(tI)+' · Gastos '+fmt(tG);
}

/* ── PDF ── */
function setPdfTipo(t){
  pdfTipo=t;
  document.getElementById('pdf-btn-ing').className='type-btn '+(t==='ingreso'?'active ing':'');
  document.getElementById('pdf-btn-gas').className='type-btn '+(t==='gasto'?'active gas':'');
  document.getElementById('pdf-cat').innerHTML=CATS[t].map(c=>`<option>${c}</option>`).join('');
  if(t==='ingreso') document.getElementById('pdf-cat').value='Liquidación comisiones SELAE';
  const hint=document.getElementById('pdf-multi-hint');
  if(hint) hint.style.display=t==='ingreso'?'block':'none';
}
function handleDrop(e){
  e.preventDefault();document.getElementById('drop-zone').classList.remove('drag');
  const files=[...e.dataTransfer.files].filter(f=>f.type==='application/pdf');
  if(!files.length){setStatus('Solo se admiten archivos PDF.','err');return;}
  handlePdfFiles(files);
}
function handlePdfFile(input){
  const files=[...input.files].filter(f=>f.type==='application/pdf');
  if(files.length) handlePdfFiles(files);
}
async function handlePdfFiles(files){
  const nombres=files.map(f=>f.name).join(' + ');
  setStatus(`<div class="spinner"></div> Analizando <strong>${nombres}</strong> con IA…`,'info');
  document.getElementById('pdf-result').style.display='none';
  try{
    const pdfs=await Promise.all(files.map(f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(f);})));
    await extractFromPdf(pdfs,nombres);
  }catch(err){setStatus('Error leyendo los archivos: '+err.message,'err');}
}
async function extractFromPdf(pdfs,filename){
  const tipo_doc=pdfTipo==='ingreso'?'selae':'factura';
  try{
    const resp=await fetch('/analizar-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo_doc,pdfs:Array.isArray(pdfs)?pdfs:[pdfs]})});
    if(resp.status===401){location.href='/login';return;}
    const data=await resp.json();
    if(!resp.ok) throw new Error(data.error||'Error del servidor');
    const raw=data.resultado||'';
    const clean=raw.replace(/```json|```/g,'').trim();
    const parsed=JSON.parse(clean);
    showPdfResult(parsed,filename);
  }catch(err){setStatus('No se pudo analizar el PDF.<br><small style="opacity:.7">'+err.message+'</small>','err');}
}
function showPdfResult(data,filename){
  document.getElementById('pdf-status').innerHTML='';
  document.getElementById('pdf-result').style.display='block';
  document.getElementById('pdf-desc').value=data.concepto||'';
  document.getElementById('pdf-monto').value=data.importe||'';
  document.getElementById('pdf-fecha').value=data.fecha||today();
  document.getElementById('pdf-ref').value=data.referencia||'';
  const catSel=document.getElementById('pdf-cat');
  catSel.innerHTML=CATS[pdfTipo].map(c=>`<option>${c}</option>`).join('');
  if(pdfTipo==='ingreso') catSel.value='Liquidación comisiones SELAE';
  const fmtE=v=>v!=null?'€'+parseFloat(v).toLocaleString('es-ES',{minimumFractionDigits:2}):null;
  const rows=[
    data.fecha&&['Fecha',data.fecha],
    data.concepto&&['Concepto',data.concepto],
    data.importe&&['Importe a cobrar',fmtE(data.importe)],
    data.comision_bruta&&['Comisión bruta',fmtE(data.comision_bruta)],
    data.iva&&['IVA (21%)',fmtE(data.iva)],
    data.referencia&&['Referencia',data.referencia],
    data.punto_venta&&['Punto de venta',data.punto_venta],
    data.total_ventas&&['Total ventas',fmtE(data.total_ventas)],
    data.neto_liquidacion&&['Neto liquidación',fmtE(data.neto_liquidacion)],
    data.emisor&&['Emisor',data.emisor],
  ].filter(Boolean);
  document.getElementById('ai-preview').innerHTML=`<div class="ai-preview-header"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Extraído de <strong>${filename}</strong></div>${rows.map(([l,v])=>`<div class="ai-row"><span class="ai-row-label">${l}</span><span class="ai-row-val">${v}</span></div>`).join('')}`;
}
function setStatus(html,type){ document.getElementById('pdf-status').innerHTML=`<div class="status-msg ${type}">${html}</div>`; }
function cancelPdf(){ document.getElementById('pdf-result').style.display='none';document.getElementById('pdf-status').innerHTML='';document.getElementById('pdf-input').value=''; }

async function savePdf(){
  const desc=document.getElementById('pdf-desc').value.trim();
  const monto=parseFloat(document.getElementById('pdf-monto').value);
  const fecha=document.getElementById('pdf-fecha').value;
  const cat=document.getElementById('pdf-cat').value;
  const ref=document.getElementById('pdf-ref').value.trim();
  if(!desc||!monto||isNaN(monto)||!fecha){showFormMsg('pdf-msg','Completa al menos descripción, importe y fecha.','err');return;}
  const res=await apiPost('/api/movimientos',{tipo:pdfTipo,desc,monto,fecha,cat,ref,nota:'',origen:'pdf'});
  if(!res) return;
  if(res.ok){showToast('Movimiento importado desde PDF.','ok');setTimeout(cancelPdf,800);}
  else showFormMsg('pdf-msg',res.data.error||'Error al guardar.','err');
}

/* ── Exportar CSV ── */
function exportarCSV(){
  const year=document.getElementById('year-select').value;
  window.location.href=`/api/movimientos/export?year=${year}`;
  showToast('Descargando CSV…','ok');
}

/* ── Logout ── */
async function logout(){
  await fetch('/api/auth/logout',{method:'POST'});
  location.href='/login';
}

/* ── Init ── */
(async function init(){
  setTipo('gasto');
  setPdfTipo('ingreso');
  document.getElementById('f-fecha').value=today();
  await refreshDashboard();
  // mostrar username
  const me=await apiGet('/api/auth/me');
  if(me&&me.autenticado){
    const el=document.getElementById('user-info');
    if(el) el.textContent=me.username;
  }
})();
