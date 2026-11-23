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
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.firmas-cache') {
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
        base === 'netlify.toml' ||
        f === 'public/_redirects'
      );
    });
    assert.strictEqual(
      forbiddenTracked.length,
      0,
      `Archivos sensibles o prohibidos rastreados en Git: ${forbiddenTracked.join(', ')}`
    );
    assert(!fs.existsSync(path.join(ROOT_DIR, 'netlify.toml')), 'No debe existir netlify.toml en el proyecto.');
    assert(!fs.existsSync(path.join(ROOT_DIR, 'public', '_redirects')), 'No debe existir public/_redirects en el proyecto.');
    console.log(`  ✔ Verificados ${tracked.length} archivos rastreados en Git sin secretos ni archivos excluidos.`);
  }

  // 3. Escaneo estático de tokens/llaves privadas accidentales
  const scanExts = new Set(['.js', '.ejs', '.html', '.json', '.yml', '.yaml', '.toml', '.md']);
  const secretPatterns = [
    { name: 'GitHub PAT', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
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

async function runUnitChecks() {
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

  const vueloAmxCec = { itinerarioId: 39841, novuelo: '672/673', operador: 'AEROMEXICO', Matricula: 'XA-GNS', FechaItinerado: '2026-01-01' };
  const invalidCecEmpty = FormatoValidationService.validarControlCEC(
    {
      formatoId: 'amx-cec',
      itinerarioId: 39841,
      guardar: true,
      datos: {
        fecha: '2026-01-01',
        horaInicio: '10:49',
        supervisorNombre: 'KARLA ORTIZ',
        agenteNombre: 'ANDRES RIVERA',
        compartimiento: 2,
        detalles: []
      }
    },
    userMock,
    vueloAmxCec
  );
  assert.strictEqual(invalidCecEmpty.valido, false, 'CEC sin embarque ni desembarque debe ser rechazado');
  assert.strictEqual(invalidCecEmpty.statusCode, 400);

  const validCecDesembarqueOnly = FormatoValidationService.validarControlCEC(
    {
      formatoId: 'amx-cec',
      itinerarioId: 39841,
      guardar: true,
      datos: {
        fecha: '2026-01-01',
        horaInicio: '10:49',
        supervisorNombre: 'KARLA ORTIZ',
        agenteNombre: 'ANDRES RIVERA',
        compartimiento: 2,
        equipaje: 40,
        carga: 34,
        detalles: []
      }
    },
    userMock,
    vueloAmxCec
  );
  assert.strictEqual(validCecDesembarqueOnly.valido, true, `CEC solo desembarque debe aceptarse: ${validCecDesembarqueOnly.message}`);

  console.log('  ✔ Validaciones backend Anti-IDOR y reglas estrictas (CEC / LIADC / CIEC / CCDA / LISA) verificadas.');

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
        cpDoc: {
          fecha: '2026-01-01',
          fechaFormatoUS: '01/01/2026',
          horaInicio: '10:45',
          supervisor: 'KARLA ORTIZ',
          agente: 'ANDRES RIVERA',
          arriboVuelo: '10:40',
          aeronaveAsegurada: '11:06',
          tractoristaUnidad: 'ERWIN ALEXANDER MARROQUIN ROLDAN / AT-212',
          alero1: 'ANTONIO CAC CUCUL',
          alero2: 'ANTONIO VINICIO RAX CAAL',
          observaciones: `${xssProbe}\nLínea 2 de observación perimétrica`,
          registros: [{ Nombre: xssProbe, NoTIA: '761', Empresa: 'LAATS', HoraIngreso: '10:45', Motivo: 'Compartimiento 2', HoraSalida: '12:49' }]
        },
        vuelo: { numeroVuelo: '672/673', matricula: '', puerta: '' },
        user: userMock
      })
    },
    {
      formatoId: 'amx-ciec',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'amx-ciec',
        formDatos: {
          ciecPayload: {
            fecha: '2026-01-01',
            horaInicio: '18:40',
            supervisorEmpleadoId: 289,
            supervisorNombre: 'QUELVIN GARCIA',
            agente: 'ANDRES RIVERA',
            arriboDelVuelo: '18:35',
            aeronaveAsegurada: '18:42',
            pasarelaAcoplada: '18:43',
            puertaAbierta: '18:44',
            egresoTripulacion: '18:59',
            ingresoTripulacion: '19:20',
            paxEntrando: 163,
            primerPax: '19:25',
            ultimoPax: '19:45',
            paxAbordos: 158,
            puertaCerrada: '19:50',
            desacoplePasarela: '19:52',
            pushBack: '19:55',
            despegue: '20:05',
            tractoristaNombre: 'ERWIN MARROQUIN',
            noUnidadLabel: 'AT-212',
            alerosNombres: ['ANTONIO CAC CUCUL', 'ANTONIO VINICIO RAX CAAL'],
            observaciones: `${xssProbe}\nSegunda línea cabina`,
            equipajePuerta: [],
            registros: [{ Nombre: `Brandon ${xssProbe}`, NoTIA: '470', Empresa: 'LAATS', HoraIngreso: '18:58', Motivo: 'Operaciones', HoraSalida: '19:02' }]
          }
        },
        vuelo: { novuelo: '672/673', Matricula: '', FechaItinerado: '2026-01-01' },
        hydrated: {
          ciecState: {
            complemento: { TotalEquipaje: 9 }
          }
        },
        user: userMock
      })
    },
    {
      formatoId: 'amx-eb',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'amx-eb',
        formDatos: {
          fecha: '2026-11-19',
          horaInicio: '14:08',
          horaCierre: '16:25',
          supervisorNombre: 'HENRY ALONZO',
          nombreOperador: 'LESLY JACOBO',
          correos: null,
          comat: null,
          eqTransito: null,
          observaciones: xssProbe,
          detalles: [{ Secuencia: 122 }, { Secuencia: 121 }, { Secuencia: 26, Valor: 'X', Motivo: 'Retiro AVSEC' }]
        },
        vuelo: { novuelo: '678/679', Matricula: '', FechaItinerado: '2026-11-19' },
        user: userMock
      })
    },
    {
      formatoId: 'ara-eb',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ara-eb',
        formDatos: { fecha: '2026-11-19', horaInicio: '10:00', supervisorNombre: 'SUP', nombreOperador: 'OP', observaciones: xssProbe, detalles: [{ Secuencia: 55 }] },
        vuelo: { novuelo: 'DM101', Matricula: 'HI-100', FechaItinerado: '2026-11-19' },
        user: userMock
      })
    },
    {
      formatoId: 'ac-eb',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'ac-eb',
        formDatos: { fecha: '2026-11-19', horaInicio: '11:00', supervisorNombre: 'SUP', nombreOperador: 'OP', observaciones: xssProbe, detalles: [{ Secuencia: 88 }] },
        vuelo: { novuelo: 'AC125', Matricula: 'C-TEST', FechaItinerado: '2026-11-19' },
        user: userMock
      })
    },
    {
      formatoId: 'amx-cec',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'amx-cec',
        formDatos: {
          fecha: '2026-01-01',
          horaInicio: '10:49',
          supervisorLoginId: 289,
          supervisorNombre: 'KARLA ORTIZ',
          agenteNombre: 'ANDRES RIVERA',
          compartimiento: 2,
          compAbierto: '11:12',
          compCerrado: '12:14',
          equipaje: 40,
          carruajes: 0,
          correos: 0,
          carga: 34,
          cantidadSinEtiqueta: 1,
          cantidadConEtiqueta: 2,
          desembarqueInicio: '11:16',
          desembarqueFinal: '11:24',
          embarqueInicio: '11:35',
          embarqueFinal: '12:10',
          nombreOirsa: 'María Quintana',
          tiaOirsa: '109',
          pilotoCombustible: 'Virgilio Santos',
          tiaPilotoCombustible: '005',
          ayudanteCombustible: 'NA',
          tiaAyudanteCombustible: '00',
          noUnidadCombustible: '85',
          combustibleEntrada: '11:19',
          combustibleSalida: '11:44',
          pilotoCocinas: 'NA',
          tiaPilotoCocinas: '00',
          operadoresRampa: 'AMILCAR ROGELIO XOL YAXCAL',
          observaciones: `${xssProbe}\nGuía 139 4760 4056 piezas 42`,
          detalles: [{ Secuencia: 101 }, { Secuencia: 104, Valor: 'X', Motivo: 'Revisión' }]
        },
        vuelo: { novuelo: '672/673', Matricula: '', FechaItinerado: '2026-01-01', puertaposicion: '5' },
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
    },
    {
      formatoId: 'amx-po',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'amx-po',
        formDatos: {
          poPayload: {
            fecha: '2026-01-01',
            supervisorLoginId: 210,
            supervisorNombre: '',
            observaciones: `${xssProbe}\nSegunda línea PO`,
            registros: [
              { PosicionId: 1, Posicion: 'Filtro Cabina', Agentes: `AGENTE ${xssProbe}` },
              { PosicionId: 3, Posicion: 'Puerta', Agentes: 'AGENTE DOS' }
            ]
          }
        },
        hydrated: {
          poState: {
            complemento: {
              LoginId: 210,
              CreadoPor: 'ANDRES RIVERA',
              Fecha: '2026-01-01'
            }
          },
          supervisores: [{ LoginId: 210, EmpleadoId: 210, Usuario: 'KARLA ORTIZ' }],
          firmasRepo: {
            firmas: {
              firmaSupervisor: { exists: true, locked: true, dataUrl: dummySig }
            }
          }
        },
        vuelo: { novuelo: '672/673', Matricula: '', FechaItinerado: '2026-01-01' },
        user: userMock
      })
    },
    {
      formatoId: 'amx-er',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'amx-er',
        preferPersisted: true,
        formDatos: {
          erPayload: {
            observaciones: `${xssProbe}\nLínea 2 ER`,
            registros: []
          }
        },
        hydrated: {
          erState: {
            complemento: {
              EncabezadoControlERId: 24,
              LoginId: 485,
              Fecha: '2026-01-01',
              Observacion: `Obs DB ${xssProbe}\nLínea 2 ER`,
              CreadoPor: 'ZOILA GARCIA'
            },
            detalles: [
              {
                DetalleControlERId: 49,
                Pasajero: `Carlos ${xssProbe}`,
                Secuencia: 11,
                Colilla: 452376,
                Destino: 'Mex',
                HoraRevision: '08:18',
                AgenteAVSEC: 'Cesar Pop',
                AgenteSeguridad: 'ZOILA GARCIA'
              }
            ]
          },
          firmasRepo: {
            firmas: {
              firmaBase64: { exists: true, locked: true, dataUrl: dummySig }
            }
          }
        },
        vuelo: { novuelo: '671', Matricula: '', Destino: 'Mex', FechaItinerado: '2026-01-01' },
        user: userMock
      })
    },
    {
      formatoId: 'amx-mecd',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'amx-mecd',
        preferPersisted: true,
        formDatos: { mecdPayload: {} },
        hydrated: {
          mecdState: {
            encabezado: {
              EncabezadoEquipMECDId: 11,
              SupervisorId: 64,
              AgenteId: 74,
              EmpleadoId: 27,
              CreadoPor: 'RUBEN GONZALEZ'
            },
            ccoNombre: 'MARIO LARIOS',
            agenteNombre: 'RUBEN GONZALEZ',
            supervisorNombre: 'JAIME RAMIREZ',
            revisiones: [{ DetalleEquipMECDId: 1, Control: '25', Colilla: '00001' }],
            conFirma: [{ EquipajeMEId: 1, Pasajero: `Ordoñez ${xssProbe}`, Colilla: '31', Control: '127596', Destino: 'Tgz' }],
            sinFirma: [{ EquipajeDTId: 1, Pasajero: 'Pasajero Tobogán', Colilla: '49', Control: '754731', Destino: 'Mex' }]
          },
          firmasRepo: {
            firmas: {
              firmaAgente: { exists: true, locked: true, dataUrl: dummySig },
              firmaCCO: { exists: false, locked: false, dataUrl: '' },
              firmaSupervisor: { exists: false, locked: false, dataUrl: '' }
            }
          }
        },
        vuelo: { novuelo: '671', Matricula: '', FechaItinerado: '2026-01-01' },
        user: userMock
      })
    },
    {
      formatoId: 'dl-cp',
      varsFn: () => HtmlPreviewService.buildCpData({
        cpDoc: {
          fecha: '2026-01-01',
          horaInicio: '08:00',
          supervisor: 'ANDRES RIVERA',
          agente: 'ANDRES RIVERA',
          arriboVuelo: '08:15',
          aeronaveAsegurada: '08:20',
          tractoristaUnidad: 'ERWIN MARROQUIN / AT-212',
          alero1: 'ANTONIO CAC',
          alero2: 'VINICIO RAX',
          observaciones: `Obs DL CP ${xssProbe}`,
          registros: [
            { nombre: `Juan ${xssProbe}`, noTia: '332', empresa: 'SAG', horaIngreso: '08:22', motivo: 'Inspeccion', horaSalida: '08:40' }
          ]
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', puertaposicion: '11', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-ciec',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-ciec',
        preferPersisted: true,
        formDatos: { ciecPayload: {} },
        hydrated: {
          ciecState: {
            encabezado: { EmpleadoId: 263, HoraInicio: '07:50', Fecha: '2026-01-01' },
            complemento: {
              ArriboVuelo: '08:10',
              AeronaveAsegurada: '08:15',
              PasarelaAcoplada: '08:12',
              PuertaAbierta: '08:14',
              EgresoTripulacion: '08:20',
              IngresoTripulacion: '08:30',
              PrimerPax: '08:45',
              UltimoPax: '09:10',
              PaxAbordos: 158,
              PuertaCerrada: '09:15',
              DesacoplePasarela: '09:18',
              PushBack: '09:22',
              PaxEntrando: 142,
              Despegue: '09:35',
              TotalEquipaje: 2,
              Aleros: 'ANTONIO CAC, VINICIO RAX',
              Tractorista: 'ERWIN MARROQUIN',
              Maquinaria: 'AT-212',
              Observaciones: `Cabina DL ${xssProbe}`
            },
            observacionesLimpia: `Cabina DL ${xssProbe}`,
            equipajePuerta: ['101', '102'],
            detalles: [
              { Nombre: `Maria ${xssProbe}`, NoTIA: '881', Empresa: 'DELTA', HoraIngreso: '08:16', Motivo: 'Limpieza', HoraSalida: '08:35' }
            ]
          },
          supervisores: [{ EmpleadoId: 263, Usuario: 'ANDRES RIVERA' }]
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-er',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-er',
        preferPersisted: true,
        formDatos: { erPayload: {} },
        hydrated: {
          erState: {
            complemento: {
              EncabezadoControlERId: 88,
              LoginId: 138,
              Fecha: '2026-01-01',
              Observacion: `Obs DL ER ${xssProbe}`,
              CreadoPor: 'ANDRES RIVERA'
            },
            detalles: [
              {
                DetalleControlERId: 101,
                Pasajero: `Pasajero DL ${xssProbe}`,
                Secuencia: 1,
                Colilla: 998877,
                Destino: 'ATL',
                HoraRevision: '08:30',
                AgenteAVSEC: 'Cesar Pop',
                AgenteSeguridad: 'ANDRES RIVERA'
              }
            ]
          },
          firmasRepo: {
            firmas: {
              firmaBase64: { exists: true, locked: true, dataUrl: dummySig }
            }
          }
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', Destino: 'ATL', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-cec',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-cec',
        preferPersisted: true,
        formDatos: { cecPayload: {} },
        hydrated: {
          cecState: {
            complemento: {
              Fecha: '2026-01-01',
              HoraInicio: '08:00',
              Supervisor: 'ANDRES RIVERA',
              Agente: 'ANDRES RIVERA',
              CompartimientoNo: 2,
              CompAbierto: '08:15',
              CompCerrado: '09:10',
              DesembarqueHoraInicio: '08:16',
              DesembarqueHoraFinal: '08:40',
              EmbarqueHoraInicio: '08:45',
              EmbarqueHoraFinal: '09:08',
              Equipaje: 85,
              Carruajes: 4,
              Carga: 12,
              EquipajeMostrador: 92,
              EquipajePuerta: 6,
              CargaEmbarqueDelta: 15,
              NombreOirsa: 'Hector Cruz',
              TIAOirsa: '551',
              NombreCombustible: 'Jorge Perez,Luis Gomez',
              TIACombustible: '111,222',
              NoUnidadCombustible: 'U-09',
              CombustibleEntrada: '08:20',
              CombustibleSalida: '08:50',
              NombreCocinas: 'Mario Diaz,Pedro Solis',
              TIACocinas: '333,444',
              NoUnidadCocinas: 'C-04',
              CocinasEntrada: '08:25',
              CocinasSalida: '08:55',
              OperadoresRampa: 'Carlos Lopez / Raul Paz',
              Observaciones: `Compartimento DL ${xssProbe}`
            },
            detalles: []
          }
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', puertaposicion: '11', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-rx',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-rx',
        preferPersisted: true,
        formDatos: { rxPayload: {} },
        hydrated: {
          rxState: {
            encabezado: {
              EncabezadoDRayosXId: 5,
              EmpleadoId: 1848,
              LoginId: 138,
              Fecha: '2026-01-01',
              HoraInicio: '06:30',
              PEquipajeRecibidoRX: '06:40',
              PCarretaEnviada: '06:55',
              UEquipajeRX: '08:10',
              UCarretaEnviada: '08:20',
              Observacion: `Observacion RX Singular ${xssProbe}`,
              CreadoPor: 'ANDRES RIVERA'
            },
            personalSAG: [{ PersonalSAGId: 1, Nombre: `Inspector SAG ${xssProbe}`, Id: 'SAG-01' }],
            personalLaats: [{ PersonalLaatsId: 1, EmpleadoId: 1848, Nombre: 'ANDRES RIVERA', Id: '9710' }]
          },
          supervisores: [{ EmpleadoId: 1848, LoginId: 138, Usuario: 'ANDRES RIVERA' }]
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-cll',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-cll',
        preferPersisted: true,
        formDatos: { cllPayload: {} },
        hydrated: {
          cllState: {
            complemento: {
              EncabezadoCLLId: 20,
              LoginId: 138,
              Fecha: '2026-01-01',
              AgenteSeguridad: 'ANDRES RIVERA',
              AgenteDelta: 'ROBERTO GOMEZ, 7744',
              AgenteTIA: '9710'
            },
            detalles: [
              { DetalleCLLId: 1, Guia: '006-12345675', Contenido: `PERISHABLES ${xssProbe}`, Piezas: 18, BIN: '2' }
            ]
          },
          firmasRepo: {
            firmas: {
              firmaSecurity: { exists: true, locked: true, dataUrl: dummySig },
              firmaLD: { exists: true, locked: true, dataUrl: dummySig }
            }
          }
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-sp',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-sp',
        preferPersisted: true,
        formDatos: { spPayload: {} },
        hydrated: {
          spState: {
            encabezado: {
              EncabezadoSPId: 12,
              LoginId: 138,
              Fecha: '2026-01-01',
              CreadoPor: 'ANDRES RIVERA'
            },
            detalles: [
              { DetalleSPId: 1, Apellido: `Jimenez ${xssProbe}`, Nombre: 'Isaias', SeleccionSPId: 2, Asiento: '38A', BCN: '160', NombreAgente: 'ANDRES RIVERA' },
              { DetalleSPId: 2, Apellido: 'Villagran', Nombre: 'Melva', SeleccionSPId: 1, Asiento: '20E', BCN: '171', NombreAgente: 'ANDRES RIVERA' }
            ]
          },
          supervisores: [{ LoginId: 138, EmpleadoId: 1848, Usuario: 'ANDRES RIVERA' }],
          firmasRepo: {
            firmas: {
              firmaScreener: { exists: true, locked: true, dataUrl: dummySig }
            }
          }
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-dal',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-dal',
        preferPersisted: true,
        formDatos: { dalPayload: {} },
        hydrated: {
          dalState: {
            detalle: {
              DetalleDALId: 10,
              ItinerarioId: 39523,
              LoginId: 138,
              RevisadoXRay: true,
              CantidadEqFisicos: 14,
              Evaluadores: 'Screener Uno, Screener Dos, Screener Tres, ANDRES RIVERA',
              BolsasIngresadas: true,
              CantidadEq: 120,
              NombreGuardia: 'Guardia Contador',
              CantidadEqGuardia: 65,
              CantidadMaletas: 18,
              NombreGuardia2: 'Guardia Rampa',
              CantidadPiezasManifiesto: 22,
              NombreGuardia3: 'Guardia Carga',
              NombreAgentes: 'Agente Puerta 1',
              NombreGuardiaEscolta: `Guardia Escolta ${xssProbe}`,
              CantidadPasajerosTransito: 0,
              CantidadPasajerosSalientes: 158,
              PasajerosPerdieronVuelo: '2 - Juan Perez, Ana Lopez',
              CantidadPiezasAceptadas: 22,
              CantidadPiezasCargadas: 22,
              CantidadEqFacturados: 120,
              CantidadEqCargadas: 120,
              CantidadEqRetirados: 0,
              EqCoincidePasajero: true,
              NombreAgenteDelta: 'Roberto Gomez',
              CreadoPor: 'ANDRES RIVERA'
            }
          },
          supervisores: [{ LoginId: 138, EmpleadoId: 1848, Usuario: 'ANDRES RIVERA' }],
          firmasRepo: {
            firmas: {
              firmaGuardSup: { exists: true, locked: true, dataUrl: dummySig },
              firmaDLAgent: { exists: true, locked: true, dataUrl: dummySig }
            }
          }
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', origen: 'GUA', destino: 'ATL', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    },
    {
      formatoId: 'dl-sel',
      varsFn: () => HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: 'dl-sel',
        preferPersisted: true,
        formDatos: { selPayload: {} },
        hydrated: {
          selState: {
            detalle: {
              DetalleSELId: 2,
              ItinerarioId: 39523,
              LoginId: 138,
              HoraCierreFila: '07:45',
              CantidadPasajerosFila: 12,
              HoraChequeadoFila: '07:55',
              PrimerEqRevisada: '06:35',
              UltimoEqRevisado: '08:05',
              PrimerEqPuerta: '08:20',
              UltimoEqPuerta: '08:50',
              CantidadPasajerosEmbarque: '158',
              HoraInicioEmbarque: '08:30',
              HoraUltimoAbandona: '09:05',
              HoraDescargaEqCarga: '08:15',
              HoraInicioEqCarga: '08:25',
              HoraPuertasCerradasCar: '09:12',
              HoraPuertasCerradasCab: '09:15',
              HoraInicioRodajeNave: '09:22',
              Observaciones: `Operacion SEL ${xssProbe}`,
              Meta: {
                aircraftArrived: '2026-01-01',
                aircraftArrivedTime: '07:30',
                guard: 'ANDRES RIVERA'
              },
              CreadoPor: 'ANDRES RIVERA'
            }
          },
          supervisores: [{ LoginId: 138, EmpleadoId: 1848, Usuario: 'ANDRES RIVERA' }],
          firmasRepo: {
            firmas: {
              firmaSupervisor: { exists: true, locked: true, dataUrl: dummySig }
            }
          }
        },
        vuelo: { novuelo: '1830/1831', Matricula: 'N695DL', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 1848, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      })
    }
  ];

  for (const target of previewTargets) {
    const rendered = HtmlPreviewService.renderHtmlPreview({
      formatoId: target.formatoId,
      vars: target.varsFn(),
      meta: { pendientesSalidaCount: 0 },
      documentTitle: `TEST_NA_${target.formatoId}_1`
    });
    assert(typeof rendered === 'string' && rendered.length > 500, `Render vacío para ${target.formatoId}`);
    assert(!/@\{[^}]+\}/.test(rendered), `Tokens @{...} sin resolver en ${target.formatoId}: ${rendered.match(/@\{[^}]+\}/g)}`);
    assert(!/src=["']data:image\/[^;]+;base64,\s*["']/i.test(rendered), `Logo o imagen base64 vacío en ${target.formatoId}`);
    assert(!rendered.includes(xssProbe), `Posible XSS sin escapar en ${target.formatoId}`);
    assert(!/<img\b[^>]*\bsrc=["']\s*["']/i.test(rendered), `Etiqueta <img> con src vacío en ${target.formatoId}`);
    assert(rendered.includes(`<title>TEST_NA_${target.formatoId}_1</title>`), `Título dinámico no aplicado en ${target.formatoId}`);

    if (target.formatoId.endsWith('-eb')) {
      assert(!rendered.includes("class='matriz-table'"), `Matriz EB sin estilos inline en ${target.formatoId}`);
      assert(rendered.includes('<thead>') && rendered.includes('>10</th>') && rendered.includes('>15</td>'), `Matriz EB sin encabezados 1..10 o 15 filas en ${target.formatoId}`);
      assert(rendered.includes('border: 1px solid black;'), `Celdas de matriz EB sin bordes en ${target.formatoId}`);
      if (target.formatoId === 'amx-eb') {
        assert(rendered.includes('✗') && rendered.includes('color: red;'), 'Tache rojo ✗ faltante en amx-eb');
        assert(rendered.includes("<div class='stat-box'>0</div>"), 'Valores nulos de estadísticas en amx-eb deben mostrarse como 0');
      }
    }

    if (target.formatoId === 'amx-cp') {
      assert(rendered.includes('min-height: 14px;'), 'Falta min-height en .line-input de amx-cp');
      assert(rendered.includes('white-space: pre-line;'), 'Observaciones de amx-cp deben soportar saltos de línea');
      assert(rendered.includes('10:45 / '), 'HoraInicioPuerta debe formatearse correctamente en amx-cp');
      assert(rendered.includes('ANTONIO CAC CUCUL') && rendered.includes('ANTONIO VINICIO RAX CAAL'), 'Aleros 1 y 2 faltantes en amx-cp');
      assert(rendered.includes('ERWIN ALEXANDER MARROQUIN ROLDAN / AT-212'), 'TractoristaUnidad faltante en amx-cp');
      assert((rendered.match(/<tbody>[\s\S]*?<\/tbody>/i)?.[0].match(/<tr>/g) || []).length >= 25, 'amx-cp debe renderizar al menos 25 filas en la tabla');
    }

    if (target.formatoId === 'amx-ciec') {
      assert(!rendered.includes('height: 100vh;'), 'amx-ciec no debe fijar height: 100vh en @media print');
      assert(rendered.includes('min-height: 16px;'), 'Falta min-height en .solid-line de amx-ciec');
      assert(rendered.includes('white-space: pre-line;'), 'Observaciones de amx-ciec deben soportar saltos de línea');
      assert(rendered.includes('<tr class="grid-row">') && rendered.includes('text-align: left;'), 'FilasInOutHTML de amx-ciec deben alinear Nombre a la izquierda con clase grid-row');
      assert(rendered.includes('TOTAL EQ. 0'), 'TotalEquipajePuerta en vivo vacío debe mostrar TOTAL EQ. 0 aunque DB tuviera registros');
      assert(rendered.includes('Aleros: ANTONIO CAC CUCUL, ANTONIO VINICIO RAX CAAL'), 'Aleros no resuelto correctamente en amx-ciec');
      assert(rendered.includes('Tractorista y No. Unidad: ERWIN MARROQUIN / AT-212'), 'Tractorista y No. Unidad faltante en amx-ciec');
      assert((rendered.match(/<tr class="grid-row">/g) || []).length >= 32, 'amx-ciec debe renderizar al menos 32 filas en FilasInOutHTML');
    }

    if (target.formatoId === 'amx-cec') {
      assert(rendered.includes('min-height: 297mm;'), 'Falta punto y coma CSS en .page de amx-cec');
      assert(rendered.includes('KARLA ORTIZ'), 'Supervisor debe mostrarse en amx-cec cuando llega como supervisorNombre');
      assert(/COMPARTIMENTO No\.<\/span>\s*<div class='info-line'>2<\/div>/.test(rendered), 'Compartimiento No. faltante en amx-cec');
      assert(rendered.includes('EMBARQUE, No. VUELO: <div class=\'line\'>673</div>'), 'VueloEmbarque debe separarse a 673 para 672/673 en amx-cec');
      assert(rendered.includes('DESEMBARQUE, No. VUELO: <div class=\'line\'>672</div>'), 'VueloDesembarque debe separarse a 672 para 672/673 en amx-cec');
      assert(rendered.includes('padding: 10px; border: 1px solid black;'), 'Faltan filas vacías inferiores en TablaPersonalHTML de amx-cec');
      assert(rendered.includes('✗') && rendered.includes('color: red;'), 'Tache rojo ✗ faltante en amx-cec');
      assert(rendered.includes('white-space: pre-line;'), 'Observaciones de amx-cec deben soportar saltos de línea');
    }

    if (target.formatoId === 'amx-po') {
      assert(rendered.includes('size: A4 landscape;'), 'amx-po debe mantener @page A4 landscape');
      assert(rendered.includes('table-layout: fixed;'), 'amx-po debe usar table-layout: fixed');
      assert(rendered.includes('white-space: pre-line;'), 'Observaciones de amx-po deben soportar saltos de línea');
      assert(rendered.includes('KARLA ORTIZ'), 'Supervisor debe resolverse desde LoginId en amx-po');
      assert(rendered.includes('ANDRES RIVERA'), 'LeadAgent debe mostrarse en amx-po');
      assert(rendered.includes('2026-01-01'), 'Fecha ISO debe mostrarse en amx-po');
      assert(rendered.includes('text-align: left;'), 'Agentes de amx-po deben alinearse a la izquierda');
      assert(rendered.includes('AGENTE DOS') && rendered.includes('>X<'), 'Matriz PO debe marcar X en posiciones asignadas');
      assert(rendered.includes('Segunda línea PO'), 'Observaciones multilínea faltantes en amx-po');
      assert(rendered.includes(dummySig), 'FirmaSupervisor desde firmasRepo debe renderizarse en amx-po');
    }

    if (target.formatoId === 'amx-er') {
      assert(rendered.includes('size: A4 landscape;'), 'amx-er debe definir @page A4 landscape');
      assert(rendered.includes('AGENTE DE SEGURIDAD AMX DURANTE LA INSPECCIÓN'), 'amx-er debe mostrar encabezado AMX');
      assert(rendered.includes('01/01/2026'), 'amx-er debe formatear FECHA como dd/MM/yyyy');
      assert(rendered.includes('ZOILA GARCIA'), 'amx-er persistido debe conservar el creador ZOILA GARCIA');
      assert(rendered.includes('Cesar Pop') && rendered.includes('452376'), 'Filas de DetalleControlER faltantes en amx-er');
      assert(rendered.includes('Línea 2 ER') && rendered.includes('white-space: pre-line;'), 'Observaciones multilínea faltantes en amx-er');
      assert(rendered.includes(dummySig), 'FirmaFinal desde firmasRepo debe renderizarse en amx-er');
    }

    if (target.formatoId === 'amx-mecd') {
      assert(rendered.includes('background-color: #ffffff;'), 'amx-mecd debe renderizarse sobre fondo blanco #ffffff');
      assert(rendered.includes('size: A4 portrait;'), 'amx-mecd debe definir @page A4 portrait');
      assert(rendered.includes('2026-01-01'), 'amx-mecd debe mostrar FECHA en formato ISO YYYY-MM-DD');
      assert(rendered.includes('00001') && rendered.includes('127596') && rendered.includes('Pasajero Tobogán'), 'Tablas MECD incompletas');
      assert(rendered.includes('MARIO LARIOS') && rendered.includes('RUBEN GONZALEZ') && rendered.includes('JAIME RAMIREZ'), 'Nombres de firmantes persistidos faltantes en amx-mecd');
      assert(rendered.includes(dummySig), 'FirmaAgente desde firmasRepo debe renderizarse en amx-mecd');
      const sigPngHits = rendered.split(dummySig).length - 1;
      assert.strictEqual(sigPngHits, 1, 'Solo firmaAgente debe usar dummySig; firmas vacías deben usar BLANK_IMG sin duplicarse');
    }

    if (target.formatoId.startsWith('dl-')) {
      assert(rendered.includes('background-color: #ffffff;'), `${target.formatoId} debe renderizarse sobre fondo blanco #ffffff`);
      assert(!/onerror\s*=/i.test(rendered), `${target.formatoId} no debe tener atributos inline onerror (Helmet CSP)`);
    }

    if (target.formatoId === 'dl-cp') {
      assert(rendered.includes('ANTONIO CAC, VINICIO RAX'), 'Aleros unificados faltantes en dl-cp');
      assert(rendered.includes('ERWIN MARROQUIN / AT-212'), 'TractoristaUnidad faltante en dl-cp');
      assert(rendered.includes('08:00 / 11'), 'HoraInicioPuerta faltante en dl-cp');
    }

    if (target.formatoId === 'dl-ciec') {
      assert(rendered.includes('101, 102'), 'EquipajePuertaHTML en dl-ciec debe ser lista separada por comas (_secuenciasTexto)');
      assert(!rendered.includes('#94a3b8'), 'dl-ciec no debe renderizar tabla 5x10 con bordes #94a3b8 en EquipajePuertaHTML');
      assert(rendered.includes('01/01/2026'), 'dl-ciec debe formatear Fecha como dd/MM/yyyy');
    }

    if (target.formatoId === 'dl-er') {
      assert(!rendered.includes('SECUENCIA'), 'dl-er no debe mostrar columna SECUENCIA (formato DELTA de 8 columnas)');
      assert(rendered.includes('class="col-no"') && rendered.includes('class="col-agente2"'), 'dl-er debe renderizar clases col-no..col-agente2');
      assert(rendered.includes('<td class="col-destino" style="text-align:center;">N/A</td>'), 'dl-er debe mostrar N/A en DESTINO en filas vacías');
      assert(rendered.includes(dummySig), 'FirmaSeguridadAerolinea desde firmasRepo debe renderizarse en dl-er');
    }

    if (target.formatoId === 'dl-cec') {
      assert(rendered.includes('EQUIPAJE MOSTRADOR') && rendered.includes('EQUIPAJE POR PUERTA') && rendered.includes('TOTAL EQ.: 98'), 'TablaEmbarqueHTML DELTA de 8 filas faltante en dl-cec');
      assert(rendered.includes('TOTAL CARGA: 15'), 'TOTAL CARGA de Embarque faltante en dl-cec');
      assert(rendered.includes('TOTAL EQ.: 89') && rendered.includes('TOTAL CARGA: 12'), 'TablaDesembarqueHTML DELTA de 6 filas faltante en dl-cec');
      assert(!rendered.includes('EQUIPAJES DAÑADOS LLEGANDO'), 'dl-cec no debe mostrar EQUIPAJES DAÑADOS LLEGANDO de Aeroméxico');
    }

    if (target.formatoId === 'dl-rx') {
      assert(rendered.includes('01/01/2026'), 'dl-rx debe mostrar FECHA en formato dd/MM/yyyy');
      assert(rendered.includes('Observacion RX Singular'), 'dl-rx debe hidratar encDb.Observacion singular desde SQL');
      assert(rendered.includes('SAG-01') && rendered.includes('9710'), 'Tablas PERSONAL SAG y PERSONAL LAATS faltantes en dl-rx');
    }

    if (target.formatoId === 'dl-cll') {
      assert(rendered.includes('01/01/2026'), 'dl-cll debe mostrar DATE en formato dd/MM/yyyy');
      assert(rendered.includes('ROBERTO GOMEZ') && rendered.includes('7744'), 'dl-cll debe separar AgenteDelta en AgenteLD y TiaLD');
      assert(rendered.includes('006-12345675') && rendered.includes('PERISHABLES'), 'TablaHTML faltante en dl-cll');
      assert(rendered.includes(dummySig), 'Firmas desde firmasRepo deben renderizarse en dl-cll');
    }

    if (target.formatoId === 'dl-sp') {
      assert(rendered.includes('01/01/2026'), 'dl-sp debe mostrar DATE en formato dd/MM/yyyy');
      assert(rendered.includes('38A') && rendered.includes('20E'), 'Filas TablaPaxHTML faltantes en dl-sp');
      assert(rendered.includes(dummySig), 'firmaScreener desde firmasRepo debe renderizarse en la columna 7 de dl-sp');
    }

    if (target.formatoId === 'dl-dal') {
      assert(rendered.includes('01/01/2026'), 'dl-dal debe mostrar DATE en formato dd/MM/yyyy');
      assert(rendered.includes('Guardia Escolta'), 'BagsEscortedSig debe renderizar NombreGuardiaEscolta en dl-dal');
      assert(rendered.includes('2 - Juan Perez, Ana Lopez'), 'NamesMissingPassengers debe mostrarse en dl-dal');
      assert(rendered.includes(dummySig), 'Firmas desde firmasRepo deben renderizarse en dl-dal');
    }

    if (target.formatoId === 'dl-sel') {
      assert(rendered.includes('01/01/2026'), 'dl-sel debe mostrar DATE y AIRCRAFT ARRIVED en formato dd/MM/yyyy');
      assert(rendered.includes('07:30') && rendered.includes('09:22'), 'Tiempos de eventos y arribo faltantes en dl-sel');
      assert(rendered.includes('Operacion SEL'), 'Comments limpios sin tag SEL_META deben mostrarse en dl-sel');
      assert(!rendered.includes('SEL_META'), 'Tag interno SEL_META no debe filtrarse al HTML de dl-sel');
      assert(rendered.includes(dummySig), 'FirmaSupervisor desde firmasRepo debe renderizarse en dl-sel');
    }
  }

  const resolvedSup = HtmlPreviewService.resolvePersonaNombre('289', null, {
    supervisores: [{ LoginId: 10, EmpleadoId: 289, Usuario: 'KARLA ORTIZ' }]
  });
  assert.strictEqual(resolvedSup, 'KARLA ORTIZ');

  // 5. Validar convención universal de nombres HTML (<Vuelo>_<Matricula>_<Formato>_<Id|PRELIMINAR>.html)
  const docEbSaved = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '678/679', Matricula: '' },
    formatoMeta: { nombre: 'Control de Equipajes en Banda de Salida (Rayos X)' },
    encabezadoId: 70
  });
  assert.strictEqual(docEbSaved.documentBaseName, '678_679_NA_Control de Equipajes en Banda de Salida (Rayos X)_70');
  assert.strictEqual(docEbSaved.fileName, '678_679_NA_Control de Equipajes en Banda de Salida (Rayos X)_70.html');

  const docCecSaved = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '672/673', Matricula: '' },
    formatoMeta: { nombre: 'Control de Equipajes en Compartimentos' },
    encabezadoId: 1
  });
  assert.strictEqual(docCecSaved.documentBaseName, '672_673_NA_Control de Equipajes en Compartimentos_1');
  assert.strictEqual(docCecSaved.fileName, '672_673_NA_Control de Equipajes en Compartimentos_1.html');

  const docCpSaved = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '672/673', Matricula: '' },
    formatoMeta: { nombre: 'Control de Perimétrica (unificado)' },
    encabezadoId: 1
  });
  assert.strictEqual(docCpSaved.fileName, '672_673_NA_Control de Perimétrica (unificado)_1.html');

  const docPoSaved = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '672/673', Matricula: '' },
    formatoMeta: { nombre: 'Puestos por Operación' },
    encabezadoId: 1
  });
  assert.strictEqual(docPoSaved.fileName, '672_673_NA_Puestos por Operación_1.html');

  const docErSaved = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '671', Matricula: '' },
    formatoMeta: { nombre: 'Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x)' },
    encabezadoId: 1
  });
  assert.strictEqual(docErSaved.fileName, '671_NA_Control de Equipaje en Revisión AVSEC_SGDAIA Banda de Salida (rayos x)_1.html');

  const docMecdSaved = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '671', Matricula: '' },
    formatoMeta: { nombre: 'Equipajes en mal estado y carga dañada' },
    encabezadoId: 1
  });
  assert.strictEqual(docMecdSaved.fileName, '671_NA_Equipajes en mal estado y carga dañada_1.html');

  // Validar limpieza automática de <img src=""> cuando una firma opcional aún no está registrada
  const poNoSigRendered = HtmlPreviewService.renderHtmlPreview({
    formatoId: 'amx-po',
    vars: HtmlPreviewService.buildAeromexicoOtherData({
      formatoId: 'amx-po',
      formDatos: { poPayload: { fecha: '2026-01-01', supervisorLoginId: 210, registros: [{ PosicionId: 1, Agentes: 'AGENTE SIN FIRMA' }] } },
      hydrated: { catalogos: { supervisores: [{ LoginId: 210, Usuario: 'KARLA ORTIZ' }] } },
      vuelo: { novuelo: '678/679', Matricula: 'N188AM', FechaItinerado: '2026-01-01' },
      user: userMock
    }),
    documentTitle: '678_679_N188AM_Puestos por Operación_PRELIMINAR'
  });
  assert(!/<img\b[^>]*\bsrc=["']\s*["']/i.test(poNoSigRendered), 'No debe quedar <img src=""> vacío en amx-po sin firma');

  // Validar reglas obligatorias de amx-po con Firma Digital requerida
  const poValEmpty = FormatoValidationService.validarPuestosOperacion(
    { itinerarioId: 39901, FechaItinerado: '2026-01-01', datos: { poPayload: {} } },
    userMock,
    { ItinerarioId: 39901, FechaItinerado: '2026-01-01' },
    { requerirFirma: true }
  );
  assert.strictEqual(poValEmpty.valido, false, 'amx-po vacío debe ser inválido');
  assert(poValEmpty.errors.some(e => e.field === 'supervisorLoginId'), 'amx-po debe exigir supervisorLoginId');
  assert(poValEmpty.errors.some(e => e.field === 'firmaSupervisor'), 'amx-po debe exigir firmaSupervisor');
  assert(poValEmpty.errors.some(e => e.field === 'registros'), 'amx-po debe exigir registros');

  const poValOk = FormatoValidationService.validarPuestosOperacion(
    {
      itinerarioId: 39901,
      FechaItinerado: '2026-01-01',
      datos: {
        poPayload: {
          supervisorLoginId: 210,
          firmaSupervisor: dummySig,
          registros: [{ EmpleadoId: 101, PosicionId: 1, Agentes: 'AGENTE TEST' }]
        }
      }
    },
    userMock,
    { ItinerarioId: 39901, FechaItinerado: '2026-01-01' },
    { requerirFirma: true }
  );
  assert.strictEqual(poValOk.valido, true, 'amx-po completo debe ser válido');

  await runSignatureRepositoryChecks();

  const docCiecSaved = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '672/673', Matricula: '' },
    formatoMeta: { nombre: 'Control de ingreso y egreso cabina aeronave' },
    encabezadoId: 1
  });
  assert.strictEqual(docCiecSaved.fileName, '672_673_NA_Control de ingreso y egreso cabina aeronave_1.html');

  // Validar FormatoValidationService.validarControlCP
  const cpInv = FormatoValidationService.validarControlCP(
    { itinerarioId: 39901, datos: { cpPayload: { fecha: '2026-01-01', horaInicio: '', supervisorEmpleadoId: 0, registros: [] } } },
    userMock,
    { itinerarioId: 39901, FechaItinerado: '2026-01-01' }
  );
  assert.strictEqual(cpInv.valido, false, 'validarControlCP debe rechazar horaInicio y supervisor faltantes');
  assert(cpInv.errors.length >= 2, 'validarControlCP debe devolver errores estructurados');

  const cpPend = FormatoValidationService.validarControlCP(
    {
      itinerarioId: 39901,
      datos: {
        cpPayload: {
          fecha: '2026-01-01',
          horaInicio: '10:45',
          supervisorEmpleadoId: 289,
          registros: [{ Nombre: 'Brandon', NoTIA: '470', Empresa: 'LAATS', HoraIngreso: '10:46', Motivo: 'Insp', HoraSalida: '' }]
        }
      }
    },
    userMock,
    { itinerarioId: 39901, FechaItinerado: '2026-01-01' }
  );
  assert.strictEqual(cpPend.valido, false, 'validarControlCP debe bloquear persona sin HoraSalida');

  const cpOk = FormatoValidationService.validarControlCP(
    {
      itinerarioId: 39901,
      datos: {
        cpPayload: {
          fecha: '2026-01-01',
          horaInicio: '10:45',
          supervisorEmpleadoId: 289,
          registros: [{ Nombre: 'Brandon', NoTIA: '470', Empresa: 'LAATS', HoraIngreso: '10:46', Motivo: 'Insp', HoraSalida: '10:55' }]
        }
      }
    },
    userMock,
    { itinerarioId: 39901, FechaItinerado: '2026-01-01' }
  );
  assert.strictEqual(cpOk.valido, true, 'validarControlCP debe aceptar payload completo válido');

  const docErPrelim = HtmlPreviewService.buildDocumentName({
    vuelo: { novuelo: '1803/1803', Matricula: 'N418LA' },
    formatoMeta: { nombre: 'Control de Equipaje en Revisión AVSEC/SGDAIA Banda de Salida (rayos x)' },
    encabezadoId: null
  });
  assert.strictEqual(docErPrelim.fileName, '1803_1803_N418LA_Control de Equipaje en Revisión AVSEC_SGDAIA Banda de Salida (rayos x)_PRELIMINAR.html');

  const cdHeader = HtmlPreviewService.buildContentDispositionHeader('678_679_NA_Control de Equipajes en Banda de Salida (Rayos X)_70.html\r\nEvil: 1');
  assert(!/[\r\n]/.test(cdHeader), 'Content-Disposition no debe permitir CRLF');
  assert(!cdHeader.includes('Evil'), 'Content-Disposition no debe incluir texto después de CRLF');
  assert(cdHeader.includes('filename="678_679_NA_Control de Equipajes en Banda de Salida (Rayos X)_70.html"'));

  // 6. Verificar que window.SioFormatValidator exporta focusAndAlert y todos los métodos invocados por public/js/*.js
  const validatorSrc = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'formato-validator.js'), 'utf8');
  const exportMatch = validatorSrc.match(/window\.SioFormatValidator\s*=\s*\{([\s\S]*?)\};/);
  assert(exportMatch, 'No se encontró export window.SioFormatValidator en public/js/formato-validator.js');
  assert(/\bfocusAndAlert\b/.test(exportMatch[1]) && /\bnotifyValidationErrors\b/.test(exportMatch[1]), 'SioFormatValidator debe exportar focusAndAlert y notifyValidationErrors');

  console.log(`  ✔ Verificadas ${allFormatIds.length} plantillas HTML, matriz EB, nombres estándar, SioFormatValidator y renderizado anti-XSS en ${previewTargets.length} formatos representativos.`);
}

