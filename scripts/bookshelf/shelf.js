// Runs in the browser (see render.mjs). Paints the two shelves of books onto one canvas
// and says where each book ended up, so the page can lay a button over it.
// Everything is drawn from photographs of real cloth, leather, paper and wood (CC0, see
// render.mjs for the list); nothing here is glossy on purpose.

const W = 1100;
const ROW = 310; // room for the tallest book
const PLANK_TOP = 9; // the top face of the board, seen a little from above
const PLANK_FRONT = 24;
const UNDER = 30; // the board's shadow on the paper
const PAD = 8;
const H = PAD + 2 * (ROW + PLANK_TOP + PLANK_FRONT + UNDER);
const LEFT = 52;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a, b) => a + (b - a) * rnd();

const FONTS = { caveat: "600 %px Caveat", reenie: "400 %px 'Reenie Beanie'", apple: "400 %px 'Homemade Apple'" };
const INKS = { gold: "#d8b866", ink: "#2a1e14", cream: "#eadfc2" };

// One per book, in the order of `books` in content/site.ts.
// mat: which photograph. pose: up (standing), lean, flat (lying, in a pile).
// w is the thickness of the spine and h its length, whichever way the book lies.
const STYLE = [
  { mat: "leather", color: "#2f4a36", ink: "gold", font: "apple", w: 84, h: 292, bands: 4 },
  { mat: "paper", color: "#cdbd98", ink: "ink", font: "caveat", w: 78, h: 300 },
  { mat: "cloth", color: "#7a2f2a", ink: "gold", font: "reenie", w: 80, h: 276, rules: true },
  { mat: "paper", color: "#b88a2e", ink: "ink", font: "apple", w: 62, h: 248 },
  { mat: "linen", color: "#3d4048", ink: "cream", font: "caveat", w: 88, h: 284, rules: true },
  { mat: "tan", color: "#c9a26a", ink: "ink", font: "apple", w: 66, h: 236 },
  { mat: "cloth", color: "#2f4a63", ink: "gold", font: "caveat", w: 90, h: 300, rules: true, pose: "lean" },
  { mat: "chestnut", color: "#6e4426", ink: "gold", font: "apple", w: 78, h: 332, bands: 3, pose: "flat" },
  { mat: "linen", color: "#2d5552", ink: "cream", font: "reenie", w: 86, h: 300, pose: "flat" },
  { mat: "paper", color: "#8c4a2a", ink: "cream", font: "caveat", w: 56, h: 262, pose: "flat" },
  { mat: "cloth", color: "#4a3a5c", ink: "gold", font: "caveat", w: 74, h: 322, rules: true, pose: "flat" },
  { mat: "leather", color: "#33291f", ink: "gold", font: "caveat", w: 82, h: 300, bands: 2, pose: "flat" },
  { mat: "paper", color: "#a8433a", ink: "cream", font: "caveat", w: 66, h: 262, pose: "lean" },
  { mat: "paper", color: "#74835a", ink: "ink", font: "reenie", w: 54, h: 244 },
  { mat: "hessian", color: "#b79c6e", ink: "ink", font: "caveat", w: 70, h: 258 },
  { mat: "leather", color: "#6b2a22", ink: "gold", font: "caveat", w: 96, h: 304, bands: 4 },
  { mat: "cloth", color: "#3a3d2a", ink: "gold", font: "reenie", w: 70, h: 270, rules: true },
  { mat: "linen", color: "#5d7a91", ink: "cream", font: "caveat", w: 76, h: 280 },
  { mat: "cloth", color: "#a8792f", ink: "ink", font: "caveat", w: 84, h: 290 },
  { mat: "paper", color: "#b9b6a2", ink: "ink", font: "caveat", w: 80, h: 268 },
];

const TEXTURES = {
  cloth: { src: "book_pattern.jpg", scuff: "book_pattern_ao.jpg", zoom: 1.5, bite: 0.9 },
  linen: { src: "rough_linen.jpg", scuff: "rough_linen_ao.jpg", zoom: 1.9, bite: 1.5 },
  hessian: { src: "hessian_230.jpg", zoom: 2.4, bite: 1.1 },
  leather: { src: "leather_white.jpg", scuff: "leather_white_ao.jpg", zoom: 1.3, bite: 2.2 },
  tan: { src: "fabric_leather_02.jpg", zoom: 1.5, bite: 1.0 },
  chestnut: { src: "brown_leather_diff.jpg", zoom: 1.2, bite: 1.3 },
  paper: { src: "Paper001_diff.jpg", zoom: 1.6, bite: 2.4 },
  wood: { src: "dark_wood.jpg" },
};

