/**
 * FormatosController - SIO LAATS Formatos SEC
 * Controlador para la selección, verificación (Reanudar vs Crear Nuevo) y captura de formatos.
 */

const FormatosModel = require('../models/FormatosModel');
const OperacionesService = require('../services/OperacionesService');
const FormatosService = require('../services/FormatosService');
const HtmlPreviewService = require('../services/HtmlPreviewService');
const { resolveDepartmentId } = require('../middlewares/auth');

class FormatosController {
  /**
   * Vista de selección de formatos aplicables a la operación activa
   */
  static async renderFormatos(req, res) {
    const vuelo = req.session.vueloSeleccionado;

    if (!vuelo) {
      return res.redirect('/operaciones');
    }

    try {
      const user = req.session.user;
      const formatosDisponibles = OperacionesService.obtenerFormatosParaAerolinea(
        vuelo.operador,
        user.puestoSec
      );

      // Consulta de formatos ya existentes para este vuelo
      const formatosExistentes = await FormatosModel.obtenerFormatosPorItinerario(vuelo.itinerarioId);

      res.render('formatos', {
        title: `Formatos SEC — ${vuelo.operador} (${vuelo.novuelo})`,
        user,
        vuelo,
        formatos: formatosDisponibles,
        formatosExistentes: formatosExistentes || []
      });
    } catch (err) {
      console.error('[RENDER FORMATOS ERROR]', err);
      res.render('formatos', {
        title: 'Formatos SEC',
        user: req.session.user,
        vuelo,
        formatos: [],
        formatosExistentes: [],
        errorMessage: 'Error al cargar los formatos de la operación.'
      });
    }
  }

  /**
   * Endpoint API para consultar si existen borradores o versiones previas de un formato
   */
  static async apiVerificarExistentes(req, res) {
    try {
      const { itinerarioId, tipoFormato } = req.body;

      if (!itinerarioId) {
        return res.status(400).json({ success: false, message: 'ItinerarioId es requerido.' });
      }

      const existentes = await FormatosModel.obtenerFormatosPorItinerario(parseInt(itinerarioId, 10));
      const filtrados = tipoFormato 
        ? existentes.filter(e => FormatosService.matchesTipoFormato(e.TipoFormato, tipoFormato))
        : existentes;

      return res.json({
        success: true,
        total: filtrados.length,
        requiereDecision: filtrados.length > 0,
        data: filtrados
      });
    } catch (err) {
      console.error('[API VERIFICAR EXISTENTES ERROR]', err);
      return res.status(500).json({ success: false, message: 'Error al verificar formatos existentes.' });
    }
  }

  /**
   * Renderiza el formulario de captura/edición para un formato específico
   */
  static async renderDetalleFormato(req, res) {
    const vuelo = req.session.vueloSeleccionado;
    if (!vuelo) {
      return res.redirect('/operaciones');
    }

    const { formatoId } = req.params;
    const encabezadoId = req.query.encabezadoId ? parseInt(req.query.encabezadoId, 10) : null;
    const forzarNuevo = req.query.nuevo === '1';

    try {
      // Validación Anti-IDOR: verificar departamento de sesión y autorización de formato sobre la aerolínea activa
      resolveDepartmentId(req);
      const formatosAutorizados = OperacionesService.obtenerFormatosParaAerolinea(
        vuelo.operador,
        req.session.user?.puestoSec
      );
      const estaAutorizado = formatosAutorizados.some(f => f.id === formatoId);
      if (!estaAutorizado) {
        console.warn(`[ANTI-IDOR] Usuario ${req.session.user?.usuario} intentó abrir formato '${formatoId}' no autorizado para ${vuelo.operador}`);
        return res.redirect('/formatos');
      }

      const formatoData = await FormatosService.prepararFormato({
        formatoId,
        itinerarioId: vuelo.itinerarioId,
        encabezadoId,
        user: req.session.user,
        forzarNuevo
      });

      res.render('formato_detalle', {
        title: `${formatoData.meta.nombre} — ${vuelo.operador}`,
        user: req.session.user,
        vuelo,
        formato: formatoData.meta,
        esNuevo: formatoData.esNuevo,
        encabezadoId: formatoData.encabezadoId,
        firmasRepo: formatoData.firmasRepo || null,
        datosPrevios: formatoData.datos,
        complementos: formatoData.complementos,
        supervisores: formatoData.supervisores || [],
        usuariosSEC: formatoData.usuariosSEC || [],
        usuariosLogin: formatoData.usuariosLogin || [],
        empleados: formatoData.empleados || [],
        maquinaria: formatoData.maquinaria || [],
        posicionesPO: formatoData.posicionesPO || [],
        cpState: formatoData.cpState || null,
        erState: formatoData.erState || null,
        ebState: formatoData.ebState || null,
        cecState: formatoData.cecState || null,
        ciecState: formatoData.ciecState || null,
        mecdState: formatoData.mecdState || null,
        poState: formatoData.poState || null,
        cfrState: formatoData.cfrState || null,
        rxState: formatoData.rxState || null,
        cllState: formatoData.cllState || null,
        spState: formatoData.spState || null,
        dalState: formatoData.dalState || null,
        selState: formatoData.selState || null,
        assState: formatoData.assState || null,
        anexoAState: formatoData.anexoAState || null,
        anexoBState: formatoData.anexoBState || null,
        liadcState: formatoData.liadcState || null,
        ccdaState: formatoData.ccdaState || null,
        lisaState: formatoData.lisaState || null
      });
    } catch (err) {
      console.error('[RENDER DETALLE FORMATO ERROR]', err);
      res.redirect('/formatos');
    }
  }

