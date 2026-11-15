/**
 * formato-dal.js — Daily Activity Log (DailyActivityLOGD / dl-dal - DELTA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaDAL');
  const stateEl = document.getElementById('dalInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[DAL INIT PARSE ERROR]', err);
  }

  const formatoId = document.getElementById('dalFormatoId')?.value || initialState.formatoId || 'dl-dal';
  const itinerarioId = parseInt(document.getElementById('dalItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('dalEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  let padGuardSup = null;
  let padDLAgent = null;
  if (typeof window.SioSignaturePad === 'function') {
    const cSup = document.getElementById('dalCanvasFirmaGuardSup');
    const cDl = document.getElementById('dalCanvasFirmaDLAgent');
    if (cSup) padGuardSup = new window.SioSignaturePad(cSup);
    if (cDl) padDLAgent = new window.SioSignaturePad(cDl);
  }
  document.getElementById('btnLimpiarFirmaGuardSupDAL')?.addEventListener('click', () => padGuardSup?.clear());
  document.getElementById('btnLimpiarFirmaDLAgentDAL')?.addEventListener('click', () => padDLAgent?.clear());

  const val = (id) => String(document.getElementById(id)?.value || '').trim();
  const intVal = (id) => parseInt(val(id) || '0', 10) || 0;

  function recopilarPayload() {
    const supSelect = document.getElementById('dalSupervisor');
    const supOpt = supSelect?.options?.[supSelect.selectedIndex];
    const supervisorNombre = supOpt && supSelect.value
      ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim()
      : '';

    const s1 = val('dalScreener1');
    const s2 = val('dalScreener2');
    const s3 = val('dalScreener3');
    const sSup = val('dalScreenerSup');
    const evaluadores = [s1, s2, s3, sSup].filter(Boolean).join(', ');
    const nombreGuardia = val('dalNombreGuardia');

    return {
      fecha: val('dalFecha').substring(0, 10),
      route: val('dalRoute'),
      revisadoXRay: val('dalRevisadoXRay') === 'YES',
      cantidadEqFisicos: intVal('dalCantidadEqFisicos'),
      screener1: s1,
      screener2: s2,
      screener3: s3,
      screenerSup: sSup,
      evaluadores,
      bolsasIngresadas: val('dalBolsasIngresadas') === 'YES',
      cantidadEq: intVal('dalCantidadEq'),
      nombreGuardia,
      cantidadEqGuardia: intVal('dalCantidadEqGuardia'),
      cantidadMaletas: intVal('dalCantidadMaletas'),
      nombreGuardia2: val('dalNombreGuardia2'),
      cantidadPiezasManifiesto: intVal('dalCantidadPiezasManifiesto'),
      nombreGuardia3: val('dalNombreGuardia3'),
      nombreAgentes: val('dalNombreAgentes'),
      nombreGuardiaEscolta: val('dalNombreGuardiaEscolta'),
      cantidadPasajerosTransito: intVal('dalPasajerosTransito'),
      cantidadPasajerosSalientes: intVal('dalPasajerosSalientes'),
      pasajerosPerdieronVuelo: val('dalPasajerosPerdieronVuelo') || '0',
      nombresPasajerosPerdieron: val('dalNombresPasajerosPerdieron'),
      cantidadPiezasAceptadas: intVal('dalPiezasAceptadas'),
      cantidadPiezasCargadas: intVal('dalPiezasCargadas'),
      cantidadEqFacturados: intVal('dalEqFacturados'),
      cantidadEqCargadas: intVal('dalEqCargadas'),
      cantidadEqRetirados: intVal('dalEqRetirados'),
      eqCoincidePasajero: val('dalEqCoincidePasajero') === 'YES',
      supervisorLoginId: supSelect?.value ? parseInt(supSelect.value, 10) : 1,
      supervisorNombre,
      nombreAgenteDelta: val('dalNombreAgenteDelta'),
      guardSig1: nombreGuardia,
      guardSig3: nombreGuardia,
      firmaGuardSup: (padGuardSup && !padGuardSup.isBlank()) ? padGuardSup.toDataURL() : '',
      firmaDLAgent: (padDLAgent && !padDLAgent.isBlank()) ? padDLAgent.toDataURL() : ''
    };
  }

  function validarFrontend() {
    if (!Validator) return true;
    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        {
          field: 'evaluadores',
          label: 'Screener 1 (Screeners / Q1)',
          element: document.getElementById('dalScreener1'),
          required: true,
          type: 'string',
          getValue: () => {
            const items = [val('dalScreener1'), val('dalScreener2'), val('dalScreener3'), val('dalScreenerSup')].filter(Boolean);
            return items.join(', ');
          },
          requiredMessage: 'Debe ingresar al menos un Screener.'
        },
        { field: 'nombreGuardia', label: 'Guard Name (Q2)', element: document.getElementById('dalNombreGuardia'), required: true, type: 'string', maxLength: 150 },
        { field: 'nombreGuardia2', label: 'Guard Name (Q3)', element: document.getElementById('dalNombreGuardia2'), required: true, type: 'string', maxLength: 150 },
        { field: 'nombreGuardia3', label: 'Guard Name (Q4)', element: document.getElementById('dalNombreGuardia3'), required: true, type: 'string', maxLength: 150 },
        { field: 'nombreAgentes', label: 'Agents at Gate (Q5)', element: document.getElementById('dalNombreAgentes'), required: true, type: 'string', maxLength: 250 },
        { field: 'nombreGuardiaEscolta', label: 'Escort Guard Name (Q6)', element: document.getElementById('dalNombreGuardiaEscolta'), required: true, type: 'string', maxLength: 150 },
        { field: 'nombreAgenteDelta', label: 'DL Representative Name', element: document.getElementById('dalNombreAgenteDelta'), required: true, type: 'string', maxLength: 150 }
      ],
      rowElements: [],
      rowRules: [],
      minRows: 0
    });

    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Daily Activity Log');
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

    const dalPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Daily Activity Log...' : 'Generando Vista Preliminar...',
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
          datos: { dalPayload }
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
              evaluadores: document.getElementById('dalScreener1'),
              nombreGuardia: document.getElementById('dalNombreGuardia'),
              nombreGuardia2: document.getElementById('dalNombreGuardia2'),
              nombreGuardia3: document.getElementById('dalNombreGuardia3'),
              nombreAgentes: document.getElementById('dalNombreAgentes'),
              nombreGuardiaEscolta: document.getElementById('dalNombreGuardiaEscolta'),
              nombreAgenteDelta: document.getElementById('dalNombreAgenteDelta')
            }
          });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error de Validación', text: json.message || 'No se pudo procesar Daily Activity Log.', confirmButtonColor: '#DC2626' });
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
        const encInput = document.getElementById('dalEncabezadoId');
        if (encInput) encInput.value = String(encabezadoId);
      }

      Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Daily Activity Log guardado correctamente.',
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

  document.getElementById('btnVistaPreliminarDAL')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoDAL')?.addEventListener('click', () => enviarFormato(true));
});
