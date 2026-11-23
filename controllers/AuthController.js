/**
 * AuthController - SIO LAATS Formatos SEC
 * Manejo seguro de autenticación por PIN, asignación de sesión y verificación de versión.
 */

const LoginModel = require('../models/LoginModel');
const { setNoCacheHeaders } = require('../middlewares/auth');

class AuthController {
  /**
   * Muestra la pantalla de inicio de sesión
   */
  static async renderLogin(req, res) {
    setNoCacheHeaders(res);

    if (req.session && req.session.user) {
      return res.redirect('/operaciones');
    }

    try {
      const versionInfo = await LoginModel.verificarVersion();
      res.render('login', {
        title: 'Iniciar Sesión | SIO Formatos SEC',
        version: versionInfo.Version || 'v1.0.9',
        errorMessage: null
      });
    } catch (err) {
      console.warn('[LOGIN VIEW ERROR]', err.message);
      res.render('login', {
        title: 'Iniciar Sesión | SIO Formatos SEC',
        version: 'v1.0.9',
        errorMessage: null
      });
    }
  }

  /**
   * Procesa la autenticación por PIN (AJAX o POST tradicional)
   */
  static async postLogin(req, res) {
    setNoCacheHeaders(res);
    const rawPin = (typeof req.body?.pin === 'string' || typeof req.body?.pin === 'number')
      ? String(req.body.pin).trim()
      : '';
    const isApiRequest = req.xhr || req.path.startsWith('/api') || (req.headers.accept && req.headers.accept.includes('application/json'));

    if (!rawPin) {
      const msg = 'El PIN es obligatorio para iniciar sesión.';
      if (isApiRequest) return res.status(400).json({ success: false, message: msg });
      return res.render('login', { title: 'Iniciar Sesión', version: 'v1.0.9', errorMessage: msg });
    }

    if (rawPin.length > 50 || /[\x00-\x1F\x7F]/.test(rawPin)) {
      const msg = 'El PIN de acceso ingresado tiene un formato o longitud no válida.';
      if (isApiRequest) return res.status(400).json({ success: false, message: msg });
      return res.render('login', { title: 'Iniciar Sesión', version: 'v1.0.9', errorMessage: msg });
    }

    try {
      // 1ERA VALIDACIÓN: Existe en LogIn por PIN alfanumérico (insensible a mayúsculas/minúsculas)
      const usuarioLogin = await LoginModel.buscarPorPin(rawPin);

      if (!usuarioLogin) {
        const msg = 'PIN no encontrado. Por favor comuníquese con el departamento de IT.';
        if (isApiRequest) return res.status(401).json({ success: false, message: msg });
        return res.render('login', { title: 'Iniciar Sesión', version: 'v1.0.9', errorMessage: msg });
      }

      // 2DA VALIDACIÓN: Verificar autorización en LoginSEC
      const registroSEC = await LoginModel.buscarUsuarioSEC(usuarioLogin.Usuario);

      if (!registroSEC) {
        const msg = 'Usuario sin permisos en el módulo de Seguridad Operacional (SEC). Comuníquese con IT o su Supervisor.';
        if (isApiRequest) return res.status(403).json({ success: false, message: msg });
        return res.render('login', { title: 'Iniciar Sesión', version: 'v1.0.9', errorMessage: msg });
      }

      // 3ERA VALIDACIÓN: Datos de Empleado y Departamento
      const datosEmpleado = await LoginModel.obtenerDatosEmpleado(usuarioLogin.EmpleadoId);

      // Asignación de sesión segura
      req.session.user = {
        loginId: usuarioLogin.LoginId || registroSEC.LoginId || null,
        usuario: usuarioLogin.Usuario,
        empleadoId: usuarioLogin.EmpleadoId,
        nombreCompleto: datosEmpleado?.Nombre || usuarioLogin.Usuario,
        puestoSec: registroSEC.Puesto || 'AGENTE',
        departamentoId: datosEmpleado?.DepartamentoId || 5,
        departamentoInternoId: datosEmpleado?.DepartamentoInternoId || 5,
        departamentoNombre: datosEmpleado?.DepartamentoNombre || 'E8. SEGURIDAD AEROPORTUARIA'
      };

      // Persistir explícitamente la sesión antes de responder para evitar condiciones de carrera en redirecciones
      await new Promise((resolve, reject) => {
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
      });

      if (isApiRequest) {
        return res.json({
          success: true,
          message: '¡Sesión exitosa! Bienvenido a SIO Formatos SEC.',
          redirectUrl: '/operaciones',
          user: req.session.user
        });
      }

      return res.redirect('/operaciones');
    } catch (err) {
      console.error('[AUTH ERROR]', err);
      const msg = 'Ocurrió un error al procesar las credenciales. Verifique la conexión con el servidor.';
      if (isApiRequest) return res.status(500).json({ success: false, message: msg });
      return res.render('login', { title: 'Iniciar Sesión', version: 'v1.0.9', errorMessage: msg });
    }
  }

  /**
   * Verificación ligera de vigencia de sesión (usada tras restauraciones BFCache)
   */
  static sessionCheck(req, res) {
    setNoCacheHeaders(res);
    return res.json({
      authenticated: Boolean(req.session && req.session.user)
    });
  }

  /**
   * Cierra la sesión activa con invalidación estricta de caché y cookie
   */
  static logout(req, res) {
    setNoCacheHeaders(res);
    const isProduction = process.env.NODE_ENV === 'production';

    const finalizeLogout = () => {
      res.clearCookie('sio_session', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction
      });
      return res.redirect('/login');
    };

    if (!req.session) {
      return finalizeLogout();
    }

    req.session.destroy(err => {
      if (err) console.error('[LOGOUT ERROR]', err);
      finalizeLogout();
    });
  }
}

module.exports = AuthController;

