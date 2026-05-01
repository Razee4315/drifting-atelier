/**
 * Atmospheric effects:
 *   - Sun beam slowly rotates and shifts hue across the day cycle
 *   - Hidden mega-image revealed when zooming out far
 *   - Ladybug occasionally walks across the screen
 */
import * as PIXI from 'pixi.js';

// ---------- Sun beam ----------

let sunSprite = null;
let sunStartTime = performance.now();

export function setSunSprite(sprite) {
  sunSprite = sprite;
  if (sunSprite) {
    // Anchor at center for rotation
    sunSprite.anchor?.set(0.5);
    sunSprite.position.set(window.innerWidth / 2, window.innerHeight / 2);
    sunSprite.rotation = -0.4;
  }
}

export function updateSun(dtMs) {
  if (!sunSprite) return;
  const t = (performance.now() - sunStartTime) / 1000; // seconds since load
  // Rotate slowly (~30s for full sweep across, then resets)
  // Real day cycle would take 30 min — feels too slow. Compress to ~3 min cycle.
  const cyclePeriod = 180; // seconds for one slow sweep -π/3 to +π/3
  const phase = (t % cyclePeriod) / cyclePeriod; // 0..1
  const sweep = Math.PI / 3; // 60 degrees range
  sunSprite.rotation = -sweep / 2 + phase * sweep;
  // Subtle alpha pulse (clouds drifting)
  sunSprite.alpha = 0.14 + 0.06 * Math.sin(t * 0.07);
}

export function resizeSun() {
  if (!sunSprite) return;
  // Cover the screen with a margin so rotation doesn't reveal edges
  const w = Math.max(window.innerWidth, window.innerHeight) * 1.6;
  sunSprite.width = w;
  sunSprite.height = w * 0.6;
  sunSprite.position.set(window.innerWidth / 2, window.innerHeight / 2);
}

// ---------- Hidden mega-image at extreme zoom ----------

let megaSprite = null;
const MEGA_MIN_ZOOM = 0.18;  // becomes visible below this zoom
const MEGA_MAX_ALPHA = 0.55;

export function setMegaSprite(sprite) {
  megaSprite = sprite;
  if (megaSprite) {
    megaSprite.anchor?.set(0.5);
    megaSprite.position.set(0, 0);
    megaSprite.alpha = 0;
  }
}

export function updateMega(zoom) {
  if (!megaSprite) return;
  // Linearly fade in as zoom drops below MEGA_MIN_ZOOM
  const t = Math.max(0, Math.min(1, (MEGA_MIN_ZOOM - zoom) / (MEGA_MIN_ZOOM - 0.12)));
  megaSprite.alpha = t * MEGA_MAX_ALPHA;
}

// ---------- Ladybug ----------

const LADYBUG_FRAMES = 8;
const LADYBUG_FRAME_W = 100;
const LADYBUG_FRAME_H = 100;

let ladybugSprite = null;
let ladybugTextures = [];
let ladybugState = null; // {x, y, dx, dy, frame, frameTimer, life}

export function initLadybug(spriteSheetTexture, parent) {
  // Slice the 800x100 sprite sheet into 8 frames of 100x100
  ladybugTextures = [];
  const baseTex = spriteSheetTexture.source ?? spriteSheetTexture.baseTexture;
  for (let i = 0; i < LADYBUG_FRAMES; i++) {
    const frame = new PIXI.Rectangle(i * LADYBUG_FRAME_W, 0, LADYBUG_FRAME_W, LADYBUG_FRAME_H);
    const tex = new PIXI.Texture({ source: baseTex, frame });
    ladybugTextures.push(tex);
  }
  ladybugSprite = new PIXI.Sprite(ladybugTextures[0]);
  ladybugSprite.anchor.set(0.5);
  ladybugSprite.alpha = 0;
  ladybugSprite.zIndex = 100000;
  parent.addChild(ladybugSprite);
}

export function maybeStartLadybug() {
  if (!ladybugSprite) return;
  if (ladybugState) return; // already walking
  // Spawn at random edge, walking toward random opposite-ish point
  const side = Math.floor(Math.random() * 4);
  const W = window.innerWidth, H = window.innerHeight;
  let x, y, dx, dy;
  const speed = 0.4 + Math.random() * 0.4; // px/frame
  if (side === 0) { // top
    x = Math.random() * W; y = -50;
    dx = (Math.random() - 0.5) * 0.6; dy = speed;
  } else if (side === 1) { // right
    x = W + 50; y = Math.random() * H;
    dx = -speed; dy = (Math.random() - 0.5) * 0.6;
  } else if (side === 2) { // bottom
    x = Math.random() * W; y = H + 50;
    dx = (Math.random() - 0.5) * 0.6; dy = -speed;
  } else { // left
    x = -50; y = Math.random() * H;
    dx = speed; dy = (Math.random() - 0.5) * 0.6;
  }
  ladybugState = {
    x, y, dx, dy,
    frame: 0,
    frameTimer: 0,
    life: 0,
    fadeIn: true,
  };
  ladybugSprite.alpha = 0;
}

export function updateLadybug(dt) {
  if (!ladybugSprite || !ladybugState) return;
  const s = ladybugState;
  s.x += s.dx * dt;
  s.y += s.dy * dt;
  s.life += dt;

  // Walk cycle
  s.frameTimer += dt;
  if (s.frameTimer > 5) {
    s.frameTimer = 0;
    s.frame = (s.frame + 1) % LADYBUG_FRAMES;
    ladybugSprite.texture = ladybugTextures[s.frame];
  }

  // Face direction of movement
  ladybugSprite.rotation = Math.atan2(s.dy, s.dx) + Math.PI / 2;
  ladybugSprite.position.set(s.x, s.y);
  ladybugSprite.scale.set(0.5);

  // Fade in
  if (s.fadeIn && ladybugSprite.alpha < 1) {
    ladybugSprite.alpha = Math.min(1, ladybugSprite.alpha + 0.02 * dt);
  }

  // End when off screen + faded out
  const W = window.innerWidth, H = window.innerHeight;
  if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) {
    ladybugSprite.alpha = 0;
    ladybugState = null;
  }
}
