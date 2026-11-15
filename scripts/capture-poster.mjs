// Photographs the closed notebook in the garden, for the picture that stands in while
// the 3D garden loads (GardenScene.tsx). Run it again whenever the garden, the cover or
// the closed-book camera changes, with the site running:
//
//   npm run build && npm start        (in another terminal)
//   node scripts/capture-poster.mjs [http://localhost:3000]
//
// Writes public/fallback/closed-wide.webp and closed-tall.webp.
// Needs google-chrome and ffmpeg on PATH.
//
// Why two, and why these shapes: closed, the camera frames the book by the screen's
// height on a wide screen and by its width on a narrow one. So one picture is taken far
// wider than any screen and one far taller, and the page shows each with
// object-fit: cover, which crops it to exactly what the camera would show.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const site = process.argv[2] ?? "http://localhost:3000";
// css size and pixel ratio. The tall one is phone-sized on purpose, so it is drawn the
// way a phone draws the garden (lib/quality.ts picks by width).
const SHOTS = [
  { name: "closed-wide", w: 2160, h: 900, ratio: 1, mobile: false },
  { name: "closed-tall", w: 480, h: 1144, ratio: 1.5, mobile: true },
];

const tmp = mkdtempSync(path.join(tmpdir(), "poster-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  "google-chrome",
  ["--headless=new", "--no-first-run", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=gl-egl", `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}/profile`, "--window-size=2160,1200", "about:blank"],
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
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) waiting.get(m.id)(m);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const run = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

  await send("Page.enable");
  const out = path.join(root, "public/fallback");
  mkdirSync(out, { recursive: true });
  for (const shot of SHOTS) {
    await send("Emulation.setDeviceMetricsOverride", { width: shot.w, height: shot.h, deviceScaleFactor: shot.ratio, mobile: shot.mobile });
    // ?scale=1 holds the picture at full resolution however slowly this machine draws it
    await send("Page.navigate", { url: `${site}/?scale=1` });
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) {
      await sleep(200);
      ready = await run(`(() => { document.querySelector(".skip")?.click(); return document.querySelector(".garden-canvas")?.dataset.ready === "true"; })()`);
    }
    if (!ready) throw new Error("the garden never finished loading");
    // only the garden: no buttons, no hint, and not the old poster underneath
    await run(`document.head.appendChild(Object.assign(document.createElement("style"), { textContent: ".contact, .chat, .mute, .tabs, .garden-hint, .garden-poster, .intro, .notebook, .secrets-layer { display: none !important } .garden-canvas { opacity: 1 !important; transition: none !important }" }))`);
    await sleep(9000); // the sharper photos arrive and settle, and the shadows with them
    // a desktop scrollbar takes a strip off the right: cut it off, so the middle of the
    // picture is the middle of the canvas
    const bar = Math.round((await run("window.innerWidth - document.documentElement.clientWidth")) * shot.ratio);
    const png = path.join(tmp, `${shot.name}.png`);
    writeFileSync(png, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-vf", `crop=iw-${bar}:ih:0:0`, "-c:v", "libwebp", "-quality", "74", "-compression_level", "6", path.join(out, `${shot.name}.webp`)]);
    console.log(`wrote public/fallback/${shot.name}.webp`);
  }
  ws.close();
} finally {
  chrome.kill();
  rmSync(tmp, { recursive: true, force: true });
}
