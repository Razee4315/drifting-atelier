/**
 * HUD: zone label that updates based on viewport center,
 * and the zoom/reset/sound buttons.
 */
import { toggleAudio, isAudioOn, setAudioEnabled } from './audio.js';

export function setupHUD({ onZoomIn, onZoomOut, onReset, getCurrentZone }) {
  document.getElementById('btn-zoom-in').addEventListener('click', onZoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', onZoomOut);
  document.getElementById('btn-reset').addEventListener('click', onReset);

  const soundBtn = document.getElementById('btn-sound');

  function paintSoundBtn() {
    const on = isAudioOn();
    soundBtn.style.opacity = on ? '1' : '0.45';
    soundBtn.style.background = on ? 'var(--sun)' : 'var(--paper)';
    soundBtn.title = on ? 'Sound on (click to mute)' : 'Sound off (click to play ambient)';
  }
  paintSoundBtn();

  soundBtn.addEventListener('click', () => {
    toggleAudio();
    paintSoundBtn();
  });

  // Keyboard 'S' toggles
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 's' || e.key === 'S') {
      toggleAudio();
      paintSoundBtn();
    }
  });

  // Update zone label every 200ms
  const label = document.getElementById('hud-zone');
  let lastName = '';
  setInterval(() => {
    const zone = getCurrentZone();
    if (!zone) return;
    if (zone.name !== lastName) {
      lastName = zone.name;
      label.style.opacity = '0';
      setTimeout(() => {
        label.textContent = zone.name;
        label.style.opacity = '0.6';
      }, 220);
    }
  }, 220);
}
