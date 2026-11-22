/**
 * SignatureRepositoryService - SIO LAATS Formatos SEC
 * Repositorio permanente e inmutable de firmas digitales en GitHub (+ caché local .firmas-cache).
 *
 * Responsabilidades:
 * 1. Persistir cada firma digital capturada como archivo binario PNG en el repositorio GitHub:
 *    firmas/<familia>/<encabezadoId>/<firmaKey>.png + manifest.json (con [skip ci]).
 * 2. Bloquear de forma permanente cualquier firma ya registrada: ni el Frontend ni un POST
 *    manipulado pueden borrar o sobreescribir una firma existente.
 * 3. Recuperar firmas desde GitHub o caché local al consultar, reanudar o generar Vista Preliminar.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const FAMILY_SIGNATURES = Object.freeze({
  po: ['firmaSupervisor'],
  er: ['firmaBase64'],
  mecd: ['firmaCCO', 'firmaAgente', 'firmaSupervisor'],
  cll: ['firmaSecurity', 'firmaLD'],
  sp: ['firmaScreener'],
  dal: ['firmaGuardSup', 'firmaDLAgent'],
  sel: ['firmaSupervisor'],
  ass: ['signature'],
  anexob: ['leadSignature', 'csmSignature'],
  liadc: ['firmaInspector', 'firmaSupervisor'],
  lisa: ['firmaInspector']
});

const DATA_URL_REGEX = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i;
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024; // 5 MB

let _commitQueue = Promise.resolve();

class SignatureRepositoryService {
  static getFamilyMap() {
    return FAMILY_SIGNATURES;
  }

  /**
   * Resuelve la familia canónica a partir de un formatoId (ej. 'amx-po' -> 'po', 'dl-er' -> 'er').
   */
  static resolveFamily(formatoIdOrFamily = '') {
    const raw = String(formatoIdOrFamily || '').trim().toLowerCase();
    if (!raw) return null;
    if (Object.prototype.hasOwnProperty.call(FAMILY_SIGNATURES, raw)) {
      return raw;
    }
    const lastDash = raw.lastIndexOf('-');
    if (lastDash >= 0) {
      const suffix = raw.slice(lastDash + 1);
      if (Object.prototype.hasOwnProperty.call(FAMILY_SIGNATURES, suffix)) {
        return suffix;
      }
    }
    return null;
  }

  static getAllowedKeys(formatoIdOrFamily) {
    const familia = SignatureRepositoryService.resolveFamily(formatoIdOrFamily);
    return familia ? [...FAMILY_SIGNATURES[familia]] : [];
  }

  static getConfig() {
    const token = String(process.env.GITHUB_TOKEN || '').trim();
    const owner = String(process.env.GITHUB_SIGNATURES_OWNER || 'andresrivera9710').trim();
    const repo = String(process.env.GITHUB_SIGNATURES_REPO || 'formatos-sec-sql').trim();
    const branch = String(process.env.GITHUB_SIGNATURES_BRANCH || 'main').trim();
    const baseDir = String(process.env.GITHUB_SIGNATURES_DIR || 'firmas')
      .trim()
      .replace(/^\/+|\/+$/g, '') || 'firmas';
    const cacheRoot = String(
      process.env.SIGNATURES_CACHE_DIR || path.join(__dirname, '..', '.firmas-cache')
    ).trim();
    const mode = String(process.env.GITHUB_SIGNATURES_MODE || '').trim().toLowerCase();
    const remoteEnabled = Boolean(token) && mode !== 'offline' && mode !== 'disabled';

    return {
      token,
      owner,
      repo,
      branch,
      baseDir,
      cacheRoot,
      remoteEnabled
    };
  }

  static _sanitizeSafeId(encabezadoId) {
    const n = parseInt(encabezadoId, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  static _sanitizeKey(familia, firmaKey) {
    const allowed = FAMILY_SIGNATURES[familia];
    if (!allowed) return null;
    const k = String(firmaKey || '').trim();
    return allowed.includes(k) ? k : null;
  }

  static _getLocalRecordDir(cfg, familia, encId) {
    const rootResolved = path.resolve(cfg.cacheRoot);
    const targetDir = path.resolve(rootResolved, familia, String(encId));
    if (!targetDir.startsWith(rootResolved + path.sep)) {
      throw new Error('Ruta de repositorio de firmas fuera de directorio permitido.');
    }
    return targetDir;
  }

  /**
   * Valida y decodifica un Data URL de firma digital en Buffer binario.
   */
  static parseSignatureDataUrl(rawVal) {
    const raw = String(rawVal || '').trim();
    if (!raw || raw.length < 80) return null;
    const match = raw.match(DATA_URL_REGEX);
    if (!match) return null;

    const mimeType = match[1].toLowerCase();
    const b64 = match[2];
    const buffer = Buffer.from(b64, 'base64');
    if (!buffer || buffer.length < 40 || buffer.length > MAX_SIGNATURE_BYTES) {
      return null;
    }

    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg')
      ? 'jpg'
      : (mimeType.includes('webp') ? 'webp' : 'png');
    const canonicalDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      mimeType,
      ext,
      buffer,
      dataUrl: canonicalDataUrl,
      sizeBytes: buffer.length,
      sha256
    };
  }

  static _buildGitHubUrls(cfg, repoPath) {
    const cleanPath = String(repoPath || '').replace(/^\/+/, '');
    const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
    return {
      githubUrl: `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/blob/${encodeURIComponent(cfg.branch)}/${encodedPath}`,
      rawUrl: `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${encodeURIComponent(cfg.branch)}/${encodedPath}`
    };
  }

  static _buildGitHubFolderUrl(cfg, familia, encId) {
    return `https://github.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/tree/${encodeURIComponent(cfg.branch)}/${encodeURIComponent(cfg.baseDir)}/${encodeURIComponent(familia)}/${encId}`;
  }

  static _githubRequest(cfg, method, apiPath, body = null, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const payload = body === null || body === undefined ? null : JSON.stringify(body);
      const req = https.request({
        hostname: 'api.github.com',
        path: apiPath,
        method,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'SIO-LAATS-FormatosSEC/1.0',
          'Accept': 'application/vnd.github+json',
          'Authorization': `token ${cfg.token}`,
          ...(payload ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          } : {})
        }
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { raw: text }; }
          resolve({ status: res.statusCode || 0, data: json });
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error(`GitHub API timeout (${method} ${apiPath})`));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  static async _fetchGitHubFileBuffer(cfg, repoPath) {
    const cleanPath = String(repoPath || '').replace(/^\/+/, '');
    const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
    const apiPath = `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(cfg.branch)}`;
    const res = await SignatureRepositoryService._githubRequest(cfg, 'GET', apiPath);
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`GitHub GET ${repoPath} HTTP ${res.status}: ${res.data?.message || 'Error desconocido'}`);
    }
    if (res.data?.content) {
      const cleanB64 = String(res.data.content).replace(/\s+/g, '');
      return Buffer.from(cleanB64, 'base64');
    }
    return null;
  }

  static _enqueueGitHubWrite(taskFn) {
    const next = _commitQueue.then(taskFn, taskFn);
    _commitQueue = next.catch(() => {});
    return next;
  }

  /**
   * Realiza 1 commit atómico en GitHub (Git Data API) con todos los PNG nuevos y manifest.json.
   */
  static async _commitFilesToGitHub(cfg, filesToCommit, commitMessage) {
    return SignatureRepositoryService._enqueueGitHubWrite(async () => {
      const owner = encodeURIComponent(cfg.owner);
      const repo = encodeURIComponent(cfg.repo);
      const branch = encodeURIComponent(cfg.branch);

      for (let attempt = 1; attempt <= 3; attempt++) {
        const refRes = await SignatureRepositoryService._githubRequest(
          cfg,
          'GET',
          `/repos/${owner}/${repo}/git/ref/heads/${branch}`
        );
        if (refRes.status !== 200 || !refRes.data?.object?.sha) {
          throw new Error(`No se pudo leer rama ${cfg.branch} en GitHub (HTTP ${refRes.status})`);
        }
        const latestCommitSha = refRes.data.object.sha;

        const commitRes = await SignatureRepositoryService._githubRequest(
          cfg,
          'GET',
          `/repos/${owner}/${repo}/git/commits/${latestCommitSha}`
        );
        if (commitRes.status !== 200 || !commitRes.data?.tree?.sha) {
          throw new Error(`No se pudo leer árbol base de commit en GitHub (HTTP ${commitRes.status})`);
        }
        const baseTreeSha = commitRes.data.tree.sha;

        const treeEntries = [];
        for (const item of filesToCommit) {
          const blobRes = await SignatureRepositoryService._githubRequest(
            cfg,
            'POST',
            `/repos/${owner}/${repo}/git/blobs`,
            {
              content: item.buffer.toString('base64'),
              encoding: 'base64'
            }
          );
          if (blobRes.status < 200 || blobRes.status >= 300 || !blobRes.data?.sha) {
            throw new Error(`No se pudo crear blob GitHub para ${item.repoPath} (HTTP ${blobRes.status})`);
          }
          treeEntries.push({
            path: item.repoPath,
            mode: '100644',
            type: 'blob',
            sha: blobRes.data.sha
          });
        }

        const treeRes = await SignatureRepositoryService._githubRequest(
          cfg,
          'POST',
          `/repos/${owner}/${repo}/git/trees`,
          {
            base_tree: baseTreeSha,
            tree: treeEntries
          }
        );
        if (treeRes.status < 200 || treeRes.status >= 300 || !treeRes.data?.sha) {
          throw new Error(`No se pudo crear árbol GitHub (HTTP ${treeRes.status})`);
        }

        const newCommitRes = await SignatureRepositoryService._githubRequest(
          cfg,
          'POST',
          `/repos/${owner}/${repo}/git/commits`,
          {
            message: commitMessage,
            tree: treeRes.data.sha,
            parents: [latestCommitSha]
          }
        );
        if (newCommitRes.status < 200 || newCommitRes.status >= 300 || !newCommitRes.data?.sha) {
          throw new Error(`No se pudo crear commit de firma en GitHub (HTTP ${newCommitRes.status})`);
        }

        const updRefRes = await SignatureRepositoryService._githubRequest(
          cfg,
          'PATCH',
          `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
          {
            sha: newCommitRes.data.sha,
            force: false
          }
        );

        if (updRefRes.status >= 200 && updRefRes.status < 300) {
          return {
            commitSha: newCommitRes.data.sha,
            commitUrl: newCommitRes.data.html_url || ''
          };
        }

        if ((updRefRes.status === 409 || updRefRes.status === 422) && attempt < 3) {
          continue;
        }
        throw new Error(`No se pudo actualizar referencia ${cfg.branch} en GitHub (HTTP ${updRefRes.status}: ${updRefRes.data?.message || ''})`);
      }

      throw new Error('Se agotaron los reintentos al actualizar rama de firmas en GitHub.');
    });
  }

  static _readLocalManifest(localDir) {
    const manifestPath = path.join(localDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  static _emptyRepoState({ formatoId = '', familia = null, encabezadoId = null, cfg = null } = {}) {
    const conf = cfg || SignatureRepositoryService.getConfig();
    const allowed = familia ? (FAMILY_SIGNATURES[familia] || []) : [];
    const firmas = {};
    for (const k of allowed) {
      firmas[k] = {
        key: k,
        exists: false,
        locked: false,
        dataUrl: '',
        githubUrl: '',
        rawUrl: '',
        repoPath: '',
        recordedAt: '',
        recordedBy: '',
        source: ''
      };
    }
    return {
      formatoId,
      familia,
      encabezadoId: encabezadoId || null,
      repoFolderUrl: (familia && encabezadoId)
        ? SignatureRepositoryService._buildGitHubFolderUrl(conf, familia, encabezadoId)
        : '',
      allLocked: allowed.length > 0 && allowed.every(k => firmas[k]?.locked),
      anyLocked: allowed.some(k => firmas[k]?.locked),
      firmas
    };
  }

  /**
   * Consulta y carga todas las firmas registradas para (formatoId, encabezadoId)
   * desde caché local / repositorio GitHub, con respaldo legado en SQL _META.
   */
  static async cargarFirmasParaFormato({ formatoId, encabezadoId, legacySignatures = {} } = {}) {
    const cfg = SignatureRepositoryService.getConfig();
    const familia = SignatureRepositoryService.resolveFamily(formatoId);
    const encId = SignatureRepositoryService._sanitizeSafeId(encabezadoId);

    if (!familia) {
      return SignatureRepositoryService._emptyRepoState({ formatoId, familia: null, encabezadoId: encId, cfg });
    }

    const baseState = SignatureRepositoryService._emptyRepoState({ formatoId, familia, encabezadoId: encId, cfg });
    if (!encId) {
      return baseState;
    }

    const allowedKeys = FAMILY_SIGNATURES[familia];
    const localDir = SignatureRepositoryService._getLocalRecordDir(cfg, familia, encId);
    let manifest = SignatureRepositoryService._readLocalManifest(localDir);

    const needsRemoteCheck = cfg.remoteEnabled && (
      !manifest ||
      allowedKeys.some(k => !manifest?.firmas?.[k]?.fileName)
    );

    if (needsRemoteCheck) {
      try {
        const manifestRepoPath = `${cfg.baseDir}/${familia}/${encId}/manifest.json`;
        const remoteBuf = await SignatureRepositoryService._fetchGitHubFileBuffer(cfg, manifestRepoPath);
        if (remoteBuf) {
          const remoteManifest = JSON.parse(remoteBuf.toString('utf8'));
          if (remoteManifest && typeof remoteManifest === 'object') {
            manifest = remoteManifest;
            fs.mkdirSync(localDir, { recursive: true });
            fs.writeFileSync(path.join(localDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
          }
        }
      } catch (ghErr) {
        console.warn(`[FIRMAS REPO WARN] No se pudo consultar manifest remoto (${familia}/${encId}): ${ghErr.message}`);
      }
    }

    if (manifest && manifest.firmas && typeof manifest.firmas === 'object') {
      for (const key of allowedKeys) {
        const entry = manifest.firmas[key];
        if (!entry || !entry.fileName) continue;

        const safeFile = path.basename(String(entry.fileName));
        const localImgPath = path.join(localDir, safeFile);
        let imgBuf = null;

        if (fs.existsSync(localImgPath)) {
          imgBuf = fs.readFileSync(localImgPath);
        } else if (cfg.remoteEnabled) {
          const remotePath = entry.repoPath || `${cfg.baseDir}/${familia}/${encId}/${safeFile}`;
          try {
            imgBuf = await SignatureRepositoryService._fetchGitHubFileBuffer(cfg, remotePath);
            if (imgBuf && imgBuf.length > 0) {
              fs.mkdirSync(localDir, { recursive: true });
              fs.writeFileSync(localImgPath, imgBuf);
            }
          } catch (imgErr) {
            console.warn(`[FIRMAS REPO WARN] No se pudo descargar imagen ${remotePath}: ${imgErr.message}`);
          }
        }

        if (imgBuf && imgBuf.length > 0) {
          const mimeType = entry.mimeType || 'image/png';
          const repoPath = entry.repoPath || `${cfg.baseDir}/${familia}/${encId}/${safeFile}`;
          const urls = SignatureRepositoryService._buildGitHubUrls(cfg, repoPath);
          baseState.firmas[key] = {
            key,
            exists: true,
            locked: true,
            dataUrl: `data:${mimeType};base64,${imgBuf.toString('base64')}`,
            githubUrl: entry.githubUrl || urls.githubUrl,
            rawUrl: entry.rawUrl || urls.rawUrl,
            repoPath,
            recordedAt: entry.recordedAt || '',
            recordedBy: entry.recordedBy || '',
            source: entry.commitSha ? 'github' : (cfg.remoteEnabled ? 'github-cache' : 'local-repo')
          };
        }
      }
    }

    // Respaldo legado para registros antiguos guardados antes del repositorio GitHub
    if (legacySignatures && typeof legacySignatures === 'object') {
      for (const key of allowedKeys) {
        if (baseState.firmas[key]?.exists) continue;
        const parsedLegacy = SignatureRepositoryService.parseSignatureDataUrl(legacySignatures[key]);
        if (parsedLegacy) {
          baseState.firmas[key] = {
            key,
            exists: true,
            locked: true,
            dataUrl: parsedLegacy.dataUrl,
            githubUrl: '',
            rawUrl: '',
            repoPath: '',
            recordedAt: '',
            recordedBy: 'Registro SQL previo',
            source: 'legacy-sql'
          };
        }
      }
    }

    baseState.allLocked = allowedKeys.length > 0 && allowedKeys.every(k => baseState.firmas[k]?.locked);
    baseState.anyLocked = allowedKeys.some(k => baseState.firmas[k]?.locked);
    return baseState;
  }

  /**
   * Extrae firmas del cuerpo payload considerando el contenedor específico de cada formato.
   */
  static extractIncomingSignatures(formatoId, payload = {}) {
    const familia = SignatureRepositoryService.resolveFamily(formatoId);
    const d = payload?.datos || payload || {};
    const out = {};

    if (!familia) return out;

    const pick = (...vals) => {
      for (const v of vals) {
        const s = String(v || '').trim();
        if (s) return s;
      }
      return '';
    };

    switch (familia) {
      case 'po': {
        const sub = d.poPayload || d;
        out.firmaSupervisor = pick(sub.firmaSupervisor, sub.firmaBase64, d.firmaSupervisor, d.firmaBase64);
        break;
      }
      case 'er': {
        const sub = d.erPayload || d;
        out.firmaBase64 = pick(sub.firmaBase64, sub.firma, d.firmaBase64, d.firma);
        break;
      }
      case 'mecd': {
        const sub = d.mecdPayload || d;
        out.firmaCCO = pick(sub.firmaCCO, d.firmaCCO);
        out.firmaAgente = pick(sub.firmaAgente, d.firmaAgente);
        out.firmaSupervisor = pick(sub.firmaSupervisor, d.firmaSupervisor);
        break;
      }
      case 'cll': {
        const sub = d.cllPayload || d;
        out.firmaSecurity = pick(sub.firmaSecurity, d.firmaSecurity);
        out.firmaLD = pick(sub.firmaLD, d.firmaLD);
        break;
      }
      case 'sp': {
        const sub = d.spPayload || d;
        const firstRowSig = Array.isArray(sub.registros) ? sub.registros.find(r => r && r.FirmaScreener)?.FirmaScreener : '';
        out.firmaScreener = pick(sub.firmaScreener, firstRowSig, d.firmaScreener);
        break;
      }
      case 'dal': {
        const sub = d.dalPayload || d;
        out.firmaGuardSup = pick(sub.firmaGuardSup, d.firmaGuardSup);
        out.firmaDLAgent = pick(sub.firmaDLAgent, d.firmaDLAgent);
        break;
      }
      case 'sel': {
        const sub = d.selPayload || d;
        out.firmaSupervisor = pick(sub.firmaSupervisor, d.firmaSupervisor);
        break;
      }
      case 'ass': {
        const sub = d.assPayload || d;
        out.signature = pick(sub.firmaBase64, sub.signature, d.firmaBase64, d.signature);
        break;
      }
      case 'anexob': {
        const sub = d.anexoBPayload || d;
        out.leadSignature = pick(sub.leadSignature, d.leadSignature);
        out.csmSignature = pick(sub.csmSignature, d.csmSignature);
        break;
      }
      case 'liadc': {
        const sub = d.liadcPayload || d;
        out.firmaInspector = pick(sub.firmaInspector, d.firmaInspector);
        out.firmaSupervisor = pick(sub.firmaSupervisor, d.firmaSupervisor);
        break;
      }
      case 'lisa': {
        const sub = d.lisaPayload || d;
        out.firmaInspector = pick(sub.firmaInspector, sub.FirmaInspector, d.firmaInspector);
        break;
      }
      default:
        break;
    }

    return out;
  }

  /**
   * Inyecta firmas en el payload (respetando la estructura anidada de cada formato).
   */
  static applySignaturesToPayload(formatoId, payload = {}, signaturesMap = {}) {
    const familia = SignatureRepositoryService.resolveFamily(formatoId);
    if (!familia || !payload || typeof payload !== 'object') return payload;

    const cloned = {
      ...payload,
      datos: payload.datos && typeof payload.datos === 'object' ? { ...payload.datos } : {}
    };
    const d = cloned.datos;

    const assign = (nestedKey, fieldMap) => {
      if (d[nestedKey] && typeof d[nestedKey] === 'object') {
        d[nestedKey] = { ...d[nestedKey] };
        for (const [prop, val] of Object.entries(fieldMap)) {
          if (val !== undefined && val !== '') d[nestedKey][prop] = val;
        }
      } else {
        for (const [prop, val] of Object.entries(fieldMap)) {
          if (val !== undefined && val !== '') d[prop] = val;
        }
      }
    };

    switch (familia) {
      case 'po':
        assign('poPayload', { firmaSupervisor: signaturesMap.firmaSupervisor, firmaBase64: signaturesMap.firmaSupervisor });
        break;
      case 'er':
        assign('erPayload', { firmaBase64: signaturesMap.firmaBase64, firma: signaturesMap.firmaBase64 });
        break;
      case 'mecd':
        assign('mecdPayload', {
          firmaCCO: signaturesMap.firmaCCO,
          firmaAgente: signaturesMap.firmaAgente,
          firmaSupervisor: signaturesMap.firmaSupervisor
        });
        break;
      case 'cll':
        assign('cllPayload', {
          firmaSecurity: signaturesMap.firmaSecurity,
          firmaLD: signaturesMap.firmaLD
        });
        break;
      case 'sp':
        assign('spPayload', {
          firmaScreener: signaturesMap.firmaScreener
        });
        break;
      case 'dal':
        assign('dalPayload', {
          firmaGuardSup: signaturesMap.firmaGuardSup,
          firmaDLAgent: signaturesMap.firmaDLAgent
        });
        break;
      case 'sel':
        assign('selPayload', { firmaSupervisor: signaturesMap.firmaSupervisor });
        break;
      case 'ass':
        assign('assPayload', { firmaBase64: signaturesMap.signature, signature: signaturesMap.signature });
        break;
      case 'anexob':
        assign('anexoBPayload', {
          leadSignature: signaturesMap.leadSignature,
          csmSignature: signaturesMap.csmSignature
        });
        break;
      case 'liadc':
        assign('liadcPayload', {
          firmaInspector: signaturesMap.firmaInspector,
          firmaSupervisor: signaturesMap.firmaSupervisor
        });
        break;
      case 'lisa':
        assign('lisaPayload', {
          firmaInspector: signaturesMap.firmaInspector,
          FirmaInspector: signaturesMap.firmaInspector
        });
        break;
      default:
        break;
    }

    return cloned;
  }

  /**
   * Pre-validación (Capa 2): carga firmas ya bloqueadas del encabezadoId activo
   * e impide que se borren o sobreescriban antes de validar/persistir.
   */
  static async resolverFirmasConBloqueo({ formatoId, encabezadoId, payload, legacySignatures = {} } = {}) {
    const familia = SignatureRepositoryService.resolveFamily(formatoId);
    const encId = SignatureRepositoryService._sanitizeSafeId(encabezadoId);
    const incoming = SignatureRepositoryService.extractIncomingSignatures(formatoId, payload);

    if (!familia) {
      return { payloadEfectivo: payload, existingState: null, effectiveSignatures: {} };
    }

    const existingState = encId
      ? await SignatureRepositoryService.cargarFirmasParaFormato({ formatoId, encabezadoId: encId, legacySignatures })
      : SignatureRepositoryService._emptyRepoState({ formatoId, familia, encabezadoId: null });

    const effectiveSignatures = {};
    for (const key of FAMILY_SIGNATURES[familia]) {
      const existing = existingState.firmas?.[key];
      if (existing && existing.locked && existing.dataUrl) {
        effectiveSignatures[key] = existing.dataUrl;
      } else {
        effectiveSignatures[key] = incoming[key] || '';
      }
    }

    const payloadEfectivo = SignatureRepositoryService.applySignaturesToPayload(
      formatoId,
      payload,
      effectiveSignatures
    );

    return {
      payloadEfectivo,
      existingState,
      effectiveSignatures
    };
  }

  /**
   * Guarda permanentemente en caché local y GitHub toda nueva firma capturada (sin alterar firmas ya bloqueadas).
   */
  static async sincronizarFirmasGuardado({
    formatoId,
    encabezadoId,
    itinerarioId = null,
    vuelo = null,
    fecha = '',
    usuario = '',
    effectiveSignatures = {},
    legacySignatures = {}
  } = {}) {
    const cfg = SignatureRepositoryService.getConfig();
    const familia = SignatureRepositoryService.resolveFamily(formatoId);
    const encId = SignatureRepositoryService._sanitizeSafeId(encabezadoId);

    if (!familia || !encId) {
      return null;
    }

    const currentState = await SignatureRepositoryService.cargarFirmasParaFormato({
      formatoId,
      encabezadoId: encId,
      legacySignatures
    });

    const localDir = SignatureRepositoryService._getLocalRecordDir(cfg, familia, encId);
    let manifest = SignatureRepositoryService._readLocalManifest(localDir) || {
      formatoId,
      familia,
      encabezadoId: encId,
      itinerarioId: parseInt(itinerarioId, 10) || null,
      vuelo: String(vuelo?.novuelo || vuelo?.numeroVuelo || vuelo || '').trim(),
      fecha: String(fecha || '').substring(0, 10),
      firmas: {}
    };
    if (!manifest.firmas || typeof manifest.firmas !== 'object') {
      manifest.firmas = {};
    }

    const allowedKeys = FAMILY_SIGNATURES[familia];
    const filesToCommit = [];
    const newlyRegistered = [];
    const nowIso = new Date().toISOString();
    const actor = String(usuario || '').trim() || 'SISTEMA_SEC';

    for (const key of allowedKeys) {
      const safeKey = SignatureRepositoryService._sanitizeKey(familia, key);
      if (!safeKey) continue;

      const existingRepoEntry = currentState.firmas?.[safeKey];
      const alreadyStoredInGitOrLocal = Boolean(manifest.firmas?.[safeKey]?.fileName) && Boolean(existingRepoEntry?.exists);
      if (alreadyStoredInGitOrLocal) {
        continue;
      }

      const candidateRaw = effectiveSignatures?.[safeKey] || legacySignatures?.[safeKey] || '';
      const parsed = SignatureRepositoryService.parseSignatureDataUrl(candidateRaw);
      if (!parsed) continue;

      const fileName = `${safeKey}.${parsed.ext}`;
      const repoPath = `${cfg.baseDir}/${familia}/${encId}/${fileName}`;
      const urls = SignatureRepositoryService._buildGitHubUrls(cfg, repoPath);

      manifest.firmas[safeKey] = {
        key: safeKey,
        fileName,
        repoPath,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.sizeBytes,
        sha256: parsed.sha256,
        githubUrl: urls.githubUrl,
        rawUrl: urls.rawUrl,
        recordedAt: nowIso,
        recordedBy: actor,
        locked: true
      };

      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(path.join(localDir, fileName), parsed.buffer);
      filesToCommit.push({ repoPath, buffer: parsed.buffer });
      newlyRegistered.push(safeKey);
    }

    let githubSynced = false;
    let syncError = '';

    if (newlyRegistered.length > 0) {
      const manifestRepoPath = `${cfg.baseDir}/${familia}/${encId}/manifest.json`;
      const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
      fs.mkdirSync(localDir, { recursive: true });
      fs.writeFileSync(path.join(localDir, 'manifest.json'), manifestBuf);

      if (cfg.remoteEnabled) {
        filesToCommit.push({ repoPath: manifestRepoPath, buffer: manifestBuf });
        try {
          const commitInfo = await SignatureRepositoryService._commitFilesToGitHub(
            cfg,
            filesToCommit,
            `chore(firmas): registrar ${newlyRegistered.join(', ')} (${familia}/${encId}) [skip ci]`
          );
          githubSynced = true;
          for (const k of newlyRegistered) {
            if (manifest.firmas[k]) {
              manifest.firmas[k].commitSha = commitInfo.commitSha;
            }
          }
          fs.writeFileSync(path.join(localDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
        } catch (err) {
          syncError = err.message;
          console.error(`[FIRMAS GITHUB SYNC ERROR] (${familia}/${encId}):`, err.message);
        }
      }
    }

    const updated = await SignatureRepositoryService.cargarFirmasParaFormato({
      formatoId,
      encabezadoId: encId,
      legacySignatures
    });
    return {
      ...updated,
      newlyRegistered,
      githubSynced,
      syncError
    };
  }

  static toClientSummary(repoState) {
    if (!repoState) return null;
    return {
      formatoId: repoState.formatoId || '',
      familia: repoState.familia || null,
      encabezadoId: repoState.encabezadoId || null,
      repoFolderUrl: repoState.repoFolderUrl || '',
      allLocked: Boolean(repoState.allLocked),
      anyLocked: Boolean(repoState.anyLocked),
      githubSynced: repoState.githubSynced !== undefined ? Boolean(repoState.githubSynced) : undefined,
      newlyRegistered: Array.isArray(repoState.newlyRegistered) ? repoState.newlyRegistered : [],
      firmas: repoState.firmas || {}
    };
  }
}

module.exports = SignatureRepositoryService;
