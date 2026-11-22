/**
 * Controlador Frontend para Control de Perimétrica Unificado (*-cp)
 * 100% compatible con Helmet CSP estricto (sin manejadores inline).
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formControlPerimetrica');
  if (!form) return;

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
    Nombre: String(r.Nombre || '').trim(),
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

  // Inicializar cuadros combinados con búsqueda integrada
  const selSupervisor = document.getElementById('cpSupervisor');
  const selEmpresa = document.getElementById('cpRegEmpresa');
  const selTractorista = document.getElementById('cpTractorista');
  const selNoUnidad = document.getElementById('cpNoUnidad');
  const selAlero = document.getElementById('cpAleroSelect');

  const comboSupervisor = selSupervisor && window.SioSearchableCombo
    ? new window.SioSearchableCombo(selSupervisor, {
        placeholder: '-- Seleccione el Supervisor --',
        searchPlaceholder: 'Buscar supervisor en LoginSEC...',
        emptyText: 'No se encontró el supervisor.'
      })
    : null;

  const comboEmpresa = selEmpresa && window.SioSearchableCombo
    ? new window.SioSearchableCombo(selEmpresa, {
        placeholder: '-- Seleccione la Empresa --',
        searchPlaceholder: 'Buscar empresa...',
        emptyText: 'No se encontró la empresa.'
      })
    : null;

  const comboTractorista = selTractorista && window.SioSearchableCombo
    ? new window.SioSearchableCombo(selTractorista, {
        placeholder: '-- Seleccione a la persona que realiza PushBack --',
        searchPlaceholder: 'Buscar tractorista...',
        emptyText: 'No se encontró empleado.'
      })
    : null;

  const comboNoUnidad = selNoUnidad && window.SioSearchableCombo
    ? new window.SioSearchableCombo(selNoUnidad, {
        placeholder: '-- Seleccione la unidad --',
        searchPlaceholder: 'Buscar No. de Unidad...',
        emptyText: 'No se encontró unidad.'
      })
    : null;

  const comboAlero = selAlero && window.SioSearchableCombo
    ? new window.SioSearchableCombo(selAlero, {
        placeholder: '-- Seleccionar agentes para aleros --',
        searchPlaceholder: 'Buscar agente para alero...',
        emptyText: 'No se encontró agente.'
      })
    : null;

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
      });
    }
  };
  bindClockButton('btnCpHoraAseguradaActual', inputHoraAsegurado);
  bindClockButton('btnCpHoraRevisionActual', inputHoraRevision);
  bindClockButton('btnCpHoraIngresoActual', inputRegHoraIngreso);

  // Toggle campo manual cuando Empresa === 'OTROS...'
  if (selEmpresa && grupoEmpresaOtros) {
    selEmpresa.addEventListener('change', () => {
      if (selEmpresa.value === 'OTROS...') {
        grupoEmpresaOtros.style.display = 'block';
        inputRegEmpresaOtros?.focus();
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
        <div class="cp-reg-card">
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

  // Agregar nuevo registro desde el subformulario REGISTRO
  const btnAgregarRegistro = document.getElementById('btnCpAgregarRegistro');
  if (btnAgregarRegistro) {
    btnAgregarRegistro.addEventListener('click', () => {
      const nombre = String(inputRegNombre?.value || '').trim();
      const noTia = String(inputRegNoTIA?.value || '').trim();
      const horaIngreso = extractHHMM(inputRegHoraIngreso?.value || '');
      const empresaSel = String(selEmpresa?.value || '').trim();
      const empresaFinal = empresaSel === 'OTROS...'
        ? String(inputRegEmpresaOtros?.value || '').trim()
        : empresaSel;
      const motivo = String(inputRegMotivo?.value || '').trim();

      if (!nombre || !noTia || !horaIngreso || !empresaFinal || !motivo) {
        if (!empresaSel && comboEmpresa) comboEmpresa.setInvalid(true);
        Swal.fire({
          icon: 'warning',
          title: 'Campos Incompletos en Registro',
          text: 'Por favor complete Nombre, No. TIA, Hora de Ingreso, Empresa y Motivo antes de agregar.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      registros.push({
        DetalleCPId: 0,
        Nombre: nombre,
        NoTIA: noTia,
        HoraIngreso: horaIngreso,
        Empresa: empresaFinal,
        Motivo: motivo,
        HoraSalida: ''
      });

      if (inputRegNombre) inputRegNombre.value = '';
      if (inputRegNoTIA) inputRegNoTIA.value = '';
      if (inputRegHoraIngreso) inputRegHoraIngreso.value = '';
      if (inputRegEmpresaOtros) inputRegEmpresaOtros.value = '';
      if (grupoEmpresaOtros) grupoEmpresaOtros.style.display = 'none';
      if (inputRegMotivo) inputRegMotivo.value = '';
      if (comboEmpresa) {
        comboEmpresa.clearSelection();
      } else if (selEmpresa) {
        selEmpresa.value = '';
      }

      renderRegistros();
      inputRegNombre?.focus();
    });
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
    });
  }

  if (listaAlerosEl) {
    listaAlerosEl.addEventListener('click', (e) => {
      const btnQuitar = e.target.closest('.btn-cp-eliminar-alero');
      if (!btnQuitar) return;
      const empId = parseInt(btnQuitar.dataset.empId, 10);
      aleros = aleros.filter((a) => a.EmpleadoId !== empId);
      renderAleros();
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
    const supervisorNombre = selSupervisor && selSupervisor.selectedIndex >= 0
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
      ? String(selNoUnidad.options[selNoUnidad.selectedIndex]?.textContent || '').trim()
      : '');
    const observaciones = String(inputObservaciones?.value || '').trim();

    if (guardar) {
      if (!horaInicio) {
        Swal.fire({
          icon: 'warning',
          title: 'Hora de Revisión Requerida',
          text: 'Debe ingresar una Hora de Revisión válida (HH:mm).',
          confirmButtonColor: '#275B88'
        });
        inputHoraRevision?.focus();
        return;
      }

      if (supervisorEmpleadoId <= 0) {
        if (comboSupervisor) comboSupervisor.setInvalid(true);
        Swal.fire({
          icon: 'warning',
          title: 'Supervisor Requerido',
          text: 'Debe seleccionar un Supervisor de Turno del cuadro combinado.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      const pendientes = registros.filter((r) => !r.HoraSalida || r.HoraSalida.trim() === '');
      if (pendientes.length > 0) {
        Swal.fire({
          icon: 'error',
          title: '¡ALERTA DE SEGURIDAD!',
          text: 'Hay una o más personas que aún NO han salido de la aeronave. Por favor, registra su hora de salida antes de guardar.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      if (maquinariaEquipoId > 0 && tractoristaEmpleadoId <= 0) {
        if (comboTractorista) comboTractorista.setInvalid(true);
        Swal.fire({
          icon: 'warning',
          title: 'Tractorista Requerido',
          text: 'Debe seleccionar al Tractorista cuando asigna un No. Unidad.',
          confirmButtonColor: '#275B88'
        });
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

  // Render inicial
  renderRegistros();
  renderAleros();
});

