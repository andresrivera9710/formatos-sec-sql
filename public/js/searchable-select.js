/**
 * SioSearchableSelect — Componente Reutilizable de Lista Desplegable con Búsqueda Integrada
 * Compatible con Web (Escritorio) y Móvil (Bottom Sheet táctil con font-size: 16px sin zoom).
 * 100% compatible con Helmet CSP (cero scripts inline, cero eventos inline, cero estilos inline).
 */
(function (window, document) {
  'use strict';

  const INSTANCE_MAP = new WeakMap();
  const NATIVE_VALUE_DESC = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  let _openInstance = null;

  class SioSearchableSelect {
    /**
     * @param {HTMLSelectElement} selectEl
     * @param {Object} [options]
     * @param {string} [options.placeholder]
     * @param {string} [options.searchPlaceholder]
     * @param {string} [options.emptyText]
     * @param {string} [options.title]
     */
    constructor(selectEl, options = {}) {
      if (!selectEl || selectEl.tagName !== 'SELECT') return;
      if (INSTANCE_MAP.has(selectEl)) {
        return INSTANCE_MAP.get(selectEl);
      }
      if (selectEl.classList.contains('sio-combo-native')) {
        return;
      }

      this.select = selectEl;
      INSTANCE_MAP.set(selectEl, this);

      const emptyOpt = Array.from(selectEl.options).find((o) => String(o.value).trim() === '');
      this.allowClear = Boolean(emptyOpt);
      this.placeholder =
        options.placeholder ||
        selectEl.getAttribute('data-placeholder') ||
        (emptyOpt ? String(emptyOpt.textContent || '').trim() : '-- Seleccione una opción --');

      this.titleText =
        options.title ||
        this._resolveLabelText() ||
        this.placeholder.replace(/^--\s*|\s*--$/g, '');

      this.searchPlaceholder =
        options.searchPlaceholder ||
        selectEl.getAttribute('data-search-placeholder') ||
        'Escribir para buscar por nombre, código o puesto...';

      this.emptyText =
        options.emptyText ||
        selectEl.getAttribute('data-empty-text') ||
        'No se encontraron coincidencias.';

      this.isOpen = false;
      this.highlightedIndex = -1;
      this.filteredItems = [];
      this.allItems = [];
      this._suppressMutation = false;

      this._interceptValueProperty();
      this._refreshItemsFromSelect();
      this._buildDom();
      this._bindEvents();
      this._observeSelectMutations();
      this.syncFromSelect();
    }

    static normalize(text) {
      return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    }

    static getInstance(selectEl) {
      return selectEl ? INSTANCE_MAP.get(selectEl) || null : null;
    }

    static enhance(selectEl, options = {}) {
      if (!selectEl || selectEl.tagName !== 'SELECT') return null;
      if (INSTANCE_MAP.has(selectEl)) return INSTANCE_MAP.get(selectEl);
      return new SioSearchableSelect(selectEl, options);
    }

    static initAll(root = document) {
      const scope = root || document;
      const selects = scope.querySelectorAll('select');
      const instances = [];
      selects.forEach((sel) => {
        if (sel.getAttribute('data-no-searchable') === 'true') return;
        if (sel.multiple || (sel.size && sel.size > 1)) return;
        if (sel.classList.contains('sio-combo-native')) return;
        const inst = SioSearchableSelect.enhance(sel);
        if (inst) instances.push(inst);
      });
      return instances;
    }

    _resolveLabelText() {
      if (this.select.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(this.select.id)}"]`);
        if (lbl) {
          return String(lbl.textContent || '')
            .replace(/\*/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }
      const parentLbl = this.select.closest('.form-group')?.querySelector('label');
      if (parentLbl) {
        return String(parentLbl.textContent || '')
          .replace(/\*/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return '';
    }

    _interceptValueProperty() {
      if (!NATIVE_VALUE_DESC || this.select._sioValueIntercepted) return;
      const instance = this;
      Object.defineProperty(this.select, 'value', {
        configurable: true,
        enumerable: true,
        get() {
          return NATIVE_VALUE_DESC.get.call(this);
        },
        set(nextVal) {
          const prevVal = NATIVE_VALUE_DESC.get.call(this);
          NATIVE_VALUE_DESC.set.call(this, nextVal);
          const afterVal = NATIVE_VALUE_DESC.get.call(this);
          if (prevVal !== afterVal || nextVal === '') {
            instance.syncFromSelect();
          }
        }
      });
      this.select._sioValueIntercepted = true;
    }

    _refreshItemsFromSelect() {
      this.allItems = Array.from(this.select.options)
        .filter((opt) => String(opt.value).trim() !== '')
        .map((opt) => {
          const value = String(opt.value);
          const label = String(opt.textContent || '').trim();
          const code = String(opt.dataset.code || '').trim();
          const puesto = String(opt.dataset.puesto || '').trim();
          const depto = String(opt.dataset.depto || '').trim();
          const usuario = String(opt.dataset.usuario || '').trim();
          const extraMeta = String(opt.dataset.meta || '').trim();
          const searchBlob = SioSearchableSelect.normalize(
            `${label} ${value} ${code} ${puesto} ${depto} ${usuario} ${extraMeta}`
          );
          return {
            value,
            label,
            code,
            puesto,
            depto,
            usuario,
            disabled: Boolean(opt.disabled),
            searchBlob
          };
        });
    }

    _buildDom() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'sio-select sio-combo-wrapper';

      this.select.parentNode.insertBefore(this.wrapper, this.select);
      this.select.classList.add('sio-select-native');
      this.select.setAttribute('tabindex', '-1');
      this.select.setAttribute('aria-hidden', 'true');
      this.wrapper.appendChild(this.select);

      // Botón disparador accesible
      this.trigger = document.createElement('button');
      this.trigger.type = 'button';
      this.trigger.className = 'form-control sio-select-trigger is-placeholder';
      this.trigger.setAttribute('role', 'combobox');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.setAttribute('aria-haspopup', 'listbox');
      if (this.titleText) {
        this.trigger.setAttribute('aria-label', this.titleText);
      }

      this.labelSpan = document.createElement('span');
      this.labelSpan.className = 'sio-select-value';
      this.labelSpan.textContent = this.placeholder;

      const actionsWrap = document.createElement('span');
      actionsWrap.className = 'sio-select-actions';

      this.clearBtn = document.createElement('span');
      this.clearBtn.className = 'sio-select-clear is-hidden';
      this.clearBtn.setAttribute('role', 'button');
      this.clearBtn.setAttribute('tabindex', '-1');
      this.clearBtn.setAttribute('title', 'Limpiar selección');
      this.clearBtn.setAttribute('aria-label', 'Limpiar selección');
      const clearIcon = document.createElement('i');
      clearIcon.className = 'fas fa-times';
      this.clearBtn.appendChild(clearIcon);

      this.chevron = document.createElement('i');
      this.chevron.className = 'fas fa-chevron-down sio-select-chevron';

      actionsWrap.appendChild(this.clearBtn);
      actionsWrap.appendChild(this.chevron);

      this.trigger.appendChild(this.labelSpan);
      this.trigger.appendChild(actionsWrap);
      this.wrapper.appendChild(this.trigger);

      // Fondo táctil para hoja móvil
      this.backdrop = document.createElement('div');
      this.backdrop.className = 'sio-select-backdrop';
      this.wrapper.appendChild(this.backdrop);

      // Contenedor desplegable (flotante en Web, Bottom Sheet en Móvil)
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'sio-select-dropdown';

      // Cabecera exclusiva para vista móvil
      const sheetHeader = document.createElement('div');
      sheetHeader.className = 'sio-select-sheet-header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'sio-select-sheet-title-wrap';

      const eyebrow = document.createElement('span');
      eyebrow.className = 'sio-select-sheet-eyebrow';
      eyebrow.textContent = 'Seleccionar opción';

      this.sheetTitleEl = document.createElement('span');
      this.sheetTitleEl.className = 'sio-select-sheet-title';
      this.sheetTitleEl.textContent = this.titleText || 'Lista desplegable';

      titleWrap.appendChild(eyebrow);
      titleWrap.appendChild(this.sheetTitleEl);

      this.sheetCloseBtn = document.createElement('button');
      this.sheetCloseBtn.type = 'button';
      this.sheetCloseBtn.className = 'sio-select-sheet-close';
      this.sheetCloseBtn.setAttribute('aria-label', 'Cerrar selector');
      const sheetCloseIcon = document.createElement('i');
      sheetCloseIcon.className = 'fas fa-times';
      this.sheetCloseBtn.appendChild(sheetCloseIcon);

      sheetHeader.appendChild(titleWrap);
      sheetHeader.appendChild(this.sheetCloseBtn);
      this.dropdown.appendChild(sheetHeader);

      // Caja de búsqueda con autoenfoque
      const searchWrap = document.createElement('div');
      searchWrap.className = 'sio-select-search-wrap';

      const searchIcon = document.createElement('i');
      searchIcon.className = 'fas fa-search sio-select-search-icon';

      this.searchInput = document.createElement('input');
      this.searchInput.type = 'text';
      this.searchInput.className = 'sio-select-search';
      this.searchInput.placeholder = this.searchPlaceholder;
      this.searchInput.setAttribute('autocomplete', 'off');
      this.searchInput.setAttribute('autocorrect', 'off');
      this.searchInput.setAttribute('autocapitalize', 'off');
      this.searchInput.setAttribute('spellcheck', 'false');
      this.searchInput.setAttribute('data-sio-no-draft', '1');
      this.searchInput.setAttribute('aria-label', this.searchPlaceholder);

      this.searchClearBtn = document.createElement('button');
      this.searchClearBtn.type = 'button';
      this.searchClearBtn.className = 'sio-select-search-clear is-hidden';
      this.searchClearBtn.setAttribute('aria-label', 'Limpiar texto de búsqueda');
      const searchClearIcon = document.createElement('i');
      searchClearIcon.className = 'fas fa-times-circle';
      this.searchClearBtn.appendChild(searchClearIcon);

      searchWrap.appendChild(searchIcon);
      searchWrap.appendChild(this.searchInput);
      searchWrap.appendChild(this.searchClearBtn);
      this.dropdown.appendChild(searchWrap);

      // Barra de estado y atajos de teclado
      const statusBar = document.createElement('div');
      statusBar.className = 'sio-select-status';
      this.countSpan = document.createElement('span');
      this.countSpan.textContent = `${this.allItems.length} opciones`;

      const kbdHint = document.createElement('span');
      kbdHint.className = 'sio-select-kbd-hint';
      kbdHint.textContent = '↑↓ navegar • Enter elegir • Esc cerrar';

      statusBar.appendChild(this.countSpan);
      statusBar.appendChild(kbdHint);
      this.dropdown.appendChild(statusBar);

      // Lista de resultados
      this.listEl = document.createElement('ul');
      this.listEl.className = 'sio-select-list';
      this.listEl.setAttribute('role', 'listbox');
      this.dropdown.appendChild(this.listEl);

      this.wrapper.appendChild(this.dropdown);
    }

    _bindEvents() {
      this.trigger.addEventListener('click', (e) => {
        if (this.select.disabled) return;
        if (e.target.closest('.sio-select-clear')) return;
        this.toggle();
      });

      if (this.select.id) {
        const assocLabel = document.querySelector(`label[for="${CSS.escape(this.select.id)}"]`);
        if (assocLabel) {
          assocLabel.addEventListener('click', (e) => {
            if (this.select.disabled) return;
            e.preventDefault();
            this.open();
          });
        }
      }

      this.clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.select.disabled) return;
        this.clearSelection();
      });

      this.backdrop.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });

      this.sheetCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        this.trigger.focus({ preventScroll: true });
      });

      this.searchClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.searchInput.value = '';
        this.searchClearBtn.classList.add('is-hidden');
        this._renderOptions('');
        this.searchInput.focus({ preventScroll: true });
      });

      this.searchInput.addEventListener('input', (e) => {
        e.stopPropagation();
        const q = this.searchInput.value || '';
        this.searchClearBtn.classList.toggle('is-hidden', q.length === 0);
        this._renderOptions(q);
      });

      this.searchInput.addEventListener('change', (e) => {
        e.stopPropagation();
      });

      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._moveHighlight(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._moveHighlight(-1);
        } else if (e.key === 'Home') {
          if (this.filteredItems.length > 0) {
            e.preventDefault();
            this.highlightedIndex = 0;
            this._updateHighlight();
          }
        } else if (e.key === 'End') {
          if (this.filteredItems.length > 0) {
            e.preventDefault();
            this.highlightedIndex = this.filteredItems.length - 1;
            this._updateHighlight();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.highlightedIndex >= 0 && this.filteredItems[this.highlightedIndex]) {
            this.selectValue(this.filteredItems[this.highlightedIndex].value);
          } else if (this.filteredItems.length === 1) {
            this.selectValue(this.filteredItems[0].value);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.close();
          this.trigger.focus({ preventScroll: true });
        } else if (e.key === 'Tab') {
          this.close();
        }
      });

      this.trigger.addEventListener('keydown', (e) => {
        if (this.select.disabled) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.open();
        } else if (
          e.key.length === 1 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          e.preventDefault();
          this.open(e.key);
        }
      });

      this.listEl.addEventListener('mousemove', (e) => {
        const li = e.target.closest('.sio-select-option[data-idx]');
        if (!li) return;
        const idx = parseInt(li.dataset.idx, 10);
        if (Number.isInteger(idx) && idx !== this.highlightedIndex) {
          this.highlightedIndex = idx;
          this._updateHighlight(false);
        }
      });

      this.listEl.addEventListener('click', (e) => {
        const li = e.target.closest('.sio-select-option[data-value]');
        if (!li || li.getAttribute('aria-disabled') === 'true') return;
        this.selectValue(li.dataset.value);
      });

      this.select.addEventListener('change', () => {
        this.syncFromSelect();
      });

      this._onDocumentClick = (e) => {
        if (this.isOpen && !this.wrapper.contains(e.target)) {
          this.close();
        }
      };
      document.addEventListener('click', this._onDocumentClick);
    }

    _observeSelectMutations() {
      if (typeof MutationObserver !== 'function') return;
      this._observer = new MutationObserver((mutations) => {
        if (this._suppressMutation) return;
        let optionsChanged = false;
        let stateChanged = false;
        for (const m of mutations) {
          if (m.type === 'childList') {
            optionsChanged = true;
          } else if (m.type === 'attributes') {
            stateChanged = true;
          }
        }
        if (optionsChanged) {
          this._refreshItemsFromSelect();
          this.syncFromSelect();
          if (this.isOpen) {
            this._renderOptions(this.searchInput.value);
          }
        }
        if (stateChanged) {
          this._syncValidationAndDisabledState();
        }
      });
      this._observer.observe(this.select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'disabled']
      });
    }

    _syncValidationAndDisabledState() {
      const isDisabled = Boolean(this.select.disabled);
      this.trigger.disabled = isDisabled;
      this.trigger.classList.toggle('is-disabled', isDisabled);

      const hasInvalid =
        this.select.classList.contains('is-invalid') ||
        this.select.classList.contains('sio-field-invalid');
      this.trigger.classList.toggle('is-invalid', hasInvalid);
      this.trigger.classList.toggle('sio-field-invalid', hasInvalid);
    }

    _renderOptions(query = '') {
      const normQuery = SioSearchableSelect.normalize(query);
      const tokens = normQuery ? normQuery.split(/\s+/).filter(Boolean) : [];

      this.filteredItems = tokens.length > 0
        ? this.allItems.filter((item) => tokens.every((tok) => item.searchBlob.includes(tok)))
        : [...this.allItems];

      this.listEl.replaceChildren();

      const totalCount = this.allItems.length;
      const matchCount = this.filteredItems.length;
      this.countSpan.textContent = tokens.length > 0
        ? `${matchCount} de ${totalCount} coincidencia${matchCount === 1 ? '' : 's'}`
        : `${totalCount} opci${totalCount === 1 ? 'ón disponible' : 'ones disponibles'}`;

      if (matchCount === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'sio-select-empty';
        const icon = document.createElement('i');
        icon.className = 'fas fa-search';
        const span = document.createElement('span');
        span.textContent = this.emptyText;
        emptyLi.appendChild(icon);
        emptyLi.appendChild(span);
        this.listEl.appendChild(emptyLi);
        this.highlightedIndex = -1;
        return;
      }

      const currentVal = String(this.select.value || '');
      let selectedIdx = -1;

      this.filteredItems.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'sio-select-option';
        li.setAttribute('role', 'option');
        li.dataset.value = item.value;
        li.dataset.idx = String(idx);
        if (item.disabled) {
          li.setAttribute('aria-disabled', 'true');
        }

        const mainDiv = document.createElement('div');
        mainDiv.className = 'sio-select-opt-main';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'sio-select-opt-label';
        labelSpan.textContent = item.label;
        mainDiv.appendChild(labelSpan);

        const normLabel = SioSearchableSelect.normalize(item.label);
        const showCode = item.code && !normLabel.includes(SioSearchableSelect.normalize(item.code));
        const showPuesto = item.puesto && !normLabel.includes(SioSearchableSelect.normalize(item.puesto));

        if (showCode || showPuesto) {
          const metaRow = document.createElement('div');
          metaRow.className = 'sio-select-opt-meta';
          if (showCode) {
            const codeTag = document.createElement('span');
            codeTag.className = 'sio-select-opt-tag';
            codeTag.textContent = `Cód: ${item.code}`;
            metaRow.appendChild(codeTag);
          }
          if (showPuesto) {
            const puestoTag = document.createElement('span');
            puestoTag.className = 'sio-select-opt-tag';
            puestoTag.textContent = item.puesto;
            metaRow.appendChild(puestoTag);
          }
          mainDiv.appendChild(metaRow);
        }

        li.appendChild(mainDiv);

        if (item.value === currentVal) {
          li.classList.add('is-selected');
          li.setAttribute('aria-selected', 'true');
          selectedIdx = idx;

          const checkIcon = document.createElement('i');
          checkIcon.className = 'fas fa-check sio-select-opt-check';
          li.appendChild(checkIcon);
        } else {
          li.setAttribute('aria-selected', 'false');
        }

        this.listEl.appendChild(li);
      });

      this.highlightedIndex = selectedIdx >= 0 ? selectedIdx : 0;
      this._updateHighlight(true);
    }

    _moveHighlight(delta) {
      if (this.filteredItems.length === 0) return;
      const len = this.filteredItems.length;
      this.highlightedIndex = (this.highlightedIndex + delta + len) % len;
      this._updateHighlight(true);
    }

    _updateHighlight(scrollIntoView = true) {
      const optionEls = this.listEl.querySelectorAll('.sio-select-option');
      optionEls.forEach((el, idx) => {
        if (idx === this.highlightedIndex) {
          el.classList.add('is-highlighted');
          if (scrollIntoView) {
            el.scrollIntoView({ block: 'nearest' });
          }
        } else {
          el.classList.remove('is-highlighted');
        }
      });
    }

    _computeDropDirection() {
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        this.wrapper.classList.remove('drop-up');
        return;
      }
      const rect = this.trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 290 && spaceAbove > spaceBelow) {
        this.wrapper.classList.add('drop-up');
      } else {
        this.wrapper.classList.remove('drop-up');
      }
    }

    open(initialQuery = '') {
      if (this.isOpen || this.select.disabled) return;
      if (_openInstance && _openInstance !== this) {
        _openInstance.close();
      }
      _openInstance = this;
      this.isOpen = true;

      this._refreshItemsFromSelect();
      this._computeDropDirection();
      this.setInvalid(false);
      this.wrapper.classList.add('is-open');
      this.trigger.setAttribute('aria-expanded', 'true');

      this.searchInput.value = initialQuery;
      this.searchClearBtn.classList.toggle('is-hidden', !initialQuery);
      this._renderOptions(initialQuery);

      requestAnimationFrame(() => {
        try {
          this.searchInput.focus({ preventScroll: true });
          if (initialQuery) {
            const len = initialQuery.length;
            this.searchInput.setSelectionRange(len, len);
          }
        } catch (_) {
          this.searchInput.focus();
        }
      });
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      if (_openInstance === this) {
        _openInstance = null;
      }
      this.wrapper.classList.remove('is-open', 'drop-up');
      this.trigger.setAttribute('aria-expanded', 'false');
    }

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    selectValue(value) {
      const strVal = String(value ?? '');
      this._suppressMutation = true;
      this.select.classList.remove('is-invalid', 'sio-field-invalid');
      this._suppressMutation = false;

      if (NATIVE_VALUE_DESC) {
        NATIVE_VALUE_DESC.set.call(this.select, strVal);
      } else {
        this.select.value = strVal;
      }

      this.setInvalid(false);
      this.syncFromSelect();
      this.close();
      this.select.dispatchEvent(new Event('input', { bubbles: true }));
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
      try {
        this.trigger.focus({ preventScroll: true });
      } catch (_) {
        this.trigger.focus();
      }
    }

    clearSelection() {
      if (!this.allowClear) return;
      if (NATIVE_VALUE_DESC) {
        NATIVE_VALUE_DESC.set.call(this.select, '');
      } else {
        this.select.value = '';
      }
      this.setInvalid(false);
      this.syncFromSelect();
      this.close();
      this.select.dispatchEvent(new Event('input', { bubbles: true }));
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    syncFromSelect() {
      const val = String(
        NATIVE_VALUE_DESC ? NATIVE_VALUE_DESC.get.call(this.select) : (this.select.value || '')
      ).trim();
      let matched = this.allItems.find((item) => item.value === val);
      if (!matched && val !== '') {
        this._refreshItemsFromSelect();
        matched = this.allItems.find((item) => item.value === val);
      }

      if (matched) {
        this.labelSpan.textContent = matched.label;
        this.trigger.classList.remove('is-placeholder');
        this.clearBtn.classList.toggle('is-hidden', !this.allowClear);
      } else {
        this.labelSpan.textContent = this.placeholder;
        this.trigger.classList.add('is-placeholder');
        this.clearBtn.classList.add('is-hidden');
      }
      this._syncValidationAndDisabledState();
    }

    setInvalid(isInvalid) {
      const flag = Boolean(isInvalid);
      this.trigger.classList.toggle('is-invalid', flag);
      this.trigger.classList.toggle('sio-field-invalid', flag);
      if (!flag) {
        this._suppressMutation = true;
        this.select.classList.remove('is-invalid', 'sio-field-invalid');
        this._suppressMutation = false;
      }
    }
  }

  function shouldAutoEnhancePage() {
    if (document.querySelector('[data-searchable-select="true"]')) return true;
    try {
      const ctxEl = document.getElementById('sioOfflineContextJson');
      if (ctxEl && ctxEl.textContent) {
        const ctx = JSON.parse(ctxEl.textContent);
        const fmt = String(ctx.formatoId || '').trim().toLowerCase();
        const cli = String(ctx.cliente || ctx.vuelo?.operador || '').trim().toUpperCase();
        if (fmt.startsWith('amx-') || cli.includes('AEROMEXICO')) {
          return true;
        }
      }
    } catch (_) {}

    const fmtHidden = document.querySelector('input[id$="FormatoId"], input[name="formatoId"]');
    if (fmtHidden && String(fmtHidden.value || '').trim().toLowerCase().startsWith('amx-')) {
      return true;
    }
    return false;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (shouldAutoEnhancePage()) {
      const mainScope = document.querySelector('main') || document;
      SioSearchableSelect.initAll(mainScope);
    } else {
      document.querySelectorAll('select[data-searchable="true"]').forEach((sel) => {
        SioSearchableSelect.enhance(sel);
      });
    }
  });

  window.SioSearchableSelect = SioSearchableSelect;
})(window, document);
