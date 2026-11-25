/**
 * Controlador Frontend — Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (Rayos X)
 * Componente de referencia: ControlEquipajeAVSECAMX (AEROMEXICO)
 * 100% compatible con Helmet CSP (sin scripts ni eventos inline) y protección anti-XSS.
 */
(function () {
  'use strict';

  let _state = null;
  let _erRows = [];
  let _nextUid = 1;
  let _firmaPad = null;

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function obtenerHoraActualHHMM() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function normalizarHora5(val) {
    if (!val) return '';
    const str = String(val).trim();
    const match = str.match(/([01]\d|2[0-3]):([0-5]\d)/);
    return match ? `${match[1]}:${match[2]}` : str;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const rawJsonEl = document.getElementById('erInitialStateJson');
    if (!rawJsonEl) return;

    try {
      _state = JSON.parse(rawJsonEl.textContent || '{}');
    } catch (err) {
      console.error('[ER INIT PARSE ERROR]', err);
      _state = {};
    }

    // Hidratar filas iniciales desde Azure SQL (si existen)
    const isAmxInit = String(_state.formatoId || '').trim().toLowerCase() === 'amx-er' || Boolean(_state.isAmxER);
    const lockedAgenteInit = String(_state.agenteSeguridadInspeccion || _state.agenteActual || '').trim();

    const normalizeErRows = (list) => (Array.isArray(list) ? list : []).map((d) => ({
      uid: _nextUid++,
      DetalleControlERId: parseInt(d.DetalleControlERId, 10) || 0,
      Pasajero: String(d.Pasajero || '').trim(),
      Secuencia: d.Secuencia !== null && d.Secuencia !== undefined ? String(d.Secuencia).trim() : '',
      Colilla: d.Colilla !== null && d.Colilla !== undefined ? String(d.Colilla).trim() : '',
      Vuelo: String(_state.noVuelo || d.Vuelo || '').trim(),
      Destino: String(d.Destino || _state.destinoVuelo || '').trim(),
      HoraRevision: normalizarHora5(d.HoraRevision),
      AgenteAVSEC: String(d.AgenteAVSEC || '').trim(),
      AgenteSeguridad: isAmxInit
        ? String(d.AgenteSeguridad || lockedAgenteInit || '').trim()
        : String(d.AgenteSeguridad || _state.agenteActual || '').trim()
    }));

    const initialDetalles = Array.isArray(_state.detalles) ? _state.detalles : [];
    _erRows = normalizeErRows(initialDetalles);
    const initialRowsBaseline = _erRows.map((r) => ({ ...r }));

    // Inicializar Canvas de Firma Digital
    const canvasEl = document.getElementById('erCanvasFirma');
    const sigBox = document.getElementById('erSignatureBox');
    if (canvasEl && typeof window.SioSignaturePad === 'function') {
      _firmaPad = new window.SioSignaturePad(canvasEl);
      const clearSigInvalid = () => {
        if (sigBox) {
          sigBox.classList.remove('is-invalid', 'sio-field-invalid');
        }
      };
      canvasEl.addEventListener('mousedown', clearSigInvalid);
      canvasEl.addEventListener('touchstart', clearSigInvalid, { passive: true });
    }

    const btnLimpiarFirma = document.getElementById('btnLimpiarFirmaER');
    if (btnLimpiarFirma && _firmaPad) {
      btnLimpiarFirma.addEventListener('click', () => {
        _firmaPad.clear();
      });
    }

    // Reloj en panel de captura rápida ("Ingrese los Datos")
    const btnRelojHora = document.getElementById('btnRelojHoraER');
    const inputHoraRev = document.getElementById('erInputHoraRevision');
    if (btnRelojHora && inputHoraRev) {
      btnRelojHora.addEventListener('click', () => {
        inputHoraRev.value = obtenerHoraActualHHMM();
        inputHoraRev.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    // Bloqueo estricto en cliente de la Fecha del Itinerario (#erFecha) y NoVuelo (#erNoVuelo)
    const fechaHeaderEl = document.getElementById('erFecha');
    if (fechaHeaderEl && _state.fecha) {
      fechaHeaderEl.value = _state.fecha;
      fechaHeaderEl.setAttribute('readonly', 'readonly');
      fechaHeaderEl.setAttribute('disabled', 'disabled');
      fechaHeaderEl.addEventListener('change', () => {
        fechaHeaderEl.value = _state.fecha;
      });
    }

    // Bloqueo estricto de "Agente de seguridad AMX durante la inspección" (#erInputAgenteSeguridad) en amx-er
    const inputAgenteSegEl = document.getElementById('erInputAgenteSeguridad');
    if (inputAgenteSegEl && isAmxERFormat()) {
      const enforceLockedAgente = () => {
        const fixedVal = getLockedAgenteSeguridad();
        if (fixedVal && inputAgenteSegEl.value !== fixedVal) {
          inputAgenteSegEl.value = fixedVal;
        }
      };
      inputAgenteSegEl.classList.add('input-locked', 'er-cell-readonly');
      inputAgenteSegEl.setAttribute('readonly', 'readonly');
      inputAgenteSegEl.setAttribute('tabindex', '-1');
      inputAgenteSegEl.setAttribute('aria-readonly', 'true');
      enforceLockedAgente();
      inputAgenteSegEl.addEventListener('input', enforceLockedAgente);
      inputAgenteSegEl.addEventListener('change', enforceLockedAgente);
      inputAgenteSegEl.addEventListener('paste', (e) => {
        e.preventDefault();
        enforceLockedAgente();
      });
    }

    // Botón: Agregar equipaje desde el panel "Ingrese los Datos:" (btnAgregarAMatriz_1)
    const btnAgregarEquipaje = document.getElementById('btnAgregarEquipajeER');
    if (btnAgregarEquipaje) {
      btnAgregarEquipaje.addEventListener('click', agregarDesdePanelCaptura);
    }

    const erLastCaptureEls = [
      document.getElementById('erInputAgenteAVSEC'),
      document.getElementById('erInputAgenteSeguridad')
    ].filter(Boolean);
    erLastCaptureEls.forEach((inpEl) => {
      inpEl.addEventListener('keydown', (e) => {
        const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
        if (!isEnter) return;
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        agregarDesdePanelCaptura();
      });
    });

    // Botón: Ver Datos Agregados (lblVerDatos_1 + icoVerDatosAgregados_1)
    const btnVerDatos = document.getElementById('btnVerDatosAgregadosER');
    if (btnVerDatos) {
      btnVerDatos.addEventListener('click', (e) => {
        e.preventDefault();
        const card = document.getElementById('erCardCuadricula');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        const searchEl = document.getElementById('erBuscarPasajero');
        if (searchEl && _erRows.length > 0) {
          setTimeout(() => {
            try { searchEl.focus({ preventScroll: true }); } catch (_e) {}
          }, 300);
        }
      });
    }

    // Buscador en vivo de la cuadrícula (txtBuscadorCP_6 + Icon4_13)
    const inputBuscar = document.getElementById('erBuscarPasajero');
    if (inputBuscar) {
      inputBuscar.addEventListener('input', () => {
        filtrarFilasDOM(inputBuscar.value);
      });
    }

    const btnLimpiarBusqueda = document.getElementById('btnLimpiarBusquedaER');
    if (btnLimpiarBusqueda && inputBuscar) {
      btnLimpiarBusqueda.addEventListener('click', () => {
        inputBuscar.value = '';
        filtrarFilasDOM('');
        inputBuscar.focus();
      });
    }

    // Delegación de eventos en la cuadrícula fluida (#erTbodyRegistros)
    const tbody = document.getElementById('erTbodyRegistros');
    if (tbody) {
      tbody.addEventListener('input', onGridInputChange);
      tbody.addEventListener('change', onGridInputChange);
      tbody.addEventListener('click', onGridButtonClick);
    }

    // Botones de acción: Vista Preliminar y Guardar Definitivo
    const btnPreview = document.getElementById('btnVistaPreliminarER');
    if (btnPreview) {
      btnPreview.addEventListener('click', () => ejecutarGuardadoER(false));
    }

    const btnGuardar = document.getElementById('btnGuardarDefinitivoER');
    if (btnGuardar) {
      btnGuardar.addEventListener('click', () => ejecutarGuardadoER(true));
    }

    renderizarCuadricula();

    window.SioOfflineManager?.registerStateAdapter?.('format:er', {
      capture: () => ({
        detalles: _erRows.map(({ uid: _uid, ...rest }) => ({ ...rest }))
      }),
      restore: (saved) => {
        const list = Array.isArray(saved) ? saved : (Array.isArray(saved?.detalles) ? saved.detalles : null);
        if (!list) return;
        _erRows = normalizeErRows(list);
        renderizarCuadricula();
      },
      reset: () => {
        _erRows = normalizeErRows(initialRowsBaseline);
        renderizarCuadricula();
      },
      mapLegacyPatch: (patch) => (Array.isArray(patch?.detalles) ? { detalles: patch.detalles } : undefined)
    });
  });

  /**
   * Renderiza todas las filas activas en la cuadrícula fluida (#erTbodyRegistros)
   */
  function isDeltaERFormat() {
    const id = (_state && _state.formatoId) || document.getElementById('erFormatoId')?.value || '';
    return String(id).trim().toLowerCase() === 'dl-er';
  }

  function isAmxERFormat() {
    const id = (_state && _state.formatoId) || document.getElementById('erFormatoId')?.value || '';
    return String(id).trim().toLowerCase() === 'amx-er' || Boolean(_state && _state.isAmxER);
  }

  function getLockedAgenteSeguridad() {
    return String((_state && (_state.agenteSeguridadInspeccion || _state.agenteActual)) || '').trim();
  }

  function renderizarCuadricula() {
    const tbody = document.getElementById('erTbodyRegistros');
    const recuentoEl = document.getElementById('erRecuentoTotal');
    const verDatosCountEl = document.getElementById('erVerDatosCount');
    const gridWrapper = document.getElementById('erGridWrapper');
    const isDeltaER = isDeltaERFormat();
    const sigla = escapeHtml(_state?.siglaAgenteSeguridad || 'AMX');

    if (recuentoEl) {
      recuentoEl.textContent = String(_erRows.length);
    }
    if (verDatosCountEl) {
      verDatosCountEl.textContent = String(_erRows.length);
    }
    if (gridWrapper) {
      gridWrapper.classList.remove('sio-grid-invalid');
    }

    if (!tbody) return;

    if (_erRows.length === 0) {
      tbody.innerHTML = `
        <tr class="er-empty-row">
          <td colspan="${isDeltaER ? 9 : 10}" class="er-empty-cell">
            <div class="cp-empty-dashed er-empty-card">
              <i class="fas fa-luggage-cart fa-2x er-empty-icon"></i>
              <div class="er-empty-title">No hay registros agregados aún</div>
              <div class="er-empty-hint">
                Complete los campos en <strong>"Ingrese los Datos:"</strong> y presione el botón <strong>"Agregar"</strong>.
              </div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = _erRows.map((r, idx) => {
      const num = idx + 1;
      const persistedBadge = r.DetalleControlERId > 0
        ? `<span class="er-persisted-dot" title="Sincronizado en SQL (#${escapeHtml(r.DetalleControlERId)})"></span>`
        : '';
      const secTdHtml = isDeltaER
        ? ''
        : `<td class="er-td-secuencia" data-label="Secuencia *">
            <input
              type="number"
              class="form-control er-cell-input er-cell-center"
              data-field="Secuencia"
              min="1"
              step="1"
              inputmode="numeric"
              placeholder="Sec. *"
              value="${escapeHtml(r.Secuencia)}"
              aria-label="Fila ${num} Secuencia"
            >
          </td>`;

      return `
        <tr data-row-index="${idx}" data-uid="${r.uid}" class="er-grid-row">
          <td class="er-td-num" data-label="No.">
            <div class="er-num-badge">
              ${persistedBadge}
              <span class="er-num-text"><span class="er-mobile-prefix">Pasajero #</span><span class="er-row-number">${num}</span></span>
            </div>
          </td>
          <td class="er-td-pasajero" data-label="Nombre del Pasajero *">
            <input
              type="text"
              class="form-control er-cell-input"
              data-field="Pasajero"
              maxlength="200"
              placeholder="Nombre del pasajero *"
              value="${escapeHtml(r.Pasajero)}"
              aria-label="Fila ${num} Nombre del Pasajero"
            >
          </td>
          ${secTdHtml}
          <td class="er-td-colilla" data-label="Colilla *">
            <input
              type="number"
              class="form-control er-cell-input er-cell-center"
              data-field="Colilla"
              min="1"
              step="1"
              inputmode="numeric"
              placeholder="Colilla *"
              value="${escapeHtml(r.Colilla)}"
              aria-label="Fila ${num} No. de Colilla"
            >
          </td>
          <td class="er-td-vuelo" data-label="No. Vuelo">
            <input
              type="text"
              class="form-control er-cell-input er-cell-center er-cell-readonly"
              data-field="Vuelo"
              value="${escapeHtml(r.Vuelo || _state.noVuelo || '')}"
              readonly
              tabindex="-1"
              aria-label="Fila ${num} Vuelo"
            >
          </td>
          <td class="er-td-destino" data-label="Destino">
            <input
              type="text"
              class="form-control er-cell-input er-cell-center"
              data-field="Destino"
              maxlength="100"
              placeholder="${escapeHtml(_state.destinoVuelo || 'N/A')}"
              value="${escapeHtml(r.Destino)}"
              aria-label="Fila ${num} Destino"
            >
          </td>
          <td class="er-td-hora" data-label="Hora de Revisión *">
            <div class="er-cell-time-group">
              <input
                type="time"
                class="form-control er-cell-input er-cell-center"
                data-field="HoraRevision"
                value="${escapeHtml(r.HoraRevision)}"
                aria-label="Fila ${num} Hora de Revisión"
              >
              <button
                type="button"
                class="cp-icon-btn clock btn-er-row-clock"
                data-uid="${r.uid}"
                title="Capturar hora actual (HH:mm)"
              >
                <i class="far fa-clock"></i>
              </button>
            </div>
          </td>
          <td class="er-td-avsec" data-label="Agente AVSEC *">
            <input
              type="text"
              class="form-control er-cell-input"
              data-field="AgenteAVSEC"
              maxlength="150"
              placeholder="Agente AVSEC *"
              value="${escapeHtml(r.AgenteAVSEC)}"
              aria-label="Fila ${num} Nombre Agente AVSEC"
            >
          </td>
          <td class="er-td-seguridad" data-label="Agente ${sigla}${isAmxERFormat() ? '' : ' *'}">
            <input
              type="text"
              class="form-control er-cell-input ${isAmxERFormat() ? 'input-locked er-cell-readonly' : ''}"
              data-field="AgenteSeguridad"
              maxlength="150"
              placeholder="Agente Seguridad ${sigla}"
              value="${escapeHtml(isAmxERFormat() ? (r.AgenteSeguridad || getLockedAgenteSeguridad()) : r.AgenteSeguridad)}"
              ${isAmxERFormat() ? 'readonly tabindex="-1" aria-readonly="true"' : ''}
              aria-label="Fila ${num} Agente de Seguridad"
            >
          </td>
          <td class="er-td-accion" data-label="Acción">
            <button
              type="button"
              class="cp-icon-btn trash btn-er-row-delete"
              data-uid="${r.uid}"
              title="Retirar fila de la cuadrícula (Soft Delete al guardar)"
            >
              <i class="fas fa-trash-alt"></i>
              <span class="er-mobile-action-label">Retirar</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Reaplicar filtro de búsqueda si estaba activo
    const inputBuscar = document.getElementById('erBuscarPasajero');
    if (inputBuscar && inputBuscar.value.trim() !== '') {
      filtrarFilasDOM(inputBuscar.value);
    }
  }

  /**
   * Sincroniza cambios de inputs inline dentro de la cuadrícula con el modelo _erRows
   */
  function onGridInputChange(e) {
    const input = e.target.closest('.er-cell-input[data-field]');
    if (!input) return;

    const rowEl = input.closest('tr[data-uid]');
    if (!rowEl) return;

    const uid = parseInt(rowEl.dataset.uid, 10);
    const field = input.dataset.field;
    const rowObj = _erRows.find(r => r.uid === uid);
    if (!rowObj || !field) return;

    if (field === 'AgenteSeguridad' && isAmxERFormat()) {
      const lockedVal = rowObj.AgenteSeguridad || getLockedAgenteSeguridad();
      input.value = lockedVal;
      rowObj.AgenteSeguridad = lockedVal;
      return;
    }

    rowObj[field] = input.value;
  }

  /**
   * Maneja botones de reloj y eliminación (Soft Delete) en cada fila de la cuadrícula
   */
  function onGridButtonClick(e) {
    const clockBtn = e.target.closest('.btn-er-row-clock');
    if (clockBtn) {
      const uid = parseInt(clockBtn.dataset.uid, 10);
      const rowObj = _erRows.find(r => r.uid === uid);
      const rowEl = clockBtn.closest('tr[data-uid]');
      const timeInput = rowEl ? rowEl.querySelector('[data-field="HoraRevision"]') : null;
      const nowStr = obtenerHoraActualHHMM();

      if (rowObj) rowObj.HoraRevision = nowStr;
      if (timeInput) {
        timeInput.value = nowStr;
        timeInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    const delBtn = e.target.closest('.btn-er-row-delete');
    if (delBtn) {
      const uid = parseInt(delBtn.dataset.uid, 10);
      eliminarFilaCuadricula(uid);
    }
  }

  /**
   * Valida y agrega un registro desde el panel superior "Ingrese los Datos"
   */
  function agregarDesdePanelCaptura() {
    const elPasajero = document.getElementById('erInputPasajero');
    const elSecuencia = document.getElementById('erInputSecuencia');
    const elColilla = document.getElementById('erInputColilla');
    const elDestino = document.getElementById('erInputDestino');
    const elHora = document.getElementById('erInputHoraRevision');
    const elAvsec = document.getElementById('erInputAgenteAVSEC');
    const elSeguridad = document.getElementById('erInputAgenteSeguridad');

    const validator = window.SioFormatValidator;
    const isDeltaER = isDeltaERFormat();
    const isAmxER = isAmxERFormat();
    const lockedAgenteVal = getLockedAgenteSeguridad();
    if (isAmxER && elSeguridad && lockedAgenteVal) {
      elSeguridad.value = lockedAgenteVal;
    }
    const quickRules = [
      { field: 'Pasajero', label: 'Nombre del Pasajero', el: elPasajero, required: true, type: 'string', maxLength: 200 },
      ...(isDeltaER ? [] : [{ field: 'Secuencia', label: 'Secuencia', el: elSecuencia, required: true, type: 'integer', min: 1 }]),
      { field: 'Colilla', label: 'No. de Colilla / Marbete', el: elColilla, required: true, type: 'integer', min: 1 },
      { field: 'Destino', label: 'Destino', el: elDestino, required: false, type: 'string', maxLength: 100 },
      { field: 'HoraRevision', label: 'Hora de Revisión', el: elHora, required: true, type: 'time' },
      { field: 'AgenteAVSEC', label: 'Nombre Agente AVSEC que realiza inspección', el: elAvsec, required: true, type: 'string', maxLength: 150 },
      { field: 'AgenteSeguridad', label: `Agente de Seguridad ${_state?.siglaAgenteSeguridad || 'AMX'}`, el: elSeguridad, required: true, type: 'string', maxLength: 150 }
    ];

    const panelErrors = [];
    quickRules.forEach((rule) => {
      if (rule.el) {
        rule.el.classList.remove('is-invalid', 'sio-field-invalid');
      }
      const val = rule.el ? rule.el.value : '';
      const check = validator.validateSingleValue(val, rule);
      if (!check.valid) {
        validator.markElementInvalid(rule.el, null);
        panelErrors.push({
          scope: 'header',
          row: null,
          field: rule.field,
          label: rule.label,
          reason: check.reason,
          message: `${rule.label}: ${check.reason}`,
          element: rule.el
        });
      }
    });

    if (panelErrors.length > 0) {
      validator.notifyValidationErrors(panelErrors, 'Datos del Equipaje Incompletos');
      return;
    }

    _erRows.push({
      uid: _nextUid++,
      DetalleControlERId: 0,
      Pasajero: String(elPasajero.value || '').trim(),
      Secuencia: isDeltaER ? String(_erRows.length + 1) : String(elSecuencia?.value || '').trim(),
      Colilla: String(elColilla.value || '').trim(),
      Vuelo: String(_state.noVuelo || '').trim(),
      Destino: String(elDestino?.value || '').trim(),
      HoraRevision: normalizarHora5(elHora.value),
      AgenteAVSEC: String(elAvsec.value || '').trim(),
      AgenteSeguridad: isAmxER ? lockedAgenteVal : String(elSeguridad?.value || '').trim()
    });

    const commitErRow = () => {
      // 4. Limpiamos los campos igual que en Power Apps (conservando bloqueado el Agente en sesión para amx-er)
      elPasajero.value = '';
      if (elSecuencia) elSecuencia.value = '';
      elColilla.value = '';
      if (elDestino) elDestino.value = '';
      elHora.value = '';
      elAvsec.value = '';
      if (elSeguridad) {
        elSeguridad.value = isAmxER ? lockedAgenteVal : '';
      }

      renderizarCuadricula();
      window.SioOfflineManager?.notifyStateChange?.();
      if (validator && typeof validator.focusWithoutScroll === 'function') {
        validator.focusWithoutScroll(elPasajero);
      } else {
        try { elPasajero.focus({ preventScroll: true }); } catch (_) { elPasajero.focus(); }
      }
    };

    if (validator && typeof validator.preserveScroll === 'function') {
      validator.preserveScroll(commitErRow);
    } else {
      commitErRow();
    }

    if (typeof window.Swal !== 'undefined') {
      window.Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Pasajero agregado a la lista',
        showConfirmButton: false,
        returnFocus: false,
        timer: 1600,
        timerProgressBar: true
      });
    }
  }

  /**
   * Inserta una fila editable directamente en la cuadrícula fluida
   */
  function insertarFilaEnBlanco() {
    const inputBuscar = document.getElementById('erBuscarPasajero');
    if (inputBuscar && inputBuscar.value.trim() !== '') {
      inputBuscar.value = '';
    }

    const newUid = _nextUid++;
    _erRows.push({
      uid: newUid,
      DetalleControlERId: 0,
      Pasajero: '',
      Secuencia: '',
      Colilla: '',
      Vuelo: String(_state.noVuelo || '').trim(),
      Destino: String(_state.destinoVuelo || '').trim(),
      HoraRevision: obtenerHoraActualHHMM(),
      AgenteAVSEC: '',
      AgenteSeguridad: isAmxERFormat() ? getLockedAgenteSeguridad() : String(_state.agenteActual || '').trim()
    });

    renderizarCuadricula();
    window.SioOfflineManager?.notifyStateChange?.();

    const tbody = document.getElementById('erTbodyRegistros');
    const newRowEl = tbody ? tbody.querySelector(`tr[data-uid="${newUid}"]`) : null;
    const firstInput = newRowEl ? newRowEl.querySelector('[data-field="Pasajero"]') : null;
    if (firstInput) {
      window.SioFormatValidator.focusAndScrollToElement(firstInput);
    }
  }

  /**
   * Retira una fila de la cuadrícula (si estaba en BD, se aplica Soft Delete al guardar la transacción)
   */
  function eliminarFilaCuadricula(uid) {
    const idx = _erRows.findIndex(r => r.uid === uid);
    if (idx === -1) return;

    const row = _erRows[idx];
    const esFilaVacia = !row.Pasajero && !row.Secuencia && !row.Colilla && !row.AgenteAVSEC && row.DetalleControlERId === 0;

    if (esFilaVacia) {
      _erRows.splice(idx, 1);
      renderizarCuadricula();
      window.SioOfflineManager?.notifyStateChange?.();
      return;
    }

    Swal.fire({
      icon: 'question',
      title: `¿Retirar Fila #${idx + 1}?`,
      html: `Se retirará el equipaje de <strong>${escapeHtml(row.Pasajero || 'Sin nombre')}</strong> (Colilla: <strong>${escapeHtml(row.Colilla || 'S/N')}</strong>).${row.DetalleControlERId > 0 ? '<br><small class="er-softdelete-note">El registro persistido se marcará con Soft Delete (EstaEliminado = 1) al guardar el formato.</small>' : ''}`,
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#64748B',
      confirmButtonText: 'Sí, retirar fila',
      cancelButtonText: 'Cancelar'
    }).then((res) => {
      if (res.isConfirmed) {
        _erRows.splice(idx, 1);
        renderizarCuadricula();
        window.SioOfflineManager?.notifyStateChange?.(true);
      }
    });
  }

  /**
   * Filtra visualmente las filas de la cuadrícula según texto de búsqueda (Search de Power Apps)
   */
  function filtrarFilasDOM(termino = '') {
    const q = String(termino || '').trim().toLowerCase();
    const tbody = document.getElementById('erTbodyRegistros');
    if (!tbody) return;

    const existingNoMatch = tbody.querySelector('tr.er-no-match-row');
    if (existingNoMatch) existingNoMatch.remove();

    const rows = tbody.querySelectorAll('tr[data-uid]');
    let visibleCount = 0;
    rows.forEach((tr) => {
      if (!q) {
        tr.classList.remove('er-row-hidden');
        visibleCount++;
        return;
      }
      const uid = parseInt(tr.dataset.uid, 10);
      const r = _erRows.find(item => item.uid === uid);
      if (!r) return;

      const haystack = [
        r.Pasajero,
        r.Secuencia,
        r.Colilla,
        r.Vuelo,
        r.Destino,
        r.HoraRevision,
        r.AgenteAVSEC,
        r.AgenteSeguridad
      ].join(' ').toLowerCase();

      const matched = haystack.includes(q);
      tr.classList.toggle('er-row-hidden', !matched);
      if (matched) visibleCount++;
    });

    if (q && rows.length > 0 && visibleCount === 0) {
      const noMatchTr = document.createElement('tr');
      noMatchTr.className = 'er-empty-row er-no-match-row';
      noMatchTr.innerHTML = `
        <td colspan="${isDeltaERFormat() ? 9 : 10}" class="er-empty-cell">
          <div class="cp-empty-dashed er-empty-card">
            <i class="fas fa-search fa-lg er-empty-icon"></i>
            <div class="er-empty-title">Sin resultados para "${escapeHtml(termino)}"</div>
            <div class="er-empty-hint">Presione el botón de reinicio para ver todos los registros agregados.</div>
          </div>
        </td>
      `;
      tbody.appendChild(noMatchTr);
    }
  }

  /**
   * Sincroniza todos los valores actuales del DOM hacia _erRows antes de validar o enviar
   */
  function sincronizarDOMHaciaModelo() {
    const tbody = document.getElementById('erTbodyRegistros');
    if (!tbody) return;

    const trs = tbody.querySelectorAll('tr[data-uid]');
    trs.forEach((tr) => {
      const uid = parseInt(tr.dataset.uid, 10);
      const rowObj = _erRows.find(r => r.uid === uid);
      if (!rowObj) return;

      tr.querySelectorAll('.er-cell-input[data-field]').forEach((inp) => {
        const f = inp.dataset.field;
        if (f) {
          if (f === 'AgenteSeguridad' && isAmxERFormat()) {
            const lockedVal = getLockedAgenteSeguridad();
            inp.value = lockedVal;
            rowObj[f] = lockedVal;
          } else {
            rowObj[f] = inp.value;
          }
        }
      });
    });
  }

  /**
   * Ejecuta la validación estricta de 2 capas y envía el payload al servidor
   * @param {boolean} guardarDefinitivo - true para persistir en SQL, false para Vista Preliminar
   */
  async function ejecutarGuardadoER(guardarDefinitivo = true) {
    // Asegurar que todas las filas sean visibles antes de validar
    const inputBuscar = document.getElementById('erBuscarPasajero');
    if (inputBuscar && inputBuscar.value.trim() !== '') {
      inputBuscar.value = '';
      filtrarFilasDOM('');
    }

    sincronizarDOMHaciaModelo();

    const formEl = document.getElementById('formCapturaER');
    const fechaEl = document.getElementById('erFecha');
    const obsEl = document.getElementById('erObservaciones');
    const sigBox = document.getElementById('erSignatureBox');
    const gridWrapper = document.getElementById('erGridWrapper');
    const tbody = document.getElementById('erTbodyRegistros');
    const rowElements = tbody ? Array.from(tbody.querySelectorAll('tr[data-row-index]')) : [];
    const inputPasajeroQuick = document.getElementById('erInputPasajero');

    const encIdInput = document.getElementById('erEncabezadoId');
    const encabezadoIdActual = encIdInput && encIdInput.value ? parseInt(encIdInput.value, 10) : (_state.encabezadoId || null);
    const esNuevoActual = !encabezadoIdActual || encabezadoIdActual <= 0;

    // CAPA 1 DE VALIDACIÓN ESTRICTA EN FRONTEND (cuando se guarda definitivamente)
    if (guardarDefinitivo && window.SioFormatValidator) {
      const headerRules = [
        {
          field: 'fecha',
          label: 'Fecha de Inspección',
          element: fechaEl,
          required: true,
          type: 'date',
          requiredMessage: 'es obligatoria.'
        },
        {
          field: 'observaciones',
          label: 'Observaciones',
          element: obsEl,
          required: false,
          type: 'string',
          maxLength: 2000
        }
      ];

      if (esNuevoActual) {
        headerRules.push({
          field: 'firmaBase64',
          label: 'Firma Digital de Seguridad',
          element: sigBox,
          highlightElement: sigBox,
          required: true,
          type: 'string',
          getValue: () => (_firmaPad && !_firmaPad.isEmpty() ? _firmaPad.toDataURL() : ''),
          requiredMessage: 'debe ser trazada en el recuadro de firma antes de guardar.'
        });
      }

      const isDeltaER = isDeltaERFormat();
      const rowRules = [
        {
          field: 'Pasajero',
          label: 'Nombre del Pasajero',
          required: true,
          type: 'string',
          maxLength: 200
        },
        ...(isDeltaER ? [] : [{
          field: 'Secuencia',
          label: 'Secuencia',
          required: true,
          type: 'integer',
          min: 1
        }]),
        {
          field: 'Colilla',
          label: 'No. de Colilla / Marbete',
          required: true,
          type: 'integer',
          min: 1
        },
        {
          field: 'Destino',
          label: 'Destino',
          required: false,
          type: 'string',
          maxLength: 100
        },
        {
          field: 'HoraRevision',
          label: 'Hora de Revisión',
          required: true,
          type: 'time'
        },
        {
          field: 'AgenteAVSEC',
          label: 'Nombre Agente AVSEC que realiza inspección',
          required: true,
          type: 'string',
          maxLength: 150
        },
        {
          field: 'AgenteSeguridad',
          label: 'Agente de Seguridad AMX durante la inspección',
          required: true,
          type: 'string',
          maxLength: 150
        }
      ];

      const checkResult = window.SioFormatValidator.validateFluidGridFormat({
        root: formEl,
        headerRules,
        gridContainer: gridWrapper,
        rowElements,
        rowRules,
        minRows: 1,
        emptyRowsMessage: 'Debe registrar al menos un (1) equipaje revisado en la cuadrícula antes de guardar el formato.',
        emptyRowsFocusElement: inputPasajeroQuick
      });

      if (!checkResult.valid) {
        window.SioFormatValidator.notifyValidationErrors(
          checkResult.errors,
          'Validación Obligatoria — Control de Equipaje AVSEC'
        );
        return;
      }
    }

    const firmaBase64 = (_firmaPad && !_firmaPad.isEmpty()) ? _firmaPad.toDataURL() : '';
    const fechaFijaItinerario = _state.fecha || (fechaEl ? fechaEl.value : '');
    if (fechaEl && fechaFijaItinerario) {
      fechaEl.value = fechaFijaItinerario;
    }

    // Abrir pestaña de forma síncrona dentro del gesto de clic para evitar bloqueo de popups
    let previewWin = null;
    if (!guardarDefinitivo) {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try {
          previewWin.document.title = 'Generando Vista Preliminar...';
        } catch (_) {}
      }
    }

    const lockedAmxAgente = isAmxERFormat() ? getLockedAgenteSeguridad() : '';
    const payload = {
      formatoId: _state.formatoId || 'amx-er',
      itinerarioId: parseInt(_state.itinerarioId, 10),
      encabezadoId: encabezadoIdActual,
      guardar: guardarDefinitivo,
      datos: {
        erPayload: {
          fecha: fechaFijaItinerario,
          observaciones: obsEl ? obsEl.value.trim() : '',
          firmaBase64,
          agente: isAmxERFormat() ? lockedAmxAgente : (_state.agenteActual || ''),
          registros: _erRows.map((r, idx) => ({
            DetalleControlERId: parseInt(r.DetalleControlERId, 10) || 0,
            Pasajero: String(r.Pasajero || '').trim(),
            Secuencia: String(r.Secuencia || (isDeltaERFormat() ? (idx + 1) : '')).trim(),
            Colilla: String(r.Colilla || '').trim(),
            Vuelo: String(_state.noVuelo || r.Vuelo || '').trim(),
            Destino: String(r.Destino || '').trim() || 'N/A',
            HoraRevision: normalizarHora5(r.HoraRevision),
            AgenteAVSEC: String(r.AgenteAVSEC || '').trim(),
            AgenteSeguridad: isAmxERFormat() ? lockedAmxAgente : String(r.AgenteSeguridad || _state.agenteActual || '').trim()
          }))
        }
      }
    };

    if (typeof window.mostrarPantallaCarga === 'function') {
      window.mostrarPantallaCarga(
        guardarDefinitivo ? 'Guardando Formato en Azure SQL...' : 'Generando Vista Preliminar...',
        guardarDefinitivo
          ? 'Ejecutando transacción parametrizada en tablas de ControlER...'
          : 'Preparando documento oficial de Aeroméxico...'
      );
    }

    try {
      const response = await fetch('/api/formatos/procesar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (typeof window.ocultarPantallaCarga === 'function') {
        window.ocultarPantallaCarga();
      }

      if (!response.ok || !result.success) {
        if (previewWin && !previewWin.closed) previewWin.close();
        if (Array.isArray(result.errors) && result.errors.length > 0 && window.SioFormatValidator) {
          window.SioFormatValidator.applyBackendErrors(result.errors, {
            root: formEl,
            headerElementMap: {
              fecha: fechaEl,
              observaciones: obsEl,
              firmaBase64: sigBox
            },
            rowSelector: 'tr[data-row-index]',
            gridContainer: gridWrapper
          });
          return;
        }

        Swal.fire({
          icon: 'error',
          title: 'No se pudo guardar el formato',
          text: result.message || 'Verifique los campos obligatorios e intente nuevamente.',
          confirmButtonColor: '#DC2626'
        });
        return;
      }

      if (!guardarDefinitivo) {
        if (result.previewUrl) {
          if (previewWin && !previewWin.closed) {
            previewWin.location.href = result.previewUrl;
            previewWin.focus();
          } else {
            window.location.href = result.previewUrl;
          }
        } else if (previewWin && !previewWin.closed) {
          previewWin.close();
        }
        return;
      }

      // Actualizar estado en vivo tras persistencia transaccional exitosa
      if (result.encabezadoId) {
        _state.encabezadoId = result.encabezadoId;
        _state.esNuevo = false;
        if (encIdInput) encIdInput.value = String(result.encabezadoId);

        const badgeEl = document.getElementById('erBadgeEstadoEncabezado');
        if (badgeEl) {
          badgeEl.textContent = `REGISTRO CARGADO #${result.encabezadoId}`;
        }
      }
      if (result.firmasRepo) {
        window.SioSignatureRepoClient?.applyRepoState?.(result.firmasRepo);
      }

      if (Array.isArray(result.detalles)) {
        result.detalles.forEach((det, idx) => {
          if (_erRows[idx] && det.DetalleControlERId) {
            _erRows[idx].DetalleControlERId = det.DetalleControlERId;
          }
        });
        renderizarCuadricula();
      }

      await Swal.fire({
        icon: 'success',
        title: '¡Formato Guardado Exitosamente!',
        text: result.mensaje || 'El formato ha sido registrado en Azure SQL.',
        timer: 1100,
        showConfirmButton: false
      });

      if (result.previewUrl) {
        window.location.href = result.previewUrl;
      }
    } catch (err) {
      if (previewWin && !previewWin.closed) previewWin.close();
      if (typeof window.ocultarPantallaCarga === 'function') {
        window.ocultarPantallaCarga();
      }
      console.error('[GUARDAR CONTROL ER ERROR]', err);
      Swal.fire({
        icon: 'error',
        title: 'Error de Comunicación',
        text: 'No fue posible conectar con el servidor para procesar el formato.',
        confirmButtonColor: '#DC2626'
      });
    }
  }
})();
