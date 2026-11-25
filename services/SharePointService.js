/**
 * SharePointService - SIO LAATS Formatos SEC
 * Cliente de integración con Microsoft SharePoint Online vía Microsoft Graph API v1.0
 * Autenticación Server-to-Server (OAuth 2.0 Client Credentials) contra Microsoft Entra ID.
 *
 * Recurso Microsoft Graph: 00000003-0000-0000-c000-000000000000
 * Permiso de Aplicación: Sites.ReadWrite.All (9492366f-7969-46a4-8d15-ed1a20078fff)
 * Sitio objetivo: https://laatsnet.sharepoint.com/sites/ArchivosOperativosSEC
 */

const GRAPH_RESOURCE_APP_ID = '00000003-0000-0000-c000-000000000000';
const GRAPH_SITES_READWRITE_ALL_PERMISSION_ID = '9492366f-7969-46a4-8d15-ed1a20078fff';
const DEFAULT_SITE_URL = 'https://laatsnet.sharepoint.com/sites/ArchivosOperativosSEC';
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const SIMPLE_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024; // 4 MiB
const UPLOAD_CHUNK_SIZE_BYTES = 327680 * 10; // ~3.2 MiB (múltiplo obligatorio de 320 KiB)
const TOKEN_REFRESH_BUFFER_MS = 120 * 1000;
const VALID_CONFLICT_BEHAVIORS = new Set(['replace', 'rename', 'fail']);
const ILLEGAL_SP_CHARS_REGEX = /["*:<>?\\|]/;
const SPANISH_MONTHS = Object.freeze([
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]);
const DOCUMENTOS_COMPARTIDOS_ALIASES = new Set([
  'documentos compartidos',
  'documentos',
  'shared documents',
  'documents'
]);

let _tokenCache = null;
let _tokenInFlight = null;
let _siteCache = null;
const _driveCache = new Map();

class SharePointError extends Error {
  constructor(message, { statusCode = 500, code = 'SHAREPOINT_ERROR', graphStatus = null, details = null } = {}) {
    super(message);
    this.name = 'SharePointError';
    this.statusCode = statusCode;
    this.code = code;
    this.graphStatus = graphStatus;
    this.details = details;
  }
}

class SharePointService {
  static get Constants() {
    return {
      GRAPH_RESOURCE_APP_ID,
      GRAPH_SITES_READWRITE_ALL_PERMISSION_ID,
      DEFAULT_SITE_URL,
      GRAPH_BASE_URL,
      SIMPLE_UPLOAD_LIMIT_BYTES
    };
  }

  /**
   * Limpia cachés en memoria (token, sitio y biblioteca/drive).
   */
  static clearCaches() {
    _tokenCache = null;
    _tokenInFlight = null;
    _siteCache = null;
    _driveCache.clear();
  }

  /**
   * Analiza y valida una URL de SharePoint Online para Graph API.
   */
  static parseSiteUrl(siteUrl = DEFAULT_SITE_URL) {
    const raw = String(siteUrl || '').trim();
    if (!raw) {
      throw new SharePointError('SHAREPOINT_SITE_URL no está configurada.', {
        statusCode: 503,
        code: 'SHAREPOINT_NOT_CONFIGURED'
      });
    }

    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_err) {
      throw new SharePointError(`URL de sitio SharePoint inválida: ${raw}`, {
        statusCode: 400,
        code: 'SHAREPOINT_INVALID_SITE_URL'
      });
    }

    if (parsed.protocol !== 'https:') {
      throw new SharePointError('La URL del sitio SharePoint debe usar HTTPS.', {
        statusCode: 400,
        code: 'SHAREPOINT_INVALID_SITE_URL'
      });
    }

    const hostname = parsed.hostname;
    const sitePath = parsed.pathname.replace(/\/+$/, '');
    const graphSiteIdentifier = sitePath && sitePath !== '/'
      ? `${hostname}:${sitePath}`
      : hostname;

    return {
      siteUrl: `https://${hostname}${sitePath || ''}`,
      hostname,
      sitePath: sitePath || '/',
      graphSiteIdentifier
    };
  }

  /**
   * Normaliza una ruta relativa dentro de la biblioteca de documentos evitando path traversal.
   */
  static normalizeRelativePath(rawPath = '', { allowEmpty = true } = {}) {
    const raw = String(rawPath ?? '').trim();
    if (raw.includes('\0')) {
      throw new SharePointError('La ruta contiene caracteres nulos no permitidos.', {
        statusCode: 400,
        code: 'SHAREPOINT_INVALID_PATH'
      });
    }

    const normalized = raw
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\/{2,}/g, '/');

    if (!normalized) {
      if (!allowEmpty) {
        throw new SharePointError('La ruta del archivo o carpeta en SharePoint es requerida.', {
          statusCode: 400,
          code: 'SHAREPOINT_INVALID_PATH'
        });
      }
      return '';
    }

    const segments = normalized.split('/');
    for (const seg of segments) {
      if (!seg || seg === '.' || seg === '..') {
        throw new SharePointError('Ruta relativa inválida (no se permiten segmentos "." ni "..").', {
          statusCode: 400,
          code: 'SHAREPOINT_INVALID_PATH'
        });
      }
      if (ILLEGAL_SP_CHARS_REGEX.test(seg) || seg.endsWith('.')) {
        throw new SharePointError(`Nombre de carpeta o archivo inválido para SharePoint: "${seg}"`, {
          statusCode: 400,
          code: 'SHAREPOINT_INVALID_PATH'
        });
      }
    }

    return segments.join('/');
  }

  /**
   * Sanitiza exclusivamente el nombre de un archivo destino en SharePoint.
   */
  static sanitizeFileName(fileName) {
    const raw = String(fileName ?? '').trim();
    if (!raw || raw.includes('\0') || raw.includes('/') || raw.includes('\\')) {
      throw new SharePointError('El nombre de archivo no es válido.', {
        statusCode: 400,
        code: 'SHAREPOINT_INVALID_FILENAME'
      });
    }
    if (raw === '.' || raw === '..' || ILLEGAL_SP_CHARS_REGEX.test(raw) || raw.endsWith('.')) {
      throw new SharePointError(`Nombre de archivo contiene caracteres prohibidos por SharePoint: "${raw}"`, {
        statusCode: 400,
        code: 'SHAREPOINT_INVALID_FILENAME'
      });
    }
    return raw;
  }

  /**
   * Resuelve el nombre canónico de carpeta para el cliente/aerolínea en SharePoint.
   */
  static resolveClientFolderName({ vuelo = {}, formatoMeta = {}, formatoId = '' } = {}) {
    const rawOperador = String(vuelo?.operador || formatoMeta?.aerolinea || '').trim();
    const upper = rawOperador.toUpperCase();
    const compact = upper.replace(/\s+/g, '');
    const fmtId = String(formatoId || formatoMeta?.id || '').trim().toLowerCase();

    if (upper.includes('AEROMEXICO') || fmtId.startsWith('amx-')) return 'AEROMEXICO';
    if (upper.includes('DELTA') || fmtId.startsWith('dl-')) return 'DELTA';
    if (compact.includes('AIRCANADA') || fmtId.startsWith('ac-')) return 'AIR CANADA';
    if (upper.includes('LATAM') || compact.includes('LANCARGO') || fmtId.startsWith('latam-')) return 'LAN CARGO';
    if (upper.includes('FEDEX') || fmtId.startsWith('fdx-')) return 'FEDEX';
    if (upper.includes('AMERIJET') || fmtId.startsWith('ajt-')) return 'AMERIJET';
    if (upper.includes('ARAJET') || fmtId.startsWith('ara-')) return 'ARAJET';
    if (upper.includes('AVIANCA') || upper.includes('TAMPA') || fmtId.startsWith('ava-')) return 'AVIANCA';

    const sanitized = upper
      .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.\s]+|[.\s]+$/g, '');

    return SharePointService.normalizeRelativePath(sanitized || 'GENERAL', { allowEmpty: false });
  }

  /**
   * Extrae Año (4 dígitos), Mes en español y Fecha completa DD-MM-YYYY desde FechaItinerado
   * usando componentes UTC para evitar desplazamientos por zona horaria en fechas SQL.
   */
  static extractFechaItineradoParts(fechaItinerado) {
    let year;
    let monthIndex;
    let day;

    if (fechaItinerado instanceof Date && !Number.isNaN(fechaItinerado.getTime())) {
      year = fechaItinerado.getUTCFullYear();
      monthIndex = fechaItinerado.getUTCMonth();
      day = fechaItinerado.getUTCDate();
    } else {
      const raw = String(fechaItinerado || '').trim();
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const dmyMatch = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);

      if (isoMatch) {
        year = parseInt(isoMatch[1], 10);
        monthIndex = parseInt(isoMatch[2], 10) - 1;
        day = parseInt(isoMatch[3], 10);
      } else if (dmyMatch) {
        day = parseInt(dmyMatch[1], 10);
        monthIndex = parseInt(dmyMatch[2], 10) - 1;
        year = parseInt(dmyMatch[3], 10);
      } else if (raw) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          year = parsed.getUTCFullYear();
          monthIndex = parsed.getUTCMonth();
          day = parsed.getUTCDate();
        }
      }
    }

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthIndex) ||
      monthIndex < 0 ||
      monthIndex > 11 ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31
    ) {
      const now = new Date();
      year = now.getFullYear();
      monthIndex = now.getMonth();
      day = now.getDate();
    }

    const mesBase = SPANISH_MONTHS[monthIndex];
    const mesUpper = String(process.env.SHAREPOINT_MONTH_CASE || '').trim().toLowerCase() === 'upper';
    const mes = mesUpper ? mesBase.toUpperCase() : mesBase;
    const dd = String(day).padStart(2, '0');
    const mm = String(monthIndex + 1).padStart(2, '0');

    return {
      anio: String(year),
      mes,
      fechaCompleta: `${dd}-${mm}-${year}`
    };
  }

  /**
   * Sanitiza el número de vuelo (ej. 672/673 -> 672-673) para usarlo como carpeta en SharePoint.
   */
  static sanitizeFlightFolderName(rawNoVuelo) {
    const cleaned = String(rawNoVuelo ?? '')
      .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ')
      .replace(/\s*[\\/]+\s*/g, '-')
      .replace(/["*:<>?|]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-{2,}/g, '-')
      .trim()
      .replace(/^[.\-\s]+|[.\-\s]+$/g, '');

    return SharePointService.normalizeRelativePath(cleaned || 'SIN_VUELO', { allowEmpty: false });
  }

  /**
   * Construye la jerarquía dinámica exacta:
   * Documentos Compartidos/{CLIENTE}/{AÑO}/{MES}/{FECHA_COMPLETA}/{NOVUELO}/{NOMBRE_ARCHIVO}.html
   */
  static buildDynamicFormatPath({ vuelo = {}, formatoMeta = {}, formatoId = '', fileName = '' } = {}) {
    const cliente = SharePointService.resolveClientFolderName({ vuelo, formatoMeta, formatoId });
    const fechaSource = vuelo?.FechaItinerado || vuelo?.fechaItinerado || vuelo?.fecha || '';
    const { anio, mes, fechaCompleta } = SharePointService.extractFechaItineradoParts(fechaSource);
    const noVuelo = SharePointService.sanitizeFlightFolderName(vuelo?.novuelo || vuelo?.numeroVuelo || '');

    let safeFileName = SharePointService.sanitizeFileName(fileName || `${formatoId || 'formato'}.html`);
    if (!/\.html?$/i.test(safeFileName)) {
      safeFileName = `${safeFileName}.html`;
    }

    const folderPath = SharePointService.joinPaths(cliente, anio, mes, fechaCompleta, noVuelo);
    const relativeFilePath = SharePointService.joinPaths(folderPath, safeFileName);
    const cfg = SharePointService.getConfig();
    const effectiveRelativePath = cfg.baseFolder
      ? SharePointService.joinPaths(cfg.baseFolder, relativeFilePath)
      : relativeFilePath;

    return {
      cliente,
      anio,
      mes,
      fechaCompleta,
      noVuelo,
      fileName: safeFileName,
      folderPath,
      relativeFilePath,
      displayPath: `Documentos Compartidos/${effectiveRelativePath}`
    };
  }

  static joinPaths(...parts) {
    return parts
      .map(p => SharePointService.normalizeRelativePath(p || '', { allowEmpty: true }))
      .filter(Boolean)
      .join('/');
  }

  static encodeGraphPath(relativePath) {
    const clean = SharePointService.normalizeRelativePath(relativePath, { allowEmpty: true });
    if (!clean) return '';
    return clean.split('/').map(encodeURIComponent).join('/');
  }

  /**
   * Lee y estructura la configuración actual de entorno sin exponer secretos.
   */
  static getConfig() {
    const enabledRaw = String(process.env.SHAREPOINT_ENABLED ?? '').trim().toLowerCase();
    const explicitlyDisabled = enabledRaw === 'false' || enabledRaw === '0' || enabledRaw === 'disabled';

    const tenantId = String(process.env.AZURE_TENANT_ID || process.env.SHAREPOINT_TENANT_ID || '').trim();
    const clientId = String(process.env.AZURE_CLIENT_ID || process.env.SHAREPOINT_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.AZURE_CLIENT_SECRET || process.env.SHAREPOINT_CLIENT_SECRET || '').trim();
    const siteUrl = String(process.env.SHAREPOINT_SITE_URL || DEFAULT_SITE_URL).trim();
    const resourceAppId = String(process.env.SHAREPOINT_RESOURCE_APP_ID || GRAPH_RESOURCE_APP_ID).trim();
    const permissionId = String(process.env.SHAREPOINT_PERMISSION_ID || GRAPH_SITES_READWRITE_ALL_PERMISSION_ID).trim();
    const driveName = String(process.env.SHAREPOINT_DRIVE_NAME || '').trim();
    const baseFolderRaw = String(process.env.SHAREPOINT_BASE_FOLDER || '').trim();
    const baseFolder = baseFolderRaw
      ? SharePointService.normalizeRelativePath(baseFolderRaw, { allowEmpty: true })
      : '';
    const timeoutMs = parseInt(process.env.SHAREPOINT_TIMEOUT_MS, 10) || 20000;

    const missingVars = [];
    if (!tenantId) missingVars.push('AZURE_TENANT_ID');
    if (!clientId) missingVars.push('AZURE_CLIENT_ID');
    if (!clientSecret) missingVars.push('AZURE_CLIENT_SECRET');

    const siteInfo = SharePointService.parseSiteUrl(siteUrl);
    const configured = missingVars.length === 0;
    const enabled = !explicitlyDisabled && configured;

    return {
      configured,
      enabled,
      explicitlyDisabled,
      missingVars,
      tenantId,
      clientId,
      clientSecret,
      siteUrl: siteInfo.siteUrl,
      hostname: siteInfo.hostname,
      sitePath: siteInfo.sitePath,
      graphSiteIdentifier: siteInfo.graphSiteIdentifier,
      resourceAppId,
      permissionId,
      driveName,
      baseFolder,
      timeoutMs,
      cacheKey: `${tenantId}|${clientId}|${resourceAppId}|${siteInfo.graphSiteIdentifier}`
    };
  }

  /**
   * Estado seguro para respuestas API (nunca expone clientSecret ni accessToken).
   */
  static getPublicStatus() {
    const cfg = SharePointService.getConfig();
    return {
      configured: cfg.configured,
      enabled: cfg.enabled,
      explicitlyDisabled: cfg.explicitlyDisabled,
      missingVars: cfg.missingVars,
      tenantIdConfigured: Boolean(cfg.tenantId),
      clientIdConfigured: Boolean(cfg.clientId),
      clientSecretConfigured: Boolean(cfg.clientSecret),
      siteUrl: cfg.siteUrl,
      hostname: cfg.hostname,
      sitePath: cfg.sitePath,
      resourceAppId: cfg.resourceAppId,
      permissionId: cfg.permissionId,
      permissionName: 'Sites.ReadWrite.All',
      driveName: cfg.driveName || null,
      baseFolder: cfg.baseFolder || '/'
    };
  }

  static _assertEnabledConfig() {
    const cfg = SharePointService.getConfig();
    if (cfg.explicitlyDisabled) {
      throw new SharePointError('La integración con SharePoint se encuentra deshabilitada (SHAREPOINT_ENABLED=false).', {
        statusCode: 503,
        code: 'SHAREPOINT_DISABLED'
      });
    }
    if (!cfg.configured) {
      throw new SharePointError(
        `Faltan credenciales de Microsoft Entra para SharePoint: ${cfg.missingVars.join(', ')}.`,
        {
          statusCode: 503,
          code: 'SHAREPOINT_NOT_CONFIGURED',
          details: { missingVars: cfg.missingVars }
        }
      );
    }
    return cfg;
  }

  static _decodeJwtClaims(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch (_err) {
      return null;
    }
  }

  static async _fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new SharePointError(`Tiempo de espera agotado al conectar con Microsoft/SharePoint (${timeoutMs} ms).`, {
          statusCode: 504,
          code: 'SHAREPOINT_TIMEOUT'
        });
      }
      throw new SharePointError(`Error de red al conectar con Microsoft/SharePoint: ${err.message}`, {
        statusCode: 502,
        code: 'SHAREPOINT_NETWORK_ERROR'
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Obtiene y cachea el token OAuth2 Client Credentials para Microsoft Graph.
   */
  static async getAccessToken({ forceRefresh = false } = {}) {
    const cfg = SharePointService._assertEnabledConfig();

    if (
      !forceRefresh &&
      _tokenCache &&
      _tokenCache.cacheKey === cfg.cacheKey &&
      Date.now() < _tokenCache.expiresAtMs - TOKEN_REFRESH_BUFFER_MS
    ) {
      return {
        accessToken: _tokenCache.accessToken,
        expiresAt: new Date(_tokenCache.expiresAtMs).toISOString(),
        roles: _tokenCache.roles,
        appId: _tokenCache.appId
      };
    }

    if (!forceRefresh && _tokenInFlight && _tokenInFlight.cacheKey === cfg.cacheKey) {
      return _tokenInFlight.promise;
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default'
    });

    const requestPromise = (async () => {
      const response = await SharePointService._fetchWithTimeout(
        tokenEndpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        },
        cfg.timeoutMs
      );

      let payload = null;
      try {
        payload = await response.json();
      } catch (_err) {
        payload = null;
      }

      if (!response.ok || !payload || !payload.access_token) {
        const entraError = payload?.error_description || payload?.error || `HTTP ${response.status}`;
        throw new SharePointError(`No se pudo obtener token de Microsoft Entra ID: ${entraError}`, {
          statusCode: 502,
          code: 'ENTRA_AUTH_FAILED',
          graphStatus: response.status,
          details: payload ? { error: payload.error } : null
        });
      }

      const expiresInSec = Math.max(60, parseInt(payload.expires_in, 10) || 3599);
      const expiresAtMs = Date.now() + expiresInSec * 1000;
      const claims = SharePointService._decodeJwtClaims(payload.access_token);
      const roles = Array.isArray(claims?.roles) ? claims.roles : [];
      const appId = claims?.appid || claims?.azp || cfg.clientId;

      _tokenCache = {
        cacheKey: cfg.cacheKey,
        accessToken: payload.access_token,
        expiresAtMs,
        roles,
        appId
      };

      return {
        accessToken: payload.access_token,
        expiresAt: new Date(expiresAtMs).toISOString(),
        roles,
        appId
      };
    })();

    _tokenInFlight = { cacheKey: cfg.cacheKey, promise: requestPromise };
    try {
      return await requestPromise;
    } finally {
      if (_tokenInFlight && _tokenInFlight.promise === requestPromise) {
        _tokenInFlight = null;
      }
    }
  }

  /**
   * Ejecuta una petición autenticada contra Microsoft Graph API con reintento automático ante 401/429/503.
   */
  static async graphRequest(urlOrPath, options = {}) {
    const cfg = SharePointService._assertEnabledConfig();
    const url = urlOrPath.startsWith('https://')
      ? urlOrPath
      : `${GRAPH_BASE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;

    const maxAttempts = 3;
    let forceTokenRefresh = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const tokenInfo = await SharePointService.getAccessToken({ forceRefresh: forceTokenRefresh });
      forceTokenRefresh = false;

      const headers = {
        Authorization: `Bearer ${tokenInfo.accessToken}`,
        Accept: 'application/json',
        ...(options.headers || {})
      };

      const response = await SharePointService._fetchWithTimeout(
        url,
        {
          ...options,
          headers
        },
        cfg.timeoutMs
      );

      if (response.status === 401 && attempt < maxAttempts) {
        _tokenCache = null;
        forceTokenRefresh = true;
        continue;
      }

      if ((response.status === 429 || response.status === 503 || response.status === 504) && attempt < maxAttempts) {
        const retryAfterSec = Math.min(5, parseInt(response.headers.get('retry-after'), 10) || attempt);
        await new Promise(resolve => setTimeout(resolve, retryAfterSec * 250));
        continue;
      }

      if (options.rawResponse) {
        if (!response.ok) {
          await SharePointService._throwGraphResponseError(response);
        }
        return response;
      }

      if (response.status === 204) {
        return null;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const txt = await response.text();
        data = txt ? { raw: txt } : null;
      }

      if (!response.ok) {
        const graphErr = data?.error || {};
        const graphCode = graphErr.code || 'GRAPH_ERROR';
        const graphMsg = graphErr.message || `Error HTTP ${response.status} en Microsoft Graph.`;
        const mappedStatus = response.status === 404
          ? 404
          : (response.status === 400 || response.status === 409 ? response.status : (response.status === 403 ? 403 : 502));

        throw new SharePointError(`Microsoft Graph (${graphCode}): ${graphMsg}`, {
          statusCode: mappedStatus,
          code: graphCode,
          graphStatus: response.status,
          details: graphErr
        });
      }

      return data;
    }

    throw new SharePointError('Se agotaron los reintentos contra Microsoft Graph.', {
      statusCode: 502,
      code: 'GRAPH_MAX_RETRIES'
    });
  }

  static async _throwGraphResponseError(response) {
    let errBody = null;
    try {
      errBody = await response.json();
    } catch (_e) {
      errBody = null;
    }
    const graphErr = errBody?.error || {};
    const graphCode = graphErr.code || 'GRAPH_ERROR';
    const graphMsg = graphErr.message || `Error HTTP ${response.status} en Microsoft Graph.`;
    const mappedStatus = response.status === 404 ? 404 : (response.status === 403 ? 403 : 502);

    throw new SharePointError(`Microsoft Graph (${graphCode}): ${graphMsg}`, {
      statusCode: mappedStatus,
      code: graphCode,
      graphStatus: response.status,
      details: graphErr
    });
  }

  /**
   * Resuelve el sitio de SharePoint (Archivos Operativos SEC) y lo cachea.
   */
  static async resolveSite({ forceRefresh = false } = {}) {
    const cfg = SharePointService._assertEnabledConfig();
    if (!forceRefresh && _siteCache && _siteCache.cacheKey === cfg.cacheKey) {
      return _siteCache.site;
    }

    const encodedIdentifier = cfg.graphSiteIdentifier
      .split('/')
      .map((seg, idx) => (idx === 0 ? seg : encodeURIComponent(seg)))
      .join('/');

    const site = await SharePointService.graphRequest(`/sites/${encodedIdentifier}`);
    const normalized = {
      id: site.id,
      name: site.name,
      displayName: site.displayName || site.name,
      webUrl: site.webUrl
    };

    _siteCache = { cacheKey: cfg.cacheKey, site: normalized };
    return normalized;
  }

  /**
   * Lista las bibliotecas de documentos (drives) disponibles en el sitio.
   */
  static async listDrives() {
    const site = await SharePointService.resolveSite();
    const res = await SharePointService.graphRequest(`/sites/${encodeURIComponent(site.id)}/drives`);
    const drives = Array.isArray(res?.value) ? res.value : [];
    return drives.map(d => ({
      id: d.id,
      name: d.name,
      driveType: d.driveType,
      webUrl: d.webUrl
    }));
  }

  /**
   * Resuelve el Drive (Biblioteca de Documentos) objetivo o el drive por defecto del sitio.
   */
  static async resolveDrive(driveNameOverride = '', { forceRefresh = false } = {}) {
    const cfg = SharePointService._assertEnabledConfig();
    const site = await SharePointService.resolveSite({ forceRefresh });
    const targetName = String(driveNameOverride || cfg.driveName || '').trim();
    const driveCacheKey = `${site.id}|${targetName.toLowerCase()}`;

    if (!forceRefresh && _driveCache.has(driveCacheKey)) {
      return _driveCache.get(driveCacheKey);
    }

    let selectedDrive = null;
    if (targetName) {
      const drives = await SharePointService.listDrives();
      const targetLower = targetName.toLowerCase();
      selectedDrive = drives.find(d => String(d.name || '').trim().toLowerCase() === targetLower);

      if (!selectedDrive && DOCUMENTOS_COMPARTIDOS_ALIASES.has(targetLower)) {
        selectedDrive = drives.find(d => DOCUMENTOS_COMPARTIDOS_ALIASES.has(String(d.name || '').trim().toLowerCase())) ||
          drives.find(d => /\/(Shared%20Documents|Documentos%20compartidos|Documentos)\/?$/i.test(String(d.webUrl || '')));
      }

      if (!selectedDrive) {
        throw new SharePointError(`No se encontró la biblioteca de documentos "${targetName}" en el sitio.`, {
          statusCode: 404,
          code: 'SHAREPOINT_DRIVE_NOT_FOUND',
          details: { availableDrives: drives.map(d => d.name) }
        });
      }
    } else {
      const drive = await SharePointService.graphRequest(`/sites/${encodeURIComponent(site.id)}/drive`);
      selectedDrive = {
        id: drive.id,
        name: drive.name,
        driveType: drive.driveType,
        webUrl: drive.webUrl
      };
    }

    _driveCache.set(driveCacheKey, selectedDrive);
    if (selectedDrive && selectedDrive.name) {
      _driveCache.set(`${site.id}|${String(selectedDrive.name).trim().toLowerCase()}`, selectedDrive);
    }
    return selectedDrive;
  }

  static _resolveEffectivePath(relativePath = '', { ignoreBaseFolder = false, allowEmpty = true } = {}) {
    const cfg = SharePointService.getConfig();
    const cleanRel = SharePointService.normalizeRelativePath(relativePath, { allowEmpty });
    if (ignoreBaseFolder || !cfg.baseFolder) {
      return cleanRel;
    }
    return SharePointService.joinPaths(cfg.baseFolder, cleanRel);
  }

  static _formatDriveItem(item) {
    return {
      id: item.id,
      name: item.name,
      isFolder: Boolean(item.folder),
      size: item.size || 0,
      mimeType: item.file?.mimeType || (item.folder ? 'application/vnd.microsoft.folder' : null),
      webUrl: item.webUrl || null,
      eTag: item.eTag || null,
      createdDateTime: item.createdDateTime || null,
      lastModifiedDateTime: item.lastModifiedDateTime || null,
      childCount: item.folder?.childCount ?? null
    };
  }

  /**
   * Prueba integral de conectividad: Entra OAuth2 + Permisos + Sitio + Drive + Listado raíz.
   */
  static async testConnection({ folderPath = '', driveName = '' } = {}) {
    const tokenInfo = await SharePointService.getAccessToken({ forceRefresh: true });
    const site = await SharePointService.resolveSite({ forceRefresh: true });
    const drives = await SharePointService.listDrives();
    const activeDrive = await SharePointService.resolveDrive(driveName, { forceRefresh: true });

    let folderSample = null;
    let folderWarning = null;
    try {
      const listing = await SharePointService.listFolder(folderPath, { driveName: activeDrive.name, top: 10 });
      folderSample = {
        path: listing.path || '/',
        totalListed: listing.items.length
      };
    } catch (err) {
      folderWarning = err.message;
    }

    const hasReadWriteRole = tokenInfo.roles.length === 0
      ? null
      : tokenInfo.roles.includes('Sites.ReadWrite.All');

    return {
      connected: true,
      auth: {
        tokenAcquired: true,
        expiresAt: tokenInfo.expiresAt,
        appId: tokenInfo.appId,
        roles: tokenInfo.roles,
        hasSitesReadWriteAll: hasReadWriteRole
      },
      site,
      activeDrive,
      availableDrives: drives,
      folderSample,
      folderWarning
    };
  }

  /**
   * Lista archivos y subcarpetas en una ruta de SharePoint.
   */
  static async listFolder(folderPath = '', { driveName = '', top = 200, ignoreBaseFolder = false } = {}) {
    const drive = await SharePointService.resolveDrive(driveName);
    const effectivePath = SharePointService._resolveEffectivePath(folderPath, {
      ignoreBaseFolder,
      allowEmpty: true
    });

    const maxItems = Math.min(Math.max(parseInt(top, 10) || 200, 1), 1000);
    const endpoint = effectivePath
      ? `/drives/${encodeURIComponent(drive.id)}/root:/${SharePointService.encodeGraphPath(effectivePath)}:/children?$top=${maxItems}`
      : `/drives/${encodeURIComponent(drive.id)}/root/children?$top=${maxItems}`;

    const res = await SharePointService.graphRequest(endpoint);
    const items = Array.isArray(res?.value) ? res.value.map(SharePointService._formatDriveItem) : [];

    return {
      drive,
      path: effectivePath || '/',
      items
    };
  }

  /**
   * Obtiene metadatos de un archivo o carpeta por ruta relativa.
   */
  static async getItemMetadata(itemPath, { driveName = '', ignoreBaseFolder = false } = {}) {
    const drive = await SharePointService.resolveDrive(driveName);
    const effectivePath = SharePointService._resolveEffectivePath(itemPath, {
      ignoreBaseFolder,
      allowEmpty: true
    });

    const endpoint = effectivePath
      ? `/drives/${encodeURIComponent(drive.id)}/root:/${SharePointService.encodeGraphPath(effectivePath)}`
      : `/drives/${encodeURIComponent(drive.id)}/root`;

    const item = await SharePointService.graphRequest(endpoint);
    return {
      drive,
      path: effectivePath || '/',
      item: SharePointService._formatDriveItem(item)
    };
  }

  /**
   * Crea recursivamente las carpetas necesarias si aún no existen en la biblioteca.
   */
  static async ensureFolder(folderPath, { driveName = '', ignoreBaseFolder = false } = {}) {
    const drive = await SharePointService.resolveDrive(driveName);
    const effectivePath = SharePointService._resolveEffectivePath(folderPath, {
      ignoreBaseFolder,
      allowEmpty: false
    });

    const segments = effectivePath.split('/');
    let currentPath = '';
    let parentItemId = 'root';
    let lastItem = null;

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const encoded = SharePointService.encodeGraphPath(currentPath);

      try {
        const existing = await SharePointService.graphRequest(
          `/drives/${encodeURIComponent(drive.id)}/root:/${encoded}`
        );
        if (!existing.folder) {
          throw new SharePointError(`La ruta "${currentPath}" existe en SharePoint pero no es una carpeta.`, {
            statusCode: 409,
            code: 'SHAREPOINT_PATH_IS_FILE'
          });
        }
        parentItemId = existing.id;
        lastItem = existing;
      } catch (err) {
        if (err.statusCode !== 404) {
          throw err;
        }

        const createEndpoint = parentItemId === 'root'
          ? `/drives/${encodeURIComponent(drive.id)}/root/children`
          : `/drives/${encodeURIComponent(drive.id)}/items/${encodeURIComponent(parentItemId)}/children`;

        try {
          const created = await SharePointService.graphRequest(createEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: segment,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'fail'
            })
          });
          parentItemId = created.id;
          lastItem = created;
        } catch (createErr) {
          if (createErr.statusCode === 409) {
            const raced = await SharePointService.graphRequest(
              `/drives/${encodeURIComponent(drive.id)}/root:/${encoded}`
            );
            parentItemId = raced.id;
            lastItem = raced;
          } else {
            throw createErr;
          }
        }
      }
    }

    return {
      drive,
      path: effectivePath,
      folder: SharePointService._formatDriveItem(lastItem)
    };
  }

  /**
   * Sube un archivo (Buffer o string) a SharePoint. Soporta simple upload (<= 4 MiB) y sesión chunked (> 4 MiB).
   */
  static async uploadFile({
    folderPath = '',
    fileName,
    content,
    contentType = 'application/octet-stream',
    conflictBehavior = 'replace',
    driveName = '',
    ensureFolders = true,
    ignoreBaseFolder = false
  }) {
    const cleanFileName = SharePointService.sanitizeFileName(fileName);
    const behavior = VALID_CONFLICT_BEHAVIORS.has(conflictBehavior) ? conflictBehavior : 'replace';

    if (content === undefined || content === null) {
      throw new SharePointError('El contenido del archivo es requerido.', {
        statusCode: 400,
        code: 'SHAREPOINT_INVALID_CONTENT'
      });
    }

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const drive = await SharePointService.resolveDrive(driveName);
    const effectiveFolder = SharePointService._resolveEffectivePath(folderPath, {
      ignoreBaseFolder,
      allowEmpty: true
    });

    if (ensureFolders && effectiveFolder) {
      await SharePointService.ensureFolder(effectiveFolder, {
        driveName: drive.name,
        ignoreBaseFolder: true
      });
    }

    const fullPath = SharePointService.joinPaths(effectiveFolder, cleanFileName);
    const encodedFullPath = SharePointService.encodeGraphPath(fullPath);

    let uploadedItem;
    if (buffer.length <= SIMPLE_UPLOAD_LIMIT_BYTES) {
      const endpoint = `/drives/${encodeURIComponent(drive.id)}/root:/${encodedFullPath}:/content?@microsoft.graph.conflictBehavior=${behavior}`;
      uploadedItem = await SharePointService.graphRequest(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType
        },
        body: buffer
      });
    } else {
      uploadedItem = await SharePointService._uploadViaSession({
        driveId: drive.id,
        encodedFullPath,
        buffer,
        conflictBehavior: behavior
      });
    }

    return {
      drive,
      path: fullPath,
      file: SharePointService._formatDriveItem(uploadedItem)
    };
  }

  static async _uploadViaSession({ driveId, encodedFullPath, buffer, conflictBehavior }) {
    const cfg = SharePointService._assertEnabledConfig();
    const sessionRes = await SharePointService.graphRequest(
      `/drives/${encodeURIComponent(driveId)}/root:/${encodedFullPath}:/createUploadSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': conflictBehavior
          }
        })
      }
    );

    const uploadUrl = sessionRes?.uploadUrl;
    if (!uploadUrl) {
      throw new SharePointError('No se recibió uploadUrl al crear sesión de carga en SharePoint.', {
        statusCode: 502,
        code: 'SHAREPOINT_UPLOAD_SESSION_FAILED'
      });
    }

    const totalSize = buffer.length;
    let offset = 0;
    let finalItem = null;

    while (offset < totalSize) {
      const end = Math.min(offset + UPLOAD_CHUNK_SIZE_BYTES, totalSize);
      const chunk = buffer.subarray(offset, end);

      const response = await SharePointService._fetchWithTimeout(
        uploadUrl,
        {
          method: 'PUT',
          headers: {
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`
          },
          body: chunk
        },
        cfg.timeoutMs
      );

      if (!response.ok) {
        await SharePointService._throwGraphResponseError(response);
      }

      if (response.status === 200 || response.status === 201) {
        finalItem = await response.json();
      } else {
        await response.arrayBuffer();
      }
      offset = end;
    }

    return finalItem;
  }

  /**
   * Helper dedicado para publicar un documento HTML generado por SIO en SharePoint.
   */
  static async uploadHtmlFormat({
    folderPath = '',
    fileName,
    htmlContent,
    conflictBehavior = 'replace',
    driveName = '',
    ensureFolders = true,
    ignoreBaseFolder = false
  }) {
    const html = String(htmlContent ?? '');
    if (!html.trim()) {
      throw new SharePointError('El contenido HTML a subir no puede estar vacío.', {
        statusCode: 400,
        code: 'SHAREPOINT_EMPTY_HTML'
      });
    }

    let safeName = SharePointService.sanitizeFileName(fileName);
    if (!/\.html?$/i.test(safeName)) {
      safeName = `${safeName}.html`;
    }

    return SharePointService.uploadFile({
      folderPath,
      fileName: safeName,
      content: Buffer.from(html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      conflictBehavior,
      driveName,
      ensureFolders,
      ignoreBaseFolder
    });
  }

  /**
   * Resuelve consistencia de mayúsculas/capitalización de carpetas de mes existentes en {CLIENTE}/{AÑO}.
   */
  static async _resolveConsistentMonthFolder(pathInfo, { driveName = '' } = {}) {
    try {
      const yearPath = SharePointService.joinPaths(pathInfo.cliente, pathInfo.anio);
      const listing = await SharePointService.listFolder(yearPath, { driveName, top: 50 });
      const monthFolders = (listing.items || []).filter(i => i.isFolder);
      if (monthFolders.length === 0) return pathInfo;

      const existingExact = monthFolders.find(
        f => String(f.name || '').trim().toLowerCase() === pathInfo.mes.toLowerCase()
      );
      if (existingExact) {
        const mesResolved = existingExact.name;
        const folderPath = SharePointService.joinPaths(
          pathInfo.cliente,
          pathInfo.anio,
          mesResolved,
          pathInfo.fechaCompleta,
          pathInfo.noVuelo
        );
        const relativeFilePath = SharePointService.joinPaths(folderPath, pathInfo.fileName);
        const cfg = SharePointService.getConfig();
        const effectiveRelativePath = cfg.baseFolder
          ? SharePointService.joinPaths(cfg.baseFolder, relativeFilePath)
          : relativeFilePath;
        return {
          ...pathInfo,
          mes: mesResolved,
          folderPath,
          relativeFilePath,
          displayPath: `Documentos Compartidos/${effectiveRelativePath}`
        };
      }

      const spanishSet = new Set(SPANISH_MONTHS.map(m => m.toLowerCase()));
      const siblingMonth = monthFolders.find(f => spanishSet.has(String(f.name || '').trim().toLowerCase()));
      if (siblingMonth && siblingMonth.name === siblingMonth.name.toUpperCase()) {
        const mesResolved = pathInfo.mes.toUpperCase();
        const folderPath = SharePointService.joinPaths(
          pathInfo.cliente,
          pathInfo.anio,
          mesResolved,
          pathInfo.fechaCompleta,
          pathInfo.noVuelo
        );
        const relativeFilePath = SharePointService.joinPaths(folderPath, pathInfo.fileName);
        const cfg = SharePointService.getConfig();
        const effectiveRelativePath = cfg.baseFolder
          ? SharePointService.joinPaths(cfg.baseFolder, relativeFilePath)
          : relativeFilePath;
        return {
          ...pathInfo,
          mes: mesResolved,
          folderPath,
          relativeFilePath,
          displayPath: `Documentos Compartidos/${effectiveRelativePath}`
        };
      }
    } catch (_err) {
      // Si {CLIENTE}/{AÑO} aún no existe (404), mantener convención estándar capitalizada.
    }
    return pathInfo;
  }

  /**
   * Publica un formato HTML controlado en la jerarquía dinámica dentro de Documentos Compartidos:
   * Documentos Compartidos/{CLIENTE}/{AÑO}/{MES}/{FECHA_COMPLETA}/{NOVUELO}/{NOMBRE_ARCHIVO}.html
   */
  static async uploadControlledFormatHtml({
    vuelo = {},
    formatoMeta = {},
    formatoId = '',
    fileName = '',
    htmlContent = '',
    conflictBehavior = 'replace',
    driveName = ''
  } = {}) {
    const cfg = SharePointService._assertEnabledConfig();
    const targetDriveName = String(driveName || cfg.driveName || '').trim();

    let pathInfo = SharePointService.buildDynamicFormatPath({
      vuelo,
      formatoMeta,
      formatoId,
      fileName
    });

    pathInfo = await SharePointService._resolveConsistentMonthFolder(pathInfo, {
      driveName: targetDriveName
    });

    const uploadResult = await SharePointService.uploadHtmlFormat({
      folderPath: pathInfo.folderPath,
      fileName: pathInfo.fileName,
      htmlContent,
      conflictBehavior,
      driveName: targetDriveName,
      ensureFolders: true
    });

    return {
      uploaded: true,
      drive: uploadResult.drive,
      path: uploadResult.path,
      displayPath: `Documentos Compartidos/${uploadResult.path}`,
      file: uploadResult.file,
      segments: {
        cliente: pathInfo.cliente,
        anio: pathInfo.anio,
        mes: pathInfo.mes,
        fechaCompleta: pathInfo.fechaCompleta,
        noVuelo: pathInfo.noVuelo,
        fileName: pathInfo.fileName
      }
    };
  }

  /**
   * Descarga el contenido binario y metadatos de un archivo en SharePoint.
   */
  static async downloadFile(filePath, { driveName = '', ignoreBaseFolder = false } = {}) {
    const meta = await SharePointService.getItemMetadata(filePath, { driveName, ignoreBaseFolder });
    if (meta.item.isFolder) {
      throw new SharePointError('La ruta indicada corresponde a una carpeta, no a un archivo.', {
        statusCode: 400,
        code: 'SHAREPOINT_PATH_IS_FOLDER'
      });
    }

    const encoded = SharePointService.encodeGraphPath(meta.path);
    const response = await SharePointService.graphRequest(
      `/drives/${encodeURIComponent(meta.drive.id)}/root:/${encoded}:/content`,
      { rawResponse: true }
    );

    const arrayBuf = await response.arrayBuffer();
    return {
      drive: meta.drive,
      path: meta.path,
      item: meta.item,
      contentType: response.headers.get('content-type') || meta.item.mimeType || 'application/octet-stream',
      buffer: Buffer.from(arrayBuf)
    };
  }

  /**
   * Elimina un archivo o carpeta en SharePoint.
   */
  static async deleteItem(itemPath, { driveName = '', ignoreBaseFolder = false } = {}) {
    const drive = await SharePointService.resolveDrive(driveName);
    const effectivePath = SharePointService._resolveEffectivePath(itemPath, {
      ignoreBaseFolder,
      allowEmpty: false
    });

    const encoded = SharePointService.encodeGraphPath(effectivePath);
    await SharePointService.graphRequest(
      `/drives/${encodeURIComponent(drive.id)}/root:/${encoded}`,
      { method: 'DELETE' }
    );

    return {
      deleted: true,
      drive,
      path: effectivePath
    };
  }
}

module.exports = SharePointService;
module.exports.SharePointError = SharePointError;
