/**
 * formato-lisa.js — Lista de Inspección de Seguridad de la Aeronave (ControlListaInspeccionSeguridadAJT / ajt-lisa - AMERIJET)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaLISA');
  const stateEl = document.getElementById('lisaInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[LISA INIT PARSE ERROR]', err);
  }

  const formatoId = document.getElementById('lisaFormatoId')?.value || initialState.formatoId || 'ajt-lisa';
  const itinerarioId = parseInt(document.getElementById('lisaItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('lisaEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const inputFecha = document.getElementById('lisaFecha');
  const inputEstacion = document.getElementById('lisaEstacion');
  const inputTipoAvion = document.getElementById('lisaTipoAvion');
  const inputHoraInicio = document.getElementById('lisaHoraInicio');
  const inputHoraFin = document.getElementById('lisaHoraFin');
  const inputHoraSalida = document.getElementById('lisaHoraSalida');
  const rolesGroup = document.getElementById('lisaRolesGroup');
  const chkCoordSeguridad = document.getElementById('lisaChkCoordSeguridad');
  const chkRepAutorizado = document.getElementById('lisaChkRepAutorizado');
  const inputObservaciones = document.getElementById('lisaObservaciones');
  const inputNombreInspector = document.getElementById('lisaNombreInspector');
  const contadorChecks = document.getElementById('lisaContadorChecks');
  const btnMarcarTodos = document.getElementById('btnMarcarTodosLISA');

  const sigBox = document.getElementById('lisaSignatureBox');
  const canvasFirma = document.getElementById('lisaCanvasFirma');
  const sigPad = canvasFirma && typeof window.SioSignaturePad === 'function'
    ? new window.SioSignaturePad(canvasFirma)
    : null;

  const inicialesAuto = String(initialState.inicialesAuto || '').trim() || (() => {
    const name = String(inputNombreInspector?.value || '').trim();
    return name.split(/\s+/).filter(Boolean).map(w => `${w.charAt(0).toUpperCase()}.`).join('') || 'L.A.';
  })();

  const selloActivo = {};
  for (let i = 1; i <= 15; i += 1) {
    const row = initialState.sellos && (initialState.sellos[i] || initialState.sellos[String(i)]);
    selloActivo[i] = Boolean(row && (row.activo || row.numero));
  }

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // Botones "Ahora" en horas
  form.querySelectorAll('.cp-clock-btn[data-clock-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.clockTarget;
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      target.value = nowHHMM();
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // Limpiar firma
  document.getElementById('btnLimpiarFirmaLISA')?.addEventListener('click', () => {
    if (sigPad) sigPad.clear();
  });

  // Limpiar alerta en grupo de roles cuando cambia cualquiera
  [chkCoordSeguridad, chkRepAutorizado].forEach((chk) => {
    chk?.addEventListener('change', () => {
      if (rolesGroup && (chkCoordSeguridad?.checked || chkRepAutorizado?.checked)) {
        rolesGroup.classList.remove('is-invalid', 'sio-field-invalid');
      }
    });
  });

  function updateChecklistStatus() {
    const items = Array.from(form.querySelectorAll('.lisa-check-item'));
    let checkedCount = 0;

    items.forEach((chk) => {
      const num = chk.dataset.num;
      const statusEl = num ? document.getElementById(`lisaStatus_${num}`) : null;
      if (chk.checked) checkedCount += 1;
      if (statusEl) {
        if (chk.checked) {
          statusEl.textContent = 'OK';
          statusEl.style.color = '#15803D';
        } else {
          statusEl.textContent = '---';
          statusEl.style.color = '#64748B';
        }
      }
    });

    if (contadorChecks) {
      contadorChecks.textContent = `${checkedCount} / ${items.length} inspeccionados`;
    }
    if (btnMarcarTodos) {
      const allMarked = items.length > 0 && checkedCount === items.length;
      btnMarcarTodos.innerHTML = allMarked
        ? '<i class="fas fa-times-circle"></i> Desmarcar Todos'
        : '<i class="fas fa-check-double"></i> Marcar Todos';
    }
  }

  form.querySelectorAll('.lisa-check-item').forEach((chk) => {
    chk.addEventListener('change', updateChecklistStatus);
  });

  btnMarcarTodos?.addEventListener('click', () => {
    const items = Array.from(form.querySelectorAll('.lisa-check-item'));
    const allMarked = items.length > 0 && items.every(c => c.checked);
    items.forEach((c) => {
      c.checked = !allMarked;
    });
    updateChecklistStatus();
  });

  // Toggle candado de Sello por cada punto 1..15
  form.querySelectorAll('.lisa-seal-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const num = parseInt(btn.dataset.num, 10);
      if (!num) return;
      selloActivo[num] = !selloActivo[num];
      const active = selloActivo[num];

      const rowContainer = document.getElementById(`lisaSealRow_${num}`);
      const emptyLabel = document.getElementById(`lisaSealEmpty_${num}`);
      const sealInput = document.getElementById(`lisaSello_${num}`);
      const iniInput = document.getElementById(`lisaIni_${num}`);
      const trEl = btn.closest('tr[data-row-index]');

      if (rowContainer) rowContainer.style.display = active ? 'flex' : 'none';
      if (emptyLabel) emptyLabel.style.display = active ? 'none' : 'inline';

      btn.classList.toggle('btn-primary', active);
      btn.classList.toggle('btn-secondary', !active);
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-lock-open', active);
        icon.classList.toggle('fa-lock', !active);
      }

      if (active) {
        if (iniInput && !iniInput.value.trim()) {
          iniInput.value = inicialesAuto;
        }
        sealInput?.focus();
      } else {
        if (sealInput) {
          sealInput.value = '';
          sealInput.classList.remove('is-invalid', 'sio-field-invalid');
          sealInput.removeAttribute('aria-invalid');
        }
        if (iniInput) iniInput.value = '';
        if (trEl) trEl.classList.remove('sio-row-invalid', 'er-row-invalid');
      }
    });
  });

  function getFirmaDataUrl() {
    if (sigPad && !sigPad.isEmpty()) {
      return sigPad.toDataURL();
    }
    return '';
  }

  function recopilarPayload() {
    const checks = {};
    form.querySelectorAll('.lisa-check-item').forEach((chk) => {
      const key = chk.dataset.key;
      if (key) checks[key] = Boolean(chk.checked);
    });

    const sellos = {};
    for (let i = 1; i <= 15; i += 1) {
      const sealInput = document.getElementById(`lisaSello_${i}`);
      const iniInput = document.getElementById(`lisaIni_${i}`);
      const numVal = String(sealInput?.value || '').trim();
      const iniVal = String(iniInput?.value || '').trim();
      sellos[i] = {
        activo: Boolean(selloActivo[i] || numVal),
        numero: numVal,
        iniciales: numVal ? (iniVal || inicialesAuto) : ''
      };
    }

    return {
      fecha: String(inputFecha?.value || '').trim(),
      estacion: String(inputEstacion?.value || '').trim().toUpperCase(),
      tipoAvion: String(inputTipoAvion?.value || '').trim().toUpperCase(),
      horaInicio: String(inputHoraInicio?.value || '').trim(),
      horaFin: String(inputHoraFin?.value || '').trim(),
      horaSalida: String(inputHoraSalida?.value || '').trim(),
      coordSeguridadTierra: Boolean(chkCoordSeguridad?.checked),
      representanteAutorizado: Boolean(chkRepAutorizado?.checked),
      observaciones: String(inputObservaciones?.value || '').trim(),
      nombreInspector: String(inputNombreInspector?.value || '').trim(),
      firmaInspector: getFirmaDataUrl(),
      checks,
      sellos
    };
  }

  function validarFrontend() {
    if (!Validator) return true;

    const headerRules = [
      { field: 'fecha', label: 'Fecha / Date', element: inputFecha, required: true, type: 'date' },
      { field: 'estacion', label: 'Estación / Station', element: inputEstacion, required: true, type: 'string', minLength: 2, maxLength: 20 },
      { field: 'tipoAvion', label: 'Tipo de Avión / Aircraft Type', element: inputTipoAvion, required: true, type: 'string', minLength: 2, maxLength: 30 },
      { field: 'horaInicio', label: 'Hora Inicio Inspección', element: inputHoraInicio, required: true, type: 'time' },
      { field: 'horaFin', label: 'Hora Fin Inspección', element: inputHoraFin, required: true, type: 'time' },
      { field: 'horaSalida', label: 'Hora de Salida', element: inputHoraSalida, required: true, type: 'time' },
      {
        field: 'firmaInspector',
        label: 'Firma de quien ejecutó la inspección',
        element: canvasFirma,
        highlightElement: sigBox,
        getValue: getFirmaDataUrl,
        required: true,
        requiredMessage: 'debe trazar su firma digital antes de guardar.'
      }
    ];

    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules,
      minRows: 0
    });
    const errors = [...res.errors];

    if (!chkCoordSeguridad?.checked && !chkRepAutorizado?.checked) {
      Validator.markElementInvalid(rolesGroup, null);
      errors.push({
        scope: 'header',
        row: null,
        field: 'coordSeguridadTierra',
        label: 'Rol de quien realiza la inspección',
        reason: 'debe seleccionar Coord. de Seguridad en Tierra o Representante Autorizado.',
        message: 'Encabezado (Rol de Inspección): Seleccione al menos Coord. de Seguridad en Tierra o Representante Autorizado.',
        element: rolesGroup || chkCoordSeguridad
      });
    }

    for (let i = 1; i <= 15; i += 1) {
      if (!selloActivo[i]) continue;
      const sealInput = document.getElementById(`lisaSello_${i}`);
      const trEl = sealInput?.closest('tr[data-row-index]') || null;
      const val = String(sealInput?.value || '').trim();
      if (!val) {
        Validator.markElementInvalid(sealInput, trEl);
        errors.push({
          scope: 'row',
          row: i,
          field: `Sello${i}`,
          label: `# de Sello (Punto ${i})`,
          reason: 'es obligatorio porque activó el candado.',
          message: `Punto #${i}: El campo "# de Sello" es obligatorio cuando el candado está abierto (o cierre el candado si no aplica).`,
          element: sealInput || trEl
        });
      } else if (val.length > 40) {
        Validator.markElementInvalid(sealInput, trEl);
        errors.push({
          scope: 'row',
          row: i,
          field: `Sello${i}`,
          label: `# de Sello (Punto ${i})`,
          reason: 'no puede superar 40 caracteres.',
          message: `Punto #${i}: El # de Sello excede 40 caracteres.`,
          element: sealInput || trEl
        });
      }
    }

    if (errors.length > 0) {
      Validator.notifyValidationErrors(errors, 'Validación Obligatoria — Lista de Inspección (LISA AJT)');
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

    const lisaPayload = recopilarPayload();
    const btnPreview = document.getElementById('btnVistaPreliminarLISA');
    const btnSave = document.getElementById('btnGuardarDefinitivoLISA');
    if (btnPreview) btnPreview.disabled = true;
    if (btnSave) btnSave.disabled = true;

    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Lista de Inspección (LISA - AMERIJET)...' : 'Generando Vista Preliminar...',
          'Procesando transacción segura en Azure SQL...'
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
          datos: { lisaPayload }
        })
      });
      const json = await res.json();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();

      if (!res.ok || !json.success) {
        if (previewWin && !previewWin.closed) previewWin.close();
        if (Validator && Array.isArray(json.errors) && json.errors.length > 0) {
          Validator.applyBackendErrors(json.errors, {
            root: form,
            rowSelector: 'tr[data-row-index]',
            headerElementMap: {
              fecha: inputFecha,
              estacion: inputEstacion,
              tipoAvion: inputTipoAvion,
              horaInicio: inputHoraInicio,
              horaFin: inputHoraFin,
              horaSalida: inputHoraSalida,
              coordSeguridadTierra: rolesGroup,
              representanteAutorizado: rolesGroup,
              nombreInspector: inputNombreInspector,
              firmaInspector: sigBox,
              observaciones: inputObservaciones
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
        const encEl = document.getElementById('lisaEncabezadoId');
        if (encEl) encEl.value = String(encabezadoId);
        const badgeEl = document.getElementById('lisaBadgeEstadoEncabezado');
        if (badgeEl) badgeEl.textContent = `REGISTRO CARGADO #${encabezadoId}`;
      }
      if (json.firmasRepo) {
        window.SioSignatureRepoClient?.applyRepoState?.(json.firmasRepo);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Lista de Inspección de Seguridad (AMERIJET) guardada correctamente.',
        timer: 1100,
        showConfirmButton: false
      });
      if (json.previewUrl) {
        window.location.href = json.previewUrl;
      } else {
        window.location.href = `/formatos/${encodeURIComponent(formatoId)}?encabezadoId=${encodeURIComponent(encabezadoId)}`;
      }
    } catch (err) {
      if (previewWin && !previewWin.closed) previewWin.close();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();
      Swal.fire({
        icon: 'error',
        title: 'Error de Red',
        text: 'No se pudo comunicar con el servidor.',
        confirmButtonColor: '#DC2626'
      });
    } finally {
      if (btnPreview) btnPreview.disabled = false;
      if (btnSave) btnSave.disabled = false;
    }
  }

  document.getElementById('btnVistaPreliminarLISA')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoLISA')?.addEventListener('click', () => enviarFormato(true));

  updateChecklistStatus();
});
