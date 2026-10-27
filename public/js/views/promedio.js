/* ==========================================================================
   Control de Gastos — views/promedio.js
   Vista Promedio: promedio mensual, torta, barras por mes y máximo/mínimo de 30 días.
   ========================================================================== */

function renderMonthlyBarChart(filterCat, smallCatSet) {
  const wrap = document.getElementById('promedioBarChartWrap');
  const empty = document.getElementById('promedioBarEmpty');
  const months = distinctMonths(gastosContables(state.expenses)).slice().sort(); // cronológico ascendente

  if (!months.length) {
    if (wrap) wrap.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    destroyChart('promedioBarChart');
    return;
  }
  if (empty) empty.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');

  const byMonth = {};
  months.forEach((m) => { byMonth[m] = 0; });
  gastosContables(state.expenses).forEach((e) => {
    const mk = monthKey(e.fecha);
    if (!mk || !(mk in byMonth)) return;
    if (filterCat && filterCat !== 'all' && !matchesCategoryFilter(e.categoria || 'Sin categoría', filterCat, smallCatSet)) return;
    byMonth[mk] += Number(e.monto) || 0;
  });

  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('promedioBarChart');
  if (!canvas) return;
  destroyChart('promedioBarChart');

  const labels = months.map(monthLabelShort);
  const data = months.map((m) => byMonth[m]);
  const color = !filterCat || filterCat === 'all' ? '#5ee6c5' : colorForCategory(filterCat);

  charts.promedioBarChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, maxBarThickness: 34 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8b93a1', font: { size: 11 } } },
        y: {
          beginAtZero: true,
          grid: { color: '#23272f' },
          ticks: { color: '#8b93a1', font: { size: 11 }, callback: (v) => fmtMoneyShortPriv(v) }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => fmtMoneyPriv(ctx.parsed.y) } }
      }
    }
  });
}

function renderPromedio() {
  // Promedio ponderado por día: dividir por la cantidad de meses calendario
  // con datos sobrepesa los meses recién empezados (ej. 2 días de agosto
  // cuentan como "un mes" igual que julio completo). En vez de eso, usamos
  // el gasto diario real desde el primer gasto registrado y lo escalamos a
  // 30 días, para que un mes parcial no distorsione el promedio.
  const diasPromedio = diasDesdePrimerGasto(state.expenses);
  const avgTotal = computeAvgTotal(state.expenses);

  const promedioTotalEl = document.getElementById('promedioTotal');
  promedioTotalEl.dataset.amount = String(avgTotal);
  promedioTotalEl.textContent = fmtMoneyPriv(avgTotal);

  // Gasto TOTAL máximo y mínimo entre todas las ventanas móviles de 30 días
  // del historial (no la transacción individual más grande/chica).
  const windows30 = find30DayMinMaxWindows(state.expenses);
  const maxEl = document.getElementById('promedioMax30');
  const maxSubEl = document.getElementById('promedioMax30Sub');
  const minEl = document.getElementById('promedioMin30');
  const minSubEl = document.getElementById('promedioMin30Sub');
  if (windows30) {
    maxEl.dataset.amount = String(windows30.best.total);
    maxEl.textContent = fmtMoneyPriv(windows30.best.total);
    maxSubEl.textContent = fmtDateRange(windows30.best.start, windows30.best.end);
    minEl.dataset.amount = String(windows30.worst.total);
    minEl.textContent = fmtMoneyPriv(windows30.worst.total);
    minSubEl.textContent = fmtDateRange(windows30.worst.start, windows30.worst.end);
  } else {
    maxEl.dataset.amount = '0';
    maxEl.textContent = fmtMoneyPriv(0);
    maxSubEl.textContent = 'Necesitamos 30 días de historial';
    minEl.dataset.amount = '0';
    minEl.textContent = fmtMoneyPriv(0);
    minSubEl.textContent = 'Necesitamos 30 días de historial';
  }

  const pendientes = gastosContables(state.expenses).filter((e) => e.estado !== ESTADOS.CONFIRMADO).length;
  document.getElementById('promedioPendientes').textContent = String(pendientes);
  const goReviewBtn = document.getElementById('goReviewBtn');
  if (goReviewBtn) goReviewBtn.classList.toggle('hidden', pendientes === 0);

  const byCat = {};
  gastosContables(state.expenses).forEach((e) => {
    const cat = e.categoria || 'Sin categoría';
    byCat[cat] = (byCat[cat] || 0) + (Number(e.monto) || 0);
  });
  const rawAvgEntries = Object.entries(byCat)
    .map(([cat, total]) => [cat, (total / diasPromedio) * 30])
    .sort((a, b) => b[1] - a[1]);
  const { entries: avgEntries, smallCatSet: promedioSmallCats } = groupSmallCategories(rawAvgEntries);
  const otrosBreakdownPromedio = rawAvgEntries.filter(([c]) => promedioSmallCats.has(c));

  // renderPromedioBarFilter valida/ajusta state.filtroBarCategoria antes de usarlo
  // como selección activa de la torta, para que ambos (torta y gráfico de barras)
  // queden siempre sincronizados con una única fuente de verdad.
  renderPromedioBarFilter();
  renderCategorySection('promedio', avgEntries, state.filtroBarCategoria, (cat) => {
    state.filtroBarCategoria = (state.filtroBarCategoria === cat) ? 'all' : cat;
    renderPromedio();
  }, otrosBreakdownPromedio);
  renderMonthlyBarChart(state.filtroBarCategoria, promedioSmallCats);
}

function renderPromedioBarFilter() {
  const select = document.getElementById('filtroBarCategoria');
  if (!select) return;
  const contables = gastosContables(state.expenses);
  const cats = distinctCategories(contables).filter((c) => contables.some((e) => e.categoria === c));
  const prev = state.filtroBarCategoria;
  select.innerHTML = '<option value="all">Total</option>' +
    cats.map((c) => `<option value="${escapeHtml(c)}">${iconForCategory(c)} ${escapeHtml(c)}</option>`).join('');
  if (prev === 'all' || cats.includes(prev)) {
    select.value = prev;
    state.filtroBarCategoria = select.value;
  } else if (prev === 'Otros') {
    // "Otros" es una categoría agrupada (varias categorías chicas plegadas para
    // la torta), no una opción real del select: el dropdown cae a "Total" pero
    // mantenemos la selección real para que la torta siga resaltada.
    select.value = 'all';
  } else {
    select.value = 'all';
    state.filtroBarCategoria = 'all';
  }
}
