/**
 * SIO LAATS — Módulo de Formatos de Seguridad Operacional (SEC)
 * Arquitectura MVC + Service Layer con 10 Capas de Seguridad
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const session = require('express-session');

// 1. Boot-Cycle Validation (Capa 1 de Seguridad)
const validateEnv = require('./config/validateEnv');
validateEnv();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

// Configuración para proxy inverso (Azure App Service / NGINX)
app.set('trust proxy', 1);

// 2. Cabeceras de Seguridad y CSP (Capa 2 de Seguridad - Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// 3. CORS Restrictivo (Capa 3 de Seguridad)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Compatibilidad automática con Azure App Service (WEBSITE_HOSTNAME)
if (process.env.WEBSITE_HOSTNAME) {
  const azureOrigin = `https://${process.env.WEBSITE_HOSTNAME.trim()}`;
  if (!allowedOrigins.includes(azureOrigin)) {
    allowedOrigins.push(azureOrigin);
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Permitir solicitudes directas (mismo servidor o sin cabecera origin)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Acceso no autorizado por política CORS.'));
  },
  credentials: true
}));

// 4. Compresión Gzip/Brotli Global
app.use(compression());

// 5. Parsers de Petición (Soporte firmas digitales en Base64 y JSON de detalle)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 6. Manejo de Sesiones Seguras en Servidor (Capa 4 de Seguridad)
app.use(session({
  name: 'sio_session',
  secret: process.env.SESSION_SECRET || 'laats_fallback_secret_key_development_only',
  proxy: isProduction,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000 // 8 Horas operativas
  }
}));

// 7. Configuración de Vistas EJS y Activos Estáticos
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: isProduction ? '7d' : 0,
  etag: true
}));

// 8. Healthcheck Ligero (Previo a la barrera de autenticación)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'SIO-LAATS-FORMATOS-SEC',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// 9. Enrutador Central de la Aplicación
const mainRoutes = require('./routes/index');
app.use('/', mainRoutes);

// 10. Manejador de Error 404 (Recursos no encontrados)
app.use((req, res) => {
  const isApi = req.xhr || req.path.startsWith('/api') || (req.headers.accept && req.headers.accept.includes('application/json'));
  if (isApi) {
    return res.status(404).json({ success: false, message: 'Endpoint no encontrado.' });
  }
  res.status(404).render('404', {
    title: 'Página no encontrada | SIO LAATS',
    errorMessage: `La ruta solicitada (${req.originalUrl}) no existe o fue reubicada.`
  });
});

// 11. Manejo Seguro de Errores Internos 500 (Fail-Safe - Capa 11)
app.use((err, req, res, next) => {
  console.error('\x1b[31m[UNHANDLED SERVER ERROR]\x1b[0m', err);
  const isApi = req.xhr || req.path.startsWith('/api') || (req.headers.accept && req.headers.accept.includes('application/json'));

  const responseMessage = isProduction 
    ? 'Ocurrió un error interno en el servidor. Por favor contacte al soporte de IT.' 
    : err.message;

  if (isApi) {
    return res.status(500).json({
      success: false,
      message: responseMessage,
      ...(isProduction ? {} : { stack: err.stack })
    });
  }

  res.status(500).render('404', {
    title: 'Error en el Servidor | SIO LAATS',
    errorMessage: responseMessage
  });
});

// Arranque del Servidor
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`\n\x1b[36m====================================================\x1b[0m`);
    console.log(`\x1b[32m✔ Servidor SIO Formatos SEC ejecutándose en el puerto ${PORT}\x1b[0m`);
    console.log(`\x1b[34m✔ Modo: ${process.env.NODE_ENV || 'development'}\x1b[0m`);
    console.log(`\x1b[33m✔ URL Local: http://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[36m====================================================\x1b[0m\n`);
  });

  // Apagado controlado para reinicios sin interrupciones en Azure App Service
  const shutdown = (signal) => {
    console.log(`[SHUTDOWN] Señal ${signal} recibida. Cerrando servidor HTTP...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;

