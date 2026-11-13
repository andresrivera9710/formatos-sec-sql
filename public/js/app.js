/**
 * Frontend Application Controller - SIO LAATS Formatos SEC
 * Manejo interactivo de peticiones AJAX, pantalla global de carga, modales y alertas SweetAlert2.
 */

let _sioLoadingInterval = null;
let _sioLoadingStart = 0;

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

  _sioLoadingStart = performance.now();
  if (timerEl) timerEl.textContent = 'Ejecutando consulta (0.0s)';

  _sioLoadingInterval = setInterval(() => {
    if (timerEl) {
      const elapsed = ((performance.now() - _sioLoadingStart) / 1000).toFixed(1);
      timerEl.textContent = `Ejecutando consulta (${elapsed}s)`;
    }
  }, 100);

  if (overlay) {
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }
}

/**
 * Oculta la pantalla global de carga
 */
function ocultarPantallaCarga() {
  if (_sioLoadingInterval) {
    clearInterval(_sioLoadingInterval);
    _sioLoadingInterval = null;
  }
  const overlay = document.getElementById('sioLoadingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

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

document.addEventListener('DOMContentLoaded', () => {
  // Inicialización de selector de fechas con la fecha local de hoy
  const inputFecha1 = document.getElementById('filtroFecha1');
  if (inputFecha1 && !inputFecha1.value) {
    inputFecha1.value = obtenerFechaLocalISO();
  }

  // Permitir consultar con Enter desde los filtros
  ['filtroFecha1', 'filtroFecha2', 'filtroOperador'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          consultarOperaciones();
        }
      });
    }
  });

  // Manejador del Modo Oscuro
  const btnDarkMode = document.getElementById('btnDarkModeToggle');
  if (btnDarkMode) {
    const isDark = localStorage.getItem('sio_dark_mode') === 'true';
    if (isDark) document.body.classList.add('dark-mode');

    btnDarkMode.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('sio_dark_mode', document.body.classList.contains('dark-mode'));
    });
  }
});

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
  const operadorId = operadorEl?.value || 0;
  const operadorNombre = operadorEl?.options?.[operadorEl.selectedIndex]?.text || 'Todos los Operadores';
  const fecha2 = fecha2Check ? fecha2El?.value : null;

  if (!fecha) {
    Swal.fire({
      icon: 'warning',
      title: 'Fecha Requerida',
      text: 'Por favor seleccione una fecha para consultar el itinerario.',
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
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 12px; border: 1px solid var(--border);">
        <i class="fas fa-spinner fa-spin fa-3x" style="color: var(--brand);"></i>
        <p style="margin-top: 16px; font-weight: 600; color: var(--text-2);">Consultando operaciones en tiempo real...</p>
      </div>
    `;
  }

  const t0 = performance.now();

  try {
    const response = await fetch('/api/operaciones/consultar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ fecha, operadorId, fecha2 })
    });

    if (response.status === 401) {
      Swal.fire({
        icon: 'warning',
        title: 'Sesión Expirada',
        text: 'Su sesión ha caducado. Será redirigido al inicio de sesión.',
        confirmButtonColor: '#275B88'
      }).then(() => {
        window.location.href = '/login';
      });
      return;
    }

    const res = await response.json();

    if (!response.ok || !res.success) {
      throw new Error(res.message || 'Error en la consulta de operaciones');
    }

    const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
    if (barraResumen && textoResumen && badgeTiempo) {
      barraResumen.style.display = 'flex';
      const total = Array.isArray(res.data) ? res.data.length : 0;
      textoResumen.innerHTML = `<i class="fas fa-plane-departure" style="color: var(--brand);"></i> <strong>${total}</strong> ${total === 1 ? 'operación encontrada' : 'operaciones encontradas'} para <strong>${operadorNombre}</strong> (${fecha}${fecha2 ? ' al ' + fecha2 : ''})`;
      badgeTiempo.textContent = `Azure SQL • ${elapsedSec}s`;
    }

    renderizarTarjetas(res.data);
  } catch (err) {
    console.error('[CONSULTAR OPERACIONES ERROR]', err);
    if (barraResumen) barraResumen.style.display = 'none';
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 12px; border: 1px solid var(--border);">
          <i class="fas fa-exclamation-triangle fa-3x" style="color: var(--danger);"></i>
          <h3 style="margin-top: 16px; color: var(--text);">Error al consultar operaciones</h3>
          <p style="color: var(--text-3); margin-top: 8px;">${err.message || 'Verifique la conexión con el servidor e intente nuevamente.'}</p>
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
    ocultarPantallaCarga();
    if (btnConsultar) {
      btnConsultar.disabled = false;
      btnConsultar.innerHTML = '<i class="fas fa-search"></i> Consultar';
    }
  }
}

/**
 * Renderiza la lista de tarjetas de vuelos
 */
function renderizarTarjetas(lista = []) {
  const container = document.getElementById('gridOperaciones');
  if (!container) return;

  if (!lista || lista.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--surface); border-radius: 12px; border: 1px solid var(--border);">
        <i class="fas fa-plane-slash fa-3x" style="color: var(--text-muted);"></i>
        <h3 style="margin-top: 16px; color: var(--text);">No se encontraron datos</h3>
        <p style="color: var(--text-3); margin-top: 8px;">No hay vuelos itinerados en las fechas y aerolínea seleccionadas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = lista.map(v => {
    const esAnulado = v.anulado && v.anulado != 0;
    const matricula = v.Matricula && String(v.Matricula).trim() !== '' ? v.Matricula : null;
    const fechaStr = v.FechaItinerado ? String(v.FechaItinerado).substring(0, 10) : 'Hoy';

    return `
      <div class="operation-card ${esAnulado ? 'card-anulado' : ''}">
        <div>
          <div class="op-header">
            <div>
              <span class="op-airline">${v.operador || 'AEROLÍNEA'}</span>
              <div class="op-flight-no">Vuelo: ${v.novuelo || 'S/N'}</div>
            </div>
            <span class="badge ${esAnulado ? 'badge-danger' : 'badge-gold'}">
              ${esAnulado ? 'ANULADO' : (v.tipoOperacion || 'COMERCIAL')}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-3); margin-bottom: 8px;">
            <span><strong>No. Correlativo:</strong> <span style="color: var(--danger); font-weight: 700;">#${v.nocorrelativo || 'N/A'}</span></span>
            <span><strong>Fecha:</strong> ${fechaStr}</span>
          </div>

          <div class="op-route">
            <div>
              <div style="font-size: 10px; color: var(--text-3); text-transform: uppercase;">Procedencia</div>
              <div class="route-city">${v.Procedencia || '---'}</div>
            </div>
            <div style="color: var(--brand); font-size: 18px;"><i class="fas fa-plane"></i></div>
            <div style="text-align: right;">
              <div style="font-size: 10px; color: var(--text-3); text-transform: uppercase;">Destino</div>
              <div class="route-city">${v.Destino || '---'}</div>
            </div>
          </div>

          <div class="op-times">
            <div class="time-box">
              <small style="color: var(--text-3); display: block;">ETA</small>
              <strong>${formatHora(v.eta)}</strong>
            </div>
            <div class="time-box">
              <small style="color: var(--text-3); display: block;">ETD</small>
              <strong>${formatHora(v.etd)}</strong>
            </div>
            <div class="time-box real">
              <small style="color: var(--danger); display: block;">ATA</small>
              <strong>${formatHora(v.ata)}</strong>
            </div>
            <div class="time-box real">
              <small style="color: var(--danger); display: block;">ATD</small>
              <strong>${formatHora(v.atd)}</strong>
            </div>
          </div>

          <div style="font-size: 11px; color: var(--text-2); margin-bottom: 12px; display: flex; justify-content: space-between;">
            <span><strong>Matrícula:</strong> ${matricula || '<span style="color:red">Pendiente</span>'}${v.tipoAeronave ? ` (${v.tipoAeronave})` : ''}</span>
            <span><strong>Puerta:</strong> ${v.puertaposicion || '--'} | <strong>Faja:</strong> ${v.faja || '--'}</span>
          </div>
        </div>

        <button 
          class="btn btn-primary" 
          style="width: 100%; margin-top: 10px;"
          onclick="seleccionarOperacion(${JSON.stringify(v).replace(/"/g, '&quot;')})"
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
  // Validación estricta para Delta/Avianca
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

  mostrarPantallaCarga('Seleccionando Operación...', `Cargando vuelo ${vuelo.novuelo || ''} de ${vuelo.operador || ''} y preparando formatos...`);

  try {
    const res = await fetch('/api/operaciones/seleccionar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ operacion: vuelo })
    });
    const data = await res.json();
    if (data.success) {
      window.location.href = data.redirectUrl || '/formatos';
    } else {
      ocultarPantallaCarga();
      Swal.fire({ icon: 'error', title: 'Error', text: data.message, confirmButtonColor: '#275B88' });
    }
  } catch (err) {
    ocultarPantallaCarga();
    Swal.fire({ icon: 'error', title: 'Error de Red', text: 'No se pudo seleccionar el itinerario.', confirmButtonColor: '#275B88' });
  }
}

