/* ==========================================================================
   Control de Gastos — app.js
   Núcleo: estado global, utilidades de formato, modo privacidad, carga de datos (con copia local), navegación entre vistas, pantalla de clave y arranque.
   ========================================================================== */

// Muestra en la barra de estado qué falló (con el mensaje real del backend).
// Si la clave dejó de ser válida, vuelve a pedirla.
function showApiError(prefix, err) {
  if (isUnauthorizedError(err)) { showKeyScreen('La clave no es válida o cambió. Escríbela de nuevo.'); return; }
  setStatus(prefix + ': ' + (err && err.message ? err.message : String(err)), 'error');
  setTimeout(() => hideStatus(), 4000);
}

const state = {
  expenses: [],
  categories: [],
  categoryIcons: {},
  loading: true,
  error: null,
  activeView: 'mensual',
  selectedMonth: null,
  filtroEstado: 'all',
  filtroMes: 'all',
  filtroCategoria: 'all',
  filtroBarCategoria: 'all',
  filtroCategoriaMensual: 'all', // categoría seleccionada en la torta/leyenda del dashboard Mensual
  editingIds: new Set(),
  editingCategories: new Set(),
  editingIcons: new Set(),
  reviewIndex: 0,
  privacyMode: false,
  configSection: null, // null | 'categorias' | 'comprobante' | 'logs' | 'eliminados'
  logs: [],
  logDetailIndex: null,
  deletedExpenses: []
};

function colorForCategory(cat) {
  if (!cat) return '#4b5563';
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 62%, 64%)`;
}

function iconForCategory(cat) {
  if (!cat) return NO_CATEGORY_ICON;
  // El ícono viene del Sheet: se escapa porque se inserta con innerHTML.
  if (state.categoryIcons && state.categoryIcons[cat]) return escapeHtml(state.categoryIcons[cat]);
  return CATEGORY_ICONS[cat] || DEFAULT_ICON;
}

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('es-CL');
}

function fmtMoneyShort(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1000000) return '$' + (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1000) return '$' + Math.round(v / 1000) + 'K';
  return '$' + v;
}

// Versiones "conscientes" del modo privacidad: usadas únicamente en los montos
// de los dashboards Mensual y Promedio (no en Gastos ni en Revisar), para que
// el ojo de arriba pueda ocultarlos reemplazándolos por '-'.
function fmtMoneyPriv(n) {
  return state.privacyMode ? '-' : fmtMoney(n);
}

function fmtMoneyShortPriv(n) {
  return state.privacyMode ? '-' : fmtMoneyShort(n);
}

const PRIVACY_STORAGE_KEY = 'gastos_privacy_mode';

const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="19" height="19"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';

const EYE_CLOSED_SVG = '<svg viewBox="0 0 24 24" width="19" height="19"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19.5C5 19.5 1.5 12 1.5 12a19.4 19.4 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4.5c7 0 10.5 7.5 10.5 7.5a19.5 19.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function applyPrivacyIcon() {
  const btn = document.getElementById('privacyBtn');
  if (!btn) return;
  btn.innerHTML = state.privacyMode ? EYE_CLOSED_SVG : EYE_OPEN_SVG;
  btn.setAttribute('aria-pressed', state.privacyMode ? 'true' : 'false');
  btn.title = state.privacyMode ? 'Mostrar montos' : 'Ocultar montos';
}

// Aplica/quita el enmascarado de montos sin volver a construir el DOM ni los
// gráficos: solo re-escribe el texto de los elementos que ya tienen guardado
// su monto real en data-amount. Así el ícono del ojo no dispara la animación
// de creación de los gráficos (torta/barras) cada vez que se aprieta.
function applyMoneyMasking() {
  ['mensualTotal', 'promedioTotal', 'promedioMax30', 'promedioMin30', 'projectionValue', 'projectionDailyRate', 'projectionFixedPending'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.dataset.amount !== undefined) el.textContent = fmtMoneyPriv(Number(el.dataset.amount));
  });
  document.querySelectorAll('.cat-legend-amount[data-amount]').forEach((el) => {
    el.textContent = fmtMoneyPriv(Number(el.dataset.amount));
  });
  document.querySelectorAll('.tx-amount[data-amount]').forEach((el) => {
    el.textContent = fmtMoneyPriv(Number(el.dataset.amount));
  });
  // El eje Y del gráfico de barras (Promedio) sí depende del modo privacidad,
  // pero no hace falta destruirlo/recrearlo: un update sin animación alcanza.
  if (charts.promedioBarChart) charts.promedioBarChart.update('none');
}

function togglePrivacyMode() {
  state.privacyMode = !state.privacyMode;
  try { localStorage.setItem(PRIVACY_STORAGE_KEY, state.privacyMode ? '1' : '0'); } catch (e) { /* localStorage no disponible */ }
  applyPrivacyIcon();
  applyMoneyMasking();
}

function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return `${MESES[m - 1] || m} ${y}`;
}

function monthLabelShort(key) {
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  const abbr = (MESES[m - 1] || String(m)).slice(0, 3);
  return `${abbr} '${String(y).slice(2)}`;
}