const load = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`missing ${src}`));
    img.src = `textures/${src}`;
  });

const make = (w, h) => {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext("2d")];
};

// how bright a photograph is on average, 0..1, so it can be brought to a middle grey
function mean(img) {
  const [, g] = make(8, 8);
  g.drawImage(img, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return s / (d.length / 4) / 255;
}

// One spine, standing, w wide and h tall. Lying and leaning books are this, turned.
function spine(title, author, st, tex) {
  const { w, h } = st;
  const [c, g] = make(w, h);
  const t = tex[st.mat];
  const r = st.mat === "paper" ? 3 : 7;
  g.beginPath();
  g.roundRect(0, 0, w, h, [r, r, 2, 2]);
  g.clip();

  // the colour, then the weave or grain of the photograph laid into it
  g.fillStyle = st.color;
  g.fillRect(0, 0, w, h);
  const sw = Math.min(t.img.width, w * t.zoom);
  const sh = Math.min(t.img.height, h * t.zoom);
  const sx = between(0, t.img.width - sw);
  const sy = between(0, t.img.height - sh);
  g.save();
  g.globalCompositeOperation = "overlay";
  g.filter = `grayscale(1) brightness(${(0.5 / t.mean).toFixed(3)}) contrast(${1 + t.bite})`;
  g.drawImage(t.img, sx, sy, sw, sh, 0, 0, w, h);
  g.restore();
  if (t.scuffImg) {
    g.save();
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = 0.55;
    g.filter = "grayscale(1) contrast(1.5) brightness(1.15)";
    g.drawImage(t.scuffImg, sx, sy, sw, sh, 0, 0, w, h);
    g.restore();
  }

  // a spine is rounded: it falls away into shade at both sides, with a soft, matt lift
  // left of the middle where the light from the upper left lands
  const round = g.createLinearGradient(0, 0, w, 0);
  round.addColorStop(0, "rgba(20,10,0,0.5)");
  round.addColorStop(0.16, "rgba(20,10,0,0.08)");
  round.addColorStop(0.34, "rgba(255,238,205,0.13)");
  round.addColorStop(0.6, "rgba(20,10,0,0.04)");
  round.addColorStop(0.86, "rgba(20,10,0,0.22)");
  round.addColorStop(1, "rgba(20,10,0,0.56)");
  g.fillStyle = round;
  g.fillRect(0, 0, w, h);
  // and it is a little darker toward the foot, where the board shades it
  const fall = g.createLinearGradient(0, 0, 0, h);
  fall.addColorStop(0, "rgba(255,240,210,0.07)");
  fall.addColorStop(0.5, "rgba(0,0,0,0)");
  fall.addColorStop(1, "rgba(20,10,0,0.3)");
  g.fillStyle = fall;
  g.fillRect(0, 0, w, h);

  // raised bands on a leather spine: a ridge with shade under it and light on top
  const marks = [];
  if (st.bands) {
    for (let i = 0; i < st.bands; i++) {
      const y = h * (0.1 + (0.8 * i) / (st.bands - 1));
      marks.push(y);
      g.fillStyle = "rgba(255,235,200,0.16)";
      g.fillRect(0, y - 4, w, 2.5);
      g.fillStyle = "rgba(15,8,0,0.42)";
      g.fillRect(0, y + 2.5, w, 3);
      g.fillStyle = "rgba(15,8,0,0.12)";
      g.fillRect(0, y - 1.5, w, 4);
    }
  }
  // thin gilt rules across a cloth spine, top and bottom, a little broken with age
  if (st.rules) {
    for (const y of [h * 0.085, h * 0.085 + 6, h * 0.9, h * 0.9 + 6]) {
      for (let x = 0; x < w; x += 3) {
        if (rnd() < 0.12) continue;
        g.fillStyle = `rgba(216,184,102,${between(0.45, 0.85)})`;
        g.fillRect(x, y + between(-0.3, 0.3), 3, 1.6);
      }
    }
  }

  // the lettering, written down the spine, with specks of it rubbed away
  // between two bands on a banded spine, or most of the length on a plain one
  const room = st.bands ? (0.8 * h) / (st.bands - 1) - 22 : h * 0.7;
  const words = (text, size, at, alpha, long) => {
    const [lc, lg] = make(h, w);
    let px = size;
    lg.font = FONTS[st.font].replace("%", px);
    const wide = lg.measureText(text).width;
    if (wide > long) px = (px * long) / wide;
    lg.font = FONTS[st.font].replace("%", px);
    lg.textAlign = "center";
    lg.textBaseline = "middle";
    if (st.ink !== "ink") {
      // pressed in: a dark lip under the gilt
      lg.fillStyle = "rgba(15,8,0,0.5)";
      lg.fillText(text, h * at, w / 2 + 1.4);
    }
    lg.fillStyle = INKS[st.ink];
    lg.globalAlpha = alpha;
    lg.fillText(text, h * at, w / 2);
    if (st.ink === "ink") lg.fillText(text, h * at + 0.5, w / 2); // ink sits heavier than gilt
    lg.globalAlpha = 1;
    lg.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 260; i++) {
      lg.fillStyle = `rgba(0,0,0,${between(0.15, 0.7)})`;
      lg.fillRect(between(0, h), between(0, w), between(0.6, 2.4), between(0.6, 1.8));
    }
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 2);
    g.drawImage(lc, -h / 2, -w / 2);
    g.restore();
  };
  const size = Math.min(w * (st.font === "apple" ? 0.36 : st.font === "reenie" ? 0.62 : 0.56), 46);
  if (author) {
    words(title, size, 0.36, 0.92, h * 0.34);
    words(author, size * 0.55, 0.77, 0.85, h * 0.24);
  } else {
    // the middle panel of a banded spine (or the upper-middle one when there is no middle)
    const panel = st.bands && st.bands % 2 ? 0.5 - 0.4 / (st.bands - 1) : 0.5;
    words(title, size, st.bands ? panel : 0.48, 0.92, Math.min(room, h * 0.68));
  }
  // a small pressed mark near the foot, the way a binder signs a spine
  if (!st.bands && st.ink === "gold") {
    g.fillStyle = "rgba(216,184,102,0.75)";
    g.save();
    g.translate(w / 2, h * 0.845);
    g.rotate(Math.PI / 4);
    g.fillRect(-3.5, -3.5, 7, 7);
    g.restore();
  }

  // wear: the cloth rubbed pale along the head, the foot and the two edges, worst at the corners
  const pale = st.mat === "paper" ? "246,238,220" : st.mat === "leather" || st.mat === "chestnut" || st.mat === "tan" ? "196,160,120" : "226,208,176";
  for (let i = 0; i < w * 5; i++) {
    const edge = rnd();
    const deep = rnd() * rnd() * 7;
    let x;
    let y;
    if (edge < 0.3) {
      x = rnd() < 0.6 ? (rnd() < 0.5 ? between(0, w * 0.2) : between(w * 0.8, w)) : between(0, w);
      y = deep;
    } else if (edge < 0.6) {
      x = between(0, w);
      y = h - deep * 0.8;
    } else {
      x = edge < 0.8 ? deep * 0.7 : w - deep * 0.7;
      y = rnd() < 0.5 ? between(0, h * 0.12) : between(0, h);
    }
    g.fillStyle = `rgba(${pale},${between(0.08, 0.36)})`;
    g.fillRect(x, y, between(0.8, 3), between(0.8, 2.4));
  }
  // creases: a paperback's spine cracks along its length; cloth and leather only scuff
  const lines = st.mat === "paper" ? 3 + Math.floor(rnd() * 3) : 2;
  for (let i = 0; i < lines; i++) {
    const x = between(w * 0.12, w * 0.88);
    const from = st.mat === "paper" ? 0 : between(0, h * 0.6);
    const len = st.mat === "paper" ? h : between(h * 0.1, h * 0.35);
    let cx = x;
    for (let y = from; y < from + len; y += 3) {
      cx += between(-0.5, 0.5);
      g.fillStyle = `rgba(${pale},${st.mat === "paper" ? between(0.1, 0.3) : between(0.03, 0.12)})`;
      g.fillRect(cx, y, 1.2, 3);
      g.fillStyle = `rgba(20,10,0,${st.mat === "paper" ? 0.12 : 0.05})`;
      g.fillRect(cx + 1.2, y, 1, 3);
    }
  }
  // the head and foot turn away from the light
  g.fillStyle = "rgba(20,10,0,0.28)";
  g.fillRect(0, 0, w, 2);
  g.fillRect(0, h - 3, w, 3);
  return c;
}

