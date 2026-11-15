/**
 * Controlador Frontend para Puestos por Operación (amx-po)
 * Estándar LAATS — 100% compatible con Helmet CSP y validación estricta de 2 capas.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formCapturaPO');
  if (!form) return;

  const Validator = window.SioFormatValidator;

  const esc = (val) => {
    if (Validator && typeof Validator.escapeHtml === 'function') return Validator.escapeHtml(val);
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  let initialState = {};
  try {
    const rawJson = document.getElementById('poInitialStateJson')?.textContent || '{}';
    initialState = JSON.parse(rawJson);
  } catch (err) {
    console.error('[PO INIT JSON ERROR]', err);
  }

  const posicionesCatalog = Array.isArray(initialState.posicionesCatalog) ? initialState.posicionesCatalog : [];
  const usuariosSEC = Array.isArray(initialState.usuariosSEC) ? initialState.usuariosSEC : [];

  let detalles = (Array.isArray(initialState.detalles) ? initialState.detalles : []).map((d) => {
    const empId = parseInt(d.EmpleadoId, 10) || 0;
    const posId = parseInt(d.PosicionesPOId ?? d.PosicionId, 10) || 0;
    const userMatch = usuariosSEC.find((u) => Number(u.EmpleadoId) === empId);
    const posMatch = posicionesCatalog.find((p) => Number(p.PosicionId) === posId);
    return {
      DetallePOId: parseInt(d.DetallePOId ?? d.PuestosOperacionId, 10) || 0,
      PuestosOperacionId: parseInt(d.DetallePOId ?? d.PuestosOperacionId, 10) || 0,
      EmpleadoId: empId,
      Usuario: d.Usuario || d.Agentes || (userMatch ? userMatch.Usuario : `Agente #${empId}`),
      PosicionId: posId,
      Posicion: d.Posicion || d.Posiciones || (posMatch ? posMatch.Posicion : `Posición #${posId}`)
    };
  });

  // Referencias del DOM
  const inputFormatoId = document.getElementById('poFormatoId');
  const inputItinerarioId = document.getElementById('poItinerarioId');
  const inputEncabezadoId = document.getElementById('poEncabezadoId');
  const inputFecha = document.getElementById('poFecha');
  const inputLeadAgent = document.getElementById('poLeadAgent');
  const selectSupervisor = document.getElementById('poSupervisor');
  const selectAgente = document.getElementById('poSelectAgente');
  const selectPosicion = document.getElementById('poSelectPosicion');
  const btnAgregarAgente = document.getElementById('btnAgregarAgentePO');
  const tbodyMatriz = document.getElementById('poTbodyMatriz');
  const totalAgentesEl = document.getElementById('poTotalAgentesCount');
  const inputObservaciones = document.getElementById('poObservaciones');
  const canvasFirmaSup = document.getElementById('poCanvasFirmaSupervisor');
  const btnLimpiarFirma = document.getElementById('btnLimpiarFirmaPO');
  const btnVistaPreliminar = document.getElementById('btnVistaPreliminarPO');
  const btnGuardarDefinitivo = document.getElementById('btnGuardarDefinitivoPO');

  // Lienzo de firma del Supervisor
  let hasSignatureInk = false;
  if (canvasFirmaSup) {
    const ctx = canvasFirmaSup.getContext('2d');
    let drawing = false;
    const resize = () => {
      const rect = canvasFirmaSup.getBoundingClientRect();
      canvasFirmaSup.width = rect.width || 320;
      canvasFirmaSup.height = rect.height || 130;
      ctx.strokeStyle = '#0F2744';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    };
    resize();

    const getPos = (e) => {
      const rect = canvasFirmaSup.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    canvasFirmaSup.addEventListener('mousedown', (e) => {
      drawing = true;
      hasSignatureInk = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    });
    canvasFirmaSup.addEventListener('mousemove', (e) => {
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    window.addEventListener('mouseup', () => {
      drawing = false;
    });

    if (btnLimpiarFirma) {
      btnLimpiarFirma.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvasFirmaSup.width, canvasFirmaSup.height);
        hasSignatureInk = false;
      });
    }
  }

  function renderMatriz() {
    if (totalAgentesEl) totalAgentesEl.textContent = String(detalles.length);
    if (!tbodyMatriz) return;

    if (detalles.length === 0) {
      tbodyMatriz.innerHTML = `
        <tr>
          <td colspan="14" style="text-align:center; padding:24px; color:var(--text-3);">
            No hay agentes asignados todavía. Seleccione un Agente y su Puesto Operativo arriba para comenzar.
          </td>
        </tr>
      `;
      return;
    }

    tbodyMatriz.innerHTML = detalles
      .map((item, rowIdx) => {
        let posCells = '';
        for (let pId = 1; pId <= 11; pId++) {
          const isSelected = Number(item.PosicionId) === pId;
          posCells += `
            <td
              data-row-idx="${rowIdx}"
              data-pos-id="${pId}"
              style="text-align:center; cursor:pointer; font-weight:800; font-size:13px; ${isSelected ? 'background:#DCFCE7; color:#15803D;' : ''}"
              title="Clic para asignar puesto #${pId}"
            >${isSelected ? 'X' : ''}</td>
          `;
        }

        return `
          <tr data-row-index="${rowIdx}">
            <td style="text-align:center; font-weight:700;">${rowIdx + 1}</td>
            <td style="font-weight:700; color:var(--brand-deep);">${esc(item.Usuario)}</td>
            ${posCells}
            <td style="text-align:center;">
              <button type="button" class="btn btn-secondary" data-del-row="${rowIdx}" style="color:var(--danger); border-color:var(--danger); padding:4px 8px;">
                <i class="fas fa-trash-alt"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  if (btnAgregarAgente) {
    btnAgregarAgente.addEventListener('click', () => {
      Validator?.clearValidationErrors(document.getElementById('poCardMatriz'));
      const empId = parseInt(selectAgente?.value || '0', 10);
      const posId = parseInt(selectPosicion?.value || '0', 10);

      if (!empId || !posId) {
        if (!empId) Validator?.markElementInvalid(selectAgente);
        if (!posId) Validator?.markElementInvalid(selectPosicion);
        Swal.fire({
          icon: 'warning',
          title: 'Selección incompleta',
          text: 'Seleccione el Agente de Seguridad y su Puesto Operativo (1..11).',
          confirmButtonColor: '#0F2744'
        });
        return;
      }

      const optAg = selectAgente.options[selectAgente.selectedIndex];
      const usuarioStr = optAg ? (optAg.getAttribute('data-usuario') || optAg.textContent).trim() : `Agente #${empId}`;
      const posObj = posicionesCatalog.find((p) => Number(p.PosicionId) === posId);
      const posNombre = posObj ? posObj.Posicion : `Posición #${posId}`;

      const existingIdx = detalles.findIndex((d) => d.EmpleadoId === empId);
      if (existingIdx >= 0) {
        detalles[existingIdx].PosicionId = posId;
        detalles[existingIdx].Posicion = posNombre;
      } else {
        detalles.push({
          PuestosOperacionId: 0,
          EmpleadoId: empId,
          Usuario: usuarioStr,
          PosicionId: posId,
          Posicion: posNombre
        });
      }

      selectAgente.value = '';
      selectPosicion.value = '';
      renderMatriz();
    });
  }

  if (tbodyMatriz) {
    tbodyMatriz.addEventListener('click', (e) => {
      const delBtn = e.target.closest('button[data-del-row]');
      if (delBtn) {
        const idx = parseInt(delBtn.getAttribute('data-del-row'), 10);
        if (Number.isInteger(idx) && detalles[idx]) {
          detalles.splice(idx, 1);
          renderMatriz();
        }
        return;
      }

      const posCell = e.target.closest('td[data-pos-id]');
      if (posCell) {
        const rowIdx = parseInt(posCell.getAttribute('data-row-idx'), 10);
        const posId = parseInt(posCell.getAttribute('data-pos-id'), 10);
        if (Number.isInteger(rowIdx) && detalles[rowIdx] && posId >= 1 && posId <= 11) {
          const posObj = posicionesCatalog.find((p) => Number(p.PosicionId) === posId);
          detalles[rowIdx].PosicionId = posId;
          detalles[rowIdx].Posicion = posObj ? posObj.Posicion : `Posición #${posId}`;
          renderMatriz();
        }
      }
    });
  }

  function recopilarPayload(guardarDefinitivo) {
    const supOpt = selectSupervisor?.options?.[selectSupervisor.selectedIndex];
    const supervisorNombre = supOpt ? (supOpt.getAttribute('data-usuario') || supOpt.textContent || '').trim() : '';

    return {
      formatoId: inputFormatoId?.value || 'amx-po',
      itinerarioId: parseInt(inputItinerarioId?.value || '0', 10),
      encabezadoId: inputEncabezadoId?.value ? parseInt(inputEncabezadoId.value, 10) : null,
      guardar: Boolean(guardarDefinitivo),
      datos: {
        fecha: String(inputFecha?.value || '').trim(),
        leadAgent: String(inputLeadAgent?.value || '').trim(),
        supervisorLoginSecId: selectSupervisor?.value ? parseInt(selectSupervisor.value, 10) : null,
        supervisorNombre,
        observaciones: String(inputObservaciones?.value || '').trim(),
        firmaSupervisor: hasSignatureInk && canvasFirmaSup ? canvasFirmaSup.toDataURL('image/png') : '',
        detalles
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
    if (!String(selectSupervisor?.value || '').trim()) {
      Validator?.markElementInvalid(selectSupervisor);
      errors.push({ label: 'Supervisor de Seguridad', message: 'Debe seleccionar al Supervisor de Seguridad.', element: selectSupervisor });
    }
    if (detalles.length === 0) {
      Validator?.markElementInvalid(selectAgente);
      errors.push({
        label: 'Matriz de Agentes',
        message: 'Debe asignar al menos 1 Agente y su Puesto Operativo en la matriz.',
        element: selectAgente
      });
    }

    if (errors.length > 0) {
      Validator?.focusAndAlert({
        title: 'Campos obligatorios pendientes en Puestos por Operación',
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
        Swal.close();
        if (Validator && Array.isArray(json.errors) && json.errors.length > 0) {
          Validator.applyBackendErrors(json.errors, {
            headerMap: {
              fecha: inputFecha,
              supervisorLoginSecId: selectSupervisor,
              detalles: selectAgente
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

      if (!guardarDefinitivo && json.previewUrl) {
        Swal.close();
        window.open(json.previewUrl, '_blank');
        return;
      }

      if (json.encabezadoId && inputEncabezadoId) {
        inputEncabezadoId.value = String(json.encabezadoId);
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Formato Guardado!',
        text: json.message || 'Puestos por Operación guardado correctamente.',
        confirmButtonColor: '#0F2744'
      });

      if (json.encabezadoId) {
        window.location.href = `/formatos/${encodeURIComponent(payload.formatoId)}?encabezadoId=${json.encabezadoId}`;
      }
    } catch (err) {
      console.error('[PO SAVE ERROR]', err);
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
