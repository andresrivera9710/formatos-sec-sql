/**
 * Controlador Frontend para Equipajes en Mal Estado y Carga Dañada (amx-mecd)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaMECD');
  if (!form) return;

  const Validator = window.SioFormatValidator;

  const esc = (val) => {
    if (Validator && typeof Validator.escapeHtml === 'function') return Validator.escapeHtml(val);
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  let initialState = {};
  try {
    const rawJson = document.getElementById('mecdInitialStateJson')?.textContent || '{}';
    initialState = JSON.parse(rawJson);
  } catch (err) {
    console.error('[MECD INIT JSON ERROR]', err);
  }

  const normalizeMecdRev = (list) => (Array.isArray(list) ? list : []).map((r) => ({
    DetalleEquipMECDId: parseInt(r.DetalleEquipMECDId ?? r.EquipajeRevId, 10) || 0,
    EquipajeRevId: parseInt(r.DetalleEquipMECDId ?? r.EquipajeRevId, 10) || 0,
    Control: String(r.Control ?? '').trim(),
    Colilla: String(r.Colilla ?? '').trim()
  }));

  const normalizeMecdCF = (list) => (Array.isArray(list) ? list : []).map((r) => ({
    EquipajeMEId: parseInt(r.EquipajeMEId, 10) || 0,
    NombrePasajero: String(r.NombrePasajero ?? r.Pasajero ?? '').trim(),
    Colilla: String(r.Colilla ?? '').trim(),
    Control: String(r.Control ?? '').trim(),
    Destino: String(r.Destino ?? initialState.destinoDefault ?? '').trim()
  }));

  const normalizeMecdSF = (list) => (Array.isArray(list) ? list : []).map((r) => ({
    EquipajeDTId: parseInt(r.EquipajeDTId ?? r.EquipajeMEDSFId, 10) || 0,
    EquipajeMEDSFId: parseInt(r.EquipajeDTId ?? r.EquipajeMEDSFId, 10) || 0,
    NombrePasajero: String(r.NombrePasajero ?? r.Pasajero ?? '').trim(),
    Colilla: String(r.Colilla ?? '').trim(),
    Control: String(r.Control ?? '').trim(),
    Destino: String(r.Destino ?? initialState.destinoDefault ?? '').trim()
  }));

  let revision = normalizeMecdRev(initialState.revision);
  let conFirma = normalizeMecdCF(initialState.conFirma);
  let sinFirma = normalizeMecdSF(initialState.sinFirma);

  const initialRevBaseline = revision.map((r) => ({ ...r }));
  const initialCFBaseline = conFirma.map((r) => ({ ...r }));
  const initialSFBaseline = sinFirma.map((r) => ({ ...r }));

  // Referencias del DOM
  const inputFormatoId = document.getElementById('mecdFormatoId');
  const inputItinerarioId = document.getElementById('mecdItinerarioId');
  const inputEncabezadoId = document.getElementById('mecdEncabezadoId');
  const inputFecha = document.getElementById('mecdFecha');
  const selectCCO = document.getElementById('mecdCCO');
  const selectAgente = document.getElementById('mecdAgente');
  const selectSupervisor = document.getElementById('mecdSupervisor');

  const inputRevControl = document.getElementById('mecdInputRevControl');
  const inputRevColilla = document.getElementById('mecdInputRevColilla');
  const btnAgregarRev = document.getElementById('btnAgregarRevMECD');
  const tbodyRev = document.getElementById('mecdTbodyRev');
  const badgeRev = document.getElementById('mecdCountRevBadge');

  const inputCFPasajero = document.getElementById('mecdInputCFPasajero');
  const inputCFColilla = document.getElementById('mecdInputCFColilla');
  const inputCFControl = document.getElementById('mecdInputCFControl');
  const inputCFDestino = document.getElementById('mecdInputCFDestino');
  const btnAgregarCF = document.getElementById('btnAgregarCFMECD');
  const tbodyCF = document.getElementById('mecdTbodyCF');
  const badgeCF = document.getElementById('mecdCountCFBadge');

  const inputSFPasajero = document.getElementById('mecdInputSFPasajero');
  const inputSFColilla = document.getElementById('mecdInputSFColilla');
  const inputSFControl = document.getElementById('mecdInputSFControl');
  const inputSFDestino = document.getElementById('mecdInputSFDestino');
  const btnAgregarSF = document.getElementById('btnAgregarSFMECD');
  const tbodySF = document.getElementById('mecdTbodySF');
  const badgeSF = document.getElementById('mecdCountSFBadge');

  const btnVistaPreliminar = document.getElementById('btnVistaPreliminarMECD');
  const btnGuardarDefinitivo = document.getElementById('btnGuardarDefinitivoMECD');

  // Bloqueo estricto en cliente de la Fecha del Itinerario (#mecdFecha)
  if (inputFecha && initialState.fecha) {
    inputFecha.value = initialState.fecha;
    inputFecha.setAttribute('readonly', 'readonly');
    inputFecha.setAttribute('disabled', 'disabled');
    inputFecha.addEventListener('change', () => {
      inputFecha.value = initialState.fecha;
    });
  }

  // Inicializar los 3 lienzos de firma (con bloqueo inmutable desde Repositorio GitHub)
  const signaturePads = {};
  ['mecdCanvasFirmaCCO', 'mecdCanvasFirmaAgente', 'mecdCanvasFirmaSupervisor'].forEach((canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (typeof window.SioSignaturePad === 'function') {
      signaturePads[canvasId] = new window.SioSignaturePad(canvas);
    }
  });

  form.querySelectorAll('button[data-clear-canvas]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-clear-canvas');
      const pad = signaturePads[id];
      if (pad && pad.isLocked && pad.isLocked()) return;
      pad?.clear();
    });
  });

  function notifyMecdToast(title) {
    if (typeof window.Swal !== 'undefined') {
      window.Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title,
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true
      });
    }
  }

  function renderGrids() {
    if (badgeRev) badgeRev.textContent = `${revision.length} registro(s)`;
    if (badgeCF) badgeCF.textContent = `${conFirma.length} registro(s)`;
    if (badgeSF) badgeSF.textContent = `${sinFirma.length} registro(s)`;

    if (tbodyRev) {
      if (revision.length === 0) {
        tbodyRev.innerHTML = `
          <tr class="er-empty-row mecd-empty-row">
            <td colspan="4" class="er-empty-cell mecd-empty-cell">
              <div class="cp-empty-dashed er-empty-card">
                <div class="er-empty-title">No hay registros agregados aún</div>
                <div class="er-empty-hint">Ingrese No. de Control y No. de Colilla y presione <strong>"Agregar a Revisión"</strong>.</div>
              </div>
            </td>
          </tr>
        `;
      } else {
        tbodyRev.innerHTML = revision
          .map(
            (r, i) => `
              <tr data-row-index="${i}" class="mecd-compact-row">
                <td class="mecd-td-no" data-label="No.">${i + 1}</td>
                <td class="mecd-td-rev-ctrl" data-label="No. de Control *">
                  <input type="number" class="form-control mecd-cell-input mecd-compact-input er-cell-center" data-grid="rev" data-idx="${i}" data-field="Control" min="1" step="1" inputmode="numeric" value="${esc(r.Control)}" aria-label="Revisión fila ${i + 1} No. de Control">
                </td>
                <td class="mecd-td-rev-col" data-label="No. de Colilla *">
                  <input type="text" class="form-control mecd-cell-input mecd-compact-input er-cell-center" data-grid="rev" data-idx="${i}" data-field="Colilla" inputmode="numeric" value="${esc(r.Colilla)}" aria-label="Revisión fila ${i + 1} No. de Colilla">
                </td>
                <td class="mecd-td-act" data-label="Acción">
                  <button type="button" class="cp-icon-btn trash mecd-del-btn" data-del-grid="rev" data-idx="${i}" title="Retirar registro #${i + 1}">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </td>
              </tr>
            `
          )
          .join('');
      }
    }

    const renderDetailedRows = (list, gridKey, emptyTitle) => {
      if (list.length === 0) {
        return `
          <tr class="er-empty-row mecd-empty-row">
            <td colspan="6" class="er-empty-cell mecd-empty-cell">
              <div class="cp-empty-dashed er-empty-card">
                <div class="er-empty-title">${esc(emptyTitle)}</div>
                <div class="er-empty-hint">Complete los campos superiores y presione el botón de agregar.</div>
              </div>
            </td>
          </tr>
        `;
      }
      return list
        .map(
          (r, i) => `
            <tr data-row-index="${i}" class="mecd-card-row">
              <td class="mecd-td-num" data-label="No.">
                <div class="er-num-badge">
                  <span class="er-num-text"><span class="er-mobile-prefix">Registro #</span><span class="er-row-number">${i + 1}</span></span>
                </div>
              </td>
              <td class="mecd-td-pasajero" data-label="Nombre del Pasajero *">
                <input type="text" class="form-control mecd-cell-input" data-grid="${gridKey}" data-idx="${i}" data-field="NombrePasajero" value="${esc(r.NombrePasajero)}" placeholder="Nombre del pasajero *" aria-label="Fila ${i + 1} Nombre del Pasajero">
              </td>
              <td class="mecd-td-colilla" data-label="No. de Colilla *">
                <input type="text" class="form-control mecd-cell-input er-cell-center" data-grid="${gridKey}" data-idx="${i}" data-field="Colilla" inputmode="numeric" value="${esc(r.Colilla)}" placeholder="Colilla *" aria-label="Fila ${i + 1} No. de Colilla">
              </td>
              <td class="mecd-td-control" data-label="No. de Control *">
                <input type="number" class="form-control mecd-cell-input er-cell-center" data-grid="${gridKey}" data-idx="${i}" data-field="Control" min="1" step="1" inputmode="numeric" value="${esc(r.Control)}" placeholder="Control *" aria-label="Fila ${i + 1} No. de Control">
              </td>
              <td class="mecd-td-destino" data-label="Destino">
                <input type="text" class="form-control mecd-cell-input er-cell-center" data-grid="${gridKey}" data-idx="${i}" data-field="Destino" value="${esc(r.Destino)}" placeholder="${esc(initialState.destinoDefault || 'MEX')}" aria-label="Fila ${i + 1} Destino">
              </td>
              <td class="mecd-td-accion" data-label="Acción">
                <button type="button" class="cp-icon-btn trash mecd-del-btn mecd-card-del-btn" data-del-grid="${gridKey}" data-idx="${i}" title="Retirar registro #${i + 1}">
                  <i class="fas fa-trash-alt"></i>
                  <span class="er-mobile-action-label">Retirar</span>
                </button>
              </td>
            </tr>
          `
        )
        .join('');
    };

    if (tbodyCF) {
      tbodyCF.innerHTML = renderDetailedRows(conFirma, 'cf', 'No hay registros agregados aún');
    }

    if (tbodySF) {
      tbodySF.innerHTML = renderDetailedRows(sinFirma, 'sf', 'No hay registros agregados aún');
    }
  }

  // Sincronización de edición inline y borrado en las 3 tablas
  form.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-grid]');
    if (!inp) return;
    const grid = inp.getAttribute('data-grid');
    const idx = parseInt(inp.getAttribute('data-idx'), 10);
    const field = inp.getAttribute('data-field');
    const list = grid === 'rev' ? revision : grid === 'cf' ? conFirma : sinFirma;
    if (list[idx] && field) {
      list[idx][field] = inp.value;
      window.SioOfflineManager?.notifyStateChange?.();
    }
  });

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-del-grid]');
    if (!btn) return;
    const grid = btn.getAttribute('data-del-grid');
    const idx = parseInt(btn.getAttribute('data-idx'), 10);
    const list = grid === 'rev' ? revision : grid === 'cf' ? conFirma : sinFirma;
    if (list[idx]) {
      list.splice(idx, 1);
      renderGrids();
      window.SioOfflineManager?.notifyStateChange?.(true);
    }
  });

  if (btnAgregarRev) {
    btnAgregarRev.addEventListener('click', () => {
      const ctrl = String(inputRevControl?.value || '').trim();
      const col = String(inputRevColilla?.value || '').trim();
      if (!ctrl || !col) {
        if (!ctrl) Validator?.markElementInvalid(inputRevControl);
        if (!col) Validator?.markElementInvalid(inputRevColilla);
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Ingrese No. de Control y No. de Colilla para Revisión.', confirmButtonColor: '#0F2744' });
        return;
      }
      revision.push({ EquipajeRevId: 0, Control: ctrl, Colilla: col });
      inputRevControl.value = '';
      inputRevColilla.value = '';
      renderGrids();
      window.SioOfflineManager?.notifyStateChange?.();
      notifyMecdToast('Equipaje agregado a Revisión');
      inputRevControl.focus();
    });
  }

  if (btnAgregarCF) {
    btnAgregarCF.addEventListener('click', () => {
      const pax = String(inputCFPasajero?.value || '').trim();
      const col = String(inputCFColilla?.value || '').trim();
      const ctrl = String(inputCFControl?.value || '').trim();
      const dest = String(inputCFDestino?.value || initialState.destinoDefault || '').trim();
      if (!pax || !col || !ctrl) {
        if (!pax) Validator?.markElementInvalid(inputCFPasajero);
        if (!col) Validator?.markElementInvalid(inputCFColilla);
        if (!ctrl) Validator?.markElementInvalid(inputCFControl);
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Complete Nombre del Pasajero, No. de Colilla y No. de Control.', confirmButtonColor: '#0F2744' });
        return;
      }
      conFirma.push({ EquipajeMEId: 0, NombrePasajero: pax, Colilla: col, Control: ctrl, Destino: dest });
      inputCFPasajero.value = '';
      inputCFColilla.value = '';
      inputCFControl.value = '';
      if (inputCFDestino) inputCFDestino.value = '';
      renderGrids();
      window.SioOfflineManager?.notifyStateChange?.();
      notifyMecdToast('Maleta Con Firma agregada');
      inputCFPasajero.focus();
    });
  }

  if (btnAgregarSF) {
    btnAgregarSF.addEventListener('click', () => {
      const pax = String(inputSFPasajero?.value || '').trim();
      const col = String(inputSFColilla?.value || '').trim();
      const ctrl = String(inputSFControl?.value || '').trim();
      const dest = String(inputSFDestino?.value || initialState.destinoDefault || '').trim();
      if (!pax || !col || !ctrl) {
        if (!pax) Validator?.markElementInvalid(inputSFPasajero);
        if (!col) Validator?.markElementInvalid(inputSFColilla);
        if (!ctrl) Validator?.markElementInvalid(inputSFControl);
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Complete Nombre del Pasajero, No. de Colilla y No. de Control.', confirmButtonColor: '#0F2744' });
        return;
      }
      sinFirma.push({ EquipajeMEDSFId: 0, NombrePasajero: pax, Colilla: col, Control: ctrl, Destino: dest });
      inputSFPasajero.value = '';
      inputSFColilla.value = '';
      inputSFControl.value = '';
      if (inputSFDestino) inputSFDestino.value = '';
      renderGrids();
      window.SioOfflineManager?.notifyStateChange?.();
      notifyMecdToast('Maleta Sin Firma agregada');
      inputSFPasajero.focus();
    });
  }

  function recopilarPayload(guardarDefinitivo) {
    const ccoOpt = selectCCO?.options?.[selectCCO.selectedIndex];
    const ccoNombre = ccoOpt ? (ccoOpt.getAttribute('data-usuario') || ccoOpt.textContent || '').trim() : '';

    const agOpt = selectAgente?.options?.[selectAgente.selectedIndex];
    const agenteNombre = agOpt ? (agOpt.getAttribute('data-usuario') || agOpt.textContent || '').trim() : '';

    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supervisorNombre = supOpt ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim() : '';

    return {
      formatoId: inputFormatoId?.value || 'amx-mecd',
      itinerarioId: parseInt(inputItinerarioId?.value || '0', 10),
      encabezadoId: inputEncabezadoId?.value ? parseInt(inputEncabezadoId.value, 10) : null,
      guardar: Boolean(guardarDefinitivo),
      datos: {
        fecha: String(inputFecha?.value || '').trim(),
        ccoLoginId: selectCCO?.value ? parseInt(selectCCO.value, 10) : null,
        ccoNombre,
        agenteLoginSecId: selectAgente?.value ? parseInt(selectAgente.value, 10) : null,
        agenteNombre,
        supervisorLoginSecId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : null,
        supervisorNombre,
        revision,
        conFirma,
        sinFirma,
        firmaCCO: (signaturePads.mecdCanvasFirmaCCO && !signaturePads.mecdCanvasFirmaCCO.isEmpty())
          ? signaturePads.mecdCanvasFirmaCCO.toDataURL('image/png')
          : '',
        firmaAgente: (signaturePads.mecdCanvasFirmaAgente && !signaturePads.mecdCanvasFirmaAgente.isEmpty())
          ? signaturePads.mecdCanvasFirmaAgente.toDataURL('image/png')
          : '',
        firmaSupervisor: (signaturePads.mecdCanvasFirmaSupervisor && !signaturePads.mecdCanvasFirmaSupervisor.isEmpty())
          ? signaturePads.mecdCanvasFirmaSupervisor.toDataURL('image/png')
          : ''
      }
    };
  }

  function validarFormularioFrontend() {
    Validator?.clearValidationErrors(form);
    const errors = [];

    if (!String(inputFecha?.value || '').trim()) {
      Validator?.markElementInvalid(inputFecha);
      errors.push({ label: 'Fecha', message: 'La Fecha es obligatoria.', element: inputFecha });
    }
    if (!String(selectCCO?.value || '').trim()) {
      Validator?.markElementInvalid(selectCCO);
      errors.push({ label: 'Representante CCO', message: 'Debe seleccionar al Representante CCO.', element: selectCCO });
    }
    if (!String(selectAgente?.value || '').trim()) {
      Validator?.markElementInvalid(selectAgente);
      errors.push({ label: 'Agente de Seguridad', message: 'Debe seleccionar al Agente de Seguridad.', element: selectAgente });
    }
    if (!String(selectSupervisor?.value || '').trim()) {
      Validator?.markElementInvalid(selectSupervisor);
      errors.push({ label: 'Supervisor de Seguridad', message: 'Debe seleccionar al Supervisor de Seguridad.', element: selectSupervisor });
    }

    if (revision.length === 0 && conFirma.length === 0 && sinFirma.length === 0) {
      Validator?.markElementInvalid(inputRevControl);
      errors.push({
        label: 'Registros de Equipaje',
        message: 'Debe capturar al menos 1 registro en Revisión, Maleta Con Firma o Maleta Sin Firma.',
        element: inputRevControl
      });
    }

    if (errors.length > 0) {
      Validator?.focusAndAlert({
        title: 'Campos obligatorios pendientes en Equipaje en Mal Estado',
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
        text: 'Procesando información en Azure SQL',
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
              ccoLoginId: selectCCO,
              agenteLoginSecId: selectAgente,
              supervisorLoginSecId: selectSupervisor,
              detalles: inputRevControl
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
      if (json.firmasRepo) {
        window.SioSignatureRepoClient?.applyRepoState?.(json.firmasRepo);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Formato Guardado!',
        text: json.mensaje || json.message || 'Formato de Equipajes en Mal Estado guardado correctamente.',
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
      console.error('[MECD SAVE ERROR]', err);
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

  renderGrids();

  window.SioOfflineManager?.registerStateAdapter?.('format:mecd', {
    capture: () => ({
      revision: revision.map((r) => ({ ...r })),
      conFirma: conFirma.map((r) => ({ ...r })),
      sinFirma: sinFirma.map((r) => ({ ...r }))
    }),
    restore: (saved) => {
      if (!saved || typeof saved !== 'object') return;
      if (Array.isArray(saved.revision)) revision = normalizeMecdRev(saved.revision);
      if (Array.isArray(saved.conFirma)) conFirma = normalizeMecdCF(saved.conFirma);
      if (Array.isArray(saved.sinFirma)) sinFirma = normalizeMecdSF(saved.sinFirma);
      renderGrids();
    },
    reset: () => {
      revision = initialRevBaseline.map((r) => ({ ...r }));
      conFirma = initialCFBaseline.map((r) => ({ ...r }));
      sinFirma = initialSFBaseline.map((r) => ({ ...r }));
      renderGrids();
    },
    mapLegacyPatch: (patch) => {
      if (!patch || (!Array.isArray(patch.revision) && !Array.isArray(patch.conFirma) && !Array.isArray(patch.sinFirma))) {
        return undefined;
      }
      return {
        revision: Array.isArray(patch.revision) ? patch.revision : initialRevBaseline,
        conFirma: Array.isArray(patch.conFirma) ? patch.conFirma : initialCFBaseline,
        sinFirma: Array.isArray(patch.sinFirma) ? patch.sinFirma : initialSFBaseline
      };
    }
  });
});
