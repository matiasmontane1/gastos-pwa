/* ==========================================================================
   Control de Gastos — calc.js
   Cálculos puros (sin DOM ni estado global): promedio, fijos, atípicos, índices por día de semana, proyección. "Hoy" se puede pasar como parámetro para testear (tests/calc.test.js). Se carga en el navegador como script clásico y en Node con require().
   ========================================================================== */

// Con pocos días transcurridos del mes en curso, proyectar a fin de mes es muy
// ruidoso (un solo gasto grande el día 2 puede "proyectar" cualquier cosa).
// Preferimos no mostrar nada confiable antes que mostrar un número engañoso.
const PROJECTION_MIN_DAYS = 5;

// Un día de la semana con menos ocurrencias que esto en el historial usa
// índice neutro (1) en vez de su propio promedio: con muy poca muestra el
// promedio de "los martes" puede ser un solo gasto puntual, no un patrón.
const WEEKDAY_MIN_SAMPLES = 2;

// Nombres (ya normalizados) que nunca cuentan como gasto: ahorro e inversión.
// Un gasto queda fuera si su categoría es exactamente uno de estos o si su
// comercio lo contiene (ej. "Transferencia Fintual (transferencia)"). Se ven
// en la lista de Gastos, pero no entran a totales, promedios ni proyección.
const NO_GASTO_NOMBRES = ['FINTUAL'];

// Texto comparable: mayúsculas, sin tildes ni puntuación y con espacios
// simples. Así "Café Bar", "CAFE  BAR" y "cafe-bar" son el mismo comercio.
function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function comercioKey(e) {
  return normalizeName(e.comercio);
}

function isNoGasto(e) {
  const cat = normalizeName(e.categoria);
  const com = normalizeName(e.comercio);
  return NO_GASTO_NOMBRES.some((n) => cat === n || com.includes(n));
}

function gastosContables(expenses) {
  return expenses.filter((e) => !isNoGasto(e));
}

function monthKey(fechaStr) {
  // fechaStr esperado 'yyyy-MM-dd'
  if (!fechaStr || fechaStr.length < 7) return null;
  return fechaStr.slice(0, 7);
}

function distinctMonths(expenses) {
  const set = new Set();
  expenses.forEach((e) => {
    const k = monthKey(e.fecha);
    if (k) set.add(k);
  });
  return Array.from(set).sort().reverse(); // más reciente primero
}

function currentMonthKey(today) {
  const d = today || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Días transcurridos entre el primer gasto registrado y hoy (mínimo 1, para
// no dividir por cero cuando todos los gastos son de hoy mismo).
function diasDesdePrimerGasto(expenses, now) {
  expenses = gastosContables(expenses);
  const fechas = expenses.map((e) => e.fecha).filter(Boolean).sort();
  if (!fechas.length) return 1;
  const start = new Date(fechas[0] + 'T00:00:00');
  const today = new Date(now || new Date());
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - start) / 86400000) + 1;
  return Math.max(1, diff);
}

// Promedio mensual ponderado por día: en vez de dividir por la cantidad de
// meses calendario con datos (lo que sobrepesa los meses recién empezados),
// usamos el gasto diario real desde el primer gasto registrado y lo
// escalamos a 30 días. Compartido entre Vista Promedio (estadística
// principal) y la proyección de fin de mes (Vista Mensual, comparación).
function computeAvgTotal(expenses, today) {
  expenses = gastosContables(expenses);
  const totalAll = expenses.reduce((s, e) => s + (Number(e.monto) || 0), 0);
  const dias = diasDesdePrimerGasto(expenses, today);
  return (totalAll / dias) * 30;
}

