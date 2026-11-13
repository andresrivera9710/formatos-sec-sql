/**
 * SioSearchableCombo - Cuadro combinado con búsqueda integrada (CSP-safe)
 * Mejora un <select> nativo sin librerías externas ni manejadores inline.
 */
class SioSearchableCombo {
  /**
   * @param {HTMLSelectElement} selectEl
   * @param {Object} [options]
   * @param {string} [options.placeholder]
   * @param {string} [options.searchPlaceholder]
   * @param {string} [options.emptyText]
   */
  constructor(selectEl, options = {}) {
    if (!selectEl) return;

    this.select = selectEl;
    this.placeholder = options.placeholder || '-- Seleccione una aerolínea / operador --';
    this.searchPlaceholder = options.searchPlaceholder || 'Escribir para buscar aerolínea...';
    this.emptyText = options.emptyText || 'No se encontraron coincidencias.';
    this.isOpen = false;
    this.highlightedIndex = -1;
    this.filteredItems = [];

    this.allItems = Array.from(this.select.options)
      .filter((opt) => {
        const v = String(opt.value).trim();
        if (v === '') return false;
        const num = Number(v);
        return Number.isNaN(num) || num > 0;
      })
      .map((opt) => ({
        value: String(opt.value),
        label: String(opt.textContent || '').trim(),
        normalized: SioSearchableCombo.normalize(opt.textContent || '')
      }));

    this._buildDom();
    this._bindEvents();
    this.syncFromSelect();
  }

  /**
   * Normaliza texto para búsquedas sin distinguir mayúsculas ni acentos
   */
  static normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  _buildDom() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'sio-combo';

    // Insertar wrapper alrededor del select y ocultarlo visualmente manteniendo accesibilidad
    this.select.parentNode.insertBefore(this.wrapper, this.select);
    this.select.classList.add('sio-combo-native');
    this.select.setAttribute('tabindex', '-1');
    this.select.setAttribute('aria-hidden', 'true');
    this.wrapper.appendChild(this.select);

    // Botón disparador principal
    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'form-control sio-combo-trigger is-placeholder';
    this.trigger.setAttribute('role', 'combobox');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-haspopup', 'listbox');

    this.labelSpan = document.createElement('span');
    this.labelSpan.className = 'sio-combo-value';
    this.labelSpan.textContent = this.placeholder;

    const actionsWrap = document.createElement('span');
    actionsWrap.className = 'sio-combo-actions';

    this.clearBtn = document.createElement('span');
    this.clearBtn.className = 'sio-combo-clear';
    this.clearBtn.setAttribute('role', 'button');
    this.clearBtn.setAttribute('tabindex', '-1');
    this.clearBtn.setAttribute('title', 'Limpiar selección');
    this.clearBtn.setAttribute('aria-label', 'Limpiar selección');
    this.clearBtn.innerHTML = '<i class="fas fa-times"></i>';
    this.clearBtn.style.display = 'none';

    this.chevron = document.createElement('i');
    this.chevron.className = 'fas fa-chevron-down sio-combo-chevron';

    actionsWrap.appendChild(this.clearBtn);
    actionsWrap.appendChild(this.chevron);

    this.trigger.appendChild(this.labelSpan);
    this.trigger.appendChild(actionsWrap);
    this.wrapper.appendChild(this.trigger);

    // Panel desplegable con campo de búsqueda
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'sio-combo-dropdown';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'sio-combo-search-wrap';

    const searchIcon = document.createElement('i');
    searchIcon.className = 'fas fa-search sio-combo-search-icon';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'sio-combo-search';
    this.searchInput.placeholder = this.searchPlaceholder;
    this.searchInput.setAttribute('autocomplete', 'off');
    this.searchInput.setAttribute('aria-label', 'Buscar aerolínea u operador');

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(this.searchInput);
    this.dropdown.appendChild(searchWrap);

    this.listEl = document.createElement('ul');
    this.listEl.className = 'sio-combo-list';
    this.listEl.setAttribute('role', 'listbox');
    this.dropdown.appendChild(this.listEl);

