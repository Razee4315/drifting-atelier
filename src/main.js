/**
 * The Drifting Atelier
 * An infinite paper canvas of art from every age.
 */
import * as PIXI from 'pixi.js';
import { placeIntoZones } from './layout.js';
import { setupCursor } from './cursor.js';
import { setupHUD } from './hud.js';
import { playPaperRustle, playChime, setAudioEnabled } from './audio.js';
import {
  setSunSprite, updateSun, resizeSun,
  setMegaSprite, updateMega,
  initLadybug, maybeStartLadybug, updateLadybug,
} from './atmosphere.js';
import { loadLayout, applySavedLayout, scheduleSave, clearLayout, loadMode, saveMode } from './persistence.js';
import { showNote, hideNote } from './notes.js';
import { setupMinimap, updateMinimap } from './minimap.js';
import { setupSearch } from './search.js';
import { setupPolaroid } from './polaroid.js';
import { setupUserDrop, loadUserPieces } from './userpieces.js';

// Resolve absolute /asset paths under whatever base path the app is served at
// (e.g. "/" in dev, "/drifting-atelier/" on GitHub Pages).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const url = (p) => BASE + p;

const WORLD_BG_COLOR = 0xFBF6EC;
const INITIAL_ZOOM = 0.45;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 2.4;

let app, world, bgLayer, artLayer, overlayLayer;
let view = { x: 0, y: 0, zoom: INITIAL_ZOOM };
let manifest = null;
let pieces = []; // { sprite, x, y, rot, scale, vx, vy, vrot, isDragging, zone, w, h }
let zoneCenters = {};
let activePiece = null;
let isPanning = false;
let lastPointer = { x: 0, y: 0 };
let pointerHistory = []; // for throw velocity