function fmtDateShort(fechaStr) {
  if (!fechaStr) return '';
  const parts = fechaStr.split('-');
  if (parts.length !== 3) return fechaStr;
  return `${parts[2]}/${parts[1]}`;
}

// Encabezado de fecha minimalista para agrupar la lista de Vista Gastos.
// "Hoy"/"Ayer" para las fechas más recientes, si no día de la semana + fecha.
function fmtDateHeader(fechaStr) {
  if (!fechaStr) return 'Sin fecha';
  const d = new Date(fechaStr + 'T00:00:00');
  if (isNaN(d.getTime())) return fechaStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - d) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  const label = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function stateClass(estado) {
  if (estado === ESTADOS.PENDIENTE) return 'pendiente';
  if (estado === ESTADOS.AUTO) return 'auto';
  return 'confirmado';
}

function stateLabel(estado) {
  if (estado === ESTADOS.PENDIENTE) return 'Pendiente de revisar';
  if (estado === ESTADOS.AUTO) return 'Auto — sin confirmar';
  return 'Confirmado';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function distinctCategories(expenses) {
  // Fuente de verdad: la lista de categorías del backend (la misma que ve
  // Configuración), más cualquier categoría que ya tengan gastos existentes
  // (por si quedó algún dato huérfano). Ya NO usamos CATEGORY_COLORS acá:
  // ese mapa es solo para color/ícono de categorías conocidas, no para
  // decidir qué categorías existen — de lo contrario categorías eliminadas
  // en Configuración (ej. "Transferencias") seguían apareciendo en estos
  // selects, y categorías nuevas sin gastos todavía no aparecían.
  const set = new Set();
  state.categories.forEach((c) => { if (c) set.add(c); });
  expenses.forEach((e) => { if (e.categoria) set.add(e.categoria); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

// ---------------------------------------------------------------------------
// Copia local de los últimos datos (F4): permite abrir la app sin conexión.
// Vive solo en este dispositivo (localStorage) y se borra si la clave deja de
// servir, para que nadie sin clave pueda verla.
// ---------------------------------------------------------------------------
const DATA_CACHE_KEY = 'gastos_datos_v1';

function readDataCache() {
  try { return JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null'); } catch (e) { return null; }
}

function writeDataCache(patch) {
  try {
    const current = readDataCache() || {};
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(Object.assign(current, patch)));
  } catch (e) { /* sin espacio o sin localStorage: se sigue sin copia local */ }
}

function clearDataCache() {
  try { localStorage.removeItem(DATA_CACHE_KEY); } catch (e) { /* nada que borrar */ }
}

function fmtCacheDate(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Pinta al tiro con la copia local (si hay) mientras llegan los datos frescos.
function restoreDataCache() {
  const cache = readDataCache();
  if (!cache || !Array.isArray(cache.expenses)) return false;
  state.expenses = cache.expenses;
  if (Array.isArray(cache.categories)) state.categories = cache.categories;
  if (cache.icons) state.categoryIcons = cache.icons;
  const months = distinctMonths(state.expenses);
  if (!months.includes(state.selectedMonth)) state.selectedMonth = months[0] || currentMonthKey();
  renderAll();
  return true;
}

// Cada llamada a loadData recibe un número correlativo. Si mientras esperaba
// la respuesta empezó otra carga, esta respuesta llega "vieja" y se descarta
// para no pisar datos más nuevos (pasaba al abrir la app y volver a primer
// plano casi al mismo tiempo).
let loadSeq = 0;

let lastLoadAt = 0;

async function loadData(showSpinner) {
  const seq = ++loadSeq;
  const refreshBtn = document.getElementById('refreshBtn');
  if (showSpinner && refreshBtn) refreshBtn.classList.add('spinning');
  setStatus('Actualizando datos…', 'loading');
  try {
    const expenses = await apiGetExpenses();
    if (seq !== loadSeq) return; // llegó otra carga más nueva
    lastLoadAt = Date.now();
    state.expenses = expenses;
    state.error = null;

    const months = distinctMonths(expenses);
    if (!months.includes(state.selectedMonth)) {
      state.selectedMonth = months[0] || currentMonthKey();
    }

    renderAll();
    writeDataCache({ savedAt: Date.now(), expenses });
    setStatus(`Actualizado · ${expenses.length} gasto${expenses.length === 1 ? '' : 's'}`, 'ok');
    setTimeout(() => hideStatus(), 2200);
  } catch (err) {
    if (seq !== loadSeq) return;
    if (isUnauthorizedError(err)) {
      hideStatus();
      showKeyScreen('La clave no es válida o cambió. Escríbela de nuevo.');
      return;
    }
    state.error = err.message || String(err);
    const cache = readDataCache();
    if (cache && cache.savedAt && state.expenses.length) {
      // Sin conexión (o backend caído): se sigue mostrando la copia local.
      setStatus(`Sin conexión · mostrando datos del ${fmtCacheDate(cache.savedAt)}`, 'error');
    } else {
      setStatus('No se pudo cargar: ' + state.error, 'error');
    }
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

async function loadLastRun() {
  const el = document.getElementById('lastRunLabel');
  if (!el) return;
  try {
    const iso = await apiGetLastRun();
    if (!iso) { el.textContent = ''; return; }
    const d = new Date(iso);
    if (isNaN(d.getTime())) { el.textContent = ''; return; }
    const fecha = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
    const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    el.textContent = `Últ. revisión: ${fecha} ${hora}`;
  } catch (err) {
    el.textContent = '';
  }
}

async function loadCategories() {
  try {
    const data = await apiGetCategories();
    state.categories = data.categories;
    state.categoryIcons = data.icons;
    writeDataCache({ categories: data.categories, icons: data.icons });
  } catch (err) {
    // Si la clave no es válida, loadData ya la pide; acá solo avisamos el resto.
    // Sin conexión con copia local, el aviso "Sin conexión" de loadData basta.
    if (!isUnauthorizedError(err) && !readDataCache()) showApiError('No se pudieron cargar las categorías', err);
  }
}

function fmtRangeDate(d) {
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
}

// "6 de agosto al 5 de septiembre" (agrega el año a ambas puntas si la
// ventana cruza de un año a otro, para no dejar la fecha ambigua).
function fmtDateRange(start, end) {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = fmtRangeDate(start) + (sameYear ? '' : ` de ${start.getFullYear()}`);
  const endLabel = fmtRangeDate(end) + (sameYear ? '' : ` de ${end.getFullYear()}`);
  return `${startLabel} al ${endLabel}`;
}

function setStatus(msg, kind) {
  const el = document.getElementById('statusBar');
  el.textContent = msg;
  el.className = 'status-bar' + (kind ? ' ' + kind : '');
  el.classList.remove('hidden');
}

function hideStatus() {
  const el = document.getElementById('statusBar');
  el.classList.add('hidden');
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Toast con "Deshacer" (abajo, sobre la barra de navegación). Solo hay uno a
// la vez: uno nuevo reemplaza al anterior, que ya no se puede deshacer.
// ---------------------------------------------------------------------------
const UNDO_TOAST_MS = 6000;

let undoToastTimer = null;

let undoToastAction = null;

function showUndoToast(message, onUndo) {
  const toast = document.getElementById('undoToast');
  if (!toast) return;
  document.getElementById('undoToastMsg').textContent = message;
  undoToastAction = onUndo;
  toast.classList.remove('hidden');
  clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(hideUndoToast, UNDO_TOAST_MS);
}

function hideUndoToast() {
  clearTimeout(undoToastTimer);
  undoToastAction = null;
  const toast = document.getElementById('undoToast');
  if (toast) toast.classList.add('hidden');
}

function setActiveView(view) {
  state.activeView = view;
  if (view === 'revisar') state.reviewIndex = 0;
  document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');
  // El detalle de proyección es un drill-down de Mensual, no tiene botón
  // propio en el nav de abajo: dejamos "Mensual" resaltado mientras se ve.
  const navView = view === 'proyeccion-detalle' ? 'mensual' : view;
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === navView);
  });
  // Sin esto, cambiar de vista conserva el scroll donde estaba (ej. si
  // tocas la tarjeta de proyección al final de Mensual, el detalle se abre
  // ya scrolleado hacia abajo en vez de arrancar arriba).
  window.scrollTo(0, 0);
  renderAll();
  if (view === 'config') loadCategories().then(renderConfig);
}

function renderAll() {
  if (state.activeView === 'mensual') renderMensual();
  else if (state.activeView === 'promedio') renderPromedio();
  else if (state.activeView === 'gastos') renderGastos();
  else if (state.activeView === 'config') renderConfig();
  else if (state.activeView === 'revisar') renderRevisar();
  else if (state.activeView === 'proyeccion-detalle') renderProjectionDetail();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveView(btn.dataset.view));
  });

  document.getElementById('mesSelect').addEventListener('change', (ev) => {
    state.selectedMonth = ev.target.value;
    renderMensual();
  });

  document.getElementById('filtroEstado').addEventListener('change', (ev) => {
    state.filtroEstado = ev.target.value;
    renderGastos();
  });
  document.getElementById('filtroMes').addEventListener('change', (ev) => {
    state.filtroMes = ev.target.value;
    renderGastos();
  });
  document.getElementById('filtroCategoria').addEventListener('change', (ev) => {
    state.filtroCategoria = ev.target.value;
    renderGastos();
  });
  document.getElementById('filtroBarCategoria').addEventListener('change', (ev) => {
    state.filtroBarCategoria = ev.target.value;
    renderPromedio();
  });
  document.getElementById('goReviewBtn').addEventListener('click', () => setActiveView('revisar'));

  const projectionCardEl = document.getElementById('projectionCard');
  projectionCardEl.addEventListener('click', () => setActiveView('proyeccion-detalle'));
  projectionCardEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setActiveView('proyeccion-detalle');
    }
  });
  document.getElementById('projectionDetailBack').addEventListener('click', () => setActiveView('mensual'));

  document.getElementById('addCategoriaBtn').addEventListener('click', onAddCategory);
  document.getElementById('nuevaCategoriaInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); onAddCategory(); }
  });

  document.querySelectorAll('.config-menu-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.configSection = btn.dataset.configSection;
      renderConfig();
    });
  });
  document.querySelectorAll('[data-config-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.configSection = null;
      renderConfig();
    });
  });
  document.querySelectorAll('[data-logs-detail-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.logDetailIndex = null;
      showLogsList();
    });
  });
  document.getElementById('comprobanteForm').addEventListener('submit', onComprobanteSubmit);

  document.getElementById('refreshBtn').addEventListener('click', () => { loadData(true); loadLastRun(); });

  document.getElementById('undoToastBtn').addEventListener('click', () => {
    const action = undoToastAction;
    hideUndoToast();
    if (action) action();
  });

  try { state.privacyMode = localStorage.getItem(PRIVACY_STORAGE_KEY) === '1'; } catch (e) { /* localStorage no disponible */ }
  applyPrivacyIcon();
  document.getElementById('privacyBtn').addEventListener('click', togglePrivacyMode);

  document.getElementById('keyForm').addEventListener('submit', onKeySubmit);
  if (!getApiSecret()) {
    showKeyScreen();
    return;
  }
  startDataLoad();
});

