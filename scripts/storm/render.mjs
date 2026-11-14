// Renders the storm intro to WebP frames: the cloud loop, the lightning and portal-glow
// layers that sit over it, the portal clip, and the flickers on the tunnel wall.
// It runs storm.frag in headless Chrome on this machine's GPU with far more steps and
// samples than any visitor's device could do live, a frame at a time, in tiles.
//
//   node scripts/storm/render.mjs --set wide            everything for desktop (skips frames already there)
//   node scripts/storm/render.mjs --set tall            the upright phone set
//   node scripts/storm/render.mjs --set wide --match 'portal/00(20|50)' --test /some/dir
//                                                       just those frames, as PNGs, for looking at
//   --force re-renders frames that exist, --samples and --steps override the quality
//
//   --encode  makes the WebPs again from the kept PNG masters (to try another quality), no rendering
//
// Needs google-chrome and ffmpeg on PATH. STORM_TMP is where it keeps its scratch files.
// If STORM_MASTERS is set, the full-quality PNG of every frame is kept there.
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { plan, root } from "./scene.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const here = import.meta.dirname;
const read = (f) => readFileSync(path.join(here, f), "utf8");
const setName = flag("set", "wide");
const testDir = flag("test", null);
const outRoot = path.join(root, "public/frames");
const masters = process.env.STORM_MASTERS ?? null;
const master = (job) => path.join(masters, job.file + ".png");
const encode = (png, job) => {
  const out = target(job);
  mkdirSync(path.dirname(out), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-c:v", "libwebp", "-quality", String(job.quality), "-compression_level", "6", out]);
};

const { jobs: all, manifests } = plan(setName);
const match = flag("match", null) ? new RegExp(flag("match")) : null;
const target = (job) => (testDir ? path.join(testDir, job.file.replaceAll("/", "_") + ".png") : path.join(outRoot, job.file + ".webp"));
const jobs = all
  .filter((j) => !match || match.test(j.file))
  .filter((j) => has("force") || testDir || !existsSync(target(j)))
  .map((j) => ({ ...j, samples: Number(flag("samples", j.samples)), steps: Number(flag("steps", j.steps)) }))
  .map((j) => ({ ...j, w: Math.round((j.w * Number(flag("scale", 1))) / 4) * 4, h: Math.round((j.h * Number(flag("scale", 1))) / 4) * 4 }));

if (!testDir) for (const [dir, manifest] of Object.entries(manifests)) {
  mkdirSync(path.join(outRoot, dir), { recursive: true });
  writeFileSync(path.join(outRoot, dir, "manifest.json"), JSON.stringify(manifest));
}
if (has("encode")) {
  const todo = all.filter((j) => !match || match.test(j.file));
  for (const job of todo) encode(master(job), job);
  console.log(`encoded ${todo.length} frames again (${setName})`);
  process.exit(0);
}
const work = mkdtempSync(path.join(process.env.STORM_TMP ?? tmpdir(), "storm-"));
if (!jobs.length) {
  console.log("nothing to render");
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}
console.log(`${jobs.length} frames to render (${setName})`);

const page = `<!doctype html><canvas id="c"></canvas><script>
const SRC = ${JSON.stringify({ noise: read("noise.frag"), storm: read("storm.frag"), post: read("post.frag") })};
${read("page.js")}
</script>`;

let chrome;
let failed = false;
let done = 0;
const began = Date.now();

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    if (req.url === "/jobs") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(jobs));
    }
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(page);
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    res.end("ok");
    if (req.url === "/log") {
      const msg = body.toString();
      if (msg.startsWith("ERROR")) failed = true;
      console.log(msg);
    } else if (req.url.startsWith("/frame/")) {
      const job = jobs[Number(req.url.slice(7))];
      if (testDir) {
        mkdirSync(path.dirname(target(job)), { recursive: true });
        writeFileSync(target(job), body);
      } else {
        const png = masters ? master(job) : path.join(work, "frame.png");
        mkdirSync(path.dirname(png), { recursive: true });
        writeFileSync(png, body);
        encode(png, job);
      }
      done++;
      if (done % 8 === 0 || done === jobs.length) {
        const each = (Date.now() - began) / 1000 / done;
        console.log(`${done}/${jobs.length}  ${each.toFixed(1)}s a frame, about ${Math.round((each * (jobs.length - done)) / 60)} min left`);
      }
    } else if (req.url === "/done") {
      chrome?.kill();
      server.close();
      rmSync(work, { recursive: true, force: true });
      process.exit(failed ? 1 : 0);
    }
  });
});

server.listen(0, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(
    "google-chrome",
    ["--headless=new", "--no-first-run", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=gl-egl", "--disable-gpu-watchdog",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding", `--user-data-dir=${path.join(work, "profile")}`, "--window-size=1280,720", url],
    { stdio: "ignore" },
  );
});