async function main() {
  // 0. Set runtime asset URLs that CSS needs (cursor backgrounds)
  const root = document.documentElement.style;
  root.setProperty('--cursor-pencil', `url("${url('/j-ui-elements/j1-pencil-cursor.png')}")`);
  root.setProperty('--cursor-grab',   `url("${url('/j-ui-elements/j2-hand-grab-cursor.png')}")`);

  // 1. Load manifest, then prefix every src in it with BASE so all loaders work
  const res = await fetch(url('/manifest.json'));
  manifest = await res.json();
  for (const p of manifest.pieces) p.src = url(p.src);
  for (const k in manifest.ui) manifest.ui[k].src = url(manifest.ui[k].src);
  for (const k in manifest.backgrounds) manifest.backgrounds[k].src = url(manifest.backgrounds[k].src);
  zoneCenters = Object.fromEntries(manifest.zones.map(z => [z.id, z.center]));

  // 2. Init Pixi
  app = new PIXI.Application();
  await app.init({
    background: WORLD_BG_COLOR,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  document.getElementById('app').appendChild(app.canvas);

  // 3. Build layers
  // bgLayer = tiled paper (in screen space)
  // world  = pannable / zoomable container
  //   artLayer  = all the art pieces
  //   overlayLayer = sun beams, ladybug, etc (in world space, on top of art)
  bgLayer = new PIXI.Container();
  world = new PIXI.Container();
  artLayer = new PIXI.Container();
  artLayer.sortableChildren = true;
  overlayLayer = new PIXI.Container();
  world.addChild(artLayer);
  world.addChild(overlayLayer);
  app.stage.addChild(bgLayer);
  app.stage.addChild(world);

  // 4. Load all textures
  await loadAllAssets((progress) => {
    const pct = Math.round(progress * 100);
    document.getElementById('loading-bar-fill').style.width = `${pct}%`;
    const pctEl = document.getElementById('loading-pct');
    if (pctEl) pctEl.textContent = `${pct}%`;
  });

  // 5. Build paper background tile
  buildPaperBackground();

  // 6. Create pieces and lay them out (then apply any saved curation)
  pieces = await createPieces();
  const savedMode = loadMode() || 'drift';
  placeIntoZones(pieces, manifest.zones, savedMode);
  const saved = loadLayout();
  if (saved) {
    const applied = applySavedLayout(pieces, saved);
    console.log(`Restored ${applied} piece positions from your previous visit.`);
  }

  // Build sprites for the loaded manifest pieces
  for (const piece of pieces) buildSpriteForPiece(piece);

  // Restore any user-dropped pieces from previous visits
  const savedUserPieces = loadUserPieces();
  for (const u of savedUserPieces) {
    try {
      const tex = await PIXI.Assets.load(u.src);
      const piece = {
        ...u,
        zone: 'user',
        scale: 0.8 + Math.random() * 0.2,
        vx: 0, vy: 0, vrot: 0,
        zIndex: pieces.length + 1000,
        isUser: true,
      };
      pieces.push(piece);
      buildSpriteForPiece(piece, tex);
    } catch (e) {
      console.warn('Could not restore user piece', u.id, e);
    }
  }

  // 6b. Hidden mega-image at extreme zoom out
  const megaTex = PIXI.Assets.get(url('/k-background/k5-hidden-mega-eye-pencil.png'));
  if (megaTex) {
    const mega = new PIXI.Sprite(megaTex);
    mega.zIndex = -10000;
    artLayer.addChildAt(mega, 0);
    setMegaSprite(mega);
  }

  // 6c. Ladybug
  const ladyTex = PIXI.Assets.get(url('/k-background/k6-ladybug-walking-sprite-sheet.png'));
  if (ladyTex) {
    initLadybug(ladyTex, app.stage); // draw in screen space, on top
  }

  // 7. Apply initial transform
  applyView();

  // 8. Wire up interaction
  setupInteraction();
  setupCursor();
  setupHUD({
    onZoomIn: () => zoomBy(1.25, window.innerWidth/2, window.innerHeight/2),
    onZoomOut: () => zoomBy(0.8, window.innerWidth/2, window.innerHeight/2),
    onReset: () => recenter(),
    getCurrentZone: () => detectCurrentZone(),
  });

  setupMinimap({ zones: manifest.zones, onFlyTo: flyTo });
  setupSearch({ pieces, zones: manifest.zones, onFlyTo: flyTo });
  setupPolaroid(app);
  setupUserDrop({ onDrop: addUserPiece });

  // 9. Hide loading, show welcome — wire mode picker
  document.getElementById('loading').classList.add('hidden');
  setupModePicker(savedMode);

  document.getElementById('welcome-enter').addEventListener('click', () => {
    // Pick selected mode (defaults to whatever was saved or 'drift')
    const selected = document.querySelector('.mode-card.selected');
    const newMode = selected?.dataset.mode || savedMode || 'drift';
    if (newMode !== savedMode || !saved) {
      // Re-arrange with the chosen mode (and clear any old saved layout
      // so the new arrangement isn't overridden by the prior curation)
      saveMode(newMode);
      if (newMode !== savedMode) {
        clearLayout();
      }
      placeIntoZones(pieces, manifest.zones, newMode);
      for (const p of pieces) {
        if (p.sprite) {
          p.sprite.x = p.x;
          p.sprite.y = p.y;
          p.sprite.rotation = p.rot;
        }
      }
    }
    document.getElementById('welcome').classList.add('hidden');
    // Auto-enable ambient on first entry (this click satisfies the user-gesture
    // requirement for AudioContext). The button stays clickable to mute.
    setAudioEnabled(true);
    const soundBtn = document.getElementById('btn-sound');
    if (soundBtn) {
      soundBtn.style.opacity = '1';
      soundBtn.style.background = 'var(--sun)';
    }
  });

  // 10. Start ticker
  app.ticker.add(tick);

  // 11. Resize
  window.addEventListener('resize', () => {
    rebuildPaperBackground();
    resizeSun();
  });
}

// ---------- Asset loading ----------

async function loadAllAssets(onProgress) {
  const all = [
    ...manifest.pieces.map(p => p.src),
    ...Object.values(manifest.ui).map(u => u.src),
    ...Object.values(manifest.backgrounds).map(b => b.src),
  ];
  // Pre-register
  PIXI.Assets.add(all.map(src => ({ alias: src, src })));
  // Load with progress
  let loaded = 0;
  const total = all.length;
  const promises = all.map(async (src) => {
    await PIXI.Assets.load(src);
    loaded++;
    if (onProgress) onProgress(loaded / total);
  });
  await Promise.all(promises);
}

// ---------- Paper background ----------

let bgSprite;
function buildPaperBackground() {
  rebuildPaperBackground();
}
function rebuildPaperBackground() {
  // Clear bg layer
  bgLayer.removeChildren();
  const tex = PIXI.Assets.get(url('/k-background/k1-cream-paper-texture.png'));
  if (tex) {
    const tilingSprite = new PIXI.TilingSprite({
      texture: tex,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    bgSprite = tilingSprite;
    bgLayer.addChild(bgSprite);
  }

  // Soft vignette overlay
  const vTex = PIXI.Assets.get(url('/k-background/k4-paper-shadow-gradient.png'));
  if (vTex) {
    const v = new PIXI.Sprite(vTex);
    v.width = window.innerWidth;
    v.height = window.innerHeight;
    v.alpha = 0.5;
    bgLayer.addChild(v);
  }

  // Sun beam overlay (subtle, rotates over time)
  const sunTex = PIXI.Assets.get(url('/k-background/k3-sunlight-beam-overlay.png'));
  if (sunTex) {
    const s = new PIXI.Sprite(sunTex);
    s.alpha = 0.18;
    s.blendMode = 'screen';
    bgLayer.addChild(s);
    setSunSprite(s);
    resizeSun();
  }
}

// ---------- Piece factory ----------

async function createPieces() {
  const result = [];
  const ui = manifest.ui;
  const tapeKeys = Object.keys(ui).filter(k => k.includes('washi') || k.includes('tape'));
  const pinKey = Object.keys(ui).find(k => k.includes('thumbtack') || k.includes('pin'));
  const clipKey = Object.keys(ui).find(k => k.includes('paperclip'));

  let z = 0;
  for (const m of manifest.pieces) {
    const piece = {
      id: m.id,
      src: m.src,
      zone: m.zone,
      w: m.w,
      h: m.h,
      x: 0, y: 0,
      rot: 0,
      scale: 1,
      vx: 0, vy: 0, vrot: 0,
      isDragging: false,
      zIndex: z++,
    };

    // Random scale variation (0.85-1.15 of base — pieces vary in size feel)
    piece.scale = 0.78 + Math.random() * 0.36;

    // Random tilt -10 to +10 deg
    piece.rot = (Math.random() - 0.5) * (Math.PI / 9);

    // Pick random attachment for ~70% of pieces
    if (Math.random() < 0.7) {
      const r = Math.random();
      const halfW = m.w * piece.scale * 0.5;
      const halfH = m.h * piece.scale * 0.5;
      if (r < 0.55 && tapeKeys.length) {
        // Washi tape strip — placed at top, slightly off-center, slight rotation
        const tk = tapeKeys[Math.floor(Math.random() * tapeKeys.length)];
        const u = manifest.ui[tk];
        const sideX = (Math.random() - 0.5) * (m.w * 0.5);
        // Convert tape position from world coords; sprite child coords are unscaled relative to parent (but parent already has scale.set), so use unscaled offsets
        piece.attachment = {
          src: u.src,
          dx: sideX,
          dy: -m.h * 0.5 + 12,
          rot: (Math.random() - 0.5) * 0.4,
          scale: 0.6 + Math.random() * 0.3,
          alpha: 0.92,
        };
      } else if (r < 0.85 && pinKey) {
        const u = manifest.ui[pinKey];
        piece.attachment = {
          src: u.src,
          dx: (Math.random() - 0.5) * (m.w * 0.6),
          dy: -m.h * 0.5 + 18,
          rot: 0,
          scale: 0.4,
        };
      } else if (clipKey) {
        const u = manifest.ui[clipKey];
        piece.attachment = {
          src: u.src,
          dx: m.w * 0.4 - Math.random() * 30,
          dy: -m.h * 0.5 - 8,
          rot: (Math.random() - 0.5) * 0.5,
          scale: 0.6,
        };
      }
    }

    result.push(piece);
  }
  return result;
}

// ---------- View transform ----------

function applyView() {
  world.x = window.innerWidth / 2 - view.x * view.zoom;
  world.y = window.innerHeight / 2 - view.y * view.zoom;
  world.scale.set(view.zoom);
  updateMinimap(view, window.innerWidth, window.innerHeight);
}

function zoomBy(factor, screenX, screenY) {
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoom * factor));
  if (newZoom === view.zoom) return;
  // Zoom toward the screen point: keep that point fixed in world coords
  const wx = (screenX - world.x) / view.zoom;
  const wy = (screenY - world.y) / view.zoom;
  view.zoom = newZoom;
  view.x = wx - (screenX - window.innerWidth/2) / view.zoom;
  view.y = wy - (screenY - window.innerHeight/2) / view.zoom;
  applyView();
}

function recenter() { flyTo(0, 0, INITIAL_ZOOM); }

function flyTo(targetX, targetY, targetZoom) {
  const start = { x: view.x, y: view.y, zoom: view.zoom };
  const end = { x: targetX, y: targetY, zoom: targetZoom ?? view.zoom };
  const t0 = performance.now();
  const dur = 800;
  function step(now) {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
    view.x = start.x + (end.x - start.x) * e;
    view.y = start.y + (end.y - start.y) * e;
    view.zoom = start.zoom + (end.zoom - start.zoom) * e;
    applyView();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function detectCurrentZone() {
  // Convert screen center to world coords and find nearest zone
  const wx = view.x;
  const wy = view.y;
  let best = null;
  let bestD = Infinity;
  for (const zone of manifest.zones) {
    if (!zone.center) continue;
    const dx = wx - zone.center[0];
    const dy = wy - zone.center[1];
    const d = dx*dx + dy*dy;
    if (d < bestD) { bestD = d; best = zone; }
  }
  // If no zone within 2200 radius, return "Loose Ends" or null
  if (Math.sqrt(bestD) > 2400) return { name: '· · ·' };
  return best;
}

// ---------- Interaction ----------

function setupInteraction() {
  const canvas = app.canvas;

  canvas.addEventListener('pointerdown', (e) => {
    if (activePiece) return; // piece took over
    isPanning = true;
    lastPointer = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (activePiece && activePiece.isDragging) {
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      activePiece.x += dx / view.zoom;
      activePiece.y += dy / view.zoom;
      activePiece.sprite.x = activePiece.x;
      activePiece.sprite.y = activePiece.y;
      lastPointer = { x: e.clientX, y: e.clientY };
      pointerHistory.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (pointerHistory.length > 6) pointerHistory.shift();
    } else if (isPanning) {
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      view.x -= dx / view.zoom;
      view.y -= dy / view.zoom;
      lastPointer = { x: e.clientX, y: e.clientY };
      applyView();
      // Hide any floating note while panning
      hideNote();
      // Faint paper rustle while panning — throttled inside playPaperRustle
      const speed = Math.min(1, Math.hypot(dx, dy) / 40);
      if (speed > 0.15 && Math.random() < 0.18) playPaperRustle(speed * 0.5);
    }
  });

  const releasePiece = () => {
    if (!activePiece) return;
    // Compute velocity from last pointer history
    let throwSpeed = 0;
    if (pointerHistory.length >= 2) {
      const a = pointerHistory[0];
      const b = pointerHistory[pointerHistory.length - 1];
      const dt = Math.max(1, b.t - a.t);
      activePiece.vx = ((b.x - a.x) / dt) * 16 / view.zoom;
      activePiece.vy = ((b.y - a.y) / dt) * 16 / view.zoom;
      activePiece.vrot = (Math.random() - 0.5) * 0.06;
      throwSpeed = Math.hypot(activePiece.vx, activePiece.vy);
    }
    activePiece.isDragging = false;
    activePiece.targetScale = activePiece.scale; // ease back from pickup zoom
    // Discovery chime if it was a real throw
    if (throwSpeed > 12) {
      // Pick a pleasant note (pentatonic)
      const notes = [523.25, 587.33, 659.25, 783.99, 880];
      const f = notes[Math.floor(Math.random() * notes.length)];
      playChime(f, 1.4, 0.05);
    } else {
      // Gentle paper-down rustle
      playPaperRustle(0.6);
    }
    activePiece = null;
    pointerHistory = [];
    // Persist new layout
    scheduleSave(pieces);
  };

  const endPan = () => { isPanning = false; };

  canvas.addEventListener('pointerup', () => { releasePiece(); endPan(); });
  canvas.addEventListener('pointercancel', () => { releasePiece(); endPan(); });
  canvas.addEventListener('pointerleave', () => { releasePiece(); endPan(); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    zoomBy(factor, e.clientX, e.clientY);
  }, { passive: false });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.key === 'r' || e.key === 'R') && e.shiftKey) {
      // Shift+R = clear curation and re-randomize layout
      clearLayout();
      placeIntoZones(pieces, manifest.zones);
      for (const p of pieces) {
        if (p.sprite) {
          p.sprite.x = p.x;
          p.sprite.y = p.y;
          p.sprite.rotation = p.rot;
        }
        p.vx = p.vy = p.vrot = 0;
      }
      recenter();
      playChime(659.25, 1.2, 0.05);
      return;
    }
    if (e.key === 'r' || e.key === 'R') recenter();
    if (e.key === '+' || e.key === '=') zoomBy(1.2, window.innerWidth/2, window.innerHeight/2);
    if (e.key === '-' || e.key === '_') zoomBy(0.83, window.innerWidth/2, window.innerHeight/2);
  });

  // Pinch-zoom (two-finger touch)
  setupPinch(canvas);
}

