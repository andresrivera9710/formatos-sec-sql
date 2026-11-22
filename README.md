# SIO LAATS — Formatos de Seguridad Operacional (SEC)

Aplicación web corporativa construida sobre **Node.js + Express 5 + EJS + Vanilla JS + Azure SQL (`mssql`)** para la gestión digital, validación estricta en dos capas (Frontend + Backend) y renderizado oficial de **36 formatos SEC** distribuidos en **7 aerolíneas / operadores**:

| Aerolínea / Operador | Formatos Habilitados |
| :--- | :--- |
| **AEROMEXICO** (7) | `amx-cp`, `amx-ciec`, `amx-er`, `amx-eb`, `amx-cec`, `amx-mecd`, `amx-po` |
| **ARAJET** (6) | `ara-cp`, `ara-ciec`, `ara-er`, `ara-eb`, `ara-cec`, `ara-cfr` |
| **DELTA AIR LINES** (9) | `dl-cp`, `dl-cll`, `dl-dal`, `dl-sp`, `dl-sel`, `dl-er`, `dl-cec`, `dl-ciec`, `dl-rx` |
| **AIR CANADA** (7) | `ac-cp`, `ac-er`, `ac-eb`, `ac-cec`, `ac-ass`, `ac-anexoa`, `ac-anexob` |
| **LAN CARGO / LATAM** (3) | `latam-liadc`, `latam-ciec`, `latam-cp` |
| **FEDEX** (1) | `fdx-ccda` |
| **AMERIJET** (3) | `ajt-lisa`, `ajt-cec`, `ajt-ciec` |

---

## Arquitectura, Seguridad y Estándares UI/UX

- **Arquitectura MVC + Service Layer:** `app.js` -> `routes/` -> `middlewares/` -> `controllers/` -> `services/` -> `models/` -> **Azure SQL Server (`mssql`)**.
- **Defensa en Profundidad (Helmet CSP + Anti-IDOR + SQL Parametrizado):**
  - Cero handlers inline (`onclick`, etc.) y cero `<script>` ejecutables inline en las vistas `.ejs`.
  - Consultas parametrizadas estrictamente con `.input()`, cifrado TLS obligatorio (`encrypt: true`) y borrado lógico (`Soft Delete`).
  - Validación de arranque `Boot-Cycle` (`config/validateEnv.js`) y `GET /api/health` sin sesión para monitoreo y Health Checks.
  - Compatibilidad nativa detrás de reverse proxy (`app.set('trust proxy', 1)`, `session.proxy`, origen automático `WEBSITE_HOSTNAME` y apagado controlado `SIGTERM`).
- **Experiencia Visual Corporativa LAATS:**
  - Paleta institucional (`#0F2744`, `#275B88`, `#D4AF37`, `#F4F7FB`) y tipografía `Montserrat`.
  - **Tab Bar Inferior con efecto *Sliding Pill*** unificado en `/operaciones`, `/formatos` y `/formatos/:formatoId` (`views/partials/tab-bar.ejs`, `public/css/tab-bar.css`, `public/js/tab-bar.js`).
  - **Modo Claro y Modo Noche (`[data-theme="dark"]`)** persistente en `localStorage` con inicialización temprana sin parpadeos (`public/js/theme-init.js`).
  - **Diferenciación clara de campos bloqueados / solo lectura** (`.input-locked`, `.er-cell-readonly`, `.form-control[readonly]`) tanto en Modo Claro como en Modo Noche.
  - **Regla de Oro para Documentos Controlados (`FormatosHTML/`):** toda vista preliminar / documento generado (`/formatos/:formatoId/vista-preliminar`) se renderiza siempre sobre fondo blanco puro (`#FFFFFF`) con texto oscuro (`#000000`), sin barra flotante de previsualización.
  - **Flujo Unificado Guardar -> Vista Preliminar Persistida:** al guardar definitivamente en Azure SQL, el sistema genera y muestra automáticamente el documento HTML oficial hidratado con los datos reales recién guardados en base de datos.

---

