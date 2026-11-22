/**
 * SignaturePad Reutilizable + Bloqueo Inmutable GitHub SEC - SIO LAATS
 * Captura, exportación en Base64 y bloqueo automático de firmas registradas.
 */

(function (window, document) {
  'use strict';

  const CANVAS_REPO_MAP = {
    poCanvasFirmaSupervisor: { key: 'firmaSupervisor', clearSelector: '#btnLimpiarFirmaPO', cardNoticeIds: [] },
    erCanvasFirma: { key: 'firmaBase64', clearSelector: '#btnLimpiarFirmaER', cardNoticeIds: ['erNoticeFirmaExistente'] },
    mecdCanvasFirmaCCO: { key: 'firmaCCO', clearSelector: 'button[data-clear-canvas="mecdCanvasFirmaCCO"]', cardNoticeIds: [] },
    mecdCanvasFirmaAgente: { key: 'firmaAgente', clearSelector: 'button[data-clear-canvas="mecdCanvasFirmaAgente"]', cardNoticeIds: [] },
    mecdCanvasFirmaSupervisor: { key: 'firmaSupervisor', clearSelector: 'button[data-clear-canvas="mecdCanvasFirmaSupervisor"]', cardNoticeIds: [] },
    cllCanvasFirmaSecurity: { key: 'firmaSecurity', clearSelector: '#btnLimpiarFirmaSecCLL', cardNoticeIds: [] },
    cllCanvasFirmaLD: { key: 'firmaLD', clearSelector: '#btnLimpiarFirmaLdCLL', cardNoticeIds: [] },
    spCanvasFirmaScreener: { key: 'firmaScreener', clearSelector: '#btnLimpiarFirmaScreenerSP', cardNoticeIds: [] },
    dalCanvasFirmaGuardSup: { key: 'firmaGuardSup', clearSelector: '#btnLimpiarFirmaGuardSupDAL', cardNoticeIds: [] },
    dalCanvasFirmaDLAgent: { key: 'firmaDLAgent', clearSelector: '#btnLimpiarFirmaDLAgentDAL', cardNoticeIds: [] },
    selCanvasFirmaSupervisor: { key: 'firmaSupervisor', clearSelector: '#btnLimpiarFirmaSEL', cardNoticeIds: [] },
    assCanvasFirma: { key: 'signature', clearSelector: '#btnLimpiarFirmaASS', cardNoticeIds: ['assNoticeFirmaExistente'] },
    axBCanvasLeadFirma: { key: 'leadSignature', clearSelector: '#btnLimpiarLeadFirmaAnexoB', cardNoticeIds: ['axBNoticeLeadFirma'] },
    axBCanvasCsmFirma: { key: 'csmSignature', clearSelector: '#btnLimpiarCsmFirmaAnexoB', cardNoticeIds: ['axBNoticeCsmFirma'] },
    liadcCanvasFirmaInspector: { key: 'firmaInspector', clearSelector: '#btnLimpiarFirmaInspectorLIADC', cardNoticeIds: ['liadcNoticeFirmaInspector'] },
    liadcCanvasFirmaSupervisor: { key: 'firmaSupervisor', clearSelector: '#btnLimpiarFirmaSupervisorLIADC', cardNoticeIds: ['liadcNoticeFirmaSupervisor'] },
    lisaCanvasFirma: { key: 'firmaInspector', clearSelector: '#btnLimpiarFirmaLISA', cardNoticeIds: [] }
  };

  let _cachedRepoState = undefined;
  const _mountedPads = new Map();

  function readRepoStateFromDom() {
    if (_cachedRepoState !== undefined) return _cachedRepoState;
    try {
      const el = document.getElementById('sioFirmasRepoStateJson');
      if (el && el.textContent) {
        _cachedRepoState = JSON.parse(el.textContent);
        return _cachedRepoState;
      }
    } catch (err) {
      console.warn('[SIGNATURE REPO CLIENT PARSE WARN]', err);
    }
    _cachedRepoState = null;
    return null;
  }

  function formatRecordedAt(isoStr) {
    if (!isoStr) return '';
    const s = String(isoStr).trim();
    if (s.length >= 16 && s.includes('T')) {
      return `${s.substring(0, 10)} ${s.substring(11, 16)} UTC`;
    }
    return s.substring(0, 19);
  }

  class SioSignaturePad {
    constructor(canvasElement, options = {}) {
      this.canvas = typeof canvasElement === 'string' ? document.querySelector(canvasElement) : canvasElement;
      if (!this.canvas) return;

      this.ctx = this.canvas.getContext('2d');
      this.isDrawing = false;
      this.hasDrawn = false;
      this.locked = false;
      this.lockedDataUrl = '';
      this.lockedInfo = null;
      this.strokeColor = options.strokeColor || '#0F2744';
      this.lineWidth = options.lineWidth || 2.5;
      this.signatureKey = options.signatureKey || CANVAS_REPO_MAP[this.canvas.id]?.key || '';

      this.resizeCanvas();
      this.initEvents();

      if (this.canvas.id) {
        _mountedPads.set(this.canvas.id, this);
      }

      const repoState = readRepoStateFromDom();
      const repoEntry = repoState?.firmas?.[this.signatureKey];
      if (repoEntry && repoEntry.locked && repoEntry.dataUrl) {
        this.lockWithSignature(repoEntry);
      }
    }

    resizeCanvas() {
      if (this.locked) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = this.canvas.getBoundingClientRect();
      const w = this.canvas.offsetWidth || rect.width || 320;
      const h = this.canvas.offsetHeight || rect.height || 160;
      this.canvas.width = w * ratio;
      this.canvas.height = h * ratio;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(ratio, ratio);
      this.ctx.strokeStyle = this.strokeColor;
      this.ctx.lineWidth = this.lineWidth;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    }

    initEvents() {
      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
      };

      const start = (e) => {
        if (this.locked) return;
        e.preventDefault();
        this.isDrawing = true;
        this.hasDrawn = true;
        const pos = getPos(e);
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
      };

      const move = (e) => {
        if (this.locked || !this.isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
      };

      const end = () => {
        if (this.locked) {
          this.isDrawing = false;
          return;
        }
        if (this.isDrawing) {
          this.isDrawing = false;
          this.ctx.closePath();
          this.canvas.dispatchEvent(new CustomEvent('sio:signature-change', {
            bubbles: true,
            detail: { canvasId: this.canvas.id, signatureKey: this.signatureKey }
          }));
        }
      };

      this.canvas.addEventListener('mousedown', start);
      this.canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);

      this.canvas.addEventListener('touchstart', start, { passive: false });
      this.canvas.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', end);
    }

    lockWithSignature(info = {}) {
      const dataUrl = String(info.dataUrl || '').trim();
      if (!dataUrl || !dataUrl.startsWith('data:image/')) return;

      this.locked = true;
      this.isDrawing = false;
      this.hasDrawn = true;
      this.lockedDataUrl = dataUrl;
      this.lockedInfo = info;

      const box = this.canvas.closest('.signature-box');
      this.canvas.style.display = 'none';
      this.canvas.setAttribute('data-sio-locked', '1');

      const mapCfg = CANVAS_REPO_MAP[this.canvas.id] || {};
      if (mapCfg.clearSelector) {
        const clearBtn = document.querySelector(mapCfg.clearSelector);
        if (clearBtn) {
          clearBtn.disabled = true;
          clearBtn.style.display = 'none';
          clearBtn.setAttribute('aria-hidden', 'true');
        }
      }
      if (Array.isArray(mapCfg.cardNoticeIds)) {
        mapCfg.cardNoticeIds.forEach((noticeId) => {
          const el = document.getElementById(noticeId);
          if (el) el.style.display = 'none';
        });
      }

      if (box) {
        box.classList.add('sio-signature-locked');
        box.classList.remove('is-invalid', 'sio-field-invalid');

        let lockedView = box.querySelector('.sio-signature-locked-view');
        if (!lockedView) {
          lockedView = document.createElement('div');
          lockedView.className = 'sio-signature-locked-view';
          box.appendChild(lockedView);
        }
        lockedView.textContent = '';

        const header = document.createElement('div');
        header.className = 'sio-signature-locked-badge';
        const lockIcon = document.createElement('i');
        lockIcon.className = 'fas fa-lock';
        const badgeText = document.createElement('span');
        badgeText.textContent = 'Firma registrada y bloqueada permanentemente';
        header.appendChild(lockIcon);
        header.appendChild(badgeText);
        lockedView.appendChild(header);

        const imgWrap = document.createElement('div');
        imgWrap.className = 'sio-signature-locked-img-wrap';
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'Firma digital registrada';
        img.className = 'sio-signature-locked-img';
        imgWrap.appendChild(img);
        lockedView.appendChild(imgWrap);

        const footer = document.createElement('div');
        footer.className = 'sio-signature-locked-meta';
        const metaParts = [];
        if (info.recordedBy) metaParts.push(`Por: ${info.recordedBy}`);
        if (info.recordedAt) metaParts.push(formatRecordedAt(info.recordedAt));
        if (info.source === 'legacy-sql' && !info.githubUrl) {
          metaParts.push('Registro SQL histórico');
        } else {
          metaParts.push('Repositorio GitHub SEC');
        }
        const metaSpan = document.createElement('span');
        metaSpan.textContent = metaParts.join(' · ');
        footer.appendChild(metaSpan);

        if (info.githubUrl && /^https:\/\/github\.com\//i.test(info.githubUrl)) {
          const link = document.createElement('a');
          link.href = info.githubUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'sio-signature-github-link';
          const ghIcon = document.createElement('i');
          ghIcon.className = 'fab fa-github';
          const linkLabel = document.createElement('span');
          linkLabel.textContent = 'Ver firma en GitHub';
          link.appendChild(ghIcon);
          link.appendChild(linkLabel);
          footer.appendChild(link);
        }

        lockedView.appendChild(footer);
      }
    }

    isLocked() {
      return Boolean(this.locked);
    }

    clear() {
      if (this.locked) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.hasDrawn = false;
      this.canvas.dispatchEvent(new CustomEvent('sio:signature-change', {
        bubbles: true,
        detail: { canvasId: this.canvas.id, signatureKey: this.signatureKey, cleared: true }
      }));
    }

    loadDraftDataUrl(dataUrl) {
      if (this.locked) return false;
      const clean = String(dataUrl || '').trim();
      if (!clean.startsWith('data:image/')) return false;
      const img = new Image();
      img.onload = () => {
        if (this.locked) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const w = (this.canvas.width / ratio) || this.canvas.offsetWidth || 320;
        const h = (this.canvas.height / ratio) || this.canvas.offsetHeight || 160;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.drawImage(img, 0, 0, w, h);
        this.hasDrawn = true;
      };
      img.src = clean;
      this.hasDrawn = true;
      return true;
    }

    static exportUnlockedSignatures() {
      const out = {};
      _mountedPads.forEach((pad, canvasId) => {
        if (!pad.isLocked() && !pad.isEmpty()) {
          try {
            out[canvasId] = pad.toDataURL('image/png');
          } catch (_) {}
        }
      });
      return out;
    }

    static loadDraftSignatures(sigMap = {}) {
      if (!sigMap || typeof sigMap !== 'object') return;
      Object.entries(sigMap).forEach(([canvasId, dataUrl]) => {
        const pad = _mountedPads.get(canvasId);
        if (pad && !pad.isLocked() && dataUrl) {
          pad.loadDraftDataUrl(dataUrl);
        }
      });
    }

    isEmpty() {
      if (this.locked && this.lockedDataUrl) return false;
      return !this.hasDrawn;
    }

    isBlank() {
      return this.isEmpty();
    }

    toDataURL(type = 'image/png') {
      if (this.locked && this.lockedDataUrl) {
        return this.lockedDataUrl;
      }
      return this.canvas.toDataURL(type);
    }

    static applyRepoState(firmasRepo) {
      if (!firmasRepo || !firmasRepo.firmas) return;
      _cachedRepoState = firmasRepo;
      _mountedPads.forEach((pad) => {
        const info = firmasRepo.firmas[pad.signatureKey];
        if (info && info.locked && info.dataUrl) {
          pad.lockWithSignature(info);
        }
      });
    }

    static getMountedPad(canvasId) {
      return _mountedPads.get(canvasId) || null;
    }
  }

  window.SioSignaturePad = SioSignaturePad;
  window.SioSignatureRepoClient = {
    getRepoState: readRepoStateFromDom,
    applyRepoState: SioSignaturePad.applyRepoState,
    getMountedPad: SioSignaturePad.getMountedPad,
    exportUnlockedSignatures: SioSignaturePad.exportUnlockedSignatures,
    loadDraftSignatures: SioSignaturePad.loadDraftSignatures
  };
})(window, document);
