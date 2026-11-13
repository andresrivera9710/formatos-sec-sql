/**
 * FormatosModel - SIO LAATS Formatos SEC
 * Modelado y ejecución parametrizada hacia los Procedimientos Almacenados de Seguridad Operacional.
 * REGLAS: Sin concatenación, Soft Delete, soporte para Reanudar o Crear Nuevo.
 */

const { sql, executeQuery, executeStoredProcedure } = require('../config/database');

class FormatosModel {
  /**
   * Obtiene los formatos ya creados/iniciados para un itinerario dado
   * @param {number} itinerarioId
   */
  static async obtenerFormatosPorItinerario(itinerarioId) {
    try {
      const params = [
        { name: 'ItinerarioId', type: sql.BigInt, value: itinerarioId }
      ];
      const result = await executeStoredProcedure('dbo.ObtenerFormatosSEC', params);
      return result.recordsets[0] || [];
    } catch (err) {
      console.warn('[SP ObtenerFormatosSEC WARN] Procedimiento no disponible, usando fallback directo:', err.message);
      // Fallback si la tabla FormatoEncabezadoSEC existe
      try {
        const q = `
          SELECT 
            FormatoEncabezadoId,
            TipoFormato,
            FechaCreacion,
            CreadoPor,
            OperadorId,
            ItinerarioId
          FROM FormatoEncabezadoSEC
          WHERE ItinerarioId = @itinerarioId
            AND ISNULL(EstaEliminado, 0) = 0
          ORDER BY FechaCreacion DESC
        `;
        const res = await executeQuery(q, [{ name: 'itinerarioId', type: sql.Int, value: itinerarioId }]);
        return res.recordset;
      } catch (_) {
        return [];
      }
    }
  }

  /**
   * Consulta datos de un formato específico por su procedimiento de lectura
   * @param {string} spName - Nombre del procedimiento almacenado
   * @param {Array<{name: string, type: any, value: any}>} params - Parámetros
   */
  static async consultarDetalleFormato(spName, params = []) {
    return await executeStoredProcedure(spName, params);
  }

  /**
   * Guarda o actualiza un formato mediante su procedimiento de guardado
   * @param {string} spName - Nombre del SP de actualización
   * @param {Array<{name: string, type: any, value: any}>} params - Parámetros con .input()
   */
  static async guardarDetalleFormato(spName, params = []) {
    return await executeStoredProcedure(spName, params);
  }

  /**
   * Consulta el último encabezado generado para correlativos y trazabilidad
   * @param {string} tipoFormato
   * @param {number} itinerarioId
   */
  static async obtenerUltimoEncabezado(tipoFormato, itinerarioId) {
    try {
      const params = [
        { name: 'TipoFormato', type: sql.NVarChar(150), value: tipoFormato },
        { name: 'ItinerarioId', type: sql.BigInt, value: itinerarioId }
      ];
      const result = await executeStoredProcedure('dbo.ObtenerUltimoEncabezadoSEC', params);
      return result.recordset[0] || null;
    } catch (err) {
      console.warn('[ObtenerUltimoEncabezadoSEC WARN]', err.message);
      return null;
    }
  }

  /**
   * Ejecuta Soft Delete sobre un formato de seguridad
   * @param {string} tableName - Tabla de la entidad
   * @param {string} idColumn - Columna clave primaria
   * @param {number} id - Valor ID
   * @param {string} usuarioModifica - Usuario que efectúa la acción
   */
  static async softDelete(tableName, idColumn, id, usuarioModifica) {
    // Lista blanca estricta de tablas para prevenir inyección de nombres de tabla
    const allowedTables = [
      'FormatoEncabezadoSEC', 'DetalleCP', 'DetalleCIEC', 'DetalleControlER', 
      'DetalleControlEB', 'DetalleCEC', 'DetalleCLL', 'DetalleSP', 'DetalleDAL', 'DetalleSEL'
    ];
    if (!allowedTables.includes(tableName)) {
      throw new Error('Tabla no autorizada para operación Soft Delete.');
    }

    const query = `
      UPDATE ${tableName}
      SET EstaEliminado = 1,
          ModificadoPor = @usuarioModifica,
          Modificado = GETDATE()
      WHERE ${idColumn} = @id
        AND ISNULL(EstaEliminado, 0) = 0
    `;

    const params = [
      { name: 'usuarioModifica', type: sql.NVarChar(100), value: usuarioModifica },
      { name: 'id', type: sql.BigInt, value: id }
    ];

    return await executeQuery(query, params);
  }
}

module.exports = FormatosModel;

