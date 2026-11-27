/**
 * SharePointSyncQueueService - SIO LAATS Formatos SEC
 * Orquestador de publicación diferida y automática hacia SharePoint Online cuando
 * una operación pasa de estado PENDIENTE (sin matrícula) a tener matrícula asignada.
 *
 * Persistencia en Azure SQL:
 * - Tabla de control: dbo.SharePointHtmlSync (cero DELETE físico)
 * - Vista de detección: dbo.ListaFormatosSECView (ListoParaPublicar = 1)
 */

const { sql, executeQuery } = require('../config/database');
const OperacionesModel = require('../models/OperacionesModel');
const OperacionesService = require('./OperacionesService');
const FormatosService = require('./FormatosService');
const HtmlPreviewService = require('./HtmlPreviewService');
const SharePointService = require('./SharePointService');

const INVALID_MATRICULA_TOKENS = new Set([
  '',
  'PENDIENTE',
  'NA',
  'N/A',
  'SIN MATRICULA',
  'SIN MATRÍCULA',
  'S/M',
  '--',
  'NULL'
]);

const DEFAULT_WORKER_INTERVAL_MS = 60000;
let _workerTimer = null;
let _isWorkerRunning = false;
const _inFlightItinerarios = new Set();

class SharePointSyncQueueService {
  /**
   * Determina si una tarjeta de operación tiene una matrícula real asignada.
   */
  static tieneMatriculaValida(vuelo = {}) {
    if (!vuelo || typeof vuelo !== 'object') return false;
    const rawMat = String(vuelo.Matricula ?? vuelo.matricula ?? '').trim();
    const upperMat = rawMat.toUpperCase();

    if (INVALID_MATRICULA_TOKENS.has(upperMat)) {
      return false;
    }

    // Si explícitamente viene MatriculaAeronaveId como null sin texto válido, sigue pendiente
    if (vuelo.MatriculaAeronaveId === null && !rawMat) {
      return false;
    }

    return true;
  }

  /**
   * Consulta el estado fresco del itinerario en Azure SQL para evitar depender de matrícula cacheada en sesión.
   */
  static async obtenerEstadoOperacionFresco(itinerarioId, fallbackVuelo = {}) {
    const idNum = parseInt(itinerarioId || fallbackVuelo?.itinerarioId, 10);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return fallbackVuelo || {};
    }

    try {
      const fresh = await OperacionesModel.obtenerItinerarioPorId(idNum);
      if (fresh) {
        return {
          ...(fallbackVuelo || {}),
          ...fresh,
          itinerarioId: fresh.itinerarioId || idNum,
          Matricula: fresh.Matricula ?? null,
          MatriculaAeronaveId: fresh.MatriculaAeronaveId ?? null,
          FechaItinerado: fresh.FechaItinerado || fallbackVuelo?.FechaItinerado || null
        };
      }
    } catch (err) {
      console.warn(`[SHAREPOINT SYNC] No se pudo refrescar Itinerario #${idNum}:`, err.message);
    }

