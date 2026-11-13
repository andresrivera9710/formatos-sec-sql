/**
 * SignaturePad Reutilizable - SIO LAATS
 * Captura y exportación en Base64 para auditorías y formatos de inspección aeronáutica.
 */

class SioSignaturePad {
  constructor(canvasElement, options = {}) {
    this.canvas = typeof canvasElement === 'string' ? document.querySelector(canvasElement) : canvasElement;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.isDrawing = false;
    this.hasDrawn = false;
    this.strokeColor = options.strokeColor || '#0F2744';
    this.lineWidth = options.lineWidth || 2.5;

    this.resizeCanvas();
    this.initEvents();
  }

  resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    this.canvas.width = this.canvas.offsetWidth * ratio;
    this.canvas.height = this.canvas.offsetHeight * ratio;
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
      e.preventDefault();
      this.isDrawing = true;
      this.hasDrawn = true;
      const pos = getPos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    };

    const end = (e) => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.ctx.closePath();
      }
    };

    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasDrawn = false;
  }

  isEmpty() {
    return !this.hasDrawn;
  }

  toDataURL(type = 'image/png') {
    return this.canvas.toDataURL(type);
  }
}

window.SioSignaturePad = SioSignaturePad;

