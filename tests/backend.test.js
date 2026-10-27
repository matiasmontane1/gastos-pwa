// Pruebas de las funciones puras de backend/Código.js. El archivo se carga en un
// contexto aislado (vm), así que no hace falta Apps Script ni el Sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Código.js'), 'utf8'), sandbox);

test('validarFechaEdicion_: acepta hoy y fechas pasadas', () => {
  const hoy = sandbox.validarFechaEdicion_('2026-10-27', '2026-10-27');
  assert.equal(hoy.ok, true);
  assert.equal(hoy.fecha.getDate(), 27);
  assert.equal(hoy.fecha.getHours(), 12);
  assert.equal(sandbox.validarFechaEdicion_(' 2026-09-30 ', '2026-10-27').ok, true);
});

test('validarFechaEdicion_: rechaza fechas futuras', () => {
  const r = sandbox.validarFechaEdicion_('2026-10-28', '2026-10-27');
  assert.equal(r.ok, false);
  assert.match(r.error, /futura/);
});

test('validarFechaEdicion_: rechaza formatos y días que no existen', () => {
  for (const f of ['', 'hoy', '27/10/2026', '2026-10-27T10:00', '2026-02-30', '2026-13-01', '2026-00-10']) {
    assert.equal(sandbox.validarFechaEdicion_(f, '2026-12-31').ok, false, f);
  }
});