// Identifica comercios "fijos" (recurrentes) para la proyección de fin de
// mes: por defecto, un comercio se considera fijo si aparece en cada uno de
// los últimos `monthsBack` meses calendario completos (sin contar el mes en
// curso). El usuario puede pisar esa detección a mano marcando/desmarcando
// gastos individuales como fijo (campo fijoManual en el gasto): una marca
// "false" excluye siempre al comercio aunque la detección automática lo
// hubiera tomado, y una marca "true" lo incluye siempre, aunque no llegue a
// los `monthsBack` meses de historial (usamos el promedio de los meses que sí
// tenga, o el propio gasto de este mes si es la primera vez que aparece).
// Devuelve un mapa { comercioNormalizado: montoMensualEsperado }. La clave es
// normalizeName(comercio): "Netflix" y "NETFLIX " cuentan como el mismo comercio.
function resolveFixedComercios(expenses, monthsBack, today) {
  expenses = gastosContables(expenses);
  monthsBack = monthsBack === undefined ? 3 : monthsBack;
  const currentKey = currentMonthKey(today);
  const monthKeysAsc = distinctMonths(expenses).filter((k) => k < currentKey).sort();
  const recentKeys = monthKeysAsc.slice(-monthsBack);

  const byComercioByMonth = {}; // comercio -> { monthKey: totalDelMes }
  const manualOverride = {}; // comercio -> true | false (true gana si hay conflicto)
  expenses.forEach((e) => {
    const c = comercioKey(e);
    if (!c) return;
    const mk = monthKey(e.fecha);
    if (recentKeys.includes(mk)) {
      byComercioByMonth[c] = byComercioByMonth[c] || {};
      byComercioByMonth[c][mk] = (byComercioByMonth[c][mk] || 0) + (Number(e.monto) || 0);
    }
    if (e.fijoManual === true) manualOverride[c] = true;
    else if (e.fijoManual === false && manualOverride[c] !== true) manualOverride[c] = false;
  });

  const fixedComercios = {};
  Object.keys(byComercioByMonth).forEach((c) => {
    if (manualOverride[c] === false) return; // el usuario dijo explícitamente que no es fijo
    const monthsPresent = recentKeys.filter((mk) => byComercioByMonth[c][mk] !== undefined);
    const autoDetected = recentKeys.length >= monthsBack && monthsPresent.length === recentKeys.length;
    if (autoDetected || manualOverride[c] === true) {
      const total = monthsPresent.reduce((s, mk) => s + byComercioByMonth[c][mk], 0);
      fixedComercios[c] = monthsPresent.length ? total / monthsPresent.length : 0;
    }
  });

  // Comercios marcados fijo a mano pero sin historial en los meses recientes
  // (ej. recién empezaste a pagarlo este mes): estimamos con el gasto de
  // este mes, que se irá afinando solo a medida que se acumule historial.
  Object.keys(manualOverride).forEach((c) => {
    if (manualOverride[c] === true && !(c in fixedComercios)) {
      const thisMonthTotal = expenses
        .filter((e) => monthKey(e.fecha) === currentKey && comercioKey(e) === c)
        .reduce((s, e) => s + (Number(e.monto) || 0), 0);
      fixedComercios[c] = thisMonthTotal;
    }
  });

  return fixedComercios;
}

// Percentil de un array YA ordenado ascendentemente (interpolación lineal,
// método estándar). q entre 0 y 1 (ej. 0.25 para el primer cuartil).
function quantile(sortedArr, q) {
  if (!sortedArr.length) return 0;
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }
  return sortedArr[base];
}

// Umbral de "gasto atípico" (método IQR) para la proyección de fin de mes,
// calculado sobre gastos VARIABLES (no fijos) históricos — hasta los últimos
// 3 meses calendario completos — en vez de sobre lo que va del mes actual.
// Usar historial en vez del mes en curso evita que el umbral se mueva todo
// el tiempo (con pocos meses de historial usamos los que haya, aunque sea
// solo 1) y que la clasificación de una misma transacción cambie según el
// día del mes en que se calcule. bound es null si no hay historial
// suficiente (0 meses completos, o menos de 4 gastos variables en total),
// caso en el que no se excluye nada del ritmo diario. Devuelve también
// q1/q3/recentKeys/basisCount para poder mostrar el detalle del cálculo.
function computeOutlierStats(expenses, fixedComercios, monthsBack, today) {
  expenses = gastosContables(expenses);
  monthsBack = monthsBack === undefined ? 3 : monthsBack;
  const currentKey = currentMonthKey(today);
  const monthKeysAsc = distinctMonths(expenses).filter((k) => k < currentKey).sort();
  const recentKeys = monthKeysAsc.slice(-monthsBack);
  if (!recentKeys.length) return { bound: null, q1: null, q3: null, recentKeys, basisCount: 0 };

  const amounts = expenses
    .filter((e) => recentKeys.includes(monthKey(e.fecha)) && !(comercioKey(e) in fixedComercios))
    .map((e) => Number(e.monto) || 0)
    .sort((a, b) => a - b);
  if (amounts.length < 4) return { bound: null, q1: null, q3: null, recentKeys, basisCount: amounts.length };

  const q1 = quantile(amounts, 0.25);
  const q3 = quantile(amounts, 0.75);
  return { bound: q3 + 1.5 * (q3 - q1), q1, q3, recentKeys, basisCount: amounts.length };
}

