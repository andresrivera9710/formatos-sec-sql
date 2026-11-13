/**
 * Rate Limiting Middleware - SIO LAATS (Capa 5 de Seguridad)
 * Mitigación activa contra ataques de fuerza bruta en Login y DoS en endpoints API.
 */

const rateLimit = require('express-rate-limit');

/**
 * Limitador estricto para inicio de sesión:
 * Máximo 10 intentos por IP cada 15 minutos.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos fallidos de inicio de sesión desde esta IP. Intente de nuevo en 15 minutos.'
  },
  handler: (req, res, next, options) => {
    console.warn(`[RATE LIMIT EXCEEDED] Fuerza bruta detectada en /login desde IP: ${req.ip}`);
    res.status(429).json(options.message);
  }
});

/**
 * Limitador para APIs operativas y consultas:
 * Máximo 300 peticiones por IP cada 15 minutos.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Límite de solicitudes operativas excedido. Espere un momento antes de continuar.'
  }
});

module.exports = {
  loginLimiter,
  apiLimiter
};

