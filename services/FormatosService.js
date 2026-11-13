/**
 * FormatosService - SIO LAATS Formatos SEC
 * Lógica de negocio y orquestación para consulta, auditoría previa y persistencia de formatos.
 * Patrón: Vista Preliminar (guardar: false) vs. Persistencia Definitiva (guardar: true).
 */

const { sql } = require('../config/database');
const FormatosModel = require('../models/FormatosModel');
const LoginModel = require('../models/LoginModel');
const OperacionesService = require('./OperacionesService');

const EMPRESAS_CP = [
  'LAATS',
  'GODARD(Cocinas)',
  'ODA (Combustible)',
  'OIRSA',
  'DGAC (Operaciones)',
  'AEROEXPRESS',
  'AEROMEXICO',
  'OTROS...'
];

class FormatosService {
  /**
   * Normaliza una hora a formato HH:mm (5 caracteres) si viene válida
   */
  static normalizarHora5(valor, fallback = '') {
    if (!valor) return fallback;
    const str = String(valor).trim();
    const match = str.match(/(\d{2}:\d{2})/);
    return match ? match[1] : fallback;
  }

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

    const isCP = formatoId.endsWith('-cp');
    const encParamName = formatoMeta.paramEncabezado || (isCP ? 'EncabezadoCPId' : 'EncabezadoId');
    const encIdNum = encabezadoId ? parseInt(encabezadoId, 10) : null;

    let datosExistentes = null;
    let complementos = null;

    if (encIdNum && formatoMeta.spConsulta) {
      try {
        const params = [{ name: encParamName, type: sql.Int, value: encIdNum }];
        const res = await FormatosModel.consultarDetalleFormato(formatoMeta.spConsulta, params);
        datosExistentes = res.recordsets || [];
      } catch (err) {
        console.error(`[CONSULTA FORMATO ERROR] ${formatoMeta.spConsulta} (@${encParamName}=${encIdNum}):`, err.message);
      }

      if (formatoMeta.spComplementos) {
        try {
          const compParams = [{ name: encParamName, type: sql.Int, value: encIdNum }];
          const compRes = await FormatosModel.consultarDetalleFormato(formatoMeta.spComplementos, compParams);
          complementos = compRes.recordsets || [];
        } catch (cErr) {
          console.error(`[COMPLEMENTOS ERROR] ${formatoMeta.spComplementos} (@${encParamName}=${encIdNum}):`, cErr.message);
        }
      }
    }

    // Cargar supervisores desde LoginSEC (Puesto = 'SUPERVISOR') para cuadro combinado
    let supervisores = [];
    try {
      supervisores = await LoginModel.obtenerSupervisores();
    } catch (supErr) {
      console.warn('[SUPERVISORES WARN]', supErr.message);
    }

    let empleados = [];
    let maquinaria = [];
    let cpState = null;

    if (isCP) {
      try {
        const [empRows, maqRows] = await Promise.all([
          FormatosModel.obtenerEmpleadosActivos(),
          FormatosModel.obtenerMaquinariaActiva()
        ]);
        empleados = empRows || [];
        maquinaria = maqRows || [];
      } catch (catErr) {
        console.warn('[CATALOGOS CP WARN]', catErr.message);
      }

      const complemento = complementos?.[0]?.[0] || null;
      const detalles = (datosExistentes?.[0] || []).filter(
        d => d && d.Nombre && String(d.Nombre).trim() !== ''
      );

      cpState = {
        complemento,
        detalles,
        empresas: EMPRESAS_CP
      };
    }

    return {
      meta: formatoMeta,
      esNuevo: !encIdNum,
      encabezadoId: encIdNum || null,
      datos: datosExistentes,
      complementos,
      supervisores,
      empleados,
      maquinaria,
      cpState
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

    if (formatoId.endsWith('-cp')) {
      return await FormatosService.procesarGuardadoCP(payload, formatoMeta, user);
    }

    // Validación preliminar en memoria (otros formatos)
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
      return {
        success: true,
        modo: 'preliminar',
        resumen: resultadoValidacion,
        preview: datos
      };
    }

    if (formatoMeta.spActualizar) {
      const spParams = [];
      const encParamName = formatoMeta.paramEncabezado || 'EncabezadoId';

      if (formatoMeta.spActualizar.includes('Json') || formatoMeta.spActualizar.includes('JSON')) {
        spParams.push({ name: encParamName, type: sql.Int, value: parseInt(encabezadoId, 10) || 0 });
        spParams.push({ name: 'JsonDetalles', type: sql.NVarChar(sql.MAX), value: JSON.stringify(datos) });
        spParams.push({ name: 'ModificadoPor', type: sql.NVarChar(100), value: user.usuario });
      } else {
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
      mensaje: 'Formato validado y registrado en la sesión operacional.'
    };
  }

