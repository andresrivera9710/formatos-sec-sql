/**
 * SioBaggageMatrix — Módulo Reutilizable de Matrices de Equipajes (A..J x Filas)
 * SIO LAATS — Formatos SEC (AEROMEXICO, ARAJET, DELTA, AIR CANADA y futuros clientes)
 *
 * Estándar Corporativo LAATS:
 * - 100% compatible con Helmet CSP (cero estilos inline, cero manejadores onclick inline).
 * - Captura rápida continua en móvil y escritorio: soporta Enter, Tab, tecla móvil "Sig." /
 *   "Listo" / "Ir" (keydown/keypress + change/blur), limpia el campo y conserva el foco.
 * - Selección táctil limpia directamente sobre la celda ocupada (resaltado dorado #D4AF37
 *   sin banners ni badges extra arriba de la matriz para maximizar el espacio vertical móvil).
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
      const withdrawnMatch = str.match(/^X:(\d+)$/i);
      if (withdrawnMatch) {
        const wNum = parseInt(withdrawnMatch[1], 10) || 0;
        if (wNum <= 0) return null;
        return {
          [idField]: 0,
          Casilla: idx + 1,
          Fila: Math.floor(idx / 10) + 1,
          Columna: COLS[idx % 10],
          Secuencia: wNum,
          Valor: 'X',
          Motivo: '',
          motivoRetiro: '',
          anulado: true,
          EstaEliminado: true
        };
      }
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
        motivoRetiro: '',
        anulado: false,
        EstaEliminado: false
      };
    }

    const rawId = parseInt(
      raw[idField] ?? raw.DetalleControlEBId ?? raw.DetalleEBId ?? raw.DetalleCECDespId ?? raw.DetalleCECId ?? raw.EquipajePuertaCIECId ?? 0,
      10
    ) || 0;

    const rawValorStr = raw.Valor !== undefined && raw.Valor !== null ? String(raw.Valor).trim() : '';
    const isWithdrawn = rawValorStr.toUpperCase() === 'X' || Boolean(raw.EstaEliminado) || Boolean(raw.anulado);
    const secFromField = parseInt(raw.Secuencia, 10);
    const secFromValor = parseInt(rawValorStr, 10);
    const secuencia = Number.isInteger(secFromField) && secFromField > 0
      ? secFromField
      : (Number.isInteger(secFromValor) && secFromValor > 0 ? secFromValor : 0);

    if (secuencia <= 0 && !isWithdrawn) return null;

    const motivoClean = String(raw.Motivo || raw.motivoRetiro || '').trim();
    return {
      [idField]: rawId,
      Casilla: parseInt(raw.Casilla ?? raw.Orden, 10) || idx + 1,
      Fila: parseInt(raw.Fila, 10) || Math.floor(idx / 10) + 1,
      Columna: String(raw.Columna || COLS[idx % 10]).trim().toUpperCase(),
      Secuencia: secuencia,
      Valor: isWithdrawn ? 'X' : String(secuencia),
      Motivo: motivoClean,
      motivoRetiro: motivoClean,
      anulado: isWithdrawn,
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
    const initialBaselineItems = items.map((it) => ({ ...it }));

    let selectedIdx = -1;
    let lastPointerTarget = null;
    let lastPointerTimestamp = 0;
    let lastInputScroll = { x: window.scrollX, y: window.scrollY };

    if (tableEl) {
      tableEl.classList.add('sio-baggage-matrix-table');
    }

    // Garantizar atributos táctiles óptimos en el input de secuencia para teclado móvil
    if (inputSecuenciaEl) {
      inputSecuenciaEl.setAttribute('inputmode', 'numeric');
      inputSecuenciaEl.setAttribute('enterkeyhint', 'done');
      inputSecuenciaEl.setAttribute('autocomplete', 'off');
    }

    function restoreScrollInstant(sx, sy) {
      try {
        window.scrollTo({ left: sx, top: sy, behavior: 'instant' });
      } catch (_) {
        window.scrollTo(sx, sy);
      }
    }

    function lockScrollAt(sx, sy) {
      if (Validator && typeof Validator.lockScrollPosition === 'function') {
        Validator.lockScrollPosition(sx, sy);
        return;
      }
      restoreScrollInstant(sx, sy);
      window.requestAnimationFrame(() => restoreScrollInstant(sx, sy));
      window.setTimeout(() => restoreScrollInstant(sx, sy), 0);
      window.setTimeout(() => restoreScrollInstant(sx, sy), 50);
    }

    function preserveScroll(fn, lockedScroll = null) {
      const sx = lockedScroll && typeof lockedScroll.x === 'number' ? lockedScroll.x : window.scrollX;
      const sy = lockedScroll && typeof lockedScroll.y === 'number' ? lockedScroll.y : window.scrollY;
      const out = fn();
      lockScrollAt(sx, sy);
      return out;
    }

    function refocusInput(lockedScroll = null) {
      if (!inputSecuenciaEl) return;
      const sx = lockedScroll && typeof lockedScroll.x === 'number' ? lockedScroll.x : window.scrollX;
      const sy = lockedScroll && typeof lockedScroll.y === 'number' ? lockedScroll.y : window.scrollY;
      const doFocus = () => {
        try {
          inputSecuenciaEl.focus({ preventScroll: true });
        } catch (_) {
          inputSecuenciaEl.focus();
        }
        restoreScrollInstant(sx, sy);
      };
      doFocus();
      window.requestAnimationFrame(doFocus);
      window.setTimeout(doFocus, 0);
      window.setTimeout(doFocus, 45);
    }

    function reindex() {
      items.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        item.Casilla = idx + 1;
        item.Orden = idx + 1;
        item.Fila = Math.floor(idx / 10) + 1;
        item.Columna = COLS[idx % 10];
        if (secondaryIdField) {
          item[secondaryIdField] = item[idField] || 0;
        }
      });
      if (selectedIdx >= items.length) {
        selectedIdx = -1;
      }
    }

    function getActiveCount() {
      return items.filter((it) => it && it.Secuencia > 0 && String(it.Valor || '').toUpperCase() !== 'X' && !it.EstaEliminado && !it.anulado).length;
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
          window.SioOfflineManager.saveCurrentDraft().catch(() => { });
        }
      }
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
            const isWithdrawn = String(item.Valor || '').toUpperCase() === 'X' || Boolean(item.EstaEliminado) || Boolean(item.anulado);
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
              `data-anulado="${isWithdrawn ? 'true' : 'false'}" ` +
              `data-motivo="${escapeHtml(item.Motivo || item.motivoRetiro || '')}" ` +
              `role="button" tabindex="0" aria-selected="${isSelected ? 'true' : 'false'}" ` +
              `aria-label="${escapeHtml(titleText)}" ` +
              `title="${escapeHtml(titleText)}">` +
              `<div class="sio-mx-cell-inner">` +
              `<span class="sio-mx-seq-val">${escapeHtml(item.Secuencia > 0 ? item.Secuencia : '')}</span>` +
              (isWithdrawn ? '<span class="sio-mx-x-overlay" aria-hidden="true">✗</span>' : '') +
              `</div>` +
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
    }

    function addSequence(addOpts = {}) {
      const shouldRefocus = addOpts.refocus !== false;
      const silentEmpty = Boolean(addOpts.silentEmpty);
      const lockedScroll = addOpts.lockedScroll || { x: window.scrollX, y: window.scrollY };
      const valStr = String(inputSecuenciaEl?.value || '').trim();

      if (!valStr && silentEmpty) {
        return false;
      }

      const num = parseInt(valStr, 10);
      if (!valStr || !Number.isInteger(num) || num <= 0) {
        if (Validator && inputSecuenciaEl) Validator.markElementInvalid(inputSecuenciaEl);
        if (window.Swal) {
          Swal.fire({
            icon: 'warning',
            title: 'Secuencia inválida',
            text: 'Ingrese un número entero positivo de secuencia de equipaje.',
            confirmButtonColor: '#0F2744',
            returnFocus: false
          });
        }
        if (shouldRefocus) refocusInput(lockedScroll);
        return false;
      }

      preserveScroll(() => {
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
          motivoRetiro: '',
          anulado: false,
          EstaEliminado: false
        };
        if (secondaryIdField) {
          newItem[secondaryIdField] = 0;
        }
        items.push(newItem);

        if (inputSecuenciaEl) {
          inputSecuenciaEl.value = '';
        }
        if (Validator && cardEl) {
          Validator.clearValidationErrors(cardEl);
        }

        render();
        notifyChange(true);
        if (shouldRefocus) {
          refocusInput(lockedScroll);
        }
      }, lockedScroll);
      return true;
    }

    function removeLast() {
      if (items.length === 0) return false;
      preserveScroll(() => {
        const removedIdx = items.length - 1;
        items.pop();
        if (selectedIdx === removedIdx || selectedIdx >= items.length) {
          selectedIdx = -1;
        }
        render();
        notifyChange(true);
      });
      return true;
    }

    function selectCell(idx) {
      preserveScroll(() => {
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
          selectedIdx = -1;
        } else {
          selectedIdx = selectedIdx === idx ? -1 : idx;
        }
        render();
      });
    }

    function clearSelection() {
      if (selectedIdx === -1) return;
      preserveScroll(() => {
        selectedIdx = -1;
        render();
      });
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

      const targetIdx = selectedIdx;
      const initialTarget = items[targetIdx];
      const coord = `${initialTarget.Columna}${initialTarget.Fila}`;
      const isAlreadyWithdrawn = String(initialTarget.Valor || '').toUpperCase() === 'X' || Boolean(initialTarget.EstaEliminado) || Boolean(initialTarget.anulado);

      if (isAlreadyWithdrawn) {
        if (window.Swal) {
          await Swal.fire({
            icon: 'info',
            title: 'Secuencia ya retirada (✗)',
            text: `La secuencia #${initialTarget.Secuencia} en la posición ${coord} ya fue marcada como retirada/anulada.`,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2744'
          });
        }
        return false;
      }

      const savedScrollX = window.scrollX;
      const savedScrollY = window.scrollY;

      let motivo = '';
      if (window.Swal) {
        const safeSec = escapeHtml(initialTarget.Secuencia);
        const safeCoord = escapeHtml(coord);
        const safeFila = escapeHtml(initialTarget.Fila);
        const safeCol = escapeHtml(initialTarget.Columna);
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
          returnFocus: false,
          showCancelButton: true,
          confirmButtonText: 'Sí, Retirar / Anular (✗)',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#DC2626',
          cancelButtonColor: '#64748B',
          didOpen: () => {
            const inp = document.getElementById(inputId);
            if (inp) {
              try {
                inp.focus({ preventScroll: true });
              } catch (_) {
                inp.focus();
              }
            }
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

        window.scrollTo(savedScrollX, savedScrollY);

        if (!result.isConfirmed) {
          return false;
        }
        motivo = result.value?.motivo || '';
      }

      const target = items[targetIdx];
      if (!target) return false;
      const prevState = { ...target };
      const originalSecuencia = target.Secuencia;
      target.Secuencia = originalSecuencia;
      target.Valor = 'X';
      target.Motivo = motivo;
      target.motivoRetiro = motivo;
      target.anulado = true;
      target.EstaEliminado = true;

      const dbRes = await persistSoftDeleteIfSaved(target);
      const currentTarget = items[targetIdx] || target;
      if (dbRes && dbRes.attempted && !dbRes.ok) {
        Object.assign(currentTarget, prevState);
        if (window.Swal) {
          await Swal.fire({
            icon: 'error',
            title: 'No se pudo anular en servidor',
            text: dbRes.message || 'Ocurrió un error al actualizar la secuencia.',
            confirmButtonColor: '#DC2626',
            returnFocus: false
          });
        }
        render();
        window.scrollTo(savedScrollX, savedScrollY);
        return false;
      }

      if (observacionesEl) {
        const baseTag = `Anulada Sec. ${currentTarget.Secuencia} (${coord})`;
        const nota = motivo ? `[${baseTag}: ${motivo}]` : `[${baseTag}]`;
        const currentObs = String(observacionesEl.value || '').trim();
        if (!currentObs.includes(baseTag)) {
          observacionesEl.value = currentObs ? `${currentObs} | ${nota}` : nota;
          observacionesEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      selectedIdx = -1;
      render();
      notifyChange(true);
      window.scrollTo(savedScrollX, savedScrollY);
      window.requestAnimationFrame(() => window.scrollTo(savedScrollX, savedScrollY));

      if (window.Swal) {
        const suffix = dbRes && dbRes.softDeleted
          ? ' (Soft Delete aplicado en Azure SQL)'
          : '';
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Sec. #${currentTarget.Secuencia} (${coord}) marcada con ✗${suffix}`,
          showConfirmButton: false,
          timer: 2600,
          timerProgressBar: true
        });
      }

      return true;
    }

    // =========================================================================
    // Listeners CSP-Safe (Delegación de eventos + Soporte total Teclado Móvil Sig./Enter)
    // =========================================================================
    document.addEventListener('pointerdown', (e) => {
      lastPointerTarget = e.target;
      lastPointerTimestamp = Date.now();
    }, true);

    function wasRecentPointerOn(el) {
      if (!el || !lastPointerTarget) return false;
      if (Date.now() - lastPointerTimestamp > 400) return false;
      return lastPointerTarget === el || (typeof el.contains === 'function' && el.contains(lastPointerTarget));
    }

    function hadRecentPointerAnywhere() {
      return Boolean(lastPointerTarget) && (Date.now() - lastPointerTimestamp <= 400);
    }

    if (btnAgregarEl) {
      btnAgregarEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addSequence({ refocus: true, lockedScroll: { x: window.scrollX, y: window.scrollY } });
      });
    }

    if (inputSecuenciaEl) {
      const recordInputScroll = () => {
        lastInputScroll = { x: window.scrollX, y: window.scrollY };
      };
      inputSecuenciaEl.addEventListener('focus', recordInputScroll);
      inputSecuenciaEl.addEventListener('input', recordInputScroll);
      window.addEventListener('scroll', () => {
        if (document.activeElement === inputSecuenciaEl) {
          recordInputScroll();
        }
      }, { passive: true });

      const handleKeyCommit = (e) => {
        const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
        const isNextOrTab = e.key === 'Tab' || e.key === 'Next' || e.key === 'Go' || e.keyCode === 9;
        const rawVal = String(inputSecuenciaEl.value || '').trim();

        if (isEnter) {
          if (e.isComposing || e.keyCode === 229) return;
          const lockedScroll = { x: window.scrollX, y: window.scrollY };
          lastInputScroll = lockedScroll;
          e.preventDefault();
          e.stopPropagation();
          addSequence({ refocus: true, lockedScroll });
          return;
        }
        if (isNextOrTab && rawVal !== '') {
          const lockedScroll = { x: window.scrollX, y: window.scrollY };
          lastInputScroll = lockedScroll;
          e.preventDefault();
          e.stopPropagation();
          addSequence({ refocus: true, lockedScroll });
        }
      };

      inputSecuenciaEl.addEventListener('keydown', handleKeyCommit);
      inputSecuenciaEl.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
          const lockedScroll = { x: window.scrollX, y: window.scrollY };
          lastInputScroll = lockedScroll;
          e.preventDefault();
          e.stopPropagation();
          addSequence({ refocus: true, lockedScroll });
        }
      });
      inputSecuenciaEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          const lockedScroll = { x: window.scrollX, y: window.scrollY };
          e.preventDefault();
          e.stopPropagation();
          if (String(inputSecuenciaEl.value || '').trim() !== '') {
            addSequence({ refocus: true, lockedScroll });
          }
        }
      });

      // Captura real de tecla "Sig." en Android (Gboard / Samsung) e iOS Safari:
      // Cuando "Sig." desplaza el foco sin disparar Enter, dispara change/blur.
      const handleMobileNextCommit = () => {
        const rawVal = String(inputSecuenciaEl.value || '').trim();
        if (!rawVal) return;

        // Si el usuario tocó el botón "Agregar Maleta", dejar que su click lo procese una sola vez
        if (wasRecentPointerOn(btnAgregarEl)) {
          return;
        }

        // Si no hubo toque manual reciente en otro elemento, fue la tecla "Sig." del teclado móvil -> mantener foco y posición exacta
        const triggeredByKeyboardNext = !hadRecentPointerAnywhere() || wasRecentPointerOn(inputSecuenciaEl);
        const lockedScroll = triggeredByKeyboardNext
          ? { x: lastInputScroll.x, y: lastInputScroll.y }
          : { x: window.scrollX, y: window.scrollY };
        addSequence({ refocus: triggeredByKeyboardNext, silentEmpty: true, lockedScroll });
      };

      inputSecuenciaEl.addEventListener('change', handleMobileNextCommit);
      inputSecuenciaEl.addEventListener('blur', handleMobileNextCommit);
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

    function getItems() {
      reindex();
      return items.map((it) => ({ ...it }));
    }

    function setItems(newList, setOpts = {}) {
      items = (Array.isArray(newList) ? newList : [])
        .map((raw, idx) => normalizeItem(raw, idx, idField))
        .filter(Boolean);
      selectedIdx = -1;
      render();
      if (onChange && !setOpts.silent) {
        try {
          onChange(getItems(), getActiveCount());
        } catch (err) {
          console.warn('[SioBaggageMatrix setItems onChange WARN]', err);
        }
      }
    }

    render();

    // Registro transversal automático con SioOfflineManager para captura,
    // restauración profunda en sitio ("Continuar donde lo dejé") y reinicio limpio
    // ("Empezar uno de nuevo") en todos los formatos con matriz actuales y futuros.
    const matrixAdapterKey = `matrix:${family}:${tbodyEl?.id || 'default'}`;
    if (window.SioOfflineManager && typeof window.SioOfflineManager.registerStateAdapter === 'function') {
      window.SioOfflineManager.registerStateAdapter(matrixAdapterKey, {
        kind: 'matrix',
        family,
        capture: () => getItems(),
        restore: (savedItems) => {
          setItems(Array.isArray(savedItems) ? savedItems : []);
        },
        reset: () => {
          setItems(initialBaselineItems.map((it) => ({ ...it })), { silent: true });
        },
        legacyPatchKey: family === 'ciec' ? 'equipajePuerta' : 'detalles'
      });
    }

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
