/**
 * formato-anexoa.js — Anexo A: Aircraft Access Control Log Sheet (AnexoAAirCanada / ac-anexoa - AIR CANADA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaAnexoA');
  const stateEl = document.getElementById('anexoAInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[ANEXOA INIT PARSE ERROR]', err);
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

  const formatoId = document.getElementById('axAFormatoId')?.value || initialState.formatoId || 'ac-anexoa';
  const itinerarioId = parseInt(document.getElementById('axAItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('axAEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const empresasList = (Array.isArray(initialState.empresas) && initialState.empresas.length > 0)
    ? initialState.empresas
    : ['LAATS', 'AIR CANADA', 'GODARD(Cocinas)', 'ODA (Combustible)', 'OIRSA', 'DGAC (Operaciones)', 'OTROS...'];

  let registros = (Array.isArray(initialState.registros) ? initialState.registros : []).map((r) => ({
    DetalleAnexoAId: parseInt(r.DetalleAnexoAId, 10) || 0,
    EmpleadoId: parseInt(r.EmpleadoId, 10) || 0,
    Nombre: String(r.Nombre || r.PersonalMonitoreo || '').trim(),
    NoTIA: String(r.NoTIA || r.AirportId || '').trim(),
    Empresa: String(r.Empresa || 'LAATS').trim(),
    HoraIngreso: extractHHMM(r.HoraIngreso || r.HoraInicio),
    Motivo: String(r.Motivo || r.MotivoAcceso || '').trim(),
    HoraSalida: extractHHMM(r.HoraSalida || r.HoraSalidaReal || r.HoraFin)
  }));

  const inputFecha = document.getElementById('axAFecha');
  const inputHoraRevision = document.getElementById('axAHoraRevision');
  const inputPuerta = document.getElementById('axAPuerta');
  const selectSupervisor = document.getElementById('axASupervisor');
  const inputArribo = document.getElementById('axAArriboVuelo');
  const inputAsegurada = document.getElementById('axAAeronaveAsegurada');
  const inputObservaciones = document.getElementById('axAObservaciones');

  const quickNombre = document.getElementById('axAInputNombre');
  const quickNoTIA = document.getElementById('axAInputNoTIA');
  const quickEmpresa = document.getElementById('axAInputEmpresa');
  const quickHoraIngreso = document.getElementById('axAInputHoraIngreso');
  const quickMotivo = document.getElementById('axAInputMotivo');
  const quickHoraSalida = document.getElementById('axAInputHoraSalida');
  const datalistEmp = document.getElementById('axAEmpleadosDatalist');

  const tbody = document.getElementById('axATbodyRegistros');
  const gridWrapper = document.getElementById('axAGridWrapper');
  const filtroTexto = document.getElementById('axAFiltroTexto');
  const totalBadge = document.getElementById('axATotalBadge');
  const pendientesBadge = document.getElementById('axAPendientesBadge');

  // Relojes rápidos
  document.getElementById('btnAxAHoraRevAhora')?.addEventListener('click', () => {
    if (inputHoraRevision) inputHoraRevision.value = nowHHMM();
  });
  document.getElementById('btnAxAArriboAhora')?.addEventListener('click', () => {
    if (inputArribo) inputArribo.value = nowHHMM();
  });
  document.getElementById('btnAxAAseguradaAhora')?.addEventListener('click', () => {
    if (inputAsegurada) inputAsegurada.value = nowHHMM();
  });
  document.getElementById('btnAxAHoraIngresoAhora')?.addEventListener('click', () => {
    if (quickHoraIngreso) quickHoraIngreso.value = nowHHMM();
  });
  document.getElementById('btnAxAHoraSalidaAhora')?.addEventListener('click', () => {
    if (quickHoraSalida) quickHoraSalida.value = nowHHMM();
  });

  function resolveEmpleadoIdByNombre(nombre) {
    if (!datalistEmp || !nombre) return 0;
    const norm = String(nombre).trim().toLowerCase();
    const opts = datalistEmp.querySelectorAll('option');
    for (const opt of opts) {
      if (String(opt.value || '').trim().toLowerCase() === norm) {
        return parseInt(opt.dataset.empId, 10) || 0;
      }
    }
    return 0;
  }

  function actualizarContadores() {
    if (totalBadge) totalBadge.textContent = String(registros.length);
    const pendientes = registros.filter(r => !String(r.HoraSalida || '').trim()).length;
    if (pendientesBadge) {
      if (pendientes > 0) {
        pendientesBadge.textContent = `${pendientes} persona(s) sin salida`;
        pendientesBadge.style.display = 'inline-block';
      } else {
        pendientesBadge.style.display = 'none';
      }
    }
  }

  function buildEmpresaOptions(selectedVal) {
    const val = String(selectedVal || '').trim();
    const all = empresasList.includes(val) || !val ? empresasList : [...empresasList, val];
    return all.map((emp) => {
      const sel = emp === val ? 'selected' : '';
      return `<option value="${esc(emp)}" ${sel}>${esc(emp)}</option>`;
    }).join('');
  }

  function aplicarFiltroTabla() {
    if (!tbody) return;
    const term = String(filtroTexto?.value || '').trim().toLowerCase();
    const trs = tbody.querySelectorAll('tr[data-index]');
    trs.forEach((tr) => {
      const idx = parseInt(tr.dataset.index, 10);
      const r = registros[idx];
      if (!term || !r) {
        tr.style.display = '';
        return;
      }
      const match =
        String(r.Nombre || '').toLowerCase().includes(term) ||
        String(r.NoTIA || '').toLowerCase().includes(term) ||
        String(r.Empresa || '').toLowerCase().includes(term) ||
        String(r.Motivo || '').toLowerCase().includes(term);
      tr.style.display = match ? '' : 'none';
    });
  }

  function renderTabla() {
    actualizarContadores();
    if (!tbody) return;

    if (registros.length === 0) {
      tbody.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="8" style="text-align:center; padding:22px; color:var(--text-3);">
            No hay accesos registrados aún. Utilice el panel superior o inserte una fila manual.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = registros.map((r, idx) => `
      <tr data-index="${idx}">
        <td style="text-align:center; font-weight:700;">${idx + 1}</td>
        <td>
          <input type="text" class="form-control axa-cell-input" data-field="Nombre" maxlength="150" value="${esc(r.Nombre)}" placeholder="Nombre completo">
        </td>
        <td>
          <input type="text" class="form-control axa-cell-input" data-field="NoTIA" maxlength="50" value="${esc(r.NoTIA)}" placeholder="TIA">
        </td>
        <td>
          <select class="form-control axa-cell-input" data-field="Empresa">
            ${buildEmpresaOptions(r.Empresa)}
          </select>
        </td>
        <td>
          <input type="time" class="form-control axa-cell-input" data-field="HoraIngreso" value="${esc(r.HoraIngreso)}">
        </td>
        <td>
          <input type="text" class="form-control axa-cell-input" data-field="Motivo" maxlength="500" value="${esc(r.Motivo)}" placeholder="Motivo">
        </td>
        <td>
          <div class="cp-time-row">
            <input type="time" class="form-control axa-cell-input" data-field="HoraSalida" value="${esc(r.HoraSalida)}">
            <button type="button" class="cp-clock-btn axa-btn-salida-ahora" title="Registrar salida actual">
              <i class="far fa-clock"></i>
            </button>
          </div>
        </td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-danger axa-btn-eliminar" style="padding:5px 9px; font-size:11px;" title="Eliminar fila">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');

    aplicarFiltroTabla();
  }

  tbody?.addEventListener('input', (e) => {
    const target = e.target;
    if (!target.classList.contains('axa-cell-input')) return;
    const tr = target.closest('tr[data-index]');
    const idx = tr ? parseInt(tr.dataset.index, 10) : -1;
    const field = target.dataset.field;
    if (idx >= 0 && field && registros[idx]) {
      registros[idx][field] = target.value;
      if (field === 'Nombre') {
        registros[idx].EmpleadoId = resolveEmpleadoIdByNombre(target.value);
      }
      if (field === 'HoraSalida') {
        actualizarContadores();
      }
    }
  });

  tbody?.addEventListener('change', (e) => {
    const target = e.target;
    if (!target.classList.contains('axa-cell-input')) return;
    const tr = target.closest('tr[data-index]');
    const idx = tr ? parseInt(tr.dataset.index, 10) : -1;
    const field = target.dataset.field;
    if (idx >= 0 && field && registros[idx]) {
      registros[idx][field] = target.value;
      actualizarContadores();
    }
  });

  tbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-index]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.index, 10);
    if (Number.isNaN(idx) || !registros[idx]) return;

    if (e.target.closest('.axa-btn-salida-ahora')) {
      const now = nowHHMM();
      registros[idx].HoraSalida = now;
      const inputOut = tr.querySelector('[data-field="HoraSalida"]');
      if (inputOut) {
        inputOut.value = now;
        inputOut.classList.remove('sio-field-invalid');
      }
      actualizarContadores();
      return;
    }

    if (e.target.closest('.axa-btn-eliminar')) {
      registros.splice(idx, 1);
      renderTabla();
    }
  });

  filtroTexto?.addEventListener('input', aplicarFiltroTabla);

  document.getElementById('btnAxAAgregarRegistro')?.addEventListener('click', () => {
    const nombre = String(quickNombre?.value || '').trim();
    const noTia = String(quickNoTIA?.value || '').trim();
    const empresa = String(quickEmpresa?.value || 'LAATS').trim();
    const hIn = String(quickHoraIngreso?.value || '').trim();
    const motivo = String(quickMotivo?.value || '').trim();
    const hOut = String(quickHoraSalida?.value || '').trim();

    const errs = [];
    if (!nombre) errs.push({ el: quickNombre, label: 'Nombre Completo' });
    if (!noTia) errs.push({ el: quickNoTIA, label: 'No. TIA' });
    if (!empresa) errs.push({ el: quickEmpresa, label: 'Empresa' });
    if (!hIn) errs.push({ el: quickHoraIngreso, label: 'Hora de Ingreso' });
    if (!motivo) errs.push({ el: quickMotivo, label: 'Motivo de Acceso' });

    if (errs.length > 0) {
      if (Validator) {
        errs.forEach(x => Validator.markElementInvalid(x.el, null));
      }
      Swal.fire({
        icon: 'warning',
        title: 'Datos Incompletos para Agregar',
        text: `Complete los campos obligatorios: ${errs.map(x => x.label).join(', ')}.`,
        confirmButtonColor: '#DC2626'
      });
      return;
    }

    registros.push({
      DetalleAnexoAId: 0,
      EmpleadoId: resolveEmpleadoIdByNombre(nombre),
      Nombre: nombre,
      NoTIA: noTia,
      Empresa: empresa,
      HoraIngreso: hIn,
      Motivo: motivo,
      HoraSalida: hOut
    });

    if (quickNombre) quickNombre.value = '';
    if (quickNoTIA) quickNoTIA.value = '';
    if (quickHoraIngreso) quickHoraIngreso.value = '';
    if (quickMotivo) quickMotivo.value = '';
    if (quickHoraSalida) quickHoraSalida.value = '';

    renderTabla();
  });

  document.getElementById('btnAxAFilaManual')?.addEventListener('click', () => {
    registros.push({
      DetalleAnexoAId: 0,
      EmpleadoId: 0,
      Nombre: '',
      NoTIA: '',
      Empresa: 'LAATS',
      HoraIngreso: nowHHMM(),
      Motivo: '',
      HoraSalida: ''
    });
    if (filtroTexto) filtroTexto.value = '';
    renderTabla();
  });

  function recopilarPayload() {
    const supOpt = selectSupervisor?.selectedOptions?.[0];
    return {
      fecha: inputFecha?.value || '',
      horaRevision: inputHoraRevision?.value || '',
      puerta: String(inputPuerta?.value || '').trim(),
      supervisorEmpleadoId: selectSupervisor?.value || '',
      supervisorNombre: supOpt?.dataset?.nombre || '',
      arriboVuelo: inputArribo?.value || '',
      aeronaveAsegurada: inputAsegurada?.value || '',
      observaciones: String(inputObservaciones?.value || '').trim(),
      agente: initialState.agenteActual || '',
      registros: registros.map((r) => ({
        DetalleAnexoAId: parseInt(r.DetalleAnexoAId, 10) || 0,
        EmpleadoId: parseInt(r.EmpleadoId, 10) || 0,
        Nombre: String(r.Nombre || '').trim(),
        NoTIA: String(r.NoTIA || '').trim(),
        Empresa: String(r.Empresa || '').trim(),
        HoraIngreso: String(r.HoraIngreso || '').trim(),
        Motivo: String(r.Motivo || '').trim(),
        HoraSalida: String(r.HoraSalida || '').trim()
      }))
    };
  }

  function validarFrontend() {
    if (!Validator) return true;
    if (filtroTexto && filtroTexto.value) {
      filtroTexto.value = '';
      aplicarFiltroTabla();
    }
    const rowElements = Array.from(tbody?.querySelectorAll('tr[data-index]') || []);
    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        { field: 'fecha', label: 'Fecha (Date)', element: inputFecha, required: true, type: 'date' },
        { field: 'horaRevision', label: 'Hora de Revisión', element: inputHoraRevision, required: true, type: 'time' },
        { field: 'puerta', label: 'Puerta (Gate)', element: inputPuerta, required: true, type: 'string', maxLength: 50 },
        { field: 'supervisorEmpleadoId', label: 'Supervisor en Turno', element: selectSupervisor, required: true, type: 'integer', min: 1 },
        { field: 'arriboVuelo', label: 'Arribo del Vuelo', element: inputArribo, required: false, type: 'time' },
        { field: 'aeronaveAsegurada', label: 'Aeronave Asegurada', element: inputAsegurada, required: false, type: 'time' }
      ],
      gridContainer: gridWrapper,
      rowElements,
      rowRules: [
        { field: 'Nombre', label: 'Nombre Completo', required: true, type: 'string', maxLength: 150 },
        { field: 'NoTIA', label: 'No. TIA', required: true, type: 'string', maxLength: 50 },
        { field: 'Empresa', label: 'Empresa', required: true, type: 'string', maxLength: 100 },
        { field: 'HoraIngreso', label: 'Hora de Ingreso', required: true, type: 'time' },
        { field: 'Motivo', label: 'Motivo de Acceso', required: true, type: 'string', maxLength: 500 },
        { field: 'HoraSalida', label: 'Hora de Salida (obligatoria para cerrar)', required: true, type: 'time' }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) persona en el control de acceso Anexo A antes de guardar.',
      emptyRowsFocusElement: quickNombre
    });
    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Annex A');
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

    const anexoAPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Annex A (Air Canada)...' : 'Generando Vista Preliminar...',
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
          datos: { anexoAPayload }
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
              horaRevision: inputHoraRevision,
              puerta: inputPuerta,
              supervisorEmpleadoId: selectSupervisor,
              arriboVuelo: inputArribo,
              aeronaveAsegurada: inputAsegurada
            },
            gridContainer: gridWrapper
          });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error de Validación', text: json.message || 'No se pudo procesar Annex A.', confirmButtonColor: '#DC2626' });
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
        const encEl = document.getElementById('axAEncabezadoId');
        if (encEl) encEl.value = String(encabezadoId);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Annex A guardado correctamente.',
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

  document.getElementById('btnVistaPreliminarAnexoA')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoAnexoA')?.addEventListener('click', () => enviarFormato(true));

  renderTabla();
});