// Índice de estacionalidad por día de la semana: cuánto se gasta cada día de
// la semana en relación al promedio general, calculado sobre el mismo
// historial (últimos meses completos, o los que haya) usado para el umbral
// de outliers — mismos gastos variables (sin fijos). A propósito NO se
// excluyen los mismos atípicos del umbral IQR acá: ese umbral se calcula
// mezclando todos los días de la semana, así que un patrón real (ej. "los
// sábados siempre gasto ~3x más") puede verse como "atípico" y quedar
// borrado por completo si lo filtráramos con el mismo umbral — justo lo
// contrario de lo que este índice necesita capturar. El promedio de cada
// día de semana se calcula sobre TODAS sus ocurrencias calendario en el
// período (no solo los días en que hubo gasto), para no inflarlo ignorando
// los días en que no se gastó nada. Si un día de semana tiene menos de
// WEEKDAY_MIN_SAMPLES ocurrencias, usa índice neutro (1). Devuelve null si
// no hay ningún mes histórico completo (se usa ritmo plano, como si todos
// los índices fueran 1).
function computeWeekdayIndices(expenses, fixedComercios, monthsBack, today) {
  expenses = gastosContables(expenses);
  monthsBack = monthsBack === undefined ? 3 : monthsBack;
  const currentKey = currentMonthKey(today);
  const monthKeysAsc = distinctMonths(expenses).filter((k) => k < currentKey).sort();
  const recentKeys = monthKeysAsc.slice(-monthsBack);
  if (!recentKeys.length) return null;

  const sums = [0, 0, 0, 0, 0, 0, 0];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];

  recentKeys.forEach((mk) => {
    const [y, m] = mk.split('-').map(Number);
    const daysInThatMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInThatMonth; d++) {
      dayCounts[new Date(y, m - 1, d).getDay()]++;
    }
  });

  expenses.forEach((e) => {
    if (!recentKeys.includes(monthKey(e.fecha))) return;
    if (comercioKey(e) in fixedComercios) return;
    const d = new Date(e.fecha + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    sums[d.getDay()] += Number(e.monto) || 0;
  });

  const totalAmount = sums.reduce((s, v) => s + v, 0);
  const totalDays = dayCounts.reduce((s, v) => s + v, 0);
  const overallAvgPerDay = totalDays > 0 ? totalAmount / totalDays : 0;

  const indices = sums.map((sum, wd) => {
    if (dayCounts[wd] < WEEKDAY_MIN_SAMPLES || overallAvgPerDay === 0) return 1;
    return (sum / dayCounts[wd]) / overallAvgPerDay;
  });

  return { recentKeys, indices, dayCounts, overallAvgPerDay };
}

function fmtDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Recorre todas las ventanas móviles de 30 días dentro del historial de
// gastos (desde el primer gasto registrado hasta hoy) y devuelve la ventana
// con el gasto TOTAL más alto y la de gasto TOTAL más bajo — no la
// transacción individual más grande/chica, sino la suma de esos 30 días.
// Devuelve null si todavía no hay al menos 30 días de historial.
function find30DayMinMaxWindows(expenses, now) {
  expenses = gastosContables(expenses);
  const fechas = expenses.map((e) => e.fecha).filter(Boolean);
  if (!fechas.length) return null;
  const start = new Date(fechas.slice().sort()[0] + 'T00:00:00');
  const today = new Date(now || new Date());
  today.setHours(0, 0, 0, 0);
  const totalDays = Math.round((today - start) / 86400000) + 1;
  if (totalDays < 30) return null;

  const byDay = {};
  expenses.forEach((e) => {
    if (!e.fecha) return;
    byDay[e.fecha] = (byDay[e.fecha] || 0) + (Number(e.monto) || 0);
  });

  // Suma prefija por día para poder calcular cada ventana de 30 días en O(1).
  const prefix = new Array(totalDays + 1).fill(0);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    prefix[i + 1] = prefix[i] + (byDay[fmtDateKey(d)] || 0);
  }

  let best = null;
  let worst = null;
  for (let i = 0; i + 30 <= totalDays; i++) {
    const total = prefix[i + 30] - prefix[i];
    const winStart = new Date(start);
    winStart.setDate(winStart.getDate() + i);
    const winEnd = new Date(winStart);
    winEnd.setDate(winEnd.getDate() + 29);
    if (!best || total > best.total) best = { total, start: winStart, end: winEnd };
    if (!worst || total < worst.total) worst = { total, start: winStart, end: winEnd };
  }
  return { best, worst };
}

