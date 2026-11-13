/**
 * FormatosController - SIO LAATS Formatos SEC
 * Controlador para la selección, verificación (Reanudar vs Crear Nuevo) y captura de formatos.
 */

const FormatosModel = require('../models/FormatosModel');
const OperacionesService = require('../services/OperacionesService');
const FormatosService = require('../services/FormatosService');

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
        ? existentes.filter(e => (e.TipoFormato || '').toLowerCase() === tipoFormato.toLowerCase())
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

    try {
      const formatoData = await FormatosService.prepararFormato({
        formatoId,
        itinerarioId: vuelo.itinerarioId,
        encabezadoId,
        user: req.session.user
      });

      res.render('formato_detalle', {
        title: `${formatoData.meta.nombre} — ${vuelo.operador}`,
        user: req.session.user,
        vuelo,
        formato: formatoData.meta,
        esNuevo: formatoData.esNuevo,
        encabezadoId: formatoData.encabezadoId,
        datosPrevios: formatoData.datos,
        complementos: formatoData.complementos
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
      const payload = req.body;
      const resultado = await FormatosService.procesarGuardado(payload, req.session.user);
      return res.json(resultado);
    } catch (err) {
      console.error('[API GUARDAR FORMATO ERROR]', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Error al persistir el formato de seguridad.'
      });
    }
  }
}

module.exports = FormatosController;
