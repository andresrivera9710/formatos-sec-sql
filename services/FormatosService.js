/**
 * FormatosService - SIO LAATS Formatos SEC
 * Lógica de negocio y orquestación para consulta, auditoría previa y persistencia de formatos.
 * Patrón: Vista Preliminar (guardar: false) vs. Persistencia Definitiva (guardar: true).
 */

const { sql } = require('../config/database');
const FormatosModel = require('../models/FormatosModel');
const LoginModel = require('../models/LoginModel');
const OperacionesService = require('./OperacionesService');
const FormatoValidationService = require('./FormatoValidationService');

const EMPRESAS_CP = [
  'LAATS',
  'GODARD(Cocinas)',
  'ODA (Combustible)',
  'OIRSA',
  'DGAC (Operaciones)',
  'AEROEXPRESS',
  'AEROMEXICO',
  'ARAJET',
  'DELTA',
  'AIR CANADA',
  'LAN CARGO',
  'OTROS...'
];

class FormatosService {
  /**
   * Compara nombres de TipoFormato tolerando singular/plural ("Equipaje" vs "Equipajes") y acentos
   */
  static matchesTipoFormato(dbTipo, reqTipo) {
    const clean = (s) => String(s || '')
      .replace(/daÃ±ada/gi, 'dañada')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/equipajes en rayos x/gi, 'equipaje en rayos x')
      .trim()
      .toLowerCase();
    return clean(dbTipo) === clean(reqTipo);
  }

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
  static async prepararFormato({ formatoId, itinerarioId, encabezadoId, user, forzarNuevo = false }) {
    const catalogo = OperacionesService.getCatalogoFormatosPorAerolinea();
    const formatoMeta = catalogo.find(f => f.id === formatoId);

    if (!formatoMeta) {
      throw new Error(`El formato con ID '${formatoId}' no existe en el catálogo.`);
    }

    const isCP = formatoId.endsWith('-cp');
    const isER = formatoId.endsWith('-er');
    const isEB = formatoId.endsWith('-eb');
    const isCEC = formatoId.endsWith('-cec');
    const isCIEC = formatoId.endsWith('-ciec');
    const isMECD = formatoId.endsWith('-mecd');
    const isPO = formatoId.endsWith('-po');
    const isCFR = formatoId.endsWith('-cfr');
    const isRX = formatoId.endsWith('-rx');
    const isCLL = formatoId.endsWith('-cll');
    const isSP = formatoId.endsWith('-sp');
    const isDAL = formatoId.endsWith('-dal');
    const isSEL = formatoId.endsWith('-sel');
    const isASS = formatoId.endsWith('-ass');
    const isANEXOA = formatoId.endsWith('-anexoa');
    const isANEXOB = formatoId.endsWith('-anexob');
    const isLIADC = formatoId.endsWith('-liadc');

    const familyKey = isCP ? 'cp'
      : isER ? 'er'
        : isEB ? 'eb'
          : isCEC ? 'cec'
            : isCIEC ? 'ciec'
              : isMECD ? 'mecd'
                : isPO ? 'po'
                  : isCFR ? 'cfr'
                    : isRX ? 'rx'
                      : isCLL ? 'cll'
                        : isSP ? 'sp'
                          : isDAL ? 'dal'
                            : isSEL ? 'sel'
                              : isASS ? 'ass'
                                : isANEXOA ? 'anexoa'
                                  : isANEXOB ? 'anexob'
                                    : isLIADC ? 'liadc'
                                      : null;

    const encParamName = formatoMeta.paramEncabezado || (isCP ? 'EncabezadoCPId' : (isER ? 'EncabezadoControlERId' : 'EncabezadoId'));
    let encIdNum = encabezadoId ? parseInt(encabezadoId, 10) : null;

    // Si no se especificó encabezadoId ni se forzó nuevo registro (?nuevo=1),
    // cargar automáticamente el último registro guardado de este formato para la operación activa.
    if (!encIdNum && !forzarNuevo && itinerarioId && familyKey) {
      try {
        const existentes = await FormatosModel.obtenerFormatosPorItinerario(parseInt(itinerarioId, 10));
        const coincidentes = (existentes || []).filter(
          e => FormatosService.matchesTipoFormato(e.TipoFormato, formatoMeta.nombre)
        );
        if (coincidentes.length > 0) {
          encIdNum = parseInt(coincidentes[0].FormatoEncabezadoId, 10) || null;
        }
      } catch (autoErr) {
        console.warn('[AUTO-LOAD FORMATO WARN]', autoErr.message);
      }
    }

    // Validación Anti-IDOR: verificar que el encabezadoId pertenezca al itinerario activo
    if (encIdNum && itinerarioId && familyKey) {
      const propiedad = isER
        ? await FormatosModel.verificarPropiedadControlER(encIdNum, itinerarioId)
        : await FormatosModel.verificarPropiedadFormato(familyKey, encIdNum, itinerarioId);
      if (!propiedad) {
        console.warn(`[ANTI-IDOR] Encabezado #${encIdNum} (${familyKey}) no pertenece al ItinerarioId #${itinerarioId}. Inicializando como nuevo.`);
        encIdNum = null;
      }
    }

    let datosExistentes = null;
    let complementos = null;

    if (encIdNum && formatoMeta.spConsulta && !isMECD && !isRX && !isDAL && !isSEL && !isASS && !isANEXOA && !isANEXOB && !isLIADC) {
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

    // Cargar catálogos transversales (Supervisores, Usuarios LoginSEC, Usuarios LogIn, Empleados, Maquinaria, PosicionesPO)
    let supervisores = [];
    let usuariosSEC = [];
    let usuariosLogin = [];
    let empleados = [];
    let maquinaria = [];
    let posicionesPO = [];

    try {
      const [supList, secList, loginList, empList, maqList, posList] = await Promise.all([
        LoginModel.obtenerSupervisores().catch(() => []),
        LoginModel.obtenerUsuariosSEC().catch(() => []),
        LoginModel.obtenerUsuariosLogIn().catch(() => []),
        FormatosModel.obtenerEmpleadosActivos().catch(() => []),
        FormatosModel.obtenerMaquinariaActiva().catch(() => []),
        isPO ? FormatosModel.obtenerPosicionesPO().catch(() => []) : Promise.resolve([])
      ]);
      supervisores = supList || [];
      usuariosSEC = secList || [];
      usuariosLogin = loginList || [];
      empleados = empList || [];
      maquinaria = maqList || [];
      posicionesPO = posList || [];
    } catch (catErr) {
      console.warn('[CATALOGOS FORMATOS WARN]', catErr.message);
    }

    let cpState = null;
    let erState = null;
    let ebState = null;
    let cecState = null;
    let ciecState = null;
    let mecdState = null;
    let poState = null;
    let cfrState = null;
    let rxState = null;
    let cllState = null;
    let spState = null;
    let dalState = null;
    let selState = null;
    let assState = null;
    let anexoAState = null;
    let anexoBState = null;
    let liadcState = null;

    if (isCP) {
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

    if (isER) {
      const complemento = complementos?.[0]?.[0] || null;
      const rawRows = datosExistentes?.[0] || [];
      const detalles = rawRows
        .filter(d => d && (d.Pasajero || d.Colilla !== undefined || d.Secuencia !== undefined))
        .map((d, idx) => ({
          Numero: idx + 1,
          DetalleControlERId: parseInt(d.DetalleControlERId, 10) || 0,
          Pasajero: String(d.Pasajero || '').trim(),
          Secuencia: d.Secuencia !== null && d.Secuencia !== undefined ? String(d.Secuencia).trim() : '',
          Colilla: d.Colilla !== null && d.Colilla !== undefined ? String(d.Colilla).trim() : '',
          Destino: String(d.Destino || '').trim(),
          HoraRevision: FormatosService.normalizarHora5(d.HoraRevision, ''),
          AgenteAVSEC: String(d.AgenteAVSEC || '').trim(),
          AgenteSeguridad: String(d.CreadoPor || user?.usuario || '').trim()
        }));

      erState = {
        complemento,
        detalles
      };
    }

    if (isEB) {
      const complemento = complementos?.[0]?.[0] || null;
      const rawRows = datosExistentes?.[0] || [];
      const detalles = rawRows
        .filter(d => d && d.Secuencia !== undefined && d.Secuencia !== null)
        .map((d, idx) => ({
          Orden: idx + 1,
          DetalleControlEBId: parseInt(d.DetalleControlEBId, 10) || 0,
          Secuencia: parseInt(d.Secuencia, 10) || 0,
          Valor: String(d.Secuencia || '').trim(),
          Motivo: ''
        }));

      ebState = {
        complemento,
        detalles
      };
    }

    if (isCEC) {
      const complemento = complementos?.[0]?.[0] || null;
      const rawRows = datosExistentes?.[0] || [];
      const detalles = rawRows
        .filter(d => d && d.Secuencia !== undefined && d.Secuencia !== null)
        .map((d, idx) => ({
          Orden: idx + 1,
          DetalleCECDespId: parseInt(d.DetalleCECDespId, 10) || 0,
          Secuencia: parseInt(d.Secuencia, 10) || 0,
          Valor: String(d.Secuencia || '').trim(),
          Motivo: ''
        }));

      cecState = {
        complemento,
        detalles
      };
    }

    if (isCIEC) {
      const encabezado = encIdNum ? await FormatosModel.obtenerEncabezadoCIEC(encIdNum).catch(() => null) : null;
      const complemento = complementos?.[0]?.[0] || null;
      const rawRows = datosExistentes?.[0] || [];
      const detalles = rawRows
        .filter(d => d && d.Nombre && String(d.Nombre).trim() !== '')
        .map((d, idx) => ({
          Numero: idx + 1,
          DetalleCIECId: parseInt(d.DetalleCIECId, 10) || 0,
          Nombre: String(d.Nombre || '').trim(),
          NoTIA: String(d.NoTIA || '').trim(),
          Empresa: String(d.Empresa || '').trim(),
          HoraIngreso: FormatosService.normalizarHora5(d.HoraIngreso, ''),
          Motivo: String(d.Motivo || '').trim(),
          HoraSalida: FormatosService.normalizarHora5(d.HoraSalida, '')
        }));

      const textoObsBruto = String(complemento?.Observaciones || '').trim();
      const totalEq = parseInt(complemento?.TotalEquipaje, 10) || 0;
      let observacionesLimpia = textoObsBruto;
      let equipajePuerta = [];

      if (totalEq > 0 && textoObsBruto) {
        if (textoObsBruto.includes(' / ')) {
          const parts = textoObsBruto.split(' / ');
          const tail = parts[parts.length - 1] || '';
          observacionesLimpia = parts.slice(0, -1).join(' / ').trim();
          equipajePuerta = tail.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          equipajePuerta = textoObsBruto.split(',').map(s => s.trim()).filter(Boolean);
          observacionesLimpia = '';
        }
      }

      ciecState = {
        encabezado,
        complemento,
        detalles,
        equipajePuerta,
        observacionesLimpia,
        empresas: EMPRESAS_CP
      };
    }

    if (isMECD) {
      let mecdRaw = { encabezado: null, revisiones: [], conFirma: [], sinFirma: [] };
      if (encIdNum) {
        try {
          mecdRaw = await FormatosModel.consultarTodoEquipMECD(encIdNum);
        } catch (mErr) {
          console.error('[CONSULTA MECD ERROR]', mErr.message);
        }
      }
      mecdState = {
        encabezado: mecdRaw.encabezado,
        revisiones: (mecdRaw.revisiones || []).map((r, i) => ({
          Numero: i + 1,
          DetalleEquipMECDId: parseInt(r.DetalleEquipMECDId, 10) || 0,
          Control: String(r.Control ?? '').trim(),
          Colilla: String(r.Colilla ?? '').trim()
        })),
        conFirma: (mecdRaw.conFirma || []).map((r, i) => ({
          Numero: i + 1,
          EquipajeMEId: parseInt(r.EquipajeMEId, 10) || 0,
          Pasajero: String(r.Pasajero ?? '').trim(),
          Colilla: String(r.Colilla ?? '').trim(),
          Control: String(r.Control ?? '').trim(),
          Destino: String(r.Destino ?? '').trim()
        })),
        sinFirma: (mecdRaw.sinFirma || []).map((r, i) => ({
          Numero: i + 1,
          EquipajeDTId: parseInt(r.EquipajeDTId, 10) || 0,
          Pasajero: String(r.Pasajero ?? '').trim(),
          Colilla: String(r.Colilla ?? '').trim(),
          Control: String(r.Control ?? '').trim(),
          Destino: String(r.Destino ?? '').trim()
        }))
      };
    }

    if (isPO) {
      const complemento = complementos?.[0]?.[0] || null;
      const rawRows = datosExistentes?.[0] || [];
      const secMap = new Map();
      for (const u of usuariosSEC) {
        if (u.EmpleadoId) secMap.set(Number(u.EmpleadoId), u.Usuario);
      }
      const empMap = new Map();
      for (const e of empleados) {
        if (e.EmpleadoId) empMap.set(Number(e.EmpleadoId), e.Nombre);
      }
      const posMap = new Map();
      for (const p of posicionesPO) {
        posMap.set(Number(p.PosicionesPOId), p.Posiciones);
      }

      const detalles = rawRows.map((d, idx) => {
        const empId = parseInt(d.EmpleadoId, 10) || 0;
        const posId = parseInt(d.PosicionesPOId, 10) || 1;
        return {
          No: idx + 1,
          DetallePOId: parseInt(d.DetallePOId, 10) || 0,
          EmpleadoId: empId,
          PosicionesPOId: posId,
          Agentes: secMap.get(empId) || empMap.get(empId) || `Agente #${empId}`,
          Posiciones: posMap.get(posId) || `Posición #${posId}`
        };
      });

      poState = {
        complemento,
        detalles,
        posicionesPO
      };
    }

    if (isCFR) {
      const complemento = complementos?.[0]?.[0] || null;
      const rawRows = datosExistentes?.[0] || [];
      const maqMap = new Map();
      for (const m of maquinaria) {
        if (m.MaquinariaEquipoId) maqMap.set(Number(m.MaquinariaEquipoId), m.NoUnidad);
      }
      const opMap = new Map();
      for (const u of usuariosLogin) {
        if (u.EmpleadoId) opMap.set(Number(u.EmpleadoId), u.Usuario);
      }
      for (const u of usuariosSEC) {
        if (u.EmpleadoId && !opMap.has(Number(u.EmpleadoId))) opMap.set(Number(u.EmpleadoId), u.Usuario);
      }
      for (const e of empleados) {
        if (e.EmpleadoId && !opMap.has(Number(e.EmpleadoId))) opMap.set(Number(e.EmpleadoId), e.Nombre);
      }

      const detalles = rawRows.map((d, idx) => {
        const carretaId = parseInt(d.CarretaId, 10) || 0;
        const maqId = parseInt(d.MaquinariaEquipoId, 10) || 0;
        const empId = parseInt(d.EmpleadoId, 10) || 0;
        return {
          No: idx + 1,
          DetalleCFRId: parseInt(d.DetalleCFRId, 10) || 0,
          CarretaId: carretaId,
          NoCarreta: maqMap.get(carretaId) || String(carretaId || ''),
          FlejeUno: String(d.FlejeUno || '').trim(),
          FlejeDos: String(d.FlejeDos || '').trim(),
          MaquinariaEquipoId: maqId,
          NoUnidad: maqMap.get(maqId) || String(maqId || ''),
          TotalEqDetalle: parseInt(d.TotalEqDetalle ?? d.TotalEq, 10) || 0,
          EmpleadoId: empId,
          Operador: opMap.get(empId) || `Operador #${empId}`
        };
      });

      cfrState = {
        complemento,
        detalles
      };
    }

    if (isRX) {
      let rxRaw = { encabezado: null, personalSAG: [], personalLaats: [] };
      if (encIdNum || (!forzarNuevo && itinerarioId)) {
        try {
          rxRaw = await FormatosModel.consultarTodoDRayosX(encIdNum, itinerarioId);
          if (rxRaw.encabezado?.EncabezadoDRayosXId) {
            encIdNum = parseInt(rxRaw.encabezado.EncabezadoDRayosXId, 10);
          }
        } catch (rxErr) {
          console.error('[CONSULTA RX ERROR]', rxErr.message);
        }
      }
      const empMap = new Map();
      for (const e of empleados) {
        if (e.EmpleadoId) empMap.set(Number(e.EmpleadoId), e.Nombre);
      }
      for (const u of usuariosSEC) {
        if (u.EmpleadoId && !empMap.has(Number(u.EmpleadoId))) empMap.set(Number(u.EmpleadoId), u.Usuario);
      }

      rxState = {
        encabezado: rxRaw.encabezado,
        personalSAG: (rxRaw.personalSAG || []).map((s, idx) => ({
          No: idx + 1,
          PersonalSAGId: parseInt(s.PersonalSAGId, 10) || 0,
          Nombre: String(s.Nombre || '').trim(),
          Id: String(s.Id || '').trim()
        })),
        personalLaats: (rxRaw.personalLaats || []).map((l, idx) => {
          const empId = parseInt(l.EmpleadoId, 10) || 0;
          return {
            No: idx + 1,
            PersonalLaatsId: parseInt(l.PersonalLaatsId, 10) || 0,
            EmpleadoId: empId,
            Nombre: empMap.get(empId) || `Agente #${empId}`,
            Id: String(l.Id || '').trim()
          };
        })
      };
    }

    if (isCLL) {
      const complemento = complementos?.[0]?.[0] || null;
      const rawRows = datosExistentes?.[0] || [];
      const detalles = rawRows.map((d, idx) => ({
        No: idx + 1,
        DetalleCLLId: parseInt(d.DetalleCLLId, 10) || 0,
        Guia: String(d.Guia || '').trim(),
        Contenido: String(d.Contenido || '').trim(),
        Piezas: parseInt(d.Piezas, 10) || 0,
        BIN: String(d.BIN || '').trim()
      }));

      cllState = {
        complemento,
        detalles
      };
    }

    if (isSP) {
      const rawRows = datosExistentes?.[0] || [];
      const firstRow = rawRows[0] || null;
      const encabezado = firstRow && firstRow.EncabezadoSPId ? {
        EncabezadoSPId: firstRow.EncabezadoSPId,
        LoginId: firstRow.LoginId,
        Fecha: firstRow.Fecha,
        CreadoPor: firstRow.CreadoPor
      } : null;

      const selLabels = { 1: 'R Random', 2: 'S Selected', 3: 'I Interview' };
      const detalles = rawRows
        .filter(d => d && (d.DetalleSPId || d.Apellido || d.Nombre))
        .map((d, idx) => {
          const selId = parseInt(d.SeleccionSPId, 10) || 1;
          return {
            No: idx + 1,
            DetalleSPId: parseInt(d.DetalleSPId, 10) || 0,
            Apellido: String(d.Apellido || '').trim(),
            Nombre: String(d.Nombre || '').trim(),
            SeleccionSPId: selId,
            SelectionLabel: selLabels[selId] || 'R Random',
            Asiento: String(d.Asiento || '').trim(),
            BCN: d.BCN !== null && d.BCN !== undefined ? String(d.BCN).trim() : '0',
            NombreAgente: String(d.NombreAgente || '').trim()
          };
        });

      spState = {
        encabezado,
        detalles
      };
    }

    if (isDAL) {
      let dalRow = null;
      if (encIdNum || (!forzarNuevo && itinerarioId)) {
        try {
          dalRow = await FormatosModel.consultarDetalleDAL(encIdNum, itinerarioId);
          if (dalRow?.DetalleDALId) {
            encIdNum = parseInt(dalRow.DetalleDALId, 10);
          }
        } catch (dalErr) {
          console.error('[CONSULTA DAL ERROR]', dalErr.message);
        }
      }
      dalState = {
        detalle: dalRow
      };
    }

    if (isSEL) {
      let selRow = null;
      if (encIdNum || (!forzarNuevo && itinerarioId)) {
        try {
          selRow = await FormatosModel.consultarDetalleSEL(encIdNum, itinerarioId);
          if (selRow?.DetalleSELId) {
            encIdNum = parseInt(selRow.DetalleSELId, 10);
          }
        } catch (selErr) {
          console.error('[CONSULTA SEL ERROR]', selErr.message);
        }
      }
      selState = {
        detalle: selRow
      };
    }

    if (isASS) {
      let assRow = null;
      if (encIdNum || (!forzarNuevo && itinerarioId)) {
        try {
          assRow = await FormatosModel.consultarDetalleASS(encIdNum, itinerarioId);
          if (assRow?.EncabezadoASSId) {
            encIdNum = parseInt(assRow.EncabezadoASSId, 10);
          }
        } catch (assErr) {
          console.error('[CONSULTA ASS ERROR]', assErr.message);
        }
      }
      assState = {
        detalle: assRow
      };
    }

    if (isANEXOA) {
      let anexoADoc = null;
      if (encIdNum || (!forzarNuevo && itinerarioId)) {
        try {
          anexoADoc = await FormatosModel.consultarDetalleAnexoA(encIdNum, itinerarioId);
          if (anexoADoc?.encabezado?.EncabezadoAnexoAId) {
            encIdNum = parseInt(anexoADoc.encabezado.EncabezadoAnexoAId, 10);
          }
        } catch (aErr) {
          console.error('[CONSULTA ANEXO A ERROR]', aErr.message);
        }
      }
      anexoAState = {
        encabezado: anexoADoc?.encabezado || null,
        detalles: anexoADoc?.detalles || [],
        empresas: EMPRESAS_CP
      };
    }

    if (isANEXOB) {
      let anexoBDoc = null;
      if (encIdNum || (!forzarNuevo && itinerarioId)) {
        try {
          anexoBDoc = await FormatosModel.consultarDetalleAnexoB(encIdNum, itinerarioId);
          if (anexoBDoc?.encabezado?.EncabezadoAnexoBId) {
            encIdNum = parseInt(anexoBDoc.encabezado.EncabezadoAnexoBId, 10);
          }
        } catch (bErr) {
          console.error('[CONSULTA ANEXO B ERROR]', bErr.message);
        }
      }
      anexoBState = {
        encabezado: anexoBDoc?.encabezado || null,
        zones: anexoBDoc?.zones || []
      };
    }

    if (isLIADC) {
      let liadcRow = null;
      if (encIdNum || (!forzarNuevo && itinerarioId)) {
        try {
          liadcRow = await FormatosModel.consultarDetalleLIADC(encIdNum, itinerarioId);
          if (liadcRow?.EncabezadoLIADCId) {
            encIdNum = parseInt(liadcRow.EncabezadoLIADCId, 10);
          }
        } catch (liadcErr) {
          console.error('[CONSULTA LIADC ERROR]', liadcErr.message);
        }
      }
      liadcState = {
        detalle: liadcRow
      };
    }

    return {
      meta: formatoMeta,
      esNuevo: !encIdNum,
      encabezadoId: encIdNum || null,
      datos: datosExistentes,
      complementos,
      supervisores,
      usuariosSEC,
      usuariosLogin,
      empleados,
      maquinaria,
      posicionesPO,
      cpState,
      erState,
      ebState,
      cecState,
      ciecState,
      mecdState,
      poState,
      cfrState,
      rxState,
      cllState,
      spState,
      dalState,
      selState,
      assState,
      anexoAState,
      anexoBState,
      liadcState
    };
  }

  /**
   * Procesa la persistencia o validación preliminar de un formato
   * @param {Object} payload
   * @param {boolean} [payload.guardar=true] - Si false, solo valida y construye modelo en memoria
   * @param {Object} user
   */
  static async procesarGuardado(payload, user, vueloSesion = null) {
    const { formatoId, itinerarioId, encabezadoId, datos, guardar = true } = payload;
    const catalogo = OperacionesService.getCatalogoFormatosPorAerolinea();
    const formatoMeta = catalogo.find(f => f.id === formatoId);

    if (!formatoMeta) {
      throw new Error(`Formato no reconocido: ${formatoId}`);
    }

    if (formatoId.endsWith('-cp')) {
      return await FormatosService.procesarGuardadoCP(payload, formatoMeta, user);
    }

    if (formatoId.endsWith('-er')) {
      return await FormatosService.procesarGuardadoER(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-eb')) {
      return await FormatosService.procesarGuardadoEB(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-cec')) {
      return await FormatosService.procesarGuardadoCEC(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-ciec')) {
      return await FormatosService.procesarGuardadoCIEC(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-mecd')) {
      return await FormatosService.procesarGuardadoMECD(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-po')) {
      return await FormatosService.procesarGuardadoPO(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-cfr')) {
      return await FormatosService.procesarGuardadoCFR(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-rx')) {
      return await FormatosService.procesarGuardadoRX(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-cll')) {
      return await FormatosService.procesarGuardadoCLL(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-sp')) {
      return await FormatosService.procesarGuardadoSP(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-dal')) {
      return await FormatosService.procesarGuardadoDAL(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-sel')) {
      return await FormatosService.procesarGuardadoSEL(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-ass')) {
      return await FormatosService.procesarGuardadoASS(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-anexoa')) {
      return await FormatosService.procesarGuardadoAnexoA(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-anexob')) {
      return await FormatosService.procesarGuardadoAnexoB(payload, formatoMeta, user, vueloSesion);
    }

    if (formatoId.endsWith('-liadc')) {
      return await FormatosService.procesarGuardadoLIADC(payload, formatoMeta, user, vueloSesion);
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
    const alerosNombres = Array.isArray(cp.alerosNombres)
      ? cp.alerosNombres.map(n => String(n || '').trim()).filter(Boolean).slice(0, 2)
      : [];

    const registros = Array.isArray(cp.registros) ? cp.registros : [];
    const pendientesSalida = registros.filter(r => !r.HoraSalida || String(r.HoraSalida).trim() === '');

    const resumenPreliminar = {
      valido: pendientesSalida.length === 0 && Boolean(horaInicio) && Number.isFinite(supervisorId) && supervisorId > 0,
      formato: formatoMeta.nombre,
      aerolinea: formatoMeta.aerolinea,
      itinerarioId,
      encabezadoId: encabezadoId || 'NUEVO',
      fecha: fechaIso || new Date().toISOString().substring(0, 10),
      horaInicio: horaInicio || '--:--',
      supervisor: supervisorNombre || (supervisorId > 0 ? `ID #${supervisorId}` : 'Sin seleccionar'),
      totalRegistros: registros.length,
      pendientesSalida: pendientesSalida.length,
      totalAleros: alerosIds.length,
      timestamp: new Date().toISOString(),
      usuario: user.usuario
    };

    if (!guardar) {
      const filasNormalizadas = registros.map((r, idx) => {
        const hIn = FormatosService.normalizarHora5(r.HoraIngreso, '');
        const hOut = FormatosService.normalizarHora5(r.HoraSalida || r.HoraSalidaReal || r.HoraSalidaEstimada, '');
        return {
          numero: idx + 1,
          nombre: String(r.Nombre || '').trim(),
          noTia: String(r.NoTIA || '').trim(),
          horaIngreso: hIn,
          empresa: String(r.Empresa || '').trim(),
          motivo: String(r.Motivo || '').trim(),
          horaSalida: hOut,
          estaPendiente: !hOut
        };
      });

      const minFilas = Math.max(25, filasNormalizadas.length);
      const filasTabla = [];
      for (let i = 0; i < minFilas; i++) {
        if (i < filasNormalizadas.length) {
          filasTabla.push(filasNormalizadas[i]);
        } else {
          filasTabla.push({
            numero: i + 1,
            nombre: '',
            noTia: '',
            horaIngreso: '',
            empresa: '',
            motivo: '',
            horaSalida: '',
            estaPendiente: false
          });
        }
      }

      const [yyyy, mm, dd] = (resumenPreliminar.fecha || '').split('-');
      const fechaFormatoUS = yyyy && mm && dd ? `${mm}/${dd}/${yyyy}` : resumenPreliminar.fecha;
      const tractoristaNombre = String(cp.nombreTractoristaDelta || cp.tractoristaNombre || '').trim();
      const noUnidadLabel = String(cp.tractoristaDelta || cp.noUnidadLabel || '').trim();
      const nombreAlerosDelta = String(cp.nombreAlerosDelta || alerosNombres.join(', ') || '').trim();

      return {
        success: true,
        modo: 'preliminar',
        resumen: resumenPreliminar,
        preview: {
          aerolinea: formatoMeta.aerolinea,
          formatoNombre: formatoMeta.nombre,
          formatoId: formatoMeta.id,
          encabezadoId: parseInt(encabezadoId, 10) || null,
          itinerarioId,
          fechaIso: resumenPreliminar.fecha,
          fechaFormatoUS,
          horaInicio: horaInicio || '',
          supervisor: supervisorNombre || '',
          agente: user.usuario || user.nombreCompleto || '',
          arriboVuelo: FormatosService.normalizarHora5(cp.arriboDelVuelo, ''),
          aeronaveAsegurada: horaAsegurado || '',
          tractoristaNombre,
          noUnidadLabel,
          tractoristaUnidad: [tractoristaNombre, noUnidadLabel].filter(Boolean).join(' / '),
          alero1: alerosNombres[0] || '',
          alero2: alerosNombres[1] || '',
          nombreAlerosDelta,
          observaciones,
          totalRegistros: filasNormalizadas.length,
          pendientesSalidaCount: pendientesSalida.length,
          filasTabla,
          generadoEn: new Date().toISOString()
        }
      };
    }

    // Validaciones de negocio estrictas para guardado definitivo
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

    const encIdNum = parseInt(encabezadoId, 10) || 0;
    let targetEncabezadoId = encIdNum;
    const nombreTractoristaDelta = String(cp.nombreTractoristaDelta || cp.tractoristaNombre || '').trim();
    const tractoristaDelta = String(cp.tractoristaDelta || cp.noUnidadLabel || '').trim();
    const nombreAlerosDelta = String(cp.nombreAlerosDelta || alerosNombres.join(', ') || '').trim();

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
        { name: 'NombreAleros', type: sql.NVarChar(sql.MAX), value: nombreAlerosDelta },
        { name: 'NombreTractorista', type: sql.NVarChar(sql.MAX), value: nombreTractoristaDelta },
        { name: 'Tractorista', type: sql.NVarChar(sql.MAX), value: tractoristaDelta },
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
        { name: 'NombresAleros', type: sql.NVarChar(sql.MAX), value: nombreAlerosDelta || ((nombreTractoristaDelta || tractoristaDelta) ? 'N/A' : null) },
        { name: 'NombreTractorista', type: sql.NVarChar(sql.MAX), value: nombreTractoristaDelta || null },
        { name: 'Tractorista', type: sql.NVarChar(sql.MAX), value: tractoristaDelta || null }
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

  /**
   * Orquesta la validación estricta (2da capa en Backend), vista preliminar y persistencia
   * transaccional del formato "Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (Rayos X)" (ControlER)
   */
  static async procesarGuardadoER(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const er = payload.datos?.erPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;
    const esNuevo = encIdNum <= 0;

    // Si es Vista Preliminar (guardar: false), construimos el modelo en memoria
    if (!guardar) {
      const fechaIso = String(er.fecha || vueloSesion?.FechaItinerado || new Date().toISOString()).trim().substring(0, 10);
      const observaciones = String(er.observaciones || '').trim();
      const firmaBase64 = String(er.firmaBase64 || er.firma || '').trim();
      const registrosRaw = Array.isArray(er.registros) ? er.registros : [];

      const filasNormalizadas = registrosRaw.map((r, idx) => ({
        Numero: idx + 1,
        DetalleControlERId: parseInt(r?.DetalleControlERId, 10) || 0,
        Pasajero: String(r?.Pasajero ?? r?.Nombre ?? '').trim(),
        Secuencia: String(r?.Secuencia ?? '').trim(),
        Colilla: String(r?.Colilla ?? '').trim(),
        Vuelo: String(vueloSesion?.novuelo || r?.Vuelo || '').trim(),
        Destino: String(r?.Destino || vueloSesion?.Destino || 'N/A').trim() || 'N/A',
        HoraRevision: FormatosService.normalizarHora5(r?.HoraRevision ?? r?.Hora, ''),
        AgenteAVSEC: String(r?.AgenteAVSEC ?? r?.Avsec ?? '').trim(),
        AgenteSeguridad: String(r?.AgenteSeguridad ?? r?.Seguridad ?? r?.CreadoPor ?? user?.usuario ?? '').trim()
      }));

      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: filasNormalizadas.length > 0,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          fecha: fechaIso,
          totalEquipajes: filasNormalizadas.length,
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: {
          fecha: fechaIso,
          observaciones,
          firmaBase64,
          agente: user?.usuario || user?.nombreCompleto || '',
          totalEquipajes: filasNormalizadas.length,
          registros: filasNormalizadas
        }
      };
    }

    // CAPA 2 DE VALIDACIÓN ESTRICTA EN BACKEND ANTES DE ABRIR TRANSACCIÓN SQL
    const validacion = FormatoValidationService.validarControlER(payload, user, vueloSesion, {
      requerirFirma: esNuevo
    });

    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;

    // Resolver LoginId del usuario autenticado en sesión (nunca confiar en el body del cliente)
    let loginId = parseInt(user.loginId, 10) || 0;
    if (loginId <= 0) {
      loginId = (await LoginModel.obtenerLoginIdPorUsuario(user.usuario, user.empleadoId)) || 1;
    }

    const txResult = await FormatosModel.guardarControlERTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId,
      empleadoId: parseInt(user.empleadoId, 10) || 0,
      usuarioAuditoria: String(user.usuario || '').trim(),
      fechaIso: norm.fechaIso,
      observaciones: norm.observaciones,
      registros: norm.registros
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalEquipajes: txResult.totalEquipajes,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Control de Equipaje en Revisión AVSEC/SGDAIA guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalEquipajes} equipaje(s) registrado(s))`
    };
  }

  /**
   * 1. Procesa vista preliminar y persistencia transaccional de "Control de Equipajes en Banda de Salida (Rayos X)" (ControlEB)
   */
  static async procesarGuardadoEB(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const eb = payload.datos?.ebPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: eb
      };
    }

    const validacion = FormatoValidationService.validarControlEB(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const anulados = norm.registros.filter(r => r.Valor === 'X' && r.Motivo);
    const obsFinal = anulados.length > 0
      ? `${norm.observaciones ? `${norm.observaciones} | ` : ''}Motivos de anulación: ${anulados.map(a => `Sec. ${a.Secuencia}: ${a.Motivo}`).join(', ')}`
      : norm.observaciones;

    const txResult = await FormatosModel.guardarControlEBTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      supervisorLoginId: norm.supervisorLoginId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      fechaIso: norm.fechaIso,
      horaInicio: norm.horaInicio,
      horaCierre: norm.horaCierre,
      nombreOperador: norm.nombreOperador,
      correosCantidad: norm.correosCantidad,
      comatCantidad: norm.comatCantidad,
      eqTransitoCantidad: norm.eqTransitoCantidad,
      observaciones: obsFinal,
      registros: norm.registros
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalEquipajes: txResult.totalEquipajes,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Control de Equipajes en Banda de Salida guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalEquipajes} secuencia(s) activa(s))`
    };
  }

  /**
   * 2. Procesa vista preliminar y persistencia transaccional de "Control de Equipajes en Compartimentos" (CEC)
   */
  static async procesarGuardadoCEC(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const cec = payload.datos?.cecPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: cec
      };
    }

    const validacion = FormatoValidationService.validarControlCEC(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    let loginId = parseInt(user.loginId, 10) || 0;
    if (loginId <= 0) {
      loginId = (await LoginModel.obtenerLoginIdPorUsuario(user.usuario, user.empleadoId)) || 1;
    }

    const txResult = await FormatosModel.guardarControlCECTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      fechaIso: norm.fechaIso,
      horaInicio: norm.horaInicio,
      supervisor: norm.supervisor,
      agente: norm.agente,
      compartimientoNo: norm.compartimientoNo,
      compAbierto: norm.compAbierto,
      compCerrado: norm.compCerrado,
      equipaje: norm.equipaje,
      carruajes: norm.carruajes,
      correos: norm.correos,
      carga: norm.carga,
      cantidadConEtiqueta: norm.cantidadConEtiqueta,
      cantidadSinEtiqueta: norm.cantidadSinEtiqueta,
      desembarqueInicio: norm.desembarqueInicio,
      desembarqueFinal: norm.desembarqueFinal,
      embarqueInicio: norm.embarqueInicio,
      embarqueFinal: norm.embarqueFinal,
      nombreOirsa: norm.nombreOirsa,
      tiaOirsa: norm.tiaOirsa,
      nombreCombustible: norm.nombreCombustible,
      tiaCombustible: norm.tiaCombustible,
      noUnidadCombustible: norm.noUnidadCombustible,
      combustibleEntrada: norm.combustibleEntrada,
      combustibleSalida: norm.combustibleSalida,
      nombreCocinas: norm.nombreCocinas,
      tiaCocinas: norm.tiaCocinas,
      noUnidadCocinas: norm.noUnidadCocinas,
      cocinasEntrada: norm.cocinasEntrada,
      cocinasSalida: norm.cocinasSalida,
      operadoresRampa: norm.operadoresRampa,
      observaciones: norm.observaciones,
      cargaEmbarqueDelta: norm.cargaEmbarqueDelta,
      equipajeMostrador: norm.equipajeMostrador,
      equipajePuerta: norm.equipajePuerta,
      secuencias: norm.secuencias
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalEmbarque: txResult.totalEmbarque,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Control de Equipajes en Compartimentos guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalEmbarque} secuencia(s) de embarque)`
    };
  }

  /**
   * 3. Procesa vista preliminar y persistencia transaccional de "Control de Ingreso y Egreso Cabina" (CIEC)
   */
  static async procesarGuardadoCIEC(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const ciec = payload.datos?.ciecPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      const registrosRaw = Array.isArray(ciec.registros) ? ciec.registros : [];
      const pendientesSalida = registrosRaw.filter(r => !r?.HoraSalida || String(r.HoraSalida).trim() === '');
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: pendientesSalida.length === 0,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          pendientesSalidaCount: pendientesSalida.length,
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: {
          ...ciec,
          pendientesSalidaCount: pendientesSalida.length
        }
      };
    }

    const validacion = FormatoValidationService.validarControlCIEC(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarControlCIECTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      supervisorEmpleadoId: norm.supervisorEmpleadoId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      fechaIso: norm.fechaIso,
      horaInicio: norm.horaInicio,
      arriboVuelo: norm.arriboVuelo,
      aeronaveAsegurada: norm.aeronaveAsegurada,
      pasarelaAcoplada: norm.pasarelaAcoplada,
      desacoplePasarela: norm.desacoplePasarela,
      puertaAbierta: norm.puertaAbierta,
      puertaCerrada: norm.puertaCerrada,
      egresoTripulacion: norm.egresoTripulacion,
      ingresoTripulacion: norm.ingresoTripulacion,
      primerPax: norm.primerPax,
      ultimoPax: norm.ultimoPax,
      pushBack: norm.pushBack,
      despegue: norm.despegue,
      paxEntrando: norm.paxEntrando,
      paxAbordos: norm.paxAbordos,
      totalEquipaje: norm.totalEquipaje,
      observacionesCombinadas: norm.observacionesCombinadas,
      tractoristaEmpleadoId: norm.tractoristaEmpleadoId,
      maquinariaEquipoId: norm.maquinariaEquipoId,
      alerosIds: norm.alerosIds,
      alerosDelta: norm.alerosDelta,
      maquinariaDelta: norm.maquinariaDelta,
      tractoristaDelta: norm.tractoristaDelta,
      registros: norm.registros
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalPersonas: txResult.totalPersonas,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Control de Ingreso y Egreso Cabina guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalPersonas} registro(s) de acceso)`
    };
  }

  /**
   * 4. Procesa vista preliminar y persistencia transaccional de "Equipajes en mal estado y carga dañada" (MECD)
   */
  static async procesarGuardadoMECD(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const mecd = payload.datos?.mecdPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;
    const esNuevo = encIdNum <= 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: mecd
      };
    }

    const validacion = FormatoValidationService.validarEquipajeMECD(payload, user, vueloSesion, {
      requerirFirmas: false
    });
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarEquipMECDTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      supervisorId: norm.supervisorEmpleadoId,
      agenteId: norm.agenteEmpleadoId,
      ccoId: norm.ccoEmpleadoId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      revisiones: norm.revisiones,
      conFirma: norm.conFirma,
      sinFirma: norm.sinFirma
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalRegistros: txResult.totalRegistros,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      revision: norm.revisiones,
      conFirma: norm.conFirma,
      sinFirma: norm.sinFirma,
      mensaje: `¡Equipajes en Mal Estado y Carga Dañada guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalRegistros} registro(s))`
    };
  }

  /**
   * 5. Procesa vista preliminar y persistencia transaccional de "Puestos por Operación" (PO)
   */
  static async procesarGuardadoPO(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const po = payload.datos?.poPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;
    const esNuevo = encIdNum <= 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: po
      };
    }

    const validacion = FormatoValidationService.validarPuestosOperacion(payload, user, vueloSesion, {
      requerirFirma: false
    });
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarPuestosOperacionTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      supervisorLoginId: norm.supervisorLoginId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      observaciones: norm.observaciones,
      registros: norm.registros
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalAgentes: txResult.totalAgentes,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Puestos por Operación guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalAgentes} agente(s) asignado(s))`
    };
  }

  /**
   * 6. Procesa vista preliminar y persistencia transaccional de "Control de Flejes en Rayos X" (CFR - ARAJET)
   */
  static async procesarGuardadoCFR(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const cfr = payload.datos?.cfrPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: cfr
      };
    }

    const validacion = FormatoValidationService.validarControlCFR(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    let loginId = parseInt(user.loginId, 10) || norm.supervisorLoginId || 0;
    if (loginId <= 0) {
      loginId = (await LoginModel.obtenerLoginIdPorUsuario(user.usuario, user.empleadoId)) || 1;
    }

    const txResult = await FormatosModel.guardarControlCFRTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId,
      supervisorEmpleadoId: norm.supervisorEmpleadoId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      fechaIso: norm.fechaIso,
      primeraPlataforma: norm.primeraPlataforma,
      ultimaPlataforma: norm.ultimaPlataforma,
      inicioOperacion: norm.inicioOperacion,
      horaCierre: norm.horaCierre,
      aviCantidad: norm.aviCantidad,
      comatCantidad: norm.comatCantidad,
      totalEqEncabezado: norm.totalEqEncabezado,
      carretas: norm.carretas
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalCarretas: txResult.totalCarretas,
      totalEqEncabezado: txResult.totalEqEncabezado,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Control de Flejes en Rayos X guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalCarretas} carreta(s) • ${txResult.totalEqEncabezado} equipaje(s))`
    };
  }

  /**
   * 7. Procesa vista preliminar y persistencia transaccional de "Control de Equipaje en Rayos X" (dl-rx - DELTA)
   */
  static async procesarGuardadoRX(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const rx = payload.datos?.rxPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: rx
      };
    }

    const validacion = FormatoValidationService.validarControlRX(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    let loginId = parseInt(user.loginId, 10) || 0;
    if (loginId <= 0) {
      loginId = (await LoginModel.obtenerLoginIdPorUsuario(user.usuario, user.empleadoId)) || 1;
    }

    const txResult = await FormatosModel.guardarControlRXTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId,
      supervisorEmpleadoId: norm.supervisorEmpleadoId,
      fechaIso: norm.fechaIso,
      horaInicio: norm.horaInicio,
      pEquipajeRecibidoRX: norm.pEquipajeRecibidoRX,
      pCarretaEnviada: norm.pCarretaEnviada,
      uEquipajeRX: norm.uEquipajeRX,
      uCarretaEnviada: norm.uCarretaEnviada,
      observaciones: norm.observaciones,
      personalSAG: norm.personalSAG,
      personalLaats: norm.personalLaats
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalSAG: txResult.totalSAG,
      totalLaats: txResult.totalLaats,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      personalSAG: txResult.personalSAG,
      personalLaats: txResult.personalLaats,
      mensaje: `¡Control de Equipaje en Rayos X (DELTA) guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalSAG} SAG / ${txResult.totalLaats} LAATS)`
    };
  }

  /**
   * 8. Procesa vista preliminar y persistencia transaccional de "Cargo Loading Log" (dl-cll - DELTA)
   */
  static async procesarGuardadoCLL(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const cll = payload.datos?.cllPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: cll
      };
    }

    const validacion = FormatoValidationService.validarControlCLL(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    let loginId = parseInt(user.loginId, 10) || 0;
    if (loginId <= 0) {
      loginId = (await LoginModel.obtenerLoginIdPorUsuario(user.usuario, user.empleadoId)) || 1;
    }

    const txResult = await FormatosModel.guardarControlCLLTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      fechaIso: norm.fechaIso,
      agenteDelta: norm.agenteDelta,
      agenteSeguridad: norm.agenteSeguridad,
      agenteTIA: norm.agenteTIA,
      registros: norm.registros
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalRegistros: txResult.totalRegistros,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Cargo Loading Log guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalRegistros} guía(s) registrada(s))`
    };
  }

  /**
   * 9. Procesa vista preliminar y persistencia transaccional de "Selected Passenger" (dl-sp - DELTA)
   */
  static async procesarGuardadoSP(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const sp = payload.datos?.spPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: sp
      };
    }

    const validacion = FormatoValidationService.validarControlSP(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarControlSPTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId: norm.supervisorLoginId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      fechaIso: norm.fechaIso,
      registros: norm.registros
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      totalPasajeros: txResult.totalPasajeros,
      filasEliminadasSoft: txResult.filasEliminadasSoft,
      detalles: txResult.detalles,
      mensaje: `¡Selected Passenger guardado exitosamente! (ID #${txResult.encabezadoId} • ${txResult.totalPasajeros} pasajero(s) registrado(s))`
    };
  }

  /**
   * 10. Procesa vista preliminar y persistencia transaccional de "Daily Activity Log" (dl-dal - DELTA)
   */
  static async procesarGuardadoDAL(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const dal = payload.datos?.dalPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: dal
      };
    }

    const validacion = FormatoValidationService.validarControlDAL(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarControlDALTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId: norm.supervisorLoginId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      revisadoXRay: norm.revisadoXRay,
      cantidadEqFisicos: norm.cantidadEqFisicos,
      evaluadores: norm.evaluadores,
      bolsasIngresadas: norm.bolsasIngresadas,
      cantidadEq: norm.cantidadEq,
      nombreGuardia: norm.nombreGuardia,
      cantidadEqGuardia: norm.cantidadEqGuardia,
      cantidadMaletas: norm.cantidadMaletas,
      nombreGuardia2: norm.nombreGuardia2,
      cantidadPiezasManifiesto: norm.cantidadPiezasManifiesto,
      nombreGuardia3: norm.nombreGuardia3,
      nombreAgentes: norm.nombreAgentes,
      nombreGuardiaEscolta: norm.nombreGuardiaEscolta,
      cantidadPasajerosTransito: norm.cantidadPasajerosTransito,
      cantidadPasajerosSalientes: norm.cantidadPasajerosSalientes,
      pasajerosPerdieronVuelo: norm.pasajerosPerdieronVuelo,
      cantidadPiezasAceptadas: norm.cantidadPiezasAceptadas,
      cantidadPiezasCargadas: norm.cantidadPiezasCargadas,
      cantidadEqFacturados: norm.cantidadEqFacturados,
      cantidadEqCargadas: norm.cantidadEqCargadas,
      cantidadEqRetirados: norm.cantidadEqRetirados,
      eqCoincidePasajero: norm.eqCoincidePasajero,
      nombreAgenteDelta: norm.nombreAgenteDelta
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      mensaje: `¡Daily Activity Log guardado exitosamente! (ID #${txResult.encabezadoId})`
    };
  }

  /**
   * 11. Procesa vista preliminar y persistencia transaccional de "Sequence of Events Log" (dl-sel - DELTA)
   */
  static async procesarGuardadoSEL(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const sel = payload.datos?.selPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: sel
      };
    }

    const validacion = FormatoValidationService.validarControlSEL(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarControlSELTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId: norm.supervisorLoginId,
      usuarioAuditoria: String(user.usuario || '').trim(),
      horaCierreFila: norm.horaCierreFila,
      cantidadPasajerosFila: norm.cantidadPasajerosFila,
      horaChequeadoFila: norm.horaChequeadoFila,
      primerEqRevisada: norm.primerEqRevisada,
      ultimoEqRevisado: norm.ultimoEqRevisado,
      primerEqPuerta: norm.primerEqPuerta,
      ultimoEqPuerta: norm.ultimoEqPuerta,
      cantidadPasajerosEmbarque: norm.cantidadPasajerosEmbarque,
      horaInicioEmbarque: norm.horaInicioEmbarque,
      horaUltimoAbandona: norm.horaUltimoAbandona,
      horaDescargaEqCarga: norm.horaDescargaEqCarga,
      horaInicioEqCarga: norm.horaInicioEqCarga,
      horaPuertasCerradasCar: norm.horaPuertasCerradasCar,
      horaPuertasCerradasCab: norm.horaPuertasCerradasCab,
      horaInicioRodajeNave: norm.horaInicioRodajeNave,
      observaciones: norm.observaciones
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      mensaje: `¡Sequence of Events Log guardado exitosamente! (ID #${txResult.encabezadoId})`
    };
  }

  /**
   * 12. Procesa vista preliminar y persistencia transaccional de "Aircraft Security Search" (ac-ass - AIR CANADA)
   */
  static async procesarGuardadoASS(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const ass = payload.datos?.assPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: ass
      };
    }

    const validacion = FormatoValidationService.validarControlASS(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarControlASSTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId: parseInt(user?.loginId, 10) || 1,
      empleadoId: norm.empleadoId,
      fechaIso: norm.fecha,
      tipoBusqueda: norm.tipoBusqueda,
      horaInicio: norm.horaInicio,
      horaFin: norm.horaFin,
      teamSupervisor: norm.supervisorNombre,
      usuarioAuditoria: String(user?.usuario || '').trim(),
      checks: norm.checks,
      observaciones: norm.observaciones,
      meta: {
        departureStation: norm.departureStation,
        originInbound: norm.originInbound,
        destinationOutbound: norm.destinationOutbound,
        company: norm.company,
        signature: norm.firmaBase64
      }
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      mensaje: `¡Formato Aircraft Security Search guardado exitosamente! (ID #${txResult.encabezadoId})`
    };
  }

  /**
   * 13. Procesa vista preliminar y persistencia transaccional de "Anexo A / Aircraft Access Control Log Sheet" (ac-anexoa - AIR CANADA)
   */
  static async procesarGuardadoAnexoA(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const anexoA = payload.datos?.anexoAPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      const registros = Array.isArray(anexoA.registros) ? anexoA.registros : [];
      const pendientes = registros.filter(r => !String(r?.HoraSalida || r?.HoraSalidaReal || '').trim()).length;
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: pendientes === 0,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          pendientesSalida: pendientes,
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: {
          ...anexoA,
          pendientesSalidaCount: pendientes
        }
      };
    }

    const validacion = FormatoValidationService.validarControlAnexoA(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarControlAnexoATransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId: parseInt(user?.loginId, 10) || 1,
      fechaIso: norm.fecha,
      supervisorEmpleadoId: norm.supervisorEmpleadoId,
      supervisorNombre: norm.supervisorNombre,
      usuarioAuditoria: String(user?.usuario || '').trim(),
      registros: norm.registros,
      observaciones: norm.observaciones,
      meta: {
        horaRevision: norm.horaRevision,
        puerta: norm.puerta,
        arriboVuelo: norm.arriboVuelo,
        aeronaveAsegurada: norm.aeronaveAsegurada
      }
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      mensaje: `¡Formato Anexo A de Air Canada guardado exitosamente! (ID #${txResult.encabezadoId})`
    };
  }

  /**
   * 14. Procesa vista preliminar y persistencia transaccional de "Annex B, to aircraft security search checklist" (ac-anexob - AIR CANADA)
   */
  static async procesarGuardadoAnexoB(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const anexoB = payload.datos?.anexoBPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: anexoB
      };
    }

    const validacion = FormatoValidationService.validarControlAnexoB(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    const txResult = await FormatosModel.guardarControlAnexoBTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId: norm.leadSupervisorLoginId || parseInt(user?.loginId, 10) || 1,
      fechaIso: norm.fecha,
      usuarioAuditoria: String(user?.usuario || '').trim(),
      leadEmpleadoId: parseInt(norm.leadEmployeeNumber, 10) || parseInt(user?.empleadoId, 10) || null,
      generalSearchType: norm.generalSearchType,
      docMeta: {
        tipoOperacion: norm.tipoOperacion,
        departureStation: norm.departureStation,
        originInbound: norm.originInbound,
        destinationOutbound: norm.destinationOutbound,
        searchStartTime: norm.searchStartTime,
        timeSearchCompleted: norm.timeSearchCompleted,
        generalSearchType: norm.generalSearchType,
        overheadBins: norm.overheadBins,
        closetsStorageCrew: norm.closetsStorageCrew,
        lavatoriesAndSeals: norm.lavatoriesAndSeals,
        seatsUnderPocketsBetween: norm.seatsUnderPocketsBetween,
        seatBacksPocketsTrays: norm.seatBacksPocketsTrays,
        galleyAreasAndTrolleys: norm.galleyAreasAndTrolleys,
        seatsUnderCushions: norm.seatsUnderCushions,
        lifeVestPackagesHolders: norm.lifeVestPackagesHolders,
        crewRestAreas: norm.crewRestAreas,
        idValidationRequired: norm.idValidationRequired,
        idValidationReport: norm.idValidationReport,
        leadSupervisorLoginId: norm.leadSupervisorLoginId,
        leadName: norm.leadName,
        leadEmployeeNumber: norm.leadEmployeeNumber,
        leadSignature: norm.leadSignature,
        csmName: norm.csmName,
        csmSignature: norm.csmSignature
      },
      zonesSearch: norm.zonesSearch
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      mensaje: `¡Formato Air Canada (${norm.tipoOperacion} - Annex B) guardado exitosamente! (ID #${txResult.encabezadoId})`
    };
  }

  /**
   * 15. Procesa vista preliminar y persistencia transaccional de "Lista de Inspección de Aeronave de Carga" (latam-liadc - LAN CARGO)
   */
  static async procesarGuardadoLIADC(payload, formatoMeta, user, vueloSesion = null) {
    const { itinerarioId, encabezadoId, guardar = true } = payload;
    const liadc = payload.datos?.liadcPayload || payload.datos || {};
    const encIdNum = parseInt(encabezadoId, 10) || 0;

    if (!guardar) {
      return {
        success: true,
        modo: 'preliminar',
        resumen: {
          valido: true,
          formato: formatoMeta.nombre,
          aerolinea: formatoMeta.aerolinea,
          itinerarioId,
          encabezadoId: encIdNum || 'NUEVO',
          timestamp: new Date().toISOString(),
          usuario: user?.usuario || ''
        },
        preview: liadc
      };
    }

    const validacion = FormatoValidationService.validarControlLIADC(payload, user, vueloSesion);
    if (!validacion.valido) {
      return {
        success: false,
        statusCode: validacion.statusCode || 400,
        message: validacion.message,
        errors: validacion.errors
      };
    }

    const norm = validacion.normalized;
    let supervisorNombreFinal = norm.supervisorNombre;
    if (!supervisorNombreFinal && norm.supLaats > 0) {
      try {
        const usuarios = await LoginModel.obtenerUsuariosSEC();
        const found = (usuarios || []).find(u => Number(u.EmpleadoId) === Number(norm.supLaats));
        if (found) supervisorNombreFinal = found.NombreCompleto || found.Usuario || '';
      } catch (_) {}
    }

    const txResult = await FormatosModel.guardarControlLIADCTransaccional({
      encabezadoId: norm.encabezadoId,
      itinerarioId: norm.itinerarioId,
      loginId: parseInt(user?.loginId, 10) || 1,
      fechaIso: norm.fecha,
      puente: norm.puente,
      horaInicioInsp: norm.horaInicioInsp,
      horaTerminoInsp: norm.horaTerminoInsp,
      supLaats: norm.supLaats,
      notificacionComandante: norm.notificacionComandante,
      iniciales: norm.iniciales,
      observaciones: norm.observaciones,
      checks: norm.checks,
      meta: {
        arriboVuelo: norm.arriboVuelo,
        inspectorNombre: norm.inspectorNombre,
        supervisorNombre: supervisorNombreFinal,
        firmaInspector: norm.firmaInspector,
        firmaSupervisor: norm.firmaSupervisor
      },
      usuarioAuditoria: String(user?.usuario || '').trim()
    });

    return {
      success: true,
      modo: 'persistido',
      encabezadoId: txResult.encabezadoId,
      mensaje: `¡Formato LIADC de LAN CARGO guardado exitosamente! (ID #${txResult.encabezadoId})`
    };
  }
}

module.exports = FormatosService;
