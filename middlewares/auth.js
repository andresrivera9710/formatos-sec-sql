/**
 * Middlewares de Autenticación, Honeypot y Aislamiento Departamental (Anti-IDOR)
 * Estándar de Seguridad SIO LAATS (Capas 6, 7 y 8)
 */

/**
 * Aplica cabeceras anti-caché estrictas para evitar que navegadores móviles/web
 * almacenen vistas protegidas o de sesión en HTTP cache o BFCache.
 */
function setNoCacheHeaders(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Vary': 'Cookie'
  });
}

/**
 * Barrera Global de Autenticación Dual (HTML + JSON)
 * Protege todas las rutas privadas. Si no hay sesión, redirige a /login (vistas)
 * o devuelve 401 JSON (APIs / Fetch).
 */
function requireAuth(req, res, next) {
  setNoCacheHeaders(res);

  if (req.session && req.session.user) {
    // Inyecta datos del usuario a nivel de vistas locales EJS
    res.locals.currentUser = req.session.user;
    return next();
  }

  const isApiRequest = req.xhr || 
    req.path.startsWith('/api') || 
    (req.headers.accept && req.headers.accept.includes('application/json'));

  if (isApiRequest) {
    return res.status(401).json({
      success: false,
      message: 'Sesión expirada o no autorizada. Por favor inicie sesión nuevamente.'
    });
  }

  // Redirección para navegación web tradicional
  return res.redirect('/login');
}

/**
 * Honeypot Anti-Bots en Formularios
 * Campo invisible en el frontend (hp_token_website). Si viene con texto,
 * significa que fue completado por un bot automatizado.
 */
function verifyHoneypot(req, res, next) {
  // En desarrollo o localhost, no bloquear por autofill de navegadores
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const honeypot = req.body.hp_token_website;
  if (honeypot && honeypot.trim() !== '') {
    console.warn(`[HONEYPOT TRIGGERED] Intento de bot detectado desde IP: ${req.ip}`);
    // Respondemos con error genérico para despistar al bot sin tocar la base de datos
    return res.status(400).json({
      success: false,
      message: 'Petición rechazada por filtros de seguridad.'
    });
  }
  next();
}

/**
 * Control Anti-IDOR (Aislamiento Departamental en Servidor)
 * El servidor NUNCA confía ciegamente en el departamento enviado por el cliente.
 * Si el usuario es operativo, se impone siempre su departamento asignado en sesión.
 * Solo perfiles con privilegios ('SUPERVISOR' o IT) pueden consultar otros departamentos.
 */
function resolveDepartmentId(req, requestedDeptId) {
  const user = req.session?.user;
  if (!user) {
    throw new Error('Usuario no autenticado para resolver departamento.');
  }

  const isSupervisor = (user.puestoSec || '').toUpperCase().includes('SUPERVISOR') ||
                       (user.departamentoId === 5 || user.departamentoId === 9);

  // Si es supervisor o admin y especifica departamento válido, se le permite
  if (isSupervisor && requestedDeptId) {
    return parseInt(requestedDeptId, 10);
  }

  // Para usuarios operativos se impone el departamento interno de su sesión
  return user.departamentoInternoId || 1;
}

/**
 * Control de acceso basado en rol de Seguridad Operacional (SEC)
 * @param {Array<string>} allowedRoles - Lista de roles autorizados (ej: ['SUPERVISOR'])
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const userRole = (req.session?.user?.puestoSec || '').toUpperCase();
    const hasRole = allowedRoles.some(r => userRole.includes(r.toUpperCase()));

    if (hasRole) {
      return next();
    }

    const isApiRequest = req.xhr || req.path.startsWith('/api');
    if (isApiRequest) {
      return res.status(403).json({
        success: false,
        message: 'No posee privilegios suficientes para realizar esta acción.'
      });
    }

    return res.status(403).render('404', {
      title: 'Acceso Denegado',
      errorMessage: 'No posee los privilegios requeridos para acceder a este módulo.'
    });
  };
}

module.exports = {
  setNoCacheHeaders,
  requireAuth,
  verifyHoneypot,
  resolveDepartmentId,
  requireRole
};