function plank(g, tex, y) {
  const x0 = 26;
  const x1 = W - 26;
  const wood = tex.wood.img;
  // its shadow on the paper below, soft and short
  const under = g.createLinearGradient(0, y + PLANK_TOP + PLANK_FRONT, 0, y + PLANK_TOP + PLANK_FRONT + UNDER);
  under.addColorStop(0, "rgba(40,24,8,0.5)");
  under.addColorStop(0.35, "rgba(40,24,8,0.16)");
  under.addColorStop(1, "rgba(40,24,8,0)");
  g.save();
  g.filter = "blur(5px)";
  g.fillStyle = under;
  g.beginPath();
  g.moveTo(x0 + 12, y + PLANK_TOP + PLANK_FRONT - 4);
  g.lineTo(x1 + 4, y + PLANK_TOP + PLANK_FRONT - 4);
  g.lineTo(x1 - 6, y + PLANK_TOP + PLANK_FRONT + UNDER);
  g.lineTo(x0 + 24, y + PLANK_TOP + PLANK_FRONT + UNDER);
  g.fill();
  g.restore();

  // the top face: the grain runs along the board, seen at a shallow angle, in the light
  g.save();
  g.beginPath();
  g.moveTo(x0 + 7, y);
  g.lineTo(x1 - 7, y);
  g.lineTo(x1, y + PLANK_TOP);
  g.lineTo(x0, y + PLANK_TOP);
  g.clip();
  g.drawImage(wood, 0, 40, wood.width, 60, x0, y, x1 - x0, PLANK_TOP);
  g.fillStyle = "rgba(255,225,180,0.2)";
  g.fillRect(x0, y, x1 - x0, PLANK_TOP);
  g.restore();
  // the front edge: darker, with the grain of the same board
  g.save();
  g.beginPath();
  g.roundRect(x0, y + PLANK_TOP, x1 - x0, PLANK_FRONT, [0, 0, 3, 3]);
  g.clip();
  g.drawImage(wood, 0, 300, wood.width, 150, x0, y + PLANK_TOP, x1 - x0, PLANK_FRONT);
  const face = g.createLinearGradient(0, y + PLANK_TOP, 0, y + PLANK_TOP + PLANK_FRONT);
  face.addColorStop(0, "rgba(255,225,180,0.2)");
  face.addColorStop(0.12, "rgba(30,15,0,0.12)");
  face.addColorStop(1, "rgba(30,15,0,0.5)");
  g.fillStyle = face;
  g.fillRect(x0, y + PLANK_TOP, x1 - x0, PLANK_FRONT);
  // the ends are sawn across the grain and drink more shade
  for (const [a, b] of [[x0, x0 + 16], [x1, x1 - 16]]) {
    const end = g.createLinearGradient(a, 0, b, 0);
    end.addColorStop(0, "rgba(30,15,0,0.5)");
    end.addColorStop(1, "rgba(30,15,0,0)");
    g.fillStyle = end;
    g.fillRect(Math.min(a, b), y + PLANK_TOP, 16, PLANK_FRONT);
  }
  // a worn arris: the front corner has lost its colour here and there
  for (let x = x0; x < x1; x += 4) {
    if (rnd() < 0.45) continue;
    g.fillStyle = `rgba(232,200,150,${between(0.1, 0.4)})`;
    g.fillRect(x, y + PLANK_TOP - 0.5, between(2, 5), 1.4);
  }
  g.restore();
}

