/* ==========================================================================
   Control de Gastos — views/mensual.js
   Vista Mensual: total del mes, torta por categoría y transacciones.
   ========================================================================== */

function renderMensual() {
  const months = distinctMonths(gastosContables(state.expenses));
  const select = document.getElementById('mesSelect');
  const currentKey = state.selectedMonth || currentMonthKey();

  const options = months.length ? months : [currentKey];
  select.innerHTML = options.map((m) => `<option value="${m}" ${m === currentKey ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');

  const monthExpenses = gastosContables(state.expenses).filter((e) => monthKey(e.fecha) === currentKey);
  const total = monthExpenses.reduce((s, e) => s + (Number(e.monto) || 0), 0);
  const mensualTotalEl = document.getElementById('mensualTotal');
  mensualTotalEl.dataset.amount = String(total);
  mensualTotalEl.textContent = fmtMoneyPriv(total);

  // Desglose por categoría
  const byCat = {};
  monthExpenses.forEach((e) => {
    const cat = e.categoria || 'Sin categoría';
    byCat[cat] = (byCat[cat] || 0) + (Number(e.monto) || 0);
  });
  const rawCatEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const { entries: catEntries, smallCatSet: mensualSmallCats } = groupSmallCategories(rawCatEntries);
  const otrosBreakdownMensual = rawCatEntries.filter(([c]) => mensualSmallCats.has(c));

  // Si la categoría seleccionada ya no tiene datos en este mes, limpiar la selección.
  if (state.filtroCategoriaMensual !== 'all' && !catEntries.some(([c]) => c === state.filtroCategoriaMensual)) {
    state.filtroCategoriaMensual = 'all';
  }
  renderCategorySection('mensual', catEntries, state.filtroCategoriaMensual, (cat) => {
    state.filtroCategoriaMensual = (state.filtroCategoriaMensual === cat) ? 'all' : cat;
    renderMensual();
  }, otrosBreakdownMensual);

  // Lista de transacciones (filtrada por la categoría seleccionada, si hay alguna)
  let sorted = monthExpenses.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  if (state.filtroCategoriaMensual !== 'all') {
    sorted = sorted.filter((e) => matchesCategoryFilter(e.categoria || 'Sin categoría', state.filtroCategoriaMensual, mensualSmallCats));
  }
  const listEl = document.getElementById('mensualLista');
  const txEmpty = document.getElementById('mensualTxEmpty');
  if (!sorted.length) {
    listEl.innerHTML = '';
    txEmpty.textContent = state.filtroCategoriaMensual !== 'all'
      ? 'Sin transacciones de esta categoría este mes.'
      : 'Sin transacciones este mes.';
    txEmpty.classList.remove('hidden');
  } else {
    txEmpty.classList.add('hidden');
    listEl.innerHTML = sorted.map(txRow).join('');
  }

  // La proyección siempre habla del mes en curso: si se está mirando otro mes,
  // la tarjeta se oculta para no mezclar meses (C7).
  const projectionCardEl = document.getElementById('projectionCard');
  const isCurrentMonth = currentKey === currentMonthKey();
  if (projectionCardEl) projectionCardEl.classList.toggle('hidden', !isCurrentMonth);
  if (isCurrentMonth) renderProjection(computeAvgTotal(state.expenses));
}

function txRow(e) {
  const color = colorForCategory(e.categoria);
  const icon = iconForCategory(e.categoria);
  return `
    <div class="tx-row">
      <span class="tx-dot" style="background:${color}"></span>
      <div class="tx-main">
        <div class="tx-comercio">${escapeHtml(e.comercio || 'Sin nombre')}</div>
        <div class="tx-meta">${fmtDateShort(e.fecha)} · ${icon} ${escapeHtml(e.categoria || 'Sin categoría')}</div>
      </div>
      <div class="tx-amount" data-amount="${e.monto}">${fmtMoneyPriv(e.monto)}</div>
    </div>`;
}
