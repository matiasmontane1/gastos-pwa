/* ==========================================================================
   Control de Gastos — views/proyeccion.js
   Tarjeta de proyección de fin de mes (en Mensual) y su vista de detalle.
   ========================================================================== */

// Proyecta el gasto total del mes en curso a partir del ritmo diario de lo
// que va del mes, y lo compara contra el promedio mensual (avgTotal, ya
// escalado a 30 días). Con menos de PROJECTION_MIN_DAYS días transcurridos
// no proyectamos: mostramos un mensaje en su lugar para no engañar con un
// número que un solo gasto grande temprano en el mes podría distorsionar.
function renderProjection(avgTotal) {
  const data = computeProjectionData(state.expenses, avgTotal);

  document.getElementById('projectionMonthLabel').textContent = monthLabel(data.monthKeyNow);

  const bodyEl = document.getElementById('projectionBody');
  const emptyEl = document.getElementById('projectionEmpty');
  const compareEl = document.getElementById('projectionCompare');
  const fixedNoteEl = document.getElementById('projectionFixedNote');

  if (data.insufficient) {
    bodyEl.classList.add('hidden');
    compareEl.classList.add('hidden');
    if (fixedNoteEl) fixedNoteEl.classList.add('hidden');
    emptyEl.textContent = `Necesitamos al menos ${PROJECTION_MIN_DAYS} días del mes para proyectar con confianza (van ${data.dayOfMonth}).`;
    emptyEl.classList.remove('hidden');
    return;
  }
  bodyEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  const valueEl = document.getElementById('projectionValue');
  valueEl.dataset.amount = String(data.projected);
  valueEl.textContent = fmtMoneyPriv(data.projected);

  const rateEl = document.getElementById('projectionDailyRate');
  rateEl.dataset.amount = String(data.variableDailyRate);
  rateEl.textContent = fmtMoneyShortPriv(data.variableDailyRate);
  document.getElementById('projectionDayOfMonth').textContent = String(data.dayOfMonth);
  document.getElementById('projectionDaysInMonth').textContent = String(data.daysInMonth);

  if (fixedNoteEl) {
    const fixedAmountEl = document.getElementById('projectionFixedPending');
    if (data.missingFixedTotal > 0 && fixedAmountEl) {
      fixedAmountEl.dataset.amount = String(data.missingFixedTotal);
      fixedAmountEl.textContent = fmtMoneyPriv(data.missingFixedTotal);
      fixedNoteEl.classList.remove('hidden');
    } else {
      fixedNoteEl.classList.add('hidden');
    }
  }

  if (data.diffPct !== null) {
    compareEl.classList.remove('hidden');
    if (Math.abs(data.diffPct) < 5) {
      compareEl.className = 'projection-compare neutral';
      compareEl.textContent = '≈ tu promedio mensual';
    } else if (data.diffPct > 0) {
      compareEl.className = 'projection-compare over';
      compareEl.textContent = `${data.diffPct}% más que tu promedio`;
    } else {
      compareEl.className = 'projection-compare under';
      compareEl.textContent = `${Math.abs(data.diffPct)}% menos que tu promedio`;
    }
  } else {
    compareEl.classList.add('hidden');
  }
}

// Card destacada al principio del detalle: cuánto queda por gastar hoy según
// el ritmo típico de este día de la semana, comparado contra lo ya gastado
// hoy. A diferencia de todayTopUp (usado internamente para la proyección,
// recortado en 0), acá se muestra el número tal cual: si ya se pasó, se
// avisa en vez de ocultarlo.
function renderProjectionTodayCard(data) {
  const cardEl = document.getElementById('projectionTodayCard');
  const labelEl = document.getElementById('projectionTodayLabel');
  const valueEl = document.getElementById('projectionTodayValue');
  const subEl = document.getElementById('projectionTodaySub');
  if (!cardEl || !labelEl || !valueEl || !subEl) return;

  const over = data.todayRemaining < 0;
  const amount = Math.abs(data.todayRemaining);
  cardEl.classList.toggle('proj-saldo-over', over);
  cardEl.classList.toggle('proj-saldo-ok', !over);
  labelEl.textContent = over ? 'Ya gastaste de más hoy' : 'Saldo disponible para hoy';
  valueEl.dataset.amount = String(amount);
  valueEl.textContent = fmtMoneyPriv(amount);
  subEl.textContent = `${DIAS_SEMANA[data.todayWeekday]} ${data.dayOfMonth} · típico de hoy ${fmtMoneyPriv(data.todayTypical)} · ya gastaste ${fmtMoneyPriv(data.todayVariableActual)}`;
}

