/**
 * Database Singleton Pool - SIO LAATS (Azure SQL Server)
 * Capa 9 de Seguridad: Consultas estrictamente parametrizadas con .input()
 * Cifrado obligatorio en tránsito (encrypt: true) y Soft Delete nativo.
 */

const sql = require('mssql');

const isProduction = process.env.NODE_ENV === 'production';

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || '',
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false', // Azure SQL exige cifrado TLS
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true' || !isProduction,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 45000
  },
  pool: {
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000
  }
};

let poolPromise = null;

async function getConnection() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .then(pool => {
        console.log('\x1b[32m✔ [AZURE SQL] Pool de conexiones conectado exitosamente a ' + dbConfig.database + '\x1b[0m');
        pool.on('error', err => {
          console.error('\x1b[31m[AZURE SQL ERROR EN POOL]\x1b[0m', err);
          poolPromise = null; // Fuerza reconexión en el siguiente ciclo
        });
        return pool;
      })
      .catch(err => {
        console.error('\x1b[31m[AZURE SQL CONNECTION ERROR] Fallo al conectar con ' + dbConfig.server + ':\x1b[0m', err.message);
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

/**
 * Ejecuta una consulta SQL parametrizada de manera segura.
 * REGLA ESTRICTA: Sin concatenación de strings en SQL.
 * @param {string} queryText - Consulta SQL con parámetros nombrados (@param1, @param2)
 * @param {Array<{name: string, type: any, value: any}>} params - Lista de parámetros
 */
async function executeQuery(queryText, params = []) {
  // Verificación estricta contra DELETE físico
  if (/\bDELETE\s+FROM\b/i.test(queryText)) {
    throw new Error('Violación de Seguridad: Prohibido ejecutar DELETE físico en SIO LAATS. Utilice Soft Delete (EstaEliminado = 1).');
  }

  const pool = await getConnection();
  const request = pool.request();

  for (const p of params) {
    if (p.type) {
      request.input(p.name, p.type, p.value);
    } else {
      request.input(p.name, p.value);
    }
  }

  return await request.query(queryText);
}

/**
 * Ejecuta un Procedimiento Almacenado de manera segura con parámetros controlados.
 * @param {string} procedureName - Nombre del SP (ej: dbo.ConsultarDRayosXSEC)
 * @param {Array<{name: string, type: any, value: any}>} params - Parámetros de entrada
 */
async function executeStoredProcedure(procedureName, params = []) {
  const pool = await getConnection();
  const request = pool.request();

  for (const p of params) {
    if (p.type) {
      request.input(p.name, p.type, p.value);
    } else {
      request.input(p.name, p.value);
    }
  }

  return await request.execute(procedureName);
}

module.exports = {
  sql,
  getConnection,
  executeQuery,
  executeStoredProcedure
};