function setupPinch(canvas) {
  const pointers = new Map(); // pointerId -> { x, y }
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchCenterStart = { x: 0, y: 0 };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartZoom = view.zoom;
      pinchCenterStart = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      // suppress single-pointer pan/drag
      isPanning = false;
      activePiece = null;
    }
  }, true);

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') return;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDist > 0) {
        const factor = (dist / pinchStartDist) * (pinchStartZoom / view.zoom);
        zoomBy(factor, pinchCenterStart.x, pinchCenterStart.y);
      }
    }
  }, true);

  const endPointer = (e) => {
    if (e.pointerType !== 'touch') return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = 0;
    }
  };
  canvas.addEventListener('pointerup', endPointer, true);
  canvas.addEventListener('pointercancel', endPointer, true);
}

function onPiecePointerDown(e, piece) {
  e.stopPropagation();
  activePiece = piece;
  piece.isDragging = true;
  piece.vx = 0; piece.vy = 0; piece.vrot = 0;
  // Bring to top
  piece.sprite.zIndex = 99999;
  // Slight pickup scale
  piece.sprite.scale.set(piece.scale * 1.05);
  lastPointer = { x: e.global.x, y: e.global.y };
  // Convert screen to world at piece origin to get proper offset
  // But simpler: just track delta
  pointerHistory = [{ x: e.global.x, y: e.global.y, t: performance.now() }];
}

