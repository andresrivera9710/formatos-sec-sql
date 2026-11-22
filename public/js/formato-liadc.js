/**
 * formato-liadc.js — Lista de Inspección de Aeronave de Carga (latam-liadc - LAN CARGO / LATAM)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaLIADC');
  const stateEl = document.getElementById('liadcInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[LIADC INIT PARSE ERROR]', err);
  }

  const formatoId = document.getElementById('liadcFormatoId')?.value || initialState.formatoId || 'latam-liadc';
  const itinerarioId = parseInt(document.getElementById('liadcItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('liadcEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const inputFecha = document.getElementById('liadcFecha');
  const inputPuente = document.getElementById('liadcPuente');
  const inputArribo = document.getElementById('liadcArriboVuelo');
  const inputHoraInicio = document.getElementById('liadcHoraInicio');
  const inputHoraTermino = document.getElementById('liadcHoraTermino');
  const selectSupervisor = document.getElementById('liadcSupLaats');
  const inputIniciales = document.getElementById('liadcIniciales');
  const inputInspectorNombre = document.getElementById('liadcInspectorNombre');
  const inputSupervisorNombre = document.getElementById('liadcSupervisorNombre');
  const inputObservaciones = document.getElementById('liadcObservaciones');
  const notifGroup = document.getElementById('liadcNotificacionGroup');
  const contadorChecks = document.getElementById('liadcContadorChecks');

  const sigBoxInsp = document.getElementById('liadcSignatureBoxInspector');
  const canvasFirmaInsp = document.getElementById('liadcCanvasFirmaInspector');
  const noticeFirmaInsp = document.getElementById('liadcNoticeFirmaInspector');
  const sigPadInsp = canvasFirmaInsp && typeof window.SioSignaturePad === 'function'
    ? new window.SioSignaturePad(canvasFirmaInsp)
    : null;
  let savedFirmaInsp = String(initialState.firmaInspector || '').trim();

  const sigBoxSup = document.getElementById('liadcSignatureBoxSupervisor');
  const canvasFirmaSup = document.getElementById('liadcCanvasFirmaSupervisor');
  const noticeFirmaSup = document.getElementById('liadcNoticeFirmaSupervisor');
  const sigPadSup = canvasFirmaSup && typeof window.SioSignaturePad === 'function'
    ? new window.SioSignaturePad(canvasFirmaSup)
    : null;
  let savedFirmaSup = String(initialState.firmaSupervisor || '').trim();

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  document.getElementById('btnLiadcHoraInicioAhora')?.addEventListener('click', () => {
    if (inputHoraInicio) inputHoraInicio.value = nowHHMM();
  });
  document.getElementById('btnLiadcHoraTerminoAhora')?.addEventListener('click', () => {
    if (inputHoraTermino) inputHoraTermino.value = nowHHMM();
  });

  document.getElementById('btnLimpiarFirmaInspectorLIADC')?.addEventListener('click', () => {
    if (sigPadInsp) sigPadInsp.clear();
    savedFirmaInsp = '';
    if (noticeFirmaInsp) noticeFirmaInsp.style.display = 'none';
  });

  document.getElementById('btnLimpiarFirmaSupervisorLIADC')?.addEventListener('click', () => {
    if (sigPadSup) sigPadSup.clear();
    savedFirmaSup = '';
    if (noticeFirmaSup) noticeFirmaSup.style.display = 'none';
  });

  selectSupervisor?.addEventListener('change', () => {
    const selectedOpt = selectSupervisor.options[selectSupervisor.selectedIndex];
    if (inputSupervisorNombre && selectedOpt && selectSupervisor.value) {
      inputSupervisorNombre.value = selectedOpt.text.replace(/\s*\([^)]*\)\s*$/, '').trim();
    } else if (inputSupervisorNombre && !selectSupervisor.value) {
      inputSupervisorNombre.value = '';
    }
  });

  function updateChecklistStatus() {
    const inits = String(inputIniciales?.value || '').trim().toUpperCase().substring(0, 3) || '--';
    const items = form.querySelectorAll('.liadc-check-item');
    let checkedCount = 0;

    items.forEach((chk) => {
      const key = chk.dataset.key;
      const cell = document.getElementById(`liadcStatus_${key}`);
      if (chk.checked) checkedCount += 1;
      if (cell) {
        if (chk.checked) {
          cell.textContent = `OK (${inits})`;
          cell.style.color = '#15803D';
          cell.style.fontWeight = '700';
        } else {
          cell.textContent = key === 'AreasExternas_BodegaDelantera' ? '/' : 'Sin marcar';
          cell.style.color = '#64748B';
          cell.style.fontWeight = '400';
        }
      }
    });

    if (contadorChecks) {
      contadorChecks.textContent = `${checkedCount} / ${items.length} OK`;
    }
  }

  form.querySelectorAll('.liadc-check-item').forEach((chk) => {
    chk.addEventListener('change', updateChecklistStatus);
  });

  inputIniciales?.addEventListener('input', () => {
    inputIniciales.value = String(inputIniciales.value || '').toUpperCase().substring(0, 3);
    updateChecklistStatus();
  });

  document.getElementById('btnLiadcMarcarTodo')?.addEventListener('click', () => {
    form.querySelectorAll('.liadc-check-item').forEach((chk) => {
      chk.checked = true;
    });
    updateChecklistStatus();
  });

  document.getElementById('btnLiadcDesmarcarTodo')?.addEventListener('click', () => {
    form.querySelectorAll('.liadc-check-item').forEach((chk) => {
      chk.checked = false;
    });
    updateChecklistStatus();
  });

  form.querySelectorAll('.btn-liadc-sec-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.seccion;
      const chks = Array.from(form.querySelectorAll(`.liadc-check-item[data-seccion="${sec}"]`));
      const allChecked = chks.length > 0 && chks.every(c => c.checked);
      chks.forEach((c) => {
        c.checked = !allChecked;
      });
      updateChecklistStatus();
    });
  });

  function getEffectiveSignature(pad, fallbackSaved) {
    if (pad && !pad.isEmpty()) {
      return pad.toDataURL();
    }
    return fallbackSaved || '';
  }

  function getSelectedNotificacion() {
    const checked = form.querySelector('input[name="liadcNotificacion"]:checked');
    return checked ? String(checked.value || '').trim().toUpperCase() : '';
  }

  function recopilarPayload() {
    const checks = {};
    form.querySelectorAll('.liadc-check-item').forEach((chk) => {
      const key = chk.dataset.key;
      if (key) checks[key] = Boolean(chk.checked);
    });

    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supLabel = String(inputSupervisorNombre?.value || '').trim()
      || (selectSupervisor?.value && supOpt ? supOpt.text.replace(/\s*\([^)]*\)\s*$/, '').trim() : '');

    return {
      fecha: inputFecha?.value || '',
      puente: String(inputPuente?.value || '').trim(),
      arriboVuelo: inputArribo?.value || '',
      horaInicioInsp: inputHoraInicio?.value || '',
      horaTerminoInsp: inputHoraTermino?.value || '',
      supLaats: selectSupervisor?.value || '',
      supervisorNombre: supLabel,
      iniciales: String(inputIniciales?.value || '').trim().toUpperCase().substring(0, 3),
      notificacionComandante: getSelectedNotificacion(),
      observaciones: String(inputObservaciones?.value || '').trim(),
      inspectorNombre: String(inputInspectorNombre?.value || '').trim(),
      firmaInspector: getEffectiveSignature(sigPadInsp, savedFirmaInsp),
      firmaSupervisor: getEffectiveSignature(sigPadSup, savedFirmaSup),
      checks
    };
  }

  function validarFrontend() {
    if (!Validator) return true;
    const headerRules = [
      { field: 'fecha', label: 'Fecha', element: inputFecha, required: true, type: 'date' },
      { field: 'horaInicioInsp', label: 'Hora de Inicio de Inspección', element: inputHoraInicio, required: true, type: 'time' },
      { field: 'supLaats', label: 'Supervisor LAATS', element: selectSupervisor, required: true, type: 'integer', min: 1 },
      { field: 'iniciales', label: 'Iniciales del Inspector', element: inputIniciales, required: true, type: 'string', minLength: 1, maxLength: 3 },
      {
        field: 'notificacionComandante',
        label: 'Notificación al Comandante',
        element: notifGroup,
        getValue: getSelectedNotificacion,
        required: true,
        type: 'string',
        pattern: /^(VERBAL|ESCRITA)$/
      },
      { field: 'inspectorNombre', label: 'Seguridad que Inspeccionó', element: inputInspectorNombre, required: true, type: 'string', maxLength: 150 },
      {
        field: 'firmaInspector',
        label: 'Firma Digital del Inspector',
        element: canvasFirmaInsp,
        highlightElement: sigBoxInsp,
        getValue: () => getEffectiveSignature(sigPadInsp, savedFirmaInsp),
        required: true,
        requiredMessage: 'debe trazar la firma digital del inspector antes de guardar.'
      }
    ];

    if (inputHoraTermino?.value) {
      headerRules.push({ field: 'horaTerminoInsp', label: 'Hora de Término de Inspección', element: inputHoraTermino, required: false, type: 'time' });
    }
    if (inputArribo?.value) {
      headerRules.push({ field: 'arriboVuelo', label: 'Arribo del Vuelo (ATA)', element: inputArribo, required: false, type: 'time' });
    }

    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules,
      minRows: 0
    });
    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Lista de Inspección (LIADC)');
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

    const liadcPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Lista de Inspección (LIADC)...' : 'Generando Vista Preliminar...',
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
          datos: { liadcPayload }
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
              puente: inputPuente,
              arriboVuelo: inputArribo,
              horaInicioInsp: inputHoraInicio,
              horaTerminoInsp: inputHoraTermino,
              supLaats: selectSupervisor,
              iniciales: inputIniciales,
              notificacionComandante: notifGroup,
              inspectorNombre: inputInspectorNombre,
              firmaInspector: sigBoxInsp,
              firmaSupervisor: sigBoxSup
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
        const encEl = document.getElementById('liadcEncabezadoId');
        if (encEl) encEl.value = String(encabezadoId);
        const badgeEl = document.getElementById('liadcBadgeEstadoEncabezado');
        if (badgeEl) badgeEl.textContent = `REGISTRO CARGADO #${encabezadoId}`;
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Lista de Inspección de Aeronave de Carga guardada correctamente.',
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

  document.getElementById('btnVistaPreliminarLIADC')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoLIADC')?.addEventListener('click', () => enviarFormato(true));

  updateChecklistStatus();
});
