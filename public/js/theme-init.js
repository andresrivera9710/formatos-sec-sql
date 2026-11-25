/**
 * Inicializador Temprano de Tema (Anti-FOUC) — SIO LAATS
 * Se ejecuta en <head> antes del primer pintado del DOM para mantener Modo Claro / Modo Noche
 * sin parpadeos blancos al navegar entre /operaciones y /formatos.
 * 100% Compatible con Helmet CSP (Archivo externo, sin JS inline).
 */
(function () {
  'use strict';
  function syncColorSchemeMeta(scheme) {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', scheme);
    }
  }

  try {
    const savedTheme = localStorage.getItem('sio_theme');
    const legacyDark = localStorage.getItem('sio_dark_mode');
    const isDark = savedTheme === 'dark' || (savedTheme !== 'light' && legacyDark === 'true');
    const scheme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', scheme);
    syncColorSchemeMeta(scheme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
    syncColorSchemeMeta('light');
  }

  // Protección temprana universal contra pantalla de carga infinita al retroceder en dispositivos móviles (BFCache)
  function ocultarOverlaysGlobal() {
    try {
      const overlays = document.querySelectorAll('.sio-loading-overlay, #sioLoadingOverlay');
      overlays.forEach(function (el) {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
      });
    } catch (_) {}
  }

  window.addEventListener('pageshow', ocultarOverlaysGlobal);
  window.addEventListener('popstate', ocultarOverlaysGlobal);
})();
