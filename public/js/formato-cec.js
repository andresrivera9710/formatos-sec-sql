/**
 * Controlador Frontend para Control de Equipajes en Compartimentos (*-cec)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaCEC');
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

  let initialState = {};
  try {
    const rawJson = document.getElementById('cecInitialStateJson')?.textContent || '{}';
    initialState = JSON.parse(rawJson);
  } catch (err) {
    console.error('[CEC INIT JSON ERROR]', err);
  }

  let detalles = Array.isArray(initialState.detalles)
    ? initialState.detalles.map((d, idx) => ({
        DetalleCECDespId: parseInt(d.DetalleCECDespId ?? d.DetalleCECId, 10) || 0,
        DetalleCECId: parseInt(d.DetalleCECDespId ?? d.DetalleCECId, 10) || 0,
        Casilla: parseInt(d.Casilla, 10) || idx + 1,
        Fila: parseInt(d.Fila, 10) || Math.floor(idx / 10) + 1,
        Columna: String(d.Columna || COLS[idx % 10]).trim().toUpperCase(),
        Secuencia: parseInt(d.Secuencia, 10) || 0,
        Valor: d.Valor ? String(d.Valor).trim().toUpperCase() : null
      }))
    : [];

  // Referencias del DOM
  const inputFormatoId = document.getElementById('cecFormatoId');
  const inputItinerarioId = document.getElementById('cecItinerarioId');
  const inputEncabezadoId = document.getElementById('cecEncabezadoId');
  const inputFecha = document.getElementById('cecFecha');
  const inputHoraInicio = document.getElementById('cecHoraInicio');
  const inputCompartimiento = document.getElementById('cecCompartimiento');
  const inputCompAbierto = document.getElementById('cecCompAbierto');
  const inputCompCerrado = document.getElementById('cecCompCerrado');
  const selectSupervisor = document.getElementById('cecSupervisor');
  const selectAgente = document.getElementById('cecAgente');

  const inputEmbarqueInicio = document.getElementById('cecEmbarqueInicio');
  const inputEmbarqueFinal = document.getElementById('cecEmbarqueFinal');
  const inputSecuencia = document.getElementById('cecInputSecuencia');
  const tbodyMatriz = document.getElementById('cecTbodyMatriz');
  const totalEmbarqueEl = document.getElementById('cecTotalEmbarqueCount');

  const inputDesembarqueInicio = document.getElementById('cecDesembarqueInicio');
  const inputDesembarqueFinal = document.getElementById('cecDesembarqueFinal');
  const inputEquipaje = document.getElementById('cecEquipaje');
  const inputCarruajes = document.getElementById('cecCarruajes');
  const inputCorreos = document.getElementById('cecCorreos');
  const inputCarga = document.getElementById('cecCarga');
  const inputCantSinEtiq = document.getElementById('cecCantidadSinEtiqueta');
  const inputCantConEtiq = document.getElementById('cecCantidadConEtiqueta');

  const inputNombreOirsa = document.getElementById('cecNombreOirsa');
  const inputTiaOirsa = document.getElementById('cecTiaOirsa');
  const inputPilotoComb = document.getElementById('cecPilotoCombustible');
  const inputTiaPilotoComb = document.getElementById('cecTiaPilotoCombustible');
  const inputAyudanteComb = document.getElementById('cecAyudanteCombustible');
  const inputTiaAyudanteComb = document.getElementById('cecTiaAyudanteCombustible');
  const inputNoUnidadComb = document.getElementById('cecNoUnidadCombustible');
  const inputCombEntrada = document.getElementById('cecCombustibleEntrada');
  const inputCombSalida = document.getElementById('cecCombustibleSalida');

  const inputPilotoCoc = document.getElementById('cecPilotoCocinas');
  const inputTiaPilotoCoc = document.getElementById('cecTiaPilotoCocinas');
  const inputAyudanteCoc = document.getElementById('cecAyudanteCocinas');
  const inputTiaAyudanteCoc = document.getElementById('cecTiaAyudanteCocinas');
  const inputNoUnidadCoc = document.getElementById('cecNoUnidadCocinas');
  const inputCocEntrada = document.getElementById('cecCocinasEntrada');
  const inputCocSalida = document.getElementById('cecCocinasSalida');

  const inputOperadoresRampa = document.getElementById('cecOperadoresRampa');
  const inputObservaciones = document.getElementById('cecObservaciones');

  const btnAgregarSecuencia = document.getElementById('btnAgregarSecuenciaCEC');
  const btnBorrarUltimo = document.getElementById('btnBorrarUltimoCEC');
  const btnRetirarMaleta = document.getElementById('btnRetirarMaletaCEC');
  const btnVistaPreliminar = document.getElementById('btnVistaPreliminarCEC');
  const btnGuardarDefinitivo = document.getElementById('btnGuardarDefinitivoCEC');

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

  function reindexDetalles() {
    detalles = detalles.map((item, idx) => ({
      ...item,
      Casilla: idx + 1,
      Fila: Math.floor(idx / 10) + 1,
      Columna: COLS[idx % 10]
    }));
  }

  function renderMatriz() {
    reindexDetalles();
    const activeCount = detalles.filter((d) => d.Secuencia > 0 && d.Valor !== 'X').length;
    if (totalEmbarqueEl) totalEmbarqueEl.textContent = String(activeCount);

    const maxFila = Math.max(10, Math.ceil(detalles.length / 10));
    const rowsHtml = [];

    for (let f = 1; f <= maxFila; f++) {
      let tds = `<td style="font-weight: 700; background: var(--bg); color: var(--brand-deep);">${f}</td>`;
      for (let c = 0; c < 10; c++) {
        const cellIdx = (f - 1) * 10 + c;
        const item = detalles[cellIdx];
        if (item && item.Secuencia > 0) {
          const isTachado = item.Valor === 'X';
          tds += `
            <td data-cell-index="${cellIdx}" style="position: relative; cursor: pointer; font-weight: 700; ${isTachado ? 'background: #FEE2E2; color: #991B1B;' : 'background: #EFF6FF; color: var(--brand-deep);'}" title="Casilla #${item.Casilla} — Clic para alternar retiro (✗)">
              <span>${esc(item.Secuencia)}</span>
              ${isTachado ? '<span style="color: #DC2626; font-weight: 900; margin-left: 4px;">✗</span>' : ''}
            </td>
          `;
        } else {
          tds += `<td style="color: var(--text-3); font-size: 11px;">—</td>`;
        }
      }
      rowsHtml.push(`<tr>${tds}</tr>`);
    }

    if (tbodyMatriz) {
      tbodyMatriz.innerHTML = rowsHtml.join('');
    }
  }

  function agregarSecuencia() {
    const valStr = String(inputSecuencia?.value || '').trim();
    const num = parseInt(valStr, 10);
    if (!valStr || !Number.isInteger(num) || num <= 0) {
      Validator?.markElementInvalid(inputSecuencia);
      Swal.fire({
        icon: 'warning',
        title: 'Secuencia inválida',
        text: 'Ingrese un número entero positivo de secuencia de equipaje.',
        confirmButtonColor: '#0F2744'
      });
      inputSecuencia?.focus();
      return;
    }

    const idx = detalles.length;
    detalles.push({
      DetalleCECId: 0,
      Casilla: idx + 1,
      Fila: Math.floor(idx / 10) + 1,
      Columna: COLS[idx % 10],
      Secuencia: num,
      Valor: null
    });

    if (inputSecuencia) {
      inputSecuencia.value = '';
      inputSecuencia.focus();
    }
    Validator?.clearValidationErrors(document.getElementById('cecCardMatriz'));
    renderMatriz();
  }

  if (btnAgregarSecuencia) {
    btnAgregarSecuencia.addEventListener('click', agregarSecuencia);
  }
  if (inputSecuencia) {
    inputSecuencia.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        agregarSecuencia();
      }
    });
  }

  if (btnBorrarUltimo) {
    btnBorrarUltimo.addEventListener('click', () => {
      if (detalles.length === 0) return;
      detalles.pop();
      renderMatriz();
    });
  }

  if (tbodyMatriz) {
    tbodyMatriz.addEventListener('click', (e) => {
      const td = e.target.closest('td[data-cell-index]');
      if (!td) return;
      const idx = parseInt(td.getAttribute('data-cell-index'), 10);
      if (!Number.isInteger(idx) || !detalles[idx]) return;
      detalles[idx].Valor = detalles[idx].Valor === 'X' ? null : 'X';
      renderMatriz();
    });
  }

  if (btnRetirarMaleta) {
    btnRetirarMaleta.addEventListener('click', async () => {
      if (detalles.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin equipajes', text: 'Primero agregue secuencias a la matriz.', confirmButtonColor: '#0F2744' });
        return;
      }
      const { value: formValues } = await Swal.fire({
        title: 'Retirar / Anular Maleta en Compartimento (✗)',
        html: `
          <div style="text-align:left; font-size:13px;">
            <label style="font-weight:600; display:block; margin-bottom:4px;">Número de Secuencia a Retirar *</label>
            <input id="swalCecSec" type="number" class="swal2-input" style="margin:0 0 12px 0; width:100%;" placeholder="Ej: 18">
            <label style="font-weight:600; display:block; margin-bottom:4px;">Motivo / Observación *</label>
            <input id="swalCecMotivo" type="text" class="swal2-input" style="margin:0; width:100%;" placeholder="Ej: Bajada de compartimento por seguridad">
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Marcar con ✗',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#DC2626',
        preConfirm: () => {
          const sec = parseInt(document.getElementById('swalCecSec')?.value || '', 10);
          const motivo = String(document.getElementById('swalCecMotivo')?.value || '').trim();
          if (!sec || sec <= 0 || !motivo) {
            Swal.showValidationMessage('Ingrese el número de secuencia y el motivo del retiro.');
            return false;
          }
          return { sec, motivo };
        }
      });

      if (formValues) {
        const target = detalles.find((d) => d.Secuencia === formValues.sec && d.Valor !== 'X');
        if (!target) {
          Swal.fire({ icon: 'error', title: 'No encontrada', text: `No se encontró la secuencia activa #${formValues.sec}.` });
          return;
        }
        target.Valor = 'X';
        const nota = `[Sec. ${formValues.sec} retirada: ${formValues.motivo}]`;
        if (inputObservaciones) {
          inputObservaciones.value = inputObservaciones.value.trim()
            ? `${inputObservaciones.value.trim()} | ${nota}`
            : nota;
        }
        renderMatriz();
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
    const supervisorNombre = supOpt ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim() : '';

    const agOpt = selectAgente?.options?.[selectAgente.selectedIndex];
    const agenteNombre = agOpt
      ? (agOpt.getAttribute('data-usuario') || agOpt.textContent || '').trim()
      : String(selectAgente?.getAttribute('data-usuario') || selectAgente?.value || '').trim();

    return {
      formatoId: inputFormatoId?.value || 'amx-cec',
      itinerarioId: parseInt(inputItinerarioId?.value || '0', 10),
      encabezadoId: inputEncabezadoId?.value ? parseInt(inputEncabezadoId.value, 10) : null,
      guardar: Boolean(guardarDefinitivo),
      datos: {
        fecha: String(inputFecha?.value || '').trim(),
        horaInicio: String(inputHoraInicio?.value || '').trim(),
        compartimiento: parseOptionalInt(inputCompartimiento),
        compAbierto: String(inputCompAbierto?.value || '').trim(),
        compCerrado: String(inputCompCerrado?.value || '').trim(),
        supervisorLoginId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : null,
        supervisorNombre,
        agenteLoginId: (selectAgente?.options && selectAgente.value) ? parseInt(selectAgente.value, 10) : null,
        agenteNombre,
        agente: agenteNombre,
        embarqueInicio: String(inputEmbarqueInicio?.value || '').trim(),
        embarqueFinal: String(inputEmbarqueFinal?.value || '').trim(),
        desembarqueInicio: String(inputDesembarqueInicio?.value || '').trim(),
        desembarqueFinal: String(inputDesembarqueFinal?.value || '').trim(),
        equipaje: parseOptionalInt(inputEquipaje),
        carruajes: parseOptionalInt(inputCarruajes),
        correos: parseOptionalInt(inputCorreos),
        carga: parseOptionalInt(inputCarga),
        cargaEmbarqueDelta: parseOptionalInt(document.getElementById('cecCargaEmbarqueDelta')),
        equipajeMostrador: parseOptionalInt(document.getElementById('cecEquipajeMostrador')),
        equipajePuerta: parseOptionalInt(document.getElementById('cecEquipajePuerta')),
        cantidadSinEtiqueta: parseOptionalInt(inputCantSinEtiq),
        cantidadConEtiqueta: parseOptionalInt(inputCantConEtiq),
        nombreOirsa: String(inputNombreOirsa?.value || '').trim(),
        tiaOirsa: String(inputTiaOirsa?.value || '').trim(),
        pilotoCombustible: String(inputPilotoComb?.value || '').trim(),
        tiaPilotoCombustible: String(inputTiaPilotoComb?.value || '').trim(),
        ayudanteCombustible: String(inputAyudanteComb?.value || '').trim(),
        tiaAyudanteCombustible: String(inputTiaAyudanteComb?.value || '').trim(),
        noUnidadCombustible: String(inputNoUnidadComb?.value || '').trim(),
        combustibleEntrada: String(inputCombEntrada?.value || '').trim(),
        combustibleSalida: String(inputCombSalida?.value || '').trim(),
        pilotoCocinas: String(inputPilotoCoc?.value || '').trim(),
        tiaPilotoCocinas: String(inputTiaPilotoCoc?.value || '').trim(),
        ayudanteCocinas: String(inputAyudanteCoc?.value || '').trim(),
        tiaAyudanteCocinas: String(inputTiaAyudanteCoc?.value || '').trim(),
        noUnidadCocinas: String(inputNoUnidadCoc?.value || '').trim(),
        cocinasEntrada: String(inputCocEntrada?.value || '').trim(),
        cocinasSalida: String(inputCocSalida?.value || '').trim(),
        operadoresRampa: String(inputOperadoresRampa?.value || '').trim(),
        observaciones: String(inputObservaciones?.value || '').trim(),
        detalles
      }
    };
  }

  function validarFormularioFrontend() {
    Validator?.clearValidationErrors(form);
    const errors = [];

    if (!String(inputFecha?.value || '').trim()) {
      Validator?.markElementInvalid(inputFecha);
      errors.push({ rowNumber: null, label: 'Fecha', message: 'La Fecha es obligatoria.', element: inputFecha });
    }
    if (!String(inputHoraInicio?.value || '').trim()) {
      Validator?.markElementInvalid(inputHoraInicio);
      errors.push({ rowNumber: null, label: 'Hora de Inicio', message: 'La Hora de Inicio es obligatoria.', element: inputHoraInicio });
    }
    if (String(inputCompartimiento?.value ?? '').trim() === '') {
      Validator?.markElementInvalid(inputCompartimiento);
      errors.push({ rowNumber: null, label: 'Compartimento No.', message: 'El Número de Compartimento es obligatorio.', element: inputCompartimiento });
    }
    if (!String(selectSupervisor?.value || '').trim()) {
      Validator?.markElementInvalid(selectSupervisor);
      errors.push({ rowNumber: null, label: 'Nombre del Supervisor', message: 'Debe seleccionar el Supervisor.', element: selectSupervisor });
    }
    if (!String(selectAgente?.value || '').trim()) {
      Validator?.markElementInvalid(selectAgente);
      errors.push({ rowNumber: null, label: 'Nombre del Agente', message: 'Debe seleccionar el Agente.', element: selectAgente });
    }

    const tieneDesembarque =
      parseOptionalInt(inputEquipaje) > 0 ||
      parseOptionalInt(inputCarruajes) > 0 ||
      parseOptionalInt(inputCorreos) > 0 ||
      parseOptionalInt(inputCarga) > 0;

    if (detalles.length === 0 && !tieneDesembarque) {
      Validator?.markElementInvalid(inputSecuencia);
      errors.push({
        rowNumber: null,
        label: 'Matriz de Embarque / Desembarque',
        message: 'Debe registrar al menos 1 secuencia en la matriz de Embarque o datos de Desembarque.',
        element: inputSecuencia
      });
    }

    if (errors.length > 0) {
      Validator?.focusAndAlert({
        title: 'Campos obligatorios pendientes en Compartimentos',
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
              horaInicio: inputHoraInicio,
              compartimiento: inputCompartimiento,
              supervisorLoginId: selectSupervisor,
              agenteLoginId: selectAgente,
              detalles: inputSecuencia
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

      await Swal.fire({
        icon: 'success',
        title: '¡Formato Guardado!',
        text: json.mensaje || json.message || 'Control de Equipajes en Compartimentos guardado correctamente.',
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
      console.error('[CEC SAVE ERROR]', err);
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

  renderMatriz();
});
