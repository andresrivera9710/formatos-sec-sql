/**
 * Controlador Frontend de Captura y Firma Digital de Formatos - SIO LAATS Formatos SEC
 * Compatible con política estricta CSP de Helmet (sin scripts ni eventos inline).
 */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvasFirma');
  const form = document.getElementById('formCapturaFormato');
  if (!form) return;

  let sigPad = null;
  if (canvas && window.SioSignaturePad) {
    sigPad = new SioSignaturePad(canvas);
  }

  const campoSupervisor = document.getElementById('campoSupervisor');
  if (campoSupervisor && campoSupervisor.tagName === 'SELECT' && window.SioSearchableCombo) {
    new window.SioSearchableCombo(campoSupervisor, {
      placeholder: '-- Seleccione el Supervisor --',
      searchPlaceholder: 'Buscar supervisor en LoginSEC...',
      emptyText: 'No se encontró el supervisor.'
    });
  }

  const btnLimpiar = document.getElementById('btnLimpiarFirma');
  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      if (sigPad) sigPad.clear();
    });
  }

  const procesarFormato = async (guardar) => {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    const firmaData = (sigPad && !sigPad.isEmpty()) ? sigPad.toDataURL() : null;

    payload.guardar = guardar;
    payload.datos = {
      fecha: payload.fecha,
      agente: payload.agente,
      supervisor: payload.supervisor,
      horaInicio: payload.horaInicio,
      horaFin: payload.horaFin,
      posicion: payload.posicion,
      noUnidad: payload.noUnidad,
      unidad: payload.noUnidad,
      resultado: payload.resultado,
      observaciones: payload.observaciones,
      firma: firmaData,
      firmaBase64: firmaData
    };

    let previewWin = null;
    if (!guardar && String(payload.formatoId || '').startsWith('amx-')) {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try {
          previewWin.document.title = 'Generando Vista Preliminar...';
        } catch (_) {}
      }
    }

    if (typeof mostrarPantallaCarga === 'function') {
      mostrarPantallaCarga(
        guardar ? 'Guardando Formato...' : 'Generando Vista Preliminar...',
        guardar
          ? 'Procesando validación y persistencia en Azure SQL Server...'
          : 'Construyendo vista oficial del formato controlado...'
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
                    El navegador bloqueó la apertura automática de la pestaña. Haz clic para abrir el formato controlado:
                  </p>
                  <a href="${res.previewUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">
                    <i class="fas fa-external-link-alt"></i> Abrir Vista Preliminar
                  </a>
                `,
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#275B88'
              });
            }
          } else {
            if (previewWin && !previewWin.closed) previewWin.close();
            Swal.fire({
              icon: 'info',
              title: 'Vista Preliminar Aprobada',
              html: `
                <div style="text-align: left; font-size: 13px;">
                  <p><strong>Formato:</strong> ${res.resumen.formato}</p>
                  <p><strong>Aerolínea:</strong> ${res.resumen.aerolinea}</p>
                  <p><strong>Resultado:</strong> ${payload.datos.resultado}</p>
                  <p><strong>Supervisor:</strong> ${payload.datos.supervisor || 'N/A'}</p>
                  <p style="margin-top: 10px; color: var(--success); font-weight: 700;">El formato cumple las validaciones de negocio en memoria.</p>
                </div>
              `,
              confirmButtonColor: '#275B88'
            });
          }
        } else {
          Swal.fire({
            icon: 'success',
            title: '¡Guardado Exitoso!',
            text: res.mensaje || 'Formato registrado con éxito en la base de datos.',
            confirmButtonColor: '#275B88'
          }).then(() => {
            window.location.href = '/formatos';
          });
        }
      } else {
        if (previewWin && !previewWin.closed) previewWin.close();
        Swal.fire({
          icon: 'error',
          title: 'Error de Validación',
          text: res.message || 'No se pudo guardar el formato.',
          confirmButtonColor: '#275B88'
        });
      }
    } catch (err) {
      if (previewWin && !previewWin.closed) previewWin.close();
      if (typeof ocultarPantallaCarga === 'function') ocultarPantallaCarga();
      Swal.fire({
        icon: 'error',
        title: 'Error de Red',
        text: 'Fallo al comunicar con el servidor.',
        confirmButtonColor: '#275B88'
      });
    }
  };

  const btnPreliminar = document.getElementById('btnVistaPreliminar');
  if (btnPreliminar) {
    btnPreliminar.addEventListener('click', () => procesarFormato(false));
  }

  const btnGuardar = document.getElementById('btnGuardarDefinitivo');
  if (btnGuardar) {
    btnGuardar.addEventListener('click', () => procesarFormato(true));
  }
});

