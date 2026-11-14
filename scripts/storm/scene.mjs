// What gets rendered: the list of frames for each clip, and where the lightning sits.
// The timing comes from components/intro/storm.json, the same file the site reads.
import { readFileSync } from "node:fs";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "../..");
export const storm = JSON.parse(readFileSync(path.join(root, "components/intro/storm.json"), "utf8"));

const L = 16;
const PZ = 19.4444;
const TL = 26;
const N = storm.loop;
const PORTAL_FRAMES = 120;
const PORTAL_FPS = 24;

const wiggle = (z) => {
  const a = (2 * Math.PI * z) / L;
  return [0.55 * Math.sin(a) + 0.22 * Math.sin(2 * a + 1.3), 0.16 * Math.sin(2 * a + 0.4) + 0.09 * Math.sin(3 * a + 2)];
};
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const portalZ = (t) => PZ - 9 + 7.2 * t + 27.8 * Math.pow(t, 1.772);
const eyeAt = wiggle(PZ);

// a small seeded random, so a re-render gives the same bolt
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a jagged path from a to b: each point steps toward the end and is knocked sideways
function jagged(rand, a, b, steps, wander) {
  const pts = [a];
  let at = a.slice();
  for (let i = 1; i <= steps; i++) {
    const left = steps - i + 1;
    at = at.map((v, k) => v + (b[k] - v) / left + (rand() - 0.5) * wander * (i < steps ? 1 : 0));
    pts.push(at.slice());
  }
  return pts;
}

function makeBolt(seed, from, to) {
  const rand = rng(seed);
  const main = jagged(rand, from, to, 26, 0.36);
  const segs = [];
  for (let i = 0; i < main.length - 1; i++) segs.push({ a: main[i], b: main[i + 1], bright: 1, width: 0.011 });
  // forks leave the channel and die out
  for (const at of [5, 9, 14, 19]) {
    const start = main[at];
    const side = rand() > 0.5 ? 1 : -1;
    const end = [start[0] + side * (1.2 + rand() * 1.6), start[1] - 1.0 - rand() * 1.3, start[2] + (rand() - 0.5) * 1.5];
    const fork = jagged(rand, start, end, 7, 0.3);
    for (let i = 0; i < fork.length - 1; i++) segs.push({ a: fork[i], b: fork[i + 1], bright: 0.34 * (1 - i / 8), width: 0.007 });
  }
  const lights = [3, 10, 17, 24].map((i) => main[i]);
  return { segs, lights };
}

// Where each flash is, measured from the camera at the moment it fires: [right, up, ahead].
// colour is the lamp's strength; the far ones are deep inside the cloud so only their glow shows.
const WHITE = [0.72, 0.82, 1.0];
const LAMPS = {
  "far-1": [{ at: [5.0, 3.1, 15], power: 170, size: 0.6 }],
  "far-2": [{ at: [-6.0, -2.3, 13], power: 150, size: 0.6 }],
  "far-3": [{ at: [1.5, 3.3, 20], power: 220, size: 0.6 }, { at: [-3.5, 3.0, 17], power: 120, size: 0.6 }],
  "sheet-1": [{ at: [-4.2, 3.0, 8], power: 80, size: 0.5 }, { at: [-1.8, 3.2, 12], power: 75, size: 0.5 }],
  "sheet-2": [{ at: [4.4, -2.0, 7], power: 70, size: 0.5 }, { at: [3.0, 3.0, 10], power: 80, size: 0.5 }],
  "sheet-3": [{ at: [0.6, 3.2, 6], power: 75, size: 0.5 }, { at: [-2.4, 3.0, 9.5], power: 85, size: 0.5 }, { at: [2.6, 3.1, 12], power: 75, size: 0.5 }],
  pre: [{ at: [1.2, 3.3, 7.5], power: 80, size: 0.5 }],
};

const lampUniform = (p, power, size, kind = 0, tint = WHITE) => ({ p: [...p, size], c: [...tint.map((v) => v * power), kind] });

