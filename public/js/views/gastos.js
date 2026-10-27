/* ==========================================================================
   Control de Gastos — views/gastos.js
   Vista Gastos: lista filtrable, edición, eliminar con "Deshacer" y marcar fijo.
   ========================================================================== */

function renderGastosFilters() {
  const months = distinctMonths(state.expenses);
  const select = document.getElementById('filtroMes');
  const prev = state.filtroMes;
  select.innerHTML = '<option value="all">Todos los meses</option>' +
    months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  select.value = months.includes(prev) || prev === 'all' ? prev : 'all';

  const cats = distinctCategories(state.expenses).filter((c) => state.expenses.some((e) => e.categoria === c));
  const catSelect = document.getElementById('filtroCategoria');
  const prevCat = state.filtroCategoria;
  const hasUncategorized = state.expenses.some((e) => !e.categoria);
  catSelect.innerHTML = '<option value="all">Todas las categorías</option>' +
    (hasUncategorized ? `<option value="${NO_CATEGORY_FILTER}">${NO_CATEGORY_ICON} Sin categoría</option>` : '') +
    cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  const prevValid = prevCat === 'all' || cats.includes(prevCat) || (prevCat === NO_CATEGORY_FILTER && hasUncategorized);
  catSelect.value = prevValid ? prevCat : 'all';
  state.filtroCategoria = catSelect.value;
}

function renderGastos() {
  renderGastosFilters();

  let list = state.expenses.slice();
  if (state.filtroEstado !== 'all') list = list.filter((e) => e.estado === state.filtroEstado);
  if (state.filtroMes !== 'all') list = list.filter((e) => monthKey(e.fecha) === state.filtroMes);
  if (state.filtroCategoria === NO_CATEGORY_FILTER) list = list.filter((e) => !e.categoria);
  else if (state.filtroCategoria !== 'all') list = list.filter((e) => e.categoria === state.filtroCategoria);
  list.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const container = document.getElementById('gastosLista');
  const empty = document.getElementById('gastosEmpty');
  if (!list.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const cats = distinctCategories(state.expenses);
  let html = '';
  let lastFecha = null;
  list.forEach((e) => {
    if (e.fecha !== lastFecha) {
      html += `<div class="date-header">${escapeHtml(fmtDateHeader(e.fecha))}</div>`;
      lastFecha = e.fecha;
    }
    html += expenseCard(e, cats);
  });
  container.innerHTML = html;

  // listeners
  container.querySelectorAll('[data-idmail]').forEach((selectEl) => {
    selectEl.addEventListener('change', onCategoryChange);
  });
  container.querySelectorAll('[data-custom-idmail]').forEach((inputEl) => {
    inputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); saveCategory(inputEl.dataset.customIdmail, inputEl.value.trim(), inputEl); }
    });
    inputEl.addEventListener('blur', () => {
      if (inputEl.value.trim()) saveCategory(inputEl.dataset.customIdmail, inputEl.value.trim(), inputEl);
    });
  });
  container.querySelectorAll('[data-edit-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingIds.add(btn.dataset.editBtn);
      renderGastos();
    });
  });
  container.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingIds.delete(btn.dataset.cancelEdit);
      renderGastos();
    });
  });
  container.querySelectorAll('[data-save-edit]').forEach((btn) => {
    btn.addEventListener('click', () => saveExpenseEdit(btn.dataset.saveEdit));
  });
  container.querySelectorAll('[data-delete-btn]').forEach((btn) => {
    btn.addEventListener('click', () => onDeleteExpense(btn.dataset.deleteBtn));
  });
  container.querySelectorAll('[data-fijo-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => onToggleFijoManual(btn.dataset.fijoToggle));
  });
}

// Botón de 3 estados (Automático → Fijo → No fijo → Automático) para pisar
// a mano la detección automática de gastos fijos que usa la proyección de
// fin de mes (ver resolveFixedComercios). El estado real vive en el campo
// fijoManual del gasto (null | true | false), persistido en el backend.
function fijoToggleLabel(fijoManual) {
  if (fijoManual === true) return '★ Fijo';
  if (fijoManual === false) return '✕ No fijo';
  return 'Automático';
}

function fijoToggleClass(fijoManual) {
  if (fijoManual === true) return 'fijo-toggle-btn fijo-on';
  if (fijoManual === false) return 'fijo-toggle-btn fijo-off';
  return 'fijo-toggle-btn';
}

function nextFijoManual(current) {
  if (current === true) return false;
  if (current === false) return null;
  return true;
}

