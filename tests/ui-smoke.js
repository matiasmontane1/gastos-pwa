// Prueba de humo de la interfaz. No forma parte de `node --test`:
//   node tests/ui-smoke.js
// Sirve public/ en un servidor local, simula la API de Apps Script (nada toca el
// Sheet real) y recorre la app en un Chromium sin interfaz con el reloj fijo.
// Requiere Playwright (npm i -g playwright && npx playwright install chromium);
// no es dependencia del repo.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Falta Playwright: npm i -g playwright && npx playwright install chromium');
  process.exit(2);
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'text/plain' });
    res.end(data);
  });
});

// Datos de prueba: agosto a octubre 2026, un pendiente y una transferencia a Fintual.
const COMERCIOS = [['UNIMARC', 'Supermercado'], ['UBER', 'Transporte'], ['STARBUCKS', 'Café'], ['NETFLIX', 'Suscripciones'], ['COPEC', 'Transporte']];
const expenses = [];
let n = 0;
for (const m of [8, 9, 10]) {
  for (let d = 1; d <= (m === 10 ? 26 : 28); d += 2) {
    const [comercio, categoria] = COMERCIOS[n % 5];
    const pendiente = n % 7 === 0;
    expenses.push({
      fecha: `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      monto: 3000 + (n * 1370) % 25000, comercio, categoria: pendiente ? '' : categoria,
      mailOrigen: 'Cargo en Cuenta', estado: pendiente ? 'pendiente de revisar' : 'confirmado', idMail: 'id' + n, fijoManual: null
    });
    n++;
  }
}
expenses.push({ fecha: '2026-10-03', monto: 500000, comercio: 'Transferencia Fintual (transferencia)', categoria: 'Fintual', mailOrigen: 'Transferencia', estado: 'pendiente de revisar', idMail: 'fintual1', fijoManual: null });
const esperadoOctubre = expenses
  .filter((e) => e.fecha.startsWith('2026-10') && e.categoria !== 'Fintual')
  .reduce((s, e) => s + e.monto, 0);
let eliminados = [];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const fallos = [];
  const check = (ok, msg) => { if (!ok) fallos.push(msg); };
  page.on('pageerror', (e) => fallos.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') fallos.push('console: ' + m.text()); });

  const llamadas = [];
  const cuerpos = [];
  const urlsApi = [];
  await page.route('**/script.google.com/**', async (route) => {
    const req = route.request();
    urlsApi.push({ method: req.method(), url: req.url() });
    const body = req.method() === 'GET' ? Object.fromEntries(new URL(req.url()).searchParams) : JSON.parse(req.postData() || '{}');
    const action = body.action;
    llamadas.push(action);
    cuerpos.push(body);
    const out = { ok: true };
    if (action === 'getExpenses') out.expenses = expenses;
    else if (action === 'getDeletedExpenses') out.expenses = eliminados;
    else if (action === 'getCategories') { out.categories = ['Supermercado', 'Transporte', 'Café', 'Suscripciones', 'Fintual']; out.icons = {}; }
    else if (action === 'getLastRun') out.lastRun = '2026-10-27T08:00:00Z';
    else if (action === 'getLog') out.logs = [];
    else if (action === 'updateExpense') {
      const e = expenses.find((x) => x.idMail === body.idMail);
      if (e) Object.assign(e, { estado: 'confirmado' }, ...['comercio', 'monto', 'fecha'].filter((k) => body[k] !== undefined).map((k) => ({ [k]: body[k] })));
    } else if (action === 'deleteExpense') {
      const i = expenses.findIndex((e) => e.idMail === body.idMail);
      if (i >= 0) eliminados.push(expenses.splice(i, 1)[0]);
    } else if (action === 'restoreExpense') {
      const i = eliminados.findIndex((e) => e.idMail === body.idMail);
      if (i >= 0) expenses.push(eliminados.splice(i, 1)[0]);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });

  await page.addInitScript(() => { localStorage.setItem('gastos_api_key', 'clave-de-prueba'); });
  await page.clock.install({ time: new Date('2026-10-27T12:00:00-03:00') });
  await page.goto(base);
  await page.waitForTimeout(1500);

  // 1. Cada vista se muestra con contenido.
  for (const v of ['mensual', 'promedio', 'gastos', 'revisar', 'config']) {
    await page.click(`.nav-btn[data-view="${v}"]`);
    await page.waitForTimeout(400);
    const ok = await page.evaluate((v) => {
      const s = document.getElementById('view-' + v);
      return !!s && !s.classList.contains('hidden') && s.innerText.trim().length > 20;
    }, v);
    check(ok, 'la vista ' + v + ' no se muestra con contenido');
  }

  // 2. Mensual: gráfico, proyección y total sin Fintual.
  await page.click('.nav-btn[data-view="mensual"]');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => document.querySelectorAll('#view-mensual canvas').length) >= 1, 'Mensual no dibuja el gráfico');
  check(await page.evaluate(() => /proyecci/i.test(document.getElementById('projectionCard').innerText)), 'Mensual no muestra la proyección');
  const total = Number(await page.getAttribute('#mensualTotal', 'data-amount'));
  check(total === esperadoOctubre, `el total de octubre es ${total}, esperado ${esperadoOctubre} (sin Fintual)`);

  // 3. Fintual: aparece en Gastos marcado y no entra a Revisar.
  await page.click('.nav-btn[data-view="gastos"]');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => /no cuenta/i.test(document.getElementById('gastosLista').innerText)), 'Gastos no marca el movimiento de Fintual como "No cuenta"');
  check(await page.evaluate(() => pendingExpenses().every((e) => !isNoGasto(e))), 'Revisar incluye movimientos de Fintual');

  // 4. Editar la fecha: pasada o de hoy sí, futura no.
  const idEdit = await page.getAttribute('[data-edit-btn]', 'data-edit-btn');
  await page.click(`[data-edit-btn="${idEdit}"]`);
  const campoFecha = `[data-edit-fecha="${idEdit}"]`;
  check(await page.locator(campoFecha).count() === 1, 'el modo edición no muestra el campo de fecha');
  await page.fill(campoFecha, '2026-10-28');
  await page.click(`[data-save-edit="${idEdit}"]`);
  await page.waitForTimeout(300);
  check(!llamadas.includes('updateExpense'), 'se envió una fecha futura al backend');
  check(await page.locator(campoFecha).count() === 1, 'una fecha futura cerró el modo edición');
  await page.fill(campoFecha, '2026-09-30');
  await page.click(`[data-save-edit="${idEdit}"]`);
  await page.waitForTimeout(400);
  const envio = cuerpos.find((b) => b.action === 'updateExpense');
  check(!!envio && envio.fecha === '2026-09-30', 'updateExpense no llevó la fecha nueva');
  check(await page.evaluate((id) => state.expenses.find((e) => e.idMail === id).fecha, idEdit) === '2026-09-30', 'la fecha nueva no quedó en la lista');

  // 5. Eliminar y deshacer (escrituras por POST).
  const antes = await page.evaluate(() => state.expenses.length);
  await page.click('[data-delete-btn]');
  await page.waitForTimeout(400);
  check(llamadas.includes('deleteExpense'), 'eliminar no llamó a deleteExpense');
  check(await page.evaluate(() => !document.getElementById('undoToast').classList.contains('hidden')), 'no apareció el aviso "Deshacer"');
  await page.click('#undoToastBtn');
  await page.waitForTimeout(400);
  check(llamadas.includes('restoreExpense'), 'deshacer no llamó a restoreExpense');
  check(await page.evaluate(() => state.expenses.length) === antes, 'deshacer no devolvió el gasto');

  // 6. La clave nunca viaja en la URL y no hay GET a la API.
  check(urlsApi.every((r) => !r.url.includes('secret=')), 'la clave viaja en una URL');
  check(urlsApi.every((r) => r.method === 'POST'), 'hay llamadas GET a la API');

  console.log(fallos.length ? 'FALLÓ:\n- ' + fallos.join('\n- ') : `OK: ${llamadas.length} llamadas a la API, 5 vistas, total de octubre ${total}`);
  await browser.close();
  server.close();
  process.exit(fallos.length ? 1 : 0);
})();
