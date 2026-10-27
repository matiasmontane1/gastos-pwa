/* ==========================================================================
   Control de Gastos — views/config.js
   Vista Configuración: categorías, agregar gasto, logs y gastos eliminados.
   ========================================================================== */

function renderConfig() {
  const menu = document.getElementById('configMenu');
  const sections = {
    categorias: document.getElementById('configSectionCategorias'),
    comprobante: document.getElementById('configSectionComprobante'),
    logs: document.getElementById('configSectionLogs'),
    eliminados: document.getElementById('configSectionEliminados')
  };
  const active = state.configSection;

  if (!active) {
    menu.classList.remove('hidden');
    Object.values(sections).forEach((el) => el.classList.add('hidden'));
    return;
  }

  menu.classList.add('hidden');
  Object.keys(sections).forEach((key) => sections[key].classList.toggle('hidden', key !== active));

  if (active === 'categorias') renderCategoriasSection();
  else if (active === 'comprobante') renderComprobanteSection();
  else if (active === 'logs') renderLogsSection();
  else if (active === 'eliminados') renderEliminadosSection();
}

function renderCategoriasSection() {
  const container = document.getElementById('categoriasLista');
  const empty = document.getElementById('categoriasEmpty');
  const cats = state.categories.slice().sort((a, b) => a.localeCompare(b, 'es'));

  if (!cats.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  container.innerHTML = cats.map(categoriaRow).join('');

  container.querySelectorAll('[data-cat-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingCategories.add(btn.dataset.catEdit);
      renderConfig();
    });
  });
  container.querySelectorAll('[data-cat-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingCategories.delete(btn.dataset.catCancel);
      renderConfig();
    });
  });
  container.querySelectorAll('[data-cat-save]').forEach((btn) => {
    btn.addEventListener('click', () => saveCategoryRename(btn.dataset.catSave));
  });
  container.querySelectorAll('[data-cat-delete]').forEach((btn) => {
    btn.addEventListener('click', () => onDeleteCategory(btn.dataset.catDelete));
  });
  container.querySelectorAll('[data-cat-rename-input]').forEach((input) => {
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); saveCategoryRename(input.dataset.catRenameInput); }
    });
    input.focus();
    input.select();
  });

  container.querySelectorAll('[data-cat-icon-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingIcons.add(btn.dataset.catIconEdit);
      renderConfig();
    });
  });
  container.querySelectorAll('[data-cat-icon-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.editingIcons.delete(btn.dataset.catIconCancel);
      renderConfig();
    });
  });
  container.querySelectorAll('[data-cat-icon-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveCategoryIcon(btn.dataset.catIconPick, btn.dataset.iconValue);
    });
  });
  container.querySelectorAll('[data-cat-icon-save]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.catIconSave;
      const input = container.querySelector(`[data-cat-icon-input="${cssEscape(nombre)}"]`);
      saveCategoryIcon(nombre, input ? input.value.trim() : '');
    });
  });
  container.querySelectorAll('[data-cat-icon-input]').forEach((input) => {
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); saveCategoryIcon(input.dataset.catIconInput, input.value.trim()); }
    });
    input.focus();
    input.select();
  });
}