## Instalación Local (Otra Computadora)

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/andresrivera9710/formatos-sec-sql.git
   cd formatos-sec-sql
   ```

2. **Instalar dependencias:**
   ```bash
   npm ci
   ```

3. **Configurar variables de entorno (`.env`):**
   - Copia `.env.example` hacia `.env`:
     ```bash
     cp .env.example .env
     ```
     *(En PowerShell: `Copy-Item .env.example .env`)*
   - Completa las credenciales reales de Azure SQL (`DB_SERVER`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`) y un `SESSION_SECRET` seguro (mínimo 32 caracteres).
   - Verifica el arranque del entorno antes de iniciar:
     ```bash
     npm run check:env
     ```

4. **Ejecutar verificaciones locales (CI) y levantar servidor:**
   ```bash
   npm test
   npm start
   ```
   El servidor quedará disponible en `http://localhost:3000`.

   > **Regla Obligatoria de Pruebas:** Para cualquier prueba de inicio de sesión, navegación en Chrome o verificación funcional en el sistema:
   > - Utilizar siempre el login/PIN **`9710`** (**`ANDRES RIVERA`**, rol `SUPERVISOR`).
   > - Seleccionar siempre las **tarjetas de operaciones del 1 de enero de 2026 (`2026-01-01`)** en `/operaciones`.

---

## Cliente AEROMEXICO — Estado de Formatos Trabajados (7/7 Completados)

Todos los formatos de **AEROMEXICO** fueron auditados de extremo a extremo (SQL / Stored Procedures -> `FormatosModel` -> `FormatoValidationService` -> `FormatosService` -> `HtmlPreviewService` -> EJS/JS -> Vista Preliminar / PDF oficial -> Repositorio de Firmas GitHub) tomando como guía las plantillas reales exportadas desde Power Automate:

| ID | Nombre Oficial del Formato | Plantilla HTML Controlada (`FormatosHTML/AEROMEXICO/`) | Nomenclatura de Documento Generado (`<Vuelo>_<Matrícula>_<Formato>_<Id\|PRELIMINAR>.html`) | Fecha en Plantilla | Ajustes Clave y Correcciones Aplicadas |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`amx-cp`** | Control de Perimétrica (unificado) | `Control de Perimétrica (unificado).html` | `672_673_NA_Control de Perimétrica (unificado)_<Id\|PRELIMINAR>.html` | `MM/dd/yyyy` | Sincronización de Aleros 1/2 (`AlerosCP`), Tractorista/Unidad, fila mínima de `25` renglones, `Observaciones` multilínea (`white-space: pre-line`) y estado `Pendiente` en rojo si falta hora de salida. |
| **`amx-ciec`** | Control de ingreso y egreso cabina aeronave | `Control Ingreso y Egreso Cabina.html` | `672_673_NA_Control de ingreso y egreso cabina aeronave_<Id\|PRELIMINAR>.html` | `MM/dd/yyyy` | Separación de vista en vivo vs persistida para `Equipaje en Puerta` (`TOTAL EQ. 0` cuando está vacío), Aleros + Tractorista/Unidad, `32` filas mínimas `.grid-row`, ajuste de `@media print` sin `height: 100vh`. |
| **`amx-eb`** | Control de Equipajes en Banda de Salida (Rayos X) | `Control de Equipajes en Banda de Salida (rayos x).html` | `678_679_NA_Control de Equipajes en Banda de Salida (Rayos X)_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | Corrección de matriz inline (`1..10` x `15` filas), tache rojo `✗` en anulaciones, contadores nulos mostrados en `0` (`stat-box`) y resolución de Supervisor/Operador desde `LoginSEC`. |
| **`amx-cec`** | Control de Equipajes en Compartimentos | `Control de Equipajes en Compartimentos.html` | `672_673_NA_Control de Equipajes en Compartimentos_<Id\|PRELIMINAR>.html` | `MM/dd/yyyy` | Corrección CSS de `.page`, separación automática de vuelos Desembarque/Embarque en vuelos combinados (`672/673` -> `672` y `673`), `Compartimiento No.`, personal y `Observaciones` multilínea. |
| **`amx-po`** | Puestos por Operación | `Puestos por Operación.html` | `672_673_NA_Puestos por Operación_<Id\|PRELIMINAR>.html` | `yyyy-MM-dd` | Alias SQL `PosicionesPOId AS PosicionId` / `Posiciones AS Posicion` en `FormatosModel`, preselección de Supervisor (`LoginId`), validación obligatoria de **Firma Digital del Supervisor**, `@page A4 landscape`, `table-layout: fixed` y firma persistente/bloqueada en GitHub. |
| **`amx-er`** | Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x) | `Control de Equipaje en Revisión AVSECSGDAIA Banda de Salida (rayos x) AMX.html` | `671_NA_Control de Equipaje en Revisión AVSEC_SGDAIA Banda de Salida (rayos x)_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | `@page A4 landscape`, `table-layout: fixed`, encabezado columna 9 corregido a `AMX`, `Observaciones` multilínea, preservación de `CreadoPor` histórico al reanudar y firma bloqueada en GitHub (`firmaBase64`). |
| **`amx-mecd`** | Equipajes en mal estado y carga dañada | `Equipaje en mal estado.html` | `671_NA_Equipajes en mal estado y carga dañada_<Id\|PRELIMINAR>.html` | `yyyy-MM-dd` | Hidratación corregida en `FormatosService` (`encabezado`/`complemento`, `revision`/`revisiones` y mapeo de `CCO`/`Agente`/`Supervisor` por `LoginId` o `EmpleadoId`), fecha ISO `yyyy-MM-dd`, fondo blanco `#ffffff` y captura/bloqueo independiente de las **3 firmas** (`firmaCCO`, `firmaAgente`, `firmaSupervisor`) en GitHub. |

