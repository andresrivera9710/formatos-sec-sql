/**
 * Controlador Frontend para Control de Equipajes en Banda de Salida (Rayos X) (*-eb)
 * Estándar LAATS — 100% compatible con Helmet CSP (cero scripts/eventos inline) y validación de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaEB');
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

  // Cargar estado inicial hidratado desde el servidor
  let initialState = {};
  try {
    const rawJson = document.getElementById('ebInitialStateJson')?.textContent || '{}';
    initialState = JSON.parse(rawJson);
  } catch (err) {
    console.error('[EB INIT JSON ERROR]', err);
  }

  let detalles = Array.isArray(initialState.detalles)
    ? initialState.detalles.map((d, idx) => ({
        DetalleControlEBId: parseInt(d.DetalleControlEBId ?? d.DetalleEBId, 10) || 0,
        DetalleEBId: parseInt(d.DetalleControlEBId ?? d.DetalleEBId, 10) || 0,
        Casilla: parseInt(d.Casilla, 10) || idx + 1,
        Fila: parseInt(d.Fila, 10) || Math.floor(idx / 10) + 1,
        Columna: String(d.Columna || COLS[idx % 10]).trim().toUpperCase(),
        Secuencia: parseInt(d.Secuencia, 10) || 0,
        Valor: d.Valor ? String(d.Valor).trim().toUpperCase() : null
      }))
    : [];

  // Referencias del DOM
  const inputFormatoId = document.getElementById('ebFormatoId');
  const inputItinerarioId = document.getElementById('ebItinerarioId');
  const inputEncabezadoId = document.getElementById('ebEncabezadoId');
  const inputFecha = document.getElementById('ebFecha');
  const inputHoraInicio = document.getElementById('ebHoraInicio');
  const selectSupervisor = document.getElementById('ebSupervisor');
  const inputNombreOperador = document.getElementById('ebNombreOperador');
  const inputSecuencia = document.getElementById('ebInputSecuencia');
  const tbodyMatriz = document.getElementById('ebTbodyMatriz');
  const totalCountEl = document.getElementById('ebTotalEquipajeCount');
  const inputCorreos = document.getElementById('ebCorreos');
  const inputComat = document.getElementById('ebComat');
  const inputEqTransito = document.getElementById('ebEqTransito');
  const inputHoraCierre = document.getElementById('ebHoraCierre');
  const inputObservaciones = document.getElementById('ebObservaciones');

  const btnRelojInicio = document.getElementById('btnRelojHoraInicioEB');
  const btnRelojCierre = document.getElementById('btnRelojHoraCierreEB');
  const btnAgregarSecuencia = document.getElementById('btnAgregarSecuenciaEB');
  const btnBorrarUltimo = document.getElementById('btnBorrarUltimoEB');
  const btnRetirarMaleta = document.getElementById('btnRetirarMaletaEB');
  const btnVistaPreliminar = document.getElementById('btnVistaPreliminarEB');
  const btnGuardarDefinitivo = document.getElementById('btnGuardarDefinitivoEB');

  // Recalcular coordenadas Casilla / Fila / Columna
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
    if (totalCountEl) totalCountEl.textContent = String(activeCount);

    const maxFila = Math.max(10, Math.ceil(detalles.length / 10));
    const rowsHtml = [];

    for (let f = 1; f <= maxFila; f++) {
      let tds = `<td style="font-weight: 700; background: var(--bg); color: var(--brand-deep);">${f}</td>`;
      for (let c = 0; c < 10; c++) {
        const colName = COLS[c];
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

  // Agregar secuencia a la matriz
  function agregarSecuencia() {
    const valStr = String(inputSecuencia?.value || '').trim();
    const num = parseInt(valStr, 10);
    if (!valStr || !Number.isInteger(num) || num <= 0) {
      if (Validator) Validator.markElementInvalid(inputSecuencia);
      if (window.Swal) {
        Swal.fire({
          icon: 'warning',
          title: 'Secuencia inválida',
          text: 'Ingrese un número entero positivo de secuencia de equipaje.',
          confirmButtonColor: '#0F2744'
        });
      }
      inputSecuencia?.focus();
      return;
    }

    const idx = detalles.length;
    detalles.push({
      DetalleEBId: 0,
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
    if (Validator) Validator.clearValidationErrors( document.getElementById('ebCardMatriz'));
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

  // Clic en celda para alternar estado retirado (✗)
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

  // Modal para retirar maleta por secuencia y documentar motivo
  if (btnRetirarMaleta) {
    btnRetirarMaleta.addEventListener('click', async () => {
      if (detalles.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin equipajes', text: 'Primero agregue secuencias a la matriz.', confirmButtonColor: '#0F2744' });
        return;
      }
      const { value: formValues } = await Swal.fire({
        title: 'Retirar / Anular Maleta (✗)',
        html: `
          <div style="text-align:left; font-size:13px;">
            <label style="font-weight:600; display:block; margin-bottom:4px;">Número de Secuencia a Retirar *</label>
            <input id="swalEbSec" type="number" class="swal2-input" style="margin:0 0 12px 0; width:100%;" placeholder="Ej: 15">
            <label style="font-weight:600; display:block; margin-bottom:4px;">Motivo / Observación *</label>
            <input id="swalEbMotivo" type="text" class="swal2-input" style="margin:0; width:100%;" placeholder="Ej: Retirada por inspección AVSEC">
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Marcar con ✗',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#DC2626',
        preConfirm: () => {
          const sec = parseInt(document.getElementById('swalEbSec')?.value || '', 10);
          const motivo = String(document.getElementById('swalEbMotivo')?.value || '').trim();
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
          Swal.fire({ icon: 'error', title: 'No encontrada', text: `No se encontró la secuencia activa #${formValues.sec} en la matriz.` });
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

  if (btnRelojInicio) {
    btnRelojInicio.addEventListener('click', () => {
      if (inputHoraInicio) {
        inputHoraInicio.value = nowHHMM();
        inputHoraInicio.dispatchEvent(new Event('input'));
      }
    });
  }
  if (btnRelojCierre) {
    btnRelojCierre.addEventListener('click', () => {
      if (inputHoraCierre) {
        inputHoraCierre.value = nowHHMM();
      }
    });
  }

  function recopilarPayload(guardarDefinitivo) {
    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supervisorNombre = supOpt ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim() : '';

    return {
      formatoId: inputFormatoId?.value || 'amx-eb',
      itinerarioId: parseInt(inputItinerarioId?.value || '0', 10),
      encabezadoId: inputEncabezadoId?.value ? parseInt(inputEncabezadoId.value, 10) : null,
      guardar: Boolean(guardarDefinitivo),
      datos: {
        fecha: String(inputFecha?.value || '').trim(),
        horaInicio: String(inputHoraInicio?.value || '').trim(),
        horaCierre: String(inputHoraCierre?.value || '').trim(),
        supervisorLoginId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : null,
        supervisorNombre,
        nombreOperador: String(inputNombreOperador?.value || '').trim(),
        correos: inputCorreos?.value !== '' ? parseInt(inputCorreos.value, 10) : null,
        comat: inputComat?.value !== '' ? parseInt(inputComat.value, 10) : null,
        eqTransito: inputEqTransito?.value !== '' ? parseInt(inputEqTransito.value, 10) : null,
        observaciones: String(inputObservaciones?.value || '').trim(),
        detalles
      }
    };
  }

  function validarFormularioFrontend() {
    if (Validator) Validator.clearValidationErrors(form);
    const errors = [];

    if (!String(inputFecha?.value || '').trim()) {
      Validator?.markElementInvalid(inputFecha);
      errors.push({ rowNumber: null, label: 'Fecha', message: 'La Fecha es obligatoria.', element: inputFecha });
    }
    if (!String(inputHoraInicio?.value || '').trim()) {
      Validator?.markElementInvalid(inputHoraInicio);
      errors.push({ rowNumber: null, label: 'Hora de Inicio', message: 'La Hora de Inicio es obligatoria.', element: inputHoraInicio });
    }
    if (!String(selectSupervisor?.value || '').trim()) {
      Validator?.markElementInvalid(selectSupervisor);
      errors.push({ rowNumber: null, label: 'Nombre del Supervisor', message: 'Debe seleccionar el Supervisor en turno.', element: selectSupervisor });
    }
    if (!String(inputNombreOperador?.value || '').trim()) {
      Validator?.markElementInvalid(inputNombreOperador);
      errors.push({ rowNumber: null, label: 'Nombre del Operador', message: 'El Nombre del Operador es obligatorio.', element: inputNombreOperador });
    }
    if (detalles.length === 0) {
      Validator?.markElementInvalid(inputSecuencia);
      errors.push({ rowNumber: null, label: 'Matriz de Equipajes', message: 'Debe registrar al menos 1 secuencia de equipaje en la matriz de Banda de Salida.', element: inputSecuencia });
    }

    if (errors.length > 0) {
      Validator?.focusAndAlert({
        title: 'Campos obligatorios pendientes en Banda de Salida',
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
        text: 'Procesando información de forma segura en Azure SQL',
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
              supervisorLoginId: selectSupervisor,
              nombreOperador: inputNombreOperador,
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
        text: json.mensaje || json.message || 'Control de Equipajes en Banda de Salida guardado correctamente.',
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
      console.error('[EB SAVE ERROR]', err);
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
