/**
 * Service Worker Corporativo — SIO LAATS Formatos SEC (Offline-First / Resiliencia en Rampa)
 * 100% compatible con Helmet CSP:
 * - Cachea activos base (CSS, JS, iconos) con estrategia Network-First para entregas inmediatas y respaldo offline.
 * - Cachea vistas SSR autenticadas visitadas (/operaciones, /formatos, /formatos/*) con respaldo offline.
 * - Sirve Vistas Preliminares generadas en modo offline (/formatos/:id/vista-preliminar?offline=1).
 * - Excluye estrictamente /api/health, /api/session/check, /login, /logout y / para garantizar
 *   navegación de sesión real y evitar estados congelados al retroceder.
 */

'use strict';

const STATIC_CACHE = 'sio-laats-static-v5';
const PAGES_CACHE = 'sio-laats-pages-v5';
const PREVIEW_CACHE = 'sio-offline-previews-v1';

const CORE_ASSETS = [
  '/css/laats-theme.css',
  '/css/tab-bar.css',
  '/css/styles.css',
  '/css/preview-toolbar.css',
  '/js/theme-init.js',
  '/js/navigation-manager.js',
  '/js/login.js',
  '/js/tab-bar.js',
  '/js/signature-pad.js',
  '/js/searchable-combo.js',
  '/js/offline-manager.js',
  '/js/formato-validator.js',
  '/js/baggage-matrix.js',
  '/js/app.js',
  '/js/formato-cp.js',
  '/js/formato-ciec.js',
  '/js/formato-er.js',
  '/js/formato-eb.js',
  '/js/formato-cec.js',
  '/js/formato-mecd.js',
  '/js/formato-po.js',
  '/js/formato-cfr.js',
  '/js/formato-rx.js',
  '/js/formato-cll.js',
  '/js/formato-sp.js',
  '/js/formato-dal.js',
  '/js/formato-sel.js',
  '/js/formato-ass.js',
  '/js/formato-anexoa.js',
  '/js/formato-anexob.js',
  '/js/formato-liadc.js',
  '/js/formato-ccda.js',
  '/js/formato-lisa.js',
  '/js/formato-detalle.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: 'no-cache' }).then((res) => {
            if (res && res.ok) {
              return cache.put(url, res);
            }
            return null;
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  const allowedCaches = new Set([STATIC_CACHE, PAGES_CACHE, PREVIEW_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!allowedCaches.has(key)) {
            return caches.delete(key);
          }
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'CACHE_OFFLINE_PREVIEW' && data.url && data.html) {
    event.waitUntil(
      caches.open(PREVIEW_CACHE).then((cache) => {
        const response = new Response(data.html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
        return cache.put(data.url, response);
      })
    );
  } else if (data.type === 'CLEAR_PROTECTED_CACHE') {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. NUNCA interceptar rutas de salud, sesión, login, logout ni raíz
  if (
    url.pathname === '/api/health' ||
    url.pathname === '/api/session/check' ||
    url.pathname === '/login' ||
    url.pathname === '/logout' ||
    url.pathname === '/'
  ) {
    return;
  }

  // 2. Vista Preliminar Offline (/formatos/:id/vista-preliminar?offline=1)
  if (url.pathname.endsWith('/vista-preliminar')) {
    event.respondWith(
      (async () => {
        const previewCache = await caches.open(PREVIEW_CACHE);
        if (url.searchParams.get('offline') === '1') {
          const cachedOffline = await previewCache.match(url.pathname + '?offline=1')
            || await previewCache.match(url.pathname);
          if (cachedOffline) return cachedOffline;
        }
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.ok && !netRes.redirected && netRes.type === 'basic') {
            previewCache.put(url.pathname, netRes.clone());
          }
          return netRes;
        } catch (_err) {
          const fallbackPreview = await previewCache.match(url.pathname + '?offline=1')
            || await previewCache.match(url.pathname);
          if (fallbackPreview) return fallbackPreview;
          return new Response(
            '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Vista Preliminar Offline</title></head><body style="font-family:Arial,sans-serif;padding:24px;"><h2>Vista Preliminar no disponible en caché</h2><p>Regrese al formulario y presione Vista Preliminar o Guardar para regenerarla localmente.</p></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // 3. Plantillas controladas para renderizado offline (/api/offline/plantilla/:formatoId)
  if (url.pathname.startsWith('/api/offline/plantilla/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.ok) {
            cache.put(req, netRes.clone());
          }
          return netRes;
        } catch (_err) {
          const cached = await cache.match(req);
          if (cached) return cached;
          return new Response(JSON.stringify({ success: false, offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
    return;
  }

  // 4. Activos estáticos (/css/*, /js/*, /images/*): Network-First con fallback a Caché
  // Garantiza entregas inmediatas en actualizaciones web/móvil manteniendo resiliencia offline.
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/images/')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.ok) {
            cache.put(url.pathname, netRes.clone());
          }
          return netRes;
        } catch (_err) {
          const cached = await cache.match(req) || await cache.match(url.pathname);
          return cached || new Response('', { status: 504 });
        }
      })()
    );
    return;
  }

  // 5. Navegación SSR (/operaciones, /formatos, /formatos/:id): Network-First con fallback a Caché
  if (
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES_CACHE);
        try {
          const netRes = await fetch(req);
          // Solo cachear respuestas SSR exitosas y no redirigidas (nunca cachear redirecciones a /login)
          if (netRes && netRes.ok && !netRes.redirected && netRes.type === 'basic') {
            const finalPath = netRes.url ? new URL(netRes.url).pathname : url.pathname;
            if (finalPath !== '/login' && finalPath !== '/logout') {
              cache.put(url.pathname + url.search, netRes.clone());
              cache.put(url.pathname, netRes.clone());
            }
          }
          return netRes;
        } catch (err) {
          // Si la navegación fue abortada (ej. retroceso rápido), no inyectar HTML obsoleto
          if (err && err.name === 'AbortError') {
            throw err;
          }
          const exactMatch = await cache.match(url.pathname + url.search);
          if (exactMatch) return exactMatch;
          const pathMatch = await cache.match(url.pathname);
          if (pathMatch) return pathMatch;
          return new Response(
            '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Modo Offline — SIO LAATS</title><link rel="stylesheet" href="/css/laats-theme.css"><link rel="stylesheet" href="/css/styles.css"></head><body style="padding:32px;font-family:Montserrat,Arial,sans-serif;"><div class="card" style="max-width:560px;margin:40px auto;padding:24px;"><h2><i class="fas fa-wifi-slash"></i> Sin conexión a internet</h2><p style="margin-top:10px;">Esta vista aún no estaba almacenada en la caché local del dispositivo. Sus borradores y formatos guardados en IndexedDB permanecen seguros y se sincronizarán al recuperar señal.</p><p style="margin-top:16px;"><a href="/formatos" class="btn btn-primary">Volver a Formatos en Caché</a></p></div></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
  }
});