### Repositorio Permanente de Firmas Digitales (GitHub + Bloqueo Inmutable)
Dado que las tablas históricas de los formatos en Azure SQL (`EncabezadoPO`, `EncabezadoControlER`, `EncabezadoEquipMECD`, etc.) no almacenan binarios de firmas digitales, se implementó `services/SignatureRepositoryService.js` y `public/js/signature-pad.js` cubriendo las **10 familias con firma del sistema** (`po`, `er`, `mecd`, `cll`, `dal`, `sel`, `ass`, `anexob`, `liadc`, `lisa`):
- **Persistencia atómica en GitHub**: al guardar por primera vez cada firma, se sube como PNG binario + `manifest.json` a `firmas/<familia>/<encabezadoId>/<firmaKey>.png` en `andresrivera9710/formatos-sec-sql` (`main`, con commit `[skip ci]`), usando `.firmas-cache/` local (excluida en `.gitignore`).
- **Bloqueo permanente**: al consultar, reanudar o generar Vista Preliminar/PDF, el sistema recupera la firma desde GitHub/caché (con respaldo de registros legados SQL), reemplaza el lienzo `<canvas>` por la vista bloqueada con enlace a GitHub y rechaza en Backend cualquier intento de sobrescritura o borrado, permitiendo completar en sesiones posteriores únicamente las firmas opcionales que aún permanezcan vacías.

### Cliente DELTA AIR LINES — Estado de Formatos Trabajados (9/9 Completados)

Todos los formatos de **DELTA AIR LINES (`dl-*`)** fueron auditados 1:1 contra Power Apps (`FORMAT SEC - SQL/Src/scrDELTA.pa.yaml`) y los documentos controlados oficiales exportados de Power Automate (`FormatosHTML/DELTA/`), respetando sus variaciones específicas frente a AEROMEXICO sin alterar el funcionamiento existente:

