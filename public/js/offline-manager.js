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
  // Flujo de decisión de borrador local: mientras el usuario no decida (modal), el autoguardado
  // permanece en pausa para no pisar el borrador de IndexedDB con un formulario en blanco.
  let _autosaveBlocked = true;
  let _hasUserEdited = false;
  let _initialBaseline = null;
  let _initialModeBadge = null;
  const _stateAdapters = new Map();

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
  // 3. REGISTRO DE ADAPTADORES DE ESTADO (Full State Hydration en sitio sin recarga)
  // ============================================================================
  function safeClone(val) {
    try {
      return structuredClone(val);
    } catch (_) {
      return val;
    }
  }

  function registerStateAdapter(adapterKey, adapter) {
    if (!adapterKey || !adapter || typeof adapter.capture !== 'function' || typeof adapter.restore !== 'function') {
      return;
    }
    _stateAdapters.set(String(adapterKey), adapter);
  }

  function captureAdaptersState() {
    const out = {};
    _stateAdapters.forEach((adapter, key) => {
      try {
        out[key] = safeClone(adapter.capture());
      } catch (err) {
        console.warn('[OFFLINE ADAPTER CAPTURE WARN]', key, err);
      }
    });
    return out;
  }

  function notifyStateChange(immediate = false) {
    if (_autosaveBlocked) return;
    _hasUserEdited = true;
    if (immediate) {
      if (_draftTimer) {
        clearTimeout(_draftTimer);
        _draftTimer = null;
      }
      saveCurrentDraft();
    } else {
      scheduleDraftSave();
    }
  }

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
  // 5. CAPTURA Y RESTAURACIÓN PROFUNDA DE BORRADORES (Full State Hydration)
  // ============================================================================
  const SEARCH_FILTER_IDS = new Set([
    'cpBuscador',
    'ciecBuscador',
    'erBuscarPasajero',
    'axAFiltroTexto',
    'ccdaFiltroPersonal'
  ]);

  function isLockedField(el) {
    if (!el) return true;
    return Boolean(
      el.disabled ||
      el.readOnly ||
      el.classList.contains('input-locked') ||
      el.classList.contains('er-cell-readonly')
    );
  }

  function isSearchFilterInput(el) {
    if (!el) return false;
    if (el.id && SEARCH_FILTER_IDS.has(el.id)) return true;
    return Boolean(
      el.classList.contains('sio-search-input') ||
      el.classList.contains('sio-combo-search') ||
      el.classList.contains('sio-select-search') ||
      el.getAttribute('data-sio-no-draft') === '1'
    );
  }

  function draftFieldKey(el) {
    if (el.id) return el.id;
    if (el.type === 'radio' && el.name) return `${el.name}::${el.value}`;
    return el.name || '';
  }

  function collectFormFields() {
    const main = document.querySelector('main') || document.body;
    const fields = {};
    if (!main) return fields;

    const elements = main.querySelectorAll('input, select, textarea');
    elements.forEach((el) => {
      if (el.type === 'hidden' || el.type === 'password' || el.type === 'file') return;
      if (isLockedField(el) || isSearchFilterInput(el)) return;
      if (el.closest('tr[data-uid], tr[data-row-index], tr[data-index]')) return;
      const key = draftFieldKey(el);
      if (!key) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        fields[key] = { type: el.type, checked: Boolean(el.checked), value: el.value };
      } else {
        fields[key] = { type: el.type || el.tagName.toLowerCase(), tag: el.tagName.toLowerCase(), value: el.value };
      }
    });
    return fields;
  }

  // Tablas dinámicas genéricas (filas con inputs/selects [data-field]) -> clave del InitialState del formato.
  const GENERIC_ROW_GRIDS = [
    { suffix: '-anexoa', tbodyId: 'axATbodyRegistros', rowSelector: 'tr[data-index]', patchKey: 'registros' },
    { suffix: '-anexob', tbodyId: 'axBTbodyZones', rowSelector: 'tr[data-index]', patchKey: 'zonesSearch' },
    { suffix: '-ccda', tbodyId: 'ccdaTbodyPersonal', rowSelector: 'tr[data-row-index]', patchKey: 'personal' },
    { suffix: '-cfr', tbodyId: 'cfrTbodyCarretas', rowSelector: 'tr[data-row-index]', patchKey: 'carretas' },
    { suffix: '-cll', tbodyId: 'cllTbodyRegistros', rowSelector: 'tr[data-row-index]', patchKey: 'registros' },
    { suffix: '-sp', tbodyId: 'spTbodyRegistros', rowSelector: 'tr[data-row-index]', patchKey: 'registros' },
    { suffix: '-rx', tbodyId: 'rxTbodySag', rowSelector: 'tr[data-row-index]', patchKey: 'personalSAG' },
    { suffix: '-rx', tbodyId: 'rxTbodyLaats', rowSelector: 'tr[data-row-index]', patchKey: 'personalLaats' }
  ];

  function scrapeGenericRowGrids(fmt) {
    const patch = {};
    GENERIC_ROW_GRIDS.forEach((grid) => {
      if (!fmt.endsWith(grid.suffix)) return;
      const tbody = document.getElementById(grid.tbodyId);
      if (!tbody) return;
      const rows = [];
      tbody.querySelectorAll(grid.rowSelector).forEach((tr) => {
        const row = {};
        tr.querySelectorAll('[data-field]').forEach((el) => {
          row[el.getAttribute('data-field')] = el.value;
        });
        rows.push(row);
      });
      patch[grid.patchKey] = rows;
    });
    return patch;
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
        const hasAnyValue = Object.entries(row).some(
          ([k, v]) => k !== 'Vuelo' && String(v || '').trim() !== ''
        );
        if (hasAnyValue) {
          detalles.push(row);
        }
      });
      const obsEl = document.getElementById('erObservaciones');
      patch.detalles = detalles;
      if (obsEl) patch.observaciones = obsEl.value;
    }

    // 2. Formato MECD (#mecdTbodyRev, #mecdTbodyCF, #mecdTbodySF)
    if (fmt.endsWith('-mecd')) {
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
    if (fmt.endsWith('-po')) {
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
        const attrAnulado = td.getAttribute('data-anulado') === 'true';
        const isTachado = attrAnulado || attrValor === 'X' || td.classList.contains('sio-mx-cell-withdrawn') || td.textContent.includes('✗');
        const motivoRetiro = td.getAttribute('data-motivo') || '';
        if (sec > 0 || isTachado) {
          detalles.push({
            [idKey]: parseInt(td.getAttribute('data-record-id') || '0', 10) || 0,
            Casilla: detalles.length + 1,
            Secuencia: sec,
            Valor: isTachado ? 'X' : String(sec),
            Motivo: motivoRetiro,
            motivoRetiro,
            anulado: isTachado,
            EstaEliminado: isTachado
          });
        }
      });
      patch.detalles = detalles;
    }

    // 5. Formato CP (#cpRegistrosLista .cp-reg-card[data-record-json] + #cpAlerosLista)
    if (fmt.endsWith('-cp')) {
      const registros = [];
      document.querySelectorAll('#cpRegistrosLista .cp-reg-card[data-record-json]').forEach((card) => {
        try {
          registros.push(JSON.parse(card.getAttribute('data-record-json')));
        } catch (_) {}
      });
      const aleros = [];
      document.querySelectorAll('#cpAlerosLista .btn-cp-eliminar-alero[data-emp-id]').forEach((btn) => {
        const empId = parseInt(btn.getAttribute('data-emp-id') || '0', 10);
        const card = btn.closest('.cp-alero-card');
        const spans = card ? card.querySelectorAll('span') : [];
        const nombre = spans.length > 1 ? spans[1].textContent.trim() : `Empleado #${empId}`;
        if (empId > 0) aleros.push({ EmpleadoId: empId, Nombre: nombre });
      });
      patch.registros = registros;
      patch.aleros = aleros;
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
        const attrAnulado = td.getAttribute('data-anulado') === 'true';
        const isTachado = attrAnulado || attrValor === 'X' || td.classList.contains('sio-mx-cell-withdrawn') || td.textContent.includes('✗');
        const motivoRetiro = td.getAttribute('data-motivo') || '';
        if (sec > 0 || isTachado) {
          equipajePuerta.push({
            EquipajePuertaCIECId: parseInt(td.getAttribute('data-record-id') || '0', 10) || 0,
            Casilla: equipajePuerta.length + 1,
            Secuencia: sec,
            Valor: isTachado ? 'X' : String(sec),
            Motivo: motivoRetiro,
            motivoRetiro,
            anulado: isTachado,
            EstaEliminado: isTachado
          });
        }
      });
      patch.detalles = detalles;
      patch.registros = detalles;
      patch.equipajePuerta = equipajePuerta;
    }

    return { ...patch, ...scrapeGenericRowGrids(fmt) };
  }

  function convertPayloadToInitialStatePatch(formatoId, payload = {}) {
    const d = payload.datos || {};
    const patch = {};
    if (formatoId.endsWith('-er')) {
      const er = d.erPayload || d;
      if (Array.isArray(er.registros)) patch.detalles = er.registros;
      if (er.observaciones !== undefined) patch.observaciones = er.observaciones;
    } else if (formatoId.endsWith('-mecd')) {
      const m = d.mecdPayload || d;
      if (Array.isArray(m.revision)) patch.revision = m.revision;
      if (Array.isArray(m.conFirma)) patch.conFirma = m.conFirma;
      if (Array.isArray(m.sinFirma)) patch.sinFirma = m.sinFirma;
    } else if (formatoId.endsWith('-po')) {
      const po = d.poPayload || d;
      if (Array.isArray(po.registros)) patch.detalles = po.registros;
      else if (Array.isArray(po.detalles)) patch.detalles = po.detalles;
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
      if (Array.isArray(ciec.registros)) {
        patch.detalles = ciec.registros;
        patch.registros = ciec.registros;
      }
      if (Array.isArray(ciec.equipajePuerta)) patch.equipajePuerta = ciec.equipajePuerta;
    }
    return patch;
  }

  function mergeAdaptersIntoLegacyPatch(adapterState = {}) {
    const patch = {};
    Object.entries(adapterState).forEach(([key, val]) => {
      const adapter = _stateAdapters.get(key);
      if (adapter && adapter.kind === 'matrix' && adapter.legacyPatchKey && Array.isArray(val)) {
        patch[adapter.legacyPatchKey] = val;
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(patch, val);
      }
    });
    return patch;
  }

  async function saveCurrentDraft(extraPayload = null, statusOverride = 'draft') {
    // Autoguardado en pausa mientras el usuario decide qué hacer con un borrador previo.
    if (_autosaveBlocked && !extraPayload) return null;
    const ctx = readPageContext();
    if (!ctx || !ctx.formatoId) return null;

    const draftKey = buildDraftKey(ctx);
    const fields = collectFormFields();
    const signatures = window.SioSignatureRepoClient?.exportUnlockedSignatures?.() || {};
    const adapterState = captureAdaptersState();
    const domPatch = scrapeDynamicTablesFromDom(ctx);
    const adapterPatch = mergeAdaptersIntoLegacyPatch(adapterState);
    const payloadPatch = extraPayload ? convertPayloadToInitialStatePatch(ctx.formatoId, extraPayload) : {};
    const initialStatePatch = { ...domPatch, ...adapterPatch, ...payloadPatch };

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
      adapterState,
      initialStatePatch,
      lastPayload: extraPayload || null
    };

    try {
      await idbPut(STORE_DRAFTS, record);
    } catch (err) {
      console.warn('[OFFLINE DRAFT SAVE WARN]', err);
    }
    return record;
  }

  function scheduleDraftSave() {
    if (_autosaveBlocked) return;
    _hasUserEdited = true;
    if (_draftTimer) clearTimeout(_draftTimer);
    _draftTimer = setTimeout(() => {
      saveCurrentDraft();
    }, 220);
  }

  function resolveDraftField(key) {
    const byId = document.getElementById(key);
    if (byId) return byId;
    const sep = key.indexOf('::');
    if (sep > 0) {
      const name = key.slice(0, sep);
      const val = key.slice(sep + 2);
      return Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`))
        .find((r) => r.value === val) || null;
    }
    return document.querySelector(`[name="${CSS.escape(key)}"]`);
  }

  const EMPTY_RESTORABLE_TYPES = new Set(['text', 'number', 'time', 'date', 'search', 'tel', 'email', 'url', 'textarea']);

  /**
   * Restauración profunda de campos (inputs, selects, textareas, checkboxes, radios) y firmas.
   * - Respeta estrictamente .input-locked, readonly y disabled (nunca altera fechas/datos de itinerario).
   * - Dos pasadas: 1) selects/checkboxes/radios (dispara cambios dependientes y SioSearchableCombo),
   *   2) inputs de texto/hora/número y textareas (conserva valores personalizados sobre defaults).
   * - Con { dryRun: true } solo evalúa diferencias sin modificar el DOM.
   */
  function restoreFieldsAndSignatures(draft, opts = {}) {
    if (!draft) return false;
    const dryRun = Boolean(opts.dryRun);
    const isReset = Boolean(opts.isReset);
    let restoredAny = false;

    const fieldsObj = draft.fields && typeof draft.fields === 'object' ? draft.fields : null;
    if (fieldsObj) {
      const pass1 = []; // selects, checkboxes, radios (unchecked primero, luego checked)
      const pass2 = []; // text, number, time, date, textarea

      Object.entries(fieldsObj).forEach(([key, entry]) => {
        if (!entry) return;
        const el = resolveDraftField(key);
        if (!el || isLockedField(el) || isSearchFilterInput(el)) return;
        if (el.closest('tr[data-uid], tr[data-row-index], tr[data-index]')) return;

        if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') {
          pass1.push({ el, entry });
        } else {
          pass2.push({ el, entry });
        }
      });

      // En radios, desmarcar primero los false y marcar al final los true para evitar colisiones del mismo grupo
      pass1.sort((a, b) => {
        const aRadioTrue = a.el.type === 'radio' && Boolean(a.entry.checked) ? 1 : 0;
        const bRadioTrue = b.el.type === 'radio' && Boolean(b.entry.checked) ? 1 : 0;
        return aRadioTrue - bRadioTrue;
      });

      const applyEntry = ({ el, entry }) => {
        if (el.type === 'checkbox' || el.type === 'radio') {
          const targetChecked = Boolean(entry.checked);
          if (Boolean(el.checked) !== targetChecked) {
            restoredAny = true;
            if (dryRun) return;
            el.checked = targetChecked;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return;
        }
        if (entry.value === undefined || entry.value === null) return;
        const nextVal = String(entry.value);
        const elType = el.tagName === 'TEXTAREA' ? 'textarea' : String(el.type || '').toLowerCase();
        const allowEmpty = isReset || el.tagName === 'SELECT' || EMPTY_RESTORABLE_TYPES.has(elType);
        if (nextVal === '' && !allowEmpty) return;
        if (el.value === nextVal) return;
        if (el.tagName === 'SELECT' && !Array.from(el.options).some((o) => o.value === nextVal)) return;
        restoredAny = true;
        if (dryRun) return;
        el.value = nextVal;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      pass1.forEach(applyEntry);
      pass2.forEach(applyEntry);
    }

    if (!isReset && draft.signatures && typeof draft.signatures === 'object' && Object.keys(draft.signatures).length > 0) {
      const hasUnlockedMatch = window.SioSignatureRepoClient?.hasUnlockedCanvasForKeys
        ? window.SioSignatureRepoClient.hasUnlockedCanvasForKeys(draft.signatures)
        : true;
      if (hasUnlockedMatch) {
        if (!dryRun) window.SioSignatureRepoClient?.loadDraftSignatures?.(draft.signatures);
        restoredAny = true;
      }
    }

    return restoredAny;
  }

  function resolveAdapterSavedSlice(adapterKey, adapter, draft) {
    if (draft && draft.adapterState && Object.prototype.hasOwnProperty.call(draft.adapterState, adapterKey)) {
      return { found: true, value: draft.adapterState[adapterKey] };
    }
    const legacy = draft && draft.initialStatePatch;
    if (!legacy || typeof legacy !== 'object') return { found: false, value: undefined };

    if (adapter.kind === 'matrix' && adapter.legacyPatchKey && Array.isArray(legacy[adapter.legacyPatchKey])) {
      return { found: true, value: legacy[adapter.legacyPatchKey] };
    }
    if (typeof adapter.mapLegacyPatch === 'function') {
      const mapped = adapter.mapLegacyPatch(legacy);
      if (mapped !== undefined) return { found: true, value: mapped };
    }
    return { found: false, value: undefined };
  }

  function restoreAdaptersInPlace(draft) {
    let restoredAny = false;
    _stateAdapters.forEach((adapter, key) => {
      try {
        const slice = resolveAdapterSavedSlice(key, adapter, draft);
        if (slice.found) {
          adapter.restore(safeClone(slice.value));
          restoredAny = true;
        }
      } catch (err) {
        console.warn('[OFFLINE ADAPTER RESTORE WARN]', key, err);
      }
    });
    return restoredAny;
  }

  function adaptersDifferFromBaseline(draft, baseline) {
    const baseAdapters = (baseline && baseline.adapterState) || {};
    let differs = false;
    _stateAdapters.forEach((adapter, key) => {
      if (differs) return;
      const slice = resolveAdapterSavedSlice(key, adapter, draft);
      if (!slice.found) return;
      const baseVal = baseAdapters[key];
      if (JSON.stringify(slice.value) !== JSON.stringify(baseVal)) {
        differs = true;
      }
    });
    return differs;
  }

  function draftPatchDiffersFromPage(draft, ctx) {
    const saved = draft && draft.initialStatePatch;
    if (!saved || typeof saved !== 'object') return false;
    const current = scrapeDynamicTablesFromDom(ctx);
    return Object.keys(saved).some((key) => {
      if (!Array.isArray(saved[key])) return false;
      return JSON.stringify(saved[key]) !== JSON.stringify(current[key] ?? []);
    });
  }

  function summarizeDraftContents(draft, baseline) {
    const summary = { fieldsCount: 0, matrixCount: 0, rowsCount: 0, signaturesCount: 0 };
    if (!draft) return summary;

    const baseFields = (baseline && baseline.fields) || {};
    if (draft.fields && typeof draft.fields === 'object') {
      Object.entries(draft.fields).forEach(([key, entry]) => {
        const el = resolveDraftField(key);
        if (!el || isLockedField(el) || isSearchFilterInput(el)) return;
        const baseEntry = baseFields[key];
        if (el.type === 'checkbox' || el.type === 'radio') {
          if (Boolean(entry?.checked) !== Boolean(baseEntry?.checked)) {
            summary.fieldsCount += 1;
          }
        } else if (String(entry?.value ?? '') !== String(baseEntry?.value ?? '')) {
          summary.fieldsCount += 1;
        }
      });
    }

    _stateAdapters.forEach((adapter, key) => {
      const slice = resolveAdapterSavedSlice(key, adapter, draft);
      if (!slice.found || !slice.value) return;
      if (adapter.kind === 'matrix' && Array.isArray(slice.value)) {
        summary.matrixCount += slice.value.length;
      } else if (typeof slice.value === 'object') {
        Object.values(slice.value).forEach((v) => {
          if (Array.isArray(v)) summary.rowsCount += v.length;
        });
      }
    });

    if (draft.signatures && typeof draft.signatures === 'object') {
      summary.signaturesCount = Object.values(draft.signatures).filter(
        (v) => typeof v === 'string' && v.startsWith('data:image/')
      ).length;
    }

    return summary;
  }

  function formatDraftSavedAt(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return 'hora no disponible';
    try {
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      if (sameDay) {
        const timeStr = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `Hoy a las ${timeStr}`;
      }
      return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function markQueuedBadge() {
    const modeBadge = document.getElementById('sioFormatoModeBadge');
    if (modeBadge) {
      modeBadge.textContent = 'GUARDADO EN CACHÉ LOCAL (PENDIENTE DE SINCRONIZACIÓN)';
      modeBadge.className = 'badge badge-gold';
    }
  }

  function restoreInitialModeBadge() {
    const modeBadge = document.getElementById('sioFormatoModeBadge');
    if (modeBadge && _initialModeBadge) {
      modeBadge.textContent = _initialModeBadge.textContent;
      modeBadge.className = _initialModeBadge.className;
    }
  }

  /**
   * Modal superpuesto de decisión de borrador local (reemplaza al antiguo banner incrustado).
   * Devuelve 'continue' (restaurar todo en sitio) o 'discard' (limpiar IndexedDB y empezar de cero).
   */
  async function promptDraftDecision(draft, isQueued, summary = null) {
    const hasSwal = typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function';
    const when = formatDraftSavedAt(draft && draft.updatedAt);
    const nombre = (draft && draft.formatoNombre) || (draft && draft.codigoFormato) || 'este formato';
    const cliente = (draft && draft.cliente) || '';
    const correlativo = (draft && draft.correlativo) || '';

    if (!hasSwal) {
      return window.confirm(`Tiene un borrador pendiente guardado localmente (${when}).\n\nAceptar: continuar donde lo dejó.\nCancelar: empezar uno de nuevo.`)
        ? 'continue'
        : 'discard';
    }

    const chips = [];
    if (summary) {
      if (summary.fieldsCount > 0) {
        chips.push(`<span class="sio-draft-chip"><i class="fas fa-sliders-h"></i> ${summary.fieldsCount} ${summary.fieldsCount === 1 ? 'campo' : 'campos'}</span>`);
      }
      if (summary.matrixCount > 0) {
        chips.push(`<span class="sio-draft-chip"><i class="fas fa-th"></i> ${summary.matrixCount} ${summary.matrixCount === 1 ? 'secuencia' : 'secuencias'}</span>`);
      }
      if (summary.rowsCount > 0) {
        chips.push(`<span class="sio-draft-chip"><i class="fas fa-list-ul"></i> ${summary.rowsCount} ${summary.rowsCount === 1 ? 'registro' : 'registros'}</span>`);
      }
      if (summary.signaturesCount > 0) {
        chips.push(`<span class="sio-draft-chip"><i class="fas fa-signature"></i> ${summary.signaturesCount} ${summary.signaturesCount === 1 ? 'firma' : 'firmas'}</span>`);
      }
    }
    const chipsHtml = chips.length > 0 ? `<div class="sio-draft-chips">${chips.join('')}</div>` : '';

    const queuedNote = isQueued
      ? '<p class="sio-draft-note"><i class="fas fa-cloud-upload-alt"></i> Este formato quedó guardado sin conexión y está pendiente de sincronizar con el servidor.</p>'
      : '';

    const res = await Swal.fire({
      icon: 'info',
      iconHtml: '<i class="fas fa-database"></i>',
      title: 'Borrador local pendiente',
      html: `
        <div class="sio-draft-body">
          <p>Tienes un borrador guardado localmente en este dispositivo para:</p>
          <div class="sio-draft-format">
            <strong>${escapeHtml(nombre)}</strong>
            ${cliente || correlativo ? `<span>${escapeHtml(cliente)}${correlativo ? ' · #' + escapeHtml(correlativo) : ''}</span>` : ''}
          </div>
          <p class="sio-draft-time"><i class="far fa-clock"></i> Guardado: <strong>${escapeHtml(when)}</strong></p>
          ${chipsHtml}
          ${queuedNote}
        </div>`,
      showConfirmButton: true,
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-play-circle"></i> Continuar donde lo dejé',
      cancelButtonText: '<i class="fas fa-rotate-left"></i> Empezar uno de nuevo',
      allowOutsideClick: false,
      allowEscapeKey: false,
      focusConfirm: true,
      buttonsStyling: false,
      customClass: {
        container: 'sio-draft-swal-container',
        popup: 'sio-draft-swal-popup',
        icon: 'sio-draft-swal-icon',
        actions: 'sio-draft-swal-actions',
        confirmButton: 'sio-draft-btn sio-draft-btn-primary sio-draft-btn-continue',
        cancelButton: 'sio-draft-btn sio-draft-btn-secondary sio-draft-btn-new'
      }
    });

    if (res && res.isConfirmed) return 'continue';

    // Solo proceder a descartar si el usuario presionó explícitamente el botón secundario ("Empezar uno de nuevo").
    if (!res || res.dismiss !== Swal.DismissReason.cancel) {
      return 'keep_closed';
    }

    if (isQueued) {
      const sure = await Swal.fire({
        icon: 'warning',
        title: '¿Descartar el formato pendiente?',
        text: 'Este formato aún no se sincroniza con el servidor. Si empieza uno de nuevo, esos datos se perderán.',
        showCancelButton: true,
        confirmButtonText: 'Sí, empezar de nuevo',
        cancelButtonText: 'Volver',
        allowOutsideClick: false,
        allowEscapeKey: false,
        buttonsStyling: false,
        customClass: {
          container: 'sio-draft-swal-container',
          popup: 'sio-draft-swal-popup',
          actions: 'sio-draft-swal-actions',
          confirmButton: 'sio-draft-btn sio-draft-btn-danger sio-draft-btn-confirm-discard',
          cancelButton: 'sio-draft-btn sio-draft-btn-secondary'
        }
      });
      if (!sure || !sure.isConfirmed) return promptDraftDecision(draft, isQueued, summary);
    }
    return 'discard';
  }

  /**
   * "Continuar donde lo dejé": Hidratación completa y profunda en sitio (sin recargar la página).
   * Restaura matrices, tablas dinámicas, aleros, sellos, inputs/selects/radios/checkboxes y firmas.
   */
  function applyDraftInPlace(draft) {
    if (!draft) return;
    _autosaveBlocked = true;
    try {
      restoreAdaptersInPlace(draft);
      restoreFieldsAndSignatures(draft);
    } finally {
      _autosaveBlocked = false;
      _hasUserEdited = true;
    }
  }

  /**
   * "Empezar uno de nuevo": Limpia IndexedDB + espejo legado + cola y deja el formulario
   * limpio en su estado inicial (sin recargar la página y 100% compatible con modo offline).
   */
  async function discardActiveDraftInPlace(baseline) {
    const ctx = readPageContext();
    if (!ctx || !ctx.formatoId) return;
    const draftKey = buildDraftKey(ctx);
    _autosaveBlocked = true;
    if (_draftTimer) {
      clearTimeout(_draftTimer);
      _draftTimer = null;
    }

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

    // Resetear adaptadores (matrices, tablas dinámicas, aleros, sellos) al estado inicial limpio
    _stateAdapters.forEach((adapter, key) => {
      try {
        if (typeof adapter.reset === 'function') {
          adapter.reset();
        } else if (baseline && baseline.adapterState && Object.prototype.hasOwnProperty.call(baseline.adapterState, key)) {
          adapter.restore(safeClone(baseline.adapterState[key]));
        }
      } catch (err) {
        console.warn('[OFFLINE ADAPTER RESET WARN]', key, err);
      }
    });

    // Limpiar firmas no bloqueadas y restaurar controles mutables al estado base limpio
    window.SioSignatureRepoClient?.clearUnlockedSignatures?.();
    if (baseline && baseline.fields) {
      restoreFieldsAndSignatures({ fields: baseline.fields }, { isReset: true });
    }
    SEARCH_FILTER_IDS.forEach((id) => {
      const inp = document.getElementById(id);
      if (inp && inp.value) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    restoreInitialModeBadge();
    _hasUserEdited = false;
    _autosaveBlocked = false;
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
      const eqParsed = (Array.isArray(ciec.equipajePuerta) ? ciec.equipajePuerta : [])
        .map((e) => {
          if (e === null || e === undefined) return null;
          if (typeof e === 'string' || typeof e === 'number') {
            const raw = String(e).trim();
            if (!raw || raw === '0' || raw.toUpperCase() === 'X') return null;
            const wm = raw.match(/^X:(\d+)$/i);
            if (wm) return { sec: wm[1], withdrawn: true };
            return { sec: raw, withdrawn: false };
          }
          const rawVal = String(e.Valor ?? '').trim();
          const rawSec = String(e.Secuencia ?? '').trim();
          const withdrawn = rawVal.toUpperCase() === 'X' || Boolean(e.EstaEliminado) || Boolean(e.anulado);
          const sec = (rawSec && rawSec !== '0' && rawSec.toUpperCase() !== 'X')
            ? rawSec
            : ((rawVal && rawVal !== '0' && rawVal.toUpperCase() !== 'X') ? rawVal : '');
          if (!sec) return null;
          return { sec, withdrawn };
        })
        .filter(Boolean);
      const activeEqPuertaCount = eqParsed.filter((item) => !item.withdrawn).length;
      const equipajePuertaHtml = eqParsed.map((item) => (
        item.withdrawn
          ? `<span style='position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; font-weight: bold; color: #000000; vertical-align: middle;'><span style='position: relative; z-index: 1;'>${escapeHtml(item.sec)}</span><span style='position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: center; z-index: 2; color: red; color: #DC2626; font-family: Arial, "Segoe UI Symbol", sans-serif; font-size: 16px; font-weight: 900; line-height: 1; pointer-events: none;'>✗</span></span>`
          : escapeHtml(item.sec)
      )).join(', ');
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
        TotalEquipajePuerta: activeEqPuertaCount,
        EquipajePuertaHTML: equipajePuertaHtml,
        AlerosText: alerosText,
        Aleros: alerosText,
        TractoristaUnidad: trac,
        Observaciones: ciec.observaciones || ''
      };
    }

    // 5b. Formato EB (*-eb)
    if (formatoId.endsWith('-eb')) {
      const eb = d.ebPayload || d;
      const detallesEb = Array.isArray(eb.detalles) ? eb.detalles : [];
      const totalFilasEb = Math.max(10, Math.ceil(detallesEb.length / 10));
      let activeCountEb = 0;
      const rowsEb = [];
      for (let f = 0; f < totalFilasEb; f++) {
        let cells = '';
        for (let c = 0; c < 10; c++) {
          const item = detallesEb[f * 10 + c];
          let cellInner = '';
          if (item) {
            const isWithdrawn = String(item.Valor || '').trim().toUpperCase() === 'X' || Boolean(item.EstaEliminado) || Boolean(item.anulado);
            const secNum = item.Secuencia !== undefined && item.Secuencia !== null && String(item.Secuencia).trim() !== '' && String(item.Secuencia).trim() !== '0'
              ? String(item.Secuencia).trim()
              : (String(item.Valor || '').trim().toUpperCase() !== 'X' ? String(item.Valor || '').trim() : '');
            if (isWithdrawn) {
              cellInner = secNum
                ? `<span style='color: #000000; position: relative; z-index: 1;'>${escapeHtml(secNum)}</span><span style='position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: center; z-index: 2; color: red; color: #DC2626; font-family: Arial, "Segoe UI Symbol", sans-serif; font-size: 20px; font-weight: 900; line-height: 1; pointer-events: none;'>✗</span>`
                : `<span style='color: red; color: #DC2626; font-size: 16px; font-weight: 900;'>✗</span>`;
            } else if (secNum) {
              activeCountEb++;
              cellInner = `<span style='color: #000000; position: relative; z-index: 1;'>${escapeHtml(secNum)}</span>`;
            }
          }
          cells += `<td style='border: 1.5px solid black; width: 10%; height: 28px; padding: 0; text-align: center; vertical-align: middle; font-weight: bold; font-size: 12px;'><div style='position: relative; width: 100%; height: 28px; display: flex; align-items: center; justify-content: center;'>${cellInner}</div></td>`;
        }
        rowsEb.push(`<tr>${cells}</tr>`);
      }
      const matrizHtmlEb = `<table style='width: 100%; border-collapse: collapse; margin: 10px 0; font-family: Arial, sans-serif; table-layout: fixed;'><tbody>${rowsEb.join('')}</tbody></table>`;
      return {
        ...baseVars,
        Fecha: fechaBase,
        Supervisor: eb.supervisorNombre || baseVars.Supervisor || '',
        Vuelo: vueloNo,
        Operador: eb.nombreOperador || user.usuario || '',
        HoraInicio: extractHHMM(eb.horaInicio),
        MatrizHTML: matrizHtmlEb,
        Correos: eb.correos ?? 0,
        Comat: eb.comat ?? 0,
        EqTransito: eb.eqTransito ?? 0,
        HoraCierre: extractHHMM(eb.horaCierre),
        TotalEquipajes: activeCountEb,
        Observaciones: eb.observaciones || ''
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
      } else {
        const detallesCec = Array.isArray(cec.detalles) ? cec.detalles : [];
        const totalFilasCec = Math.max(10, Math.ceil(detallesCec.length / 10));
        let activeCountCec = 0;
        const rowsCec = [];
        for (let f = 0; f < totalFilasCec; f++) {
          let cells = '';
          for (let c = 0; c < 10; c++) {
            const item = detallesCec[f * 10 + c];
            let cellInner = '';
            if (item) {
              const isWithdrawn = String(item.Valor || '').trim().toUpperCase() === 'X' || Boolean(item.EstaEliminado) || Boolean(item.anulado);
              const secNum = item.Secuencia !== undefined && item.Secuencia !== null && String(item.Secuencia).trim() !== '' && String(item.Secuencia).trim() !== '0'
                ? String(item.Secuencia).trim()
                : (String(item.Valor || '').trim().toUpperCase() !== 'X' ? String(item.Valor || '').trim() : '');
              if (isWithdrawn) {
                cellInner = secNum
                  ? `<span style='color: #000000; position: relative; z-index: 1;'>${escapeHtml(secNum)}</span><span style='position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: center; justify-content: center; z-index: 2; color: red; color: #DC2626; font-family: Arial, "Segoe UI Symbol", sans-serif; font-size: 16px; font-weight: 900; line-height: 1; pointer-events: none;'>✗</span>`
                  : `<span style='color: red; color: #DC2626; font-size: 14px; font-weight: 900;'>✗</span>`;
              } else if (secNum) {
                activeCountCec++;
                cellInner = `<span style='color: #000000; position: relative; z-index: 1;'>${escapeHtml(secNum)}</span>`;
              }
            }
            cells += `<td style='border: 1px solid black; width: 8.5%; height: 20px; padding: 0; text-align: center; vertical-align: middle; font-weight: bold; font-size: 10px;'><div style='position: relative; width: 100%; height: 20px; display: flex; align-items: center; justify-content: center;'>${cellInner}</div></td>`;
          }
          let totalCol = `<td style='border: none; width: 15%;'></td>`;
          if (f === totalFilasCec - 2) {
            totalCol = `<td style='border: 1px solid black; width: 15%; text-align: center; font-weight: bold; font-size: 11px; background-color: #e2e8f0;'>TOTAL</td>`;
          } else if (f === totalFilasCec - 1) {
            totalCol = `<td style='border: 1px solid black; width: 15%; text-align: center; font-weight: bold; font-size: 12px;'>${activeCountCec}</td>`;
          }
          rowsCec.push(`<tr>${cells}${totalCol}</tr>`);
        }
        tablaEmbarqueOut = `<table style='width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10px; table-layout: fixed;'><tbody>${rowsCec.join('')}</tbody></table>`;
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
      markQueuedBadge();
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
                _hasUserEdited = false;
                _autosaveBlocked = true;
                if (_draftTimer) {
                  clearTimeout(_draftTimer);
                  _draftTimer = null;
                }
                try { localStorage.removeItem(MIRROR_PREFIX + dk); } catch (_) {}
                await idbDelete(STORE_DRAFTS, dk).catch(() => {});
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

    const modeBadgeEl = document.getElementById('sioFormatoModeBadge');
    if (modeBadgeEl) {
      _initialModeBadge = {
        textContent: modeBadgeEl.textContent,
        className: modeBadgeEl.className
      };
    }

    prefetchTemplateForActiveFormat();

    const draftKey = buildDraftKey(ctx);
    const queueKey = `${ctx.itinerarioId}::${ctx.formatoId}::${ctx.encabezadoId || 'NEW'}`;
    const savedDraft = await idbGet(STORE_DRAFTS, draftKey).catch(() => null);
    const queuedItem = await idbGet(STORE_QUEUE, queueKey).catch(() => null);

    // Esperar a que todos los scripts formato-*.js terminen de montar DOM, combos, matrices y adaptadores.
    await new Promise((resolve) => setTimeout(resolve, 0));

    _initialBaseline = {
      fields: collectFormFields(),
      adapterState: captureAdaptersState()
    };

    if (savedDraft) {
      const isQueued = Boolean(queuedItem && savedDraft.lastPayload);
      if (isQueued) {
        await generateOfflinePreview(ctx.formatoId, savedDraft.lastPayload).catch(() => {});
        markQueuedBadge();
      }

      const hasRecoverableData = isQueued ||
        restoreFieldsAndSignatures(savedDraft, { dryRun: true }) ||
        adaptersDifferFromBaseline(savedDraft, _initialBaseline) ||
        draftPatchDiffersFromPage(savedDraft, ctx);

      if (hasRecoverableData) {
        const summary = summarizeDraftContents(savedDraft, _initialBaseline);
        const decision = await promptDraftDecision(savedDraft, isQueued, summary);
        if (decision === 'continue') {
          applyDraftInPlace(savedDraft);
          if (isQueued) markQueuedBadge();
          // Normalizar el registro en IndexedDB con adapterState actualizado
          saveCurrentDraft(isQueued ? savedDraft.lastPayload : null, isQueued ? 'queued_offline' : 'draft').catch(() => {});
          if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: 'Borrador local restaurado',
              showConfirmButton: false,
              timer: 2600,
              timerProgressBar: true
            });
          }
        } else if (decision === 'discard') {
          await discardActiveDraftInPlace(_initialBaseline);
          if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'info',
              title: 'Borrador descartado — listo para empezar de nuevo',
              showConfirmButton: false,
              timer: 2400,
              timerProgressBar: true
            });
          }
        }
      }
    }

    _autosaveBlocked = false;

    // Escuchar cambios en tiempo real para autoguardado continuo en IndexedDB
    const main = document.querySelector('main') || document.body;
    main.addEventListener('input', (e) => {
      if (isSearchFilterInput(e.target)) return;
      scheduleDraftSave();
    });
    main.addEventListener('change', (e) => {
      if (isSearchFilterInput(e.target)) return;
      scheduleDraftSave();
    });
    main.addEventListener('sio:signature-change', scheduleDraftSave);
    main.addEventListener('click', (e) => {
      const btn = e.target.closest('button, td[data-cell-index], td[data-pos-id]');
      if (!btn) return;
      if (btn.id && /VistaPreliminar|GuardarDefinitivo|LimpiarBuscador/i.test(btn.id)) return;
      scheduleDraftSave();
    });

    const flushDraftOnLeave = () => {
      if (_autosaveBlocked || !_hasUserEdited) return;
      if (_draftTimer) {
        clearTimeout(_draftTimer);
        _draftTimer = null;
      }
      saveCurrentDraft();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushDraftOnLeave();
      }
    });
    window.addEventListener('pagehide', flushDraftOnLeave);
  });

  window.SioOfflineManager = {
    checkRealConnectivity,
    registerStateAdapter,
    notifyStateChange,
    saveCurrentDraft,
    discardActiveDraft: () => discardActiveDraftInPlace(_initialBaseline),
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
