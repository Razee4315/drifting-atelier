/**
 * Layout modes — how pieces are arranged when you first enter the studio.
 *
 *   drift        — organic clusters by zone (the default, eras bleed together)
 *   timeline     — pieces arranged west→east by era, ancient on the left
 *   wild         — fully random across the canvas, no zone bias
 *   constellation — tight geometric clusters, more like an exhibit
 */

const ZONE_SCATTER = {
  hearth:    { radius: 1900, falloff: 0.78 },
  cave:      { radius: 2000, falloff: 0.82 },
  garden:    { radius: 2000, falloff: 0.82 },
  nursery:   { radius: 2000, falloff: 0.82 },
  salon:     { radius: 2000, falloff: 0.82 },
  float:     { radius: 2000, falloff: 0.82 },
  press:     { radius: 2000, falloff: 0.82 },
  static:    { radius: 2000, falloff: 0.82 },
};

const LOOSE_ENDS_RADIUS_MIN = 2400;
const LOOSE_ENDS_RADIUS_MAX = 7400;

// Approximate "era" position for timeline mode (x coordinate)
const TIMELINE_X = {
  cave:    -7500,
  salon:   -3000,
  garden:  -1000,
  press:    1000,
  float:    2200,
  hearth:   3500,
  static:   5500,
  nursery:  7500,
  'loose-ends': null, // placed in narrow ribbon along whole timeline
};

export function placeIntoZones(pieces, zones, mode = 'drift') {
  if (mode === 'empty' || mode === 'shared') return placeEmpty(pieces);
  if (mode === 'wild') return placeWild(pieces);
  if (mode === 'timeline') return placeTimeline(pieces);
  if (mode === 'constellation') return placeConstellation(pieces, zones);
  return placeDrift(pieces, zones);
}

// ---------- EMPTY (start fresh) ----------

function placeEmpty(pieces) {
  // Hide all built-in pieces far off-screen at near-zero scale.
  // The user's added pieces (custom uploads + sticky notes) live alongside
  // them in the same array but have isUser/isNote flags; main.js sets those
  // visible at sensible positions.
  for (const p of pieces) {
    p.x = 999999; p.y = 999999;
    p.scale = 0.001;
  }
}

// ---------- DRIFT (default) ----------

function placeDrift(pieces, zones) {
  const byZone = groupBy(pieces, p => p.zone);
  for (const [zoneId, list] of Object.entries(byZone)) {
    if (zoneId === 'loose-ends') {
      placeLooseEndsRing(list);
      continue;
    }
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !zone.center) continue;
    placeInRing(list, zone.center, ZONE_SCATTER[zoneId] || { radius: 2000, falloff: 0.82 }, 0.82);
  }
}

// ---------- WILD (fully random, no zone) ----------

function placeWild(pieces) {
  const W = 14000, H = 10000;
  for (const p of pieces) {
    p.x = (Math.random() - 0.5) * W;
    p.y = (Math.random() - 0.5) * H;
    p.rot = (Math.random() - 0.5) * (Math.PI / 3); // wilder rotation
    p.scale *= 0.85 + Math.random() * 0.4;
  }
}

// ---------- TIMELINE (west to east by era) ----------

function placeTimeline(pieces) {
  const byZone = groupBy(pieces, p => p.zone);
  for (const [zoneId, list] of Object.entries(byZone)) {
    let x = TIMELINE_X[zoneId];
    if (x === null || x === undefined) {
      // loose-ends or unknown — spread along the whole ribbon
      for (const p of list) {
        p.x = (Math.random() - 0.5) * 14000;
        p.y = (Math.random() - 0.5) * 1800 + (Math.random() - 0.5) * 800;
        p.rot = (Math.random() - 0.5) * (Math.PI / 6);
      }
      continue;
    }
    // Pieces tile in a vertical column at x, with slight randomness
    placeInColumn(list, x);
  }
}

