/**
 * Controlador de la ventana de Vista Preliminar Imprimible — Control de Perimétrica
 * 100% compatible con CSP (sin onclick inline).
 */
document.addEventListener('DOMContentLoaded', () => {
  const btnPrint = document.getElementById('btnPrintPreview');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  const btnClose = document.getElementById('btnClosePreview');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      const returnUrl = btnClose.getAttribute('data-return-url') || '/formatos';
      window.close();
      setTimeout(() => {
        if (!window.closed) {
          window.location.href = returnUrl;
        }
      }, 120);
    });
  }
});
