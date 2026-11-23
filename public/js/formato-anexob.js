/**
 * formato-anexob.js — Annex B: Aircraft Cabin Search Report (AircraftCabinSearchReport_B_1 / ac-anexob - AIR CANADA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaAnexoB');
  const stateEl = document.getElementById('anexoBInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[ANEXOB INIT PARSE ERROR]', err);
  }

  const esc = (val) => {
    if (Validator && typeof Validator.escapeHtml === 'function') return Validator.escapeHtml(val);
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  function extractHHMM(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('T') && s.length >= 16) return s.substring(11, 16);
    const m = s.match(/(\d{2}:\d{2})/);
    return m ? m[1] : '';
  }

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const formatoId = document.getElementById('axBFormatoId')?.value || initialState.formatoId || 'ac-anexob';
  const itinerarioId = parseInt(document.getElementById('axBItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('axBEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const normalizeAnexoBZones = (list) => (Array.isArray(list) ? list : []).slice(0, 5).map((z) => ({
    EmployeeInfo: String(z.EmployeeInfo || '').trim(),
    Zone: String(z.Zone || '').trim(),
    SearchType: String(z.SearchType || 'Física').trim().toLowerCase() === 'visual' ? 'Visual' : 'Física',
    TimeStarted: extractHHMM(z.TimeStarted),
    TimeCompleted: extractHHMM(z.TimeCompleted),
    Remarks: String(z.Remarks || '').trim()
  }));

  let zonesSearch = normalizeAnexoBZones(initialState.zonesSearch);
  const initialZonesBaseline = zonesSearch.map((z) => ({ ...z }));

  const DEFAULT_ZONE_NAMES = [
    'Zone 1 - Flight Deck & Fwd Galley',
    'Zone 2 - Forward Cabin',
    'Zone 3 - Mid Cabin / Overwing',
    'Zone 4 - Aft Cabin',
    'Zone 5 - Aft Galley & Crew Rest'
  ];

  const selectTipoOp = document.getElementById('axBTipoOperacion');
  const hintOp = document.getElementById('axBHintOperacion');
  const inputFecha = document.getElementById('axBFecha');
  const inputDeparture = document.getElementById('axBDepartureStation');
  const inputOrigin = document.getElementById('axBOriginInbound');
  const inputDestination = document.getElementById('axBDestinationOutbound');
  const inputStartTime = document.getElementById('axBSearchStartTime');
  const inputEndTime = document.getElementById('axBTimeSearchCompleted');
  const selectGenSearch = document.getElementById('axBGeneralSearchType');

  const selectIdVal = document.getElementById('axBIdValidationRequired');
  const inputIdReport = document.getElementById('axBIdValidationReport');
  const reqIdStar = document.getElementById('axBReqIdReportStar');
  const inputLeadName = document.getElementById('axBLeadName');
  const inputLeadEmpNo = document.getElementById('axBLeadEmployeeNumber');
  const inputCsmName = document.getElementById('axBCsmName');

  const leadSigBox = document.getElementById('axBLeadSignatureBox');
  const csmSigBox = document.getElementById('axBCsmSignatureBox');
  const canvasLead = document.getElementById('axBCanvasLeadFirma');
  const canvasCsm = document.getElementById('axBCanvasCsmFirma');
  const noticeLeadSig = document.getElementById('axBNoticeLeadFirma');
  const noticeCsmSig = document.getElementById('axBNoticeCsmFirma');

  const leadPad = canvasLead && typeof window.SioSignaturePad === 'function' ? new window.SioSignaturePad(canvasLead) : null;
  const csmPad = canvasCsm && typeof window.SioSignaturePad === 'function' ? new window.SioSignaturePad(canvasCsm) : null;

  let savedLeadSig = String(initialState.leadSignature || '').trim();
  let savedCsmSig = String(initialState.csmSignature || '').trim();

  const tbody = document.getElementById('axBTbodyZones');
  const gridWrapper = document.getElementById('axBGridWrapper');
  const zonasBadge = document.getElementById('axBZonasBadge');
  const btnAgregarZona = document.getElementById('btnAxBAgregarZona');

  document.getElementById('btnAxBStartTimeAhora')?.addEventListener('click', () => {
    if (inputStartTime) {
      inputStartTime.value = nowHHMM();
      inputStartTime.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  document.getElementById('btnAxBEndTimeAhora')?.addEventListener('click', () => {
    if (inputEndTime) {
      inputEndTime.value = nowHHMM();
      inputEndTime.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  document.getElementById('btnLimpiarLeadFirmaAnexoB')?.addEventListener('click', () => {
    if (leadPad?.isLocked?.()) return;
    if (leadPad) leadPad.clear();
    savedLeadSig = '';
    if (noticeLeadSig) noticeLeadSig.style.display = 'none';
  });
  document.getElementById('btnLimpiarCsmFirmaAnexoB')?.addEventListener('click', () => {
    if (csmPad?.isLocked?.()) return;
    if (csmPad) csmPad.clear();
    savedCsmSig = '';
    if (noticeCsmSig) noticeCsmSig.style.display = 'none';
  });

  function actualizarUiOperacion() {
    const op = selectTipoOp?.value || 'Tránsito';
    const starsP1 = form.querySelectorAll('.axb-req-p1');
    starsP1.forEach((s) => {
      s.style.display = op === 'Despacho' ? 'none' : 'inline';
    });

    if (hintOp) {
      if (op === 'Recepción') {
        hintOp.textContent = 'Modo Recepción: la Parte 1 (Tiempos y Checklist General de Hoja 1) es obligatoria; las Zonas (Parte 2) son opcionales.';
      } else if (op === 'Despacho') {
        hintOp.textContent = 'Modo Despacho: debe registrar al menos una (1) zona en la Parte 2 (Zones 1 - 5); la Parte 1 es opcional.';
      } else {
        hintOp.textContent = 'Modo Tránsito: tanto la Parte 1 (Tiempos y Checklist General) como la Parte 2 (al menos 1 zona inspeccionada) son obligatorias.';
      }
    }
  }

  function actualizarUiIdValidation() {
    const required = (selectIdVal?.value || 'NO') === 'SÍ';
    if (reqIdStar) reqIdStar.style.display = required ? 'inline' : 'none';
  }

  selectTipoOp?.addEventListener('change', actualizarUiOperacion);
  selectIdVal?.addEventListener('change', actualizarUiIdValidation);

  function getLeadSig() {
    if (leadPad && !leadPad.isEmpty()) return leadPad.toDataURL();
    return savedLeadSig || '';
  }

  function getCsmSig() {
    if (csmPad && !csmPad.isEmpty()) return csmPad.toDataURL();
    return savedCsmSig || '';
  }

  function renderZonas() {
    if (zonasBadge) zonasBadge.textContent = `${zonesSearch.length} / 5 Zonas`;
    if (btnAgregarZona) btnAgregarZona.disabled = zonesSearch.length >= 5;
    if (!tbody) return;

    if (zonesSearch.length === 0) {
      tbody.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="8" style="text-align:center; padding:22px; color:var(--text-3);">
            No hay zonas registradas. Haga clic en "Agregar Zona" para capturar Zones 1 - 5.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = zonesSearch.map((z, idx) => `
      <tr data-index="${idx}">
        <td style="text-align:center; font-weight:700;">Zone ${idx + 1}</td>
        <td>
          <input type="text" class="form-control axb-zone-input" data-field="EmployeeInfo" maxlength="150" value="${esc(z.EmployeeInfo)}" placeholder="Nombre / No. TIA">
        </td>
        <td>
          <input type="text" class="form-control axb-zone-input" data-field="Zone" list="axBZonasSugeridas" maxlength="150" value="${esc(z.Zone)}" placeholder="Ej. Zone ${idx + 1} - Cabin">
        </td>
        <td>
          <select class="form-control axb-zone-input" data-field="SearchType">
            <option value="Física" ${z.SearchType === 'Física' ? 'selected' : ''}>Física</option>
            <option value="Visual" ${z.SearchType === 'Visual' ? 'selected' : ''}>Visual</option>
          </select>
        </td>
        <td>
          <div class="cp-time-row">
            <input type="time" class="form-control axb-zone-input" data-field="TimeStarted" value="${esc(z.TimeStarted)}">
            <button type="button" class="cp-clock-btn axb-zone-start-ahora" title="Hora actual"><i class="far fa-clock"></i></button>
          </div>
        </td>
        <td>
          <div class="cp-time-row">
            <input type="time" class="form-control axb-zone-input" data-field="TimeCompleted" value="${esc(z.TimeCompleted)}">
            <button type="button" class="cp-clock-btn axb-zone-end-ahora" title="Hora actual"><i class="far fa-clock"></i></button>
          </div>
        </td>
        <td>
          <input type="text" class="form-control axb-zone-input" data-field="Remarks" maxlength="500" value="${esc(z.Remarks)}" placeholder="(Opcional)">
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-danger axb-btn-eliminar-zona" style="padding:5px 9px; font-size:11px;" title="Eliminar zona">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  tbody?.addEventListener('input', (e) => {
    const target = e.target;
    if (!target.classList.contains('axb-zone-input')) return;
    const tr = target.closest('tr[data-index]');
    const idx = tr ? parseInt(tr.dataset.index, 10) : -1;
    const field = target.dataset.field;
    if (idx >= 0 && field && zonesSearch[idx]) {
      zonesSearch[idx][field] = target.value;
    }
  });

  tbody?.addEventListener('change', (e) => {
    const target = e.target;
    if (!target.classList.contains('axb-zone-input')) return;
    const tr = target.closest('tr[data-index]');
    const idx = tr ? parseInt(tr.dataset.index, 10) : -1;
    const field = target.dataset.field;
    if (idx >= 0 && field && zonesSearch[idx]) {
      zonesSearch[idx][field] = target.value;
    }
  });

  tbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-index]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.index, 10);
    if (Number.isNaN(idx) || !zonesSearch[idx]) return;

    if (e.target.closest('.axb-zone-start-ahora')) {
      const now = nowHHMM();
      zonesSearch[idx].TimeStarted = now;
      const el = tr.querySelector('[data-field="TimeStarted"]');
      if (el) { el.value = now; el.classList.remove('sio-field-invalid'); }
      return;
    }
    if (e.target.closest('.axb-zone-end-ahora')) {
      const now = nowHHMM();
      zonesSearch[idx].TimeCompleted = now;
      const el = tr.querySelector('[data-field="TimeCompleted"]');
      if (el) { el.value = now; el.classList.remove('sio-field-invalid'); }
      return;
    }
    if (e.target.closest('.axb-btn-eliminar-zona')) {
      zonesSearch.splice(idx, 1);
      renderZonas();
    }
  });

  btnAgregarZona?.addEventListener('click', () => {
    if (zonesSearch.length >= 5) {
      Swal.fire({
        icon: 'warning',
        title: 'Límite de Zonas Alcanzado',
        text: 'El formato Annex B contempla un máximo de 5 zonas (Zones 1 - 5).',
        confirmButtonColor: '#275B88'
      });
      return;
    }
    const nextIdx = zonesSearch.length;
    zonesSearch.push({
      EmployeeInfo: '',
      Zone: DEFAULT_ZONE_NAMES[nextIdx] || `Zone ${nextIdx + 1}`,
      SearchType: selectGenSearch?.value || 'Física',
      TimeStarted: nowHHMM(),
      TimeCompleted: '',
      Remarks: ''
    });
    renderZonas();
  });

  function getChecklistValues() {
    const out = {};
    form.querySelectorAll('.axb-check-select').forEach((sel) => {
      const key = sel.dataset.checkKey;
      if (key) out[key] = sel.value || 'Realizado';
    });
    return out;
  }

  function recopilarPayload() {
    const checks = getChecklistValues();
    return {
      noVuelo: document.getElementById('axBNoVuelo')?.value || initialState.noVuelo || '',
      matricula: document.getElementById('axBMatricula')?.value || initialState.matricula || '',
      tipoOperacion: selectTipoOp?.value || 'Tránsito',
      fecha: inputFecha?.value || '',
      departureStation: String(inputDeparture?.value || '').trim().toUpperCase(),
      originInbound: String(inputOrigin?.value || '').trim(),
      destinationOutbound: String(inputDestination?.value || '').trim(),
      searchStartTime: inputStartTime?.value || '',
      timeSearchCompleted: inputEndTime?.value || '',
      generalSearchType: selectGenSearch?.value || 'Física',
      overheadBins: checks.overheadBins || 'Realizado',
      closetsStorageCrew: checks.closetsStorageCrew || 'Realizado',
      lavatoriesAndSeals: checks.lavatoriesAndSeals || 'Realizado',
      seatsUnderPocketsBetween: checks.seatsUnderPocketsBetween || 'Realizado',
      seatBacksPocketsTrays: checks.seatBacksPocketsTrays || 'Realizado',
      galleyAreasAndTrolleys: checks.galleyAreasAndTrolleys || 'Realizado',
      seatsUnderCushions: checks.seatsUnderCushions || 'Realizado',
      lifeVestPackagesHolders: checks.lifeVestPackagesHolders || 'Realizado',
      crewRestAreas: checks.crewRestAreas || 'N/A',
      idValidationRequired: selectIdVal?.value || 'NO',
      idValidationReport: String(inputIdReport?.value || '').trim(),
      leadSupervisorLoginId: initialState.leadSupervisorLoginId || 1,
      leadName: String(inputLeadName?.value || '').trim(),
      leadEmployeeNumber: String(inputLeadEmpNo?.value || '').trim(),
      leadSignature: getLeadSig(),
      csmName: String(inputCsmName?.value || '').trim(),
      csmSignature: getCsmSig(),
      zonesSearch: zonesSearch.map((z) => ({
        EmployeeInfo: String(z.EmployeeInfo || '').trim(),
        Zone: String(z.Zone || '').trim(),
        SearchType: z.SearchType || 'Física',
        TimeStarted: String(z.TimeStarted || '').trim(),
        TimeCompleted: String(z.TimeCompleted || '').trim(),
        Remarks: String(z.Remarks || '').trim()
      }))
    };
  }

  function validarFrontend() {
    if (!Validator) return true;
    const op = selectTipoOp?.value || 'Tránsito';
    const requiereParte1 = op !== 'Despacho';
    const requiereParte2 = op !== 'Recepción';
    const idReq = (selectIdVal?.value || 'NO') === 'SÍ';
    const rowElements = Array.from(tbody?.querySelectorAll('tr[data-index]') || []);

    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        { field: 'fecha', label: 'Fecha (Date)', element: inputFecha, required: true, type: 'date' },
        { field: 'departureStation', label: 'Departure Station', element: inputDeparture, required: true, type: 'string', maxLength: 20 },
        { field: 'originInbound', label: 'Origin Inbound', element: inputOrigin, required: true, type: 'string', maxLength: 100 },
        { field: 'destinationOutbound', label: 'Destination Outbound', element: inputDestination, required: true, type: 'string', maxLength: 100 },
        { field: 'searchStartTime', label: 'Search Start Time (Parte 1)', element: inputStartTime, required: requiereParte1, type: 'time' },
        { field: 'timeSearchCompleted', label: 'Time Search Completed (Parte 1)', element: inputEndTime, required: requiereParte1, type: 'time' },
        { field: 'idValidationReport', label: 'ID Validation Report', element: inputIdReport, required: idReq, type: 'string', maxLength: 2000 },
        { field: 'leadName', label: 'Lead / Supervisor Name', element: inputLeadName, required: true, type: 'string', maxLength: 150 },
        { field: 'leadEmployeeNumber', label: 'Lead Employee Number / TIA', element: inputLeadEmpNo, required: true, type: 'string', maxLength: 50 },
        {
          field: 'leadSignature',
          label: 'Lead Signature (LAATS)',
          element: canvasLead,
          highlightElement: leadSigBox,
          getValue: getLeadSig,
          required: true,
          requiredMessage: 'debe trazar la firma digital del Supervisor / Lead.'
        }
      ],
      gridContainer: gridWrapper,
      rowElements,
      rowRules: rowElements.length > 0 ? [
        { field: 'EmployeeInfo', label: 'Employee Info (Nombre / TIA)', required: true, type: 'string', maxLength: 150 },
        { field: 'Zone', label: 'Zona de Cabina', required: true, type: 'string', maxLength: 150 },
        { field: 'SearchType', label: 'Search Type', required: true, type: 'string' },
        { field: 'TimeStarted', label: 'Time Started', required: true, type: 'time' },
        { field: 'TimeCompleted', label: 'Time Completed', required: true, type: 'time' }
      ] : [],
      minRows: requiereParte2 ? 1 : 0,
      emptyRowsMessage: `Operación de ${op}: debe agregar al menos una (1) zona en Parte 2 antes de guardar.`,
      emptyRowsFocusElement: btnAgregarZona
    });
    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Annex B');
      return false;
    }
    return true;
  }

  async function enviarFormato(guardar) {
    if (guardar && !validarFrontend()) return;

    let previewWin = null;
    if (!guardar) {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try { previewWin.document.title = 'Generando Vista Preliminar...'; } catch (_) {}
      }
    }

    const anexoBPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Annex B (Air Canada)...' : 'Generando Vista Preliminar...',
          'Procesando información en Azure SQL...'
        );
      }

      const res = await fetch('/api/formatos/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          formatoId,
          itinerarioId,
          encabezadoId: encabezadoId || null,
          guardar,
          datos: { anexoBPayload }
        })
      });
      const json = await res.json();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();

      if (!res.ok || !json.success) {
        if (previewWin && !previewWin.closed) previewWin.close();
        if (Validator && Array.isArray(json.errors) && json.errors.length > 0) {
          Validator.applyBackendErrors(json.errors, {
            root: form,
            headerElementMap: {
              fecha: inputFecha,
              departureStation: inputDeparture,
              originInbound: inputOrigin,
              destinationOutbound: inputDestination,
              searchStartTime: inputStartTime,
              timeSearchCompleted: inputEndTime,
              idValidationReport: inputIdReport,
              leadName: inputLeadName,
              leadEmployeeNumber: inputLeadEmpNo,
              leadSignature: leadSigBox
            },
            gridContainer: gridWrapper
          });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error de Validación', text: json.message || 'No se pudo procesar Annex B.', confirmButtonColor: '#DC2626' });
        return;
      }

      if (!guardar) {
        if (json.previewUrl) {
          if (previewWin && !previewWin.closed) {
            previewWin.location.href = json.previewUrl;
            previewWin.focus();
          } else {
            window.open(json.previewUrl, '_blank', 'noopener,noreferrer');
          }
        }
        return;
      }

      if (json.encabezadoId) {
        encabezadoId = parseInt(json.encabezadoId, 10) || encabezadoId;
        const encEl = document.getElementById('axBEncabezadoId');
        if (encEl) encEl.value = String(encabezadoId);
      }
      if (json.firmasRepo) {
        window.SioSignatureRepoClient?.applyRepoState?.(json.firmasRepo);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Annex B guardado correctamente.',
        timer: 1100,
        showConfirmButton: false
      });
      if (json.previewUrl) {
        window.location.href = json.previewUrl;
      } else {
        window.location.href = '/formatos';
      }
    } catch (err) {
      if (previewWin && !previewWin.closed) previewWin.close();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();
      Swal.fire({ icon: 'error', title: 'Error de Red', text: 'No se pudo comunicar con el servidor.', confirmButtonColor: '#DC2626' });
    }
  }

  document.getElementById('btnVistaPreliminarAnexoB')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoAnexoB')?.addEventListener('click', () => enviarFormato(true));

  actualizarUiOperacion();
  actualizarUiIdValidation();
  renderZonas();

  window.SioOfflineManager?.registerStateAdapter?.('format:anexob', {
    capture: () => ({
      zonesSearch: zonesSearch.map((z) => ({ ...z }))
    }),
    restore: (saved) => {
      const list = Array.isArray(saved) ? saved : (Array.isArray(saved?.zonesSearch) ? saved.zonesSearch : null);
      if (!list) return;
      zonesSearch = normalizeAnexoBZones(list);
      renderZonas();
      actualizarUiOperacion();
      actualizarUiIdValidation();
    },
    reset: () => {
      zonesSearch = initialZonesBaseline.map((z) => ({ ...z }));
      renderZonas();
      actualizarUiOperacion();
      actualizarUiIdValidation();
    },
    mapLegacyPatch: (patch) => (Array.isArray(patch?.zonesSearch) ? { zonesSearch: patch.zonesSearch } : undefined)
  });
});