  /**
   * Procesa el guardado (persistente o vista preliminar) con soporte idempotente de sincronización Offline-First
   */
  static async apiProcesarGuardado(req, res) {
    try {
      resolveDepartmentId(req);
      const payload = req.body || {};
      const clientMutationId = String(payload.clientMutationId || req.headers['x-sio-mutation-id'] || '').trim();

      if (clientMutationId && req.session?.processedOfflineMutations?.[clientMutationId]) {
        const cachedResult = req.session.processedOfflineMutations[clientMutationId];
        return res.json({
          ...cachedResult,
          idempotentReplay: true
        });
      }

      let vueloSesion = req.session?.vueloSeleccionado || null;
      const isOfflineSync = req.headers['x-sio-offline-sync'] === '1' || Boolean(payload.offlineSync);
      if (isOfflineSync && payload.vueloSnapshot && typeof payload.vueloSnapshot === 'object') {
        const snapItiId = parseInt(payload.vueloSnapshot.itinerarioId || payload.itinerarioId, 10);
        const sessItiId = parseInt(vueloSesion?.itinerarioId, 10);
        if (snapItiId > 0 && snapItiId !== sessItiId) {
          vueloSesion = {
            ...payload.vueloSnapshot,
            itinerarioId: snapItiId
          };
        }
      }

      if (vueloSesion) {
        const formatosAutorizados = OperacionesService.obtenerFormatosParaAerolinea(
          vueloSesion.operador,
          req.session.user?.puestoSec
        );
        const formatoPermitido = formatosAutorizados.some(f => f.id === payload.formatoId);
        if (!formatoPermitido) {
          return res.status(403).json({
            success: false,
            message: 'Acceso denegado: El formato solicitado no corresponde a la aerolínea o perfil activo en su sesión.'
          });
        }
      }

      const resultado = await FormatosService.procesarGuardado(payload, req.session.user, vueloSesion);
      if (!resultado.success) {
        return res.status(resultado.statusCode || 400).json(resultado);
      }

      if (resultado.modo === 'preliminar' || resultado.modo === 'persistido') {
        const formatoId = String(payload?.formatoId || '');
        const vuelo = req.session.vueloSeleccionado || {};
        const esPersistido = resultado.modo === 'persistido';
        const targetEncId = resultado.encabezadoId || payload.encabezadoId || null;
        req.session.formatPreviews = req.session.formatPreviews || {};

        let hydrated = { datos: [], complementos: [] };
        if (targetEncId) {
          try {
            hydrated = await FormatosService.prepararFormato({
              formatoId,
              itinerarioId: vuelo.itinerarioId,
              encabezadoId: targetEncId,
              user: req.session.user
            });
          } catch (err) {
            console.warn('[PREVIEW HYDRATION WARNING]', err.message);
          }
        }
        if (resultado.firmasRepo) {
          hydrated.firmasRepo = resultado.firmasRepo;
        }

        const formatoMetaCatalogo = hydrated?.meta ||
          OperacionesService.getCatalogoFormatosPorAerolinea().find(f => f.id === formatoId) ||
          null;
        const docNameInfo = HtmlPreviewService.buildDocumentName({
          vuelo,
          formatoMeta: formatoMetaCatalogo,
          formatoNombre: resultado.resumen?.formato || formatoId,
          encabezadoId: targetEncId
        });
        resultado.documentoNombre = docNameInfo.fileName;
        resultado.documentoTitulo = docNameInfo.documentBaseName;

        if (HtmlPreviewService.hasControlledTemplate(formatoId)) {
          let vars;
          let meta = {};

          if (formatoId.endsWith('-cp')) {
            const basePreview = (esPersistido && hydrated && hydrated.cpState)
              ? FormatosService.construirPreviewCPDesdeBD({
                  hydrated,
                  formatoMeta: hydrated.meta,
                  vuelo,
                  user: req.session.user,
                  fallbackPayload: payload.datos?.cpPayload || payload.datos || {}
                })
              : (resultado.preview || {});
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
            vars = HtmlPreviewService.buildCpData({
              cpDoc,
              vuelo,
              user: req.session.user
            });
            meta = { pendientesSalidaCount: cpDoc.pendientesSalidaCount || 0 };
          } else {
            vars = HtmlPreviewService.buildAeromexicoOtherData({
              formatoId,
              formDatos: payload.datos || {},
              vuelo,
              user: req.session.user,
              datosPrevios: hydrated.datos || [],
              complementos: hydrated.complementos || [],
              hydrated,
              preferPersisted: esPersistido
            });
            if (formatoId.endsWith('-ciec') || formatoId.endsWith('-anexoa') || formatoId.endsWith('-ccda')) {
              meta = { pendientesSalidaCount: resultado.preview?.pendientesSalidaCount || 0 };
            }
          }

          req.session.formatPreviews[formatoId] = {
            type: 'controlled-html',
            vars,
            meta,
            documentBaseName: docNameInfo.documentBaseName,
            fileName: docNameInfo.fileName
          };
          resultado.previewUrl = `/formatos/${encodeURIComponent(formatoId)}/vista-preliminar`;
        } else if (formatoId.endsWith('-cp')) {
          const basePreview = (esPersistido && hydrated && hydrated.cpState)
            ? FormatosService.construirPreviewCPDesdeBD({
                hydrated,
                formatoMeta: hydrated.meta,
                vuelo,
                user: req.session.user,
                fallbackPayload: payload.datos?.cpPayload || payload.datos || {}
              })
            : (resultado.preview || {});
          const puerta = vuelo.puertaposicion || '--';
          const horaInicio = basePreview?.horaInicio || '--:--';
          const docPreview = {
            ...basePreview,
            aerolinea: vuelo.operador || basePreview?.aerolinea || '',
            vuelo: vuelo.novuelo || '--',
            matricula: vuelo.Matricula || 'Pendiente',
            puerta,
            horaInicioPuerta: `${horaInicio} / ${puerta}`,
            ruta: vuelo.ruta || `${vuelo.origen || '---'} -> ${vuelo.destino || '---'}`
          };

          req.session.formatPreviews[formatoId] = {
            type: 'cp-ejs',
            doc: docPreview,
            documentBaseName: docNameInfo.documentBaseName,
            fileName: docNameInfo.fileName
          };
          resultado.preview = docPreview;
          resultado.previewUrl = `/formatos/${encodeURIComponent(formatoId)}/vista-preliminar`;
        }
      }

      if (clientMutationId && resultado.success) {
        req.session.processedOfflineMutations = req.session.processedOfflineMutations || {};
        const keys = Object.keys(req.session.processedOfflineMutations);
        if (keys.length > 50) {
          delete req.session.processedOfflineMutations[keys[0]];
        }
        req.session.processedOfflineMutations[clientMutationId] = {
          success: true,
          modo: resultado.modo,
          encabezadoId: resultado.encabezadoId || null,
          mensaje: resultado.mensaje || resultado.message || 'Sincronizado exitosamente.',
          previewUrl: resultado.previewUrl || null,
          documentoNombre: resultado.documentoNombre || null,
          documentoTitulo: resultado.documentoTitulo || null,
          firmasRepo: resultado.firmasRepo || null
        };
      }

      if (req.session && typeof req.session.save === 'function') {
        return req.session.save(() => res.json(resultado));
      }
      return res.json(resultado);
    } catch (err) {
      console.error('[API GUARDAR FORMATO ERROR]', err);
      const status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
      return res.status(status).json({
        success: false,
        message: err.message || 'Error al persistir el formato de seguridad.'
      });
    }
  }

