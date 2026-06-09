/* ─────────────────────────────────────────────
   DATOS Y CONSTANTES
───────────────────────────────────────────── */
const CATS = {
  gasto: [
    'Luz', 'Agua', 'Internet', 'Alarma', 'Alquiler local',
    'Pago nóminas', 'Softwares informáticos',
    'Proveedores', 'Marketing', 'Gestoría / Legal', 'Otros gastos'
  ],
  ingreso: [
    'Liquidación comisiones SELAE', 'Ventas', 'Servicios',
    'Consultoría', 'Inversiones', 'Otros ingresos'
  ]
};

const RECURRENTES = {
  gasto: [
    { nombre: 'Luz',                 icono: '⚡' },
    { nombre: 'Agua',                icono: '💧' },
    { nombre: 'Internet',            icono: '📡' },
    { nombre: 'Alarma',              icono: '🔒' },
    { nombre: 'Alquiler local',      icono: '🏢' },
    { nombre: 'Pago nóminas',        icono: '👥' },
    { nombre: 'Softwares informáticos', icono: '💻' }
  ],
  ingreso: [
    { nombre: 'Liquidación comisiones SELAE', icono: '🎫' }
  ]
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const CHART_COLORS = [
  '#639922','#E24B4A','#378ADD','#EF9F27','#5DCAA5',
  '#D85A30','#7F77DD','#D4537E','#1D9E75','#BA7517','#888780'
];

/* ─────────────────────────────────────────────
   ESTADO
───────────────────────────────────────────── */
let movimientos = [];
let tipo        = 'gasto';
let pdfTipo     = 'ingreso';
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();   // 0-11

let chartEvolucion   = null;
let chartComparativa = null;
let chartDonut       = null;

/* ─────────────────────────────────────────────
   PERSISTENCIA
───────────────────────────────────────────── */
function load() {
  try { movimientos = JSON.parse(localStorage.getItem('fin_soc_v3') || '[]'); } catch(e) { movimientos = []; }
}
function save() {
  try { localStorage.setItem('fin_soc_v3', JSON.stringify(movimientos)); } catch(e) {}
}

/* ─────────────────────────────────────────────
   UTILIDADES
───────────────────────────────────────────── */
function fmt(n) {
  return '€' + Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSigned(n) {
  return (n < 0 ? '-' : '+') + fmt(n);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(date) {   // "2025-03"
  return date.slice(0, 7);
}
function yearOf(date) {
  return parseInt(date.slice(0, 4));
}
function monthOf(date) {    // 0-11
  return parseInt(date.slice(5, 7)) - 1;
}

function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function showFormMsg(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'form-msg ' + type;
  setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}

/* ─────────────────────────────────────────────
   NAVEGACIÓN
───────────────────────────────────────────── */
const PAGE_TITLES = {
  dashboard:   'Dashboard',
  registrar:   'Registrar',
  pdf:         'Subir PDF',
  movimientos: 'Movimientos'
};

function goToPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector(`.nav-link[data-page="${name}"]`).classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[name];
  if (name === 'dashboard') refreshDashboard();
  if (name === 'movimientos') { updateFiltroMes(); updateFiltroCat(); renderMovimientos(); }
  // close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    goToPage(link.dataset.page);
  });
});

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ─────────────────────────────────────────────
   SELECTOR DE AÑO
───────────────────────────────────────────── */
function buildYearSelect() {
  const years = new Set(movimientos.map(m => yearOf(m.fecha)));
  const cur = new Date().getFullYear();
  for (let y = cur - 2; y <= cur + 1; y++) years.add(y);
  const sorted = [...years].sort((a, b) => b - a);
  const sel = document.getElementById('year-select');
  sel.innerHTML = sorted.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');
}

function changeYear(y) {
  currentYear = parseInt(y);
  refreshDashboard();
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0;  currentYear++; }
  document.getElementById('year-select').value = currentYear;
  refreshDashboard();
}

