/**
 * Ambient audio.
 * Uses real CC0 ambient music (Pixabay), self-hosted in /audio/.
 * Two tracks crossfade randomly so it doesn't feel loopy.
 *
 * Plus a tiny procedural paper-rustle SFX (cheap noise burst) for pan
 * and a soft chime for discovery moments — kept very quiet.
 */

// Resolve under whatever base path the app runs at
const _BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const TRACKS = [
  _BASE + '/audio/ambient-1.mp3',
  _BASE + '/audio/ambient-2.mp3',
];

const TARGET_GAIN = 0.42;       // music volume (0..1)
const FADE_TIME_MS = 1400;
const CROSSFADE_TAIL_MS = 4000; // when one track is near end, start crossfading to next

let isOn = false;
let audioCtx = null;        // for SFX only
let sfxMasterGain = null;
let players = [];           // { audio: HTMLAudioElement, gainTarget: number, fadeRaf: number|null }
let activeIdx = 0;
let crossfadeScheduled = false;

export function isAudioOn() { return isOn; }

export function toggleAudio() { setAudioEnabled(!isOn); return isOn; }

export function setAudioEnabled(enabled) {
  if (enabled) start();
  else stop();
}

function start() {
  if (isOn) return;
  isOn = true;
  ensureSfxCtx();
  ensurePlayers();
  // Fade in active player
  const p = players[activeIdx];
  fadeTo(p.audio, TARGET_GAIN, FADE_TIME_MS);
  p.audio.play().catch(err => {
    console.warn('Audio play failed (browser blocked autoplay?)', err);
  });
}

function stop() {
  if (!isOn) return;
  isOn = false;
  for (const p of players) {
    fadeTo(p.audio, 0, FADE_TIME_MS * 0.6, () => p.audio.pause());
  }
}

function ensurePlayers() {
  if (players.length) return;
  for (const src of TRACKS) {
    const a = new Audio();
    a.src = src;
    a.loop = false;        // we crossfade between tracks ourselves
    a.preload = 'auto';
    a.volume = 0;
    a.crossOrigin = 'anonymous';
    players.push({ audio: a, fadeRaf: null });
  }

  // When the active track is nearing its end, start crossfading to the next
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    p.audio.addEventListener('timeupdate', () => {
      if (!isOn) return;
      if (i !== activeIdx) return;
      if (crossfadeScheduled) return;
      const remaining = (p.audio.duration || 0) - p.audio.currentTime;
      if (remaining > 0 && remaining < (CROSSFADE_TAIL_MS / 1000)) {
        crossfadeScheduled = true;
        const next = (activeIdx + 1) % players.length;
        const nextP = players[next];
        nextP.audio.currentTime = 0;
        nextP.audio.play().catch(()=>{});
        fadeTo(nextP.audio, TARGET_GAIN, CROSSFADE_TAIL_MS);
        fadeTo(p.audio, 0, CROSSFADE_TAIL_MS, () => {
          p.audio.pause();
          p.audio.currentTime = 0;
        });
        activeIdx = next;
        // allow next crossfade after a tick
        setTimeout(() => { crossfadeScheduled = false; }, CROSSFADE_TAIL_MS + 200);
      }
    });
    // Failsafe: if a track ends without crossfade firing (e.g. duration unknown), restart loop
    p.audio.addEventListener('ended', () => {
      if (!isOn) return;
      if (i !== activeIdx) return;
      const next = (activeIdx + 1) % players.length;
      const nextP = players[next];
      nextP.audio.currentTime = 0;
      nextP.audio.volume = TARGET_GAIN;
      nextP.audio.play().catch(()=>{});
      activeIdx = next;
    });
  }
}

function fadeTo(el, target, dur, done) {
  // cancel any existing fade
  if (el._fadeRaf) cancelAnimationFrame(el._fadeRaf);
  const start = el.volume;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min(1, (now - t0) / dur);
    el.volume = clamp(start + (target - start) * t, 0, 1);
    if (t < 1) {
      el._fadeRaf = requestAnimationFrame(step);
    } else {
      el._fadeRaf = null;
      if (done) done();
    }
  }
  el._fadeRaf = requestAnimationFrame(step);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------- SFX (very small) ----------

function ensureSfxCtx() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  sfxMasterGain = audioCtx.createGain();
  sfxMasterGain.gain.value = 0.55;
  sfxMasterGain.connect(audioCtx.destination);
}

let lastRustle = 0;
export function playPaperRustle(intensity = 1) {
  if (!isOn || !audioCtx) return;
  const now = performance.now();
  if (now - lastRustle < 110) return;
  lastRustle = now;

  const t = audioCtx.currentTime;
  const dur = 0.16 + Math.random() * 0.1;
  const buf = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;

  const f = audioCtx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2400 + Math.random() * 1500;
  f.Q.value = 1.8;

  const g = audioCtx.createGain();
  const peak = 0.045 * Math.min(1, intensity);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(f);
  f.connect(g);
  g.connect(sfxMasterGain);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export function playChime(freq = 880, duration = 0.9, vol = 0.07) {
  if (!isOn || !audioCtx) return;
  const t = audioCtx.currentTime;
  // Two-tone chime — fundamental + soft fifth above
  const tones = [
    { f: freq,        a: vol },
    { f: freq * 1.5,  a: vol * 0.4 },
    { f: freq * 2,    a: vol * 0.18 },
  ];
  for (const tone of tones) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tone.f, t);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(tone.a, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(sfxMasterGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}