function placeInColumn(list, x) {
  // Stack pieces in a vertical band ~2200 wide, 6000 tall
  const placed = [];
  const order = list.slice().sort((a,b) => {
    const ra = Math.max(a.w, a.h) * a.scale;
    const rb = Math.max(b.w, b.h) * b.scale;
    return rb - ra;
  });
  for (const p of order) {
    const pieceR = Math.max(p.w, p.h) * p.scale * 0.5;
    let placedOk = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const px = x + (Math.random() - 0.5) * 1700;
      const py = (Math.random() - 0.5) * 5500;
      let conflict = false;
      for (const q of placed) {
        const dx = px - q.x, dy = py - q.y;
        const need = (q.r + pieceR) * 0.85;
        if (dx*dx + dy*dy < need*need) { conflict = true; break; }
      }
      if (!conflict || attempt > 60) {
        p.x = px; p.y = py;
        placed.push({ x: px, y: py, r: pieceR });
        placedOk = true;
        break;
      }
    }
    if (!placedOk) {
      p.x = x + (Math.random() - 0.5) * 1700;
      p.y = (Math.random() - 0.5) * 5500;
    }
  }
}

// ---------- CONSTELLATION (tight clusters) ----------

function placeConstellation(pieces, zones) {
  // Zones arranged tighter — radius 1100, with some overlap allowed
  const tightScatter = { radius: 1100, falloff: 0.7 };
  const byZone = groupBy(pieces, p => p.zone);
  for (const [zoneId, list] of Object.entries(byZone)) {
    if (zoneId === 'loose-ends') {
      // Loose ends form a wide outer halo
      for (const p of list) {
        const a = Math.random() * Math.PI * 2;
        const r = 5500 + Math.random() * 2500;
        p.x = Math.cos(a) * r;
        p.y = Math.sin(a) * r;
        p.rot = (Math.random() - 0.5) * (Math.PI / 3);
      }
      continue;
    }
    const zone = zones.find(z => z.id === zoneId);
    if (!zone || !zone.center) continue;
    // Tighter packing — 0.92 of summed radii
    placeInRing(list, zone.center, tightScatter, 0.92);
  }
}

// ---------- core ring placement ----------

function placeInRing(list, center, opts, packTightness = 0.82) {
  const [cx, cy] = center;
  const { radius, falloff } = opts;
  const placed = [];

  const order = list.slice().sort((a,b) => {
    const ra = Math.max(a.w, a.h) * a.scale;
    const rb = Math.max(b.w, b.h) * b.scale;
    return rb - ra;
  });

  for (const p of order) {
    const pieceR = Math.max(p.w, p.h) * p.scale * 0.5;
    let placedOk = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const u = Math.pow(Math.random(), falloff);
      const r = u * radius;
      const a = Math.random() * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      let conflict = false;
      for (const q of placed) {
        const dx = x - q.x, dy = y - q.y;
        const need = (q.r + pieceR) * packTightness;
        if (dx*dx + dy*dy < need*need) { conflict = true; break; }
      }
      if (!conflict || attempt > 60) {
        p.x = x; p.y = y;
        placed.push({ x, y, r: pieceR });
        placedOk = true;
        break;
      }
    }
    if (!placedOk) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      p.x = cx + Math.cos(a) * r;
      p.y = cy + Math.sin(a) * r;
    }
  }
}

function placeLooseEndsRing(list) {
  for (const p of list) {
    const a = Math.random() * Math.PI * 2;
    const r = LOOSE_ENDS_RADIUS_MIN + Math.random() * (LOOSE_ENDS_RADIUS_MAX - LOOSE_ENDS_RADIUS_MIN);
    p.x = Math.cos(a) * r;
    p.y = Math.sin(a) * r;
    p.scale *= 0.85;
    p.rot = (Math.random() - 0.5) * (Math.PI / 4);
  }
}

function groupBy(list, fn) {
  const out = {};
  for (const x of list) (out[fn(x)] ||= []).push(x);
  return out;
}
