import * as THREE from "three";

// Builds the cover's three maps on canvases: the leather photo tiled at the
// right scale, with the tooled border, the stitching and the pressed-in name
// worked into the colour, the surface relief and the shine.

export const COVER_W = 2.1;
export const COVER_L = 2.9;

export type CoverMaps = { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; armMap: THREE.CanvasTexture };

type Sources = { diff: HTMLImageElement; nor: HTMLImageElement; arm: HTMLImageElement };

const TILES_ACROSS = 1.1; // how many times the leather photo repeats across the cover width

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })!] as const;
}

function tile(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const size = w / TILES_ACROSS;
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) ctx.drawImage(img, x, y, size, size);
}

function roundRect(ctx: CanvasRenderingContext2D, inset: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, r);
}

// Stroke the same path several times, wide and faint to narrow and strong, for a soft-edged line.
function softStroke(ctx: CanvasRenderingContext2D, width: number, rgb: string, alpha: number) {
  for (let i = 4; i >= 1; i--) {
    ctx.lineWidth = width * (0.4 + i * 0.4);
    ctx.strokeStyle = `rgba(${rgb},${alpha / i})`;
    ctx.stroke();
  }
}

export async function buildCover(
  src: Sources,
  opts: { height: number; chestnut: boolean; nameFont: string; name: string },
): Promise<CoverMaps> {
  const H = opts.height;
  const W = Math.round((H * COVER_W) / COVER_L);
  const u = W / COVER_W; // pixels per scene unit

  const [colC, col] = canvas(W, H);
  const [armC, arm] = canvas(W, H);
  const [norC, nor] = canvas(W, H);
  const [, hgt] = canvas(W, H);

  tile(col, src.diff, W, H);
  tile(arm, src.arm, W, H);
  tile(nor, src.nor, W, H);

  if (opts.chestnut) {
    // chestnut: pull the orange back toward brown, then warm and lift it a little
    col.globalCompositeOperation = "saturation";
    col.fillStyle = "rgba(128,128,128,0.3)";
    col.fillRect(0, 0, W, H);
    col.globalCompositeOperation = "multiply";
    col.fillStyle = "#e8c4a0";
    col.fillRect(0, 0, W, H);
    col.globalCompositeOperation = "screen";
    col.fillStyle = "rgba(125,78,48,0.3)";
    col.fillRect(0, 0, W, H);
    col.globalCompositeOperation = "source-over";
  }

  // big faint blotches so the repeat of the photo does not read as a pattern
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = (0.25 + rnd() * 0.5) * W;
    const g = col.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.45;
    g.addColorStop(0, dark ? "rgba(20,8,0,0.16)" : "rgba(255,214,170,0.07)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    col.fillStyle = g;
    col.fillRect(0, 0, W, H);
  }

  // height: mid grey is the leather surface, darker is pressed in, lighter is raised
  hgt.fillStyle = "rgb(128,128,128)";
  hgt.fillRect(0, 0, W, H);

  // hands rub the rim pale and smooth over the years
  roundRect(col, 0, W, H, 0.05 * u);
  softStroke(col, 0.05 * u, "226,170,120", 0.2);

  const groove = (inset: number, width: number, depth: number) => {
    for (const [ctx, rgb, a] of [
      [col, "18,7,0", 0.5],
      [hgt, "0,0,0", depth],
      [arm, "40,40,40", 0.35],
    ] as const) {
      roundRect(ctx, inset * u, W, H, 0.06 * u);
      softStroke(ctx, width * u, rgb, a);
    }
  };
  groove(0.07, 0.012, 0.5); // the channel the stitching sits in
  groove(0.19, 0.022, 0.8); // tooled border, outer line
  groove(0.235, 0.009, 0.6); // tooled border, inner line

  // ---- wear: what years of being carried around do ----
  // corners rub pale and rough first
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const r = (0.22 + rnd() * 0.16) * u;
    const g = col.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(214,170,128,0.5)");
    g.addColorStop(0.5, "rgba(200,150,105,0.16)");
    g.addColorStop(1, "rgba(200,150,105,0)");
    col.fillStyle = g;
    col.fillRect(0, 0, W, H);
    const ga = arm.createRadialGradient(cx, cy, 0, cx, cy, r);
    ga.addColorStop(0, "rgba(255,255,0,0.45)");
    ga.addColorStop(1, "rgba(255,255,0,0)");
    arm.fillStyle = ga;
    arm.fillRect(0, 0, W, H);
  }
  // scratches and scuffs: thin, pale, mostly short, a few long ones
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const len = (i < 5 ? 0.5 + rnd() * 0.5 : 0.05 + rnd() * 0.22) * u;
    const a = rnd() * 6.3;
    const bendX = x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * len * 0.2;
    const bendY = y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * len * 0.2;
    const path = (ctx: CanvasRenderingContext2D, style: string, width: number) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(bendX, bendY, x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    };
    path(col, `rgba(226,186,146,${0.1 + rnd() * 0.22})`, Math.max(1, 0.003 * u));
    path(hgt, "rgba(0,0,0,0.28)", Math.max(1, 0.004 * u));
    path(arm, "rgba(255,255,0,0.4)", Math.max(1, 0.004 * u));
  }
  // creases along the spine side, where the cover flexes every time it opens
  for (let i = 0; i < 5; i++) {
    const x0 = (0.1 + i * 0.035 + rnd() * 0.02) * u;
    for (const [ctx, style] of [[col, "rgba(18,7,0,0.22)"], [hgt, "rgba(0,0,0,0.35)"]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = Math.max(1, 0.004 * u);
      ctx.beginPath();
      let y = rnd() * 0.3 * H;
      ctx.moveTo(x0, y);
      const end = H - rnd() * 0.3 * H;
      let k = 0;
      while (y < end) {
        y += 0.08 * u;
        ctx.lineTo(x0 + Math.sin(k++ * 1.3 + i) * 0.006 * u, y);
      }
      ctx.stroke();
    }
  }
  // a darker, smoother patch where a hand holds it, and specks of dust
  {
    const g = col.createRadialGradient(W * 0.62, H * 0.52, 0, W * 0.62, H * 0.52, W * 0.42);
    g.addColorStop(0, "rgba(30,12,2,0.2)");
    g.addColorStop(1, "rgba(30,12,2,0)");
    col.fillStyle = g;
    col.fillRect(0, 0, W, H);
    const ga = arm.createRadialGradient(W * 0.62, H * 0.52, 0, W * 0.62, H * 0.52, W * 0.42);
    ga.addColorStop(0, "rgba(255,70,0,0.3)");
    ga.addColorStop(1, "rgba(255,70,0,0)");
    arm.fillStyle = ga;
    arm.fillRect(0, 0, W, H);
    for (let i = 0; i < 500; i++) {
      col.fillStyle = `rgba(235,220,195,${0.05 + rnd() * 0.16})`;
      col.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
  }

  // stitching: short cream threads, each slightly off, sitting proud of the groove
  const stitch = 0.05 * u;
  const gapLen = 0.028 * u;
  const inset = 0.07 * u;
  const run = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.floor(len / (stitch + gapLen));
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    const pad = (len - n * (stitch + gapLen) + gapLen) / 2;
    for (let i = 0; i < n; i++) {
      const s = pad + i * (stitch + gapLen);
      const j = (rnd() - 0.5) * 0.006 * u;
      const ax = x0 + dx * s - dy * j;
      const ay = y0 + dy * s + dx * j;
      const bx = ax + dx * stitch;
      const by = ay + dy * stitch;
      const line = (ctx: CanvasRenderingContext2D, width: number, style: string, ox = 0, oy = 0) => {
        ctx.lineCap = "round";
        ctx.lineWidth = width;
        ctx.strokeStyle = style;
        ctx.beginPath();
        ctx.moveTo(ax + ox, ay + oy);
        ctx.lineTo(bx + ox, by + oy);
        ctx.stroke();
      };
      // the holes at each end pull the leather in
      for (const [hx, hy] of [[ax, ay], [bx, by]]) {
        hgt.fillStyle = "rgba(0,0,0,0.7)";
        hgt.beginPath();
        hgt.arc(hx, hy, 0.011 * u, 0, 7);
        hgt.fill();
        col.fillStyle = "rgba(15,6,0,0.6)";
        col.beginPath();
        col.arc(hx, hy, 0.011 * u, 0, 7);
        col.fill();
      }
      line(col, 0.017 * u, "rgba(20,8,0,0.45)", 0.004 * u, 0.005 * u);
      const tone = 112 + Math.floor(rnd() * 26);
      line(col, 0.011 * u, `rgb(${tone + 14},${tone},${tone - 30})`);
      line(col, 0.004 * u, "rgba(255,246,220,0.3)", -0.002 * u, -0.002 * u);
      line(hgt, 0.015 * u, "rgba(255,255,255,0.85)");
      line(arm, 0.013 * u, "rgba(255,235,0,0.9)"); // thread is matte: full roughness, no metal
    }
  };
  const r = 0.09 * u;
  run(inset + r, inset, W - inset - r, inset);
  run(W - inset, inset + r, W - inset, H - inset - r);
  run(W - inset - r, H - inset, inset + r, H - inset);
  run(inset, H - inset - r, inset, inset + r);

  // the name, pressed in and burnished darker
  const fontPx = 0.17 * u;
  const font = `${fontPx}px ${opts.nameFont}`;
  await document.fonts.load(font, opts.name).catch(() => {});
  for (const [ctx, style, blurs] of [
    [hgt, "0,0,0", [[0.02, 0.18], [0.01, 0.3], [0, 0.85]]],
    [col, "16,6,0", [[0.012, 0.12], [0, 0.5]]],
    [arm, "30,30,30", [[0, 0.45]]],
  ] as const) {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const [spread, alpha] of blurs) {
      ctx.fillStyle = ctx.strokeStyle = `rgba(${style},${alpha})`;
      ctx.lineWidth = spread * u * 2;
      if (spread > 0) ctx.strokeText(opts.name, W / 2, H * 0.73);
      ctx.fillText(opts.name, W / 2, H * 0.73);
    }
  }

  // turn the height picture into slopes and add them to the leather's own grain
  const hd = hgt.getImageData(0, 0, W, H).data;
  const nImg = nor.getImageData(0, 0, W, H);
  const nd = nImg.data;
  const STRENGTH = 5.5;
  const at = (x: number, y: number) => hd[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const sx = ((at(x + 1, y) - at(x - 1, y)) / 255) * STRENGTH;
      const sy = ((at(x, y + 1) - at(x, y - 1)) / 255) * STRENGTH;
      let nx = (nd[i] / 255) * 2 - 1 - sx;
      let ny = (nd[i + 1] / 255) * 2 - 1 + sy;
      let nz = (nd[i + 2] / 255) * 2 - 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      nd[i] = (nx * 0.5 + 0.5) * 255;
      nd[i + 1] = (ny * 0.5 + 0.5) * 255;
      nd[i + 2] = (nz * 0.5 + 0.5) * 255;
    }
  }
  nor.putImageData(nImg, 0, 0);

  const texture = (c: HTMLCanvasElement, colour = false) => {
    const t = new THREE.CanvasTexture(c);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: texture(colC, true), normalMap: texture(norC), armMap: texture(armC) };
}