  /**
   * Entrega la plantilla controlada HTML (con logos Base64 embebidos) y variables base
   * para pre-cacheo en IndexedDB y renderizado de Vista Preliminar 100% Offline.
   */
  static async apiObtenerPlantillaOffline(req, res) {
    try {
      resolveDepartmentId(req);
      const { formatoId } = req.params;
      const vuelo = req.session?.vueloSeleccionado || {};
      const user = req.session?.user || {};

      const catalogo = OperacionesService.getCatalogoFormatosPorAerolinea();
      const formatoMeta = catalogo.find(f => f.id === formatoId) || null;
      if (!formatoMeta) {
        return res.status(404).json({ success: false, message: 'Formato no encontrado en catálogo.' });
      }

      if (vuelo.operador) {
        const autorizados = OperacionesService.obtenerFormatosParaAerolinea(vuelo.operador, user.puestoSec);
        if (!autorizados.some(f => f.id === formatoId)) {
          return res.status(403).json({ success: false, message: 'Formato no autorizado para la operación activa.' });
        }
      }

      const rawTemplate = HtmlPreviewService.readRawTemplate(formatoId) || '';
      const logoVars = {
        varLogoAeromexico: HtmlPreviewService.getLogoBase64('aeromexico.png'),
        varLogoArajet: HtmlPreviewService.getLogoBase64('arajet.png'),
        varLogoDelta: HtmlPreviewService.getLogoBase64('delta.png'),
        varLogoAirCanada: HtmlPreviewService.getLogoBase64('aircanada.png'),
        varLogoLatam: HtmlPreviewService.getLogoBase64('latam.png'),
        varLogoFedex: HtmlPreviewService.getLogoBase64('fedex.png'),
        varLogoAmerijet: HtmlPreviewService.getLogoBase64('amerijet.png'),
        varImgAvion: HtmlPreviewService.getLogoBase64('avion_anexob.png')
      };

      let templateWithLogos = rawTemplate;
      for (const [varName, b64] of Object.entries(logoVars)) {
        if (!b64) continue;
        const imgDataRegex = new RegExp(`data:image\\/[a-zA-Z0-9+.-]+;base64,\\s*@\\{\\s*variables\\(\\s*'\\s*${varName}\\s*'\\s*\\)\\s*\\}\\s*`, 'gi');
        const bareVarRegex = new RegExp(`@\\{\\s*variables\\(\\s*'\\s*${varName}\\s*'\\s*\\)\\s*\\}\\s*`, 'gi');
        templateWithLogos = templateWithLogos.replace(imgDataRegex, `data:image/png;base64,${b64}`);
        templateWithLogos = templateWithLogos.replace(bareVarRegex, b64);
      }

      const defaultVars = formatoId.endsWith('-cp')
        ? HtmlPreviewService.buildCpData({ cpDoc: {}, vuelo, user })
        : HtmlPreviewService.buildAeromexicoOtherData({ formatoId, formDatos: {}, vuelo, user });

      const docNameInfo = HtmlPreviewService.buildDocumentName({
        vuelo,
        formatoMeta,
        formatoNombre: formatoMeta.nombre,
        encabezadoId: req.query.encabezadoId || null
      });

      res.setHeader('Cache-Control', 'no-cache');
      return res.json({
        success: true,
        formatoId,
        formatoNombre: formatoMeta.nombre,
        aerolinea: formatoMeta.aerolinea,
        documentBaseName: docNameInfo.documentBaseName,
        fileName: docNameInfo.fileName,
        templateHtml: templateWithLogos,
        defaultVars,
        vuelo,
        user: {
          usuario: user.usuario || user.nombreCompleto || '',
          puestoSec: user.puestoSec || ''
        }
      });
    } catch (err) {
      console.error('[API PLANTILLA OFFLINE ERROR]', err);
      return res.status(500).json({ success: false, message: 'No se pudo preparar la plantilla offline.' });
    }
  }