  /**
   * Orquesta la validación, creación y actualización completa de Control de Perimétrica (CP)
   */
  static async procesarGuardadoCP(payload, formatoMeta, user) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const cp = payload.datos?.cpPayload || payload.datos || {};

    const fechaIso = String(cp.fecha || '').trim().substring(0, 10);
    const horaInicio = FormatosService.normalizarHora5(cp.horaInicio);
    const supervisorId = parseInt(cp.supervisorEmpleadoId, 10);
    const supervisorNombre = String(cp.supervisorNombre || '').trim();
    const arriboDelVuelo = FormatosService.normalizarHora5(cp.arriboDelVuelo, '00:00');
    const horaAsegurado = FormatosService.normalizarHora5(cp.horaAsegurado, '');
    const tractoristaId = parseInt(cp.tractoristaEmpleadoId, 10) || 0;
    const maquinariaEquipoId = parseInt(cp.maquinariaEquipoId, 10) || 0;
    const observaciones = String(cp.observaciones || '').trim();

    const alerosIds = Array.isArray(cp.alerosIds)
      ? cp.alerosIds.map(id => parseInt(id, 10)).filter(id => Number.isFinite(id) && id > 0).slice(0, 2)
      : [];

    const registros = Array.isArray(cp.registros) ? cp.registros : [];

    // Validaciones de negocio
    if (!fechaIso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
      return { success: false, statusCode: 400, message: 'La fecha de operación es obligatoria.' };
    }
    if (!horaInicio || !/^\d{2}:\d{2}$/.test(horaInicio)) {
      return { success: false, statusCode: 400, message: 'Debe ingresar una Hora de Revisión válida (HH:mm).' };
    }
    if (!Number.isFinite(supervisorId) || supervisorId <= 0) {
      return { success: false, statusCode: 400, message: 'Debe seleccionar un Supervisor de Turno en el cuadro combinado.' };
    }

    // Regla estricta: bloquear guardado si alguna persona aún no tiene hora de salida
    const pendientesSalida = registros.filter(r => !r.HoraSalida || String(r.HoraSalida).trim() === '');
    if (pendientesSalida.length > 0) {
      return {
        success: false,
        statusCode: 400,
        message: '¡ALERTA DE SEGURIDAD! Hay una o más personas que aún NO han salido de la aeronave. Por favor, registra su hora de salida antes de guardar.'
      };
    }

    if (maquinariaEquipoId > 0 && tractoristaId <= 0) {
      return {
        success: false,
        statusCode: 400,
        message: 'Debe seleccionar al Tractorista cuando asigna un No. Unidad.'
      };
    }