// Agrupa las categorías con menos de thresholdPct% del total en una sola
// entrada "Otros", para que la torta no quede saturada de porciones diminutas.
// Devuelve también el set de categorías originales que quedaron plegadas
// dentro de "Otros", para que quien filtre transacciones/gráficos por
// "Otros" pueda incluir a sus integrantes (ver matchesCategoryFilter).
function groupSmallCategories(entries, thresholdPct) {
  thresholdPct = thresholdPct === undefined ? 3 : thresholdPct;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const smallCatSet = new Set();
  if (total <= 0 || entries.length <= 1) return { entries: entries.slice(), smallCatSet };

  const kept = [];
  let otrosSum = 0;
  entries.forEach(([cat, amount]) => {
    const pct = (amount / total) * 100;
    if (pct < thresholdPct && cat !== 'Otros') {
      otrosSum += amount;
      smallCatSet.add(cat);
    } else {
      kept.push([cat, amount]);
    }
  });

  kept.sort((a, b) => b[1] - a[1]);
  if (otrosSum > 0) {
    const idx = kept.findIndex(([cat]) => cat === 'Otros');
    if (idx !== -1) kept[idx] = ['Otros', kept[idx][1] + otrosSum];
    else kept.push(['Otros', otrosSum]);
  }
  return { entries: kept, smallCatSet };
}

// Compara la categoría real de un gasto (catKey, ya con el fallback "Sin
// categoría" aplicado) contra la selección activa, teniendo en cuenta que
// "Otros" es un balde agrupado: si está seleccionado, cualquier categoría
// plegada dentro de smallCatSet también cuenta como match.
function matchesCategoryFilter(catKey, selectedCat, smallCatSet) {
  if (selectedCat === 'Otros') return catKey === 'Otros' || (smallCatSet && smallCatSet.has(catKey));
  return catKey === selectedCat;
}

