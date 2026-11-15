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
        liadcState: formatoData.liadcState || null
      });
    } catch (err) {
      console.error('[RENDER DETALLE FORMATO ERROR]', err);
      res.redirect('/formatos');
    }
  }

  /**
   * Procesa el guardado (persistente o vista preliminar)
   */
  static async apiProcesarGuardado(req, res) {
    try {
      resolveDepartmentId(req);
      const payload = req.body || {};
      const vueloSesion = req.session?.vueloSeleccionado || null;

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

      if (resultado.modo === 'preliminar') {
        const formatoId = String(payload?.formatoId || '');
        const vuelo = req.session.vueloSeleccionado || {};
        req.session.formatPreviews = req.session.formatPreviews || {};

        if (HtmlPreviewService.hasControlledTemplate(formatoId)) {
          let vars;
          let meta = {};

          if (formatoId.endsWith('-cp')) {
            const puerta = vuelo.puertaposicion || '--';
            const horaInicio = resultado.preview?.horaInicio || '--:--';
            const cpDoc = {
              ...resultado.preview,
              aerolinea: vuelo.operador || resultado.preview?.aerolinea || '',
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
            let hydrated = { datos: [], complementos: [] };
            if (payload.encabezadoId) {
              try {
                hydrated = await FormatosService.prepararFormato({
                  formatoId,
                  itinerarioId: vuelo.itinerarioId,
                  encabezadoId: payload.encabezadoId,
                  user: req.session.user
                });
              } catch (err) {
                console.warn('[PREVIEW HYDRATION WARNING]', err.message);
              }
            }
            vars = HtmlPreviewService.buildAeromexicoOtherData({
              formatoId,
              formDatos: payload.datos || {},
              vuelo,
              user: req.session.user,
              datosPrevios: hydrated.datos || [],
              complementos: hydrated.complementos || [],
              hydrated
            });
            if (formatoId.endsWith('-ciec') || formatoId.endsWith('-anexoa')) {
              meta = { pendientesSalidaCount: resultado.preview?.pendientesSalidaCount || 0 };
            }
          }

          req.session.formatPreviews[formatoId] = {
            type: 'controlled-html',
            vars,
            meta
          };
          resultado.previewUrl = `/formatos/${encodeURIComponent(formatoId)}/vista-preliminar`;
        } else if (formatoId.endsWith('-cp')) {
          const puerta = vuelo.puertaposicion || '--';
          const horaInicio = resultado.preview?.horaInicio || '--:--';
          const docPreview = {
            ...resultado.preview,
            aerolinea: vuelo.operador || resultado.preview?.aerolinea || '',
            vuelo: vuelo.novuelo || '--',
            matricula: vuelo.Matricula || 'Pendiente',
            puerta,
            horaInicioPuerta: `${horaInicio} / ${puerta}`,
            ruta: vuelo.ruta || `${vuelo.origen || '---'} -> ${vuelo.destino || '---'}`
          };

          req.session.formatPreviews[formatoId] = {
            type: 'cp-ejs',
            doc: docPreview
          };
          resultado.preview = docPreview;
          resultado.previewUrl = `/formatos/${encodeURIComponent(formatoId)}/vista-preliminar`;
        }
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
   * Renderiza la vista preliminar HTML imprimible del formato (HTML controlado o fallback CP).
   */
  static async renderVistaPreliminarCP(req, res) {
    const { formatoId } = req.params;
    const entry = req.session?.formatPreviews?.[formatoId];

    if (!entry) {
      return res.redirect(`/formatos/${encodeURIComponent(formatoId)}`);
    }

    if (entry.type === 'controlled-html') {
      const html = HtmlPreviewService.renderHtmlPreview({
        formatoId,
        vars: entry.vars,
        meta: entry.meta
      });
      if (!html) {
        return res.redirect(`/formatos/${encodeURIComponent(formatoId)}`);
      }
      return res.type('html').send(html);
    }

    const doc = entry.doc;
    res.render('formato_cp_preview', {
      title: `Vista Preliminar — ${doc.formatoNombre} | ${doc.aerolinea}`,
      user: req.session.user,
      doc
    });
  }
}

module.exports = FormatosController;

