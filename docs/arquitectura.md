# Arquitectura

## Piezas

```
Gmail (mails del banco)
   │  trigger de tiempo (scanGmailAndRegisterExpenses)
   ▼
Google Apps Script "Script Gastos"  ──►  Google Sheet (Gastos, Reglas, Categorias, Log, Dashboards)
   ▲  doPost (JSON)
   │
PWA en Netlify (public/)  (incluye Chart.js en public/vendor/)
```

1. **Ingesta.** Un trigger de tiempo corre `scanGmailAndRegisterExpenses`. Busca mails de `bancoedwards.cl` o `bancochile.cl` de los últimos 10 días, los parsea con regex según el asunto y agrega filas nuevas a la hoja `Gastos`. Evita duplicados por ID de mail. Si el comercio tiene regla en `Reglas`, el gasto entra categorizado y confirmado; si no, queda pendiente de revisar. Las transferencias siempre quedan pendientes.
2. **API.** El mismo script expone un Web App con `doPost` para lecturas y escrituras. Toda llamada lleva un secreto compartido en el cuerpo, no en la URL. Ver [api-backend.md](api-backend.md).
3. **Frontend.** PWA de una página. Lee todo con `getExpenses` al abrir y cada vez que la app vuelve a primer plano.

## Frontend

### Estado y render

Hay un solo objeto global `state` en `js/app.js` con gastos, categorías, vista activa, filtros y sets de edición. Toda actualización sigue el mismo patrón:

1. mutar `state`
2. llamar a una función `render*` que reconstruye esa sección con `innerHTML`
3. volver a enganchar los listeners sobre los elementos nuevos

No hay virtual DOM. Un render es un re-render completo de la sección.

### Vistas

Cada vista es un `<section id="view-{nombre}" class="view hidden">` en `index.html`. Los botones de la barra inferior tienen `data-view="{nombre}"`. `setActiveView(view)` muestra la sección y llama a `renderAll()`, que despacha al `render*` que corresponde.

| Vista | Función | Qué muestra |
|---|---|---|
| `mensual` | `renderMensual` | total del mes, torta por categoría, transacciones, tarjeta de proyección |
| `proyeccion-detalle` | `renderProjectionDetail` | desglose del cálculo de proyección (sin botón propio, se entra desde Mensual) |
| `promedio` | `renderPromedio` | promedio mensual, torta, barras por mes, máximo/mínimo de 30 días |
| `gastos` | `renderGastos` | lista filtrable, edición de monto/comercio/categoría, eliminar, marcar fijo |
| `revisar` | `renderRevisar` | pendientes uno por uno |
| `config` | `renderConfig` | submenú: categorías, agregar gasto, logs, eliminados |

Para agregar una vista: nueva `<section>`, nuevo botón con `data-view` y una rama en `renderAll()`.

### Organización de `public/js/`

Scripts clásicos (sin build ni módulos ES) que comparten el ámbito global. Se cargan en este orden desde `index.html` (y están en `APP_SHELL` de `sw.js`):

| Archivo | Contenido |
|---|---|
| `config.js` | `API_BASE`, `ESTADOS`, colores e íconos por categoría, meses, días, paleta de íconos |
| `calc.js` | cálculos puros, sin DOM ni `state`: `computeAvgTotal`, `resolveFixedComercios`, `computeOutlierStats`, `computeWeekdayIndices`, `computeProjectionData(expenses, avgTotal, hoy)`, `find30DayMinMaxWindows`, agrupación "Otros", resúmenes de Logs, `normalizeName` / `comercioKey` (comparar nombres de comercio) e `isNoGasto` / `gastosContables` (qué no cuenta como gasto). Reciben "hoy" como parámetro opcional. En Node se exportan con `module.exports` para los tests |
| `api.js` | clave por dispositivo (`getApiSecret`), helpers `apiRead(action)` / `apiPost(action, campos)` (ambos por POST) y una función `api*` por acción |
| `app.js` | `state`, formato de montos y fechas, modo privacidad, copia local de datos, `loadData`, toast "Deshacer", pantalla de clave, `setActiveView`/`renderAll`, arranque |
| `charts.js` | `charts`, `destroyChart`, torta por categoría y leyenda |
| `views/*.js` | `mensual`, `proyeccion`, `promedio`, `gastos`, `config`, `revisar`: un `render*` por vista y sus acciones |

Como todo es global, el orden de carga solo importa para lo que se ejecuta al cargar (constantes); las funciones se llaman después de `DOMContentLoaded`, cuando ya cargaron todos los archivos. Para agregar un archivo: `<script>` en `index.html` y entrada en `APP_SHELL`.

### Recarga al volver a la app

`visibilitychange` llama a `loadData` solo si pasó más de 1 minuto desde la última carga (`RELOAD_ON_FOCUS_MIN_MS`) y `hasUnsavedInput()` es falso. `loadData` numera cada llamada (`loadSeq`) y descarta respuestas que llegan después de una carga más nueva.

### Toast "Deshacer"

`showUndoToast(mensaje, accion)` muestra un aviso sobre la barra inferior por 6 s (`UNDO_TOAST_MS`). Hoy lo usa eliminar gasto: el gasto se elimina en el backend al tiro y "Deshacer" llama a `restoreExpense`.

### Gráficos

Chart.js 4.5.0 está en `public/vendor/chart.umd.min.js`, así los gráficos funcionan sin conexión. Las instancias viven en el objeto `charts` (clave: id del canvas) y se destruyen con `destroyChart()` antes de recrearlas. La torta reutiliza la instancia si solo cambió la selección, para no repetir la animación.

### Categorías

`CATEGORY_COLORS` y `CATEGORY_ICONS` dan color e ícono fijos a categorías conocidas. `colorForCategory()` e `iconForCategory()` caen a un color derivado del nombre y a un ícono genérico. El ícono elegido en Configuración (guardado en la hoja `Categorias`) tiene prioridad. Usar siempre esos dos helpers.

En las tortas, las categorías bajo 3% del total se agrupan en "Otros" (`groupSmallCategories`). Al seleccionar "Otros" se muestra el desglose.

### Service worker

`sw.js` es **network-first** para el app shell del mismo origen (lista `APP_SHELL`): con internet pide cada archivo a la red y guarda una copia; si no hay red, si la respuesta no es OK (por ejemplo el login de Netlify) o si tarda más de 3 s, usa la copia. Así la versión nueva llega en la primera apertura con internet. Nunca intercepta `script.google.com` ni `googleusercontent.com`. `CACHE_NAME` se sigue subiendo en cada cambio de `public/` para limpiar copias viejas.

### Copia local de los datos (sin conexión)

`app.js` guarda en `localStorage` (`gastos_datos_v1`) los últimos gastos, categorías e íconos. Al abrir, pinta con esa copia y después trae datos frescos. Si la carga falla y hay copia, muestra "Sin conexión · mostrando datos del dd/mm hh:mm". La copia se borra cuando el backend responde `unauthorized`.

### Restricción CORS

Los `POST` a Apps Script no deben llevar header `Content-Type`. Con ese header el navegador manda un preflight `OPTIONS` que Apps Script no atiende y la llamada falla sin error claro. Todas las funciones `api*` tienen el comentario `// OJO: no seteamos Content-Type...`.

## Hosting

Netlify (`gastosmati`) despliega `main` en continuo. `netlify.toml` fija `publish = "public"`, así que el resto del repo (docs, CLAUDE.md) no se publica. El sitio pide login del team de Netlify.