// Calcula todos los pasos intermedios de la proyección de fin de mes.
// Función pura (no toca el DOM) para que tanto la tarjeta resumen
// (renderProjection) como la vista de detalle (renderProjectionDetail)
// usen exactamente el mismo cálculo, sin duplicar lógica.
function computeProjectionData(expenses, avgTotal, now) {
  expenses = gastosContables(expenses);
  const today = new Date(now || new Date());
  const monthKeyNow = currentMonthKey(today);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();

  if (dayOfMonth < PROJECTION_MIN_DAYS) {
    return { insufficient: true, monthKeyNow, dayOfMonth, daysInMonth };
  }

  const monthExpenses = expenses.filter((e) => monthKey(e.fecha) === monthKeyNow);
  const totalSoFar = monthExpenses.reduce((s, e) => s + (Number(e.monto) || 0), 0);

  // Separamos fijos (arriendo, suscripciones...) de variables (día a día).
  // Los fijos que ya cayeron este mes se cuentan tal cual (no se proyectan
  // de nuevo); los que todavía no cayeron se suman completos porque van a
  // pasar seguro. El ritmo diario se calcula solo sobre lo variable, para
  // que un gasto fijo grande (ej. el arriendo del día 1) no lo infle.
  const fixedComercios = resolveFixedComercios(expenses, 3, today);
  const occurredFixedComercios = new Set(
    monthExpenses.filter((e) => comercioKey(e) in fixedComercios).map(comercioKey)
  );
  const occurredFixed = monthExpenses.filter((e) => occurredFixedComercios.has(comercioKey(e)));
  // Las claves de fixedComercios van normalizadas; para mostrarlas usamos el
  // nombre con que apareció por última vez ese comercio.
  const labelFor = (key) => {
    const last = expenses
      .filter((e) => comercioKey(e) === key)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
    return last ? (last.comercio || '').trim() : key;
  };
  const missingFixed = Object.keys(fixedComercios)
    .filter((c) => !occurredFixedComercios.has(c))
    .map((c) => ({ comercio: labelFor(c), amount: fixedComercios[c] }));
  const missingFixedTotal = missingFixed.reduce((s, f) => s + f.amount, 0);

  const variableExpensesThisMonth = monthExpenses.filter((e) => !(comercioKey(e) in fixedComercios));

  // Excluimos valores atípicos (método IQR) del cálculo del ritmo diario, sin
  // sacarlos nunca del total real ya gastado: una compra grande puntual no
  // debería proyectarse como si se repitiera todos los días. El umbral se
  // calcula sobre el historial (hasta 3 meses completos anteriores, o los
  // que haya) en vez de sobre lo que va del mes actual, para que no cambie
  // según el día en que se mire y para que un mes con pocos gastos variables
  // igual tenga un umbral confiable. Si no hay historial suficiente, no se
  // excluye nada y se usa el total variable tal cual.
  const outlierInfo = computeOutlierStats(expenses, fixedComercios, 3, today);
  const excludedVariable = outlierInfo.bound !== null
    ? variableExpensesThisMonth.filter((e) => (Number(e.monto) || 0) > outlierInfo.bound)
    : [];
  const includedVariable = outlierInfo.bound !== null
    ? variableExpensesThisMonth.filter((e) => (Number(e.monto) || 0) <= outlierInfo.bound)
    : variableExpensesThisMonth.slice();
  const rateBasisTotal = includedVariable.reduce((s, e) => s + (Number(e.monto) || 0), 0);

  const remainingDays = daysInMonth - dayOfMonth;
  // Ritmo diario variable: mezcla del ritmo de lo que va del mes con el ritmo
  // histórico (meses completos usados para el umbral de atípicos, mismos
  // gastos variables sin atípicos). El mes en curso pesa cada vez más a medida
  // que avanza: w = día de hoy / días del mes. Sin esto, un par de gastos
  // grandes en los primeros días se estiraban a todo el mes (backtest con
  // septiembre 2026: error promedio 54% -> 27%, ver docs/calculos.md).
  const monthDailyRate = rateBasisTotal / dayOfMonth;
  let histDailyRate = null;
  if (outlierInfo.recentKeys.length) {
    const histDays = outlierInfo.recentKeys.reduce((s, k) => {
      const [y, m] = k.split('-').map(Number);
      return s + new Date(y, m, 0).getDate();
    }, 0);
    const histTotal = expenses
      .filter((e) => outlierInfo.recentKeys.includes(monthKey(e.fecha)))
      .filter((e) => !(comercioKey(e) in fixedComercios))
      .filter((e) => outlierInfo.bound === null || (Number(e.monto) || 0) <= outlierInfo.bound)
      .reduce((s, e) => s + (Number(e.monto) || 0), 0);
    if (histDays > 0) histDailyRate = histTotal / histDays;
  }
  const monthWeight = histDailyRate === null ? 1 : dayOfMonth / daysInMonth;
  const variableDailyRate = histDailyRate === null
    ? monthDailyRate
    : monthWeight * monthDailyRate + (1 - monthWeight) * histDailyRate;

  // En vez de proyectar el resto del mes con un ritmo plano (mismo monto
  // todos los días restantes), ajustamos cada día restante según cuánto se
  // gasta habitualmente ESE día de la semana (histórico): si quedan más
  // sábados que martes, por ejemplo, y históricamente se gasta más los
  // sábados, el proyectado sube en vez de repartirse parejo.
  const weekdayInfo = computeWeekdayIndices(expenses, fixedComercios, 3, today);
  const remainingDayList = [];
  for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
    const wd = new Date(today.getFullYear(), today.getMonth(), d).getDay();
    const index = weekdayInfo ? weekdayInfo.indices[wd] : 1;
    remainingDayList.push({ day: d, weekday: wd, index, amount: variableDailyRate * index });
  }

  // "Hoy" no se da por cerrado solo porque sea el día en curso (esto pasa
  // siempre, no solo el último día del mes): si todavía no se gastó lo
  // típico de un día como hoy, se completa la diferencia — el día sigue en
  // curso y no hay motivo para asumir que no se va a gastar nada más. Si lo
  // real ya superó lo típico, no se suma nada extra (nunca se resta). Mismo
  // criterio que ya usamos con los fijos pendientes (actual si ya cayó,
  // estimado si no), aplicado acá a "hoy" en vez de a comercios puntuales.
  const todayWeekday = today.getDay();
  const todayIndex = weekdayInfo ? weekdayInfo.indices[todayWeekday] : 1;
  const todayTypical = variableDailyRate * todayIndex;
  const todayVariableActual = variableExpensesThisMonth
    .filter((e) => Number((e.fecha || '').split('-')[2]) === dayOfMonth)
    .reduce((s, e) => s + (Number(e.monto) || 0), 0);
  const todayTopUp = Math.max(0, todayTypical - todayVariableActual);
  // Saldo de hoy sin recortar en 0 (a diferencia de todayTopUp, que sí se
  // recorta porque solo se usa para sumar a la proyección): acá el negativo
  // es información útil ("ya gastaste $X de más hoy"), no solo un cero.
  const todayRemaining = todayTypical - todayVariableActual;

  const remainingByWeekday = [0, 1, 2, 3, 4, 5, 6].map((wd) => ({
    weekday: wd,
    count: 0,
    index: weekdayInfo ? weekdayInfo.indices[wd] : 1,
    subtotal: 0
  }));
  remainingByWeekday[todayWeekday].count++;
  remainingByWeekday[todayWeekday].subtotal += todayTopUp;
  remainingDayList.forEach((r) => {
    remainingByWeekday[r.weekday].count++;
    remainingByWeekday[r.weekday].subtotal += r.amount;
  });
  const remainingProjected = todayTopUp + remainingDayList.reduce((s, r) => s + r.amount, 0);

  const projected = totalSoFar + missingFixedTotal + remainingProjected;

  let diffPct = null;
  if (avgTotal > 0 && totalSoFar > 0) {
    diffPct = Math.round(((projected - avgTotal) / avgTotal) * 100);
  }

  return {
    insufficient: false,
    monthKeyNow, dayOfMonth, daysInMonth, remainingDays,
    monthExpenses, totalSoFar,
    fixedComercios, occurredFixed, missingFixed, missingFixedTotal,
    variableExpensesThisMonth, outlierInfo, excludedVariable, includedVariable,
    rateBasisTotal, variableDailyRate, monthDailyRate, histDailyRate, monthWeight,
    weekdayInfo, remainingDayList, remainingByWeekday, remainingProjected,
    todayWeekday, todayIndex, todayTypical, todayVariableActual, todayTopUp, todayRemaining,
    projected, avgTotal, diffPct
  };
}