function renderProjectionDetail() {
  const data = computeProjectionData(state.expenses, computeAvgTotal(state.expenses));

  const bodyEl = document.getElementById('projectionDetailBody');
  const emptyEl = document.getElementById('projectionDetailEmpty');

  if (data.insufficient) {
    bodyEl.classList.add('hidden');
    emptyEl.textContent = `Necesitamos al menos ${PROJECTION_MIN_DAYS} días del mes para proyectar con confianza (van ${data.dayOfMonth}).`;
    emptyEl.classList.remove('hidden');
    destroyChart('projectionCurveChart');
    return;
  }
  bodyEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  // --- 0. Card destacada: saldo de hoy ---
  renderProjectionTodayCard(data);

  // --- 1. Desglose tipo fórmula ---
  document.getElementById('projectionDetailFormula').innerHTML = `
    <div class="mini-stat">
      <span class="mini-stat-label">Gastado hasta hoy (día ${data.dayOfMonth})</span>
      <span class="mini-stat-value tx-amount" data-amount="${data.totalSoFar}">${fmtMoneyPriv(data.totalSoFar)}</span>
    </div>
    <div class="mini-stat">
      <span class="mini-stat-label">+ Fijos pendientes por caer</span>
      <span class="mini-stat-value tx-amount" data-amount="${data.missingFixedTotal}">${fmtMoneyPriv(data.missingFixedTotal)}</span>
    </div>
    <div class="mini-stat">
      <span class="mini-stat-label">+ Variable proyectado (ritmo base ${fmtMoneyPriv(data.variableDailyRate)}/día${data.histDailyRate !== null ? ` = ${Math.round(data.monthWeight * 100)}% este mes (${fmtMoneyPriv(data.monthDailyRate)}/día) + ${100 - Math.round(data.monthWeight * 100)}% historial (${fmtMoneyPriv(data.histDailyRate)}/día)` : ''}, ajustado por día de semana; incluye lo que falta de hoy y los ${data.remainingDays} días siguientes)</span>
      <span class="mini-stat-value tx-amount" data-amount="${data.remainingProjected}">${fmtMoneyPriv(data.remainingProjected)}</span>
    </div>
    <div class="mini-stat mini-stat-total">
      <span class="mini-stat-label">= Total proyectado</span>
      <span class="mini-stat-value tx-amount" data-amount="${data.projected}">${fmtMoneyPriv(data.projected)}</span>
    </div>
  `;

  // --- 2. Gastos fijos del mes (ya caídos vs pendientes) ---
  const fixedListEl = document.getElementById('projectionDetailFixed');
  const fixedEmptyEl = document.getElementById('projectionDetailFixedEmpty');
  const fixedRows = data.occurredFixed
    .map((e) => ({ comercio: e.comercio, amount: Number(e.monto) || 0, meta: `Ya cayó este mes · ${fmtDateShort(e.fecha)}` }))
    .concat(data.missingFixed.map((f) => ({ comercio: f.comercio, amount: f.amount, meta: 'Estimado (promedio histórico) · todavía no cae' })));
  if (!fixedRows.length) {
    fixedListEl.innerHTML = '';
    fixedEmptyEl.classList.remove('hidden');
  } else {
    fixedEmptyEl.classList.add('hidden');
    fixedListEl.innerHTML = fixedRows.map((r) => `
      <div class="tx-row">
        <span class="tx-dot" style="background:var(--accent-blue)"></span>
        <div class="tx-main">
          <div class="tx-comercio">${escapeHtml(r.comercio)}</div>
          <div class="tx-meta">${r.meta}</div>
        </div>
        <span class="tx-amount" data-amount="${r.amount}">${fmtMoneyPriv(r.amount)}</span>
      </div>
    `).join('');
  }

  // --- 3. Gastos variables, marcando los excluidos por outlier ---
  const outlierNoteEl = document.getElementById('projectionDetailOutlierNote');
  if (data.outlierInfo.bound !== null) {
    outlierNoteEl.textContent = `Se excluyen del ritmo diario los gastos variables por encima de ${fmtMoneyPriv(data.outlierInfo.bound)} (umbral calculado con el historial, ver abajo).`;
  } else {
    outlierNoteEl.textContent = 'Todavía no hay historial suficiente para calcular un umbral, así que no se excluye ningún gasto variable por ahora.';
  }
  const varListEl = document.getElementById('projectionDetailVariable');
  const varEmptyEl = document.getElementById('projectionDetailVariableEmpty');
  const sortedVariable = data.variableExpensesThisMonth.slice().sort((a, b) => (Number(b.monto) || 0) - (Number(a.monto) || 0));
  if (!sortedVariable.length) {
    varListEl.innerHTML = '';
    varEmptyEl.classList.remove('hidden');
  } else {
    varEmptyEl.classList.add('hidden');
    const excludedIds = new Set(data.excludedVariable.map((e) => e.idMail));
    varListEl.innerHTML = sortedVariable.map((e) => {
      const isExcluded = excludedIds.has(e.idMail);
      return `
        <div class="tx-row">
          <span class="tx-dot" style="background:${colorForCategory(e.categoria)}"></span>
          <div class="tx-main">
            <div class="tx-comercio">${escapeHtml(e.comercio || 'Sin comercio')}${isExcluded ? ' <span class="proj-outlier-badge">Excluido</span>' : ''}</div>
            <div class="tx-meta">${fmtDateShort(e.fecha)} · ${escapeHtml(e.categoria || 'Sin categoría')}</div>
          </div>
          <span class="tx-amount" data-amount="${Number(e.monto) || 0}">${fmtMoneyPriv(Number(e.monto) || 0)}</span>
        </div>
      `;
    }).join('');
  }

  // --- 4. Base histórica del umbral IQR ---
  const histEl = document.getElementById('projectionDetailHistBasis');
  const oi = data.outlierInfo;
  const mesesLabel = oi.recentKeys.length ? oi.recentKeys.map(monthLabel).join(', ') : 'ninguno todavía';
  if (oi.bound !== null) {
    histEl.innerHTML = `
      <div class="mini-stat">
        <span class="mini-stat-label">Meses usados</span>
        <span class="mini-stat-value">${escapeHtml(mesesLabel)}</span>
      </div>
      <div class="mini-stat">
        <span class="mini-stat-label">Gastos variables en la muestra</span>
        <span class="mini-stat-value">${oi.basisCount}</span>
      </div>
      <div class="mini-stat">
        <span class="mini-stat-label">Q1 (percentil 25)</span>
        <span class="mini-stat-value tx-amount" data-amount="${oi.q1}">${fmtMoneyPriv(oi.q1)}</span>
      </div>
      <div class="mini-stat">
        <span class="mini-stat-label">Q3 (percentil 75)</span>
        <span class="mini-stat-value tx-amount" data-amount="${oi.q3}">${fmtMoneyPriv(oi.q3)}</span>
      </div>
      <div class="mini-stat mini-stat-total">
        <span class="mini-stat-label">Umbral (Q3 + 1.5 × IQR)</span>
        <span class="mini-stat-value tx-amount" data-amount="${oi.bound}">${fmtMoneyPriv(oi.bound)}</span>
      </div>
    `;
  } else {
    histEl.innerHTML = `<div class="empty-msg">Meses usados: ${escapeHtml(mesesLabel)}. Se necesitan al menos 4 gastos variables en el historial para calcular el umbral (hay ${oi.basisCount}).</div>`;
  }

  // --- 5. Ritmo por día de la semana (ajuste aplicado a hoy y a los días que
  // quedan; "hoy" siempre entra, aunque sea el último día del mes: mientras
  // el día siga en curso se sigue completando hasta su monto típico) ---
  const weekdayEl = document.getElementById('projectionDetailWeekday');
  {
    const weekOrder = [1, 2, 3, 4, 5, 6, 0]; // lunes a domingo
    // Mostramos el presupuesto DIARIO de ese día de semana (rate * index) como
    // dato principal, con "× N días" como el factor que lo multiplica, en vez
    // de mostrar directo el subtotal ya multiplicado — así se ve el mismo
    // desglose (presupuesto por día, cuántos quedan) que se usa para calcular
    // el total, no un número ya cocinado. El subtotal se mantiene como dato
    // chico de referencia.
    const rows = weekOrder
      .map((wd) => data.remainingByWeekday[wd])
      .filter((r) => r.count > 0)
      .map((r) => {
        const trend = r.index >= 1.05 ? 'gasta más que el promedio' : (r.index <= 0.95 ? 'gasta menos que el promedio' : 'similar al promedio');
        const includesToday = r.weekday === data.todayWeekday;
        const diasLabel = includesToday ? `× ${r.count} (incluye hoy)` : `× ${r.count}`;
        const dailyBudget = data.variableDailyRate * r.index;
        return `
          <div class="tx-row">
            <span class="tx-dot" style="background:var(--accent-purple)"></span>
            <div class="tx-main">
              <div class="tx-comercio">${DIAS_SEMANA[r.weekday]} <span class="proj-weekday-index">${r.index.toFixed(2)}×</span></div>
              <div class="tx-meta">${trend} · ${diasLabel} días restantes</div>
            </div>
            <div class="proj-weekday-values">
              <span class="tx-amount" data-amount="${dailyBudget}">${fmtMoneyPriv(dailyBudget)}/día</span>
              <span class="proj-weekday-subtotal" data-amount="${r.subtotal}">${diasLabel} = ${fmtMoneyPriv(r.subtotal)}</span>
            </div>
          </div>
        `;
      }).join('');
    weekdayEl.innerHTML = rows;
  }

  // --- 6. Comparación vs promedio histórico: línea chica bajo el total, no
  // una card propia (es información secundaria de contexto, no parte del
  // cálculo en sí) ---
  const compareDetailEl = document.getElementById('projectionDetailCompare');
  if (data.diffPct !== null) {
    let badgeClass = 'neutral';
    let badgeText = '≈ tu promedio histórico';
    if (Math.abs(data.diffPct) >= 5) {
      badgeClass = data.diffPct > 0 ? 'over' : 'under';
      badgeText = data.diffPct > 0 ? `${data.diffPct}% más que tu promedio` : `${Math.abs(data.diffPct)}% menos que tu promedio`;
    }
    compareDetailEl.innerHTML = `
      <span class="projection-compare-inline-badge ${badgeClass}">${badgeText}</span>
      <span class="projection-compare-inline-sub">promedio histórico: ${fmtMoneyPriv(data.avgTotal)}</span>
    `;
  } else {
    compareDetailEl.innerHTML = '<span class="projection-compare-inline-sub">Todavía no hay suficiente historial o gasto este mes para comparar contra el promedio.</span>';
  }

  // --- 7. Gráfico: acumulado real vs proyección lineal hacia adelante ---
  renderProjectionCurveChart(data);
}

