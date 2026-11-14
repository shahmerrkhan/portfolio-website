// Photographs the garden with the book lying open and empty, for the flat fallback
// (weak phones, reduced motion, no WebGL). Run it again whenever the garden or the
// book changes, with the site running:
//
//   npm run dev            (in another terminal)
//   node scripts/capture-still.mjs [http://localhost:3000]
//
// Writes public/fallback/garden-wide.webp, garden-tall.webp and
// components/scene/still.json (where the pages are in each picture).
// Needs google-chrome and ffmpeg on PATH.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const site = process.argv[2] ?? "http://localhost:3000";
const W = 3200;
const H = 1952;
const PAGE_W = 1.93; // the page's width in scene units (book.ts), to turn pixels into units
const TALL_MARGIN = 1.1; // scene units of garden kept each side of the open book
const TALL_SCALE = 0.75; // the upright picture is for phones, so it can be smaller

const tmp = mkdtempSync(path.join(tmpdir(), "still-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  "google-chrome",
  ["--headless=new", "--no-first-run", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=gl-egl", `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}/profile`, `--window-size=${W},${H}`, "about:blank"],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page"), () => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      waiting.set(++id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const run = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${site}/?still` });
  let pages;
  for (let i = 0; i < 120 && !pages; i++) {
    await sleep(500);
    pages = await run(`(() => { const c = document.querySelector(".garden-canvas"); return c?.dataset.ready === "true" && c.dataset.pages ? c.dataset.pages : null; })()`);
  }
  if (!pages) throw new Error("the garden never finished loading");
  // only the garden: no buttons
  await run(`document.head.appendChild(Object.assign(document.createElement("style"), { textContent: ".contact, .chat, .mute { display: none !important }" }))`);
  await sleep(4000); // let the last textures and shadows settle
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const png = path.join(tmp, "garden.png");
  writeFileSync(png, Buffer.from(shot.data, "base64"));
  ws.close();

  const p = JSON.parse(pages);
  const unit = p.pw / PAGE_W;
  const cropX = Math.max(0, Math.round(p.hx - p.lw - TALL_MARGIN * unit));
  const cropW = Math.min(W - cropX, Math.round(p.lw + p.pw + 2 * TALL_MARGIN * unit));
  const tallW = Math.round(cropW * TALL_SCALE);
  const tallH = Math.round(H * TALL_SCALE);

  const out = path.join(root, "public/fallback");
  mkdirSync(out, { recursive: true });
  const webp = ["-c:v", "libwebp", "-quality", "80", "-compression_level", "6"];
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, ...webp, path.join(out, "garden-wide.webp")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-vf", `crop=${cropW}:${H}:${cropX}:0,scale=${tallW}:${tallH}`, ...webp, path.join(out, "garden-tall.webp")]);

  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 1000) / 1000 : v]));
  const still = {
    wide: round({ src: "/fallback/garden-wide.webp", w: W, h: H, ...p }),
    tall: round({
      src: "/fallback/garden-tall.webp",
      w: tallW,
      h: tallH,
      hx: (p.hx - cropX) * TALL_SCALE,
      hy: p.hy * TALL_SCALE,
      rot: p.rot,
      pw: p.pw * TALL_SCALE,
      ph: p.ph * TALL_SCALE,
      lw: p.lw * TALL_SCALE,
    }),
  };
  writeFileSync(path.join(root, "components/scene/still.json"), JSON.stringify(still, null, 2) + "\n");
  console.log("wrote the two pictures and still.json");
} finally {
  chrome.kill();
  rmSync(tmp, { recursive: true, force: true });
}