function loopJob(set, frame) {
  return { file: `clouds${set.suffix}/${String(frame).padStart(4, "0")}`, w: set.w, h: set.h, mode: 0, sun: 1, u: frame / N, samples: set.samples, steps: set.steps, exposure: 1, bloom: 0.5, quality: set.q.loop };
}

// the frames of one flash: the same camera as the loop, lit only by this flash
function flashJobs(set, flash) {
  const first = Math.floor(flash.at * storm.fps);
  const count = Math.ceil(flash.len * storm.fps) + 2;
  const camZ = (first / N) * L; // unwrapped
  const cam = [...wiggle(camZ), camZ];
  let lights, segs = [];
  if (flash.name === "strike") {
    const bolt = makeBolt(11, [cam[0] + 1.3, cam[1] + 3.4, camZ + 7.6], [cam[0] + 0.45, cam[1] - 2.6, camZ + 6.6]);
    segs = bolt.segs;
    lights = bolt.lights.map((p) => ({ p, power: 30, size: 1.0 }));
  } else {
    lights = LAMPS[flash.name].map((l) => ({ p: [cam[0] + l.at[0], cam[1] + l.at[1], camZ + l.at[2]], power: l.power, size: l.size }));
  }
  const jobs = [];
  const scale = flash.half ? 0.5 : 1;
  for (let i = 0; i < count; i++) {
    const f = first + i;
    const shift = Math.floor(f / N) * L; // the loop has wrapped: bring the lamp back with it
    jobs.push({
      file: `clouds${set.suffix}/${flash.name}/${String(i).padStart(4, "0")}`,
      w: Math.round((set.w * scale) / 2) * 2, h: Math.round((set.h * scale) / 2) * 2,
      mode: 0, sun: 0, u: (f % N) / N, samples: flash.half ? set.samples * 3 : set.samples * 1.5, steps: set.steps, exposure: 1, bloom: 1.0,
      lights: lights.map((l) => lampUniform([l.p[0], l.p[1], l.p[2] - shift], l.power, l.size)),
      segs: segs.map((s) => ({ a: [s.a[0], s.a[1], s.a[2] - shift, s.bright], b: [s.b[0], s.b[1], s.b[2] - shift, s.width] })),
      quality: set.q.flash,
    });
  }
  return { jobs, first, count, scale };
}

const BLUE = [0.16, 0.46, 1.0];
function eyeJobs(set) {
  const eye = storm.eye;
  const first = Math.floor(eye.at * storm.fps);
  const count = Math.ceil(eye.len * storm.fps) + 2;
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const f = first + i;
    jobs.push({
      file: `clouds${set.suffix}/eye/${String(i).padStart(4, "0")}`,
      w: set.w / 2, h: set.h / 2, mode: 0, sun: 0, u: (f % N) / N, samples: set.samples * 3, steps: set.steps, exposure: 1, bloom: 1.0,
      lights: [lampUniform([...eyeAt, PZ + 0.2], 26, 0.6, 0, BLUE)],
      eye: [1.3, 0.12, 1.2, 0],
      quality: set.q.flash,
    });
  }
  return { jobs, first, count, scale: 0.5 };
}

// lamps the portal clip always has: the eye itself, and the daylight at the tunnel's far end
function portalLamps(t) {
  const open = 0.75 + 0.25 * smooth(0, 0.3, t);
  return [
    lampUniform([...eyeAt, PZ - 1.3], 30 * open, 1.3, 0, BLUE),
    lampUniform([...eyeAt, PZ + 0.6], 22 * open, 0.8, 0, BLUE),
    lampUniform([...eyeAt, PZ + TL + 3], 75, 13, 1, [0.9, 0.95, 1.0]),
    lampUniform([...eyeAt, PZ + 5], 7, 6, 1, [0.22, 0.5, 1.0]),
    lampUniform([...eyeAt, PZ + 13], 7, 6, 1, [0.45, 0.7, 1.0]),
  ];
}
const portalEye = (t) => [1.4, 0.07, 1.2 + 2.6 * t, 0.55 + 0.45 * smooth(0, 0.16, t)];