// ---------- Tick ----------

let breezeTimer = 0;
let ladybugCooldown = 60 * 30; // ~30s after load before first appearance
function tick(ticker) {
  const dt = ticker.deltaTime;

  // Atmosphere
  updateSun(dt);
  updateMega(view.zoom);
  updateLadybug(dt);
  ladybugCooldown -= dt;
  if (ladybugCooldown <= 0) {
    ladybugCooldown = 60 * (40 + Math.random() * 80); // re-roll every 40-120s
    if (Math.random() < 0.5) maybeStartLadybug();
  }
  // Apply velocity / friction to non-dragged pieces
  for (const p of pieces) {
    let dirty = false;

    if (!p.isDragging) {
      if (Math.abs(p.vx) > 0.01 || Math.abs(p.vy) > 0.01 || Math.abs(p.vrot) > 0.001) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.vrot *= 0.92;
        dirty = true;
      }
    }

    // Hover: ease scale toward target
    if (p.sprite) {
      if (p.targetScale !== undefined) {
        const cur = p.sprite.scale.x;
        const next = cur + (p.targetScale - cur) * Math.min(1, 0.18 * dt);
        if (Math.abs(next - cur) > 0.0005) {
          p.sprite.scale.set(next);
        }
      }
      if (p.hoverActive && !p.isDragging) {
        // Tilt extra toward cursor (small effect)
        const w = world.toLocal({ x: lastPointer.x, y: lastPointer.y });
        const dx = w.x - p.x;
        const dy = w.y - p.y;
        const angleToCursor = Math.atan2(dy, dx);
        // slight bias of rotation toward facing cursor
        const targetRot = p.rot + (angleToCursor - p.rot - Math.PI/2) * 0.005;
        // very subtle — barely perceptible
        if (Math.abs(targetRot - p.sprite.rotation) > 0.0003) {
          p.sprite.rotation += (targetRot - p.sprite.rotation) * 0.06 * dt;
          dirty = false; // rotation handled here, don't overwrite below
        }
      }

      if (dirty) {
        p.sprite.x = p.x;
        p.sprite.y = p.y;
        p.sprite.rotation = p.rot;
      } else if (Math.abs(p.vx) > 0.01 || Math.abs(p.vy) > 0.01) {
        p.sprite.x = p.x;
        p.sprite.y = p.y;
      }
    }
  }

  // Idle breeze: rare random gentle nudge to a piece
  breezeTimer += dt;
  if (breezeTimer > 240) { // ~every 4s at 60fps
    breezeTimer = 0;
    if (Math.random() < 0.45 && !activePiece) {
      const p = pieces[Math.floor(Math.random() * pieces.length)];
      if (p && !p.isDragging) {
        p.vx += (Math.random() - 0.5) * 0.6;
        p.vy += (Math.random() - 0.5) * 0.4;
        p.vrot += (Math.random() - 0.5) * 0.004;
      }
    }
  }
}

