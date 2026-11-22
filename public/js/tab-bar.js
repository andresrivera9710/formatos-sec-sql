/**
 * Tab Bar Sliding Pill, Modo Noche Global y Cierre de Sesión Seguro — SIO LAATS
 * 100% Compatible con Helmet CSP (Archivo externo, sin JS ni estilos inline en HTML)
 */

(function () {
  'use strict';

  const THEME_STORAGE_KEY = 'sio_theme';
  const LEGACY_DARK_KEY = 'sio_dark_mode';

  /**
   * Obtiene el tema preferido almacenado en localStorage ('dark' | 'light')
   */
  function getStoredTheme() {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        return savedTheme;
      }
      const legacyDark = localStorage.getItem(LEGACY_DARK_KEY);
      if (legacyDark === 'true') return 'dark';
      if (legacyDark === 'false') return 'light';
    } catch (_) {
      // Ignorar errores de almacenamiento restringido
    }
    return 'light';
  }

  /**
   * Aplica el tema ('dark' | 'light') al documento sincronizando [data-theme="dark"] y body.dark-mode
   */
  function applyTheme(theme) {
    const isDark = theme === 'dark';
    const root = document.documentElement;
    const body = document.body;

    if (isDark) {
      root.setAttribute('data-theme', 'dark');
      if (body) {
        body.setAttribute('data-theme', 'dark');
        body.classList.add('dark-mode');
      }
    } else {
      root.setAttribute('data-theme', 'light');
      if (body) {
        body.setAttribute('data-theme', 'light');
        body.classList.remove('dark-mode');
      }
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
      localStorage.setItem(LEGACY_DARK_KEY, isDark ? 'true' : 'false');
    } catch (_) {
      // Ignorar bloqueo de localStorage
    }

    const btnTabTheme = document.getElementById('btnTabThemeToggle');
    const tabThemeText = document.getElementById('tabThemeText');
    if (btnTabTheme) {
      btnTabTheme.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    }
    if (tabThemeText) {
      tabThemeText.textContent = isDark ? 'Modo Claro' : 'Modo Noche';
    }
  }

  // Aplicación temprana antes de DOMContentLoaded para evitar parpadeo visual
  applyTheme(getStoredTheme());

  document.addEventListener('DOMContentLoaded', () => {
    // Re-aplicar cuando body ya está disponible
    applyTheme(getStoredTheme());

    const tabBar = document.getElementById('sioTabBar');
    const pill = document.getElementById('navPillIndicator');
    const items = tabBar ? Array.from(tabBar.querySelectorAll('.tab-bar-item')) : [];
    const activeDefaultItem = tabBar ? (tabBar.querySelector('.tab-bar-item.is-active') || items[0]) : null;
    let currentTargetItem = activeDefaultItem;

    /**
     * Calcula dinámicamente width y transform: translateX(...) de la píldora deslizante
     * @param {HTMLElement} targetEl
     */
    function movePillToItem(targetEl) {
      if (!tabBar || !pill || !targetEl) return;

      const barRect = tabBar.getBoundingClientRect();
      const itemRect = targetEl.getBoundingClientRect();

      if (barRect.width === 0 || itemRect.width === 0) return;

      const offsetLeft = Math.round((itemRect.left - barRect.left) * 100) / 100;
      const width = Math.round(itemRect.width * 100) / 100;

      pill.style.width = `${width}px`;
      pill.style.transform = `translateX(${offsetLeft}px)`;
      pill.classList.add('is-ready');

      const isLogout = targetEl.dataset.tab === 'logout';
      pill.classList.toggle('is-danger-pill', isLogout);

      items.forEach((item) => {
        item.classList.toggle('is-pill-target', item === targetEl);
      });

      currentTargetItem = targetEl;
    }

    /**
     * Regresa suavemente la píldora al elemento activo por defecto (Operaciones)
     */
    function resetPillToActive() {
      const activeEl = (tabBar && tabBar.querySelector('.tab-bar-item.is-active')) || activeDefaultItem;
      if (activeEl) {
        movePillToItem(activeEl);
      }
    }

    // 1. Inicializar eventos del Sliding Pill sobre los 4 elementos
    if (tabBar && pill && items.length > 0) {
      resetPillToActive();

      items.forEach((item) => {
        item.addEventListener('mouseenter', () => {
          movePillToItem(item);
        });

        item.addEventListener('focus', () => {
          movePillToItem(item);
        });

        item.addEventListener('click', () => {
          movePillToItem(item);
        });
      });

      tabBar.addEventListener('mouseleave', () => {
        resetPillToActive();
      });

      tabBar.addEventListener('focusout', (e) => {
        if (!tabBar.contains(e.relatedTarget)) {
          resetPillToActive();
        }
      });

      // Recalcular posición al redimensionar viewport (Web 1366x768 <-> Móvil 390x844)
      let resizeRaf = null;
      window.addEventListener('resize', () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          movePillToItem(currentTargetItem || activeDefaultItem);
        });
      });

      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => {
          movePillToItem(currentTargetItem || activeDefaultItem);
        });
        ro.observe(tabBar);
      }

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          movePillToItem(currentTargetItem || activeDefaultItem);
        });
      }
    }

    // 2. Alternancia de Modo Noche desde el Tab Bar
    const btnTabTheme = document.getElementById('btnTabThemeToggle');
    if (btnTabTheme) {
      btnTabTheme.addEventListener('click', (e) => {
        e.preventDefault();
        const nextTheme = getStoredTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        requestAnimationFrame(() => {
          movePillToItem(btnTabTheme);
        });
      });
    }

    // 3. Interacción del Perfil de Usuario (Tooltip / Resumen de sesión)
    const btnProfile = document.getElementById('btnTabUserProfile');
    if (btnProfile) {
      btnProfile.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = btnProfile.classList.toggle('is-open');
        btnProfile.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        movePillToItem(btnProfile);
      });

      btnProfile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const isOpen = btnProfile.classList.toggle('is-open');
          btnProfile.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          movePillToItem(btnProfile);
        } else if (e.key === 'Escape') {
          btnProfile.classList.remove('is-open');
          btnProfile.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('click', (e) => {
        if (!btnProfile.contains(e.target)) {
          btnProfile.classList.remove('is-open');
          btnProfile.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // 4. Cierre de Sesión Seguro con Confirmación SweetAlert2
    const btnLogout = document.getElementById('btnTabLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', (e) => {
        e.preventDefault();
        movePillToItem(btnLogout);

        const targetHref = btnLogout.getAttribute('href') || '/logout';
        if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
          const isDark = getStoredTheme() === 'dark';
          Swal.fire({
            icon: 'question',
            title: '¿Cerrar sesión activa?',
            text: 'Finalizará su sesión de Seguridad Operacional (SEC) de forma segura.',
            showCancelButton: true,
            confirmButtonText: 'Sí, cerrar sesión',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#DC2626',
            cancelButtonColor: '#275B88',
            background: isDark ? '#0F2744' : '#FFFFFF',
            color: isDark ? '#F4F7FB' : '#0F172A'
          }).then((result) => {
            if (result.isConfirmed) {
              window.location.href = targetHref;
            } else {
              resetPillToActive();
            }
          });
        } else {
          window.location.href = targetHref;
        }
      });
    }
  });
})();
