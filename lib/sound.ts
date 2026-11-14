// The mute switch, the garden loop and the portal swoosh.
// Browser only. Nothing here makes a noise until a tap has happened.
// The songs are not in here: they are plain <audio> elements (see lib/player.ts) and
// nothing in this file touches their sound.

const GARDEN = "/audio/garden.mp3";
const LEVEL = 0.5; // the garden sits well under the voiceover and the songs
const KEY = "sound-off";

let muted = false;
let read = false;
let ducked = 0; // how many things are talking over the garden right now
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let started = false;
let whoosh: GainNode | null = null; // the swoosh that is sounding now, if one is
const listeners = new Set<() => void>();

function load() {
  if (read || typeof window === "undefined") return;
  read = true;
  try {
    muted = window.localStorage.getItem(KEY) === "1";
  } catch {}
}

function level() {
  return muted ? 0 : ducked > 0 ? LEVEL * 0.2 : LEVEL;
}

// One audio context for the visit. Browsers only let it run after a tap.
function context() {
  if (ctx) return ctx;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
  } catch {}
  return ctx;
}

function hush(seconds: number) {
  if (!ctx || !whoosh) return;
  whoosh.gain.cancelScheduledValues(ctx.currentTime);
  whoosh.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
  whoosh = null;
}

// The swoosh is made here, not downloaded: a couple of seconds of hiss pushed through a
// filter that sweeps upward while it swells, then falls away. Soft on purpose.
const SWOOSH = { rise: 1, fall: 1.5, peak: 0.2 };

function makeSwoosh(c: AudioContext, at: number) {
  const seconds = SWOOSH.rise + SWOOSH.fall;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * (seconds + 0.2)), c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // each sample leans on the one before, which takes the sharp edge off the hiss
    last = last * 0.55 + (Math.random() * 2 - 1) * 0.45;
    data[i] = last;
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const sweep = c.createBiquadFilter();
  sweep.type = "bandpass";
  sweep.Q.value = 0.8;
  sweep.frequency.setValueAtTime(220, at);
  sweep.frequency.exponentialRampToValueAtTime(1300, at + SWOOSH.rise);
  sweep.frequency.exponentialRampToValueAtTime(420, at + seconds);
  const soften = c.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 2600;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(SWOOSH.peak, at + SWOOSH.rise);
  out.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  source.connect(sweep).connect(soften).connect(out).connect(c.destination);
  source.start(at);
  source.stop(at + seconds + 0.1);
  source.onended = () => {
    out.disconnect();
    if (whoosh === out) whoosh = null;
  };
  return out;
}

function settle(seconds = 0.8) {
  if (!ctx) return;
  if (muted) hush(seconds);
  if (gain) {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(level(), ctx.currentTime, seconds / 3);
  }
  // no reason to keep the audio hardware awake while everything is muted
  if (muted) window.setTimeout(() => muted && ctx?.suspend(), seconds * 1000 + 200);
  else void ctx.resume();
}

export const sound = {
  get muted() {
    load();
    return muted;
  },
  setMuted(next: boolean) {
    load();
    muted = next;
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
    settle(0.3);
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  // Call this from the first tap, so the browser lets sound start later without one.
  unlock() {
    load();
    void context()?.resume();
  },
  // The whoosh of going through the portal. `delay` is seconds from now. It only sounds
  // once a tap has happened, and not at all while the sound is off.
  swoosh(delay = 0) {
    load();
    const c = muted ? null : context();
    if (!c || c.state !== "running") return;
    hush(0.1);
    whoosh = makeSwoosh(c, c.currentTime + delay);
  },
  stopSwoosh() {
    hush(0.25);
  },
  // The garden loop. Call it from a tap, or after one. Safe to call twice.
  async startGarden() {
    load();
    if (started) return;
    started = true;
    try {
      const ctx = context();
      if (!ctx) throw new Error("no audio here");
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const data = await (await fetch(GARDEN)).arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // MP3 files carry a sliver of silence at each end; loop inside it
      source.loopStart = 0.06;
      source.loopEnd = buffer.duration - 0.06;
      source.connect(gain);
      source.start(0, 0.06);
      settle(2.5);
    } catch {
      started = false; // no sound is fine; the site works without it
    }
  },
  // while the voiceover or a song plays, the garden drops back
  duck(on: boolean) {
    ducked = Math.max(0, ducked + (on ? 1 : -1));
    settle(0.5);
  },
};
