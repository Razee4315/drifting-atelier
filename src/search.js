/**
 * Cmd/Ctrl+K search modal — fuzzy-search by piece id (which encodes the title)
 * and zone name. Picking a result flies the camera to that piece.
 */

let allPieces = [];
let zoneById = {};
let onFlyTo = null;
let modal, input, results;
let highlightedIdx = 0;
let visible = [];

export function setupSearch({ pieces, zones, onFlyTo: flyToCb }) {
  allPieces = pieces;
  zoneById = Object.fromEntries(zones.map(z => [z.id, z.name]));
  onFlyTo = flyToCb;
  modal = document.getElementById('search-modal');
  input = document.getElementById('search-input');
  results = document.getElementById('search-results');

  // Open on Cmd+K / Ctrl+K
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      open();
    } else if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      close();
    }
  });

  // Open on toolbar button
  const btn = document.getElementById('btn-search');
  if (btn) btn.addEventListener('click', open);

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', handleKey);
}

function open() {
  modal.classList.remove('hidden');
  input.value = '';
  highlightedIdx = 0;
  render('');
  setTimeout(() => input.focus(), 30);
}

function close() {
  modal.classList.add('hidden');
}

function score(piece, q) {
  if (!q) return 1;
  const haystack = (piece.id + ' ' + (zoneById[piece.zone] || piece.zone)).toLowerCase();
  const ql = q.toLowerCase();
  if (haystack.includes(ql)) return 100;
  // Token-wise score
  let s = 0;
  for (const tok of ql.split(/\s+/).filter(Boolean)) {
    if (haystack.includes(tok)) s += 10;
  }
  return s;
}

function render(q) {
  const scored = allPieces
    .map(p => ({ p, s: score(p, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 30);
  visible = scored.map(x => x.p);
  highlightedIdx = Math.min(highlightedIdx, Math.max(0, visible.length - 1));

  results.innerHTML = '';
  if (visible.length === 0) {
    results.innerHTML = `<div class="search-empty">no pieces match "${escape(q)}"</div>`;
    return;
  }
  for (let i = 0; i < visible.length; i++) {
    const p = visible[i];
    const row = document.createElement('div');
    row.className = 'search-row' + (i === highlightedIdx ? ' active' : '');
    row.dataset.idx = i;
    const title = humanize(p.id);
    const zone = zoneById[p.zone] || p.zone;
    row.innerHTML = `
      <span class="search-title">${escape(title)}</span>
      <span class="search-zone">${escape(zone)}</span>
    `;
    row.addEventListener('click', () => pick(i));
    row.addEventListener('mousemove', () => setHighlight(i));
    results.appendChild(row);
  }
}

function setHighlight(i) {
  highlightedIdx = i;
  for (const row of results.children) {
    row.classList.toggle('active', Number(row.dataset.idx) === i);
  }
}

function handleKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setHighlight(Math.min(visible.length - 1, highlightedIdx + 1));
    scrollHighlightedIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setHighlight(Math.max(0, highlightedIdx - 1));
    scrollHighlightedIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    pick(highlightedIdx);
  }
}

function scrollHighlightedIntoView() {
  const row = results.children[highlightedIdx];
  if (row) row.scrollIntoView({ block: 'nearest' });
}

function pick(i) {
  const p = visible[i];
  if (!p || !onFlyTo) return;
  onFlyTo(p.x, p.y, 1.0);
  close();
}

function humanize(id) {
  // strip leading code like "a01-" / "b02-" / "h11-"
  return id.replace(/^[a-z]\d+-/i, '').replace(/-/g, ' ');
}

function escape(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
}