// Extrae de un resumen en texto libre (redactado por la tarea automática)
// cuántos gastos nuevos se agregaron, buscando frases como "3 gastos nuevos"
// o "0 nuevos agregados". Devuelve null si no se encuentra un patrón conocido.
function extractAddedCount(resumen) {
  if (!resumen) return null;
  const patterns = [
    // El escaneo escribe "N gasto(s) nuevo(s)": el "(s)" es opcional.
    /(\d+)\s+gastos?(?:\(s\))?\s+nuevos?(?:\(s\))?/i,
    /(\d+)\s+nuevos?(?:\(s\))?\s+agregados?/i,
    /(\d+)\s+nuevos?(?:\(s\))?(?![\w(])/i
  ];
  for (const re of patterns) {
    const m = resumen.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

// Cuántos mails del banco no se pudieron leer en esa corrida. El escaneo lo
// anota al final del resumen como "ATENCION: N correo(s) no reconocido(s)".
// Se muestra como badge en la lista para que no quede escondido detrás del
// resumen corto (así se perdieron 2 cargos del 2/9/2026 sin que se notara).
function extractUnrecognizedCount(resumen) {
  const m = String(resumen || '').match(/ATENCI[OÓ]N:\s*(\d+)\s+correo/i);
  return m ? Number(m[1]) : 0;
}

function summarizeLogResumen(resumen) {
  const count = extractAddedCount(resumen);
  if (count === null) return null;
  if (count === 0) return 'Sin gastos nuevos';
  return count === 1 ? '1 gasto agregado' : `${count} gastos agregados`;
}

// En Node (tests) se exporta; en el navegador `module` no existe y las
// funciones quedan como globales para el resto de los scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROJECTION_MIN_DAYS, WEEKDAY_MIN_SAMPLES, NO_GASTO_NOMBRES, normalizeName, comercioKey, isNoGasto, gastosContables, monthKey, distinctMonths, currentMonthKey, diasDesdePrimerGasto, computeAvgTotal, resolveFixedComercios, quantile, computeOutlierStats, computeWeekdayIndices, fmtDateKey, find30DayMinMaxWindows, groupSmallCategories, matchesCategoryFilter, computeProjectionData, extractAddedCount, extractUnrecognizedCount, summarizeLogResumen };
}
