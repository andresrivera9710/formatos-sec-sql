/**
 * HtmlPreviewService - Motor de Renderizado de Formatos Controlados (FormatosHTML)
 * Resuelve las variables de Power Automate (@{variables(...)}, @{body(...)}, @{formatDateTime(...)}, etc.)
 * respetando exactamente la estructura HTML, estilos y logos oficiales de cada aerolínea.
 */

const fs = require('fs');
const path = require('path');

const FORMATOS_HTML_DIR = path.join(__dirname, '..', 'FormatosHTML');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const FORMAT_HTML_MAP = {
  'amx-cp': 'AEROMEXICO/Control de Perimétrica (unificado).html',
  'amx-ciec': 'AEROMEXICO/Control Ingreso y Egreso Cabina.html',
  'amx-er': 'AEROMEXICO/Control de Equipaje en Revisión AVSECSGDAIA Banda de Salida (rayos x) AMX.html',
  'amx-eb': 'AEROMEXICO/Control de Equipajes en Banda de Salida (Rayos X).html',
  'amx-cec': 'AEROMEXICO/Control de Equipajes en Compartimentos.html',
  'amx-mecd': 'AEROMEXICO/Equipaje en mal estado.html',
  'amx-po': 'AEROMEXICO/Puestos por Operación.html'
};

const RAW_HTML_KEYS = new Set([
  'FilasTabla',
  'FilasInOutHTML',
  'FilasEquipajeHTML',
  'MatrizHTML',
  'TablaEmbarqueHTML',
  'TablaDesembarqueHTML',
  'TablaPersonalHTML',
  'EquipajePuertaHTML',
  'TablaRevision',
  'TablaConFirma',
  'TablaSinFirma'
]);