| ID | Nombre Oficial del Formato | Plantilla HTML Controlada (`FormatosHTML/DELTA/`) | Nomenclatura de Documento Generado (`<Vuelo>_<Matrícula>_<Formato>_<Id\|PRELIMINAR>.html`) | Fecha en Plantilla | Ajustes Clave y Variaciones DELTA Aplicadas |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`dl-cp`** | Control de Perimétrica (unificado) | `Control de Perimétrica (unificado) DL.txt` | `1830_1831_N695DL_Control de Perimétrica (unificado)_<Id\|PRELIMINAR>.html` | `MM/dd/yyyy` | Fondo oficial `#ffffff`, catálogo de empresas DELTA (`LAATS`, `DELTA`, `SAG`, `ODA`, `GODARD`, `OIRSA`, `DGAC (Operaciones)`, `OTROS...`), `Aleros` unificados (`Alero 1, Alero 2`), `Tractorista / Unidad` y `25` filas mínimas. |
| **`dl-ciec`** | Control de ingreso y egreso cabina aeronave | `Control Ingreso y Egreso Cabina DL.txt` | `1830_1831_N695DL_Control de ingreso y egreso cabina aeronave_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | Fondo oficial `#ffffff`, `EquipajePuertaHTML` renderizado como lista de secuencias separadas por coma (`_secuenciasTexto` de `scrDELTA.pa.yaml`), `Aleros`, `Tractorista / Unidad`, `32` filas mínimas `.grid-row` y bloqueo `.input-locked` de fecha/vuelo/matrícula. |
| **`dl-er`** | Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x) | `Control de Equipaje en Revisión AVSEC SGDAIA Banda de Salida (rayos x) DL.txt` | `1830_1831_N695DL_Control de Equipaje en Revisión AVSEC_SGDAIA Banda de Salida (rayos x)_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | **Variación DELTA (8 columnas sin `Secuencia`)**: ocultación de `Secuencia` en UI y tabla HTML para `dl-er` (auto-asignando índice correlativo interno para SQL), `N/A` en columna `DESTINO` de filas vacías (`1..15`) y firma bloqueada en GitHub (`firmaBase64`). |
| **`dl-cec`** | Control de Equipajes en Compartimentos | `Control de Equipajes en Compartimentos DL.txt` | `1830_1831_N695DL_Control de Equipajes en Compartimentos_<Id\|PRELIMINAR>.html` | `MM/dd/yyyy` | **Variación DELTA (Sin matriz de secuencias)**: tabla `TablaEmbarqueHTML` de 8 filas (`EQUIPAJE MOSTRADOR`, `EQUIPAJE POR PUERTA`, `CARGA:`, `TOTAL EQ.`, `TOTAL CARGA`) persistida en `dbo.EmbarqueDelta`, y `TablaDesembarqueHTML` de 6 filas (`EQUIPAJES`, `CARRUAJES`, `CARGA`, `TOTAL EQ.`, `TOTAL CARGA`) sin `Correos` ni `Maltratado`. |
| **`dl-rx`** | Control de Equipajes en Rayos X | `Control de Equipaje en Rayos X DELTA.txt` | `1830_1831_N695DL_Control de Equipaje en Rayos X DELTA_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | Fondo `#ffffff` sin sombra gris, fecha bloqueada `.input-locked`, tablas paralelas `PERSONAL SAG` y `PERSONAL LAATS` (mínimo `6` filas cada una), hidratación de `Observacion` desde `dbo.ObservacionDRayosX` y resolución de Supervisor/Agente desde `LoginSEC`. |
| **`dl-cll`** | Cargo Loading Log | `Cargo Loading Log.txt` | `1830_1831_N695DL_Cargo Loading Log_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | Fondo `#ffffff`, eliminación de atributos inline `onerror` para cumplimiento estricto de Helmet CSP, `21` filas proporcionales, separación/unión automática de `AgenteDelta, TiaLD` en `dbo.EncabezadoCLL.AgenteDelta` y bloqueo en GitHub de `firmaSecurity` + `firmaLD`. |
| **`dl-sp`** | Selected Passenger | `Selected Passenger.txt` | `1830_1831_N695DL_Selected Passenger_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | Fondo `#ffffff` en formato Carta horizontal (`15` filas), contadores automáticos `R Random`, `S Selected`, `I Interview` y `TOTAL`, captura y bloqueo en GitHub de `firmaScreener` (`SCREENER NAME AND SIGNATURE`) y nombre de `SUPERVISOR LAATS`. |
| **`dl-dal`** | Daily Activity Log | `Daily Activity Log.txt` | `1830_1831_N695DL_Daily Activity Log_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | Fondo `#ffffff`, token `BagsEscortedSig` en fila `BAGS ESCORTED TO AIRCRAFT - GUARD SIGNATURE`, hidratación completa de `dbo.DetalleDAL` (`Evaluadores`, guardias, conteos de equipaje/carga/pasajeros) y bloqueo en GitHub de `firmaGuardSup` + `firmaDLAgent`. |
| **`dl-sel`** | Sequence of Events Log | `Sequence of Events Log.txt` | `1830_1831_N695DL_Sequence of Events Log_<Id\|PRELIMINAR>.html` | `dd/MM/yyyy` | Fondo `#ffffff`, bloqueo `.input-locked` de `Date`, `Flight #`, `Aircraft Arrived` y `Guard`, preservación de metadatos de arribo (`SEL_META`) en `dbo.DetalleSEL` y bloqueo en GitHub de `firmaSupervisor`. |