/* ─────────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────────── */
function refreshDashboard() {
  document.getElementById('month-label').textContent = MESES[currentMonth] + ' ' + currentYear;

  const yearMovs  = movimientos.filter(m => yearOf(m.fecha) === currentYear);
  const monthMovs = movimientos.filter(m => yearOf(m.fecha) === currentYear && monthOf(m.fecha) === currentMonth);

  // KPI anuales
  const ingYear = yearMovs.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const gasYear = yearMovs.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.monto, 0);
  const balYear = ingYear - gasYear;

  document.getElementById('kpi-ing-year').textContent = fmt(ingYear);
  document.getElementById('kpi-gas-year').textContent = fmt(gasYear);
  document.getElementById('kpi-bal-year').textContent = (balYear < 0 ? '-' : '') + fmt(balYear);
  document.getElementById('kpi-bal-year').style.color = balYear >= 0 ? 'var(--ing)' : 'var(--gas)';

  const ingCount = yearMovs.filter(m => m.tipo === 'ingreso').length;
  const gasCount = yearMovs.filter(m => m.tipo === 'gasto').length;
  document.getElementById('kpi-ing-year-count').textContent = ingCount + ' movimiento' + (ingCount !== 1 ? 's' : '');
  document.getElementById('kpi-gas-year-count').textContent = gasCount + ' movimiento' + (gasCount !== 1 ? 's' : '');

  const pct = ingYear > 0 ? ((balYear / ingYear) * 100).toFixed(1) : '—';
  document.getElementById('kpi-bal-year-pct').textContent = ingYear > 0 ? 'Margen: ' + pct + '%' : '—';

  // KPI mensuales
  const ingMonth = monthMovs.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const gasMonth = monthMovs.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.monto, 0);
  const balMonth = ingMonth - gasMonth;

  document.getElementById('kpi-ing-month').textContent = fmt(ingMonth);
  document.getElementById('kpi-gas-month').textContent = fmt(gasMonth);
  document.getElementById('kpi-bal-month').textContent = (balMonth < 0 ? '-' : '') + fmt(balMonth);
  document.getElementById('kpi-bal-month').style.color = balMonth >= 0 ? 'var(--ing)' : 'var(--gas)';

  buildYearSelect();
  buildChartEvolucion(yearMovs);
  buildChartComparativa(yearMovs);
  buildChartDonut(yearMovs);
  buildRecentList();
}

/* ─── Gráfica evolución ─── */
function buildChartEvolucion(yearMovs) {
  const labels   = MESES.map(m => m.slice(0, 3));
  const ingData  = Array(12).fill(0);
  const gasData  = Array(12).fill(0);
  const balData  = Array(12).fill(0);

  yearMovs.forEach(m => {
    const mo = monthOf(m.fecha);
    if (m.tipo === 'ingreso') ingData[mo] += m.monto;
    else                      gasData[mo] += m.monto;
  });
  for (let i = 0; i < 12; i++) balData[i] = ingData[i] - gasData[i];

  const ctx = document.getElementById('chart-evolucion');
  if (chartEvolucion) chartEvolucion.destroy();
  chartEvolucion = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ingresos', data: ingData, backgroundColor: '#97C459', borderRadius: 4, stack: 'a' },
        { label: 'Gastos',   data: gasData, backgroundColor: '#F09595', borderRadius: 4, stack: 'b' },
        {
          label: 'Balance', data: balData,
          type: 'line',
          borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,.08)',
          tension: .35, pointRadius: 3, pointBackgroundColor: '#378ADD',
          fill: true, borderWidth: 2, yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmt(ctx.parsed.y) }
      }},
      scales: {
        y: { ticks: { callback: v => '€' + v.toLocaleString('es-ES') }, grid: { color: 'rgba(0,0,0,.05)' } },
        x: { grid: { display: false }, ticks: { autoSkip: false } }
      }
    }
  });
}

/* ─── Gráfica comparativa barras agrupadas ─── */
function buildChartComparativa(yearMovs) {
  const ingData = Array(12).fill(0);
  const gasData = Array(12).fill(0);
  yearMovs.forEach(m => {
    const mo = monthOf(m.fecha);
    if (m.tipo === 'ingreso') ingData[mo] += m.monto;
    else                      gasData[mo] += m.monto;
  });

  const ctx = document.getElementById('chart-comparativa');
  if (chartComparativa) chartComparativa.destroy();
  chartComparativa = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MESES.map(m => m.slice(0, 3)),
      datasets: [
        { label: 'Ingresos', data: ingData, backgroundColor: '#97C459', borderRadius: 3 },
        { label: 'Gastos',   data: gasData, backgroundColor: '#F09595', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmt(ctx.parsed.y) }
      }},
      scales: {
        y: { ticks: { callback: v => '€' + (v/1000).toFixed(0) + 'k', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,.05)' } },
        x: { grid: { display: false }, ticks: { font: { size: 10 }, autoSkip: false } }
      }
    }
  });
}

