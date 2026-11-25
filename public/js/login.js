/**
 * Controlador Frontend de Autenticación - SIO LAATS Formatos SEC
 * Compatible con política estricta CSP de Helmet (sin scripts ni eventos inline).
 * Integrado con SioNavigationManager para evitar estados congelados al retroceder.
 */
document.addEventListener('DOMContentLoaded', () => {
  const navMgr = window.SioNavigationManager;
  const toggleBtn = document.getElementById('togglePinView');
  const pinInput = document.getElementById('pinInput');
  const formLogin = document.getElementById('formLogin');
  const loadingOverlay = document.getElementById('sioLoadingOverlay');
  let isSubmitting = false;

  function setButtonIconAndLabel(buttonEl, iconClass, labelText) {
    const icon = document.createElement('i');
    icon.className = iconClass;
    icon.setAttribute('aria-hidden', 'true');
    buttonEl.replaceChildren(icon, document.createTextNode(` ${labelText}`));
  }

  function resetLoginUi() {
    isSubmitting = false;
    if (navMgr && typeof navMgr.dismissAllOverlays === 'function') {
      navMgr.dismissAllOverlays({ reason: 'login-reset', abortRequests: false });
    } else if (loadingOverlay) {
      loadingOverlay.classList.remove('active');
      loadingOverlay.setAttribute('aria-hidden', 'true');
    }
    const btn = document.getElementById('btnLoginSubmit');
    if (btn) {
      btn.disabled = false;
      setButtonIconAndLabel(btn, 'fas fa-sign-in-alt', 'Iniciar Sesión');
    }
  }

  // Limpieza preventiva al montar
  resetLoginUi();

  // Visibilidad de PIN
  if (toggleBtn && pinInput) {
    toggleBtn.addEventListener('click', () => {
      const isPass = pinInput.type === 'password';
      pinInput.type = isPass ? 'text' : 'password';
      toggleBtn.setAttribute('aria-pressed', isPass ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', isPass ? 'Ocultar PIN' : 'Mostrar PIN');
      const icon = document.createElement('i');
      icon.className = isPass ? 'fas fa-eye-slash' : 'fas fa-eye';
      icon.setAttribute('aria-hidden', 'true');
      toggleBtn.replaceChildren(icon);
    });
  }

  // Manejo de Login Asíncrono con AbortController y redirección replace()
  if (formLogin && pinInput) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const pin = String(pinInput.value || '').trim();
      const hpInput = formLogin.querySelector('input[name="hp_token_website"]');
      const hp = hpInput ? hpInput.value : '';

      if (!pin) {
        Swal.fire({
          icon: 'warning',
          title: 'PIN Requerido',
          text: 'Por favor ingrese su PIN alfanumérico para continuar.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      if (pin.length > 50 || /[\x00-\x1F\x7F]/.test(pin)) {
        Swal.fire({
          icon: 'warning',
          title: 'PIN Inválido',
          text: 'El PIN ingresado excede la longitud permitida o contiene caracteres no válidos.',
          confirmButtonColor: '#275B88'
        });
        return;
      }

      isSubmitting = true;
      const btn = document.getElementById('btnLoginSubmit');
      if (btn) {
        btn.disabled = true;
        setButtonIconAndLabel(btn, 'fas fa-spinner fa-spin', 'Validando...');
      }
      if (loadingOverlay) {
        const t = document.getElementById('sioLoadingTitle');
        const s = document.getElementById('sioLoadingSubtitle');
        if (t) t.textContent = 'Validando Credenciales...';
        if (s) s.textContent = 'Verificando PIN y perfil SEC en Azure SQL Server...';
        loadingOverlay.classList.add('active');
        loadingOverlay.setAttribute('aria-hidden', 'false');
      }
      if (navMgr && typeof navMgr.scheduleOverlayFailsafe === 'function') {
        navMgr.scheduleOverlayFailsafe(18000);
      }

      const reqCtrl = navMgr ? navMgr.createAbortController('login-post') : { signal: undefined, release: () => {} };

      try {
        const response = await fetch('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ pin, hp_token_website: hp }),
          signal: reqCtrl.signal
        });

        const data = await response.json();
        if (loadingOverlay) {
          loadingOverlay.classList.remove('active');
          loadingOverlay.setAttribute('aria-hidden', 'true');
        }
        if (navMgr) navMgr.clearOverlayFailsafe();

        if (data.success) {
          await Swal.fire({
            icon: 'success',
            title: '¡SESIÓN EXITOSA!',
            text: 'Bienvenido a SIO Formatos SEC.',
            showConfirmButton: false,
            timer: 850
          });

          // Usar location.replace() para reemplazar /login en el historial y evitar bucles al retroceder
          const destino = data.redirectUrl || '/operaciones';
          if (loadingOverlay) {
            const t = document.getElementById('sioLoadingTitle');
            const s = document.getElementById('sioLoadingSubtitle');
            if (t) t.textContent = 'Cargando Panel de Operaciones...';
            if (s) s.textContent = 'Preparando vuelos y catálogos autorizados...';
            loadingOverlay.classList.add('active');
            loadingOverlay.setAttribute('aria-hidden', 'false');
          }
          if (navMgr && typeof navMgr.scheduleOverlayFailsafe === 'function') {
            navMgr.scheduleOverlayFailsafe(15000);
          }
          window.location.replace(destino);
        } else {
          resetLoginUi();
          Swal.fire({
            icon: 'error',
            title: 'Acceso Denegado',
            text: data.message || 'Credenciales inválidas.',
            confirmButtonColor: '#275B88'
          });
        }
      } catch (err) {
        if (navMgr && navMgr.isAbortError(err)) {
          resetLoginUi();
          return;
        }
        resetLoginUi();
        Swal.fire({
          icon: 'error',
          title: 'Error de Servidor',
          text: 'No se pudo comunicar con el servidor.',
          confirmButtonColor: '#275B88'
        });
      } finally {
        reqCtrl.release();
      }
    });
  }

  // Cierre de emergencia al hacer clic en el backdrop del overlay
  if (loadingOverlay) {
    loadingOverlay.addEventListener('click', (e) => {
      if (e.target === loadingOverlay) {
        if (navMgr) navMgr.abortAllRequests('login-overlay-dismiss');
        resetLoginUi();
      }
    });
  }

  window.addEventListener('pageshow', resetLoginUi);
  window.addEventListener('popstate', resetLoginUi);
  window.addEventListener('pagehide', resetLoginUi);
});