function expenseCard(e, cats) {
  const cls = stateClass(e.estado);
  const idMail = escapeHtml(e.idMail);
  const currentCat = e.categoria || '';
  const otherCats = cats.filter((c) => c !== currentCat);
  const optionsList = currentCat ? [currentCat, ...otherCats] : ['', ...otherCats];
  const optionsHtml = optionsList
    .map((c) => `<option value="${escapeHtml(c)}" ${c === currentCat ? 'selected' : ''}>${c ? iconForCategory(c) + ' ' + escapeHtml(c) : NO_CATEGORY_ICON + ' Sin categoría'}</option>`)
    .join('') + `<option value="__custom__">+ Nueva categoría…</option>`;

  const isEditing = state.editingIds.has(e.idMail);

  const topLeft = isEditing
    ? `<input type="text" class="expense-comercio-input" data-edit-comercio="${idMail}" value="${escapeHtml(e.comercio || '')}" placeholder="Nombre del gasto">`
    : `<div class="expense-comercio">${escapeHtml(e.comercio || 'Sin nombre')}</div>`;

  const topAmount = isEditing
    ? `<input type="number" class="expense-amount-input" data-edit-monto="${idMail}" value="${Math.round(Number(e.monto) || 0)}">`
    : `<div class="expense-amount">${fmtMoney(e.monto)}</div>`;

  const actionsHtml = isEditing
    ? `<button class="expense-action-btn primary" data-save-edit="${idMail}">Guardar</button>
       <button class="expense-action-btn" data-cancel-edit="${idMail}">Cancelar</button>`
    : `<button class="expense-action-btn" data-edit-btn="${idMail}">Editar</button>
       <button class="expense-action-btn danger" data-delete-btn="${idMail}">Eliminar</button>`;

  return `
    <div class="expense-card state-${cls}" data-card-idmail="${idMail}">
      <div class="expense-top">
        <div class="expense-info">
          ${topLeft}
          ${isEditing
            ? `<input type="date" class="expense-fecha-input" data-edit-fecha="${idMail}" value="${escapeHtml(e.fecha || '')}" max="${fmtDateKey(new Date())}">`
            : `<div class="expense-date">${fmtDateShort(e.fecha)}${e.fecha ? ' · ' + e.fecha.slice(0,4) : ''}</div>`}
        </div>
        ${topAmount}
      </div>
      <div class="expense-badge-row">
        <span class="expense-badge state-${cls}">${stateLabel(e.estado)}${isNoGasto(e) ? ' · No cuenta' : ''}</span>
        <button type="button" class="${fijoToggleClass(e.fijoManual)}" data-fijo-toggle="${idMail}" title="Gasto fijo para la proyección de fin de mes: click para cambiar (automático → fijo → no fijo)">${fijoToggleLabel(e.fijoManual)}</button>
      </div>
      <div class="expense-cat-row">
        <select class="expense-cat-select" data-idmail="${idMail}">${optionsHtml}</select>
        <span class="expense-save-state" data-savestate="${idMail}"></span>
      </div>
      <div class="expense-cat-row hidden" data-custom-row="${idMail}">
        <input type="text" class="expense-cat-custom" placeholder="Escribe la categoría…" data-custom-idmail="${idMail}">
      </div>
      <div class="expense-actions">${actionsHtml}</div>
    </div>`;
}

function onCategoryChange(ev) {
  const selectEl = ev.target;
  const idMail = selectEl.dataset.idmail;
  const value = selectEl.value;
  const customRow = document.querySelector(`[data-custom-row="${cssEscape(idMail)}"]`);

  if (value === '__custom__') {
    customRow.classList.remove('hidden');
    const input = customRow.querySelector('input');
    input.focus();
    return;
  }
  customRow.classList.add('hidden');
  saveCategory(idMail, value, selectEl);
}

async function saveCategory(idMail, categoria, triggerEl) {
  const stateEl = document.querySelector(`[data-savestate="${cssEscape(idMail)}"]`);
  if (stateEl) { stateEl.textContent = 'Guardando…'; stateEl.className = 'expense-save-state busy'; }
  try {
    // Si es una categoría nueva (escrita a mano en "+ Nueva categoría…"), hay
    // que registrarla en la lista general de categorías del backend además de
    // guardarla en este gasto — si no, queda invisible en Configuración y no
    // se le puede cambiar el ícono/color más adelante.
    if (categoria && !state.categories.includes(categoria)) {
      await apiAddCategory(categoria);
      state.categories.push(categoria);
    }
    await apiUpdateCategory(idMail, categoria);
    const exp = state.expenses.find((e) => e.idMail === idMail);
    if (exp) { exp.categoria = categoria; exp.estado = ESTADOS.CONFIRMADO; }
    if (stateEl) { stateEl.textContent = 'Guardado ✓'; stateEl.className = 'expense-save-state ok'; }
    setTimeout(() => renderGastos(), 500);
  } catch (err) {
    showApiError('No se pudo guardar la categoría', err);
    if (stateEl) { stateEl.textContent = 'Error'; stateEl.className = 'expense-save-state err'; }
  }
}