---

## Arquitectura Offline-First, Caché IndexedDB y Sincronización Automática

El sistema cuenta con resiliencia nativa ante pérdida de señal en rampa o terminal para **AEROMEXICO, los 7 clientes actuales y cualquier integración futura**:

1. **Detección Real de Señal + Indicador en el Tab Bar (*Sliding Pill*)**:
   - `public/js/offline-manager.js` combina eventos `online`/`offline` con un **Heartbeat real** contra `GET /api/health` (`timeout` de `3s`, `cache: 'no-store'`).
   - El **Tab Bar** (`views/partials/tab-bar.ejs`, `public/css/tab-bar.css`, `public/js/tab-bar.js`) incorpora el ítem `#btnTabNetworkStatus` en Web y Móvil:
     - **En línea**: Ícono Wi-Fi verde (`--success` `#16A34A`) y etiqueta `"En línea"`.
     - **Sin conexión**: Ícono Wi-Fi tachado en ámbar/rojo (`#F59E0B` / `#DC2626`), etiqueta `"Sin conexión (Modo Caché)"` y contador `#tabNetworkPendingBadge` de formatos pendientes por sincronizar.
2. **Almacenamiento Persistente en IndexedDB (`sio_laats_offline_db`) + Service Worker (`public/sw.js`)**:
   - **`drafts`**: Autoguardado continuo en tiempo real indexado por `correlativo::cliente::codigoFormato::encabezadoId` (campos, selectores, cuadrículas dinámicas y firmas trazadas en `<canvas>`). Si el operador cierra o recarga la página, el borrador se restaura automáticamente mostrando el banner `#sioOfflineDraftBanner`.
   - **`pending_sync_queue`**: Cuando el operador presiona **Guardar / Crear Formato** sin conexión, se ejecuta primero la validación estricta de campos obligatorios en Frontend, se encola el payload con `clientMutationId` idempotente, se confirma con **SweetAlert2** y se habilita la **Vista Preliminar limpia Offline** sobre hoja blanca `#FFFFFF` usando la plantilla controlada almacenada en **`templates`** (`GET /api/offline/plantilla/:formatoId`).
   - **`Auto-Sync`**: Al recuperar conectividad real (`GET /api/health` -> `HTTP 200`), `offline-manager.js` envía automáticamente la cola pendiente en orden cronológico a `/api/formatos/guardar` o `/api/formatos/procesar`, limpia la cola y el borrador tras confirmar la persistencia en Azure SQL, bloquea las firmas registradas en GitHub y notifica discretamente al usuario.
3. **Herencia Automática para Nuevos Módulos**:
   - Todo formulario renderizado en `views/formato_detalle.ejs` recibe `#sioOfflineContextJson` y canaliza sus peticiones por el interceptor `window.fetch` de `offline-manager.js`, heredando autoguardado, cola offline, vista preliminar local y sincronización automática sin duplicar lógica.

---

## Configuración y Despliegue en Azure App Service (Producción)

El proyecto está **100% preparado** para desplegarse en **Azure App Service (Linux — Node.js 20 LTS)** sin modificaciones adicionales en el código fuente.

### 1. Especificaciones Recomendadas del Recurso en Azure

| Parámetro de App Service | Valor Recomendado / Configurado |
| :--- | :--- |
| **Sistema Operativo** | `Linux` *(las 36 rutas de `FormatosHTML/` están validadas con sensibilidad exacta a mayúsculas/minúsculas en CI)* |
| **Runtime Stack** | `NODE\|20-lts` (`engines.node >= 20.0.0` en `package.json`) |
| **Plan / SKU Sugerido** | `B1` (Basic) para pruebas/QA o `P0v3` / `P1v3` (Premium v3) para operación productiva |
| **Startup Command** | `npm start` *(o `node app.js`)* |
| **Build en Despliegue (`.deployment`)** | `SCM_DO_BUILD_DURING_DEPLOYMENT=true` *(archivo `.deployment` ya incluido en la raíz)* |
| **HTTPS Only** | `Activado` *(obligatorio para cookies de sesión con `secure: true` en producción)* |
| **Always On** | `Activado` *(evita cold starts y pérdida del pool de Azure SQL)* |
| **ARR Affinity (Session Affinity)** | `Activado` *(requerido mientras `express-session` utilice almacenamiento en memoria)* |
| **Health Check Path** | `/api/health` *(responde HTTP `200` JSON sin requerir autenticación)* |
| **TLS Mínimo** | `1.2` |

