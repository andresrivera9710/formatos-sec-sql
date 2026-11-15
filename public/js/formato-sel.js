/**
 * formato-sel.js — Sequence of Events Log (SequenceOfEventsD / dl-sel - DELTA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaSEL');
  const stateEl = document.getElementById('selInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[SEL INIT PARSE ERROR]', err);
  }

  const formatoId = document.getElementById('selFormatoId')?.value || initialState.formatoId || 'dl-sel';
  const itinerarioId = parseInt(document.getElementById('selItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('selEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  let padSup = null;
  if (typeof window.SioSignaturePad === 'function') {
    const cSup = document.getElementById('selCanvasFirmaSupervisor');
    if (cSup) padSup = new window.SioSignaturePad(cSup);
  }
  document.getElementById('btnLimpiarFirmaSEL')?.addEventListener('click', () => padSup?.clear());

  function getNowHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  form.querySelectorAll('[data-sel-clock]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-sel-clock'));
      if (target) {
        target.value = getNowHHMM();
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  const val = (id) => String(document.getElementById(id)?.value || '').trim();

  function recopilarPayload() {
    const supSelect = document.getElementById('selSupervisor');
    const supOpt = supSelect?.options?.[supSelect.selectedIndex];
    const supervisorNombre = supOpt && supSelect.value
      ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim()
      : '';

    return {
      fecha: val('selFecha').substring(0, 10),
      aircraftArrived: val('selAircraftArrived'),
      aircraftArrivedTime: val('selAircraftArrivedTime'),
      guard: val('selGuard'),
      supervisorLoginId: supSelect?.value ? parseInt(supSelect.value, 10) : 1,
      supervisorNombre,
      horaCierreFila: val('selHoraCierreFila'),
      cantidadPasajerosFila: val('selCantidadPasajerosFila'),
      horaChequeadoFila: val('selHoraChequeadoFila'),
      primerEqRevisada: val('selPrimerEqRevisada'),
      ultimoEqRevisado: val('selUltimoEqRevisado'),
      primerEqPuerta: val('selPrimerEqPuerta'),
      ultimoEqPuerta: val('selUltimoEqPuerta'),
      cantidadPasajerosEmbarque: val('selCantidadPasajerosEmbarque'),
      horaInicioEmbarque: val('selHoraInicioEmbarque'),
      horaUltimoAbandona: val('selHoraUltimoAbandona'),
      horaDescargaEqCarga: val('selHoraDescargaEqCarga'),
      horaInicioEqCarga: val('selHoraInicioEqCarga'),
      horaPuertasCerradasCar: val('selHoraPuertasCerradasCar'),
      horaPuertasCerradasCab: val('selHoraPuertasCerradasCab'),
      horaInicioRodajeNave: val('selHoraInicioRodajeNave'),
      observaciones: val('selObservaciones'),
      firmaSupervisor: (padSup && !padSup.isBlank()) ? padSup.toDataURL() : ''
    };
  }

  const FIELD_MAP = {
    horaCierreFila: 'selHoraCierreFila',
    cantidadPasajerosFila: 'selCantidadPasajerosFila',
    horaChequeadoFila: 'selHoraChequeadoFila',
    primerEqRevisada: 'selPrimerEqRevisada',
    ultimoEqRevisado: 'selUltimoEqRevisado',
    primerEqPuerta: 'selPrimerEqPuerta',
    ultimoEqPuerta: 'selUltimoEqPuerta',
    cantidadPasajerosEmbarque: 'selCantidadPasajerosEmbarque',
    horaInicioEmbarque: 'selHoraInicioEmbarque',
    horaUltimoAbandona: 'selHoraUltimoAbandona',
    horaDescargaEqCarga: 'selHoraDescargaEqCarga',
    horaInicioEqCarga: 'selHoraInicioEqCarga',
    horaPuertasCerradasCar: 'selHoraPuertasCerradasCar',
    horaPuertasCerradasCab: 'selHoraPuertasCerradasCab',
    horaInicioRodajeNave: 'selHoraInicioRodajeNave'
  };

  function validarFrontend() {
    if (!Validator) return true;
    const headerRules = [
      { field: 'horaCierreFila', label: '1. Passenger Line Closed', element: document.getElementById('selHoraCierreFila'), required: true, type: 'time' },
      { field: 'cantidadPasajerosFila', label: '2. Number of Passengers in Line', element: document.getElementById('selCantidadPasajerosFila'), required: true, type: 'integer', min: 0 },
      { field: 'horaChequeadoFila', label: '3. Last Passenger in Line Checked In', element: document.getElementById('selHoraChequeadoFila'), required: true, type: 'time' },
      { field: 'primerEqRevisada', label: '4a. First Bags Sniffed / Screened', element: document.getElementById('selPrimerEqRevisada'), required: true, type: 'time' },
      { field: 'ultimoEqRevisado', label: '4b. Last Bags Sniffed / Screened', element: document.getElementById('selUltimoEqRevisado'), required: true, type: 'time' },
      { field: 'primerEqPuerta', label: '5a. First Bags Arrive at Gate', element: document.getElementById('selPrimerEqPuerta'), required: true, type: 'time' },
      { field: 'ultimoEqPuerta', label: '5b. Last Bags Arrive at Gate', element: document.getElementById('selUltimoEqPuerta'), required: true, type: 'time' },
      { field: 'cantidadPasajerosEmbarque', label: '6. Passengers Arrived at Boarding Gate', element: document.getElementById('selCantidadPasajerosEmbarque'), required: true, type: 'string', maxLength: 50 },
      { field: 'horaInicioEmbarque', label: '7. Passengers Commence Boarding', element: document.getElementById('selHoraInicioEmbarque'), required: true, type: 'time' },
      { field: 'horaUltimoAbandona', label: '8. Last Passenger Leaves Gate', element: document.getElementById('selHoraUltimoAbandona'), required: true, type: 'time' },
      { field: 'horaDescargaEqCarga', label: '9. Unloading Baggage & Cargo Complete', element: document.getElementById('selHoraDescargaEqCarga'), required: true, type: 'time' },
      { field: 'horaInicioEqCarga', label: '10. Baggage & Cargo Loading Begins', element: document.getElementById('selHoraInicioEqCarga'), required: true, type: 'time' },
      { field: 'horaPuertasCerradasCar', label: '11. Aircraft Cargo Doors Closed', element: document.getElementById('selHoraPuertasCerradasCar'), required: true, type: 'time' },
      { field: 'horaPuertasCerradasCab', label: '12. Aircraft Cabin Doors Closed', element: document.getElementById('selHoraPuertasCerradasCab'), required: true, type: 'time' },
      { field: 'horaInicioRodajeNave', label: '13. Aircraft Begins Taxi', element: document.getElementById('selHoraInicioRodajeNave'), required: true, type: 'time' }
    ];

    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules,
      rowElements: [],
      rowRules: [],
      minRows: 0
    });

    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Sequence of Events Log');
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

    const selPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Sequence of Events Log...' : 'Generando Vista Preliminar...',
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
          datos: { selPayload }
        })
      });
      const json = await res.json();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();

      if (!res.ok || !json.success) {
        if (previewWin && !previewWin.closed) previewWin.close();
        if (Validator && Array.isArray(json.errors) && json.errors.length > 0) {
          const headerElementMap = {};
          Object.keys(FIELD_MAP).forEach((k) => {
            headerElementMap[k] = document.getElementById(FIELD_MAP[k]);
          });
          Validator.applyBackendErrors(json.errors, { root: form, headerElementMap });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error de Validación', text: json.message || 'No se pudo procesar Sequence of Events Log.', confirmButtonColor: '#DC2626' });
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
        const encInput = document.getElementById('selEncabezadoId');
        if (encInput) encInput.value = String(encabezadoId);
      }

      Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Sequence of Events Log guardado correctamente.',
        confirmButtonColor: '#275B88'
      }).then(() => {
        window.location.href = '/formatos';
      });
    } catch (err) {
      if (previewWin && !previewWin.closed) previewWin.close();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();
      Swal.fire({ icon: 'error', title: 'Error de Red', text: 'No se pudo comunicar con el servidor.', confirmButtonColor: '#DC2626' });
    }
  }

  document.getElementById('btnVistaPreliminarSEL')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoSEL')?.addEventListener('click', () => enviarFormato(true));
});
