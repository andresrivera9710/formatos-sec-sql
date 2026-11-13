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
      WHERE Nombre IN (
        'AEROMEXICO', 'ARAJET', 'DELTA', 'AMERIJET', 
        'LAN CARGO', 'LATAM', 'FEDEX', 'AIR CANADA', 'AVIANCA', 'TAMPA CARGO'
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
    // 1. Intentar llamar al SP dbo.TarjetasOperaciones (acepta @fecha, @fecha2, @operador, @departamentoId)
    try {
      const spParams = [
        { name: 'fecha', type: sql.DateTime, value: fecha ? new Date(fecha + 'T00:00:00') : new Date() },
        { name: 'fecha2', type: sql.DateTime, value: fecha2 ? new Date(fecha2 + 'T23:59:59') : null },
        { name: 'operador', type: sql.Int, value: parseInt(operadorId, 10) || 0 },
        { name: 'departamentoId', type: sql.Int, value: parseInt(departamentoId, 10) || 5 }
      ];
      const spResult = await executeStoredProcedure('dbo.TarjetasOperaciones', spParams);
      if (spResult.recordset && spResult.recordset.length > 0) {
        // En caso que no haya resultados el SP retorna { mensaje: 'no se encontraron resultados' }
        if (spResult.recordset[0].mensaje) {
          return [];
        }
        return spResult.recordset;
      }
    } catch (spError) {
      console.warn('[SP TarjetasOperaciones] Procedimiento no encontrado o requiere fallback a vista SQL:', spError.message);
    }

    // 2. Consulta fallback segura y parametrizada sobre Itinerario / Vuelos
    let sqlQuery = `
      SELECT 
        i.ItinerarioId AS itinerarioId,
        ISNULL(i.NoCorrelativo, '') AS nocorrelativo,
        i.FechaItinerado,
        o.Nombre AS operador,
        ISNULL(i.OperadorId, o.OperadorId) AS OperadorId,
        ISNULL(i.NoVuelo, '') AS novuelo,
        ISNULL(i.TipoOperacion, 'Comercial') AS tipoOperacion,
        ISNULL(i.Procedencia, '') AS Procedencia,
        ISNULL(i.Destino, '') AS Destino,
        i.ETA AS eta,
        i.ETD AS etd,
        i.ATA AS ata,
        i.ATD AS atd,
        ISNULL(a.Matricula, i.Matricula) AS Matricula,
        ISNULL(a.TipoAeronave, i.TipoAeronave) AS tipoAeronave,
        ISNULL(i.PuertaPosicion, '') AS puertaposicion,
        ISNULL(i.Faja, 0) AS faja,
        ISNULL(i.Anulado, 0) AS anulado,
        ISNULL(i.MotivoAnulacion, '') AS Motivo,
        ISNULL(i.MotivoCambio, '') AS MotivoCambio,
        i.CambioOperacionItinerarioId,
        a.AeronaveId
      FROM Itinerario i
      LEFT JOIN Operador o ON i.OperadorId = o.OperadorId
      LEFT JOIN Aeronave a ON i.AeronaveId = a.AeronaveId
      WHERE ISNULL(i.EstaEliminado, 0) = 0
    `;

    const queryParams = [];

    if (fecha2 && fecha2.trim() !== '') {
      sqlQuery += ` AND CAST(i.FechaItinerado AS DATE) BETWEEN CAST(@fecha1 AS DATE) AND CAST(@fecha2 AS DATE)`;
      queryParams.push({ name: 'fecha1', type: sql.Date, value: fecha });
      queryParams.push({ name: 'fecha2', type: sql.Date, value: fecha2 });
    } else {
      sqlQuery += ` AND CAST(i.FechaItinerado AS DATE) = CAST(@fecha1 AS DATE)`;
      queryParams.push({ name: 'fecha1', type: sql.Date, value: fecha });
    }

    if (operadorId && operadorId > 0) {
      sqlQuery += ` AND i.OperadorId = @operadorId`;
      queryParams.push({ name: 'operadorId', type: sql.Int, value: operadorId });
    }

    sqlQuery += ` ORDER BY i.FechaItinerado DESC, i.NoCorrelativo ASC`;

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
        ISNULL(i.NoCorrelativo, '') AS nocorrelativo,
        i.FechaItinerado,
        o.Nombre AS operador,
        i.OperadorId,
        ISNULL(i.NoVuelo, '') AS novuelo,
        ISNULL(i.TipoOperacion, 'Comercial') AS tipoOperacion,
        ISNULL(i.Procedencia, '') AS Procedencia,
        ISNULL(i.Destino, '') AS Destino,
        i.ETA AS eta,
        i.ETD AS etd,
        i.ATA AS ata,
        i.ATD AS atd,
        ISNULL(a.Matricula, i.Matricula) AS Matricula,
        ISNULL(a.TipoAeronave, i.TipoAeronave) AS tipoAeronave,
        ISNULL(i.PuertaPosicion, '') AS puertaposicion,
        ISNULL(i.Faja, 0) AS faja,
        ISNULL(i.Anulado, 0) AS anulado,
        ISNULL(i.MotivoAnulacion, '') AS Motivo,
        ISNULL(i.MotivoCambio, '') AS MotivoCambio,
        i.CambioOperacionItinerarioId,
        a.AeronaveId
      FROM Itinerario i
      LEFT JOIN Operador o ON i.OperadorId = o.OperadorId
      LEFT JOIN Aeronave a ON i.AeronaveId = a.AeronaveId
      WHERE i.ItinerarioId = @itinerarioId
        AND ISNULL(i.EstaEliminado, 0) = 0
    `;
    const params = [{ name: 'itinerarioId', type: sql.Int, value: itinerarioId }];
    const result = await executeQuery(query, params);
    return result.recordset[0] || null;
  }
}

module.exports = OperacionesModel;

