// Tests de los cálculos puros (public/js/calc.js). Sin dependencias:
//   node --test tests/
// Todas las fechas se fijan con el parámetro "hoy" para que los resultados no
// dependan del día en que se corran.
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../public/js/calc.js');

const D = (s) => new Date(s + 'T12:00:00');
let seq = 0;
const g = (fecha, monto, comercio, extra) =>
  Object.assign({ fecha, monto, comercio, categoria: 'X', estado: 'confirmado', idMail: 'id' + (++seq), fijoManual: null }, extra);

test('quantile interpola linealmente', () => {
  assert.equal(calc.quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(calc.quantile([10], 0.25), 10);
  assert.equal(calc.quantile([], 0.5), 0);
});

test('monthKey, distinctMonths y currentMonthKey', () => {
  assert.equal(calc.monthKey('2026-10-15'), '2026-10');
  assert.deepEqual(calc.distinctMonths([g('2026-08-01', 1, 'a'), g('2026-10-01', 1, 'b'), g('2026-08-20', 1, 'c')]), ['2026-10', '2026-08']);
  assert.equal(calc.currentMonthKey(D('2026-01-31')), '2026-01');
});

test('computeAvgTotal escala el gasto diario a 30 días', () => {
  // 30 días exactos (1 al 30) con $3.000 en total -> $3.000 al mes
  const exps = [g('2026-09-01', 1000, 'a'), g('2026-09-15', 2000, 'b')];
  assert.equal(calc.computeAvgTotal(exps, D('2026-09-30')), 3000);
  // sin gastos no divide por cero
  assert.equal(calc.computeAvgTotal([], D('2026-09-30')), 0);
});

test('resolveFixedComercios: automático con 3 meses, y marcas manuales', () => {
  const hoy = D('2026-10-15');
  const exps = [
    g('2026-07-05', 5000, 'NETFLIX'), g('2026-08-05', 5000, 'NETFLIX'), g('2026-09-05', 6000, 'NETFLIX'),
    g('2026-08-10', 9000, 'UBER'), g('2026-09-10', 9000, 'UBER'),
    g('2026-10-02', 20000, 'ARRIENDO', { fijoManual: true }),
    g('2026-07-01', 100, 'METRO'), g('2026-08-01', 100, 'METRO'), g('2026-09-01', 100, 'METRO', { fijoManual: false })
  ];
  const fijos = calc.resolveFixedComercios(exps, 3, hoy);
  assert.deepEqual(Object.keys(fijos).sort(), ['ARRIENDO', 'NETFLIX']);
  assert.equal(Math.round(fijos.NETFLIX), 5333); // promedio de los 3 meses
  assert.equal(fijos.ARRIENDO, 20000);           // manual sin historial: el gasto de este mes
});

test('resolveFixedComercios: con solo 2 meses completos no detecta automáticamente', () => {
  const exps = [g('2026-08-05', 815, 'RED'), g('2026-09-05', 815, 'RED')];
  assert.deepEqual(calc.resolveFixedComercios(exps, 3, D('2026-10-15')), {});
});

test('computeOutlierStats: umbral Q3 + 1,5 × IQR sobre el historial', () => {
  const exps = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000].map((m, i) => g(`2026-09-${String(i + 1).padStart(2, '0')}`, m, 'c' + i));
  const oi = calc.computeOutlierStats(exps, {}, 3, D('2026-10-15'));
  assert.equal(oi.q1, 2750);
  assert.equal(oi.q3, 6250);
  assert.equal(oi.bound, 6250 + 1.5 * 3500);
  // menos de 4 gastos: no hay umbral
  assert.equal(calc.computeOutlierStats(exps.slice(0, 3), {}, 3, D('2026-10-15')).bound, null);
});

test('find30DayMinMaxWindows necesita 30 días y encuentra la ventana más cara', () => {
  assert.equal(calc.find30DayMinMaxWindows([g('2026-09-01', 1, 'a')], D('2026-09-20')), null);
  const exps = [g('2026-08-01', 100, 'a'), g('2026-09-10', 5000, 'b')];
  const w = calc.find30DayMinMaxWindows(exps, D('2026-10-15'));
  assert.equal(w.best.total, 5000);
  assert.equal(w.worst.total, 0);
});

test('groupSmallCategories junta lo bajo 3% en "Otros" y matchesCategoryFilter lo respeta', () => {
  const { entries, smallCatSet } = calc.groupSmallCategories([['A', 970], ['B', 20], ['C', 10]]);
  assert.deepEqual(entries, [['A', 970], ['Otros', 30]]);
  assert.ok(calc.matchesCategoryFilter('B', 'Otros', smallCatSet));
  assert.ok(!calc.matchesCategoryFilter('A', 'Otros', smallCatSet));
});

test('computeProjectionData: no proyecta antes del día 5', () => {
  const p = calc.computeProjectionData([g('2026-10-01', 1000, 'a')], 0, D('2026-10-04'));
  assert.equal(p.insufficient, true);
  assert.equal(p.dayOfMonth, 4);
});

test('computeProjectionData: sin historial usa solo el ritmo del mes', () => {
  const exps = [g('2026-10-02', 1000, 'a'), g('2026-10-05', 1000, 'b')];
  const p = calc.computeProjectionData(exps, 0, D('2026-10-10'));
  assert.equal(p.histDailyRate, null);
  assert.equal(p.monthWeight, 1);
  assert.equal(p.variableDailyRate, 2000 / 10);
  // sin historial no hay índices: el resto del mes va a ritmo plano
  assert.equal(Math.round(p.projected), Math.round(2000 + 200 /* hoy */ + 200 * 21));
});