/**
 * Maneja la selección de un formato y verifica si debe reanudar o crear nuevo
 */
async function abrirFormato(formatoId, formatoNombre, itinerarioId) {
  mostrarPantallaCarga('Verificando Formatos...', `Consultando registros previos para "${formatoNombre}" en Azure SQL...`);
  try {
    const res = await fetch('/api/formatos/verificar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ itinerarioId, tipoFormato: formatoNombre })
    });
    const result = await res.json();

    if (result.success && result.requiereDecision && result.data.length > 0) {
      ocultarPantallaCarga();
      mostrarModalReanudar(formatoId, formatoNombre, result.data);
    } else {
      window.location.href = `/formatos/${formatoId}`;
    }
  } catch (err) {
    window.location.href = `/formatos/${formatoId}`;
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
          <span style="color: var(--brand); font-weight: 800; font-size: 14px;">#${e.FormatoEncabezadoId || 'REG'}</span>
          <div style="font-size: 11px; color: var(--text-2);">Creado por: <strong>${e.CreadoPor || 'S/N'}</strong></div>
          <div style="font-size: 10px; color: var(--text-3);">${e.FechaCreacion ? String(e.FechaCreacion).substring(0, 10) : ''}</div>
        </div>
        <a href="/formatos/${formatoId}?encabezadoId=${e.FormatoEncabezadoId}" onclick="mostrarPantallaCarga('Cargando Formato...', 'Recuperando datos del registro #' + '${e.FormatoEncabezadoId}');" class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;">
          <i class="fas fa-folder-open"></i> Reanudar
        </a>
      </div>
    `).join('');
  }

  if (btnNuevo) {
    btnNuevo.onclick = () => {
      mostrarPantallaCarga('Preparando Formato...', `Inicializando nuevo registro de ${formatoNombre}...`);
      window.location.href = `/formatos/${formatoId}`;
    };
  }

  modal.style.display = 'flex';
}

function cerrarModalReanudar() {
  const modal = document.getElementById('modalReanudar');
  if (modal) modal.style.display = 'none';
}
