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

   > **Regla Obligatoria de Pruebas:** Para cualquier prueba de inicio de sesión o verificación funcional en el sistema, utilizar siempre el login/PIN **`9710`** (`ANDRES RIVERA`, rol `SUPERVISOR`).

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
| `ALLOWED_ORIGINS` | `https://<tu-app>.azurewebsites.net` | Sí | Lista blanca CORS separada por comas (`app.js` agrega también `https://${WEBSITE_HOSTNAME}` automáticamente). |

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
# 1. Definir nombres del entorno Azure (ajustar según suscripción LAATS)
$RESOURCE_GROUP = "rg-sio-laats-prod"
$LOCATION       = "eastus2"
$PLAN_NAME      = "asp-sio-formatos-sec-linux"
$WEBAPP_NAME    = "sio-formatos-sec-laats"   # Debe ser único globalmente (*.azurewebsites.net)

# 2. (Solo primera vez) Crear Resource Group, App Service Plan Linux y Web App Node 20 LTS
az group create --name $RESOURCE_GROUP --location $LOCATION
az appservice plan create --name $PLAN_NAME --resource-group $RESOURCE_GROUP --is-linux --sku B1
az webapp create --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP --plan $PLAN_NAME --runtime "NODE:20-lts"

# 3. Configurar parámetros base de producción (HTTPS Only, Startup, Health Check, Always On)
az webapp update --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP --https-only true
az webapp config set --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP `
  --startup-file "npm start" `
  --always-on true `
  --min-tls-version 1.2 `
  --generic-configurations '{"healthCheckPath":"/api/health"}'

# 4. Configurar Application Settings (tomar los valores reales desde tu .env local sin exponerlos en Git)
az webapp config appsettings set --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP --settings `
  NODE_ENV="production" `
  PORT="8080" `
  WEBSITES_PORT="8080" `
  SCM_DO_BUILD_DURING_DEPLOYMENT="true" `
  DB_SERVER="<tu-servidor>.database.windows.net" `
  DB_PORT="1433" `
  DB_USER="<tu-usuario>" `
  DB_PASSWORD="<tu-password>" `
  DB_DATABASE="<tu-bd>" `
  DB_ENCRYPT="true" `
  DB_TRUST_SERVER_CERT="false" `
  SESSION_SECRET="<secreto-minimo-32-caracteres>" `
  ALLOWED_ORIGINS="https://$WEBAPP_NAME.azurewebsites.net"

# 5. Validar CI local y generar paquete ZIP limpio (excluyendo .git, node_modules, .env, GEMINI.md)
npm test
git archive --format=zip --output=../sio-formatos-sec-azure.zip HEAD

# 6. Desplegar el ZIP hacia Azure App Service (Oryx ejecutará npm install --omit=dev automáticamente)
az webapp deploy --resource-group $RESOURCE_GROUP --name $WEBAPP_NAME --src-path ../sio-formatos-sec-azure.zip --type zip

# 7. Verificar salud y logs en vivo
curl "https://$WEBAPP_NAME.azurewebsites.net/api/health"
az webapp log tail --name $WEBAPP_NAME --resource-group $RESOURCE_GROUP
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
  - Valida el arranque productivo (`config/validateEnv.js`), empaqueta un artefacto portable (`formatos-sec-sql-release`) descargable desde GitHub Actions y, si están configurados `NETLIFY_AUTH_TOKEN` y `NETLIFY_SITE_ID` en *Repository Secrets*, publica `public/` en Netlify.

- **Deploy Azure App Service (`.github/workflows/deploy-azure-app-service.yml`):** Workflow manual (`workflow_dispatch`) listo para desplegar a producción o slot en Azure App Service con validación previa y smoke test en `/api/health`.