// ---------------------------------------------------------------------------
// Pantalla "Clave de acceso" (S3): aparece si el dispositivo no tiene clave
// guardada o si el backend responde "unauthorized".
// ---------------------------------------------------------------------------
function showKeyScreen(message) {
  setApiSecret('');
  clearDataCache();
  const screen = document.getElementById('keyScreen');
  const msg = document.getElementById('keyMsg');
  if (msg && message) msg.textContent = message;
  if (screen) screen.classList.remove('hidden');
  const input = document.getElementById('keyInput');
  if (input) { input.value = ''; input.focus(); }
}

function onKeySubmit(ev) {
  ev.preventDefault();
  const input = document.getElementById('keyInput');
  const value = input ? input.value.trim() : '';
  if (!value) { if (input) input.focus(); return; }
  setApiSecret(value);
  document.getElementById('keyScreen').classList.add('hidden');
  startDataLoad();
}

function startDataLoad() {
  restoreDataCache();
  loadData(true);
  loadLastRun();
  // Encadenamos con renderAll: distinctCategories() depende de state.categories,
  // así que si esto resuelve después del primer render, refrescamos los selects
  // que dependen de la lista de categorías (filtros, revisar, etc.)
  loadCategories().then(renderAll);
}

// ¿Hay algo a medio editar que un re-render borraría? Un gasto o categoría en
// modo edición, un campo de texto con contenido sin guardar, o el foco puesto
// en un input/select.
function hasUnsavedInput() {
  if (state.editingIds.size || state.editingCategories.size || state.editingIcons.size) return true;
  const active = document.activeElement;
  if (active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) return true;
  const textInputs = document.querySelectorAll('.expense-cat-custom, #nuevaCategoriaInput, #comprobanteMonto, #comprobanteComercio');
  return Array.from(textInputs).some((el) => !el.closest('.hidden') && el.value.trim() !== '');
}

// Al volver a primer plano se traen datos frescos, salvo que se haya cargado
// hace menos de un minuto o que haya algo a medio editar (el re-render lo
// borraría). En esos casos los datos se refrescan con el botón de actualizar
// o la próxima vez que la app vuelva a primer plano.
const RELOAD_ON_FOCUS_MIN_MS = 60 * 1000;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!getApiSecret()) return;
  loadLastRun();
  if (Date.now() - lastLoadAt < RELOAD_ON_FOCUS_MIN_MS) return;
  if (hasUnsavedInput()) return;
  loadData(false);
});
