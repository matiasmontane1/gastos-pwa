/* ==========================================================================
   Control de Gastos — views/revisar.js
   Vista Revisar: pendientes uno por uno.
   ========================================================================== */

function pendingExpenses() {
  return gastosContables(state.expenses)
    .filter((e) => e.estado !== ESTADOS.CONFIRMADO)
    .slice()
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}

function renderRevisar() {
  const list = pendingExpenses();
  const wrap = document.getElementById('reviewCardWrap');
  const empty = document.getElementById('reviewEmpty');
  const progress = document.getElementById('reviewProgress');

  if (!list.length) {
    wrap.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  wrap.classList.remove('hidden');

  if (state.reviewIndex >= list.length) state.reviewIndex = list.length - 1;
  if (state.reviewIndex < 0) state.reviewIndex = 0;
  const idx = state.reviewIndex;
  const e = list[idx];

  progress.textContent = `${idx + 1} de ${list.length}`;

  const cats = distinctCategories(state.expenses);
  const cls = stateClass(e.estado);
  const currentCat = e.categoria || '';
  const otherCats = cats.filter((c) => c !== currentCat);
  const optionsList = currentCat ? [currentCat, ...otherCats] : ['', ...otherCats];
  const optionsHtml = optionsList
    .map((c) => `<option value="${escapeHtml(c)}" ${c === currentCat ? 'selected' : ''}>${c ? iconForCategory(c) + ' ' + escapeHtml(c) : NO_CATEGORY_ICON + ' Sin categoría'}</option>`)
    .join('') + `<option value="__custom__">+ Nueva categoría…</option>`;

  const idMail = escapeHtml(e.idMail);
  document.getElementById('reviewBody').innerHTML = `
    <div class="review-top">
      <div class="expense-info">
        <div class="expense-comercio">${escapeHtml(e.comercio || 'Sin nombre')}</div>
        <div class="expense-date">${fmtDateShort(e.fecha)}${e.fecha ? ' · ' + e.fecha.slice(0, 4) : ''}</div>
      </div>
      <div class="expense-amount">${fmtMoney(e.monto)}</div>
    </div>
    <span class="expense-badge state-${cls}">${stateLabel(e.estado)}</span>
    <div class="expense-cat-row">
      <select class="expense-cat-select" id="reviewCatSelect">${optionsHtml}</select>
    </div>
    <div class="expense-cat-row hidden" id="reviewCustomRow">
      <input type="text" class="expense-cat-custom" id="reviewCustomInput" placeholder="Escribe la categoría…">
    </div>
    <div class="review-nav">
      <button class="expense-action-btn" id="reviewPrevBtn" ${idx === 0 ? 'disabled' : ''}>← Anterior</button>
      <button class="expense-action-btn" id="reviewSkipBtn" ${idx === list.length - 1 ? 'disabled' : ''}>Saltar</button>
      <button class="expense-action-btn primary" id="reviewSaveBtn">Guardar y continuar</button>
    </div>
  `;

  document.getElementById('reviewPrevBtn').addEventListener('click', () => {
    state.reviewIndex = Math.max(0, state.reviewIndex - 1);
    renderRevisar();
  });
  document.getElementById('reviewSkipBtn').addEventListener('click', () => {
    state.reviewIndex = Math.min(list.length - 1, state.reviewIndex + 1);
    renderRevisar();
  });
  document.getElementById('reviewCatSelect').addEventListener('change', (ev) => {
    const customRow = document.getElementById('reviewCustomRow');
    if (ev.target.value === '__custom__') {
      customRow.classList.remove('hidden');
      document.getElementById('reviewCustomInput').focus();
    } else {
      customRow.classList.add('hidden');
    }
  });
  document.getElementById('reviewSaveBtn').addEventListener('click', () => saveReviewCurrent(e.idMail));
  document.getElementById('reviewCustomInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); saveReviewCurrent(e.idMail); }
  });
}

async function saveReviewCurrent(idMail) {
  const select = document.getElementById('reviewCatSelect');
  const customInput = document.getElementById('reviewCustomInput');
  let categoria = select.value;
  if (categoria === '__custom__') {
    categoria = customInput.value.trim();
    if (!categoria) { customInput.focus(); return; }
  }

  const saveBtn = document.getElementById('reviewSaveBtn');
  if (saveBtn) { saveBtn.textContent = 'Guardando…'; saveBtn.disabled = true; }
  try {
    // Mismo caso que en Vista Gastos: si es una categoría nueva escrita a
    // mano, hay que registrarla en la lista general antes de guardarla acá.
    if (categoria && !state.categories.includes(categoria)) {
      await apiAddCategory(categoria);
      state.categories.push(categoria);
    }
    await apiUpdateCategory(idMail, categoria);
    const exp = state.expenses.find((x) => x.idMail === idMail);
    if (exp) { exp.categoria = categoria; exp.estado = ESTADOS.CONFIRMADO; }
    // No incrementamos reviewIndex: al salir el gasto de la lista de pendientes,
    // el siguiente ocupa automáticamente la misma posición.
    renderRevisar();
  } catch (err) {
    showApiError('No se pudo guardar', err);
    if (saveBtn) { saveBtn.textContent = 'Error — reintentar'; saveBtn.disabled = false; }
  }
}
