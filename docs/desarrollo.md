# Desarrollo

## Requisitos

Nada que instalar para la app. Para verificar: Node (para `node --check`) y Python o cualquier servidor estático.

## Correr en local

```bash
cd public
python3 -m http.server 8000
```

La app local habla con el backend real (mismo `API_BASE`), así que lo que edites ahí cambia el Sheet de verdad. La primera vez pide la clave de acceso (cada origen, como `localhost:8000`, guarda la suya); sin ella el backend rechaza las llamadas.

## Checklist antes de commitear

1. `for f in public/js/*.js public/js/views/*.js; do node --check "$f"; done`
1. `node --test` (tests de `calc.js` en `tests/`, sin dependencias)
2. Si tocaste algo en `public/`, subir `CACHE_NAME` en `public/sw.js` (`gastos-shell-vN` → `vN+1`). Si no, la PWA instalada sigue mostrando la versión vieja.
3. Si agregaste o moviste un archivo de `public/`, revisar la lista `APP_SHELL` en `sw.js`.
4. Nuevos `POST` sin header `Content-Type`.
5. Si tocaste `public/`, `node tests/ui-smoke.js` (ver Tests) y mirar la app en el navegador local.
6. `git add` + `git commit` con mensaje descriptivo. El push a `main` lo hace el mantenedor del repo; Netlify publica al recibirlo.

## Tests

- **Cálculos:** `node --test` corre `tests/calc.test.js` contra `public/js/calc.js` (promedio, fijos, atípicos, ventanas de 30 días, proyección con mezcla, resúmenes de Logs). Todas las fechas se fijan con el parámetro "hoy".
- **Interfaz:** `node tests/ui-smoke.js` levanta `public/` en un servidor local, simula la API de Apps Script (nada toca el Sheet real) y recorre la app en un Chromium sin interfaz con el reloj fijo. Revisa que las cinco vistas se muestren, que Mensual dibuje el gráfico y la proyección, que Fintual no entre al total, que editar la fecha acepte pasadas y rechace futuras, que eliminar y deshacer escriban por POST y que la clave nunca viaje en una URL. Requiere Playwright (`npm i -g playwright && npx playwright install chromium`); no es dependencia del repo y `node --test` no lo corre.

## Desplegar

Push a `main`. Netlify publica `public/` (definido en `netlify.toml`, sin comando de build). Los usuarios con la PWA instalada reciben la versión nueva cuando el service worker detecta el `CACHE_NAME` nuevo; a veces hace falta cerrar y abrir la app dos veces.

## Cambios en el backend

Ver [`backend/README.md`](../backend/README.md). Resumen: `clasp pull`, editar `backend/Código.js`, commit, `clasp push` y `clasp deploy -i <ID actual>`.

## Convenciones

- Totales, promedios y proyección parten de `gastosContables(...)`, que deja fuera lo que no cuenta como gasto (Fintual). Los nombres de comercio se comparan con `comercioKey(e)`, no con `e.comercio`.
- Categorías: usar siempre `colorForCategory()` e `iconForCategory()`.
- Texto que viene del Sheet: pasar por `escapeHtml()` antes de meterlo en `innerHTML`.
- Montos en dashboards: usar `fmtMoneyPriv()` y guardar el valor en `data-amount` para que funcione el modo privacidad.
- Gráficos: `destroyChart(id)` antes de crear uno nuevo en el mismo canvas.
- Al crear una categoría desde un gasto, llamar `apiAddCategory` además de `apiUpdateCategory`.
