// All the site's sound in one place: the mute switch and the garden loop.
// Browser only. Nothing here makes a noise until a tap has happened.

const GARDEN = "/audio/garden.mp3";
const LEVEL = 0.5; // the garden sits well under the voiceover and the songs
const KEY = "sound-off";

let muted = false;
let read = false;
let ducked = 0; // how many things are talking over the garden right now
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let started = false;
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

function settle(seconds = 0.8) {
  if (!ctx || !gain) return;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setTargetAtTime(level(), ctx.currentTime, seconds / 3);
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
  // The garden loop. Call it from a tap, or after one. Safe to call twice.
  async startGarden() {
    load();
    if (started) return;
    started = true;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
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
