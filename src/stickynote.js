/**
 * Sticky notes — typed handwritten messages you can drop on the canvas.
 * Each note is rendered into an HTML5 canvas (so the font renders crisply at
 * any zoom), then handed to Pixi as a regular sprite that drags/throws like
 * any other piece.
 */
import * as PIXI from 'pixi.js';

const COLORS = [
  { bg: '#FFF7C2', tape: '#F5D67A' }, // yellow
  { bg: '#FAE7E0', tape: '#E8B4A0' }, // rose
  { bg: '#E8F0DA', tape: '#B8C5A6' }, // sage
  { bg: '#FBF6EC', tape: '#D4C5A0' }, // cream
];

const NOTE_W = 320;
const NOTE_H = 220;
const PADDING = 24;

let onAddCallback = null;

export function setupStickyNotes({ onAdd }) {
  onAddCallback = onAdd;
  const btn = document.getElementById('btn-add-note');
  if (btn) btn.addEventListener('click', openComposer);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      openComposer();
    }
  });
}

/** Render a sticky-note canvas with the given text + color. Returns a data URL. */
export function renderNoteToDataUrl(text, color) {
  const c = document.createElement('canvas');
  // Render at 2x for crispness
  const scale = 2;
  c.width = NOTE_W * scale;
  c.height = NOTE_H * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);

  // Paper background
  ctx.fillStyle = color.bg;
  ctx.fillRect(0, 0, NOTE_W, NOTE_H);

  // Subtle inner texture (vertical lines like notebook paper, super faint)
  ctx.strokeStyle = 'rgba(61, 46, 31, 0.04)';
  ctx.lineWidth = 1;
  for (let y = PADDING + 28; y < NOTE_H - PADDING; y += 28) {
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(NOTE_W - PADDING, y);
    ctx.stroke();
  }

  // Tape strip at top
  ctx.fillStyle = color.tape + 'cc'; // semi-transparent
  const tapeW = 80, tapeH = 22;
  ctx.save();
  ctx.translate(NOTE_W / 2, 4);
  ctx.rotate(-0.04);
  ctx.fillRect(-tapeW / 2, 0, tapeW, tapeH);
  ctx.restore();

  // Text — handwritten Caveat
  ctx.fillStyle = '#3D2E1F';
  ctx.font = "26px Caveat, 'Brush Script MT', cursive";
  ctx.textBaseline = 'top';
  wrapText(ctx, text || '...', PADDING, PADDING + 30, NOTE_W - PADDING * 2, 32);

  return c.toDataURL('image/png');
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = '';
  let curY = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = words[i];
      curY += lineHeight;
      if (curY > NOTE_H - PADDING - lineHeight) { line = '…'; break; }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}

// ---------- Composer modal ----------

function openComposer(prefilledText = '') {
  if (document.getElementById('note-composer')) return;
  const overlay = document.createElement('div');
  overlay.id = 'note-composer';
  overlay.className = 'note-composer';
  overlay.innerHTML = `
    <div class="note-composer-card">
      <div class="note-color-row">
        ${COLORS.map((c, i) => `
          <button class="note-color${i === 0 ? ' selected' : ''}" data-idx="${i}"
                  style="background:${c.bg};border-color:${c.tape}"></button>
        `).join('')}
      </div>
      <textarea id="note-text" placeholder="write something handwritten…" maxlength="200">${escape(prefilledText)}</textarea>
      <div class="note-actions">
        <button class="pol-btn pol-save" id="note-pin">pin to wall</button>
        <button class="pol-btn" id="note-cancel">cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  let colorIdx = 0;
  const ta = overlay.querySelector('#note-text');
  setTimeout(() => ta.focus(), 30);

  overlay.querySelectorAll('.note-color').forEach(b => {
    b.addEventListener('click', () => {
      colorIdx = Number(b.dataset.idx);
      overlay.querySelectorAll('.note-color').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    });
  });

  overlay.querySelector('#note-pin').addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    const dataUrl = renderNoteToDataUrl(text, COLORS[colorIdx]);
    overlay.remove();
    if (onAddCallback) {
      onAddCallback({
        kind: 'note',
        text,
        colorIdx,
        src: dataUrl,
        w: NOTE_W,
        h: NOTE_H,
      });
    }
  });
  overlay.querySelector('#note-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) overlay.querySelector('#note-pin').click();
  });
}

export function getNoteColor(idx) {
  return COLORS[idx] || COLORS[0];
}

function escape(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
}