function portalJob(set, frame) {
  const t = frame / (PORTAL_FRAMES - 1);
  return {
    file: `portal${set.suffix}/${String(frame).padStart(4, "0")}`, w: set.w, h: set.h, mode: 1, sun: 1, u: t,
    samples: Math.round(set.samples * 1.25), steps: set.steps, exposure: 1, bloom: 0.4, shutter: 0.35 / (PORTAL_FRAMES - 1),
    lights: portalLamps(t), eye: portalEye(t), white: smooth(0.86, 1, t), quality: frame > 104 ? set.q.portal - 12 : set.q.portal,
  };
}

// a flicker that runs down the tunnel wall ahead of us
function tunnelJobs(set, flash, index) {
  const first = Math.floor(flash.at * PORTAL_FPS);
  const count = Math.ceil(flash.len * PORTAL_FPS) + 1;
  const jobs = [];
  const z0 = portalZ(first / (PORTAL_FRAMES - 1));
  const ang = index * 2.4 + 0.7;
  for (let i = 0; i < count; i++) {
    const t = (first + i) / (PORTAL_FRAMES - 1);
    const z = z0 + 4.5 + (i / count) * 7; // it runs on ahead
    const bore = 1.2 + 0.75 * smooth(3, TL, z - PZ) + 0.55;
    const lamps = [0, 1].map((k) => {
      const a = ang + k * 2.2 + (i / count) * 0.8;
      return lampUniform([eyeAt[0] + Math.cos(a) * bore, eyeAt[1] + Math.sin(a) * bore, z + k * 2.5], 30, 0.5);
    });
    jobs.push({
      file: `portal${set.suffix}/${flash.name}/${String(i).padStart(4, "0")}`,
      w: set.w / 2, h: set.h / 2, mode: 1, sun: 0, u: t, samples: set.samples * 3, steps: set.steps, exposure: 1, bloom: 1.0,
      lights: lamps, eye: [0, 0, portalEye(t)[2], 1], quality: set.q.flash,
    });
  }
  return { jobs, first, count, scale: 0.5 };
}

export const SETS = {
  wide: { suffix: "", w: 1280, h: 720, samples: 8, steps: 300, q: { loop: 90, portal: 90, flash: 84 } },
  tall: { suffix: "-tall", w: 608, h: 1080, samples: 8, steps: 300, q: { loop: 90, portal: 90, flash: 84 } },
};

// every frame of one set, and the two manifests that describe them to the site
export function plan(setName) {
  const set = SETS[setName];
  const jobs = [];
  for (let f = 0; f < N; f++) jobs.push(loopJob(set, f));
  const overlays = [];
  for (const flash of storm.flashes) {
    const made = flashJobs(set, flash);
    jobs.push(...made.jobs);
    overlays.push({ name: flash.name, first: made.first, count: made.count });
  }
  const eye = eyeJobs(set);
  jobs.push(...eye.jobs);
  overlays.push({ name: "eye", first: eye.first, count: eye.count });

  const tunnel = [];
  for (let f = 0; f < PORTAL_FRAMES; f++) jobs.push(portalJob(set, f));
  storm.tunnel.forEach((flash, i) => {
    const made = tunnelJobs(set, flash, i);
    jobs.push(...made.jobs);
    tunnel.push({ name: flash.name, first: made.first, count: made.count });
  });
  return {
    jobs,
    manifests: {
      [`clouds${set.suffix}`]: { frames: N, width: set.w, height: set.h, fps: storm.fps, overlays },
      [`portal${set.suffix}`]: { frames: PORTAL_FRAMES, width: set.w, height: set.h, fps: PORTAL_FPS, overlays: tunnel },
    },
  };
}