  /**
   * Renderiza la vista preliminar HTML imprimible del formato (HTML controlado o fallback CP).
   * Si no existe aún un snapshot en req.session.formatPreviews (ej. acceso directo o reinicio de instancia en Azure App Service),
   * hidrata automáticamente desde Azure SQL + Repositorio de Firmas y renderiza la plantilla controlada de FormatosHTML/.
   */
  static async renderVistaPreliminarCP(req, res) {
    const { formatoId } = req.params;
    let entry = req.session?.formatPreviews?.[formatoId];

    if (!entry && HtmlPreviewService.hasControlledTemplate(formatoId)) {
      try {
        const vuelo = req.session?.vueloSeleccionado || {};
        const user = req.session?.user || {};
        if (vuelo.operador) {
          const autorizados = OperacionesService.obtenerFormatosParaAerolinea(vuelo.operador, user.puestoSec);
          if (!autorizados.some(f => f.id === formatoId)) {
            return res.redirect('/formatos');
          }
        }

        const targetEncId = req.query.encabezadoId ? parseInt(req.query.encabezadoId, 10) : null;
        let hydrated = { datos: [], complementos: [] };
        if (vuelo.itinerarioId) {
          try {
            hydrated = await FormatosService.prepararFormato({
              formatoId,
              itinerarioId: vuelo.itinerarioId,
              encabezadoId: targetEncId,
              user
            });
          } catch (hydErr) {
            console.warn('[DIRECT PREVIEW HYDRATION WARNING]', hydErr.message);
          }
        }

        const formatoMetaCatalogo = hydrated?.meta ||
          OperacionesService.getCatalogoFormatosPorAerolinea().find(f => f.id === formatoId) ||
          null;
        const docNameInfo = HtmlPreviewService.buildDocumentName({
          vuelo,
          formatoMeta: formatoMetaCatalogo,
          formatoNombre: formatoMetaCatalogo?.nombre || formatoId,
          encabezadoId: hydrated?.encabezadoId || targetEncId || null
        });

        let vars;
        let meta = {};
        if (formatoId.endsWith('-cp')) {
          const basePreview = hydrated && hydrated.cpState
            ? FormatosService.construirPreviewCPDesdeBD({
                hydrated,
                formatoMeta: formatoMetaCatalogo,
                vuelo,
                user,
                fallbackPayload: {}
              })
            : {};
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
          meta = { pendientesSalidaCount: cpDoc.pendientesSalidaCount || 0 };
        } else {
          vars = HtmlPreviewService.buildAeromexicoOtherData({
            formatoId,
            formDatos: {},
            vuelo,
            user,
            datosPrevios: hydrated.datos || [],
            complementos: hydrated.complementos || [],
            hydrated,
            preferPersisted: true
          });
        }

        entry = {
          type: 'controlled-html',
          vars,
          meta,
          documentBaseName: docNameInfo.documentBaseName,
          fileName: docNameInfo.fileName
        };
      } catch (err) {
        console.error('[DIRECT PREVIEW RENDER ERROR]', err);
      }
    }

    if (!entry) {
      return res.redirect(`/formatos/${encodeURIComponent(formatoId)}`);
    }

    let documentBaseName = entry.documentBaseName || '';
    let fileName = entry.fileName || '';
    if (!documentBaseName || !fileName) {
      const formatoMeta = OperacionesService.getCatalogoFormatosPorAerolinea().find(f => f.id === formatoId) || null;
      const fallback = HtmlPreviewService.buildDocumentName({
        vuelo: req.session?.vueloSeleccionado || {},
        formatoMeta,
        formatoNombre: formatoId,
        encabezadoId: entry.doc?.encabezadoId || null
      });
      documentBaseName = fallback.documentBaseName;
      fileName = fallback.fileName;
    }

    const asAttachment = req.query.descargar === '1';

    if (entry.type === 'controlled-html') {
      const html = HtmlPreviewService.renderHtmlPreview({
        formatoId,
        vars: entry.vars,
        meta: entry.meta,
        documentTitle: documentBaseName
      });
      if (!html) {
        return res.redirect(`/formatos/${encodeURIComponent(formatoId)}`);
      }
      res.setHeader('Content-Disposition', HtmlPreviewService.buildContentDispositionHeader(fileName, asAttachment));
      return res.type('html').send(html);
    }

    const doc = entry.doc;
    res.setHeader('Content-Disposition', HtmlPreviewService.buildContentDispositionHeader(fileName, asAttachment));
    res.render('formato_cp_preview', {
      title: documentBaseName || `Vista Preliminar — ${doc.formatoNombre} | ${doc.aerolinea}`,
      user: req.session.user,
      doc
    });
  }
}

module.exports = FormatosController;

