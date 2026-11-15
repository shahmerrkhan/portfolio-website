// The mute switch, the garden loop, the portal swoosh, and the storm (wind and thunder).
// Browser only. Nothing here makes a noise until a tap has happened.
// The songs are not in here: they are plain <audio> elements (see lib/player.ts) and
// nothing in this file touches their sound. It only gets out of their way (see `song`).

const GARDEN = "/audio/garden.mp3";
const LEVEL = 0.5; // the garden sits well under the voiceover and the songs
const KEY = "sound-off";

let muted = false;
let read = false;
let ducked = 0; // how many things are talking over the garden right now
let song = false; // a song is playing: the garden goes right out, not just down
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let started = false;
let whoosh: GainNode | null = null; // the swoosh that is sounding now, if one is
let storm: GainNode | null = null; // everything the storm makes goes through this one node
let stormSources: AudioScheduledSourceNode[] = [];
const listeners = new Set<() => void>();

function load() {
  if (read || typeof window === "undefined") return;
  read = true;
  try {
    muted = window.localStorage.getItem(KEY) === "1";
  } catch {}
}

function level() {
  return muted || song ? 0 : ducked > 0 ? LEVEL * 0.2 : LEVEL;
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

// The storm is made here too, not downloaded. Wind: soft noise through a band filter
// whose pitch and level wander slowly. Thunder: low noise shaped into a few overlapping
// rolls with a long tail, through a filter that closes as it dies away, so it is all
// rumble and no hiss. The big clap adds a soft thump underneath. All of it is kept well
// under the voiceover (see STORM below) and none of it is ever sharp.
const STORM = { wind: 0.045, thunder: 1 };

function softNoise(c: AudioContext, seconds: number, shape?: (t: number) => number) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // each sample is mostly the one before: this is what makes it a rumble
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5 * (shape ? shape(i / c.sampleRate) : 1);
  }
  return buffer;
}

function makeWind(c: AudioContext, out: AudioNode) {
  const source = c.createBufferSource();
  source.buffer = softNoise(c, 6);
  source.loop = true;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 320;
  band.Q.value = 0.5;
  const level = c.createGain();
  level.gain.setValueAtTime(0, c.currentTime);
  level.gain.linearRampToValueAtTime(STORM.wind, c.currentTime + 2.5);
  // two slow wobbles that never line up, one on the pitch and one on the level
  const sway = c.createOscillator();
  sway.frequency.value = 0.13;
  const swayBy = c.createGain();
  swayBy.gain.value = 110;
  sway.connect(swayBy).connect(band.frequency);
  const gust = c.createOscillator();
  gust.frequency.value = 0.21;
  const gustBy = c.createGain();
  gustBy.gain.value = STORM.wind * 0.45;
  gust.connect(gustBy).connect(level.gain);
  source.connect(band).connect(level).connect(out);
  for (const node of [source, sway, gust]) node.start();
  return [source, sway, gust];
}

// `size` 0..1: how near and how big. A far one is a short low murmur; the near one rolls on.
function makeThunder(c: AudioContext, out: AudioNode, level: number, size: number) {
  const at = c.currentTime + 0.02;
  const seconds = 2.6 + size * 3.6;
  const rolls = Array.from({ length: 3 + Math.round(size * 4) }, (_, i) => ({
    at: i === 0 ? 0 : Math.random() * seconds * 0.4,
    rise: 0.05 + Math.random() * 0.15 + (1 - size) * 0.25,
    fall: 0.5 + Math.random() * 0.9 + size * 0.5,
    amount: i === 0 ? 1 : 0.35 + Math.random() * 0.45,
  }));
  const shape = (t: number) => {
    let v = 0;
    for (const r of rolls) {
      const x = t - r.at;
      if (x > 0) v += r.amount * Math.min(1, x / r.rise) * Math.exp(-Math.max(0, x - r.rise) / r.fall);
    }
    return v * Math.min(1, (seconds - t) / 0.6); // no click at the very end
  };
  const source = c.createBufferSource();
  source.buffer = softNoise(c, seconds, shape);
  const low = c.createBiquadFilter();
  low.type = "lowpass";
  low.Q.value = 0.4;
  low.frequency.setValueAtTime(150 + size * 420, at);
  low.frequency.exponentialRampToValueAtTime(70, at + seconds);
  const gain = c.createGain();
  gain.gain.value = level * STORM.thunder;
  source.connect(low).connect(gain).connect(out);
  source.start(at);
  const made: AudioScheduledSourceNode[] = [source];
  if (size >= 1) {
    // the clap itself: a low thump that sinks, felt more than heard
    const thump = c.createOscillator();
    thump.frequency.setValueAtTime(64, at);
    thump.frequency.exponentialRampToValueAtTime(36, at + 0.9);
    const body = c.createGain();
    body.gain.setValueAtTime(0.0001, at);
    body.gain.exponentialRampToValueAtTime(level * 0.8, at + 0.04);
    body.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
    thump.connect(body).connect(out);
    thump.start(at);
    thump.stop(at + 1.6);
    made.push(thump);
  }
  return made;
}

function settle(seconds = 0.8) {
  if (!ctx) return;
  if (muted) hush(seconds);
  if (gain) {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(level(), ctx.currentTime, seconds / 3);
  }
  if (storm) storm.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, seconds / 3);
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
  // The storm under the intro: starts the wind. Call it from the tap that begins the
  // intro. It follows the mute button like everything else.
  startStorm() {
    load();
    const c = context();
    if (!c || storm) return;
    storm = c.createGain();
    storm.gain.value = muted ? 0 : 1;
    storm.connect(c.destination);
    stormSources = makeWind(c, storm);
  },
  // One roll of thunder, now. Does nothing unless the storm is running.
  thunder(level: number, size: number) {
    if (!ctx || !storm || ctx.state !== "running") return;
    const made = makeThunder(ctx, storm, level, size);
    stormSources.push(...made);
    made[0].onended = () => (stormSources = stormSources.filter((n) => !made.includes(n)));
  },
  // Fade the wind and any thunder away and stop them. Safe to call twice.
  stopStorm(seconds = 0.3) {
    if (!ctx || !storm) return;
    const out = storm;
    const sources = stormSources;
    storm = null;
    stormSources = [];
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4);
    window.setTimeout(() => {
      for (const node of sources) {
        try {
          node.stop();
        } catch {}
      }
      out.disconnect();
    }, seconds * 1000 + 150);
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
      // behind the garden's own photos in the queue: the birds can start a moment after
      // the notebook, the notebook should not wait for the birds
      const data = await (await fetch(GARDEN, { priority: "low" })).arrayBuffer();
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
      listeners.forEach((l) => l());
    } catch {
      started = false; // no sound is fine; the site works without it
    }
  },
  // While a song plays the garden is silent, so only the song is heard: out quickly when
  // one starts, back more slowly once nothing is playing. It is a plain yes or no, so
  // going from one song straight to another never lets the birds back in between. The
  // mute switch still wins: level() is zero while muted whatever this says.
  song(on: boolean) {
    if (song === on) return;
    song = on;
    settle(on ? 0.4 : 0.8);
    listeners.forEach((l) => l());
  },
  // for the debug panel: what the garden loop is being held at, and why
  get garden() {
    load();
    if (!started) return "not started";
    return muted ? "silent (site muted)" : song ? "silent (a song is playing)" : ducked > 0 ? "low (voiceover)" : "playing";
  },
  // while the voiceover plays, the garden drops back
  duck(on: boolean) {
    ducked = Math.max(0, ducked + (on ? 1 : -1));
    settle(0.5);
  },
};
