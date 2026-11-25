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
      WHERE UPPER(LTRIM(RTRIM(ISNULL(Password, '')))) = UPPER(@pin)
        AND ISNULL(EstaEliminado, 0) = 0
    `;
    const params = [
      { name: 'pin', type: sql.NVarChar(50), value: String(pin || '').trim() }
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
   * Obtiene datos del Empleado activo y sus departamentos desde dbo.EmpleadosView
   * @param {number} empleadoId
   */
  static async obtenerDatosEmpleado(empleadoId) {
    const query = `
      SELECT TOP 1
        ev.EmpleadoId,
        ev.Codigo,
        ev.Nombre,
        ev.Puesto,
        ev.DepartamentoId,
        ev.Departamento AS DepartamentoNombre,
        ev.DepartamentoInternoId,
        ev.DepartamentoInterno AS DepartamentoInternoNombre
      FROM dbo.EmpleadosView ev
      WHERE ev.EmpleadoId = @empleadoId
        AND UPPER(LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(30), ev.EstaBaja), '')))) IN ('FALSE', '0')
        AND ISNULL(ev.EstaEliminado, 0) = 0
    `;
    const params = [
      { name: 'empleadoId', type: sql.Int, value: empleadoId }
    ];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }

  /**
   * Obtiene la lista de supervisores activos autorizados desde LoginSEC + EmpleadosView (Puesto = SUPERVISOR y EstaBaja = FALSE)
   */
  static async obtenerSupervisores() {
    const query = `
      SELECT
        L.LoginId,
        L.Usuario,
        L.EmpleadoId,
        L.Puesto,
        L.Puesto AS Rol,
        E.Codigo,
        E.Puesto AS PuestoEmpleado,
        E.DepartamentoInterno,
        ISNULL(E.Nombre, L.Usuario) AS NombreCompleto
      FROM LoginSEC L
      INNER JOIN dbo.EmpleadosView E
        ON L.EmpleadoId = E.EmpleadoId
      WHERE UPPER(LTRIM(RTRIM(ISNULL(L.Puesto, '')))) = 'SUPERVISOR'
        AND UPPER(LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(30), E.EstaBaja), '')))) IN ('FALSE', '0')
        AND ISNULL(E.EstaEliminado, 0) = 0
      ORDER BY L.Usuario ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Obtiene todos los usuarios activos de LoginSEC + EmpleadosView (EstaBaja = FALSE) para desplegables de formatos SEC
   */
  static async obtenerUsuariosSEC() {
    const query = `
      SELECT
        L.LoginId,
        L.Usuario,
        L.EmpleadoId,
        L.Puesto,
        L.Puesto AS Rol,
        E.Codigo,
        E.Puesto AS PuestoEmpleado,
        E.DepartamentoInterno,
        ISNULL(E.Nombre, L.Usuario) AS NombreCompleto
      FROM LoginSEC L
      INNER JOIN dbo.EmpleadosView E
        ON L.EmpleadoId = E.EmpleadoId
      WHERE UPPER(LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(30), E.EstaBaja), '')))) IN ('FALSE', '0')
        AND ISNULL(E.EstaEliminado, 0) = 0
      ORDER BY L.Usuario ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset || [];
  }

  /**
   * Obtiene todos los usuarios activos de LogIn + EmpleadosView (EstaBaja = FALSE)
   */
  static async obtenerUsuariosLogIn() {
    const query = `
      SELECT
        L.LoginId,
        L.Usuario,
        L.EmpleadoId,
        E.Codigo,
        E.Puesto,
        E.DepartamentoInterno,
        E.Nombre,
        ISNULL(E.Nombre, L.Usuario) AS NombreCompleto
      FROM LogIn L
      INNER JOIN dbo.EmpleadosView E
        ON L.EmpleadoId = E.EmpleadoId
      WHERE ISNULL(L.EstaEliminado, 0) = 0
        AND UPPER(LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(30), E.EstaBaja), '')))) IN ('FALSE', '0')
        AND ISNULL(E.EstaEliminado, 0) = 0
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