const SIGNATURE_KEYS = new Set([
  'FirmaFinal',
  'FirmaSupervisor',
  'FirmaAgente',
  'FirmaCCO'
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
    const rows = Array.isArray(cpDoc?.filasTabla) ? cpDoc.filasTabla : [];

    const filasTablaHtml = rows.map((r) => {
      const salidaCell = r.nombre && r.estaPendiente
        ? '<span style="color:#B91C1C;">Pendiente</span>'
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

    return {
      Fecha: cpDoc?.fechaFormatoUS || HtmlPreviewService.formatMMDDYYYY(cpDoc?.fechaIso || vuelo?.FechaItinerado),
      Supervisor: cpDoc?.supervisor || '',
      HoraInicioPuerta: cpDoc?.horaInicioPuerta || `${cpDoc?.horaInicio || '--:--'} / ${vuelo?.puertaposicion || '--'}`,
      Agente: cpDoc?.agente || user?.usuario || user?.nombreCompleto || '',
      Vuelo: cpDoc?.vuelo || vuelo?.novuelo || '',
      Matricula: cpDoc?.matricula || vuelo?.Matricula || '',
      FilasTabla: filasTablaHtml,
      ArriboVuelo: cpDoc?.arriboVuelo || '',
      AeronaveAsegurada: cpDoc?.aeronaveAsegurada || '',
      Alero1: cpDoc?.alero1 || '',
      TractoristaUnidad: cpDoc?.tractoristaUnidad || '',
      Alero2: cpDoc?.alero2 || '',
      Observaciones: cpDoc?.observaciones || ''
    };
  }

  /**
   * Construye el diccionario de variables Power Automate para los otros 6 formatos de Aeroméxico
   */
  static buildAeromexicoOtherData({ formatoId, formDatos = {}, vuelo = {}, user = {}, datosPrevios = [], complementos = [] }) {
    const esc = HtmlPreviewService.escapeHtml;
    const rows = Array.isArray(datosPrevios?.[0]) ? datosPrevios[0] : (Array.isArray(datosPrevios) ? datosPrevios : []);
    const comp = complementos?.[0]?.[0] || complementos?.[0] || {};

    const fechaRaw = formDatos.fecha || comp.Fecha || vuelo.FechaItinerado || new Date().toISOString().substring(0, 10);
    const supervisor = formDatos.supervisor || comp.Supervisor || comp.TeamSupervisor || '';
    const agente = formDatos.agente || user.usuario || user.nombreCompleto || '';
    const vueloNo = vuelo.novuelo || comp.NoVuelo || '';
    const matricula = vuelo.Matricula || comp.Matricula || '';
    const puerta = formDatos.posicion || vuelo.puertaposicion || comp.Puerta || '';
    const unidad = formDatos.unidad || formDatos.noUnidad || '';
    const observaciones = formDatos.observaciones || comp.Observaciones || comp.Observacion || '';
    const firmaDataUrl = HtmlPreviewService.sanitizeSignatureDataUrl(formDatos.firmaBase64 || formDatos.firma);

    if (formatoId === 'amx-ciec') {
      const total = Math.max(20, rows.length);
      const filas = [];
      for (let i = 0; i < total; i++) {
        const r = rows[i] || {};
        const hIn = HtmlPreviewService.extractHHMM(r.HoraIngreso || r.HoraEntrada);
        const hOut = HtmlPreviewService.extractHHMM(r.HoraSalidaReal || r.HoraSalida || r.HoraSalidaEstimada);
        filas.push(`<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${esc(r.Nombre || '')}</td>
          <td style="text-align:center;">${esc(r.NoTIA || '')}</td>
          <td style="text-align:center;">${esc(r.Empresa || '')}</td>
          <td style="text-align:center;">${esc(hIn)}</td>
          <td>${esc(r.Motivo || '')}</td>
          <td style="text-align:center;">${esc(hOut)}</td>
        </tr>`);
      }

      return {
        Fecha: String(fechaRaw).substring(0, 10),
        HoraInicio: formDatos.horaInicio || HtmlPreviewService.extractHHMM(comp.HoraInicio),
        Vuelo: vueloNo,
        Supervisor: supervisor || 'SIN SUPERVISOR',
        Agente: agente,
        Matricula: matricula,
        FilasInOutHTML: filas.join(''),
        ArriboVuelo: HtmlPreviewService.extractHHMM(comp.ArriboDelVuelo || vuelo.ata),
        PrimerPax: HtmlPreviewService.extractHHMM(comp.PrimerPaxAbordo),
        AeronaveAsegurada: HtmlPreviewService.extractHHMM(comp.HoraAsegurado),
        UltimoPax: HtmlPreviewService.extractHHMM(comp.UltimoPaxAbordo),
        PasarelaAcoplada: HtmlPreviewService.extractHHMM(comp.PasarelaAcoplada),
        PaxAbordos: comp.PaxAbordos ?? '',
        PuertaAbierta: HtmlPreviewService.extractHHMM(comp.PuertaAbierta),
        PuertaCerrada: HtmlPreviewService.extractHHMM(comp.PuertaCerrada),
        EgresoTripulacion: HtmlPreviewService.extractHHMM(comp.EgresoTripulacion),
        DesacoplePasarela: HtmlPreviewService.extractHHMM(comp.DesacoplePasarela),
        IngresoTripulacion: HtmlPreviewService.extractHHMM(comp.IngresoTripulacion),
        TotalEquipajePuerta: comp.TotalEquipajePuerta ?? 0,
        PushBack: HtmlPreviewService.extractHHMM(comp.PushBack || formDatos.horaFin),
        PaxEntrandoGUA: comp.PaxEntrandoGUA ?? '',
        Despegue: HtmlPreviewService.extractHHMM(comp.Despegue),
        Observaciones: observaciones,
        EquipajePuertaHTML: comp.EquipajePuertaHTML || '',
        TractoristaUnidad: unidad || comp.TractoristaUnidad || '',
        AlerosText: comp.Aleros || '',
        FirmaOperador: comp.FirmaOperador || agente
      };
    }

    if (formatoId === 'amx-er') {
      const total = Math.max(15, rows.length);
      const filas = [];
      for (let i = 0; i < total; i++) {
        const r = rows[i] || {};
        filas.push(`<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${esc(r.Pasajero || r.Nombre || '')}</td>
          <td style="text-align:center;">${esc(r.Secuencia ?? '')}</td>
          <td style="text-align:center;">${esc(r.Colilla || '')}</td>
          <td style="text-align:center;">${esc(r.Vuelo || (r.Pasajero ? vueloNo : ''))}</td>
          <td style="text-align:center;">${esc(r.Destino || (r.Pasajero ? (vuelo.destino || '') : ''))}</td>
          <td style="text-align:center;">${esc(HtmlPreviewService.extractHHMM(r.HoraRevision || r.Hora))}</td>
          <td>${esc(r.AgenteAVSEC || r.Avsec || '')}</td>
          <td>${esc(r.CreadoPor || r.Seguridad || '')}</td>
        </tr>`);
      }

      return {
        Fecha: String(fechaRaw).substring(0, 10),
        FilasEquipajeHTML: filas.join(''),
        Observaciones: observaciones,
        FirmaFinal: firmaDataUrl,
        NombreFirmaSeguridad: supervisor || agente,
        TotalEquipajes: rows.length
      };
    }

    if (formatoId === 'amx-eb') {
      const seqSet = new Set(rows.map(r => Number(r.Secuencia || r.Valor)).filter(n => n > 0));
      let matrizRows = '';
      for (let row = 0; row < 10; row++) {
        matrizRows += '<tr>';
        for (let col = 1; col <= 10; col++) {
          const num = row * 10 + col;
          const marked = seqSet.has(num);
          matrizRows += `<td style="border:1px solid #000; width:16mm; height:7mm; text-align:center; font-size:9pt; font-weight:${marked ? 'bold' : 'normal'}; background:${marked ? '#e2e8f0' : '#fff'};">${num}</td>`;
        }
        matrizRows += '</tr>';
      }

      return {
        Fecha: String(fechaRaw).substring(0, 10),
        Supervisor: supervisor,
        Vuelo: vueloNo,
        Operador: vuelo.operador || comp.NombreOperador || 'AEROMEXICO',
        HoraInicio: formDatos.horaInicio || HtmlPreviewService.extractHHMM(comp.Hora),
        MatrizHTML: `<table style="border-collapse:collapse; margin: 0 auto;">${matrizRows}</table>`,
        Correos: comp.CorreosCantidad ?? 0,
        EqTransito: comp.EqTransitoCantidad ?? 0,
        HoraCierre: formDatos.horaFin || HtmlPreviewService.extractHHMM(comp.HoraCierre),
        Comat: comp.ComatCantidad ?? 0,
        TotalEquipajes: rows.length,
        Observaciones: observaciones
      };
    }

    if (formatoId === 'amx-cec') {
      const buildGrid = (titulo) => {
        let cells = '';
        for (let r = 0; r < 4; r++) {
          cells += '<tr>';
          for (let c = 1; c <= 10; c++) {
            const num = r * 10 + c;
            cells += `<td style="border:1px solid #000; text-align:center; font-size:8pt; padding:2px;">${num}</td>`;
          }
          cells += '</tr>';
        }
        return `<table style="width:100%; border-collapse:collapse;"><thead><tr><th colspan="10" style="border:1px solid #000; font-size:8pt; background:#e5e7eb;">${esc(titulo)}</th></tr></thead><tbody>${cells}</tbody></table>`;
      };

      const personalRows = (rows.length > 0 ? rows : [{}, {}, {}]).slice(0, 5).map((r, idx) => `
        <tr>
          <td style="border:1px solid #000; padding:2px 4px; font-size:8pt;">${idx + 1}</td>
          <td style="border:1px solid #000; padding:2px 4px; font-size:8pt;">${esc(r.Personal || r.Nombre || '')}</td>
          <td style="border:1px solid #000; padding:2px 4px; font-size:8pt;">${esc(r.Area || '')}</td>
        </tr>
      `).join('');

      return {
        HoraIniciaPuesto: formDatos.horaInicio || HtmlPreviewService.extractHHMM(comp.HoraIniciaPuesto),
        Supervisor: supervisor,
        Fecha: HtmlPreviewService.formatMMDDYYYY(fechaRaw),
        Agente: agente,
        Vuelo: vueloNo,
        Matricula: matricula,
        CompartimentoNo: comp.CompartimentoNo || unidad || '',
        PuertaNo: puerta,
        CompAbierto: HtmlPreviewService.extractHHMM(comp.CompAbierto),
        CompCerrado: HtmlPreviewService.extractHHMM(comp.CompCerrado),
        VueloEmbarque: vueloNo,
        TablaEmbarqueHTML: buildGrid('EMBARQUE (SECUENCIAS)'),
        VueloDesembarque: vueloNo,
        TablaDesembarqueHTML: buildGrid('DESEMBARQUE (SECUENCIAS)'),
        TablaPersonalHTML: `<table style="width:100%; border-collapse:collapse;"><thead><tr><th style="border:1px solid #000; font-size:8pt;">No.</th><th style="border:1px solid #000; font-size:8pt;">PERSONAL EN PLATAFORMA</th><th style="border:1px solid #000; font-size:8pt;">ÁREA</th></tr></thead><tbody>${personalRows}</tbody></table>`,
        DesembarqueInicio: HtmlPreviewService.extractHHMM(comp.DesembarqueInicio),
        DesembarqueFin: HtmlPreviewService.extractHHMM(comp.DesembarqueFin),
        EmbarqueInicio: HtmlPreviewService.extractHHMM(comp.EmbarqueInicio || formDatos.horaInicio),
        EmbarqueFin: HtmlPreviewService.extractHHMM(comp.EmbarqueFin || formDatos.horaFin),
        Observaciones: observaciones
      };
    }

    if (formatoId === 'amx-mecd') {
      const build4ColRows = (count, mapper) => {
        let out = '';
        for (let i = 0; i < count; i++) {
          const vals = mapper(rows[i] || {});
          out += `<tr><td>${esc(vals[0])}</td><td>${esc(vals[1])}</td><td>${esc(vals[2])}</td><td>${esc(vals[3])}</td></tr>`;
        }
        return out;
      };

      return {
        Fecha: HtmlPreviewService.formatMMDDYYYY(fechaRaw),
        NoVuelo: vueloNo,
        TablaRevision: build4ColRows(Math.max(4, rows.length), (r) => [r.Control || '', r.Colilla || '', '', '']),
        TablaConFirma: build4ColRows(4, (r) => [r.Pasajero || '', r.Colilla || '', r.Control || '', r.Destino || '']),
        TablaSinFirma: build4ColRows(4, () => ['', '', '', '']),
        FirmaAgente: firmaDataUrl,
        NombreAgente: agente,
        FirmaCCO: BLANK_IMG,
        NombreCCO: '',
        FirmaSupervisor: firmaDataUrl,
        NombreSupervisor: supervisor
      };
    }

    if (formatoId === 'amx-po') {
      const total = Math.max(13, rows.length);
      let filasHtml = '';
      for (let i = 0; i < total; i++) {
        const r = rows[i] || {};
        const pos = String(r.PosicionesPOId ?? r.PosicionPOId ?? '').trim();
        let posCells = '';
        for (let p = 1; p <= 11; p++) {
          posCells += `<td style="border: 1px solid black; padding: 4px; text-align: center;">${pos === String(p) ? 'X' : ''}</td>`;
        }
        filasHtml += `<tr>
          <td style="border: 1px solid black; padding: 4px; text-align: center; font-weight: bold;">${i + 1}</td>
          <td style="border: 1px solid black; padding: 4px;">${esc(r.Agentes || r.Nombre || '')}</td>
          ${posCells}
        </tr>`;
      }

      return {
        Fecha: HtmlPreviewService.formatMMDDYYYY(fechaRaw),
        LeadAgent: agente,
        Vuelo: vueloNo,
        FilasEquipajeHTML: filasHtml,
        Observaciones: observaciones,
        FirmaSupervisor: firmaDataUrl,
        NombreSupervisor: supervisor || agente
      };
    }

    return {};
  }

  /**
   * Renderiza el HTML controlado oficial sustituyendo expresiones de Power Automate
   */
  static renderHtmlPreview({ formatoId, vars = {}, meta = {} }) {
    const relPath = FORMAT_HTML_MAP[formatoId];
    if (!relPath) return null;

    const fullPath = path.join(FORMATOS_HTML_DIR, relPath);
    if (!fs.existsSync(fullPath)) return null;

    let html = fs.readFileSync(fullPath, 'utf8');
    const esc = HtmlPreviewService.escapeHtml;

    // 1. Logo corporativo de Aeroméxico
    const logoB64 = HtmlPreviewService.getLogoBase64('aeromexico.png');
    html = html.replace(
      /data:image\/png;base64,\s*@\{variables\('varLogoAeromexico'\)\}\s*/g,
      `data:image/png;base64,${logoB64}`
    );
    html = html.replace(/@\{variables\('varLogoAeromexico'\)\}\s*/g, logoB64);

    // 2. Expresión especial de Aleros en CIEC
    html = html.replace(
      /@\{join\(xpath\([\s\S]*?\/\/Usuario\/text\(\)'\),\s*', '\)\}/g,
      () => esc(vars.AlerosText || '')
    );

    // 3. Expresiones formatDateTime(body(...)?['Field'], 'dd/MM/yyyy')
    html = html.replace(
      /@\{formatDateTime\(\s*body\('[^']+'\)\?\['([^']+)'\]\s*,\s*'dd\/MM\/yyyy'\s*\)\}/g,
      (_, key) => esc(HtmlPreviewService.formatDDMMYYYY(vars[key]))
    );

    // 4. Variables escalares globales de firma como @{variables('FirmaFinal')}
    html = html.replace(/@\{variables\('([^']+)'\)\}/g, (_, key) => {
      if (SIGNATURE_KEYS.has(key)) return HtmlPreviewService.sanitizeSignatureDataUrl(vars[key]);
      return esc(vars[key] ?? '');
    });

    // 5. Campos body('Parse_JSON...')?['Key']
    html = html.replace(/@\{body\('[^']+'\)\?\['([^']+)'\]\}/g, (_, key) => {
      if (RAW_HTML_KEYS.has(key)) {
        return String(vars[key] ?? '');
      }
      if (SIGNATURE_KEYS.has(key)) {
        return HtmlPreviewService.sanitizeSignatureDataUrl(vars[key]);
      }
      return esc(vars[key] ?? '');
    });

    // 6. Barra flotante no imprimible (Imprimir / Cerrar) 100% CSP-safe
    const pendientes = Number(meta.pendientesSalidaCount || 0);
    const badgeWarn = pendientes > 0
      ? `<span class="sio-preview-warn">${pendientes} sin salida</span>`
      : '';

    const toolbarHtml = `
<div class="sio-preview-toolbar no-print">
  <span class="sio-preview-badge">VISTA PRELIMINAR</span>
  ${badgeWarn}
  <button type="button" id="btnPrintPreview" class="sio-preview-btn print">Imprimir / PDF</button>
  <button type="button" id="btnClosePreview" class="sio-preview-btn close">Cerrar</button>
</div>`.trim();

    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="/css/preview-toolbar.css">\n</head>`);
    html = html.replace(/<body([^>]*)>/i, `<body$1>\n${toolbarHtml}\n`);
    html = html.replace(/<\/body>/i, `  <script src="/js/formato-cp-preview.js"></script>\n</body>`);

    return html;
  }
}

module.exports = HtmlPreviewService;
