/**
 * Controlador Frontend para Control de Ingreso y Egreso Cabina (*-ciec)
 * Replicando el patrón exacto de Control de Perimétrica + Matriz Equipaje Puerta + Tiempos de Cabina.
 * 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formControlCIEC');
  if (!form) return;

  const Validator = window.SioFormatValidator;
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  const esc = (val) => {
    if (Validator && typeof Validator.escapeHtml === 'function') return Validator.escapeHtml(val);
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const nowHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const extractHHMM = (val) => {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('T') && s.length >= 16) return s.substring(11, 16);
    const m = s.match(/(\d{2}:\d{2})/);
    return m ? m[1] : '';
  };

  let initialState = {};
  try {
    const rawJson = document.getElementById('ciecInitialStateJson')?.textContent || '{}';
    initialState = JSON.parse(rawJson);
  } catch (err) {
    console.error('[CIEC INIT JSON ERROR]', err);
  }

  const rawRegs = Array.isArray(initialState.registros) && initialState.registros.length > 0
    ? initialState.registros
    : (Array.isArray(initialState.detalles) ? initialState.detalles : []);

  let registros = rawRegs.map((r) => ({
    DetalleCIECId: parseInt(r.DetalleCIECId, 10) || 0,
    Nombre: String(r.Nombre || '').trim(),
    NoTIA: String(r.NoTIA || '').trim(),
    HoraIngreso: extractHHMM(r.HoraIngreso),
    Empresa: String(r.Empresa || '').trim(),
    Motivo: String(r.Motivo || '').trim(),
    HoraSalida: extractHHMM(r.HoraSalida || r.HoraSalidaReal || r.HoraSalidaEstimada)
  }));

  const initialEquipajePuertaRaw = Array.isArray(initialState.equipajePuerta)
    ? initialState.equipajePuerta
    : [];

  let aleros = (Array.isArray(initialState.aleros) ? initialState.aleros : [])
    .map((a) => ({
      EmpleadoId: parseInt(a.EmpleadoId, 10) || 0,
      Nombre: String(a.Nombre || '').trim()
    }))
    .filter((a) => a.EmpleadoId > 0)
    .slice(0, 2);

  // Referencias del DOM
  const inputFormatoId = document.getElementById('ciecFormatoId');
  const inputItinerarioId = document.getElementById('ciecItinerarioId');
  const inputEncabezadoId = document.getElementById('ciecEncabezadoId');
  const inputAgentesIds = document.getElementById('ciecAgentesEmpleadoIds');

  const inputFecha = document.getElementById('ciecFecha');
  const inputHoraInicio = document.getElementById('ciecHoraInicio');
  const selectSupervisor = document.getElementById('ciecSupervisor');

  const inputArriboVuelo = document.getElementById('ciecArriboVuelo');
  const inputAeronaveAsegurada = document.getElementById('ciecAeronaveAsegurada');
  const inputPasarelaAcoplada = document.getElementById('ciecPasarelaAcoplada');
  const inputPuertaAbierta = document.getElementById('ciecPuertaAbierta');
  const inputEgresoTrip = document.getElementById('ciecEgresoTripulacion');
  const inputIngresoTrip = document.getElementById('ciecIngresoTripulacion');
  const inputPaxEntrando = document.getElementById('ciecPaxEntrando');
  const inputPrimerPax = document.getElementById('ciecPrimerPax');
  const inputUltimoPax = document.getElementById('ciecUltimoPax');
  const inputPaxAbordos = document.getElementById('ciecPaxAbordos');
  const inputPuertaCerrada = document.getElementById('ciecPuertaCerrada');
  const inputDesacople = document.getElementById('ciecDesacoplePasarela');
  const inputPushBack = document.getElementById('ciecPushBack');
  const inputDespegue = document.getElementById('ciecDespegue');

  const inputRegNombre = document.getElementById('ciecRegNombre');
  const inputRegNoTIA = document.getElementById('ciecRegNoTIA');
  const inputRegHoraIngreso = document.getElementById('ciecRegHoraIngreso');
  const selectRegEmpresa = document.getElementById('ciecRegEmpresa');
  const grupoEmpresaOtros = document.getElementById('grupoCiecEmpresaOtros');
  const inputRegEmpresaOtros = document.getElementById('ciecRegEmpresaOtros');
  const inputRegMotivo = document.getElementById('ciecRegMotivo');
  const btnAgregarRegistro = document.getElementById('btnCiecAgregarRegistro');

  const inputBuscador = document.getElementById('ciecBuscador');
  const btnLimpiarBuscador = document.getElementById('btnCiecLimpiarBuscador');
  const contRegistrosLista = document.getElementById('ciecRegistrosLista');
  const contEstadoBadge = document.getElementById('ciecRegistrosEstadoBadge');

  const inputSecuenciaPuerta = document.getElementById('ciecInputSecuenciaPuerta');
  const btnAgregarSecuenciaPuerta = document.getElementById('btnAgregarSecuenciaPuertaCIEC');
  const btnBorrarUltimoPuerta = document.getElementById('btnBorrarUltimoPuertaCIEC');
  const btnRetirarMaletaPuerta = document.getElementById('btnRetirarMaletaPuertaCIEC');
  const tablaMatrizPuerta = document.getElementById('ciecTablaMatrizPuerta');
  const tbodyMatrizPuerta = document.getElementById('ciecTbodyMatrizPuerta');
  const totalPuertaCountEl = document.getElementById('ciecTotalPuertaCount');

  const selectTractorista = document.getElementById('ciecTractorista');
  const selectNoUnidad = document.getElementById('ciecNoUnidad');
  const selectAlero = document.getElementById('ciecAleroSelect');
  const contAlerosLista = document.getElementById('ciecAlerosLista');
  const inputObservaciones = document.getElementById('ciecObservaciones');

  const btnVistaPreliminar = document.getElementById('btnVistaPreliminarCIEC');
  const btnGuardarDefinitivo = document.getElementById('btnGuardarDefinitivoCIEC');

  // Botones de reloj rápidos
  form.querySelectorAll('button[data-clock-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-clock-target');
      const targetInput = document.getElementById(targetId);
      if (targetInput) {
        targetInput.value = nowHHMM();
        targetInput.dispatchEvent(new Event('input'));
      }
    });
  });

  if (selectRegEmpresa) {
    selectRegEmpresa.addEventListener('change', () => {
      const val = selectRegEmpresa.value;
      if (grupoEmpresaOtros) {
        grupoEmpresaOtros.style.display = val === 'OTROS...' ? 'block' : 'none';
      }
    });
  }

  // Renderizado de Registros en Cabina (mismo diseño de tarjetas de Control de Perimétrica)
  function renderRegistros() {
    if (!contRegistrosLista) return;
    const term = String(inputBuscador?.value || '').trim().toLowerCase();

    const pendientesCount = registros.filter((r) => !r.HoraSalida).length;
    if (contEstadoBadge) {
      if (registros.length === 0) {
        contEstadoBadge.innerHTML = `<span class="badge" style="background:#F1F5F9; color:#475569;">0 personas registradas</span>`;
      } else if (pendientesCount > 0) {
        contEstadoBadge.innerHTML = `<span class="badge" style="background:#FEE2E2; color:#DC2626; font-weight:700;"><i class="fas fa-exclamation-triangle"></i> ${pendientesCount} persona(s) DENTRO DE CABINA (sin hora de salida)</span>`;
      } else {
        contEstadoBadge.innerHTML = `<span class="badge badge-success"><i class="fas fa-check-circle"></i> ${registros.length} persona(s) con salida completada</span>`;
      }
    }

    const filtrados = registros
      .map((r, index) => ({ ...r, _idx: index }))
      .filter((r) => {
        if (!term) return true;
        return (
          r.Nombre.toLowerCase().includes(term) ||
          r.Empresa.toLowerCase().includes(term) ||
          r.NoTIA.toLowerCase().includes(term) ||
          r.Motivo.toLowerCase().includes(term) ||
          r.HoraIngreso.toLowerCase().includes(term) ||
          r.HoraSalida.toLowerCase().includes(term)
        );
      });

    if (filtrados.length === 0) {
      contRegistrosLista.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 28px; color: var(--text-3); background: var(--bg); border-radius: 8px; border: 1px dashed var(--border);">
          <i class="fas fa-user-clock" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
          No hay registros de personal en cabina para mostrar.
        </div>
      `;
      return;
    }

    contRegistrosLista.innerHTML = filtrados
      .map((r) => {
        const tieneSalida = Boolean(r.HoraSalida);
        const barColor = tieneSalida ? '#16A34A' : '#DC2626';
        return `
          <div class="cp-registro-card" data-reg-idx="${r._idx}" data-record-json="${esc(JSON.stringify(r))}" style="border-left: 5px solid ${barColor}; background: var(--surface); border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-top: 1px solid var(--border-2); border-right: 1px solid var(--border-2); border-bottom: 1px solid var(--border-2);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
              <div>
                <strong style="font-size:14px; color:var(--brand-deep); display:block;">#${r._idx + 1} — ${esc(r.Nombre)}</strong>
                <span style="font-size:11px; color:var(--text-2); font-weight:600;">${esc(r.Empresa)} | TIA: ${esc(r.NoTIA)}</span>
              </div>
              <span class="badge" style="background:${tieneSalida ? '#DCFCE7' : '#FEE2E2'}; color:${tieneSalida ? '#15803D' : '#DC2626'}; font-size:10px;">
                ${tieneSalida ? 'EGRESÓ DE CABINA' : 'EN CABINA'}
              </span>
            </div>

            <div style="font-size:12px; color:var(--text-2); margin-bottom:10px;">
              <div><strong>Motivo:</strong> ${esc(r.Motivo)}</div>
              <div style="display:flex; gap:16px; margin-top:6px;">
                <span><i class="fas fa-sign-in-alt" style="color:var(--brand);"></i> <strong>Ingreso:</strong> ${esc(r.HoraIngreso)}</span>
                <span><i class="fas fa-sign-out-alt" style="color:${barColor};"></i> <strong>Salida:</strong> ${tieneSalida ? esc(r.HoraSalida) : '<em style="color:#DC2626;">Pendiente</em>'}</span>
              </div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; border-top:1px solid var(--border-2); padding-top:10px;">
              ${
                !tieneSalida
                  ? `<button type="button" class="btn btn-primary" data-action="salida-ahora" data-idx="${r._idx}" style="padding:5px 10px; font-size:11px; background:#16A34A; border-color:#16A34A;">
                       <i class="far fa-clock"></i> Dar Salida Ahora
                     </button>`
                  : ''
              }
              <button type="button" class="btn btn-secondary" data-action="editar-salida" data-idx="${r._idx}" style="padding:5px 10px; font-size:11px;">
                <i class="fas fa-edit"></i> Editar Hora Salida
              </button>
              <button type="button" class="btn btn-secondary" data-action="eliminar-reg" data-idx="${r._idx}" style="padding:5px 10px; font-size:11px; color:var(--danger); border-color:var(--danger);">
                <i class="fas fa-trash-alt"></i> Eliminar
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  if (btnAgregarRegistro) {
    btnAgregarRegistro.addEventListener('click', () => {
      Validator?.clearValidationErrors(form);
      const nombre = String(inputRegNombre?.value || '').trim();
      const noTIA = String(inputRegNoTIA?.value || '').trim();
      const horaIngreso = String(inputRegHoraIngreso?.value || '').trim();
      let empresa = String(selectRegEmpresa?.value || '').trim();
      if (empresa === 'OTROS...') {
        empresa = String(inputRegEmpresaOtros?.value || '').trim();
      }
      const motivo = String(inputRegMotivo?.value || '').trim();

      const errs = [];
      if (!nombre) {
        Validator?.markElementInvalid(inputRegNombre);
        errs.push({ label: 'Nombre', message: 'El Nombre es obligatorio.', element: inputRegNombre });
      }
      if (!noTIA) {
        Validator?.markElementInvalid(inputRegNoTIA);
        errs.push({ label: 'No. TIA', message: 'El No. TIA es obligatorio.', element: inputRegNoTIA });
      }
      if (!horaIngreso) {
        Validator?.markElementInvalid(inputRegHoraIngreso);
        errs.push({ label: 'Hora de Ingreso', message: 'La Hora de Ingreso es obligatoria.', element: inputRegHoraIngreso });
      }
      if (!empresa) {
        Validator?.markElementInvalid(selectRegEmpresa);
        errs.push({ label: 'Empresa', message: 'La Empresa es obligatoria.', element: selectRegEmpresa });
      }
      if (!motivo) {
        Validator?.markElementInvalid(inputRegMotivo);
        errs.push({ label: 'Motivo', message: 'El Motivo es obligatorio.', element: inputRegMotivo });
      }

      if (errs.length > 0) {
        Validator?.focusAndAlert({
          title: 'Complete los datos del registro de ingreso a cabina',
          errors: errs
        });
        return;
      }

      registros.push({
        DetalleCIECId: 0,
        Nombre: nombre,
        NoTIA: noTIA,
        HoraIngreso: horaIngreso,
        Empresa: empresa,
        Motivo: motivo,
        HoraSalida: ''
      });

      if (inputRegNombre) inputRegNombre.value = '';
      if (inputRegNoTIA) inputRegNoTIA.value = '';
      if (inputRegHoraIngreso) inputRegHoraIngreso.value = '';
      if (selectRegEmpresa) selectRegEmpresa.value = '';
      if (inputRegEmpresaOtros) inputRegEmpresaOtros.value = '';
      if (grupoEmpresaOtros) grupoEmpresaOtros.style.display = 'none';
      if (inputRegMotivo) inputRegMotivo.value = '';

      renderRegistros();
    });
  }

  if (contRegistrosLista) {
    contRegistrosLista.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (!Number.isInteger(idx) || !registros[idx]) return;

      if (action === 'salida-ahora') {
        registros[idx].HoraSalida = nowHHMM();
        renderRegistros();
      } else if (action === 'editar-salida') {
        const { value: nuevaHora } = await Swal.fire({
          title: `Hora de Salida — ${registros[idx].Nombre}`,
          input: 'time',
          inputValue: registros[idx].HoraSalida || nowHHMM(),
          showCancelButton: true,
          confirmButtonText: 'Guardar Salida',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#0F2744'
        });
        if (nuevaHora !== undefined) {
          registros[idx].HoraSalida = String(nuevaHora).trim();
          renderRegistros();
        }
      } else if (action === 'eliminar-reg') {
        registros.splice(idx, 1);
        renderRegistros();
      }
    });
  }

  if (inputBuscador) {
    inputBuscador.addEventListener('input', renderRegistros);
  }
  if (btnLimpiarBuscador) {
    btnLimpiarBuscador.addEventListener('click', () => {
      if (inputBuscador) inputBuscador.value = '';
      renderRegistros();
    });
  }

  // Matriz Equipaje en Puerta (SioBaggageMatrix — Selección táctil + Retirar/Anular ✗ + IndexedDB)
  const matrizPuerta = window.SioBaggageMatrix.create({
    family: 'ciec',
    idField: 'EquipajePuertaCIECId',
    minRows: 4,
    requireMotivo: false,
    itemLabel: 'Equipaje en Puerta',
    motivoPlaceholder: 'Opcional: Ej. Pasajero llevó el equipaje a cabina',
    formEl: form,
    cardEl: document.getElementById('ciecCardMatrizPuerta'),
    tableEl: tablaMatrizPuerta,
    tbodyEl: tbodyMatrizPuerta,
    totalCountEl: totalPuertaCountEl,
    inputSecuenciaEl: inputSecuenciaPuerta,
    btnAgregarEl: btnAgregarSecuenciaPuerta,
    btnBorrarUltimoEl: btnBorrarUltimoPuerta,
    btnRetirarEl: btnRetirarMaletaPuerta,
    observacionesEl: inputObservaciones,
    formatoIdEl: inputFormatoId,
    itinerarioIdEl: inputItinerarioId,
    encabezadoIdEl: inputEncabezadoId,
    initialItems: initialEquipajePuertaRaw
  });

  // Aleros
  function renderAleros() {
    if (!contAlerosLista) return;
    if (aleros.length === 0) {
      contAlerosLista.innerHTML = `<span style="font-size:12px; color:var(--text-3);">Sin aleros seleccionados.</span>`;
      return;
    }
    contAlerosLista.innerHTML = aleros
      .map(
        (a, i) => `
          <span class="badge badge-brand" style="display:inline-flex; align-items:center; gap:8px; margin-right:8px; padding:6px 12px; font-size:12px;">
            <i class="fas fa-user-check"></i> ${esc(a.Nombre)}
            <button type="button" data-remove-alero="${i}" style="background:none; border:none; color:#fff; cursor:pointer; font-weight:700;">×</button>
          </span>
        `
      )
      .join('');
  }

  if (selectAlero) {
    selectAlero.addEventListener('change', () => {
      const empId = parseInt(selectAlero.value || '0', 10);
      if (!empId) return;
      const opt = selectAlero.options[selectAlero.selectedIndex];
      const nombre = opt ? opt.textContent.trim() : `Empleado #${empId}`;
      selectAlero.value = '';

      if (aleros.some((a) => a.EmpleadoId === empId)) return;
      if (aleros.length >= 2) {
        Swal.fire({ icon: 'info', title: 'Máximo 2 aleros', text: 'Solo puede seleccionar hasta 2 aleros.', confirmButtonColor: '#0F2744' });
        return;
      }
      aleros.push({ EmpleadoId: empId, Nombre: nombre });
      renderAleros();
    });
  }

  if (contAlerosLista) {
    contAlerosLista.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-remove-alero]');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-remove-alero'), 10);
      if (Number.isInteger(idx) && aleros[idx]) {
        aleros.splice(idx, 1);
        renderAleros();
      }
    });
  }

  function parseOptionalInt(el) {
    const v = String(el?.value ?? '').trim();
    if (v === '') return null;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }

  function recopilarPayload(guardarDefinitivo) {
    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supervisorNombre = (selectSupervisor?.value && supOpt)
      ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim()
      : '';

    const elTrDelta = document.getElementById('ciecTractoristaDelta');
    const elMaqDelta = document.getElementById('ciecMaquinariaDelta');
    const elAlDelta = document.getElementById('ciecAlerosDelta');
    const tractoristaDelta = String(elTrDelta?.value || '').trim();
    const maquinariaDelta = String(elMaqDelta?.value || '').trim();
    const alerosDelta = String(elAlDelta?.value || '').trim();

    const trOpt = selectTractorista?.options?.[selectTractorista.selectedIndex];
    const tractoristaNombre = tractoristaDelta || (trOpt && selectTractorista.value ? trOpt.textContent.trim() : '');

    const unOpt = selectNoUnidad?.options?.[selectNoUnidad.selectedIndex];
    const noUnidadNombre = maquinariaDelta || (unOpt && selectNoUnidad.value ? unOpt.textContent.split('—')[0].trim() : '');

    return {
      formatoId: inputFormatoId?.value || 'amx-ciec',
      itinerarioId: parseInt(inputItinerarioId?.value || '0', 10),
      encabezadoId: inputEncabezadoId?.value ? parseInt(inputEncabezadoId.value, 10) : null,
      guardar: Boolean(guardarDefinitivo),
      datos: {
        fecha: String(inputFecha?.value || '').trim(),
        horaInicio: String(inputHoraInicio?.value || '').trim(),
        supervisorEmpleadoId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : null,
        supervisorNombre,
        agentesEmpleadoIds: String(inputAgentesIds?.value || '').trim(),
        arriboDelVuelo: String(inputArriboVuelo?.value || '').trim(),
        aeronaveAsegurada: String(inputAeronaveAsegurada?.value || '').trim(),
        pasarelaAcoplada: String(inputPasarelaAcoplada?.value || '').trim(),
        puertaAbierta: String(inputPuertaAbierta?.value || '').trim(),
        egresoTripulacion: String(inputEgresoTrip?.value || '').trim(),
        ingresoTripulacion: String(inputIngresoTrip?.value || '').trim(),
        paxEntrando: parseOptionalInt(inputPaxEntrando),
        primerPax: String(inputPrimerPax?.value || '').trim(),
        ultimoPax: String(inputUltimoPax?.value || '').trim(),
        paxAbordos: parseOptionalInt(inputPaxAbordos),
        puertaCerrada: String(inputPuertaCerrada?.value || '').trim(),
        desacoplePasarela: String(inputDesacople?.value || '').trim(),
        pushBack: String(inputPushBack?.value || '').trim(),
        despegue: String(inputDespegue?.value || '').trim(),
        tractoristaEmpleadoId: selectTractorista?.value ? parseInt(selectTractorista.value, 10) : null,
        tractoristaNombre,
        maquinariaEquipoId: selectNoUnidad?.value ? parseInt(selectNoUnidad.value, 10) : null,
        noUnidadNombre,
        noUnidadLabel: noUnidadNombre,
        tractoristaDelta,
        maquinariaDelta,
        alerosDelta,
        alerosText: alerosDelta || aleros.map((a) => a.Nombre).join(', '),
        alerosEmpleadoIds: aleros.map((a) => a.EmpleadoId).join(','),
        alerosNombres: aleros.map((a) => a.Nombre),
        observaciones: String(inputObservaciones?.value || '').trim(),
        registros,
        equipajePuerta: matrizPuerta.getItems()
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
    if (!String(inputHoraInicio?.value || '').trim()) {
      Validator?.markElementInvalid(inputHoraInicio);
      errors.push({ label: 'Hora de Inicio / Revisión', message: 'La Hora de Inicio es obligatoria.', element: inputHoraInicio });
    }
    if (!String(selectSupervisor?.value || '').trim()) {
      Validator?.markElementInvalid(selectSupervisor);
      errors.push({ label: 'Supervisor de Turno', message: 'Debe seleccionar el Supervisor de Turno.', element: selectSupervisor });
    }
    if (registros.length === 0) {
      Validator?.markElementInvalid(inputRegNombre);
      errors.push({
        label: 'Registros en Cabina',
        message: 'Debe registrar al menos 1 persona en el Control de Ingreso y Egreso a Cabina.',
        element: inputRegNombre
      });
    } else {
      const sinSalida = registros.find((r) => !String(r.HoraSalida || '').trim());
      if (sinSalida) {
        errors.push({
          label: 'Hora de Salida Pendiente',
          message: `ALERTA DE SEGURIDAD: "${sinSalida.Nombre}" aún permanece en cabina sin Hora de Salida registrada.`
        });
      }
    }

    if (errors.length > 0) {
      Validator?.focusAndAlert({
        title: 'Validación de Control Ingreso y Egreso Cabina',
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
            root: form,
            headerElementMap: {
              fecha: inputFecha,
              horaInicio: inputHoraInicio,
              supervisorEmpleadoId: selectSupervisor,
              tractoristaEmpleadoId: selectTractorista,
              maquinariaEquipoId: selectNoUnidad,
              registros: inputRegNombre
            }
          });
          return;
        }
        Swal.fire({
          icon: 'error',
          title: 'Alerta de Validación',
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

      await Swal.fire({
        icon: 'success',
        title: '¡Formato Guardado!',
        text: json.mensaje || json.message || 'Control de Ingreso y Egreso Cabina guardado correctamente.',
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
      console.error('[CIEC SAVE ERROR]', err);
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

  renderRegistros();
  renderAleros();
});
