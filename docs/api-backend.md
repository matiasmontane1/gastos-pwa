# Backend (Google Apps Script)

Proyecto "Script Gastos" en script.google.com, ligado al Google Sheet. Un solo archivo, `backend/Código.js` (~835 líneas). Desde el 2026-10-15 está versionado en `backend/` con clasp.

## Cómo cambiarlo

Ver [`backend/README.md`](../backend/README.md): `clasp pull` → editar `backend/Código.js` → commit → `clasp push` (los triggers lo usan al tiro) → `clasp deploy -i <ID de la implementación actual>` para la app. Nunca crear una implementación nueva: cambia la URL. Si la URL cambiara, actualizar `API_BASE` en `public/js/config.js`.

## Autenticación

Cada llamada manda `secret` como campo del JSON de un POST (la clave no viaja en la URL). `checkAuth_` lo compara con la propiedad `API_SECRET` de **Configuración del proyecto → Propiedades del script** y lanza `unauthorized` si no coincide o si la propiedad no existe. La clave no está en el código del backend ni en el del frontend: la app la pide una vez por dispositivo (pantalla "Clave de acceso") y la guarda en `localStorage`.

Debe ser larga y aleatoria (32 caracteres o más). Para rotarla: cambiar el valor de la propiedad (no hace falta publicar versión nueva) y escribir la clave nueva en cada dispositivo; la app la pide sola al recibir `unauthorized`.

Hay una sola implementación activa del Web App. Cómo publicar cambios sin cambiar la URL está en `backend/README.md`.

Todas las respuestas son JSON con `ok: true|false`. Si falla, viene `error`.

`doPost` toma `LockService.getScriptLock()` (espera hasta 30 s) para que la app y el escaneo no escriban a la vez. Si no lo consigue responde `ok: false, error: 'Servidor ocupado, intenta de nuevo'`.

Desde la Versión 29 el Web App solo expone las acciones que usa la app (S4).

## Acciones de lectura (`doPost`)

Se resuelven antes del bloqueo de escritura, porque leer no escribe.

| Acción | Respuesta | Usada por la app |
|---|---|---|
| `getExpenses` | `expenses[]` (sin eliminados) | sí |
| `getDeletedExpenses` | `expenses[]` (solo eliminados) | sí |
| `getCategories` | `categories[]`, `icons{}` | sí |
| `getLastRun` | `lastRun` (ISO de la última corrida OK) | sí |
| `getLog` | `logs[]` | sí |

## Acciones de escritura (`doPost`)

| Acción | Campos | Usada por la app |
|---|---|---|
| `updateExpenseCategory` | `idMail`, `categoria` | sí (también confirma el gasto) |
| `updateExpense` | `idMail`, `monto?`, `comercio?`, `categoria?`, `fecha?` (yyyy-MM-dd, día real y no futura; si es inválida no se escribe nada) | sí |
| `deleteExpense` | `idMail` | sí (borrado suave: marca columna Eliminado) |
| `restoreExpense` | `idMail` | sí |
| `setFijoManual` | `idMail`, `valor` (`true`, `false` o `null`) | sí |
| `appendManualExpense` | `fecha`, `monto`, `comercio`, `categoria` | sí |
| `addCategory` | `nombre` | sí |
| `renameCategory` | `oldNombre`, `newNombre` | sí |
| `deleteCategory` | `nombre` | sí |
| `setCategoryIcon` | `nombre`, `icono` | sí |

## Objeto gasto

```json
{
  "fecha": "2026-10-13",
  "monto": 12990,
  "comercio": "UNIMARC",
  "categoria": "Supermercado",
  "mailOrigen": "Cargo en Cuenta",
  "estado": "confirmado",
  "idMail": "19a2b...",
  "fijoManual": null
}
```

`estado` es uno de `pendiente de revisar`, `auto - sin confirmar`, `confirmado`. Los gastos manuales usan `idMail` = `manual-<timestamp>-<random>`.

## Hojas del Sheet

| Hoja | Uso |
|---|---|
| `Gastos` | una fila por gasto. Columnas: Fecha, Monto, Comercio/Servicio, Categoria, Mail de origen, Estado, ID Mail, Eliminado, Fijo Manual |
| `Reglas` | comercio → categoría, para auto-categorizar |
| `Categorias` | lista de categorías y su ícono |
| `Log` | una fila por corrida del escaneo o evento registrado |
| `Dashboard Mensual`, `Dashboard Promedio` | dashboards dentro del Sheet. Se reconstruyen tras un escaneo con gastos nuevos y al renombrar o borrar categorías (no al agregar un gasto manual). No excluyen Fintual: ese filtro vive solo en la app |

