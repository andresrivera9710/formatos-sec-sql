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

    controlEl.classList.add('is-invalid', 'sio-field-invalid');
    controlEl.setAttribute('aria-invalid', 'true');

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
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (_) {
      el.scrollIntoView();
    }
    setTimeout(() => {
      if (typeof el.focus === 'function') {
        try {
          el.focus({ preventScroll: true });
        } catch (_) {
          el.focus();
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
      rowSelector = 'tr[data-row-index]',
      gridContainer = null
    } = options;

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
      } else if (err.scope === 'header' && headerElementMap[err.field]) {
        targetEl = headerElementMap[err.field];
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

  window.SioFormatValidator = {
    clearValidationErrors,
    markElementInvalid,
    validateSingleValue,
    validateFluidGridFormat,
    notifyValidationErrors,
    applyBackendErrors,
    focusAndScrollToElement
  };
})(window);
