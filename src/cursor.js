/**
 * Hand-drawn pencil cursor that follows the mouse, with a faint graphite trail.
 */
export function setupCursor() {
  // Trail canvas (full-screen, behind cursor and HUD but above the world canvas via z-index)
  const trail = document.createElement('canvas');
  trail.className = 'cursor-trail';
  Object.assign(trail.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '999',
    mixBlendMode: 'multiply',
  });
  document.body.appendChild(trail);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    trail.width = window.innerWidth * dpr;
    trail.height = window.innerHeight * dpr;
    trail.style.width = window.innerWidth + 'px';
    trail.style.height = window.innerHeight + 'px';
    const ctx = trail.getContext('2d');
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  const tctx = trail.getContext('2d');

  // Cursor sprite
  const cursor = document.createElement('div');
  cursor.className = 'cursor';
  document.body.appendChild(cursor);

  let cx = 0, cy = 0; // current
  let tx = 0, ty = 0; // target
  let lastTrailX = 0, lastTrailY = 0;

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
  });

  window.addEventListener('pointerdown', () => {
    cursor.classList.add('grab');
    cursor.classList.add('dragging');
  });
  window.addEventListener('pointerup', () => {
    cursor.classList.remove('grab');
    cursor.classList.remove('dragging');
  });

  // Smooth follow + trail
  function tick() {
    const px = cx, py = cy;
    cx += (tx - cx) * 0.42;
    cy += (ty - cy) * 0.42;
    cursor.style.left = `${cx}px`;
    cursor.style.top = `${cy}px`;

    // Fade existing trail
    tctx.save();
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = 'rgba(0,0,0,0.05)';
    tctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    tctx.restore();

    // Draw new segment if moved enough
    const dx = cx - lastTrailX, dy = cy - lastTrailY;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.5) {
      tctx.strokeStyle = 'rgba(61, 46, 31, 0.25)';
      tctx.lineWidth = 1.4;
      tctx.lineCap = 'round';
      tctx.beginPath();
      tctx.moveTo(lastTrailX, lastTrailY);
      tctx.lineTo(cx, cy);
      tctx.stroke();
      lastTrailX = cx;
      lastTrailY = cy;
    } else if (dist === 0) {
      // pointer idle — bring trail anchor up to cursor so next stroke connects
      lastTrailX = cx;
      lastTrailY = cy;
    }

    requestAnimationFrame(tick);
  }
  tick();
}
