// Renders the cloud clip to a WebP frame sequence (the "pre-rendered" option).
// It runs scripts/clouds.frag at a quality no phone could do live, inside
// headless Chrome on this machine's GPU, and saves each frame.
//
//   node scripts/render-cloud-frames.mjs            full run
//   node scripts/render-cloud-frames.mjs --still 0.4   one test frame at t=0.4
//   node scripts/render-cloud-frames.mjs --shader portal.frag --frames 120 --out public/frames/portal
//   add --width 608 --height 1080 --out public/frames/<name>-tall for the phone (upright) set
//
// Needs google-chrome and ffmpeg on PATH.
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
// which clip: clouds.frag (the fly-through) or portal.frag (portal, then the tunnel down)
const frag = readFileSync(path.join(root, "scripts", flag("shader", "clouds.frag")), "utf8");

const still = flag("still", null);
const W = Number(flag("width", 1280));
const H = Number(flag("height", 720));
const FRAMES = still === null ? Number(flag("frames", 144)) : 1;
const STEPS = Number(flag("steps", 220));
const LSTEPS = Number(flag("lsteps", 8));
const OCT = Number(flag("oct", 6));
const QUALITY = flag("quality", "78");
const outDir = path.resolve(root, flag("out", "public/frames/clouds"));

const pngDir = mkdtempSync(path.join(tmpdir(), "cloud-frames-"));

const page = `<!doctype html><canvas id="c" width="${W}" height="${H}"></canvas><script>
const frag = ${JSON.stringify(
  `#define STEPS ${STEPS}\n#define LSTEPS ${LSTEPS}\n#define OCT ${OCT}\n` + frag,
)};
const still = ${still === null ? "null" : Number(still)};
const N = ${FRAMES};
const LAST = ${flag("shader", "clouds.frag") === "clouds.frag" ? 0 : 1}; // the portal clip runs to t = 1 exactly; the cloud clip loops
(async () => {
  const c = document.getElementById("c");
  const gl = c.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}"));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.bindAttribLocation(p, 0, "a");
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(p, "uRes"), c.width, c.height);
  const uT = gl.getUniformLocation(p, "uT");
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
  await fetch("/log", { method: "POST", body: "GPU: " + gpu });
  for (let i = 0; i < N; i++) {
    gl.uniform1f(uT, still !== null ? still : i / (N - LAST));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    await fetch("/frame/" + i, { method: "POST", body: blob });
  }
  await fetch("/done", { method: "POST" });
})().catch((e) => fetch("/log", { method: "POST", body: "ERROR " + e.message }).then(() => fetch("/done", { method: "POST" })));
</script>`;

let chrome;
let failed = false;

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
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
      const i = Number(req.url.slice(7));
      writeFileSync(path.join(pngDir, `${String(i).padStart(4, "0")}.png`), body);
      if (i % 12 === 0) console.log(`frame ${i + 1}/${FRAMES}`);
    } else if (req.url === "/done") {
      finish();
    }
  });
});

function finish() {
  chrome?.kill();
  server.close();
  if (failed) {
    rmSync(pngDir, { recursive: true, force: true });
    process.exit(1);
  }
  if (still !== null) {
    const out = path.resolve(flag("out", "cloud-still.png"));
    writeFileSync(out, readFileSync(path.join(pngDir, "0000.png")));
    console.log("wrote", out);
  } else {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    execFileSync("ffmpeg", [
      "-v", "error", "-y",
      "-i", path.join(pngDir, "%04d.png"),
      "-c:v", "libwebp", "-quality", QUALITY, "-compression_level", "6",
      "-start_number", "0",
      path.join(outDir, "%04d.webp"),
    ]);
    writeFileSync(
      path.join(outDir, "manifest.json"),
      JSON.stringify({ frames: FRAMES, width: W, height: H, fps: 24 }),
    );
    console.log("wrote", FRAMES, "frames to", outDir);
  }
  rmSync(pngDir, { recursive: true, force: true });
  process.exit(0);
}

server.listen(0, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      "--use-angle=gl-egl",
      `--user-data-dir=${path.join(pngDir, "profile")}`,
      `--window-size=${W},${H}`,
      url,
    ],
    { stdio: "ignore" },
  );
});
