/**
 * Controlador Frontend para Control de Equipajes en Banda de Salida (Rayos X) (*-eb)
 * Estándar LAATS — 100% compatible con Helmet CSP (cero scripts/eventos inline) y validación de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaEB');
  if (!form) return;

  const Validator = window.SioFormatValidator;

  const nowHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Cargar estado inicial hidratado desde el servidor (o restaurado por SioOfflineManager)
  let initialState = {};
  try {
    const rawJson = document.getElementById('ebInitialStateJson')?.textContent || '{}';
    initialState = JSON.parse(rawJson);
  } catch (err) {
    console.error('[EB INIT JSON ERROR]', err);
  }

  // Referencias del DOM
  const inputFormatoId = document.getElementById('ebFormatoId');
  const inputItinerarioId = document.getElementById('ebItinerarioId');
  const inputEncabezadoId = document.getElementById('ebEncabezadoId');
  const inputFecha = document.getElementById('ebFecha');
  const inputHoraInicio = document.getElementById('ebHoraInicio');
  const selectSupervisor = document.getElementById('ebSupervisor');
  const inputNombreOperador = document.getElementById('ebNombreOperador');
  const inputSecuencia = document.getElementById('ebInputSecuencia');
  const tablaMatriz = document.getElementById('ebTablaMatriz');
  const tbodyMatriz = document.getElementById('ebTbodyMatriz');
  const totalCountEl = document.getElementById('ebTotalEquipajeCount');
  const totalReadoutEl = document.getElementById('ebTotalEquipajeReadout');
  const inputCorreos = document.getElementById('ebCorreos');
  const inputComat = document.getElementById('ebComat');
  const inputEqTransito = document.getElementById('ebEqTransito');
  const inputHoraCierre = document.getElementById('ebHoraCierre');
  const inputObservaciones = document.getElementById('ebObservaciones');

  const btnRelojInicio = document.getElementById('btnRelojHoraInicioEB');
  const btnRelojCierre = document.getElementById('btnRelojHoraCierreEB');
  const btnAgregarSecuencia = document.getElementById('btnAgregarSecuenciaEB');
  const btnBorrarUltimo = document.getElementById('btnBorrarUltimoEB');
  const btnRetirarMaleta = document.getElementById('btnRetirarMaletaEB');
  const btnVistaPreliminar = document.getElementById('btnVistaPreliminarEB');
  const btnGuardarDefinitivo = document.getElementById('btnGuardarDefinitivoEB');

  // Instancia estandarizada SioBaggageMatrix (Selección táctil + Retirar/Anular ✗ + Soft Delete)
  const matrix = window.SioBaggageMatrix.create({
    family: 'eb',
    idField: 'DetalleControlEBId',
    secondaryIdField: 'DetalleEBId',
    minRows: 10,
    requireMotivo: true,
    itemLabel: 'Maleta en Banda',
    motivoPlaceholder: 'Ej: Retirada por inspección AVSEC',
    formEl: form,
    cardEl: document.getElementById('ebCardMatriz'),
    tableEl: tablaMatriz,
    tbodyEl: tbodyMatriz,
    totalCountEl,
    secondaryTotalEl: totalReadoutEl,
    inputSecuenciaEl: inputSecuencia,
    btnAgregarEl: btnAgregarSecuencia,
    btnBorrarUltimoEl: btnBorrarUltimo,
    btnRetirarEl: btnRetirarMaleta,
    observacionesEl: inputObservaciones,
    formatoIdEl: inputFormatoId,
    itinerarioIdEl: inputItinerarioId,
    encabezadoIdEl: inputEncabezadoId,
    initialItems: Array.isArray(initialState.detalles) ? initialState.detalles : []
  });

  if (btnRelojInicio) {
    btnRelojInicio.addEventListener('click', () => {
      if (inputHoraInicio) {
        inputHoraInicio.value = nowHHMM();
        inputHoraInicio.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
  if (btnRelojCierre) {
    btnRelojCierre.addEventListener('click', () => {
      if (inputHoraCierre) {
        inputHoraCierre.value = nowHHMM();
        inputHoraCierre.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  function recopilarPayload(guardarDefinitivo) {
    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supervisorNombre = supOpt ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim() : '';
    const detalles = matrix.getItems();

    return {
      formatoId: inputFormatoId?.value || 'amx-eb',
      itinerarioId: parseInt(inputItinerarioId?.value || '0', 10),
      encabezadoId: inputEncabezadoId?.value ? parseInt(inputEncabezadoId.value, 10) : null,
      guardar: Boolean(guardarDefinitivo),
      datos: {
        fecha: String(inputFecha?.value || '').trim(),
        horaInicio: String(inputHoraInicio?.value || '').trim(),
        horaCierre: String(inputHoraCierre?.value || '').trim(),
        supervisorLoginId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : null,
        supervisorNombre,
        nombreOperador: String(inputNombreOperador?.value || '').trim(),
        correos: inputCorreos?.value !== '' ? parseInt(inputCorreos.value, 10) : null,
        comat: inputComat?.value !== '' ? parseInt(inputComat.value, 10) : null,
        eqTransito: inputEqTransito?.value !== '' ? parseInt(inputEqTransito.value, 10) : null,
        observaciones: String(inputObservaciones?.value || '').trim(),
        detalles
      }
    };
  }

  function validarFormularioFrontend() {
    if (Validator) Validator.clearValidationErrors(form);
    const errors = [];
    const detalles = matrix.getItems();

    if (!String(inputFecha?.value || '').trim()) {
      Validator?.markElementInvalid(inputFecha);
      errors.push({ rowNumber: null, label: 'Fecha', message: 'La Fecha es obligatoria.', element: inputFecha });
    }
    if (!String(inputHoraInicio?.value || '').trim()) {
      Validator?.markElementInvalid(inputHoraInicio);
      errors.push({ rowNumber: null, label: 'Hora de Inicio', message: 'La Hora de Inicio es obligatoria.', element: inputHoraInicio });
    }
    if (!String(selectSupervisor?.value || '').trim()) {
      Validator?.markElementInvalid(selectSupervisor);
      errors.push({ rowNumber: null, label: 'Nombre del Supervisor', message: 'Debe seleccionar el Supervisor en turno.', element: selectSupervisor });
    }
    if (!String(inputNombreOperador?.value || '').trim()) {
      Validator?.markElementInvalid(inputNombreOperador);
      errors.push({ rowNumber: null, label: 'Nombre del Operador', message: 'El Nombre del Operador es obligatorio.', element: inputNombreOperador });
    }
    if (detalles.length === 0 || matrix.getActiveCount() === 0) {
      Validator?.markElementInvalid(inputSecuencia);
      errors.push({
        rowNumber: null,
        label: 'Matriz de Equipajes',
        message: 'Debe registrar al menos 1 secuencia activa de equipaje en la matriz de Banda de Salida.',
        element: inputSecuencia
      });
    }

    if (errors.length > 0) {
      Validator?.focusAndAlert({
        title: 'Campos obligatorios pendientes en Banda de Salida',
        errors
      });
      return false;
    }
    return true;
  }

  async function enviarFormato(guardarDefinitivo) {
    if (guardarDefinitivo && !validarFormularioFrontend()) {
      return;
    }

    const payload = recopilarPayload(guardarDefinitivo);

    let previewWin = null;
    if (!guardarDefinitivo) {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try { previewWin.document.title = 'Generando Vista Preliminar...'; } catch (_) {}
      }
    }

    try {
      Swal.fire({
        title: guardarDefinitivo ? 'Guardando Formato...' : 'Generando Vista Preliminar...',
        text: 'Procesando información de forma segura en Azure SQL',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const res = await fetch('/api/formatos/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (previewWin && !previewWin.closed) previewWin.close();
        Swal.close();
        if (Validator && Array.isArray(json.errors) && json.errors.length > 0) {
          Validator.applyBackendErrors(json.errors, {
            headerMap: {
              fecha: inputFecha,
              horaInicio: inputHoraInicio,
              supervisorLoginId: selectSupervisor,
              nombreOperador: inputNombreOperador,
              detalles: inputSecuencia
            }
          });
          return;
        }
        Swal.fire({
          icon: 'error',
          title: 'Error de Validación',
          text: json.message || 'No se pudo procesar el formato.',
          confirmButtonColor: '#DC2626'
        });
        return;
      }

      if (!guardarDefinitivo) {
        Swal.close();
        if (json.previewUrl) {
          if (previewWin && !previewWin.closed) {
            previewWin.location.href = json.previewUrl;
            previewWin.focus();
          } else {
            window.location.href = json.previewUrl;
          }
        } else if (previewWin && !previewWin.closed) {
          previewWin.close();
        }
        return;
      }

      if (json.encabezadoId && inputEncabezadoId) {
        inputEncabezadoId.value = String(json.encabezadoId);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Formato Guardado!',
        text: json.mensaje || json.message || 'Control de Equipajes en Banda de Salida guardado correctamente.',
        timer: 1100,
        showConfirmButton: false
      });

      if (json.previewUrl) {
        window.location.href = json.previewUrl;
      } else if (json.encabezadoId) {
        window.location.href = `/formatos/${encodeURIComponent(payload.formatoId)}?encabezadoId=${json.encabezadoId}`;
      }
    } catch (err) {
      if (previewWin && !previewWin.closed) previewWin.close();
      console.error('[EB SAVE ERROR]', err);
      Swal.fire({
        icon: 'error',
        title: 'Error de Red',
        text: 'No se pudo conectar con el servidor.',
        confirmButtonColor: '#DC2626'
      });
    }
  }

  if (btnVistaPreliminar) {
    btnVistaPreliminar.addEventListener('click', () => enviarFormato(false));
  }
  if (btnGuardarDefinitivo) {
    btnGuardarDefinitivo.addEventListener('click', () => enviarFormato(true));
  }
});
