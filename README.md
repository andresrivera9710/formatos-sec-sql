# SIO LAATS — Formatos de Seguridad Operacional (SEC)

Aplicación web corporativa construida sobre **Node.js + Express 5 + EJS + Vanilla JS + Azure SQL (`mssql`)** para la gestión digital, validación en dos capas y renderizado oficial de formatos SEC por aerolínea (`AEROMEXICO`, `ARAJET`, `DELTA AIR LINES`, `AIR CANADA` y `LAN CARGO / LATAM`).

---

## Instalación en Otra Computadora

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

---

## Procesos CI/CD en GitHub Actions

Los workflows se encuentran en `.github/workflows/`:

- **CI (`.github/workflows/ci.yml`):** Se ejecuta automáticamente en cada `push` o `pull_request` hacia `main` (matriz Node `20.x` y `24.x`):
  - `npm run ci:security`: verifica exclusiones de `.gitignore`, ausencia de archivos sensibles rastreados (`.env`, `readmegithub.md`, `GEMINI.md`), escaneo de tokens y cumplimiento estricto de Helmet CSP en todas las vistas `.ejs`.
  - `npm run ci:syntax`: valida sintaxis JS (`node --check`) y compila todas las plantillas `.ejs`.
  - `npm run ci:unit`: ejecuta pruebas unitarias offline de catálogo dinámico por aerolínea, validación backend (`400` / Anti-IDOR) y renderizado anti-XSS de las 32 plantillas en `FormatosHTML/`.
  - `dependency-audit`: ejecuta `npm audit --omit=dev --audit-level=high`.

- **CD (`.github/workflows/cd.yml`):** Se ejecuta automáticamente cuando `CI` termina en éxito sobre `main` (o manualmente desde *Actions*):
  - Valida el arranque productivo, empaqueta un artefacto portable (`formatos-sec-sql-release`) descargable desde GitHub Actions y, si están configurados `NETLIFY_AUTH_TOKEN` y `NETLIFY_SITE_ID` en *Repository Secrets*, publica `public/` en Netlify.
