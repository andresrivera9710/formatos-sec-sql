/**
 * SioOfflineManager — Arquitectura Transversal Offline-First, Caché IndexedDB y Auto-Sync
 * SIO LAATS Formatos SEC (AEROMEXICO y todos los clientes actuales/futuros)
 * 100% compatible con Helmet CSP (cero scripts ejecutables inline).
 *
 * Capacidades:
 * 1. Detección real de señal: eventos online/offline + Heartbeat real (GET /api/health con timeout 3s).
 * 2. Indicador en el Tab Bar (Sliding Pill) con estado en vivo y contador de cola pendiente.
 * 3. Almacenamiento persistente en IndexedDB (sio_laats_offline_db: stores `drafts`, `pending_sync_queue`, `templates`)
 *    con espejo sincrónico para hidratación instantánea de cuadrículas fluidas antes de DOMContentLoaded.
 * 4. Autoguardado continuo en tiempo real indexado por correlativo + cliente + codigoFormato.
 * 5. Interceptación inteligente de guardado sin conexión (Offline Queue) + Vista Preliminar limpia Offline.
 * 6. Sincronización automática en orden cronológico (Auto-Sync) al recuperar conectividad hacia Express / Azure SQL.
 */

(function (window, document) {
  'use strict';

  const DB_NAME = 'sio_laats_offline_db';
  const DB_VERSION = 1;
  const STORE_DRAFTS = 'drafts';
  const STORE_QUEUE = 'pending_sync_queue';
  const STORE_TEMPLATES = 'templates';
  const MIRROR_PREFIX = 'sio_idb_mirror::';
  const PREVIEW_CACHE_NAME = 'sio-offline-previews-v1';
  const HEARTBEAT_INTERVAL_MS = 15000;
  const HEARTBEAT_TIMEOUT_MS = 3000;
  const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const origFetch = window.fetch.bind(window);
  let _dbPromise = null;
  let _isOnline = typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  let _simulatedOffline = false;
  let _isSyncing = false;
  let _pendingCount = 0;
  let _lastLatencyMs = 0;
  let _lastCheckIso = '';
  let _draftTimer = null;
  let _activeContext = null;
  let _lastOfflinePreviewUrl = '';
  let _lastOfflinePreviewHtml = '';

  function escapeHtml(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDDMMYYYY(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [y, m, d] = str.substring(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    return str;
  }

  function formatMMDDYYYY(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [y, m, d] = str.substring(0, 10).split('-');
      return `${m}/${d}/${y}`;
    }
    return str;
  }

  function extractHHMM(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('T') && s.length >= 16) return s.substring(11, 16);
    const m = s.match(/(\d{2}:\d{2})/);
    return m ? m[1] : s;
  }

  function sanitizeSigUrl(val) {
    const str = String(val || '').trim();
    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(str)) {
      return str;
    }
    return BLANK_IMG;
  }

  // ============================================================================
  // 1. CONTEXTO DE OPERACIÓN Y CLAVE CANÓNICA (correlativo + cliente + codigoFormato)
  // ============================================================================
  function readPageContext() {
    if (_activeContext) return _activeContext;
    try {
      const el = document.getElementById('sioOfflineContextJson');
      if (el && el.textContent) {
        _activeContext = JSON.parse(el.textContent);
        return _activeContext;
      }
    } catch (err) {
      console.warn('[OFFLINE CONTEXT PARSE WARN]', err);
    }
    return null;
  }

  function buildDraftKey(ctx) {
    if (!ctx || !ctx.formatoId) return '';
    const corr = String(ctx.correlativo || ctx.itinerarioId || '0').trim();
    const cli = String(ctx.cliente || ctx.vuelo?.operador || 'GEN').trim().toUpperCase();
    const fmt = String(ctx.formatoId).trim().toLowerCase();
    const enc = ctx.encabezadoId ? String(ctx.encabezadoId) : 'NEW';
    return `${corr}::${cli}::${fmt}::${enc}`;
  }

  // ============================================================================
  // 2. MOTOR INDEXEDDB (drafts, pending_sync_queue, templates)
  // ============================================================================
  function openDatabase() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('IndexedDB no soportado en este navegador.'));
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          const draftStore = db.createObjectStore(STORE_DRAFTS, { keyPath: 'draftKey' });
          draftStore.createIndex('by_correlativo', 'correlativo', { unique: false });
          draftStore.createIndex('by_cliente', 'cliente', { unique: false });
          draftStore.createIndex('by_formato', 'codigoFormato', { unique: false });
          draftStore.createIndex('by_updated', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'queueKey' });
          queueStore.createIndex('by_created', 'createdAt', { unique: false });
          queueStore.createIndex('by_formato', 'formatoId', { unique: false });
          queueStore.createIndex('by_itinerario', 'itinerarioId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
          db.createObjectStore(STORE_TEMPLATES, { keyPath: 'formatoId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Error al abrir IndexedDB'));
    });
    return _dbPromise;
  }

  async function idbPut(storeName, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(storeName, key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetAll(storeName) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  }

  // ============================================================================
  // 3. HIDRATACIÓN TEMPRANA PRE-DOMCONTENTLOADED (Synchronous Mirror -> InitialStateJson)
  // ============================================================================
  function applyEarlyMirrorBeforeFormatInit() {
    const ctx = readPageContext();
    if (!ctx || !ctx.formatoId) return;
    const draftKey = buildDraftKey(ctx);
    let mirror = null;
    try {
      const raw = localStorage.getItem(MIRROR_PREFIX + draftKey);
      if (raw) mirror = JSON.parse(raw);
    } catch (_) {}
    if (!mirror || !mirror.initialStatePatch) return;

    const patch = mirror.initialStatePatch;
    if (ctx.formatoId.endsWith('-cp')) {
      const bootEl = document.getElementById('cpBootstrapData');
      if (bootEl) {
        if (Array.isArray(patch.registros)) {
          bootEl.dataset.registros = JSON.stringify(patch.registros);
        }
        if (Array.isArray(patch.aleros)) {
          bootEl.dataset.aleros = JSON.stringify(patch.aleros);
        }
      }
      return;
    }

    const jsonScripts = document.querySelectorAll('script[type="application/json"][id$="InitialStateJson"]');
    jsonScripts.forEach((scriptEl) => {
      try {
        const current = JSON.parse(scriptEl.textContent || '{}');
        const merged = { ...current, ...patch };
        scriptEl.textContent = JSON.stringify(merged);
      } catch (err) {
        console.warn('[OFFLINE EARLY HYDRATE WARN]', err);
      }
    });
  }

  // Ejecutar parche temprano inmediatamente al evaluar offline-manager.js (antes de formato-*.js)
  applyEarlyMirrorBeforeFormatInit();

  // ============================================================================
  // 4. MONITOR REAL DE CONECTIVIDAD (online/offline + Heartbeat GET /api/health)
  // ============================================================================
  function emitNetworkStatus() {
    const state = {
      online: _isOnline && !_simulatedOffline,
      pendingCount: _pendingCount,
      syncing: _isSyncing,
      latencyMs: _lastLatencyMs,
      lastCheck: _lastCheckIso
    };
    window.dispatchEvent(new CustomEvent('sio:network-status', { detail: state }));
    if (window.SioTabBar && typeof window.SioTabBar.updateNetworkUI === 'function') {
      window.SioTabBar.updateNetworkUI(state);
    }
  }

  async function refreshPendingCount() {
    try {
      const all = await idbGetAll(STORE_QUEUE);
      _pendingCount = all.length;
    } catch (_) {
      _pendingCount = 0;
    }
    emitNetworkStatus();
    return _pendingCount;
  }

  async function checkRealConnectivity() {
    if (_simulatedOffline || navigator.onLine === false) {
      const wasOnline = _isOnline;
      _isOnline = false;
      _lastCheckIso = new Date().toISOString();
      emitNetworkStatus();
      return false;
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS) : null;
    const t0 = Date.now();

    try {
      const res = await origFetch(`/api/health?_t=${t0}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        ...(controller ? { signal: controller.signal } : {})
      });
      if (timer) clearTimeout(timer);

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        const nowOnline = data && data.status === 'ok';
        const justReconnected = !_isOnline && nowOnline;
        _isOnline = nowOnline;
        _lastLatencyMs = Date.now() - t0;
        _lastCheckIso = new Date().toISOString();
        await refreshPendingCount();

        if ((justReconnected || _pendingCount > 0) && _isOnline) {
          await processPendingSyncQueue();
        }
        return _isOnline;
      }
    } catch (_err) {
      if (timer) clearTimeout(timer);
    }

    _isOnline = false;
    _lastCheckIso = new Date().toISOString();
    emitNetworkStatus();
    return false;
  }

  // ============================================================================
  // 5. CAPTURA Y RESTAURACIÓN DE BORRADORES (Campos, Cuadrículas y Firmas)
  // ============================================================================
  function collectFormFields() {
    const main = document.querySelector('main') || document.body;
    const fields = {};
    if (!main) return fields;

    const elements = main.querySelectorAll('input, select, textarea');
    elements.forEach((el) => {
      if (el.type === 'hidden' || el.type === 'password' || el.type === 'file') return;
      if (el.closest('tr[data-uid], tr[data-row-index]')) return; // Las filas dinámicas se capturan en initialStatePatch
      const key = el.id || el.name;
      if (!key) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        fields[key] = { type: el.type, checked: Boolean(el.checked), value: el.value };
      } else {
        fields[key] = { type: el.tagName.toLowerCase(), value: el.value };
      }
    });
    return fields;
  }

  function scrapeDynamicTablesFromDom(ctx) {
    const patch = {};
    if (!ctx || !ctx.formatoId) return patch;
    const fmt = ctx.formatoId;

    // 1. Formato ER (#erTbodyRegistros)
    if (fmt.endsWith('-er')) {
      const trs = document.querySelectorAll('#erTbodyRegistros tr[data-uid]');
      const detalles = [];
      trs.forEach((tr) => {
        const row = {};
        tr.querySelectorAll('.er-cell-input[data-field]').forEach((inp) => {
          row[inp.dataset.field] = inp.value;
        });
        if (row.Pasajero || row.Colilla || row.Secuencia) {
          detalles.push(row);
        }
      });
      const obsEl = document.getElementById('erObservaciones');
      patch.detalles = detalles;
      if (obsEl) patch.observaciones = obsEl.value;
    }

    // 2. Formato MECD (#mecdTbodyRev, #mecdTbodyCF, #mecdTbodySF)
    if (fmt === 'amx-mecd') {
      const readGrid = (tbodyId) => {
        const rows = [];
        document.querySelectorAll(`#${tbodyId} tr[data-row-index]`).forEach((tr) => {
          const item = {};
          tr.querySelectorAll('input[data-field]').forEach((inp) => {
            item[inp.getAttribute('data-field')] = inp.value;
          });
          if (item.NombrePasajero && !item.Pasajero) item.Pasajero = item.NombrePasajero;
          rows.push(item);
        });
        return rows;
      };
      patch.revision = readGrid('mecdTbodyRev');
      patch.conFirma = readGrid('mecdTbodyCF');
      patch.sinFirma = readGrid('mecdTbodySF');
    }

    // 3. Formato PO (#poTbodyMatriz tr[data-record-json])
    if (fmt === 'amx-po') {
      const detalles = [];
      document.querySelectorAll('#poTbodyMatriz tr[data-row-index]').forEach((tr) => {
        const rawJson = tr.getAttribute('data-record-json');
        if (rawJson) {
          try {
            const parsed = JSON.parse(rawJson);
            const activePosTd = Array.from(tr.querySelectorAll('td[data-pos-id]')).find(
              (td) => td.textContent.trim() === 'X'
            );
            if (activePosTd) {
              const pId = parseInt(activePosTd.getAttribute('data-pos-id'), 10) || parsed.PosicionId;
              parsed.PosicionId = pId;
              parsed.PosicionesPOId = pId;
            }
            detalles.push(parsed);
          } catch (_) {}
        }
      });
      patch.detalles = detalles;
    }

    // 4. Formatos EB y CEC (Matrices 10 columnas #ebTbodyMatriz / #cecTbodyMatriz)
    if (fmt.endsWith('-eb') || fmt.endsWith('-cec')) {
      const isEb = fmt.endsWith('-eb');
      const tbodyId = isEb ? 'ebTbodyMatriz' : 'cecTbodyMatriz';
      const idKey = isEb ? 'DetalleControlEBId' : 'DetalleCECDespId';
      const detalles = [];
      document.querySelectorAll(`#${tbodyId} td[data-cell-index]`).forEach((td) => {
        const attrSec = parseInt(td.getAttribute('data-secuencia') || '', 10);
        const numSpan = td.querySelector('.sio-mx-seq-val, span');
        const sec = Number.isInteger(attrSec) && attrSec > 0
          ? attrSec
          : (parseInt(numSpan ? numSpan.textContent.trim() : td.textContent.trim(), 10) || 0);
        const attrValor = String(td.getAttribute('data-valor') || '').trim().toUpperCase();
        const isTachado = attrValor === 'X' || td.classList.contains('sio-mx-cell-withdrawn') || td.textContent.includes('✗');
        if (sec > 0 || isTachado) {
          detalles.push({
            [idKey]: parseInt(td.getAttribute('data-record-id') || '0', 10) || 0,
            Casilla: detalles.length + 1,
            Secuencia: sec,
            Valor: isTachado ? 'X' : String(sec),
            Motivo: td.getAttribute('data-motivo') || '',
            EstaEliminado: isTachado
          });
        }
      });
      patch.detalles = detalles;
    }

    // 5. Formato CP (.cp-reg-card[data-record-json])
    if (fmt.endsWith('-cp')) {
      const registros = [];
      document.querySelectorAll('#cpListaRegistros .cp-reg-card[data-record-json]').forEach((card) => {
        try {
          registros.push(JSON.parse(card.getAttribute('data-record-json')));
        } catch (_) {}
      });
      patch.registros = registros;
    }

    // 6. Formato CIEC (.cp-registro-card + Matriz Equipaje en Puerta #ciecTbodyMatrizPuerta)
    if (fmt.endsWith('-ciec')) {
      const detalles = [];
      document.querySelectorAll('.cp-registro-card[data-record-json]').forEach((card) => {
        try {
          detalles.push(JSON.parse(card.getAttribute('data-record-json')));
        } catch (_) {}
      });
      const equipajePuerta = [];
      document.querySelectorAll('#ciecTbodyMatrizPuerta td[data-cell-index]').forEach((td) => {
        const attrSec = parseInt(td.getAttribute('data-secuencia') || '', 10);
        const numSpan = td.querySelector('.sio-mx-seq-val, span');
        const sec = Number.isInteger(attrSec) && attrSec > 0
          ? attrSec
          : (parseInt(numSpan ? numSpan.textContent.trim() : td.textContent.trim(), 10) || 0);
        const attrValor = String(td.getAttribute('data-valor') || '').trim().toUpperCase();
        const isTachado = attrValor === 'X' || td.classList.contains('sio-mx-cell-withdrawn') || td.textContent.includes('✗');
        if (sec > 0 || isTachado) {
          equipajePuerta.push({
            EquipajePuertaCIECId: parseInt(td.getAttribute('data-record-id') || '0', 10) || 0,
            Casilla: equipajePuerta.length + 1,
            Secuencia: sec,
            Valor: isTachado ? 'X' : String(sec),
            Motivo: td.getAttribute('data-motivo') || '',
            EstaEliminado: isTachado
          });
        }
      });
      patch.detalles = detalles;
      patch.registros = detalles;
      patch.equipajePuerta = equipajePuerta;
    }

    return patch;
  }

  function convertPayloadToInitialStatePatch(formatoId, payload = {}) {
    const d = payload.datos || {};
    const patch = {};
    if (formatoId.endsWith('-er')) {
      const er = d.erPayload || d;
      if (Array.isArray(er.registros)) patch.detalles = er.registros;
      if (er.observaciones !== undefined) patch.observaciones = er.observaciones;
    } else if (formatoId === 'amx-mecd') {
      const m = d.mecdPayload || d;
      if (Array.isArray(m.revision)) patch.revision = m.revision;
      if (Array.isArray(m.conFirma)) patch.conFirma = m.conFirma;
      if (Array.isArray(m.sinFirma)) patch.sinFirma = m.sinFirma;
    } else if (formatoId === 'amx-po') {
      const po = d.poPayload || d;
      if (Array.isArray(po.registros)) patch.detalles = po.registros;
    } else if (formatoId.endsWith('-eb')) {
      const eb = d.ebPayload || d;
      if (Array.isArray(eb.detalles)) patch.detalles = eb.detalles;
    } else if (formatoId.endsWith('-cec')) {
      const cec = d.cecPayload || d;
      if (Array.isArray(cec.detalles)) patch.detalles = cec.detalles;
      if (Array.isArray(cec.personal)) patch.personal = cec.personal;
    } else if (formatoId.endsWith('-cp')) {
      const cp = d.cpPayload || d;
      if (Array.isArray(cp.registros)) patch.registros = cp.registros;
      if (Array.isArray(cp.aleros)) patch.aleros = cp.aleros;
    } else if (formatoId.endsWith('-ciec')) {
      const ciec = d.ciecPayload || d;
      if (Array.isArray(ciec.registros)) patch.detalles = ciec.registros;
      if (Array.isArray(ciec.equipajePuerta)) patch.equipajePuerta = ciec.equipajePuerta;
    }
    return patch;
  }

  async function saveCurrentDraft(extraPayload = null, statusOverride = 'draft') {
    const ctx = readPageContext();
    if (!ctx || !ctx.formatoId) return null;

    const draftKey = buildDraftKey(ctx);
    const fields = collectFormFields();
    const signatures = window.SioSignatureRepoClient?.exportUnlockedSignatures?.() || {};
    const domPatch = scrapeDynamicTablesFromDom(ctx);
    const payloadPatch = extraPayload ? convertPayloadToInitialStatePatch(ctx.formatoId, extraPayload) : {};
    const initialStatePatch = { ...domPatch, ...payloadPatch };

    const record = {
      draftKey,
      correlativo: String(ctx.correlativo || ctx.itinerarioId || ''),
      itinerarioId: parseInt(ctx.itinerarioId, 10) || 0,
      cliente: String(ctx.cliente || ctx.vuelo?.operador || ''),
      codigoFormato: ctx.formatoId,
      formatoNombre: ctx.formatoNombre || ctx.formatoId,
      encabezadoId: ctx.encabezadoId || null,
      status: statusOverride,
      updatedAt: new Date().toISOString(),
      fields,
      signatures,
      initialStatePatch,
      lastPayload: extraPayload || null
    };

    try {
      localStorage.setItem(
        MIRROR_PREFIX + draftKey,
        JSON.stringify({
          updatedAt: record.updatedAt,
          status: record.status,
          fields: record.fields,
          signatures: record.signatures,
          initialStatePatch: record.initialStatePatch
        })
      );
    } catch (_) {}

    try {
      await idbPut(STORE_DRAFTS, record);
    } catch (err) {
      console.warn('[OFFLINE DRAFT SAVE WARN]', err);
    }
    return record;
  }

  function scheduleDraftSave() {
    if (_draftTimer) clearTimeout(_draftTimer);
    _draftTimer = setTimeout(() => {
      saveCurrentDraft();
    }, 220);
  }

  function restoreFieldsAndSignatures(draft) {
    if (!draft) return false;
    let restoredAny = false;

    if (draft.fields && typeof draft.fields === 'object') {
      Object.entries(draft.fields).forEach(([key, entry]) => {
        if (!entry) return;
        const el = document.getElementById(key) || document.querySelector(`[name="${CSS.escape(key)}"]`);
        if (!el || el.disabled || el.readOnly || el.classList.contains('input-locked') || el.classList.contains('er-cell-readonly')) {
          return;
        }
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (Boolean(el.checked) !== Boolean(entry.checked)) {
            el.checked = Boolean(entry.checked);
            el.dispatchEvent(new Event('change', { bubbles: true }));
            restoredAny = true;
          }
        } else if (entry.value !== undefined && entry.value !== '' && el.value !== String(entry.value)) {
          el.value = String(entry.value);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          restoredAny = true;
        }
      });
    }

    if (draft.signatures && typeof draft.signatures === 'object' && Object.keys(draft.signatures).length > 0) {
      window.SioSignatureRepoClient?.loadDraftSignatures?.(draft.signatures);
      restoredAny = true;
    }

    const p = draft.initialStatePatch || {};
    if (
      (Array.isArray(p.detalles) && p.detalles.length > 0) ||
      (Array.isArray(p.registros) && p.registros.length > 0) ||
      (Array.isArray(p.equipajePuerta) && p.equipajePuerta.length > 0) ||
      (Array.isArray(p.revision) && p.revision.length > 0) ||
      (Array.isArray(p.conFirma) && p.conFirma.length > 0) ||
      (Array.isArray(p.sinFirma) && p.sinFirma.length > 0)
    ) {
      restoredAny = true;
    }

    return restoredAny;
  }

  function showDraftBanner(draft, isQueued = false) {
    const banner = document.getElementById('sioOfflineDraftBanner');
    const msgEl = document.getElementById('sioOfflineDraftBannerMsg');
    const btnPreview = document.getElementById('btnOfflinePreviewBanner');
    const modeBadge = document.getElementById('sioFormatoModeBadge');
    if (!banner || !msgEl) return;

    const timeStr = draft?.updatedAt ? draft.updatedAt.substring(11, 19) : '';
    banner.classList.toggle('is-queued', isQueued);
    if (isQueued) {
      msgEl.textContent = `Guardado localmente en caché (Pendiente de sincronización${timeStr ? ' · ' + timeStr : ''}). Sus datos están seguros en IndexedDB y se enviarán automáticamente al recuperar señal.`;
      if (modeBadge) {
        modeBadge.textContent = 'GUARDADO EN CACHÉ LOCAL (PENDIENTE DE SINCRONIZACIÓN)';
        modeBadge.className = 'badge badge-gold';
      }
      if (btnPreview) btnPreview.hidden = false;
    } else {
      msgEl.textContent = `Borrador local restaurado automáticamente desde caché IndexedDB (${draft.cliente} · ${draft.codigoFormato}${timeStr ? ' · ' + timeStr : ''}).`;
      if (btnPreview) btnPreview.hidden = !_lastOfflinePreviewUrl && !_lastOfflinePreviewHtml;
    }
    banner.hidden = false;
  }

  async function discardActiveDraft() {
    const ctx = readPageContext();
    if (!ctx || !ctx.formatoId) return;
    const draftKey = buildDraftKey(ctx);
    try {
      localStorage.removeItem(MIRROR_PREFIX + draftKey);
    } catch (_) {}
    try {
      await idbDelete(STORE_DRAFTS, draftKey);
      const queueItems = await idbGetAll(STORE_QUEUE);
      for (const item of queueItems) {
        if (item.draftKey === draftKey) {
          await idbDelete(STORE_QUEUE, item.queueKey);
        }
      }
      await refreshPendingCount();
    } catch (_) {}
    window.location.reload();
  }

  // ============================================================================
  // 6. PRE-CACHEO DE PLANTILLAS Y GENERADOR DE VISTA PRELIMINAR 100% OFFLINE
  // ============================================================================
  async function prefetchTemplateForActiveFormat() {
    const ctx = readPageContext();
    if (!ctx || !ctx.formatoId || !_isOnline || _simulatedOffline) return null;
    try {
      const encParam = ctx.encabezadoId ? `?encabezadoId=${encodeURIComponent(ctx.encabezadoId)}` : '';
      const res = await origFetch(`/api/offline/plantilla/${encodeURIComponent(ctx.formatoId)}${encParam}`, {
        credentials: 'same-origin'
      });
      if (res && res.ok) {
        const json = await res.json();
        if (json && json.success && json.templateHtml) {
          await idbPut(STORE_TEMPLATES, {
            formatoId: ctx.formatoId,
            formatoNombre: json.formatoNombre,
            documentBaseName: json.documentBaseName,
            fileName: json.fileName,
            templateHtml: json.templateHtml,
            defaultVars: json.defaultVars || {},
            vuelo: json.vuelo || ctx.vuelo || {},
            user: json.user || ctx.user || {},
            cachedAt: new Date().toISOString()
          });
          return json;
        }
      }
    } catch (_) {}
    return null;
  }

  function buildOfflineVarsForFormat(formatoId, payload = {}, cachedTpl = {}, ctx = {}) {
    const baseVars = { ...(cachedTpl.defaultVars || {}) };
    const vuelo = cachedTpl.vuelo || ctx?.vuelo || {};
    const user = cachedTpl.user || ctx?.user || {};
    const d = payload.datos || {};
    const vueloNo = vuelo.novuelo || vuelo.numeroVuelo || '';
    const matricula = vuelo.Matricula || vuelo.matricula || 'NA';
    const puerta = vuelo.puertaposicion || vuelo.puerta || '';
    const fechaBase = String(
      vuelo.FechaItinerado || d.fecha || d.erPayload?.fecha || d.poPayload?.fecha || d.cpPayload?.fecha || d.ciecPayload?.fecha || new Date().toISOString()
    ).substring(0, 10);

    // 1. Formato ER (*-er)
    if (formatoId.endsWith('-er')) {
      const er = d.erPayload || d;
      const rows = Array.isArray(er.registros) ? er.registros : [];
      const total = Math.max(15, rows.length);
      const filas = [];
      for (let i = 0; i < total; i++) {
        const r = rows[i] || {};
        const tiene = Boolean(r.Pasajero || r.Nombre || r.Colilla || r.Secuencia);
        if (formatoId === 'dl-er') {
          const destDelta = r.Destino || vuelo.Destino || 'N/A';
          if (tiene) {
            filas.push(`<tr class="data-row">
          <td class="col-no" style="text-align:center;">${i + 1}</td>
          <td class="col-nombre" style="text-align:left;">${escapeHtml(r.Pasajero || r.Nombre || '')}</td>
          <td class="col-colilla" style="text-align:center;">${escapeHtml(r.Colilla || '')}</td>
          <td class="col-vuelo" style="text-align:center;">${escapeHtml(r.Vuelo || vueloNo)}</td>
          <td class="col-destino" style="text-align:center;">${escapeHtml(destDelta)}</td>
          <td class="col-hora" style="text-align:center;">${escapeHtml(extractHHMM(r.HoraRevision || r.Hora))}</td>
          <td class="col-agente1" style="text-align:left;">${escapeHtml(r.AgenteAVSEC || '')}</td>
          <td class="col-agente2" style="text-align:left;">${escapeHtml(r.AgenteSeguridad || user.usuario || '')}</td>
        </tr>`);
          } else {
            filas.push(`<tr class="data-row">
          <td class="col-no" style="text-align:center;">${i + 1}</td>
          <td class="col-nombre">&nbsp;</td>
          <td class="col-colilla">&nbsp;</td>
          <td class="col-vuelo">&nbsp;</td>
          <td class="col-destino" style="text-align:center;">N/A</td>
          <td class="col-hora">&nbsp;</td>
          <td class="col-agente1">&nbsp;</td>
          <td class="col-agente2">&nbsp;</td>
        </tr>`);
          }
        } else {
          const dest = r.Destino || (tiene ? (vuelo.Destino || 'N/A') : '');
          filas.push(`<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td style="text-align:left;">${escapeHtml(r.Pasajero || r.Nombre || '')}</td>
          <td style="text-align:center;">${escapeHtml(r.Secuencia ?? '')}</td>
          <td style="text-align:center;">${escapeHtml(r.Colilla || '')}</td>
          <td style="text-align:center;">${escapeHtml(r.Vuelo || (tiene ? vueloNo : ''))}</td>
          <td style="text-align:center;">${escapeHtml(dest)}</td>
          <td style="text-align:center;">${escapeHtml(extractHHMM(r.HoraRevision || r.Hora))}</td>
          <td style="text-align:left;">${escapeHtml(r.AgenteAVSEC || '')}</td>
          <td style="text-align:left;">${escapeHtml(r.AgenteSeguridad || user.usuario || '')}</td>
        </tr>`);
        }
      }
      const sig = sanitizeSigUrl(er.firmaBase64 || er.firma);
      return {
        ...baseVars,
        Fecha: fechaBase,
        FilasEquipajeHTML: filas.join(''),
        Observaciones: er.observaciones || '',
        FirmaFinal: sig,
        FirmaSeguridadAerolinea: sig,
        NombreFirmaSeguridad: er.agente || user.usuario || '',
        TotalEquipajes: rows.length
      };
    }

    // 2. Formato MECD (amx-mecd)
    if (formatoId === 'amx-mecd') {
      const m = d.mecdPayload || d;
      const revList = Array.isArray(m.revision) ? m.revision : (Array.isArray(m.revisiones) ? m.revisiones : []);
      const cfList = Array.isArray(m.conFirma) ? m.conFirma : [];
      const sfList = Array.isArray(m.sinFirma) ? m.sinFirma : [];
      const totalPairs = Math.max(9, Math.ceil(revList.length / 2));
      let tablaRev = '';
      for (let i = 0; i < totalPairs; i++) {
        const l = revList[i * 2] || {};
        const r = revList[i * 2 + 1] || {};
        tablaRev += `<tr><td>${escapeHtml(l.Control || '')}</td><td>${escapeHtml(l.Colilla || '')}</td><td>${escapeHtml(r.Control || '')}</td><td>${escapeHtml(r.Colilla || '')}</td></tr>`;
      }
      const buildDmg = (list, min) => {
        const c = Math.max(min, list.length);
        let h = '';
        for (let i = 0; i < c; i++) {
          const it = list[i] || {};
          h += `<tr><td>${escapeHtml(it.Pasajero || it.NombrePasajero || '')}</td><td>${escapeHtml(it.Colilla || '')}</td><td>${escapeHtml(it.Control || '')}</td><td>${escapeHtml(it.Destino || '')}</td></tr>`;
        }
        return h;
      };
      return {
        ...baseVars,
        Fecha: fechaBase,
        NoVuelo: vueloNo,
        TablaRevision: tablaRev,
        TablaConFirma: buildDmg(cfList, 12),
        TablaSinFirma: buildDmg(sfList, 5),
        FirmaAgente: sanitizeSigUrl(m.firmaAgente),
        NombreAgente: m.agenteNombre || user.usuario || '',
        FirmaCCO: sanitizeSigUrl(m.firmaCCO),
        NombreCCO: m.ccoNombre || '',
        FirmaSupervisor: sanitizeSigUrl(m.firmaSupervisor),
        NombreSupervisor: m.supervisorNombre || ''
      };
    }

    // 3. Formato PO (amx-po)
    if (formatoId === 'amx-po') {
      const po = d.poPayload || d;
      const rows = Array.isArray(po.registros) ? po.registros : (Array.isArray(po.detalles) ? po.detalles : []);
      const total = Math.max(13, rows.length);
      let filasHtml = '';
      for (let i = 0; i < total; i++) {
        const r = rows[i] || {};
        const pos = String(r.PosicionesPOId ?? r.PosicionId ?? r.Puesto ?? '').trim();
        let posCells = '';
        for (let p = 1; p <= 11; p++) {
          posCells += `<td style="border: 1px solid black; padding: 4px; text-align: center; font-weight: bold;">${pos === String(p) ? 'X' : ''}</td>`;
        }
        filasHtml += `<tr>
          <td style="border: 1px solid black; padding: 4px; text-align: center; font-weight: bold;">${i + 1}</td>
          <td style="border: 1px solid black; padding: 4px; text-align: left;">${escapeHtml(r.Agentes || r.Usuario || r.Nombre || '')}</td>
          ${posCells}
        </tr>`;
      }
      return {
        ...baseVars,
        Fecha: fechaBase,
        LeadAgent: po.leadAgent || user.usuario || '',
        Vuelo: vueloNo,
        FilasEquipajeHTML: filasHtml,
        Observaciones: po.observaciones || '',
        FirmaSupervisor: sanitizeSigUrl(po.firmaSupervisor || po.firmaBase64),
        NombreSupervisor: po.supervisorNombre || ''
      };
    }

    // 4. Formato CP (*-cp)
    if (formatoId.endsWith('-cp')) {
      const cp = d.cpPayload || d;
      const rows = Array.isArray(cp.registros) ? cp.registros : [];
      const min = Math.max(25, rows.length);
      const filas = [];
      for (let i = 0; i < min; i++) {
        const r = rows[i] || {};
        const hIn = extractHHMM(r.HoraIngreso);
        const hOut = extractHHMM(r.HoraSalida);
        const outHtml = (r.Nombre && !hOut)
          ? '<span style="color:#DC2626;font-weight:bold;">Pendiente</span>'
          : escapeHtml(hOut);
        filas.push(`<tr>
          <td style="border:1px solid black;padding:3px;text-align:center;">${i + 1}</td>
          <td style="border:1px solid black;padding:3px;text-align:left;">${escapeHtml(r.Nombre || '')}</td>
          <td style="border:1px solid black;padding:3px;text-align:center;">${escapeHtml(r.NoTIA || '')}</td>
          <td style="border:1px solid black;padding:3px;text-align:center;">${escapeHtml(hIn)}</td>
          <td style="border:1px solid black;padding:3px;text-align:center;">${escapeHtml(r.Empresa || '')}</td>
          <td style="border:1px solid black;padding:3px;text-align:center;">${escapeHtml(r.Motivo || '')}</td>
          <td style="border:1px solid black;padding:3px;text-align:center;">${outHtml}</td>
        </tr>`);
      }
      const alerosArr = Array.isArray(cp.alerosNombres) ? cp.alerosNombres : [];
      const trac = [cp.tractoristaNombre, cp.noUnidadLabel].filter(Boolean).join(' / ');
      return {
        ...baseVars,
        Fecha: formatMMDDYYYY(fechaBase),
        HoraInicioPuerta: `${extractHHMM(cp.horaInicio) || '--:--'} / ${puerta || '--'}`,
        Supervisor: cp.supervisorNombre || cp.supervisor || '',
        Agente: cp.agente || user.usuario || '',
        Vuelo: vueloNo,
        Matricula: matricula,
        FilasTabla: filas.join(''),
        ArriboVuelo: extractHHMM(cp.arriboVuelo || cp.arriboDelVuelo),
        AeronaveAsegurada: extractHHMM(cp.aeronaveAsegurada),
        Alero1: alerosArr[0] || cp.alero1 || '',
        Alero2: alerosArr[1] || cp.alero2 || '',
        TractoristaUnidad: trac || cp.tractoristaUnidad || '',
        Observaciones: cp.observaciones || ''
      };
    }

    // 5. Formato CIEC (*-ciec)
    if (formatoId.endsWith('-ciec')) {
      const ciec = d.ciecPayload || d;
      const rows = Array.isArray(ciec.registros) ? ciec.registros : [];
      const min = Math.max(32, rows.length);
      const filas = [];
      for (let i = 0; i < min; i++) {
        const r = rows[i] || {};
        const hIn = extractHHMM(r.HoraIngreso);
        const hOut = extractHHMM(r.HoraSalida);
        const outHtml = (r.Nombre && !hOut)
          ? '<span style="color:#DC2626;font-weight:bold;">Pendiente</span>'
          : escapeHtml(hOut);
        filas.push(`<tr class="grid-row">
          <td style="border:1px solid black;padding:2px 3px;text-align:center;">${i + 1}</td>
          <td style="border:1px solid black;padding:2px 4px;text-align:left;">${escapeHtml(r.Nombre || '')}</td>
          <td style="border:1px solid black;padding:2px 3px;text-align:center;">${escapeHtml(r.NoTIA || '')}</td>
          <td style="border:1px solid black;padding:2px 3px;text-align:center;">${escapeHtml(r.Empresa || '')}</td>
          <td style="border:1px solid black;padding:2px 3px;text-align:center;">${escapeHtml(hIn)}</td>
          <td style="border:1px solid black;padding:2px 3px;text-align:center;">${escapeHtml(r.Motivo || '')}</td>
          <td style="border:1px solid black;padding:2px 3px;text-align:center;">${outHtml}</td>
        </tr>`);
      }
      const eqList = (Array.isArray(ciec.equipajePuerta) ? ciec.equipajePuerta : [])
        .map((e) => String(e?.Valor ?? e?.Secuencia ?? e ?? '').trim())
        .filter((v) => v && v.toUpperCase() !== 'X' && v !== '0');
      const alerosText = Array.isArray(ciec.alerosNombres) ? ciec.alerosNombres.join(', ') : '';
      const trac = [ciec.tractoristaNombre, ciec.noUnidadLabel].filter(Boolean).join(' / ');
      return {
        ...baseVars,
        Fecha: formatMMDDYYYY(fechaBase),
        HoraIniciaPuesto: extractHHMM(ciec.horaInicio),
        Supervisor: ciec.supervisorNombre || '',
        Agente: ciec.agente || user.usuario || '',
        Vuelo: vueloNo,
        Matricula: matricula,
        FilasInOutHTML: filas.join(''),
        ArriboVuelo: extractHHMM(ciec.arriboDelVuelo || ciec.arriboVuelo),
        AeronaveAsegurada: extractHHMM(ciec.aeronaveAsegurada),
        PasarelaAcoplada: extractHHMM(ciec.pasarelaAcoplada),
        PuertaAbierta: extractHHMM(ciec.puertaAbierta),
        EgresoTripulacion: extractHHMM(ciec.egresoTripulacion),
        IngresoTripulacion: extractHHMM(ciec.ingresoTripulacion),
        PrimerPax: extractHHMM(ciec.primerPax),
        UltimoPax: extractHHMM(ciec.ultimoPax),
        PaxAbordos: ciec.paxAbordos ?? '',
        PuertaCerrada: extractHHMM(ciec.puertaCerrada),
        DesacoplePasarela: extractHHMM(ciec.desacoplePasarela),
        PushBack: extractHHMM(ciec.pushBack),
        PaxEntrandoGUA: ciec.paxEntrando ?? '',
        Despegue: extractHHMM(ciec.despegue),
        TotalEquipajePuerta: eqList.length,
        EquipajePuertaHTML: eqList.map((v) => escapeHtml(v)).join(', '),
        AlerosText: alerosText,
        Aleros: alerosText,
        TractoristaUnidad: trac,
        Observaciones: ciec.observaciones || ''
      };
    }

    // 6. Formato CEC (*-cec)
    if (formatoId.endsWith('-cec')) {
      const cec = d.cecPayload || d;
      const eqRecp = Number(cec.equipaje ?? 0) || 0;
      const carrRecp = Number(cec.carruajes ?? 0) || 0;
      const cargRecp = Number(cec.carga ?? 0) || 0;
      const eqMostrador = Number(cec.equipajeMostrador ?? 0) || 0;
      const eqPuertaDelta = Number(cec.equipajePuerta ?? 0) || 0;
      const cargaDelta = Number(cec.cargaEmbarqueDelta ?? 0) || 0;
      const blankCells = (count) => Array.from({ length: count }, () => `<td style='border: 1px solid black; height: 18px; width: 7%;'></td>`).join('');
      const vueloParts = String(vueloNo || '').split('/').map(s => s.trim()).filter(Boolean);

      let tablaEmbarqueOut = baseVars.TablaEmbarqueHTML || '';
      let tablaDesembarqueOut = baseVars.TablaDesembarqueHTML || '';
      if (formatoId === 'dl-cec') {
        const totalEqEmbarque = eqMostrador + eqPuertaDelta;
        tablaEmbarqueOut = `<table style='width: 100%; border-collapse: collapse; font-family: Segoe UI, Arial, sans-serif; font-size: 10px;'><tbody>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left; width: 32%;'>EQUIPAJE MOSTRADOR</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold; width: 8%;'>${eqMostrador}</td>${blankCells(7)}<td style='border: none; width: 11%;'></td></tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>EQUIPAJE POR PUERTA</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${eqPuertaDelta}</td>${blankCells(7)}<td style='border: none;'></td></tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>CARGA:</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${cargaDelta}</td>${blankCells(7)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: none;'></td></tr>` +
          `<tr>${blankCells(12)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; background-color: #f8fafc;'>TOTAL EQ.: ${totalEqEmbarque}</td></tr>` +
          `<tr>${blankCells(12)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; background-color: #f8fafc;'>TOTAL CARGA: ${cargaDelta}</td></tr>` +
          `</tbody></table>`;

        const totalEqDesembarqueDelta = eqRecp + carrRecp;
        tablaDesembarqueOut = `<table style='width: 100%; border-collapse: collapse; font-family: Segoe UI, Arial, sans-serif; font-size: 10px;'><tbody>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left; width: 32%;'>EQUIPAJES</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold; width: 8%;'>${eqRecp}</td>${blankCells(7)}</tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>CARRUAJES</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${carrRecp}</td>${blankCells(7)}</tr>` +
          `<tr><td colspan='4' style='border: 1px solid black; height: 18px; font-weight: bold; padding-left: 5px; text-align: left;'>CARGA</td><td style='border: 1px solid black; height: 18px; text-align: center; font-weight: bold;'>${cargRecp}</td>${blankCells(6)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; width: 11%; background-color: #f8fafc;'>TOTAL EQ.: ${totalEqDesembarqueDelta}</td></tr>` +
          `<tr>${blankCells(11)}<td style='border: 1px solid black; height: 18px; text-align: left; padding-left: 4px; font-weight: bold; width: 11%; background-color: #f8fafc;'>TOTAL CARGA: ${cargRecp}</td></tr>` +
          `<tr>${blankCells(12)}</tr>` +
          `<tr>${blankCells(12)}</tr>` +
          `</tbody></table>`;
      }

      return {
        ...baseVars,
        HoraIniciaPuesto: extractHHMM(cec.horaInicio),
        Supervisor: cec.supervisorNombre || cec.supervisor || baseVars.Supervisor || '',
        Fecha: formatMMDDYYYY(fechaBase),
        Agente: cec.agenteNombre || cec.agente || user.usuario || '',
        Vuelo: vueloNo,
        Matricula: matricula,
        CompartimentoNo: String(cec.compartimiento ?? cec.compartimientoNo ?? '1'),
        PuertaNo: puerta,
        CompAbierto: extractHHMM(cec.compAbierto),
        CompCerrado: extractHHMM(cec.compCerrado),
        VueloEmbarque: vueloParts[vueloParts.length - 1] || vueloNo,
        TablaEmbarqueHTML: tablaEmbarqueOut,
        VueloDesembarque: vueloParts[0] || vueloNo,
        TablaDesembarqueHTML: tablaDesembarqueOut,
        Oirsa: [cec.nombreOirsa, cec.tiaOirsa ? `(TIA: ${cec.tiaOirsa})` : ''].filter(Boolean).join(' '),
        Combustible: [cec.pilotoCombustible, cec.ayudanteCombustible].filter(Boolean).join(' / '),
        CombustibleUnidad: cec.noUnidadCombustible || '',
        CombustibleLlegaSale: [extractHHMM(cec.combustibleEntrada), extractHHMM(cec.combustibleSalida)].filter(Boolean).join(' / '),
        Cocinas: [cec.pilotoCocinas, cec.ayudanteCocinas].filter(Boolean).join(' / '),
        CocinasUnidad: cec.noUnidadCocinas || '',
        CocinasLlegaSale: [extractHHMM(cec.cocinasEntrada), extractHHMM(cec.cocinasSalida)].filter(Boolean).join(' / '),
        OpRampa: cec.operadoresRampa || '',
        DesembarqueInicio: extractHHMM(cec.desembarqueInicio),
        DesembarqueFin: extractHHMM(cec.desembarqueFinal),
        EmbarqueInicio: extractHHMM(cec.embarqueInicio),
        EmbarqueFin: extractHHMM(cec.embarqueFinal),
        Observaciones: cec.observaciones || 'N/A'
      };
    }

    return {
      ...baseVars,
      Fecha: fechaBase,
      Vuelo: vueloNo,
      NoVuelo: vueloNo,
      Matricula: matricula,
      Observaciones: d.observaciones || baseVars.Observaciones || ''
    };
  }

  function renderTemplateTokensClientSide(templateHtml, vars = {}, documentTitle = 'VISTA_PRELIMINAR_OFFLINE') {
    const rawHtmlKeys = new Set([
      'FilasTabla', 'FilasInOutHTML', 'FilasEquipajeHTML', 'MatrizHTML',
      'TablaEmbarqueHTML', 'TablaDesembarqueHTML', 'TablaPersonalHTML',
      'TablaCarretasHTML', 'EquipajePuertaHTML', 'TablaRevision',
      'TablaConFirma', 'TablaSinFirma', 'TablaSAG_HTML', 'TablaLAATS_HTML',
      'TablaHTML', 'TablaPaxHTML'
    ]);

    let html = String(templateHtml || '');
    if (!html) {
      html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(documentTitle)}</title></head><body style="background:#fff;color:#000;font-family:Arial,sans-serif;padding:24px;"><h2>${escapeHtml(documentTitle)}</h2><pre>${escapeHtml(JSON.stringify(vars, null, 2))}</pre></body></html>`;
      return html;
    }

    html = html.replace(
      /@\{join\(xpath\([\s\S]*?\/\/Usuario\/text\(\)'\),\s*', '\)\}/g,
      () => escapeHtml(vars.AlerosText || '')
    );

    html = html.replace(
      /@\{formatDateTime\(\s*body\('[^']+'\)\?\['([^']+)'\]\s*,\s*'dd\/MM\/yyyy'\s*\)\}/g,
      (_, key) => escapeHtml(formatDDMMYYYY(vars[key]))
    );

    html = html.replace(/@\{\s*variables\('([^']+)'\)\s*\}/g, (_, key) => {
      const k = String(key || '').trim();
      return vars[k] !== undefined ? sanitizeSigUrl(vars[k]) : BLANK_IMG;
    });

    html = html.replace(/@\{\s*body\('[^']+'\)\?\['([^']+)'\]\s*\}/g, (_, key) => {
      const k = String(key || '').trim();
      if (rawHtmlKeys.has(k)) return String(vars[k] ?? '');
      if (k.toLowerCase().includes('firma') || k.toLowerCase().includes('signature')) {
        return sanitizeSigUrl(vars[k]);
      }
      return escapeHtml(vars[k] ?? '');
    });

    html = html.replace(/<img\b[^>]*\bsrc\s*=\s*(['"])\s*\1[^>]*>/gi, '');

    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(documentTitle)}</title>`);
    }
    return html;
  }

  async function generateOfflinePreview(formatoId, payload = {}) {
    const ctx = readPageContext() || {};
    let cachedTpl = null;
    try {
      cachedTpl = await idbGet(STORE_TEMPLATES, formatoId);
    } catch (_) {}

    const vuelo = cachedTpl?.vuelo || ctx.vuelo || {};
    const vueloSeg = String(vuelo.novuelo || 'VUELO').replace(/[^a-zA-Z0-9_-]/g, '_');
    const matSeg = String(vuelo.Matricula || 'NA').trim() || 'NA';
    const fmtName = cachedTpl?.formatoNombre || ctx.formatoNombre || formatoId;
    const fmtSeg = String(fmtName).replace(/[\\/:*?"<>|]/g, '_');
    const suffix = payload.encabezadoId ? String(payload.encabezadoId) : 'PRELIMINAR';
    const docTitle = `${vueloSeg}_${matSeg}_${fmtSeg}_${suffix}`;

    const vars = buildOfflineVarsForFormat(formatoId, payload, cachedTpl || {}, ctx);
    const renderedHtml = renderTemplateTokensClientSide(cachedTpl?.templateHtml || '', vars, docTitle);
    _lastOfflinePreviewHtml = renderedHtml;

    const swUrl = `/formatos/${encodeURIComponent(formatoId)}/vista-preliminar?offline=1`;
    if (window.caches && typeof window.caches.open === 'function') {
      try {
        const cache = await window.caches.open(PREVIEW_CACHE_NAME);
        await cache.put(
          swUrl,
          new Response(renderedHtml, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          })
        );
      } catch (_) {}
    }

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_OFFLINE_PREVIEW',
          url: swUrl,
          html: renderedHtml
        });
      } catch (_) {}
    }

    let blobUrl = swUrl;
    try {
      const blob = new Blob([renderedHtml], { type: 'text/html;charset=utf-8' });
      blobUrl = URL.createObjectURL(blob);
    } catch (_) {}

    _lastOfflinePreviewUrl = blobUrl;
    return {
      docTitle,
      renderedHtml,
      swUrl,
      blobUrl
    };
  }

  function openLastOfflinePreview() {
    if (_lastOfflinePreviewUrl) {
      window.open(_lastOfflinePreviewUrl, '_blank');
      return;
    }
    if (_lastOfflinePreviewHtml) {
      const blob = new Blob([_lastOfflinePreviewHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      _lastOfflinePreviewUrl = url;
      window.open(url, '_blank');
    }
  }

  // ============================================================================
  // 7. COLA DE SINCRONIZACIÓN OFFLINE (pending_sync_queue) Y AUTO-SYNC
  // ============================================================================
  async function enqueueOfflineSave(endpointUrl, payload = {}) {
    const ctx = readPageContext() || {};
    const formatoId = String(payload.formatoId || ctx.formatoId || '').trim();
    const itinerarioId = parseInt(payload.itinerarioId || ctx.itinerarioId, 10) || 0;
    const encabezadoId = payload.encabezadoId || ctx.encabezadoId || null;
    const draftKey = buildDraftKey({
      ...ctx,
      formatoId,
      itinerarioId,
      encabezadoId
    });
    const queueKey = `${itinerarioId}::${formatoId}::${encabezadoId || 'NEW'}`;
    const clientMutationId = `mut_${itinerarioId}_${formatoId}_${Date.now()}`;

    const draftRecord = await saveCurrentDraft(payload, 'queued_offline');
    const previewInfo = await generateOfflinePreview(formatoId, payload);

    const queueItem = {
      queueKey,
      draftKey,
      clientMutationId,
      endpoint: endpointUrl,
      formatoId,
      formatoNombre: ctx.formatoNombre || formatoId,
      cliente: String(ctx.cliente || ctx.vuelo?.operador || 'AEROMEXICO'),
      correlativo: String(ctx.correlativo || itinerarioId),
      itinerarioId,
      encabezadoId,
      vueloSnapshot: ctx.vuelo || {},
      payload: {
        ...payload,
        guardar: true,
        offlineSync: true,
        clientMutationId,
        vueloSnapshot: ctx.vuelo || {}
      },
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending'
    };

    await idbPut(STORE_QUEUE, queueItem);
    await refreshPendingCount();

    if (draftRecord) {
      showDraftBanner(draftRecord, true);
    }

    // Mostrar modal claro de confirmación Offline con acceso directo a la Vista Preliminar limpia
    setTimeout(() => {
      if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
        Swal.fire({
          icon: 'info',
          title: 'Guardado localmente en caché (Pendiente de sincronización)',
          html: `
            <div style="text-align:left;font-size:13px;line-height:1.5;">
              <p><strong>Sus datos fueron validados y respaldados en IndexedDB</strong> dentro de este dispositivo.</p>
              <ul style="margin:10px 0 0 18px;">
                <li><strong>Cliente / Operación:</strong> ${escapeHtml(queueItem.cliente)} (#${escapeHtml(queueItem.correlativo)})</li>
                <li><strong>Formato:</strong> ${escapeHtml(queueItem.formatoNombre)}</li>
                <li><strong>Sincronización:</strong> Se enviará automáticamente a Azure SQL al recuperar señal de internet.</li>
              </ul>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: '<i class="fas fa-eye"></i> Ver Vista Preliminar Limpia',
          cancelButtonText: 'Continuar en el Formato',
          confirmButtonColor: '#0F2744',
          cancelButtonColor: '#275B88'
        }).then((res) => {
          if (res.isConfirmed) {
            openLastOfflinePreview();
          }
        });
      }
    }, 1150);

    return {
      queueItem,
      previewInfo
    };
  }

  async function processPendingSyncQueue() {
    if (_isSyncing || !_isOnline || _simulatedOffline) return { syncedCount: 0 };

    let items = [];
    try {
      items = await idbGetAll(STORE_QUEUE);
    } catch (_) {
      return { syncedCount: 0 };
    }

    if (items.length === 0) {
      _pendingCount = 0;
      emitNetworkStatus();
      return { syncedCount: 0 };
    }

    // Orden cronológico estricto
    items.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

    _isSyncing = true;
    emitNetworkStatus();

    let syncedCount = 0;
    const syncedResults = [];

    for (const item of items) {
      if (!_isOnline || _simulatedOffline) break;
      try {
        const res = await origFetch(item.endpoint || '/api/formatos/guardar', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Sio-Offline-Sync': '1',
            'X-Sio-Mutation-Id': item.clientMutationId || ''
          },
          body: JSON.stringify(item.payload)
        });

        if (res && res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json && json.success) {
            await idbDelete(STORE_QUEUE, item.queueKey);
            if (item.draftKey) {
              await idbDelete(STORE_DRAFTS, item.draftKey).catch(() => {});
              try { localStorage.removeItem(MIRROR_PREFIX + item.draftKey); } catch (_) {}
            }
            syncedCount += 1;
            syncedResults.push({ item, response: json });

            // Si el usuario tiene abierto actualmente este mismo formato, actualizar UI en vivo
            const ctx = readPageContext();
            if (ctx && ctx.formatoId === item.formatoId && Number(ctx.itinerarioId) === Number(item.itinerarioId)) {
              const banner = document.getElementById('sioOfflineDraftBanner');
              if (banner) banner.hidden = true;
              const modeBadge = document.getElementById('sioFormatoModeBadge');
              if (modeBadge && json.encabezadoId) {
                modeBadge.textContent = `SINCRONIZADO EN AZURE SQL #${json.encabezadoId}`;
                modeBadge.className = 'badge badge-success';
              }
              if (json.firmasRepo) {
                window.SioSignatureRepoClient?.applyRepoState?.(json.firmasRepo);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[OFFLINE AUTO-SYNC ITEM WARN]', item.queueKey, err.message);
        _isOnline = false;
        break;
      }
    }

    _isSyncing = false;
    await refreshPendingCount();

    if (syncedCount > 0 && typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
      const last = syncedResults[syncedResults.length - 1];
      const idLabel = last?.response?.encabezadoId ? ` (ID #${last.response.encabezadoId})` : '';
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Sincronización automática completada: ${syncedCount} formato(s) respaldado(s) en Azure SQL${idLabel}`,
        showConfirmButton: false,
        timer: 4200,
        timerProgressBar: true
      });
    }

    return { syncedCount, syncedResults };
  }

  // ============================================================================
  // 8. INTERCEPTOR TRANSPARENTE DE FETCH (/api/formatos/guardar | /api/formatos/procesar)
  // ============================================================================
  window.fetch = async function (input, init = {}) {
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const method = String(init.method || (input && input.method) || 'GET').toUpperCase();

    const isFormatSaveEndpoint =
      method === 'POST' &&
      (urlStr.includes('/api/formatos/guardar') || urlStr.includes('/api/formatos/procesar'));

    const isOfflineSyncHeader =
      init.headers && (init.headers['X-Sio-Offline-Sync'] === '1' || init.headers['x-sio-offline-sync'] === '1');

    if (!isFormatSaveEndpoint || isOfflineSyncHeader) {
      return origFetch(input, init);
    }

    let payload = {};
    try {
      if (typeof init.body === 'string') {
        payload = JSON.parse(init.body);
      }
    } catch (_) {}

    const isGuardarDefinitivo = Boolean(payload.guardar);
    const formatoId = String(payload.formatoId || readPageContext()?.formatoId || '').trim();

    // Verificar conectividad real antes de enviar
    const currentlyOnline = (!_simulatedOffline && navigator.onLine !== false)
      ? await checkRealConnectivity()
      : false;

    if (currentlyOnline) {
      try {
        const netRes = await origFetch(input, init);
        if (netRes && netRes.ok && isGuardarDefinitivo) {
          const clone = netRes.clone();
          clone.json().then(async (json) => {
            if (json && json.success) {
              const ctx = readPageContext();
              if (ctx) {
                const dk = buildDraftKey(ctx);
                try { localStorage.removeItem(MIRROR_PREFIX + dk); } catch (_) {}
                await idbDelete(STORE_DRAFTS, dk).catch(() => {});
                const banner = document.getElementById('sioOfflineDraftBanner');
                if (banner) banner.hidden = true;
              }
            }
          }).catch(() => {});
        }
        return netRes;
      } catch (fetchErr) {
        if (fetchErr && fetchErr.name === 'AbortError') {
          throw fetchErr;
        }
        // Si falló la red justo durante el POST, degradar elegantemente a Modo Caché Offline
        _isOnline = false;
        emitNetworkStatus();
      }
    }

    // MODO OFFLINE: Interceptar Vista Preliminar (guardar: false) o Guardado Definitivo (guardar: true)
    if (!isGuardarDefinitivo) {
      await saveCurrentDraft(payload, 'draft');
      const previewInfo = await generateOfflinePreview(formatoId, payload);
      return new Response(
        JSON.stringify({
          success: true,
          modo: 'preliminar',
          offlinePreview: true,
          documentoTitulo: previewInfo.docTitle,
          previewUrl: previewInfo.blobUrl
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
    }

    const { queueItem, previewInfo } = await enqueueOfflineSave(urlStr, payload);
    return new Response(
      JSON.stringify({
        success: true,
        modo: 'offline-cache',
        offlineQueued: true,
        queueKey: queueItem.queueKey,
        clientMutationId: queueItem.clientMutationId,
        encabezadoId: null,
        previewUrl: null,
        offlinePreviewUrl: previewInfo.blobUrl,
        mensaje: 'Guardado localmente en caché (Pendiente de sincronización). Se enviará automáticamente al recuperar señal.'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  };

  // ============================================================================
  // 9. MODAL DE ESTADO DE CONECTIVIDAD Y COLA OFFLINE (Clic en el Tab Bar)
  // ============================================================================
  async function openStatusModal() {
    if (typeof Swal === 'undefined' || !Swal || typeof Swal.fire !== 'function') return;
    const queueItems = await idbGetAll(STORE_QUEUE).catch(() => []);
    const drafts = await idbGetAll(STORE_DRAFTS).catch(() => []);
    const effectiveOnline = _isOnline && !_simulatedOffline;

    const queueListHtml = queueItems.length === 0
      ? '<p style="color:#64748B;font-size:12.5px;margin:6px 0;">No hay formatos pendientes de sincronización.</p>'
      : `<ul style="text-align:left;font-size:12px;margin:8px 0 0 16px;">${queueItems
          .map((q) => `<li><strong>${escapeHtml(q.cliente)} (#${escapeHtml(q.correlativo)})</strong> — ${escapeHtml(q.formatoNombre)} <span style="color:#D97706;">[Pendiente]</span></li>`)
          .join('')}</ul>`;

    Swal.fire({
      icon: effectiveOnline ? 'success' : 'warning',
      title: effectiveOnline ? 'Conectividad Activa — En Línea' : 'Sin Conexión — Modo Caché Offline',
      html: `
        <div style="text-align:left;font-size:13px;line-height:1.55;">
          <p><strong>Estado de Red:</strong> ${effectiveOnline ? `<span style="color:#16A34A;font-weight:700;">Conectado (${_lastLatencyMs} ms)</span>` : '<span style="color:#DC2626;font-weight:700;">Sin alcance a servidor (Respaldo IndexedDB activo)</span>'}</p>
          <p><strong>Borradores locales en IndexedDB:</strong> ${drafts.length}</p>
          <p><strong>Formatos en cola por sincronizar:</strong> ${queueItems.length}</p>
          ${queueListHtml}
        </div>
      `,
      showCancelButton: queueItems.length > 0 && effectiveOnline,
      confirmButtonText: 'Cerrar',
      cancelButtonText: 'Sincronizar Ahora',
      confirmButtonColor: '#0F2744',
      cancelButtonColor: '#16A34A'
    }).then((res) => {
      if (res.dismiss === Swal.DismissReason.cancel) {
        processPendingSyncQueue();
      }
    });
  }

  // ============================================================================
  // 10. INICIALIZACIÓN DE EVENTOS, SERVICE WORKER Y API PÚBLICA
  // ============================================================================
  window.addEventListener('online', () => {
    if (!_simulatedOffline) {
      checkRealConnectivity();
    }
  });

  window.addEventListener('offline', () => {
    _isOnline = false;
    emitNetworkStatus();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Registrar Service Worker seguro
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[SW REGISTER WARN]', err.message);
      });
    }

    // 2. Actualizar contador inicial de cola en el Tab Bar y verificar señal real
    await refreshPendingCount();
    checkRealConnectivity();
    setInterval(checkRealConnectivity, HEARTBEAT_INTERVAL_MS);

    // 3. Configurar formulario de formato activo (si estamos en /formatos/:id)
    const ctx = readPageContext();
    if (!ctx || !ctx.formatoId) return;

    prefetchTemplateForActiveFormat();

    const btnDiscard = document.getElementById('btnOfflineDiscardDraft');
    if (btnDiscard) {
      btnDiscard.addEventListener('click', () => discardActiveDraft());
    }

    const btnPreviewBanner = document.getElementById('btnOfflinePreviewBanner');
    if (btnPreviewBanner) {
      btnPreviewBanner.addEventListener('click', () => openLastOfflinePreview());
    }

    // Restaurar campos, firmas y banner desde IndexedDB
    const draftKey = buildDraftKey(ctx);
    const savedDraft = await idbGet(STORE_DRAFTS, draftKey).catch(() => null);
    const queueKey = `${ctx.itinerarioId}::${ctx.formatoId}::${ctx.encabezadoId || 'NEW'}`;
    const queuedItem = await idbGet(STORE_QUEUE, queueKey).catch(() => null);

    if (savedDraft) {
      const didRestore = restoreFieldsAndSignatures(savedDraft);
      if (queuedItem && savedDraft.lastPayload) {
        await generateOfflinePreview(ctx.formatoId, savedDraft.lastPayload);
        showDraftBanner(savedDraft, true);
      } else if (didRestore) {
        showDraftBanner(savedDraft, false);
      }
    }

    // Escuchar cambios en tiempo real para autoguardado continuo en IndexedDB
    const main = document.querySelector('main') || document.body;
    main.addEventListener('input', scheduleDraftSave);
    main.addEventListener('change', scheduleDraftSave);
    main.addEventListener('sio:signature-change', scheduleDraftSave);
    main.addEventListener('click', (e) => {
      const btn = e.target.closest('button, td[data-cell-index], td[data-pos-id]');
      if (btn && btn.id !== 'btnOfflineDiscardDraft' && btn.id !== 'btnOfflinePreviewBanner') {
        scheduleDraftSave();
      }
    });

    window.addEventListener('pagehide', () => {
      saveCurrentDraft();
    });
  });

  window.SioOfflineManager = {
    checkRealConnectivity,
    saveCurrentDraft,
    processPendingSyncQueue,
    openStatusModal,
    openLastOfflinePreview,
    generateOfflinePreview,
    getPendingQueue: () => idbGetAll(STORE_QUEUE),
    getAllDrafts: () => idbGetAll(STORE_DRAFTS),
    getDraftForCurrentPage: async () => {
      const ctx = readPageContext();
      return ctx ? idbGet(STORE_DRAFTS, buildDraftKey(ctx)) : null;
    },
    setSimulatedOffline: (offlineFlag) => {
      _simulatedOffline = Boolean(offlineFlag);
      if (_simulatedOffline) {
        _isOnline = false;
        emitNetworkStatus();
        return Promise.resolve(false);
      }
      return checkRealConnectivity();
    },
    isOnline: () => _isOnline && !_simulatedOffline
  };
})(window, document);
