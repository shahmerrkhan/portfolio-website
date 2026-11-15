// Downloads and decodes the garden's pictures, away from the main thread.
//
// The scene used to hand each file to an <img>, which the browser only decodes at the
// moment the picture is given to the graphics card, on the main thread, and that held
// everything up for a second or more. Here each file is fetched as raw bytes and turned
// into an ImageBitmap, which browsers decode on another thread.
//
// The downloads are asked for by the scene itself, once its own code has arrived. Asking
// earlier was tried and was slower on a phone connection: the photos took the line and
// the scene's code, which has to run before anything can be built, waited behind them.

const T = "/textures";

export type Picture = { image: ImageBitmap | HTMLImageElement; flipped: boolean };

const blobs = new Map<string, Promise<Blob>>();
const pictures = new Map<string, Promise<Picture>>();

function blob(url: string) {
  let b = blobs.get(url);
  if (!b) {
    b = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.blob();
    });
    blobs.set(url, b);
  }
  return b;
}

function plainImage(url: string) {
  return new Promise<Picture>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ image: img, flipped: false });
    img.onerror = reject;
    img.src = url;
  });
}

// `flip`: bottom row first, which is how a WebGL texture wants it (an ImageBitmap cannot
// be flipped later, at upload). Pass false for a picture that will be drawn on a canvas.
// `flipped` in the answer says whether that happened: an old browser gets a plain <img>.
export function picture(url: string, flip: boolean): Promise<Picture> {
  const key = `${flip ? "flip" : "keep"} ${url}`;
  let p = pictures.get(key);
  if (!p) {
    p = blob(url)
      .then((b) => createImageBitmap(b, { imageOrientation: flip ? "flipY" : "none", premultiplyAlpha: "none", colorSpaceConversion: "none" }))
      .then((image) => ({ image, flipped: flip }))
      .catch(() => plainImage(url));
    pictures.set(key, p);
  }
  return p;
}

export const bytes = (url: string) => blob(url).then((b) => b.arrayBuffer());

// Let go of everything held here. The scene calls it once it has what it needs: the
// pictures live on the graphics card by then.
export function forget(urls?: string[]) {
  if (!urls) {
    blobs.clear();
    pictures.clear();
    return;
  }
  for (const url of urls) {
    blobs.delete(url);
    pictures.delete(`flip ${url}`);
    pictures.delete(`keep ${url}`);
  }
}

// The files of the garden and the book. `size` is "" for 1K photos and "_2k" for 2K.
// Every device starts on the 1K set, which is a third of the bytes; the best devices
// then take the 2K set quietly afterwards (see scene.ts).
export const files = {
  leather: (kind: "diff" | "nor" | "arm", size: "" | "_2k") => `${T}/leather/brown_leather_${kind}${size}.jpg`,
  ground: (kind: "diff" | "nor" | "arm", size: "" | "_2k") => `${T}/ground/forrest_ground_01_${kind}${size}.jpg`,
  paper: (kind: "diff" | "nor" | "rough") => `${T}/paper/Paper001_${kind}.jpg`,
  sky: `${T}/hdri/meadow_2.hdr`,
  sheets: ["Foliage008", "LeafSet030", "FlowerSet001", "LeafSet020"].map((n) => `${T}/garden/${n}.webp`),
};
