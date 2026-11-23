/**
 * SioBaggageMatrix — Módulo Reutilizable de Matrices de Equipajes (A..J x Filas)
 * SIO LAATS — Formatos SEC (AEROMEXICO, ARAJET, DELTA, AIR CANADA y futuros clientes)
 *
 * Estándar Corporativo LAATS:
 * - 100% compatible con Helmet CSP (cero estilos inline, cero manejadores onclick inline).
 * - Selección táctil / clic sobre celdas ocupadas con resaltado visual corporativo (#D4AF37).
 * - Acción "Retirar / Anular Maleta (✗)" con validación de selección previa vía SweetAlert2,
 *   confirmación rápida, actualización inmediata de contador activo, sincronización con
 *   IndexedDB (SioOfflineManager) y Soft Delete seguro (EstaEliminado = 1) en Azure SQL
 *   para registros ya persistidos (prohibido DELETE físico).
 */
(function (window, document) {
  'use strict';

  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  function escapeHtml(val) {
    if (window.SioFormatValidator && typeof window.SioFormatValidator.escapeHtml === 'function') {
      return window.SioFormatValidator.escapeHtml(val);
    }
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeItem(raw, idx, idField) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string' || typeof raw === 'number') {
      const str = String(raw).trim();
      const num = parseInt(str, 10);
      if (!Number.isInteger(num) || num <= 0) return null;
      return {
        [idField]: 0,
        Casilla: idx + 1,
        Fila: Math.floor(idx / 10) + 1,
        Columna: COLS[idx % 10],
        Secuencia: num,
        Valor: String(num),
        Motivo: '',
        EstaEliminado: false
      };
    }

    const rawId = parseInt(
      raw[idField] ?? raw.DetalleControlEBId ?? raw.DetalleEBId ?? raw.DetalleCECDespId ?? raw.DetalleCECId ?? raw.EquipajePuertaCIECId ?? 0,
      10
    ) || 0;

    const rawValorStr = raw.Valor !== undefined && raw.Valor !== null ? String(raw.Valor).trim() : '';
    const isWithdrawn = rawValorStr.toUpperCase() === 'X' || Boolean(raw.EstaEliminado);
    const secFromField = parseInt(raw.Secuencia, 10);
    const secFromValor = parseInt(rawValorStr, 10);
    const secuencia = Number.isInteger(secFromField) && secFromField > 0
      ? secFromField
      : (Number.isInteger(secFromValor) && secFromValor > 0 ? secFromValor : 0);

    if (secuencia <= 0 && !isWithdrawn) return null;

    return {
      [idField]: rawId,
      Casilla: parseInt(raw.Casilla ?? raw.Orden, 10) || idx + 1,
      Fila: parseInt(raw.Fila, 10) || Math.floor(idx / 10) + 1,
      Columna: String(raw.Columna || COLS[idx % 10]).trim().toUpperCase(),
      Secuencia: secuencia,
      Valor: isWithdrawn ? 'X' : String(secuencia),
      Motivo: String(raw.Motivo || '').trim(),
      EstaEliminado: isWithdrawn
    };
  }

  function create(options = {}) {
    const family = String(options.family || 'generic').trim().toLowerCase();
    const idField = options.idField || 'DetalleId';
    const secondaryIdField = options.secondaryIdField || null;
    const minRows = Number.isInteger(options.minRows) && options.minRows > 0 ? options.minRows : 4;
    const requireMotivo = Boolean(options.requireMotivo);
    const itemLabel = options.itemLabel || 'Maleta';
    const motivoPlaceholder = options.motivoPlaceholder || 'Ej: Retirada por inspección de seguridad';

    const formEl = options.formEl || null;
    const cardEl = options.cardEl || null;
    const tableEl = options.tableEl || null;
    const tbodyEl = options.tbodyEl || null;
    const selectionBarEl = options.selectionBarEl || null;
    const totalCountEl = options.totalCountEl || null;
    const secondaryTotalEl = options.secondaryTotalEl || null;
    const inputSecuenciaEl = options.inputSecuenciaEl || null;
    const btnAgregarEl = options.btnAgregarEl || null;
    const btnBorrarUltimoEl = options.btnBorrarUltimoEl || null;
    const btnRetirarEl = options.btnRetirarEl || null;
    const observacionesEl = options.observacionesEl || null;
    const formatoIdEl = options.formatoIdEl || null;
    const itinerarioIdEl = options.itinerarioIdEl || null;
    const encabezadoIdEl = options.encabezadoIdEl || null;
    const onChange = typeof options.onChange === 'function' ? options.onChange : null;

    const Validator = window.SioFormatValidator;

    let items = (Array.isArray(options.initialItems) ? options.initialItems : [])
      .map((raw, idx) => normalizeItem(raw, idx, idField))
      .filter(Boolean);

    let selectedIdx = -1;

    if (tableEl) {
      tableEl.classList.add('sio-baggage-matrix-table');
    }

    function reindex() {
      items = items.map((item, idx) => {
        const next = {
          ...item,
          Casilla: idx + 1,
          Orden: idx + 1,
          Fila: Math.floor(idx / 10) + 1,
          Columna: COLS[idx % 10]
        };
        if (secondaryIdField) {
          next[secondaryIdField] = next[idField] || 0;
        }
        return next;
      });
      if (selectedIdx >= items.length) {
        selectedIdx = -1;
      }
    }

    function getActiveCount() {
      return items.filter((it) => it && it.Secuencia > 0 && String(it.Valor || '').toUpperCase() !== 'X' && !it.EstaEliminado).length;
    }

    function notifyChange(persistDraft = true) {
      if (onChange) {
        try {
          onChange(getItems(), getActiveCount());
        } catch (err) {
          console.warn('[SioBaggageMatrix onChange WARN]', err);
        }
      }
      if (persistDraft) {
        if (formEl) {
          formEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (window.SioOfflineManager && typeof window.SioOfflineManager.saveCurrentDraft === 'function') {
          window.SioOfflineManager.saveCurrentDraft().catch(() => {});
        }
      }
    }

    function renderSelectionBar() {
      if (!selectionBarEl) return;

      if (selectedIdx < 0 || !items[selectedIdx]) {
        selectionBarEl.classList.remove('is-selected', 'is-withdrawn');
        selectionBarEl.innerHTML =
          '<span class="sio-mx-sel-info">' +
          '<i class="fas fa-hand-pointer"></i> ' +
          '<span>Toque una celda con secuencia en la matriz para seleccionarla antes de retirar o anular (<strong>✗</strong>).</span>' +
          '</span>';
        return;
      }

      const item = items[selectedIdx];
      const isWithdrawn = String(item.Valor || '').toUpperCase() === 'X' || Boolean(item.EstaEliminado);
      const coord = `${item.Columna}${item.Fila}`;
      const statusBadge = isWithdrawn
        ? '<span class="sio-mx-sel-tag sio-mx-sel-tag-danger">ANULADA (✗)</span>'
        : '<span class="sio-mx-sel-tag sio-mx-sel-tag-gold">ACTIVA — LISTA PARA RETIRAR</span>';

      selectionBarEl.classList.add('is-selected');
      selectionBarEl.classList.toggle('is-withdrawn', isWithdrawn);
      selectionBarEl.innerHTML =
        '<span class="sio-mx-sel-info">' +
        '<i class="fas fa-check-circle"></i> ' +
        '<span>Seleccionada: <strong>Sec. #' + escapeHtml(item.Secuencia) + '</strong> ' +
        '&middot; Posición <strong>' + escapeHtml(coord) + '</strong> (Fila ' + escapeHtml(item.Fila) + ', Col. ' + escapeHtml(item.Columna) + ')</span> ' +
        statusBadge +
        '</span>' +
        '<button type="button" class="sio-mx-sel-clear" data-mx-clear-selection="1" aria-label="Quitar selección">' +
        '<i class="fas fa-times"></i> Quitar' +
        '</button>';
    }

    function render() {
      reindex();
      const activeCount = getActiveCount();
      if (totalCountEl) totalCountEl.textContent = String(activeCount);
      if (secondaryTotalEl) {
        if ('value' in secondaryTotalEl) {
          secondaryTotalEl.value = String(activeCount);
        } else {
          secondaryTotalEl.textContent = String(activeCount);
        }
      }

      if (btnBorrarUltimoEl) {
        btnBorrarUltimoEl.disabled = items.length === 0;
      }

      const maxFila = Math.max(minRows, Math.ceil(items.length / 10));
      const rowsHtml = [];

      for (let f = 1; f <= maxFila; f++) {
        let tds = `<td class="sio-mx-row-num" aria-label="Fila ${f}">${f}</td>`;
        for (let c = 0; c < 10; c++) {
          const cellIdx = (f - 1) * 10 + c;
          const item = items[cellIdx];
          if (item && (item.Secuencia > 0 || String(item.Valor || '').toUpperCase() === 'X')) {
            const isWithdrawn = String(item.Valor || '').toUpperCase() === 'X' || Boolean(item.EstaEliminado);
            const isSelected = cellIdx === selectedIdx;
            const classes = [
              'sio-mx-cell',
              'sio-mx-cell-occupied',
              isWithdrawn ? 'sio-mx-cell-withdrawn' : 'sio-mx-cell-active',
              isSelected ? 'sio-mx-cell-selected' : ''
            ].filter(Boolean).join(' ');

            const coord = `${COLS[c]}${f}`;
            const titleText = isWithdrawn
              ? `Posición ${coord} (Sec. #${item.Secuencia}) — Retirada/Anulada (✗)${item.Motivo ? ': ' + item.Motivo : ''}`
              : `Posición ${coord} (Sec. #${item.Secuencia}) — Toque para seleccionar`;

            const recId = parseInt(item[idField], 10) || 0;
            tds +=
              `<td class="${classes}" ` +
              `data-cell-index="${cellIdx}" ` +
              `data-record-id="${recId}" ` +
              `data-secuencia="${escapeHtml(item.Secuencia)}" ` +
              `data-valor="${escapeHtml(isWithdrawn ? 'X' : String(item.Secuencia))}" ` +
              `data-motivo="${escapeHtml(item.Motivo || '')}" ` +
              `role="button" tabindex="0" aria-selected="${isSelected ? 'true' : 'false'}" ` +
              `title="${escapeHtml(titleText)}">` +
              `<span class="sio-mx-seq-val">${escapeHtml(item.Secuencia > 0 ? item.Secuencia : '')}</span>` +
              (isWithdrawn ? '<span class="sio-mx-x-overlay" aria-hidden="true">✗</span>' : '') +
              `</td>`;
          } else {
            tds += '<td class="sio-mx-cell sio-mx-cell-empty" aria-hidden="true">—</td>';
          }
        }
        rowsHtml.push(`<tr>${tds}</tr>`);
      }

      if (tbodyEl) {
        tbodyEl.innerHTML = rowsHtml.join('');
      }
      renderSelectionBar();
    }

    function addSequence() {
      const valStr = String(inputSecuenciaEl?.value || '').trim();
      const num = parseInt(valStr, 10);
      if (!valStr || !Number.isInteger(num) || num <= 0) {
        if (Validator && inputSecuenciaEl) Validator.markElementInvalid(inputSecuenciaEl);
        if (window.Swal) {
          Swal.fire({
            icon: 'warning',
            title: 'Secuencia inválida',
            text: 'Ingrese un número entero positivo de secuencia de equipaje.',
            confirmButtonColor: '#0F2744'
          });
        }
        inputSecuenciaEl?.focus();
        return false;
      }

      const idx = items.length;
      const newItem = {
        [idField]: 0,
        Casilla: idx + 1,
        Orden: idx + 1,
        Fila: Math.floor(idx / 10) + 1,
        Columna: COLS[idx % 10],
        Secuencia: num,
        Valor: String(num),
        Motivo: '',
        EstaEliminado: false
      };
      if (secondaryIdField) {
        newItem[secondaryIdField] = 0;
      }
      items.push(newItem);

      if (inputSecuenciaEl) {
        inputSecuenciaEl.value = '';
        inputSecuenciaEl.focus();
      }
      if (Validator && cardEl) {
        Validator.clearValidationErrors(cardEl);
      }

      render();
      notifyChange(true);
      return true;
    }

    function removeLast() {
      if (items.length === 0) return false;
      const removedIdx = items.length - 1;
      items.pop();
      if (selectedIdx === removedIdx || selectedIdx >= items.length) {
        selectedIdx = -1;
      }
      render();
      notifyChange(true);
      return true;
    }

    function selectCell(idx) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
        selectedIdx = -1;
      } else {
        selectedIdx = selectedIdx === idx ? -1 : idx;
      }
      render();
    }

    function clearSelection() {
      if (selectedIdx === -1) return;
      selectedIdx = -1;
      render();
    }

    async function persistSoftDeleteIfSaved(item) {
      const recId = parseInt(item?.[idField], 10) || 0;
      const encId = parseInt(encabezadoIdEl?.value || '0', 10) || 0;
      const itiId = parseInt(itinerarioIdEl?.value || '0', 10) || 0;
      const fmtId = String(formatoIdEl?.value || '').trim();
      const supportsDirectSoftDelete = family === 'eb' || family === 'cec';

      if (!supportsDirectSoftDelete || recId <= 0 || encId <= 0 || itiId <= 0) {
        return { attempted: false, ok: true };
      }

      const isOnline = window.SioOfflineManager && typeof window.SioOfflineManager.isOnline === 'function'
        ? window.SioOfflineManager.isOnline()
        : navigator.onLine !== false;

      if (!isOnline) {
        return { attempted: false, ok: true, deferredOffline: true };
      }

      try {
        const res = await fetch('/api/formatos/matriz/anular-secuencia', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            formatoId: fmtId,
            family,
            itinerarioId: itiId,
            encabezadoId: encId,
            detalleId: recId,
            secuencia: item.Secuencia,
            motivo: item.Motivo || ''
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          return {
            attempted: true,
            ok: false,
            message: json.message || 'No se pudo aplicar el retiro en Azure SQL.'
          };
        }
        return { attempted: true, ok: true, softDeleted: true };
      } catch (_err) {
        // Si falló la red justo en este momento, el retiro queda respaldado en IndexedDB
        return { attempted: true, ok: true, deferredOffline: true };
      }
    }

    async function withdrawSelected() {
      if (items.length === 0) {
        if (window.Swal) {
          await Swal.fire({
            icon: 'info',
            title: 'Matriz sin secuencias',
            text: 'Primero agregue al menos una secuencia de equipaje en la matriz.',
            confirmButtonColor: '#0F2744'
          });
        }
        return false;
      }

      if (selectedIdx < 0 || !items[selectedIdx]) {
        if (window.Swal) {
          await Swal.fire({
            icon: 'warning',
            title: 'Seleccione una maleta en la matriz',
            text: 'Toque o haga clic primero sobre la celda de la matriz que contiene la secuencia que desea retirar o anular.',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#0F2744'
          });
        }
        return false;
      }

      const target = items[selectedIdx];
      const coord = `${target.Columna}${target.Fila}`;
      const isAlreadyWithdrawn = String(target.Valor || '').toUpperCase() === 'X' || Boolean(target.EstaEliminado);

      if (isAlreadyWithdrawn) {
        if (window.Swal) {
          await Swal.fire({
            icon: 'info',
            title: 'Secuencia ya retirada (✗)',
            text: `La secuencia #${target.Secuencia} en la posición ${coord} ya fue marcada como retirada/anulada.`,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2744'
          });
        }
        return false;
      }

      let motivo = '';
      if (window.Swal) {
        const safeSec = escapeHtml(target.Secuencia);
        const safeCoord = escapeHtml(coord);
        const safeFila = escapeHtml(target.Fila);
        const safeCol = escapeHtml(target.Columna);
        const safePlaceholder = escapeHtml(motivoPlaceholder);
        const inputId = `swalMxMotivo_${family}`;

        const result = await Swal.fire({
          icon: 'warning',
          title: `Retirar / Anular ${itemLabel} (✗)`,
          html:
            `<div class="sio-swal-mx-body">` +
            `<div class="sio-swal-mx-summary">` +
            `<span><strong>Secuencia:</strong> #${safeSec}</span>` +
            `<span><strong>Posición:</strong> ${safeCoord} (Fila ${safeFila}, Col. ${safeCol})</span>` +
            `</div>` +
            `<label class="sio-swal-mx-label" for="${inputId}">Motivo del retiro / anulación ${requireMotivo ? '<span class="sio-required-star">*</span>' : '(Opcional)'}</label>` +
            `<input id="${inputId}" type="text" class="swal2-input sio-swal-mx-input" placeholder="${safePlaceholder}" maxlength="200">` +
            `</div>`,
          focusConfirm: false,
          showCancelButton: true,
          confirmButtonText: 'Sí, Retirar / Anular (✗)',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#DC2626',
          cancelButtonColor: '#64748B',
          didOpen: () => {
            const inp = document.getElementById(inputId);
            if (inp) inp.focus();
          },
          preConfirm: () => {
            const val = String(document.getElementById(inputId)?.value || '').trim();
            if (requireMotivo && !val) {
              Swal.showValidationMessage('Ingrese el motivo antes de retirar o anular la maleta.');
              return false;
            }
            return { motivo: val };
          }
        });

        if (!result.isConfirmed) {
          return false;
        }
        motivo = result.value?.motivo || '';
      }

      const prevState = { ...target };
      target.Valor = 'X';
      target.Motivo = motivo;
      target.EstaEliminado = true;

      const dbRes = await persistSoftDeleteIfSaved(target);
      if (dbRes && dbRes.attempted && !dbRes.ok) {
        // Revertir si el servidor rechazó (ej. Anti-IDOR o sesión expirada)
        Object.assign(target, prevState);
        if (window.Swal) {
          await Swal.fire({
            icon: 'error',
            title: 'No se pudo anular en servidor',
            text: dbRes.message || 'Ocurrió un error al actualizar la secuencia.',
            confirmButtonColor: '#DC2626'
          });
        }
        render();
        return false;
      }

      if (observacionesEl && motivo) {
        const nota = `[Anulada Sec. ${target.Secuencia} (${coord}): ${motivo}]`;
        const currentObs = String(observacionesEl.value || '').trim();
        if (!currentObs.includes(nota)) {
          observacionesEl.value = currentObs ? `${currentObs} | ${nota}` : nota;
          observacionesEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      selectedIdx = -1;
      render();
      notifyChange(true);

      if (window.Swal) {
        const suffix = dbRes && dbRes.softDeleted
          ? ' (Soft Delete aplicado en Azure SQL)'
          : '';
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Sec. #${target.Secuencia} (${coord}) marcada con ✗${suffix}`,
          showConfirmButton: false,
          timer: 2600,
          timerProgressBar: true
        });
      }

      return true;
    }

    // =========================================================================
    // Listeners CSP-Safe (Delegación de eventos, cero inline onclick)
    // =========================================================================
    if (btnAgregarEl) {
      btnAgregarEl.addEventListener('click', addSequence);
    }

    if (inputSecuenciaEl) {
      inputSecuenciaEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addSequence();
        }
      });
    }

    if (btnBorrarUltimoEl) {
      btnBorrarUltimoEl.addEventListener('click', removeLast);
    }

    if (btnRetirarEl) {
      btnRetirarEl.addEventListener('click', () => {
        withdrawSelected();
      });
    }

    if (tbodyEl) {
      tbodyEl.addEventListener('click', (e) => {
        const td = e.target.closest('td[data-cell-index]');
        if (!td) return;
        const idx = parseInt(td.getAttribute('data-cell-index'), 10);
        if (!Number.isInteger(idx)) return;
        selectCell(idx);
      });

      tbodyEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const td = e.target.closest('td[data-cell-index]');
        if (!td) return;
        e.preventDefault();
        const idx = parseInt(td.getAttribute('data-cell-index'), 10);
        if (!Number.isInteger(idx)) return;
        selectCell(idx);
      });
    }

    if (selectionBarEl) {
      selectionBarEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-mx-clear-selection]')) {
          clearSelection();
        }
      });
    }

    function getItems() {
      reindex();
      return items.map((it) => ({ ...it }));
    }

    function setItems(newList) {
      items = (Array.isArray(newList) ? newList : [])
        .map((raw, idx) => normalizeItem(raw, idx, idField))
        .filter(Boolean);
      selectedIdx = -1;
      render();
    }

    render();

    return {
      render,
      addSequence,
      removeLast,
      selectCell,
      clearSelection,
      withdrawSelected,
      getItems,
      setItems,
      getActiveCount,
      getSelectedIndex: () => selectedIdx,
      getSelectedItem: () => (selectedIdx >= 0 && items[selectedIdx] ? { ...items[selectedIdx] } : null)
    };
  }

  window.SioBaggageMatrix = {
    create,
    COLS
  };
})(window, document);