/* ─── Donut por categoría ─── */
function buildChartDonut(yearMovs) {
  const catMap = {};
  yearMovs.filter(m => m.tipo === 'gasto').forEach(m => {
    catMap[m.cat] = (catMap[m.cat] || 0) + m.monto;
  });
  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const data   = sorted.map(e => e[1]);
  const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  const ctx = document.getElementById('chart-donut');
  if (chartDonut) chartDonut.destroy();

  if (!data.length) {
    document.getElementById('donut-legend').innerHTML = '<span style="color:var(--text-3)">Sin gastos este año</span>';
    chartDonut = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#E8E6E1'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '70%' }
    });
    return;
  }

  chartDonut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmt(ctx.parsed) }
      }},
      cutout: '68%'
    }
  });

  const total = data.reduce((a, b) => a + b, 0);
  document.getElementById('donut-legend').innerHTML = sorted.slice(0, 6).map((e, i) =>
    `<span><span style="width:9px;height:9px;border-radius:2px;background:${colors[i]};display:inline-block;margin-right:4px"></span>${e[0]} (${((e[1]/total)*100).toFixed(0)}%)</span>`
  ).join('');
}

/* ─── Últimos movimientos ─── */
function buildRecentList() {
  const recent = [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
  const el = document.getElementById('recent-list');
  if (!recent.length) {
    el.innerHTML = emptyState('Aún no hay movimientos. <a href="#" onclick="goToPage(\'registrar\')">Registra el primero</a>.');
    return;
  }
  el.innerHTML = recent.map(txnHTML).join('');
}

/* ─────────────────────────────────────────────
   REGISTRAR
───────────────────────────────────────────── */
function setTipo(t) {
  tipo = t;
  document.getElementById('btn-ing').className = 'type-btn ' + (t === 'ingreso' ? 'active ing' : '');
  document.getElementById('btn-gas').className = 'type-btn ' + (t === 'gasto'   ? 'active gas' : '');

  const catSel = document.getElementById('f-cat');
  catSel.innerHTML = CATS[t].map(c => `<option>${c}</option>`).join('');

  renderRecurrentes();
}

function renderRecurrentes() {
  const recs = RECURRENTES[tipo];
  document.getElementById('rec-label').textContent =
    tipo === 'gasto' ? 'Accesos rápidos — gastos recurrentes' : 'Accesos rápidos — ingresos';
  document.getElementById('rec-grid').innerHTML = recs.map(r =>
    `<button class="rec-btn" onclick="fillRecurrente('${r.nombre}')">${r.icono} ${r.nombre}</button>`
  ).join('');
}

function fillRecurrente(nombre) {
  document.getElementById('f-desc').value = nombre;
  document.getElementById('f-cat').value  = nombre;
  if (!document.getElementById('f-fecha').value) document.getElementById('f-fecha').value = today();
  document.querySelectorAll('.rec-btn').forEach(b => b.classList.remove('sel'));
  event.currentTarget.classList.add('sel');
  document.getElementById('f-monto').focus();
}

function saveMovimiento(data) {
  const d = data || {
    tipo,
    desc:  document.getElementById('f-desc').value.trim(),
    monto: parseFloat(document.getElementById('f-monto').value),
    fecha: document.getElementById('f-fecha').value,
    cat:   document.getElementById('f-cat').value,
    ref:   document.getElementById('f-ref').value.trim(),
    nota:  document.getElementById('f-nota').value.trim(),
    origen: 'manual'
  };

  if (!d.desc || !d.monto || isNaN(d.monto) || !d.fecha) {
    showFormMsg('f-msg', 'Completa descripción, importe y fecha.', 'err');
    return;
  }

  movimientos.push({ id: Date.now(), ...d });
  save();
  buildYearSelect();
  showToast('Movimiento guardado correctamente.', 'ok');
  clearForm();
}

function clearForm() {
  ['f-desc','f-monto','f-ref','f-nota'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.rec-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('f-msg').textContent = '';
}

/* ─────────────────────────────────────────────
   PDF
───────────────────────────────────────────── */
function setPdfTipo(t) {
  pdfTipo = t;
  document.getElementById('pdf-btn-ing').className = 'type-btn ' + (t === 'ingreso' ? 'active ing' : '');
  document.getElementById('pdf-btn-gas').className = 'type-btn ' + (t === 'gasto'   ? 'active gas' : '');
  const catSel = document.getElementById('pdf-cat');
  catSel.innerHTML = CATS[t].map(c => `<option>${c}</option>`).join('');
  if (t === 'ingreso') catSel.value = 'Liquidación comisiones SELAE';
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') handlePdfFile(f);
  else setStatus('Solo se admiten archivos PDF.', 'err');
}

function handlePdfFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf') { setStatus('Solo se admiten archivos PDF.', 'err'); return; }
  setStatus(`<div class="spinner"></div> Analizando <strong>${file.name}</strong> con IA…`, 'info');
  document.getElementById('pdf-result').style.display = 'none';

  const reader = new FileReader();
  reader.onload = async e => {
    const b64 = e.target.result.split(',')[1];
    await extractFromPdf(b64, file.name);
  };
  reader.readAsDataURL(file);
}

async function extractFromPdf(b64, filename) {
  const systemPrompt = pdfTipo === 'gasto'
    ? 'Eres un asistente contable experto. El usuario sube una factura o recibo en PDF. Extrae con precisión: fecha (formato YYYY-MM-DD), concepto o descripción principal del servicio o producto, importe total a pagar incluyendo IVA (devuelve solo el número, sin símbolo de moneda), número de factura o referencia si existe, nombre del emisor/proveedor. Si algún campo no está disponible usa null. Responde SOLO con JSON válido, sin texto adicional, sin bloques de código: {"fecha":"...","concepto":"...","importe":0.00,"referencia":"...","emisor":"..."}'
    : 'Eres un asistente contable experto. El usuario sube un documento de liquidación de SELAE u otro comprobante de ingreso en PDF. Extrae con precisión: fecha de la liquidación (formato YYYY-MM-DD), descripción del ingreso o concepto, importe total a cobrar (devuelve solo el número, sin símbolo de moneda), número de referencia o liquidación si existe. Si algún campo no está disponible usa null. Responde SOLO con JSON válido, sin texto adicional: {"fecha":"...","concepto":"...","importe":0.00,"referencia":"..."}';

  try {
    const resp = await fetch('/analizar-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        pdf_b64: b64
      })
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error del servidor local');

    const raw   = data.resultado || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    showPdfResult(parsed, filename);

  } catch (err) {
    setStatus('No se pudo analizar el PDF. Introduce los datos manualmente.<br><small style="opacity:.7">' + err.message + '</small>', 'err');
  }
}

