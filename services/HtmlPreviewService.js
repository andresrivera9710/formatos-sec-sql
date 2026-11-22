/**
 * HtmlPreviewService - Motor de Renderizado de Formatos Controlados (FormatosHTML)
 * Resuelve las variables de Power Automate (@{variables(...)}, @{body(...)}, @{formatDateTime(...)}, etc.)
 * respetando exactamente la estructura HTML, estilos y logos oficiales de cada aerolínea.
 */

const fs = require('fs');
const path = require('path');

const FORMATOS_HTML_DIR = fs.existsSync(path.join(__dirname, '..', 'FormatosHTML'))
  ? path.join(__dirname, '..', 'FormatosHTML')
  : path.join(__dirname, '..', '..', 'FormatosHTML');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const FORMAT_HTML_MAP = {
  // AEROMEXICO
  'amx-cp': 'AEROMEXICO/Control de Perimétrica (unificado).html',
  'amx-ciec': 'AEROMEXICO/Control Ingreso y Egreso Cabina.html',
  'amx-er': 'AEROMEXICO/Control de Equipaje en Revisión AVSECSGDAIA Banda de Salida (rayos x) AMX.html',
  'amx-eb': 'AEROMEXICO/Control de Equipajes en Banda de Salida (rayos x).html',
  'amx-cec': 'AEROMEXICO/Control de Equipajes en Compartimentos.html',
  'amx-mecd': 'AEROMEXICO/Equipaje en mal estado.html',
  'amx-po': 'AEROMEXICO/Puestos por Operación.html',
  // ARAJET
  'ara-cp': 'ARAJET/Control Perimetrica.txt',
  'ara-ciec': 'ARAJET/Control Ingreso y Egreso Cabina.txt',
  'ara-er': 'ARAJET/Control de Equipaje en Revisión AVSECSGDAIA Banda de Salida (rayos x).txt.txt',
  'ara-eb': 'ARAJET/Control de Equipajes en Banda de Salida (rayos x).txt',
  'ara-cec': 'ARAJET/Control de Equipajes en Compartimentos.txt',
  'ara-cfr': 'ARAJET/Control de Flejes Rayos X.txt',
  // DELTA
  'dl-cp': 'DELTA/Control de Perimétrica (unificado) DL.txt',
  'dl-ciec': 'DELTA/Control Ingreso y Egreso Cabina DL.txt',
  'dl-er': 'DELTA/Control de Equipaje en Revisión AVSEC SGDAIA Banda de Salida (rayos x) DL.txt',
  'dl-cec': 'DELTA/Control de Equipajes en Compartimentos DL.txt',
  'dl-rx': 'DELTA/Control de Equipaje en Rayos X DELTA.txt',
  'dl-cll': 'DELTA/Cargo Loading Log.txt',
  'dl-sp': 'DELTA/Selected Passenger.txt',
  'dl-dal': 'DELTA/Daily Activity Log.txt',
  'dl-sel': 'DELTA/Sequence of Events Log.txt',
  // AIR CANADA
  'ac-cp': 'AIR CANADA/Control de Perimétrica (unificado) AC.txt',
  'ac-er': 'AIR CANADA/Control de Equipaje en Revisión AVSEC SGDAIA Banda de Salida (rayos x) AC.txt',
  'ac-eb': 'AIR CANADA/Control de Equipajes en Banda de Salida (rayos x) AC.txt',
  'ac-cec': 'AIR CANADA/Control de Equipajes en Compartimentos AC.txt',
  'ac-ass': 'AIR CANADA/Aircraft Security Search AC.txt',
  'ac-anexoa': 'AIR CANADA/ANEXO A AIRCRAFT ACCESS CONTROL LOG SHEET AC.txt',
  'ac-anexob': 'AIR CANADA/Annex B, to aircraft security search checklist.txt',
  // LAN CARGO (LATAM)
  'latam-cp': 'LATAM/Control de Perimétrica (unificado) LATAM.txt',
  'latam-ciec': 'LATAM/Control de ingreso y egreso cabina aeronave LATAM.txt',
  'latam-liadc': 'LATAM/LISTA DE INSPECCION DE AERONAVE DE CARGA LATAM.txt',
  // FEDEX
  'fdx-ccda': 'FEDEX/Control Cargue y Descargue Aeronave FEDEX.txt',
  // AMERIJET
  'ajt-lisa': 'AMERIJET/LISTA DE INPECCION DE SEGURIDAD DE LA AERONAVE AJT.txt',
  'ajt-cec': 'AMERIJET/Control de Equipajes en Compartimentos AJT.txt',
  'ajt-ciec': 'AMERIJET/Control de ingreso y egreso cabina aeronave AJT.txt'
};

const RAW_HTML_KEYS = new Set([
  'FilasTabla',
  'FilasInOutHTML',
  'FilasEquipajeHTML',
  'MatrizHTML',
  'TablaEmbarqueHTML',
  'TablaDesembarqueHTML',
  'TablaPersonalHTML',
  'TablaCarretasHTML',
  'EquipajePuertaHTML',
  'TablaRevision',
  'TablaConFirma',
  'TablaSinFirma',
  'TablaSAG_HTML',
  'TablaLAATS_HTML',
  'TablaHTML',
  'TablaPaxHTML'
]);

const SIGNATURE_KEYS = new Set([
  'FirmaFinal',
  'FirmaSupervisor',
  'FirmaAgente',
  'FirmaCCO',
  'FirmaSeguridadAerolinea',
  'FirmaSecurity',
  'FirmaLD',
  'FirmaGuardSup',
  'FirmaDLAgent',
  'Signature',
  'LeadSignature',
  'CSMSignature',
  'FirmaInspector'
]);

const logoBase64Cache = new Map();

class HtmlPreviewService {
  static escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  static getLogoBase64(filename) {
    if (logoBase64Cache.has(filename)) {
      return logoBase64Cache.get(filename);
    }
    const fullPath = path.join(IMAGES_DIR, filename);
    if (!fs.existsSync(fullPath)) return '';
    const b64 = fs.readFileSync(fullPath).toString('base64');
    logoBase64Cache.set(filename, b64);
    return b64;
  }

  static hasControlledTemplate(formatoId) {
    const rel = FORMAT_HTML_MAP[formatoId];
    if (!rel) return false;
    return fs.existsSync(path.join(FORMATOS_HTML_DIR, rel));
  }

  static readRawTemplate(formatoId) {
    const rel = FORMAT_HTML_MAP[formatoId];
    if (!rel) return '';
    const fullPath = path.join(FORMATOS_HTML_DIR, rel);
    if (!fs.existsSync(fullPath)) return '';
    return fs.readFileSync(fullPath, 'utf8');
  }

