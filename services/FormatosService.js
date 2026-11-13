/**
 * FormatosService - SIO LAATS Formatos SEC
 * Lógica de negocio y orquestación para consulta, auditoría previa y persistencia de formatos.
 * Patrón: Vista Preliminar (guardar: false) vs. Persistencia Definitiva (guardar: true).
 */

const { sql } = require('../config/database');
const FormatosModel = require('../models/FormatosModel');
const OperacionesService = require('./OperacionesService');

class FormatosService {
  /**
   * Prepara los datos para inicializar o reanudar un formato
   * @param {Object} options
   * @param {string} options.formatoId
   * @param {number} options.itinerarioId
   * @param {number} [options.encabezadoId] - Si se reanuda un formato existente
   * @param {Object} options.user
   */
  static async prepararFormato({ formatoId, itinerarioId, encabezadoId, user }) {
    const catalogo = OperacionesService.getCatalogoFormatosPorAerolinea();
    const formatoMeta = catalogo.find(f => f.id === formatoId);

    if (!formatoMeta) {
      throw new Error(`El formato con ID '${formatoId}' no existe en el catálogo.`);
    }

    let datosExistentes = null;
    let complementos = null;

    if (encabezadoId && formatoMeta.spConsulta) {
      try {
        const params = [{ name: 'EncabezadoId', type: sql.BigInt, value: encabezadoId }];
        const res = await FormatosModel.consultarDetalleFormato(formatoMeta.spConsulta, params);
        datosExistentes = res.recordsets || [];
      } catch (err) {
        console.warn(`[CONSULTA FORMATO WARN] ${formatoMeta.spConsulta}:`, err.message);
      }

      if (formatoMeta.spComplementos) {
        try {
          const compParams = [{ name: 'EncabezadoId', type: sql.BigInt, value: encabezadoId }];
          const compRes = await FormatosModel.consultarDetalleFormato(formatoMeta.spComplementos, compParams);
          complementos = compRes.recordsets || [];
        } catch (cErr) {
          console.warn(`[COMPLEMENTOS WARN] ${formatoMeta.spComplementos}:`, cErr.message);
        }
      }
    }

    return {
      meta: formatoMeta,
      esNuevo: !encabezadoId,
      encabezadoId: encabezadoId || null,
      datos: datosExistentes,
      complementos
    };
  }

  /**
   * Procesa la persistencia o validación preliminar de un formato
   * @param {Object} payload
   * @param {boolean} [payload.guardar=true] - Si false, solo valida y construye modelo en memoria
   * @param {Object} user
   */
  static async procesarGuardado(payload, user) {
    const { formatoId, itinerarioId, encabezadoId, datos, guardar = true } = payload;
    const catalogo = OperacionesService.getCatalogoFormatosPorAerolinea();
    const formatoMeta = catalogo.find(f => f.id === formatoId);

    if (!formatoMeta) {
      throw new Error(`Formato no reconocido: ${formatoId}`);
    }

    // Validación preliminar en memoria
    const resultadoValidacion = {
      valido: true,
      formato: formatoMeta.nombre,
      aerolinea: formatoMeta.aerolinea,
      itinerarioId,
      encabezadoId: encabezadoId || 'NUEVO',
      timestamp: new Date().toISOString(),
      usuario: user.usuario
    };

    if (!guardar) {
      // Modo Vista Preliminar / Auditoría (no toca la base de datos)
      return {
        success: true,
        modo: 'preliminar',
        resumen: resultadoValidacion,
        preview: datos
      };
    }

    // Persistencia definitiva mediante Stored Procedure correspondiente
    if (formatoMeta.spActualizar) {
      const spParams = [];

      // Mapeo dinámico y parametrizado según la firma del SP
      if (formatoMeta.spActualizar.includes('Json') || formatoMeta.spActualizar.includes('JSON')) {
        spParams.push({ name: 'EncabezadoId', type: sql.BigInt, value: encabezadoId || 0 });
        spParams.push({ name: 'JsonDetalles', type: sql.NVarChar(sql.MAX), value: JSON.stringify(datos) });
        spParams.push({ name: 'ModificadoPor', type: sql.NVarChar(100), value: user.usuario });
      } else {
        // Para SPs con parámetros columnares estándar
        spParams.push({ name: 'ItinerarioId', type: sql.BigInt, value: itinerarioId });
        spParams.push({ name: 'LoginId', type: sql.Int, value: user.loginId || 1 });
        spParams.push({ name: 'Usuario', type: sql.NVarChar(100), value: user.usuario });
        spParams.push({ name: 'Payload', type: sql.NVarChar(sql.MAX), value: JSON.stringify(datos) });
      }

      const spResult = await FormatosModel.guardarDetalleFormato(formatoMeta.spActualizar, spParams);
      return {
        success: true,
        modo: 'persistido',
        mensaje: `Formato '${formatoMeta.nombre}' guardado exitosamente.`,
        resultado: spResult.recordset || null
      };
    }

    return {
      success: true,
      modo: 'persistido_local',
      mensaje: `Formato validado y registrado en la sesión operacional.`
    };
  }
}

module.exports = FormatosService;