## Escaneo de Gmail

`scanGmailAndRegisterExpenses` toma el bloqueo del script (espera hasta 2 min) y llama a `scanCore_()`. Si algo falla, escribe una fila en `Log` con `estado: 'error'` y el mensaje, y vuelve a lanzar el error para que Apps Script también lo marque.

`scanCore_` busca `(from:bancoedwards.cl OR from:bancochile.cl) -from:comercial.bancoedwards.cl newer_than:10d` (máx. 50 hilos; hoy son ~6 en 10 días). La ventana de 10 días cubre varios días de triggers caídos; los duplicados se descartan por ID. IDs ya procesados y reglas se leen una vez por corrida (`loadAppendCtx_`). Reconoce estos asuntos:

| Asunto | Qué extrae |
|---|---|
| contiene "Cargo en Cuenta" (la regex usa `\s+` porque el texto puede traer saltos de línea) | monto, comercio y **fecha de la compra** de "se ha realizado una compra por $X con cargo a Cuenta ... en COMERCIO el dd/mm/aaaa hh:mm" |
| contiene "Transferencia a Terceros" | nombre y monto; comercio = "Nombre (transferencia)" |
| empieza con "Transferencias de Fondos a" | nombre y monto del destinatario |
| contiene "Cartola" | se ignora sin avisar (cartola mensual, no es gasto) |
| contiene "Aviso de transferencia de fondos" | se ignora (es plata que entra) |
| otro | se reporta como no reconocido en el log |

Fecha del gasto: en "Cargo en Cuenta" es la fecha de la compra que trae el texto del mail (desde el 2026-10-14; a veces el banco avisa con horas de atraso). En el resto es la fecha del mail en zona horaria del Sheet (Santiago); las transferencias llegan al minuto, así que coinciden. Al final escribe un resumen en `Log` y reconstruye los dashboards si hubo gastos nuevos.

Triggers: 07, 15 y 20 h, creados por `setupGmailScanTrigger_`. Para recrearlos, correr `runSetupGmailScanTriggerNow` desde el editor. Así quedan en "Principal" y usan siempre el último código guardado. **No** crearlos desde el Web App: un trigger creado ahí queda pegado a esa versión de la implementación y no ve cambios posteriores (pasó hasta oct 2026 con la Versión 23).

Ojo en el selector de funciones del editor: `runSetupNow` llama a `setupSheet()`, que **borra la hoja Gastos**.

## Historial de versiones

| Versión | Fecha | Cambio |
|---|---|---|
| 31 | 2026-10-27 | S3 completo: `doGet` ya no lee ni valida la clave; solo responde `Actualiza la app: ahora usa POST` a copias viejas de la app |
| 30 | 2026-10-27 | S3: las lecturas van por POST (la clave ya no viaja en la URL). B8: agregar un gasto manual ya no reconstruye los dashboards. `updateExpense` acepta `fecha` (no futura) |
| 29 | 2026-10-15 | S4: se quitaron del Web App 9 acciones que la app no usaba (getRules, getProcessedIds, appendExpense(s), upsertRule, rebuildDashboards, runGmailScan, resetExpenseToPending, appendLog) |
| 28 | 2026-10-15 | S3: `checkAuth_` lee la clave desde Propiedades del script; sin secreto en el código. Se archivó la implementación vieja de la Versión 7 |
| 27 | 2026-10-15 | El escaneo ignora los mails con "Cartola" en el asunto (cartola mensual) para que no aparezcan como "sin reconocer" |
| 26 | 2026-10-14 | Regex de "Cargo en Cuenta" con `\s+` en vez de espacios: `getPlainBody()` corta la línea en "con cargo a \nCuenta" cuando el monto es de $100.000 o más, y esos cargos no se registraban |
| 25 | 2026-10-14 | C2: fecha de compra desde el texto de "Cargo en Cuenta" |
| 24 | 2026-10-14 | Bloque 1 de la auditoría: sin `debugPlainBody`, sin comprobantes, `try/catch` + log en el escaneo, ventana 10 días sin publicidad, `LockService`, IDs leídos una vez, trigger de 20 h en código |
| 23 | 2026-08-15 | Fix `fijoManual` con valor `false` |

Los comprobantes con foto se eliminaron en la v24. Nunca se llegaron a usar.
