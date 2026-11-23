/**
 * formato-ass.js — Aircraft Security Search (AircraftSecuritySearch / ac-ass - AIR CANADA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaASS');
  const stateEl = document.getElementById('assInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[ASS INIT PARSE ERROR]', err);
  }

  const formatoId = document.getElementById('assFormatoId')?.value || initialState.formatoId || 'ac-ass';
  const itinerarioId = parseInt(document.getElementById('assItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('assEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const inputFecha = document.getElementById('assFecha');
  const inputDeparture = document.getElementById('assDepartureStation');
  const inputOrigin = document.getElementById('assOriginInbound');
  const inputDestination = document.getElementById('assDestinationOutbound');
  const inputHoraInicio = document.getElementById('assHoraInicio');
  const inputHoraFin = document.getElementById('assHoraFin');
  const selectTipoBusqueda = document.getElementById('assTipoBusqueda');
  const inputSupervisor = document.getElementById('assSupervisorNombre');
  const inputCompany = document.getElementById('assCompany');
  const inputEmpleadoNo = document.getElementById('assEmpleadoNo');
  const inputObservaciones = document.getElementById('assObservaciones');

  const sigBox = document.getElementById('assSignatureBox');
  const canvasFirma = document.getElementById('assCanvasFirma');
  const noticeFirma = document.getElementById('assNoticeFirmaExistente');
  const sigPad = canvasFirma && typeof window.SioSignaturePad === 'function'
    ? new window.SioSignaturePad(canvasFirma)
    : null;
  let savedSignature = String(initialState.signature || '').trim();

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  document.getElementById('btnAssHoraInicioAhora')?.addEventListener('click', () => {
    if (inputHoraInicio) {
      inputHoraInicio.value = nowHHMM();
      inputHoraInicio.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  document.getElementById('btnAssHoraFinAhora')?.addEventListener('click', () => {
    if (inputHoraFin) {
      inputHoraFin.value = nowHHMM();
      inputHoraFin.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  document.getElementById('btnLimpiarFirmaASS')?.addEventListener('click', () => {
    if (sigPad?.isLocked?.()) return;
    if (sigPad) sigPad.clear();
    savedSignature = '';
    if (noticeFirma) noticeFirma.style.display = 'none';
  });

  function updateChecklistLabels() {
    const map = [
      { chk: 'assChkOverheadBins', lbl: 'assLblOverheadBins' },
      { chk: 'assChkClosetsStorage', lbl: 'assLblClosetsStorage' },
      { chk: 'assChkLavatories', lbl: 'assLblLavatories' },
      { chk: 'assChkSeatsUnder', lbl: 'assLblSeatsUnder' },
      { chk: 'assChkSeatBacksTrays', lbl: 'assLblSeatBacksTrays' },
      { chk: 'assChkGalleyAreas', lbl: 'assLblGalleyAreas' },
      { chk: 'assChkUnderSeatCushions', lbl: 'assLblUnderSeatCushions' },
      { chk: 'assChkLifeVestPackages', lbl: 'assLblLifeVestPackages' },
      { chk: 'assChkCrewRestAreasNA', lbl: 'assLblCrewRestAreasNA' }
    ];
    map.forEach(({ chk, lbl }) => {
      const c = document.getElementById(chk);
      const l = document.getElementById(lbl);
      if (!c || !l) return;
      const mode = c.dataset.mode || 'done';
      if (mode === 'na-flag') {
        l.textContent = c.checked ? 'N/A (✓)' : 'Done (✓)';
      } else if (mode === 'done-or-na') {
        l.textContent = c.checked ? 'Done (✓)' : 'N/A (✓)';
      } else {
        l.textContent = c.checked ? 'Done (✓)' : 'Sin marcar';
      }
    });
  }

  form.querySelectorAll('.ass-check-item').forEach((chk) => {
    chk.addEventListener('change', updateChecklistLabels);
  });

  document.getElementById('btnAssMarcarTodo')?.addEventListener('click', () => {
    const isPhysical = (selectTipoBusqueda?.value || 'PHYSICAL') === 'PHYSICAL';
    [
      'assChkOverheadBins',
      'assChkClosetsStorage',
      'assChkLavatories',
      'assChkSeatsUnder',
      'assChkSeatBacksTrays',
      'assChkGalleyAreas'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = true;
    });
    const cushions = document.getElementById('assChkUnderSeatCushions');
    const vests = document.getElementById('assChkLifeVestPackages');
    if (cushions) cushions.checked = isPhysical;
    if (vests) vests.checked = isPhysical;
    updateChecklistLabels();
  });

  function getEffectiveSignature() {
    if (sigPad && !sigPad.isEmpty()) {
      return sigPad.toDataURL();
    }
    return savedSignature || '';
  }

  function recopilarPayload() {
    return {
      noVuelo: document.getElementById('assNoVuelo')?.value || initialState.noVuelo || '',
      matricula: document.getElementById('assMatricula')?.value || initialState.matricula || '',
      fecha: inputFecha?.value || '',
      departureStation: String(inputDeparture?.value || '').trim().toUpperCase(),
      originInbound: String(inputOrigin?.value || '').trim(),
      destinationOutbound: String(inputDestination?.value || '').trim(),
      horaInicio: inputHoraInicio?.value || '',
      horaFin: inputHoraFin?.value || '',
      tipoBusqueda: selectTipoBusqueda?.value || 'PHYSICAL',
      supervisorNombre: String(inputSupervisor?.value || '').trim(),
      company: String(inputCompany?.value || '').trim(),
      empleadoNo: String(inputEmpleadoNo?.value || '').trim(),
      observaciones: String(inputObservaciones?.value || '').trim(),
      firmaBase64: getEffectiveSignature(),
      checks: {
        OverheadBins: Boolean(document.getElementById('assChkOverheadBins')?.checked),
        ClosetsStorage: Boolean(document.getElementById('assChkClosetsStorage')?.checked),
        Lavatories: Boolean(document.getElementById('assChkLavatories')?.checked),
        SeatsUnder: Boolean(document.getElementById('assChkSeatsUnder')?.checked),
        SeatBacksTrays: Boolean(document.getElementById('assChkSeatBacksTrays')?.checked),
        GalleyAreas: Boolean(document.getElementById('assChkGalleyAreas')?.checked),
        UnderSeatCushions: Boolean(document.getElementById('assChkUnderSeatCushions')?.checked),
        LifeVestPackages: Boolean(document.getElementById('assChkLifeVestPackages')?.checked),
        CrewRestAreasNA: Boolean(document.getElementById('assChkCrewRestAreasNA')?.checked)
      }
    };
  }

  function validarFrontend() {
    if (!Validator) return true;
    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        { field: 'fecha', label: 'Fecha (Date)', element: inputFecha, required: true, type: 'date' },
        { field: 'departureStation', label: 'Departure Station', element: inputDeparture, required: true, type: 'string', maxLength: 20 },
        { field: 'originInbound', label: 'Origin Inbound', element: inputOrigin, required: true, type: 'string', maxLength: 100 },
        { field: 'destinationOutbound', label: 'Destination Outbound', element: inputDestination, required: true, type: 'string', maxLength: 100 },
        { field: 'horaInicio', label: 'Search Start Time', element: inputHoraInicio, required: true, type: 'time' },
        { field: 'horaFin', label: 'Time Search Completed', element: inputHoraFin, required: true, type: 'time' },
        { field: 'tipoBusqueda', label: 'Type of Search Performed', element: selectTipoBusqueda, required: true, type: 'string' },
        { field: 'supervisorNombre', label: 'Team Supervisor / Lead Name', element: inputSupervisor, required: true, type: 'string', maxLength: 150 },
        { field: 'company', label: 'Company Name', element: inputCompany, required: true, type: 'string', maxLength: 100 },
        { field: 'empleadoNo', label: 'Employee No. / TIA', element: inputEmpleadoNo, required: true, type: 'integer', min: 1 },
        {
          field: 'firmaBase64',
          label: 'Inspector / Supervisor Signature',
          element: canvasFirma,
          highlightElement: sigBox,
          getValue: getEffectiveSignature,
          required: true,
          requiredMessage: 'debe trazar su firma digital antes de guardar.'
        }
      ],
      minRows: 0
    });
    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Aircraft Security Search');
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

    const assPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Aircraft Security Search...' : 'Generando Vista Preliminar...',
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
          datos: { assPayload }
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
              horaInicio: inputHoraInicio,
              horaFin: inputHoraFin,
              tipoBusqueda: selectTipoBusqueda,
              supervisorNombre: inputSupervisor,
              company: inputCompany,
              empleadoNo: inputEmpleadoNo,
              firmaBase64: sigBox
            }
          });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error de Validación', text: json.message || 'No se pudo procesar el formato.', confirmButtonColor: '#DC2626' });
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
        const encEl = document.getElementById('assEncabezadoId');
        if (encEl) encEl.value = String(encabezadoId);
      }
      if (json.firmasRepo) {
        window.SioSignatureRepoClient?.applyRepoState?.(json.firmasRepo);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Aircraft Security Search guardado correctamente.',
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

  document.getElementById('btnVistaPreliminarASS')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoASS')?.addEventListener('click', () => enviarFormato(true));

  updateChecklistLabels();
});
