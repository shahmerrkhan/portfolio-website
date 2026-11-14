// One pre-rendered clip: a folder of WebP frames and a manifest.
// The compressed files are all kept (a megabyte or two). Only the few frames about to
// be shown are kept decoded, because a decoded frame is several megabytes and a phone
// cannot hold hundreds of them.

type Manifest = { frames: number; width: number; height: number; fps: number };

const AHEAD = 6;

export class Clip {
  frames = 0;
  width = 16;
  height = 9;
  private blobs: (Blob | undefined)[] = [];
  private bitmaps = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private stopped = false;

  constructor(private dir: string) {}

  async load() {
    try {
      const manifest: Manifest = await (await fetch(`${this.dir}/manifest.json`)).json();
      if (this.stopped) return;
      this.frames = manifest.frames;
      this.width = manifest.width;
      this.height = manifest.height;
      this.blobs = new Array(manifest.frames);
      // a few downloads at a time, in order, so the start of the clip arrives first
      let next = 0;
      const worker = async () => {
        while (!this.stopped && next < this.frames) {
          const i = next++;
          const res = await fetch(`${this.dir}/${String(i).padStart(4, "0")}.webp`);
          if (res.ok) this.blobs[i] = await res.blob();
        }
      };
      await Promise.all(Array.from({ length: 5 }, worker));
    } catch {
      // a missing clip just means nothing is drawn; the intro still runs
    }
  }

  // how many frames from the start have arrived
  get arrived() {
    let n = 0;
    while (n < this.frames && this.blobs[n]) n++;
    return n;
  }

  // Say which frame is showing. Decodes it and the next few, drops the ones behind.
  // `also` is a second place in the clip to keep ready (used when a loop is blending).
  want(at: number, also = -1) {
    const keep = new Set<number>();
    for (const base of [at, also]) {
      if (base < 0) continue;
      for (let k = 0; k <= AHEAD; k++) keep.add((base + k) % this.frames);
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

  dispose() {
    this.stopped = true;
    this.bitmaps.forEach((b) => b.close());
    this.bitmaps.clear();
    this.blobs = [];
  }
}

// fill the canvas with a frame, cropping whatever spills over
export function cover(ctx: CanvasRenderingContext2D, image: ImageBitmap, alpha = 1) {
  const { width: w, height: h } = ctx.canvas;
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.globalAlpha = 1;
}
