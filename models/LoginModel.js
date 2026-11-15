/**
 * LoginModel - SIO LAATS Formatos SEC
 * Consultas SQL parametrizadas para autenticación por PIN, validación SEC y departamentos.
 */

const { sql, executeQuery } = require('../config/database');

class LoginModel {
  /**
   * Busca las credenciales por PIN en la tabla LogIn
   * @param {string} pin
   */
  static async buscarPorPin(pin) {
    const query = `
      SELECT TOP 1
        LoginId,
        Usuario,
        Password,
        EmpleadoId,
        ISNULL(EstaEliminado, 0) AS EstaEliminado
      FROM LogIn
      WHERE UPPER(RTRIM(Password)) = UPPER(@pin)
        AND ISNULL(EstaEliminado, 0) = 0
    `;
    const params = [
      { name: 'pin', type: sql.NVarChar(50), value: pin.trim() }
    ];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }

  /**
   * Valida pertenencia y perfil en el módulo de Seguridad (LoginSEC)
   * @param {string} usuario
   */
  static async buscarUsuarioSEC(usuario) {
    const query = `
      SELECT TOP 1
        LoginId,
        Usuario,
        EmpleadoId,
        Password,
        Puesto
      FROM LoginSEC
      WHERE UPPER(RTRIM(Usuario)) = UPPER(@usuario)
    `;
    const params = [
      { name: 'usuario', type: sql.NVarChar(100), value: usuario.trim() }
    ];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }

  /**
   * Obtiene el LoginId activo a partir del Usuario o EmpleadoId
   * @param {string} usuario
   * @param {number} [empleadoId]
   */
  static async obtenerLoginIdPorUsuario(usuario, empleadoId = 0) {
    const query = `
      SELECT TOP 1 LoginId
      FROM LogIn
      WHERE (UPPER(RTRIM(Usuario)) = UPPER(@usuario) OR (@empleadoId > 0 AND EmpleadoId = @empleadoId))
        AND ISNULL(EstaEliminado, 0) = 0
      ORDER BY CASE WHEN UPPER(RTRIM(Usuario)) = UPPER(@usuario) THEN 0 ELSE 1 END, LoginId DESC
    `;
    const params = [
      { name: 'usuario', type: sql.NVarChar(100), value: String(usuario || '').trim() },
      { name: 'empleadoId', type: sql.Int, value: parseInt(empleadoId, 10) || 0 }
    ];
    const result = await executeQuery(query, params);
    return result.recordset[0]?.LoginId || null;
  }

  /**
   * Obtiene datos del Empleado y sus departamentos
   * @param {number} empleadoId
   */
  static async obtenerDatosEmpleado(empleadoId) {
    const query = `
      SELECT TOP 1
        e.EmpleadoId,
        e.Nombre,
        e.DepartamentoId,
        d.Nombre AS DepartamentoNombre,
        di.DepartamentoInternoId,
        di.DepartamentoInterno AS DepartamentoInternoNombre
      FROM Empleado e
      LEFT JOIN Departamento d ON e.DepartamentoId = d.DepartamentoId
      LEFT JOIN DepartamentoDepInterno ddi ON d.DepartamentoId = ddi.DepartamentoId
      LEFT JOIN DepartamentoInterno di ON ddi.DepartamentoInternoId = di.DepartamentoInternoId
      WHERE e.EmpleadoId = @empleadoId
        AND ISNULL(e.EstaEliminado, 0) = 0
    `;
    const params = [
      { name: 'empleadoId', type: sql.Int, value: empleadoId }
    ];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }

  /**
   * Obtiene la lista de supervisores autorizados desde LoginSEC (Puesto = SUPERVISOR)
   */
  static async obtenerSupervisores() {
    const query = `
      SELECT
        L.LoginId,
        L.Usuario,
        L.EmpleadoId,
        L.Puesto,
        ISNULL(E.Nombre, L.Usuario) AS NombreCompleto
      FROM LoginSEC L
      LEFT JOIN Empleado E ON L.EmpleadoId = E.EmpleadoId
      WHERE UPPER(LTRIM(RTRIM(ISNULL(L.Puesto, '')))) = 'SUPERVISOR'
      ORDER BY L.Usuario ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Obtiene todos los usuarios de LoginSEC (Agentes y Supervisores) para desplegables de formatos SEC
   */
  static async obtenerUsuariosSEC() {
    const query = `
      SELECT
        L.LoginId,
        L.Usuario,
        L.EmpleadoId,
        L.Puesto,
        ISNULL(E.Nombre, L.Usuario) AS NombreCompleto
      FROM LoginSEC L
      LEFT JOIN Empleado E ON L.EmpleadoId = E.EmpleadoId
      ORDER BY L.Usuario ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Obtiene todos los usuarios activos de LogIn (para CCO, Aleros y Tractoristas)
   */
  static async obtenerUsuariosLogIn() {
    const query = `
      SELECT
        L.LoginId,
        L.Usuario,
        L.EmpleadoId,
        ISNULL(E.Nombre, L.Usuario) AS NombreCompleto
      FROM LogIn L
      LEFT JOIN Empleado E ON L.EmpleadoId = E.EmpleadoId
      WHERE ISNULL(L.EstaEliminado, 0) = 0
      ORDER BY L.Usuario ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Verifica la versión actual de la aplicación en VersionamientoApps
   */
  static async verificarVersion() {
    const query = `
      SELECT TOP 1
        VersionamientoAppId,
        Version,
        ISNULL(EstaEliminado, 0) AS EstaEliminado
      FROM VersionamientoApps
      WHERE VersionamientoAppId = 21
        AND ISNULL(EstaEliminado, 0) = 0
    `;
    const result = await executeQuery(query, []);
    return result.recordset[0] || { Version: 'v1.0.9' };
  }
}

module.exports = LoginModel;