function buildSpriteForPiece(piece, providedTex) {
  const tex = providedTex || PIXI.Assets.get(piece.src);
  if (!tex) return;
  const sprite = new PIXI.Sprite(tex);
  sprite.anchor.set(0.5);
  sprite.x = piece.x;
  sprite.y = piece.y;
  sprite.rotation = piece.rot;
  sprite.scale.set(piece.scale);
  sprite.eventMode = 'static';
  sprite.cursor = 'none';
  sprite.zIndex = piece.zIndex || 0;
  piece.sprite = sprite;
  artLayer.addChild(sprite);

  // Tape / pin / paperclip overlay
  if (piece.attachment) {
    const att = piece.attachment;
    const attTex = PIXI.Assets.get(att.src);
    if (attTex) {
      const attSprite = new PIXI.Sprite(attTex);
      attSprite.anchor.set(0.5);
      attSprite.x = att.dx;
      attSprite.y = att.dy;
      attSprite.rotation = att.rot;
      attSprite.scale.set(att.scale || 1);
      attSprite.alpha = att.alpha ?? 1;
      attSprite.eventMode = 'none';
      sprite.addChild(attSprite);
    }
  }

  // User-dropped pieces get a yellow washi tape strip on top
  if (piece.isUser) {
    const tapeTex = PIXI.Assets.get(url('/j-ui-elements/' + Object.keys(manifest.ui).find(k => k.includes('washi') || k.includes('tape') || k.includes('yellow')) || 'a07-washi-tape-strip-yellow.png')) || PIXI.Assets.get(manifest.ui['washi-tape-strip-yellow']?.src);
    if (tapeTex) {
      const tape = new PIXI.Sprite(tapeTex);
      tape.anchor.set(0.5);
      tape.x = (Math.random() - 0.5) * (piece.w * 0.3);
      tape.y = -piece.h * 0.5 + 8;
      tape.rotation = (Math.random() - 0.5) * 0.5;
      tape.scale.set(0.7 + Math.random() * 0.3);
      tape.alpha = 0.9;
      tape.eventMode = 'none';
      sprite.addChild(tape);
    }
  }

  // Drag handling
  sprite.on('pointerdown', (e) => onPiecePointerDown(e, piece));

  // Double-click: reveal handwritten note (skip for user pieces — they have no zone story)
  let lastTap = 0;
  sprite.on('pointertap', (e) => {
    if (piece.isUser) return;
    const now = performance.now();
    if (now - lastTap < 320) {
      showNote(piece, e.global.x, e.global.y);
      playChime(880, 0.6, 0.04);
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });

  // Hover: lift slightly
  sprite.on('pointerover', () => {
    if (piece.isDragging) return;
    piece.hoverActive = true;
    piece.savedZ = sprite.zIndex;
    sprite.zIndex = 50000;
    piece.targetScale = piece.scale * 1.03;
  });
  sprite.on('pointerout', () => {
    piece.hoverActive = false;
    sprite.zIndex = piece.savedZ ?? piece.zIndex;
    piece.targetScale = piece.scale;
    piece.targetExtraRot = 0;
  });
}

async function addUserPiece(droppedPiece) {
  // Convert screen drop coords -> world coords
  const screen = droppedPiece.droppedAtScreen;
  const wx = (screen.x - world.x) / view.zoom;
  const wy = (screen.y - world.y) / view.zoom;

  // Auto-scale large images down to a reasonable size
  const maxDim = 600;
  const m = Math.max(droppedPiece.w, droppedPiece.h);
  const scaleNorm = m > maxDim ? maxDim / m : 1;

  const tex = await PIXI.Assets.load(droppedPiece.src);
  const piece = {
    id: droppedPiece.id,
    src: droppedPiece.src,
    zone: 'user',
    w: droppedPiece.w,
    h: droppedPiece.h,
    x: wx,
    y: wy,
    rot: (Math.random() - 0.5) * 0.3,
    scale: 0.7 + Math.random() * 0.25,
    vx: 0, vy: 0, vrot: 0,
    isDragging: false,
    isUser: true,
    zIndex: 99000 + pieces.length,
  };
  // The "scale" baseline is multiplied by the natural-size adjustment
  piece.scale *= scaleNorm;
  pieces.push(piece);
  buildSpriteForPiece(piece, tex);
  // Persist position by scheduling a save
  scheduleSave(pieces);
  // Soft chime + rustle
  playChime(659.25, 0.8, 0.05);
  playPaperRustle(0.7);
}

function setupModePicker(currentMode) {
  const cards = document.querySelectorAll('.mode-card');
  cards.forEach(c => {
    if (c.dataset.mode === (currentMode || 'drift')) {
      c.classList.add('selected');
    }
    c.addEventListener('click', () => {
      cards.forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
    });
  });
}

main().catch(err => {
  console.error('Failed to launch the atelier', err);
  document.getElementById('loading').innerHTML = `
    <div style="font-family:monospace; color:#3D2E1F; padding:24px; max-width:500px; text-align:center;">
      <p>The studio couldn't open.</p>
      <pre style="font-size:11px; opacity:0.6; text-align:left; white-space:pre-wrap;">${err.message}\n${err.stack || ''}</pre>
    </div>
  `;
});
