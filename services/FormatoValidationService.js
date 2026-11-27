/**
 * FormatoValidationService - SIO LAATS Formatos SEC
 * Arquitectura transversal de validación estricta en Backend (Defensa en Profundidad).
 * Valida pertenencia de operación/correlativo (Anti-IDOR), campos de cabecera, tipos de datos,
 * longitudes máximas y filas de cuadrícula fluida antes de abrir cualquier transacción SQL.
 */

const DATE_ISO_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const INT_POSITIVE_REGEX = /^\d+$/;
const SIGNATURE_DATA_URL_REGEX = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;
const MAX_SQL_INT = 2147483647;

class FormatoValidationService {
  /**
   * Validador genérico reutilizable basado en esquema para cualquier Formato SEC
   * @param {Object} params
   * @param {Object} params.headerData - Objeto con campos de cabecera
   * @param {Array<Object>} params.rows - Arreglo de filas de la cuadrícula fluida
   * @param {Array<Object>} params.headerRules - Reglas de validación de cabecera
   * @param {Array<Object>} params.rowRules - Reglas de validación por columna de la cuadrícula
   * @param {number} [params.minRows=1] - Mínimo de filas requeridas en la cuadrícula
   * @param {string} [params.emptyRowsMessage] - Mensaje cuando no hay filas
   */
  static validarEsquemaFormato({
    headerData = {},
    rows = [],
    headerRules = [],
    rowRules = [],
    minRows = 1,
    emptyRowsMessage = 'Debe registrar al menos una fila válida en la cuadrícula antes de guardar.'
  }) {
    const errors = [];

    // 1. Validar campos de cabecera
    for (const rule of headerRules) {
      const rawVal = headerData[rule.field];
      const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

      if (rule.required && strVal === '') {
        errors.push({
          scope: 'header',
          row: null,
          field: rule.field,
          label: rule.label,
          message: rule.requiredMessage || `El campo "${rule.label}" en el encabezado es obligatorio.`
        });
        continue;
      }

      if (strVal !== '') {
        const typeErr = FormatoValidationService._validarTipoYLongitud(strVal, rule);
        if (typeErr) {
          errors.push({
            scope: 'header',
            row: null,
            field: rule.field,
            label: rule.label,
            message: `${rule.label}: ${typeErr}`
          });
        }
      }
    }

    // 2. Validar existencia mínima de registros en la cuadrícula fluida
    const safeRows = Array.isArray(rows) ? rows : [];
    if (minRows > 0 && safeRows.length < minRows) {
      errors.push({
        scope: 'grid',
        row: null,
        field: 'registros',
        label: 'Cuadrícula de Registros',
        message: emptyRowsMessage
      });
    }

    // 3. Validar cada fila y columna de la cuadrícula fluida
    safeRows.forEach((rowObj, idx) => {
      const rowNum = idx + 1;
      const r = rowObj && typeof rowObj === 'object' ? rowObj : {};

      for (const rule of rowRules) {
        const rawVal = r[rule.field];
        const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

        if (rule.required && strVal === '') {
          errors.push({
            scope: 'row',
            row: rowNum,
            field: rule.field,
            label: rule.label,
            message: `Fila #${rowNum}: El campo "${rule.label}" es obligatorio.`
          });
          continue;
        }

        if (strVal !== '') {
          const typeErr = FormatoValidationService._validarTipoYLongitud(strVal, rule);
          if (typeErr) {
            errors.push({
              scope: 'row',
              row: rowNum,
              field: rule.field,
              label: rule.label,
              message: `Fila #${rowNum} (${rule.label}): ${typeErr}`
            });
          }
        }
      }
    });

    if (errors.length > 0) {
      return {
        valido: false,
        statusCode: 400,
        message: errors[0].message,
        errors
      };
    }

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: []
    };
  }

  /**
   * Valida tipo de dato, formato, rango numérico y longitud máxima de un valor en cadena
   */
  static _validarTipoYLongitud(strVal, rule) {
    if (rule.maxLength && strVal.length > rule.maxLength) {
      return `excede la longitud máxima permitida de ${rule.maxLength} caracteres.`;
    }

    if (rule.minLength && strVal.length < rule.minLength) {
      return `debe contener al menos ${rule.minLength} caracteres.`;
    }

    switch (rule.type) {
      case 'date': {
        if (!DATE_ISO_REGEX.test(strVal)) {
          return 'debe tener un formato de fecha válido (AAAA-MM-DD).';
        }
        const parsed = new Date(`${strVal}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime())) {
          return 'no corresponde a una fecha calendario válida.';
        }
        break;
      }
      case 'time': {
        if (!TIME_HHMM_REGEX.test(strVal)) {
          return 'debe tener un formato de hora válido de 24 horas (HH:mm).';
        }
        break;
      }
      case 'integer': {
        if (!INT_POSITIVE_REGEX.test(strVal)) {
          return 'debe ser un número entero positivo (solo dígitos).';
        }
        const num = Number(strVal);
        const minVal = rule.min !== undefined ? rule.min : 1;
        const maxVal = rule.max !== undefined ? rule.max : MAX_SQL_INT;
        if (!Number.isSafeInteger(num) || num < minVal || num > maxVal) {
          return `debe ser un número entero entre ${minVal} y ${maxVal}.`;
        }
        break;
      }
      case 'signature': {
        if (!SIGNATURE_DATA_URL_REGEX.test(strVal) || strVal.length < 120) {
          return 'debe contener una firma digital válida trazada en el recuadro.';
        }
        break;
      }
      case 'string':
      default: {
        if (rule.pattern && !rule.pattern.test(strVal)) {
          return rule.patternMessage || 'tiene un formato inválido.';
        }
        break;
      }
    }

    return null;
  }

  /**
   * Valida integralmente el formato "Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (Rayos X)"
   * (ControlEquipajeAVSECAMX / amx-er y homólogos *-er)
   * @param {Object} payload - Cuerpo recibido en POST /api/formatos/guardar
   * @param {Object} user - Usuario autenticado en req.session.user
   * @param {Object} vueloSesion - Operación activa en req.session.vueloSeleccionado
   * @param {Object} [options] - Opciones adicionales ({ requerirFirma })
   */
  static validarControlER(payload = {}, user = {}, vueloSesion = null, options = {}) {
    const errors = [];

    // 1. Validación Anti-IDOR: verificar que exista sesión de usuario y operación activa
    if (!user || !user.usuario) {
      return {
        valido: false,
        statusCode: 401,
        message: 'Sesión de usuario no válida.',
        errors: [{ scope: 'auth', row: null, field: 'usuario', label: 'Usuario', message: 'Sesión no válida.' }]
      };
    }

    const itinerarioPayload = parseInt(payload.itinerarioId, 10);
    if (!Number.isFinite(itinerarioPayload) || itinerarioPayload <= 0) {
      return {
        valido: false,
        statusCode: 400,
        message: 'El identificador de itinerario/operación (ItinerarioId) es obligatorio y debe ser numérico.',
        errors: [{
          scope: 'header',
          row: null,
          field: 'itinerarioId',
          label: 'Operación / Itinerario',
          message: 'El identificador de itinerario/operación (ItinerarioId) es obligatorio.'
        }]
      };
    }

    if (vueloSesion && vueloSesion.itinerarioId) {
      const itinerarioSesion = parseInt(vueloSesion.itinerarioId, 10);
      if (itinerarioPayload !== itinerarioSesion) {
        return {
          valido: false,
          statusCode: 403,
          message: 'Acceso denegado (Anti-IDOR): El itinerario enviado no coincide con la operación seleccionada en su sesión.',
          errors: [{
            scope: 'header',
            row: null,
            field: 'itinerarioId',
            label: 'Operación / Vuelo',
            message: 'El itinerario enviado no pertenece a la operación activa en sesión.'
          }]
        };
      }
    }

    const er = payload.datos?.erPayload || payload.datos || {};
    const encIdNum = parseInt(payload.encabezadoId, 10) || 0;
    const esNuevo = encIdNum <= 0;
    const requerirFirma = options.requerirFirma !== undefined ? Boolean(options.requerirFirma) : esNuevo;

    // Blindaje en Backend: Forzar e imponer siempre la fecha real de la operación/itinerario
    const fechaItinerarioSesion = (vueloSesion && vueloSesion.FechaItinerado)
      ? String(vueloSesion.FechaItinerado instanceof Date ? vueloSesion.FechaItinerado.toISOString() : vueloSesion.FechaItinerado).trim().substring(0, 10)
      : '';
    const fechaIso = fechaItinerarioSesion || String(er.fecha || '').trim().substring(0, 10);
    const observaciones = String(er.observaciones || '').trim();
    const firmaBase64 = String(er.firmaBase64 || er.firma || '').trim();
    const registrosRaw = Array.isArray(er.registros) ? er.registros : [];

    // 2. Reglas de cabecera (ControlEquipajeAVSECAMX)
    const headerRules = [
      {
        field: 'fecha',
        label: 'Fecha de Inspección',
        type: 'date',
        required: true,
        requiredMessage: 'La Fecha de Inspección del formato es obligatoria.'
      },
      {
        field: 'observaciones',
        label: 'Observaciones',
        type: 'string',
        required: false,
        maxLength: 2000
      }
    ];

    if (requerirFirma) {
      headerRules.push({
        field: 'firmaBase64',
        label: 'Firma Digital de Seguridad',
        type: 'signature',
        required: true,
        requiredMessage: 'Debe trazar la Firma Digital de Seguridad antes de guardar el formato.'
      });
    } else if (firmaBase64 !== '') {
      headerRules.push({
        field: 'firmaBase64',
        label: 'Firma Digital de Seguridad',
        type: 'signature',
        required: false
      });
    }

    // 3. Reglas de la cuadrícula fluida (ColPasajeros -> DetalleControlER)
    const rowRules = [
      {
        field: 'Pasajero',
        label: 'Nombre del Pasajero',
        type: 'string',
        required: true,
        maxLength: 200
      },
      {
        field: 'Secuencia',
        label: 'Secuencia',
        type: 'integer',
        required: true,
        min: 1,
        max: MAX_SQL_INT
      },
      {
        field: 'Colilla',
        label: 'No. de Colilla / Marbete',
        type: 'integer',
        required: true,
        min: 1,
        max: MAX_SQL_INT
      },
      {
        field: 'Destino',
        label: 'Destino',
        type: 'string',
        required: false,
        maxLength: 100
      },
      {
        field: 'HoraRevision',
        label: 'Hora de Revisión',
        type: 'time',
        required: true
      },
      {
        field: 'AgenteAVSEC',
        label: 'Nombre Agente AVSEC que realiza inspección',
        type: 'string',
        required: true,
        maxLength: 150
      },
      {
        field: 'AgenteSeguridad',
        label: 'Agente de seguridad AMX durante la inspección',
        type: 'string',
        required: true,
        maxLength: 150
      }
    ];

    const fmtIdLower = String(payload.formatoId || '').trim().toLowerCase();
    const isDeltaER = fmtIdLower === 'dl-er';
    const isAmxER = fmtIdLower === 'amx-er';
    const isAraER = fmtIdLower === 'ara-er';
    const erAirlineLabel = isAmxER ? 'AMX' : (isAraER ? 'ARAJET' : (isDeltaER ? 'DL' : 'Aerolínea'));

    // Normalizar campos por fila antes de pasar al validador de esquema
    const agSegRule = rowRules.find(r => r.field === 'AgenteSeguridad');
    if (agSegRule) agSegRule.label = `Agente de seguridad ${erAirlineLabel} durante la inspección`;
    const nombreAgenteSesion = String(user?.nombreCompleto || user?.usuario || '').trim();
    const filasParaValidar = registrosRaw.map((r, idx) => {
      const horaNorm = FormatoValidationService.normalizarHora(r?.HoraRevision ?? r?.Hora ?? '');
      const rawSec = String(r?.Secuencia ?? '').trim();
      return {
        DetalleControlERId: parseInt(r?.DetalleControlERId, 10) || 0,
        Pasajero: String(r?.Pasajero ?? r?.Nombre ?? '').trim(),
        Secuencia: (isDeltaER && !rawSec) ? String(idx + 1) : rawSec,
        Colilla: String(r?.Colilla ?? '').trim(),
        Vuelo: String(vueloSesion?.novuelo || r?.Vuelo || '').trim(),
        Destino: String(r?.Destino ?? '').trim(),
        HoraRevision: horaNorm,
        AgenteAVSEC: String(r?.AgenteAVSEC ?? r?.Avsec ?? '').trim(),
        AgenteSeguridad: isAmxER
          ? nombreAgenteSesion
          : String(r?.AgenteSeguridad ?? r?.Seguridad ?? r?.CreadoPor ?? '').trim()
      };
    });

    const resultadoEsquema = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        observaciones,
        firmaBase64
      },
      rows: filasParaValidar,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos un (1) equipaje revisado en la cuadrícula antes de guardar el formato.'
    });

    if (!resultadoEsquema.valido) {
      errors.push(...resultadoEsquema.errors);
      return {
        valido: false,
        statusCode: 400,
        message: resultadoEsquema.message,
        errors
      };
    }

    // Construir registros normalizados y tipados para SQL Server
    const destinoDefault = String(vueloSesion?.Destino || vueloSesion?.destino || '').trim();
    const registrosNormalizados = filasParaValidar.map((r, idx) => ({
      numero: idx + 1,
      DetalleControlERId: r.DetalleControlERId > 0 ? r.DetalleControlERId : 0,
      Pasajero: r.Pasajero,
      Secuencia: parseInt(r.Secuencia, 10),
      Colilla: parseInt(r.Colilla, 10),
      Vuelo: r.Vuelo || String(vueloSesion?.novuelo || '').trim(),
      Destino: r.Destino || destinoDefault || 'N/A',
      HoraRevision: r.HoraRevision,
      AgenteAVSEC: r.AgenteAVSEC,
      AgenteSeguridad: r.AgenteSeguridad
    }));

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: encIdNum > 0 ? encIdNum : 0,
        itinerarioId: itinerarioPayload,
        fechaIso,
        observaciones,
        firmaBase64,
        totalEquipajes: registrosNormalizados.length,
        registros: registrosNormalizados
      }
    };
  }

  /**
   * Extrae HH:mm si el valor tiene formato válido o ISO
   */
  static normalizarHora(valor) {
    if (!valor) return '';
    const str = String(valor).trim();
    if (TIME_HHMM_REGEX.test(str)) return str;
    const match = str.match(/(?:T|\s|^)([01]\d|2[0-3]):([0-5]\d)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
    return str;
  }

  /**
   * Valida sesión activa y pertenencia del ItinerarioId a la sesión (Anti-IDOR transversal)
   */
  static _validarContextoOperacion(payload = {}, user = {}, vueloSesion = null) {
    if (!user || !user.usuario) {
      return {
        valido: false,
        statusCode: 401,
        message: 'Sesión de usuario no válida.',
        errors: [{ scope: 'auth', row: null, field: 'usuario', label: 'Usuario', message: 'Sesión no válida.' }]
      };
    }

    const itinerarioPayload = parseInt(payload.itinerarioId, 10);
    if (!Number.isFinite(itinerarioPayload) || itinerarioPayload <= 0) {
      return {
        valido: false,
        statusCode: 400,
        message: 'El identificador de itinerario/operación (ItinerarioId) es obligatorio y debe ser numérico.',
        errors: [{
          scope: 'header',
          row: null,
          field: 'itinerarioId',
          label: 'Operación / Itinerario',
          message: 'El identificador de itinerario/operación (ItinerarioId) es obligatorio.'
        }]
      };
    }

    if (vueloSesion && vueloSesion.itinerarioId) {
      const itinerarioSesion = parseInt(vueloSesion.itinerarioId, 10);
      if (itinerarioPayload !== itinerarioSesion) {
        return {
          valido: false,
          statusCode: 403,
          message: 'Acceso denegado (Anti-IDOR): El itinerario enviado no coincide con la operación seleccionada en su sesión.',
          errors: [{
            scope: 'header',
            row: null,
            field: 'itinerarioId',
            label: 'Operación / Vuelo',
            message: 'El itinerario enviado no pertenece a la operación activa en sesión.'
          }]
        };
      }
    }

    return {
      valido: true,
      itinerarioId: itinerarioPayload,
      encabezadoId: parseInt(payload.encabezadoId, 10) || 0
    };
  }

  /**
   * Resuelve y fuerza siempre la fecha real de la operación/itinerario activo en sesión
   */
  static _resolverFechaItinerario(vueloSesion, fallbackFecha = '') {
    const fechaIti = (vueloSesion && vueloSesion.FechaItinerado)
      ? String(vueloSesion.FechaItinerado instanceof Date ? vueloSesion.FechaItinerado.toISOString() : vueloSesion.FechaItinerado).trim().substring(0, 10)
      : '';
    return fechaIti || String(fallbackFecha || '').trim().substring(0, 10);
  }

  /**
   * 1. Valida "Control de Equipajes en Banda de Salida (Rayos X)" (ControlEquipajeBandaSalidaAMX / amx-eb)
   */
  static validarControlEB(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const eb = payload.datos?.ebPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, eb.fecha);
    const horaInicio = FormatoValidationService.normalizarHora(eb.horaInicio);
    const horaCierre = FormatoValidationService.normalizarHora(eb.horaCierre);
    const supervisorLoginId = String(eb.supervisorLoginId ?? '').trim();
    const supervisorNombre = String(eb.supervisorNombre ?? '').trim();
    const nombreOperador = String(eb.nombreOperador || user.usuario || '').trim();
    const correos = String(eb.correos ?? '0').trim() || '0';
    const comat = String(eb.comat ?? '0').trim() || '0';
    const eqTransito = String(eb.eqTransito ?? '0').trim() || '0';
    const observaciones = String(eb.observaciones || '').trim();
    const registrosRaw = Array.isArray(eb.registros)
      ? eb.registros
      : (Array.isArray(eb.detalles) ? eb.detalles : []);

    const headerRules = [
      { field: 'fecha', label: 'Fecha de Inspección', type: 'date', required: true },
      { field: 'horaInicio', label: 'Hora de Inicio', type: 'time', required: true },
      { field: 'supervisorLoginId', label: 'Supervisor', type: 'integer', required: true, min: 1 },
      { field: 'nombreOperador', label: 'Agente de Seguridad', type: 'string', required: true, maxLength: 150 },
      { field: 'correos', label: 'Correos (Cantidad)', type: 'integer', required: false, min: 0 },
      { field: 'comat', label: 'COMAT (Cantidad)', type: 'integer', required: false, min: 0 },
      { field: 'eqTransito', label: 'Equipaje en Tránsito', type: 'integer', required: false, min: 0 },
      { field: 'horaCierre', label: 'Hora de Cierre', type: 'time', required: false },
      { field: 'observaciones', label: 'Observaciones', type: 'string', required: false, maxLength: 2000 }
    ];

    const rowRules = [
      { field: 'Secuencia', label: 'Secuencia de Equipaje', type: 'integer', required: true, min: 1 }
    ];

    const filasParaValidar = registrosRaw.map((r, idx) => {
      const isAnulado = String(r?.Valor ?? '').trim().toUpperCase() === 'X' || Boolean(r?.anulado) || Boolean(r?.EstaEliminado);
      return {
        DetalleControlEBId: parseInt(r?.DetalleControlEBId ?? r?.DetalleEBId, 10) || 0,
        Orden: parseInt(r?.Orden ?? r?.Casilla, 10) || (idx + 1),
        Secuencia: String(r?.Secuencia ?? '').trim(),
        Valor: isAnulado ? 'X' : String(r?.Valor ?? r?.Secuencia ?? '').trim(),
        Motivo: String(r?.Motivo ?? r?.motivoRetiro ?? (isAnulado ? (observaciones || 'Retirado') : '')).trim()
      };
    });

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        horaInicio,
        supervisorLoginId,
        nombreOperador,
        correos,
        comat,
        eqTransito,
        horaCierre,
        observaciones
      },
      rows: filasParaValidar,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) secuencia de equipaje en la matriz antes de guardar.'
    });

    if (!esq.valido) return esq;

    // Validar que haya al menos 1 secuencia activa (no todas anuladas con X) y que las anuladas tengan motivo
    const activos = filasParaValidar.filter(r => r.Valor.toUpperCase() !== 'X');
    if (activos.length === 0) {
      return {
        valido: false,
        statusCode: 400,
        message: 'Debe existir al menos un (1) equipaje activo (sin anular) en la matriz de Banda de Salida.',
        errors: [{ scope: 'grid', row: null, field: 'registros', label: 'Matriz de Equipajes', message: 'Todas las secuencias fueron anuladas.' }]
      };
    }

    for (let i = 0; i < filasParaValidar.length; i++) {
      const f = filasParaValidar[i];
      if (f.Valor.toUpperCase() === 'X' && f.Motivo === '') {
        return {
          valido: false,
          statusCode: 400,
          message: `Secuencia #${f.Secuencia} (Celda #${i + 1}): Debe indicar el Motivo de anulación/retiro de la maleta.`,
          errors: [{ scope: 'row', row: i + 1, field: 'Motivo', label: 'Motivo de Retiro', message: 'El motivo de retiro es obligatorio.' }]
        };
      }
    }

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        horaInicio,
        horaCierre,
        supervisorLoginId: parseInt(supervisorLoginId, 10),
        supervisorNombre,
        nombreOperador,
        correosCantidad: parseInt(correos, 10) || 0,
        comatCantidad: parseInt(comat, 10) || 0,
        eqTransitoCantidad: parseInt(eqTransito, 10) || 0,
        observaciones,
        registros: filasParaValidar.map((f, idx) => ({
          DetalleControlEBId: f.DetalleControlEBId,
          Orden: idx + 1,
          Secuencia: parseInt(f.Secuencia, 10),
          Valor: f.Valor.toUpperCase() === 'X' ? 'X' : String(f.Secuencia),
          Motivo: f.Motivo
        }))
      }
    };
  }

  /**
   * 2. Valida "Control de Equipajes en Compartimentos" (ControlEquipajeCompartimientoAMX / amx-cec)
   */
  static validarControlCEC(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const cec = payload.datos?.cecPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, cec.fecha);
    const horaInicio = FormatoValidationService.normalizarHora(cec.horaInicio);
    const supervisor = String(cec.supervisor || cec.supervisorNombre || (cec.supervisorLoginId ? `Supervisor #${cec.supervisorLoginId}` : '')).trim();
    const agente = String(cec.agente || cec.agenteNombre || user.usuario || '').trim();
    const compartimientoNo = String(cec.compartimientoNo ?? cec.compartimiento ?? '').trim();
    const compAbierto = FormatoValidationService.normalizarHora(cec.compAbierto);
    const compCerrado = FormatoValidationService.normalizarHora(cec.compCerrado);
    const equipaje = String(cec.equipaje ?? '0').trim() || '0';
    const carruajes = String(cec.carruajes ?? '0').trim() || '0';
    const correos = String(cec.correos ?? '0').trim() || '0';
    const carga = String(cec.carga ?? '0').trim() || '0';
    const cantidadConEtiqueta = String(cec.cantidadConEtiqueta ?? '0').trim() || '0';
    const cantidadSinEtiqueta = String(cec.cantidadSinEtiqueta ?? '0').trim() || '0';

    const desembarqueInicio = FormatoValidationService.normalizarHora(cec.desembarqueInicio);
    const desembarqueFinal = FormatoValidationService.normalizarHora(cec.desembarqueFinal);
    const embarqueInicio = FormatoValidationService.normalizarHora(cec.embarqueInicio);
    const embarqueFinal = FormatoValidationService.normalizarHora(cec.embarqueFinal);

    const secuenciasRaw = Array.isArray(cec.secuencias)
      ? cec.secuencias
      : (Array.isArray(cec.detalles) ? cec.detalles : []);

    const headerRules = [
      { field: 'fecha', label: 'Fecha', type: 'date', required: true },
      { field: 'horaInicio', label: 'Hora (Inicia Puesto)', type: 'time', required: true },
      { field: 'supervisor', label: 'Supervisor', type: 'string', required: true, maxLength: 150 },
      { field: 'agente', label: 'Agente de Seguridad', type: 'string', required: true, maxLength: 150 },
      { field: 'compartimientoNo', label: 'Compartimento No.', type: 'integer', required: true, min: 0 },
      { field: 'compAbierto', label: 'Compartimento Abierto (Hora)', type: 'time', required: false },
      { field: 'compCerrado', label: 'Compartimento Cerrado (Hora)', type: 'time', required: false },
      { field: 'equipaje', label: 'Desembarque - Equipajes', type: 'integer', required: false, min: 0 },
      { field: 'carruajes', label: 'Desembarque - Carruajes', type: 'integer', required: false, min: 0 },
      { field: 'correos', label: 'Desembarque - Correos', type: 'integer', required: false, min: 0 },
      { field: 'carga', label: 'Desembarque - Carga', type: 'integer', required: false, min: 0 },
      { field: 'cantidadSinEtiqueta', label: 'Dañados Sin Etiqueta', type: 'integer', required: false, min: 0 },
      { field: 'cantidadConEtiqueta', label: 'Dañados Con Etiqueta', type: 'integer', required: false, min: 0 }
    ];

    if (desembarqueInicio) headerRules.push({ field: 'desembarqueInicio', label: 'Desembarque Hora Inicio', type: 'time', required: false });
    if (desembarqueFinal) headerRules.push({ field: 'desembarqueFinal', label: 'Desembarque Hora Fin', type: 'time', required: false });
    if (embarqueInicio) headerRules.push({ field: 'embarqueInicio', label: 'Embarque Hora Inicio', type: 'time', required: false });
    if (embarqueFinal) headerRules.push({ field: 'embarqueFinal', label: 'Embarque Hora Fin', type: 'time', required: false });

    const tiaOirsa = String(cec.tiaOirsa || '').trim();
    const pilotoComb = String(cec.pilotoCombustible || '').trim();
    const ayudComb = String(cec.ayudanteCombustible || '').trim();
    const tiaPilotoComb = String(cec.tiaPilotoCombustible || '').trim();
    const tiaAyudComb = String(cec.tiaAyudanteCombustible || '').trim();
    const pilotoCoc = String(cec.pilotoCocinas || '').trim();
    const ayudCoc = String(cec.ayudanteCocinas || '').trim();
    const tiaPilotoCoc = String(cec.tiaPilotoCocinas || '').trim();
    const tiaAyudCoc = String(cec.tiaAyudanteCocinas || '').trim();

    const fmtCecLower = String(payload.formatoId || '').trim().toLowerCase();
    const isNumericTiaCEC = fmtCecLower === 'amx-cec' || fmtCecLower === 'ara-cec';
    if (isNumericTiaCEC) {
      headerRules.push(
        { field: 'tiaOirsa', label: 'TIA (OIRSA)', type: 'string', required: false, maxLength: 50, pattern: /^\d+$/, patternMessage: 'debe contener únicamente valores numéricos (0-9).' },
        { field: 'tiaPilotoCombustible', label: 'TIA (Piloto Combustible)', type: 'string', required: false, maxLength: 50, pattern: /^\d+$/, patternMessage: 'debe contener únicamente valores numéricos (0-9).' },
        { field: 'tiaAyudanteCombustible', label: 'TIA (Ayudante Combustible)', type: 'string', required: false, maxLength: 50, pattern: /^\d+$/, patternMessage: 'debe contener únicamente valores numéricos (0-9).' },
        { field: 'tiaPilotoCocinas', label: 'TIA (Piloto Cocinas)', type: 'string', required: false, maxLength: 50, pattern: /^\d+$/, patternMessage: 'debe contener únicamente valores numéricos (0-9).' },
        { field: 'tiaAyudanteCocinas', label: 'TIA (Ayudante Cocinas)', type: 'string', required: false, maxLength: 50, pattern: /^\d+$/, patternMessage: 'debe contener únicamente valores numéricos (0-9).' }
      );
    }

    const rowRules = [
      { field: 'Secuencia', label: 'Secuencia de Embarque', type: 'integer', required: true, min: 1 }
    ];

    const filasSecuencias = secuenciasRaw.map((s, idx) => {
      const isAnulado = String(s?.Valor ?? '').trim().toUpperCase() === 'X' || Boolean(s?.anulado) || Boolean(s?.EstaEliminado);
      return {
        DetalleCECDespId: parseInt(s?.DetalleCECDespId ?? s?.DetalleCECId, 10) || 0,
        Orden: parseInt(s?.Orden ?? s?.Casilla, 10) || (idx + 1),
        Secuencia: String(s?.Secuencia ?? '').trim(),
        Valor: isAnulado ? 'X' : String(s?.Valor ?? s?.Secuencia ?? '').trim(),
        Motivo: String(s?.Motivo ?? s?.motivoRetiro ?? '').trim()
      };
    });

    const isDeltaCEC = String(payload.formatoId || '').trim().toLowerCase() === 'dl-cec';
    const tieneDesembarque =
      isDeltaCEC ||
      (parseInt(equipaje, 10) || 0) > 0 ||
      (parseInt(carruajes, 10) || 0) > 0 ||
      (parseInt(correos, 10) || 0) > 0 ||
      (parseInt(carga, 10) || 0) > 0;

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        horaInicio,
        supervisor,
        agente,
        compartimientoNo,
        compAbierto,
        compCerrado,
        equipaje,
        carruajes,
        correos,
        carga,
        cantidadSinEtiqueta,
        cantidadConEtiqueta,
        desembarqueInicio,
        desembarqueFinal,
        embarqueInicio,
        embarqueFinal,
        tiaOirsa,
        tiaPilotoCombustible: tiaPilotoComb,
        tiaAyudanteCombustible: tiaAyudComb,
        tiaPilotoCocinas: tiaPilotoCoc,
        tiaAyudanteCocinas: tiaAyudCoc
      },
      rows: filasSecuencias,
      headerRules,
      rowRules,
      minRows: tieneDesembarque ? 0 : 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) secuencia en Embarque o cantidades de Desembarque antes de guardar.'
    });

    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        horaInicio,
        supervisor,
        agente,
        compartimientoNo: parseInt(compartimientoNo, 10),
        compAbierto,
        compCerrado,
        equipaje: parseInt(equipaje, 10) || 0,
        carruajes: parseInt(carruajes, 10) || 0,
        correos: parseInt(correos, 10) || 0,
        carga: parseInt(carga, 10) || 0,
        cantidadConEtiqueta: parseInt(cantidadConEtiqueta, 10) || 0,
        cantidadSinEtiqueta: parseInt(cantidadSinEtiqueta, 10) || 0,
        desembarqueInicio,
        desembarqueFinal,
        embarqueInicio,
        embarqueFinal,
        nombreOirsa: String(cec.nombreOirsa || '').trim(),
        tiaOirsa: String(cec.tiaOirsa || '').trim(),
        pilotoCombustible: pilotoComb,
        ayudanteCombustible: ayudComb,
        tiaPilotoCombustible: tiaPilotoComb,
        tiaAyudanteCombustible: tiaAyudComb,
        nombreCombustible: (pilotoComb || ayudComb) ? `${pilotoComb},${ayudComb}` : String(cec.nombreCombustible || '').trim(),
        tiaCombustible: (tiaPilotoComb || tiaAyudComb) ? `${tiaPilotoComb},${tiaAyudComb}` : String(cec.tiaCombustible || '').trim(),
        noUnidadCombustible: String(cec.noUnidadCombustible || '').trim(),
        combustibleEntrada: FormatoValidationService.normalizarHora(cec.combustibleEntrada),
        combustibleSalida: FormatoValidationService.normalizarHora(cec.combustibleSalida),
        pilotoCocinas: pilotoCoc,
        ayudanteCocinas: ayudCoc,
        tiaPilotoCocinas: tiaPilotoCoc,
        tiaAyudanteCocinas: tiaAyudCoc,
        nombreCocinas: (pilotoCoc || ayudCoc) ? `${pilotoCoc},${ayudCoc}` : String(cec.nombreCocinas || '').trim(),
        tiaCocinas: (tiaPilotoCoc || tiaAyudCoc) ? `${tiaPilotoCoc},${tiaAyudCoc}` : String(cec.tiaCocinas || '').trim(),
        noUnidadCocinas: String(cec.noUnidadCocinas || '').trim(),
        cocinasEntrada: FormatoValidationService.normalizarHora(cec.cocinasEntrada),
        cocinasSalida: FormatoValidationService.normalizarHora(cec.cocinasSalida),
        operadoresRampa: Array.isArray(cec.operadoresRampa)
          ? cec.operadoresRampa.map(x => String(x || '').trim()).filter(Boolean).join(' / ')
          : String(cec.operadoresRampa || '').trim(),
        observaciones: String(cec.observaciones || '').trim(),
        cargaEmbarqueDelta: parseInt(cec.cargaEmbarqueDelta, 10) || 0,
        equipajeMostrador: parseInt(cec.equipajeMostrador, 10) || 0,
        equipajePuerta: parseInt(cec.equipajePuerta, 10) || 0,
        secuencias: filasSecuencias.map((s, idx) => ({
          DetalleCECDespId: s.DetalleCECDespId,
          Orden: idx + 1,
          Secuencia: parseInt(s.Secuencia, 10),
          Valor: s.Valor.toUpperCase() === 'X' ? 'X' : String(s.Secuencia),
          Motivo: s.Motivo
        }))
      }
    };
  }

  /**
   * 2b. Valida "Control de Perimétrica (unificado)" (ControlPerimetrica / amx-cp y homólogos *-cp)
   */
  static validarControlCP(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const cp = payload.datos?.cpPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, cp.fecha);
    const horaInicio = FormatoValidationService.normalizarHora(cp.horaInicio);
    const supervisorEmpleadoId = String(cp.supervisorEmpleadoId ?? '').trim();
    const arriboDelVuelo = FormatoValidationService.normalizarHora(cp.arriboDelVuelo || vueloSesion?.ata || '00:00');
    const horaAsegurado = FormatoValidationService.normalizarHora(cp.horaAsegurado);
    const tractoristaEmpleadoId = String(cp.tractoristaEmpleadoId ?? '').trim();
    const maquinariaEquipoId = String(cp.maquinariaEquipoId ?? '').trim();
    const registrosRaw = Array.isArray(cp.registros) ? cp.registros : [];

    const pendientesSalida = registrosRaw.filter(r => !r?.HoraSalida || String(r.HoraSalida).trim() === '');
    if (pendientesSalida.length > 0) {
      const idxPend = registrosRaw.findIndex(r => !r?.HoraSalida || String(r.HoraSalida).trim() === '');
      return {
        valido: false,
        statusCode: 400,
        message: '¡ALERTA DE SEGURIDAD! Hay una o más personas que aún NO han salido de la aeronave. Por favor, registra su hora de salida antes de guardar.',
        errors: [{
          scope: 'row',
          row: idxPend + 1,
          field: 'HoraSalida',
          label: 'Hora de Salida',
          message: `Persona #${idxPend + 1} (${registrosRaw[idxPend]?.Nombre || 'Sin nombre'}): Falta registrar la Hora de Salida.`
        }]
      };
    }

    const maqNum = parseInt(maquinariaEquipoId, 10) || 0;
    const headerRules = [
      { field: 'fecha', label: 'Fecha de Operación', type: 'date', required: true, requiredMessage: 'La fecha de operación es obligatoria.' },
      { field: 'horaInicio', label: 'Hora de Revisión', type: 'time', required: true, requiredMessage: 'Debe ingresar una Hora de Revisión válida (HH:mm).' },
      { field: 'supervisorEmpleadoId', label: 'Supervisor de Turno', type: 'integer', required: true, min: 1, requiredMessage: 'Debe seleccionar un Supervisor de Turno en el cuadro combinado.' }
    ];
    if (horaAsegurado) {
      headerRules.push({ field: 'horaAsegurado', label: 'Hora Aeronave Asegurada', type: 'time', required: false });
    }
    if (maqNum > 0) {
      headerRules.push({ field: 'maquinariaEquipoId', label: 'No. Unidad', type: 'integer', required: false, min: 1 });
      headerRules.push({
        field: 'tractoristaEmpleadoId',
        label: 'Tractorista',
        type: 'integer',
        required: true,
        min: 1,
        requiredMessage: 'Debe seleccionar al Tractorista cuando asigna un No. Unidad.'
      });
    } else if (tractoristaEmpleadoId) {
      headerRules.push({ field: 'tractoristaEmpleadoId', label: 'Tractorista', type: 'integer', required: false, min: 1 });
    }

    const rowRules = [
      { field: 'Nombre', label: 'Nombre de la Persona', type: 'string', required: true, maxLength: 200 },
      { field: 'NoTIA', label: 'No. de TIA', type: 'string', required: true, maxLength: 50, pattern: /^\d+$/, patternMessage: 'debe contener únicamente valores numéricos (dígitos 0-9).' },
      { field: 'Empresa', label: 'Empresa', type: 'string', required: true, maxLength: 150 },
      { field: 'HoraIngreso', label: 'Hora de Ingreso', type: 'time', required: true },
      { field: 'Motivo', label: 'Motivo', type: 'string', required: true, maxLength: 250 },
      { field: 'HoraSalida', label: 'Hora de Salida', type: 'time', required: true }
    ];

    const fmtCpLower = String(payload.formatoId || '').trim().toLowerCase();
    const isAmxCP = fmtCpLower === 'amx-cp';
    const isDeltaCP = fmtCpLower === 'dl-cp';
    const isArajetCP = fmtCpLower === 'ara-cp';
    const isUpperCP = isAmxCP || isDeltaCP || isArajetCP;
    const empresasFijasCP = new Set(isDeltaCP
      ? ['LAATS', 'DELTA', 'SAG', 'ODA', 'GODARD', 'OIRSA', 'DGAC (Operaciones)']
      : (isArajetCP
        ? ['LAATS', 'GODARD(Cocinas)', 'ODA (Combustible)', 'OIRSA', 'DGAC (Operaciones)']
        : ['ODA', 'ODA (Combustible)', 'AEROEXPRESS', 'OIRSA', 'AEROMEXICO', 'LAATS']));

    const filasPersonas = registrosRaw.map(r => {
      const rawNombre = String(r?.Nombre || '').trim();
      const rawEmpresa = String(r?.Empresa || '').trim();
      const normalizedEmpresa = isUpperCP && rawEmpresa && !empresasFijasCP.has(rawEmpresa)
        ? rawEmpresa.toUpperCase()
        : rawEmpresa;
      return {
        DetalleCPId: parseInt(r?.DetalleCPId, 10) || 0,
        Nombre: isUpperCP ? rawNombre.toUpperCase() : rawNombre,
        NoTIA: String(r?.NoTIA || '').trim(),
        Empresa: normalizedEmpresa,
        HoraIngreso: FormatoValidationService.normalizarHora(r?.HoraIngreso),
        Motivo: String(r?.Motivo || '').trim(),
        HoraSalida: FormatoValidationService.normalizarHora(r?.HoraSalida)
      };
    });

    if (isUpperCP) {
      for (let i = 0; i < filasPersonas.length; i++) {
        const f = filasPersonas[i];
        const empUpper = String(f.Empresa || '').trim().toUpperCase();
        if (empUpper === 'OTROS' || empUpper === 'OTROS...') {
          return {
            valido: false,
            statusCode: 400,
            message: `Persona #${i + 1} (${f.Nombre || 'Sin nombre'}): Debe especificar el nombre real de la empresa externa en lugar de "${f.Empresa}".`,
            errors: [{
              scope: 'row',
              row: i + 1,
              field: 'Empresa',
              label: 'Empresa',
              message: 'Debe escribir el nombre real de la empresa externa cuando selecciona OTROS.'
            }]
          };
        }
      }
    }

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        horaInicio,
        supervisorEmpleadoId,
        horaAsegurado,
        tractoristaEmpleadoId,
        maquinariaEquipoId
      },
      rows: filasPersonas,
      headerRules,
      rowRules,
      minRows: 0
    });
    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        fechaIso,
        horaInicio,
        supervisorId: parseInt(supervisorEmpleadoId, 10),
        arriboDelVuelo: arriboDelVuelo || '00:00',
        horaAsegurado,
        tractoristaId: parseInt(tractoristaEmpleadoId, 10) || 0,
        maquinariaEquipoId: maqNum,
        registros: filasPersonas
      }
    };
  }

  /**
   * 3. Valida "Control de Ingreso y Egreso Cabina" (ControlIngresoEgresoCabinaAMX / amx-ciec)
   */
  static validarControlCIEC(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const ciec = payload.datos?.ciecPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, ciec.fecha);
    const horaInicio = FormatoValidationService.normalizarHora(ciec.horaInicio);
    const supervisorEmpleadoId = String(ciec.supervisorEmpleadoId ?? '').trim();
    const supervisorNombre = String(ciec.supervisorNombre ?? '').trim();
    const arriboVuelo = FormatoValidationService.normalizarHora(ciec.arriboVuelo || ciec.arriboDelVuelo || vueloSesion?.ata || '00:00');
    const aeronaveAsegurada = FormatoValidationService.normalizarHora(ciec.aeronaveAsegurada);
    const pasarelaAcoplada = FormatoValidationService.normalizarHora(ciec.pasarelaAcoplada);
    const puertaAbierta = FormatoValidationService.normalizarHora(ciec.puertaAbierta);
    const egresoTripulacion = FormatoValidationService.normalizarHora(ciec.egresoTripulacion);
    const ingresoTripulacion = FormatoValidationService.normalizarHora(ciec.ingresoTripulacion);
    const paxEntrando = String(ciec.paxEntrando ?? '0').trim() || '0';
    const primerPax = FormatoValidationService.normalizarHora(ciec.primerPax);
    const ultimoPax = FormatoValidationService.normalizarHora(ciec.ultimoPax);
    const paxAbordos = String(ciec.paxAbordos ?? '0').trim() || '0';
    const puertaCerrada = FormatoValidationService.normalizarHora(ciec.puertaCerrada);
    const desacoplePasarela = FormatoValidationService.normalizarHora(ciec.desacoplePasarela);
    const pushBack = FormatoValidationService.normalizarHora(ciec.pushBack);
    const despegue = FormatoValidationService.normalizarHora(ciec.despegue);
    const tractoristaEmpleadoId = String(ciec.tractoristaEmpleadoId ?? '').trim();
    const maquinariaEquipoId = String(ciec.maquinariaEquipoId ?? '').trim();
    const observaciones = String(ciec.observaciones || '').trim();

    let alerosIds = [];
    if (Array.isArray(ciec.alerosIds)) {
      alerosIds = ciec.alerosIds.map(id => parseInt(id, 10)).filter(id => Number.isFinite(id) && id > 0);
    } else if (ciec.alerosEmpleadoIds) {
      alerosIds = String(ciec.alerosEmpleadoIds).split(',').map(id => parseInt(id.trim(), 10)).filter(id => Number.isFinite(id) && id > 0);
    }
    const alerosNombres = Array.isArray(ciec.alerosNombres)
      ? ciec.alerosNombres.map(n => String(n || '').trim()).filter(Boolean)
      : [];

    const registrosRaw = Array.isArray(ciec.registros) ? ciec.registros : [];
    const equipajePuertaRaw = Array.isArray(ciec.equipajePuerta) ? ciec.equipajePuerta : [];

    // REGLA CRÍTICA DE SEGURIDAD: Bloquear si alguna persona registrada no tiene Hora de Salida
    const pendientesSalida = registrosRaw.filter(r => !r?.HoraSalida || String(r.HoraSalida).trim() === '');
    if (pendientesSalida.length > 0) {
      const idxPend = registrosRaw.findIndex(r => !r?.HoraSalida || String(r.HoraSalida).trim() === '');
      return {
        valido: false,
        statusCode: 400,
        message: '¡ALERTA DE SEGURIDAD! Hay una o más personas registradas que aún NO tienen hora de salida de la cabina. Por favor, registra su hora de salida antes de guardar.',
        errors: [{
          scope: 'row',
          row: idxPend + 1,
          field: 'HoraSalida',
          label: 'Hora de Salida',
          message: `Persona #${idxPend + 1} (${registrosRaw[idxPend]?.Nombre || 'Sin nombre'}): Falta registrar la Hora de Salida.`
        }]
      };
    }

    const headerRules = [
      { field: 'fecha', label: 'Fecha de Inspección', type: 'date', required: true },
      { field: 'horaInicio', label: 'Hora de Revisión', type: 'time', required: true },
      { field: 'supervisorEmpleadoId', label: 'Supervisor de Turno', type: 'integer', required: true, min: 1 },
      { field: 'paxEntrando', label: 'PAX entrando a GUA', type: 'integer', required: false, min: 0 },
      { field: 'paxAbordos', label: 'PAX Abordos', type: 'integer', required: false, min: 0 }
    ];
    if (aeronaveAsegurada) headerRules.push({ field: 'aeronaveAsegurada', label: 'Aeronave Asegurada', type: 'time', required: false });
    if (pasarelaAcoplada) headerRules.push({ field: 'pasarelaAcoplada', label: 'Pasarela Acoplada', type: 'time', required: false });
    if (puertaAbierta) headerRules.push({ field: 'puertaAbierta', label: 'Puerta Abierta', type: 'time', required: false });
    if (egresoTripulacion) headerRules.push({ field: 'egresoTripulacion', label: 'Egreso Tripulación', type: 'time', required: false });
    if (ingresoTripulacion) headerRules.push({ field: 'ingresoTripulacion', label: 'Ingreso Tripulación', type: 'time', required: false });
    if (primerPax) headerRules.push({ field: 'primerPax', label: '1er. PAX Abordo', type: 'time', required: false });
    if (ultimoPax) headerRules.push({ field: 'ultimoPax', label: 'Ult. PAX Abordo', type: 'time', required: false });
    if (puertaCerrada) headerRules.push({ field: 'puertaCerrada', label: 'Puerta Cerrada', type: 'time', required: false });
    if (desacoplePasarela) headerRules.push({ field: 'desacoplePasarela', label: 'Desacople Pasarela', type: 'time', required: false });
    if (pushBack) headerRules.push({ field: 'pushBack', label: 'PushBack', type: 'time', required: false });
    if (despegue) headerRules.push({ field: 'despegue', label: 'Despegue', type: 'time', required: false });
    if (tractoristaEmpleadoId) headerRules.push({ field: 'tractoristaEmpleadoId', label: 'Tractorista', type: 'integer', required: false, min: 1 });
    if (maquinariaEquipoId) headerRules.push({ field: 'maquinariaEquipoId', label: 'No. Unidad (Maquinaria)', type: 'integer', required: false, min: 1 });

    const rowRules = [
      { field: 'Nombre', label: 'Nombre de la Persona', type: 'string', required: true, maxLength: 200 },
      { field: 'NoTIA', label: 'No. de TIA', type: 'string', required: true, maxLength: 50, pattern: /^\d+$/, patternMessage: 'debe contener únicamente valores numéricos (dígitos 0-9).' },
      { field: 'Empresa', label: 'Empresa', type: 'string', required: true, maxLength: 150 },
      { field: 'HoraIngreso', label: 'Hora de Entrada', type: 'time', required: true },
      { field: 'Motivo', label: 'Motivo de Ingreso', type: 'string', required: true, maxLength: 250 },
      { field: 'HoraSalida', label: 'Hora de Salida', type: 'time', required: true }
    ];

    const fmtCiecLower = String(payload.formatoId || '').trim().toLowerCase();
    const isDeltaCIEC = fmtCiecLower === 'dl-ciec';
    const isArajetCIEC = fmtCiecLower === 'ara-ciec';
    const isUpperOtrosCIEC = isDeltaCIEC || isArajetCIEC;
    const empresasFijasCIEC = new Set(isDeltaCIEC
      ? ['LAATS', 'DELTA', 'SAG', 'ODA', 'GODARD', 'OIRSA', 'DGAC (Operaciones)']
      : ['LAATS', 'GODARD(Cocinas)', 'ODA (Combustible)', 'OIRSA', 'DGAC (Operaciones)']);

    const filasPersonas = registrosRaw.map(r => {
      const rawEmp = String(r?.Empresa || '').trim();
      const normEmp = isUpperOtrosCIEC && rawEmp && !empresasFijasCIEC.has(rawEmp)
        ? rawEmp.toUpperCase()
        : rawEmp;
      return {
        DetalleCIECId: parseInt(r?.DetalleCIECId, 10) || 0,
        Nombre: String(r?.Nombre || '').trim(),
        NoTIA: String(r?.NoTIA || '').trim(),
        Empresa: normEmp,
        HoraIngreso: FormatoValidationService.normalizarHora(r?.HoraIngreso),
        Motivo: String(r?.Motivo || '').trim(),
        HoraSalida: FormatoValidationService.normalizarHora(r?.HoraSalida)
      };
    });

    if (isUpperOtrosCIEC) {
      for (let i = 0; i < filasPersonas.length; i++) {
        const f = filasPersonas[i];
        const empUpper = String(f.Empresa || '').trim().toUpperCase();
        if (empUpper === 'OTROS' || empUpper === 'OTROS...') {
          return {
            valido: false,
            statusCode: 400,
            message: `Persona #${i + 1} (${f.Nombre || 'Sin nombre'}): Debe especificar el nombre real de la empresa externa en lugar de "${f.Empresa}".`,
            errors: [{
              scope: 'row',
              row: i + 1,
              field: 'Empresa',
              label: 'Empresa',
              message: 'Debe escribir el nombre real de la empresa externa cuando selecciona OTROS.'
            }]
          };
        }
      }
    }

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        horaInicio,
        supervisorEmpleadoId,
        aeronaveAsegurada,
        pasarelaAcoplada,
        puertaAbierta,
        egresoTripulacion,
        ingresoTripulacion,
        paxEntrando,
        primerPax,
        ultimoPax,
        paxAbordos,
        puertaCerrada,
        desacoplePasarela,
        pushBack,
        despegue,
        tractoristaEmpleadoId,
        maquinariaEquipoId
      },
      rows: filasPersonas,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) persona en el Control de Ingreso y Egreso a Cabina.'
    });

    if (!esq.valido) return esq;

    const secuenciasSerializadasPuerta = [];
    const secuenciasActivasPuerta = [];
    for (const s of equipajePuertaRaw) {
      if (s === null || s === undefined) continue;
      if (typeof s === 'string' || typeof s === 'number') {
        const str = String(s).trim();
        if (!str || str === '0' || str.toUpperCase() === 'X') continue;
        const wm = str.match(/^X:(\d+)$/i);
        if (wm) {
          secuenciasSerializadasPuerta.push(`X:${wm[1]}`);
        } else {
          secuenciasActivasPuerta.push(str);
          secuenciasSerializadasPuerta.push(str);
        }
        continue;
      }
      const rawVal = String(s.Valor ?? '').trim();
      const rawSec = String(s.Secuencia ?? '').trim();
      const isWithdrawn = rawVal.toUpperCase() === 'X' || Boolean(s.EstaEliminado) || Boolean(s.anulado);
      const sec = (rawSec && rawSec !== '0' && rawSec.toUpperCase() !== 'X')
        ? rawSec
        : ((rawVal && rawVal !== '0' && rawVal.toUpperCase() !== 'X') ? rawVal : '');
      if (!sec) continue;
      if (isWithdrawn) {
        secuenciasSerializadasPuerta.push(`X:${sec}`);
      } else {
        secuenciasActivasPuerta.push(sec);
        secuenciasSerializadasPuerta.push(sec);
      }
    }

    const observacionesCombinadas = secuenciasSerializadasPuerta.length > 0
      ? (observaciones ? `${observaciones} / ${secuenciasSerializadasPuerta.join(',')}` : secuenciasSerializadasPuerta.join(','))
      : observaciones;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        horaInicio,
        supervisorEmpleadoId: parseInt(supervisorEmpleadoId, 10),
        supervisorNombre,
        arriboVuelo: arriboVuelo || '00:00',
        aeronaveAsegurada,
        pasarelaAcoplada,
        puertaAbierta,
        egresoTripulacion,
        ingresoTripulacion,
        paxEntrando: parseInt(paxEntrando, 10) || 0,
        primerPax,
        ultimoPax,
        paxAbordos: parseInt(paxAbordos, 10) || 0,
        puertaCerrada,
        desacoplePasarela,
        pushBack,
        despegue,
        tractoristaEmpleadoId: tractoristaEmpleadoId ? parseInt(tractoristaEmpleadoId, 10) : null,
        tractoristaNombre: String(ciec.tractoristaNombre || '').trim(),
        maquinariaEquipoId: maquinariaEquipoId ? parseInt(maquinariaEquipoId, 10) : null,
        noUnidadLabel: String(ciec.noUnidadLabel || ciec.noUnidadNombre || '').trim(),
        alerosIds,
        alerosNombres,
        alerosDelta: String(ciec.alerosDelta || (Array.isArray(ciec.alerosNombres) ? ciec.alerosNombres.filter(Boolean).join(', ') : '')).trim(),
        maquinariaDelta: String(ciec.maquinariaDelta || ciec.noUnidadLabel || '').trim(),
        tractoristaDelta: String(ciec.tractoristaDelta || ciec.tractoristaNombre || '').trim(),
        observaciones,
        observacionesCombinadas,
        equipajePuerta: secuenciasSerializadasPuerta,
        totalEquipaje: secuenciasActivasPuerta.length,
        registros: filasPersonas
      }
    };
  }

  /**
   * 4. Valida "Equipajes en mal estado y carga dañada" (EquipajeMalEstadoAMX / amx-mecd)
   */
  static validarEquipajeMECD(payload = {}, user = {}, vueloSesion = null, options = {}) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const mecd = payload.datos?.mecdPayload || payload.datos || {};
    const esNuevo = ctx.encabezadoId <= 0;
    const requerirFirmas = options.requerirFirmas !== undefined ? Boolean(options.requerirFirmas) : false;

    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, mecd.fecha);
    const ccoEmpleadoId = String(mecd.ccoEmpleadoId ?? mecd.ccoLoginId ?? '').trim();
    const agenteEmpleadoId = String(mecd.agenteEmpleadoId ?? mecd.agenteLoginSecId ?? '').trim();
    const supervisorEmpleadoId = String(mecd.supervisorEmpleadoId ?? mecd.supervisorLoginSecId ?? '').trim();
    const firmaCCO = String(mecd.firmaCCO || '').trim();
    const firmaAgente = String(mecd.firmaAgente || '').trim();
    const firmaSupervisor = String(mecd.firmaSupervisor || '').trim();

    const headerRules = [
      { field: 'fecha', label: 'Fecha', type: 'date', required: true },
      { field: 'ccoEmpleadoId', label: 'Responsable CCO', type: 'integer', required: true, min: 1 },
      { field: 'agenteEmpleadoId', label: 'Agente de Seguridad', type: 'integer', required: true, min: 1 },
      { field: 'supervisorEmpleadoId', label: 'Supervisor de Seguridad', type: 'integer', required: true, min: 1 }
    ];

    if (requerirFirmas) {
      headerRules.push(
        { field: 'firmaCCO', label: 'Firma Digital CCO', type: 'signature', required: true },
        { field: 'firmaAgente', label: 'Firma Digital Agente de Seguridad', type: 'signature', required: true },
        { field: 'firmaSupervisor', label: 'Firma Digital Supervisor de Seguridad', type: 'signature', required: true }
      );
    }

    const revRaw = Array.isArray(mecd.revisiones)
      ? mecd.revisiones
      : (Array.isArray(mecd.revision) ? mecd.revision : []);
    const conFirmaRaw = Array.isArray(mecd.conFirma) ? mecd.conFirma : [];
    const sinFirmaRaw = Array.isArray(mecd.sinFirma) ? mecd.sinFirma : [];

    // Validar cabecera primero
    const esqHead = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        ccoEmpleadoId,
        agenteEmpleadoId,
        supervisorEmpleadoId,
        firmaCCO,
        firmaAgente,
        firmaSupervisor
      },
      rows: [],
      headerRules,
      rowRules: [],
      minRows: 0
    });
    if (!esqHead.valido) return esqHead;

    if (revRaw.length + conFirmaRaw.length + sinFirmaRaw.length === 0) {
      return {
        valido: false,
        statusCode: 400,
        message: 'Debe registrar al menos un (1) equipaje en alguna de las tres tablas (Revisión AVSEC, Maleta con Firma o Dañada en Tobogán) antes de guardar.',
        errors: [{ scope: 'grid', row: null, field: 'revisiones', label: 'Tablas de Equipaje', message: 'Debe registrar al menos un equipaje.' }]
      };
    }

    // Validar Tabla 1: Revisión AVSEC
    const revisiones = revRaw.map(r => ({
      DetalleEquipMECDId: parseInt(r?.DetalleEquipMECDId ?? r?.EquipajeRevId, 10) || 0,
      Control: String(r?.Control ?? '').trim(),
      Colilla: String(r?.Colilla ?? '').trim()
    }));
    const valRev = FormatoValidationService.validarEsquemaFormato({
      headerData: {},
      rows: revisiones,
      headerRules: [],
      rowRules: [
        { field: 'Control', label: 'Revisión AVSEC - Control', type: 'integer', required: true, min: 1 },
        { field: 'Colilla', label: 'Revisión AVSEC - Colilla', type: 'integer', required: true, min: 1 }
      ],
      minRows: 0
    });
    if (!valRev.valido) return valRev;

    // Validar Tabla 2: Maleta Con Firma
    const conFirma = conFirmaRaw.map(r => ({
      EquipajeMEId: parseInt(r?.EquipajeMEId, 10) || 0,
      Pasajero: String(r?.Pasajero ?? r?.NombrePasajero ?? '').trim(),
      Colilla: String(r?.Colilla ?? '').trim(),
      Control: String(r?.Control ?? '').trim(),
      Destino: String(r?.Destino ?? '').trim()
    }));
    const valCF = FormatoValidationService.validarEsquemaFormato({
      headerData: {},
      rows: conFirma,
      headerRules: [],
      rowRules: [
        { field: 'Pasajero', label: 'Maleta con Firma - Pasajero', type: 'string', required: true, maxLength: 200 },
        { field: 'Colilla', label: 'Maleta con Firma - Colilla', type: 'integer', required: true, min: 1 },
        { field: 'Control', label: 'Maleta con Firma - Control', type: 'integer', required: true, min: 1 },
        { field: 'Destino', label: 'Maleta con Firma - Destino', type: 'string', required: false, maxLength: 100 }
      ],
      minRows: 0
    });
    if (!valCF.valido) return valCF;

    // Validar Tabla 3: Dañada en Tobogán Sin Firma
    const sinFirma = sinFirmaRaw.map(r => ({
      EquipajeDTId: parseInt(r?.EquipajeDTId ?? r?.EquipajeMEDSFId, 10) || 0,
      Pasajero: String(r?.Pasajero ?? r?.NombrePasajero ?? '').trim(),
      Colilla: String(r?.Colilla ?? '').trim(),
      Control: String(r?.Control ?? '').trim(),
      Destino: String(r?.Destino ?? '').trim()
    }));
    const valSF = FormatoValidationService.validarEsquemaFormato({
      headerData: {},
      rows: sinFirma,
      headerRules: [],
      rowRules: [
        { field: 'Pasajero', label: 'Dañada en Tobogán - Pasajero', type: 'string', required: true, maxLength: 200 },
        { field: 'Colilla', label: 'Dañada en Tobogán - Colilla', type: 'integer', required: true, min: 1 },
        { field: 'Control', label: 'Dañada en Tobogán - Control', type: 'integer', required: true, min: 1 },
        { field: 'Destino', label: 'Dañada en Tobogán - Destino', type: 'string', required: false, maxLength: 100 }
      ],
      minRows: 0
    });
    if (!valSF.valido) return valSF;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        ccoEmpleadoId: parseInt(ccoEmpleadoId, 10),
        ccoNombre: String(mecd.ccoNombre || '').trim(),
        agenteEmpleadoId: parseInt(agenteEmpleadoId, 10),
        agenteNombre: String(mecd.agenteNombre || '').trim(),
        supervisorEmpleadoId: parseInt(supervisorEmpleadoId, 10),
        supervisorNombre: String(mecd.supervisorNombre || '').trim(),
        firmaCCO,
        firmaAgente,
        firmaSupervisor,
        revisiones,
        conFirma,
        sinFirma
      }
    };
  }

  /**
   * 5. Valida "Puestos por Operación" (PuestosPorOperacionAMX / amx-po)
   */
  static validarPuestosOperacion(payload = {}, user = {}, vueloSesion = null, options = {}) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const po = payload.datos?.poPayload || payload.datos || {};
    const requerirFirma = options.requerirFirma !== undefined ? Boolean(options.requerirFirma) : false;

    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, po.fecha);
    const supervisorLoginId = String(po.supervisorLoginId ?? po.supervisorLoginSecId ?? '').trim();
    const supervisorNombre = String(po.supervisorNombre ?? '').trim();
    const observaciones = String(po.observaciones || '').trim();
    const firmaSupervisor = String(po.firmaSupervisor || po.firmaBase64 || '').trim();
    const registrosRaw = Array.isArray(po.registros)
      ? po.registros
      : (Array.isArray(po.detalles) ? po.detalles : []);

    const headerRules = [
      { field: 'fecha', label: 'Fecha de Operación', type: 'date', required: true },
      { field: 'supervisorLoginId', label: 'Supervisor Responsable', type: 'integer', required: true, min: 1 },
      { field: 'observaciones', label: 'Observaciones', type: 'string', required: false, maxLength: 2000 }
    ];

    if (requerirFirma) {
      headerRules.push({
        field: 'firmaSupervisor',
        label: 'Firma Digital del Supervisor',
        type: 'signature',
        required: true,
        requiredMessage: 'Debe trazar la Firma Digital del Supervisor antes de guardar Puestos por Operación.'
      });
    }

    const rowRules = [
      { field: 'EmpleadoId', label: 'Agente (EmpleadoId)', type: 'integer', required: true, min: 1 },
      { field: 'Agentes', label: 'Nombre del Agente', type: 'string', required: true, maxLength: 150 },
      { field: 'PosicionesPOId', label: 'Posición Asignada', type: 'integer', required: true, min: 1, max: 11 }
    ];

    const filasParaValidar = registrosRaw.map((r, idx) => ({
      No: idx + 1,
      DetallePOId: parseInt(r?.DetallePOId ?? r?.PuestosOperacionId, 10) || 0,
      EmpleadoId: String(r?.EmpleadoId ?? '').trim(),
      Agentes: String(r?.Agentes ?? r?.Usuario ?? '').trim(),
      PosicionesPOId: String(r?.PosicionesPOId ?? r?.PosicionId ?? r?.Puesto ?? '').trim(),
      Posiciones: String(r?.Posiciones ?? r?.Posicion ?? '').trim()
    }));

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        supervisorLoginId,
        observaciones,
        firmaSupervisor
      },
      rows: filasParaValidar,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe asignar al menos un (1) Agente a una posición en la matriz antes de guardar.'
    });

    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        supervisorLoginId: parseInt(supervisorLoginId, 10),
        supervisorNombre,
        observaciones,
        firmaSupervisor,
        registros: filasParaValidar.map((r, idx) => ({
          No: idx + 1,
          DetallePOId: r.DetallePOId,
          EmpleadoId: parseInt(r.EmpleadoId, 10),
          Agentes: r.Agentes,
          PosicionesPOId: parseInt(r.PosicionesPOId, 10),
          Posiciones: r.Posiciones
        }))
      }
    };
  }

  /**
   * 6. Valida "Control de Flejes en Rayos X" (ControlFlejesRayosX / ara-cfr - ARAJET)
   */
  static validarControlCFR(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const cfr = payload.datos?.cfrPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, cfr.fecha);
    const supervisorEmpleadoId = String(cfr.supervisorEmpleadoId ?? cfr.empleadoId ?? '').trim();
    const supervisorLoginId = parseInt(cfr.supervisorLoginId, 10) || parseInt(user?.loginId, 10) || 1;
    const supervisorNombre = String(cfr.supervisorNombre ?? cfr.supervisor ?? '').trim();
    const primeraPlataforma = FormatoValidationService.normalizarHora(cfr.primeraPlataforma ?? cfr.primeraHora);
    const ultimaPlataforma = FormatoValidationService.normalizarHora(cfr.ultimaPlataforma ?? cfr.ultimaHora);
    const inicioOperacion = FormatoValidationService.normalizarHora(cfr.inicioOperacion);
    const horaCierre = FormatoValidationService.normalizarHora(cfr.horaCierre);
    const aviCantidad = String(cfr.aviCantidad ?? cfr.avih ?? '0').trim() || '0';
    const comatCantidad = String(cfr.comatCantidad ?? cfr.comat ?? '0').trim() || '0';

    const carretasRaw = Array.isArray(cfr.carretas)
      ? cfr.carretas
      : (Array.isArray(cfr.registros)
        ? cfr.registros
        : (Array.isArray(cfr.detalles) ? cfr.detalles : []));

    const headerRules = [
      { field: 'fecha', label: 'Fecha de Inspección', type: 'date', required: true },
      { field: 'supervisorEmpleadoId', label: 'Supervisor de Turno', type: 'integer', required: true, min: 1 },
      { field: 'primeraPlataforma', label: '1ra Hora Enviada a Plataforma', type: 'time', required: true },
      { field: 'ultimaPlataforma', label: 'Última Hora Enviada a Plataforma', type: 'time', required: true },
      { field: 'inicioOperacion', label: 'Hora Inicio de Operación', type: 'time', required: true },
      { field: 'horaCierre', label: 'Hora de Cierre', type: 'time', required: true },
      { field: 'aviCantidad', label: 'AVIH (Cantidad)', type: 'integer', required: false, min: 0 },
      { field: 'comatCantidad', label: 'COMAT (Cantidad)', type: 'integer', required: false, min: 0 }
    ];

    const rowRules = [
      { field: 'CarretaId', label: 'No. Carreta', type: 'integer', required: true, min: 1 },
      { field: 'FlejeUno', label: 'Fleje 1 (Marchamo)', type: 'string', required: true, maxLength: 100 },
      { field: 'FlejeDos', label: 'Fleje 2 (Marchamo)', type: 'string', required: true, maxLength: 100 },
      { field: 'MaquinariaEquipoId', label: 'No. Unidad (Tractor)', type: 'integer', required: true, min: 1 },
      { field: 'TotalEqDetalle', label: 'Total Equipaje en Carreta', type: 'integer', required: true, min: 0 },
      { field: 'EmpleadoId', label: 'Operador de Carreta', type: 'integer', required: true, min: 1 }
    ];

    const filasParaValidar = carretasRaw.map((c, idx) => ({
      No: idx + 1,
      DetalleCFRId: parseInt(c?.DetalleCFRId, 10) || 0,
      CarretaId: String(c?.CarretaId ?? '').trim(),
      NoCarreta: String(c?.NoCarreta ?? '').trim(),
      FlejeUno: String(c?.FlejeUno ?? '').trim(),
      FlejeDos: String(c?.FlejeDos ?? '').trim(),
      MaquinariaEquipoId: String(c?.MaquinariaEquipoId ?? '').trim(),
      NoUnidad: String(c?.NoUnidad ?? '').trim(),
      TotalEqDetalle: String(c?.TotalEqDetalle ?? c?.TotalEq ?? '').trim(),
      EmpleadoId: String(c?.EmpleadoId ?? '').trim(),
      Operador: String(c?.Operador ?? '').trim()
    }));

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        supervisorEmpleadoId,
        primeraPlataforma,
        ultimaPlataforma,
        inicioOperacion,
        horaCierre,
        aviCantidad,
        comatCantidad
      },
      rows: filasParaValidar,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) carreta con flejes en la cuadrícula antes de guardar.'
    });

    if (!esq.valido) return esq;

    const carretasNormalizadas = filasParaValidar.map((f, idx) => ({
      No: idx + 1,
      DetalleCFRId: f.DetalleCFRId,
      CarretaId: parseInt(f.CarretaId, 10),
      NoCarreta: f.NoCarreta,
      FlejeUno: f.FlejeUno,
      FlejeDos: f.FlejeDos,
      MaquinariaEquipoId: parseInt(f.MaquinariaEquipoId, 10),
      NoUnidad: f.NoUnidad,
      TotalEqDetalle: parseInt(f.TotalEqDetalle, 10) || 0,
      EmpleadoId: parseInt(f.EmpleadoId, 10),
      Operador: f.Operador
    }));

    const totalEqEncabezado = carretasNormalizadas.reduce((acc, c) => acc + c.TotalEqDetalle, 0);

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        supervisorEmpleadoId: parseInt(supervisorEmpleadoId, 10),
        supervisorLoginId,
        supervisorNombre,
        primeraPlataforma,
        ultimaPlataforma,
        inicioOperacion,
        horaCierre,
        aviCantidad: parseInt(aviCantidad, 10) || 0,
        comatCantidad: parseInt(comatCantidad, 10) || 0,
        totalEqEncabezado,
        carretas: carretasNormalizadas
      }
    };
  }

  /**
   * 7. Valida "Control de Equipajes en Rayos X" (ControlDeEquipajeEnRayosXDL_1 / dl-rx - DELTA)
   */
  static validarControlRX(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const rx = payload.datos?.rxPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, rx.fecha);
    const horaInicio = FormatoValidationService.normalizarHora(rx.horaInicio);
    const supervisorEmpleadoId = String(rx.supervisorEmpleadoId ?? rx.empleadoId ?? '').trim();
    const supervisorNombre = String(rx.supervisorNombre ?? rx.supervisor ?? '').trim();
    const pEquipajeRecibidoRX = FormatoValidationService.normalizarHora(rx.pEquipajeRecibidoRX);
    const pCarretaEnviada = FormatoValidationService.normalizarHora(rx.pCarretaEnviada);
    const uEquipajeRX = FormatoValidationService.normalizarHora(rx.uEquipajeRX);
    const uCarretaEnviada = FormatoValidationService.normalizarHora(rx.uCarretaEnviada);
    const observaciones = String(rx.observaciones || '').trim();

    const sagRaw = Array.isArray(rx.personalSAG) ? rx.personalSAG : [];
    const laatsRaw = Array.isArray(rx.personalLaats) ? rx.personalLaats : [];

    const headerRules = [
      { field: 'fecha', label: 'Fecha de Inspección', type: 'date', required: true },
      { field: 'horaInicio', label: 'Hora Inicio Puesto', type: 'time', required: true },
      { field: 'supervisorEmpleadoId', label: 'Supervisor de Turno', type: 'integer', required: true, min: 1 },
      { field: 'pEquipajeRecibidoRX', label: 'Primer Equipaje Recibido en RX', type: 'time', required: true },
      { field: 'pCarretaEnviada', label: 'Primera Carreta Enviada a Plataforma', type: 'time', required: true },
      { field: 'uEquipajeRX', label: 'Último Equipaje Recibido en RX', type: 'time', required: true },
      { field: 'uCarretaEnviada', label: 'Última Carreta Enviada a Plataforma', type: 'time', required: true },
      { field: 'observaciones', label: 'Observaciones', type: 'string', required: false, maxLength: 2000 }
    ];

    const esqHeader = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        horaInicio,
        supervisorEmpleadoId,
        pEquipajeRecibidoRX,
        pCarretaEnviada,
        uEquipajeRX,
        uCarretaEnviada,
        observaciones
      },
      rows: [],
      headerRules,
      rowRules: [],
      minRows: 0
    });
    if (!esqHeader.valido) return esqHeader;

    const filasSAG = sagRaw.map((s, idx) => ({
      No: idx + 1,
      PersonalSAGId: parseInt(s?.PersonalSAGId, 10) || 0,
      Nombre: String(s?.Nombre ?? '').trim(),
      Id: String(s?.Id ?? '').trim()
    }));
    const esqSAG = FormatoValidationService.validarEsquemaFormato({
      headerData: {},
      rows: filasSAG,
      headerRules: [],
      rowRules: [
        { field: 'Nombre', label: 'Personal SAG - Nombre', type: 'string', required: true, maxLength: 150 },
        { field: 'Id', label: 'Personal SAG - ID / TIA', type: 'string', required: true, maxLength: 50 }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos un (1) integrante en la tabla de Personal SAG.'
    });
    if (!esqSAG.valido) return esqSAG;

    const filasLaats = laatsRaw.map((l, idx) => ({
      No: idx + 1,
      PersonalLaatsId: parseInt(l?.PersonalLaatsId, 10) || 0,
      EmpleadoId: String(l?.EmpleadoId ?? '').trim(),
      Nombre: String(l?.Nombre ?? '').trim(),
      Id: String(l?.Id ?? '').trim()
    }));
    const esqLaats = FormatoValidationService.validarEsquemaFormato({
      headerData: {},
      rows: filasLaats,
      headerRules: [],
      rowRules: [
        { field: 'EmpleadoId', label: 'Personal LAATS - Empleado', type: 'integer', required: true, min: 1 },
        { field: 'Id', label: 'Personal LAATS - ID / TIA', type: 'string', required: true, maxLength: 50 }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos un (1) integrante en la tabla de Personal LAATS.'
    });
    if (!esqLaats.valido) return esqLaats;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        horaInicio,
        supervisorEmpleadoId: parseInt(supervisorEmpleadoId, 10),
        supervisorNombre,
        pEquipajeRecibidoRX,
        pCarretaEnviada,
        uEquipajeRX,
        uCarretaEnviada,
        observaciones,
        personalSAG: filasSAG,
        personalLaats: filasLaats.map(l => ({
          ...l,
          EmpleadoId: parseInt(l.EmpleadoId, 10)
        }))
      }
    };
  }

  /**
   * 8. Valida "Cargo Loading Log" (CargoLoadingLOGD / dl-cll - DELTA)
   */
  static validarControlCLL(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const cll = payload.datos?.cllPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, cll.fecha);
    const agenteSeguridad = String(cll.agenteSeguridad || user?.usuario || '').trim();
    const rawAgenteDelta = String(cll.agenteDelta || '').trim();
    const agenteTIA = String(cll.agenteTIA || cll.tiaSecurity || '').trim();
    const tiaLD = String(cll.tiaLD || '').trim();
    const agenteDelta = (tiaLD && !rawAgenteDelta.includes(','))
      ? `${rawAgenteDelta}, ${tiaLD}`
      : rawAgenteDelta;
    const registrosRaw = Array.isArray(cll.registros) ? cll.registros : [];

    const headerRules = [
      { field: 'fecha', label: 'Fecha (Date)', type: 'date', required: true },
      { field: 'agenteSeguridad', label: 'Security Agent', type: 'string', required: true, maxLength: 150 },
      { field: 'agenteDelta', label: 'DL Agent', type: 'string', required: true, maxLength: 150 },
      { field: 'agenteTIA', label: 'TIA Security / LD', type: 'string', required: true, maxLength: 100 }
    ];

    const rowRules = [
      { field: 'Guia', label: 'Airway Bill # (Guía)', type: 'string', required: true, maxLength: 100 },
      { field: 'Contenido', label: 'Contents (Contenido)', type: 'string', required: true, maxLength: 200 },
      { field: 'Piezas', label: 'Pieces (Piezas)', type: 'integer', required: true, min: 1 },
      { field: 'BIN', label: 'Loaded in Bin #', type: 'string', required: true, maxLength: 50 }
    ];

    const filas = registrosRaw.map((r, idx) => ({
      No: idx + 1,
      DetalleCLLId: parseInt(r?.DetalleCLLId, 10) || 0,
      Guia: String(r?.Guia ?? r?.AirwayBill ?? '').trim(),
      Contenido: String(r?.Contenido ?? r?.Contents ?? '').trim(),
      Piezas: String(r?.Piezas ?? r?.Pieces ?? '').trim(),
      BIN: String(r?.BIN ?? r?.LoadedBin ?? '').trim()
    }));

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        agenteSeguridad,
        agenteDelta,
        agenteTIA
      },
      rows: filas,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) guía de carga en la cuadrícula de Cargo Loading Log antes de guardar.'
    });
    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        agenteSeguridad,
        agenteDelta,
        agenteTIA,
        firmaSecurity: String(cll.firmaSecurity || '').trim(),
        firmaLD: String(cll.firmaLD || '').trim(),
        registros: filas.map(f => ({
          ...f,
          Piezas: parseInt(f.Piezas, 10) || 1
        }))
      }
    };
  }

  /**
   * 9. Valida "Selected Passenger" (SelectedPassengerD / dl-sp - DELTA)
   */
  static validarControlSP(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const sp = payload.datos?.spPayload || payload.datos || {};
    const fechaIso = FormatoValidationService._resolverFechaItinerario(vueloSesion, sp.fecha);
    const supervisorLoginId = String(sp.supervisorLoginId ?? user?.loginId ?? '1').trim();
    const supervisorNombre = String(sp.supervisorNombre || user?.usuario || '').trim();
    const firmaScreener = String(sp.firmaScreener || '').trim();
    const registrosRaw = Array.isArray(sp.registros) ? sp.registros : [];

    const headerRules = [
      { field: 'fecha', label: 'Fecha (Date)', type: 'date', required: true },
      { field: 'supervisorLoginId', label: 'Supervisor', type: 'integer', required: true, min: 1 }
    ];

    const rowRules = [
      { field: 'Apellido', label: 'Last Name (Apellido)', type: 'string', required: true, maxLength: 150 },
      { field: 'Nombre', label: 'First Name (Nombre)', type: 'string', required: true, maxLength: 150 },
      { field: 'SeleccionSPId', label: 'Selection (R / S / I)', type: 'integer', required: true, min: 1, max: 3 },
      { field: 'Asiento', label: 'Seat # (Asiento)', type: 'string', required: true, maxLength: 20 },
      { field: 'BCN', label: 'BCN', type: 'integer', required: true, min: 0 },
      { field: 'NombreAgente', label: 'Screener Name', type: 'string', required: true, maxLength: 150 }
    ];

    const filas = registrosRaw.map((r, idx) => ({
      No: idx + 1,
      DetalleSPId: parseInt(r?.DetalleSPId, 10) || 0,
      Apellido: String(r?.Apellido ?? '').trim(),
      Nombre: String(r?.Nombre ?? '').trim(),
      SeleccionSPId: String(r?.SeleccionSPId ?? '').trim(),
      SelectionCode: String(r?.SelectionCode ?? '').trim(),
      Asiento: String(r?.Asiento ?? r?.Seat ?? '').trim(),
      BCN: String(r?.BCN ?? '').trim(),
      NombreAgente: String(r?.NombreAgente ?? r?.ScreenerName ?? '').trim()
    }));

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha: fechaIso,
        supervisorLoginId
      },
      rows: filas,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos un (1) pasajero seleccionado en la cuadrícula antes de guardar.'
    });
    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso,
        supervisorLoginId: parseInt(supervisorLoginId, 10) || 1,
        supervisorNombre,
        firmaScreener,
        registros: filas.map(f => ({
          ...f,
          SeleccionSPId: parseInt(f.SeleccionSPId, 10) || 1,
          BCN: parseInt(f.BCN, 10) || 0,
          FirmaScreener: String(f.FirmaScreener || firmaScreener || '').trim()
        }))
      }
    };
  }

  /**
   * 10. Valida "Daily Activity Log" (DailyActivityLOGD / dl-dal - DELTA)
   */
  static validarControlDAL(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const dal = payload.datos?.dalPayload || payload.datos || {};
    const screener1 = String(dal.screener1 || '').trim();
    const screener2 = String(dal.screener2 || '').trim();
    const screener3 = String(dal.screener3 || '').trim();
    const screenerSup = String(dal.screenerSup || '').trim();
    const evaluadores = String(dal.evaluadores || [screener1, screener2, screener3, screenerSup].filter(Boolean).join(', ')).trim();

    const nombreGuardia = String(dal.nombreGuardia || '').trim();
    const nombreGuardia2 = String(dal.nombreGuardia2 || '').trim();
    const nombreGuardia3 = String(dal.nombreGuardia3 || '').trim();
    const nombreAgentes = String(dal.nombreAgentes || '').trim();
    const nombreGuardiaEscolta = String(dal.nombreGuardiaEscolta || '').trim();
    const nombreAgenteDelta = String(dal.nombreAgenteDelta || '').trim();

    const headerRules = [
      { field: 'evaluadores', label: 'Screeners / Supervisor (Q1)', type: 'string', required: true, maxLength: 500 },
      { field: 'nombreGuardia', label: 'Guard Name (Q2)', type: 'string', required: true, maxLength: 150 },
      { field: 'nombreGuardia2', label: 'Guard Name (Q3)', type: 'string', required: true, maxLength: 150 },
      { field: 'nombreGuardia3', label: 'Guard Name (Q4)', type: 'string', required: true, maxLength: 150 },
      { field: 'nombreAgentes', label: 'Agents at Gate (Q5)', type: 'string', required: true, maxLength: 250 },
      { field: 'nombreGuardiaEscolta', label: 'Escort Guard Name (Q6)', type: 'string', required: true, maxLength: 150 },
      { field: 'nombreAgenteDelta', label: 'DL Representative Name', type: 'string', required: true, maxLength: 150 }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        evaluadores,
        nombreGuardia,
        nombreGuardia2,
        nombreGuardia3,
        nombreAgentes,
        nombreGuardiaEscolta,
        nombreAgenteDelta
      },
      rows: [],
      headerRules,
      rowRules: [],
      minRows: 0
    });
    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        revisadoXRay: Boolean(dal.revisadoXRay === true || dal.revisadoXRay === 'true' || dal.revisadoXRay === 'YES' || dal.revisadoXRay === 1),
        cantidadEqFisicos: parseInt(dal.cantidadEqFisicos, 10) || 0,
        evaluadores,
        screener1,
        screener2,
        screener3,
        screenerSup,
        bolsasIngresadas: Boolean(dal.bolsasIngresadas === true || dal.bolsasIngresadas === 'true' || dal.bolsasIngresadas === 'YES' || dal.bolsasIngresadas === 1),
        cantidadEq: parseInt(dal.cantidadEq, 10) || 0,
        nombreGuardia,
        cantidadEqGuardia: parseInt(dal.cantidadEqGuardia, 10) || 0,
        cantidadMaletas: parseInt(dal.cantidadMaletas, 10) || 0,
        nombreGuardia2,
        cantidadPiezasManifiesto: parseInt(dal.cantidadPiezasManifiesto, 10) || 0,
        nombreGuardia3,
        nombreAgentes,
        nombreGuardiaEscolta,
        cantidadPasajerosTransito: parseInt(dal.cantidadPasajerosTransito, 10) || 0,
        cantidadPasajerosSalientes: parseInt(dal.cantidadPasajerosSalientes, 10) || 0,
        pasajerosPerdieronVuelo: String(dal.pasajerosPerdieronVuelo ?? '0').trim(),
        cantidadPiezasAceptadas: parseInt(dal.cantidadPiezasAceptadas, 10) || 0,
        cantidadPiezasCargadas: parseInt(dal.cantidadPiezasCargadas, 10) || 0,
        cantidadEqFacturados: parseInt(dal.cantidadEqFacturados, 10) || 0,
        cantidadEqCargadas: parseInt(dal.cantidadEqCargadas, 10) || 0,
        cantidadEqRetirados: parseInt(dal.cantidadEqRetirados, 10) || 0,
        eqCoincidePasajero: Boolean(dal.eqCoincidePasajero === true || dal.eqCoincidePasajero === 'true' || dal.eqCoincidePasajero === 'YES' || dal.eqCoincidePasajero === 1),
        supervisorLoginId: parseInt(dal.supervisorLoginId, 10) || parseInt(user?.loginId, 10) || 1,
        supervisorNombre: String(dal.supervisorNombre || user?.usuario || '').trim(),
        nombreAgenteDelta
      }
    };
  }

  /**
   * 11. Valida "Sequence of Events Log" (SequenceOfEventsD / dl-sel - DELTA)
   */
  static validarControlSEL(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const sel = payload.datos?.selPayload || payload.datos || {};
    const horaCierreFila = FormatoValidationService.normalizarHora(sel.horaCierreFila);
    const cantidadPasajerosFila = String(sel.cantidadPasajerosFila ?? '0').trim() || '0';
    const horaChequeadoFila = FormatoValidationService.normalizarHora(sel.horaChequeadoFila);
    const primerEqRevisada = FormatoValidationService.normalizarHora(sel.primerEqRevisada);
    const ultimoEqRevisado = FormatoValidationService.normalizarHora(sel.ultimoEqRevisado);
    const primerEqPuerta = FormatoValidationService.normalizarHora(sel.primerEqPuerta);
    const ultimoEqPuerta = FormatoValidationService.normalizarHora(sel.ultimoEqPuerta);
    const cantidadPasajerosEmbarque = String(sel.cantidadPasajerosEmbarque ?? '0').trim() || '0';
    const horaInicioEmbarque = FormatoValidationService.normalizarHora(sel.horaInicioEmbarque);
    const horaUltimoAbandona = FormatoValidationService.normalizarHora(sel.horaUltimoAbandona);
    const horaDescargaEqCarga = FormatoValidationService.normalizarHora(sel.horaDescargaEqCarga);
    const horaInicioEqCarga = FormatoValidationService.normalizarHora(sel.horaInicioEqCarga);
    const horaPuertasCerradasCar = FormatoValidationService.normalizarHora(sel.horaPuertasCerradasCar);
    const horaPuertasCerradasCab = FormatoValidationService.normalizarHora(sel.horaPuertasCerradasCab);
    const horaInicioRodajeNave = FormatoValidationService.normalizarHora(sel.horaInicioRodajeNave);
    const observaciones = String(sel.observaciones || '').trim();

    const headerRules = [
      { field: 'horaCierreFila', label: '1. Passenger Line Closed (Hora)', type: 'time', required: true },
      { field: 'cantidadPasajerosFila', label: '2. Number of Passengers in Line', type: 'integer', required: true, min: 0 },
      { field: 'horaChequeadoFila', label: '3. Last Passenger in Line Checked In', type: 'time', required: true },
      { field: 'primerEqRevisada', label: '4a. First Bags Sniffed / Screened', type: 'time', required: true },
      { field: 'ultimoEqRevisado', label: '4b. Last Bags Sniffed / Screened', type: 'time', required: true },
      { field: 'primerEqPuerta', label: '5a. First Bags Arrive at Gate', type: 'time', required: true },
      { field: 'ultimoEqPuerta', label: '5b. Last Bags Arrive at Gate', type: 'time', required: true },
      { field: 'cantidadPasajerosEmbarque', label: '6. Passengers Arrived at Boarding Gate', type: 'string', required: true, maxLength: 50 },
      { field: 'horaInicioEmbarque', label: '7. Passengers Commence Boarding', type: 'time', required: true },
      { field: 'horaUltimoAbandona', label: '8. Last Passenger Leaves Gate', type: 'time', required: true },
      { field: 'horaDescargaEqCarga', label: '9. Unloading of Baggage/Cargo Complete', type: 'time', required: true },
      { field: 'horaInicioEqCarga', label: '10. Loading of Baggage/Cargo Begins', type: 'time', required: true },
      { field: 'horaPuertasCerradasCar', label: '11. Cargo Doors Closed', type: 'time', required: true },
      { field: 'horaPuertasCerradasCab', label: '12. Cabin Doors Closed', type: 'time', required: true },
      { field: 'horaInicioRodajeNave', label: '13. Aircraft Begins to Taxi', type: 'time', required: true },
      { field: 'observaciones', label: 'Comments / Observaciones', type: 'string', required: false, maxLength: 2000 }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        horaCierreFila,
        cantidadPasajerosFila,
        horaChequeadoFila,
        primerEqRevisada,
        ultimoEqRevisado,
        primerEqPuerta,
        ultimoEqPuerta,
        cantidadPasajerosEmbarque,
        horaInicioEmbarque,
        horaUltimoAbandona,
        horaDescargaEqCarga,
        horaInicioEqCarga,
        horaPuertasCerradasCar,
        horaPuertasCerradasCab,
        horaInicioRodajeNave,
        observaciones
      },
      rows: [],
      headerRules,
      rowRules: [],
      minRows: 0
    });
    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fechaIso: FormatoValidationService._resolverFechaItinerario(vueloSesion, sel.fecha),
        aircraftArrived: FormatoValidationService._resolverFechaItinerario(vueloSesion, sel.aircraftArrived || sel.fecha),
        aircraftArrivedTime: FormatoValidationService.normalizarHora(sel.aircraftArrivedTime),
        guard: String(sel.guard || sel.supervisorNombre || user?.usuario || '').trim(),
        supervisorLoginId: parseInt(sel.supervisorLoginId, 10) || parseInt(user?.loginId, 10) || 1,
        supervisorNombre: String(sel.supervisorNombre || user?.usuario || '').trim(),
        horaCierreFila,
        cantidadPasajerosFila: parseInt(cantidadPasajerosFila, 10) || 0,
        horaChequeadoFila,
        primerEqRevisada,
        ultimoEqRevisado,
        primerEqPuerta,
        ultimoEqPuerta,
        cantidadPasajerosEmbarque,
        horaInicioEmbarque,
        horaUltimoAbandona,
        horaDescargaEqCarga,
        horaInicioEqCarga,
        horaPuertasCerradasCar,
        horaPuertasCerradasCab,
        horaInicioRodajeNave,
        observaciones
      }
    };
  }

  /**
   * 12. Valida "Aircraft Security Search" (AircraftSecuritySearch / ac-ass - AIR CANADA)
   */
  static validarControlASS(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const ass = payload.datos?.assPayload || payload.datos || {};
    const fecha = String(ass.fecha || '').trim().substring(0, 10);
    const horaInicio = FormatoValidationService.normalizarHora(ass.horaInicio);
    const horaFin = FormatoValidationService.normalizarHora(ass.horaFin);
    const departureStation = String(ass.departureStation || 'GUA').trim().toUpperCase();
    const originInbound = String(ass.originInbound || '').trim();
    const destinationOutbound = String(ass.destinationOutbound || 'GUA').trim();
    const rawSearchType = String(ass.tipoBusqueda || ass.searchType || '').trim().toUpperCase();
    const tipoBusqueda = (rawSearchType === 'VISUAL') ? 'VISUAL' : ((rawSearchType === 'PHYSICAL' || rawSearchType === 'FÍSICA' || rawSearchType === 'FISICA') ? 'PHYSICAL' : '');
    const supervisorNombre = String(ass.supervisorNombre || '').trim();
    const company = String(ass.company || 'LAATS').trim();
    const empleadoNoRaw = String(ass.empleadoNo ?? ass.empleadoId ?? '').trim();
    const firmaBase64 = String(ass.firmaBase64 || ass.signature || '').trim();
    const observaciones = String(ass.observaciones || '').trim();

    const headerRules = [
      { field: 'fecha', label: 'Fecha (Date)', type: 'date', required: true },
      { field: 'departureStation', label: 'Estación de Salida (Departure Station)', type: 'string', required: true, maxLength: 20 },
      { field: 'originInbound', label: 'Origen Vuelo Entrante (Origin Inbound)', type: 'string', required: true, maxLength: 100 },
      { field: 'destinationOutbound', label: 'Destino Saliente (Destination Outbound)', type: 'string', required: true, maxLength: 100 },
      { field: 'horaInicio', label: 'Hora Inicio Búsqueda (Search Start Time)', type: 'time', required: true },
      { field: 'horaFin', label: 'Hora Finalización (Time Search Completed)', type: 'time', required: true },
      { field: 'tipoBusqueda', label: 'Tipo de Búsqueda (Physical / Visual)', type: 'string', required: true, maxLength: 15 },
      { field: 'supervisorNombre', label: 'Supervisor del Equipo (Team Supervisor)', type: 'string', required: true, maxLength: 150 },
      { field: 'company', label: 'Empresa (Company)', type: 'string', required: true, maxLength: 100 },
      { field: 'empleadoNo', label: 'No. Empleado / No. TIA', type: 'integer', required: true, min: 1 },
      { field: 'firmaBase64', label: 'Firma del Inspector / Supervisor', type: 'signature', required: true },
      { field: 'observaciones', label: 'Observaciones / Hallazgos', type: 'string', required: false, maxLength: 2000 }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha,
        departureStation,
        originInbound,
        destinationOutbound,
        horaInicio,
        horaFin,
        tipoBusqueda,
        supervisorNombre,
        company,
        empleadoNo: empleadoNoRaw,
        firmaBase64,
        observaciones
      },
      rows: [],
      headerRules,
      rowRules: [],
      minRows: 0
    });
    if (!esq.valido) return esq;

    const rawChecks = ass.checks && typeof ass.checks === 'object' ? ass.checks : {};
    const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const checks = {
      OverheadBins: toBool(rawChecks.OverheadBins),
      ClosetsStorage: toBool(rawChecks.ClosetsStorage),
      Lavatories: toBool(rawChecks.Lavatories),
      SeatsUnder: toBool(rawChecks.SeatsUnder),
      SeatBacksTrays: toBool(rawChecks.SeatBacksTrays),
      GalleyAreas: toBool(rawChecks.GalleyAreas),
      UnderSeatCushions: toBool(rawChecks.UnderSeatCushions),
      LifeVestPackages: toBool(rawChecks.LifeVestPackages),
      CrewRestAreasNA: toBool(rawChecks.CrewRestAreasNA)
    };

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fecha,
        departureStation,
        originInbound,
        destinationOutbound,
        horaInicio,
        horaFin,
        tipoBusqueda,
        supervisorNombre,
        company,
        empleadoId: parseInt(empleadoNoRaw, 10),
        firmaBase64,
        observaciones,
        checks
      }
    };
  }

  /**
   * 13. Valida "Anexo A / Aircraft Access Control Log Sheet" (AnexoAAirCanada / ac-anexoa - AIR CANADA)
   */
  static validarControlAnexoA(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const a = payload.datos?.anexoAPayload || payload.datos || {};
    const fecha = String(a.fecha || '').trim().substring(0, 10);
    const horaRevision = FormatoValidationService.normalizarHora(a.horaRevision);
    const puerta = String(a.puerta || '').trim();
    const supervisorEmpleadoIdRaw = a.supervisorEmpleadoId !== undefined && a.supervisorEmpleadoId !== null
      ? String(a.supervisorEmpleadoId).trim()
      : '';
    const supervisorNombre = String(a.supervisorNombre || '').trim();
    const arriboVuelo = FormatoValidationService.normalizarHora(a.arriboVuelo);
    const aeronaveAsegurada = FormatoValidationService.normalizarHora(a.aeronaveAsegurada);
    const observaciones = String(a.observaciones || '').trim();

    const headerRules = [
      { field: 'fecha', label: 'Fecha', type: 'date', required: true },
      { field: 'horaRevision', label: 'Hora de Revisión', type: 'time', required: true },
      { field: 'puerta', label: 'Puerta', type: 'string', required: true, maxLength: 50 },
      { field: 'supervisorEmpleadoId', label: 'Supervisor en Turno', type: 'integer', required: true, min: 1 },
      { field: 'arriboVuelo', label: 'Arribo del Vuelo', type: 'time', required: false },
      { field: 'aeronaveAsegurada', label: 'Aeronave Asegurada', type: 'time', required: false },
      { field: 'observaciones', label: 'Observaciones', type: 'string', required: false, maxLength: 4000 }
    ];

    const rawRows = Array.isArray(a.registros) ? a.registros : [];
    const normalizedRows = rawRows.map((r) => ({
      DetalleAnexoAId: parseInt(r?.DetalleAnexoAId, 10) || 0,
      EmpleadoId: parseInt(r?.EmpleadoId, 10) || 0,
      Nombre: String(r?.Nombre || '').trim(),
      NoTIA: String(r?.NoTIA || '').trim(),
      HoraIngreso: FormatoValidationService.normalizarHora(r?.HoraIngreso),
      Empresa: String(r?.Empresa || '').trim(),
      Motivo: String(r?.Motivo || '').trim(),
      HoraSalida: FormatoValidationService.normalizarHora(r?.HoraSalida || r?.HoraSalidaReal)
    }));

    const rowRules = [
      { field: 'Nombre', label: 'Nombre completo', type: 'string', required: true, maxLength: 150 },
      { field: 'NoTIA', label: 'No. TIA', type: 'string', required: true, maxLength: 50 },
      { field: 'HoraIngreso', label: 'Hora de Ingreso', type: 'time', required: true },
      { field: 'Empresa', label: 'Empresa', type: 'string', required: true, maxLength: 100 },
      { field: 'Motivo', label: 'Motivo de Acceso', type: 'string', required: true, maxLength: 500 },
      { field: 'HoraSalida', label: 'Hora de Salida (OBLIGATORIA para cerrar)', type: 'time', required: true }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha,
        horaRevision,
        puerta,
        supervisorEmpleadoId: supervisorEmpleadoIdRaw,
        arriboVuelo,
        aeronaveAsegurada,
        observaciones
      },
      rows: normalizedRows,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) persona en el control de acceso Anexo A antes de guardar.'
    });
    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fecha,
        horaRevision,
        puerta,
        supervisorEmpleadoId: parseInt(supervisorEmpleadoIdRaw, 10),
        supervisorNombre,
        arriboVuelo,
        aeronaveAsegurada,
        observaciones,
        registros: normalizedRows
      }
    };
  }

  /**
   * 14. Valida "Annex B, to aircraft security search checklist" (AircraftCabinSearchReport_B_1 / ac-anexob - AIR CANADA)
   */
  static validarControlAnexoB(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const b = payload.datos?.anexoBPayload || payload.datos || {};
    const rawOp = String(b.tipoOperacion || 'Tránsito').trim().toLowerCase();
    const tipoOperacion = (rawOp === 'recepción' || rawOp === 'recepcion')
      ? 'Recepción'
      : (rawOp === 'despacho' ? 'Despacho' : 'Tránsito');

    const requiereParte1 = tipoOperacion !== 'Despacho';
    const requiereParte2 = tipoOperacion !== 'Recepción';

    const fecha = String(b.fecha || '').trim().substring(0, 10);
    const departureStation = String(b.departureStation || 'GUA').trim().toUpperCase();
    const originInbound = String(b.originInbound || '').trim();
    const destinationOutbound = String(b.destinationOutbound || '').trim();
    const searchStartTime = FormatoValidationService.normalizarHora(b.searchStartTime);
    const timeSearchCompleted = FormatoValidationService.normalizarHora(b.timeSearchCompleted);
    const rawGenType = String(b.generalSearchType || 'Física').trim().toLowerCase();
    const generalSearchType = rawGenType === 'visual' ? 'Visual' : 'Física';

    const normCheck = (val, fallback = 'Realizado') => {
      const s = String(val || fallback).trim().toLowerCase();
      return (s === 'n/a' || s === 'na') ? 'N/A' : 'Realizado';
    };

    const rawIdVal = String(b.idValidationRequired || 'NO').trim().toUpperCase();
    const idValidationRequired = (rawIdVal === 'SÍ' || rawIdVal === 'SI' || rawIdVal === 'YES') ? 'SÍ' : 'NO';
    const idValidationReport = String(b.idValidationReport || '').trim();
    const leadSupervisorLoginId = parseInt(b.leadSupervisorLoginId, 10) || parseInt(user?.loginId, 10) || 1;
    const leadName = String(b.leadName || '').trim();
    const leadEmployeeNumber = String(b.leadEmployeeNumber || '').trim();
    const leadSignature = String(b.leadSignature || '').trim();
    const csmName = String(b.csmName || '').trim();
    const csmSignature = String(b.csmSignature || '').trim();

    const headerRules = [
      { field: 'fecha', label: 'Fecha (Date)', type: 'date', required: true },
      { field: 'departureStation', label: 'Estación de Salida (Departure Station)', type: 'string', required: true, maxLength: 20 },
      { field: 'originInbound', label: 'Origen Vuelo Previo (Origin Inbound)', type: 'string', required: true, maxLength: 100 },
      { field: 'destinationOutbound', label: 'Destino Salida (Destination Outbound)', type: 'string', required: true, maxLength: 100 },
      { field: 'searchStartTime', label: 'Hora Inicio Búsqueda (Hoja 1)', type: 'time', required: requiereParte1 },
      { field: 'timeSearchCompleted', label: 'Hora Fin de Búsqueda (Hoja 1)', type: 'time', required: requiereParte1 },
      { field: 'leadName', label: 'Supervisor / Líder de Equipo (LAATS)', type: 'string', required: true, maxLength: 150 },
      { field: 'leadEmployeeNumber', label: 'No. Empleado / TIA (Supervisor)', type: 'string', required: true, maxLength: 50 },
      { field: 'leadSignature', label: 'Firma del Supervisor / Líder', type: 'signature', required: true },
      { field: 'idValidationReport', label: 'Detalle Validación de Identificación', type: 'string', required: idValidationRequired === 'SÍ', maxLength: 2000 },
      { field: 'csmName', label: 'Gerente de Servicio de Cabina (CSM)', type: 'string', required: false, maxLength: 150 },
      { field: 'csmSignature', label: 'Firma del CSM', type: 'signature', required: false }
    ];

    const rawZones = Array.isArray(b.zonesSearch) ? b.zonesSearch : [];
    if (rawZones.length > 5) {
      return {
        valido: false,
        statusCode: 400,
        message: 'El Anexo B permite registrar hasta un máximo de 5 zonas inspeccionadas (Zones 1 - 5).',
        errors: [{
          scope: 'grid',
          row: null,
          field: 'zonesSearch',
          label: 'Zonas Inspeccionadas',
          message: 'Máximo 5 zonas permitidas en Anexo B (Zone 1 a Zone 5).'
        }]
      };
    }

    const normalizedZones = rawZones.map((z) => {
      const stRaw = String(z?.SearchType || 'Física').trim().toLowerCase();
      return {
        EmployeeInfo: String(z?.EmployeeInfo || '').trim(),
        EmpleadoId: parseInt(z?.EmpleadoId, 10) || null,
        Zone: String(z?.Zone || '').trim(),
        SearchType: stRaw === 'visual' ? 'Visual' : 'Física',
        TimeStarted: FormatoValidationService.normalizarHora(z?.TimeStarted),
        TimeCompleted: FormatoValidationService.normalizarHora(z?.TimeCompleted),
        Remarks: String(z?.Remarks || '').trim()
      };
    });

    const rowRules = [
      { field: 'EmployeeInfo', label: 'Empleado / Inspector (Nombre y TIA)', type: 'string', required: true, maxLength: 150 },
      { field: 'Zone', label: 'Zona de Cabina', type: 'string', required: true, maxLength: 150 },
      { field: 'SearchType', label: 'Tipo de Búsqueda (Zona)', type: 'string', required: true, maxLength: 20 },
      { field: 'TimeStarted', label: 'Hora Inicio (Zona)', type: 'time', required: true },
      { field: 'TimeCompleted', label: 'Hora Fin (Zona)', type: 'time', required: true },
      { field: 'Remarks', label: 'Observaciones de Zona', type: 'string', required: false, maxLength: 500 }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha,
        departureStation,
        originInbound,
        destinationOutbound,
        searchStartTime,
        timeSearchCompleted,
        leadName,
        leadEmployeeNumber,
        leadSignature,
        idValidationReport,
        csmName,
        csmSignature
      },
      rows: normalizedZones,
      headerRules,
      rowRules: normalizedZones.length > 0 ? rowRules : [],
      minRows: requiereParte2 ? 1 : 0,
      emptyRowsMessage: `Operación de ${tipoOperacion}: debe agregar al menos una (1) zona inspeccionada en la Parte 2 (Anexo B) antes de guardar.`
    });
    if (!esq.valido) return esq;

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        tipoOperacion,
        fecha,
        departureStation,
        originInbound,
        destinationOutbound,
        searchStartTime,
        timeSearchCompleted,
        generalSearchType,
        overheadBins: normCheck(b.overheadBins),
        closetsStorageCrew: normCheck(b.closetsStorageCrew),
        lavatoriesAndSeals: normCheck(b.lavatoriesAndSeals),
        seatsUnderPocketsBetween: normCheck(b.seatsUnderPocketsBetween),
        seatBacksPocketsTrays: normCheck(b.seatBacksPocketsTrays),
        galleyAreasAndTrolleys: normCheck(b.galleyAreasAndTrolleys),
        seatsUnderCushions: normCheck(b.seatsUnderCushions),
        lifeVestPackagesHolders: normCheck(b.lifeVestPackagesHolders),
        crewRestAreas: normCheck(b.crewRestAreas, 'N/A'),
        idValidationRequired,
        idValidationReport,
        leadSupervisorLoginId,
        leadName,
        leadEmployeeNumber,
        leadSignature,
        csmName,
        csmSignature,
        zonesSearch: normalizedZones
      }
    };
  }

  /**
   * 15. Valida "Lista de Inspección de Aeronave de Carga" (ListaInspeccionAeronaveDeCarga / latam-liadc - LAN CARGO)
   */
  static validarControlLIADC(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const l = payload.datos?.liadcPayload || payload.datos || {};
    const fecha = String(l.fecha || '').trim().substring(0, 10);
    const puente = String(l.puente || '').trim();
    const horaInicioInsp = FormatoValidationService.normalizarHora(l.horaInicioInsp);
    const horaTerminoInsp = FormatoValidationService.normalizarHora(l.horaTerminoInsp);
    const arriboVuelo = FormatoValidationService.normalizarHora(l.arriboVuelo);
    const supLaatsRaw = l.supLaats !== undefined && l.supLaats !== null
      ? String(l.supLaats).trim()
      : '';
    const supervisorNombre = String(l.supervisorNombre || '').trim();
    const inspectorNombre = String(l.inspectorNombre || `${user?.usuario || ''} / LAATS`).trim();
    const iniciales = String(l.iniciales || '').trim().toUpperCase();
    const notificacionComandante = String(l.notificacionComandante || '').trim().toUpperCase();
    const observaciones = String(l.observaciones || '').trim();
    const firmaInspector = String(l.firmaInspector || '').trim();
    const firmaSupervisor = String(l.firmaSupervisor || '').trim();

    const headerRules = [
      { field: 'fecha', label: 'Fecha', type: 'date', required: true },
      { field: 'puente', label: 'Puente / Gate', type: 'string', required: false, maxLength: 50 },
      { field: 'horaInicioInsp', label: 'Hora de Inicio de Inspección', type: 'time', required: true },
      { field: 'horaTerminoInsp', label: 'Hora de Término de Inspección', type: 'time', required: false },
      { field: 'arriboVuelo', label: 'Arribo del Vuelo (ATA)', type: 'time', required: false },
      { field: 'supLaats', label: 'Supervisor LAATS', type: 'integer', required: true, min: 1 },
      { field: 'iniciales', label: 'Iniciales del Inspector', type: 'string', required: true, minLength: 1, maxLength: 3 },
      {
        field: 'notificacionComandante',
        label: 'Notificación al Comandante',
        type: 'string',
        required: true,
        pattern: /^(VERBAL|ESCRITA)$/,
        patternMessage: 'debe seleccionar VERBAL o ESCRITA.'
      },
      { field: 'inspectorNombre', label: 'Seguridad que Inspeccionó', type: 'string', required: true, maxLength: 150 },
      { field: 'firmaInspector', label: 'Firma Digital del Inspector', type: 'signature', required: true },
      { field: 'firmaSupervisor', label: 'Firma Digital del Supervisor', type: 'signature', required: false },
      { field: 'observaciones', label: 'Observaciones / Remarks', type: 'string', required: false, maxLength: 2000 }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha,
        puente,
        horaInicioInsp,
        horaTerminoInsp,
        arriboVuelo,
        supLaats: supLaatsRaw,
        iniciales,
        notificacionComandante,
        inspectorNombre,
        firmaInspector,
        firmaSupervisor,
        observaciones
      },
      rows: [],
      headerRules,
      rowRules: [],
      minRows: 0
    });
    if (!esq.valido) return esq;

    const rawChecks = (l.checks && typeof l.checks === 'object') ? l.checks : l;
    const checkKeys = [
      'CabinaPilotos_AreasVisibles',
      'CabinaPilotos_Asientos',
      'CabinaPilotos_CompartAccesiblesDiversos',
      'CabinaPilotos_AccesoCompartElectronico',
      'Cocinas_AreasVisibles',
      'Cocinas_CarrosSusCompart',
      'Cocinas_ContenedoresBasura',
      'Cocinas_CompartAccesibles',
      'Banos_AreasVisibles',
      'Banos_CompartAccesibles',
      'Banos_ContenedoresBasura',
      'AreasExternas_AreasVisibles',
      'AreasExternas_AccesoCompartElectronico',
      'AreasExternas_FososTrenesAterrizaje',
      'AreasExternas_RegistrosCavidadesExt',
      'AreasExternas_BodegaDelantera',
      'AreasExternas_CompartElectronico',
      'AreasExternas_CompartBotellaOxigeno',
      'AreasExternas_CompartAireAcondicionado',
      'AreasExternas_CompartConexionesElectronicas',
      'AreasExternas_BodegaTrasera',
      'AreasExternas_Bulk',
      'AreasExternas_CompartSensorIncendio',
      'AreasExternas_CompartAguaBano'
    ];
    const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const checks = {};
    checkKeys.forEach((k) => {
      checks[k] = toBool(rawChecks[k]);
    });

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fecha,
        puente,
        horaInicioInsp,
        horaTerminoInsp,
        arriboVuelo,
        supLaats: parseInt(supLaatsRaw, 10),
        supervisorNombre,
        inspectorNombre,
        iniciales,
        notificacionComandante,
        observaciones,
        firmaInspector,
        firmaSupervisor,
        checks
      }
    };
  }

  /**
   * 16. Valida "Control de Cargue y Descargue de Aeronave" (ControlCargueYDescargueAeronaveFDX_1 / fdx-ccda - FEDEX)
   */
  static validarControlCCDA(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const c = payload.datos?.ccdaPayload || payload.datos || {};
    const fecha = String(c.fecha || '').trim().substring(0, 10);
    const llegada = FormatoValidationService.normalizarHora(c.llegada);
    const arribo = FormatoValidationService.normalizarHora(c.arribo);

    const operarioEmpleadoIdRaw = c.operarioEmpleadoId !== undefined && c.operarioEmpleadoId !== null
      ? String(c.operarioEmpleadoId).trim()
      : '';
    const operarioNombre = String(c.operarioNombre || '').trim();
    const operarioEmpresa = String(c.operarioEmpresa || 'LAATS').trim();
    const acopla = FormatoValidationService.normalizarHora(c.acopla);

    const puertaAbierta = FormatoValidationService.normalizarHora(c.puertaAbierta);
    const escaleraAcoplada = FormatoValidationService.normalizarHora(c.escaleraAcoplada);
    const aperturaAeronave = FormatoValidationService.normalizarHora(c.aperturaAeronave);
    const inicioDescargue = FormatoValidationService.normalizarHora(c.inicioDescargue);
    const iniciaCargue = FormatoValidationService.normalizarHora(c.iniciaCargue);

    const terminaDescargue = FormatoValidationService.normalizarHora(c.terminaDescargue);
    const terminaCargue = FormatoValidationService.normalizarHora(c.terminaCargue);
    const cierreAeronave = FormatoValidationService.normalizarHora(c.cierreAeronave);
    const desacopla = FormatoValidationService.normalizarHora(c.desacopla);
    const puertaCerrada = FormatoValidationService.normalizarHora(c.puertaCerrada);
    const escaleraDesacoplada = FormatoValidationService.normalizarHora(c.escaleraDesacoplada);

    const pushBack = FormatoValidationService.normalizarHora(c.pushBack);
    const salida = FormatoValidationService.normalizarHora(c.salida);
    const cantCombustibleRaw = c.cantCombustible !== undefined && c.cantCombustible !== null
      ? String(c.cantCombustible).trim()
      : '';
    const observaciones = String(c.observaciones || '').trim();
    const supervisor = String(c.supervisor || '').trim();
    const agenteSeguridad = String(user?.usuario || '').trim();

    const rawRows = Array.isArray(c.personal)
      ? c.personal
      : (Array.isArray(c.registros) ? c.registros : []);

    const normalizedRows = rawRows.map((r) => ({
      DetalleIngresoCCDAId: parseInt(r?.DetalleIngresoCCDAId, 10) || 0,
      Personal: String(r?.Personal ?? r?.Nombre ?? '').trim(),
      EmpleadoId: r?.EmpleadoId !== undefined && r?.EmpleadoId !== null ? String(r.EmpleadoId).trim() : String(r?.ID ?? '').trim(),
      Empresa: String(r?.Empresa || '').trim(),
      Entrada: FormatoValidationService.normalizarHora(r?.Entrada ?? r?.HoraEntrada1),
      Salida: FormatoValidationService.normalizarHora(r?.Salida ?? r?.HoraSalida1),
      SegundaEntrada: FormatoValidationService.normalizarHora(r?.SegundaEntrada ?? r?.HoraEntrada2),
      SegundaSalida: FormatoValidationService.normalizarHora(r?.SegundaSalida ?? r?.HoraSalida2)
    }));

    const headerRules = [
      { field: 'fecha', label: 'Fecha', type: 'date', required: true },
      { field: 'llegada', label: 'Llegada (ATA)', type: 'time', required: false },
      { field: 'arribo', label: 'Arribo Aeronave', type: 'time', required: false },
      { field: 'operarioEmpleadoId', label: 'Operario de Loader o Faja (LAATS)', type: 'integer', required: true, min: 1 },
      { field: 'operarioNombre', label: 'Nombre Operario de Loader o Faja', type: 'string', required: true, maxLength: 150 },
      { field: 'operarioEmpresa', label: 'Empresa Operario', type: 'string', required: true, maxLength: 100 },
      { field: 'acopla', label: 'Hora Acopla Loader', type: 'time', required: true },
      { field: 'puertaAbierta', label: 'Puerta Abierta', type: 'time', required: false },
      { field: 'escaleraAcoplada', label: 'Escalera Acoplada', type: 'time', required: false },
      { field: 'aperturaAeronave', label: 'Apertura Compuerta', type: 'time', required: false },
      { field: 'inicioDescargue', label: 'Inicia Descarga', type: 'time', required: false },
      { field: 'iniciaCargue', label: 'Inicia Carga', type: 'time', required: false },
      { field: 'terminaDescargue', label: 'Termina Descarga', type: 'time', required: false },
      { field: 'terminaCargue', label: 'Termina Carga', type: 'time', required: false },
      { field: 'cierreAeronave', label: 'Cierre Compuerta', type: 'time', required: false },
      { field: 'desacopla', label: 'Desacopla Loader', type: 'time', required: false },
      { field: 'puertaCerrada', label: 'Puerta Cerrada', type: 'time', required: false },
      { field: 'escaleraDesacoplada', label: 'Escalera Desacoplada', type: 'time', required: false },
      { field: 'pushBack', label: 'Push Back', type: 'time', required: false },
      { field: 'salida', label: 'Salida (ETD)', type: 'time', required: false },
      { field: 'cantCombustible', label: 'Combustible (Galones)', type: 'integer', required: false, min: 0, max: MAX_SQL_INT },
      { field: 'observaciones', label: 'Observaciones', type: 'string', required: false, maxLength: 3500 },
      { field: 'supervisor', label: 'Supervisor LAATS', type: 'string', required: true, maxLength: 150 },
      { field: 'agenteSeguridad', label: 'Agente de Seguridad LAATS', type: 'string', required: true, maxLength: 150 }
    ];

    const rowRules = [
      { field: 'Personal', label: 'Personal', type: 'string', required: true, maxLength: 150 },
      { field: 'EmpleadoId', label: 'ID# Empleado', type: 'integer', required: true, min: 1, max: MAX_SQL_INT },
      { field: 'Empresa', label: 'Empresa', type: 'string', required: true, maxLength: 100 },
      { field: 'Entrada', label: 'Hora 1° Entrada', type: 'time', required: true },
      { field: 'Salida', label: 'Hora 1° Salida (obligatoria para guardar)', type: 'time', required: true },
      { field: 'SegundaEntrada', label: 'Hora 2° Entrada', type: 'time', required: false },
      { field: 'SegundaSalida', label: 'Hora 2° Salida', type: 'time', required: false }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha,
        llegada,
        arribo,
        operarioEmpleadoId: operarioEmpleadoIdRaw,
        operarioNombre,
        operarioEmpresa,
        acopla,
        puertaAbierta,
        escaleraAcoplada,
        aperturaAeronave,
        inicioDescargue,
        iniciaCargue,
        terminaDescargue,
        terminaCargue,
        cierreAeronave,
        desacopla,
        puertaCerrada,
        escaleraDesacoplada,
        pushBack,
        salida,
        cantCombustible: cantCombustibleRaw,
        observaciones,
        supervisor,
        agenteSeguridad
      },
      rows: normalizedRows,
      headerRules,
      rowRules,
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) persona en la cuadrícula de Personal en Aeronave (LAATS) antes de guardar.'
    });

    if (!esq.valido) return esq;

    const pairErrors = [];
    normalizedRows.forEach((r, idx) => {
      const rowNum = idx + 1;
      if (r.SegundaEntrada && !r.SegundaSalida) {
        pairErrors.push({
          scope: 'row',
          row: rowNum,
          field: 'SegundaSalida',
          label: 'Hora 2° Salida',
          message: `Fila #${rowNum}: Si registró 2° Entrada, debe completar la Hora 2° Salida.`
        });
      }
      if (!r.SegundaEntrada && r.SegundaSalida) {
        pairErrors.push({
          scope: 'row',
          row: rowNum,
          field: 'SegundaEntrada',
          label: 'Hora 2° Entrada',
          message: `Fila #${rowNum}: Si registró 2° Salida, debe completar la Hora 2° Entrada.`
        });
      }
    });

    if (pairErrors.length > 0) {
      return {
        valido: false,
        statusCode: 400,
        message: pairErrors[0].message,
        errors: pairErrors
      };
    }

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fecha,
        llegada,
        arribo,
        operarioEmpleadoId: parseInt(operarioEmpleadoIdRaw, 10),
        operarioNombre,
        operarioEmpresa,
        acopla,
        puertaAbierta,
        escaleraAcoplada,
        aperturaAeronave,
        inicioDescargue,
        iniciaCargue,
        terminaDescargue,
        terminaCargue,
        cierreAeronave,
        desacopla,
        puertaCerrada,
        escaleraDesacoplada,
        pushBack,
        salida,
        cantCombustible: cantCombustibleRaw !== '' ? parseInt(cantCombustibleRaw, 10) : null,
        observaciones,
        supervisor,
        agenteSeguridad,
        personal: normalizedRows.map((r) => ({
          DetalleIngresoCCDAId: r.DetalleIngresoCCDAId,
          Personal: r.Personal,
          EmpleadoId: parseInt(r.EmpleadoId, 10),
          Empresa: r.Empresa,
          Entrada: r.Entrada,
          Salida: r.Salida,
          SegundaEntrada: r.SegundaEntrada,
          SegundaSalida: r.SegundaSalida
        }))
      }
    };
  }

  /**
   * 17. Valida "Lista de Inspección de Seguridad de la Aeronave" (ControlListaInspeccionSeguridadAJT / ajt-lisa - AMERIJET)
   */
  static validarControlLISA(payload = {}, user = {}, vueloSesion = null) {
    const ctx = FormatoValidationService._validarContextoOperacion(payload, user, vueloSesion);
    if (!ctx.valido) return ctx;

    const l = payload.datos?.lisaPayload || payload.datos || {};
    const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';

    const fecha = String(l.fecha || '').trim().substring(0, 10);
    const estacion = (l.estacion !== undefined && l.estacion !== null)
      ? String(l.estacion).trim().toUpperCase()
      : 'GUA';
    const tipoAvion = String(l.tipoAvion || '').trim().toUpperCase();
    const horaInicio = FormatoValidationService.normalizarHora(l.horaInicio);
    const horaFin = FormatoValidationService.normalizarHora(l.horaFin);
    const horaSalida = FormatoValidationService.normalizarHora(l.horaSalida);

    const coordSeguridadTierra = toBool(l.coordSeguridadTierra ?? l.CoordSeguridadTierra);
    const representanteAutorizado = toBool(l.representanteAutorizado ?? l.RepresentanteAutorizado);

    const nombreInspector = String(user?.usuario || l.nombreInspector || l.NombreEjecutoInspeccion || '').trim();
    const firmaInspector = String(l.firmaInspector || l.FirmaInspector || '').trim();
    const observaciones = String(l.observaciones ?? l.Observaciones ?? '').trim();

    const headerRules = [
      { field: 'fecha', label: 'Fecha de Inspección', type: 'date', required: true },
      { field: 'estacion', label: 'Estación / Station', type: 'string', required: true, minLength: 2, maxLength: 20 },
      { field: 'tipoAvion', label: 'Tipo de Avión / Aircraft Type', type: 'string', required: true, minLength: 2, maxLength: 30 },
      { field: 'horaInicio', label: 'Hora Inicio Inspección', type: 'time', required: true },
      { field: 'horaFin', label: 'Hora Fin Inspección', type: 'time', required: true },
      { field: 'horaSalida', label: 'Hora de Salida', type: 'time', required: true },
      { field: 'nombreInspector', label: 'Nombre de quien ejecutó la inspección', type: 'string', required: true, maxLength: 150 },
      { field: 'firmaInspector', label: 'Firma de quien ejecutó la inspección', type: 'signature', required: true },
      { field: 'observaciones', label: 'Observaciones / Remarks', type: 'string', required: false, maxLength: 2500 }
    ];

    const esq = FormatoValidationService.validarEsquemaFormato({
      headerData: {
        fecha,
        estacion,
        tipoAvion,
        horaInicio,
        horaFin,
        horaSalida,
        nombreInspector,
        firmaInspector,
        observaciones
      },
      rows: [],
      headerRules,
      rowRules: [],
      minRows: 0
    });

    const combinedErrors = [...(esq.errors || [])];
    if (!coordSeguridadTierra && !representanteAutorizado) {
      combinedErrors.push({
        scope: 'header',
        field: 'coordSeguridadTierra',
        label: 'Rol de quien realiza la inspección',
        message: 'Debe seleccionar Coord. de Seguridad en Tierra y/o Representante Autorizado.'
      });
    }

    if (combinedErrors.length > 0) {
      return {
        valido: false,
        statusCode: 400,
        message: combinedErrors[0].message || esq.message,
        errors: combinedErrors
      };
    }

    const checkKeys = [
      'AsientosTripChalecos',
      'CompEquipoEmergencia',
      'LavatorioParedesInodoro',
      'AreaEquipajeCoatTrip',
      'GalleyParedesGabinetes',
      'CabinaCargaTechoParedPiso',
      'PuertaIntCabinaCarga',
      'PuertaExtCabinaMando',
      'PuertaExtCabinaCarga',
      'CompCargaDelanteroDer',
      'CompInfCargaTraseroDer',
      'CompInfCargaTraseroIzq',
      'CompTrenAterrizajePrin',
      'CompTrenAterrizajeDel',
      'CompMotoresHidraulicoAvionica'
    ];
    const rawChecks = (l.checks && typeof l.checks === 'object') ? l.checks : l;
    const checks = {};
    checkKeys.forEach((k) => {
      checks[k] = toBool(rawChecks[k]);
    });

    const initialsFromName = nombreInspector
      .split(/\s+/)
      .filter(Boolean)
      .map(w => `${w.charAt(0).toUpperCase()}.`)
      .join('') || 'L.A.';

    const rawSellos = (l.sellos && typeof l.sellos === 'object') ? l.sellos : {};
    const sellos = {};
    const sealErrors = [];
    let noSello = false;

    for (let i = 1; i <= 15; i += 1) {
      const sObj = rawSellos[i] || rawSellos[String(i)] || {};
      const activo = toBool(sObj.activo ?? sObj.aplica ?? l[`SelloActivo${i}`]);
      const numero = String(sObj.numero ?? sObj.sello ?? l[`Sello${i}`] ?? '').trim();
      const ini = String(sObj.iniciales ?? sObj.ini ?? l[`Ini${i}`] ?? '').trim();

      if (activo && !numero) {
        sealErrors.push({
          scope: 'row',
          row: i,
          field: `Sello${i}`,
          label: `# de Sello (Punto ${i})`,
          message: `Punto #${i}: Activó el candado de sello; ingrese el # de Sello o cierre el candado si no aplica.`
        });
      }
      if (numero.length > 40) {
        sealErrors.push({
          scope: 'row',
          row: i,
          field: `Sello${i}`,
          label: `# de Sello (Punto ${i})`,
          message: `Punto #${i}: El # de Sello excede 40 caracteres.`
        });
      }

      if (numero) {
        noSello = true;
        sellos[i] = {
          numero,
          iniciales: ini || initialsFromName
        };
      } else {
        sellos[i] = {
          numero: '',
          iniciales: ''
        };
      }
    }

    if (sealErrors.length > 0) {
      return {
        valido: false,
        statusCode: 400,
        message: sealErrors[0].message,
        errors: sealErrors
      };
    }

    return {
      valido: true,
      statusCode: 200,
      message: 'Validación exitosa.',
      errors: [],
      normalized: {
        encabezadoId: ctx.encabezadoId,
        itinerarioId: ctx.itinerarioId,
        fecha,
        estacion,
        tipoAvion,
        coordSeguridadTierra,
        representanteAutorizado,
        noSello,
        horaInicio,
        horaFin,
        horaSalida,
        observaciones,
        nombreInspector,
        inicialesInspector: initialsFromName,
        firmaInspector,
        checks,
        sellos
      }
    };
  }
}

module.exports = FormatoValidationService;