// Curva de gasto acumulado: "Real" son los días ya transcurridos del mes
// (acumulado día a día); "Proyectado" es una interpolación lineal simple
// desde (día actual, total gastado) hasta (último día, total proyectado) —
// una simplificación visual, no reproduce el momento exacto de cada fijo
// pendiente, solo el punto de llegada. Si hay promedio histórico, se dibuja
// como línea de referencia plana.
function renderProjectionCurveChart(data) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('projectionCurveChart');
  if (!canvas) return;

  const days = [];
  for (let d = 1; d <= data.daysInMonth; d++) days.push(d);

  const byDay = {};
  data.monthExpenses.forEach((e) => {
    const d = Number((e.fecha || '').split('-')[2]);
    if (!d) return;
    byDay[d] = (byDay[d] || 0) + (Number(e.monto) || 0);
  });
  let running = 0;
  const realSeries = days.map((d) => {
    if (d > data.dayOfMonth) return null;
    running += byDay[d] || 0;
    return running;
  });

  const projSeries = days.map((d) => {
    if (d < data.dayOfMonth) return null;
    if (data.remainingDays === 0) return d === data.dayOfMonth ? data.projected : null;
    const t = (d - data.dayOfMonth) / data.remainingDays;
    return data.totalSoFar + t * (data.projected - data.totalSoFar);
  });

  const avgSeries = data.avgTotal > 0 ? days.map(() => data.avgTotal) : null;

  destroyChart('projectionCurveChart');

  const datasets = [
    { label: 'Real', data: realSeries, borderColor: '#5ee6c5', backgroundColor: 'rgba(94,230,197,0.12)', fill: true, tension: 0.2, pointRadius: 2, spanGaps: false },
    { label: 'Proyectado', data: projSeries, borderColor: '#6ea8ff', borderDash: [5, 4], tension: 0.15, pointRadius: 0, spanGaps: false }
  ];
  if (avgSeries) {
    datasets.push({ label: 'Promedio histórico', data: avgSeries, borderColor: '#8b93a1', borderDash: [2, 3], pointRadius: 0, borderWidth: 1 });
  }

  charts.projectionCurveChart = new Chart(canvas, {
    type: 'line',
    data: { labels: days, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8b93a1', font: { size: 10 }, maxTicksLimit: 8 } },
        y: { beginAtZero: true, grid: { color: '#23272f' }, ticks: { color: '#8b93a1', font: { size: 11 }, callback: (v) => fmtMoneyShortPriv(v) } }
      },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#8b93a1', font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoneyPriv(ctx.parsed.y)}` } }
      }
    }
  });
}