test('computeProjectionData: mezcla el ritmo del mes con el histórico (w = día / días del mes)', () => {
  const exps = [];
  // historial (septiembre): $200 y $400 alternados -> $300/día, umbral de atípicos $700
  for (let d = 1; d <= 30; d++) exps.push(g(`2026-09-${String(d).padStart(2, '0')}`, d % 2 ? 200 : 400, 'h' + d));
  // este mes: $600/día durante 10 días (bajo el umbral, así que cuentan)
  for (let d = 1; d <= 10; d++) exps.push(g(`2026-10-${String(d).padStart(2, '0')}`, 600, 'm' + d));
  const p = calc.computeProjectionData(exps, 0, D('2026-10-10'));
  assert.equal(p.outlierInfo.bound, 700);
  assert.equal(p.monthDailyRate, 600);
  assert.equal(p.histDailyRate, 300);
  assert.equal(p.monthWeight, 10 / 31);
  // 10/31 × 600 + 21/31 × 300 = 396,77
  assert.equal(Math.round(p.variableDailyRate * 100) / 100, 396.77);
  assert.ok(p.projected >= p.totalSoFar);
});

test('computeProjectionData: lo que falta de hoy nunca resta', () => {
  const exps = [g('2026-10-03', 1000, 'a'), g('2026-10-10', 50000, 'hoy')];
  const p = calc.computeProjectionData(exps, 0, D('2026-10-10'));
  assert.equal(p.todayTopUp, 0);
  assert.ok(p.todayRemaining < 0);
});

test('resúmenes de Logs: gastos nuevos y mails sin reconocer', () => {
  const r = 'Corrida automatica: 1 gasto(s) nuevo(s) por un total de $1.900. ATENCION: 2 correo(s) no reconocido(s), revisar a mano';
  assert.equal(calc.extractAddedCount(r), 1);
  assert.equal(calc.extractUnrecognizedCount(r), 2);
  assert.equal(calc.summarizeLogResumen('0 gasto(s) nuevo(s).'), 'Sin gastos nuevos');
  assert.equal(calc.extractUnrecognizedCount('sin avisos'), 0);
});

test('normalizeName ignora mayúsculas, tildes, puntuación y espacios repetidos', () => {
  assert.equal(calc.normalizeName('  Café-Bar. '), 'CAFE BAR');
  assert.equal(calc.normalizeName('CAFE   BAR'), 'CAFE BAR');
  assert.equal(calc.normalizeName(null), '');
});

test('resolveFixedComercios agrupa variantes del mismo comercio', () => {
  const exps = [g('2026-07-05', 5000, 'Café Bar'), g('2026-08-05', 5000, 'CAFE  BAR'), g('2026-09-05', 5000, 'cafe-bar.')];
  const fijos = calc.resolveFixedComercios(exps, 3, D('2026-10-15'));
  assert.deepEqual(Object.keys(fijos), ['CAFE BAR']);
  assert.equal(fijos['CAFE BAR'], 5000);
});

test('computeProjectionData: fijos con nombres distintos, se muestra el nombre más reciente', () => {
  const base = [
    g('2026-08-05', 6000, 'Netflix', { fijoManual: true }), g('2026-09-05', 6000, 'NETFLIX'),
    g('2026-10-02', 1000, 'a'), g('2026-10-06', 1000, 'b')
  ];
  const sinCaer = calc.computeProjectionData(base, 0, D('2026-10-10'));
  assert.equal(sinCaer.missingFixed.length, 1);
  assert.equal(sinCaer.missingFixed[0].comercio, 'NETFLIX');
  assert.equal(sinCaer.missingFixed[0].amount, 6000);
  const yaCayo = calc.computeProjectionData(base.concat([g('2026-10-07', 6000, 'netflix.')]), 0, D('2026-10-10'));
  assert.equal(yaCayo.missingFixed.length, 0);
  assert.equal(yaCayo.occurredFixed.length, 1);
});

test('Fintual nunca cuenta: ni promedio, ni ventanas, ni proyección', () => {
  const hoy = D('2026-10-10');
  const base = [g('2026-09-01', 1000, 'a'), g('2026-09-15', 2000, 'b'), g('2026-10-02', 3000, 'c'), g('2026-10-06', 1000, 'd')];
  const fintual = [
    g('2026-09-20', 500000, 'Transferencia Fintual (transferencia)'),
    g('2026-09-21', 300000, 'Aporte', { categoria: 'Fintual' }),
    g('2026-10-03', 400000, 'FINTUAL SPA')
  ];
  const todos = base.concat(fintual);
  assert.ok(fintual.every(calc.isNoGasto));
  assert.ok(!base.some(calc.isNoGasto));
  assert.deepEqual(calc.gastosContables(todos), base);
  assert.equal(calc.computeAvgTotal(todos, hoy), calc.computeAvgTotal(base, hoy));
  assert.deepEqual(calc.find30DayMinMaxWindows(todos, D('2026-10-31')), calc.find30DayMinMaxWindows(base, D('2026-10-31')));
  const pConFintual = calc.computeProjectionData(todos, 0, hoy);
  const pSin = calc.computeProjectionData(base, 0, hoy);
  assert.equal(pConFintual.totalSoFar, pSin.totalSoFar);
  assert.equal(pConFintual.projected, pSin.projected);
});
