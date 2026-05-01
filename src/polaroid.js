/**
 * Polaroid screenshot — capture the current view as a downloadable polaroid PNG.
 * Shows a brief flash, then a preview card with save / close buttons.
 */
import * as PIXI from 'pixi.js';

let app = null;

export function setupPolaroid(pixiApp) {
  app = pixiApp;
  const btn = document.getElementById('btn-polaroid');
  if (btn) btn.addEventListener('click', takePolaroid);

  // Keyboard shortcut: P
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
      takePolaroid();
    }
  });
}

export async function takePolaroid() {
  if (!app) return;

  // 1. White camera flash
  flash();

  // 2. Snapshot the Pixi stage (HTML elements like cursor are not in the canvas)
  const srcCanvas = app.renderer.extract.canvas(app.stage);
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;

  // 3. Compose into a polaroid canvas (white frame + handwritten caption)
  const FRAME_PAD = 36;
  const FRAME_BOTTOM = 130;
  const W = srcW + FRAME_PAD * 2;
  const H = srcH + FRAME_PAD + FRAME_BOTTOM;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');

  // Polaroid paper
  ctx.fillStyle = '#FBF6EC';
  ctx.fillRect(0, 0, W, H);
  // Slightly brighter inner tint
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Draw the snapshot
  ctx.drawImage(srcCanvas, FRAME_PAD, FRAME_PAD, srcW, srcH);

  // Subtle inner shadow on the photo edge
  ctx.strokeStyle = 'rgba(61, 46, 31, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(FRAME_PAD - 0.5, FRAME_PAD - 0.5, srcW + 1, srcH + 1);

  // Caption (handwritten)
  const date = new Date();
  const captionY = srcH + FRAME_PAD + 60;
  ctx.fillStyle = '#3D2E1F';
  ctx.textAlign = 'center';
  ctx.font = "italic 32px Caveat, 'Brush Script MT', cursive";
  ctx.fillText('the drifting atelier', W / 2, captionY);
  ctx.font = "22px Caveat, 'Brush Script MT', cursive";
  ctx.globalAlpha = 0.55;
  ctx.fillText(formatDate(date), W / 2, captionY + 36);
  ctx.globalAlpha = 1;

  // 4. Show preview UI
  const dataUrl = out.toDataURL('image/png');
  showPreview(dataUrl, date);
}

function flash() {
  const f = document.createElement('div');
  f.className = 'polaroid-flash';
  document.body.appendChild(f);
  requestAnimationFrame(() => {
    f.style.opacity = '0';
  });
  setTimeout(() => f.remove(), 500);
}

function showPreview(dataUrl, date) {
  // Build the preview overlay
  const overlay = document.createElement('div');
  overlay.className = 'polaroid-overlay';
  overlay.innerHTML = `
    <div class="polaroid-stage">
      <img class="polaroid-img" alt="your atelier" />
      <div class="polaroid-actions">
        <button class="pol-btn pol-save">save</button>
        <button class="pol-btn pol-close">close</button>
      </div>
      <p class="polaroid-hint">a moment of your studio.</p>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.polaroid-img').src = dataUrl;

  requestAnimationFrame(() => overlay.classList.add('visible'));

  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 320);
  };

  overlay.querySelector('.pol-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.pol-save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `drifting-atelier-${date.toISOString().slice(0,10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    close();
  });

  // ESC closes
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); window.removeEventListener('keydown', onKey); }
  };
  window.addEventListener('keydown', onKey);
}

function formatDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
