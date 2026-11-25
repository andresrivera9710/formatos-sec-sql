/**
 * SioFormatValidator - Estándar Transversal de Validación Estricto (Frontend - Capa 1)
 * SIO LAATS Formatos SEC
 * 100% compatible con Helmet CSP (sin scripts ni eventos inline) y seguro contra XSS.
 *
 * Funciones principales:
 * - Recorre campos de cabecera y todas las filas/celdas de la cuadrícula fluida.
 * - Verifica obligatoriedad (.trim() !== ''), tipos de datos (date, time, integer, string, signature),
 *   rangos numéricos y cantidad mínima de registros.
 * - Resalta visualmente la fila (<tr>) y la celda/control exacto con borde de alerta (--danger #DC2626).
 * - Hace scroll y foco automático hacia el primer campo con error.
 * - Muestra alerta detallada con SweetAlert2 indicando fila y campo exacto.
 * - Permite aplicar errores estructurados devueltos por el Backend (HTTP 400).
 */
(function (window) {
  'use strict';

  const DATE_ISO_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const TIME_HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const INT_POSITIVE_REGEX = /^\d+$/;
  const MAX_SQL_INT = 2147483647;

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Limpia todos los estados de alerta visual (--danger #DC2626) dentro de un contenedor
   * @param {HTMLElement|Document} [root=document]
   */
  function clearValidationErrors(root = document) {
    const scope = root || document;
    scope.querySelectorAll('.is-invalid, .sio-field-invalid').forEach((el) => {
      el.classList.remove('is-invalid', 'sio-field-invalid');
      el.removeAttribute('aria-invalid');
    });
    scope.querySelectorAll('.sio-cell-invalid').forEach((cell) => {
      cell.classList.remove('sio-cell-invalid');
    });
    scope.querySelectorAll('.sio-row-invalid, .er-row-invalid').forEach((row) => {
      row.classList.remove('sio-row-invalid', 'er-row-invalid');
    });
    scope.querySelectorAll('.sio-grid-invalid').forEach((grid) => {
      grid.classList.remove('sio-grid-invalid');
    });
  }

  function resolveVisibleTrigger(el) {
    if (!el) return null;
    if (el.tagName === 'SELECT') {
      const wrap = el.closest('.sio-select, .sio-combo');
      if (wrap) {
        return wrap.querySelector('.sio-select-trigger, .sio-combo-trigger') || el;
      }
    }
    return el;
  }

  /**
   * Marca visualmente un campo y su fila/celda contenedora con borde --danger (#DC2626)
   * @param {HTMLElement|null} controlEl
   * @param {HTMLElement|null} [rowEl]
   */
  function markElementInvalid(controlEl, rowEl = null) {
    if (rowEl) {
      rowEl.classList.add('sio-row-invalid', 'er-row-invalid');
    }
    if (!controlEl) return;

    const visibleEl = resolveVisibleTrigger(controlEl);
    controlEl.classList.add('is-invalid', 'sio-field-invalid');
    controlEl.setAttribute('aria-invalid', 'true');
    if (visibleEl && visibleEl !== controlEl) {
      visibleEl.classList.add('is-invalid', 'sio-field-invalid');
      visibleEl.setAttribute('aria-invalid', 'true');
    }

    const parentCell = controlEl.closest('td, .er-grid-cell, .form-group');
    if (parentCell) {
      parentCell.classList.add('sio-cell-invalid');
    }

    const parentRow = rowEl || controlEl.closest('tr[data-row-index], .er-grid-row');
    if (parentRow) {
      parentRow.classList.add('sio-row-invalid', 'er-row-invalid');
    }

    // Limpiar resaltado automáticamente cuando el usuario corrige el valor
    const clearHandler = () => {
      controlEl.classList.remove('is-invalid', 'sio-field-invalid');
      controlEl.removeAttribute('aria-invalid');
      if (visibleEl && visibleEl !== controlEl) {
        visibleEl.classList.remove('is-invalid', 'sio-field-invalid');
        visibleEl.removeAttribute('aria-invalid');
      }
      if (parentCell) parentCell.classList.remove('sio-cell-invalid');
      if (parentRow && !parentRow.querySelector('.is-invalid, .sio-field-invalid')) {
        parentRow.classList.remove('sio-row-invalid', 'er-row-invalid');
      }
      controlEl.removeEventListener('input', clearHandler);
      controlEl.removeEventListener('change', clearHandler);
    };

    controlEl.addEventListener('input', clearHandler);
    controlEl.addEventListener('change', clearHandler);
  }

  /**
   * Valida un valor individual según su regla de tipo y longitud
   */
  function validateSingleValue(rawVal, rule) {
    const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

    if (rule.required && strVal === '') {
      return {
        valid: false,
        reason: rule.requiredMessage || 'es obligatorio y no puede quedar vacío.'
      };
    }

    if (strVal === '') {
      return { valid: true, reason: null };
    }

    if (rule.maxLength && strVal.length > rule.maxLength) {
      return {
        valid: false,
        reason: `excede la longitud máxima de ${rule.maxLength} caracteres.`
      };
    }

    if (rule.minLength && strVal.length < rule.minLength) {
      return {
        valid: false,
        reason: `debe tener al menos ${rule.minLength} caracteres.`
      };
    }

    switch (rule.type) {
      case 'date': {
        if (!DATE_ISO_REGEX.test(strVal)) {
          return { valid: false, reason: 'debe tener un formato de fecha válido (AAAA-MM-DD).' };
        }
        break;
      }
      case 'time': {
        if (!TIME_HHMM_REGEX.test(strVal)) {
          return { valid: false, reason: 'debe tener un formato de hora válido de 24h (HH:mm).' };
        }
        break;
      }
      case 'integer': {
        if (!INT_POSITIVE_REGEX.test(strVal)) {
          return { valid: false, reason: 'debe ser un número entero positivo (solo dígitos).' };
        }
        const num = Number(strVal);
        const minVal = rule.min !== undefined ? rule.min : 1;
        const maxVal = rule.max !== undefined ? rule.max : MAX_SQL_INT;
        if (!Number.isSafeInteger(num) || num < minVal || num > maxVal) {
          return { valid: false, reason: `debe ser un número entero entre ${minVal} y ${maxVal}.` };
        }
        break;
      }
      default:
        break;
    }

    if (typeof rule.customValidator === 'function') {
      const customErr = rule.customValidator(strVal);
      if (customErr) {
        return { valid: false, reason: customErr };
      }
    }

    return { valid: true, reason: null };
  }

  /**
   * Hace scroll suave y posiciona el foco sobre el primer elemento inválido
   * @param {HTMLElement|null} el
   */
  function focusAndScrollToElement(el) {
    const target = resolveVisibleTrigger(el);
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (_) {
      target.scrollIntoView();
    }
    setTimeout(() => {
      if (typeof target.focus === 'function') {
        try {
          target.focus({ preventScroll: true });
        } catch (_) {
          target.focus();
        }
      }
    }, 180);
  }

  /**
   * Muestra alerta SweetAlert2 detallando exactamente qué fila y qué campo falta completar
   * @param {Array<Object>} errors
   * @param {string} [title]
   */
  function notifyValidationErrors(errors = [], title = 'Campos Obligatorios Incompletos') {
    if (!errors || errors.length === 0) return;

    const firstError = errors[0];
    if (firstError.element) {
      focusAndScrollToElement(firstError.element);
    }

    if (typeof window.Swal === 'undefined') {
      window.alert(firstError.message);
      return;
    }

    const maxItemsToShow = 6;
    const listHtml = errors.slice(0, maxItemsToShow).map((err) => {
      const locationBadge = err.row
        ? `<span style="display:inline-block; background:var(--danger-light); color:var(--danger); border:1px solid var(--danger-border); font-weight:800; padding:2px 7px; border-radius:4px; margin-right:6px; font-size:11px;">FILA #${escapeHtml(err.row)}</span>`
        : `<span style="display:inline-block; background:var(--gold-light); color:var(--gold-text); border:1px solid var(--gold); font-weight:800; padding:2px 7px; border-radius:4px; margin-right:6px; font-size:11px;">ENCABEZADO</span>`;

      return `<li style="margin-bottom:8px; text-align:left; font-size:13px; line-height:1.4; color:var(--text);">
        ${locationBadge}
        <strong>${escapeHtml(err.label || err.field)}:</strong> ${escapeHtml(err.reason || err.message)}
      </li>`;
    }).join('');

    const extraCount = errors.length - maxItemsToShow;
    const extraNotice = extraCount > 0
      ? `<div style="margin-top:8px; font-size:12px; color:var(--danger); font-weight:700;">+ ${extraCount} campo(s) adicional(es) resaltado(s) en rojo.</div>`
      : '';

    window.Swal.fire({
      icon: 'warning',
      title: escapeHtml(title),
      html: `
        <div style="text-align:left; margin-top:6px;">
          <p style="font-size:13px; color:var(--text-2); margin-bottom:12px;">
            Por favor complete o corrija los siguientes campos obligatorios resaltados en <strong style="color:var(--danger);">rojo</strong> antes de guardar:
          </p>
          <ul style="list-style:none; padding:10px 12px; margin:0; background:var(--danger-light); border:1px solid var(--danger-border); border-left:4px solid var(--danger); border-radius:6px;">
            ${listHtml}
          </ul>
          ${extraNotice}
        </div>
      `,
      confirmButtonText: 'Entendido, revisar campos',
      confirmButtonColor: '#DC2626',
      didClose: () => {
        if (firstError.element) {
          focusAndScrollToElement(firstError.element);
        }
      }
    });
  }

  /**
   * Valida integralmente un formato con cabecera + cuadrícula fluida en el DOM
   * @param {Object} config
   * @param {HTMLElement} [config.root] - Contenedor raíz del formulario
   * @param {Array<Object>} [config.headerRules] - Reglas para campos de cabecera
   * @param {HTMLElement} [config.gridContainer] - Contenedor de la cuadrícula fluida
   * @param {Array<HTMLElement>} [config.rowElements] - Lista de elementos <tr> de la cuadrícula
   * @param {Array<Object>} [config.rowRules] - Reglas por columna de cada fila
   * @param {number} [config.minRows=1] - Mínimo de filas requeridas
   * @param {string} [config.emptyRowsMessage] - Mensaje cuando no hay filas
   * @param {HTMLElement} [config.emptyRowsFocusElement] - Elemento a enfocar si hay 0 filas
   */
  function validateFluidGridFormat(config = {}) {
    const {
      root = document,
      headerRules = [],
      gridContainer = null,
      rowElements = [],
      rowRules = [],
      minRows = 1,
      emptyRowsMessage = 'Debe agregar al menos un (1) registro válido en la cuadrícula antes de guardar.',
      emptyRowsFocusElement = null
    } = config;

    clearValidationErrors(root);
    const errors = [];

    // 1. Validar campos de cabecera
    for (const rule of headerRules) {
      const el = rule.element || (rule.selector ? root.querySelector(rule.selector) : null);
      const rawVal = rule.getValue ? rule.getValue() : (el ? el.value : '');
      const check = validateSingleValue(rawVal, rule);

      if (!check.valid) {
        const targetEl = rule.highlightElement || el;
        markElementInvalid(targetEl, null);
        errors.push({
          scope: 'header',
          row: null,
          field: rule.field,
          label: rule.label,
          reason: check.reason,
          message: `Encabezado (${rule.label}): ${check.reason}`,
          element: targetEl
        });
      }
    }

    // 2. Validar existencia mínima de filas en la cuadrícula fluida
    const rows = Array.isArray(rowElements) ? rowElements : Array.from(rowElements || []);
    if (minRows > 0 && rows.length < minRows) {
      if (gridContainer) {
        gridContainer.classList.add('sio-grid-invalid');
      }
      if (emptyRowsFocusElement) {
        markElementInvalid(emptyRowsFocusElement, null);
      }
      errors.push({
        scope: 'grid',
        row: null,
        field: 'registros',
        label: 'Cuadrícula de Equipajes Revisados',
        reason: emptyRowsMessage,
        message: emptyRowsMessage,
        element: emptyRowsFocusElement || gridContainer
      });
    }

    // 3. Recorrer todas las filas de la cuadrícula fluida y validar cada celda
    rows.forEach((rowEl, idx) => {
      const rowNum = idx + 1;
      for (const rule of rowRules) {
        const inputEl = rule.selector
          ? rowEl.querySelector(rule.selector)
          : rowEl.querySelector(`[data-field="${rule.field}"]`);
        const rawVal = inputEl ? inputEl.value : '';
        const check = validateSingleValue(rawVal, rule);

        if (!check.valid) {
          markElementInvalid(inputEl, rowEl);
          errors.push({
            scope: 'row',
            row: rowNum,
            field: rule.field,
            label: rule.label,
            reason: check.reason,
            message: `Fila #${rowNum} - El campo "${rule.label}" ${check.reason}`,
            element: inputEl || rowEl
          });
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Aplica en el DOM los errores estructurados devueltos por el Backend (HTTP 400)
   * y muestra la alerta SweetAlert2 correspondiente.
   */
  function applyBackendErrors(backendErrors = [], options = {}) {
    const {
      root = document,
      headerElementMap = {},
      headerMap = {},
      rowSelector = 'tr[data-row-index]',
      gridContainer = null
    } = options;
    const mergedHeaderMap = { ...headerMap, ...headerElementMap };

    clearValidationErrors(root);
    const mappedErrors = [];
    const rows = Array.from(root.querySelectorAll(rowSelector));

    backendErrors.forEach((err) => {
      let targetEl = null;
      let targetRow = null;

      if (err.scope === 'row' && err.row && rows[err.row - 1]) {
        targetRow = rows[err.row - 1];
        targetEl = targetRow.querySelector(`[data-field="${err.field}"]`) || targetRow;
        markElementInvalid(targetEl, targetRow);
      } else if (err.scope === 'header' && mergedHeaderMap[err.field]) {
        targetEl = mergedHeaderMap[err.field];
        markElementInvalid(targetEl, null);
      } else if (err.scope === 'grid' && gridContainer) {
        gridContainer.classList.add('sio-grid-invalid');
        targetEl = gridContainer;
      }

      mappedErrors.push({
        scope: err.scope || 'row',
        row: err.row || null,
        field: err.field || 'campo',
        label: err.label || err.field || 'Campo requerido',
        reason: err.message,
        message: err.message,
        element: targetEl
      });
    });

    notifyValidationErrors(mappedErrors, 'Validación de Seguridad (Servidor)');
  }

  /**
   * Bloqueo y sanitización estricta de entradas numéricas ([data-numeric-only="true"])
   * Funciona tanto con teclado físico en Web como con teclado táctil y pegado en Móvil.
   */
  function sanitizeNumericValue(raw) {
    return String(raw ?? '').replace(/\D+/g, '');
  }

  function bindNumericOnlyDelegation() {
    if (typeof document === 'undefined' || document._sioNumericDelegated) return;
    document._sioNumericDelegated = true;

    const ALLOWED_NAV_KEYS = new Set([
      'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End'
    ]);

    document.addEventListener('keydown', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('input[data-numeric-only="true"]') : null;
      if (!el || el.readOnly || el.disabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (ALLOWED_NAV_KEYS.has(e.key)) return;
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    });

    document.addEventListener('beforeinput', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('input[data-numeric-only="true"]') : null;
      if (!el || el.readOnly || el.disabled) return;
      if (e.data && /\D/.test(e.data)) {
        const digits = sanitizeNumericValue(e.data);
        e.preventDefault();
        if (digits) {
          const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
          const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
          const next = el.value.slice(0, start) + digits + el.value.slice(end);
          const maxLen = el.maxLength > 0 ? el.maxLength : Infinity;
          el.value = next.slice(0, maxLen);
          const caret = Math.min(start + digits.length, el.value.length);
          try { el.setSelectionRange(caret, caret); } catch (_) {}
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    const cleanHandler = (e) => {
      const el = e.target && e.target.closest ? e.target.closest('input[data-numeric-only="true"]') : null;
      if (!el || el.readOnly || el.disabled) return;
      const cleaned = sanitizeNumericValue(el.value);
      if (el.value !== cleaned) {
        el.value = cleaned;
      }
    };

    document.addEventListener('input', cleanHandler);
    document.addEventListener('change', cleanHandler);
    document.addEventListener('paste', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('input[data-numeric-only="true"]') : null;
      if (!el || el.readOnly || el.disabled) return;
      const clip = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      if (/\D/.test(clip)) {
        e.preventDefault();
        const digits = sanitizeNumericValue(clip);
        const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
        const maxLen = el.maxLength > 0 ? el.maxLength : Infinity;
        el.value = (el.value.slice(0, start) + digits + el.value.slice(end)).slice(0, maxLen);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  /**
   * Ejecuta una acción de actualización de matriz/DOM manteniendo intacta la posición de scroll
   * en Web y Móvil, y ofrece foco sin desplazamiento automático.
   */
  function focusWithoutScroll(el) {
    if (!el || typeof el.focus !== 'function') return;
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      el.focus();
    }
  }

  function preserveScroll(fn) {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const result = typeof fn === 'function' ? fn() : undefined;
    window.scrollTo(sx, sy);
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.scrollTo(sx, sy));
    }
    return result;
  }

  function bindGlobalEnterScrollGuard() {
    if (typeof document === 'undefined' || document._sioEnterScrollGuarded) return;
    document._sioEnterScrollGuarded = true;

    // Evita que presionar Enter o Sig. en campos de captura de cualquier formato SEC
    // dispare un submit implícito del <form> o provoque un salto de scroll inesperado.
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
      if (!isEnter) return;
      if (e.isComposing || e.keyCode === 229) return;

      const target = e.target;
      if (!target || !target.closest) return;
      if (target.tagName !== 'INPUT') return;

      const inputType = String(target.type || 'text').toLowerCase();
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset' || inputType === 'checkbox' || inputType === 'radio') {
        return;
      }

      const form = target.closest('form');
      if (!form) return;
      // Permitir envío natural con Enter en Login y buscador de Operaciones
      if (form.id === 'formLogin' || form.id === 'formFiltrosOperaciones' || form.hasAttribute('data-allow-enter-submit')) {
        return;
      }

      e.preventDefault();
    });
  }

  bindNumericOnlyDelegation();
  bindGlobalEnterScrollGuard();

  /**
   * Adaptador compatible para llamadas legacy/cortas `focusAndAlert({ title, errors })`
   * @param {Object|Array<Object>} configOrErrors
   * @param {string} [maybeTitle]
   */
  function focusAndAlert(configOrErrors = [], maybeTitle) {
    const isConfigObj = configOrErrors && !Array.isArray(configOrErrors) && typeof configOrErrors === 'object';
    const rawErrors = isConfigObj ? (configOrErrors.errors || []) : (Array.isArray(configOrErrors) ? configOrErrors : []);
    const title = (isConfigObj ? configOrErrors.title : maybeTitle) || 'Campos Obligatorios Incompletos';
    const normalized = rawErrors.map((err) => ({
      ...err,
      row: err?.row ?? err?.rowNumber ?? null
    }));
    return notifyValidationErrors(normalized, title);
  }

  window.SioFormatValidator = {
    clearValidationErrors,
    markElementInvalid,
    validateSingleValue,
    validateFluidGridFormat,
    notifyValidationErrors,
    focusAndAlert,
    applyBackendErrors,
    focusAndScrollToElement,
    focusWithoutScroll,
    preserveScroll,
    sanitizeNumericValue
  };
})(window);
