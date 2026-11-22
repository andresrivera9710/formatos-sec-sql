/**
 * OperacionesModel - SIO LAATS Formatos SEC
 * Consultas SQL parametrizadas para Operadores, Aeronaves y Tarjetas de Operaciones (Itinerarios).
 */

const { sql, executeQuery, executeStoredProcedure } = require('../config/database');

class OperacionesModel {
  /**
   * Obtiene la lista de Operadores/Aerolíneas soportadas por el módulo SEC
   */
  static async obtenerOperadoresAutorizados() {
    const query = `
      SELECT 
        OperadorId,
        Nombre
      FROM Operador
      WHERE (
        Nombre IN (
          'AEROMEXICO', 'ARAJET', 'DELTA', 'AMERIJET', 
          'LAN CARGO', 'LATAM', 'FEDEX', 'AIR CANADA', 'AVIANCA', 'TAMPA', 'TAMPA CARGO'
        )
        OR UPPER(Nombre) LIKE '%AMERIJET%'
      )
        AND ISNULL(EstaEliminado, 0) = 0
      ORDER BY Nombre ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset;
  }

  /**
   * Obtiene la lista de Aeronaves activas (para búsqueda de matrículas o FBO)
   */
  static async obtenerAeronaves() {
    const query = `
      SELECT 
        a.AeronaveId,
        a.Matricula,
        ISNULL(ta.Nombre, '') AS TipoAeronave
      FROM Aeronave a
      LEFT JOIN TipoAeronave ta ON a.TipoAeronaveId = ta.TipoAeronaveId
      WHERE ISNULL(a.EstaEliminado, 0) = 0
      ORDER BY a.Matricula ASC
    `;
    const result = await executeQuery(query, []);
    return result.recordset;
  }

  /**
   * Consulta las Tarjetas de Operaciones (Itinerarios) por Fecha y Operador
   * @param {Object} params
   * @param {string} params.fecha - Fecha en formato YYYY-MM-DD
   * @param {number} params.operadorId - ID del Operador (o 0 si aplica todos)
   * @param {string} [params.fecha2] - Segunda fecha para rango (opcional)
   * @param {number} params.departamentoId - ID de departamento resuelto por Anti-IDOR
   * @param {string} [params.email] - Correo del usuario autenticado
   */
  static async consultarTarjetasOperaciones({ fecha, operadorId, fecha2, departamentoId, email }) {
    const fechaIso1 = (fecha || '').toString().trim().substring(0, 10);
    const fechaIso2 = (fecha2 || '').toString().trim().substring(0, 10);

    // 1. Intentar llamar al SP dbo.TarjetasOperaciones (acepta @fecha, @fecha2, @operador, @departamentoId)
    // IMPORTANTE: Usar medianoche UTC (T00:00:00Z) para que el driver mssql no desplace la fecha por zona horaria local
    try {
      const spParams = [
        { name: 'fecha', type: sql.DateTime, value: fechaIso1 ? new Date(`${fechaIso1}T00:00:00Z`) : new Date() },
        { name: 'fecha2', type: sql.DateTime, value: fechaIso2 ? new Date(`${fechaIso2}T00:00:00Z`) : null },
        { name: 'operador', type: sql.Int, value: parseInt(operadorId, 10) || 0 },
        { name: 'departamentoId', type: sql.Int, value: parseInt(departamentoId, 10) || 5 }
      ];
      const spResult = await executeStoredProcedure('dbo.TarjetasOperaciones', spParams);
      const rows = spResult.recordset || [];
      // En caso que no haya resultados el SP retorna { mensaje: 'no se encontraron resultados' }
      if (rows.length > 0 && rows[0].mensaje) {
        return [];
      }
      return rows;
    } catch (spError) {
      console.warn('[SP TarjetasOperaciones] Error en SP, ejecutando consulta SQL parametrizada directa:', spError.message);
    }

    // 2. Consulta fallback segura y parametrizada sobre el esquema real de SIO
    let sqlQuery = `
      SELECT DISTINCT
        i.ItinerarioId AS itinerarioId,
        CONVERT(varchar(20), i.NoCorrelativo) AS nocorrelativo,
        i.FechaItinerado,
        o.Nombre AS operador,
        i.OperadorId,
        ISNULL(v.NoVuelo, '') AS novuelo,
        ISNULL(tp.Nombre, 'COMERCIAL') AS tipoOperacion,
        ISNULL(rh.Procedencia, '') AS Procedencia,
        ISNULL(dh.Destino, '') AS Destino,
        rh.eta,
        dh.etd,
        rh.ata,
        dh.atd,
        ISNULL(mt.Matricula, '') AS Matricula,
        ISNULL(ta.Nombre, '') AS tipoAeronave,
        ISNULL(tpi.Nombre, '') AS puertaposicion,
        ISNULL(pii.Faja, 0) AS faja,
        ianu.ItinerarioId AS anulado,
        ISNULL(ianu.Motivo, '') AS Motivo,
        ISNULL(coi.Motivo, '') AS MotivoCambio,
        coi.CambioOperacionItinerarioId,
        i.MatriculaAeronaveId
      FROM Itinerario AS i
      LEFT JOIN MatriculaAeronave AS mt ON i.MatriculaAeronaveId = mt.MatriculaAeronaveId
      LEFT JOIN Vuelos AS v ON v.VuelosId = i.VuelosId
      LEFT JOIN Operador AS o ON o.OperadorId = i.OperadorId
      LEFT JOIN TipoAeronave AS ta ON ta.TipoAeronaveId = mt.TipoAeronaveId
      LEFT JOIN DespachoHorarios AS dh ON dh.ItinerarioId = i.ItinerarioId
      LEFT JOIN RecepcionHorarios AS rh ON rh.ItinerarioId = i.ItinerarioId
      LEFT JOIN TipoOperacion AS tp ON tp.TipoOperacionId = i.TipoOperacionId
      LEFT JOIN PosicionItinerario AS pii ON pii.ItinerarioId = i.ItinerarioId
      LEFT JOIN TipoPosicion AS tpi ON tpi.TipoPosicionId = pii.TipoPosicionId
      LEFT JOIN ItinerarioAnulado AS ianu ON ianu.ItinerarioId = i.ItinerarioId
      LEFT JOIN CambioOperacionItinerario AS coi ON coi.ItinerarioId = i.ItinerarioId
      WHERE ISNULL(i.EstaEliminado, 0) = 0
    `;

    const queryParams = [];

    if (fechaIso2) {
      sqlQuery += ` AND i.FechaItinerado BETWEEN @fecha1 AND @fecha2`;
      queryParams.push({ name: 'fecha1', type: sql.DateTime, value: new Date(`${fechaIso1}T00:00:00Z`) });
      queryParams.push({ name: 'fecha2', type: sql.DateTime, value: new Date(`${fechaIso2}T00:00:00Z`) });
    } else {
      sqlQuery += ` AND i.FechaItinerado = @fecha1`;
      queryParams.push({ name: 'fecha1', type: sql.DateTime, value: new Date(`${fechaIso1}T00:00:00Z`) });
    }

    if (operadorId && parseInt(operadorId, 10) > 0) {
      sqlQuery += ` AND i.OperadorId = @operadorId`;
      queryParams.push({ name: 'operadorId', type: sql.Int, value: parseInt(operadorId, 10) });
    }

    sqlQuery += ` ORDER BY i.FechaItinerado ASC`;

    try {
      const directResult = await executeQuery(sqlQuery, queryParams);
      return directResult.recordset;
    } catch (queryErr) {
      console.error('[OPERACIONES QUERY ERROR]', queryErr.message);
      return [];
    }
  }

  /**
   * Consulta Itinerario específico por su ID
   * @param {number} itinerarioId
   */
  static async obtenerItinerarioPorId(itinerarioId) {
    const query = `
      SELECT TOP 1
        i.ItinerarioId AS itinerarioId,
        CONVERT(varchar(20), i.NoCorrelativo) AS nocorrelativo,
        i.FechaItinerado,
        o.Nombre AS operador,
        i.OperadorId,
        ISNULL(v.NoVuelo, '') AS novuelo,
        ISNULL(tp.Nombre, 'COMERCIAL') AS tipoOperacion,
        ISNULL(rh.Procedencia, '') AS Procedencia,
        ISNULL(dh.Destino, '') AS Destino,
        rh.eta,
        dh.etd,
        rh.ata,
        dh.atd,
        ISNULL(mt.Matricula, '') AS Matricula,
        ISNULL(ta.Nombre, '') AS tipoAeronave,
        ISNULL(tpi.Nombre, '') AS puertaposicion,
        ISNULL(pii.Faja, 0) AS faja,
        ianu.ItinerarioId AS anulado,
        ISNULL(ianu.Motivo, '') AS Motivo,
        ISNULL(coi.Motivo, '') AS MotivoCambio,
        coi.CambioOperacionItinerarioId,
        i.MatriculaAeronaveId
      FROM Itinerario AS i
      LEFT JOIN MatriculaAeronave AS mt ON i.MatriculaAeronaveId = mt.MatriculaAeronaveId
      LEFT JOIN Vuelos AS v ON v.VuelosId = i.VuelosId
      LEFT JOIN Operador AS o ON o.OperadorId = i.OperadorId
      LEFT JOIN TipoAeronave AS ta ON ta.TipoAeronaveId = mt.TipoAeronaveId
      LEFT JOIN DespachoHorarios AS dh ON dh.ItinerarioId = i.ItinerarioId
      LEFT JOIN RecepcionHorarios AS rh ON rh.ItinerarioId = i.ItinerarioId
      LEFT JOIN TipoOperacion AS tp ON tp.TipoOperacionId = i.TipoOperacionId
      LEFT JOIN PosicionItinerario AS pii ON pii.ItinerarioId = i.ItinerarioId
      LEFT JOIN TipoPosicion AS tpi ON tpi.TipoPosicionId = pii.TipoPosicionId
      LEFT JOIN ItinerarioAnulado AS ianu ON ianu.ItinerarioId = i.ItinerarioId
      LEFT JOIN CambioOperacionItinerario AS coi ON coi.ItinerarioId = i.ItinerarioId
      WHERE i.ItinerarioId = @itinerarioId
        AND ISNULL(i.EstaEliminado, 0) = 0
    `;
    const params = [{ name: 'itinerarioId', type: sql.Int, value: itinerarioId }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }
}

module.exports = OperacionesModel;

