# CLAUDE.md

Guía para Claude Code al trabajar en este repo.

## Qué es

PWA de una página ("Control de Gastos") que muestra y edita gastos guardados en un Google Sheet. HTML/CSS/JS plano, sin build, sin bundler, sin package.json.

Lo publicable vive en `public/` y Netlify publica solo esa carpeta (`netlify.toml`):

- `public/index.html`: todas las vistas, solo markup
- `public/js/`: lógica en scripts clásicos que comparten el ámbito global: `config.js`, `calc.js` (cálculos puros, testeados), `api.js`, `app.js` (núcleo), `charts.js`, `views/*.js`. Detalle en `docs/arquitectura.md`
- `public/css/styles.css`: todos los estilos
- `public/sw.js`: service worker (solo app shell)
- `public/manifest.json` + `public/icons/`: metadata PWA

Documentación en `docs/`: `arquitectura.md`, `api-backend.md`, `calculos.md`, `desarrollo.md`. Leer `docs/calculos.md` antes de tocar promedio o proyección.

## Comandos

- Correr local: `cd public && python3 -m http.server 8000`. Con `file://` no funciona.
- Verificar antes de commitear: `node --check` en cada archivo de `public/js/` y `node --test` (tests de cálculos). Si tocaste `public/`, también `node tests/ui-smoke.js` (necesita Playwright).
- Desplegar: push a `main` (lo hace el usuario). Netlify publica `public/` sin build.

## Reglas

- Cualquier cambio en `public/` exige subir `CACHE_NAME` en `public/sw.js` (leer el valor actual ahí). Si agregas o mueves archivos, actualizar `APP_SHELL`.
- La clave del backend nunca va en el código ni en el repo: vive en Propiedades del script (`API_SECRET`) y la app la pide por dispositivo.
- Los `POST` a Apps Script nunca llevan header `Content-Type` (provoca preflight CORS que Apps Script no atiende). Mantener el comentario `// OJO: no seteamos Content-Type...`.
- Categorías: siempre `colorForCategory()` / `iconForCategory()`.
- Gráficos: `destroyChart(id)` antes de recrear.
- Totales, promedios y proyección parten de `gastosContables()` (Fintual nunca cuenta). Comparar comercios con `comercioKey()`.
- Las lecturas y escrituras a la API van por POST (`apiRead` / `apiPost`): la clave nunca va en la URL.
- Al terminar una tarea con cambios: `git add` + `git commit` con mensaje descriptivo. Nunca `git push`.

## Backend

Google Apps Script "Script Gastos", ligado al Sheet. Copia versionada en `backend/` (clasp). Flujo en `backend/README.md`: editar `backend/Código.js` y commitear; el usuario corre `clasp push` (los triggers del escaneo lo usan al tiro) y `clasp deploy -i <ID actual>` (la app). Nunca crear una implementación nueva (cambia la URL). Nunca ejecutar `runSetupNow` (borra la hoja Gastos). Acciones y hojas en `docs/api-backend.md`.

## Arquitectura en corto

Un objeto global `state`. Cada cambio: mutar `state`, llamar `render*` (reconstruye con `innerHTML`), re-enganchar listeners. Vistas = `<section id="view-x">` + botón `data-view="x"` + rama en `renderAll()`. Detalle en `docs/arquitectura.md`.
