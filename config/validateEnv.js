/**
 * Boot-Cycle Validation - SIO LAATS
 * Valida variables críticas del entorno antes de iniciar Express o el pool de BD.
 */

function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const requiredVars = [
    'DB_SERVER',
    'DB_USER',
    'DB_PASSWORD',
    'DB_DATABASE',
    'SESSION_SECRET'
  ];

  const missing = [];

  for (const v of requiredVars) {
    if (!process.env[v] || process.env[v].trim() === '') {
      missing.push(v);
    }
  }

  if (missing.length > 0) {
    console.error('\x1b[31m[BOOT-CYCLE ERROR] Faltan variables obligatorias en el archivo .env:\x1b[0m');
    missing.forEach(m => console.error(`  - ${m}`));

    if (isProduction) {
      console.error('\x1b[31mEl servidor no puede arrancar en modo producción sin estas variables.\x1b[0m');
      process.exit(1);
    } else {
      console.warn('\x1b[33m[ADVERTENCIA DEV] Configura tus credenciales en ./Proyecto/.env para operar con Azure SQL.\x1b[0m');
    }
  }

  // Validación de seguridad para SESSION_SECRET
  const secret = process.env.SESSION_SECRET || '';
  if (isProduction) {
    if (secret.length < 32 || secret.includes('default') || secret.includes('change_me')) {
      console.error('\x1b[31m[SEGURIDAD CRÍTICA] SESSION_SECRET debe tener al menos 32 caracteres seguros en producción.\x1b[0m');
      process.exit(1);
    }
  }

  console.log('\x1b[32m✔ [BOOT-CYCLE] Variables de entorno validadas exitosamente.\x1b[0m');
}

module.exports = validateEnv;

