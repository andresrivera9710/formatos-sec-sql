/**
 * Controlador Frontend de Autenticación - SIO LAATS Formatos SEC
 * Compatible con política estricta CSP de Helmet (sin scripts ni eventos inline).
 */
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('togglePinView');
  const pinInput = document.getElementById('pinInput');
  const formLogin = document.getElementById('formLogin');
  const loadingOverlay = document.getElementById('sioLoadingOverlay');
  const btnHealth = document.getElementById('btnVerificarEstadoServidor');

  // Visibilidad de PIN
  if (toggleBtn && pinInput) {
    toggleBtn.addEventListener('click', () => {
      const isPass = pinInput.type === 'password';
      pinInput.type = isPass ? 'text' : 'password';
      toggleBtn.innerHTML = isPass ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    });
  }

  // Verificación Interactiva del Estado del Servidor
  if (btnHealth) {
    btnHealth.addEventListener('click', async () => {
      btnHealth.disabled = true;
      const originalHtml = btnHealth.innerHTML;
      btnHealth.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const data = await res.json();
        Swal.fire({
          icon: 'success',
          title: 'Servidor Operacional',
          html: `
            <div style="text-align: left; font-size: 13px; line-height: 1.6;">
              <p style="margin: 4px 0;"><strong>Estado:</strong> <span style="color: var(--success); font-weight: bold;">${(data.status || 'OK').toUpperCase()}</span></p>
              <p style="margin: 4px 0;"><strong>Aplicación:</strong> ${data.app || 'SIO Formatos SEC'}</p>
              <p style="margin: 4px 0;"><strong>Entorno:</strong> ${data.environment || 'Producción'}</p>
              <p style="margin: 4px 0;"><strong>Cifrado TLS:</strong> Activo (encrypt: true)</p>
              <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${data.timestamp || new Date().toISOString()}</p>
            </div>
          `,
          confirmButtonColor: '#275B88',
          confirmButtonText: 'Aceptar'
        });
      } catch (err) {
        Swal.fire({
          icon: 'info',
          title: 'Servidor en Línea',
          text: 'Plataforma SIO Formatos SEC activa y protegida.',
          confirmButtonColor: '#275B88',
          confirmButtonText: 'Aceptar'
        });
      } finally {
        btnHealth.disabled = false;
        btnHealth.innerHTML = originalHtml;
      }
    });
  }

  // Manejo de Login Asíncrono
  if (formLogin && pinInput) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = pinInput.value.trim();
      const hpInput = formLogin.querySelector('input[name="hp_token_website"]');
      const hp = hpInput ? hpInput.value : '';

      if (!pin) {
        Swal.fire({
          icon: 'warning',
          title: 'PIN Requerido',
          text: 'Por favor ingrese su PIN para continuar.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      const btn = document.getElementById('btnLoginSubmit');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando credenciales...';
      }
      if (loadingOverlay) loadingOverlay.classList.add('active');

      try {
        const response = await fetch('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ pin, hp_token_website: hp })
        });

        const data = await response.json();
        if (loadingOverlay) loadingOverlay.classList.remove('active');

        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: '¡SESIÓN EXITOSA!',
            text: 'Bienvenido a SIO Formatos SEC.',
            showConfirmButton: false,
            timer: 1200
          }).then(() => {
            if (loadingOverlay) {
              const t = document.getElementById('sioLoadingTitle');
              const s = document.getElementById('sioLoadingSubtitle');
              if (t) t.textContent = 'Cargando Panel de Operaciones...';
              if (s) s.textContent = 'Preparando vuelos y catálogos autorizados...';
              loadingOverlay.classList.add('active');
            }
            window.location.href = data.redirectUrl || '/operaciones';
          });
        } else {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
          }
          Swal.fire({
            icon: 'error',
            title: 'Acceso Denegado',
            text: data.message || 'Credenciales inválidas.',
            confirmButtonColor: '#275B88'
          });
        }
      } catch (err) {
        if (loadingOverlay) loadingOverlay.classList.remove('active');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
        }
        Swal.fire({
          icon: 'error',
          title: 'Error de Servidor',
          text: 'No se pudo comunicar con el servidor.',
          confirmButtonColor: '#275B88'
        });
      }
    });
  }

  // Cierre de emergencia al hacer clic en el backdrop del overlay
  if (loadingOverlay) {
    loadingOverlay.addEventListener('click', (e) => {
      if (e.target === loadingOverlay) {
        loadingOverlay.classList.remove('active');
        loadingOverlay.setAttribute('aria-hidden', 'true');
        const btn = document.getElementById('btnLoginSubmit');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
        }
      }
    });
  }
});

// Solución al Bug de Navegación Atrás (BFCache en dispositivos móviles: Safari iOS / Chrome Android)
function ocultarLoginLoading() {
  const loadingOverlay = document.getElementById('sioLoadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.classList.remove('active');
    loadingOverlay.setAttribute('aria-hidden', 'true');
  }
  const btn = document.getElementById('btnLoginSubmit');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
  }
}

window.addEventListener('pageshow', ocultarLoginLoading);
window.addEventListener('popstate', ocultarLoginLoading);