function showPdfResult(data, filename) {
  document.getElementById('pdf-status').innerHTML = '';
  document.getElementById('pdf-result').style.display = 'block';

  document.getElementById('pdf-desc').value  = data.concepto  || '';
  document.getElementById('pdf-monto').value = data.importe   || '';
  document.getElementById('pdf-fecha').value = data.fecha     || today();
  document.getElementById('pdf-ref').value   = data.referencia || '';

  const catSel = document.getElementById('pdf-cat');
  catSel.innerHTML = CATS[pdfTipo].map(c => `<option>${c}</option>`).join('');
  if (pdfTipo === 'ingreso') catSel.value = 'Liquidación comisiones SELAE';

  const rows = [
    data.fecha     && ['Fecha',      data.fecha],
    data.concepto  && ['Concepto',   data.concepto],
    data.importe   && ['Importe',    '€' + parseFloat(data.importe).toLocaleString('es-ES', { minimumFractionDigits: 2 })],
    data.referencia && ['Referencia', data.referencia],
    data.emisor    && ['Emisor',     data.emisor],
  ].filter(Boolean);

  document.getElementById('ai-preview').innerHTML = `
    <div class="ai-preview-header">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      Extraído de <strong>${filename}</strong>
    </div>
    ${rows.map(([l, v]) => `<div class="ai-row"><span class="ai-row-label">${l}</span><span class="ai-row-val">${v}</span></div>`).join('')}
  `;
}

function setStatus(html, type) {
  document.getElementById('pdf-status').innerHTML = `<div class="status-msg ${type}">${html}</div>`;
}

function cancelPdf() {
  document.getElementById('pdf-result').style.display = 'none';
  document.getElementById('pdf-status').innerHTML = '';
  document.getElementById('pdf-input').value = '';
}

