/**
 * Frontend Application Controller - SIO LAATS Formatos SEC
 * Manejo interactivo de peticiones AJAX, modales, alertas SweetAlert2 y formularios.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicialización de selector de fechas con la fecha de hoy
  const inputFecha1 = document.getElementById('filtroFecha1');
  if (inputFecha1 && !inputFecha1.value) {
    const today = new Date().toISOString().split('T')[0];
    inputFecha1.value = today;
  }

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
  const fecha = document.getElementById('filtroFecha1')?.value;
  const operadorId = document.getElementById('filtroOperador')?.value || 0;
  const fecha2Check = document.getElementById('checkRangoFechas')?.checked;
  const fecha2 = fecha2Check ? document.getElementById('filtroFecha2')?.value : null;

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
  if (container) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <i class="fas fa-spinner fa-spin fa-3x" style="color: var(--brand);"></i>
        <p style="margin-top: 16px; font-weight: 600; color: var(--text-2);">Consultando operaciones en tiempo real...</p>
      </div>
    `;
  }

  try {
    const response = await fetch('/api/operaciones/consultar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, operadorId, fecha2 })
    });

    const res = await response.json();

    if (!res.success) {
      throw new Error(res.message || 'Error en la consulta');
    }

    renderizarTarjetas(res.data);
  } catch (err) {
    console.error('[CONSULTAR OPERACIONES ERROR]', err);
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: #FFF; border-radius: 12px; border: 1px solid var(--border);">
          <i class="fas fa-exclamation-triangle fa-3x" style="color: var(--danger);"></i>
          <h3 style="margin-top: 16px; color: var(--text);">No se encontraron operaciones</h3>
          <p style="color: var(--text-3); margin-top: 8px;">No existen itinerarios para los criterios seleccionados o verifique la conexión.</p>
        </div>
      `;
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
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: #FFF; border-radius: 12px; border: 1px solid var(--border);">
        <i class="fas fa-plane-slash fa-3x" style="color: var(--text-muted);"></i>
        <h3 style="margin-top: 16px; color: var(--text);">No se encontraron datos</h3>
        <p style="color: var(--text-3); margin-top: 8px;">No hay vuelos itinerados en las fechas y aerolínea seleccionadas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = lista.map(v => {
    const esAnulado = v.anulado && v.anulado != 0;
    const esDeltaAvianca = (v.operador || '').toUpperCase().includes('DELTA') || (v.operador || '').toUpperCase().includes('AVIANCA');
    const sinMatricula = !v.Matricula || v.Matricula.trim() === '';

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
            <span><strong>Fecha:</strong> ${v.FechaItinerado ? v.FechaItinerado.substring(0, 10) : 'Hoy'}</span>
          </div>

          <div class="op-route">
            <div>
              <div style="font-size: 10px; color: var(--text-3); text-transform: uppercase;">Procedencia</div>
              <div class="route-city">${v.Procedencia || 'GUA'}</div>
            </div>
            <div style="color: var(--brand); font-size: 18px;"><i class="fas fa-plane"></i></div>
            <div style="text-align: right;">
              <div style="font-size: 10px; color: var(--text-3); text-transform: uppercase;">Destino</div>
              <div class="route-city">${v.Destino || 'MIA'}</div>
            </div>
          </div>

          <div class="op-times">
            <div class="time-box">
              <small style="color: var(--text-3); display: block;">ETA</small>
              <strong>${v.eta ? v.eta.substring(11, 16) : '--:--'}</strong>
            </div>
            <div class="time-box">
              <small style="color: var(--text-3); display: block;">ETD</small>
              <strong>${v.etd ? v.etd.substring(11, 16) : '--:--'}</strong>
            </div>
            <div class="time-box real">
              <small style="color: var(--danger); display: block;">ATA</small>
              <strong>${v.ata ? v.ata.substring(11, 16) : '--:--'}</strong>
            </div>
            <div class="time-box real">
              <small style="color: var(--danger); display: block;">ATD</small>
              <strong>${v.atd ? v.atd.substring(11, 16) : '--:--'}</strong>
            </div>
          </div>

          <div style="font-size: 11px; color: var(--text-2); margin-bottom: 12px; display: flex; justify-content: space-between;">
            <span><strong>Matrícula:</strong> ${v.Matricula || '<span style=\"color:red\">Pendiente</span>'}</span>
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
  if ((opNombre.includes('DELTA') || opNombre.includes('AVIANCA')) && (!vuelo.Matricula || vuelo.Matricula.trim() === '')) {
    Swal.fire({
      icon: 'error',
      title: 'Matrícula Obligatoria',
      text: `Para operaciones de ${vuelo.operador} debe ingresar la matrícula y datos necesarios antes de generar los reportes de seguridad.`,
      confirmButtonColor: '#275B88'
    });
    return;
  }

  try {
    const res = await fetch('/api/operaciones/seleccionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operacion: vuelo })
    });
    const data = await res.json();
    if (data.success) {
      window.location.href = data.redirectUrl || '/formatos';
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error de Red', text: 'No se pudo seleccionar el itinerario.' });
  }
}

/**
 * Maneja la selección de un formato y verifica si debe reanudar o crear nuevo
 */
async function abrirFormato(formatoId, formatoNombre, itinerarioId) {
  try {
    const res = await fetch('/api/formatos/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itinerarioId, tipoFormato: formatoNombre })
    });
    const result = await res.json();

    if (result.success && result.requiereDecision && result.data.length > 0) {
      // Mostrar Modal: Reanudar vs Crear Nuevo
      mostrarModalReanudar(formatoId, formatoNombre, result.data);
    } else {
      // Avanzar directamente a crear nuevo formato
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
          <div style="font-size: 10px; color: var(--text-3);">${e.FechaCreacion ? e.FechaCreacion.substring(0, 10) : ''}</div>
        </div>
        <a href="/formatos/${formatoId}?encabezadoId=${e.FormatoEncabezadoId}" class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;">
          <i class="fas fa-folder-open"></i> Reanudar
        </a>
      </div>
    `).join('');
  }

  if (btnNuevo) {
    btnNuevo.onclick = () => {
      window.location.href = `/formatos/${formatoId}`;
    };
  }

  modal.style.display = 'flex';
}

function cerrarModalReanudar() {
  const modal = document.getElementById('modalReanudar');
  if (modal) modal.style.display = 'none';
}