function categoriaRow(nombre) {
  const safe = escapeHtml(nombre);
  const isEditing = state.editingCategories.has(nombre);
  const isEditingIcon = state.editingIcons.has(nombre);

  if (isEditing) {
    return `
      <div class="categoria-row">
        <input type="text" class="text-input" data-cat-rename-input="${safe}" value="${safe}">
        <div class="categoria-actions">
          <button class="expense-action-btn primary" data-cat-save="${safe}">Guardar</button>
          <button class="expense-action-btn" data-cat-cancel="${safe}">Cancelar</button>
        </div>
      </div>`;
  }

  if (isEditingIcon) {
    // Valor crudo (sin escapar): escapeHtml se aplica abajo, en el atributo value.
    const currentIcon = (state.categoryIcons && state.categoryIcons[nombre]) || CATEGORY_ICONS[nombre] || DEFAULT_ICON;
    return `
      <div class="categoria-row categoria-row-icon">
        <div class="cat-icon-edit">
          <div class="cat-icon-palette">
            ${ICON_PALETTE.map((e) => `<button type="button" class="cat-icon-swatch" data-cat-icon-pick="${safe}" data-icon-value="${e}">${e}</button>`).join('')}
          </div>
          <div class="cat-icon-custom-row">
            <input type="text" class="text-input cat-icon-input" data-cat-icon-input="${safe}" value="${escapeHtml(currentIcon)}" maxlength="8" placeholder="o pega cualquier emoji…">
            <button class="expense-action-btn primary" data-cat-icon-save="${safe}">Guardar</button>
            <button class="expense-action-btn" data-cat-icon-cancel="${safe}">Cancelar</button>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="categoria-row">
      <span class="categoria-name"><span class="cat-dot" style="background:${colorForCategory(nombre)}"></span><button type="button" class="cat-emoji-btn" data-cat-icon-edit="${safe}" title="Cambiar ícono">${iconForCategory(nombre)}</button>${safe}</span>
      <div class="categoria-actions">
        <button class="expense-action-btn" data-cat-edit="${safe}">Renombrar</button>
        <button class="expense-action-btn danger" data-cat-delete="${safe}">Eliminar</button>
      </div>
    </div>`;
}

async function saveCategoryIcon(nombre, icono) {
  const saveBtn = document.querySelector(`[data-cat-icon-save="${cssEscape(nombre)}"]`);
  if (saveBtn) { saveBtn.textContent = 'Guardando…'; saveBtn.disabled = true; }
  try {
    await apiSetCategoryIcon(nombre, icono);
    if (icono) state.categoryIcons[nombre] = icono; else delete state.categoryIcons[nombre];
    state.editingIcons.delete(nombre);
    renderAll();
  } catch (err) {
    showApiError('No se pudo guardar el ícono', err);
    if (saveBtn) { saveBtn.textContent = 'Error — reintentar'; saveBtn.disabled = false; }
  }
}

async function onAddCategory() {
  const input = document.getElementById('nuevaCategoriaInput');
  const btn = document.getElementById('addCategoriaBtn');
  const nombre = input.value.trim();
  if (!nombre) { input.focus(); return; }
  if (state.categories.includes(nombre)) { input.value = ''; return; }

  btn.disabled = true;
  btn.textContent = 'Agregando…';
  try {
    await apiAddCategory(nombre);
    state.categories.push(nombre);
    input.value = '';
    renderConfig();
  } catch (err) {
    setStatus('No se pudo agregar la categoría: ' + (err.message || err), 'error');
    setTimeout(() => hideStatus(), 2500);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Agregar';
  }
}

async function saveCategoryRename(oldNombre) {
  const input = document.querySelector(`[data-cat-rename-input="${cssEscape(oldNombre)}"]`);
  const saveBtn = document.querySelector(`[data-cat-save="${cssEscape(oldNombre)}"]`);
  const newNombre = input ? input.value.trim() : '';

  if (!newNombre) { input && input.focus(); return; }
  if (newNombre === oldNombre) { state.editingCategories.delete(oldNombre); renderConfig(); return; }

  if (saveBtn) { saveBtn.textContent = 'Guardando…'; saveBtn.disabled = true; }
  try {
    await apiRenameCategory(oldNombre, newNombre);
    const idx = state.categories.indexOf(oldNombre);
    if (idx !== -1) state.categories[idx] = newNombre;
    state.expenses.forEach((e) => { if (e.categoria === oldNombre) e.categoria = newNombre; });
    // El ícono vive en la misma fila del backend (rename solo cambia el nombre),
    // así que solo hace falta mover la clave en el mapa local.
    if (state.categoryIcons[oldNombre] !== undefined) {
      state.categoryIcons[newNombre] = state.categoryIcons[oldNombre];
      delete state.categoryIcons[oldNombre];
    }
    state.editingCategories.delete(oldNombre);
    renderAll();
  } catch (err) {
    showApiError('No se pudo renombrar', err);
    if (saveBtn) { saveBtn.textContent = 'Error — reintentar'; saveBtn.disabled = false; }
  }
}

async function onDeleteCategory(nombre) {
  const ok = window.confirm(`¿Eliminar la categoría "${nombre}"? Los gastos que la usan quedarán sin categoría.`);
  if (!ok) return;

  const btn = document.querySelector(`[data-cat-delete="${cssEscape(nombre)}"]`);
  if (btn) { btn.textContent = 'Eliminando…'; btn.disabled = true; }
  try {
    await apiDeleteCategory(nombre);
    state.categories = state.categories.filter((c) => c !== nombre);
    delete state.categoryIcons[nombre];
    state.expenses.forEach((e) => { if (e.categoria === nombre) { e.categoria = ''; e.estado = ESTADOS.PENDIENTE; } });
    renderAll();
  } catch (err) {
    showApiError('No se pudo eliminar la categoría', err);
    if (btn) { btn.textContent = 'Error — reintentar'; btn.disabled = false; }
  }
}

function renderComprobanteSection() {
  const select = document.getElementById('comprobanteCategoria');
  const cats = state.categories.slice().sort((a, b) => a.localeCompare(b, 'es'));
  const prevValue = select.value;
  select.innerHTML = '<option value="">Sin categoría</option>' +
    cats.map((c) => `<option value="${escapeHtml(c)}">${iconForCategory(c)} ${escapeHtml(c)}</option>`).join('');
  select.value = cats.includes(prevValue) ? prevValue : '';

  // Precargar la fecha de hoy si el campo está vacío (primera vez que se ve el formulario).
  const fechaInput = document.getElementById('comprobanteFecha');
  if (fechaInput && !fechaInput.value) {
    const d = new Date();
    fechaInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function resetComprobanteForm() {
  const form = document.getElementById('comprobanteForm');
  if (form) form.reset();
  renderComprobanteSection();
}

async function onComprobanteSubmit(ev) {
  ev.preventDefault();
  const fecha = document.getElementById('comprobanteFecha').value;
  const montoRaw = document.getElementById('comprobanteMonto').value;
  const comercio = document.getElementById('comprobanteComercio').value.trim();
  const categoria = document.getElementById('comprobanteCategoria').value;
  const btn = document.getElementById('comprobanteSubmitBtn');

  if (!fecha || !montoRaw || !comercio) {
    setStatus('Completa fecha, monto y comercio.', 'error');
    setTimeout(() => hideStatus(), 2500);
    return;
  }

  const payload = { fecha, monto: Number(montoRaw) || 0, comercio, categoria };

  btn.disabled = true;
  btn.textContent = 'Agregando…';
  try {
    await apiAddManualExpense(payload);
    resetComprobanteForm();
    setStatus('Gasto agregado ✓', 'ok');
    setTimeout(() => hideStatus(), 2200);
    loadData(false);
  } catch (err) {
    setStatus('No se pudo agregar: ' + (err.message || err), 'error');
    setTimeout(() => hideStatus(), 3000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Agregar gasto';
  }
}

function renderLogsSection() {
  state.logDetailIndex = null;
  showLogsList();
  loadLogs();
}

function showLogsList() {
  document.getElementById('logsListWrap').classList.remove('hidden');
  document.getElementById('logsDetailWrap').classList.add('hidden');
}

function showLogsDetail(idx) {
  const log = state.logs[idx];
  if (!log) return;
  state.logDetailIndex = idx;
  document.getElementById('logsListWrap').classList.add('hidden');
  document.getElementById('logsDetailWrap').classList.remove('hidden');
  renderLogDetail(log);
}

function renderLogDetail(log) {
  const isOk = String(log.estado || '').toLowerCase() === 'ok';
  document.getElementById('logsDetailDate').textContent = logFechaStr(log);
  const badge = document.getElementById('logsDetailBadge');
  badge.textContent = isOk ? 'OK' : 'Error';
  badge.className = 'log-row-badge ' + (isOk ? 'estado-ok' : 'estado-error');
  document.getElementById('logsDetailResumen').textContent = log.resumen || '';
}

async function loadLogs() {
  const listEl = document.getElementById('logsLista');
  const emptyEl = document.getElementById('logsEmpty');
  const loadingEl = document.getElementById('logsLoading');
  listEl.innerHTML = '';
  emptyEl.classList.add('hidden');
  emptyEl.textContent = 'No hay registros todavía.';
  loadingEl.classList.remove('hidden');
  try {
    const logs = await apiGetLog();
    state.logs = logs;
    loadingEl.classList.add('hidden');
    if (!logs.length) { emptyEl.classList.remove('hidden'); return; }
    listEl.innerHTML = logs.map(logRow).join('');
    listEl.querySelectorAll('[data-log-index]').forEach((el) => {
      el.addEventListener('click', () => showLogsDetail(Number(el.dataset.logIndex)));
    });
  } catch (err) {
    loadingEl.classList.add('hidden');
    emptyEl.textContent = 'No se pudo cargar el historial: ' + (err.message || err);
    emptyEl.classList.remove('hidden');
  }
}

function logFechaStr(log) {
  const d = log.fecha ? new Date(log.fecha) : null;
  return d && !isNaN(d.getTime())
    ? `${d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '';
}

function logRow(log, idx) {
  const isOk = String(log.estado || '').toLowerCase() === 'ok';
  const unrecognized = extractUnrecognizedCount(log.resumen);
  const estadoClass = !isOk ? 'estado-error' : (unrecognized ? 'estado-warn' : 'estado-ok');
  const warnBadge = unrecognized
    ? `<span class="log-row-badge estado-warn">⚠ ${unrecognized} sin reconocer</span>`
    : '';
  const fechaStr = logFechaStr(log);
  const resumenCorto = summarizeLogResumen(log.resumen)
    || ((log.resumen || '').length > 70 ? (log.resumen || '').slice(0, 70) + '…' : (log.resumen || ''));
  return `
    <div class="log-row log-row-clickable ${estadoClass}" data-log-index="${idx}">
      <div class="log-row-top">
        <span class="log-row-date">${escapeHtml(fechaStr)}</span>
        <span class="log-row-badges">${warnBadge}<span class="log-row-badge ${isOk ? 'estado-ok' : 'estado-error'}">${isOk ? 'OK' : 'Error'}</span></span>
      </div>
      <div class="log-row-resumen">${escapeHtml(resumenCorto)}</div>
    </div>`;
}

function renderEliminadosSection() {
  loadDeletedExpenses();
}

async function loadDeletedExpenses() {
  const listEl = document.getElementById('eliminadosLista');
  const emptyEl = document.getElementById('eliminadosEmpty');
  const loadingEl = document.getElementById('eliminadosLoading');
  listEl.innerHTML = '';
  emptyEl.classList.add('hidden');
  emptyEl.textContent = 'No hay gastos eliminados.';
  loadingEl.classList.remove('hidden');
  try {
    const deleted = await apiGetDeletedExpenses();
    state.deletedExpenses = deleted.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    loadingEl.classList.add('hidden');
    if (!state.deletedExpenses.length) { emptyEl.classList.remove('hidden'); return; }
    listEl.innerHTML = state.deletedExpenses.map(eliminadoRow).join('');
    listEl.querySelectorAll('[data-restore-btn]').forEach((btn) => {
      btn.addEventListener('click', () => onRestoreExpense(btn.dataset.restoreBtn));
    });
  } catch (err) {
    loadingEl.classList.add('hidden');
    emptyEl.textContent = 'No se pudo cargar: ' + (err.message || err);
    emptyEl.classList.remove('hidden');
  }
}

function eliminadoRow(e) {
  const idMail = escapeHtml(e.idMail);
  const color = colorForCategory(e.categoria);
  const icon = iconForCategory(e.categoria);
  return `
    <div class="eliminado-row" data-eliminado-idmail="${idMail}">
      <span class="eliminado-dot" style="background:${color}"></span>
      <div class="eliminado-main">
        <div class="eliminado-comercio">${escapeHtml(e.comercio || 'Sin nombre')}</div>
        <div class="eliminado-meta">${fmtDateShort(e.fecha)} · ${icon} ${escapeHtml(e.categoria || 'Sin categoría')}</div>
      </div>
      <div class="eliminado-amount">${fmtMoney(e.monto)}</div>
      <button class="expense-action-btn primary" data-restore-btn="${idMail}">Restaurar</button>
    </div>`;
}

async function onRestoreExpense(idMail) {
  const row = document.querySelector(`[data-eliminado-idmail="${cssEscape(idMail)}"]`);
  const btn = row ? row.querySelector('[data-restore-btn]') : null;
  if (btn) { btn.textContent = 'Restaurando…'; btn.disabled = true; }
  try {
    await apiRestoreExpense(idMail);
    state.deletedExpenses = state.deletedExpenses.filter((e) => e.idMail !== idMail);
    if (row) row.remove();
    if (!state.deletedExpenses.length) {
      document.getElementById('eliminadosEmpty').classList.remove('hidden');
    }
    // Refresca la lista de gastos activos en segundo plano para que el gasto
    // restaurado aparezca en Mensual/Promedio/Gastos sin esperar al próximo refresh.
    loadData(false);
  } catch (err) {
    showApiError('No se pudo restaurar', err);
    if (btn) { btn.textContent = 'Error — reintentar'; btn.disabled = false; }
  }
}