function savePdf() {
  const desc  = document.getElementById('pdf-desc').value.trim();
  const monto = parseFloat(document.getElementById('pdf-monto').value);
  const fecha = document.getElementById('pdf-fecha').value;
  const cat   = document.getElementById('pdf-cat').value;
  const ref   = document.getElementById('pdf-ref').value.trim();

  if (!desc || !monto || isNaN(monto) || !fecha) {
    showFormMsg('pdf-msg', 'Completa al menos descripción, importe y fecha.', 'err');
    return;
  }

  movimientos.push({ id: Date.now(), tipo: pdfTipo, desc, monto, fecha, cat, ref, nota: '', origen: 'pdf' });
  save();
  buildYearSelect();
  showToast('Movimiento importado desde PDF.', 'ok');
  setTimeout(cancelPdf, 800);
}

/* ─────────────────────────────────────────────
   MOVIMIENTOS
───────────────────────────────────────────── */
function txnHTML(m) {
  const isIng = m.tipo === 'ingreso';
  const pdfBadge = m.origen === 'pdf' ? '<span class="badge pdf">PDF</span>' : '';
  return `
    <div class="txn">
      <div class="txn-icon ${isIng ? 'ing' : 'gas'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          ${isIng ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>'}
        </svg>
      </div>
      <div class="txn-info">
        <div class="txn-desc">${m.desc}</div>
        <div class="txn-meta">
          ${m.fecha}
          <span class="badge ${isIng ? 'ing' : 'gas'}">${m.cat}</span>
          ${pdfBadge}
          ${m.ref ? '<span>' + m.ref + '</span>' : ''}
        </div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${isIng ? 'ing' : 'gas'}">${isIng ? '+' : '-'}${fmt(m.monto)}</div>
        <button class="txn-del" onclick="deleteMov(${m.id})" aria-label="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`;
}

function emptyState(msg) {
  return `<div class="empty-state">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
    <p>${msg}</p>
  </div>`;
}

function deleteMov(id) {
  movimientos = movimientos.filter(m => m.id !== id);
  save();
  renderMovimientos();
  buildRecentList();
  refreshDashboard();
}

function updateFiltroMes() {
  const meses = [...new Set(movimientos.map(m => m.fecha.slice(0, 7)))].sort().reverse();
  const sel = document.getElementById('fil-mes');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos los meses</option>' + meses.map(m => {
    const [y, mo] = m.split('-');
    const n = new Date(y, mo - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === cur ? 'selected' : ''}>${n}</option>`;
  }).join('');
}

function updateFiltroCat() {
  const cats = [...new Set(movimientos.map(m => m.cat))].sort();
  const sel = document.getElementById('fil-cat');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c =>
    `<option value="${c}" ${c === cur ? 'selected' : ''}>${c}</option>`
  ).join('');
}

function renderMovimientos() {
  const ft  = document.getElementById('fil-tipo').value;
  const fm  = document.getElementById('fil-mes').value;
  const fc  = document.getElementById('fil-cat').value;
  const fb  = document.getElementById('fil-busca').value.toLowerCase();

  let list = movimientos.filter(m => {
    if (ft && m.tipo !== ft)                                   return false;
    if (fm && !m.fecha.startsWith(fm))                         return false;
    if (fc && m.cat !== fc)                                    return false;
    if (fb && !m.desc.toLowerCase().includes(fb) &&
              !m.cat.toLowerCase().includes(fb))               return false;
    return true;
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));

  const el = document.getElementById('txn-list-full');
  if (!list.length) {
    el.innerHTML = emptyState('Sin movimientos que coincidan con los filtros.');
  } else {
    el.innerHTML = list.map(txnHTML).join('');
  }

  const totIng = list.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const totGas = list.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.monto, 0);
  document.getElementById('filter-summary').textContent =
    list.length + ' movimiento' + (list.length !== 1 ? 's' : '') +
    ' · Ingresos ' + fmt(totIng) + ' · Gastos ' + fmt(totGas);
}

/* ─────────────────────────────────────────────
   EXPORTAR CSV
───────────────────────────────────────────── */
function exportarCSV() {
  const rows = [
    ['Fecha','Tipo','Categoría','Descripción','Importe','Referencia','Nota','Origen'],
    ...movimientos
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map(m => [m.fecha, m.tipo, m.cat, m.desc, m.monto, m.ref || '', m.nota || '', m.origen || 'manual'])
  ];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = 'finanzas_sociedad_' + currentYear + '.csv';
  a.click();
  showToast('CSV exportado correctamente.', 'ok');
}

/* ─────────────────────────────────────────────
   INICIALIZACIÓN
───────────────────────────────────────────── */
(function init() {
  load();
  setTipo('gasto');
  setPdfTipo('ingreso');
  document.getElementById('f-fecha').value = today();
  buildYearSelect();
  refreshDashboard();
})();
