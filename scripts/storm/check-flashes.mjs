// Checks the lightning against the WCAG 2.3.1 flash rule (no more than three flashes in
// any one second) using the real frames and the real timeline.
//
// It plays the intro in numbers: for each 1/60 s it takes the cloud frame that would be
// on screen, lays the flash layers over it exactly as Intro.tsx does (screen blend, the
// envelope from storm.json, the same gain), and measures relative luminance in a 4x4 grid
// of screen regions. A flash is counted the WCAG way: a rise of 10% or more of full
// brightness followed by a fall of 10% or more. It reports the worst region.
//
//   node scripts/storm/check-flashes.mjs [wide|tall]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const storm = JSON.parse(readFileSync(path.join(root, "components/intro/storm.json"), "utf8"));
const suffix = process.argv[2] === "tall" ? "-tall" : "";
const GAIN = 0.85; // FLASH_GAIN in Intro.tsx
const W = 16, H = 8, HZ = 60;

const cache = new Map();
function frame(file) {
  if (!cache.has(file)) {
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", path.join(root, "public/frames", file), "-vf", `scale=${W}:${H}:flags=area`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
    cache.set(file, Float32Array.from(raw, (v) => v / 255));
  }
  return cache.get(file);
}
const name = (dir, i) => `${dir}/${String(i).padStart(4, "0")}.webp`;
const envelope = (env, t) => {
  for (let i = 1; i < env.length; i++) {
    const [t0, v0] = env[i - 1], [t1, v1] = env[i];
    if (t <= t1) return t < t0 ? 0 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return env.at(-1)[1];
};
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// luminance of each of the 16 regions, for a base frame with layers [{pixels, alpha}] over it
function regions(base, layers) {
  const out = new Float32Array(16);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const rgb = [0, 1, 2].map((c) => {
        let v = base[(y * W + x) * 3 + c];
        for (const l of layers) v += l.alpha * l.pixels[(y * W + x) * 3 + c] * (1 - v); // screen
        return linear(v);
      });
      out[Math.floor(y / 2) * 4 + Math.floor(x / 4)] += (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 8;
    }
  return out;
}

function run(label, seconds, at) {
  const series = [];
  for (let k = 0; k < seconds * HZ; k++) series.push(at(k / HZ));
  let worst = { count: 0, region: 0, peak: 0, swing: 0 };
  for (let r = 0; r < 16; r++) {
    // walk the curve: remember the last turning point, count a flash on each rise-then-fall of 0.1
    const flashes = [];
    let low = series[0][r], high = -1, rising = false, peak = 0, swing = 0;
    for (let k = 0; k < series.length; k++) {
      const v = series[k][r];
      peak = Math.max(peak, v);
      if (!rising) {
        low = Math.min(low, v);
        if (v - low >= 0.1) { rising = true; high = v; }
      } else {
        high = Math.max(high, v);
        swing = Math.max(swing, high - low);
        if (high - v >= 0.1) { flashes.push(k / HZ); rising = false; low = v; }
      }
    }
    let count = 0;
    for (const t of flashes) count = Math.max(count, flashes.filter((u) => u >= t && u < t + 1).length);
    if (count > worst.count || (count === worst.count && swing > worst.swing)) worst = { count, region: r, peak, swing, total: flashes.length };
  }
  const mean = series.map((s) => s.reduce((a, b) => a + b) / 16);
  console.log(`${label}: at most ${worst.count} flash(es) in any one second (worst region ${worst.region}, ${worst.total ?? 0} over the whole clip), ` +
    `largest swing ${(worst.swing * 100).toFixed(0)}% of full brightness, brightest region ${(worst.peak * 100).toFixed(0)}%, brightest whole-screen average ${(Math.max(...mean) * 100).toFixed(0)}%`);
  return worst.count;
}

const cloudDir = `clouds${suffix}`, portalDir = `portal${suffix}`;
const a = run(`clouds${suffix}`, 19, (t) => {
  const f = Math.floor(t * storm.fps);
  const layers = [];
  for (const flash of [...storm.flashes, storm.eye]) {
    const local = t - flash.at;
    if (local < 0 || local > flash.len) continue;
    const i = f - Math.floor(flash.at * storm.fps);
    layers.push({ pixels: frame(name(`${cloudDir}/${flash.name}`, i)), alpha: envelope(flash.env, local) * (flash.name === "eye" ? 1 : GAIN) });
  }
  return regions(frame(name(cloudDir, f % storm.loop)), layers);
});
const b = run(`portal${suffix}`, 4.95, (t) => {
  const f = Math.floor(t * 24);
  const layers = [];
  for (const flash of storm.tunnel) {
    const local = t - flash.at;
    if (local < 0 || local > flash.len) continue;
    layers.push({ pixels: frame(name(`${portalDir}/${flash.name}`, f - Math.floor(flash.at * 24))), alpha: envelope(flash.env, local) * GAIN });
  }
  return regions(frame(name(portalDir, f)), layers);
});
if (Math.max(a, b) > 3) {
  console.error("too many flashes in one second");
  process.exit(1);
}
console.log("within the three-flashes-a-second limit");
