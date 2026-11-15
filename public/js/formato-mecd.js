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

  let revision = (Array.isArray(initialState.revision) ? initialState.revision : []).map((r) => ({
    DetalleEquipMECDId: parseInt(r.DetalleEquipMECDId ?? r.EquipajeRevId, 10) || 0,
    EquipajeRevId: parseInt(r.DetalleEquipMECDId ?? r.EquipajeRevId, 10) || 0,
    Control: String(r.Control ?? '').trim(),
    Colilla: String(r.Colilla ?? '').trim()
  }));

  let conFirma = (Array.isArray(initialState.conFirma) ? initialState.conFirma : []).map((r) => ({
    EquipajeMEId: parseInt(r.EquipajeMEId, 10) || 0,
    NombrePasajero: String(r.NombrePasajero ?? r.Pasajero ?? '').trim(),
    Colilla: String(r.Colilla ?? '').trim(),
    Control: String(r.Control ?? '').trim(),
    Destino: String(r.Destino ?? initialState.destinoDefault ?? '').trim()
  }));

  let sinFirma = (Array.isArray(initialState.sinFirma) ? initialState.sinFirma : []).map((r) => ({
    EquipajeDTId: parseInt(r.EquipajeDTId ?? r.EquipajeMEDSFId, 10) || 0,
    EquipajeMEDSFId: parseInt(r.EquipajeDTId ?? r.EquipajeMEDSFId, 10) || 0,
    NombrePasajero: String(r.NombrePasajero ?? r.Pasajero ?? '').trim(),
    Colilla: String(r.Colilla ?? '').trim(),
    Control: String(r.Control ?? '').trim(),
    Destino: String(r.Destino ?? initialState.destinoDefault ?? '').trim()
  }));

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

  // Inicializar los 3 lienzos de firma
  const signaturePads = {};
  ['mecdCanvasFirmaCCO', 'mecdCanvasFirmaAgente', 'mecdCanvasFirmaSupervisor'].forEach((canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasInk = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || 280;
      canvas.height = rect.height || 120;
      ctx.strokeStyle = '#0F2744';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    };
    resize();

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    canvas.addEventListener('mousedown', (e) => {
      drawing = true;
      hasInk = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    window.addEventListener('mouseup', () => {
      drawing = false;
    });

    signaturePads[canvasId] = {
      clear: () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasInk = false;
      },
      toDataURL: () => (hasInk ? canvas.toDataURL('image/png') : '')
    };
  });

  form.querySelectorAll('button[data-clear-canvas]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-clear-canvas');
      signaturePads[id]?.clear();
    });
  });

  function renderGrids() {
    if (badgeRev) badgeRev.textContent = `${revision.length} registro(s)`;
    if (badgeCF) badgeCF.textContent = `${conFirma.length} registro(s)`;
    if (badgeSF) badgeSF.textContent = `${sinFirma.length} registro(s)`;

    if (tbodyRev) {
      if (revision.length === 0) {
        tbodyRev.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-3); padding:14px;">Sin registros en Revisión.</td></tr>`;
      } else {
        tbodyRev.innerHTML = revision
          .map(
            (r, i) => `
              <tr data-row-index="${i}">
                <td style="text-align:center; font-weight:700;">${i + 1}</td>
                <td><input type="number" class="form-control" data-grid="rev" data-idx="${i}" data-field="Control" value="${esc(r.Control)}"></td>
                <td><input type="text" class="form-control" data-grid="rev" data-idx="${i}" data-field="Colilla" value="${esc(r.Colilla)}"></td>
                <td style="text-align:center;">
                  <button type="button" class="btn btn-secondary" data-del-grid="rev" data-idx="${i}" style="color:var(--danger); border-color:var(--danger); padding:4px 8px;">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </td>
              </tr>
            `
          )
          .join('');
      }
    }

    if (tbodyCF) {
      if (conFirma.length === 0) {
        tbodyCF.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-3); padding:14px;">Sin registros Con Firma desde Mostrador.</td></tr>`;
      } else {
        tbodyCF.innerHTML = conFirma
          .map(
            (r, i) => `
              <tr data-row-index="${i}">
                <td style="text-align:center; font-weight:700;">${i + 1}</td>
                <td><input type="text" class="form-control" data-grid="cf" data-idx="${i}" data-field="NombrePasajero" value="${esc(r.NombrePasajero)}"></td>
                <td><input type="text" class="form-control" data-grid="cf" data-idx="${i}" data-field="Colilla" value="${esc(r.Colilla)}"></td>
                <td><input type="number" class="form-control" data-grid="cf" data-idx="${i}" data-field="Control" value="${esc(r.Control)}"></td>
                <td><input type="text" class="form-control" data-grid="cf" data-idx="${i}" data-field="Destino" value="${esc(r.Destino)}"></td>
                <td style="text-align:center;">
                  <button type="button" class="btn btn-secondary" data-del-grid="cf" data-idx="${i}" style="color:var(--danger); border-color:var(--danger); padding:4px 8px;">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </td>
              </tr>
            `
          )
          .join('');
      }
    }

    if (tbodySF) {
      if (sinFirma.length === 0) {
        tbodySF.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-3); padding:14px;">Sin registros Sin Firma en Tobogán.</td></tr>`;
      } else {
        tbodySF.innerHTML = sinFirma
          .map(
            (r, i) => `
              <tr data-row-index="${i}">
                <td style="text-align:center; font-weight:700;">${i + 1}</td>
                <td><input type="text" class="form-control" data-grid="sf" data-idx="${i}" data-field="NombrePasajero" value="${esc(r.NombrePasajero)}"></td>
                <td><input type="text" class="form-control" data-grid="sf" data-idx="${i}" data-field="Colilla" value="${esc(r.Colilla)}"></td>
                <td><input type="number" class="form-control" data-grid="sf" data-idx="${i}" data-field="Control" value="${esc(r.Control)}"></td>
                <td><input type="text" class="form-control" data-grid="sf" data-idx="${i}" data-field="Destino" value="${esc(r.Destino)}"></td>
                <td style="text-align:center;">
                  <button type="button" class="btn btn-secondary" data-del-grid="sf" data-idx="${i}" style="color:var(--danger); border-color:var(--danger); padding:4px 8px;">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </td>
              </tr>
            `
          )
          .join('');
      }
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
      renderGrids();
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
      renderGrids();
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
        firmaCCO: signaturePads.mecdCanvasFirmaCCO?.toDataURL() || '',
        firmaAgente: signaturePads.mecdCanvasFirmaAgente?.toDataURL() || '',
        firmaSupervisor: signaturePads.mecdCanvasFirmaSupervisor?.toDataURL() || ''
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

      if (!guardarDefinitivo && json.previewUrl) {
        Swal.close();
        window.open(json.previewUrl, '_blank');
        return;
      }

      if (json.encabezadoId && inputEncabezadoId) {
        inputEncabezadoId.value = String(json.encabezadoId);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Formato Guardado!',
        text: json.message || 'Formato de Equipajes en Mal Estado guardado correctamente.',
        confirmButtonColor: '#0F2744'
      });

      if (json.encabezadoId) {
        window.location.href = `/formatos/${encodeURIComponent(payload.formatoId)}?encabezadoId=${json.encabezadoId}`;
      }
    } catch (err) {
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
});
