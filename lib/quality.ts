// Decides how hard the garden scene is allowed to work on this device,
// and backs the resolution off while it runs if frames come too slowly.

export type Tier = "high" | "medium" | "low";

export type Quality = {
  tier: Tier;
  pixelRatio: number; // upper limit; the scaler below may go lower
  textures: "" | "_2k"; // file suffix: 1K or 2K
  coverSize: number; // height of the cover's baked maps, in pixels
  density: number; // grass blades per square unit of lawn
  leaves: number; // fallen oak leaves
  msaa: number;
  depthOfField: boolean;
  blurTaps: number;
  wind: boolean;
  pollen: number; // drifting seeds in the air; the first extra to go on slower devices
};

const SETTINGS: Record<Tier, Omit<Quality, "tier">> = {
  high: { pixelRatio: 2, textures: "_2k", coverSize: 2048, density: 1250, leaves: 7, msaa: 2, depthOfField: true, blurTaps: 12, wind: true, pollen: 34 },
  medium: { pixelRatio: 1.5, textures: "", coverSize: 1024, density: 1300, leaves: 4, msaa: 2, depthOfField: true, blurTaps: 9, wind: true, pollen: 14 },
  // Old or small devices. These get the flat fallback (FlatGarden) instead of the 3D scene,
  // so these numbers only matter if that choice in Stage.tsx is ever changed.
  low: { pixelRatio: 1, textures: "", coverSize: 1024, density: 650, leaves: 3, msaa: 0, depthOfField: false, blurTaps: 1, wind: false, pollen: 0 },
};

export function pickQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touch = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 700;
  const stillness = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const weak = (nav.deviceMemory !== undefined && nav.deviceMemory <= 3) || navigator.hardwareConcurrency <= 4;

  let tier: Tier = touch ? "medium" : "high";
  if (touch && weak) tier = "low";
  const q = { tier, ...SETTINGS[tier] };
  if (stillness) {
    q.wind = false;
    q.pollen = 0;
  }
  q.pixelRatio = Math.min(q.pixelRatio, window.devicePixelRatio || 1);
  return q;
}

// Watches frame times. When too many frames in a row of sixty come late it lowers the
// render scale a step, down to a floor. It never raises it again, so the picture does
// not pump.
//
// "Late" is a frame that took over 20 ms: on an ordinary 60 Hz screen that is a missed
// refresh. It used to wait for the average to pass 21 ms, which a garden running at a
// steady 48 to 55 frames a second never did, so it sat there juddering and was never
// helped. Counting late frames catches that, and a single long frame (a page being laid
// out, a texture arriving) no longer costs the picture its sharpness for good.
// `fixed` (from ?scale= in the address) holds the scale where it starts, for measuring.
const WINDOW = 60;
export function createScaler(start = 1, fixed = false, floor = 0.55) {
  let scale = start;
  let frames = 0;
  let late = 0;
  let total = 0;
  return {
    get scale() {
      return scale;
    },
    // feed it each frame's duration; returns true when the scale just changed
    sample(ms: number) {
      if (fixed || ms > 250) return false; // tab was in the background
      total += ms;
      if (ms > 20) late++;
      if (++frames < WINDOW) return false;
      const share = late / WINDOW;
      const average = total / WINDOW;
      frames = late = total = 0;
      if (share > 0.15 && scale > floor) {
        // a bigger miss gets a bigger step
        scale = Math.max(floor, scale * (average > 28 ? 0.78 : 0.88));
        return true;
      }
      return false;
    },
  };
}
