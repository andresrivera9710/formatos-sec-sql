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
  'amx-eb': 'AEROMEXICO/Control de Equipajes en Banda de Salida (Rayos X).html',
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
  'latam-liadc': 'LATAM/LISTA DE INSPECCION DE AERONAVE DE CARGA LATAM.txt'
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
      Aleros: cpDoc?.nombreAlerosDelta || [cpDoc?.alero1, cpDoc?.alero2].filter(Boolean).join(', ') || '',
      Observaciones: cpDoc?.observaciones || ''
    };
  }

  /**
   * Construye el diccionario de variables Power Automate para los otros formatos de Aeroméxico, Arajet y Delta
   */
  static buildAeromexicoOtherData({ formatoId, formDatos = {}, vuelo = {}, user = {}, datosPrevios = [], complementos = [], hydrated = {} }) {
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

    if (formatoId.endsWith('-ciec')) {
      const ciecData = formDatos.ciecPayload || formDatos || {};
      const liveRows = Array.isArray(ciecData.registros) ? ciecData.registros : null;
      const sourceRows = liveRows ? liveRows : rows;
      const total = Math.max(32, sourceRows.length);
      const filas = [];
      for (let i = 0; i < total; i++) {
        const r = sourceRows[i] || {};
        const hIn = HtmlPreviewService.extractHHMM(r.HoraIngreso || r.HoraEntrada);
        const hOut = HtmlPreviewService.extractHHMM(r.HoraSalidaReal || r.HoraSalida || r.HoraSalidaEstimada);
        const salidaHtml = (r.Nombre && !hOut)
          ? '<span style="color:#DC2626; font-weight:bold;">Pendiente</span>'
          : esc(hOut);
        filas.push(`<tr>
          <td style="border: 1px solid black; padding: 3px; text-align:center;">${i + 1}</td>
          <td style="border: 1px solid black; padding: 3px;">${esc(r.Nombre || '')}</td>
          <td style="border: 1px solid black; padding: 3px; text-align:center;">${esc(r.NoTIA || '')}</td>
          <td style="border: 1px solid black; padding: 3px; text-align:center;">${esc(r.Empresa || '')}</td>
          <td style="border: 1px solid black; padding: 3px; text-align:center;">${esc(hIn)}</td>
          <td style="border: 1px solid black; padding: 3px;">${esc(r.Motivo || '')}</td>
          <td style="border: 1px solid black; padding: 3px; text-align:center;">${salidaHtml}</td>
        </tr>`);
      }

      const rawEqPuerta = Array.isArray(ciecData.equipajePuerta)
        ? ciecData.equipajePuerta
        : (Array.isArray(hydrated?.ciecState?.equipajePuerta) ? hydrated.ciecState.equipajePuerta : []);
      const eqPuertaList = rawEqPuerta
        .map(x => String(x?.Valor ?? x?.Secuencia ?? x ?? '').trim())
        .filter(v => v && v.toUpperCase() !== 'X' && v !== '0');

      let equipajePuertaHtml = eqPuertaList.length > 0 ? esc(eqPuertaList.join(', ')) : esc(comp.EquipajePuertaHTML || '');
      if (formatoId === 'dl-ciec') {
        const totalEqRows = Math.max(5, Math.ceil(rawEqPuerta.length / 10));
        let eqRowsHtml = '';
        for (let rIdx = 0; rIdx < totalEqRows; rIdx++) {
          eqRowsHtml += '<tr>';
          for (let cIdx = 0; cIdx < 10; cIdx++) {
            const it = rawEqPuerta[rIdx * 10 + cIdx];
            let cellHtml = '&nbsp;';
            if (it !== undefined && it !== null) {
              const valStr = String(it?.Valor ?? it?.Secuencia ?? it ?? '').trim();
              if (valStr.toUpperCase() === 'X' || it?.EstaEliminado) {
                cellHtml = '<span style="color:#DC2626; font-weight:bold;">✗</span>';
              } else if (valStr !== '' && valStr !== '0') {
                cellHtml = esc(valStr);
              }
            }
            eqRowsHtml += `<td style="border: 1px solid #94a3b8; text-align:center; font-size:9px; font-weight:bold; height:15px; width:10%; padding:1px;">${cellHtml}</td>`;
          }
          eqRowsHtml += '</tr>';
        }
        equipajePuertaHtml = `<table style="width:100%; border-collapse:collapse;"><tbody>${eqRowsHtml}</tbody></table>`;
      }

      const tractoristaDelta = String(ciecData.tractoristaDelta || comp.TractoristaDelta || hydrated?.ciecState?.tractoristaDelta || ciecData.tractoristaNombre || '').trim();
      const maquinariaDelta = String(ciecData.maquinariaDelta || comp.MaquinariaDelta || hydrated?.ciecState?.maquinariaDelta || ciecData.noUnidadLabel || unidad || '').trim();
      const alerosDelta = String(ciecData.alerosDelta || comp.AlerosDelta || hydrated?.ciecState?.alerosDelta || '').trim();
      const tractoristaNombre = String(ciecData.tractoristaNombre || '').trim();
      const noUnidadLabel = String(ciecData.noUnidadLabel || unidad || '').trim();
      const tractoristaUnidad = (formatoId === 'dl-ciec'
        ? [tractoristaDelta, maquinariaDelta].filter(Boolean).join(' / ')
        : [tractoristaNombre, noUnidadLabel].filter(Boolean).join(' / ')
      ) || comp.TractoristaUnidad || '';
      const alerosText = (formatoId === 'dl-ciec' && alerosDelta)
        ? alerosDelta
        : (Array.isArray(ciecData.alerosNombres)
          ? ciecData.alerosNombres.filter(Boolean).join(', ')
          : (ciecData.alerosText || comp.Aleros || ''));

      return {
        Fecha: String(ciecData.fecha || fechaRaw).substring(0, 10),
        HoraInicio: HtmlPreviewService.extractHHMM(ciecData.horaInicio || comp.HoraInicio),
        Vuelo: vueloNo,
        Supervisor: ciecData.supervisorNombre || supervisor || 'SIN SUPERVISOR',
        Agente: ciecData.agente || agente,
        Matricula: matricula,
        FilasInOutHTML: filas.join(''),
        ArriboVuelo: HtmlPreviewService.extractHHMM(ciecData.arriboVuelo || comp.ArriboVuelo || vuelo.ata),
        PrimerPax: HtmlPreviewService.extractHHMM(ciecData.primerPax || comp.PrimerPax),
        AeronaveAsegurada: HtmlPreviewService.extractHHMM(ciecData.aeronaveAsegurada || comp.AeronaveAsegurada),
        UltimoPax: HtmlPreviewService.extractHHMM(ciecData.ultimoPax || comp.UltimoPax),
        PasarelaAcoplada: HtmlPreviewService.extractHHMM(ciecData.pasarelaAcoplada || comp.PasarelaAcoplada),
        PaxAbordos: ciecData.paxAbordos !== undefined ? ciecData.paxAbordos : (comp.PaxAbordos ?? ''),
        PuertaAbierta: HtmlPreviewService.extractHHMM(ciecData.puertaAbierta || comp.PuertaAbierta),
        PuertaCerrada: HtmlPreviewService.extractHHMM(ciecData.puertaCerrada || comp.PuertaCerrada),
        EgresoTripulacion: HtmlPreviewService.extractHHMM(ciecData.egresoTripulacion || comp.EgresoTripulacion),
        DesacoplePasarela: HtmlPreviewService.extractHHMM(ciecData.desacoplePasarela || comp.DesacoplePasarela),
        IngresoTripulacion: HtmlPreviewService.extractHHMM(ciecData.ingresoTripulacion || comp.IngresoTripulacion),
        TotalEquipajePuerta: eqPuertaList.length > 0 ? eqPuertaList.length : (comp.TotalEquipaje ?? 0),
        PushBack: HtmlPreviewService.extractHHMM(ciecData.pushBack || comp.PushBack),
        PaxEntrandoGUA: ciecData.paxEntrando !== undefined ? ciecData.paxEntrando : (comp.PaxEntrando ?? ''),
        Despegue: HtmlPreviewService.extractHHMM(ciecData.despegue || comp.Despegue),
        Observaciones: ciecData.observaciones !== undefined ? ciecData.observaciones : observaciones,
        EquipajePuertaHTML: equipajePuertaHtml,
        TractoristaUnidad: tractoristaUnidad,
        AlerosText: alerosText,
        Aleros: alerosText,
        FirmaOperador: ciecData.agente || comp.FirmaOperador || agente
      };
    }

    if (formatoId.endsWith('-er')) {
      const erData = formDatos.erPayload || formDatos || {};
      const liveRows = Array.isArray(erData.registros) ? erData.registros : null;
      const sourceRows = liveRows && liveRows.length > 0 ? liveRows : rows;
      const fechaEr = erData.fecha || fechaRaw;
      const obsEr = erData.observaciones !== undefined ? erData.observaciones : observaciones;
      const firmaEr = HtmlPreviewService.sanitizeSignatureDataUrl(
        erData.firmaBase64 || erData.firma || formDatos.firmaBase64 || formDatos.firma
      );
      const nombreSeguridadEr = erData.agente || user.usuario || agente;

      const total = Math.max(15, sourceRows.length);
      const filas = [];
      for (let i = 0; i < total; i++) {
        const r = sourceRows[i] || {};
        const tieneDatos = Boolean(r.Pasajero || r.Nombre || r.Colilla || r.Secuencia);
        const destinoVal = r.Destino || (tieneDatos ? (vuelo.Destino || vuelo.destino || 'N/A') : '');
        const secCell = formatoId === 'dl-er'
          ? ''
          : `\n          <td style="text-align:center;">${esc(r.Secuencia ?? '')}</td>`;
        filas.push(`<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${esc(r.Pasajero || r.Nombre || '')}</td>${secCell}
          <td style="text-align:center;">${esc(r.Colilla || '')}</td>
          <td style="text-align:center;">${esc(r.Vuelo || (tieneDatos ? vueloNo : ''))}</td>
          <td style="text-align:center;">${esc(destinoVal)}</td>
          <td style="text-align:center;">${esc(HtmlPreviewService.extractHHMM(r.HoraRevision || r.Hora))}</td>
          <td>${esc(r.AgenteAVSEC || r.Avsec || '')}</td>
          <td>${esc(r.AgenteSeguridad || r.CreadoPor || r.Seguridad || '')}</td>
        </tr>`);
      }

      return {
        Fecha: String(fechaEr).substring(0, 10),
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
      const liveRows = Array.isArray(ebData.registros)
        ? ebData.registros
        : (Array.isArray(ebData.detalles) ? ebData.detalles : null);
      const sourceRows = liveRows ? liveRows : rows.map((r, idx) => ({
        Orden: idx + 1,
        Secuencia: r.Secuencia,
        Valor: String(r.Secuencia || ''),
        Motivo: ''
      }));

      const totalFilas = Math.max(15, Math.ceil(sourceRows.length / 10));
      let matrizHTML = '';
      if (formatoId === 'ara-eb') {
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
        matrizHTML = `<table class='matriz-table' style='width: 100%; border-collapse: collapse; font-family: Segoe UI, sans-serif;'><thead><tr>${thCols}</tr></thead><tbody>${bodyRows}</tbody></table>`;
      } else {
        let matrizRows = '';
        for (let fila = 1; fila <= totalFilas; fila++) {
          matrizRows += '<tr>';
          for (let col = 1; col <= 10; col++) {
            const idx = (fila - 1) * 10 + col - 1;
            const reg = sourceRows[idx];
            const secStr = reg && reg.Secuencia !== undefined && reg.Secuencia !== null ? esc(reg.Secuencia) : '';
            const isAnulado = reg && String(reg.Valor || '').toUpperCase() === 'X';
            const tacheHtml = isAnulado ? `<div class='tache'>✗</div>` : '';
            matrizRows += `<td>${secStr}${tacheHtml}</td>`;
          }
          matrizRows += '</tr>';
        }
        matrizHTML = `<table class='matriz-table'><tbody>${matrizRows}</tbody></table>`;
      }

      const activosCount = sourceRows.filter(r => r && String(r.Valor || '').toUpperCase() !== 'X' && Number(r.Secuencia) > 0).length;
      const anulados = sourceRows.filter(r => r && String(r.Valor || '').toUpperCase() === 'X' && r.Motivo);
      const baseObs = ebData.observaciones !== undefined ? String(ebData.observaciones || '').trim() : String(observaciones || '').trim();
      const obsConMotivos = anulados.length > 0 && !baseObs.includes('Motivos de anulación:')
        ? `${baseObs ? `${baseObs} | ` : ''}Motivos de anulación: ${anulados.map(a => `Sec. ${a.Secuencia}: ${a.Motivo}`).join(', ')}`
        : baseObs;

      return {
        Fecha: String(ebData.fecha || fechaRaw).substring(0, 10),
        Supervisor: ebData.supervisorNombre || supervisor || '',
        Vuelo: vueloNo,
        Operador: ebData.nombreOperador || comp.NombreOperador || user.usuario || agente,
        HoraInicio: HtmlPreviewService.extractHHMM(ebData.horaInicio || comp.Hora),
        MatrizHTML: matrizHTML,
        Correos: ebData.correos !== undefined ? ebData.correos : (comp.CorreosCantidad ?? 0),
        EqTransito: ebData.eqTransito !== undefined ? ebData.eqTransito : (comp.EqTransitoCantidad ?? 0),
        HoraCierre: HtmlPreviewService.extractHHMM(ebData.horaCierre || ebData.horaFin || comp.HoraCierre),
        Comat: ebData.comat !== undefined ? ebData.comat : (comp.ComatCantidad ?? 0),
        TotalEquipajes: activosCount,
        Observaciones: obsConMotivos
      };
    }

    if (formatoId.endsWith('-cec')) {
      const cecData = formDatos.cecPayload || formDatos || {};
      const liveSecs = Array.isArray(cecData.secuencias)
        ? cecData.secuencias
        : (Array.isArray(cecData.detalles) ? cecData.detalles : null);
      const sourceSecs = liveSecs ? liveSecs : rows.map((r, idx) => ({
        Orden: idx + 1,
        Secuencia: r.Secuencia,
        Valor: String(r.Secuencia || ''),
        Motivo: ''
      }));

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
            if (String(reg.Valor || '').toUpperCase() === 'X' || Number(reg.Secuencia) === 0 || reg.EstaEliminado) {
              cellContent = `<div style='position: absolute; top: -2px; left: 0; width: 100%; height: 100%; color: red; font-size: 20px; font-weight: bold;'>✗</div>`;
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

      const eqRecp = Number(cecData.equipaje !== undefined ? cecData.equipaje : (comp.Equipaje ?? 0)) || 0;
      const carrRecp = Number(cecData.carruajes !== undefined ? cecData.carruajes : (comp.Carruajes ?? 0)) || 0;
      const corrRecp = Number(cecData.correos !== undefined ? cecData.correos : (comp.Correos ?? 0)) || 0;
      const cargRecp = Number(cecData.carga !== undefined ? cecData.carga : (comp.Carga ?? 0)) || 0;
      const totalDesembarque = eqRecp + carrRecp + corrRecp + cargRecp;
      const sinEtiqueta = Number(cecData.cantidadSinEtiqueta !== undefined ? cecData.cantidadSinEtiqueta : (comp.CantidadSinEtiqueta ?? 0)) || 0;
      const conEtiqueta = Number(cecData.cantidadConEtiqueta !== undefined ? cecData.cantidadConEtiqueta : (comp.CantidadConEtiqueta ?? 0)) || 0;

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

      const oirsaNom = esc(cecData.nombreOirsa ?? comp.NombreOirsa ?? '');
      const oirsaTia = esc(cecData.tiaOirsa ?? comp.TIAOirsa ?? '');
      const combParts = String(comp.NombreCombustible || '').split(/[,/]/);
      const combTiaParts = String(comp.TIACombustible || '').split(/[,/]/);
      const pilotoComb = esc(cecData.pilotoCombustible ?? combParts[0] ?? '');
      const ayudComb = esc(cecData.ayudanteCombustible ?? combParts[1] ?? '');
      const tiaPilComb = esc(cecData.tiaPilotoCombustible ?? combTiaParts[0] ?? '');
      const tiaAyudComb = esc(cecData.tiaAyudanteCombustible ?? combTiaParts[1] ?? '');
      const combUni = esc(cecData.noUnidadCombustible ?? comp.NoUnidadCombustible ?? '');
      const combIn = esc(HtmlPreviewService.extractHHMM(cecData.combustibleEntrada ?? comp.CombustibleEntrada));
      const combOut = esc(HtmlPreviewService.extractHHMM(cecData.combustibleSalida ?? comp.CombustibleSalida));

      const cocParts = String(comp.NombreCocinas || '').split(/[,/]/);
      const cocTiaParts = String(comp.TIACocinas || '').split(/[,/]/);
      const pilotoCoc = esc(cecData.pilotoCocinas ?? cocParts[0] ?? '');
      const ayudCoc = esc(cecData.ayudanteCocinas ?? cocParts[1] ?? '');
      const tiaPilCoc = esc(cecData.tiaPilotoCocinas ?? cocTiaParts[0] ?? '');
      const tiaAyudCoc = esc(cecData.tiaAyudanteCocinas ?? cocTiaParts[1] ?? '');
      const cocUni = esc(cecData.noUnidadCocinas ?? comp.NoUnidadCocinas ?? '');
      const cocIn = esc(HtmlPreviewService.extractHHMM(cecData.cocinasEntrada ?? comp.CocinasEntrada));
      const cocOut = esc(HtmlPreviewService.extractHHMM(cecData.cocinasSalida ?? comp.CocinasSalida));

      const opRampa = Array.isArray(cecData.operadoresRampa)
        ? esc(cecData.operadoresRampa.filter(Boolean).join(' / '))
        : esc(cecData.operadoresRampa ?? comp.OperadoresRampa ?? '');

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
        </tbody>
      </table>`;

      const oirsaRaw = String(cecData.nombreOirsa ?? comp.NombreOirsa ?? '').trim();
      const oirsaTiaRaw = String(cecData.tiaOirsa ?? comp.TIAOirsa ?? '').trim();
      const combPartsRaw = String(comp.NombreCombustible || '').split(/[,/]/);
      const combTiaRaw = String(comp.TIACombustible || '').split(/[,/]/);
      const pilCombRaw = String(cecData.pilotoCombustible ?? combPartsRaw[0] ?? '').trim();
      const ayCombRaw = String(cecData.ayudanteCombustible ?? combPartsRaw[1] ?? '').trim();
      const tPilCombRaw = String(cecData.tiaPilotoCombustible ?? combTiaRaw[0] ?? '').trim();
      const tAyCombRaw = String(cecData.tiaAyudanteCombustible ?? combTiaRaw[1] ?? '').trim();
      const combUniRaw = String(cecData.noUnidadCombustible ?? comp.NoUnidadCombustible ?? '').trim();
      const combInRaw = HtmlPreviewService.extractHHMM(cecData.combustibleEntrada ?? comp.CombustibleEntrada);
      const combOutRaw = HtmlPreviewService.extractHHMM(cecData.combustibleSalida ?? comp.CombustibleSalida);

      const cocPartsRaw = String(comp.NombreCocinas || '').split(/[,/]/);
      const cocTiaRaw = String(comp.TIACocinas || '').split(/[,/]/);
      const pilCocRaw = String(cecData.pilotoCocinas ?? cocPartsRaw[0] ?? '').trim();
      const ayCocRaw = String(cecData.ayudanteCocinas ?? cocPartsRaw[1] ?? '').trim();
      const tPilCocRaw = String(cecData.tiaPilotoCocinas ?? cocTiaRaw[0] ?? '').trim();
      const tAyCocRaw = String(cecData.tiaAyudanteCocinas ?? cocTiaRaw[1] ?? '').trim();
      const cocUniRaw = String(cecData.noUnidadCocinas ?? comp.NoUnidadCocinas ?? '').trim();
      const cocInRaw = HtmlPreviewService.extractHHMM(cecData.cocinasEntrada ?? comp.CocinasEntrada);
      const cocOutRaw = HtmlPreviewService.extractHHMM(cecData.cocinasSalida ?? comp.CocinasSalida);

      const opRampaRaw = Array.isArray(cecData.operadoresRampa)
        ? cecData.operadoresRampa.filter(Boolean).join(' / ')
        : String(cecData.operadoresRampa ?? comp.OperadoresRampa ?? '').trim();

      let tablaEmbarqueOut = tablaEmbarqueHTML;
      if (formatoId === 'dl-cec') {
        const embDelta = hydrated?.cecState?.embarqueDelta || {};
        const cargaDelta = Number(cecData.cargaEmbarqueDelta ?? embDelta.Carga ?? comp.CargaEmbarqueDelta ?? 0) || 0;
        const eqMostrador = Number(cecData.equipajeMostrador ?? embDelta.EquipajeMostrador ?? comp.EquipajeMostrador ?? 0) || 0;
        const eqPuertaDelta = Number(cecData.equipajePuerta ?? embDelta.EquipajePuerta ?? comp.EquipajePuerta ?? 0) || 0;
        tablaEmbarqueOut += `<table style='width:100%; border-collapse:collapse; margin-top:4px; font-size:10px;'>
          <tr>
            <td style='border:1px solid black; padding:2px 4px;'><b>CARGA:</b> ${cargaDelta}</td>
            <td style='border:1px solid black; padding:2px 4px;'><b>EQ. MOSTRADOR:</b> ${eqMostrador}</td>
            <td style='border:1px solid black; padding:2px 4px;'><b>EQ. PUERTA:</b> ${eqPuertaDelta}</td>
          </tr>
        </table>`;
      }

      return {
        HoraIniciaPuesto: HtmlPreviewService.extractHHMM(cecData.horaInicio || comp.HoraInicio),
        Supervisor: cecData.supervisor || supervisor,
        Fecha: HtmlPreviewService.formatMMDDYYYY(cecData.fecha || fechaRaw),
        Agente: cecData.agente || comp.Agente || agente,
        Vuelo: vueloNo,
        Matricula: matricula,
        CompartimentoNo: cecData.compartimientoNo || comp.CompartimientoNo || '',
        PuertaNo: puerta,
        CompAbierto: HtmlPreviewService.extractHHMM(cecData.compAbierto || comp.CompAbierto),
        CompCerrado: HtmlPreviewService.extractHHMM(cecData.compCerrado || comp.CompCerrado),
        VueloEmbarque: vueloNo,
        TablaEmbarqueHTML: tablaEmbarqueOut,
        VueloDesembarque: vueloNo,
        TablaDesembarqueHTML: tablaDesembarqueHTML,
        TablaPersonalHTML: tablaPersonalHTML,
        Oirsa: [oirsaRaw, oirsaTiaRaw ? `(TIA: ${oirsaTiaRaw})` : ''].filter(Boolean).join(' '),
        Combustible: `${pilCombRaw}${tPilCombRaw ? ` (TIA: ${tPilCombRaw})` : ''}${ayCombRaw ? ` / ${ayCombRaw}${tAyCombRaw ? ` (TIA: ${tAyCombRaw})` : ''}` : ''}`,
        CombustibleUnidad: combUniRaw,
        CombustibleLlegaSale: [combInRaw, combOutRaw].filter(Boolean).join(' / '),
        Cocinas: `${pilCocRaw}${tPilCocRaw ? ` (TIA: ${tPilCocRaw})` : ''}${ayCocRaw ? ` / ${ayCocRaw}${tAyCocRaw ? ` (TIA: ${tAyCocRaw})` : ''}` : ''}`,
        CocinasUnidad: cocUniRaw,
        CocinasLlegaSale: [cocInRaw, cocOutRaw].filter(Boolean).join(' / '),
        OpRampa: opRampaRaw,
        DesembarqueInicio: HtmlPreviewService.extractHHMM(cecData.desembarqueInicio || comp.DesembarqueHoraInicio),
        DesembarqueFin: HtmlPreviewService.extractHHMM(cecData.desembarqueFinal || comp.DesembarqueHoraFinal),
        EmbarqueInicio: HtmlPreviewService.extractHHMM(cecData.embarqueInicio || comp.EmbarqueHoraInicio),
        EmbarqueFin: HtmlPreviewService.extractHHMM(cecData.embarqueFinal || comp.EmbarqueHoraFinal),
        Observaciones: cecData.observaciones || observaciones || 'N/A'
      };
    }

    if (formatoId === 'amx-mecd') {
      const mecdData = formDatos.mecdPayload || formDatos || {};
      const revList = Array.isArray(mecdData.revisiones)
        ? mecdData.revisiones
        : (Array.isArray(mecdData.revision) ? mecdData.revision : []);
      const cfList = Array.isArray(mecdData.conFirma) ? mecdData.conFirma : [];
      const sfList = Array.isArray(mecdData.sinFirma) ? mecdData.sinFirma : [];

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

      return {
        Fecha: HtmlPreviewService.formatMMDDYYYY(mecdData.fecha || fechaRaw),
        NoVuelo: vueloNo,
        TablaRevision: tablaRevisionHtml,
        TablaConFirma: buildDamageRows(cfList, 12),
        TablaSinFirma: buildDamageRows(sfList, 5),
        FirmaAgente: HtmlPreviewService.sanitizeSignatureDataUrl(mecdData.firmaAgente || firmaDataUrl),
        NombreAgente: mecdData.agenteNombre || agente,
        FirmaCCO: HtmlPreviewService.sanitizeSignatureDataUrl(mecdData.firmaCCO),
        NombreCCO: mecdData.ccoNombre || '',
        FirmaSupervisor: HtmlPreviewService.sanitizeSignatureDataUrl(mecdData.firmaSupervisor || firmaDataUrl),
        NombreSupervisor: mecdData.supervisorNombre || supervisor
      };
    }

    if (formatoId === 'amx-po') {
      const poData = formDatos.poPayload || formDatos || {};
      const liveRows = Array.isArray(poData.registros)
        ? poData.registros
        : (Array.isArray(poData.detalles) ? poData.detalles : null);
      const sourceRows = liveRows ? liveRows : rows;
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
          <td style="border: 1px solid black; padding: 4px;">${esc(r.Agentes || r.Usuario || r.Nombre || '')}</td>
          ${posCells}
        </tr>`;
      }

      return {
        Fecha: HtmlPreviewService.formatMMDDYYYY(poData.fecha || fechaRaw),
        LeadAgent: poData.leadAgent || user.usuario || agente,
        Vuelo: vueloNo,
        FilasEquipajeHTML: filasHtml,
        Observaciones: poData.observaciones !== undefined ? poData.observaciones : observaciones,
        FirmaSupervisor: HtmlPreviewService.sanitizeSignatureDataUrl(poData.firmaSupervisor || poData.firmaBase64 || firmaDataUrl),
        NombreSupervisor: poData.supervisorNombre || supervisor || agente
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
      const sagList = Array.isArray(rxData.personalSAG)
        ? rxData.personalSAG
        : (hydrated?.rxState?.personalSAG || []);
      const laatsList = Array.isArray(rxData.personalLaats)
        ? rxData.personalLaats
        : (hydrated?.rxState?.personalLaats || []);

      const totalSag = Math.max(6, sagList.length);
      let sagHtml = '';
      for (let i = 0; i < totalSag; i++) {
        const s = sagList[i] || {};
        sagHtml += `<tr>
          <td>${esc(s.Nombre || '')}</td>
          <td style="text-align:center;">${esc(s.Id || s.Identificacion || s.NoTIA || '')}</td>
        </tr>`;
      }

      const totalLaats = Math.max(6, laatsList.length);
      let laatsHtml = '';
      for (let i = 0; i < totalLaats; i++) {
        const l = laatsList[i] || {};
        laatsHtml += `<tr>
          <td>${esc(l.Nombre || '')}</td>
          <td style="text-align:center;">${esc(l.Id || l.Identificacion || l.NoTIA || '')}</td>
        </tr>`;
      }

      return {
        HoraIniciaPuesto: HtmlPreviewService.extractHHMM(rxData.horaInicio || encDb.HoraInicio),
        Supervisor: rxData.supervisorNombre || supervisor || encDb.Supervisor || '',
        Fecha: HtmlPreviewService.formatMMDDYYYY(rxData.fecha || encDb.Fecha || fechaRaw),
        Agente: rxData.agente || user.usuario || agente,
        Vuelo: vueloNo,
        PEquipajeRecibidoRX: HtmlPreviewService.extractHHMM(rxData.pEquipajeRecibidoRX || encDb.PEquipajeRecibidoRX),
        PCarretaEnviada: HtmlPreviewService.extractHHMM(rxData.pCarretaEnviada || encDb.PCarretaEnviada),
        UEquipajeRX: HtmlPreviewService.extractHHMM(rxData.uEquipajeRX || encDb.UEquipajeRX),
        UCarretaEnviada: HtmlPreviewService.extractHHMM(rxData.uCarretaEnviada || encDb.UCarretaEnviada),
        TablaSAG_HTML: sagHtml,
        TablaLAATS_HTML: laatsHtml,
        Observaciones: rxData.observaciones !== undefined ? rxData.observaciones : (encDb.Observaciones || observaciones)
      };
    }

    if (formatoId === 'dl-cll') {
      const cllData = formDatos.cllPayload || formDatos || {};
      const liveRows = Array.isArray(cllData.registros)
        ? cllData.registros
        : (hydrated?.cllState?.detalles || rows);
      const total = Math.max(21, liveRows.length);
      let tablaHtml = '';
      for (let i = 0; i < total; i++) {
        const r = liveRows[i] || {};
        tablaHtml += `<tr>
          <td style="text-align:center;">${esc(r.Guia || '')}</td>
          <td>${esc(r.Contenido || '')}</td>
          <td style="text-align:center;">${r.Piezas !== undefined && r.Piezas !== null && r.Piezas !== '' ? esc(r.Piezas) : ''}</td>
          <td style="text-align:center;">${esc(r.BIN || '')}</td>
        </tr>`;
      }

      const securityAgent = cllData.agenteSeguridad || comp.AgenteSeguridad || '';
      const deltaAgent = cllData.agenteDelta || comp.AgenteDelta || '';
      const sharedTia = cllData.agenteTIA || comp.AgenteTIA || '';

      return {
        Flight: vueloNo,
        Date: HtmlPreviewService.formatMMDDYYYY(cllData.fecha || fechaRaw),
        Station: cllData.station || 'GUA',
        TablaHTML: tablaHtml,
        FirmaSecurity: HtmlPreviewService.sanitizeSignatureDataUrl(cllData.firmaSecurity),
        SecurityAgent: securityAgent,
        TiaSecurity: cllData.tiaSecurity || sharedTia,
        FirmaLD: HtmlPreviewService.sanitizeSignatureDataUrl(cllData.firmaLD),
        AgenteLD: deltaAgent,
        TiaLD: cllData.tiaLD || sharedTia
      };
    }

    if (formatoId === 'dl-sp') {
      const spData = formDatos.spPayload || formDatos || {};
      const liveRows = Array.isArray(spData.registros)
        ? spData.registros
        : (hydrated?.spState?.detalles || []);
      const selNames = { 1: 'R Random', 2: 'S Selected', 3: 'I Interview' };

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
        tablaPaxHtml += `<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${esc(r.Apellido || '')}</td>
          <td>${esc(r.Nombre || '')}</td>
          <td style="text-align:center;">${esc(selLabel)}</td>
          <td style="text-align:center;">${esc(r.Asiento || '')}</td>
          <td style="text-align:center;">${hasRow ? esc(r.BCN ?? '') : ''}</td>
          <td>${esc(r.NombreAgente || '')}</td>
        </tr>`;
      }

      return {
        Date: HtmlPreviewService.formatMMDDYYYY(spData.fecha || hydrated?.spState?.encabezado?.Fecha || fechaRaw),
        Flight: vueloNo,
        TablaPaxHTML: tablaPaxHtml,
        TotalRandom: totalRandom,
        TotalSelected: totalSelected,
        TotalInterview: totalInterview,
        TotalGeneral: totalRandom + totalSelected + totalInterview,
        NombreSupervisor: spData.supervisorNombre || supervisor || hydrated?.spState?.encabezado?.CreadoPor || agente
      };
    }

    if (formatoId === 'dl-dal') {
      const dalData = formDatos.dalPayload || formDatos || {};
      const dalDb = hydrated?.dalState?.detalle || {};
      const evalParts = String(dalData.evaluadores || dalDb.Evaluadores || '').split(',').map(s => s.trim());
      const revXRay = dalData.revisadoXRay !== undefined ? dalData.revisadoXRay : dalDb.RevisadoXRay;
      const bolsasIng = dalData.bolsasIngresadas !== undefined ? dalData.bolsasIngresadas : dalDb.BolsasIngresadas;
      const eqCoincide = dalData.eqCoincidePasajero !== undefined ? dalData.eqCoincidePasajero : dalDb.EqCoincidePasajero;
      const isTrue = (v) => v === true || v === 1 || String(v).toUpperCase() === 'YES' || String(v).toLowerCase() === 'true';

      const guard1 = dalData.nombreGuardia ?? dalDb.NombreGuardia ?? '';
      const guard2 = dalData.nombreGuardia2 ?? dalDb.NombreGuardia2 ?? '';
      const guard3 = dalData.nombreGuardia3 ?? dalDb.NombreGuardia3 ?? '';
      const agentesGate = dalData.nombreAgentes ?? dalDb.NombreAgentes ?? '';
      const guardEscolta = dalData.nombreGuardiaEscolta ?? dalDb.NombreGuardiaEscolta ?? '';

      return {
        Flight: vueloNo,
        Route: dalData.route || `${vuelo.origen || 'GUA'} - ${vuelo.destino || ''}`,
        AC: matricula,
        Date: HtmlPreviewService.formatMMDDYYYY(dalData.fecha || fechaRaw),
        XRayYesNo: isTrue(revXRay) ? 'YES' : 'NO',
        BagsSearched: dalData.cantidadEqFisicos ?? dalDb.CantidadEqFisicos ?? 0,
        Screener1: dalData.screener1 || evalParts[0] || '',
        Screener2: dalData.screener2 || evalParts[1] || '',
        Screener3: dalData.screener3 || evalParts[2] || '',
        Sup: dalData.screenerSup || evalParts[3] || dalData.supervisorNombre || '',
        GuardSig1: dalData.guardSig1 || guard1,
        BagsLoggedYesNo: isTrue(bolsasIng) ? 'YES' : 'NO',
        BagsUSEntry: dalData.cantidadEq ?? dalDb.CantidadEq ?? 0,
        GuardSig2: guard2,
        BagsLoadedForward: dalData.cantidadEqGuardia ?? dalDb.CantidadEqGuardia ?? 0,
        CargoLoadedForward: dalData.cantidadMaletas ?? dalDb.CantidadMaletas ?? 0,
        GuardSig3: dalData.guardSig3 || guard1,
        CargoManifested: dalData.cantidadPiezasManifiesto ?? dalDb.CantidadPiezasManifiesto ?? 0,
        CargoCheckedSig: dalData.cargoCheckedSig || guard3,
        CargoEscortedBakSig: dalData.cargoEscortedBakSig || agentesGate,
        CargoEscortedAircraftSig: dalData.cargoEscortedAircraftSig || guardEscolta,
        ThroughPassengers: dalData.cantidadPasajerosTransito ?? dalDb.CantidadPasajerosTransito ?? 0,
        DepartingPassengers: dalData.cantidadPasajerosSalientes ?? dalDb.CantidadPasajerosSalientes ?? 0,
        MissingPassengers: dalData.pasajerosPerdieronVuelo ?? dalDb.PasajerosPerdieronVuelo ?? '0',
        NamesMissingPassengers: dalData.nombresPasajerosPerdieron || '',
        FreightAccepted: dalData.cantidadPiezasAceptadas ?? dalDb.CantidadPiezasAceptadas ?? 0,
        FreightLoaded: dalData.cantidadPiezasCargadas ?? dalDb.CantidadPiezasCargadas ?? 0,
        BagsCheckedIn: dalData.cantidadEqFacturados ?? dalDb.CantidadEqFacturados ?? 0,
        BagsLoaded: dalData.cantidadEqCargadas ?? dalDb.CantidadEqCargadas ?? 0,
        BagsOffLoaded: dalData.cantidadEqRetirados ?? dalDb.CantidadEqRetirados ?? 0,
        MatchMissingYesNo: isTrue(eqCoincide) ? 'YES' : 'NO',
        GuardSupSig: dalData.supervisorNombre || supervisor || agente,
        FirmaGuardSup: dalData.firmaGuardSup || '',
        DLAgent: dalData.nombreAgenteDelta ?? dalDb.NombreAgenteDelta ?? '',
        FirmaDLAgent: dalData.firmaDLAgent || ''
      };
    }

    if (formatoId === 'dl-sel') {
      const selData = formDatos.selPayload || formDatos || {};
      const selDb = hydrated?.selState?.detalle || {};

      return {
        Flight: vueloNo,
        Date: HtmlPreviewService.formatMMDDYYYY(selData.fecha || fechaRaw),
        AircraftArrived: selData.aircraftArrived || HtmlPreviewService.formatMMDDYYYY(vuelo.FechaItinerado || fechaRaw),
        Time: HtmlPreviewService.extractHHMM(selData.aircraftArrivedTime || vuelo.ata),
        Guard: selData.guard || selData.supervisorNombre || supervisor || agente,
        PassengerLineClosed: HtmlPreviewService.extractHHMM(selData.horaCierreFila || selDb.HoraCierreFila),
        NumPassengersInLine: selData.cantidadPasajerosFila ?? selDb.CantidadPasajerosFila ?? 0,
        LastPassengerCheckedIn: HtmlPreviewService.extractHHMM(selData.horaChequeadoFila || selDb.HoraChequeadoFila),
        FirstBagsSniffed: HtmlPreviewService.extractHHMM(selData.primerEqRevisada || selDb.PrimerEqRevisada),
        LastBagsSniffed: HtmlPreviewService.extractHHMM(selData.ultimoEqRevisado || selDb.UltimoEqRevisado),
        FirstBagsArriveGate: HtmlPreviewService.extractHHMM(selData.primerEqPuerta || selDb.PrimerEqPuerta),
        LastBagsArriveGate: HtmlPreviewService.extractHHMM(selData.ultimoEqPuerta || selDb.UltimoEqPuerta),
        PassengersArrivedGate: selData.cantidadPasajerosEmbarque ?? selDb.CantidadPasajerosEmbarque ?? 0,
        PassengersCommenceBoarding: HtmlPreviewService.extractHHMM(selData.horaInicioEmbarque || selDb.HoraInicioEmbarque),
        LastPassengerLeavesGate: HtmlPreviewService.extractHHMM(selData.horaUltimoAbandona || selDb.HoraUltimoAbandona),
        UnloadingComplete: HtmlPreviewService.extractHHMM(selData.horaDescargaEqCarga || selDb.HoraDescargaEqCarga),
        LoadingBegins: HtmlPreviewService.extractHHMM(selData.horaInicioEqCarga || selDb.HoraInicioEqCarga),
        CargoDoorsClosed: HtmlPreviewService.extractHHMM(selData.horaPuertasCerradasCar || selDb.HoraPuertasCerradasCar),
        CabinDoorsClosed: HtmlPreviewService.extractHHMM(selData.horaPuertasCerradasCab || selDb.HoraPuertasCerradasCab),
        AircraftBeginsTaxi: HtmlPreviewService.extractHHMM(selData.horaInicioRodajeNave || selDb.HoraInicioRodajeNave),
        Comments: selData.observaciones !== undefined ? selData.observaciones : (selDb.Observaciones || observaciones),
        SupervisorName: selData.supervisorNombre || supervisor || agente,
        FirmaSupervisor: selData.firmaSupervisor || ''
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
      const sigVal = ass.firmaBase64 !== undefined ? ass.firmaBase64 : (ass.signature !== undefined ? ass.signature : (metaDb.signature || ''));

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
        LeadSignature: pickRaw(b.leadSignature, dm.leadSignature, ''),
        CSMName: pickRaw(b.csmName, dm.csmName, ''),
        CSMSignature: pickRaw(b.csmSignature, dm.csmSignature, '')
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
        FirmaInspector: l.firmaInspector !== undefined ? l.firmaInspector : (metaDb.firmaInspector || ''),
        SupervisorNombre: supervisorNombre,
        FirmaSupervisor: l.firmaSupervisor !== undefined ? l.firmaSupervisor : (metaDb.firmaSupervisor || ''),
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
  static renderHtmlPreview({ formatoId, vars = {}, meta = {} }) {
    const relPath = FORMAT_HTML_MAP[formatoId];
    if (!relPath) return null;

    const fullPath = path.join(FORMATOS_HTML_DIR, relPath);
    if (!fs.existsSync(fullPath)) return null;

    let html = fs.readFileSync(fullPath, 'utf8');
    const esc = HtmlPreviewService.escapeHtml;

    // 1. Logos corporativos (Aeroméxico, Arajet, Delta y Air Canada)
    const logoAmxB64 = HtmlPreviewService.getLogoBase64('aeromexico.png');
    html = html.replace(
      /data:image\/png;base64,\s*@\{variables\('varLogoAeromexico'\)\}\s*/g,
      `data:image/png;base64,${logoAmxB64}`
    );
    html = html.replace(/@\{variables\('varLogoAeromexico'\)\}\s*/g, logoAmxB64);

    const logoAraB64 = HtmlPreviewService.getLogoBase64('arajet.png');
    html = html.replace(
      /data:image\/png;base64,\s*@\{variables\('varLogoArajet'\)\}\s*/g,
      `data:image/png;base64,${logoAraB64}`
    );
    html = html.replace(/@\{variables\('varLogoArajet'\)\}\s*/g, logoAraB64);

    const logoDeltaB64 = HtmlPreviewService.getLogoBase64('delta.png');
    html = html.replace(
      /data:image\/png;base64,\s*@\{variables\('varLogoDelta'\)\}\s*/gi,
      `data:image/png;base64,${logoDeltaB64}`
    );
    html = html.replace(/@\{variables\('varLogoDelta'\)\}\s*/gi, logoDeltaB64);

    const logoAirCanadaB64 = HtmlPreviewService.getLogoBase64('air-canada.png');
    html = html.replace(
      /data:image\/png;base64,\s*@\{variables\('varLogoAirCanada'\)\}\s*/gi,
      `data:image/png;base64,${logoAirCanadaB64}`
    );
    html = html.replace(/@\{variables\('varLogoAirCanada'\)\}\s*/gi, logoAirCanadaB64);

    const logoLatamB64 = HtmlPreviewService.getLogoBase64('latam-cargo.png');
    html = html.replace(
      /data:image\/png;base64,\s*@\{variables\('varLogoLatam'\)\}\s*/gi,
      `data:image/png;base64,${logoLatamB64}`
    );
    html = html.replace(/@\{variables\('varLogoLatam'\)\}\s*/gi, logoLatamB64);

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
      if (SIGNATURE_KEYS.has(key)) return HtmlPreviewService.sanitizeSignatureDataUrl(vars[key]);
      return esc(vars[key] ?? '');
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
          varLogoAeromexico: logoAmxB64,
          varLogoArajet: logoAraB64,
          varLogoDelta: logoDeltaB64,
          varLogoAirCanada: logoAirCanadaB64,
          varLogoLatam: logoLatamB64,
          FirmaFinal: vars.FirmaFinal || ''
        }
      });
    }

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
