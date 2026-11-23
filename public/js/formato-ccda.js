/**
 * formato-ccda.js — Control de Cargue y Descargue de Aeronave (ControlCargueYDescargueAeronaveFDX_1 / fdx-ccda - FEDEX)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaCCDA');
  const stateEl = document.getElementById('ccdaInitialStateJson');
  if (!form || !stateEl) return;

  const Validator = window.SioFormatValidator;
  let initialState = {};
  try {
    initialState = JSON.parse(stateEl.textContent || '{}');
  } catch (err) {
    console.error('[CCDA INIT PARSE ERROR]', err);
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

  const formatoId = document.getElementById('ccdaFormatoId')?.value || initialState.formatoId || 'fdx-ccda';
  const itinerarioId = parseInt(document.getElementById('ccdaItinerarioId')?.value || initialState.itinerarioId, 10) || 0;
  let encabezadoId = parseInt(document.getElementById('ccdaEncabezadoId')?.value || initialState.encabezadoId, 10) || 0;

  const empresasList = (Array.isArray(initialState.empresas) && initialState.empresas.length > 0)
    ? initialState.empresas
    : ['LAATS', 'FEDEX', 'OTROS...'];

  const normalizeCcdaPersonal = (list) => (Array.isArray(list) ? list : []).map((r) => ({
    DetalleIngresoCCDAId: parseInt(r.DetalleIngresoCCDAId, 10) || 0,
    Personal: String(r.Personal || r.Nombre || '').trim(),
    EmpleadoId: String(r.EmpleadoId ?? r.ID ?? '').trim(),
    Empresa: String(r.Empresa || 'LAATS').trim() || 'LAATS',
    Entrada: extractHHMM(r.Entrada ?? r.HoraEntrada1),
    Salida: extractHHMM(r.Salida ?? r.HoraSalida1),
    SegundaEntrada: extractHHMM(r.SegundaEntrada ?? r.HoraEntrada2),
    SegundaSalida: extractHHMM(r.SegundaSalida ?? r.HoraSalida2)
  }));

  let personal = normalizeCcdaPersonal(initialState.personal);
  const initialPersonalBaseline = personal.map((r) => ({ ...r }));

  // Referencias del DOM
  const inputFecha = document.getElementById('ccdaFecha');
  const inputLlegada = document.getElementById('ccdaLlegada');
  const inputArribo = document.getElementById('ccdaArribo');

  const selectOperario = document.getElementById('ccdaOperarioSelect');
  const inputOperarioId = document.getElementById('ccdaOperarioId');
  const inputOperarioEmpresa = document.getElementById('ccdaOperarioEmpresa');
  const inputAcopla = document.getElementById('ccdaAcopla');

  const inputPuertaAbierta = document.getElementById('ccdaPuertaAbierta');
  const inputEscaleraAcoplada = document.getElementById('ccdaEscaleraAcoplada');
  const inputAperturaAeronave = document.getElementById('ccdaAperturaAeronave');
  const inputInicioDescargue = document.getElementById('ccdaInicioDescargue');
  const inputIniciaCargue = document.getElementById('ccdaIniciaCargue');

  const quickPersonalSelect = document.getElementById('ccdaQuickPersonalSelect');
  const quickNombre = document.getElementById('ccdaQuickNombre');
  const quickEmpleadoId = document.getElementById('ccdaQuickEmpleadoId');
  const quickEmpresa = document.getElementById('ccdaQuickEmpresa');
  const quickEmpresaOtrosGroup = document.getElementById('ccdaQuickEmpresaOtrosGroup');
  const quickEmpresaOtros = document.getElementById('ccdaQuickEmpresaOtros');
  const quickEntrada = document.getElementById('ccdaQuickEntrada');

  const tbody = document.getElementById('ccdaTbodyPersonal');
  const gridWrapper = document.getElementById('ccdaGridWrapper');
  const filtroPersonal = document.getElementById('ccdaFiltroPersonal');
  const totalBadge = document.getElementById('ccdaTotalBadge');
  const pendientesBadge = document.getElementById('ccdaPendientesBadge');

  const inputTerminaDescargue = document.getElementById('ccdaTerminaDescargue');
  const inputTerminaCargue = document.getElementById('ccdaTerminaCargue');
  const inputCierreAeronave = document.getElementById('ccdaCierreAeronave');
  const inputDesacopla = document.getElementById('ccdaDesacopla');
  const inputPuertaCerrada = document.getElementById('ccdaPuertaCerrada');
  const inputEscaleraDesacoplada = document.getElementById('ccdaEscaleraDesacoplada');

  const inputPushBack = document.getElementById('ccdaPushBack');
  const inputSalida = document.getElementById('ccdaSalida');
  const inputCantCombustible = document.getElementById('ccdaCantCombustible');
  const selectSupervisor = document.getElementById('ccdaSupervisor');
  const inputAgente = document.getElementById('ccdaAgente');
  const inputObservaciones = document.getElementById('ccdaObservaciones');

  // Inicializar cuadros combinados buscables (SioSearchableCombo)
  let comboOperario = null;
  let comboQuickPersonal = null;
  let comboSupervisor = null;

  if (typeof window.SioSearchableCombo === 'function') {
    if (selectOperario) {
      comboOperario = new window.SioSearchableCombo(selectOperario, {
        placeholder: '-- Seleccione Operario LAATS --',
        searchPlaceholder: 'Buscar operario por nombre o ID...',
        emptyText: 'No se encontró operario coincidente.'
      });
    }
    if (quickPersonalSelect) {
      comboQuickPersonal = new window.SioSearchableCombo(quickPersonalSelect, {
        placeholder: '-- Seleccione del catálogo o ingrese manual --',
        searchPlaceholder: 'Buscar personal por nombre o ID...',
        emptyText: 'Sin coincidencias en catálogo.'
      });
    }
    if (selectSupervisor) {
      comboSupervisor = new window.SioSearchableCombo(selectSupervisor, {
        placeholder: '-- Seleccione el Supervisor --',
        searchPlaceholder: 'Buscar supervisor LAATS...',
        emptyText: 'No se encontró supervisor.'
      });
    }
  }

  // Botones de reloj rápidos en cabecera y secciones
  form.querySelectorAll('button[data-clock-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-clock-target');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.value = nowHHMM();
        targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  // Sincronizar Operario seleccionado -> ID# Empleado
  selectOperario?.addEventListener('change', () => {
    const val = String(selectOperario.value || '').trim();
    if (inputOperarioId) {
      inputOperarioId.value = val;
      inputOperarioId.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (comboOperario) comboOperario.setInvalid(false);
  });

  // Sincronizar Supervisor -> limpiar estado inválido
  selectSupervisor?.addEventListener('change', () => {
    if (comboSupervisor) comboSupervisor.setInvalid(false);
  });

  // Sincronizar Personal rápido -> Nombre e ID#
  quickPersonalSelect?.addEventListener('change', () => {
    const opt = quickPersonalSelect.selectedOptions?.[0];
    const eid = String(quickPersonalSelect.value || '').trim();
    const nombre = String(opt?.dataset?.nombre || '').trim();
    if (eid && nombre) {
      if (quickNombre) {
        quickNombre.value = nombre;
        quickNombre.classList.remove('is-invalid', 'sio-field-invalid');
      }
      if (quickEmpleadoId) {
        quickEmpleadoId.value = eid;
        quickEmpleadoId.classList.remove('is-invalid', 'sio-field-invalid');
      }
    }
  });

  // Mostrar/ocultar input personalizado para "OTROS..."
  quickEmpresa?.addEventListener('change', () => {
    const isOtros = quickEmpresa.value === 'OTROS...';
    if (quickEmpresaOtrosGroup) {
      quickEmpresaOtrosGroup.style.display = isOtros ? 'block' : 'none';
    }
    if (!isOtros && quickEmpresaOtros) {
      quickEmpresaOtros.value = '';
    }
  });

  function actualizarContadores() {
    if (totalBadge) totalBadge.textContent = String(personal.length);
    const pendientes = personal.filter((r) => !String(r.Salida || '').trim()).length;
    if (pendientesBadge) {
      if (pendientes > 0) {
        pendientesBadge.textContent = `${pendientes} sin 1° salida`;
        pendientesBadge.style.display = 'inline-block';
      } else {
        pendientesBadge.style.display = 'none';
      }
    }
  }

  function buildEmpresaOptions(selectedVal) {
    const val = String(selectedVal || '').trim() || 'LAATS';
    const base = empresasList.filter((e) => e !== 'OTROS...');
    if (!base.includes(val)) {
      base.push(val);
    }
    base.push('OTROS...');
    return base.map((emp) => {
      const sel = emp === val ? 'selected' : '';
      return `<option value="${esc(emp)}" ${sel}>${esc(emp)}</option>`;
    }).join('');
  }

  function aplicarFiltroTabla() {
    if (!tbody) return;
    const term = String(filtroPersonal?.value || '').trim().toLowerCase();
    tbody.querySelectorAll('tr[data-row-index]').forEach((tr) => {
      const idx = parseInt(tr.dataset.rowIndex, 10);
      const r = personal[idx];
      if (!term || !r) {
        tr.style.display = '';
        return;
      }
      const match =
        String(r.Personal || '').toLowerCase().includes(term) ||
        String(r.EmpleadoId || '').toLowerCase().includes(term) ||
        String(r.Empresa || '').toLowerCase().includes(term);
      tr.style.display = match ? '' : 'none';
    });
  }

  function renderTabla() {
    actualizarContadores();
    if (!tbody) return;

    if (personal.length === 0) {
      tbody.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="9" style="text-align:center; padding:24px; color:var(--text-3);">
            No hay personal registrado en aeronave aún. Use el panel superior o inserte una fila manual.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = personal.map((r, idx) => `
      <tr class="er-grid-row" data-row-index="${idx}">
        <td class="er-cell-center" style="font-weight:700;">${idx + 1}</td>
        <td>
          <input type="text" class="form-control er-cell-input ccda-cell-input" data-field="Personal" maxlength="150" value="${esc(r.Personal)}" placeholder="Nombre completo">
        </td>
        <td>
          <input type="number" class="form-control er-cell-input er-cell-center ccda-cell-input" data-field="EmpleadoId" min="1" step="1" value="${esc(r.EmpleadoId)}" placeholder="ID#">
        </td>
        <td>
          <select class="form-control er-cell-input ccda-cell-input" data-field="Empresa">
            ${buildEmpresaOptions(r.Empresa)}
          </select>
        </td>
        <td>
          <div class="er-cell-time-group">
            <input type="time" class="form-control er-cell-input ccda-cell-input" data-field="Entrada" value="${esc(r.Entrada)}">
            <button type="button" class="cp-clock-btn ccda-btn-clock-row" data-clock-field="Entrada" title="Hora actual 1° Entrada">
              <i class="far fa-clock"></i>
            </button>
          </div>
        </td>
        <td>
          <div class="er-cell-time-group">
            <input type="time" class="form-control er-cell-input ccda-cell-input" data-field="Salida" value="${esc(r.Salida)}">
            <button type="button" class="cp-clock-btn ccda-btn-clock-row" data-clock-field="Salida" title="Registrar 1° Salida ahora">
              <i class="far fa-clock"></i>
            </button>
          </div>
        </td>
        <td>
          <div class="er-cell-time-group">
            <input type="time" class="form-control er-cell-input ccda-cell-input" data-field="SegundaEntrada" value="${esc(r.SegundaEntrada)}">
            <button type="button" class="cp-clock-btn ccda-btn-clock-row" data-clock-field="SegundaEntrada" title="Hora actual 2° Entrada">
              <i class="far fa-clock"></i>
            </button>
          </div>
        </td>
        <td>
          <div class="er-cell-time-group">
            <input type="time" class="form-control er-cell-input ccda-cell-input" data-field="SegundaSalida" value="${esc(r.SegundaSalida)}">
            <button type="button" class="cp-clock-btn ccda-btn-clock-row" data-clock-field="SegundaSalida" title="Hora actual 2° Salida">
              <i class="far fa-clock"></i>
            </button>
          </div>
        </td>
        <td class="er-cell-center">
          <button type="button" class="btn btn-danger ccda-btn-eliminar" style="padding:5px 9px; font-size:11px;" title="Eliminar fila">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');

    aplicarFiltroTabla();
  }

  tbody?.addEventListener('input', (e) => {
    const target = e.target;
    if (!target.classList.contains('ccda-cell-input')) return;
    const tr = target.closest('tr[data-row-index]');
    const idx = tr ? parseInt(tr.dataset.rowIndex, 10) : -1;
    const field = target.dataset.field;
    if (idx >= 0 && field && personal[idx]) {
      personal[idx][field] = target.value;
      if (field === 'Salida') actualizarContadores();
    }
  });

  tbody?.addEventListener('change', async (e) => {
    const target = e.target;
    if (!target.classList.contains('ccda-cell-input')) return;
    const tr = target.closest('tr[data-row-index]');
    const idx = tr ? parseInt(tr.dataset.rowIndex, 10) : -1;
    const field = target.dataset.field;
    if (idx < 0 || !field || !personal[idx]) return;

    if (field === 'Empresa' && target.value === 'OTROS...') {
      if (typeof window.Swal !== 'undefined') {
        const { value: customEmp } = await window.Swal.fire({
          title: 'Especificar Empresa',
          input: 'text',
          inputLabel: 'Ingrese el nombre de la empresa:',
          inputPlaceholder: 'Ej. PROVEEDOR RAMPA',
          showCancelButton: true,
          confirmButtonText: 'Aplicar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#275B88',
          inputValidator: (v) => (!v || !v.trim()) ? 'Debe escribir el nombre de la empresa.' : undefined
        });
        if (customEmp && customEmp.trim()) {
          personal[idx].Empresa = customEmp.trim();
        }
        renderTabla();
        window.SioOfflineManager?.notifyStateChange?.(true);
        return;
      }
    }

    personal[idx][field] = target.value;
    if (field === 'Salida') actualizarContadores();
  });

  tbody?.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-row-index]');
    if (!tr) return;
    const idx = parseInt(tr.dataset.rowIndex, 10);
    if (Number.isNaN(idx) || !personal[idx]) return;

    const clockBtn = e.target.closest('.ccda-btn-clock-row');
    if (clockBtn) {
      const clockField = clockBtn.dataset.clockField;
      if (clockField) {
        const now = nowHHMM();
        personal[idx][clockField] = now;
        const inputEl = tr.querySelector(`[data-field="${clockField}"]`);
        if (inputEl) {
          inputEl.value = now;
          inputEl.classList.remove('is-invalid', 'sio-field-invalid');
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        actualizarContadores();
      }
      return;
    }

    if (e.target.closest('.ccda-btn-eliminar')) {
      personal.splice(idx, 1);
      renderTabla();
    }
  });

  filtroPersonal?.addEventListener('input', aplicarFiltroTabla);

  document.getElementById('btnCcdaAgregarPersonal')?.addEventListener('click', () => {
    Validator?.clearValidationErrors(form);

    const nombre = String(quickNombre?.value || '').trim();
    const empIdStr = String(quickEmpleadoId?.value || '').trim();
    const empIdNum = parseInt(empIdStr, 10);
    let empresa = String(quickEmpresa?.value || 'LAATS').trim();
    if (empresa === 'OTROS...') {
      empresa = String(quickEmpresaOtros?.value || '').trim();
    }
    const entrada = String(quickEntrada?.value || '').trim();

    const errs = [];
    if (!nombre) errs.push({ el: quickNombre, field: 'Personal', label: 'Nombre Personal', reason: 'es obligatorio.' });
    if (!empIdStr || !/^\d+$/.test(empIdStr) || empIdNum <= 0) {
      errs.push({ el: quickEmpleadoId, field: 'EmpleadoId', label: 'ID# Empleado / TIA', reason: 'debe ser un número entero positivo mayor a 0.' });
    }
    if (!empresa) {
      const empTargetEl = quickEmpresa?.value === 'OTROS...' ? quickEmpresaOtros : quickEmpresa;
      errs.push({ el: empTargetEl, field: 'Empresa', label: 'Empresa', reason: 'es obligatoria.' });
    }
    if (!entrada) {
      errs.push({ el: quickEntrada, field: 'Entrada', label: 'Hora 1° Entrada', reason: 'es obligatoria.' });
    }

    if (errs.length > 0) {
      errs.forEach((x) => Validator?.markElementInvalid(x.el, null));
      if (Validator) {
        Validator.notifyValidationErrors(
          errs.map(x => ({ scope: 'header', row: null, field: x.field, label: x.label, reason: x.reason, element: x.el })),
          'Datos Incompletos para Agregar Personal'
        );
      }
      return;
    }

    personal.push({
      DetalleIngresoCCDAId: 0,
      Personal: nombre,
      EmpleadoId: String(empIdNum),
      Empresa: empresa,
      Entrada: entrada,
      Salida: '',
      SegundaEntrada: '',
      SegundaSalida: ''
    });

    if (comboQuickPersonal) {
      comboQuickPersonal.clearSelection();
    } else if (quickPersonalSelect) {
      quickPersonalSelect.value = '';
    }
    if (quickNombre) quickNombre.value = '';
    if (quickEmpleadoId) quickEmpleadoId.value = '';
    if (quickEmpresa) quickEmpresa.value = 'LAATS';
    if (quickEmpresaOtros) quickEmpresaOtros.value = '';
    if (quickEmpresaOtrosGroup) quickEmpresaOtrosGroup.style.display = 'none';
    if (quickEntrada) quickEntrada.value = '';

    renderTabla();
  });

  document.getElementById('btnCcdaFilaManual')?.addEventListener('click', () => {
    personal.push({
      DetalleIngresoCCDAId: 0,
      Personal: '',
      EmpleadoId: '',
      Empresa: 'LAATS',
      Entrada: nowHHMM(),
      Salida: '',
      SegundaEntrada: '',
      SegundaSalida: ''
    });
    if (filtroPersonal) filtroPersonal.value = '';
    renderTabla();
  });

  function getSelectedOperarioNombre() {
    const opt = selectOperario?.selectedOptions?.[0];
    return String(opt?.dataset?.nombre || '').trim();
  }

  function recopilarPayload() {
    return {
      fecha: inputFecha?.value || '',
      llegada: inputLlegada?.value || '',
      arribo: inputArribo?.value || '',
      operarioEmpleadoId: String(inputOperarioId?.value || selectOperario?.value || '').trim(),
      operarioNombre: getSelectedOperarioNombre(),
      operarioEmpresa: String(inputOperarioEmpresa?.value || '').trim(),
      acopla: inputAcopla?.value || '',
      puertaAbierta: inputPuertaAbierta?.value || '',
      escaleraAcoplada: inputEscaleraAcoplada?.value || '',
      aperturaAeronave: inputAperturaAeronave?.value || '',
      inicioDescargue: inputInicioDescargue?.value || '',
      iniciaCargue: inputIniciaCargue?.value || '',
      terminaDescargue: inputTerminaDescargue?.value || '',
      terminaCargue: inputTerminaCargue?.value || '',
      cierreAeronave: inputCierreAeronave?.value || '',
      desacopla: inputDesacopla?.value || '',
      puertaCerrada: inputPuertaCerrada?.value || '',
      escaleraDesacoplada: inputEscaleraDesacoplada?.value || '',
      pushBack: inputPushBack?.value || '',
      salida: inputSalida?.value || '',
      cantCombustible: String(inputCantCombustible?.value ?? '').trim(),
      supervisor: String(selectSupervisor?.value || '').trim(),
      agenteSeguridad: String(inputAgente?.value || '').trim(),
      observaciones: String(inputObservaciones?.value || '').trim(),
      personal: personal.map((r) => ({
        DetalleIngresoCCDAId: parseInt(r.DetalleIngresoCCDAId, 10) || 0,
        Personal: String(r.Personal || '').trim(),
        EmpleadoId: String(r.EmpleadoId ?? '').trim(),
        Empresa: String(r.Empresa || '').trim(),
        Entrada: String(r.Entrada || '').trim(),
        Salida: String(r.Salida || '').trim(),
        SegundaEntrada: String(r.SegundaEntrada || '').trim(),
        SegundaSalida: String(r.SegundaSalida || '').trim()
      }))
    };
  }

  function validarFrontend() {
    if (!Validator) return true;

    if (filtroPersonal && filtroPersonal.value) {
      filtroPersonal.value = '';
      aplicarFiltroTabla();
    }
    if (comboOperario) comboOperario.setInvalid(false);
    if (comboSupervisor) comboSupervisor.setInvalid(false);

    const headerRules = [
      { field: 'fecha', label: 'Fecha', element: inputFecha, required: true, type: 'date' },
      {
        field: 'operarioEmpleadoId',
        label: 'Operario de Loader o Faja (LAATS)',
        element: selectOperario,
        highlightElement: comboOperario ? comboOperario.trigger : selectOperario,
        getValue: () => String(inputOperarioId?.value || selectOperario?.value || '').trim(),
        required: true,
        type: 'integer',
        min: 1
      },
      { field: 'operarioEmpresa', label: 'Empresa del Operario', element: inputOperarioEmpresa, required: true, type: 'string', maxLength: 100 },
      { field: 'acopla', label: 'Hora Acopla Loader', element: inputAcopla, required: true, type: 'time' },
      {
        field: 'supervisor',
        label: 'Supervisor LAATS',
        element: selectSupervisor,
        highlightElement: comboSupervisor ? comboSupervisor.trigger : selectSupervisor,
        required: true,
        type: 'string',
        maxLength: 150
      },
      { field: 'agenteSeguridad', label: 'Agente de Seguridad LAATS', element: inputAgente, required: true, type: 'string', maxLength: 150 }
    ];

    const optionalTimes = [
      { field: 'llegada', label: 'Llegada (ATA)', element: inputLlegada },
      { field: 'arribo', label: 'Arribo Aeronave', element: inputArribo },
      { field: 'puertaAbierta', label: 'Puerta Abierta', element: inputPuertaAbierta },
      { field: 'escaleraAcoplada', label: 'Escalera Acoplada', element: inputEscaleraAcoplada },
      { field: 'aperturaAeronave', label: 'Apertura Compuerta', element: inputAperturaAeronave },
      { field: 'inicioDescargue', label: 'Inicia Descarga', element: inputInicioDescargue },
      { field: 'iniciaCargue', label: 'Inicia Carga', element: inputIniciaCargue },
      { field: 'terminaDescargue', label: 'Termina Descarga', element: inputTerminaDescargue },
      { field: 'terminaCargue', label: 'Termina Carga', element: inputTerminaCargue },
      { field: 'cierreAeronave', label: 'Cierre Compuerta', element: inputCierreAeronave },
      { field: 'desacopla', label: 'Desacopla Loader', element: inputDesacopla },
      { field: 'puertaCerrada', label: 'Puerta Cerrada', element: inputPuertaCerrada },
      { field: 'escaleraDesacoplada', label: 'Escalera Desacoplada', element: inputEscaleraDesacoplada },
      { field: 'pushBack', label: 'Push Back', element: inputPushBack },
      { field: 'salida', label: 'Salida (ETD)', element: inputSalida }
    ];
    optionalTimes.forEach((t) => {
      if (t.element && String(t.element.value || '').trim() !== '') {
        headerRules.push({ field: t.field, label: t.label, element: t.element, required: false, type: 'time' });
      }
    });

    if (inputCantCombustible && String(inputCantCombustible.value || '').trim() !== '') {
      headerRules.push({
        field: 'cantCombustible',
        label: 'Combustible (Galones)',
        element: inputCantCombustible,
        required: false,
        type: 'integer',
        min: 0
      });
    }

    const rowElements = Array.from(tbody?.querySelectorAll('tr[data-row-index]') || []);
    const res = Validator.validateFluidGridFormat({
      root: form,
      headerRules,
      gridContainer: gridWrapper,
      rowElements,
      rowRules: [
        { field: 'Personal', label: 'Personal', required: true, type: 'string', maxLength: 150 },
        { field: 'EmpleadoId', label: 'ID# Empleado', required: true, type: 'integer', min: 1 },
        { field: 'Empresa', label: 'Empresa', required: true, type: 'string', maxLength: 100 },
        { field: 'Entrada', label: 'Hora 1° Entrada', required: true, type: 'time' },
        { field: 'Salida', label: 'Hora 1° Salida (obligatoria para guardar)', required: true, type: 'time' },
        { field: 'SegundaEntrada', label: 'Hora 2° Entrada', required: false, type: 'time' },
        { field: 'SegundaSalida', label: 'Hora 2° Salida', required: false, type: 'time' }
      ],
      minRows: 1,
      emptyRowsMessage: 'Debe registrar al menos una (1) persona en la cuadrícula de Personal en Aeronave (LAATS) antes de guardar.',
      emptyRowsFocusElement: quickNombre
    });

    // Validación pareada de 2° Entrada / 2° Salida por fila
    rowElements.forEach((rowEl, idx) => {
      const r = personal[idx] || {};
      const in2 = String(r.SegundaEntrada || '').trim();
      const out2 = String(r.SegundaSalida || '').trim();
      const rowNum = idx + 1;
      if (in2 && !out2) {
        const el = rowEl.querySelector('[data-field="SegundaSalida"]');
        Validator.markElementInvalid(el, rowEl);
        res.errors.push({
          scope: 'row',
          row: rowNum,
          field: 'SegundaSalida',
          label: 'Hora 2° Salida',
          reason: 'si registró 2° Entrada debe completar la Hora 2° Salida.',
          message: `Fila #${rowNum}: Si registró 2° Entrada debe completar la Hora 2° Salida.`,
          element: el || rowEl
        });
      }
      if (!in2 && out2) {
        const el = rowEl.querySelector('[data-field="SegundaEntrada"]');
        Validator.markElementInvalid(el, rowEl);
        res.errors.push({
          scope: 'row',
          row: rowNum,
          field: 'SegundaEntrada',
          label: 'Hora 2° Entrada',
          reason: 'si registró 2° Salida debe completar la Hora 2° Entrada.',
          message: `Fila #${rowNum}: Si registró 2° Salida debe completar la Hora 2° Entrada.`,
          element: el || rowEl
        });
      }
    });

    if (res.errors.length > 0) {
      Validator.notifyValidationErrors(res.errors, 'Validación Obligatoria — Control Cargue y Descargue (FEDEX)');
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

    const ccdaPayload = recopilarPayload();
    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Control Cargue y Descargue (FEDEX)...' : 'Generando Vista Preliminar...',
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
          datos: { ccdaPayload }
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
              llegada: inputLlegada,
              arribo: inputArribo,
              operarioEmpleadoId: comboOperario ? comboOperario.trigger : selectOperario,
              operarioNombre: comboOperario ? comboOperario.trigger : selectOperario,
              operarioEmpresa: inputOperarioEmpresa,
              acopla: inputAcopla,
              puertaAbierta: inputPuertaAbierta,
              escaleraAcoplada: inputEscaleraAcoplada,
              aperturaAeronave: inputAperturaAeronave,
              inicioDescargue: inputInicioDescargue,
              iniciaCargue: inputIniciaCargue,
              terminaDescargue: inputTerminaDescargue,
              terminaCargue: inputTerminaCargue,
              cierreAeronave: inputCierreAeronave,
              desacopla: inputDesacopla,
              puertaCerrada: inputPuertaCerrada,
              escaleraDesacoplada: inputEscaleraDesacoplada,
              pushBack: inputPushBack,
              salida: inputSalida,
              cantCombustible: inputCantCombustible,
              supervisor: comboSupervisor ? comboSupervisor.trigger : selectSupervisor,
              agenteSeguridad: inputAgente
            },
            rowSelector: 'tr[data-row-index]',
            gridContainer: gridWrapper
          });
          return;
        }
        Swal.fire({
          icon: 'error',
          title: 'Error de Validación',
          text: json.message || 'No se pudo procesar el formato CCDA.',
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
        const encEl = document.getElementById('ccdaEncabezadoId');
        if (encEl) encEl.value = String(encabezadoId);
        const badgeEl = document.getElementById('ccdaBadgeEstadoEncabezado');
        if (badgeEl) badgeEl.textContent = `REGISTRO CARGADO #${encabezadoId}`;
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Guardado Exitoso!',
        text: json.mensaje || 'Control de Cargue y Descargue de Aeronave (FEDEX) guardado correctamente.',
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
      Swal.fire({
        icon: 'error',
        title: 'Error de Red',
        text: 'No se pudo comunicar con el servidor.',
        confirmButtonColor: '#DC2626'
      });
    }
  }

  document.getElementById('btnVistaPreliminarCCDA')?.addEventListener('click', () => enviarFormato(false));
  document.getElementById('btnGuardarDefinitivoCCDA')?.addEventListener('click', () => enviarFormato(true));

  renderTabla();

  window.SioOfflineManager?.registerStateAdapter?.('format:ccda', {
    capture: () => ({
      personal: personal.map((r) => ({ ...r }))
    }),
    restore: (saved) => {
      const list = Array.isArray(saved) ? saved : (Array.isArray(saved?.personal) ? saved.personal : null);
      if (!list) return;
      personal = normalizeCcdaPersonal(list);
      renderTabla();
    },
    reset: () => {
      personal = initialPersonalBaseline.map((r) => ({ ...r }));
      renderTabla();
    },
    mapLegacyPatch: (patch) => (Array.isArray(patch?.personal) ? { personal: patch.personal } : undefined)
  });
});