### 2. Application Settings (Variables de Entorno en Azure Portal / CLI)

Configura estas claves en **Azure Portal -> App Service -> Settings -> Environment variables (App settings)**:

| Variable | Valor en Producción (Azure App Service) | Obligatoria | Descripción |
| :--- | :--- | :---: | :--- |
| `NODE_ENV` | `production` | Sí | Activa cookies `secure`, caché estática (`7d`), ocultamiento de stack traces y validación estricta de `SESSION_SECRET`. |
| `PORT` | `8080` | Recomendada | Puerto HTTP interno escuchado por Express (Azure App Service Linux usa `8080` por defecto). |
| `WEBSITES_PORT` | `8080` | Recomendada | Indica explícitamente al contenedor de App Service el puerto expuesto por Node.js. |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Sí | Instruye a Oryx/Kudu instalar dependencias de producción (`npm install --omit=dev`) si se despliega sin `node_modules`. |
| `DB_SERVER` | `<servidor>.database.windows.net` | Sí | FQDN del servidor Azure SQL Server. |
| `DB_PORT` | `1433` | Sí | Puerto TCP de Azure SQL Server. |
| `DB_USER` | `<usuario_sql>` | Sí | Usuario SQL con permisos sobre los SPs y tablas de SEC. |
| `DB_PASSWORD` | `<password_seguro>` | Sí | Contraseña de Azure SQL (preferir **Azure Key Vault Reference** en producción). |
| `DB_DATABASE` | `<nombre_bd>` | Sí | Base de datos operativa SIO. |
| `DB_ENCRYPT` | `true` | Sí | Cifrado TLS obligatorio hacia Azure SQL. |
| `DB_TRUST_SERVER_CERT` | `false` | Sí | Validación estricta del certificado TLS de Azure SQL en producción. |
| `SESSION_SECRET` | `<cadena_aleatoria_>=32_chars>` | Sí | Clave criptográfica para firmar `sio_session` (mínimo 32 caracteres; `validateEnv.js` bloquea arranque si es débil). |
| `ALLOWED_ORIGINS` | `https://sio.laats.net,https://sio-prod.azurewebsites.net` | Sí | Lista blanca CORS separada por comas (`app.js` incluye automáticamente `https://sio.laats.net`, `https://sio-prod.azurewebsites.net` y `https://${WEBSITE_HOSTNAME}`). |

> **Nota de Seguridad:** Nunca subas `.env`, `GEMINI.md` ni `readmegithub.md` al repositorio ni dentro del paquete ZIP de despliegue.

### 3. Checklist de Red y Firewall de Azure SQL

Antes de desplegar y probar el inicio de sesión en Azure App Service:
1. En **Azure SQL Server -> Security -> Networking**:
   - Activar la opción **"Allow Azure services and resources to access this server"** *(o bien agregar las Outbound IP Addresses del App Service / configurar Private Endpoint + VNet Integration)*.
2. Confirmar que **Minimum TLS Version** en Azure SQL sea `TLS 1.2`.
3. Verificar que las tablas/SPs de seguridad operativa y el usuario de prueba `9710` existan en la base configurada en `DB_DATABASE`.

### 4. Opción A — Despliegue Directo con Azure CLI (`az`)

Requisitos: Azure CLI instalado (`az --version`) y sesión iniciada (`az login`).

