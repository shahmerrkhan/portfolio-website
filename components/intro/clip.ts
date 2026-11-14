// One pre-rendered clip: a folder of WebP frames and a manifest.
// The compressed files are all kept (a few megabytes). Only the few frames about to
// be shown are kept decoded, because a decoded frame is several megabytes and a phone
// cannot hold hundreds of them.
//
// A clip can carry layers: short runs of frames that hold only the light a lightning
// flash (or the portal's glow) adds, on black. They are laid over the clip's own frames
// with a "screen" blend, so the site decides when and how brightly each one shows.

export type Layer = { name: string; first: number; count: number };
type Manifest = { frames: number; width: number; height: number; fps: number; overlays?: Layer[] };

const AHEAD = 6;

export class Clip {
  frames = 0;
  layers: Layer[] = [];
  private blobs: (Blob | undefined)[] = [];
  private bitmaps = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private stopped = false;

  // A layer has no manifest of its own: its length comes from its parent's.
  constructor(
    private dir: string,
    private loops = false,
    frames = 0,
  ) {
    this.frames = frames;
    this.blobs = new Array(frames);
  }

  // read the manifest; after this `frames` and `layers` are known
  async open() {
    try {
      const manifest: Manifest = await (await fetch(`${this.dir}/manifest.json`)).json();
      if (this.stopped) return;
      this.frames = manifest.frames;
      this.layers = manifest.overlays ?? [];
      this.blobs = new Array(manifest.frames);
    } catch {
      // a missing clip just means nothing is drawn; the intro still runs
    }
  }

  // download the frames (or just one of them, for the still version)
  async load(only = -1) {
    if (!this.frames) await this.open();
    const one = async (i: number) => {
      try {
        const res = await fetch(`${this.dir}/${String(i).padStart(4, "0")}.webp`);
        if (res.ok && !this.stopped) this.blobs[i] = await res.blob();
      } catch {}
    };
    if (only >= 0) return one(only);
    // a few downloads at a time, in order, so the start of the clip arrives first
    let next = 0;
    const worker = async () => {
      while (!this.stopped && next < this.frames) await one(next++);
    };
    await Promise.all(Array.from({ length: 5 }, worker));
  }

  // how many frames from the start have arrived
  get arrived() {
    let n = 0;
    while (n < this.frames && this.blobs[n]) n++;
    return n;
  }

  // Say which frame is showing. Decodes it and the next few, drops the ones behind.
  // `also` is a second place in the clip to keep ready (while one view melts into another).
  want(at: number, also = -1) {
    const keep = new Set<number>();
    for (const base of also < 0 ? [at] : [at, also]) {
      for (let k = 0; k <= AHEAD; k++) {
        const i = base + k;
        if (this.loops) keep.add(((i % this.frames) + this.frames) % this.frames);
        else if (i >= 0 && i < this.frames) keep.add(i);
      }
    }
    for (const [i, bitmap] of this.bitmaps) {
      if (!keep.has(i)) {
        bitmap.close();
        this.bitmaps.delete(i);
      }
    }
    for (const i of keep) {
      const blob = this.blobs[i];
      if (!blob || this.bitmaps.has(i) || this.decoding.has(i)) continue;
      this.decoding.add(i);
      createImageBitmap(blob).then(
        (bitmap) => {
          this.decoding.delete(i);
          if (this.stopped || this.bitmaps.has(i)) bitmap.close();
          else this.bitmaps.set(i, bitmap);
        },
        () => this.decoding.delete(i),
      );
    }
  }

  get(i: number) {
    return this.bitmaps.get(i);
  }

  // let go of the decoded frames (a flash that is over), keeping the downloads
  rest() {
    this.bitmaps.forEach((b) => b.close());
    this.bitmaps.clear();
  }

  dispose() {
    this.stopped = true;
    this.rest();
    this.blobs = [];
  }
}

// fill the canvas with a frame, cropping whatever spills over.
// `light` lays it on as added light instead of paint.
export function cover(ctx: CanvasRenderingContext2D, image: ImageBitmap, alpha = 1, light = false) {
  if (alpha <= 0) return;
  const { width: w, height: h } = ctx.canvas;
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.globalAlpha = Math.min(1, alpha);
  if (light) ctx.globalCompositeOperation = "screen";
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}
