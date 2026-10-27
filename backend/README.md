# Backend (Apps Script con clasp)

Copia versionada del proyecto "Script Gastos" (script.google.com), sincronizada con [clasp](https://github.com/google/clasp).

| Archivo | Qué es |
|---|---|
| `Código.js` | todo el backend (en el editor web se ve como `Código.gs`) |
| `appsscript.json` | manifiesto: zona horaria, runtime V8, acceso del Web App |
| `.clasp.json` | ID del script; no tiene credenciales |

La clave de la API **no** está acá: vive en Configuración del proyecto → Propiedades del script (`API_SECRET`). Las credenciales de clasp quedan en `~/.clasprc.json`, fuera del repo.

## Flujo para cambiar el backend

Desde una terminal, dentro de `backend/`, con clasp instalado y sesión iniciada (`clasp login`).

1. **Sincronizar antes de editar** (por si alguien tocó el editor web):
   ```bash
   clasp pull
   ```
2. Editar `Código.js` y hacer commit.
3. **Subir el código:**
   ```bash
   clasp push
   ```
   Esto actualiza "Principal". Los triggers del escaneo de Gmail corren en Principal, así que **desde ese momento usan el código nuevo**.
4. **Publicar para la app** (el Web App usa una versión fija, no Principal). Siempre sobre la implementación existente, para que la URL no cambie:
   ```bash
   clasp deploy -i <ID-de-la-implementacion> -d "descripción del cambio"
   ```
   El ID está en el editor de Apps Script: Implementar → Administrar implementaciones.

   Si tu versión de clasp no reconoce `deploy`, mira `clasp --help`: en clasp 3 el comando equivalente es `clasp update-deployment`. Nunca uses `clasp deploy` **sin** `-i`, porque crea una implementación nueva con otra URL.

## Cosas a no hacer

- No ejecutar `runSetupNow` desde el editor: llama a `setupSheet()`, que borra la hoja Gastos.
- No crear triggers desde el Web App. Si hay que recrearlos, correr `runSetupGmailScanTriggerNow` desde el editor, así quedan en Principal.
- No poner la clave en el código. Para rotarla, cambiar la propiedad `API_SECRET` y escribir la nueva en cada dispositivo.
