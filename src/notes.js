/**
 * Handwritten artist notes — a small post-it that floats above a piece
 * when you double-click it. Each zone has a flavor of message.
 */

const NOTES = {
  cave: [
    'drawn by hand. unknown. very old.',
    'someone was here. they wanted to be remembered.',
    'older than language.',
    'a charcoal stick. a wall. a cold night.',
  ],
  garden: [
    'pressed between two pages, spring.',
    'collected on a slow walk, never named.',
    'the bee was alive when this was drawn.',
    'taken from the herbarium, never returned.',
  ],
  nursery: [
    'by anya, age 6 ½.',
    'this is mom. i love her.',
    'made at school during quiet time.',
    'fridge magnet held this for two summers.',
  ],
  salon: [
    'study. circa 1612.',
    'unfinished. the model left.',
    'patron refused payment. kept anyway.',
    'from a sketchbook found in a flooded basement.',
  ],
  float: [
    'a dream i had on tuesday.',
    'painted from memory of nothing.',
    "the shape kept changing — i couldn't catch it.",
    'real. just not here.',
  ],
  press: [
    'pulled from a wall in the rain.',
    'first edition. last of three.',
    'the show that night was sold out.',
    'one corner torn. the rest survived.',
  ],
  static: [
    'found behind a dresser. nobody claimed it.',
    'the camera worked exactly twice.',
    'this is everyone i had a beer with that summer.',
    "smell of basement. couldn't get rid of it.",
  ],
  hearth: [
    'left here on the desk.',
    "i'll get back to this one tomorrow.",
    'the coffee was bad but the morning was nice.',
    'tools of the trade. all of them.',
  ],
  'loose-ends': [
    'a scrap. probably nothing.',
    'kept this for some reason.',
    'half a thought.',
    'the back of a napkin, for emergencies.',
  ],
};

let activeNote = null;
let hideTimer = null;

export function showNote(piece, screenX, screenY) {
  hideNote();
  const messages = NOTES[piece.zone] || NOTES['loose-ends'];
  const text = messages[Math.floor(Math.random() * messages.length)];

  const el = document.createElement('div');
  el.className = 'piece-note';
  el.textContent = text;
  document.body.appendChild(el);
  // Position above the piece on screen
  el.style.left = `${screenX}px`;
  el.style.top = `${screenY - 20}px`;
  // small random rotation
  const rot = (Math.random() - 0.5) * 6;
  el.style.transform = `translate(-50%, -100%) rotate(${rot}deg) scale(0.85)`;
  // Animate in
  requestAnimationFrame(() => {
    el.classList.add('visible');
    el.style.transform = `translate(-50%, -100%) rotate(${rot}deg) scale(1)`;
  });
  activeNote = el;

  hideTimer = setTimeout(() => hideNote(), 4400);
}

export function hideNote() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (activeNote) {
    const n = activeNote;
    activeNote = null;
    n.classList.remove('visible');
    n.style.opacity = '0';
    setTimeout(() => n.remove(), 280);
  }
}
