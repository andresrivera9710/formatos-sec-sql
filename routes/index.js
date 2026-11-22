/**
 * Enrutador Central - SIO LAATS Formatos SEC
 * Arquitectura de Rutas Públicas -> Barrera Global requireAuth -> Rutas Privadas / APIs
 */

const express = require('express');
const router = express.Router();

const AuthController = require('../controllers/AuthController');
const OperacionesController = require('../controllers/OperacionesController');
const FormatosController = require('../controllers/FormatosController');

const { requireAuth, verifyHoneypot } = require('../middlewares/auth');
const { loginLimiter, apiLimiter } = require('../middlewares/rateLimiter');

// ============================================================================
// 1. RUTAS PÚBLICAS (Sin autenticación requerida)
// ============================================================================
router.get('/login', AuthController.renderLogin);
router.post('/login', loginLimiter, verifyHoneypot, AuthController.postLogin);
router.get('/logout', AuthController.logout);

// ============================================================================
// 2. BARRERA GLOBAL DE SEGURIDAD (Capa 7 de Seguridad)
// ============================================================================
router.use(requireAuth);

// ============================================================================
// 3. RUTAS PROTEGIDAS (SSR y Acciones de Usuario)
// ============================================================================

// Redirección base al dashboard de operaciones
router.get('/', (req, res) => res.redirect('/operaciones'));

// Tablero de Operaciones e Itinerarios
router.get('/operaciones', OperacionesController.renderOperaciones);
router.post('/api/operaciones/consultar', apiLimiter, OperacionesController.apiConsultar);
router.post('/api/operaciones/seleccionar', apiLimiter, OperacionesController.apiSeleccionar);

// Selección y captura de Formatos SEC
router.get('/formatos', FormatosController.renderFormatos);
router.post('/api/formatos/verificar', apiLimiter, FormatosController.apiVerificarExistentes);
router.get('/formatos/:formatoId/vista-preliminar', FormatosController.renderVistaPreliminarCP);
router.get('/formatos/:formatoId', FormatosController.renderDetalleFormato);
router.get('/api/offline/plantilla/:formatoId', apiLimiter, FormatosController.apiObtenerPlantillaOffline);
router.post('/api/formatos/procesar', apiLimiter, FormatosController.apiProcesarGuardado);
router.post('/api/formatos/guardar', apiLimiter, FormatosController.apiProcesarGuardado);

module.exports = router;

