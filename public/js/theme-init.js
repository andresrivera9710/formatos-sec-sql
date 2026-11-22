/**
 * Inicializador Temprano de Tema (Anti-FOUC) — SIO LAATS
 * Se ejecuta en <head> antes del primer pintado del DOM para mantener Modo Claro / Modo Noche
 * sin parpadeos blancos al navegar entre /operaciones y /formatos.
 * 100% Compatible con Helmet CSP (Archivo externo, sin JS inline).
 */
(function () {
  'use strict';
  try {
    const savedTheme = localStorage.getItem('sio_theme');
    const legacyDark = localStorage.getItem('sio_dark_mode');
    const isDark = savedTheme === 'dark' || (savedTheme !== 'light' && legacyDark === 'true');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