```powershell
# 1. Definir nombres reales del entorno productivo Azure LAATS (sio.laats.net)
$AZ_CMD         = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
$RESOURCE_GROUP = "app-laats-prod"
$WEBAPP_NAME    = "laats-prod"   # Dominio personalizado: https://sio.laats.net (laats-prod-ekfbekf6bmada5en.eastus-01.azurewebsites.net)

# 2. Verificar sesión activa en Azure CLI (programadorit@laats.net / Azure LAATS ISS)
& $AZ_CMD account show

# 3. Validar CI local y generar paquete ZIP limpio (excluyendo .git, node_modules, .env, GEMINI.md, readmegithub.md)
npm test
git archive --format=zip --output=../sio-formatos-sec-azure.zip HEAD

# 4. Desplegar el ZIP hacia Azure App Service (Oryx ejecuta npm install --omit=dev automáticamente)
& $AZ_CMD webapp deploy --resource-group $RESOURCE_GROUP --name $WEBAPP_NAME --src-path ../sio-formatos-sec-azure.zip --type zip

# 5. Verificar salud en producción
curl.exe "https://sio.laats.net/api/health"
```

### 5. Opción B — Despliegue Automatizado con GitHub Actions

El repositorio incluye el workflow listo para ejecutar en `.github/workflows/deploy-azure-app-service.yml`:

1. En **Azure Portal -> Tu App Service -> Overview**, haz clic en **Download publish profile** (descarga un archivo `.PublishSettings`).
2. En **GitHub -> Settings -> Secrets and variables -> Actions**:
   - **Secret** `AZURE_WEBAPP_PUBLISH_PROFILE`: pegar el contenido completo XML del Publish Profile.
   - **Variable** `AZURE_WEBAPP_NAME`: nombre exacto del App Service (ej. `sio-formatos-sec-laats`).
3. Ejecuta el workflow **"Deploy - Azure App Service (Linux Node.js)"** desde la pestaña **Actions -> Run workflow** (permite indicar `webapp_name` y `slot_name` opcional como `staging`).
4. El workflow valida `npm test` (seguridad, CSP, sintaxis y tests unitarios), limpia devDependencies, empaqueta sin archivos sensibles, despliega con `azure/webapps-deploy@v3` y ejecuta smoke test contra `/api/health`.

### 6. Nota sobre Escalamiento Horizontal

- Con **1 instancia** (o múltiples instancias con **ARR Affinity** habilitado), `express-session` funciona directamente.
- Si en el futuro se escala a múltiples instancias **sin** ARR Affinity o se requiere persistencia de sesión entre reinicios, migrar el store de `express-session` a **Azure Cache for Redis (`connect-redis`)** o a una tabla dedicada en Azure SQL (`connect-mssql-v2`).

---

## Procesos CI/CD en GitHub Actions

Los workflows se encuentran en `.github/workflows/`:

- **CI (`.github/workflows/ci.yml`):** Se ejecuta automáticamente en cada `push` o `pull_request` hacia `main` (matriz Node `20.x` y `24.x`):
  - `npm run ci:security`: verifica exclusiones de `.gitignore`, ausencia de archivos sensibles rastreados (`.env`, `readmegithub.md`, `GEMINI.md`), escaneo de tokens y cumplimiento estricto de Helmet CSP en todas las vistas `.ejs`.
  - `npm run ci:syntax`: valida sintaxis JS (`node --check`) y compila todas las plantillas `.ejs`.
  - `npm run ci:unit`: ejecuta pruebas unitarias offline de catálogo dinámico por aerolínea, validación backend (`400` / Anti-IDOR), sensibilidad exacta a mayúsculas/minúsculas para Linux y renderizado anti-XSS de las **36 plantillas** en `FormatosHTML/`.
  - `dependency-audit`: ejecuta `npm audit --omit=dev --audit-level=high`.

- **CD Release (`.github/workflows/cd.yml`):** Se ejecuta automáticamente cuando `CI` termina en éxito sobre `main` (o manualmente desde *Actions*):
  - Valida el arranque productivo (`config/validateEnv.js`) y empaqueta un artefacto portable (`formatos-sec-sql-release`) descargable desde GitHub Actions listo para Azure App Service (`sio-prod` / `https://sio.laats.net`).

- **Deploy Azure App Service (`.github/workflows/deploy-azure-app-service.yml`):** Workflow manual (`workflow_dispatch`) listo para desplegar a producción (`sio-prod` / `https://sio.laats.net`) o slot en Azure App Service con validación previa y smoke test en `/api/health`.
