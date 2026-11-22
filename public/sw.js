/**
 * Service Worker Corporativo — SIO LAATS Formatos SEC (Offline-First / Resiliencia en Rampa)
 * 100% compatible con Helmet CSP:
 * - Cachea activos base (CSS, JS, iconos) y vistas SSR visitadas (/operaciones, /formatos, /formatos/*).
 * - Sirve Vistas Preliminares generadas en modo offline (/formatos/:id/vista-preliminar?offline=1).
 * - Excluye estrictamente /api/health para garantizar que el Heartbeat de conectividad sea 100% real.
 */

'use strict';

const STATIC_CACHE = 'sio-laats-static-v1';
const PAGES_CACHE = 'sio-laats-pages-v1';
const PREVIEW_CACHE = 'sio-offline-previews-v1';

const CORE_ASSETS = [
  '/css/laats-theme.css',
  '/css/tab-bar.css',
  '/css/styles.css',
  '/css/preview-toolbar.css',
  '/js/theme-init.js',
  '/js/tab-bar.js',
  '/js/signature-pad.js',
  '/js/searchable-combo.js',
  '/js/offline-manager.js',
  '/js/formato-validator.js',
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
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. NUNCA interceptar /api/health ni /logout (el ping de conectividad debe ir directo a red)
  if (url.pathname === '/api/health' || url.pathname === '/logout') {
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
          if (netRes && netRes.ok) {
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

  // 4. Activos estáticos (/css/*, /js/*, /images/*): Stale-While-Revalidate
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/images/')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(url.pathname) || await cache.match(req);
        const networkPromise = fetch(req)
          .then((netRes) => {
            if (netRes && netRes.ok) {
              cache.put(url.pathname, netRes.clone());
            }
            return netRes;
          })
          .catch(() => null);

        return cached || (await networkPromise) || new Response('', { status: 504 });
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
          if (netRes && netRes.ok) {
            cache.put(url.pathname + url.search, netRes.clone());
            cache.put(url.pathname, netRes.clone());
          }
          return netRes;
        } catch (_err) {
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
