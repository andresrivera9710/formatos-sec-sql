/**
 * formato-cfr.js — Control de Flejes en Rayos X (ControlFlejesRayosX / ara-cfr - ARAJET)
 * 100% CSP-Safe (Sin inline scripts ni handlers).
 * Incluye validación transversal con window.SioFormatValidator y SweetAlert2.
 */

document.addEventListener('DOMContentLoaded', () => {
  const stateEl = document.getElementById('cfrInitialStateJson');
  if (!stateEl) return;

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

  let carretas = Array.isArray(initialState.carretas)
    ? initialState.carretas.map((c, idx) => ({
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
      }))
    : [];

  const tbody = document.getElementById('cfrTbodyCarretas');
  const totalCarretasEl = document.getElementById('cfrTotalCarretasBadge');
  const totalEquipajeEl = document.getElementById('cfrTotalEquipajeBadge');

  const inputCarreta = document.getElementById('cfrInputCarreta');
  const inputFlejeUno = document.getElementById('cfrInputFlejeUno');
  const inputFlejeDos = document.getElementById('cfrInputFlejeDos');
  const inputUnidad = document.getElementById('cfrInputUnidad');
  const inputTotalEq = document.getElementById('cfrInputTotalEq');
  const inputOperador = document.getElementById('cfrInputOperador');

  function getNowHHMM() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  document.querySelectorAll('[data-cfr-clock]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-cfr-clock');
      const input = document.getElementById(targetId);
      if (input) {
        input.value = getNowHHMM();
        input.dispatchEvent(new Event('input', { bubbles: true }));
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
    sel.className = 'er-cell-input';
    sel.setAttribute('data-field', fieldName);

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
    sel.className = 'er-cell-input';
    sel.setAttribute('data-field', 'EmpleadoId');

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
    tbody.innerHTML = '';

    if (carretas.length === 0) {
      const trEmpty = document.createElement('tr');
      const tdEmpty = document.createElement('td');
      tdEmpty.colSpan = 8;
      tdEmpty.className = 'er-empty-state';
      tdEmpty.textContent = 'No se han registrado carretas en este formato. Use el panel superior para agregar carretas y sus flejes.';
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
      actualizarTotales();
      return;
    }

    carretas.forEach((row, idx) => {
      row.No = idx + 1;
      const tr = document.createElement('tr');
      tr.setAttribute('data-row-index', String(idx));

      // 1. No.
      const tdNo = document.createElement('td');
      tdNo.style.textAlign = 'center';
      const badgeNo = document.createElement('span');
      badgeNo.className = 'er-row-num-badge';
      badgeNo.textContent = String(idx + 1);
      tdNo.appendChild(badgeNo);
      tr.appendChild(tdNo);

      // 2. CarretaId
      const tdCarreta = document.createElement('td');
      const selCarreta = buildMaquinariaSelect('CarretaId', row.CarretaId);
      selCarreta.addEventListener('change', () => {
        row.CarretaId = selCarreta.value ? parseInt(selCarreta.value, 10) : '';
        row.NoCarreta = maqMap.get(Number(row.CarretaId)) || '';
      });
      tdCarreta.appendChild(selCarreta);
      tr.appendChild(tdCarreta);

      // 3. FlejeUno
      const tdF1 = document.createElement('td');
      const inpF1 = document.createElement('input');
      inpF1.type = 'text';
      inpF1.className = 'er-cell-input';
      inpF1.setAttribute('data-field', 'FlejeUno');
      inpF1.value = row.FlejeUno;
      inpF1.placeholder = 'Fleje 1';
      inpF1.addEventListener('input', () => { row.FlejeUno = inpF1.value.trim(); });
      tdF1.appendChild(inpF1);
      tr.appendChild(tdF1);

      // 4. FlejeDos
      const tdF2 = document.createElement('td');
      const inpF2 = document.createElement('input');
      inpF2.type = 'text';
      inpF2.className = 'er-cell-input';
      inpF2.setAttribute('data-field', 'FlejeDos');
      inpF2.value = row.FlejeDos;
      inpF2.placeholder = 'Fleje 2';
      inpF2.addEventListener('input', () => { row.FlejeDos = inpF2.value.trim(); });
      tdF2.appendChild(inpF2);
      tr.appendChild(tdF2);

      // 5. MaquinariaEquipoId (No. Unidad)
      const tdUnidad = document.createElement('td');
      const selUnidad = buildMaquinariaSelect('MaquinariaEquipoId', row.MaquinariaEquipoId);
      selUnidad.addEventListener('change', () => {
        row.MaquinariaEquipoId = selUnidad.value ? parseInt(selUnidad.value, 10) : '';
        row.NoUnidad = maqMap.get(Number(row.MaquinariaEquipoId)) || '';
      });
      tdUnidad.appendChild(selUnidad);
      tr.appendChild(tdUnidad);

      // 6. TotalEqDetalle
      const tdTotalEq = document.createElement('td');
      const inpTotalEq = document.createElement('input');
      inpTotalEq.type = 'number';
      inpTotalEq.min = '0';
      inpTotalEq.step = '1';
      inpTotalEq.className = 'er-cell-input text-center';
      inpTotalEq.setAttribute('data-field', 'TotalEqDetalle');
      inpTotalEq.value = row.TotalEqDetalle;
      inpTotalEq.placeholder = '0';
      inpTotalEq.addEventListener('input', () => {
        row.TotalEqDetalle = inpTotalEq.value.trim();
        actualizarTotales();
      });
      tdTotalEq.appendChild(inpTotalEq);
      tr.appendChild(tdTotalEq);

      // 7. EmpleadoId (Operador)
      const tdOp = document.createElement('td');
      const selOp = buildOperadorSelect(row.EmpleadoId);
      selOp.addEventListener('change', () => {
        row.EmpleadoId = selOp.value ? parseInt(selOp.value, 10) : '';
        row.Operador = opMap.get(Number(row.EmpleadoId)) || '';
      });
      tdOp.appendChild(selOp);
      tr.appendChild(tdOp);

      // 8. Eliminar
      const tdAcc = document.createElement('td');
      tdAcc.style.textAlign = 'center';
      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'er-btn-delete-row';
      btnDel.title = 'Eliminar carreta';
      const icon = document.createElement('i');
      icon.className = 'fas fa-trash-alt';
      btnDel.appendChild(icon);
      btnDel.addEventListener('click', () => {
        carretas.splice(idx, 1);
        renderTabla();
      });
      tdAcc.appendChild(btnDel);
      tr.appendChild(tdAcc);

      tbody.appendChild(tr);
    });

    actualizarTotales();
  }

  document.getElementById('btnAgregarCarretaCFR')?.addEventListener('click', () => {
    const carretaId = parseInt(inputCarreta?.value, 10) || 0;
    const flejeUno = (inputFlejeUno?.value || '').trim();
    const flejeDos = (inputFlejeDos?.value || '').trim();
    const maqId = parseInt(inputUnidad?.value, 10) || 0;
    const totalEqStr = (inputTotalEq?.value ?? '').trim();
    const empId = parseInt(inputOperador?.value, 10) || 0;

    if (!carretaId || !flejeUno || !flejeDos || !maqId || totalEqStr === '' || !empId) {
      if (window.Swal) {
        window.Swal.fire({
          icon: 'warning',
          title: 'Datos de Carreta Incompletos',
          text: 'Complete No. Carreta, Fleje 1, Fleje 2, No. Unidad, Total Equipaje y Operador antes de agregar la carreta.',
          confirmButtonColor: '#0F2744'
        });
      }
      return;
    }

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

    if (inputCarreta) inputCarreta.value = '';
    if (inputFlejeUno) inputFlejeUno.value = '';
    if (inputFlejeDos) inputFlejeDos.value = '';
    if (inputUnidad) inputUnidad.value = '';
    if (inputTotalEq) inputTotalEq.value = '';
    if (inputOperador) inputOperador.value = '';

    renderTabla();
  });

  document.getElementById('btnAgregarFilaVaciaCFR')?.addEventListener('click', () => {
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
  });

  function recopilarPayload() {
    const supSelect = document.getElementById('cfrSupervisor');
    const selectedOpt = supSelect?.options[supSelect.selectedIndex];
    return {
      fecha: (document.getElementById('cfrFecha')?.value || '').trim(),
      supervisorEmpleadoId: (supSelect?.value || '').trim(),
      supervisorLoginId: selectedOpt?.getAttribute('data-login-id') || '',
      supervisorNombre: selectedOpt?.getAttribute('data-nombre') || (selectedOpt?.textContent || '').trim(),
      agente: (document.getElementById('cfrAgenteAVSEC')?.value || '').trim(),
      aviCantidad: (document.getElementById('cfrAviCantidad')?.value || '0').trim(),
      comatCantidad: (document.getElementById('cfrComatCantidad')?.value || '0').trim(),
      primeraPlataforma: (document.getElementById('cfrPrimeraPlataforma')?.value || '').trim(),
      ultimaPlataforma: (document.getElementById('cfrUltimaPlataforma')?.value || '').trim(),
      inicioOperacion: (document.getElementById('cfrInicioOperacion')?.value || '').trim(),
      horaCierre: (document.getElementById('cfrHoraCierre')?.value || '').trim(),
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

  function validarFormularioCFR(cfrData) {
    if (!window.SioFormatValidator) return true;

    const result = window.SioFormatValidator.validateFormat({
      headerData: {
        fecha: cfrData.fecha,
        supervisorEmpleadoId: cfrData.supervisorEmpleadoId,
        primeraPlataforma: cfrData.primeraPlataforma,
        ultimaPlataforma: cfrData.ultimaPlataforma,
        inicioOperacion: cfrData.inicioOperacion,
        horaCierre: cfrData.horaCierre
      },
      headerRules: [
        { field: 'fecha', label: 'Fecha de Inspección', required: true, type: 'date', element: '#cfrFecha' },
        { field: 'supervisorEmpleadoId', label: 'Supervisor de Turno', required: true, type: 'integer', min: 1, element: '#cfrSupervisor' },
        { field: 'primeraPlataforma', label: '1ra Hora Enviada a Plataforma', required: true, type: 'time', element: '#cfrPrimeraPlataforma' },
        { field: 'ultimaPlataforma', label: 'Última Hora Enviada a Plataforma', required: true, type: 'time', element: '#cfrUltimaPlataforma' },
        { field: 'inicioOperacion', label: 'Hora Inicio de Operación', required: true, type: 'time', element: '#cfrInicioOperacion' },
        { field: 'horaCierre', label: 'Hora de Cierre de Operación', required: true, type: 'time', element: '#cfrHoraCierre' }
      ],
      rows: cfrData.carretas,
      rowRules: [
        { field: 'CarretaId', label: 'No. Carreta', required: true, type: 'integer', min: 1 },
        { field: 'FlejeUno', label: 'Fleje 1 (Marchamo)', required: true, type: 'string' },
        { field: 'FlejeDos', label: 'Fleje 2 (Marchamo)', required: true, type: 'string' },
        { field: 'MaquinariaEquipoId', label: 'No. Unidad', required: true, type: 'integer', min: 1 },
        { field: 'TotalEqDetalle', label: 'Total Equipaje en Carreta', required: true, type: 'integer', min: 0 },
        { field: 'EmpleadoId', label: 'Operador', required: true, type: 'integer', min: 1 }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe agregar al menos una (1) carreta con flejes en la cuadrícula antes de guardar.',
      gridContainerSelector: '#cfrTbodyCarretas'
    });

    if (!result.valid) {
      window.SioFormatValidator.notifyValidationErrors(result);
      return false;
    }
    return true;
  }

  async function enviarFormato({ guardar }) {
    const cfrPayload = recopilarPayload();

    if (guardar && !validarFormularioCFR(cfrPayload)) {
      return;
    }

    try {
      const res = await fetch('/formatos/api/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formatoId,
          itinerarioId,
          encabezadoId: encabezadoId || null,
          guardar,
          datos: { cfrPayload }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (window.SioFormatValidator && Array.isArray(data.errors) && data.errors.length > 0) {
          window.SioFormatValidator.notifyValidationErrors({
            valid: false,
            errors: data.errors.map(e => ({
              ...e,
              element: e.scope === 'row' && e.row
                ? document.querySelector(`#cfrTbodyCarretas tr[data-row-index="${e.row - 1}"] [data-field="${e.field}"]`)
                : null
            }))
          });
          return;
        }
        throw new Error(data.message || 'Error al procesar Control de Flejes en Rayos X.');
      }

      if (!guardar) {
        if (data.previewUrl) {
          window.open(data.previewUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      if (data.encabezadoId) {
        encabezadoId = parseInt(data.encabezadoId, 10) || encabezadoId;
        const encInput = document.getElementById('cfrEncabezadoId');
        if (encInput) encInput.value = String(encabezadoId);
      }

      if (Array.isArray(data.detalles)) {
        carretas = data.detalles.map((c, idx) => ({
          No: idx + 1,
          DetalleCFRId: parseInt(c.DetalleCFRId, 10) || 0,
          CarretaId: parseInt(c.CarretaId, 10) || '',
          NoCarreta: String(c.NoCarreta || maqMap.get(Number(c.CarretaId)) || ''),
          FlejeUno: String(c.FlejeUno || '').trim(),
          FlejeDos: String(c.FlejeDos || '').trim(),
          MaquinariaEquipoId: parseInt(c.MaquinariaEquipoId, 10) || '',
          NoUnidad: String(c.NoUnidad || maqMap.get(Number(c.MaquinariaEquipoId)) || ''),
          TotalEqDetalle: String(c.TotalEqDetalle ?? c.TotalEq ?? '0'),
          EmpleadoId: parseInt(c.EmpleadoId, 10) || '',
          Operador: String(c.Operador || opMap.get(Number(c.EmpleadoId)) || '')
        }));
        renderTabla();
      }

      if (window.Swal) {
        const swalRes = await window.Swal.fire({
          icon: 'success',
          title: '¡Formato Guardado!',
          text: data.mensaje || `Control de Flejes en Rayos X guardado con ID #${encabezadoId}.`,
          showCancelButton: true,
          confirmButtonText: 'Ver Formato Controlado (PDF)',
          cancelButtonText: 'Continuar Editando',
          confirmButtonColor: '#0F2744'
        });
        if (swalRes.isConfirmed) {
          await enviarFormato({ guardar: false });
        }
      }
    } catch (err) {
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
});