    return fallbackVuelo || {};
  }

  /**
   * Construye vars, meta, nombre oficial y HTML renderizado a partir de un formato hidratado.
   * Reutilizado tanto en guardado inmediato como en publicación diferida/masiva.
   */
  static construirHtmlControlado({
    formatoId,
    vuelo = {},
    user = {},
    hydrated = { datos: [], complementos: [] },
    formDatos = {},
    preview = null,
    preferPersisted = true,
    pendientesSalidaCount = 0,
    encabezadoId = null,
    formatoMeta = null
  } = {}) {
    const catalogoMeta = formatoMeta ||
      hydrated?.meta ||
      OperacionesService.getCatalogoFormatosPorAerolinea().find(f => f.id === formatoId) ||
      null;

    const docNameInfo = HtmlPreviewService.buildDocumentName({
      vuelo,
      formatoMeta: catalogoMeta,
      formatoNombre: catalogoMeta?.nombre || formatoId,
      encabezadoId: encabezadoId || hydrated?.encabezadoId || null
    });

    if (!HtmlPreviewService.hasControlledTemplate(formatoId)) {
      return {
        hasControlledTemplate: false,
        vars: null,
        meta: {},
        documentBaseName: docNameInfo.documentBaseName,
        fileName: docNameInfo.fileName,
        htmlContent: null
      };
    }

    let vars;
    let meta = {};

    if (formatoId.endsWith('-cp')) {
      const basePreview = (preferPersisted && hydrated && hydrated.cpState)
        ? FormatosService.construirPreviewCPDesdeBD({
            hydrated,
            formatoMeta: catalogoMeta,
            vuelo,
            user,
            fallbackPayload: formDatos?.cpPayload || formDatos || {}
          })
        : ((preview && typeof preview === 'object')
          ? preview
          : (formDatos?.cpPayload || formDatos || {}));

      const puerta = vuelo.puertaposicion || '--';
      const horaInicio = basePreview?.horaInicio || '--:--';
      const cpDoc = {
        ...basePreview,
        aerolinea: vuelo.operador || basePreview?.aerolinea || '',
        vuelo: vuelo.novuelo || '--',
        matricula: vuelo.Matricula || 'Pendiente',
        puerta,
        horaInicioPuerta: `${horaInicio} / ${puerta}`
      };

      vars = HtmlPreviewService.buildCpData({ cpDoc, vuelo, user });
      meta = { pendientesSalidaCount: cpDoc.pendientesSalidaCount || pendientesSalidaCount || 0 };
    } else {
      vars = HtmlPreviewService.buildAeromexicoOtherData({
        formatoId,
        formDatos: formDatos || {},
        vuelo,
        user,
        datosPrevios: hydrated.datos || [],
        complementos: hydrated.complementos || [],
        hydrated,
        preferPersisted
      });

      if (formatoId.endsWith('-ciec') || formatoId.endsWith('-anexoa') || formatoId.endsWith('-ccda')) {
        meta = { pendientesSalidaCount: pendientesSalidaCount || 0 };
      }
    }

    const htmlContent = HtmlPreviewService.renderHtmlPreview({
      formatoId,
      vars,
      meta,
      documentTitle: docNameInfo.documentBaseName
    });

    return {
      hasControlledTemplate: true,
      formatoMeta: catalogoMeta,
      vars,
      meta,
      documentBaseName: docNameInfo.documentBaseName,
      fileName: docNameInfo.fileName,
      htmlContent
    };
  }

  /**
   * Registra o actualiza (UPSERT sin DELETE físico) un formato pendiente de publicación o reintento.
   */
  static async registrarPendiente({
    itinerarioId,
    formatoId,
    encabezadoId,
    nombreArchivo = null,
    usuarioRegistro = null,
    errorMsg = null,
    estado = 'PENDIENTE_MATRICULA'
  }) {
    const itiId = parseInt(itinerarioId, 10);
    const encId = parseInt(encabezadoId, 10);
    const fmtId = String(formatoId || '').trim().toLowerCase();
    if (!Number.isInteger(itiId) || itiId <= 0 || !Number.isInteger(encId) || encId <= 0 || !fmtId) {
      return null;
    }

    const safeEstado = ['PENDIENTE_MATRICULA', 'PENDIENTE_REINTENTO'].includes(estado)
      ? estado
      : 'PENDIENTE_MATRICULA';

    const query = `
      IF EXISTS (
        SELECT 1
        FROM dbo.SharePointHtmlSync
        WHERE FormatoId = @formatoId
          AND EncabezadoId = @encabezadoId
          AND ItinerarioId = @itinerarioId
          AND EstaEliminado = 0
      )
      BEGIN
        UPDATE dbo.SharePointHtmlSync
        SET EstadoSync = @estadoSync,
            NombreArchivo = COALESCE(@nombreArchivo, NombreArchivo),
            UsuarioRegistro = COALESCE(@usuarioRegistro, UsuarioRegistro),
            UltimoError = @ultimoError,
            FechaActualizacion = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE FormatoId = @formatoId
          AND EncabezadoId = @encabezadoId
          AND ItinerarioId = @itinerarioId
          AND EstaEliminado = 0;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.SharePointHtmlSync (
          ItinerarioId, FormatoId, EncabezadoId, EstadoSync,
          NombreArchivo, UsuarioRegistro, UltimoError, EstaEliminado
        )
        OUTPUT INSERTED.*
        VALUES (
          @itinerarioId, @formatoId, @encabezadoId, @estadoSync,
          @nombreArchivo, @usuarioRegistro, @ultimoError, 0
        );
      END
    `;

    const result = await executeQuery(query, [
      { name: 'itinerarioId', type: sql.Int, value: itiId },
      { name: 'formatoId', type: sql.NVarChar(40), value: fmtId },
      { name: 'encabezadoId', type: sql.Int, value: encId },
      { name: 'estadoSync', type: sql.NVarChar(30), value: safeEstado },
      { name: 'nombreArchivo', type: sql.NVarChar(300), value: nombreArchivo ? String(nombreArchivo).slice(0, 300) : null },
      { name: 'usuarioRegistro', type: sql.NVarChar(120), value: usuarioRegistro ? String(usuarioRegistro).slice(0, 120) : null },
      { name: 'ultimoError', type: sql.NVarChar(1000), value: errorMsg ? String(errorMsg).slice(0, 1000) : null }
    ]);

    return result.recordset?.[0] || null;
  }

  /**
   * Registra o actualiza (UPSERT sin DELETE físico) la publicación exitosa de un HTML en SharePoint.
   */
  static async registrarPublicado({
    itinerarioId,
    formatoId,
    encabezadoId,
    matricula = null,
    nombreArchivo = null,
    rutaSharePoint = null,
    fileId = null,
    webUrl = null,
    usuarioRegistro = null
  }) {
    const itiId = parseInt(itinerarioId, 10);
    const encId = parseInt(encabezadoId, 10);
    const fmtId = String(formatoId || '').trim().toLowerCase();
    if (!Number.isInteger(itiId) || itiId <= 0 || !Number.isInteger(encId) || encId <= 0 || !fmtId) {
      return null;
    }

    const query = `
      IF EXISTS (
        SELECT 1
        FROM dbo.SharePointHtmlSync
        WHERE FormatoId = @formatoId
          AND EncabezadoId = @encabezadoId
          AND ItinerarioId = @itinerarioId
          AND EstaEliminado = 0
      )
      BEGIN
        UPDATE dbo.SharePointHtmlSync
        SET EstadoSync = N'PUBLICADO',
            MatriculaPublicada = @matricula,
            NombreArchivo = @nombreArchivo,
            RutaSharePoint = @rutaSharePoint,
            SharePointFileId = @fileId,
            SharePointWebUrl = @webUrl,
            UltimoError = NULL,
            UsuarioRegistro = COALESCE(@usuarioRegistro, UsuarioRegistro),
            FechaPublicacion = SYSUTCDATETIME(),
            FechaActualizacion = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE FormatoId = @formatoId
          AND EncabezadoId = @encabezadoId
          AND ItinerarioId = @itinerarioId
          AND EstaEliminado = 0;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.SharePointHtmlSync (
          ItinerarioId, FormatoId, EncabezadoId, EstadoSync,
          MatriculaPublicada, NombreArchivo, RutaSharePoint,
          SharePointFileId, SharePointWebUrl, UsuarioRegistro,
          FechaPublicacion, EstaEliminado
        )
        OUTPUT INSERTED.*
        VALUES (
          @itinerarioId, @formatoId, @encabezadoId, N'PUBLICADO',
          @matricula, @nombreArchivo, @rutaSharePoint,
          @fileId, @webUrl, @usuarioRegistro,
          SYSUTCDATETIME(), 0
        );
      END
    `;

    const result = await executeQuery(query, [
      { name: 'itinerarioId', type: sql.Int, value: itiId },
      { name: 'formatoId', type: sql.NVarChar(40), value: fmtId },
      { name: 'encabezadoId', type: sql.Int, value: encId },
      { name: 'matricula', type: sql.NVarChar(50), value: matricula ? String(matricula).trim().slice(0, 50) : null },
      { name: 'nombreArchivo', type: sql.NVarChar(300), value: nombreArchivo ? String(nombreArchivo).slice(0, 300) : null },
      { name: 'rutaSharePoint', type: sql.NVarChar(500), value: rutaSharePoint ? String(rutaSharePoint).slice(0, 500) : null },
      { name: 'fileId', type: sql.NVarChar(150), value: fileId ? String(fileId).slice(0, 150) : null },
      { name: 'webUrl', type: sql.NVarChar(1000), value: webUrl ? String(webUrl).slice(0, 1000) : null },
      { name: 'usuarioRegistro', type: sql.NVarChar(120), value: usuarioRegistro ? String(usuarioRegistro).slice(0, 120) : null }
    ]);

    return result.recordset?.[0] || null;
  }

  /**
   * Consulta registros en dbo.ListaFormatosSECView para trazabilidad operativa.
   */
  static async consultarCola({ itinerarioId = null, estado = null, soloListos = false, top = 50 } = {}) {
    const limit = Math.min(Math.max(parseInt(top, 10) || 50, 1), 200);
    const params = [{ name: 'topLimit', type: sql.Int, value: limit }];
    const conditions = ['EstaEliminado = 0'];

    if (itinerarioId) {
      conditions.push('ItinerarioId = @itinerarioId');
      params.push({ name: 'itinerarioId', type: sql.Int, value: parseInt(itinerarioId, 10) });
    }
    if (estado) {
      conditions.push('EstadoSync = @estado');
      params.push({ name: 'estado', type: sql.NVarChar(30), value: String(estado).trim().toUpperCase() });
    }
    if (soloListos) {
      conditions.push('ListoParaPublicar = 1');
    }

    const q = `
      SELECT TOP (@topLimit) *
      FROM dbo.ListaFormatosSECView
      WHERE ${conditions.join(' AND ')}
      ORDER BY FechaCreacion ASC, SharePointHtmlSyncId ASC
    `;
    const res = await executeQuery(q, params);
    return res.recordset || [];
  }

  static async _recuperarProcesosEstancados() {
    try {
      await executeQuery(`
        UPDATE dbo.SharePointHtmlSync
        SET EstadoSync = N'PENDIENTE_REINTENTO',
            UltimoError = COALESCE(UltimoError, N'Recuperado automáticamente tras bloqueo prolongado en EN_PROCESO.'),
            FechaActualizacion = SYSUTCDATETIME()
        WHERE EstaEliminado = 0
          AND EstadoSync = N'EN_PROCESO'
          AND FechaActualizacion < DATEADD(MINUTE, -5, SYSUTCDATETIME())
      `, []);
    } catch (err) {
      console.warn('[SHAREPOINT SYNC] No se pudieron recuperar registros EN_PROCESO:', err.message);
    }
  }

  /**
   * Reclama atómicamente un registro pendiente, hidrata el formato desde Azure SQL y lo publica en SharePoint.
   */
  static async publicarRegistroPendiente(syncRow) {
    const syncId = parseInt(syncRow?.SharePointHtmlSyncId, 10);
    if (!Number.isInteger(syncId) || syncId <= 0) {
      return { claimed: false, uploaded: false };
    }

    const claimRes = await executeQuery(`
      UPDATE dbo.SharePointHtmlSync
      SET EstadoSync = N'EN_PROCESO',
          Intentos = Intentos + 1,
          FechaActualizacion = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE SharePointHtmlSyncId = @syncId
        AND EstaEliminado = 0
        AND EstadoSync IN (N'PENDIENTE_MATRICULA', N'PENDIENTE_REINTENTO')
    `, [{ name: 'syncId', type: sql.Int, value: syncId }]);

    const claimed = claimRes.recordset?.[0];
    if (!claimed) {
      return { claimed: false, uploaded: false };
    }

    try {
      const vuelo = await SharePointSyncQueueService.obtenerEstadoOperacionFresco(claimed.ItinerarioId);
      if (!SharePointSyncQueueService.tieneMatriculaValida(vuelo)) {
        await SharePointSyncQueueService.registrarPendiente({
          itinerarioId: claimed.ItinerarioId,
          formatoId: claimed.FormatoId,
          encabezadoId: claimed.EncabezadoId,
          estado: 'PENDIENTE_MATRICULA'
        });
        return { claimed: true, uploaded: false, deferred: true, reason: 'OPERACION_SIN_MATRICULA' };
      }

      const systemUser = {
        usuario: claimed.UsuarioRegistro || 'SISTEMA_SIO',
        nombreCompleto: claimed.UsuarioRegistro || 'SISTEMA_SIO',
        puestoSec: 'SUPERVISOR'
      };

      const hydrated = await FormatosService.prepararFormato({
        formatoId: claimed.FormatoId,
        itinerarioId: claimed.ItinerarioId,
        encabezadoId: claimed.EncabezadoId,
        user: systemUser
      });

      const rendered = SharePointSyncQueueService.construirHtmlControlado({
        formatoId: claimed.FormatoId,
        vuelo,
        user: systemUser,
        hydrated,
        preferPersisted: true,
        encabezadoId: claimed.EncabezadoId
      });

      if (!rendered.hasControlledTemplate || !rendered.htmlContent) {
        await SharePointSyncQueueService.registrarPendiente({
          itinerarioId: claimed.ItinerarioId,
          formatoId: claimed.FormatoId,
          encabezadoId: claimed.EncabezadoId,
          nombreArchivo: rendered.fileName,
          errorMsg: `Formato "${claimed.FormatoId}" sin plantilla HTML controlada disponible.`,
          estado: 'PENDIENTE_REINTENTO'
        });
        return { claimed: true, uploaded: false, error: 'SIN_PLANTILLA_CONTROLADA' };
      }

      const spRes = await SharePointService.uploadControlledFormatHtml({
        vuelo,
        formatoMeta: rendered.formatoMeta,
        formatoId: claimed.FormatoId,
        fileName: rendered.fileName,
        htmlContent: rendered.htmlContent,
        conflictBehavior: 'replace'
      });

      await SharePointSyncQueueService.registrarPublicado({
        itinerarioId: claimed.ItinerarioId,
        formatoId: claimed.FormatoId,
        encabezadoId: claimed.EncabezadoId,
        matricula: vuelo.Matricula,
        nombreArchivo: rendered.fileName,
        rutaSharePoint: spRes.displayPath,
        fileId: spRes.file?.id || null,
        webUrl: spRes.file?.webUrl || null,
        usuarioRegistro: claimed.UsuarioRegistro
      });

      console.log(
        `[SHAREPOINT AUTO-PUBLISH OK] ${claimed.FormatoId} #${claimed.EncabezadoId} (Matrícula: ${vuelo.Matricula}) -> ${spRes.displayPath}`
      );

      return {
        claimed: true,
        uploaded: true,
        itinerarioId: claimed.ItinerarioId,
        formatoId: claimed.FormatoId,
        encabezadoId: claimed.EncabezadoId,
        matricula: vuelo.Matricula,
        displayPath: spRes.displayPath,
        path: spRes.path,
        fileId: spRes.file?.id || null,
        webUrl: spRes.file?.webUrl || null
      };
    } catch (err) {
      console.error(
        `[SHAREPOINT AUTO-PUBLISH ERROR] ${claimed.FormatoId} #${claimed.EncabezadoId} (Itinerario #${claimed.ItinerarioId}):`,
        err.message
      );
      await SharePointSyncQueueService.registrarPendiente({
        itinerarioId: claimed.ItinerarioId,
        formatoId: claimed.FormatoId,
        encabezadoId: claimed.EncabezadoId,
        errorMsg: err.message,
        estado: 'PENDIENTE_REINTENTO'
      }).catch(() => {});

      return {
        claimed: true,
        uploaded: false,
        itinerarioId: claimed.ItinerarioId,
        formatoId: claimed.FormatoId,
        encabezadoId: claimed.EncabezadoId,
        error: err.message
      };
    }
  }

  /**
   * Detecta en dbo.ListaFormatosSECView todos los formatos listos para publicar (con matrícula asignada)
   * y los sube automáticamente a SharePoint.
   */
  static async procesarPendientesListos({ itinerarioId = null, limit = 25 } = {}) {
    const spStatus = SharePointService.getPublicStatus();
    if (!spStatus.enabled) {
      return { skipped: true, reason: 'SHAREPOINT_DISABLED_OR_UNCONFIGURED', totalDetectados: 0, publicados: 0, fallidos: 0, resultados: [] };
    }

    const itiNum = itinerarioId ? parseInt(itinerarioId, 10) : null;
    if (itiNum && _inFlightItinerarios.has(itiNum)) {
      return { skipped: true, reason: 'ITINERARIO_IN_FLIGHT', totalDetectados: 0, publicados: 0, fallidos: 0, resultados: [] };
    }

    if (itiNum) _inFlightItinerarios.add(itiNum);
    try {
      await SharePointSyncQueueService._recuperarProcesosEstancados();
      const pendientes = await SharePointSyncQueueService.consultarCola({
        itinerarioId: itiNum,
        soloListos: true,
        top: limit
      });

      const resultados = [];
      let publicados = 0;
      let fallidos = 0;

      for (const row of pendientes) {
        const res = await SharePointSyncQueueService.publicarRegistroPendiente(row);
        if (res.claimed) {
          resultados.push(res);
          if (res.uploaded) publicados += 1;
          else fallidos += 1;
        }
      }

      return {
        skipped: false,
        totalDetectados: pendientes.length,
        publicados,
        fallidos,
        resultados
      };
    } finally {
      if (itiNum) _inFlightItinerarios.delete(itiNum);
    }
  }

  static async procesarPendientesPorItinerario(itinerarioId, limit = 25) {
    return SharePointSyncQueueService.procesarPendientesListos({ itinerarioId, limit });
  }

  /**
   * Disparo asíncrono no bloqueante para hooks HTTP (/operaciones, /seleccionar, /formatos).
   */
  static triggerAsyncFlushForItinerario(itinerarioId) {
    const itiNum = parseInt(itinerarioId, 10);
    if (!Number.isInteger(itiNum) || itiNum <= 0) return;
    if (!SharePointService.getPublicStatus().enabled) return;

    setImmediate(() => {
      SharePointSyncQueueService.procesarPendientesPorItinerario(itiNum).catch((err) => {
        console.warn(`[SHAREPOINT ASYNC FLUSH WARN] Itinerario #${itiNum}:`, err.message);
      });
    });
  }

  static triggerAsyncFlushPending() {
    if (!SharePointService.getPublicStatus().enabled || _isWorkerRunning) return;

    setImmediate(() => {
      SharePointSyncQueueService.runWorkerCycle().catch((err) => {
        console.warn('[SHAREPOINT ASYNC WORKER WARN]', err.message);
      });
    });
  }

  static async runWorkerCycle() {
    if (_isWorkerRunning) {
      return { skipped: true, reason: 'WORKER_BUSY' };
    }
    _isWorkerRunning = true;
    try {
      return await SharePointSyncQueueService.procesarPendientesListos({ limit: 30 });
    } finally {
      _isWorkerRunning = false;
    }
  }

  /**
   * Inicia el worker periódico ligero para detectar matrículas asignadas fuera de línea/en otro módulo SIO.
   */
  static startWorker(intervalMs = parseInt(process.env.SHAREPOINT_SYNC_INTERVAL_MS, 10) || DEFAULT_WORKER_INTERVAL_MS) {
    if (_workerTimer) return _workerTimer;
    if (!SharePointService.getPublicStatus().enabled) {
      return null;
    }

    const safeInterval = Math.max(10000, intervalMs);
    _workerTimer = setInterval(() => {
      SharePointSyncQueueService.runWorkerCycle().catch((err) => {
        console.warn('[SHAREPOINT WORKER CYCLE WARN]', err.message);
      });
    }, safeInterval);
    if (typeof _workerTimer.unref === 'function') {
      _workerTimer.unref();
    }

    // Primera pasada ligera poco después del arranque
    const bootTimer = setTimeout(() => {
      SharePointSyncQueueService.runWorkerCycle().catch((err) => {
        console.warn('[SHAREPOINT WORKER BOOT WARN]', err.message);
      });
    }, 5000);
    if (typeof bootTimer.unref === 'function') {
      bootTimer.unref();
    }

    console.log(`\x1b[36m✔ [SHAREPOINT WORKER] Activo cada ${Math.round(safeInterval / 1000)}s (vista dbo.ListaFormatosSECView).\x1b[0m`);
    return _workerTimer;
  }

  static stopWorker() {
    if (_workerTimer) {
      clearInterval(_workerTimer);
      _workerTimer = null;
    }
  }
}

module.exports = SharePointSyncQueueService;