    this.wrapper.appendChild(this.dropdown);
  }

  _bindEvents() {
    this.trigger.addEventListener('click', (e) => {
      if (e.target.closest('.sio-combo-clear')) return;
      this.toggle();
    });

    if (this.select.id) {
      const assocLabel = document.querySelector(`label[for="${this.select.id}"]`);
      if (assocLabel) {
        assocLabel.addEventListener('click', (e) => {
          e.preventDefault();
          this.open();
        });
      }
    }

    this.clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clearSelection();
    });

    this.searchInput.addEventListener('input', () => {
      this._renderOptions(this.searchInput.value);
    });

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._moveHighlight(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveHighlight(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.highlightedIndex >= 0 && this.filteredItems[this.highlightedIndex]) {
          this.selectValue(this.filteredItems[this.highlightedIndex].value);
        } else if (this.filteredItems.length === 1) {
          this.selectValue(this.filteredItems[0].value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        this.trigger.focus();
      } else if (e.key === 'Tab') {
        this.close();
      }
    });

    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
      }
    });

    this.listEl.addEventListener('click', (e) => {
      const li = e.target.closest('.sio-combo-option[data-value]');
      if (!li) return;
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

  _renderOptions(query = '') {
    const normQuery = SioSearchableCombo.normalize(query);
    this.filteredItems = normQuery
      ? this.allItems.filter((item) => item.normalized.includes(normQuery))
      : [...this.allItems];

    this.listEl.innerHTML = '';

    if (this.filteredItems.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'sio-combo-empty';
      emptyLi.textContent = this.emptyText;
      this.listEl.appendChild(emptyLi);
      this.highlightedIndex = -1;
      return;
    }

    const currentVal = String(this.select.value || '');
    let selectedIdx = -1;

    this.filteredItems.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'sio-combo-option';
      li.setAttribute('role', 'option');
      li.dataset.value = item.value;

      const textSpan = document.createElement('span');
      textSpan.textContent = item.label;
      li.appendChild(textSpan);

      if (item.value === currentVal) {
        li.classList.add('is-selected');
        li.setAttribute('aria-selected', 'true');
        selectedIdx = idx;

        const checkIcon = document.createElement('i');
        checkIcon.className = 'fas fa-check';
        li.appendChild(checkIcon);
      } else {
        li.setAttribute('aria-selected', 'false');
      }

      this.listEl.appendChild(li);
    });

    this.highlightedIndex = selectedIdx >= 0 ? selectedIdx : 0;
    this._updateHighlight();
  }

  _moveHighlight(delta) {
    if (this.filteredItems.length === 0) return;
    const len = this.filteredItems.length;
    this.highlightedIndex = (this.highlightedIndex + delta + len) % len;
    this._updateHighlight();
  }

  _updateHighlight() {
    const optionEls = this.listEl.querySelectorAll('.sio-combo-option');
    optionEls.forEach((el, idx) => {
      if (idx === this.highlightedIndex) {
        el.classList.add('is-highlighted');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('is-highlighted');
      }
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.setInvalid(false);
    this.wrapper.classList.add('open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.searchInput.value = '';
    this._renderOptions('');
    requestAnimationFrame(() => {
      this.searchInput.focus();
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.wrapper.classList.remove('open');
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
    const strVal = String(value || '');
    this.select.value = strVal;
    this.setInvalid(false);
    this.syncFromSelect();
    this.close();
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    this.trigger.focus();
  }

  clearSelection() {
    this.select.value = '';
    this.setInvalid(false);
    this.syncFromSelect();
    this.close();
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  syncFromSelect() {
    const val = String(this.select.value || '').trim();
    const matched = this.allItems.find((item) => item.value === val);

    if (matched) {
      this.labelSpan.textContent = matched.label;
      this.trigger.classList.remove('is-placeholder');
      this.clearBtn.style.display = 'inline-flex';
    } else {
      this.labelSpan.textContent = this.placeholder;
      this.trigger.classList.add('is-placeholder');
      this.clearBtn.style.display = 'none';
    }
  }

  setInvalid(isInvalid) {
    if (isInvalid) {
      this.trigger.classList.add('is-invalid');
    } else {
      this.trigger.classList.remove('is-invalid');
    }
  }
}

window.SioSearchableCombo = SioSearchableCombo;
