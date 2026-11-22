/**
 * formato-cll.js — Cargo Loading Log (CargoLoadingLOGD / dl-cll - DELTA)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaCLL');
  const stateEl = document.getElementById('cllInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[CLL INIT PARSE ERROR]', err);
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

  const formatoId = document.getElementById('cllFormatoId')?.value || initialState.formatoId || 'dl-cll';
  const itinerarioId = parseInt(document.getElementById('cllItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('cllEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  let registros = (Array.isArray(initialState.registros) ? initialState.registros : []).map((r, idx) => ({
    No: idx + 1,
    DetalleCLLId: parseInt(r.DetalleCLLId, 10) || 0,
    Guia: String(r.Guia || '').trim(),
    Contenido: String(r.Contenido || '').trim(),
    Piezas: r.Piezas !== undefined && r.Piezas !== '' ? String(r.Piezas) : '',
    BIN: String(r.BIN || '').trim()
  }));

  const inputFecha = document.getElementById('cllFecha');
  const inputStation = document.getElementById('cllStation');
  const inputAgSeg = document.getElementById('cllAgenteSeguridad');
  const inputAgDelta = document.getElementById('cllAgenteDelta');
  const inputAgTIA = document.getElementById('cllAgenteTIA');
  const inputTiaLD = document.getElementById('cllTiaLD');

  const inputGuia = document.getElementById('cllInputGuia');
  const inputContenido = document.getElementById('cllInputContenido');
  const inputPiezas = document.getElementById('cllInputPiezas');
  const inputBIN = document.getElementById('cllInputBIN');
  const tbody = document.getElementById('cllTbodyRegistros');
  const badgeGuias = document.getElementById('cllTotalGuiasBadge');
  const badgePiezas = document.getElementById('cllTotalPiezasBadge');

  let padSec = null;
  let padLd = null;
  if (typeof window.SioSignaturePad === 'function') {
    const cSec = document.getElementById('cllCanvasFirmaSecurity');
    const cLd = document.getElementById('cllCanvasFirmaLD');
    if (cSec) padSec = new window.SioSignaturePad(cSec);
    if (cLd) padLd = new window.SioSignaturePad(cLd);
  }
  document.getElementById('btnLimpiarFirmaSecCLL')?.addEventListener('click', () => padSec?.clear());
  document.getElementById('btnLimpiarFirmaLdCLL')?.addEventListener('click', () => padLd?.clear());

  function actualizarContadores() {
    if (badgeGuias) badgeGuias.textContent = String(registros.length);
    const sumPiezas = registros.reduce((acc, r) => acc + (parseInt(r.Piezas, 10) || 0), 0);
    if (badgePiezas) badgePiezas.textContent = String(sumPiezas);
  }

  function renderTabla() {
    actualizarContadores();
    if (!tbody) return;
    if (registros.length === 0) {
      tbody.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="6" style="text-align:center; padding:22px; color:var(--text-3);">
            No hay guías de carga registradas. Use el panel superior o inserte una fila en blanco.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = registros.map((r, idx) => `
      <tr data-row-index="${idx}" class="er-grid-row">
        <td style="text-align:center; font-weight:700;">${idx + 1}</td>
        <td><input type="text" class="form-control er-cell-input" data-field="Guia" maxlength="100" value="${esc(r.Guia)}" placeholder="Airway Bill # *"></td>
        <td><input type="text" class="form-control er-cell-input" data-field="Contenido" maxlength="200" value="${esc(r.Contenido)}" placeholder="Contents *"></td>
        <td><input type="number" class="form-control er-cell-input er-cell-center" data-field="Piezas" min="1" step="1" value="${esc(r.Piezas)}" placeholder="Piezas *"></td>
        <td><input type="text" class="form-control er-cell-input er-cell-center" data-field="BIN" maxlength="50" value="${esc(r.BIN)}" placeholder="BIN # *"></td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-danger btn-cll-del" data-idx="${idx}" style="padding:4px 8px; font-size:11px;" title="Retirar">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('btnAgregarRegistroCLL')?.addEventListener('click', () => {
    Validator?.clearValidationErrors(form);
    const rules = [
      { field: 'Guia', label: 'Airway Bill #', el: inputGuia, required: true, type: 'string', maxLength: 100 },
      { field: 'Contenido', label: 'Contents', el: inputContenido, required: true, type: 'string', maxLength: 200 },
      { field: 'Piezas', label: '# Pieces', el: inputPiezas, required: true, type: 'integer', min: 1 },
      { field: 'BIN', label: 'Loaded BIN #', el: inputBIN, required: true, type: 'string', maxLength: 50 }
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
      Validator.notifyValidationErrors(errs, 'Datos Incompletos — Cargo Loading Log');
      return;
    }

    registros.push({
      No: registros.length + 1,
      DetalleCLLId: 0,
      Guia: String(inputGuia.value || '').trim(),
      Contenido: String(inputContenido.value || '').trim(),
      Piezas: String(inputPiezas.value || '').trim(),
      BIN: String(inputBIN.value || '').trim()
    });

    inputGuia.value = '';
    inputContenido.value = '';
    inputPiezas.value = '';
    inputBIN.value = '';
    inputGuia.focus();
    renderTabla();
  });

  document.getElementById('btnAgregarFilaVaciaCLL')?.addEventListener('click', () => {
    registros.push({ No: registros.length + 1, DetalleCLLId: 0, Guia: '', Contenido: '', Piezas: '', BIN: '' });
    renderTabla();
  });

  tbody?.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-row-index]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.rowIndex, 10);
    const field = e.target.getAttribute('data-field');
    if (registros[idx] && field) {
      registros[idx][field] = e.target.value;
      if (field === 'Piezas') actualizarContadores();
    }
  });

  tbody?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-cll-del');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (Number.isInteger(idx) && registros[idx]) {
      registros.splice(idx, 1);
      renderTabla();
    }
  });

  function recopilarPayload() {
    const tiaSec = String(inputAgTIA?.value || '').trim();
    const tiaLd = String(inputTiaLD?.value || '').trim();
    return {
      fecha: String(inputFecha?.value || '').trim().substring(0, 10),
      station: String(inputStation?.value || 'GUA').trim() || 'GUA',
      agenteSeguridad: String(inputAgSeg?.value || '').trim(),
      agenteDelta: String(inputAgDelta?.value || '').trim(),
      agenteTIA: tiaSec,
      tiaSecurity: tiaSec,
      tiaLD: tiaLd || tiaSec,
      firmaSecurity: (padSec && !padSec.isEmpty()) ? padSec.toDataURL() : '',
      firmaLD: (padLd && !padLd.isEmpty()) ? padLd.toDataURL() : '',
      registros: registros.map((r) => ({
        DetalleCLLId: r.DetalleCLLId || 0,
        Guia: String(r.Guia || '').trim(),
        Contenido: String(r.Contenido || '').trim(),
        Piezas: String(r.Piezas || '').trim(),
        BIN: String(r.BIN || '').trim()
      }))
    };
  }

  function validarFrontend() {
    if (!Validator) return true;
    const rowElements = Array.from(tbody?.querySelectorAll('tr[data-row-index]') || []);
    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        { field: 'fecha', label: 'Fecha (Date)', element: inputFecha, required: true, type: 'date' },
        { field: 'agenteSeguridad', label: 'Security Agent', element: inputAgSeg, required: true, type: 'string', maxLength: 150 },
        { field: 'agenteDelta', label: 'DL Load / Ramp Agent', element: inputAgDelta, required: true, type: 'string', maxLength: 150 },
        { field: 'agenteTIA', label: 'TIA # (Security)', element: inputAgTIA, required: true, type: 'string', maxLength: 100 }
      ],
      gridContainer: document.getElementById('cllGridWrapper'),
      rowElements,
      rowRules: [
        { field: 'Guia', label: 'Airway Bill #', required: true, type: 'string', maxLength: 100 },
        { field: 'Contenido', label: 'Contents', required: true, type: 'string', maxLength: 200 },
        { field: 'Piezas', label: '# Pieces', required: true, type: 'integer', min: 1 },
        { field: 'BIN', label: 'Loaded BIN #', required: true, type: 'string', maxLength: 50 }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) guía de carga en Cargo Loading Log antes de guardar.',
      emptyRowsFocusElement: inputGuia
    });
    if (!res.valid) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Cargo Loading Log');
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

    const cllPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Cargo Loading Log...' : 'Generando Vista Preliminar...',
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
          datos: { cllPayload }
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
              agenteSeguridad: inputAgSeg,
              agenteDelta: inputAgDelta,
              agenteTIA: inputAgTIA
            },
            gridContainer: document.getElementById('cllGridWrapper')
          });
          return;
        }
        Swal.fire({ icon: 'error', title: 'Error de Validación', text: json.message || 'No se pudo procesar Cargo Loading Log.', confirmButtonColor: '#DC2626' });
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
        const encInput = document.getElementById('cllEncabezadoId');
        if (encInput) encInput.value = String(encabezadoId);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Cargo Loading Log guardado correctamente.',
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

  document.getElementById('btnVistaPreliminarCLL')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoCLL')?.addEventListener('click', () => enviarFormato(true));

  renderTabla();
});