async function saveExpenseEdit(idMail) {
  const card = document.querySelector(`[data-card-idmail="${cssEscape(idMail)}"]`);
  const comercioInput = card ? card.querySelector('[data-edit-comercio]') : null;
  const montoInput = card ? card.querySelector('[data-edit-monto]') : null;
  const fechaInput = card ? card.querySelector('[data-edit-fecha]') : null;
  const saveBtn = card ? card.querySelector('[data-save-edit]') : null;

  const comercio = comercioInput ? comercioInput.value.trim() : undefined;
  const montoRaw = montoInput ? montoInput.value : undefined;
  const monto = montoRaw !== undefined && montoRaw !== '' ? Number(montoRaw) : undefined;

  if (!comercio) { comercioInput && comercioInput.focus(); return; }
  if (monto === undefined || Number.isNaN(monto) || monto < 0) { montoInput && montoInput.focus(); return; }
  // Solo fechas pasadas o de hoy (la proyección y el promedio asumen eso).
  const fecha = fechaInput ? fechaInput.value : undefined;
  if (fechaInput && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fmtDateKey(new Date()))) { fechaInput.focus(); return; }
  const actual = state.expenses.find((e) => e.idMail === idMail);
  const fechaCambio = fecha !== undefined && actual && fecha !== actual.fecha ? fecha : undefined;

  if (saveBtn) { saveBtn.textContent = 'Guardando…'; saveBtn.disabled = true; }
  try {
    await apiUpdateExpense(idMail, { comercio, monto, fecha: fechaCambio });
    const exp = state.expenses.find((e) => e.idMail === idMail);
    if (exp) { exp.comercio = comercio; exp.monto = monto; exp.estado = ESTADOS.CONFIRMADO; if (fechaCambio) exp.fecha = fechaCambio; }
    state.editingIds.delete(idMail);
    renderAll();
  } catch (err) {
    showApiError('No se pudo guardar el gasto', err);
    if (saveBtn) { saveBtn.textContent = 'Error — reintentar'; saveBtn.disabled = false; }
  }
}

// Eliminar es un borrado suave (se puede restaurar), así que en vez de pedir
// confirmación se elimina al tiro y se ofrece "Deshacer" por unos segundos.
async function onDeleteExpense(idMail) {
  const exp = state.expenses.find((e) => e.idMail === idMail);
  const nombre = exp ? (exp.comercio || 'Gasto') : 'Gasto';

  const card = document.querySelector(`[data-card-idmail="${cssEscape(idMail)}"]`);
  const deleteBtn = card ? card.querySelector('[data-delete-btn]') : null;
  if (deleteBtn) { deleteBtn.textContent = 'Eliminando…'; deleteBtn.disabled = true; }
  try {
    await apiDeleteExpense(idMail);
    state.expenses = state.expenses.filter((e) => e.idMail !== idMail);
    state.editingIds.delete(idMail);
    renderAll();
    if (exp) showUndoToast(`"${nombre}" eliminado`, () => undoDeleteExpense(exp));
  } catch (err) {
    showApiError('No se pudo eliminar', err);
    if (deleteBtn) { deleteBtn.textContent = 'Error — reintentar'; deleteBtn.disabled = false; }
  }
}

async function undoDeleteExpense(exp) {
  try {
    await apiRestoreExpense(exp.idMail);
    if (!state.expenses.some((e) => e.idMail === exp.idMail)) state.expenses.push(exp);
    renderAll();
    setStatus('Gasto restaurado ✓', 'ok');
    setTimeout(() => hideStatus(), 2000);
  } catch (err) {
    setStatus('No se pudo restaurar. Puedes hacerlo desde Configuración → Gastos eliminados.', 'error');
    setTimeout(() => hideStatus(), 4000);
  }
}

async function onToggleFijoManual(idMail) {
  const exp = state.expenses.find((e) => e.idMail === idMail);
  if (!exp) return;
  const current = exp.fijoManual === undefined ? null : exp.fijoManual;
  const next = nextFijoManual(current);

  const btn = document.querySelector(`[data-fijo-toggle="${cssEscape(idMail)}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await apiSetFijoManual(idMail, next);
    exp.fijoManual = next;
    renderGastos();
  } catch (err) {
    showApiError('No se pudo cambiar el fijo', err);
    if (btn) { btn.disabled = false; btn.textContent = fijoToggleLabel(current); }
  }
}
