/**
 * Controlador Frontend para Control de Perimétrica Unificado (*-cp)
 * 100% compatible con Helmet CSP estricto (sin manejadores inline).
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formControlPerimetrica');
  if (!form) return;

  const Validator = window.SioFormatValidator;

  const esc = (str) => {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str ?? '')
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

  const extractHHMM = (val) => {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('T') && s.length >= 16) return s.substring(11, 16);
    const match = s.match(/(\d{2}:\d{2})/);
    return match ? match[1] : '';
  };

  const cpFormatoId = String(document.getElementById('cpFormatoId')?.value || '').trim().toLowerCase();
  const isAmxCP = cpFormatoId === 'amx-cp';

  const normalizeCpNombre = (val) => {
    const clean = String(val || '').trim();
    return isAmxCP ? clean.toUpperCase() : clean;
  };

  const focusNoScroll = (el) => {
    if (!el || typeof el.focus !== 'function') return;
    try {
      el.focus({ preventScroll: true });
    } catch (_) {
      el.focus();
    }
  };

  const preserveViewportScroll = (fn) => {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const res = fn();
    window.scrollTo(sx, sy);
    window.requestAnimationFrame(() => window.scrollTo(sx, sy));
    return res;
  };

  // Cargar datos iniciales hidratados desde Azure SQL
  const bootstrapEl = document.getElementById('cpBootstrapData');
  let rawRegistros = [];
  let rawAleros = [];
  try {
    rawRegistros = JSON.parse(bootstrapEl?.dataset?.registros || '[]');
  } catch (_) {
    rawRegistros = [];
  }
  try {
    rawAleros = JSON.parse(bootstrapEl?.dataset?.aleros || '[]');
  } catch (_) {
    rawAleros = [];
  }

  let registros = (Array.isArray(rawRegistros) ? rawRegistros : []).map((r) => ({
    DetalleCPId: parseInt(r.DetalleCPId, 10) || 0,
    Nombre: normalizeCpNombre(r.Nombre),
    NoTIA: String(r.NoTIA || '').trim(),
    HoraIngreso: extractHHMM(r.HoraIngreso),
    Empresa: String(r.Empresa || '').trim(),
    Motivo: String(r.Motivo || '').trim(),
    HoraSalida: extractHHMM(r.HoraSalida || r.HoraSalidaReal || r.HoraSalidaEstimada)
  }));

  let aleros = (Array.isArray(rawAleros) ? rawAleros : [])
    .map((a) => ({
      EmpleadoId: parseInt(a.EmpleadoId, 10) || 0,
      Nombre: String(a.Nombre || '').trim()
    }))
    .filter((a) => a.EmpleadoId > 0)
    .slice(0, 2);

  const initialRegistrosBaseline = registros.map((r) => ({ ...r }));
  const initialAlerosBaseline = aleros.map((a) => ({ ...a }));

  const normalizeCpRegistros = (list) => (Array.isArray(list) ? list : []).map((r) => ({
    DetalleCPId: parseInt(r.DetalleCPId, 10) || 0,
    Nombre: normalizeCpNombre(r.Nombre),
    NoTIA: String(r.NoTIA || '').trim(),
    HoraIngreso: extractHHMM(r.HoraIngreso),
    Empresa: String(r.Empresa || '').trim(),
    Motivo: String(r.Motivo || '').trim(),
    HoraSalida: extractHHMM(r.HoraSalida || r.HoraSalidaReal || r.HoraSalidaEstimada)
  }));

  const normalizeCpAleros = (list) => (Array.isArray(list) ? list : [])
    .map((a) => ({
      EmpleadoId: parseInt(a.EmpleadoId, 10) || 0,
      Nombre: String(a.Nombre || '').trim()
    }))
    .filter((a) => a.EmpleadoId > 0)
    .slice(0, 2);

  // Inicializar cuadros combinados con búsqueda integrada
  const selSupervisor = document.getElementById('cpSupervisor');
  const selEmpresa = document.getElementById('cpRegEmpresa');
  const selTractorista = document.getElementById('cpTractorista');
  const selNoUnidad = document.getElementById('cpNoUnidad');
  const selAlero = document.getElementById('cpAleroSelect');

  const createSearchableControl = (el, opts) => {
    if (!el) return null;
    if (window.SioSearchableSelect && typeof window.SioSearchableSelect.enhance === 'function') {
      return window.SioSearchableSelect.enhance(el, opts);
    }
    if (window.SioSearchableCombo) {
      return new window.SioSearchableCombo(el, opts);
    }
    return null;
  };

  const comboSupervisor = createSearchableControl(selSupervisor, {
    placeholder: '-- Seleccione el Supervisor --',
    searchPlaceholder: 'Buscar supervisor por nombre, código o puesto...',
    emptyText: 'No se encontró el supervisor.'
  });

  const comboEmpresa = createSearchableControl(selEmpresa, {
    placeholder: '-- Seleccione la Empresa --',
    searchPlaceholder: 'Buscar empresa...',
    emptyText: 'No se encontró la empresa.'
  });

  const comboTractorista = createSearchableControl(selTractorista, {
    placeholder: '-- Seleccione a la persona que realiza PushBack --',
    searchPlaceholder: 'Buscar tractorista por nombre, código o puesto...',
    emptyText: 'No se encontró empleado.'
  });

  const comboNoUnidad = createSearchableControl(selNoUnidad, {
    placeholder: '-- Seleccione la unidad --',
    searchPlaceholder: 'Buscar No. de Unidad o tipo...',
    emptyText: 'No se encontró unidad.'
  });

  const comboAlero = createSearchableControl(selAlero, {
    placeholder: '-- Seleccionar agentes para aleros --',
    searchPlaceholder: 'Buscar agente por nombre, código o puesto...',
    emptyText: 'No se encontró agente.'
  });

  // Referencias del DOM
  const inputArribo = document.getElementById('cpArriboVuelo');
  const inputHoraAsegurado = document.getElementById('cpHoraAsegurado');
  const inputFecha = document.getElementById('cpFecha');
  const inputHoraRevision = document.getElementById('cpHoraRevision');
  const inputAgentesIds = document.getElementById('cpAgentesEmpleadoIds');
  const inputObservaciones = document.getElementById('cpObservaciones');

  const inputRegNombre = document.getElementById('cpRegNombre');
  const inputRegNoTIA = document.getElementById('cpRegNoTIA');
  const inputRegHoraIngreso = document.getElementById('cpRegHoraIngreso');
  const grupoEmpresaOtros = document.getElementById('grupoCpEmpresaOtros');
  const inputRegEmpresaOtros = document.getElementById('cpRegEmpresaOtros');
  const inputRegMotivo = document.getElementById('cpRegMotivo');

  const inputBuscador = document.getElementById('cpBuscador');
  const badgeEstadoEl = document.getElementById('cpRegistrosEstadoBadge');
  const listaRegistrosEl = document.getElementById('cpRegistrosLista');
  const listaAlerosEl = document.getElementById('cpAlerosLista');

  // Botones rápidos de reloj ("Ahora")
  const bindClockButton = (btnId, targetInput) => {
    const btn = document.getElementById(btnId);
    if (btn && targetInput) {
      btn.addEventListener('click', () => {
        targetInput.value = nowHHMM();
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  };
  bindClockButton('btnCpHoraAseguradaActual', inputHoraAsegurado);
  bindClockButton('btnCpHoraRevisionActual', inputHoraRevision);
  bindClockButton('btnCpHoraIngresoActual', inputRegHoraIngreso);

  // Regla AEROMEXICO CP: Nombre siempre en MAYÚSCULAS en tiempo real (Web + Móvil)
  if (inputRegNombre && isAmxCP) {
    const forceUppercaseNombre = () => {
      const raw = inputRegNombre.value;
      const upper = raw.toUpperCase();
      if (raw !== upper) {
        const start = inputRegNombre.selectionStart;
        const end = inputRegNombre.selectionEnd;
        inputRegNombre.value = upper;
        if (typeof start === 'number' && typeof end === 'number') {
          try {
            inputRegNombre.setSelectionRange(start, end);
          } catch (_) {}
        }
      }
    };
    inputRegNombre.addEventListener('input', forceUppercaseNombre);
    inputRegNombre.addEventListener('change', forceUppercaseNombre);
  }

  // Toggle campo manual cuando Empresa === 'OTROS...'
  if (selEmpresa && grupoEmpresaOtros) {
    selEmpresa.addEventListener('change', () => {
      if (selEmpresa.value === 'OTROS...') {
        grupoEmpresaOtros.style.display = 'block';
        focusNoScroll(inputRegEmpresaOtros);
      } else {
        grupoEmpresaOtros.style.display = 'none';
        if (inputRegEmpresaOtros) inputRegEmpresaOtros.value = '';
      }
    });
  }

  // Renderizado del listado de registros con filtro del buscador
  const renderRegistros = () => {
    if (!listaRegistrosEl) return;

    const query = String(inputBuscador?.value || '').trim().toLowerCase();
    const total = registros.length;
    const pendientes = registros.filter((r) => !r.HoraSalida || r.HoraSalida.trim() === '').length;

    if (badgeEstadoEl) {
      if (total === 0) {
        badgeEstadoEl.innerHTML = '<span class="cp-tag-pill"><i class="fas fa-info-circle"></i> 0 registros</span>';
      } else if (pendientes > 0) {
        badgeEstadoEl.innerHTML = `<span class="cp-badge-pending"><i class="fas fa-exclamation-triangle"></i> ${pendientes} sin salida / ${total} total</span>`;
      } else {
        badgeEstadoEl.innerHTML = `<span class="cp-tag-pill" style="color: var(--success); border-color: #BBF7D0; background-color: #F0FDF4;"><i class="fas fa-check-circle"></i> ${total} registros completos</span>`;
      }
    }

    const indexed = registros
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        if (!query) return true;
        const haystack = `${item.Nombre} ${item.NoTIA} ${item.Empresa} ${item.Motivo} ${item.HoraIngreso} ${item.HoraSalida}`.toLowerCase();
        return haystack.includes(query);
      });

    if (indexed.length === 0) {
      listaRegistrosEl.innerHTML = total === 0
        ? '<div class="cp-empty-dashed" style="grid-column: 1 / -1;"><i class="fas fa-user-clock"></i> No hay ingresos registrados en esta inspección perimétrica todavía.</div>'
        : '<div class="cp-empty-dashed" style="grid-column: 1 / -1;"><i class="fas fa-search"></i> No se encontraron registros que coincidan con la búsqueda.</div>';
      return;
    }

    listaRegistrosEl.innerHTML = indexed.map(({ item, idx }) => {
      const hasSalida = Boolean(item.HoraSalida && item.HoraSalida.trim() !== '');
      const statusClass = hasSalida ? 'is-done' : 'is-pending';
      const salidaHtml = hasSalida
        ? `<span><i class="fas fa-sign-out-alt" style="color: var(--success);"></i> ${esc(item.HoraSalida)}</span>`
        : '<span class="cp-badge-pending"><i class="fas fa-exclamation-circle"></i> Pendiente</span>';

      return `
        <div class="cp-reg-card" data-record-json="${esc(JSON.stringify(item))}">
          <div class="cp-reg-topbar ${statusClass}"></div>
          <div class="cp-reg-body">
            <div class="cp-reg-header">
              <div class="cp-reg-identity">
                <div class="cp-reg-num ${statusClass}">
                  <small>NO.</small>
                  <strong>${idx + 1}</strong>
                </div>
                <div style="min-width: 0;">
                  <div style="font-size: 14px; font-weight: 700; color: var(--brand); word-break: break-word;">
                    ${esc(item.Nombre)}
                  </div>
                  <div class="cp-reg-tags" style="margin-top: 4px;">
                    <span class="cp-tag-pill"><i class="fas fa-id-badge"></i> TIA: ${esc(item.NoTIA)}</span>
                    <span class="cp-tag-pill"><i class="fas fa-building"></i> ${esc(item.Empresa)}</span>
                  </div>
                </div>
              </div>

              <div class="cp-reg-actions">
                <button
                  type="button"
                  class="cp-icon-btn clock btn-cp-marcar-salida"
                  data-index="${idx}"
                  title="${hasSalida ? 'Hora de salida registrada' : 'Marcar hora de salida actual'}"
                  ${hasSalida ? 'disabled' : ''}
                >
                  <i class="far fa-clock"></i>
                </button>
                <button
                  type="button"
                  class="cp-icon-btn trash btn-cp-eliminar-registro"
                  data-index="${idx}"
                  title="Eliminar registro"
                >
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>

            <div class="cp-reg-times">
              <div class="cp-reg-time-col">
                <small>Hora de Ingreso</small>
                <div class="cp-reg-time-val">
                  <i class="fas fa-sign-in-alt" style="color: var(--brand-2);"></i>
                  <span>${esc(item.HoraIngreso || '--:--')}</span>
                </div>
              </div>
              <div class="cp-reg-time-col">
                <small>Hora de Salida</small>
                <div class="cp-reg-time-val">${salidaHtml}</div>
              </div>
            </div>

            <div class="cp-reg-motivo">
              <strong>Motivo:</strong> ${esc(item.Motivo)}
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  // Agregar nuevo registro desde el subformulario REGISTRO (con reseteo selectivo conservando Empresa y sin saltos de scroll)
  const btnAgregarRegistro = document.getElementById('btnCpAgregarRegistro');
  let lastCpPointerTarget = null;
  let lastCpPointerTimestamp = 0;
  let cpShiftHeld = false;

  document.addEventListener('pointerdown', (e) => {
    lastCpPointerTarget = e.target;
    lastCpPointerTimestamp = Date.now();
  }, true);

  const wasRecentCpPointerOn = (el) => {
    if (!el || !lastCpPointerTarget) return false;
    if (Date.now() - lastCpPointerTimestamp > 450) return false;
    return lastCpPointerTarget === el || (typeof el.contains === 'function' && el.contains(lastCpPointerTarget));
  };

  const hadRecentCpPointerAnywhere = () =>
    Boolean(lastCpPointerTarget) && (Date.now() - lastCpPointerTimestamp <= 450);

  const agregarRegistroCP = (opts = {}) => {
    const silentIncomplete = Boolean(opts.silentIncomplete);
    const nombre = normalizeCpNombre(inputRegNombre?.value || '');
    const noTia = String(inputRegNoTIA?.value || '').trim();
    const horaIngreso = extractHHMM(inputRegHoraIngreso?.value || '');
    const empresaSel = String(selEmpresa?.value || '').trim();
    const empresaFinal = empresaSel === 'OTROS...'
      ? String(inputRegEmpresaOtros?.value || '').trim()
      : empresaSel;
    const motivo = String(inputRegMotivo?.value || '').trim();

    if (!nombre || !noTia || !horaIngreso || !empresaFinal || !motivo) {
      if (silentIncomplete) return false;
      if (!empresaSel && comboEmpresa) comboEmpresa.setInvalid(true);
      Swal.fire({
        icon: 'warning',
        title: 'Campos Incompletos en Registro',
        text: 'Por favor complete Nombre, No. TIA, Hora de Ingreso, Empresa y Motivo antes de agregar.',
        confirmButtonColor: '#275B88',
        returnFocus: false
      });
      return false;
    }

    if (!/^\d+$/.test(noTia)) {
      if (silentIncomplete) return false;
      Validator?.markElementInvalid(inputRegNoTIA);
      Swal.fire({
        icon: 'warning',
        title: 'No. TIA Inválido',
        text: 'El campo No. TIA debe contener únicamente valores numéricos (dígitos del 0 al 9).',
        confirmButtonColor: '#275B88',
        returnFocus: false
      });
      focusNoScroll(inputRegNoTIA);
      return false;
    }

    preserveViewportScroll(() => {
      registros.push({
        DetalleCPId: 0,
        Nombre: nombre,
        NoTIA: noTia,
        HoraIngreso: horaIngreso,
        Empresa: empresaFinal,
        Motivo: motivo,
        HoraSalida: ''
      });

      // Reseteo selectivo: limpia todos los campos de captura EXCEPTUANDO Empresa
      if (inputRegNombre) inputRegNombre.value = '';
      if (inputRegNoTIA) inputRegNoTIA.value = '';
      if (inputRegHoraIngreso) inputRegHoraIngreso.value = '';
      if (inputRegMotivo) inputRegMotivo.value = '';
      if (empresaSel !== 'OTROS...') {
        if (inputRegEmpresaOtros) inputRegEmpresaOtros.value = '';
        if (grupoEmpresaOtros) grupoEmpresaOtros.style.display = 'none';
      }

      renderRegistros();
      window.SioOfflineManager?.notifyStateChange?.();
      focusNoScroll(inputRegNombre);
    });

    return true;
  };

  if (btnAgregarRegistro) {
    btnAgregarRegistro.addEventListener('click', () => {
      agregarRegistroCP();
    });
  }

  // Avance rápido sin saltos de scroll entre campos de REGISTRO + Guardado automático al dar Enter o Sig. en Motivo
  const focusEmpresaOrMotivo = () => {
    const currentEmp = String(selEmpresa?.value || '').trim();
    if (currentEmp && (currentEmp !== 'OTROS...' || String(inputRegEmpresaOtros?.value || '').trim())) {
      focusNoScroll(inputRegMotivo);
      return;
    }
    const comboTrigger = selEmpresa?.closest('.sio-select, .sio-combo, .sio-combo-wrapper')?.querySelector('button, .sio-select-trigger, .sio-combo-trigger');
    focusNoScroll(comboTrigger || selEmpresa || inputRegMotivo);
  };

  const bindEnterAdvance = (el, nextFn) => {
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
      if (!isEnter) return;
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      preserveViewportScroll(nextFn);
    });
  };

  bindEnterAdvance(inputRegNombre, () => focusNoScroll(inputRegNoTIA));
  bindEnterAdvance(inputRegNoTIA, () => focusNoScroll(inputRegHoraIngreso));
  bindEnterAdvance(inputRegHoraIngreso, focusEmpresaOrMotivo);
  bindEnterAdvance(inputRegEmpresaOtros, () => focusNoScroll(inputRegMotivo));

  if (inputRegMotivo) {
    inputRegMotivo.addEventListener('keydown', (e) => {
      cpShiftHeld = Boolean(e.shiftKey);
      const isEnter = (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) && !e.shiftKey;
      const isNextKey = e.key === 'Next' || e.key === 'Go' || (e.key === 'Tab' && !e.shiftKey);

      if (isEnter) {
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        agregarRegistroCP();
        return;
      }

      if (isNextKey && String(inputRegMotivo.value || '').trim() !== '') {
        e.preventDefault();
        agregarRegistroCP();
      }
    });

    inputRegMotivo.addEventListener('keyup', (e) => {
      cpShiftHeld = Boolean(e.shiftKey);
    });

    // Soporte IME / Gboard / iOS Return en <textarea> cuando emite insertLineBreak/insertParagraph
    inputRegMotivo.addEventListener('beforeinput', (e) => {
      if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !cpShiftHeld) {
        e.preventDefault();
        agregarRegistroCP();
      }
    });

    // Soporte tecla móvil "Sig." cuando desplaza el foco fuera de Motivo sin disparar Enter
    const handleMotivoMobileNext = () => {
      const motivoVal = String(inputRegMotivo.value || '').trim();
      if (!motivoVal) return;
      if (wasRecentCpPointerOn(btnAgregarRegistro)) return;
      if (!hadRecentCpPointerAnywhere() || wasRecentCpPointerOn(inputRegMotivo)) {
        agregarRegistroCP({ silentIncomplete: true });
      }
    };

    inputRegMotivo.addEventListener('change', handleMotivoMobileNext);
    inputRegMotivo.addEventListener('blur', handleMotivoMobileNext);
  }

  // Delegación de eventos en tarjetas de Registro (Marcar salida / Eliminar)
  if (listaRegistrosEl) {
    listaRegistrosEl.addEventListener('click', (e) => {
      const btnSalida = e.target.closest('.btn-cp-marcar-salida');
      if (btnSalida) {
        const idx = parseInt(btnSalida.dataset.index, 10);
        if (Number.isFinite(idx) && registros[idx] && !registros[idx].HoraSalida) {
          registros[idx].HoraSalida = nowHHMM();
          renderRegistros();
          window.SioOfflineManager?.notifyStateChange?.();
        }
        return;
      }

      const btnEliminar = e.target.closest('.btn-cp-eliminar-registro');
      if (btnEliminar) {
        const idx = parseInt(btnEliminar.dataset.index, 10);
        if (!Number.isFinite(idx) || !registros[idx]) return;
        const target = registros[idx];

        Swal.fire({
          icon: 'question',
          title: '¿Eliminar registro?',
          text: `Se quitará a ${target.Nombre} (TIA: ${target.NoTIA}) de la lista de control perimétrico.`,
          showCancelButton: true,
          confirmButtonColor: '#DC2626',
          cancelButtonColor: '#64748B',
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        }).then((result) => {
          if (result.isConfirmed) {
            registros.splice(idx, 1);
            renderRegistros();
            window.SioOfflineManager?.notifyStateChange?.(true);
          }
        });
      }
    });
  }

  // Buscador de registros en vivo
  if (inputBuscador) {
    inputBuscador.addEventListener('input', renderRegistros);
  }
  const btnLimpiarBuscador = document.getElementById('btnCpLimpiarBuscador');
  if (btnLimpiarBuscador && inputBuscador) {
    btnLimpiarBuscador.addEventListener('click', () => {
      inputBuscador.value = '';
      renderRegistros();
    });
  }

  // Renderizado de Aleros (máximo 2)
  const renderAleros = () => {
    if (!listaAlerosEl) return;

    if (aleros.length === 0) {
      listaAlerosEl.innerHTML = '<div class="cp-empty-dashed">No hay aleros asignados (máximo 2).</div>';
      return;
    }

    listaAlerosEl.innerHTML = `
      <div class="cp-aleros-grid">
        ${aleros.map((a, idx) => `
          <div class="cp-alero-card">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
              <span class="cp-tag-pill" style="background-color: var(--brand); color: #FFFFFF; border-color: var(--brand);">
                #${idx + 1}
              </span>
              <span style="font-size: 13px; font-weight: 700; color: var(--brand); word-break: break-word;">
                ${esc(a.Nombre)}
              </span>
            </div>
            <button
              type="button"
              class="cp-icon-btn trash btn-cp-eliminar-alero"
              data-emp-id="${a.EmpleadoId}"
              title="Quitar alero"
            >
              <i class="fas fa-times"></i>
            </button>
          </div>
        `).join('')}
      </div>
    `;
  };

  if (selAlero) {
    selAlero.addEventListener('change', () => {
      const empId = parseInt(selAlero.value, 10);
      if (!Number.isFinite(empId) || empId <= 0) return;

      const selectedOpt = selAlero.options[selAlero.selectedIndex];
      const nombre = String(selectedOpt?.textContent || `Empleado #${empId}`).trim();

      const resetAleroSelect = () => {
        selAlero.value = '';
        if (comboAlero) comboAlero.syncFromSelect();
      };

      if (aleros.some((a) => a.EmpleadoId === empId)) {
        resetAleroSelect();
        Swal.fire({
          icon: 'warning',
          title: 'Alero Duplicado',
          text: 'Esta persona ya fue seleccionada como alero.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      if (aleros.length >= 2) {
        resetAleroSelect();
        Swal.fire({
          icon: 'warning',
          title: 'Límite Alcanzado',
          text: 'Solo puedes seleccionar un máximo de 2 aleros.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      aleros.push({ EmpleadoId: empId, Nombre: nombre });
      resetAleroSelect();
      renderAleros();
      window.SioOfflineManager?.notifyStateChange?.();
    });
  }

  if (listaAlerosEl) {
    listaAlerosEl.addEventListener('click', (e) => {
      const btnQuitar = e.target.closest('.btn-cp-eliminar-alero');
      if (!btnQuitar) return;
      const empId = parseInt(btnQuitar.dataset.empId, 10);
      aleros = aleros.filter((a) => a.EmpleadoId !== empId);
      renderAleros();
      window.SioOfflineManager?.notifyStateChange?.();
    });
  }

  // Guardar / Vista Preliminar
  const procesarCP = async (guardar) => {
    const formatoId = document.getElementById('cpFormatoId')?.value || '';
    const itinerarioId = parseInt(document.getElementById('cpItinerarioId')?.value || '0', 10);
    const encVal = document.getElementById('cpEncabezadoId')?.value || '';
    const encabezadoId = encVal ? parseInt(encVal, 10) : null;

    const fecha = String(inputFecha?.value || '').trim().substring(0, 10);
    const horaInicio = extractHHMM(inputHoraRevision?.value || '');
    const supervisorEmpleadoId = parseInt(selSupervisor?.value || '0', 10) || 0;
    const supervisorNombre = (supervisorEmpleadoId > 0 && selSupervisor && selSupervisor.selectedIndex >= 0)
      ? String(selSupervisor.options[selSupervisor.selectedIndex]?.textContent || '').trim()
      : '';

    const rawArribo = String(inputArribo?.value || '').trim();
    const arriboDelVuelo = rawArribo && rawArribo !== '--:--' ? extractHHMM(rawArribo) : '00:00';
    const horaAsegurado = extractHHMM(inputHoraAsegurado?.value || '');
    const tractoristaEmpleadoId = parseInt(selTractorista?.value || '0', 10) || 0;
    const elNombreTractoristaDelta = document.getElementById('cpNombreTractoristaDelta');
    const elTractoristaDelta = document.getElementById('cpTractoristaDelta');
    const elNombreAlerosDelta = document.getElementById('cpNombreAlerosDelta');
    const nombreTractoristaDelta = String(elNombreTractoristaDelta?.value || '').trim();
    const tractoristaDelta = String(elTractoristaDelta?.value || '').trim();
    const nombreAlerosDelta = String(elNombreAlerosDelta?.value || '').trim();

    const tractoristaNombre = nombreTractoristaDelta || (tractoristaEmpleadoId > 0 && selTractorista && selTractorista.selectedIndex >= 0
      ? String(selTractorista.options[selTractorista.selectedIndex]?.textContent || '').trim()
      : '');
    const maquinariaEquipoId = parseInt(selNoUnidad?.value || '0', 10) || 0;
    const noUnidadLabel = tractoristaDelta || (maquinariaEquipoId > 0 && selNoUnidad && selNoUnidad.selectedIndex >= 0
      ? String(selNoUnidad.options[selNoUnidad.selectedIndex]?.textContent || '').split('—')[0].trim()
      : '');
    const observaciones = String(inputObservaciones?.value || '').trim();

    if (guardar) {
      Validator?.clearValidationErrors(form);
      if (comboSupervisor) comboSupervisor.setInvalid(false);
      if (comboTractorista) comboTractorista.setInvalid(false);

      const errors = [];

      if (!fecha) {
        Validator?.markElementInvalid(inputFecha);
        errors.push({ label: 'Fecha de Operación', message: 'La fecha de operación es obligatoria.', element: inputFecha });
      }

      if (!horaInicio) {
        Validator?.markElementInvalid(inputHoraRevision);
        errors.push({ label: 'Hora de Revisión', message: 'Debe ingresar una Hora de Revisión válida (HH:mm).', element: inputHoraRevision });
      }

      if (supervisorEmpleadoId <= 0) {
        Validator?.markElementInvalid(selSupervisor);
        if (comboSupervisor) comboSupervisor.setInvalid(true);
        errors.push({
          label: 'Supervisor de Turno',
          message: 'Debe seleccionar un Supervisor de Turno del cuadro combinado.',
          element: selSupervisor?.closest('.sio-combo-wrapper')?.querySelector('button') || selSupervisor
        });
      }

      const tiaInvalido = registros.find((r) => !/^\d+$/.test(String(r.NoTIA || '').trim()));
      if (tiaInvalido) {
        errors.push({
          label: 'No. TIA Inválido',
          message: `El registro de "${tiaInvalido.Nombre || 'Personal'}" tiene un No. TIA no numérico ("${tiaInvalido.NoTIA}"). Solo se permiten dígitos.`,
          element: listaRegistrosEl
        });
      }

      const pendientes = registros.filter((r) => !r.HoraSalida || r.HoraSalida.trim() === '');
      if (pendientes.length > 0) {
        const firstPendIdx = registros.findIndex((r) => !r.HoraSalida || r.HoraSalida.trim() === '');
        const pendNombre = pendientes[0]?.Nombre || `#${firstPendIdx + 1}`;
        errors.push({
          label: '¡ALERTA DE SEGURIDAD!',
          message: `Hay personas que aún NO han salido de la aeronave (ej. "${pendNombre}"). Por favor, registra su hora de salida antes de guardar.`,
          element: listaRegistrosEl
        });
      }

      if (maquinariaEquipoId > 0 && tractoristaEmpleadoId <= 0) {
        Validator?.markElementInvalid(selTractorista);
        if (comboTractorista) comboTractorista.setInvalid(true);
        errors.push({
          label: 'Tractorista',
          message: 'Debe seleccionar al Tractorista cuando asigna un No. Unidad.',
          element: selTractorista?.closest('.sio-combo-wrapper')?.querySelector('button') || selTractorista
        });
      }

      if (errors.length > 0) {
        if (Validator && typeof Validator.focusAndAlert === 'function') {
          Validator.focusAndAlert({
            title: 'Validación de Control de Perimétrica',
            errors
          });
        } else {
          Swal.fire({
            icon: 'warning',
            title: 'Validación de Control de Perimétrica',
            text: errors[0].message,
            confirmButtonColor: '#275B88'
          });
        }
        return;
      }
    }

    // Abrir ventana de forma síncrona al hacer clic para evitar bloqueo de popups en Vista Preliminar
    let previewWin = null;
    if (!guardar) {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try {
          previewWin.document.title = 'Generando Vista Preliminar...';
        } catch (_) {}
      }
    }

    const payload = {
      formatoId,
      itinerarioId,
      encabezadoId,
      guardar,
      datos: {
        cpPayload: {
          fecha,
          horaInicio,
          supervisorEmpleadoId,
          supervisorNombre,
          arriboDelVuelo,
          horaAsegurado,
          tractoristaEmpleadoId,
          tractoristaNombre,
          maquinariaEquipoId,
          noUnidadLabel,
          nombreTractoristaDelta,
          tractoristaDelta,
          nombreAlerosDelta,
          alerosIds: aleros.map((a) => a.EmpleadoId),
          alerosNombres: aleros.map((a) => a.Nombre),
          agentesEmpleadoIds: String(inputAgentesIds?.value || '').trim(),
          observaciones,
          registros
        }
      }
    };

    try {
      if (typeof mostrarPantallaCarga === 'function') {
        mostrarPantallaCarga(
          guardar ? 'Guardando Control de Perimétrica...' : 'Generando Vista Preliminar...',
          guardar
            ? 'Sincronizando encabezado, complementos y registros en Azure SQL.'
            : 'Armando hoja visual del formato (FORMATOS_SECHTML).'
        );
      }

      const response = await fetch('/api/formatos/procesar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const res = await response.json();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();

      if (res.success) {
        if (!guardar) {
          if (res.previewUrl) {
            if (previewWin && !previewWin.closed) {
              previewWin.location.href = res.previewUrl;
              previewWin.focus();
            } else {
              Swal.fire({
                icon: 'info',
                title: 'Vista Preliminar Lista',
                html: `
                  <p style="font-size: 13px; margin-bottom: 14px;">
                    El navegador bloqueó la apertura automática de la pestaña. Haz clic en el botón para ver el formato armado:
                  </p>
                  <a href="${esc(res.previewUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">
                    <i class="fas fa-external-link-alt"></i> Abrir Vista Preliminar
                  </a>
                `,
                showConfirmButton: true,
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#275B88'
              });
            }
          }
        } else {
          if (res.encabezadoId) {
            const encInput = document.getElementById('cpEncabezadoId');
            if (encInput) encInput.value = String(res.encabezadoId);
          }
          await Swal.fire({
            icon: 'success',
            title: '¡Guardado Exitoso!',
            text: res.mensaje || 'Control de Perimétrica registrado en la base de datos.',
            timer: 1100,
            showConfirmButton: false
          });
          if (res.previewUrl) {
            window.location.href = res.previewUrl;
          } else {
            window.location.href = '/formatos';
          }
        }
      } else {
        if (previewWin && !previewWin.closed) previewWin.close();
        if (Validator && Array.isArray(res.errors) && res.errors.length > 0) {
          Validator.applyBackendErrors(res.errors, {
            root: form,
            headerElementMap: {
              fecha: inputFecha,
              horaInicio: inputHoraRevision,
              supervisorEmpleadoId: selSupervisor,
              tractoristaEmpleadoId: selTractorista,
              maquinariaEquipoId: selNoUnidad
            }
          });
          return;
        }
        Swal.fire({
          icon: 'error',
          title: 'Error de Validación',
          text: res.message || 'No se pudo procesar el formato de Control de Perimétrica.',
          confirmButtonColor: '#275B88'
        });
      }
    } catch (_) {
      if (previewWin && !previewWin.closed) previewWin.close();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();
      Swal.fire({
        icon: 'error',
        title: 'Error de Red',
        text: 'No se pudo comunicar con el servidor para procesar el formato.',
        confirmButtonColor: '#275B88'
      });
    }
  };

  const btnPreliminar = document.getElementById('btnCpVistaPreliminar');
  if (btnPreliminar) {
    btnPreliminar.addEventListener('click', () => procesarCP(false));
  }

  const btnGuardarDefinitivo = document.getElementById('btnCpGuardarDefinitivo');
  if (btnGuardarDefinitivo) {
    btnGuardarDefinitivo.addEventListener('click', () => procesarCP(true));
  }

  // Render inicial y registro de adaptador Offline-First (Full State Hydration)
  renderRegistros();
  renderAleros();

  window.SioOfflineManager?.registerStateAdapter?.('format:cp', {
    capture: () => ({
      registros: registros.map((r) => ({ ...r })),
      aleros: aleros.map((a) => ({ ...a }))
    }),
    restore: (saved) => {
      if (!saved || typeof saved !== 'object') return;
      if (Array.isArray(saved.registros)) registros = normalizeCpRegistros(saved.registros);
      if (Array.isArray(saved.aleros)) aleros = normalizeCpAleros(saved.aleros);
      renderRegistros();
      renderAleros();
    },
    reset: () => {
      registros = initialRegistrosBaseline.map((r) => ({ ...r }));
      aleros = initialAlerosBaseline.map((a) => ({ ...a }));
      renderRegistros();
      renderAleros();
    },
    mapLegacyPatch: (patch) => {
      if (!patch || (!Array.isArray(patch.registros) && !Array.isArray(patch.aleros))) return undefined;
      return {
        registros: Array.isArray(patch.registros) ? patch.registros : initialRegistrosBaseline,
        aleros: Array.isArray(patch.aleros) ? patch.aleros : initialAlerosBaseline
      };
    }
  });
});