  /**
   * Sanitiza un segmento para nombre de archivo HTML sin caracteres inválidos ni traversal.
   */
  static _sanitizeFilenameSegment(val, fallback = 'NA') {
    const raw = String(val ?? '')
      .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/_+/g, '_')
      .trim()
      .replace(/^[._\s]+|[._\s]+$/g, '');
    return raw || fallback;
  }

  /**
   * Construye el nombre estándar del documento HTML siguiendo la guía oficial:
   * <Vuelo>_<Matricula>_<NombreFormato>_<EncabezadoId|PRELIMINAR>.html
   * Ej.: 678_679_NA_Control de Equipajes en Banda de Salida (rayos x)_70.html
   */
  static buildDocumentName({ vuelo = {}, formatoMeta = {}, formatoNombre = '', encabezadoId = null } = {}) {
    const rawVuelo = vuelo.novuelo || vuelo.numeroVuelo || '';
    const vueloSeg = HtmlPreviewService._sanitizeFilenameSegment(rawVuelo, 'SIN_VUELO');

    const rawMatricula = String(vuelo.Matricula || vuelo.matricula || '').trim();
    const matUpper = rawMatricula.toUpperCase();
    const matriculaEsVacia = !rawMatricula ||
      matUpper === 'NA' ||
      matUpper === 'N/A' ||
      matUpper === 'PENDIENTE' ||
      matUpper === 'SIN MATRICULA' ||
      matUpper === 'S/M';
    const matriculaSeg = matriculaEsVacia
      ? 'NA'
      : HtmlPreviewService._sanitizeFilenameSegment(rawMatricula, 'NA');

    const rawFormato = (formatoMeta?.id === 'dl-rx')
      ? 'Control de Equipaje en Rayos X DELTA'
      : (formatoMeta?.nombre || formatoNombre || 'Formato SEC');
    const formatoSeg = HtmlPreviewService._sanitizeFilenameSegment(rawFormato, 'Formato_SEC');

    const encIdNum = parseInt(encabezadoId, 10);
    const idSeg = Number.isInteger(encIdNum) && encIdNum > 0
      ? String(encIdNum)
      : 'PRELIMINAR';

    const documentBaseName = `${vueloSeg}_${matriculaSeg}_${formatoSeg}_${idSeg}`;
    return {
      documentBaseName,
      fileName: `${documentBaseName}.html`
    };
  }

  /**
   * Construye la cabecera Content-Disposition segura (RFC 6266 / anti-CRLF) para descargas o vista en línea.
   */
  static buildContentDispositionHeader(fileName, asAttachment = false) {
    const cleanUtf8 = String(fileName || 'documento.html')
      .split(/[\r\n]/)[0]
      .replace(/[\x00-\x1f\x7f]/g, '')
      .trim() || 'documento.html';
    const asciiFallback = cleanUtf8
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_');
    const encodedUtf8 = encodeURIComponent(cleanUtf8)
      .replace(/['()!*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const dispositionType = asAttachment ? 'attachment' : 'inline';
    return `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
  }

  static formatDDMMYYYY(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [y, m, d] = str.substring(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [m, d, y] = str.split('/');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(str);
    if (!Number.isNaN(dt.getTime())) {
      const d = String(dt.getUTCDate()).padStart(2, '0');
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const y = dt.getUTCFullYear();
      return `${d}/${m}/${y}`;
    }
    return str;
  }

  static formatMMDDYYYY(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [y, m, d] = str.substring(0, 10).split('-');
      return `${m}/${d}/${y}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
    const dt = new Date(str);
    if (!Number.isNaN(dt.getTime())) {
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      const y = dt.getUTCFullYear();
      return `${m}/${d}/${y}`;
    }
    return str;
  }

  static extractHHMM(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (str.includes('T') && str.length >= 16) return str.substring(11, 16);
    const match = str.match(/(\d{2}:\d{2})/);
    return match ? match[1] : str;
  }

  static sanitizeSignatureDataUrl(val) {
    const str = String(val || '').trim();
    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(str)) {
      return str;
    }
    return BLANK_IMG;
  }

  /**
   * Construye el diccionario de variables Power Automate para Control de Perimétrica (amx-cp)
   */
  static buildCpData({ cpDoc, vuelo, user }) {
    const esc = HtmlPreviewService.escapeHtml;
    const rawRows = (Array.isArray(cpDoc?.filasTabla) && cpDoc.filasTabla.length > 0)
      ? cpDoc.filasTabla
      : (Array.isArray(cpDoc?.registros)
        ? cpDoc.registros.map((r, idx) => {
          const hIn = HtmlPreviewService.extractHHMM(r?.HoraIngreso || r?.horaIngreso || '');
          const hOut = HtmlPreviewService.extractHHMM(r?.HoraSalida || r?.HoraSalidaReal || r?.HoraSalidaEstimada || r?.horaSalida || '');
          const nom = String(r?.Nombre || r?.nombre || '').trim();
          return {
            numero: idx + 1,
            nombre: nom,
            noTia: String(r?.NoTIA || r?.noTia || '').trim(),
            horaIngreso: hIn,
            empresa: String(r?.Empresa || r?.empresa || '').trim(),
            motivo: String(r?.Motivo || r?.motivo || '').trim(),
            horaSalida: hOut,
            estaPendiente: Boolean(nom && !hOut)
          };
        })
        : []);

    const minRows = Math.max(25, rawRows.length);
    const rows = [];
    for (let i = 0; i < minRows; i++) {
      rows.push(rawRows[i] || {
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

    const filasTablaHtml = rows.map((r) => {
      const salidaCell = r.nombre && r.estaPendiente
        ? '<span style="color:#DC2626; font-weight:bold;">Pendiente</span>'
        : esc(r.horaSalida || '');

      return `<tr>
        <td>${esc(r.numero)}</td>
        <td>${esc(r.nombre || '')}</td>
        <td>${esc(r.noTia || '')}</td>
        <td>${esc(r.horaIngreso || '')}</td>
        <td>${esc(r.empresa || '')}</td>
        <td>${esc(r.motivo || '')}</td>
        <td>${salidaCell}</td>
      </tr>`;
    }).join('');

    const horaIniStr = cpDoc?.horaInicio || '--:--';
    const puertaStr = String(vuelo?.puertaposicion ?? vuelo?.puerta ?? '').trim();

    return {
      Fecha: cpDoc?.fechaFormatoUS || HtmlPreviewService.formatMMDDYYYY(cpDoc?.fechaIso || cpDoc?.fecha || vuelo?.FechaItinerado),
      Supervisor: cpDoc?.supervisor || '',
      HoraInicioPuerta: cpDoc?.horaInicioPuerta || (puertaStr ? `${horaIniStr} / ${puertaStr}` : `${horaIniStr} / `),
      Agente: cpDoc?.agente || user?.usuario || user?.nombreCompleto || '',
      Vuelo: cpDoc?.vuelo || vuelo?.novuelo || vuelo?.numeroVuelo || '',
      Matricula: cpDoc?.matricula || vuelo?.Matricula || vuelo?.matricula || '',
      FilasTabla: filasTablaHtml,
      ArriboVuelo: cpDoc?.arriboVuelo || '',
      AeronaveAsegurada: cpDoc?.aeronaveAsegurada || '',
      Alero1: cpDoc?.alero1 || '',
      TractoristaUnidad: cpDoc?.tractoristaUnidad || '',
      Alero2: cpDoc?.alero2 || '',
      Aleros: cpDoc?.nombreAlerosDelta || [cpDoc?.alero1, cpDoc?.alero2].filter(Boolean).join(', ') || '',
      Observaciones: cpDoc?.observaciones || ''
    };
  }

  /**
   * Resuelve un nombre legible de Supervisor/Agente incluso cuando SQL almacena LoginId o EmpleadoId numérico
   */
  static resolvePersonaNombre(rawVal, explicitId = null, hydrated = {}) {
    const text = String(rawVal ?? '').trim();
    if (text && !/^\d+$/.test(text)) {
      return text;
    }

    const numericId = parseInt(explicitId ?? text, 10);
    if (Number.isInteger(numericId) && numericId > 0) {
      const pools = [
        ...(Array.isArray(hydrated?.supervisores) ? hydrated.supervisores : []),
        ...(Array.isArray(hydrated?.usuariosSEC) ? hydrated.usuariosSEC : []),
        ...(Array.isArray(hydrated?.usuariosLogin) ? hydrated.usuariosLogin : []),
        ...(Array.isArray(hydrated?.empleados) ? hydrated.empleados : []),
        ...(Array.isArray(hydrated?.catalogos?.supervisores) ? hydrated.catalogos.supervisores : []),
        ...(Array.isArray(hydrated?.catalogos?.usuariosSEC) ? hydrated.catalogos.usuariosSEC : []),
        ...(Array.isArray(hydrated?.catalogos?.usuariosLogin) ? hydrated.catalogos.usuariosLogin : []),
        ...(Array.isArray(hydrated?.catalogos?.empleados) ? hydrated.catalogos.empleados : [])
      ];
      const match = pools.find(
        p => Number(p?.LoginId) === numericId || Number(p?.EmpleadoId) === numericId
      );
      if (match) {
        const resolved = String(match.Usuario || match.NombreCompleto || match.Nombre || '').trim();
        if (resolved) return resolved;
      }
    }

    return text;
  }

  /**
   * Construye el diccionario de variables Power Automate para los otros formatos de Aeroméxico, Arajet y Delta
   */
  static buildAeromexicoOtherData({ formatoId, formDatos = {}, vuelo = {}, user = {}, datosPrevios = [], complementos = [], hydrated = {}, preferPersisted = false }) {
    const esc = HtmlPreviewService.escapeHtml;
    const rows = Array.isArray(datosPrevios?.[0]) ? datosPrevios[0] : (Array.isArray(datosPrevios) ? datosPrevios : []);
    const comp = complementos?.[0]?.[0] || complementos?.[0] || {};

    const fechaItiVuelo = (vuelo && vuelo.FechaItinerado)
      ? String(vuelo.FechaItinerado instanceof Date ? vuelo.FechaItinerado.toISOString() : vuelo.FechaItinerado).trim().substring(0, 10)
      : '';
    const fechaRaw = fechaItiVuelo || formDatos.fecha || comp.Fecha || new Date().toISOString().substring(0, 10);
    const supervisor = formDatos.supervisor || comp.Supervisor || comp.TeamSupervisor || '';
    const agente = formDatos.agente || user.usuario || user.nombreCompleto || '';
    const vueloNo = vuelo.novuelo || comp.NoVuelo || '';
    const matricula = vuelo.Matricula || comp.Matricula || '';
    const puerta = formDatos.posicion || vuelo.puertaposicion || comp.Puerta || '';
    const unidad = formDatos.unidad || formDatos.noUnidad || '';
    const observaciones = formDatos.observaciones || comp.Observaciones || comp.Observacion || '';
    const firmaDataUrl = HtmlPreviewService.sanitizeSignatureDataUrl(formDatos.firmaBase64 || formDatos.firma);
    const repoFirmas = hydrated?.firmasRepo?.firmas || {};
    const pickRepoSig = (repoKey, liveVal, legacyVal = '') => {
      const repoUrl = repoFirmas?.[repoKey]?.locked && repoFirmas?.[repoKey]?.dataUrl
        ? repoFirmas[repoKey].dataUrl
        : '';
      return HtmlPreviewService.sanitizeSignatureDataUrl(repoUrl || liveVal || legacyVal || '');
    };

    if (formatoId.endsWith('-ciec')) {
      const ciecData = formDatos.ciecPayload || formDatos || {};
      const ciecDb = hydrated?.ciecState || {};
      const encDb = ciecDb.encabezado || {};
      const compDb = ciecDb.complemento || comp || {};
      const dbRows = Array.isArray(ciecDb.detalles) && ciecDb.detalles.length > 0 ? ciecDb.detalles : rows;
      const liveRows = Array.isArray(ciecData.registros) ? ciecData.registros : null;
      const sourceRows = (preferPersisted && dbRows.length > 0) ? dbRows : (liveRows || dbRows);
      const total = Math.max(32, sourceRows.length);
      const filas = [];
      for (let i = 0; i < total; i++) {
        const r = sourceRows[i] || {};
        const hIn = HtmlPreviewService.extractHHMM(r.HoraIngreso || r.HoraEntrada);
        const hOut = HtmlPreviewService.extractHHMM(r.HoraSalidaReal || r.HoraSalida || r.HoraSalidaEstimada);
        const salidaHtml = (r.Nombre && !hOut)
          ? '<span style="color:#DC2626; font-weight:bold;">Pendiente</span>'
          : esc(hOut);
        filas.push(`<tr class="grid-row">
          <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${i + 1}</td>
          <td style="border: 1px solid black; padding: 2px 4px; text-align: left;">${esc(r.Nombre || '')}</td>
          <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${esc(r.NoTIA || '')}</td>
          <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${esc(r.Empresa || '')}</td>
          <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${esc(hIn)}</td>
          <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${esc(r.Motivo || '')}</td>
          <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${salidaHtml}</td>
        </tr>`);
      }

      const dbEqPuerta = Array.isArray(ciecDb.equipajePuerta) ? ciecDb.equipajePuerta : [];
      const hasLiveEqArray = !preferPersisted && Array.isArray(ciecData.equipajePuerta);
      const rawEqPuerta = preferPersisted
        ? (dbEqPuerta.length > 0 ? dbEqPuerta : (Array.isArray(ciecData.equipajePuerta) ? ciecData.equipajePuerta : []))
        : (hasLiveEqArray ? ciecData.equipajePuerta : dbEqPuerta);
      const eqPuertaList = rawEqPuerta
        .map(x => String(x?.Valor ?? x?.Secuencia ?? x ?? '').trim())
        .filter(v => v && v.toUpperCase() !== 'X' && v !== '0');

      const equipajePuertaHtml = eqPuertaList.length > 0
        ? esc(eqPuertaList.join(', '))
        : (hasLiveEqArray ? '' : esc(compDb.EquipajePuertaHTML || ''));

      const emps = Array.isArray(hydrated?.empleados) ? hydrated.empleados : [];
      const maqs = Array.isArray(hydrated?.maquinaria) ? hydrated.maquinaria : [];

      const dbSupEmpId = parseInt(encDb.EmpleadoId ?? compDb.EncabezadoEmpleadoId, 10) || 0;
      const liveSupEmpId = parseInt(ciecData.supervisorEmpleadoId, 10) || 0;
      const supEmpId = preferPersisted ? (dbSupEmpId || liveSupEmpId) : (liveSupEmpId || dbSupEmpId);
      const resolvedSupPool = supEmpId > 0
        ? HtmlPreviewService.resolvePersonaNombre('', supEmpId, hydrated)
        : '';
      const supFromDb = (resolvedSupPool && !/^\d+$/.test(resolvedSupPool)) ? resolvedSupPool : '';
      const supLiveRaw = String(ciecData.supervisorNombre || '').trim();
      const supLive = !/^--\s*Seleccione/i.test(supLiveRaw) ? supLiveRaw : '';

      const dbTrEmpId = parseInt(compDb.MaquinariaEmpleadoId, 10) || 0;
      const liveTrEmpId = parseInt(ciecData.tractoristaEmpleadoId, 10) || 0;
      const trEmpId = preferPersisted ? (dbTrEmpId || liveTrEmpId) : (liveTrEmpId || dbTrEmpId);
      const trFromDb = emps.find(e => Number(e.EmpleadoId) === trEmpId)?.Nombre || '';

      const dbMaqEqId = parseInt(compDb.MaquinariaEquipoId, 10) || 0;
      const liveMaqEqId = parseInt(ciecData.maquinariaEquipoId, 10) || 0;
      const maqEqId = preferPersisted ? (dbMaqEqId || liveMaqEqId) : (liveMaqEqId || dbMaqEqId);
      const maqFromDb = maqs.find(m => Number(m.MaquinariaEquipoId) === maqEqId)?.NoUnidad || '';

      const aleroIdsFromDb = compDb.AlerosEmpleadoIds
        ? String(compDb.AlerosEmpleadoIds).split(',').map(x => parseInt(x.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
        : [];
      const alerosNombresFromDb = aleroIdsFromDb
        .map(id => emps.find(e => Number(e.EmpleadoId) === Number(id))?.Nombre || '')
        .filter(Boolean);

      const hasKey = (k) => !preferPersisted && Object.prototype.hasOwnProperty.call(ciecData, k);
      const tractoristaDelta = String(ciecData.tractoristaDelta || compDb.TractoristaDelta || ciecDb.tractoristaDelta || trFromDb || ciecData.tractoristaNombre || '').trim();
      const maquinariaDelta = String(ciecData.maquinariaDelta || compDb.MaquinariaDelta || ciecDb.maquinariaDelta || maqFromDb || ciecData.noUnidadLabel || unidad || '').trim();
      const alerosDelta = String(ciecData.alerosDelta || compDb.AlerosDelta || ciecDb.alerosDelta || '').trim();
      const tractoristaNombre = String(
        preferPersisted
          ? (trFromDb || ciecData.tractoristaNombre || '')
          : (hasKey('tractoristaNombre') ? (ciecData.tractoristaNombre || trFromDb || '') : (ciecData.tractoristaNombre || trFromDb || ''))
      ).trim();
      const noUnidadLabel = String(
        preferPersisted
          ? (maqFromDb || ciecData.noUnidadLabel || unidad || '')
          : (hasKey('noUnidadLabel') || hasKey('noUnidadNombre')
            ? (ciecData.noUnidadLabel || ciecData.noUnidadNombre || maqFromDb || '')
            : (maqFromDb || unidad || ''))
      ).trim();
      const tractoristaUnidad = (formatoId === 'dl-ciec'
        ? [tractoristaDelta, maquinariaDelta].filter(Boolean).join(' / ')
        : [tractoristaNombre, noUnidadLabel].filter(Boolean).join(' / ')
      ) || (!preferPersisted && (hasKey('tractoristaNombre') || hasKey('noUnidadLabel') || hasKey('noUnidadNombre')) ? '' : (compDb.TractoristaUnidad || ''));
      const alerosText = (formatoId === 'dl-ciec' && alerosDelta)
        ? alerosDelta
        : ((preferPersisted && alerosNombresFromDb.length > 0)
          ? alerosNombresFromDb.join(', ')
          : (Array.isArray(ciecData.alerosNombres)
            ? (ciecData.alerosNombres.length > 0
              ? ciecData.alerosNombres.filter(Boolean).join(', ')
              : (preferPersisted ? alerosNombresFromDb.join(', ') : ''))
            : (alerosNombresFromDb.join(', ') || ciecData.alerosText || compDb.Aleros || '')));

      const pickTime = (liveVal, dbVal, fallbackVal = '', keyPresent = false) =>
        HtmlPreviewService.extractHHMM(
          preferPersisted
            ? (dbVal || liveVal || fallbackVal)
            : (keyPresent ? (liveVal || '') : (liveVal || dbVal || fallbackVal))
        );

      const obsVal = (preferPersisted && ciecDb.observacionesLimpia !== undefined)
        ? ciecDb.observacionesLimpia
        : (ciecData.observaciones !== undefined ? ciecData.observaciones : (ciecDb.observacionesLimpia ?? observaciones));

      const agenteFromDb = HtmlPreviewService.resolvePersonaNombre(encDb.CreadoPor, null, hydrated);
      const agenteResuelto = preferPersisted
        ? (agenteFromDb || ciecData.agente || agente)
        : (ciecData.agente || agenteFromDb || agente);

      const resolvePax = (key, dbVal) => {
        if (preferPersisted) return dbVal ?? ciecData[key] ?? '';
        if (hasKey(key)) return ciecData[key] !== undefined && ciecData[key] !== null ? ciecData[key] : '';
        return ciecData[key] !== undefined && ciecData[key] !== null ? ciecData[key] : (dbVal ?? '');
      };

      return {
        Fecha: String(fechaItiVuelo || encDb.Fecha || ciecData.fecha || fechaRaw).substring(0, 10),
        HoraInicio: pickTime(ciecData.horaInicio, encDb.HoraInicio || compDb.HoraInicio, '', hasKey('horaInicio')),
        Vuelo: vueloNo,
        Supervisor: (preferPersisted && supFromDb) ? supFromDb : (supLive || supFromDb || supervisor || 'SIN SUPERVISOR'),
        Agente: agenteResuelto,
        Matricula: matricula,
        FilasInOutHTML: filas.join(''),
        ArriboVuelo: pickTime(ciecData.arriboVuelo || ciecData.arriboDelVuelo, compDb.ArriboVuelo, vuelo.ata, hasKey('arriboVuelo') || hasKey('arriboDelVuelo')),
        PrimerPax: pickTime(ciecData.primerPax, compDb.PrimerPax, '', hasKey('primerPax')),
        AeronaveAsegurada: pickTime(ciecData.aeronaveAsegurada, compDb.AeronaveAsegurada, '', hasKey('aeronaveAsegurada')),
        UltimoPax: pickTime(ciecData.ultimoPax, compDb.UltimoPax, '', hasKey('ultimoPax')),
        PasarelaAcoplada: pickTime(ciecData.pasarelaAcoplada, compDb.PasarelaAcoplada, '', hasKey('pasarelaAcoplada')),
        PaxAbordos: resolvePax('paxAbordos', compDb.PaxAbordos),
        PuertaAbierta: pickTime(ciecData.puertaAbierta, compDb.PuertaAbierta, '', hasKey('puertaAbierta')),
        PuertaCerrada: pickTime(ciecData.puertaCerrada, compDb.PuertaCerrada, '', hasKey('puertaCerrada')),
        EgresoTripulacion: pickTime(ciecData.egresoTripulacion, compDb.EgresoTripulacion, '', hasKey('egresoTripulacion')),
        DesacoplePasarela: pickTime(ciecData.desacoplePasarela, compDb.DesacoplePasarela, '', hasKey('desacoplePasarela')),
        IngresoTripulacion: pickTime(ciecData.ingresoTripulacion, compDb.IngresoTripulacion, '', hasKey('ingresoTripulacion')),
        TotalEquipajePuerta: (hasLiveEqArray || eqPuertaList.length > 0)
          ? eqPuertaList.length
          : (compDb.TotalEquipaje ?? 0),
        PushBack: pickTime(ciecData.pushBack, compDb.PushBack, '', hasKey('pushBack')),
        PaxEntrandoGUA: resolvePax('paxEntrando', compDb.PaxEntrando),
        Despegue: pickTime(ciecData.despegue, compDb.Despegue, '', hasKey('despegue')),
        Observaciones: obsVal,
        EquipajePuertaHTML: equipajePuertaHtml,
        TractoristaUnidad: tractoristaUnidad,
        AlerosText: alerosText,
        Aleros: alerosText,
        FirmaOperador: agenteResuelto || compDb.FirmaOperador || ''
      };
    }

    if (formatoId.endsWith('-er')) {
      const erData = formDatos.erPayload || formDatos || {};
      const dbRows = Array.isArray(hydrated?.erState?.detalles) && hydrated.erState.detalles.length > 0
        ? hydrated.erState.detalles
        : rows;
      const liveRows = Array.isArray(erData.registros) ? erData.registros : null;
      const sourceRows = (preferPersisted && dbRows.length > 0)
        ? dbRows
        : (liveRows && liveRows.length > 0 ? liveRows : dbRows);
      const compEr = hydrated?.erState?.complemento || comp || {};
      const fechaEr = (preferPersisted && compEr.Fecha)
        ? compEr.Fecha
        : (fechaItiVuelo || erData.fecha || compEr.Fecha || fechaRaw);
      const obsEr = (preferPersisted && compEr.Observacion !== undefined)
        ? String(compEr.Observacion || '').trim()
        : (erData.observaciones !== undefined ? erData.observaciones : (compEr.Observacion || observaciones));
      const firmaEr = pickRepoSig(
        'firmaBase64',
        erData.firmaBase64 || erData.firma || formDatos.firmaBase64 || formDatos.firma
      );
      const creadorEr = compEr.CreadoPor
        || (compEr.LoginId ? HtmlPreviewService.resolvePersonaNombre('', compEr.LoginId, hydrated) : '')
        || '';
      const nombreSeguridadEr = (preferPersisted && creadorEr)
        ? creadorEr
        : (erData.agente || creadorEr || user.usuario || agente);

      const total = Math.max(15, sourceRows.length);
      const filas = [];
      for (let i = 0; i < total; i++) {
        const r = sourceRows[i] || {};
        const tieneDatos = Boolean(r.Pasajero || r.Nombre || r.Colilla || r.Secuencia);
        if (formatoId === 'dl-er') {
          const destinoDelta = r.Destino || vuelo.Destino || vuelo.destino || 'N/A';
          if (tieneDatos) {
            filas.push(`<tr class="data-row">
          <td class="col-no" style="text-align:center;">${i + 1}</td>
          <td class="col-nombre" style="text-align:left;">${esc(r.Pasajero || r.Nombre || '')}</td>
          <td class="col-colilla" style="text-align:center;">${esc(r.Colilla || '')}</td>
          <td class="col-vuelo" style="text-align:center;">${esc(r.Vuelo || vueloNo)}</td>
          <td class="col-destino" style="text-align:center;">${esc(destinoDelta)}</td>
          <td class="col-hora" style="text-align:center;">${esc(HtmlPreviewService.extractHHMM(r.HoraRevision || r.Hora))}</td>
          <td class="col-agente1" style="text-align:left;">${esc(r.AgenteAVSEC || r.Avsec || '')}</td>
          <td class="col-agente2" style="text-align:left;">${esc(r.AgenteSeguridad || r.CreadoPor || r.Seguridad || '')}</td>
        </tr>`);
          } else {
            filas.push(`<tr class="data-row">
          <td class="col-no" style="text-align:center;">${i + 1}</td>
          <td class="col-nombre">&nbsp;</td>
          <td class="col-colilla">&nbsp;</td>
          <td class="col-vuelo">&nbsp;</td>
          <td class="col-destino" style="text-align:center;">N/A</td>
          <td class="col-hora">&nbsp;</td>
          <td class="col-agente1">&nbsp;</td>
          <td class="col-agente2">&nbsp;</td>
        </tr>`);
          }
        } else {
          const destinoVal = r.Destino || (tieneDatos ? (vuelo.Destino || vuelo.destino || 'N/A') : '');
          filas.push(`<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td style="text-align:left;">${esc(r.Pasajero || r.Nombre || '')}</td>
          <td style="text-align:center;">${esc(r.Secuencia ?? '')}</td>
          <td style="text-align:center;">${esc(r.Colilla || '')}</td>
          <td style="text-align:center;">${esc(r.Vuelo || (tieneDatos ? vueloNo : ''))}</td>
          <td style="text-align:center;">${esc(destinoVal)}</td>
          <td style="text-align:center;">${esc(HtmlPreviewService.extractHHMM(r.HoraRevision || r.Hora))}</td>
          <td style="text-align:left;">${esc(r.AgenteAVSEC || r.Avsec || '')}</td>
          <td style="text-align:left;">${esc(r.AgenteSeguridad || r.CreadoPor || r.Seguridad || '')}</td>
        </tr>`);
        }
      }

      return {
        Fecha: String(fechaEr instanceof Date ? fechaEr.toISOString() : fechaEr).substring(0, 10),
        FilasEquipajeHTML: filas.join(''),
        Observaciones: obsEr,
        FirmaFinal: firmaEr,
        FirmaSeguridadAerolinea: firmaEr,
        NombreFirmaSeguridad: nombreSeguridadEr,
        TotalEquipajes: sourceRows.length
      };
    }

    if (formatoId.endsWith('-eb')) {
      const ebData = formDatos.ebPayload || formDatos || {};
      const ebCompDb = hydrated?.ebState?.complemento || comp || {};
      const ebRowsDb = Array.isArray(hydrated?.ebState?.detalles) && hydrated.ebState.detalles.length > 0
        ? hydrated.ebState.detalles
        : rows;
      const liveRows = Array.isArray(ebData.registros)
        ? ebData.registros
        : (Array.isArray(ebData.detalles) && ebData.detalles.length > 0 ? ebData.detalles : null);
      const sourceRows = liveRows ? liveRows : ebRowsDb.map((r, idx) => ({
        Orden: idx + 1,
        Secuencia: r.Secuencia,
        Valor: r.Valor || String(r.Secuencia || ''),
        Motivo: r.Motivo || ''
      }));

      const totalFilas = Math.max(15, Math.ceil(sourceRows.length / 10));
      let thCols = `<th style='width: 35px;'></th>`;
      for (let c = 1; c <= 10; c++) {
        thCols += `<th style='color: #000000; font-size: 12px; font-weight: bold; padding-bottom: 5px;'>${c}</th>`;
      }
      let bodyRows = '';
      for (let fila = 1; fila <= totalFilas; fila++) {
        bodyRows += `<tr><td style='color: #000000; font-size: 12px; font-weight: bold; text-align: center; width: 35px; padding-right: 5px;'>${fila}</td>`;
        for (let col = 1; col <= 10; col++) {
          const idx = (fila - 1) * 10 + col - 1;
          const reg = sourceRows[idx];
          const secStr = reg && reg.Secuencia !== undefined && reg.Secuencia !== null ? esc(reg.Secuencia) : '';
          const isAnulado = reg && String(reg.Valor || '').toUpperCase() === 'X';
          const tacheHtml = isAnulado
            ? `<div style='position: absolute; top: -2px; left: 0; width: 100%; height: 100%; color: red; font-size: 26px; font-weight: bold;'>✗</div>`
            : '';
          bodyRows += `<td style='border: 1px solid black; text-align: center; height: 30px; width: 45px; color: #000000; font-size: 16px; font-weight: bold; position: relative;'>${secStr}${tacheHtml}</td>`;
        }
        bodyRows += `</tr>`;
      }
      const matrizHTML = `<table style='width: 100%; border-collapse: collapse; font-family: Segoe UI, sans-serif;'><thead><tr>${thCols}</tr></thead><tbody>${bodyRows}</tbody></table>`;

      const activosCount = sourceRows.filter(r => r && String(r.Valor || '').toUpperCase() !== 'X' && Number(r.Secuencia) > 0).length;
      const anulados = sourceRows.filter(r => r && String(r.Valor || '').toUpperCase() === 'X' && r.Motivo);
      const baseObs = ebData.observaciones !== undefined
        ? String(ebData.observaciones || '').trim()
        : String(ebCompDb.Observaciones ?? ebCompDb.Observacion ?? observaciones ?? '').trim();
      const obsConMotivos = anulados.length > 0 && !baseObs.includes('Motivos de anulación:')
        ? `${baseObs ? `${baseObs} | ` : ''}Motivos de anulación: ${anulados.map(a => `Sec. ${a.Secuencia}: ${a.Motivo}`).join(', ')}`
        : baseObs;

      const supList = Array.isArray(hydrated?.supervisores) ? hydrated.supervisores : [];
      const supLoginId = parseInt(ebData.supervisorLoginId ?? ebCompDb.LoginId, 10) || 0;
      const supFromList = supLoginId > 0
        ? (supList.find(s => Number(s.LoginId) === supLoginId)?.Usuario || '')
        : '';

      return {
        Fecha: String(fechaItiVuelo || ebData.fecha || ebCompDb.Fecha || fechaRaw).substring(0, 10),
        Supervisor: String(ebData.supervisorNombre || supFromList || supervisor || '').trim(),
        Vuelo: vueloNo,
        Operador: String(ebData.nombreOperador || ebCompDb.NombreOperador || user.usuario || agente || '').trim(),
        HoraInicio: HtmlPreviewService.extractHHMM(ebData.horaInicio || ebCompDb.Hora),
        MatrizHTML: matrizHTML,
        Correos: ebData.correos ?? ebCompDb.CorreosCantidad ?? 0,
        EqTransito: ebData.eqTransito ?? ebCompDb.EqTransitoCantidad ?? 0,
        HoraCierre: HtmlPreviewService.extractHHMM(ebData.horaCierre || ebData.horaFin || ebCompDb.HoraCierre),
        Comat: ebData.comat ?? ebCompDb.ComatCantidad ?? 0,
        TotalEquipajes: activosCount,
        Observaciones: obsConMotivos
      };
    }

    if (formatoId.endsWith('-cec')) {
      const cecData = formDatos.cecPayload || formDatos || {};
      const cecDbComp = hydrated?.cecState?.complemento || comp || {};
      const cecDbRows = Array.isArray(hydrated?.cecState?.detalles) && hydrated.cecState.detalles.length > 0
        ? hydrated.cecState.detalles
        : rows.map((r, idx) => ({
            Orden: idx + 1,
            Secuencia: r.Secuencia,
            Valor: String(r.Secuencia || ''),
            Motivo: ''
          }));
      const liveSecs = Array.isArray(cecData.secuencias)
        ? cecData.secuencias
        : (Array.isArray(cecData.detalles) ? cecData.detalles : null);
      const hasMarkedX = Array.isArray(liveSecs) && liveSecs.some(
        s => s && (String(s.Valor || '').toUpperCase() === 'X' || Number(s.Secuencia) === 0 || s.EstaEliminado)
      );
      const sourceSecs = (preferPersisted && cecDbRows.length > 0 && !hasMarkedX)
        ? cecDbRows
        : (liveSecs !== null ? liveSecs : cecDbRows);

      const totalFilas = Math.max(10, Math.ceil(sourceSecs.length / 10));
      const activosEmbarque = sourceSecs.filter(
        s => s && String(s.Valor || '').toUpperCase() !== 'X' && Number(s.Secuencia) > 0 && !s.EstaEliminado
      ).length;

      let embarqueRowsHtml = '';
      for (let fila = 1; fila <= totalFilas; fila++) {
        embarqueRowsHtml += '<tr>';
        for (let col = 1; col <= 10; col++) {
          const idx = (fila - 1) * 10 + col - 1;
          const reg = sourceSecs[idx];
          let cellContent = '';
          if (reg) {
            const isTachado = String(reg.Valor || '').toUpperCase() === 'X' || Number(reg.Secuencia) === 0 || reg.EstaEliminado;
            if (isTachado) {
              const secPrefix = Number(reg.Secuencia) > 0 ? esc(reg.Secuencia) : '';
              cellContent = `${secPrefix}<div style='position: absolute; top: 0; left: 0; width: 100%; height: 100%; line-height: 20px; color: red; font-size: 20px; font-weight: bold;'>✗</div>`;
            } else {
              cellContent = esc(reg.Secuencia);
            }
          }
          embarqueRowsHtml += `<td style='border: 1px solid black; text-align: center; height: 20px; width: 8.5%; font-size: 14px; font-weight: bold; position: relative;'>${cellContent}</td>`;
        }
        if (fila < totalFilas - 1) {
          embarqueRowsHtml += `<td style='border: none; width: 15%;'></td>`;
        } else if (fila === totalFilas - 1) {
          embarqueRowsHtml += `<td style='border: 1px solid black; text-align: center; font-weight: bold; font-size: 11px; background-color: #e2e8f0; width: 15%;'>TOTAL</td>`;
        } else {
          embarqueRowsHtml += `<td style='border: 1px solid black; text-align: center; font-weight: bold; font-size: 12px; width: 15%;'>${activosEmbarque}</td>`;
        }
        embarqueRowsHtml += '</tr>';
      }
      const tablaEmbarqueHTML = `<table style='width: 100%; border-collapse: collapse;'><tbody>${embarqueRowsHtml}</tbody></table>`;

      const eqRecp = Number(cecData.equipaje !== undefined && cecData.equipaje !== null ? cecData.equipaje : (cecDbComp.Equipaje ?? 0)) || 0;
      const carrRecp = Number(cecData.carruajes !== undefined && cecData.carruajes !== null ? cecData.carruajes : (cecDbComp.Carruajes ?? 0)) || 0;
      const corrRecp = Number(cecData.correos !== undefined && cecData.correos !== null ? cecData.correos : (cecDbComp.Correos ?? 0)) || 0;
      const cargRecp = Number(cecData.carga !== undefined && cecData.carga !== null ? cecData.carga : (cecDbComp.Carga ?? 0)) || 0;
      const totalDesembarque = eqRecp + carrRecp + corrRecp + cargRecp;
      const sinEtiqueta = Number(cecData.cantidadSinEtiqueta !== undefined && cecData.cantidadSinEtiqueta !== null ? cecData.cantidadSinEtiqueta : (cecDbComp.CantidadSinEtiqueta ?? 0)) || 0;
      const conEtiqueta = Number(cecData.cantidadConEtiqueta !== undefined && cecData.cantidadConEtiqueta !== null ? cecData.cantidadConEtiqueta : (cecDbComp.CantidadConEtiqueta ?? 0)) || 0;

      const tablaDesembarqueHTML = `<table style='width: 100%; border-collapse: collapse; font-family: Segoe UI, sans-serif; font-size: 12px;'>
        <tbody>
          <tr>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: left; width: 75%;'>Equipajes</td>
            <td style='padding: 5px; border: 1px solid black; text-align: center; width: 25%;'>${eqRecp}</td>
          </tr>
          <tr>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: left;'>Carruajes</td>
            <td style='padding: 5px; border: 1px solid black; text-align: center;'>${carrRecp}</td>
          </tr>
          <tr>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: left;'>Correos</td>
            <td style='padding: 5px; border: 1px solid black; text-align: center;'>${corrRecp}</td>
          </tr>
          <tr>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: left;'>Carga</td>
            <td style='padding: 5px; border: 1px solid black; text-align: center;'>${cargRecp}</td>
          </tr>
          <tr>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: left; background-color: #e2e8f0;'>TOTAL EQUIPAJES</td>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: center; background-color: #e2e8f0;'>${totalDesembarque}</td>
          </tr>
          <tr>
            <td colspan='2' style='padding: 5px; font-weight: bold; font-style: italic; text-align: left; border: 1px solid black;'>
              EQUIPAJES DAÑADOS LLEGANDO: ${sinEtiqueta + conEtiqueta}
            </td>
          </tr>
          <tr>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: left;'>Sin Etiqueta y sin Firma</td>
            <td style='padding: 5px; border: 1px solid black; text-align: center; font-weight: bold; font-size: 14px;'>${sinEtiqueta}</td>
          </tr>
          <tr>
            <td style='padding: 5px; font-weight: bold; border: 1px solid black; text-align: left;'>Con Etiqueta y Firma</td>
            <td style='padding: 5px; border: 1px solid black; text-align: center; font-weight: bold; font-size: 14px;'>${conEtiqueta}</td>
          </tr>
        </tbody>
      </table>`;

      const oirsaRaw = String(cecData.nombreOirsa ?? cecDbComp.NombreOirsa ?? '').trim();
      const oirsaTiaRaw = String(cecData.tiaOirsa ?? cecDbComp.TIAOirsa ?? '').trim();
      const combPartsRaw = String(cecDbComp.NombreCombustible || '').split(/[,/]/).map(s => s.trim());
      const combTiaRaw = String(cecDbComp.TIACombustible || '').split(/[,/]/).map(s => s.trim());
      const pilCombRaw = String(cecData.pilotoCombustible ?? combPartsRaw[0] ?? '').trim();
      const ayCombRaw = String(cecData.ayudanteCombustible ?? combPartsRaw[1] ?? '').trim();
      const tPilCombRaw = String(cecData.tiaPilotoCombustible ?? combTiaRaw[0] ?? '').trim();
      const tAyCombRaw = String(cecData.tiaAyudanteCombustible ?? combTiaRaw[1] ?? '').trim();
      const combUniRaw = String(cecData.noUnidadCombustible ?? cecDbComp.NoUnidadCombustible ?? '').trim();
      const combInRaw = HtmlPreviewService.extractHHMM(cecData.combustibleEntrada ?? cecDbComp.CombustibleEntrada);
      const combOutRaw = HtmlPreviewService.extractHHMM(cecData.combustibleSalida ?? cecDbComp.CombustibleSalida);

      const cocPartsRaw = String(cecDbComp.NombreCocinas || '').split(/[,/]/).map(s => s.trim());
      const cocTiaRaw = String(cecDbComp.TIACocinas || '').split(/[,/]/).map(s => s.trim());
      const pilCocRaw = String(cecData.pilotoCocinas ?? cocPartsRaw[0] ?? '').trim();
      const ayCocRaw = String(cecData.ayudanteCocinas ?? cocPartsRaw[1] ?? '').trim();
      const tPilCocRaw = String(cecData.tiaPilotoCocinas ?? cocTiaRaw[0] ?? '').trim();
      const tAyCocRaw = String(cecData.tiaAyudanteCocinas ?? cocTiaRaw[1] ?? '').trim();
      const cocUniRaw = String(cecData.noUnidadCocinas ?? cecDbComp.NoUnidadCocinas ?? '').trim();
      const cocInRaw = HtmlPreviewService.extractHHMM(cecData.cocinasEntrada ?? cecDbComp.CocinasEntrada);
      const cocOutRaw = HtmlPreviewService.extractHHMM(cecData.cocinasSalida ?? cecDbComp.CocinasSalida);

      const opRampaRaw = Array.isArray(cecData.operadoresRampa)
        ? cecData.operadoresRampa.map(x => String(x || '').trim()).filter(Boolean).join(' / ')
        : String(cecData.operadoresRampa ?? cecDbComp.OperadoresRampa ?? '').trim();

      const oirsaNom = esc(oirsaRaw);
      const oirsaTia = esc(oirsaTiaRaw);
      const pilotoComb = esc(pilCombRaw);
      const ayudComb = esc(ayCombRaw);
      const tiaPilComb = esc(tPilCombRaw);
      const tiaAyudComb = esc(tAyCombRaw);
      const combUni = esc(combUniRaw);
      const combIn = esc(combInRaw);
      const combOut = esc(combOutRaw);
      const pilotoCoc = esc(pilCocRaw);
      const ayudCoc = esc(ayCocRaw);
      const tiaPilCoc = esc(tPilCocRaw);
      const tiaAyudCoc = esc(tAyCocRaw);
      const cocUni = esc(cocUniRaw);
      const cocIn = esc(cocInRaw);
      const cocOut = esc(cocOutRaw);
      const opRampa = esc(opRampaRaw);

      const tablaPersonalHTML = `<div style='font-family: Segoe UI, sans-serif; font-size: 14px; font-weight: bold; margin-bottom: 3px; text-transform: uppercase;'>
        PERSONAL EN PLATAFORMA:
      </div>
      <table style='width: 100%; border-collapse: collapse; font-family: Segoe UI, sans-serif; font-size: 12px; border: 1px solid black;'>
        <tbody>
          <tr>
            <td colspan='4' style='padding: 4px 6px; border: 1px solid black; text-align: left;'>
              <b>OIRSA:</b> ${oirsaNom} (TIA: ${oirsaTia})
            </td>
          </tr>
          <tr>
            <td colspan='4' style='padding: 4px 6px; border: 1px solid black; text-align: left;'>
              <b>COMBUSTIBLE: PILOTO Y AYUDANTE:</b> ${pilotoComb} (TIA: ${tiaPilComb}) / ${ayudComb} (TIA: ${tiaAyudComb})
            </td>
          </tr>
          <tr>
            <td style='padding: 4px 6px; border: 1px solid black; text-align: left; width: 25%;'><b>UNIDAD:</b> ${combUni}</td>
            <td style='padding: 4px 6px; border: 1px solid black; text-align: left; width: 35%;'><b>LLEGA:</b> ${combIn}</td>
            <td colspan='2' style='padding: 4px 6px; border: 1px solid black; text-align: left; width: 40%;'><b>SALE:</b> ${combOut}</td>
          </tr>
          <tr>
            <td colspan='4' style='padding: 4px 6px; border: 1px solid black; text-align: left;'><b>COCINAS (PILOTO) (AYUDANTE):</b></td>
          </tr>
          <tr>
            <td colspan='2' style='padding: 4px 6px; border: 1px solid black; text-align: left;'>
              ${pilotoCoc} (TIA: ${tiaPilCoc}) / ${ayudCoc} (TIA: ${tiaAyudCoc})
            </td>
            <td style='padding: 4px 6px; border: 1px solid black; text-align: left;'><b>UNIDAD:</b> ${cocUni}</td>
            <td style='padding: 4px 6px; border: 1px solid black; text-align: left;'><b>LLEGA/SALE:</b> ${cocIn} / ${cocOut}</td>
          </tr>
          <tr>
            <td colspan='4' style='padding: 4px 6px; border: 1px solid black; text-align: left;'>
              <b>OPERADORES RAMPA:</b> ${opRampa}
            </td>
          </tr>
          <tr><td colspan='4' style='padding: 10px; border: 1px solid black;'></td></tr>
          <tr><td colspan='4' style='padding: 10px; border: 1px solid black;'></td></tr>
          <tr><td colspan='4' style='padding: 10px; border: 1px solid black;'></td></tr>
        </tbody>
      </table>`;

      let tablaEmbarqueOut = tablaEmbarqueHTML;
      let tablaDesembarqueOut = tablaDesembarqueHTML;
      if (formatoId === 'dl-cec') {
        const embDelta = hydrated?.cecState?.embarqueDelta || {};
        const cargaDelta = Number(
          preferPersisted
            ? (embDelta.Carga ?? cecDbComp.CargaEmbarqueDelta ?? cecData.cargaEmbarqueDelta ?? 0)
            : (cecData.cargaEmbarqueDelta !== undefined && cecData.cargaEmbarqueDelta !== null
                ? cecData.cargaEmbarqueDelta
                : (embDelta.Carga ?? cecDbComp.CargaEmbarqueDelta ?? 0))
        ) || 0;
        const eqMostrador = Number(
          preferPersisted
            ? (embDelta.EquipajeMostrador ?? cecDbComp.EquipajeMostrador ?? cecData.equipajeMostrador ?? 0)
            : (cecData.equipajeMostrador !== undefined && cecData.equipajeMostrador !== null
                ? cecData.equipajeMostrador
                : (embDelta.EquipajeMostrador ?? cecDbComp.EquipajeMostrador ?? 0))
        ) || 0;
        const eqPuertaDelta = Number(
          preferPersisted
            ? (embDelta.EquipajePuerta ?? cecDbComp.EquipajePuerta ?? cecData.equipajePuerta ?? 0)
            : (cecData.equipajePuerta !== undefined && cecData.equipajePuerta !== null
                ? cecData.equipajePuerta
                : (embDelta.EquipajePuerta ?? cecDbComp.EquipajePuerta ?? 0))
        ) || 0;
        const totalEqEmbarque = eqMostrador + eqPuertaDelta;
        const blankCells = (count) => Array.from({ length: count }, () => `<td style='border: 1px solid black; height: 18px; width: 7%;'></td>`).join('');

        tablaEmbarqueOut = `<table style='width: 100%; border-collapse: collapse; font-family: Segoe UI, Arial, sans-serif; font-size: 10px;'><tbody>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left; width: 32%;'>EQUIPAJE MOSTRADOR</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold; width: 8%;'>${eqMostrador}</td>${blankCells(7)}<td style='border: none; width: 11%;'></td></tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>EQUIPAJE POR PUERTA</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${eqPuertaDelta}</td>${blankCells(7)}<td style='border: none;'></td></tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>CARGA:</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${cargaDelta}</td>${blankCells(7)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; background-color: #f8fafc;'>TOTAL EQ.: ${totalEqEmbarque}</td></tr>` +
          `<tr>${blankCells(12)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; background-color: #f8fafc;'>TOTAL CARGA: ${cargaDelta}</td></tr>` +
          `</tbody></table>`;

        const totalEqDesembarqueDelta = eqRecp + carrRecp;
        tablaDesembarqueOut = `<table style='width: 100%; border-collapse: collapse; font-family: Segoe UI, Arial, sans-serif; font-size: 10px;'><tbody>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left; width: 32%;'>EQUIPAJES</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold; width: 8%;'>${eqRecp}</td>${blankCells(7)}</tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>CARRUAJES</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${carrRecp}</td>${blankCells(7)}</tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>CARGA</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${cargRecp}</td>${blankCells(6)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; width: 11%; background-color: #f8fafc;'>TOTAL EQ.: ${totalEqDesembarqueDelta}</td></tr>` +
          `<tr>${blankCells(11)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; width: 11%; background-color: #f8fafc;'>TOTAL CARGA: ${cargRecp}</td></tr>` +
          `<tr>${blankCells(12)}</tr>` +
          `<tr>${blankCells(12)}</tr>` +
          `</tbody></table>`;
      }

      const vueloParts = String(vueloNo || '').split('/').map(s => s.trim()).filter(Boolean);
      const vueloDes = cecData.vueloDesembarque || cecDbComp.VueloDesembarque || vueloParts[0] || vueloNo;
      const vueloEmb = cecData.vueloEmbarque || cecDbComp.VueloEmbarque || vueloParts[vueloParts.length - 1] || vueloNo;

      const supervisorResolved = HtmlPreviewService.resolvePersonaNombre(
        preferPersisted
          ? (cecDbComp.Supervisor ?? cecData.supervisorNombre ?? cecData.supervisor)
          : (cecData.supervisorNombre ?? cecData.supervisor ?? cecDbComp.Supervisor),
        cecData.supervisorLoginId,
        hydrated
      ) || supervisor;

      const agenteResolved = HtmlPreviewService.resolvePersonaNombre(
        preferPersisted
          ? (cecDbComp.Agente ?? cecData.agenteNombre ?? cecData.agente)
          : (cecData.agenteNombre ?? cecData.agente ?? cecDbComp.Agente),
        cecData.agenteLoginId,
        hydrated
      ) || agente;

      const compNoResolved = cecData.compartimientoNo ?? cecData.compartimiento ?? cecDbComp.CompartimientoNo ?? '';
      const obsCecRaw = preferPersisted
        ? (cecDbComp.Observaciones ?? cecDbComp.Observacion ?? cecData.observaciones ?? observaciones)
        : (cecData.observaciones !== undefined ? cecData.observaciones : (cecDbComp.Observaciones ?? cecDbComp.Observacion ?? observaciones));
      const obsCec = String(obsCecRaw || '').trim() || 'N/A';

      return {
        HoraIniciaPuesto: HtmlPreviewService.extractHHMM(cecData.horaInicio || cecDbComp.HoraInicio),
        Supervisor: supervisorResolved,
        Fecha: (formatoId === 'ajt-cec')
          ? HtmlPreviewService.formatDDMMYYYY(fechaItiVuelo || cecData.fecha || cecDbComp.Fecha || fechaRaw)
          : HtmlPreviewService.formatMMDDYYYY(fechaItiVuelo || cecData.fecha || cecDbComp.Fecha || fechaRaw),
        Agente: agenteResolved,
        Vuelo: vueloNo,
        Matricula: matricula,
        CompartimentoNo: compNoResolved === '' ? '' : String(compNoResolved),
        PuertaNo: puerta,
        CompAbierto: HtmlPreviewService.extractHHMM(cecData.compAbierto ?? cecDbComp.CompAbierto),
        CompCerrado: HtmlPreviewService.extractHHMM(cecData.compCerrado ?? cecDbComp.CompCerrado),
        VueloEmbarque: vueloEmb,
        TablaEmbarqueHTML: tablaEmbarqueOut,
        VueloDesembarque: vueloDes,
        TablaDesembarqueHTML: tablaDesembarqueOut,
        TablaPersonalHTML: tablaPersonalHTML,
        Oirsa: [oirsaRaw, oirsaTiaRaw ? `(TIA: ${oirsaTiaRaw})` : ''].filter(Boolean).join(' '),
        Combustible: `${pilCombRaw}${tPilCombRaw ? ` (TIA: ${tPilCombRaw})` : ''}${ayCombRaw ? ` / ${ayCombRaw}${tAyCombRaw ? ` (TIA: ${tAyCombRaw})` : ''}` : ''}`,
        CombustibleUnidad: combUniRaw,
        CombustibleLlegaSale: [combInRaw, combOutRaw].filter(Boolean).join(' / '),
        Cocinas: `${pilCocRaw}${tPilCocRaw ? ` (TIA: ${tPilCocRaw})` : ''}${ayCocRaw ? ` / ${ayCocRaw}${tAyCocRaw ? ` (TIA: ${tAyCocRaw})` : ''}` : ''}`,
        CocinasUnidad: cocUniRaw,
        CocinasLlegaSale: [cocInRaw, cocOutRaw].filter(Boolean).join(' / '),
        OpRampa: opRampaRaw,
        DesembarqueInicio: HtmlPreviewService.extractHHMM(cecData.desembarqueInicio || cecDbComp.DesembarqueHoraInicio),
        DesembarqueFin: HtmlPreviewService.extractHHMM(cecData.desembarqueFinal || cecDbComp.DesembarqueHoraFinal),
        EmbarqueInicio: HtmlPreviewService.extractHHMM(cecData.embarqueInicio || cecDbComp.EmbarqueHoraInicio),
        EmbarqueFin: HtmlPreviewService.extractHHMM(cecData.embarqueFinal || cecDbComp.EmbarqueHoraFinal),
        Observaciones: obsCec
      };
    }

    if (formatoId === 'amx-mecd') {
      const mecdData = formDatos.mecdPayload || formDatos || {};
      const mecdDb = hydrated?.mecdState || {};
      const encMecd = mecdDb.encabezado || mecdDb.complemento || {};
      const cleanLiveOrDb = (liveArr, dbArr) => {
        const chosen = (preferPersisted && Array.isArray(dbArr) && dbArr.length > 0)
          ? dbArr
          : (Array.isArray(liveArr) ? liveArr : (dbArr || []));
        return chosen.filter(Boolean);
      };

      const revList = cleanLiveOrDb(
        Array.isArray(mecdData.revisiones) ? mecdData.revisiones : mecdData.revision,
        mecdDb.revisiones || mecdDb.revision
      );
      const cfList = cleanLiveOrDb(mecdData.conFirma, mecdDb.conFirma);
      const sfList = cleanLiveOrDb(mecdData.sinFirma, mecdDb.sinFirma);

      const totalPairsRev = Math.max(9, Math.ceil(revList.length / 2));
      let tablaRevisionHtml = '';
      for (let i = 0; i < totalPairsRev; i++) {
        const left = revList[i * 2] || {};
        const right = revList[i * 2 + 1] || {};
        tablaRevisionHtml += `<tr>
          <td>${esc(left.Control || '')}</td>
          <td>${esc(left.Colilla || '')}</td>
          <td>${esc(right.Control || '')}</td>
          <td>${esc(right.Colilla || '')}</td>
        </tr>`;
      }

      const buildDamageRows = (list, minRows) => {
        const count = Math.max(minRows, list.length);
        let htmlRows = '';
        for (let i = 0; i < count; i++) {
          const item = list[i] || {};
          htmlRows += `<tr>
            <td>${esc(item.Pasajero || item.NombrePasajero || '')}</td>
            <td>${esc(item.Colilla || '')}</td>
            <td>${esc(item.Control || '')}</td>
            <td>${esc(item.Destino || '')}</td>
          </tr>`;
        }
        return htmlRows;
      };

      const ccoDbNombre = mecdDb.ccoNombre
        || (encMecd.EmpleadoId ? HtmlPreviewService.resolvePersonaNombre('', encMecd.EmpleadoId, hydrated) : '');
      const agDbNombre = mecdDb.agenteNombre
        || (encMecd.AgenteId ? HtmlPreviewService.resolvePersonaNombre('', encMecd.AgenteId, hydrated) : '')
        || encMecd.CreadoPor
        || '';
      const supDbNombre = mecdDb.supervisorNombre
        || (encMecd.SupervisorId ? HtmlPreviewService.resolvePersonaNombre('', encMecd.SupervisorId, hydrated) : '');

      const ccoNom = (preferPersisted && ccoDbNombre)
        ? ccoDbNombre
        : (mecdData.ccoNombre || ccoDbNombre || '');
      const agNom = (preferPersisted && agDbNombre)
        ? agDbNombre
        : (mecdData.agenteNombre || agDbNombre || agente);
      const supNom = (preferPersisted && supDbNombre)
        ? supDbNombre
        : (mecdData.supervisorNombre || supDbNombre || supervisor);

      const fechaMecdRaw = fechaItiVuelo || mecdData.fecha || fechaRaw;

      return {
        Fecha: String(fechaMecdRaw instanceof Date ? fechaMecdRaw.toISOString() : fechaMecdRaw).trim().substring(0, 10),
        NoVuelo: vueloNo,
        TablaRevision: tablaRevisionHtml,
        TablaConFirma: buildDamageRows(cfList, 12),
        TablaSinFirma: buildDamageRows(sfList, 5),
        FirmaAgente: pickRepoSig('firmaAgente', mecdData.firmaAgente),
        NombreAgente: agNom,
        FirmaCCO: pickRepoSig('firmaCCO', mecdData.firmaCCO),
        NombreCCO: ccoNom,
        FirmaSupervisor: pickRepoSig('firmaSupervisor', mecdData.firmaSupervisor),
        NombreSupervisor: supNom
      };
    }

    if (formatoId === 'amx-po') {
      const poData = formDatos.poPayload || formDatos || {};
      const poDb = hydrated?.poState || {};
      const compDb = poDb.complemento || comp || {};
      const dbRows = Array.isArray(poDb.detalles) && poDb.detalles.length > 0 ? poDb.detalles : rows;
      const liveRows = Array.isArray(poData.registros)
        ? poData.registros
        : (Array.isArray(poData.detalles) ? poData.detalles : null);
      const sourceRows = (preferPersisted && dbRows.length > 0) ? dbRows : (liveRows || dbRows);
      const total = Math.max(13, sourceRows.length);
      let filasHtml = '';
      for (let i = 0; i < total; i++) {
        const r = sourceRows[i] || {};
        const pos = String(r.PosicionesPOId ?? r.PosicionPOId ?? r.PosicionId ?? r.Puesto ?? '').trim();
        let posCells = '';
        for (let p = 1; p <= 11; p++) {
          posCells += `<td style="border: 1px solid black; padding: 4px; text-align: center; font-weight: bold;">${pos === String(p) ? 'X' : ''}</td>`;
        }
        filasHtml += `<tr>
          <td style="border: 1px solid black; padding: 4px; text-align: center; font-weight: bold;">${i + 1}</td>
          <td style="border: 1px solid black; padding: 4px; text-align: left;">${esc(r.Agentes || r.Usuario || r.Nombre || '')}</td>
          ${posCells}
        </tr>`;
      }

      const supLoginId = parseInt(compDb.SupervisorLoginSECId ?? compDb.LoginId ?? poData.supervisorLoginId ?? poData.supervisorLoginSecId, 10) || 0;
      const supResuelto = supLoginId > 0
        ? HtmlPreviewService.resolvePersonaNombre('', supLoginId, hydrated)
        : (poDb.supervisorNombre || '');
      const supFromDb = (supResuelto && !/^\d+$/.test(supResuelto)) ? supResuelto : (poDb.supervisorNombre || '');
      const supLiveRaw = String(poData.supervisorNombre || '').trim();
      const supLive = !/^--\s*Seleccione/i.test(supLiveRaw) ? supLiveRaw : '';
      const nombreSupervisor = (preferPersisted && supFromDb)
        ? supFromDb
        : (supLive || supFromDb || supervisor || '');

      const leadAgent = (preferPersisted && compDb.CreadoPor)
        ? compDb.CreadoPor
        : (poData.leadAgent || compDb.CreadoPor || user.usuario || agente);

      const obsPo = (preferPersisted && compDb.Observaciones !== undefined)
        ? String(compDb.Observaciones || '').trim()
        : (poData.observaciones !== undefined ? poData.observaciones : (compDb.Observaciones ?? observaciones));

      return {
        Fecha: String(poData.fecha || compDb.Fecha || fechaRaw).substring(0, 10),
        LeadAgent: leadAgent,
        Vuelo: vueloNo,
        FilasEquipajeHTML: filasHtml,
        Observaciones: obsPo,
        FirmaSupervisor: pickRepoSig('firmaSupervisor', poData.firmaSupervisor || poData.firmaBase64 || firmaDataUrl, poDb.firmaSupervisor || ''),
        NombreSupervisor: nombreSupervisor
      };
    }

    if (formatoId.endsWith('-cfr')) {
      const cfrData = formDatos.cfrPayload || formDatos || {};
      const liveCarretas = Array.isArray(cfrData.carretas)
        ? cfrData.carretas
        : (Array.isArray(cfrData.registros)
          ? cfrData.registros
          : (Array.isArray(cfrData.detalles) ? cfrData.detalles : null));
      const sourceCarretas = liveCarretas ? liveCarretas : rows;

      const fechaStr = String(cfrData.fecha || fechaRaw).substring(0, 10);
      let dia = '';
      let mes = '';
      let anio = '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
        [anio, mes, dia] = fechaStr.split('-');
      } else {
        const ddmmyyyy = HtmlPreviewService.formatDDMMYYYY(fechaStr);
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(ddmmyyyy)) {
          [dia, mes, anio] = ddmmyyyy.split('/');
        }
      }

      const totalRows = Math.max(5, sourceCarretas.length);
      let tablaCarretasHtml = '';
      let sumEq = 0;
      for (let i = 0; i < totalRows; i++) {
        const c = sourceCarretas[i] || {};
        const tieneFila = i < sourceCarretas.length && (c.CarretaId || c.NoCarreta || c.FlejeUno);
        const eqVal = parseInt(c.TotalEqDetalle ?? c.TotalEq, 10) || 0;
        if (tieneFila) sumEq += eqVal;
        const flejes = tieneFila
          ? [c.FlejeUno, c.FlejeDos].map(f => String(f || '').trim()).filter(Boolean).join(' / ')
          : '';
        tablaCarretasHtml += `<tr>
          <td>${tieneFila ? esc(c.NoCarreta || c.CarretaId || '') : ''}</td>
          <td>${esc(flejes)}</td>
          <td>${tieneFila ? esc(c.NoUnidad || c.MaquinariaEquipoId || '') : ''}</td>
          <td>${tieneFila ? esc(eqVal) : ''}</td>
          <td>${tieneFila ? esc(c.Operador || c.EmpleadoId || '') : ''}</td>
        </tr>`;
      }

      return {
        Dia: dia,
        Mes: mes,
        Anio: anio,
        Supervisor: cfrData.supervisorNombre || supervisor || '',
        Vuelo: vueloNo,
        Destino: vuelo.Destino || vuelo.destino || '',
        Matricula: matricula,
        PrimeraHora: HtmlPreviewService.extractHHMM(cfrData.primeraPlataforma || cfrData.primeraHora || comp.PrimeraPlataforma),
        UltimaHora: HtmlPreviewService.extractHHMM(cfrData.ultimaPlataforma || cfrData.ultimaHora || comp.UltimaPlataforma),
        InicioOperacion: HtmlPreviewService.extractHHMM(cfrData.inicioOperacion || comp.InicioOperacion),
        AVIH: cfrData.aviCantidad !== undefined ? cfrData.aviCantidad : (cfrData.avih !== undefined ? cfrData.avih : (comp.AviCantidad ?? 0)),
        COMAT: cfrData.comatCantidad !== undefined ? cfrData.comatCantidad : (cfrData.comat !== undefined ? cfrData.comat : (comp.ComatCantidad ?? 0)),
        TotalEquipaje: sumEq || (comp.TotalEqEncabezado ?? 0),
        HoraCierre: HtmlPreviewService.extractHHMM(cfrData.horaCierre || comp.HoraCierre),
        TablaCarretasHTML: tablaCarretasHtml,
        AgenteAVSEC: cfrData.agente || user.usuario || agente
      };
    }

    if (formatoId === 'dl-rx') {
      const rxData = formDatos.rxPayload || formDatos || {};
      const encDb = hydrated?.rxState?.encabezado || comp || {};
      const dbSag = Array.isArray(hydrated?.rxState?.personalSAG) ? hydrated.rxState.personalSAG : [];
      const dbLaats = Array.isArray(hydrated?.rxState?.personalLaats) ? hydrated.rxState.personalLaats : [];
      const sagList = (preferPersisted && dbSag.length > 0)
        ? dbSag
        : (Array.isArray(rxData.personalSAG) ? rxData.personalSAG : dbSag);
      const laatsList = (preferPersisted && dbLaats.length > 0)
        ? dbLaats
        : (Array.isArray(rxData.personalLaats) ? rxData.personalLaats : dbLaats);

      const totalSag = Math.max(6, sagList.length);
      let sagHtml = '';
      for (let i = 0; i < totalSag; i++) {
        const s = sagList[i] || {};
        const hasSag = Boolean(s.Nombre || s.Id || s.Identificacion || s.NoTIA);
        sagHtml += hasSag
          ? `<tr><td style='border: 1px solid #333333; padding: 6px 10px; font-size: 11px; font-weight: bold;'>${esc(s.Nombre || '')}</td><td style='border: 1px solid #333333; padding: 6px; font-size: 11px; text-align: center;'>${esc(s.Id || s.Identificacion || s.NoTIA || '')}</td></tr>`
          : `<tr><td style='border: 1px solid #333333; padding: 6px 10px; height: 22px;'>&nbsp;</td><td style='border: 1px solid #333333; padding: 6px; height: 22px;'>&nbsp;</td></tr>`;
      }

      const totalLaats = Math.max(6, laatsList.length);
      let laatsHtml = '';
      for (let i = 0; i < totalLaats; i++) {
        const l = laatsList[i] || {};
        const hasLaats = Boolean(l.Nombre || l.Id || l.Identificacion || l.NoTIA);
        laatsHtml += hasLaats
          ? `<tr><td style='border: 1px solid #333333; padding: 6px 10px; font-size: 11px; font-weight: bold;'>${esc(l.Nombre || '')}</td><td style='border: 1px solid #333333; padding: 6px; font-size: 11px; text-align: center;'>${esc(l.Id || l.Identificacion || l.NoTIA || '')}</td></tr>`
          : `<tr><td style='border: 1px solid #333333; padding: 6px 10px; height: 22px;'>&nbsp;</td><td style='border: 1px solid #333333; padding: 6px; height: 22px;'>&nbsp;</td></tr>`;
      }

      const supResolvedRx = HtmlPreviewService.resolvePersonaNombre(
        preferPersisted ? (encDb.Supervisor || rxData.supervisorNombre) : (rxData.supervisorNombre || encDb.Supervisor),
        preferPersisted ? (encDb.EmpleadoId || rxData.supervisorEmpleadoId) : (rxData.supervisorEmpleadoId || encDb.EmpleadoId),
        hydrated
      ) || supervisor || '';

      const agenteResolvedRx = HtmlPreviewService.resolvePersonaNombre(
        preferPersisted ? (encDb.CreadoPor || rxData.agente) : (rxData.agente || encDb.CreadoPor),
        encDb.LoginId,
        hydrated
      ) || user.usuario || agente || '';

      const obsRx = preferPersisted
        ? (encDb.Observacion ?? encDb.Observaciones ?? rxData.observaciones ?? observaciones)
        : (rxData.observaciones !== undefined ? rxData.observaciones : (encDb.Observacion ?? encDb.Observaciones ?? observaciones));

      return {
        HoraIniciaPuesto: HtmlPreviewService.extractHHMM(preferPersisted ? (encDb.HoraInicio || rxData.horaInicio) : (rxData.horaInicio || encDb.HoraInicio)),
        Supervisor: supResolvedRx,
        Fecha: HtmlPreviewService.formatDDMMYYYY(fechaItiVuelo || rxData.fecha || encDb.Fecha || fechaRaw),
        Agente: agenteResolvedRx,
        Vuelo: vueloNo,
        PEquipajeRecibidoRX: HtmlPreviewService.extractHHMM(preferPersisted ? (encDb.PEquipajeRecibidoRX || rxData.pEquipajeRecibidoRX) : (rxData.pEquipajeRecibidoRX || encDb.PEquipajeRecibidoRX)),
        PCarretaEnviada: HtmlPreviewService.extractHHMM(preferPersisted ? (encDb.PCarretaEnviada || rxData.pCarretaEnviada) : (rxData.pCarretaEnviada || encDb.PCarretaEnviada)),
        UEquipajeRX: HtmlPreviewService.extractHHMM(preferPersisted ? (encDb.UEquipajeRX || rxData.uEquipajeRX) : (rxData.uEquipajeRX || encDb.UEquipajeRX)),
        UCarretaEnviada: HtmlPreviewService.extractHHMM(preferPersisted ? (encDb.UCarretaEnviada || rxData.uCarretaEnviada) : (rxData.uCarretaEnviada || encDb.UCarretaEnviada)),
        TablaSAG_HTML: sagHtml,
        TablaLAATS_HTML: laatsHtml,
        Observaciones: String(obsRx || '').trim() || 'N/A'
      };
    }

    if (formatoId === 'dl-cll') {
      const cllData = formDatos.cllPayload || formDatos || {};
      const compCll = hydrated?.cllState?.complemento || comp || {};
      const dbRowsCll = Array.isArray(hydrated?.cllState?.detalles) && hydrated.cllState.detalles.length > 0
        ? hydrated.cllState.detalles
        : rows;
      const liveRows = (preferPersisted && dbRowsCll.length > 0)
        ? dbRowsCll
        : (Array.isArray(cllData.registros) ? cllData.registros : dbRowsCll);
      const total = Math.max(21, liveRows.length);
      let tablaHtml = '';
      for (let i = 0; i < total; i++) {
        const r = liveRows[i] || {};
        tablaHtml += `<tr><td>${esc(r.Guia || '')}</td><td style='text-align: left; padding-left: 5px;'>${esc(r.Contenido || '')}</td><td>${r.Piezas !== undefined && r.Piezas !== null && r.Piezas !== '' ? esc(r.Piezas) : ''}</td><td>${esc(r.BIN || '')}</td></tr>`;
      }

      const securityAgent = preferPersisted
        ? (compCll.AgenteSeguridad || cllData.agenteSeguridad || user.usuario || agente || '')
        : (cllData.agenteSeguridad || compCll.AgenteSeguridad || user.usuario || agente || '');
      const rawAgenteDelta = String(
        preferPersisted
          ? (compCll.AgenteDelta || cllData.agenteDelta || '')
          : (cllData.agenteDelta || compCll.AgenteDelta || '')
      ).trim();
      const agDeltaParts = rawAgenteDelta.split(',').map(s => s.trim());
      const deltaAgentName = agDeltaParts[0] || '';
      const deltaTiaFromSplit = agDeltaParts.slice(1).join(', ').trim();
      const sharedTia = preferPersisted
        ? (compCll.AgenteTIA || cllData.agenteTIA || '')
        : (cllData.agenteTIA || compCll.AgenteTIA || '');

      return {
        Flight: vueloNo,
        Date: HtmlPreviewService.formatDDMMYYYY(fechaItiVuelo || cllData.fecha || compCll.Fecha || fechaRaw),
        Station: cllData.station || 'GUA',
        TablaHTML: tablaHtml,
        FirmaSecurity: pickRepoSig('firmaSecurity', cllData.firmaSecurity),
        SecurityAgent: securityAgent,
        TiaSecurity: cllData.tiaSecurity || sharedTia,
        FirmaLD: pickRepoSig('firmaLD', cllData.firmaLD),
        AgenteLD: deltaAgentName,
        TiaLD: (preferPersisted ? (deltaTiaFromSplit || cllData.tiaLD) : (cllData.tiaLD || deltaTiaFromSplit)) || sharedTia
      };
    }

    if (formatoId === 'dl-sp') {
      const spData = formDatos.spPayload || formDatos || {};
      const encSpDb = hydrated?.spState?.encabezado || comp || {};
      const dbRowsSp = Array.isArray(hydrated?.spState?.detalles) ? hydrated.spState.detalles : [];
      const liveRows = (preferPersisted && dbRowsSp.length > 0)
        ? dbRowsSp
        : (Array.isArray(spData.registros) ? spData.registros : dbRowsSp);
      const selNames = { 1: 'R Random', 2: 'S Selected', 3: 'I Interview' };
      const repoFirmaScreener = pickRepoSig('firmaScreener', spData.firmaScreener);

      let totalRandom = 0;
      let totalSelected = 0;
      let totalInterview = 0;
      const totalRows = Math.max(15, liveRows.length);
      let tablaPaxHtml = '';

      for (let i = 0; i < totalRows; i++) {
        const r = liveRows[i] || {};
        const hasRow = Boolean(r.Apellido || r.Nombre || r.Asiento || r.NombreAgente);
        const selId = parseInt(r.SeleccionSPId, 10) || 0;
        if (hasRow) {
          if (selId === 1) totalRandom += 1;
          else if (selId === 2) totalSelected += 1;
          else if (selId === 3) totalInterview += 1;
        }
        const selLabel = hasRow ? (selNames[selId] || r.SelectionLabel || r.SelectionCode || '') : '';
        const rowFirma = String(r.FirmaScreener || r.FirmaBase64 || repoFirmaScreener || '').trim();
        const screenerNameEsc = esc(r.NombreAgente || r.ScreenerName || '');
        let screenerCellHtml = '&nbsp;';
        if (hasRow) {
          if (rowFirma && rowFirma !== BLANK_IMG) {
            screenerCellHtml = `<div style='display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:6px; width:100%;'><div style='display:flex; flex-direction:column; align-items:center;'><span style='font-size:8px; font-weight:bold; color:#15803d; max-width:60px; white-space:nowrap; overflow:hidden;'>${screenerNameEsc}</span><img src='${rowFirma}' style='max-height:22px; max-width:50px; vertical-align:middle;' /></div></div>`;
          } else {
            screenerCellHtml = `<div style='display:flex; align-items:center; justify-content:center; gap:8px; width:100%;'><span style='font-size:9px; font-weight:bold;'>${screenerNameEsc}</span></div>`;
          }
        }
        tablaPaxHtml += `<tr><td style='text-align:center; vertical-align:middle;'>${i + 1}</td><td style='text-align:center; vertical-align:middle;'>${hasRow ? esc(r.Apellido || '') : '&nbsp;'}</td><td style='text-align:center; vertical-align:middle;'>${hasRow ? esc(r.Nombre || '') : '&nbsp;'}</td><td style='text-align:center; vertical-align:middle;'>${hasRow ? esc(selLabel) : '&nbsp;'}</td><td style='text-align:center; vertical-align:middle;'>${hasRow ? esc(r.Asiento || '') : '&nbsp;'}</td><td style='text-align:center; vertical-align:middle;'>${hasRow ? esc(r.BCN ?? '') : '&nbsp;'}</td><td style='text-align:center; vertical-align:middle; padding:2px;'>${screenerCellHtml}</td></tr>`;
      }

      const supSpResolved = HtmlPreviewService.resolvePersonaNombre(
        preferPersisted ? (encSpDb.CreadoPor || spData.supervisorNombre) : (spData.supervisorNombre || encSpDb.CreadoPor),
        preferPersisted ? (encSpDb.LoginId || spData.supervisorLoginId) : (spData.supervisorLoginId || encSpDb.LoginId),
        hydrated
      ) || supervisor || agente || '';

      return {
        Date: HtmlPreviewService.formatDDMMYYYY(fechaItiVuelo || spData.fecha || encSpDb.Fecha || fechaRaw),
        Flight: vueloNo,
        TablaPaxHTML: tablaPaxHtml,
        TotalRandom: totalRandom,
        TotalSelected: totalSelected,
        TotalInterview: totalInterview,
        TotalGeneral: totalRandom + totalSelected + totalInterview,
        NombreSupervisor: supSpResolved
      };
    }

    if (formatoId === 'dl-dal') {
      const dalData = formDatos.dalPayload || formDatos || {};
      const dalDb = hydrated?.dalState?.detalle || {};
      const evalRaw = preferPersisted
        ? (dalDb.Evaluadores || dalData.evaluadores || '')
        : (dalData.evaluadores || dalDb.Evaluadores || '');
      const evalParts = String(evalRaw).split(',').map(s => s.trim());
      const revXRay = (preferPersisted && dalDb.RevisadoXRay !== undefined)
        ? dalDb.RevisadoXRay
        : (dalData.revisadoXRay !== undefined ? dalData.revisadoXRay : dalDb.RevisadoXRay);
      const bolsasIng = (preferPersisted && dalDb.BolsasIngresadas !== undefined)
        ? dalDb.BolsasIngresadas
        : (dalData.bolsasIngresadas !== undefined ? dalData.bolsasIngresadas : dalDb.BolsasIngresadas);
      const eqCoincide = (preferPersisted && dalDb.EqCoincidePasajero !== undefined)
        ? dalDb.EqCoincidePasajero
        : (dalData.eqCoincidePasajero !== undefined ? dalData.eqCoincidePasajero : dalDb.EqCoincidePasajero);
      const isTrue = (v) => v === true || v === 1 || String(v).toUpperCase() === 'YES' || String(v).toLowerCase() === 'true';

      const pickDal = (liveVal, dbVal, fallback = '') => {
        if (preferPersisted) return dbVal !== undefined && dbVal !== null && dbVal !== '' ? dbVal : (liveVal ?? fallback);
        return liveVal !== undefined && liveVal !== null && liveVal !== '' ? liveVal : (dbVal ?? fallback);
      };

      const guard1 = pickDal(dalData.nombreGuardia, dalDb.NombreGuardia, '');
      const guard2 = pickDal(dalData.nombreGuardia2, dalDb.NombreGuardia2, '');
      const guard3 = pickDal(dalData.nombreGuardia3, dalDb.NombreGuardia3, '');
      const agentesGate = pickDal(dalData.nombreAgentes, dalDb.NombreAgentes, '');
      const guardEscolta = pickDal(dalData.nombreGuardiaEscolta, dalDb.NombreGuardiaEscolta, '');
      const supDalResolved = HtmlPreviewService.resolvePersonaNombre(
        preferPersisted ? (dalDb.CreadoPor || dalData.supervisorNombre) : (dalData.supervisorNombre || dalDb.CreadoPor),
        preferPersisted ? (dalDb.LoginId || dalData.supervisorLoginId) : (dalData.supervisorLoginId || dalDb.LoginId),
        hydrated
      ) || supervisor || agente || '';
      const missingVal = String(pickDal(dalData.pasajerosPerdieronVuelo, dalDb.PasajerosPerdieronVuelo, '0')).trim() || '0';

      return {
        Flight: vueloNo,
        Route: dalData.route || `${vuelo.origen || 'GUA'} - ${vuelo.destino || 'ATL'}`,
        AC: matricula,
        Date: HtmlPreviewService.formatDDMMYYYY(fechaItiVuelo || dalData.fecha || fechaRaw),
        XRayYesNo: isTrue(revXRay) ? 'YES' : 'NO',
        BagsSearched: pickDal(dalData.cantidadEqFisicos, dalDb.CantidadEqFisicos, 0),
        Screener1: (preferPersisted ? (evalParts[0] || dalData.screener1) : (dalData.screener1 || evalParts[0])) || '',
        Screener2: (preferPersisted ? (evalParts[1] || dalData.screener2) : (dalData.screener2 || evalParts[1])) || '',
        Screener3: (preferPersisted ? (evalParts[2] || dalData.screener3) : (dalData.screener3 || evalParts[2])) || '',
        Sup: (preferPersisted ? (evalParts[3] || supDalResolved || dalData.screenerSup) : (dalData.screenerSup || evalParts[3] || supDalResolved)) || '',
        GuardSig1: dalData.guardSig1 || guard1,
        BagsLoggedYesNo: isTrue(bolsasIng) ? 'YES' : 'NO',
        BagsUSEntry: pickDal(dalData.cantidadEq, dalDb.CantidadEq, 0),
        GuardSig2: guard2,
        BagsEscortedSig: dalData.bagsEscortedSig || guardEscolta || guard2,
        BagsLoadedForward: pickDal(dalData.cantidadEqGuardia, dalDb.CantidadEqGuardia, 0),
        CargoLoadedForward: pickDal(dalData.cantidadMaletas, dalDb.CantidadMaletas, 0),
        GuardSig3: dalData.guardSig3 || guard1,
        CargoManifested: pickDal(dalData.cantidadPiezasManifiesto, dalDb.CantidadPiezasManifiesto, 0),
        CargoCheckedSig: dalData.cargoCheckedSig || guard3,
        CargoEscortedBakSig: dalData.cargoEscortedBakSig || agentesGate,
        CargoEscortedAircraftSig: dalData.cargoEscortedAircraftSig || guardEscolta,
        ThroughPassengers: pickDal(dalData.cantidadPasajerosTransito, dalDb.CantidadPasajerosTransito, 0),
        DepartingPassengers: pickDal(dalData.cantidadPasajerosSalientes, dalDb.CantidadPasajerosSalientes, 0),
        MissingPassengers: missingVal,
        NamesMissingPassengers: dalData.nombresPasajerosPerdieron || missingVal,
        FreightAccepted: pickDal(dalData.cantidadPiezasAceptadas, dalDb.CantidadPiezasAceptadas, 0),
        FreightLoaded: pickDal(dalData.cantidadPiezasCargadas, dalDb.CantidadPiezasCargadas, 0),
        BagsCheckedIn: pickDal(dalData.cantidadEqFacturados, dalDb.CantidadEqFacturados, 0),
        BagsLoaded: pickDal(dalData.cantidadEqCargadas, dalDb.CantidadEqCargadas, 0),
        BagsOffLoaded: pickDal(dalData.cantidadEqRetirados, dalDb.CantidadEqRetirados, 0),
        MatchMissingYesNo: isTrue(eqCoincide) ? 'YES' : 'NO',
        GuardSupSig: supDalResolved,
        FirmaGuardSup: pickRepoSig('firmaGuardSup', dalData.firmaGuardSup),
        DLAgent: pickDal(dalData.nombreAgenteDelta, dalDb.NombreAgenteDelta, ''),
        FirmaDLAgent: pickRepoSig('firmaDLAgent', dalData.firmaDLAgent)
      };
    }

    if (formatoId === 'dl-sel') {
      const selData = formDatos.selPayload || formDatos || {};
      const selDb = hydrated?.selState?.detalle || {};
      const selMeta = selDb.Meta || {};
      const pickSel = (liveVal, dbVal, fallback = '') => {
        if (preferPersisted) return dbVal !== undefined && dbVal !== null && dbVal !== '' ? dbVal : (liveVal ?? fallback);
        return liveVal !== undefined && liveVal !== null && liveVal !== '' ? liveVal : (dbVal ?? fallback);
      };
      const supSelResolved = HtmlPreviewService.resolvePersonaNombre(
        preferPersisted ? (selDb.CreadoPor || selData.supervisorNombre) : (selData.supervisorNombre || selDb.CreadoPor),
        preferPersisted ? (selDb.LoginId || selData.supervisorLoginId) : (selData.supervisorLoginId || selDb.LoginId),
        hydrated
      ) || supervisor || agente || '';

      return {
        Flight: vueloNo,
        Date: HtmlPreviewService.formatDDMMYYYY(fechaItiVuelo || selData.fecha || fechaRaw),
        AircraftArrived: HtmlPreviewService.formatDDMMYYYY(
          pickSel(selData.aircraftArrived, selMeta.aircraftArrived, fechaItiVuelo || vuelo.FechaItinerado || fechaRaw)
        ),
        Time: HtmlPreviewService.extractHHMM(pickSel(selData.aircraftArrivedTime, selMeta.aircraftArrivedTime, vuelo.ata || '')),
        Guard: pickSel(selData.guard, selMeta.guard, supSelResolved),
        PassengerLineClosed: HtmlPreviewService.extractHHMM(pickSel(selData.horaCierreFila, selDb.HoraCierreFila)),
        NumPassengersInLine: pickSel(selData.cantidadPasajerosFila, selDb.CantidadPasajerosFila, 0),
        LastPassengerCheckedIn: HtmlPreviewService.extractHHMM(pickSel(selData.horaChequeadoFila, selDb.HoraChequeadoFila)),
        FirstBagsSniffed: HtmlPreviewService.extractHHMM(pickSel(selData.primerEqRevisada, selDb.PrimerEqRevisada)),
        LastBagsSniffed: HtmlPreviewService.extractHHMM(pickSel(selData.ultimoEqRevisado, selDb.UltimoEqRevisado)),
        FirstBagsArriveGate: HtmlPreviewService.extractHHMM(pickSel(selData.primerEqPuerta, selDb.PrimerEqPuerta)),
        LastBagsArriveGate: HtmlPreviewService.extractHHMM(pickSel(selData.ultimoEqPuerta, selDb.UltimoEqPuerta)),
        PassengersArrivedGate: pickSel(selData.cantidadPasajerosEmbarque, selDb.CantidadPasajerosEmbarque, 0),
        PassengersCommenceBoarding: HtmlPreviewService.extractHHMM(pickSel(selData.horaInicioEmbarque, selDb.HoraInicioEmbarque)),
        LastPassengerLeavesGate: HtmlPreviewService.extractHHMM(pickSel(selData.horaUltimoAbandona, selDb.HoraUltimoAbandona)),
        UnloadingComplete: HtmlPreviewService.extractHHMM(pickSel(selData.horaDescargaEqCarga, selDb.HoraDescargaEqCarga)),
        LoadingBegins: HtmlPreviewService.extractHHMM(pickSel(selData.horaInicioEqCarga, selDb.HoraInicioEqCarga)),
        CargoDoorsClosed: HtmlPreviewService.extractHHMM(pickSel(selData.horaPuertasCerradasCar, selDb.HoraPuertasCerradasCar)),
        CabinDoorsClosed: HtmlPreviewService.extractHHMM(pickSel(selData.horaPuertasCerradasCab, selDb.HoraPuertasCerradasCab)),
        AircraftBeginsTaxi: HtmlPreviewService.extractHHMM(pickSel(selData.horaInicioRodajeNave, selDb.HoraInicioRodajeNave)),
        Comments: String(pickSel(selData.observaciones, selDb.Observaciones, observaciones) || '').trim() || 'N/A',
        SupervisorName: supSelResolved,
        FirmaSupervisor: pickRepoSig('firmaSupervisor', selData.firmaSupervisor)
      };
    }

    if (formatoId === 'ac-ass') {
      const ass = formDatos.assPayload || formDatos || {};
      const db = hydrated?.assState?.detalle || {};
      const metaDb = db.Meta || {};
      const rawChecks = (ass.checks && typeof ass.checks === 'object') ? ass.checks : {};
      const pickBool = (formVal, dbVal) => formVal !== undefined ? Boolean(formVal) : Boolean(dbVal);

      const fechaVal = ass.fecha || db.Fecha || fechaRaw;
      const tipoBusRaw = String(ass.tipoBusqueda || ass.searchType || db.TipoBusqueda || 'PHYSICAL').trim().toUpperCase();
      const searchType = tipoBusRaw === 'VISUAL' ? 'VISUAL' : 'PHYSICAL';
      const sigVal = pickRepoSig(
        'signature',
        ass.firmaBase64 !== undefined ? ass.firmaBase64 : (ass.signature !== undefined ? ass.signature : ''),
        metaDb.signature || ''
      );

      return {
        Flight: String(ass.noVuelo || vueloNo || ''),
        Fin: String(ass.matricula || matricula || ''),
        Date: HtmlPreviewService.formatDDMMYYYY(fechaVal),
        DepartureStation: String(ass.departureStation || metaDb.departureStation || 'GUA'),
        OriginInbound: String(ass.originInbound || metaDb.originInbound || vuelo.Origen || ''),
        DestinationOutbound: String(ass.destinationOutbound || metaDb.destinationOutbound || vuelo.Destino || 'GUA'),
        SearchStartTime: HtmlPreviewService.extractHHMM(ass.horaInicio || db.HoraInicio),
        SearchCompletedTime: HtmlPreviewService.extractHHMM(ass.horaFin || db.HoraFin),
        SearchType: searchType,
        Checks: {
          OverheadBins: pickBool(rawChecks.OverheadBins, db.CompartimientosSuperiores ?? true),
          ClosetsStorage: pickBool(rawChecks.ClosetsStorage, db.ArmariosAreasTripulacion ?? true),
          Lavatories: pickBool(rawChecks.Lavatories, db.LavatoriosSellosSeguridad ?? true),
          SeatsUnder: pickBool(rawChecks.SeatsUnder, db.AsientosBolsillosPared ?? true),
          SeatBacksTrays: pickBool(rawChecks.SeatBacksTrays, db.RespaldosBolsillosBandejas ?? true),
          GalleyAreas: pickBool(rawChecks.GalleyAreas, db.CocinasCarritos ?? true),
          UnderSeatCushions: pickBool(rawChecks.UnderSeatCushions, db.CojinesAsientos ?? true),
          LifeVestPackages: pickBool(rawChecks.LifeVestPackages, db.ChalecosSalvavidas ?? true),
          CrewRestAreasNA: pickBool(rawChecks.CrewRestAreasNA, db.AreasDescansoTripulacion ?? true)
        },
        SupervisorName: String(ass.supervisorNombre || db.TeamSupervisor || supervisor || ''),
        Company: String(ass.company || metaDb.company || 'LAATS'),
        EmployeeNo: String(ass.empleadoNo ?? ass.empleadoId ?? db.EmpleadoId ?? user.empleadoId ?? ''),
        Signature: String(sigVal || '')
      };
    }

    if (formatoId === 'ac-anexoa') {
      const a = formDatos.anexoAPayload || formDatos || {};
      const enc = hydrated?.anexoAState?.encabezado || {};
      const metaDb = enc.Meta || {};
      const liveRows = Array.isArray(a.registros) ? a.registros : null;
      const dbRows = Array.isArray(hydrated?.anexoAState?.detalles) ? hydrated.anexoAState.detalles : rows;
      const sourceRows = liveRows ? liveRows : dbRows;

      const totalRows = Math.max(25, sourceRows.length);
      const filas = [];
      for (let i = 0; i < totalRows; i++) {
        const r = sourceRows[i] || {};
        const nombre = String(r.Nombre || r.PersonalMonitoreo || '').trim();
        const noTia = String(r.NoTIA || r.AirportId || '').trim();
        const hIn = HtmlPreviewService.extractHHMM(r.HoraIngreso || r.HoraInicio);
        const hOut = HtmlPreviewService.extractHHMM(r.HoraSalida || r.HoraSalidaReal || r.HoraFin);
        const salidaHtml = (nombre && !hOut)
          ? '<span style="color:#B91C1C; font-weight:bold;">Pendiente</span>'
          : esc(hOut);
        filas.push(`<tr>
          <td>${i + 1}</td>
          <td style="text-align:left;">${esc(nombre)}</td>
          <td>${esc(noTia)}</td>
          <td>${esc(hIn)}</td>
          <td>${esc(r.Empresa || '')}</td>
          <td style="text-align:left;">${esc(r.Motivo || r.MotivoAcceso || '')}</td>
          <td>${salidaHtml}</td>
        </tr>`);
      }

      const horaRev = HtmlPreviewService.extractHHMM(a.horaRevision || metaDb.horaRevision || vuelo.HoraItinerario);
      const ptaVal = String(a.puerta || metaDb.puerta || puerta || '--').trim();
      const fechaA = a.fecha || enc.Fecha || fechaRaw;
      const supName = String(a.supervisorNombre || enc.PersonalMonitoreo || enc.NombreSupervisor || supervisor || '').trim();
      const obsText = a.observaciones !== undefined ? a.observaciones : (enc.Observaciones || observaciones);

      return {
        Vuelo: String(vueloNo || ''),
        Matricula: String(matricula || ''),
        Fecha: HtmlPreviewService.formatDDMMYYYY(fechaA),
        HoraInicioPuerta: `${horaRev || '--:--'} / ${ptaVal || '--'}`,
        ArriboVuelo: HtmlPreviewService.extractHHMM(a.arriboVuelo || metaDb.arriboVuelo),
        AeronaveAsegurada: HtmlPreviewService.extractHHMM(a.aeronaveAsegurada || metaDb.aeronaveAsegurada),
        Agente: String(a.agente || agente || ''),
        Supervisor: supName,
        FilasTabla: filas.join(''),
        Observaciones: String(obsText || '').trim() || 'N/A'
      };
    }

    if (formatoId === 'ac-anexob') {
      const b = formDatos.anexoBPayload || formDatos || {};
      const enc = hydrated?.anexoBState?.encabezado || {};
      const dm = enc.DocMeta || {};
      const liveZones = Array.isArray(b.zonesSearch) ? b.zonesSearch : null;
      const dbZones = Array.isArray(hydrated?.anexoBState?.zones) ? hydrated.anexoBState.zones : [];
      const rawZones = (liveZones || dbZones).slice(0, 5);
      const zonesNormalized = rawZones.map((z) => ({
        EmployeeInfo: String(z?.EmployeeInfo || '').trim(),
        Zone: String(z?.Zone || '').trim(),
        SearchType: String(z?.SearchType || 'Física').trim().toLowerCase() === 'visual' ? 'Visual' : 'Física',
        TimeStarted: HtmlPreviewService.extractHHMM(z?.TimeStarted),
        TimeCompleted: HtmlPreviewService.extractHHMM(z?.TimeCompleted),
        Remarks: String(z?.Remarks || '').trim()
      }));

      const pickStr = (liveV, dbV, fallback = '') => {
        if (liveV !== undefined && liveV !== null && String(liveV).trim() !== '') return String(liveV).trim();
        if (dbV !== undefined && dbV !== null && String(dbV).trim() !== '') return String(dbV).trim();
        return fallback;
      };
      const pickRaw = (liveV, dbV, fallback = '') => {
        if (liveV !== undefined && liveV !== null) return String(liveV).trim();
        if (dbV !== undefined && dbV !== null) return String(dbV).trim();
        return fallback;
      };

      const fechaB = b.fecha || enc.Fecha || fechaRaw;
      const idValReqRaw = pickStr(b.idValidationRequired, dm.idValidationRequired, 'NO').toUpperCase();
      const idValRequired = (idValReqRaw === 'SÍ' || idValReqRaw === 'SI' || idValReqRaw === 'YES') ? 'SÍ' : 'NO';

      return {
        Flight: String(b.noVuelo || vueloNo || ''),
        Fin: String(b.matricula || matricula || ''),
        Date: HtmlPreviewService.formatDDMMYYYY(fechaB),
        DepartureStation: pickStr(b.departureStation, dm.departureStation, 'GUA'),
        OriginInbound: pickStr(b.originInbound, dm.originInbound, vuelo.Origen || ''),
        DestinationOutbound: pickStr(b.destinationOutbound, dm.destinationOutbound, vuelo.Destino || 'GUA'),
        SearchStartTime: HtmlPreviewService.extractHHMM(b.searchStartTime !== undefined ? b.searchStartTime : dm.searchStartTime),
        TimeSearchCompleted: HtmlPreviewService.extractHHMM(b.timeSearchCompleted !== undefined ? b.timeSearchCompleted : dm.timeSearchCompleted),
        GeneralSearchType: pickStr(b.generalSearchType, dm.generalSearchType, 'Física').toLowerCase() === 'visual' ? 'Visual' : 'Física',
        OverheadBins: pickStr(b.overheadBins, dm.overheadBins, 'Realizado'),
        ClosetsStorageCrew: pickStr(b.closetsStorageCrew, dm.closetsStorageCrew, 'Realizado'),
        LavatoriesAndSeals: pickStr(b.lavatoriesAndSeals, dm.lavatoriesAndSeals, 'Realizado'),
        SeatsUnderPocketsBetween: pickStr(b.seatsUnderPocketsBetween, dm.seatsUnderPocketsBetween, 'Realizado'),
        SeatBacksPocketsTrays: pickStr(b.seatBacksPocketsTrays, dm.seatBacksPocketsTrays, 'Realizado'),
        GalleyAreasAndTrolleys: pickStr(b.galleyAreasAndTrolleys, dm.galleyAreasAndTrolleys, 'Realizado'),
        SeatsUnderCushions: pickStr(b.seatsUnderCushions, dm.seatsUnderCushions, 'Realizado'),
        LifeVestPackagesHolders: pickStr(b.lifeVestPackagesHolders, dm.lifeVestPackagesHolders, 'Realizado'),
        CrewRestAreas: pickStr(b.crewRestAreas, dm.crewRestAreas, 'N/A'),
        ZonesSearch: zonesNormalized,
        IdValidationRequired: idValRequired,
        IdValidationReport: pickRaw(b.idValidationReport, dm.idValidationReport, ''),
        LeadName: pickStr(b.leadName, dm.leadName, supervisor || ''),
        LeadEmployeeNumber: pickStr(b.leadEmployeeNumber, dm.leadEmployeeNumber, user.empleadoId ? String(user.empleadoId) : ''),
        LeadSignature: pickRepoSig('leadSignature', b.leadSignature, dm.leadSignature || ''),
        CSMName: pickRaw(b.csmName, dm.csmName, ''),
        CSMSignature: pickRepoSig('csmSignature', b.csmSignature, dm.csmSignature || '')
      };
    }

    if (formatoId === 'latam-liadc') {
      const l = formDatos.liadcPayload || formDatos || {};
      const db = hydrated?.liadcState?.detalle || {};
      const metaDb = (db.Meta && typeof db.Meta === 'object') ? db.Meta : {};
      const rawChecks = (l.checks && typeof l.checks === 'object') ? l.checks : l;
      const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
      const pickBool = (k) => (rawChecks[k] !== undefined ? toBool(rawChecks[k]) : toBool(db[k]));

      const fechaVal = l.fecha || db.Fecha || fechaRaw;
      const puenteVal = String(l.puente !== undefined ? l.puente : (db.Puente ?? puerta ?? '')).trim();
      const supId = parseInt(l.supLaats ?? db.SupLaats, 10) || 0;
      let supervisorNombre = String(l.supervisorNombre || metaDb.supervisorNombre || db.NombreSupervisorLaats || '').trim();
      if (!supervisorNombre && supId && Array.isArray(hydrated?.usuariosSEC)) {
        const foundSup = hydrated.usuariosSEC.find(u => Number(u.EmpleadoId) === supId);
        if (foundSup) supervisorNombre = foundSup.NombreCompleto || foundSup.Usuario || '';
      }
      if (!supervisorNombre) supervisorNombre = supervisor || '';

      const inspectorNombre = String(l.inspectorNombre || metaDb.inspectorNombre || `${user?.usuario || db.UsuarioRegistro || agente || ''} / LAATS`).trim();
      const notifRaw = String(l.notificacionComandante || db.NotificacionComandante || 'VERBAL').trim().toUpperCase();
      const notifVal = notifRaw === 'ESCRITA' ? 'ESCRITA' : 'VERBAL';
      const inicialesVal = String(l.iniciales !== undefined ? l.iniciales : (db.Iniciales || '')).trim().toUpperCase().substring(0, 3);
      const obsVal = String(l.observaciones !== undefined ? l.observaciones : (db.Observaciones || observaciones || '')).trim();

      return {
        Formato: 'Lista de Inspeccion de Aeronave de Carga',
        Codigo: 'FOR-SEC-UC-029 Rev.02',
        Fecha: HtmlPreviewService.formatDDMMYYYY(fechaVal),
        Vuelo: String(vueloNo || ''),
        Matricula: String(matricula || ''),
        Puente: puenteVal,
        HoraInicioInsp: HtmlPreviewService.extractHHMM(l.horaInicioInsp || db.HoraInicioInsp),
        HoraTerminoInsp: HtmlPreviewService.extractHHMM(l.horaTerminoInsp || db.HoraTerminoInsp),
        ArriboVuelo: HtmlPreviewService.extractHHMM(l.arriboVuelo || metaDb.arriboVuelo || vuelo.ata),
        InspectorNombre: inspectorNombre,
        FirmaInspector: pickRepoSig('firmaInspector', l.firmaInspector, metaDb.firmaInspector || ''),
        SupervisorNombre: supervisorNombre,
        FirmaSupervisor: pickRepoSig('firmaSupervisor', l.firmaSupervisor, metaDb.firmaSupervisor || ''),
        NotificacionComandante: notifVal,
        Iniciales: inicialesVal,
        Observaciones: obsVal,
        CabinaPilotos_AreasVisibles: pickBool('CabinaPilotos_AreasVisibles'),
        CabinaPilotos_Asientos: pickBool('CabinaPilotos_Asientos'),
        CabinaPilotos_CompartAccesiblesDiversos: pickBool('CabinaPilotos_CompartAccesiblesDiversos'),
        CabinaPilotos_AccesoCompartElectronico: pickBool('CabinaPilotos_AccesoCompartElectronico'),
        Cocinas_AreasVisibles: pickBool('Cocinas_AreasVisibles'),
        Cocinas_CarrosSusCompart: pickBool('Cocinas_CarrosSusCompart'),
        Cocinas_ContenedoresBasura: pickBool('Cocinas_ContenedoresBasura'),
        Cocinas_CompartAccesibles: pickBool('Cocinas_CompartAccesibles'),
        Banos_AreasVisibles: pickBool('Banos_AreasVisibles'),
        Banos_CompartAccesibles: pickBool('Banos_CompartAccesibles'),
        Banos_ContenedoresBasura: pickBool('Banos_ContenedoresBasura'),
        AreasExternas_AreasVisibles: pickBool('AreasExternas_AreasVisibles'),
        AreasExternas_AccesoCompartElectronico: pickBool('AreasExternas_AccesoCompartElectronico'),
        AreasExternas_FososTrenesAterrizaje: pickBool('AreasExternas_FososTrenesAterrizaje'),
        AreasExternas_RegistrosCavidadesExt: pickBool('AreasExternas_RegistrosCavidadesExt'),
        AreasExternas_BodegaDelantera: pickBool('AreasExternas_BodegaDelantera'),
        AreasExternas_CompartElectronico: pickBool('AreasExternas_CompartElectronico'),
        AreasExternas_CompartBotellaOxigeno: pickBool('AreasExternas_CompartBotellaOxigeno'),
        AreasExternas_CompartAireAcondicionado: pickBool('AreasExternas_CompartAireAcondicionado'),
        AreasExternas_CompartConexionesElectronicas: pickBool('AreasExternas_CompartConexionesElectronicas'),
        AreasExternas_BodegaTrasera: pickBool('AreasExternas_BodegaTrasera'),
        AreasExternas_Bulk: pickBool('AreasExternas_Bulk'),
        AreasExternas_CompartSensorIncendio: pickBool('AreasExternas_CompartSensorIncendio'),
        AreasExternas_CompartAguaBano: pickBool('AreasExternas_CompartAguaBano')
      };
    }

    if (formatoId === 'fdx-ccda') {
      const c = formDatos.ccdaPayload || formDatos || {};
      const enc = hydrated?.ccdaState?.encabezado || {};
      const dbPersonal = Array.isArray(hydrated?.ccdaState?.detalles) ? hydrated.ccdaState.detalles : [];
      const livePersonal = Array.isArray(c.personal)
        ? c.personal
        : (Array.isArray(c.registros) ? c.registros : null);
      const sourceRows = livePersonal || dbPersonal;

      const fechaStr = String(c.fecha || enc.Fecha || fechaRaw || '').trim();
      let dia = '';
      let mes = '';
      let anio = '';
      if (/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
        const [y, m, d] = fechaStr.substring(0, 10).split('-');
        dia = d;
        mes = m;
        anio = y;
      } else {
        const ddmmyyyy = HtmlPreviewService.formatDDMMYYYY(fechaStr);
        const parts = ddmmyyyy.split('/');
        if (parts.length === 3) {
          [dia, mes, anio] = parts;
        }
      }

      const pickStr = (liveV, dbV, fallback = '') => {
        if (liveV !== undefined && liveV !== null && String(liveV).trim() !== '') return String(liveV).trim();
        if (dbV !== undefined && dbV !== null && String(dbV).trim() !== '') return String(dbV).trim();
        return fallback;
      };
      const pickTime = (liveV, dbV, fallback = '') => {
        const liveT = liveV !== undefined && liveV !== null ? HtmlPreviewService.extractHHMM(liveV) : '';
        if (liveT) return liveT;
        const dbT = dbV !== undefined && dbV !== null ? HtmlPreviewService.extractHHMM(dbV) : '';
        if (dbT) return dbT;
        return fallback;
      };

      const totalRows = Math.max(20, sourceRows.length);
      const filasPersonal = [];
      for (let i = 0; i < totalRows; i++) {
        const r = sourceRows[i] || null;
        const personalNombre = r ? String(r.Personal || r.Nombre || r.NombreEmpleado || '').trim() : '';
        const empId = r ? String(r.EmpleadoId ?? r.ID ?? '').trim() : '';
        const empresa = r ? String(r.Empresa || 'LAATS').trim() : '';
        const hIn1 = r ? HtmlPreviewService.extractHHMM(r.Entrada ?? r.HoraEntrada1) : '';
        const hOut1 = r ? HtmlPreviewService.extractHHMM(r.Salida ?? r.HoraSalida1) : '';
        const hIn2 = r ? HtmlPreviewService.extractHHMM(r.SegundaEntrada ?? r.HoraEntrada2) : '';
        const hOut2 = r ? HtmlPreviewService.extractHHMM(r.SegundaSalida ?? r.HoraSalida2) : '';

        const salida1Html = (personalNombre && !hOut1)
          ? '<span style="color:#B91C1C; font-weight:bold;">Pendiente</span>'
          : esc(hOut1);

        filasPersonal.push(`<tr>
          <td style="border: 1px solid #000; text-align: center; font-weight: bold; height: 18px;">${i + 1}</td>
          <td style="border: 1px solid #000; text-align: left; padding-left: 4px;">${esc(personalNombre)}</td>
          <td style="border: 1px solid #000; text-align: center;">${esc(empId)}</td>
          <td style="border: 1px solid #000; text-align: center;">${esc(empresa)}</td>
          <td style="border: 1px solid #000; text-align: center;">${esc(hIn1)}</td>
          <td style="border: 1px solid #000; text-align: center;">${salida1Html}</td>
          <td style="border: 1px solid #000; text-align: center;">${esc(hIn2)}</td>
          <td style="border: 1px solid #000; text-align: center;">${esc(hOut2)}</td>
        </tr>`);
      }

      const combustibleRaw = c.cantCombustible !== undefined && c.cantCombustible !== null && c.cantCombustible !== ''
        ? c.cantCombustible
        : (enc.CantCombustible !== undefined && enc.CantCombustible !== null ? enc.CantCombustible : '');

      const llegadaDefault = HtmlPreviewService.extractHHMM(vuelo.ata) || HtmlPreviewService.extractHHMM(vuelo.eta) || '';
      const salidaDefault = HtmlPreviewService.extractHHMM(vuelo.atd) || HtmlPreviewService.extractHHMM(vuelo.etd) || '';

      return {
        Dia: dia,
        Mes: mes,
        Anio: anio,
        Llegada: pickTime(c.llegada, enc.LlegadaMeta || (enc.Llegada && enc.Llegada !== 'NA' ? enc.Llegada : ''), llegadaDefault),
        PushBack: pickTime(c.pushBack, enc.PushBack, ''),
        Salida: pickTime(c.salida, enc.Salida, salidaDefault),
        CantCombustible: combustibleRaw !== '' ? String(combustibleRaw) : '',
        Vuelo: String(vueloNo || enc.NoVuelo || ''),
        Matricula: String(matricula || (enc.Matricula && enc.Matricula !== 'NA' ? enc.Matricula : '') || ''),
        Aerolinea: 'FEDEX',
        Destino: String(vuelo.Destino || vuelo.destino || enc.Destino || '').trim(),
        OperarioNombre: pickStr(c.operarioNombre, enc.OperarioNombre, ''),
        OperarioID: pickStr(c.operarioEmpleadoId, enc.OperarioEmpleadoId, ''),
        OperarioEmpresa: pickStr(c.operarioEmpresa, enc.OperarioEmpresa, 'LAATS'),
        Acopla: pickTime(c.acopla, enc.Acopla, ''),
        Desacopla: pickTime(c.desacopla, enc.Desacopla, ''),
        AperturaAeronave: pickTime(c.aperturaAeronave, enc.AperturaAeronave, ''),
        CierreAeronave: pickTime(c.cierreAeronave, enc.CierreAeronave, ''),
        InicioDescargue: pickTime(c.inicioDescargue, enc.InicioDescargue, ''),
        TerminaDescargue: pickTime(c.terminaDescargue, enc.TerminaDescargue, ''),
        IniciaCargue: pickTime(c.iniciaCargue, enc.IniciaCargue, ''),
        TerminaCargue: pickTime(c.terminaCargue, enc.TerminaCargue, ''),
        TablaPersonalHTML: filasPersonal.join(''),
        Arribo: pickTime(c.arribo, enc.Arribo, '') || '--:--',
        PuertaAbierta: pickTime(c.puertaAbierta, enc.PuertaAbierta, '') || '--:--',
        PuertaCerrada: pickTime(c.puertaCerrada, enc.PuertaCerrada, '') || '--:--',
        EscaleraAcoplada: pickTime(c.escaleraAcoplada, enc.EscaleraAcoplada, '') || '--:--',
        EscaleraDesacoplada: pickTime(c.escaleraDesacoplada, enc.EscaleraDesacoplada, '') || '--:--',
        Observaciones: c.observaciones !== undefined ? String(c.observaciones || '').trim() : String(enc.Observaciones || '').trim(),
        Agente: pickStr(c.agenteSeguridad, enc.AgenteSeguridad, agente),
        Supervisor: pickStr(c.supervisor, enc.Supervisor, supervisor)
      };
    }

    if (formatoId.endsWith('-lisa')) {
      const l = formDatos.lisaPayload || formDatos || {};
      const det = (hydrated?.lisaState?.detalle && typeof hydrated.lisaState.detalle === 'object')
        ? hydrated.lisaState.detalle
        : {};
      const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';

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
      const checksOut = {};
      checkKeys.forEach((k) => {
        checksOut[k] = rawChecks[k] !== undefined ? toBool(rawChecks[k]) : toBool(det[k]);
      });

      const nombreInspector = String(
        l.nombreInspector || l.NombreEjecutoInspeccion || det.NombreEjecutoInspeccion || agente || ''
      ).trim();
      const initialsAuto = nombreInspector
        .split(/\s+/)
        .filter(Boolean)
        .map(w => `${w.charAt(0).toUpperCase()}.`)
        .join('') || 'L.A.';

      const rawSellos = (l.sellos && typeof l.sellos === 'object')
        ? l.sellos
        : (det.SellosParsed && typeof det.SellosParsed === 'object' ? det.SellosParsed : {});
      const sellosOut = {};
      let tieneSello = false;
      for (let i = 1; i <= 15; i += 1) {
        const item = rawSellos[i] || rawSellos[String(i)] || {};
        const num = String(item.numero ?? item.sello ?? l[`Sello${i}`] ?? '').trim();
        const ini = String(item.iniciales ?? item.ini ?? l[`Ini${i}`] ?? '').trim();
        if (num) tieneSello = true;
        sellosOut[`Sello${i}`] = num;
        sellosOut[`Ini${i}`] = num ? (ini || initialsAuto) : '';
      }

      const tipoAeronaveDb = det.TipoAeronave && String(det.TipoAeronave).trim().toUpperCase() !== 'NA'
        ? String(det.TipoAeronave).trim()
        : '';
      const firmaInspectorLisa = pickRepoSig('firmaInspector', l.firmaInspector || l.FirmaInspector);

      return {
        Fecha: HtmlPreviewService.formatDDMMYYYY(l.fecha || det.Fecha || fechaRaw),
        Vuelo: String(vueloNo || (det.NoVuelo && det.NoVuelo !== 'NA' ? det.NoVuelo : '') || '').trim(),
        Matricula: String(matricula || (det.Matricula && det.Matricula !== 'NA' ? det.Matricula : '') || '').trim(),
        TipoAvion: String(l.tipoAvion || det.TipoAvion || vuelo.TipoAeronave || tipoAeronaveDb || 'B767').trim(),
        Estacion: String(l.estacion || det.Estacion || 'GUA').trim() || 'GUA',
        CoordSeguridadTierra: l.coordSeguridadTierra !== undefined
          ? toBool(l.coordSeguridadTierra)
          : toBool(det.CoordSeguridadTierra),
        RepresentanteAutorizado: l.representanteAutorizado !== undefined
          ? toBool(l.representanteAutorizado)
          : toBool(det.RepresentanteAutorizado),
        NoSello: tieneSello || toBool(det.NoSello),
        ...checksOut,
        ...sellosOut,
        HoraInicio: HtmlPreviewService.extractHHMM(l.horaInicio || det.HoraInicio),
        HoraFin: HtmlPreviewService.extractHHMM(l.horaFin || det.HoraFin),
        HoraSalida: HtmlPreviewService.extractHHMM(l.horaSalida || det.HoraSalida),
        Observaciones: l.observaciones !== undefined
          ? String(l.observaciones || '').trim()
          : String(det.Observaciones || '').trim(),
        NombreInspector: nombreInspector,
        FirmaInspector: firmaInspectorLisa
      };
    }

    return {};
  }

  /**
   * Evaluador recursivo seguro de expresiones Power Automate @{...} (if, coalesce, or, and, equals, empty, concat, variables, body?['k']?[i]).
   */
  static evalPowerAutomateTokens(html, { vars = {}, variablesMap = {} }) {
    const esc = HtmlPreviewService.escapeHtml;

    const splitArgs = (argText) => {
      const args = [];
      let depth = 0;
      let inStr = false;
      let start = 0;
      for (let i = 0; i < argText.length; i++) {
        const ch = argText[i];
        if (ch === '\'') {
          inStr = !inStr;
        } else if (!inStr) {
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          else if (ch === ',' && depth === 0) {
            args.push(argText.slice(start, i).trim());
            start = i + 1;
          }
        }
      }
      const tail = argText.slice(start).trim();
      if (tail.length > 0 || args.length > 0) args.push(tail);
      return args;
    };

    const resolvePath = (expr) => {
      const m = expr.match(/^body\(\s*'[^']+'\s*\)([\s\S]*)$/);
      if (!m) return null;
      let cur = vars;
      let lastKey = '';
      const rest = m[1];
      const segRegex = /\??\[\s*(?:'([^']*)'|(\d+))\s*\]/g;
      let seg;
      let matchedLen = 0;
      while ((seg = segRegex.exec(rest)) !== null) {
        matchedLen += seg[0].length;
        if (seg[1] !== undefined) {
          lastKey = seg[1];
          cur = (cur && typeof cur === 'object') ? cur[lastKey] : undefined;
        } else if (seg[2] !== undefined) {
          const idx = parseInt(seg[2], 10);
          lastKey = '';
          cur = Array.isArray(cur) ? cur[idx] : undefined;
        }
      }
      if (matchedLen !== rest.replace(/\s+/g, '').length && rest.trim() !== '') {
        // Check ignoring whitespace
        if (rest.replace(/\??\[\s*(?:'[^']*'|\d+)\s*\]|\s+/g, '') !== '') return null;
      }
      return { value: cur, lastKey };
    };

    const evalNode = (rawExpr) => {
      const expr = String(rawExpr || '').trim();
      if (!expr) return { value: '', html: '', isLiteral: true };
      if (expr === 'null') return { value: null, html: '', isLiteral: true };
      if (expr === 'true') return { value: true, html: 'true', isLiteral: true };
      if (expr === 'false') return { value: false, html: 'false', isLiteral: true };
      if (/^-?\d+(\.\d+)?$/.test(expr)) return { value: Number(expr), html: expr, isLiteral: true };

      if (expr.startsWith('\'') && expr.endsWith('\'') && expr.length >= 2) {
        const inner = expr.slice(1, -1);
        return { value: inner, html: inner, isLiteral: true };
      }

      if (/^body\(\s*'[^']+'\s*\)/.test(expr)) {
        const resolved = resolvePath(expr);
        if (resolved) {
          const { value, lastKey } = resolved;
          if (RAW_HTML_KEYS.has(lastKey)) {
            const s = String(value ?? '');
            return { value: s, html: s, isLiteral: true };
          }
          if (SIGNATURE_KEYS.has(lastKey)) {
            const rawSig = String(value ?? '').trim();
            if (!rawSig) return { value: '', html: '', isLiteral: true, isSignatureEmpty: true };
            const safeSig = HtmlPreviewService.sanitizeSignatureDataUrl(rawSig);
            return { value: safeSig, html: safeSig, isLiteral: true };
          }
          if (typeof value === 'boolean' || typeof value === 'number' || Array.isArray(value)) {
            return { value, html: esc(value), isLiteral: false };
          }
          const s = value === undefined || value === null ? '' : String(value);
          return { value, html: esc(s), isLiteral: false };
        }
      }

      const fnMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*)\)$/);
      if (!fnMatch) return { value: '', html: '', isLiteral: false };

      const fnName = fnMatch[1].toLowerCase();
      const rawArgs = splitArgs(fnMatch[2]);

      if (fnName === 'variables') {
        const keyNode = evalNode(rawArgs[0]);
        const varKey = String(keyNode.value ?? '');
        const val = Object.prototype.hasOwnProperty.call(variablesMap, varKey)
          ? variablesMap[varKey]
          : (vars[varKey] ?? '');
        if (SIGNATURE_KEYS.has(varKey)) {
          const safeSig = String(val ?? '').trim() ? HtmlPreviewService.sanitizeSignatureDataUrl(val) : '';
          return { value: safeSig, html: safeSig, isLiteral: true };
        }
        if (varKey.startsWith('varLogo')) {
          return { value: String(val ?? ''), html: String(val ?? ''), isLiteral: true };
        }
        return { value: val, html: esc(val ?? ''), isLiteral: false };
      }

      if (fnName === 'if') {
        const cond = evalNode(rawArgs[0]);
        return Boolean(cond.value) ? evalNode(rawArgs[1]) : evalNode(rawArgs[2]);
      }

      if (fnName === 'coalesce') {
        for (const arg of rawArgs) {
          const n = evalNode(arg);
          if (n.value !== null && n.value !== undefined && String(n.value) !== '') {
            return n;
          }
        }
        return { value: '', html: '', isLiteral: true };
      }

      if (fnName === 'equals') {
        const a = evalNode(rawArgs[0]).value;
        const b = evalNode(rawArgs[1]).value;
        const res = a === b;
        return { value: res, html: String(res), isLiteral: true };
      }

      if (fnName === 'or') {
        const res = rawArgs.some(a => Boolean(evalNode(a).value));
        return { value: res, html: String(res), isLiteral: true };
      }

      if (fnName === 'and') {
        const res = rawArgs.every(a => Boolean(evalNode(a).value));
        return { value: res, html: String(res), isLiteral: true };
      }

      if (fnName === 'not') {
        const res = !Boolean(evalNode(rawArgs[0]).value);
        return { value: res, html: String(res), isLiteral: true };
      }

      if (fnName === 'empty') {
        const v = evalNode(rawArgs[0]).value;
        const res = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
        return { value: res, html: String(res), isLiteral: true };
      }

      if (fnName === 'toupper') {
        const n = evalNode(rawArgs[0]);
        const s = String(n.value ?? '').toUpperCase();
        return { value: s, html: n.isLiteral ? s : esc(s), isLiteral: n.isLiteral };
      }

      if (fnName === 'tolower') {
        const n = evalNode(rawArgs[0]);
        const s = String(n.value ?? '').toLowerCase();
        return { value: s, html: n.isLiteral ? s : esc(s), isLiteral: n.isLiteral };
      }

      if (fnName === 'startswith') {
        const str = String(evalNode(rawArgs[0]).value ?? '');
        const prefix = String(evalNode(rawArgs[1]).value ?? '');
        const res = str.startsWith(prefix);
        return { value: res, html: String(res), isLiteral: true };
      }

      if (fnName === 'string') {
        const n = evalNode(rawArgs[0]);
        const s = (n.value === null || n.value === undefined) ? '' : String(n.value);
        return { value: s, html: n.isLiteral ? s : esc(s), isLiteral: n.isLiteral };
      }

      if (fnName === 'replace') {
        const src = evalNode(rawArgs[0]);
        const find = String(evalNode(rawArgs[1]).value ?? '');
        const repl = evalNode(rawArgs[2]);
        const replaced = String(src.value ?? '').split(find).join(String(repl.value ?? ''));
        const isSafe = src.isLiteral && repl.isLiteral;
        return { value: replaced, html: isSafe ? replaced : esc(replaced), isLiteral: isSafe };
      }

      if (fnName === 'concat') {
        const evaluated = rawArgs.map(evalNode);
        const val = evaluated.map(n => String(n.value ?? '')).join('');
        const htmlOut = evaluated.map(n => n.html ?? '').join('');
        return { value: val, html: htmlOut, isLiteral: evaluated.every(n => n.isLiteral) };
      }

      if (fnName === 'formatdatetime') {
        const v = evalNode(rawArgs[0]).value;
        const fmt = String(evalNode(rawArgs[1]).value ?? 'dd/MM/yyyy');
        const out = fmt.toLowerCase().startsWith('mm/')
          ? HtmlPreviewService.formatMMDDYYYY(v)
          : HtmlPreviewService.formatDDMMYYYY(v);
        return { value: out, html: esc(out), isLiteral: false };
      }

      return { value: '', html: '', isLiteral: false };
    };

    let out = '';
    let idx = 0;
    while (idx < html.length) {
      const start = html.indexOf('@{', idx);
      if (start === -1) {
        out += html.slice(idx);
        break;
      }
      out += html.slice(idx, start);
      let pos = start + 2;
      let braceDepth = 1;
      let inStr = false;
      while (pos < html.length && braceDepth > 0) {
        const ch = html[pos];
        if (ch === '\'') inStr = !inStr;
        else if (!inStr) {
          if (ch === '{') braceDepth++;
          else if (ch === '}') braceDepth--;
        }
        pos++;
      }
      if (braceDepth === 0) {
        const innerExpr = html.slice(start + 2, pos - 1);
        const res = evalNode(innerExpr);
        out += (res.html !== undefined && res.html !== null) ? String(res.html) : '';
        idx = pos;
      } else {
        out += html.slice(start, start + 2);
        idx = start + 2;
      }
    }
    return out;
  }

  /**
   * Renderiza el HTML controlado oficial sustituyendo expresiones de Power Automate
   */
  static renderHtmlPreview({ formatoId, vars = {}, meta = {}, documentTitle = '' }) {
    const relPath = FORMAT_HTML_MAP[formatoId];
    if (!relPath) return null;

    const fullPath = path.join(FORMATOS_HTML_DIR, relPath);
    if (!fs.existsSync(fullPath)) return null;

    let html = fs.readFileSync(fullPath, 'utf8');
    const esc = HtmlPreviewService.escapeHtml;

    // 1. Logos corporativos (Aeroméxico, Arajet, Delta, Air Canada, LATAM, FedEx y Amerijet)
    const brandLogos = [
      ['varLogoAeromexico', 'aeromexico.png'],
      ['varLogoArajet', 'arajet.png'],
      ['varLogoDelta', 'delta.png'],
      ['varLogoAirCanada', 'air-canada.png'],
      ['varLogoLatam', 'latam-cargo.png'],
      ['varLogoFedex', 'fedex.png'],
      ['varLogoAmerijet', 'amerijet.png']
    ];
    const resolvedLogos = {};
    for (const [varName, imgFile] of brandLogos) {
      const b64 = HtmlPreviewService.getLogoBase64(imgFile);
      resolvedLogos[varName] = b64;
      const imgDataRegex = new RegExp(`data:image/png;base64,\\s*@\\{\\s*variables\\(\\s*'\\s*${varName}\\s*'\\s*\\)\\s*\\}\\s*`, 'gi');
      const bareVarRegex = new RegExp(`@\\{\\s*variables\\(\\s*'\\s*${varName}\\s*'\\s*\\)\\s*\\}\\s*`, 'gi');
      html = html.replace(imgDataRegex, `data:image/png;base64,${b64}`);
      html = html.replace(bareVarRegex, b64);
    }

    // 2. Expresión especial de Aleros en CIEC
    html = html.replace(
      /@\{join\(xpath\([\s\S]*?\/\/Usuario\/text\(\)'\),\s*', '\)\}/g,
      () => esc(vars.AlerosText || '')
    );

    // 2b. Expresiones Power Automate condicionales usadas en Daily Activity Log y Sequence of Events Log
    html = html.replace(
      /@\{if\(equals\(body\('[^']+'\)\?\['([^']+)'\]\s*,\s*'([^']*)'\)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\)\}/g,
      (_, key, expected, whenTrue, whenFalse) => {
        const chosen = String(vars[key] ?? '') === expected ? whenTrue : whenFalse;
        return /^(&#\d+;|&nbsp;)*$/i.test(chosen) ? chosen : esc(chosen);
      }
    );
    html = html.replace(
      /@\{if\(or\(empty\(body\('[^']+'\)\?\['([^']+)'\]\),\s*equals\(body\('[^']+'\)\?\['[^']+'\]\s*,\s*null\)\)[^\n]*?\)\)\)\}/g,
      (_, key) => {
        const sig = HtmlPreviewService.sanitizeSignatureDataUrl(vars[key]);
        return sig ? `<img class="img-firma" src="${sig}" />` : '';
      }
    );
    html = html.replace(
      /@\{if\(startsWith\(string\(body\('[^']+'\)\?\['([^']+)'\]\)[^\n]*?'<\/span>'\)\)\}/g,
      (_, key) => {
        const raw = String(vars[key] ?? '').trim();
        if (raw.startsWith('data:image')) {
          const sig = HtmlPreviewService.sanitizeSignatureDataUrl(raw);
          return sig ? `<img class="img-firma" src="${sig}" />` : '<span class="val"></span>';
        }
        return `<span class="val">${esc(raw)}</span>`;
      }
    );

    // 3. Expresiones formatDateTime(body(...)?['Field'], 'dd/MM/yyyy')
    html = html.replace(
      /@\{formatDateTime\(\s*body\('[^']+'\)\?\['([^']+)'\]\s*,\s*'dd\/MM\/yyyy'\s*\)\}/g,
      (_, key) => esc(HtmlPreviewService.formatDDMMYYYY(vars[key]))
    );

    // 4. Variables escalares globales de firma como @{variables('FirmaFinal')}
    html = html.replace(/@\{\s*variables\('([^']+)'\)\s*\}/g, (_, key) => {
      const k = String(key || '').trim();
      if (resolvedLogos[k] !== undefined) return resolvedLogos[k];
      if (SIGNATURE_KEYS.has(k)) return HtmlPreviewService.sanitizeSignatureDataUrl(vars[k]);
      return esc(vars[k] ?? '');
    });

    // 5. Campos body('Parse_JSON...')?['Key']
    html = html.replace(/@\{\s*body\('[^']+'\)\?\['([^']+)'\]\s*\}/g, (_, key) => {
      if (RAW_HTML_KEYS.has(key)) {
        return String(vars[key] ?? '');
      }
      if (SIGNATURE_KEYS.has(key)) {
        return HtmlPreviewService.sanitizeSignatureDataUrl(vars[key]);
      }
      return esc(vars[key] ?? '');
    });

    // 5b. Evaluador general de expresiones anidadas Power Automate (Air Canada ASS, Anexo A, Anexo B, etc.)
    if (html.includes('@{')) {
      html = HtmlPreviewService.evalPowerAutomateTokens(html, {
        vars,
        variablesMap: {
          ...resolvedLogos,
          FirmaFinal: vars.FirmaFinal || ''
        }
      });
    }

    // Evitar iconos de imagen rota cuando una firma opcional aún no ha sido trazada
    html = html.replace(/<img\b[^>]*\bsrc\s*=\s*(['"])\s*\1[^>]*>/gi, '');

    // 6. Título dinámico del documento HTML (<Vuelo>_<Matricula>_<NombreFormato>_<Id|PRELIMINAR>) y hoja blanca (#FFFFFF)
    const safeTitle = String(documentTitle || '').replace(/[\r\n\x00-\x1f\x7f]/g, '').trim();
    if (safeTitle) {
      if (/<title>[\s\S]*?<\/title>/i.test(html)) {
        html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(safeTitle)}</title>`);
      } else {
        html = html.replace(/<\/head>/i, `  <title>${esc(safeTitle)}</title>\n</head>`);
      }
    }
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/css/preview-toolbar.css">\n</head>`);

    return html;
  }
}

module.exports = HtmlPreviewService;
