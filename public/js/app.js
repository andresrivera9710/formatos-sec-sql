/**
 * Frontend Application Controller - SIO LAATS Formatos SEC
 * Arquitectura limpia 100% compatible con CSP estricto (sin manejadores onclick inline).
 */

let _sioLoadingInterval = null;
let _sioLoadingTimeout = null;
let _sioLoadingStart = 0;
let _comboOperador = null;
let _selectingOperation = false;
const _operacionesCache = new Map();

/**
 * Muestra la pantalla global de carga con mensaje y cronómetro en vivo
 * @param {string} titulo
 * @param {string} subtitulo
 */
function mostrarPantallaCarga(titulo = 'Procesando solicitud...', subtitulo = 'Conectando con la base de datos de SIO LAATS, por favor espere.') {
  const overlay = document.getElementById('sioLoadingOverlay');
  const titleEl = document.getElementById('sioLoadingTitle');
  const subEl = document.getElementById('sioLoadingSubtitle');
  const timerEl = document.getElementById('sioLoadingTimer');

  if (titleEl) titleEl.textContent = titulo;
  if (subEl) subEl.textContent = subtitulo;

  if (_sioLoadingInterval) {
    clearInterval(_sioLoadingInterval);
    _sioLoadingInterval = null;
  }
  if (_sioLoadingTimeout) {
    clearTimeout(_sioLoadingTimeout);
    _sioLoadingTimeout = null;
  }

  _sioLoadingStart = performance.now();
  if (timerEl) timerEl.textContent = 'Ejecutando consulta (0.0s)';

  _sioLoadingInterval = setInterval(() => {
    if (timerEl) {
      const elapsed = ((performance.now() - _sioLoadingStart) / 1000).toFixed(1);
      timerEl.textContent = `Ejecutando consulta (${elapsed}s)`;
    }
  }, 100);

  // Auto-cierre de seguridad (failsafe) sincronizado con SioNavigationManager
  if (window.SioNavigationManager && typeof window.SioNavigationManager.scheduleOverlayFailsafe === 'function') {
    window.SioNavigationManager.scheduleOverlayFailsafe(18000);
  } else {
    _sioLoadingTimeout = setTimeout(() => {
      ocultarPantallaCarga();
    }, 18000);
  }

  if (overlay) {
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

/**
 * Oculta la pantalla global de carga
 */
function ocultarPantallaCarga(opts) {
  if (_sioLoadingInterval) {
    clearInterval(_sioLoadingInterval);
    _sioLoadingInterval = null;
  }
  if (_sioLoadingTimeout) {
    clearTimeout(_sioLoadingTimeout);
    _sioLoadingTimeout = null;
  }
  if (window.SioNavigationManager && typeof window.SioNavigationManager.clearOverlayFailsafe === 'function') {
    window.SioNavigationManager.clearOverlayFailsafe();
  }
  const overlay = document.getElementById('sioLoadingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
  if (!(opts && opts._fromNavManager)) {
    _selectingOperation = false;
  }
}

window.mostrarPantallaCarga = mostrarPantallaCarga;
window.ocultarPantallaCarga = ocultarPantallaCarga;

function resetNavigationLocks() {
  _selectingOperation = false;
  if (typeof window.dismissAllOverlays === 'function') {
    window.dismissAllOverlays({ reason: 'app-nav-reset', abortRequests: false });
  } else {
    ocultarPantallaCarga();
  }
}

// Solución integral al Bug de Navegación Atrás (BFCache en dispositivos móviles y botón atrás de ratón)
window.addEventListener('pageshow', resetNavigationLocks);
window.addEventListener('popstate', resetNavigationLocks);
window.addEventListener('pagehide', resetNavigationLocks);

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD según la zona horaria local
 */
function obtenerFechaLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formatea una hora ISO (YYYY-MM-DDTHH:mm:ss.sssZ) a HH:mm de forma segura
 */
function formatHora(valor) {
  if (!valor) return '--:--';
  const str = String(valor);
  if (str.length >= 16 && str.includes('T')) {
    return str.substring(11, 16);
  }
  if (/^\d{2}:\d{2}/.test(str)) {
    return str.substring(0, 5);
  }
  return '--:--';
}

/**
 * Escapa texto para prevenir XSS al interpolar en plantillas HTML
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  // Asegurar que cualquier overlay remanente de caché se oculte al cargar
  ocultarPantallaCarga();

  // Cierre de emergencia si el usuario toca el fondo oscuro del overlay
  const overlayEl = document.getElementById('sioLoadingOverlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) {
        _selectingOperation = false;
        if (window.SioNavigationManager) {
          window.SioNavigationManager.dismissAllOverlays({ reason: 'overlay-backdrop-click', abortRequests: true });
        } else {
          ocultarPantallaCarga();
        }
      }
    });
  }

  // 1. Manejador del Modo Oscuro (Sincronizado con tab-bar.js, [data-theme="dark"] y <meta name="color-scheme">)
  const btnDarkMode = document.getElementById('btnDarkModeToggle');
  if (btnDarkMode) {
    const syncColorSchemeMeta = (scheme) => {
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', scheme);
    };
    const isDark = localStorage.getItem('sio_theme') === 'dark' || localStorage.getItem('sio_dark_mode') === 'true';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
      syncColorSchemeMeta('dark');
    } else {
      syncColorSchemeMeta('light');
    }

    btnDarkMode.addEventListener('click', () => {
      const nextDark = !document.body.classList.contains('dark-mode');
      const nextScheme = nextDark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', nextScheme);
      document.body.setAttribute('data-theme', nextScheme);
      document.body.classList.toggle('dark-mode', nextDark);
      syncColorSchemeMeta(nextScheme);
      localStorage.setItem('sio_theme', nextScheme);
      localStorage.setItem('sio_dark_mode', String(nextDark));
    });
  }

  // 2. Módulo de Operaciones (/operaciones)
  const gridOperaciones = document.getElementById('gridOperaciones');
  const formFiltros = document.getElementById('formFiltrosOperaciones');
  const inputFecha1 = document.getElementById('filtroFecha1');
  const inputFecha2 = document.getElementById('filtroFecha2');
  const selectOperador = document.getElementById('filtroOperador');
  const checkRango = document.getElementById('checkRangoFechas');
  const grupoFecha2 = document.getElementById('grupoFecha2');
  const btnConsultar = document.getElementById('btnConsultarOperaciones');

  if (selectOperador && typeof window.SioSearchableCombo === 'function') {
    _comboOperador = new window.SioSearchableCombo(selectOperador, {
      placeholder: '-- Seleccione una aerolínea / operador --',
      searchPlaceholder: 'Buscar aerolínea / operador...',
      emptyText: 'No se encontraron aerolíneas con ese criterio.'
    });

    selectOperador.addEventListener('change', () => {
      if (!selectOperador.value) {
        renderizarEstadoInicialOperaciones();
      }
    });
  }

  if (inputFecha1 && !inputFecha1.value) {
    inputFecha1.value = obtenerFechaLocalISO();
  }

  if (checkRango && grupoFecha2) {
    checkRango.addEventListener('change', () => {
      grupoFecha2.classList.toggle('is-hidden', !checkRango.checked);
      if (!checkRango.checked && inputFecha2) {
        inputFecha2.value = '';
      }
    });
  }

  if (formFiltros) {
    formFiltros.addEventListener('submit', (e) => {
      e.preventDefault();
      consultarOperaciones();
    });
  }

  if (btnConsultar && !formFiltros) {
    btnConsultar.addEventListener('click', (e) => {
      e.preventDefault();
      consultarOperaciones();
    });
  }

  // Delegación de evento click para botones "Elegir esta operación"
  if (gridOperaciones) {
    gridOperaciones.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-seleccionar-operacion');
      if (!btn || btn.disabled) return;
      const itiId = btn.dataset.itinerarioId;
      const vuelo = _operacionesCache.get(String(itiId));
      if (vuelo) {
        seleccionarOperacion(vuelo);
      }
    });
  }

  // 3. Módulo de Formatos (/formatos)
  const formatsGrid = document.getElementById('formatsGrid');
  if (formatsGrid) {
    formatsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.format-card[data-formato-id]');
      if (!card) return;
      const { formatoId, formatoNombre, itinerarioId } = card.dataset;
      abrirFormato(formatoId, formatoNombre, itinerarioId);
    });
  }

  const btnCancelarModal = document.getElementById('btnCancelarModalReanudar');
  if (btnCancelarModal) {
    btnCancelarModal.addEventListener('click', cerrarModalReanudar);
  }

  const listaExistentes = document.getElementById('listaFormatosExistentes');
  if (listaExistentes) {
    listaExistentes.addEventListener('click', (e) => {
      const link = e.target.closest('.btn-reanudar-formato');
      if (!link) return;
      const encId = link.dataset.encabezadoId || '';
      mostrarPantallaCarga('Cargando Formato...', `Recuperando datos del registro #${encId}...`);
    });
  }
});

/**
 * Restaura el estado inicial sin vuelos en /operaciones
 */
function renderizarEstadoInicialOperaciones() {
  const container = document.getElementById('gridOperaciones');
  const barraResumen = document.getElementById('barraResumenOperaciones');
  _operacionesCache.clear();

  if (barraResumen) {
    barraResumen.classList.add('is-hidden');
  }

  if (container) {
    container.innerHTML = `
      <div class="op-empty-state">
        <i class="fas fa-search-location fa-3x op-empty-icon"></i>
        <h3 class="op-empty-title">Itinerarios sin vuelos cargados</h3>
        <p class="op-empty-desc">Seleccione una fecha y busque una aerolínea / operador en el cuadro combinado, luego presione Consultar para visualizar los vuelos.</p>
      </div>
    `;
  }
}

/**
 * Realiza la búsqueda de tarjetas de operaciones e itinerarios vía API
 */
async function consultarOperaciones() {
  const fechaEl = document.getElementById('filtroFecha1');
  const operadorEl = document.getElementById('filtroOperador');
  const fecha2Check = document.getElementById('checkRangoFechas')?.checked;
  const fecha2El = document.getElementById('filtroFecha2');
  const btnConsultar = document.getElementById('btnConsultarOperaciones');
  const barraResumen = document.getElementById('barraResumenOperaciones');
  const textoResumen = document.getElementById('textoResumenOperaciones');
  const badgeTiempo = document.getElementById('badgeTiempoConsulta');

  const fecha = fechaEl?.value;
  const operadorRaw = String(operadorEl?.value || '').trim();
  const operadorId = parseInt(operadorRaw, 10);
  const operadorNombre = operadorEl?.options?.[operadorEl.selectedIndex]?.text || '';
  const fecha2 = (fecha2Check && fecha2El?.value) ? fecha2El.value : null;

  if (!operadorRaw || !Number.isFinite(operadorId) || operadorId <= 0) {
    if (_comboOperador) _comboOperador.setInvalid(true);
    Swal.fire({
      icon: 'warning',
      title: 'Aerolínea Requerida',
      text: 'Debe seleccionar una aerolínea / operador en el cuadro combinado antes de consultar los itinerarios.',
      confirmButtonColor: '#275B88'
    }).then(() => {
      if (_comboOperador) _comboOperador.open();
    });
    return;
  }

  if (_comboOperador) _comboOperador.setInvalid(false);

  if (!fecha) {
    Swal.fire({
      icon: 'warning',
      title: 'Fecha Requerida',
      text: 'Por favor seleccione una fecha para consultar el itinerario.',
      confirmButtonColor: '#275B88'
    });
    return;
  }

  if (fecha2Check && !fecha2) {
    Swal.fire({
      icon: 'warning',
      title: 'Fecha Final Requerida',
      text: 'Activó el rango de fechas. Seleccione la fecha final ("Hasta") o desactive el rango.',
      confirmButtonColor: '#275B88'
    });
    return;
  }

  const container = document.getElementById('gridOperaciones');
  const subtituloCarga = fecha2
    ? `Consultando vuelos de ${operadorNombre} del ${fecha} al ${fecha2} en Azure SQL...`
    : `Consultando vuelos de ${operadorNombre} para el ${fecha} en Azure SQL...`;

  mostrarPantallaCarga('Buscando Operaciones...', subtituloCarga);

  if (btnConsultar) {
    btnConsultar.disabled = true;
    btnConsultar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
  }

  if (container) {
    container.innerHTML = `
      <div class="op-empty-state">
        <i class="fas fa-spinner fa-spin fa-3x op-empty-icon"></i>
        <p class="op-loading-text">Consultando operaciones en tiempo real...</p>
      </div>
    `;
  }

  const t0 = performance.now();
  const navMgr = window.SioNavigationManager;
  const reqCtrl = navMgr ? navMgr.createAbortController('consultar-operaciones') : { signal: undefined, release: () => {} };

  try {
    const response = await fetch('/api/operaciones/consultar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ fecha, operadorId, fecha2 }),
      signal: reqCtrl.signal
    });

    if (response.status === 401) {
      ocultarPantallaCarga();
      Swal.fire({
        icon: 'warning',
        title: 'Sesión Expirada',
        text: 'Su sesión ha caducado. Será redirigido al inicio de sesión.',
        confirmButtonColor: '#275B88'
      }).then(() => {
        window.location.replace('/login');
      });
      return;
    }

    const res = await response.json();

    if (!response.ok || !res.success) {
      throw new Error(res.message || 'Error en la consulta de operaciones');
    }

    const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
    if (barraResumen && textoResumen) {
      barraResumen.classList.remove('is-hidden');
      const total = Array.isArray(res.data) ? res.data.length : 0;
      textoResumen.innerHTML = `<i class="fas fa-plane-departure op-summary-icon"></i> <strong>${total}</strong> ${total === 1 ? 'operación encontrada' : 'operaciones encontradas'} para <strong>${escapeHtml(operadorNombre)}</strong> (${escapeHtml(fecha)}${fecha2 ? ' al ' + escapeHtml(fecha2) : ''})`;
      if (badgeTiempo) {
        badgeTiempo.textContent = `${elapsedSec}s`;
      }
    }

    renderizarTarjetas(res.data);
  } catch (err) {
    if (navMgr && navMgr.isAbortError(err)) {
      return;
    }
    console.error('[CONSULTAR OPERACIONES ERROR]', err);
    if (barraResumen) barraResumen.classList.add('is-hidden');
    if (container) {
      container.innerHTML = `
        <div class="op-empty-state">
          <i class="fas fa-exclamation-triangle fa-3x op-empty-icon-danger"></i>
          <h3 class="op-empty-title">Error al consultar operaciones</h3>
          <p class="op-empty-desc">${escapeHtml(err.message) || 'Verifique la conexión con el servidor e intente nuevamente.'}</p>
        </div>
      `;
    }
    Swal.fire({
      icon: 'error',
      title: 'Error de Consulta',
      text: err.message || 'No se pudo completar la consulta en Azure SQL.',
      confirmButtonColor: '#275B88'
    });
  } finally {
    reqCtrl.release();
    ocultarPantallaCarga();
    if (btnConsultar) {
      btnConsultar.disabled = false;
      btnConsultar.innerHTML = '<i class="fas fa-search"></i> Consultar';
    }
  }
}

/**
 * Renderiza la lista de tarjetas de vuelos y las almacena en caché para delegación segura
 */
function renderizarTarjetas(lista = []) {
  const container = document.getElementById('gridOperaciones');
  if (!container) return;

  _operacionesCache.clear();

  if (!lista || lista.length === 0) {
    container.innerHTML = `
      <div class="op-empty-state">
        <i class="fas fa-plane-slash fa-3x op-empty-icon-muted"></i>
        <h3 class="op-empty-title">No se encontraron datos</h3>
        <p class="op-empty-desc">No hay vuelos itinerados en las fechas y aerolínea seleccionadas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = lista.map(v => {
    _operacionesCache.set(String(v.itinerarioId), v);

    const esAnulado = v.anulado && v.anulado != 0;
    const matricula = v.Matricula && String(v.Matricula).trim() !== '' ? escapeHtml(v.Matricula) : null;
    const fechaStr = v.FechaItinerado ? escapeHtml(String(v.FechaItinerado).substring(0, 10)) : 'Hoy';

    return `
      <div class="operation-card ${esAnulado ? 'card-anulado' : ''}">
        <div>
          <div class="op-header">
            <div>
              <span class="op-airline">${escapeHtml(v.operador || 'AEROLÍNEA')}</span>
              <div class="op-flight-no">Vuelo: ${escapeHtml(v.novuelo || 'S/N')}</div>
            </div>
            <span class="badge ${esAnulado ? 'badge-danger' : 'badge-gold'}">
              ${esAnulado ? 'ANULADO' : escapeHtml(v.tipoOperacion || 'COMERCIAL')}
            </span>
          </div>

          <div class="op-meta-row">
            <span><strong>No. Correlativo:</strong> <span class="op-correlativo">#${escapeHtml(v.nocorrelativo || 'N/A')}</span></span>
            <span><strong>Fecha:</strong> ${fechaStr}</span>
          </div>

          <div class="op-route">
            <div>
              <div class="op-route-label">Procedencia</div>
              <div class="route-city">${escapeHtml(v.Procedencia || '---')}</div>
            </div>
            <div class="op-route-plane"><i class="fas fa-plane"></i></div>
            <div class="op-route-end">
              <div class="op-route-label">Destino</div>
              <div class="route-city">${escapeHtml(v.Destino || '---')}</div>
            </div>
          </div>

          <div class="op-times">
            <div class="time-box">
              <small class="time-box-label">ETA</small>
              <strong>${formatHora(v.eta)}</strong>
            </div>
            <div class="time-box">
              <small class="time-box-label">ETD</small>
              <strong>${formatHora(v.etd)}</strong>
            </div>
            <div class="time-box real">
              <small class="time-box-label-real">ATA</small>
              <strong>${formatHora(v.ata)}</strong>
            </div>
            <div class="time-box real">
              <small class="time-box-label-real">ATD</small>
              <strong>${formatHora(v.atd)}</strong>
            </div>
          </div>

          <div class="op-footer-meta">
            <span><strong>Matrícula:</strong> ${matricula || '<span class="op-matricula-pending">Pendiente</span>'}${v.tipoAeronave ? ` (${escapeHtml(v.tipoAeronave)})` : ''}</span>
            <span><strong>Puerta:</strong> ${escapeHtml(v.puertaposicion || '--')} | <strong>Faja:</strong> ${escapeHtml(v.faja ?? '--')}</span>
          </div>
        </div>

        <button 
          type="button"
          class="btn btn-primary btn-seleccionar-operacion op-select-btn" 
          data-itinerario-id="${escapeHtml(v.itinerarioId)}"
          ${esAnulado ? 'disabled' : ''}
        >
          <i class="fas fa-check-circle"></i> Elegir esta operación
        </button>
      </div>
    `;
  }).join('');
}

/**
 * Selecciona una operación y avanza hacia los formatos de seguridad
 */
async function seleccionarOperacion(vuelo) {
  if (_selectingOperation) return;

  const opNombre = (vuelo.operador || '').toUpperCase();
  if ((opNombre.includes('DELTA') || opNombre.includes('AVIANCA')) && (!vuelo.Matricula || String(vuelo.Matricula).trim() === '')) {
    Swal.fire({
      icon: 'error',
      title: 'Matrícula Obligatoria',
      text: `Para operaciones de ${vuelo.operador} debe ingresar la matrícula y datos necesarios antes de generar los reportes de seguridad.`,
      confirmButtonColor: '#275B88'
    });
    return;
  }

  _selectingOperation = true;
  const navMgr = window.SioNavigationManager;
  const reqCtrl = navMgr ? navMgr.createAbortController('seleccionar-operacion') : { signal: undefined, epoch: 0, release: () => {} };

  mostrarPantallaCarga('Seleccionando Operación...', `Cargando vuelo ${vuelo.novuelo || ''} de ${vuelo.operador || ''} y preparando formatos...`);

  try {
    const res = await fetch('/api/operaciones/seleccionar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ operacion: vuelo }),
      signal: reqCtrl.signal
    });

    if (navMgr && reqCtrl.epoch !== navMgr.getEpoch()) {
      ocultarPantallaCarga();
      return;
    }

    if (res.status === 401) {
      ocultarPantallaCarga();
      window.location.replace('/login');
      return;
    }

    const data = await res.json();
    if (data.success) {
      window.location.assign(data.redirectUrl || '/formatos');
    } else {
      ocultarPantallaCarga();
      Swal.fire({ icon: 'error', title: 'Error', text: data.message, confirmButtonColor: '#275B88' });
    }
  } catch (err) {
    if (navMgr && navMgr.isAbortError(err)) {
      ocultarPantallaCarga();
      return;
    }
    ocultarPantallaCarga();
    Swal.fire({ icon: 'error', title: 'Error de Red', text: 'No se pudo seleccionar el itinerario.', confirmButtonColor: '#275B88' });
  } finally {
    reqCtrl.release();
    _selectingOperation = false;
  }
}

/**
 * Maneja la selección de un formato y verifica si debe reanudar o crear nuevo
 */
async function abrirFormato(formatoId, formatoNombre, itinerarioId) {
  const navMgr = window.SioNavigationManager;
  const reqCtrl = navMgr ? navMgr.createAbortController('verificar-formatos') : { signal: undefined, epoch: 0, release: () => {} };

  mostrarPantallaCarga('Verificando Formatos...', `Consultando registros previos para "${formatoNombre}" en Azure SQL...`);
  try {
    const res = await fetch('/api/formatos/verificar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ itinerarioId, tipoFormato: formatoNombre }),
      signal: reqCtrl.signal
    });

    if (navMgr && reqCtrl.epoch !== navMgr.getEpoch()) {
      ocultarPantallaCarga();
      return;
    }

    if (res.status === 401) {
      ocultarPantallaCarga();
      window.location.replace('/login');
      return;
    }

    const result = await res.json();

    if (result.success && result.requiereDecision && result.data.length > 0) {
      ocultarPantallaCarga();
      mostrarModalReanudar(formatoId, formatoNombre, result.data);
    } else {
      window.location.assign(`/formatos/${encodeURIComponent(formatoId)}`);
    }
  } catch (err) {
    if (navMgr && navMgr.isAbortError(err)) {
      ocultarPantallaCarga();
      return;
    }
    window.location.assign(`/formatos/${encodeURIComponent(formatoId)}`);
  } finally {
    reqCtrl.release();
  }
}

/**
 * Muestra el modal para reanudar o crear uno nuevo
 */
function mostrarModalReanudar(formatoId, formatoNombre, existentes) {
  const modal = document.getElementById('modalReanudar');
  const title = document.getElementById('modalFormatoNombre');
  const listContainer = document.getElementById('listaFormatosExistentes');
  const btnNuevo = document.getElementById('btnCrearNuevoFormato');

  if (!modal) {
    window.location.href = `/formatos/${formatoId}`;
    return;
  }

  if (title) title.innerText = formatoNombre;

  if (listContainer) {
    listContainer.innerHTML = existentes.map(e => `
      <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="color: var(--brand); font-weight: 800; font-size: 14px;">#${escapeHtml(e.FormatoEncabezadoId || 'REG')}</span>
          <div style="font-size: 11px; color: var(--text-2);">Creado por: <strong>${escapeHtml(e.CreadoPor || 'S/N')}</strong></div>
          <div style="font-size: 10px; color: var(--text-3);">${e.FechaCreacion ? escapeHtml(String(e.FechaCreacion).substring(0, 10)) : ''}</div>
        </div>
        <a href="/formatos/${encodeURIComponent(formatoId)}?encabezadoId=${encodeURIComponent(e.FormatoEncabezadoId)}" data-encabezado-id="${escapeHtml(e.FormatoEncabezadoId)}" class="btn btn-primary btn-reanudar-formato" style="padding: 6px 12px; font-size: 11px;">
          <i class="fas fa-folder-open"></i> Reanudar
        </a>
      </div>
    `).join('');
  }

  if (btnNuevo) {
    btnNuevo.onclick = () => {
      mostrarPantallaCarga('Preparando Formato...', `Inicializando nuevo registro de ${formatoNombre}...`);
      window.location.href = `/formatos/${encodeURIComponent(formatoId)}?nuevo=1`;
    };
  }

  modal.style.display = 'flex';
}

function cerrarModalReanudar() {
  const modal = document.getElementById('modalReanudar');
  if (modal) modal.style.display = 'none';
}
