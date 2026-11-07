// Sons synthétisés (Web Audio), aucun fichier à charger : la pince qui claque, la carte qui glisse sur la corde,
// la carte qu'on retourne, le fil qui casse, le vent, la fanfare.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Un tap discret sur un bouton du jeu. */
  tap: () => tone(700, 0.05, { type: 'triangle', gain: 0.025 }),
  /** On prend une carte en main : un frottement de papier. */
  pick: () => noise(0.09, { gain: 0.12, freq: 3200, q: 0.8, fade: 2, sweep: 1800 }),
  /** La carte glisse sur la corde, puis la pince claque. */
  hang: () => {
    noise(0.16, { gain: 0.1, freq: 1400, q: 0.7, fade: 1.5, sweep: 2600 });
    noise(0.03, { gain: 0.32, freq: 1800, q: 3, fade: 6, delay: 0.15 });
    tone(1250, 0.05, { type: 'triangle', gain: 0.03, delay: 0.15 });
  },
  /** Une pince seule. */
  clip: () => {
    noise(0.025, { gain: 0.3, freq: 2000, q: 3, fade: 6 });
    tone(1400, 0.04, { type: 'triangle', gain: 0.025 });
  },
  /** On est d'accord : deux notes qui montent. */
  agree: () => {
    tone(523.25, 0.12, { type: 'triangle', gain: 0.04 });
    tone(783.99, 0.18, { type: 'triangle', gain: 0.04, delay: 0.09 });
  },
  /** Le thème est choisi : un petit carillon. */
  theme: () => [659.25, 880, 1046.5].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.035, delay: i * 0.08 })),
  /** Une carte se retourne : un claquement de linge au vent, et une note qui monte avec le rang. */
  flip: (step = 0) => {
    noise(0.07, { gain: 0.18, freq: 900, q: 0.9, fade: 3, sweep: 2400 });
    tone(392 * 2 ** (Math.min(step, 14) / 12), 0.22, { type: 'triangle', gain: 0.04, delay: 0.04 });
  },
  /** Le fil casse. */
  snap: () => {
    noise(0.12, { gain: 0.4, freq: 600, q: 0.8, fade: 5 });
    tone(220, 0.35, { type: 'sawtooth', gain: 0.03, slide: 0.5 });
  },
  /** Coup de vent : une nouvelle manche. */
  wind: () => noise(0.9, { gain: 0.07, freq: 500, q: 0.6, fade: 0.8, sweep: 1400, type: 'bandpass' }),
  /** Manche réussie, ou ratée. */
  fanfare: (good: boolean) => {
    const notes = good ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5] : [392, 369.99, 349.23, 293.66];
    notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.9 : 0.18, { type: 'triangle', gain: 0.055, delay: i * 0.12 }));
  },
  /** Début de partie. */
  start: () => {
    noise(0.7, { gain: 0.06, freq: 600, q: 0.6, fade: 0.8, sweep: 1600 });
    [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.04, delay: 0.3 + i * 0.1 }));
  },
};
