/**
 * formato-cfr.js — Control de Flejes en Rayos X (ControlFlejesRayosX / ara-cfr - ARAJET)
 * 100% CSP-Safe (cero estilos/handlers inline), RWD tarjetas móviles, scroll-lock Enter/Sig.,
 * validación estricta de 2 capas (window.SioFormatValidator) y persistencia Offline IndexedDB.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaCFR');
  const stateEl = document.getElementById('cfrInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[CFR INIT PARSE ERROR]', err);
  }

  const formatoId = document.getElementById('cfrFormatoId')?.value || initialState.formatoId || 'ara-cfr';
  const itinerarioId = parseInt(document.getElementById('cfrItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('cfrEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const maquinariaCatalogo = Array.isArray(initialState.maquinaria) ? initialState.maquinaria : [];
  const operadoresCatalogo = Array.isArray(initialState.operadores) ? initialState.operadores : [];

  const maqMap = new Map();
  maquinariaCatalogo.forEach(m => {
    maqMap.set(Number(m.MaquinariaEquipoId), String(m.NoUnidad || ''));
  });

  const opMap = new Map();
  operadoresCatalogo.forEach(o => {
    opMap.set(Number(o.EmpleadoId), String(o.Nombre || ''));
  });

  const normalizeCfrCarretas = (list) => (Array.isArray(list) ? list : []).map((c, idx) => ({
    No: idx + 1,
    DetalleCFRId: parseInt(c.DetalleCFRId, 10) || 0,
    CarretaId: parseInt(c.CarretaId, 10) || '',
    NoCarreta: String(c.NoCarreta || maqMap.get(Number(c.CarretaId)) || ''),
    FlejeUno: String(c.FlejeUno || '').trim(),
    FlejeDos: String(c.FlejeDos || '').trim(),
    MaquinariaEquipoId: parseInt(c.MaquinariaEquipoId, 10) || '',
    NoUnidad: String(c.NoUnidad || maqMap.get(Number(c.MaquinariaEquipoId)) || ''),
    TotalEqDetalle: c.TotalEqDetalle !== undefined && c.TotalEqDetalle !== '' ? String(c.TotalEqDetalle) : '',
    EmpleadoId: parseInt(c.EmpleadoId, 10) || '',
    Operador: String(c.Operador || opMap.get(Number(c.EmpleadoId)) || '')
  }));

  let carretas = normalizeCfrCarretas(initialState.carretas);
  const initialCarretasBaseline = carretas.map((c) => ({ ...c }));

  const tbody = document.getElementById('cfrTbodyCarretas');
  const totalCarretasEl = document.getElementById('cfrTotalCarretasBadge');
  const totalEquipajeEl = document.getElementById('cfrTotalEquipajeBadge');

  const inputFecha = document.getElementById('cfrFecha');
  const selectSupervisor = document.getElementById('cfrSupervisor');
  const inputPrimera = document.getElementById('cfrPrimeraPlataforma');
  const inputUltima = document.getElementById('cfrUltimaPlataforma');
  const inputInicioOp = document.getElementById('cfrInicioOperacion');
  const inputHoraCierre = document.getElementById('cfrHoraCierre');

  const inputCarreta = document.getElementById('cfrInputCarreta');
  const inputFlejeUno = document.getElementById('cfrInputFlejeUno');
  const inputFlejeDos = document.getElementById('cfrInputFlejeDos');
  const inputUnidad = document.getElementById('cfrInputUnidad');
  const inputTotalEq = document.getElementById('cfrInputTotalEq');
  const inputOperador = document.getElementById('cfrInputOperador');

  function notifyOfflineChange() {
    window.SioOfflineManager?.notifyStateChange?.();
  }

  function isEnterKey(e) {
    return (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13)
      && !e.isComposing
      && e.keyCode !== 229;
  }

  function focusNoScroll(el) {
    if (!el) return;
    if (Validator?.focusWithoutScroll) Validator.focusWithoutScroll(el);
    else {
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    }
  }

  function runWithLockedScroll(fn, lockedPos = null) {
    if (Validator?.preserveScroll) return Validator.preserveScroll(fn, lockedPos);
    return fn();
  }

  function getNowHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  form.querySelectorAll('[data-cfr-clock]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-cfr-clock');
      const input = document.getElementById(targetId);
      if (input) {
        input.value = getNowHHMM();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        notifyOfflineChange();
      }
    });
  });

  function actualizarTotales() {
    if (totalCarretasEl) totalCarretasEl.textContent = String(carretas.length);
    const totalEq = carretas.reduce((acc, c) => acc + (parseInt(c.TotalEqDetalle, 10) || 0), 0);
    if (totalEquipajeEl) totalEquipajeEl.textContent = String(totalEq);
  }

  function buildMaquinariaSelect(fieldName, selectedVal) {
    const sel = document.createElement('select');
    sel.className = 'form-control er-cell-input';
    sel.setAttribute('data-field', fieldName);
    sel.setAttribute('data-no-searchable', 'true');

    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '-- Seleccione --';
    sel.appendChild(optEmpty);

    maquinariaCatalogo.forEach(m => {
      const opt = document.createElement('option');
      opt.value = String(m.MaquinariaEquipoId);
      opt.textContent = String(m.NoUnidad || '');
      if (String(selectedVal) === String(m.MaquinariaEquipoId)) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
    return sel;
  }

  function buildOperadorSelect(selectedVal) {
    const sel = document.createElement('select');
    sel.className = 'form-control er-cell-input';
    sel.setAttribute('data-field', 'EmpleadoId');
    sel.setAttribute('data-no-searchable', 'true');

    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '-- Seleccione Operador --';
    sel.appendChild(optEmpty);

    operadoresCatalogo.forEach(op => {
      const opt = document.createElement('option');
      opt.value = String(op.EmpleadoId);
      opt.textContent = String(op.Nombre || '');
      if (String(selectedVal) === String(op.EmpleadoId)) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
    return sel;
  }

  function renderTabla() {
    if (!tbody) return;
    tbody.replaceChildren();

    if (carretas.length === 0) {
      const trEmpty = document.createElement('tr');
      trEmpty.className = 'er-empty-row';
      const tdEmpty = document.createElement('td');
      tdEmpty.colSpan = 8;
      tdEmpty.className = 'dl-empty-cell';
      tdEmpty.textContent = 'No se han registrado carretas en este formato. Use el panel superior para agregar carretas y sus flejes.';
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
      actualizarTotales();
      return;
    }

    carretas.forEach((row, idx) => {
      row.No = idx + 1;
      const tr = document.createElement('tr');
      tr.className = 'er-grid-row';
      tr.setAttribute('data-row-index', String(idx));

      // 1. No.
      const tdNo = document.createElement('td');
      tdNo.className = 'dl-td-num';
      tdNo.setAttribute('data-label', 'No.');
      const badgeNo = document.createElement('span');
      badgeNo.className = 'dl-num-badge';
      const prefixSpan = document.createElement('span');
      prefixSpan.className = 'dl-mobile-prefix';
      prefixSpan.textContent = 'Carreta #';
      badgeNo.appendChild(prefixSpan);
      badgeNo.appendChild(document.createTextNode(String(idx + 1)));
      tdNo.appendChild(badgeNo);
      tr.appendChild(tdNo);

      // 2. CarretaId
      const tdCarreta = document.createElement('td');
      tdCarreta.setAttribute('data-label', 'No. Carreta *');
      const selCarreta = buildMaquinariaSelect('CarretaId', row.CarretaId);
      selCarreta.addEventListener('change', () => {
        row.CarretaId = selCarreta.value ? parseInt(selCarreta.value, 10) : '';
        row.NoCarreta = maqMap.get(Number(row.CarretaId)) || '';
        notifyOfflineChange();
      });
      tdCarreta.appendChild(selCarreta);
      tr.appendChild(tdCarreta);

      // 3. FlejeUno
      const tdF1 = document.createElement('td');
      tdF1.setAttribute('data-label', 'Fleje 1 (Marchamo) *');
      const inpF1 = document.createElement('input');
      inpF1.type = 'text';
      inpF1.className = 'form-control er-cell-input er-cell-center';
      inpF1.setAttribute('data-field', 'FlejeUno');
      inpF1.setAttribute('inputmode', 'numeric');
      inpF1.setAttribute('pattern', '[0-9]*');
      inpF1.setAttribute('data-numeric-only', 'true');
      inpF1.maxLength = 100;
      inpF1.value = row.FlejeUno;
      inpF1.placeholder = 'Fleje 1 *';
      inpF1.addEventListener('input', () => {
        row.FlejeUno = inpF1.value.trim();
        notifyOfflineChange();
      });
      tdF1.appendChild(inpF1);
      tr.appendChild(tdF1);

      // 4. FlejeDos
      const tdF2 = document.createElement('td');
      tdF2.setAttribute('data-label', 'Fleje 2 (Marchamo) *');
      const inpF2 = document.createElement('input');
      inpF2.type = 'text';
      inpF2.className = 'form-control er-cell-input er-cell-center';
      inpF2.setAttribute('data-field', 'FlejeDos');
      inpF2.setAttribute('inputmode', 'numeric');
      inpF2.setAttribute('pattern', '[0-9]*');
      inpF2.setAttribute('data-numeric-only', 'true');
      inpF2.maxLength = 100;
      inpF2.value = row.FlejeDos;
      inpF2.placeholder = 'Fleje 2 *';
      inpF2.addEventListener('input', () => {
        row.FlejeDos = inpF2.value.trim();
        notifyOfflineChange();
      });
      tdF2.appendChild(inpF2);
      tr.appendChild(tdF2);

      // 5. MaquinariaEquipoId (No. Unidad)
      const tdUnidad = document.createElement('td');
      tdUnidad.setAttribute('data-label', 'No. Unidad (Tractor) *');
      const selUnidad = buildMaquinariaSelect('MaquinariaEquipoId', row.MaquinariaEquipoId);
      selUnidad.addEventListener('change', () => {
        row.MaquinariaEquipoId = selUnidad.value ? parseInt(selUnidad.value, 10) : '';
        row.NoUnidad = maqMap.get(Number(row.MaquinariaEquipoId)) || '';
        notifyOfflineChange();
      });
      tdUnidad.appendChild(selUnidad);
      tr.appendChild(tdUnidad);

      // 6. TotalEqDetalle
      const tdTotalEq = document.createElement('td');
      tdTotalEq.setAttribute('data-label', 'Total Eq. Carreta *');
      const inpTotalEq = document.createElement('input');
      inpTotalEq.type = 'number';
      inpTotalEq.min = '0';
      inpTotalEq.step = '1';
      inpTotalEq.setAttribute('inputmode', 'numeric');
      inpTotalEq.className = 'form-control er-cell-input er-cell-center';
      inpTotalEq.setAttribute('data-field', 'TotalEqDetalle');
      inpTotalEq.value = row.TotalEqDetalle;
      inpTotalEq.placeholder = '0';
      inpTotalEq.addEventListener('input', () => {
        row.TotalEqDetalle = inpTotalEq.value.trim();
        actualizarTotales();
        notifyOfflineChange();
      });
      tdTotalEq.appendChild(inpTotalEq);
      tr.appendChild(tdTotalEq);

      // 7. EmpleadoId (Operador)
      const tdOp = document.createElement('td');
      tdOp.className = 'dl-td-full';
      tdOp.setAttribute('data-label', 'Operador *');
      const selOp = buildOperadorSelect(row.EmpleadoId);
      selOp.addEventListener('change', () => {
        row.EmpleadoId = selOp.value ? parseInt(selOp.value, 10) : '';
        row.Operador = opMap.get(Number(row.EmpleadoId)) || '';
        notifyOfflineChange();
      });
      tdOp.appendChild(selOp);
      tr.appendChild(tdOp);

      // 8. Eliminar
      const tdAcc = document.createElement('td');
      tdAcc.className = 'dl-td-action';
      tdAcc.setAttribute('data-label', 'Acción');
      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn btn-danger dl-del-btn btn-cfr-del';
      btnDel.title = 'Retirar carreta';
      const icon = document.createElement('i');
      icon.className = 'fas fa-trash-alt';
      btnDel.appendChild(icon);
      const mobLbl = document.createElement('span');
      mobLbl.className = 'dl-mobile-action-label';
      mobLbl.textContent = ' Retirar';
      btnDel.appendChild(mobLbl);
      btnDel.addEventListener('click', () => {
        runWithLockedScroll(() => {
          carretas.splice(idx, 1);
          renderTabla();
          notifyOfflineChange();
        });
      });
      tdAcc.appendChild(btnDel);
      tr.appendChild(tdAcc);

      tbody.appendChild(tr);
    });

    actualizarTotales();
  }

  function resetSelectClean(selEl) {
    if (!selEl) return;
    selEl.value = '';
    selEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function agregarCarretaCFR(lockedPos = null) {
    Validator?.clearValidationErrors(form);
    const rules = [
      { field: 'CarretaId', label: 'No. Carreta', el: inputCarreta, required: true, type: 'integer', min: 1 },
      { field: 'FlejeUno', label: 'Fleje 1 (Marchamo)', el: inputFlejeUno, required: true, type: 'string', maxLength: 100 },
      { field: 'FlejeDos', label: 'Fleje 2 (Marchamo)', el: inputFlejeDos, required: true, type: 'string', maxLength: 100 },
      { field: 'MaquinariaEquipoId', label: 'No. Unidad (Tractor)', el: inputUnidad, required: true, type: 'integer', min: 1 },
      { field: 'TotalEqDetalle', label: 'Total Equipaje en Carreta', el: inputTotalEq, required: true, type: 'integer', min: 0 },
      { field: 'EmpleadoId', label: 'Operador', el: inputOperador, required: true, type: 'integer', min: 1 }
    ];
    const errs = [];
    rules.forEach((rule) => {
      if (!Validator) return;
      const chk = Validator.validateSingleValue(rule.el ? rule.el.value : '', rule);
      if (!chk.valid) {
        Validator.markElementInvalid(rule.el);
        errs.push({ scope: 'header', row: null, field: rule.field, label: rule.label, reason: chk.reason, message: `${rule.label}: ${chk.reason}`, element: rule.el });
      }
    });
    if (errs.length > 0) {
      Validator?.notifyValidationErrors(errs, 'Datos de Carreta Incompletos — Control de Flejes');
      return;
    }

    const carretaId = parseInt(inputCarreta?.value, 10) || 0;
    const flejeUno = (inputFlejeUno?.value || '').trim();
    const flejeDos = (inputFlejeDos?.value || '').trim();
    const maqId = parseInt(inputUnidad?.value, 10) || 0;
    const totalEqStr = (inputTotalEq?.value ?? '').trim();
    const empId = parseInt(inputOperador?.value, 10) || 0;

    runWithLockedScroll(() => {
      carretas.push({
        No: carretas.length + 1,
        DetalleCFRId: 0,
        CarretaId: carretaId,
        NoCarreta: maqMap.get(carretaId) || '',
        FlejeUno: flejeUno,
        FlejeDos: flejeDos,
        MaquinariaEquipoId: maqId,
        NoUnidad: maqMap.get(maqId) || '',
        TotalEqDetalle: totalEqStr,
        EmpleadoId: empId,
        Operador: opMap.get(empId) || ''
      });

      resetSelectClean(inputCarreta);
      if (inputFlejeUno) inputFlejeUno.value = '';
      if (inputFlejeDos) inputFlejeDos.value = '';
      resetSelectClean(inputUnidad);
      if (inputTotalEq) inputTotalEq.value = '';
      resetSelectClean(inputOperador);

      renderTabla();
      notifyOfflineChange();
      focusNoScroll(inputFlejeUno);
    }, lockedPos);
  }

  document.getElementById('btnAgregarCarretaCFR')?.addEventListener('click', () => agregarCarretaCFR());

  inputFlejeUno?.addEventListener('keydown', (e) => {
    if (!isEnterKey(e)) return;
    const lockedPos = { x: window.scrollX, y: window.scrollY };
    e.preventDefault();
    e.stopPropagation();
    runWithLockedScroll(() => focusNoScroll(inputFlejeDos), lockedPos);
  });

  inputFlejeDos?.addEventListener('keydown', (e) => {
    if (!isEnterKey(e)) return;
    const lockedPos = { x: window.scrollX, y: window.scrollY };
    e.preventDefault();
    e.stopPropagation();
    runWithLockedScroll(() => focusNoScroll(inputTotalEq), lockedPos);
  });

  inputTotalEq?.addEventListener('keydown', (e) => {
    if (!isEnterKey(e)) return;
    const lockedPos = { x: window.scrollX, y: window.scrollY };
    e.preventDefault();
    e.stopPropagation();
    agregarCarretaCFR(lockedPos);
  });

  document.getElementById('btnAgregarFilaVaciaCFR')?.addEventListener('click', () => {
    runWithLockedScroll(() => {
      carretas.push({
        No: carretas.length + 1,
        DetalleCFRId: 0,
        CarretaId: '',
        NoCarreta: '',
        FlejeUno: '',
        FlejeDos: '',
        MaquinariaEquipoId: '',
        NoUnidad: '',
        TotalEqDetalle: '',
        EmpleadoId: '',
        Operador: ''
      });
      renderTabla();
      notifyOfflineChange();
    });
  });

  function recopilarPayload() {
    const selectedOpt = selectSupervisor?.options[selectSupervisor.selectedIndex];
    return {
      fecha: (inputFecha?.value || '').trim().substring(0, 10),
      supervisorEmpleadoId: (selectSupervisor?.value || '').trim(),
      supervisorLoginId: selectedOpt?.getAttribute('data-login-id') || '',
      supervisorNombre: selectedOpt?.getAttribute('data-nombre') || (selectedOpt?.textContent || '').trim(),
      agente: (document.getElementById('cfrAgenteAVSEC')?.value || '').trim(),
      aviCantidad: (document.getElementById('cfrAviCantidad')?.value || '0').trim(),
      comatCantidad: (document.getElementById('cfrComatCantidad')?.value || '0').trim(),
      primeraPlataforma: (inputPrimera?.value || '').trim(),
      ultimaPlataforma: (inputUltima?.value || '').trim(),
      inicioOperacion: (inputInicioOp?.value || '').trim(),
      horaCierre: (inputHoraCierre?.value || '').trim(),
      carretas: carretas.map((c, idx) => ({
        No: idx + 1,
        DetalleCFRId: parseInt(c.DetalleCFRId, 10) || 0,
        CarretaId: c.CarretaId,
        NoCarreta: c.NoCarreta || maqMap.get(Number(c.CarretaId)) || '',
        FlejeUno: String(c.FlejeUno || '').trim(),
        FlejeDos: String(c.FlejeDos || '').trim(),
        MaquinariaEquipoId: c.MaquinariaEquipoId,
        NoUnidad: c.NoUnidad || maqMap.get(Number(c.MaquinariaEquipoId)) || '',
        TotalEqDetalle: c.TotalEqDetalle,
        EmpleadoId: c.EmpleadoId,
        Operador: c.Operador || opMap.get(Number(c.EmpleadoId)) || ''
      }))
    };
  }

  function validarFormularioCFR() {
    if (!Validator) return true;
    const rowElements = Array.from(tbody?.querySelectorAll('tr[data-row-index]') || []);
    const result = Validator.validateFluidGridFormat({
      root: form,
      headerRules: [
        { field: 'fecha', label: 'Fecha de Inspección', element: inputFecha, required: true, type: 'date' },
        { field: 'supervisorEmpleadoId', label: 'Supervisor de Turno', element: selectSupervisor, required: true, type: 'integer', min: 1 },
        { field: 'inicioOperacion', label: 'Inicio de Operación', element: inputInicioOp, required: true, type: 'time' },
        { field: 'primeraPlataforma', label: '1ra Hora Enviada a Plataforma', element: inputPrimera, required: true, type: 'time' },
        { field: 'ultimaPlataforma', label: 'Última Hora Enviada a Plataforma', element: inputUltima, required: true, type: 'time' },
        { field: 'horaCierre', label: 'Hora de Cierre de Operación', element: inputHoraCierre, required: true, type: 'time' }
      ],
      gridContainer: document.getElementById('cfrGridWrapper'),
      rowElements,
      rowRules: [
        { field: 'CarretaId', label: 'No. Carreta', required: true, type: 'integer', min: 1 },
        { field: 'FlejeUno', label: 'Fleje 1 (Marchamo)', required: true, type: 'string', maxLength: 100 },
        { field: 'FlejeDos', label: 'Fleje 2 (Marchamo)', required: true, type: 'string', maxLength: 100 },
        { field: 'MaquinariaEquipoId', label: 'No. Unidad', required: true, type: 'integer', min: 1 },
        { field: 'TotalEqDetalle', label: 'Total Equipaje en Carreta', required: true, type: 'integer', min: 0 },
        { field: 'EmpleadoId', label: 'Operador', required: true, type: 'integer', min: 1 }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe agregar al menos una (1) carreta con flejes en la cuadrícula antes de guardar.',
      emptyRowsFocusElement: inputCarreta
    });

    if (!result.valid) {
      Validator.notifyValidationErrors(result.errors, 'Validación Obligatoria — Control de Flejes en Rayos X');
      return false;
    }
    return true;
  }

  async function enviarFormato({ guardar }) {
    if (guardar && !validarFormularioCFR()) {
      return;
    }

    const cfrPayload = recopilarPayload();
    let previewWin = null;
    if (!guardar) {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try { previewWin.document.title = 'Generando Vista Preliminar...'; } catch (_) {}
      }
    }

    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Control de Flejes en Rayos X...' : 'Generando Vista Preliminar...',
          'Procesando información en Azure SQL...'
        );
      }

      const res = await fetch('/api/formatos/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          formatoId,
          itinerarioId,
          encabezadoId: encabezadoId || null,
          guardar,
          datos: { cfrPayload }
        })
      });

      const data = await res.json();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();

      if (!res.ok || !data.success) {
        if (previewWin && !previewWin.closed) previewWin.close();
        if (Validator && Array.isArray(data.errors) && data.errors.length > 0) {
          Validator.applyBackendErrors(data.errors, {
            root: form,
            headerElementMap: {
              fecha: inputFecha,
              supervisorEmpleadoId: selectSupervisor,
              inicioOperacion: inputInicioOp,
              primeraPlataforma: inputPrimera,
              ultimaPlataforma: inputUltima,
              horaCierre: inputHoraCierre
            },
            gridContainer: document.getElementById('cfrGridWrapper')
          });
          return;
        }
        throw new Error(data.message || 'Error al procesar Control de Flejes en Rayos X.');
      }

      if (!guardar) {
        if (data.previewUrl) {
          if (previewWin && !previewWin.closed) {
            previewWin.location.href = data.previewUrl;
            previewWin.focus();
          } else {
            window.location.href = data.previewUrl;
          }
        } else if (previewWin && !previewWin.closed) {
          previewWin.close();
        }
        return;
      }

      if (data.encabezadoId) {
        encabezadoId = parseInt(data.encabezadoId, 10) || encabezadoId;
        const encInput = document.getElementById('cfrEncabezadoId');
        if (encInput) encInput.value = String(encabezadoId);
      }

      if (Array.isArray(data.detalles)) {
        carretas = normalizeCfrCarretas(data.detalles);
        renderTabla();
      }

      if (window.Swal) {
        await window.Swal.fire({
          icon: 'success',
          title: '¡Formato Guardado!',
          text: data.mensaje || `Control de Flejes en Rayos X guardado con ID #${encabezadoId}.`,
          timer: 1100,
          showConfirmButton: false
        });
      }
      if (data.previewUrl) {
        window.location.href = data.previewUrl;
      } else {
        window.location.href = '/formatos';
      }
    } catch (err) {
      if (previewWin && !previewWin.closed) previewWin.close();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();
      console.error('[CFR SAVE ERROR]', err);
      if (window.Swal) {
        window.Swal.fire({
          icon: 'error',
          title: 'Error al Guardar',
          text: err.message || 'Ocurrió un error al guardar el formato.',
          confirmButtonColor: '#DC2626'
        });
      }
    }
  }

  document.getElementById('btnVistaPreliminarCFR')?.addEventListener('click', () => enviarFormato({ guardar: false }));
  document.getElementById('btnGuardarDefinitivoCFR')?.addEventListener('click', () => enviarFormato({ guardar: true }));

  renderTabla();

  window.SioOfflineManager?.registerStateAdapter?.('format:cfr', {
    capture: () => ({
      carretas: carretas.map((c) => ({ ...c }))
    }),
    restore: (saved) => {
      const list = Array.isArray(saved) ? saved : (Array.isArray(saved?.carretas) ? saved.carretas : null);
      if (!list) return;
      carretas = normalizeCfrCarretas(list);
      renderTabla();
    },
    reset: () => {
      carretas = initialCarretasBaseline.map((c) => ({ ...c }));
      renderTabla();
    },
    mapLegacyPatch: (patch) => (Array.isArray(patch?.carretas) ? { carretas: patch.carretas } : undefined)
  });
});
