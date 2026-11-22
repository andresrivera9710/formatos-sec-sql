/**
 * SIO LAATS - Suite Automatizada de Validación CI (Sin dependencia de red ni Azure SQL)
 * Uso:
 *   node scripts/ci-check.js --security
 *   node scripts/ci-check.js --syntax
 *   node scripts/ci-check.js --unit
 *   node scripts/ci-check.js --all
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const ejs = require('ejs');

const ROOT_DIR = path.resolve(__dirname, '..');

function walkFiles(dirPath, filterFn = () => true) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.netlify') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, filterFn));
    } else if (filterFn(fullPath, entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function runSecurityChecks() {
  console.log('\n=== [1/3] Auditoría de Seguridad, Secretos y CSP ===');

  // 1. Verificar reglas obligatorias en .gitignore
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  assert(fs.existsSync(gitignorePath), 'Falta archivo .gitignore en la raíz del proyecto.');
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  for (const requiredRule of ['.env', '.env.*', 'readmegithub.md', 'GEMINI.md', 'node_modules/']) {
    assert(gitignore.includes(requiredRule), `Regla faltante en .gitignore: ${requiredRule}`);
  }

  // 2. Verificar que archivos sensibles nunca estén versionados en Git
  if (fs.existsSync(path.join(ROOT_DIR, '.git'))) {
    const winGit = 'C:\\Users\\Andrés\\AppData\\Local\\Programs\\Git\\cmd\\git.exe';
    const gitExe = process.platform === 'win32' && fs.existsSync(winGit) ? winGit : 'git';
    const tracked = execFileSync(gitExe, ['ls-files'], { cwd: ROOT_DIR, encoding: 'utf8' })
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    const forbiddenTracked = tracked.filter((f) => {
      const base = path.basename(f);
      if (base === '.env.example') return false;
      return (
        base === '.env' ||
        base.startsWith('.env.') ||
        base.toLowerCase() === 'readmegithub.md' ||
        base === 'GEMINI.md' ||
        f.startsWith('.netlify/')
      );
    });
    assert.strictEqual(
      forbiddenTracked.length,
      0,
      `Archivos sensibles rastreados en Git: ${forbiddenTracked.join(', ')}`
    );
    console.log(`  ✔ Verificados ${tracked.length} archivos rastreados en Git sin secretos ni archivos excluidos.`);
  }

  // 3. Escaneo estático de tokens/llaves privadas accidentales
  const scanExts = new Set(['.js', '.ejs', '.html', '.json', '.yml', '.yaml', '.toml', '.md']);
  const secretPatterns = [
    { name: 'GitHub PAT', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
    { name: 'Netlify PAT', regex: /\bnfp_[A-Za-z0-9]{20,}\b/ },
    { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ }
  ];

  const sourceFiles = walkFiles(ROOT_DIR, (_, name) => scanExts.has(path.extname(name).toLowerCase()));
  for (const file of sourceFiles) {
    const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    if (rel === 'scripts/ci-check.js' || rel === 'package-lock.json') continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const pat of secretPatterns) {
      assert(!pat.regex.test(content), `Posible secreto (${pat.name}) detectado en ${rel}`);
    }
  }
  console.log(`  ✔ Escaneados ${sourceFiles.length} archivos fuente sin credenciales expuestas.`);

  // 4. Auditoría CSP estricta en todas las vistas y parciales EJS
  const ejsFiles = walkFiles(path.join(ROOT_DIR, 'views'), (_, name) => name.endsWith('.ejs'));
  const inlineHandlerRegex = /\son[a-z]+\s*=/gi;
  const scriptTagRegex = /<script\b([^>]*)>/gi;

  for (const file of ejsFiles) {
    const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');

    const handlerMatches = content.match(inlineHandlerRegex);
    assert(!handlerMatches, `Handler inline CSP prohibido en ${rel}: ${handlerMatches}`);

    let match;
    while ((match = scriptTagRegex.exec(content)) !== null) {
      const attrs = match[1] || '';
      const hasSrc = /\bsrc\s*=/.test(attrs);
      const isJsonBootstrap = /\btype\s*=\s*["']application\/json["']/i.test(attrs);
      assert(
        hasSrc || isJsonBootstrap,
        `Etiqueta <script> inline ejecutable prohibida por Helmet CSP en ${rel}: <script${attrs}>`
      );
    }
  }
  console.log(`  ✔ Auditoría CSP aprobada en ${ejsFiles.length} plantillas EJS (0 handlers inline, 0 scripts ejecutables inline).`);
}

function runSyntaxChecks() {
  console.log('\n=== [2/3] Validación de Sintaxis JS y Compilación EJS ===');

  const jsTargets = [
    path.join(ROOT_DIR, 'app.js'),
    ...walkFiles(path.join(ROOT_DIR, 'config'), (_, n) => n.endsWith('.js')),
    ...walkFiles(path.join(ROOT_DIR, 'controllers'), (_, n) => n.endsWith('.js')),
    ...walkFiles(path.join(ROOT_DIR, 'middlewares'), (_, n) => n.endsWith('.js')),
    ...walkFiles(path.join(ROOT_DIR, 'models'), (_, n) => n.endsWith('.js')),
    ...walkFiles(path.join(ROOT_DIR, 'routes'), (_, n) => n.endsWith('.js')),
    ...walkFiles(path.join(ROOT_DIR, 'services'), (_, n) => n.endsWith('.js')),
    ...walkFiles(path.join(ROOT_DIR, 'public', 'js'), (_, n) => n.endsWith('.js')),
    ...walkFiles(path.join(ROOT_DIR, 'scripts'), (_, n) => n.endsWith('.js'))
  ];

  for (const jsFile of jsTargets) {
    execFileSync(process.execPath, ['--check', jsFile], { stdio: 'pipe' });
  }
  console.log(`  ✔ Sintaxis JS válida (node --check) en ${jsTargets.length} archivos.`);

  const ejsFiles = walkFiles(path.join(ROOT_DIR, 'views'), (_, n) => n.endsWith('.ejs'));
  for (const ejsFile of ejsFiles) {
    const template = fs.readFileSync(ejsFile, 'utf8');
    ejs.compile(template, { filename: ejsFile });
  }
  console.log(`  ✔ Compilación EJS exitosa en ${ejsFiles.length} vistas y parciales.`);
}

function runUnitChecks() {
  console.log('\n=== [3/3] Pruebas Unitarias Offline de Catálogo, Validación y Render HTML ===');

  // 1. Validar Boot-Cycle env validator en modo CI (sin usar .env real)
  const validateEnv = require(path.join(ROOT_DIR, 'config', 'validateEnv'));
  const prevEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.DB_SERVER = 'ci-test.database.windows.net';
    process.env.DB_USER = 'ci_user';
    process.env.DB_PASSWORD = 'ci_dummy_password_only_for_boot_check';
    process.env.DB_DATABASE = 'SIO';
    process.env.SESSION_SECRET = 'laats_ci_test_session_secret_with_at_least_32_characters';
    validateEnv();
  } finally {
    process.env = prevEnv;
  }

  // 2. Validar catálogo dinámico para las 7 aerolíneas implementadas
  const OperacionesService = require(path.join(ROOT_DIR, 'services', 'OperacionesService'));
  const expectedCatalog = {
    AEROMEXICO: ['amx-cp', 'amx-ciec', 'amx-er', 'amx-eb', 'amx-cec', 'amx-mecd', 'amx-po'],
    ARAJET: ['ara-cp', 'ara-ciec', 'ara-er', 'ara-eb', 'ara-cec', 'ara-cfr'],
    'DELTA AIR LINES': ['dl-cp', 'dl-cll', 'dl-dal', 'dl-sp', 'dl-sel', 'dl-er', 'dl-cec', 'dl-ciec', 'dl-rx'],
    'AIR CANADA': ['ac-cp', 'ac-er', 'ac-eb', 'ac-cec', 'ac-ass', 'ac-anexoa', 'ac-anexob'],
    'LAN CARGO': ['latam-liadc', 'latam-ciec', 'latam-cp'],
    LATAM: ['latam-liadc', 'latam-ciec', 'latam-cp'],
    FEDEX: ['fdx-ccda'],
    AMERIJET: ['ajt-lisa', 'ajt-cec', 'ajt-ciec'],
    'AMERIJET INTERNATIONAL': ['ajt-lisa', 'ajt-cec', 'ajt-ciec']
  };

  for (const [airline, expectedIds] of Object.entries(expectedCatalog)) {
    const actualIds = OperacionesService.obtenerFormatosParaAerolinea(airline, 'SUPERVISOR').map(f => f.id);
    assert.deepStrictEqual(
      actualIds,
      expectedIds,
      `Catálogo inesperado para ${airline}: recibido ${JSON.stringify(actualIds)}`
    );
  }
  console.log('  ✔ Catálogo dinámico por aerolínea y homologación LAN CARGO <-> LATAM verificados.');

  // 3. Validar reglas de FormatoValidationService (Anti-IDOR + validación estricta 400)
  const FormatoValidationService = require(path.join(ROOT_DIR, 'services', 'FormatoValidationService'));
  const vueloSesion = { itinerarioId: 56932, numeroVuelo: '1803/1803', operador: 'LAN CARGO', matricula: 'N418LA' };
  const userMock = { empleadoId: 263, usuario: 'JAIME RAMIREZ', puesto: 'SUPERVISOR' };
  const dummySig = 'data:image/png;base64,' + 'A'.repeat(160);

  const idorMismatch = FormatoValidationService.validarControlLIADC(
    { formatoId: 'latam-liadc', itinerarioId: 99999, guardar: true, datos: {} },
    userMock,
    vueloSesion
  );
  assert.strictEqual(idorMismatch.valido, false, 'Debe bloquear itinerarioId distinto al de sesión.');

  const invalidLiadc = FormatoValidationService.validarControlLIADC(
    {
      formatoId: 'latam-liadc',
      itinerarioId: 56932,
      guardar: true,
      datos: {
        liadcPayload: {
          fecha: '2026-11-15',
          horaInicioInsp: '',
          supLaats: '',
          iniciales: 'ABCD',
          notificacionComandante: 'OTRO',
          firmaInspector: ''
        }
      }
    },
    userMock,
    vueloSesion
  );
  assert.strictEqual(invalidLiadc.valido, false);
  assert.strictEqual(invalidLiadc.statusCode, 400);
  assert(invalidLiadc.errors.length >= 5, 'LIADC incompleto debe reportar al menos 5 errores.');

  const validLiadc = FormatoValidationService.validarControlLIADC(
    {
      formatoId: 'latam-liadc',
      itinerarioId: 56932,
      guardar: true,
      datos: {
        liadcPayload: {
          fecha: '2026-11-15',
          puente: '1-2',
          horaInicioInsp: '10:00',
          supLaats: '263',
          supervisorNombre: 'JAIME RAMIREZ',
          iniciales: 'jr',
          notificacionComandante: 'verbal',
          inspectorNombre: 'JAIME RAMIREZ / LAATS',
          firmaInspector: dummySig,
          checks: { CabinaPilotos_AreasVisibles: true, AreasExternas_BodegaDelantera: false }
        }
      }
    },
    userMock,
    vueloSesion
  );
  assert.strictEqual(validLiadc.valido, true, `LIADC válido falló: ${validLiadc.message}`);
  assert.strictEqual(validLiadc.normalized.iniciales, 'JR');
  assert.strictEqual(validLiadc.normalized.notificacionComandante, 'VERBAL');
  assert.strictEqual(Object.keys(validLiadc.normalized.checks).length, 24);

  const invalidCiec = FormatoValidationService.validarControlCIEC(
    {
      formatoId: 'latam-ciec',
      itinerarioId: 56932,
      guardar: true,
      datos: {
        ciecPayload: {
          fecha: '2026-11-15',
          horaInicio: '10:00',
          supervisorEmpleadoId: 263,
          registros: [{ Nombre: 'Test', NoTIA: '123', Empresa: 'LAN CARGO', HoraIngreso: '10:01', Motivo: 'Carga', HoraSalida: '' }]
        }
      }
    },
    userMock,
    vueloSesion
  );
  assert.strictEqual(invalidCiec.valido, false);
  assert.strictEqual(invalidCiec.statusCode, 400);

  const vueloFedex = { itinerarioId: 56114, novuelo: '5504', operador: 'FEDEX', Matricula: 'N123FE', Destino: 'SAP' };
  const idorCcda = FormatoValidationService.validarControlCCDA(
    { formatoId: 'fdx-ccda', itinerarioId: 99999, guardar: true, datos: {} },
    userMock,
    vueloFedex
  );
  assert.strictEqual(idorCcda.valido, false);
  assert.strictEqual(idorCcda.statusCode, 403);

  const invalidCcda = FormatoValidationService.validarControlCCDA(
    {
      formatoId: 'fdx-ccda',
      itinerarioId: 56114,
      guardar: true,
      datos: {
        ccdaPayload: {
          fecha: '2026-11-16',
          operarioEmpleadoId: '',
          operarioNombre: '',
          acopla: '',
          supervisor: '',
          personal: [{ Personal: 'TEST', EmpleadoId: 213, Empresa: 'LAATS', Entrada: '08:00', Salida: '' }]
        }
      }
    },
    userMock,
    vueloFedex
  );
  assert.strictEqual(invalidCcda.valido, false);
  assert.strictEqual(invalidCcda.statusCode, 400);
  assert(invalidCcda.errors.length >= 4, 'CCDA incompleto debe reportar errores de cabecera y Salida de fila.');

  const validCcda = FormatoValidationService.validarControlCCDA(
    {
      formatoId: 'fdx-ccda',
      itinerarioId: 56114,
      guardar: true,
      datos: {
        ccdaPayload: {
          fecha: '2026-11-16',
          operarioEmpleadoId: 213,
          operarioNombre: 'AARON RODRIGUEZ',
          operarioEmpresa: 'LAATS',
          acopla: '08:15',
          cantCombustible: '120',
          supervisor: 'JAIME RAMIREZ',
          personal: [{ Personal: 'AARON RODRIGUEZ', EmpleadoId: 213, Empresa: 'LAATS', Entrada: '08:20', Salida: '09:10' }]
        }
      }
    },
    userMock,
    vueloFedex
  );
  assert.strictEqual(validCcda.valido, true, `CCDA válido falló: ${validCcda.message}`);
  assert.strictEqual(validCcda.normalized.cantCombustible, 120);
  assert.strictEqual(validCcda.normalized.personal.length, 1);

  const vueloAjt = { itinerarioId: 56133, novuelo: '812 / 813', operador: 'AMERIJET', Matricula: 'N375CM' };
  const idorLisa = FormatoValidationService.validarControlLISA(
    { formatoId: 'ajt-lisa', itinerarioId: 99999, guardar: true, datos: {} },
    userMock,
    vueloAjt
  );
  assert.strictEqual(idorLisa.valido, false);
  assert.strictEqual(idorLisa.statusCode, 403);

  const invalidLisa = FormatoValidationService.validarControlLISA(
    {
      formatoId: 'ajt-lisa',
      itinerarioId: 56133,
      guardar: true,
      datos: {
        lisaPayload: {
          fecha: '2026-11-16',
          estacion: '',
          tipoAvion: '',
          horaInicio: '',
          horaFin: '',
          horaSalida: '',
          coordSeguridadTierra: false,
          representanteAutorizado: false,
          firmaInspector: ''
        }
      }
    },
    userMock,
    vueloAjt
  );
  assert.strictEqual(invalidLisa.valido, false);
  assert.strictEqual(invalidLisa.statusCode, 400);
  assert(invalidLisa.errors.length >= 6, 'LISA incompleto debe reportar errores de cabecera y firma.');

  const invalidLisaSeal = FormatoValidationService.validarControlLISA(
    {
      formatoId: 'ajt-lisa',
      itinerarioId: 56133,
      guardar: true,
      datos: {
        lisaPayload: {
          fecha: '2026-11-16',
          estacion: 'GUA',
          tipoAvion: 'B767',
          horaInicio: '08:00',
          horaFin: '08:25',
          horaSalida: '09:30',
          coordSeguridadTierra: true,
          representanteAutorizado: false,
          firmaInspector: dummySig,
          sellos: { 7: { activo: true, numero: '' } }
        }
      }
    },
    userMock,
    vueloAjt
  );
  assert.strictEqual(invalidLisaSeal.valido, false);
  assert.strictEqual(invalidLisaSeal.statusCode, 400);

  const validLisa = FormatoValidationService.validarControlLISA(
    {
      formatoId: 'ajt-lisa',
      itinerarioId: 56133,
      guardar: true,
      datos: {
        lisaPayload: {
          fecha: '2026-11-16',
          estacion: 'gua',
          tipoAvion: 'b767',
          horaInicio: '08:00',
          horaFin: '08:25',
          horaSalida: '09:30',
          coordSeguridadTierra: true,
          representanteAutorizado: false,
          firmaInspector: dummySig,
          checks: { AsientosTripChalecos: true, PuertaIntCabinaCarga: true },
          sellos: { 7: { activo: true, numero: 'SL-9901' } }
        }
      }
    },
    userMock,
    vueloAjt
  );
  assert.strictEqual(validLisa.valido, true, `LISA válido falló: ${validLisa.message}`);
  assert.strictEqual(validLisa.normalized.estacion, 'GUA');
  assert.strictEqual(validLisa.normalized.tipoAvion, 'B767');
  assert.strictEqual(validLisa.normalized.noSello, true);
  assert.strictEqual(validLisa.normalized.sellos[7].numero, 'SL-9901');
  assert.strictEqual(Object.keys(validLisa.normalized.checks).length, 15);

  console.log('  ✔ Validaciones backend Anti-IDOR y reglas estrictas (LIADC / CIEC / CCDA / LISA) verificadas.');

  // 4. Validar presencia de todas las 36 plantillas HTML y renderizado sin tokens @{...} ni XSS
  const HtmlPreviewService = require(path.join(ROOT_DIR, 'services', 'HtmlPreviewService'));
  const allFormatIds = [
    ...expectedCatalog.AEROMEXICO,
    ...expectedCatalog.ARAJET,
    ...expectedCatalog['DELTA AIR LINES'],
    ...expectedCatalog['AIR CANADA'],
    ...expectedCatalog['LAN CARGO'],
    ...expectedCatalog.FEDEX,
    ...expectedCatalog.AMERIJET
  ];
  assert.strictEqual(allFormatIds.length, 36);

  for (const id of allFormatIds) {
    assert.strictEqual(
      HtmlPreviewService.hasControlledTemplate(id),
      true,
      `Falta plantilla HTML controlada en FormatosHTML/ para: ${id}`
    );
  }

  // Verificar coincidencia exacta de mayúsculas/minúsculas (evita fallos en Linux)
  const previewSrc = fs.readFileSync(path.join(ROOT_DIR, 'services', 'HtmlPreviewService.js'), 'utf8');
  const mapBlock = previewSrc.match(/const FORMAT_HTML_MAP = \{([\s\S]*?)\};/);
  assert(mapBlock, 'No se pudo localizar FORMAT_HTML_MAP en HtmlPreviewService.js');
  for (const [, id, rel] of mapBlock[1].matchAll(/'([^']+)':\s*'([^']+)'/g)) {
    const [folder, file] = rel.split('/');
    const entries = fs.readdirSync(path.join(ROOT_DIR, 'FormatosHTML', folder));
    assert(
      entries.includes(file),
      `Case-mismatch Linux detectado en FORMAT_HTML_MAP['${id}']: '${rel}'`
    );
  }

  const xssProbe = '<script>alert("XSS")</script>';
  const previewTargets = [
    {
      formatoId: 'amx-cp',
      varsFn: () => HtmlPreviewService.buildCpData({
        cpDoc: { fecha: '2026-11-15', horaInicio: '08:00', observaciones: xssProbe, registros: [{ Nombre: xssProbe, NoTIA: '1', Empresa: 'LAATS', HoraIngreso: '08:01', Motivo: 'Insp', HoraSalida: '08:10' }] },
        vuelo: { numeroVuelo: 'AM670', matricula: 'XA-AMX', puerta: '1' },
        user: userMock
      })
    },
    {
      formatoId: 'ara-cfr',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ara-cfr',
        formDatos: { cfrPayload: { fecha: '2026-11-15', horaInicio: '09:00', observaciones: xssProbe, registros: [] } },
        vuelo: { numeroVuelo: 'DM101', matricula: 'HI-100', puerta: '2' },
        user: userMock
      })
    },
    {
      formatoId: 'dl-dal',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-dal',
        formDatos: { dalPayload: { fecha: '2026-11-15', agentName: 'TEST', supervisor: 'SUP', remarks: xssProbe, items: [] } },
        vuelo: { numeroVuelo: 'DL1826', matricula: 'N123DL', puerta: '3' },
        user: userMock
      })
    },
    {
      formatoId: 'ac-ass',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ac-ass',
        formDatos: { assPayload: { fecha: '2026-11-15', searchStartTime: '10:00', generalRemarks: xssProbe, checks: {}, firmaAgente: dummySig } },
        vuelo: { numeroVuelo: 'AC125', matricula: 'C-TEST', puerta: '4' },
        user: userMock
      })
    },
    {
      formatoId: 'ac-anexoa',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ac-anexoa',
        formDatos: { anexoAPayload: { fecha: '2026-11-15', horaRevision: '10:00', puerta: '4', observaciones: xssProbe, registros: [] } },
        vuelo: { numeroVuelo: 'AC125', matricula: 'C-TEST', puerta: '4' },
        user: userMock
      })
    },
    {
      formatoId: 'ac-anexob',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ac-anexob',
        formDatos: { anexoBPayload: { fecha: '2026-11-15', departureStation: 'GUA', idValidationReport: xssProbe, leadSignature: dummySig, zonesSearch: [] } },
        vuelo: { numeroVuelo: 'AC125', matricula: 'C-TEST', puerta: '4' },
        user: userMock
      })
    },
    {
      formatoId: 'latam-liadc',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'latam-liadc',
        formDatos: { liadcPayload: { fecha: '2026-11-15', horaInicioInsp: '10:00', iniciales: 'JR', notificacionComandante: 'VERBAL', observaciones: xssProbe, inspectorNombre: 'TEST', firmaInspector: dummySig, checks: { CabinaPilotos_AreasVisibles: true, AreasExternas_BodegaDelantera: false } } },
        vuelo: vueloSesion,
        user: userMock
      })
    },
    {
      formatoId: 'latam-ciec',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'latam-ciec',
        formDatos: { ciecPayload: { fecha: '2026-11-15', horaInicio: '10:00', observaciones: xssProbe, registros: [{ Nombre: xssProbe, NoTIA: '9', Empresa: 'LAN CARGO', HoraIngreso: '10:01', Motivo: 'Carga', HoraSalida: '10:10' }] } },
        vuelo: vueloSesion,
        user: userMock
      })
    },
    {
      formatoId: 'latam-cp',
      varsFn: () => HtmlPreviewService.buildCpData({
        cpDoc: { fecha: '2026-11-15', horaInicio: '10:00', observaciones: xssProbe, registros: [] },
        vuelo: vueloSesion,
        user: userMock
      })
    },
    {
      formatoId: 'fdx-ccda',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'fdx-ccda',
        formDatos: {
          ccdaPayload: {
            fecha: '2026-11-16',
            operarioNombre: xssProbe,
            operarioEmpleadoId: 213,
            operarioEmpresa: 'LAATS',
            acopla: '08:15',
            supervisor: 'JAIME RAMIREZ',
            observaciones: xssProbe,
            personal: [{ Personal: xssProbe, EmpleadoId: 213, Empresa: 'LAATS', Entrada: '08:20', Salida: '09:10' }]
          }
        },
        vuelo: { novuelo: '5504', Matricula: 'N123FE', Destino: 'SAP' },
        user: userMock
      })
    },
    {
      formatoId: 'ajt-lisa',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ajt-lisa',
        formDatos: {
          lisaPayload: {
            fecha: '2026-11-16',
            estacion: 'GUA',
            tipoAvion: 'B767',
            horaInicio: '08:00',
            horaFin: '08:25',
            horaSalida: '09:30',
            coordSeguridadTierra: true,
            representanteAutorizado: false,
            observaciones: xssProbe,
            firmaInspector: dummySig,
            checks: { AsientosTripChalecos: true, PuertaIntCabinaCarga: true },
            sellos: { 7: { activo: true, numero: xssProbe, iniciales: 'J.R.' } }
          }
        },
        vuelo: vueloAjt,
        user: userMock
      })
    },
    {
      formatoId: 'ajt-cec',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ajt-cec',
        formDatos: {
          cecPayload: {
            fecha: '2026-11-16',
            horaInicio: '08:00',
            supervisor: 'JAIME RAMIREZ',
            agente: 'TEST',
            compartimientoNo: '1',
            observaciones: xssProbe,
            secuencias: [{ Orden: 1, Secuencia: 101, Valor: '101' }]
          }
        },
        vuelo: vueloAjt,
        user: userMock
      })
    },
    {
      formatoId: 'ajt-ciec',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ajt-ciec',
        formDatos: {
          ciecPayload: {
            fecha: '2026-11-16',
            horaInicio: '08:00',
            observaciones: xssProbe,
            alerosNombres: [xssProbe],
            registros: [{ Nombre: xssProbe, NoTIA: '777', Empresa: 'AMERIJET', HoraIngreso: '08:05', Motivo: 'Carga', HoraSalida: '08:20' }]
          }
        },
        vuelo: vueloAjt,
        user: userMock
      })
    }
  ];

  for (const target of previewTargets) {
    const rendered = HtmlPreviewService.renderHtmlPreview({
      formatoId: target.formatoId,
      vars: target.varsFn(),
      meta: { pendientesSalidaCount: 0 }
    });
    assert(typeof rendered === 'string' && rendered.length > 500, `Render vacío para ${target.formatoId}`);
    assert(!/@\{[^}]+\}/.test(rendered), `Tokens @{...} sin resolver en ${target.formatoId}: ${rendered.match(/@\{[^}]+\}/g)}`);
    assert(!rendered.includes(xssProbe), `Posible XSS sin escapar en ${target.formatoId}`);
  }
  console.log(`  ✔ Verificadas ${allFormatIds.length} plantillas HTML y renderizado anti-XSS sin tokens residuales en ${previewTargets.length} formatos representativos.`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const runAll = args.size === 0 || args.has('--all');

  if (runAll || args.has('--security')) runSecurityChecks();
  if (runAll || args.has('--syntax')) runSyntaxChecks();
  if (runAll || args.has('--unit')) runUnitChecks();

  console.log('\n✔ TODAS LAS VALIDACIONES CI PASARON EXITOSAMENTE.');
}

main();
