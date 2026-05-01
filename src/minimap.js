/**
 * Mini-map: tiny stylized map in the bottom-right corner.
 * Shows the 9 zones as labeled dots; clicking one flies the camera there.
 * The viewport rectangle moves and resizes as you pan/zoom.
 */

const MAP_W = 160;
const MAP_H = 110;
// World extent we map onto the minimap (covers all 9 zones + loose ends)
const WORLD_HALF_W = 8000;
const WORLD_HALF_H = 6000;

let zones = [];
let viewportEl = null;
let containerEl = null;
let onFlyTo = null;

export function setupMinimap({ zones: zoneList, onFlyTo: flyToCb }) {
  zones = zoneList.filter(z => z.center);
  onFlyTo = flyToCb;
  containerEl = document.getElementById('minimap');
  viewportEl = document.getElementById('minimap-viewport');
  if (!containerEl) return;

  containerEl.style.width = MAP_W + 'px';
  containerEl.style.height = MAP_H + 'px';

  // Render a dot for each zone
  for (const z of zones) {
    const dot = document.createElement('button');
    dot.className = 'minimap-dot';
    dot.title = z.name;
    dot.dataset.zone = z.id;
    const [px, py] = worldToMap(z.center[0], z.center[1]);
    dot.style.left = `${px}px`;
    dot.style.top = `${py}px`;

    const label = document.createElement('span');
    label.className = 'minimap-label';
    label.textContent = z.name.replace(/^The /, '');
    dot.appendChild(label);

    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onFlyTo) onFlyTo(z.center[0], z.center[1], 0.7);
    });
    containerEl.appendChild(dot);
  }
}

function worldToMap(wx, wy) {
  const x = ((wx + WORLD_HALF_W) / (WORLD_HALF_W * 2)) * MAP_W;
  const y = ((wy + WORLD_HALF_H) / (WORLD_HALF_H * 2)) * MAP_H;
  return [x, y];
}

export function updateMinimap(view, screenW, screenH) {
  if (!viewportEl || !containerEl) return;
  // Viewport rectangle: where the screen extents land in world coords
  const halfWorldW = (screenW / 2) / view.zoom;
  const halfWorldH = (screenH / 2) / view.zoom;
  const [x1, y1] = worldToMap(view.x - halfWorldW, view.y - halfWorldH);
  const [x2, y2] = worldToMap(view.x + halfWorldW, view.y + halfWorldH);
  const w = Math.max(2, Math.min(MAP_W, x2 - x1));
  const h = Math.max(2, Math.min(MAP_H, y2 - y1));
  viewportEl.style.left = `${Math.max(0, x1)}px`;
  viewportEl.style.top = `${Math.max(0, y1)}px`;
  viewportEl.style.width = `${w}px`;
  viewportEl.style.height = `${h}px`;
}
