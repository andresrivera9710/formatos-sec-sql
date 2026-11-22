/**
 * formato-sp.js — Selected Passenger (SelectedPassengerD / dl-sp - DELTA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaSP');
  const stateEl = document.getElementById('spInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[SP INIT PARSE ERROR]', err);
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

  const formatoId = document.getElementById('spFormatoId')?.value || initialState.formatoId || 'dl-sp';
  const itinerarioId = parseInt(document.getElementById('spItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('spEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const SELECTION_OPTIONS = [
    { id: 1, label: 'R Random', code: 'R' },
    { id: 2, label: 'S Selected', code: 'S' },
    { id: 3, label: 'I Interview', code: 'I' }
  ];

  let registros = (Array.isArray(initialState.registros) ? initialState.registros : []).map((r, idx) => ({
    No: idx + 1,
    DetalleSPId: parseInt(r.DetalleSPId, 10) || 0,
    Apellido: String(r.Apellido || '').trim(),
    Nombre: String(r.Nombre || '').trim(),
    SeleccionSPId: String(parseInt(r.SeleccionSPId, 10) || 1),
    Asiento: String(r.Asiento || '').trim(),
    BCN: r.BCN !== undefined && r.BCN !== null ? String(r.BCN) : '0',
    NombreAgente: String(r.NombreAgente || initialState.agenteActual || '').trim()
  }));

  const inputFecha = document.getElementById('spFecha');
  const selectSupervisor = document.getElementById('spSupervisor');
  const inputApellido = document.getElementById('spInputApellido');
  const inputNombre = document.getElementById('spInputNombre');
  const selectSeleccion = document.getElementById('spInputSeleccion');
  const inputAsiento = document.getElementById('spInputAsiento');
  const inputBCN = document.getElementById('spInputBCN');
  const inputScreener = document.getElementById('spInputScreener');
  const tbody = document.getElementById('spTbodyRegistros');

  const badgeR = document.getElementById('spTotalRandomBadge');
  const badgeS = document.getElementById('spTotalSelectedBadge');
  const badgeI = document.getElementById('spTotalInterviewBadge');
  const badgeTotal = document.getElementById('spTotalGeneralBadge');

  let padScreener = null;
  const canvasScreener = document.getElementById('spCanvasFirmaScreener');
  if (canvasScreener && typeof window.SioSignaturePad === 'function') {
    padScreener = new window.SioSignaturePad(canvasScreener);
    document.getElementById('btnLimpiarFirmaScreenerSP')?.addEventListener('click', () => padScreener.clear());
  }

  function actualizarTotales() {
    let rCount = 0;
    let sCount = 0;
    let iCount = 0;
    registros.forEach((row) => {
      const idNum = parseInt(row.SeleccionSPId, 10) || 1;
      if (idNum === 1) rCount += 1;
      else if (idNum === 2) sCount += 1;
      else if (idNum === 3) iCount += 1;
    });
    if (badgeR) badgeR.textContent = String(rCount);
    if (badgeS) badgeS.textContent = String(sCount);
    if (badgeI) badgeI.textContent = String(iCount);
    if (badgeTotal) badgeTotal.textContent = String(rCount + sCount + iCount);
  }

  function buildSelOptions(selectedVal) {
    return SELECTION_OPTIONS.map((opt) => {
      const sel = String(opt.id) === String(selectedVal) ? 'selected' : '';
      return `<option value="${opt.id}" ${sel}>${esc(opt.label)}</option>`;
    }).join('');
  }

  function renderTabla() {
    actualizarTotales();
    if (!tbody) return;
    if (registros.length === 0) {
      tbody.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="8" style="text-align:center; padding:22px; color:var(--text-3);">
            No hay pasajeros registrados. Use el panel superior o inserte una fila en blanco.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = registros.map((r, idx) => `
      <tr data-row-index="${idx}" class="er-grid-row">
        <td style="text-align:center; font-weight:700;">${idx + 1}</td>
        <td><input type="text" class="form-control er-cell-input" data-field="Apellido" maxlength="150" value="${esc(r.Apellido)}" placeholder="Apellido *"></td>
        <td><input type="text" class="form-control er-cell-input" data-field="Nombre" maxlength="150" value="${esc(r.Nombre)}" placeholder="Nombre *"></td>
        <td>
          <select class="form-control er-cell-input" data-field="SeleccionSPId">${buildSelOptions(r.SeleccionSPId)}</select>
        </td>
        <td><input type="text" class="form-control er-cell-input er-cell-center" data-field="Asiento" maxlength="20" value="${esc(r.Asiento)}" placeholder="Seat *"></td>
        <td><input type="number" class="form-control er-cell-input er-cell-center" data-field="BCN" min="0" step="1" value="${esc(r.BCN)}" placeholder="BCN *"></td>
        <td><input type="text" class="form-control er-cell-input" data-field="NombreAgente" maxlength="150" value="${esc(r.NombreAgente)}" placeholder="Screener *"></td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-danger btn-sp-del" data-idx="${idx}" style="padding:4px 8px; font-size:11px;" title="Retirar">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('btnAgregarRegistroSP')?.addEventListener('click', () => {
    Validator?.clearValidationErrors(form);
    const rules = [
      { field: 'Apellido', label: 'Last Name (Apellido)', el: inputApellido, required: true, type: 'string', maxLength: 150 },
      { field: 'Nombre', label: 'First Name (Nombre)', el: inputNombre, required: true, type: 'string', maxLength: 150 },
      { field: 'SeleccionSPId', label: 'Selection', el: selectSeleccion, required: true, type: 'integer', min: 1, max: 3 },
      { field: 'Asiento', label: 'Seat No.', el: inputAsiento, required: true, type: 'string', maxLength: 20 },
      { field: 'BCN', label: 'BCN', el: inputBCN, required: true, type: 'integer', min: 0 },
      { field: 'NombreAgente', label: 'Screener Name', el: inputScreener, required: true, type: 'string', maxLength: 150 }
    ];
    const errs = [];
    rules.forEach((rule) => {
      const chk = Validator.validateSingleValue(rule.el ? rule.el.value : '', rule);
      if (!chk.valid) {
        Validator.markElementInvalid(rule.el);
        errs.push({ scope: 'header', row: null, field: rule.field, label: rule.label, reason: chk.reason, message: `${rule.label}: ${chk.reason}`, element: rule.el });
      }
    });
    if (errs.length > 0) {
      Validator.notifyValidationErrors(errs, 'Datos Incompletos — Selected Passenger');
      return;
    }

    const firmaScreenerActual = (padScreener && !padScreener.isEmpty()) ? padScreener.toDataURL() : '';
    registros.push({
      No: registros.length + 1,
      DetalleSPId: 0,
      Apellido: String(inputApellido.value || '').trim(),
      Nombre: String(inputNombre.value || '').trim(),
      SeleccionSPId: String(selectSeleccion.value || '1'),
      Asiento: String(inputAsiento.value || '').trim(),
      BCN: String(inputBCN.value || '0').trim(),
      NombreAgente: String(inputScreener.value || '').trim(),
      FirmaScreener: firmaScreenerActual
    });

    inputApellido.value = '';
    inputNombre.value = '';
    inputAsiento.value = '';
    inputBCN.value = '';
    inputApellido.focus();
    renderTabla();
  });

  document.getElementById('btnAgregarFilaVaciaSP')?.addEventListener('click', () => {
    registros.push({
      No: registros.length + 1,
      DetalleSPId: 0,
      Apellido: '',
      Nombre: '',
      SeleccionSPId: '1',
      Asiento: '',
      BCN: '0',
      NombreAgente: String(initialState.agenteActual || '').trim()
    });
    renderTabla();
  });

  tbody?.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-row-index]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.rowIndex, 10);
    const field = e.target.getAttribute('data-field');
    if (registros[idx] && field) {
      registros[idx][field] = e.target.value;
    }
  });

  tbody?.addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-row-index]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.rowIndex, 10);
    const field = e.target.getAttribute('data-field');
    if (registros[idx] && field === 'SeleccionSPId') {
      registros[idx].SeleccionSPId = e.target.value;
      actualizarTotales();
    }
  });

  tbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-sp-del');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (Number.isInteger(idx) && registros[idx]) {
      registros.splice(idx, 1);
      renderTabla();
    }
  });

  function recopilarPayload() {
    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supervisorNombre = supOpt && selectSupervisor.value
      ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim()
      : '';

    const firmaScreener = (padScreener && !padScreener.isEmpty()) ? padScreener.toDataURL() : '';
    return {
      fecha: String(inputFecha?.value || '').trim().substring(0, 10),
      supervisorLoginId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : '',
      supervisorNombre,
      firmaScreener,
      registros: registros.map((r) => {
        const selObj = SELECTION_OPTIONS.find((o) => String(o.id) === String(r.SeleccionSPId)) || SELECTION_OPTIONS[0];
        return {
          DetalleSPId: r.DetalleSPId || 0,
          Apellido: String(r.Apellido || '').trim(),
          Nombre: String(r.Nombre || '').trim(),
          SeleccionSPId: selObj.id,
          SelectionCode: selObj.code,
          SelectionLabel: selObj.label,
          Asiento: String(r.Asiento || '').trim(),
          BCN: String(r.BCN ?? '0').trim(),
          NombreAgente: String(r.NombreAgente || '').trim(),
          FirmaScreener: String(r.FirmaScreener || firmaScreener || '').trim()
        };
      })
    };
  }

  function validarFrontend() {
    if (!Validator) return true;
    const rowElements = Array.from(tbody?.querySelectorAll('tr[data-row-index]') || []);
    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        { field: 'fecha', label: 'Fecha (Date)', element: inputFecha, required: true, type: 'date' },
        { field: 'supervisorLoginId', label: 'Supervisor', element: selectSupervisor, required: true, type: 'integer', min: 1 }
      ],
      gridContainer: document.getElementById('spGridWrapper'),
      rowElements,
      rowRules: [
        { field: 'Apellido', label: 'Last Name (Apellido)', required: true, type: 'string', maxLength: 150 },
        { field: 'Nombre', label: 'First Name (Nombre)', required: true, type: 'string', maxLength: 150 },
        { field: 'SeleccionSPId', label: 'Selection', required: true, type: 'integer', min: 1, max: 3 },
        { field: 'Asiento', label: 'Seat No.', required: true, type: 'string', maxLength: 20 },
        { field: 'BCN', label: 'BCN', required: true, type: 'integer', min: 0 },
        { field: 'NombreAgente', label: 'Screener Name', required: true, type: 'string', maxLength: 150 }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos un (1) pasajero seleccionado antes de guardar.',
      emptyRowsFocusElement: inputApellido
    });
    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Selected Passenger');
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
        try { previewWin.document.title = 'Generando Vista Preliminar...'; } catch (_) { }
      }
    }

    const spPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Selected Passenger...' : 'Generando Vista Preliminar...',
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
          datos: { spPayload }
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
              supervisorLoginId: selectSupervisor
            },
            gridContainer: document.getElementById('spGridWrapper')
          });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error de Validación', text: json.message || 'No se pudo procesar Selected Passenger.', confirmButtonColor: '#DC2626' });
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
        const encInput = document.getElementById('spEncabezadoId');
        if (encInput) encInput.value = String(encabezadoId);
      }
      if (json.firmasRepo) {
        window.SioSignatureRepoClient?.applyRepoState?.(json.firmasRepo);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Selected Passenger guardado correctamente.',
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

  document.getElementById('btnVistaPreliminarSP')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoSP')?.addEventListener('click', () => enviarFormato(true));

  renderTabla();
});
