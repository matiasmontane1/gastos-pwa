# Cálculos

Todo se calcula en el navegador. Las fórmulas puras están en `public/js/calc.js` (con tests en `tests/`) y las vistas que las usan en `public/js/views/`. Base: todos los gastos no eliminados (confirmados, auto y pendientes), salvo lo que no cuenta como gasto (ver abajo).

## Qué no cuenta como gasto

Los movimientos de Fintual (ahorro e inversión) no cuentan nunca: ni en totales del mes, gráficos, promedio, máximo y mínimo de 30 días, ni en la proyección. Un gasto queda fuera si su categoría es `Fintual` o si el nombre del comercio contiene "Fintual" (da igual mayúsculas o tildes). Sigue apareciendo en la lista de Gastos con la marca "No cuenta" y no pasa por Revisar. La lista vive en `NO_GASTO_NOMBRES` (`calc.js`) y cada función de cálculo la aplica por su cuenta (`gastosContables`).

## Promedio mensual (`computeAvgTotal`)

```
días = (hoy − fecha del primer gasto) + 1
promedio mensual = (total gastado / días) × 30
```

Se usa gasto diario en vez de "total / meses con datos" para que un mes recién empezado no pese lo mismo que uno completo. El promedio por categoría usa la misma fórmula con el total de cada categoría.

## Máximo y mínimo (`find30DayMinMaxWindows`)

Recorre todas las ventanas móviles de 30 días desde el primer gasto hasta hoy y devuelve la de mayor y la de menor gasto total. Necesita al menos 30 días de historial.

## Proyección de fin de mes (`computeProjectionData`)

Solo para el mes en curso y desde el día 5 (`PROJECTION_MIN_DAYS`).

```
proyectado = gastado hasta hoy
           + fijos que todavía no caen
           + variable proyectado (lo que falta de hoy + días restantes)
```

### 1. Gastos fijos (`resolveFixedComercios`)

- Automático: un comercio es fijo si aparece en **cada uno** de los últimos 3 meses calendario completos. Su monto esperado es el promedio mensual en esos meses.
- Manual: el botón de 3 estados en Gastos (`fijoManual`) pisa la detección. `true` lo incluye siempre; `false` lo excluye siempre. Si un comercio marcado fijo no tiene historial, se estima con lo gastado este mes.
- Los fijos que ya cayeron este mes cuentan por su monto real. Los que faltan se suman completos.

Los comercios se comparan normalizados (`normalizeName`): sin diferencias de mayúsculas, tildes, puntuación ni espacios repetidos. "Netflix", "NETFLIX " y "netflix." son el mismo comercio. Donde se listan fijos que faltan se muestra el nombre con que apareció por última vez.

### 2. Atípicos (`computeOutlierStats`)

Sobre los gastos **variables** de los últimos 3 meses completos (no el mes actual):

```
Q1 = percentil 25,  Q3 = percentil 75
umbral = Q3 + 1,5 × (Q3 − Q1)
```

Los gastos variables de este mes sobre el umbral no entran al ritmo diario, pero sí al total ya gastado. Se necesitan al menos 4 gastos en la muestra; si no, no se excluye nada.

### 3. Ritmo diario variable (mezcla con el historial)

```
ritmo del mes      = (variables de este mes sin atípicos) / día del mes
ritmo histórico    = (variables sin atípicos de los meses completos) / días de esos meses
w                  = día del mes / días del mes
ritmo base         = w × ritmo del mes + (1 − w) × ritmo histórico
```

El mes en curso pesa más a medida que avanza. Sin meses completos de historial, `ritmo base = ritmo del mes`. Los meses del historial son los mismos que usa el umbral de atípicos (hasta 3 completos).

Ejemplo (15/10/2026): w = 15/31 = 0,48; ritmo = 0,48 × $4.169 + 0,52 × $3.870 = $4.015/día; proyección $127.966 (antes $130.478).

**Por qué (oct 2026):** backtest de septiembre 2026 simulando cada día del 5 al 29 con los datos de ese momento (real: $169.654):

| Fórmula | Error promedio | Error 1ª quincena |
|---|---|---|
| Ritmo solo del mes (anterior) | 54% | 92% |
| C3: dividir por Σ índices de los días transcurridos | 51% | 87% |
| C4: solo días cerrados, sin atípicos en "hoy" | 57% | 96% |
| Mezcla con historial (actual) | 27% | 36% |

Septiembre tuvo el 61% del gasto en los primeros 5 días; la fórmula anterior estiraba ese ritmo a todo el mes. C3 y C4 se descartaron. Evidencia de un solo mes (agosto como historial): volver a medir cuando haya más meses.

### 4. Índice por día de semana (`computeWeekdayIndices`)

Sobre los mismos 3 meses completos, gastos variables, **sin** filtrar atípicos:

```
promedio del día d = gasto total de los d / cantidad de días d en el período
índice(d)          = promedio del día d / promedio diario general
```

Si un día de semana tiene menos de 2 ocurrencias, índice = 1. Sin meses completos, todos valen 1.

Cada día restante se proyecta como `ritmo base × índice(día)`.

### 5. Hoy

Hoy nunca se da por cerrado:

```
típico de hoy   = ritmo base × índice(hoy)
todayTopUp      = max(0, típico de hoy − variable gastado hoy)   → se suma a la proyección
todayRemaining  = típico de hoy − variable gastado hoy            → card "Saldo disponible para hoy"
```

Si `todayRemaining` es negativo, la card dice "Ya gastaste de más hoy".

### 6. Comparación

```
diferencia % = (proyectado − promedio mensual) / promedio mensual × 100
```

Menos de 5% en valor absoluto se muestra como "≈ tu promedio".

## Agrupación "Otros"

En las tortas, las categorías con menos de 3% del total se suman a "Otros". Filtrar por "Otros" incluye esas categorías.

## Datos a tener en cuenta

- Los gastos eliminados (borrado suave) no entran en ningún cálculo.
- Con poco historial (menos de 3 meses completos), la detección automática de fijos no se activa. En ese caso conviene marcar los fijos a mano con "Fijo manual".
