// Paints the bookshelf on the fun page: one picture of twenty real-looking spines on two
// boards, and a list of where each book is in it (for the buttons laid over the picture).
//
//   node scripts/bookshelf/render.mjs
//
// Writes public/shelf/books.webp and components/pages/shelf.json. Run it again when the
// list of books in content/site.ts changes. Needs google-chrome and ffmpeg on PATH, and
// the internet the first time (for the photographs and the three handwriting fonts).
//
// The photographs are all CC0. From Poly Haven (polyhaven.com): book_pattern (book cloth),
// rough_linen, hessian_230, leather_white, fabric_leather_02, dark_wood. From this repo:
// brown_leather (Poly Haven, the notebook's own leather) and Paper001 (ambientCG).
// They are only used here, to paint the picture; none of them is served by the site.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const here = import.meta.dirname;
const root = path.resolve(here, "../..");
const cache = path.join(here, "textures"); // not in git: fetched when missing

const POLYHAVEN = {
  "book_pattern.jpg": "book_pattern/book_pattern_col1_1k.jpg",
  "book_pattern_ao.jpg": "book_pattern/book_pattern_ao_1k.jpg",
  "rough_linen.jpg": "rough_linen/rough_linen_diff_1k.jpg",
  "rough_linen_ao.jpg": "rough_linen/rough_linen_ao_1k.jpg",
  "hessian_230.jpg": "hessian_230/hessian_230_diff_1k.jpg",
  "leather_white.jpg": "leather_white/leather_white_diff_1k.jpg",
  "leather_white_ao.jpg": "leather_white/leather_white_ao_1k.jpg",
  "fabric_leather_02.jpg": "fabric_leather_02/fabric_leather_02_diff_1k.jpg",
  "dark_wood.jpg": "dark_wood/dark_wood_diff_1k.jpg",
};
const LOCAL = {
  "brown_leather_diff.jpg": "public/textures/leather/brown_leather_diff.jpg",
  "Paper001_diff.jpg": "public/textures/paper/Paper001_diff.jpg",
};

mkdirSync(cache, { recursive: true });
for (const [name, file] of Object.entries(POLYHAVEN)) {
  const to = path.join(cache, name);
  if (existsSync(to)) continue;
  const res = await fetch(`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${file}`);
  if (!res.ok) throw new Error(`could not fetch ${file}: ${res.status}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

// the titles, straight from the content file, so there is one list
const content = readFileSync(path.join(root, "content/site.ts"), "utf8");
const list = content.slice(content.indexOf("export const books"), content.indexOf("];", content.indexOf("export const books")));
const titles = [...list.matchAll(/\{ title: "([^"]+)"(?:, author: "([^"]+)")? \}/g)].map((m) => ({ title: m[1], author: m[2] }));
if (titles.length !== 20) throw new Error(`the shelves are laid out for 20 books, content has ${titles.length}: change STYLE and the rows in shelf.js`);

const types = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg" };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const name = path.basename(url);
  const file = url.startsWith("/textures/") ? (LOCAL[name] ? path.join(root, LOCAL[name]) : path.join(cache, name)) : path.join(here, url === "/" ? "index.html" : name);
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const site = `http://127.0.0.1:${server.address().port}/`;

const tmp = mkdtempSync(path.join(tmpdir(), "shelf-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn("google-chrome", ["--headless=new", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${tmp}/profile`, "about:blank"], { stdio: "ignore" });
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
  await send("Page.enable");
  await send("Page.navigate", { url: site });
  await sleep(1500);
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: `paint(${JSON.stringify(titles)}).then(JSON.stringify)`, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "the page could not paint the shelf");
  const { png, shelf } = JSON.parse(result.value);
  ws.close();

  const file = path.join(tmp, "books.png");
  writeFileSync(file, Buffer.from(png.split(",")[1], "base64"));
  mkdirSync(path.join(root, "public/shelf"), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", path.join(root, "public/shelf/books.webp")]);
  writeFileSync(path.join(root, "components/pages/shelf.json"), JSON.stringify(shelf, null, 2) + "\n");
  if (process.argv[2]) execFileSync("cp", [file, process.argv[2]]); // keep the PNG too, to look at
  console.log(`wrote public/shelf/books.webp (${shelf.w} x ${shelf.h}) and shelf.json`);
} finally {
  chrome.kill();
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}
