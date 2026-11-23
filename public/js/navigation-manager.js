/**
 * SioNavigationManager — Control Centralizado de Historial, BFCache y Overlays Fail-Safe
 * SIO LAATS Formatos SEC
 *
 * 100% compatible con Helmet CSP (archivo externo, cero scripts/handlers inline).
 * Resuelve de raíz:
 * 1. Overlays de carga congelados ("Cargando Panel de Operaciones...", "Seleccionando Operación...")
 *    al usar botón atrás del navegador/ratón o swipe-back en móviles (BFCache).
 * 2. Modales SweetAlert2 y modales personalizados (#modalReanudar) atrapados tras retroceder.
 * 3. Peticiones fetch en vuelo que intentan redirigir o abrir errores después de retroceder (AbortController).
 * 4. Desincronización entre la URL del navegador y el contenido visible tras retrocesos rápidos.
 */
(function (window, document) {
  'use strict';

  const DEFAULT_FAILSAFE_MS = 18000;
  const _activeControllers = new Set();
  let _failsafeTimer = null;
  let _navigationEpoch = 0;

  /**
   * Determina si un error proviene de una petición cancelada intencionalmente al navegar.
   * @param {any} err
   * @returns {boolean}
   */
  function isAbortError(err) {
    if (!err) return false;
    return err.name === 'AbortError' ||
      err.code === 20 ||
      String(err.message || '').toLowerCase().includes('aborted');
  }

  /**
   * Crea y registra un AbortController ligado al ciclo de vida de la navegación actual.
   * Si el usuario presiona atrás o abandona la vista, todas las peticiones activas se cancelan.
   * @param {string} [tag='request']
   * @returns {{ controller: AbortController|null, signal: AbortSignal|undefined, release: Function, epoch: number }}
   */
  function createAbortController(tag) {
    const epoch = _navigationEpoch;
    if (typeof AbortController !== 'function') {
      return {
        controller: null,
        signal: undefined,
        epoch,
        release: function () {}
      };
    }

    const controller = new AbortController();
    controller._sioTag = tag || 'request';
    _activeControllers.add(controller);

    function release() {
      _activeControllers.delete(controller);
    }

    if (controller.signal) {
      controller.signal.addEventListener('abort', release, { once: true });
    }

    return {
      controller,
      signal: controller.signal,
      epoch,
      release
    };
  }

  /**
   * Cancela todas las peticiones fetch registradas en vuelo.
   * @param {string} [reason='navigation']
   */
  function abortAllRequests(reason) {
    _navigationEpoch += 1;
    _activeControllers.forEach(function (ctrl) {
      try {
        ctrl.abort(reason || 'navigation');
      } catch (_) {
        try {
          ctrl.abort();
        } catch (_ignored) {}
      }
    });
    _activeControllers.clear();
  }

  /**
   * Cancela el temporizador failsafe de overlays.
   */
  function clearOverlayFailsafe() {
    if (_failsafeTimer) {
      clearTimeout(_failsafeTimer);
      _failsafeTimer = null;
    }
  }

  /**
   * Programa un cierre de emergencia automático para que ningún spinner bloquee la UI de forma indefinida.
   * @param {number} [timeoutMs]
   */
  function scheduleOverlayFailsafe(timeoutMs) {
    clearOverlayFailsafe();
    const delay = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_FAILSAFE_MS;
    _failsafeTimer = setTimeout(function () {
      dismissAllOverlays({ reason: 'failsafe-timeout', abortRequests: false });
    }, delay);
  }

  /**
   * Restaura botones que pudieron quedar deshabilitados con spinner al cancelar/retroceder.
   */
  function restoreInteractiveControls() {
    try {
      const btnLogin = document.getElementById('btnLoginSubmit');
      if (btnLogin && btnLogin.disabled) {
        btnLogin.disabled = false;
        btnLogin.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
      }

      const btnConsultar = document.getElementById('btnConsultarOperaciones');
      if (btnConsultar && btnConsultar.disabled) {
        btnConsultar.disabled = false;
        btnConsultar.innerHTML = '<i class="fas fa-search"></i> Consultar';
      }

      const opButtons = document.querySelectorAll('.btn-seleccionar-operacion[data-sio-busy="1"]');
      opButtons.forEach(function (btn) {
        btn.disabled = false;
        btn.removeAttribute('data-sio-busy');
      });
    } catch (_) {}
  }

  /**
   * Destruye y oculta de forma inmediata y determinista todos los overlays de carga,
   * spinners, modales SweetAlert2 y modales personalizados del DOM.
   * @param {{ reason?: string, abortRequests?: boolean }} [options]
   */
  function dismissAllOverlays(options) {
    const opts = options || {};
    clearOverlayFailsafe();

    if (opts.abortRequests === true) {
      abortAllRequests(opts.reason || 'dismiss-overlays');
    }

    // 1. Invocar limpiador de app.js si ya existe (detiene el cronómetro interno)
    try {
      if (typeof window.ocultarPantallaCarga === 'function' && !opts._fromApp) {
        window.ocultarPantallaCarga({ _fromNavManager: true });
      }
    } catch (_) {}

    // 2. Ocultar forzosamente cualquier overlay corporativo LAATS
    try {
      const overlays = document.querySelectorAll('.sio-loading-overlay, #sioLoadingOverlay');
      overlays.forEach(function (el) {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
        if (el.style && el.style.display && el.style.display !== 'none') {
          el.style.display = '';
        }
      });
    } catch (_) {}

    // 3. Cerrar y purgar cualquier modal SweetAlert2 congelado en pantalla o BFCache
    try {
      if (typeof window.Swal !== 'undefined' && window.Swal && typeof window.Swal.close === 'function') {
        if (typeof window.Swal.isVisible !== 'function' || window.Swal.isVisible()) {
          window.Swal.close();
        }
      }
    } catch (_) {}

    try {
      const swalContainers = document.querySelectorAll('.swal2-container');
      swalContainers.forEach(function (node) {
        if (node && node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });

      const swalClasses = [
        'swal2-shown',
        'swal2-height-auto',
        'swal2-iosfix',
        'swal2-no-backdrop',
        'swal2-toast-shown'
      ];
      if (document.documentElement) {
        swalClasses.forEach(function (cls) {
          document.documentElement.classList.remove(cls);
        });
      }
      if (document.body) {
        swalClasses.forEach(function (cls) {
          document.body.classList.remove(cls);
        });
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
        document.body.style.removeProperty('pointer-events');
      }
    } catch (_) {}

    // 4. Ocultar modales personalizados (ej. #modalReanudar)
    try {
      const customModals = document.querySelectorAll('.modal-overlay, #modalReanudar');
      customModals.forEach(function (modal) {
        modal.classList.remove('active', 'is-open', 'show');
        modal.style.display = 'none';
      });
    } catch (_) {}

    // 5. Restaurar botones interactivos que pudieron quedar bloqueados
    restoreInteractiveControls();
  }

  /**
   * Navegación segura: limpia overlays antes de abandonar la página y evita estados congelados en caché.
   * @param {string} url
   * @param {{ replace?: boolean }} [options]
   */
  function navigateTo(url, options) {
    const opts = options || {};
    if (!url) return;
    clearOverlayFailsafe();
    if (opts.replace) {
      window.location.replace(url);
    } else {
      window.location.assign(url);
    }
  }

  /**
   * Detecta si la página actual llegó mediante botón atrás/adelante del navegador.
   * @param {PageTransitionEvent} [event]
   * @returns {boolean}
   */
  function isBackForwardNavigation(event) {
    if (event && event.persisted) return true;
    try {
      if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries && navEntries.length > 0 && navEntries[0].type === 'back_forward') {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  /**
   * Notifica al Service Worker para purgar la caché de páginas protegidas (útil al cerrar sesión).
   */
  function clearProtectedSwCache() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_PROTECTED_CACHE' });
      }
    } catch (_) {}
  }

  /**
   * Manejo robusto de restauración desde BFCache / historial atrás-adelante.
   * @param {PageTransitionEvent} event
   */
  function handlePageShow(event) {
    const isBFCache = Boolean(event && event.persisted);
    const isBackForward = isBackForwardNavigation(event);

    dismissAllOverlays({ reason: 'pageshow', abortRequests: true });

    // Doble barrido en el siguiente frame y micro-tick para neutralizar carreras de render en móviles
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        dismissAllOverlays({ reason: 'pageshow-raf', abortRequests: false });
      });
    }
    setTimeout(function () {
      dismissAllOverlays({ reason: 'pageshow-settle', abortRequests: false });
    }, 60);

    // Si /login fue restaurado desde BFCache o navegación atrás, revalidar en servidor si hay sesión activa
    if ((isBFCache || isBackForward) && window.location && window.location.pathname === '/login') {
      try {
        fetch('/api/session/check', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' }
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (info) {
            if (info && info.authenticated) {
              window.location.replace('/operaciones');
            }
          })
          .catch(function () {});
      } catch (_) {}
    }

    // Si una vista protegida fue restaurada desde BFCache tras un logout, verificar sesión y redirigir a /login
    if (isBFCache && window.location && window.location.pathname !== '/login') {
      try {
        fetch('/api/session/check', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' }
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (info) {
            if (info && info.authenticated === false) {
              window.location.replace('/login');
            }
          })
          .catch(function () {});
      } catch (_) {}
    }
  }

  function handlePopState() {
    dismissAllOverlays({ reason: 'popstate', abortRequests: true });
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(function () {
        dismissAllOverlays({ reason: 'popstate-raf', abortRequests: false });
      });
    }
  }

  /**
   * Crítico para BFCache: al abandonar la vista (`pagehide`), destruimos cualquier overlay y
   * cancelamos fetches en curso para que el snapshot guardado por el navegador esté 100% limpio.
   */
  function handlePageHide() {
    dismissAllOverlays({ reason: 'pagehide', abortRequests: true });
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && _activeControllers.size === 0) {
      // Si la pestaña vuelve a ser visible sin peticiones registradas activas y hay un overlay remanente
      const overlay = document.getElementById('sioLoadingOverlay');
      if (overlay && overlay.classList.contains('active')) {
        setTimeout(function () {
          if (_activeControllers.size === 0) {
            dismissAllOverlays({ reason: 'visibility-recover', abortRequests: false });
          }
        }, 300);
      }
    }
  }

  // Registro inmediato de listeners globales del ciclo de vida de navegación
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('popstate', handlePopState);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('hashchange', handlePopState);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('DOMContentLoaded', function () {
    dismissAllOverlays({ reason: 'dom-content-loaded', abortRequests: false });
  });

  // API pública global
  window.dismissAllOverlays = dismissAllOverlays;
  window.SioNavigationManager = {
    dismissAllOverlays,
    createAbortController,
    abortAllRequests,
    isAbortError,
    scheduleOverlayFailsafe,
    clearOverlayFailsafe,
    navigateTo,
    isBackForwardNavigation,
    clearProtectedSwCache,
    getEpoch: function () { return _navigationEpoch; }
  };
})(window, document);
