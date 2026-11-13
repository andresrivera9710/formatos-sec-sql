/**
 * OperacionesController - SIO LAATS Formatos SEC
 * Consulta interactiva de tarjetas de operaciones e itinerarios de vuelos.
 */

const OperacionesModel = require('../models/OperacionesModel');
const { resolveDepartmentId } = require('../middlewares/auth');

class OperacionesController {
  /**
   * Renderiza la vista principal del tablero de operaciones
   */
  static async renderOperaciones(req, res) {
    try {
      const operadores = await OperacionesModel.obtenerOperadoresAutorizados();
      const aeronaves = await OperacionesModel.obtenerAeronaves();

      res.render('operaciones', {
        title: 'Tarjetas de Operaciones | SIO Formatos SEC',
        user: req.session.user,
        operadores: operadores || [],
        aeronaves: aeronaves || [],
        vueloActivo: req.session.vueloSeleccionado || null
      });
    } catch (err) {
      console.error('[RENDER OPERACIONES ERROR]', err);
      res.render('operaciones', {
        title: 'Tarjetas de Operaciones | SIO Formatos SEC',
        user: req.session.user,
        operadores: [],
        aeronaves: [],
        vueloActivo: null,
        errorMessage: 'Error al cargar el catálogo de operaciones.'
      });
    }
  }

  /**
   * Endpoint API para consultar vuelos/itinerarios por fecha y operador
   */
  static async apiConsultar(req, res) {
    try {
      const { fecha, operadorId, fecha2, requestedDeptId } = req.body;

      if (!fecha) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar al menos una fecha de consulta.'
        });
      }

      const cleanFecha = String(fecha).trim().substring(0, 10);
      const cleanFecha2 = fecha2 && String(fecha2).trim() !== '' ? String(fecha2).trim().substring(0, 10) : null;

      if (cleanFecha2 && cleanFecha2 < cleanFecha) {
        return res.status(400).json({
          success: false,
          message: 'La fecha final del rango no puede ser anterior a la fecha inicial.'
        });
      }

      const parsedOperadorId = parseInt(operadorId, 10);
      if (!Number.isFinite(parsedOperadorId) || parsedOperadorId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar una aerolínea / operador específico para consultar los itinerarios.'
        });
      }

      // Capa 8 Anti-IDOR: Servidor impone el departamento válido
      const departamentoId = resolveDepartmentId(req, requestedDeptId);

      const tarjetas = await OperacionesModel.consultarTarjetasOperaciones({
        fecha: cleanFecha,
        operadorId: parsedOperadorId,
        fecha2: cleanFecha2,
        departamentoId,
        email: req.session.user?.usuario ? `${req.session.user.usuario}@laats.com` : 'operaciones@laats.com'
      });

      return res.json({
        success: true,
        operadorId: parsedOperadorId,
        count: tarjetas.length,
        data: tarjetas
      });
    } catch (err) {
      console.error('[API CONSULTAR OPERACIONES ERROR]', err);
      return res.status(500).json({
        success: false,
        message: 'Error al consultar las tarjetas de operaciones.',
        error: process.env.NODE_ENV === 'production' ? null : err.message
      });
    }
  }

  /**
   * Selecciona una operación de vuelo y la fija en sesión para el llenado de formatos
   */
  static async apiSeleccionar(req, res) {
    try {
      const { itinerarioId, operacion } = req.body;

      if (!itinerarioId && !operacion) {
        return res.status(400).json({
          success: false,
          message: 'Datos de operación no suministrados.'
        });
      }

      let vuelo = operacion;
      if (!vuelo && itinerarioId) {
        vuelo = await OperacionesModel.obtenerItinerarioPorId(parseInt(itinerarioId, 10));
      }

      if (!vuelo) {
        return res.status(404).json({
          success: false,
          message: 'Itinerario de operación no encontrado.'
        });
      }

      // Validación aerolíneas Delta/Avianca (exigen matrícula)
      const opNombre = (vuelo.operador || '').toUpperCase();
      if ((opNombre.includes('DELTA') || opNombre.includes('AVIANCA')) && (!vuelo.Matricula || vuelo.Matricula.trim() === '')) {
        return res.status(400).json({
          success: false,
          message: `Para operaciones de ${vuelo.operador} es obligatorio que el itinerario posea matrícula asignada.`
        });
      }

      req.session.vueloSeleccionado = vuelo;

      return res.json({
        success: true,
        message: 'Operación seleccionada correctamente.',
        redirectUrl: '/formatos',
        vuelo
      });
    } catch (err) {
      console.error('[API SELECCIONAR ERROR]', err);
      return res.status(500).json({
        success: false,
        message: 'Error al seleccionar la operación.'
      });
    }
  }
}

module.exports = OperacionesController;

