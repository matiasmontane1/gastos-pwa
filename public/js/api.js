/* ==========================================================================
   Control de Gastos — api.js
   Clave de acceso por dispositivo y llamadas al Web App de Apps Script. OJO: los POST nunca llevan header Content-Type (evita el preflight CORS).
   ========================================================================== */

// La clave del backend NO vive en el código (el repo y el sitio no deben
// contenerla). Se pide una vez por dispositivo en la pantalla "Clave de
// acceso" y se guarda en localStorage. Si localStorage no está disponible
// (ej. navegación privada) se mantiene solo en memoria mientras la app esté
// abierta.
const API_KEY_STORAGE = 'gastos_api_key';

let apiKeyMemory = '';

function getApiSecret() {
  try { return localStorage.getItem(API_KEY_STORAGE) || apiKeyMemory; } catch (e) { return apiKeyMemory; }
}

function setApiSecret(value) {
  apiKeyMemory = value;
  try {
    if (value) localStorage.setItem(API_KEY_STORAGE, value);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch (e) { /* localStorage no disponible: queda solo en memoria */ }
}

function isUnauthorizedError(err) {
  return /unauthorized/i.test(String(err && err.message ? err.message : err));
}

// Todas las llamadas pasan por estos helpers: agregan la clave, revisan
// la respuesta y lanzan un Error con el mensaje del backend si data.ok es
// false (ej. "Error: unauthorized", que app.js usa para volver a pedir la
// clave).
// Las lecturas también van por POST: así la clave viaja en el cuerpo y no en la
// URL (donde quedaría en el historial del navegador y en logs).
async function apiRead(action, fallbackError) {
  return apiPost(action, {}, fallbackError || 'Error desconocido');
}

async function apiPost(action, fields, fallbackError) {
  // OJO: no seteamos Content-Type manualmente para evitar preflight CORS
  // (Apps Script no responde el OPTIONS y la llamada falla en silencio).
  const res = await fetch(API_BASE, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action, secret: getApiSecret() }, fields))
  });
  if (!res.ok) throw new Error('Error de red (' + res.status + ')');
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || fallbackError || 'No se pudo guardar');
  return data;
}

// ---- Lecturas ----
async function apiGetExpenses() {
  return (await apiRead('getExpenses')).expenses || [];
}
async function apiGetLastRun() {
  return (await apiRead('getLastRun')).lastRun || null;
}
async function apiGetCategories() {
  const data = await apiRead('getCategories');
  return { categories: data.categories || [], icons: data.icons || {} };
}
async function apiGetLog() {
  return (await apiRead('getLog')).logs || [];
}
async function apiGetDeletedExpenses() {
  return (await apiRead('getDeletedExpenses')).expenses || [];
}

// ---- Escrituras ----
function apiUpdateCategory(idMail, categoria) {
  return apiPost('updateExpenseCategory', { idMail, categoria }, 'No se pudo guardar');
}
function apiUpdateExpense(idMail, fields) {
  const body = { idMail };
  if (fields.monto !== undefined) body.monto = fields.monto;
  if (fields.comercio !== undefined) body.comercio = fields.comercio;
  if (fields.categoria !== undefined) body.categoria = fields.categoria;
  if (fields.fecha !== undefined) body.fecha = fields.fecha;
  return apiPost('updateExpense', body, 'No se pudo guardar');
}
function apiDeleteExpense(idMail) {
  return apiPost('deleteExpense', { idMail }, 'No se pudo eliminar');
}
function apiRestoreExpense(idMail) {
  return apiPost('restoreExpense', { idMail }, 'No se pudo restaurar');
}
// valor: true (marcar fijo) | false (marcar no fijo) | null (volver a automático)
function apiSetFijoManual(idMail, valor) {
  return apiPost('setFijoManual', { idMail, valor }, 'No se pudo guardar');
}
function apiAddManualExpense(payload) {
  return apiPost('appendManualExpense', payload, 'No se pudo agregar el gasto');
}
function apiAddCategory(nombre) {
  return apiPost('addCategory', { nombre }, 'No se pudo agregar');
}
function apiRenameCategory(oldNombre, newNombre) {
  return apiPost('renameCategory', { oldNombre, newNombre }, 'No se pudo renombrar');
}
function apiSetCategoryIcon(nombre, icono) {
  return apiPost('setCategoryIcon', { nombre, icono }, 'No se pudo guardar el ícono');
}
function apiDeleteCategory(nombre) {
  return apiPost('deleteCategory', { nombre }, 'No se pudo eliminar');
}