    const resumenPreliminar = {
      valido: true,
      formato: formatoMeta.nombre,
      aerolinea: formatoMeta.aerolinea,
      itinerarioId,
      encabezadoId: encabezadoId || 'NUEVO',
      fecha: fechaIso,
      horaInicio,
      supervisor: supervisorNombre || `ID #${supervisorId}`,
      totalRegistros: registros.length,
      totalAleros: alerosIds.length,
      timestamp: new Date().toISOString(),
      usuario: user.usuario
    };

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: resumenPreliminar,
        preview: cp
      };
    }

    const encIdNum = parseInt(encabezadoId, 10) || 0;
    let targetEncabezadoId = encIdNum;

    const jsonDetalles = registros.map((r) => {
      const hIn = FormatosService.normalizarHora5(r.HoraIngreso, '00:00');
      const hOut = FormatosService.normalizarHora5(r.HoraSalida, '');
      return {
        DetalleCPId: parseInt(r.DetalleCPId, 10) || 0,
        Nombre: String(r.Nombre || '').trim(),
        NoTIA: String(r.NoTIA || '').trim(),
        HoraIngreso: hIn,
        Empresa: String(r.Empresa || '').trim(),
        Motivo: String(r.Motivo || '').trim(),
        HoraSalida: hOut,
        HoraSalidaReal: hOut
      };
    });

    if (targetEncabezadoId > 0) {
      // MODO EDICIÓN / REANUDAR: ActualizarComplementosCP + ActualizarDetalleCPJson
      const compParams = [
        { name: 'EncabezadoCPId', type: sql.Int, value: targetEncabezadoId },
        { name: 'Fecha', type: sql.Date, value: new Date(`${fechaIso}T00:00:00.000Z`) },
        { name: 'HoraInicio', type: sql.NVarChar(5), value: horaInicio },
        { name: 'EmpleadoId', type: sql.Int, value: supervisorId },
        { name: 'ArriboDelVuelo', type: sql.NChar(5), value: arriboDelVuelo || '00:00' },
        { name: 'HoraAsegurado', type: sql.NChar(5), value: horaAsegurado || '' },
        { name: 'MaquinariaEmpleadoId', type: sql.Int, value: tractoristaId > 0 ? tractoristaId : null },
        { name: 'MaquinariaEquipoId', type: sql.Int, value: maquinariaEquipoId > 0 ? maquinariaEquipoId : null },
        { name: 'NombreAleros', type: sql.NVarChar(sql.MAX), value: '' },
        { name: 'NombreTractorista', type: sql.NVarChar(sql.MAX), value: '' },
        { name: 'Tractorista', type: sql.NVarChar(sql.MAX), value: '' },
        { name: 'AlerosEmpleadoIds', type: sql.NVarChar(sql.MAX), value: alerosIds.join(',') },
        { name: 'AgentesEmpleadoIds', type: sql.NVarChar(sql.MAX), value: String(cp.agentesEmpleadoIds || user.empleadoId || '') },
        { name: 'ModificadoPor', type: sql.NVarChar(sql.MAX), value: user.usuario },
        { name: 'Observaciones', type: sql.NVarChar(sql.MAX), value: observaciones }
      ];

      const compRes = await FormatosModel.guardarDetalleFormato('dbo.ActualizarComplementosCP', compParams);
      if (compRes.recordset?.[0]?.Mensaje === 'no se encontro el resultado') {
        throw new Error(`No se encontró el EncabezadoCPId #${targetEncabezadoId} activo para actualizar complementos.`);
      }
    } else {
      // MODO NUEVO REGISTRO: dbo.ControlPerimetrica -> devuelve EncabezadoCPId
      const fechaUS = `${fechaIso.substring(5, 7)}/${fechaIso.substring(8, 10)}/${fechaIso.substring(0, 4)}`;
      const insertParams = [
        { name: 'Fecha', type: sql.NVarChar(20), value: fechaUS },
        { name: 'HoraInicio', type: sql.VarChar(8), value: horaInicio },
        { name: 'EmpleadoId', type: sql.Int, value: supervisorId },
        { name: 'CreadoPor', type: sql.NVarChar(150), value: user.usuario },
        { name: 'ItinerarioId', type: sql.Int, value: parseInt(itinerarioId, 10) },
        { name: 'AlerosId', type: sql.NVarChar(sql.MAX), value: alerosIds.length > 0 ? alerosIds.join(',') : null },
        { name: 'MaquinariaEquipoId', type: sql.Int, value: maquinariaEquipoId > 0 ? maquinariaEquipoId : null },
        { name: 'MaqEmpleadoId', type: sql.Int, value: tractoristaId > 0 ? tractoristaId : null },
        { name: 'ArriboDelVuelo', type: sql.VarChar(8), value: arriboDelVuelo || null },
        { name: 'HoraAsegurado', type: sql.VarChar(8), value: horaAsegurado || null },
        { name: 'AgenteId', type: sql.Int, value: parseInt(user.empleadoId, 10) || null },
        { name: 'Observaciones', type: sql.NVarChar(sql.MAX), value: observaciones || null },
        { name: 'NombresAleros', type: sql.NVarChar(sql.MAX), value: null },
        { name: 'NombreTractorista', type: sql.NVarChar(sql.MAX), value: null },
        { name: 'Tractorista', type: sql.NVarChar(sql.MAX), value: null }
      ];

      const insertRes = await FormatosModel.guardarDetalleFormato('dbo.ControlPerimetrica', insertParams);
      targetEncabezadoId = parseInt(insertRes.recordset?.[0]?.EncabezadoCPId, 10) || 0;
      if (targetEncabezadoId <= 0) {
        throw new Error('No se pudo obtener el nuevo EncabezadoCPId tras insertar ControlPerimetrica.');
      }
    }

    // Sincronizar registros de entrada/salida (DetalleCP + SalidaCP) mediante JSON
    if (jsonDetalles.length > 0 || encIdNum > 0) {
      const detParams = [
        { name: 'EncabezadoCPId', type: sql.Int, value: targetEncabezadoId },
        { name: 'JsonDetalles', type: sql.NVarChar(sql.MAX), value: JSON.stringify(jsonDetalles) },
        { name: 'ModificadoPor', type: sql.NVarChar(sql.MAX), value: user.usuario }
      ];
      const detRes = await FormatosModel.guardarDetalleFormato('dbo.ActualizarDetalleCPJson', detParams);
      if (detRes.recordset?.[0]?.Mensaje === 'no se encontro el resultado') {
        throw new Error(`No se pudieron sincronizar los registros en DetalleCP para EncabezadoCPId #${targetEncabezadoId}.`);
      }
    }

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: targetEncabezadoId,
      mensaje: `¡Control de Perimétrica guardado exitosamente! (ID #${targetEncabezadoId})`
    };
  }
}

module.exports = FormatosService;
