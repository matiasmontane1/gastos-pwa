# Control de Gastos

PWA personal para ver, revisar y corregir gastos. Los gastos llegan solos: un script de Google Apps Script lee desde Gmail los avisos de cargos y transferencias de Banco Edwards y Banco de Chile, y los guarda en un Google Sheet. La app es una página web instalable que lee y escribe ese Sheet a través de una API del mismo script.

## Cómo funciona

1. El banco envía un mail a Gmail.
2. Un trigger de Apps Script (07, 15 y 20 h) busca mails nuevos, extrae monto, comercio y fecha con expresiones regulares y agrega una fila a la hoja `Gastos`. Si el comercio tiene regla en la hoja `Reglas`, el gasto queda categorizado y confirmado. Si no, queda pendiente de revisar.
3. La app (`public/`) consulta esos datos con `doGet` y `doPost` del script, y los muestra en vistas: mensual, promedio, proyección, gastos y revisar.
4. Promedio, gastos fijos, atípicos y proyección se calculan en el navegador.

Detalle en [docs/arquitectura.md](docs/arquitectura.md).

## Qué hay en el repo

- `public/`: lo único que publica Netlify (HTML, CSS, JS, service worker).
- `backend/`: copia del script de Apps Script (`Código.js`), sincronizada con clasp.
- `tests/`: pruebas de los cálculos.
- `docs/`: documentación técnica.

## Qué no hay en el repo

El repo no corre por sí solo. Faltan el Google Sheet con los datos, el proyecto de Apps Script ligado a ese Sheet, la clave de la API (`API_SECRET`, que vive en las propiedades del script y nunca en el código) y el sitio de Netlify. Sin esa clave el backend rechaza toda llamada (`unauthorized`), así que una copia de este repo no puede leer ni modificar los datos de nadie.

## Correr en local

```bash
cd public
python3 -m http.server 8000
```

Abrir http://localhost:8000. Con `file://` no funciona.

La app pedirá una clave de acceso. Sin ella no carga ningún dato. Para ver la interfaz funcionando sin backend, usa `node tests/ui-smoke.js` (ver Tests). Quien tenga la clave debe recordar que la copia local escribe en el Sheet real.

## Tests

```bash
node --test              # cálculos (public/js/calc.js)
node tests/ui-smoke.js   # interfaz con la API simulada; requiere Playwright
```

Ninguno necesita backend ni clave.

## Glosario

- **Estado** (columna F de `Gastos`):
  - `pendiente de revisar`: llegó sin categoría confirmada.
  - `auto - sin confirmar`: tiene categoría puesta automáticamente, falta confirmarla.
  - `confirmado`: revisado, o categorizado por una regla.
- **No cuenta**: los movimientos de Fintual (ahorro e inversión) se ven en Gastos pero no entran a totales, promedios ni proyección.
- **Eliminado**: borrado suave. Se puede restaurar desde Configuración.
- **Fijo manual**: `true` fuerza que un comercio cuente como gasto fijo, `false` lo excluye, vacío deja la detección automática.
- **Atípico**: gasto variable por encima del umbral estadístico de los últimos meses (ver `docs/calculos.md`).

## Orden de lectura

1. [docs/arquitectura.md](docs/arquitectura.md): piezas, estado, vistas y service worker.
2. [docs/calculos.md](docs/calculos.md): fórmulas de promedio, fijos, atípicos y proyección.
3. [docs/api-backend.md](docs/api-backend.md): acciones de la API, hojas del Sheet y escaneo de Gmail.
4. [docs/desarrollo.md](docs/desarrollo.md): checklist antes de commitear y cómo se despliega.
5. [backend/README.md](backend/README.md): cómo cambiar el script de Apps Script.