async function runSignatureRepositoryChecks() {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const SignatureRepositoryService = require(path.join(ROOT_DIR, 'services', 'SignatureRepositoryService'));
  const HtmlPreviewService = require(path.join(ROOT_DIR, 'services', 'HtmlPreviewService'));

  const prevCacheDir = process.env.SIGNATURES_CACHE_DIR;
  const prevMode = process.env.GITHUB_SIGNATURES_MODE;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sio-firmas-ci-'));

  const sigPng1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const sigPng2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  try {
    process.env.SIGNATURES_CACHE_DIR = tmpDir;
    process.env.GITHUB_SIGNATURES_MODE = 'offline';

    // 1. Mapeo de familias de firma
    assert.strictEqual(SignatureRepositoryService.resolveFamily('amx-po'), 'po');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('dl-er'), 'er');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('amx-mecd'), 'mecd');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('dl-cll'), 'cll');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('dl-sp'), 'sp');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('dl-dal'), 'dal');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('dl-sel'), 'sel');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('ac-ass'), 'ass');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('ac-anexob'), 'anexob');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('latam-liadc'), 'liadc');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('ajt-lisa'), 'lisa');
    assert.strictEqual(SignatureRepositoryService.resolveFamily('amx-eb'), null);

    // 2. Registro permanente + inmutabilidad (bloqueo ante sobrescritura/borrado) en las 10 familias
    const familyCases = [
      { formatoId: 'amx-po', container: 'poPayload', keys: ['firmaSupervisor'] },
      { formatoId: 'amx-er', container: 'erPayload', keys: ['firmaBase64'] },
      { formatoId: 'amx-mecd', container: 'mecdPayload', keys: ['firmaCCO', 'firmaAgente', 'firmaSupervisor'] },
      { formatoId: 'dl-cll', container: 'cllPayload', keys: ['firmaSecurity', 'firmaLD'] },
      { formatoId: 'dl-sp', container: 'spPayload', keys: ['firmaScreener'] },
      { formatoId: 'dl-dal', container: 'dalPayload', keys: ['firmaGuardSup', 'firmaDLAgent'] },
      { formatoId: 'dl-sel', container: 'selPayload', keys: ['firmaSupervisor'] },
      { formatoId: 'ac-ass', container: 'assPayload', keys: ['signature'] },
      { formatoId: 'ac-anexob', container: 'anexoBPayload', keys: ['leadSignature', 'csmSignature'] },
      { formatoId: 'latam-liadc', container: 'liadcPayload', keys: ['firmaInspector', 'firmaSupervisor'] },
      { formatoId: 'ajt-lisa', container: 'lisaPayload', keys: ['firmaInspector'] }
    ];

    for (let i = 0; i < familyCases.length; i++) {
      const fc = familyCases[i];
      const encId = 5000 + i;
      const familia = SignatureRepositoryService.resolveFamily(fc.formatoId);

      const buildPayload = (val) => {
        const inner = {};
        for (const k of fc.keys) inner[k] = val;
        return { datos: { [fc.container]: inner } };
      };

      const preSave = await SignatureRepositoryService.resolverFirmasConBloqueo({
        formatoId: fc.formatoId,
        encabezadoId: null,
        payload: buildPayload(sigPng1)
      });
      for (const k of fc.keys) {
        assert.strictEqual(preSave.effectiveSignatures[k], sigPng1, `Pre-save debe conservar ${k} en ${fc.formatoId}`);
      }

      const synced = await SignatureRepositoryService.sincronizarFirmasGuardado({
        formatoId: fc.formatoId,
        encabezadoId: encId,
        itinerarioId: 39901,
        vuelo: '672/673',
        fecha: '2026-01-01',
        usuario: 'ANDRES RIVERA',
        effectiveSignatures: preSave.effectiveSignatures
      });

      assert.strictEqual(synced.allLocked, true, `${fc.formatoId} debe quedar allLocked=true`);
      assert.strictEqual(synced.newlyRegistered.length, fc.keys.length, `${fc.formatoId} debe registrar todas sus firmas`);

      const recordDir = path.join(tmpDir, familia, String(encId));
      const manifestPath = path.join(recordDir, 'manifest.json');
      assert(fs.existsSync(manifestPath), `Falta manifest.json en ${fc.formatoId}`);
      const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
      assert(!/ghp_|github_pat_/i.test(manifestRaw), `manifest.json no debe contener tokens en ${fc.formatoId}`);
      for (const k of fc.keys) {
        assert(fs.existsSync(path.join(recordDir, `${k}.png`)), `Falta archivo PNG ${k}.png en ${fc.formatoId}`);
      }

      // Reconsulta / reanudación: debe restaurar firma exacta con locked=true
      const reloaded = await SignatureRepositoryService.cargarFirmasParaFormato({
        formatoId: fc.formatoId,
        encabezadoId: encId
      });
      assert.strictEqual(reloaded.allLocked, true, `Reconsulta ${fc.formatoId} debe mantener allLocked=true`);
      for (const k of fc.keys) {
        assert.strictEqual(reloaded.firmas[k].locked, true, `${fc.formatoId}.${k} debe iniciar bloqueado al reanudar`);
        assert.strictEqual(reloaded.firmas[k].dataUrl, sigPng1, `${fc.formatoId}.${k} debe restaurar imagen exacta`);
      }

      // Intento de sobrescritura o borrado por payload manipulado debe ser rechazado silenciosamente manteniendo sigPng1
      for (const tamperedVal of [sigPng2, '']) {
        const blocked = await SignatureRepositoryService.resolverFirmasConBloqueo({
          formatoId: fc.formatoId,
          encabezadoId: encId,
          payload: buildPayload(tamperedVal)
        });
        for (const k of fc.keys) {
          assert.strictEqual(
            blocked.effectiveSignatures[k],
            sigPng1,
            `Bloqueo falló al intentar alterar ${fc.formatoId}.${k}`
          );
        }
        const reSync = await SignatureRepositoryService.sincronizarFirmasGuardado({
          formatoId: fc.formatoId,
          encabezadoId: encId,
          effectiveSignatures: blocked.effectiveSignatures
        });
        assert.strictEqual(reSync.newlyRegistered.length, 0, `${fc.formatoId} no debe re-registrar firmas bloqueadas`);
      }

      // Proyección en Vista Preliminar sin firma en vivo en formDatos
      const previewVars = HtmlPreviewService.buildAeromexicoOtherData({
        formatoId: fc.formatoId,
        formDatos: { [fc.container]: {} },
        hydrated: {
          firmasRepo: reloaded,
          spState: { detalles: [{ Apellido: 'TEST', Nombre: 'PAX', SeleccionSPId: 1, Asiento: '1A', BCN: '1', NombreAgente: 'ANDRES RIVERA' }] }
        },
        vuelo: { novuelo: '672/673', Matricula: '', FechaItinerado: '2026-01-01' },
        user: { empleadoId: 263, usuario: 'ANDRES RIVERA', puesto: 'SUPERVISOR' }
      });
      assert(
        Object.values(previewVars).some(v => typeof v === 'string' && v.includes(sigPng1)),
        `Vista preliminar debe recuperar firma bloqueada de firmasRepo para ${fc.formatoId}`
      );
    }

    // 3. Bloqueo parcial independiente en formatos multi-firma (ej. amx-mecd)
    await SignatureRepositoryService.sincronizarFirmasGuardado({
      formatoId: 'amx-mecd',
      encabezadoId: 9901,
      itinerarioId: 39901,
      vuelo: '672/673',
      fecha: '2026-01-01',
      usuario: 'ANDRES RIVERA',
      effectiveSignatures: { firmaAgente: sigPng1 }
    });
    const mecdPartial = await SignatureRepositoryService.cargarFirmasParaFormato({
      formatoId: 'amx-mecd',
      encabezadoId: 9901
    });
    assert.strictEqual(mecdPartial.firmas.firmaAgente.locked, true);
    assert.strictEqual(mecdPartial.firmas.firmaCCO.locked, false);
    assert.strictEqual(mecdPartial.firmas.firmaSupervisor.locked, false);
    assert.strictEqual(mecdPartial.anyLocked, true);
    assert.strictEqual(mecdPartial.allLocked, false);

    // Segundo guardado: intenta alterar firmaAgente (bloqueada) pero agrega firmaCCO (nueva)
    const mecdSecondResolve = await SignatureRepositoryService.resolverFirmasConBloqueo({
      formatoId: 'amx-mecd',
      encabezadoId: 9901,
      payload: { datos: { mecdPayload: { firmaAgente: sigPng2, firmaCCO: sigPng2 } } }
    });
    assert.strictEqual(mecdSecondResolve.effectiveSignatures.firmaAgente, sigPng1, 'firmaAgente bloqueada no debe cambiar');
    assert.strictEqual(mecdSecondResolve.effectiveSignatures.firmaCCO, sigPng2, 'firmaCCO pendiente debe aceptarse');

    const mecdSecondSync = await SignatureRepositoryService.sincronizarFirmasGuardado({
      formatoId: 'amx-mecd',
      encabezadoId: 9901,
      effectiveSignatures: mecdSecondResolve.effectiveSignatures
    });
    assert.deepStrictEqual(mecdSecondSync.newlyRegistered, ['firmaCCO']);
    assert.strictEqual(mecdSecondSync.firmas.firmaAgente.dataUrl, sigPng1);
    assert.strictEqual(mecdSecondSync.firmas.firmaCCO.locked, true);
    assert.strictEqual(mecdSecondSync.firmas.firmaCCO.dataUrl, sigPng2);
    assert.strictEqual(mecdSecondSync.firmas.firmaSupervisor.locked, false);

    // 4. Respaldo legado SQL + resumen cliente seguro
    const legacyState = await SignatureRepositoryService.cargarFirmasParaFormato({
      formatoId: 'ac-anexob',
      encabezadoId: 9902,
      legacySignatures: { leadSignature: sigPng1 }
    });
    assert.strictEqual(legacyState.firmas.leadSignature.locked, true);
    assert.strictEqual(legacyState.firmas.leadSignature.source, 'legacy-sql');
    assert.strictEqual(legacyState.firmas.csmSignature.locked, false);

    const summary = SignatureRepositoryService.toClientSummary(mecdSecondSync);
    assert.strictEqual(summary.familia, 'mecd');
    assert.strictEqual(summary.encabezadoId, 9901);
    assert.strictEqual(summary.firmas.firmaCCO.locked, true);

    // 5. Verificar arquitectura Offline-First (Service Worker, Offline Manager, Tab Bar Indicator y Plantillas Offline)
    const swPath = path.join(ROOT_DIR, 'public', 'sw.js');
    const offlineMgrPath = path.join(ROOT_DIR, 'public', 'js', 'offline-manager.js');
    assert(fs.existsSync(swPath), 'Falta Service Worker public/sw.js');
    assert(fs.existsSync(offlineMgrPath), 'Falta motor public/js/offline-manager.js');
    const offlineMgrSrc = fs.readFileSync(offlineMgrPath, 'utf8');
    assert(offlineMgrSrc.includes('sio_laats_offline_db') && offlineMgrSrc.includes('pending_sync_queue') && offlineMgrSrc.includes('/api/health'), 'offline-manager.js debe implementar IndexedDB (drafts + pending_sync_queue) y heartbeat /api/health');

    // 5.1 Borrador local: modal superpuesto de decisión (sin banner incrustado ni botón de vista preliminar offline)
    assert(
      offlineMgrSrc.includes('promptDraftDecision') &&
        offlineMgrSrc.includes('Continuar donde lo dejé') &&
        offlineMgrSrc.includes('Empezar uno de nuevo') &&
        offlineMgrSrc.includes('GENERIC_ROW_GRIDS'),
      'offline-manager.js debe ofrecer el modal "Continuar donde lo dejé" / "Empezar uno de nuevo" y restaurar tablas dinámicas'
    );
    assert(!/sioOfflineDraftBanner|btnOfflinePreviewBanner|btnOfflineDiscardDraft/.test(offlineMgrSrc), 'offline-manager.js no debe referenciar el antiguo banner de borrador');
    const formatoDetalleEjs = fs.readFileSync(path.join(ROOT_DIR, 'views', 'formato_detalle.ejs'), 'utf8');
    assert(!/sioOfflineDraftBanner|btnOfflinePreviewBanner|btnOfflineDiscardDraft|sio-offline-draft-banner/.test(formatoDetalleEjs), 'formato_detalle.ejs no debe incluir el antiguo banner amarillo de borrador local');

    const tabBarEjs = fs.readFileSync(path.join(ROOT_DIR, 'views', 'partials', 'tab-bar.ejs'), 'utf8');
    assert(tabBarEjs.includes('btnTabNetworkStatus') && tabBarEjs.includes('tabNetworkPendingBadge'), 'tab-bar.ejs debe incluir el indicador de señal y contador de cola offline');

    const rawErTpl = HtmlPreviewService.readRawTemplate('amx-er');
    assert(rawErTpl && rawErTpl.includes('CONTROL DE EQUIPAJE EN REVISIÓN'), 'HtmlPreviewService.readRawTemplate debe retornar plantilla controlada para modo offline');
  } finally {
    if (prevCacheDir === undefined) delete process.env.SIGNATURES_CACHE_DIR;
    else process.env.SIGNATURES_CACHE_DIR = prevCacheDir;
    if (prevMode === undefined) delete process.env.GITHUB_SIGNATURES_MODE;
    else process.env.GITHUB_SIGNATURES_MODE = prevMode;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const runAll = args.size === 0 || args.has('--all');

  if (runAll || args.has('--security')) runSecurityChecks();
  if (runAll || args.has('--syntax')) runSyntaxChecks();
  if (runAll || args.has('--unit')) await runUnitChecks();

  console.log('\n✔ TODAS LAS VALIDACIONES CI PASARON EXITOSAMENTE.');
}

main().catch((err) => {
  console.error('\n✖ ERROR EN VALIDACIONES CI:', err);
  process.exit(1);
});
