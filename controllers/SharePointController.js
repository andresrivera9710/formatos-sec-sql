/**
 * SharePointController - SIO LAATS Formatos SEC
 * Endpoints API para probar conexión, explorar carpetas/bibliotecas y subir/descargar archivos HTML en SharePoint Online.
 */

const SharePointService = require('../services/SharePointService');
const { SharePointError } = require('../services/SharePointService');
const SharePointSyncQueueService = require('../services/SharePointSyncQueueService');

function handleSharePointError(res, err, contextLabel) {
  console.error(`[${contextLabel}]`, err);

  const isSpError = err instanceof SharePointError || err?.name === 'SharePointError';
  const statusCode = isSpError && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  return res.status(statusCode).json({
    success: false,
    code: err.code || 'SHAREPOINT_ERROR',
    message: isSpError || !isProduction
      ? err.message
      : 'Error al comunicarse con el servicio de SharePoint.',
    ...(isProduction || !err.details ? {} : { details: err.details })
  });
}

class SharePointController {
  /**
   * GET /api/sharepoint/status
   * Devuelve el estado de configuración del servicio SharePoint (sin exponer secretos).
   */
  static async apiStatus(_req, res) {
    try {
      return res.json({
        success: true,
        sharepoint: SharePointService.getPublicStatus()
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT STATUS ERROR');
    }
  }

  /**
   * GET /api/sharepoint/test
   * Prueba real de autenticación contra Microsoft Entra ID y acceso al sitio/drive SharePoint.
   */
  static async apiTestConnection(req, res) {
    try {
      const folderPath = String(req.query.path || '').trim();
      const driveName = String(req.query.drive || '').trim();
      const result = await SharePointService.testConnection({ folderPath, driveName });

      return res.json({
        success: true,
        message: 'Conexión exitosa con Microsoft Entra ID y SharePoint Online.',
        data: result
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT TEST ERROR');
    }
  }

  /**
   * GET /api/sharepoint/drives
   * Lista las bibliotecas de documentos disponibles en el sitio SharePoint.
   */
  static async apiListDrives(_req, res) {
    try {
      const drives = await SharePointService.listDrives();
      return res.json({
        success: true,
        total: drives.length,
        data: drives
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT DRIVES ERROR');
    }
  }

  /**
   * GET /api/sharepoint/files?path=...&drive=...&top=...
   * Lista carpetas y archivos dentro de una ruta relativa del sitio SharePoint.
   */
  static async apiListFiles(req, res) {
    try {
      const folderPath = String(req.query.path || '').trim();
      const driveName = String(req.query.drive || '').trim();
      const top = req.query.top;

      const result = await SharePointService.listFolder(folderPath, { driveName, top });
      return res.json({
        success: true,
        drive: result.drive,
        path: result.path,
        total: result.items.length,
        data: result.items
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT LIST FILES ERROR');
    }
  }

  /**
   * POST /api/sharepoint/folders
   * Body: { path, drive? }
   * Crea recursivamente la carpeta especificada si aún no existe.
   */
  static async apiEnsureFolder(req, res) {
    try {
      const folderPath = String(req.body?.path || '').trim();
      const driveName = String(req.body?.drive || '').trim();

      if (!folderPath) {
        return res.status(400).json({
          success: false,
          code: 'SHAREPOINT_INVALID_PATH',
          message: 'Debe especificar la ruta de carpeta a crear en "path".'
        });
      }

      const result = await SharePointService.ensureFolder(folderPath, { driveName });
      return res.json({
        success: true,
        message: 'Carpeta verificada/creada correctamente en SharePoint.',
        data: result
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT ENSURE FOLDER ERROR');
    }
  }

  /**
   * POST /api/sharepoint/files/upload
   * Body: { folderPath?, fileName, content, isBase64?, contentType?, conflictBehavior?, drive? }
   * Sube un archivo (HTML por defecto u otro binario en base64) a SharePoint.
   */
  static async apiUploadFile(req, res) {
    try {
      const {
        folderPath = '',
        fileName,
        content,
        isBase64 = false,
        contentType = 'text/html; charset=utf-8',
        conflictBehavior = 'replace',
        drive = ''
      } = req.body || {};

      if (!fileName || content === undefined || content === null) {
        return res.status(400).json({
          success: false,
          code: 'SHAREPOINT_INVALID_INPUT',
          message: 'Los campos "fileName" y "content" son obligatorios.'
        });
      }

      const useBase64 = isBase64 === true || isBase64 === 'true';
      const buffer = useBase64
        ? Buffer.from(String(content), 'base64')
        : Buffer.from(String(content), 'utf8');

      const result = await SharePointService.uploadFile({
        folderPath: String(folderPath || '').trim(),
        fileName: String(fileName).trim(),
        content: buffer,
        contentType: String(contentType || 'text/html; charset=utf-8').trim(),
        conflictBehavior,
        driveName: String(drive || '').trim(),
        ensureFolders: true
      });

      return res.status(201).json({
        success: true,
        message: 'Archivo cargado exitosamente en SharePoint.',
        data: result
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT UPLOAD ERROR');
    }
  }

  /**
   * GET /api/sharepoint/files/download?path=...&drive=...&descargar=1
   * Descarga o visualiza un archivo desde SharePoint.
   */
  static async apiDownloadFile(req, res) {
    try {
      const filePath = String(req.query.path || '').trim();
      const driveName = String(req.query.drive || '').trim();
      const asAttachment = req.query.descargar === '1';

      if (!filePath) {
        return res.status(400).json({
          success: false,
          code: 'SHAREPOINT_INVALID_PATH',
          message: 'El parámetro query "path" es obligatorio.'
        });
      }

      const file = await SharePointService.downloadFile(filePath, { driveName });
      const safeName = encodeURIComponent(file.item.name);
      const dispositionType = asAttachment ? 'attachment' : 'inline';

      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `${dispositionType}; filename*=UTF-8''${safeName}`);
      return res.send(file.buffer);
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT DOWNLOAD ERROR');
    }
  }

  /**
   * DELETE /api/sharepoint/files
   * Query o Body: { path, drive? }
   * Elimina un archivo o carpeta de SharePoint (restringido a SUPERVISOR en el router).
   */
  static async apiDeleteItem(req, res) {
    try {
      const itemPath = String(req.body?.path || req.query.path || '').trim();
      const driveName = String(req.body?.drive || req.query.drive || '').trim();

      if (!itemPath) {
        return res.status(400).json({
          success: false,
          code: 'SHAREPOINT_INVALID_PATH',
          message: 'Debe especificar la ruta del elemento a eliminar en "path".'
        });
      }

      const result = await SharePointService.deleteItem(itemPath, { driveName });
      return res.json({
        success: true,
        message: 'Elemento eliminado de SharePoint.',
        data: result
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT DELETE ERROR');
    }
  }

  /**
   * GET /api/sharepoint/pendientes?itinerarioId=...&estado=...&listos=1
   * Consulta la vista dbo.ListaFormatosSECView para monitorear formatos pendientes o publicados.
   */
  static async apiListQueue(req, res) {
    try {
      const itinerarioId = req.query.itinerarioId ? parseInt(req.query.itinerarioId, 10) : null;
      const estado = req.query.estado ? String(req.query.estado).trim() : null;
      const soloListos = req.query.listos === '1';
      const top = req.query.top ? parseInt(req.query.top, 10) : 50;

      const rows = await SharePointSyncQueueService.consultarCola({
        itinerarioId,
        estado,
        soloListos,
        top
      });

      return res.json({
        success: true,
        total: rows.length,
        data: rows
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT LIST QUEUE ERROR');
    }
  }

  /**
   * POST /api/sharepoint/pendientes/procesar
   * Body opcional: { itinerarioId?, limit? }
   * Dispara manualmente el procesamiento de la cola ListaFormatosSECView (ListoParaPublicar = 1).
   */
  static async apiFlushQueue(req, res) {
    try {
      const itinerarioId = req.body?.itinerarioId ? parseInt(req.body.itinerarioId, 10) : null;
      const limit = req.body?.limit ? parseInt(req.body.limit, 10) : 25;

      const summary = await SharePointSyncQueueService.procesarPendientesListos({
        itinerarioId,
        limit
      });

      return res.json({
        success: true,
        ...summary
      });
    } catch (err) {
      return handleSharePointError(res, err, 'SHAREPOINT FLUSH QUEUE ERROR');
    }
  }
}

module.exports = SharePointController;
