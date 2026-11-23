/**
 * formato-rx.js — Control de Equipaje en Rayos X (ControlDeEquipajeEnRayosXDL_1 / dl-rx - DELTA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaRX');
  const stateEl = document.getElementById('rxInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[RX INIT PARSE ERROR]', err);
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

  const formatoId = document.getElementById('rxFormatoId')?.value || initialState.formatoId || 'dl-rx';
  const itinerarioId = parseInt(document.getElementById('rxItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('rxEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const empleadosLaats = Array.isArray(initialState.empleadosLaats) ? initialState.empleadosLaats : [];
  const empMap = new Map();
  empleadosLaats.forEach((e) => empMap.set(Number(e.EmpleadoId), String(e.Nombre || '')));

  const normalizeRxSag = (list) => (Array.isArray(list) ? list : []).map((s, i) => ({
    No: i + 1,
    PersonalSAGId: parseInt(s.PersonalSAGId, 10) || 0,
    Nombre: String(s.Nombre || '').trim(),
    Id: String(s.Id || '').trim()
  }));

  const normalizeRxLaats = (list) => (Array.isArray(list) ? list : []).map((l, i) => ({
    No: i + 1,
    PersonalLaatsId: parseInt(l.PersonalLaatsId, 10) || 0,
    EmpleadoId: parseInt(l.EmpleadoId, 10) || '',
    Nombre: String(l.Nombre || empMap.get(Number(l.EmpleadoId)) || '').trim(),
    Id: String(l.Id || '').trim()
  }));

  let personalSAG = normalizeRxSag(initialState.personalSAG);
  let personalLaats = normalizeRxLaats(initialState.personalLaats);
  const initialSagBaseline = personalSAG.map((s) => ({ ...s }));
  const initialLaatsBaseline = personalLaats.map((l) => ({ ...l }));

  const inputFecha = document.getElementById('rxFecha');
  const inputHoraInicio = document.getElementById('rxHoraInicio');
  const selectSupervisor = document.getElementById('rxSupervisor');
  const inputAgente = document.getElementById('rxAgente');
  const inputPEq = document.getElementById('rxPEquipajeRecibidoRX');
  const inputPCar = document.getElementById('rxPCarretaEnviada');
  const inputUEq = document.getElementById('rxUEquipajeRX');
  const inputUCar = document.getElementById('rxUCarretaEnviada');
  const inputObs = document.getElementById('rxObservaciones');

  const inputSagNombre = document.getElementById('rxInputSagNombre');
  const inputSagId = document.getElementById('rxInputSagId');
  const tbodySag = document.getElementById('rxTbodySag');
  const badgeSag = document.getElementById('rxTotalSagBadge');

  const selectLaatsEmp = document.getElementById('rxInputLaatsEmpleado');
  const inputLaatsId = document.getElementById('rxInputLaatsId');
  const tbodyLaats = document.getElementById('rxTbodyLaats');
  const badgeLaats = document.getElementById('rxTotalLaatsBadge');

  function getNowHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  form.querySelectorAll('[data-rx-clock]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-rx-clock'));
      if (target) {
        target.value = getNowHHMM();
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  function renderTablaSag() {
    if (badgeSag) badgeSag.textContent = String(personalSAG.length);
    if (!tbodySag) return;
    if (personalSAG.length === 0) {
      tbodySag.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="4" style="text-align:center; padding:18px; color:var(--text-3);">
            Sin integrantes registrados en Personal SAG.
          </td>
        </tr>`;
      return;
    }

    tbodySag.innerHTML = personalSAG.map((s, idx) => `
      <tr data-row-index="${idx}" data-sag-idx="${idx}" class="er-grid-row">
        <td style="text-align:center; font-weight:700;">${idx + 1}</td>
        <td>
          <input type="text" class="form-control er-cell-input" data-field="Nombre" maxlength="150" value="${escapeHtmlAttr(s.Nombre)}" placeholder="Nombre completo *">
        </td>
        <td>
          <input type="text" class="form-control er-cell-input er-cell-center" data-field="Id" maxlength="50" value="${escapeHtmlAttr(s.Id)}" placeholder="ID *">
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-danger btn-rx-del-sag" data-idx="${idx}" style="padding:4px 8px; font-size:11px;" title="Retirar">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function buildLaatsOptions(selectedId) {
    let html = '<option value="">-- Seleccione Agente --</option>';
    empleadosLaats.forEach((emp) => {
      const sel = String(emp.EmpleadoId) === String(selectedId) ? 'selected' : '';
      html += `<option value="${esc(emp.EmpleadoId)}" ${sel}>${esc(emp.Nombre)}</option>`;
    });
    return html;
  }

  function renderTablaLaats() {
    if (badgeLaats) badgeLaats.textContent = String(personalLaats.length);
    if (!tbodyLaats) return;
    if (personalLaats.length === 0) {
      tbodyLaats.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="4" style="text-align:center; padding:18px; color:var(--text-3);">
            Sin integrantes registrados en Personal LAATS.
          </td>
        </tr>`;
      return;
    }

    tbodyLaats.innerHTML = personalLaats.map((l, idx) => `
      <tr data-row-index="${idx}" data-laats-idx="${idx}" class="er-grid-row">
        <td style="text-align:center; font-weight:700;">${idx + 1}</td>
        <td>
          <select class="form-control er-cell-input" data-field="EmpleadoId">${buildLaatsOptions(l.EmpleadoId)}</select>
        </td>
        <td>
          <input type="text" class="form-control er-cell-input er-cell-center" data-field="Id" maxlength="50" value="${escapeHtmlAttr(l.Id)}" placeholder="ID *">
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-danger btn-rx-del-laats" data-idx="${idx}" style="padding:4px 8px; font-size:11px;" title="Retirar">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function escapeHtmlAttr(str) {
    return esc(str);
  }

  document.getElementById('btnAgregarSagRX')?.addEventListener('click', () => {
    const nombre = String(inputSagNombre?.value || '').trim();
    const id = String(inputSagId?.value || '').trim();
    Validator?.clearValidationErrors(form);
    const errs = [];
    if (!nombre) {
      Validator?.markElementInvalid(inputSagNombre);
      errs.push({ label: 'Personal SAG - Nombre', message: 'El nombre es obligatorio.', element: inputSagNombre });
    }
    if (!id) {
      Validator?.markElementInvalid(inputSagId);
      errs.push({ label: 'Personal SAG - ID / TIA', message: 'El ID es obligatorio.', element: inputSagId });
    }
    if (errs.length > 0) {
      Validator?.notifyValidationErrors(errs, 'Datos Incompletos — Personal SAG');
      return;
    }
    personalSAG.push({ No: personalSAG.length + 1, PersonalSAGId: 0, Nombre: nombre, Id: id });
    inputSagNombre.value = '';
    inputSagId.value = '';
    inputSagNombre.focus();
    renderTablaSag();
  });

  document.getElementById('btnAgregarFilaSagRX')?.addEventListener('click', () => {
    personalSAG.push({ No: personalSAG.length + 1, PersonalSAGId: 0, Nombre: '', Id: '' });
    renderTablaSag();
  });

  document.getElementById('btnAgregarLaatsRX')?.addEventListener('click', () => {
    const empId = parseInt(selectLaatsEmp?.value || '0', 10) || 0;
    const id = String(inputLaatsId?.value || '').trim();
    Validator?.clearValidationErrors(form);
    const errs = [];
    if (empId <= 0) {
      Validator?.markElementInvalid(selectLaatsEmp);
      errs.push({ label: 'Personal LAATS - Agente', message: 'Debe seleccionar un agente.', element: selectLaatsEmp });
    }
    if (!id) {
      Validator?.markElementInvalid(inputLaatsId);
      errs.push({ label: 'Personal LAATS - ID / TIA', message: 'El ID es obligatorio.', element: inputLaatsId });
    }
    if (errs.length > 0) {
      Validator?.notifyValidationErrors(errs, 'Datos Incompletos — Personal LAATS');
      return;
    }
    personalLaats.push({
      No: personalLaats.length + 1,
      PersonalLaatsId: 0,
      EmpleadoId: empId,
      Nombre: empMap.get(empId) || '',
      Id: id
    });
    selectLaatsEmp.value = '';
    inputLaatsId.value = '';
    renderTablaLaats();
  });

  document.getElementById('btnAgregarFilaLaatsRX')?.addEventListener('click', () => {
    personalLaats.push({ No: personalLaats.length + 1, PersonalLaatsId: 0, EmpleadoId: '', Nombre: '', Id: '' });
    renderTablaLaats();
  });

  tbodySag?.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-sag-idx]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.sagIdx, 10);
    const field = e.target.getAttribute('data-field');
    if (personalSAG[idx] && field) {
      personalSAG[idx][field] = e.target.value;
    }
  });

  tbodySag?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-rx-del-sag');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (Number.isInteger(idx) && personalSAG[idx]) {
      personalSAG.splice(idx, 1);
      renderTablaSag();
    }
  });

  tbodyLaats?.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-laats-idx]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.laatsIdx, 10);
    const field = e.target.getAttribute('data-field');
    if (personalLaats[idx] && field) {
      personalLaats[idx][field] = e.target.value;
    }
  });

  tbodyLaats?.addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-laats-idx]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.laatsIdx, 10);
    if (personalLaats[idx] && e.target.getAttribute('data-field') === 'EmpleadoId') {
      const empId = parseInt(e.target.value || '0', 10) || '';
      personalLaats[idx].EmpleadoId = empId;
      personalLaats[idx].Nombre = empId ? (empMap.get(empId) || '') : '';
    }
  });

  tbodyLaats?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-rx-del-laats');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (Number.isInteger(idx) && personalLaats[idx]) {
      personalLaats.splice(idx, 1);
      renderTablaLaats();
    }
  });

  function recopilarPayload() {
    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supervisorNombre = supOpt && selectSupervisor.value
      ? (supOpt.getAttribute('data-nombre') || supOpt.textContent || '').trim()
      : '';

    return {
      fecha: String(inputFecha?.value || '').trim().substring(0, 10),
      horaInicio: String(inputHoraInicio?.value || '').trim(),
      supervisorEmpleadoId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : '',
      supervisorNombre,
      agente: String(inputAgente?.value || '').trim(),
      pEquipajeRecibidoRX: String(inputPEq?.value || '').trim(),
      pCarretaEnviada: String(inputPCar?.value || '').trim(),
      uEquipajeRX: String(inputUEq?.value || '').trim(),
      uCarretaEnviada: String(inputUCar?.value || '').trim(),
      observaciones: String(inputObs?.value || '').trim(),
      personalSAG: personalSAG.map((s) => ({
        PersonalSAGId: s.PersonalSAGId || 0,
        Nombre: String(s.Nombre || '').trim(),
        Id: String(s.Id || '').trim()
      })),
      personalLaats: personalLaats.map((l) => ({
        PersonalLaatsId: l.PersonalLaatsId || 0,
        EmpleadoId: l.EmpleadoId ? parseInt(l.EmpleadoId, 10) : '',
        Nombre: String(l.Nombre || empMap.get(Number(l.EmpleadoId)) || '').trim(),
        Id: String(l.Id || '').trim()
      }))
    };
  }

  function validarFormularioFrontend() {
    if (!Validator) return true;
    const sagRows = Array.from(tbodySag?.querySelectorAll('tr[data-sag-idx]') || []);
    const resSag = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        { field: 'fecha', label: 'Fecha', element: inputFecha, required: true, type: 'date' },
        { field: 'horaInicio', label: 'Hora Inicia Puesto', element: inputHoraInicio, required: true, type: 'time' },
        { field: 'supervisorEmpleadoId', label: 'Supervisor de Turno', element: selectSupervisor, required: true, type: 'integer', min: 1 },
        { field: 'pEquipajeRecibidoRX', label: 'Primer Equipaje Recibido en RX', element: inputPEq, required: true, type: 'time' },
        { field: 'pCarretaEnviada', label: 'Primera Carreta Enviada', element: inputPCar, required: true, type: 'time' },
        { field: 'uEquipajeRX', label: 'Último Equipaje Recibido en RX', element: inputUEq, required: true, type: 'time' },
        { field: 'uCarretaEnviada', label: 'Última Carreta Enviada', element: inputUCar, required: true, type: 'time' }
      ],
      gridContainer: document.getElementById('rxSagWrapper'),
      rowElements: sagRows,
      rowRules: [
        { field: 'Nombre', label: 'Personal SAG - Nombre', required: true, type: 'string', maxLength: 150 },
        { field: 'Id', label: 'Personal SAG - ID / TIA', required: true, type: 'string', maxLength: 50 }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos un (1) integrante en Personal SAG antes de guardar.',
      emptyRowsFocusElement: inputSagNombre
    });

    const errors = [...resSag.errors];
    const laatsRows = Array.from(tbodyLaats?.querySelectorAll('tr[data-laats-idx]') || []);
    const laatsWrapper = document.getElementById('rxLaatsWrapper');
    if (laatsRows.length === 0) {
      laatsWrapper?.classList.add('sio-grid-invalid');
      Validator.markElementInvalid(selectLaatsEmp);
      errors.push({
        scope: 'grid',
        row: null,
        field: 'personalLaats',
        label: 'Personal LAATS',
        reason: 'Debe registrar al menos un (1) integrante en Personal LAATS.',
        message: 'Debe registrar al menos un (1) integrante en Personal LAATS.',
        element: selectLaatsEmp
      });
    } else {
      const laatsRules = [
        { field: 'EmpleadoId', label: 'Personal LAATS - Agente', required: true, type: 'integer', min: 1 },
        { field: 'Id', label: 'Personal LAATS - ID / TIA', required: true, type: 'string', maxLength: 50 }
      ];
      laatsRows.forEach((tr, idx) => {
        laatsRules.forEach((rule) => {
          const el = tr.querySelector(`[data-field="${rule.field}"]`);
          const chk = Validator.validateSingleValue(el ? el.value : '', rule);
          if (!chk.valid) {
            Validator.markElementInvalid(el, tr);
            errors.push({
              scope: 'row',
              row: idx + 1,
              field: rule.field,
              label: rule.label,
              reason: chk.reason,
              message: `LAATS Fila #${idx + 1} - "${rule.label}" ${chk.reason}`,
              element: el || tr
            });
          }
        });
      });
    }

    if (errors.length > 0) {
      Validator.notifyValidationErrors(errors, 'Validación Obligatoria — Control de Equipaje en Rayos X');
      return false;
    }
    return true;
  }

  async function enviarFormato(guardar) {
    if (guardar && !validarFormularioFrontend()) return;

    let previewWin = null;
    if (!guardar) {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try { previewWin.document.title = 'Generando Vista Preliminar...'; } catch (_) {}
      }
    }

    const rxPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Control de Rayos X...' : 'Generando Vista Preliminar...',
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
          datos: { rxPayload }
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
              horaInicio: inputHoraInicio,
              supervisorEmpleadoId: selectSupervisor,
              pEquipajeRecibidoRX: inputPEq,
              pCarretaEnviada: inputPCar,
              uEquipajeRX: inputUEq,
              uCarretaEnviada: inputUCar
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
        const encInput = document.getElementById('rxEncabezadoId');
        if (encInput) encInput.value = String(encabezadoId);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Control de Equipaje en Rayos X guardado correctamente.',
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

  document.getElementById('btnVistaPreliminarRX')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoRX')?.addEventListener('click', () => enviarFormato(true));

  renderTablaSag();
  renderTablaLaats();

  window.SioOfflineManager?.registerStateAdapter?.('format:rx', {
    capture: () => ({
      personalSAG: personalSAG.map((s) => ({ ...s })),
      personalLaats: personalLaats.map((l) => ({ ...l }))
    }),
    restore: (saved) => {
      if (!saved || typeof saved !== 'object') return;
      if (Array.isArray(saved.personalSAG)) personalSAG = normalizeRxSag(saved.personalSAG);
      if (Array.isArray(saved.personalLaats)) personalLaats = normalizeRxLaats(saved.personalLaats);
      renderTablaSag();
      renderTablaLaats();
    },
    reset: () => {
      personalSAG = initialSagBaseline.map((s) => ({ ...s }));
      personalLaats = initialLaatsBaseline.map((l) => ({ ...l }));
      renderTablaSag();
      renderTablaLaats();
    },
    mapLegacyPatch: (patch) => {
      if (!patch || (!Array.isArray(patch.personalSAG) && !Array.isArray(patch.personalLaats))) return undefined;
      return {
        personalSAG: Array.isArray(patch.personalSAG) ? patch.personalSAG : initialSagBaseline,
        personalLaats: Array.isArray(patch.personalLaats) ? patch.personalLaats : initialLaatsBaseline
      };
    }
  });
});