async function paint(titles) {
  const tex = {};
  for (const [name, t] of Object.entries(TEXTURES)) {
    const img = await load(t.src);
    tex[name] = { ...t, img, mean: mean(img), scuffImg: t.scuff ? await load(t.scuff) : null };
  }
  await Promise.all(Object.values(FONTS).map((f) => document.fonts.load(f.replace("%", 40), "Books")));

  const [canvas, g] = make(W, H);
  const placed = []; // where each book is: a box, and a turn about a point of that box
  const rows = [titles.slice(0, 10), titles.slice(10)];

  rows.forEach((row, r) => {
    const top = PAD + r * (ROW + PLANK_TOP + PLANK_FRONT + UNDER);
    const floor = top + ROW + 5; // the books stand a little way back on the board
    plank(g, tex, top + ROW);
    const items = row.map((b, k) => ({ ...b, i: r * 10 + k, st: STYLE[r * 10 + k] }));
    const up = items.filter((b) => !b.st.pose);
    const lean = items.find((b) => b.st.pose === "lean");
    const flat = items.filter((b) => b.st.pose === "flat");
    const ANGLE = (9 * Math.PI) / 180;
    const jobs = []; // { book, x, y, turn, about } with x,y the top-left corner before turning

    const stand = (x) => {
      for (const b of up) {
        jobs.push({ b, x, y: floor - b.st.h, w: b.st.w, h: b.st.h, turn: 0 });
        x += b.st.w + between(1, 3);
      }
      return x;
    };
    const pile = (x) => {
      let y = floor;
      let longest = 0;
      flat.forEach((b, n) => {
        y -= b.st.w;
        // lying down: the spine's length runs along the board
        jobs.push({ b, x: x + (n ? between(4, 26) : 0), y, w: b.st.h, h: b.st.w, turn: 0, lying: true, skew: n ? between(-1.2, 1.2) : 0 });
        longest = Math.max(longest, b.st.h);
      });
      return x + longest;
    };
    if (r === 0) {
      // standing books, one leaning back onto them, then a pile
      let x = stand(LEFT);
      const s = lean.st;
      const px = x - 2 + s.h * Math.sin(ANGLE); // its bottom-left corner stays on the board
      jobs.push({ b: lean, x: px, y: floor - s.h, w: s.w, h: s.h, turn: -ANGLE, about: [0, 1] });
      pile(px + s.w * Math.cos(ANGLE) + 30);
    } else {
      // a pile, then one leaning forward onto the standing books
      let x = pile(LEFT) + 24;
      const s = lean.st;
      const right = x + s.w * Math.cos(ANGLE) + s.h * Math.sin(ANGLE);
      const px = right - s.h * Math.sin(ANGLE); // its bottom-right corner stays on the board
      jobs.push({ b: lean, x: px - s.w, y: floor - s.h, w: s.w, h: s.h, turn: ANGLE, about: [1, 1] });
      stand(right + 1);
    }

    // shadows first, all of them, so no book's shadow lies on top of another book:
    // each thing throws a soft one down and to the right, the light coming from the upper left
    const turned = (j, draw) => {
      g.save();
      if (j.turn) {
        const ox = j.x + j.w * j.about[0];
        const oy = j.y + j.h * j.about[1];
        g.translate(ox, oy);
        g.rotate(j.turn);
        g.translate(-ox, -oy);
      } else if (j.skew) {
        g.translate(j.x + j.w / 2, j.y + j.h / 2);
        g.rotate((j.skew * Math.PI) / 180);
        g.translate(-(j.x + j.w / 2), -(j.y + j.h / 2));
      }
      draw();
      g.restore();
    };
    for (const j of jobs) {
      turned(j, () => {
        g.shadowColor = "rgba(40,24,8,0.5)";
        g.shadowBlur = 12;
        g.shadowOffsetX = 7;
        g.shadowOffsetY = 4;
        g.fillStyle = "rgba(40,24,8,0.9)";
        g.fillRect(j.x + 2, j.y + 3, j.w - 4, j.h - 4);
      });
    }
    for (const j of jobs) {
      const s = spine(j.b.title, j.b.author, j.b.st, tex);
      turned(j, () => {
        if (j.lying) {
          g.translate(j.x, j.y + j.h);
          g.rotate(-Math.PI / 2);
          g.drawImage(s, 0, 0);
        } else {
          g.drawImage(s, j.x, j.y);
        }
      });
      placed[j.b.i] = {
        x: j.x,
        y: j.y,
        w: j.w,
        h: j.h,
        turn: j.turn ? (j.turn * 180) / Math.PI : j.skew || 0,
        about: j.turn ? j.about : [0.5, 0.5],
        pose: j.lying ? "flat" : j.turn ? "lean" : "up",
      };
    }
    // where a book meets the board it is nearly dark: a thin, soft line along each foot
    g.save();
    g.filter = "blur(1.6px)";
    for (const j of jobs) {
      if (j.y + j.h < floor - 2) continue; // only the ones on the board itself
      g.fillStyle = "rgba(25,12,0,0.6)";
      const lift = j.turn ? j.w * Math.sin(Math.abs(j.turn)) : 0;
      const from = j.turn > 0 ? j.x + j.w - 14 : j.x;
      g.fillRect(from, floor - 1.5, j.turn ? 14 : j.w, 3.2);
      if (lift) continue;
    }
    g.restore();
  });

  const round = (n) => Math.round(n * 100) / 100;
  return {
    png: canvas.toDataURL("image/png"),
    shelf: {
      src: "/shelf/books.webp",
      w: W,
      h: H,
      // boxes in percent of the picture; `turn` in degrees about the point `about` of the box
      books: placed.map((p) => ({ x: round((p.x / W) * 100), y: round((p.y / H) * 100), w: round((p.w / W) * 100), h: round((p.h / H) * 100), turn: round(p.turn), about: p.about, pose: p.pose })),
    },
  };
}

window.paint = paint;
