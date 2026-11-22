"use client";
// "Cha-ching" cash register sound, synthesized with Web Audio (no audio file to download or license).
// Per-device mute setting lives in localStorage.

const KEY = "pinkas:sound";

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage blocked: setting just won't persist */
  }
}

let ctx: AudioContext | null = null;

export function playChaChing() {
  if (!isSoundOn()) return;
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    void ac.resume();
    const t0 = ac.currentTime;
    const out = ac.createGain();
    out.gain.value = 0.35;
    out.connect(ac.destination);

    // "cha": short burst of filtered noise (the drawer mechanism)
    const len = Math.floor(ac.sampleRate * 0.08);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    noise.connect(hp).connect(out);
    noise.start(t0);

    // "ching": two bright bell strikes with a few inharmonic partials
    const bell = (start: number, base: number) => {
      for (const [mult, vol] of [
        [1, 0.6],
        [2.76, 0.25],
        [5.4, 0.12],
      ] as const) {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = base * mult;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(vol, start + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
        osc.connect(g).connect(out);
        osc.start(start);
        osc.stop(start + 1);
      }
    };
    bell(t0 + 0.07, 1568); // G6
    bell(t0 + 0.17, 2093); // C7
  } catch {
    /* no audio support: stay silent */
  }
}
