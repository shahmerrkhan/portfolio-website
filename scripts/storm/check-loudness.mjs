// Checks that the storm (wind and thunder) always sits under the voiceover.
//
// The storm is made in the browser, so this listens to the real thing: it opens the
// running site in headless Chrome, taps to begin, and records everything Web Audio sends
// to the speakers while the voice plays (the voice itself is a plain <audio> element and
// is not in that recording). Then ffmpeg measures both the way broadcast loudness is
// measured (EBU R128, which hears roughly as an ear does) and they are compared moment
// by moment on the voiceover's clock.
//
// Passes when, at every moment, the storm is at least MARGIN below the voice around it,
// and the loudest moment of the storm is at least MARGIN below the voice as a whole.
// Thunder is random, so it listens several times and judges the loudest take.
//
//   npm run build && npx next start -p 3111 &
//   node scripts/storm/check-loudness.mjs [http://localhost:3111] [takes]
//
// Needs google-chrome and ffmpeg on PATH. STORM_TMP is where it keeps its scratch files.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const MARGIN = 6; // LU
const root = path.resolve(import.meta.dirname, "../..");
const site = process.argv[2] ?? "http://localhost:3111";
const takes = Number(process.argv[3] ?? 3);
const voiceFile = path.join(root, "public/audio/voiceover.mp3");
const work = mkdtempSync(path.join(process.env.STORM_TMP ?? tmpdir(), "loud-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// momentary (0.4 s) and short-term (3 s) loudness through a file, ten readings a second
function loudness(file) {
  const out = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=metadata=1,ametadata=print:file=-", "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }).toString();
  const rows = [];
  let t = 0;
  for (const line of out.split("\n")) {
    const time = line.match(/pts_time:([\d.]+)/);
    if (time) t = Number(time[1]);
    const m = line.match(/lavfi\.r128\.([MSI])=(-?[\d.]+|-?inf|nan)/);
    if (!m) continue;
    const v = Number(m[2]);
    const row = rows.at(-1)?.t === t ? rows.at(-1) : rows[rows.push({ t }) - 1];
    row[m[1]] = Number.isFinite(v) ? v : -120;
  }
  return rows;
}

// The page side: copy what reaches the speakers, and note when the voice really starts.
const LISTEN = `
  window.__rec = null; window.__parts = []; window.__heardFrom = 0; window.__voiceAt = 0;
  const connect = AudioNode.prototype.connect;
  const taps = new WeakMap();
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest === this.context.destination) {
      let tap = taps.get(this.context);
      if (!tap) {
        // a recorder runs off the page's own thread, so a busy page cannot drop sound
        tap = this.context.createMediaStreamDestination();
        taps.set(this.context, tap);
        const rec = (window.__rec = new MediaRecorder(tap.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 256000 }));
        rec.ondataavailable = (e) => window.__parts.push(e.data);
        rec.onstart = () => (window.__heardFrom = performance.now());
        rec.start();
      }
      connect.call(this, tap);
    }
    return connect.call(this, dest, ...rest);
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this.src.includes("voiceover")) this.addEventListener("playing", () => (window.__voiceAt ||= performance.now() - this.currentTime * 1000), { once: true });
    return play.call(this);
  };`;

async function take(n) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn("google-chrome", ["--headless=new", "--no-first-run", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=gl-egl", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(work, "profile" + n)}`, "--window-size=1280,720", "about:blank"], { stdio: "ignore" });
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
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      waiting.set(++id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
    const run = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
    await send("Page.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: LISTEN });
    await send("Page.navigate", { url: site });
    for (let i = 0; i < 100 && !(await run(`!!document.querySelector('.gate')`)); i++) await sleep(100);
    await sleep(1500);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 360, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 640, y: 360, button: "left", clickCount: 1 });
    // the voice, and then the tail of the last thunder under the portal
    for (let i = 0; i < 600 && (await run(`document.querySelector('.intro')?.dataset.stage`)) === "clouds"; i++) await sleep(100);
    await sleep(600);
    const info = JSON.parse(await run(`JSON.stringify({ from: window.__heardFrom, voiceAt: window.__voiceAt })`));
    if (process.env.STORM_LOUD_DEBUG) console.log(JSON.stringify(info));
    if (!info.voiceAt || !info.from) throw new Error("the voice or the storm never started");
    const b64 = await run(`(async () => { const rec = window.__rec; await new Promise((r) => { rec.onstop = r; rec.stop(); }); const u = new Uint8Array(await new Blob(window.__parts).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); })()`);
    ws.close();
    const raw = path.join(work, `storm${n}.webm`);
    writeFileSync(raw, Buffer.from(b64, "base64"));
    // cut it so that second 0 is the voice's second 0
    const wav = path.join(work, `storm${n}.wav`);
    const lead = (info.voiceAt - info.from) / 1000;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-ac", "1", "-af", lead >= 0 ? `atrim=start=${lead},asetpts=PTS-STARTPTS` : `adelay=${Math.round(-lead * 1000)}`, wav]);
    return wav;
  } finally {
    chrome.kill();
  }
}

const voice = loudness(voiceFile);
const whole = voice.at(-1).I;
const around = (t) => voice.reduce((best, row) => (Math.abs(row.t - t) < Math.abs(best.t - t) ? row : best));
let worst = { margin: Infinity }, loudest = -120;
try {
  for (let n = 0; n < takes; n++) {
    const storm = loudness(await take(n));
    if (process.env.STORM_LOUD_DEBUG) console.log(storm.filter((r, i) => i % 5 === 0).map((r) => `${r.t.toFixed(1)}:${r.M.toFixed(0)}`).join(" "));
    for (const row of storm) {
      if (row.t < 0.5 || row.t > voice.at(-1).t) continue;
      loudest = Math.max(loudest, row.M);
      // the voice "around" a moment: its three-second loudness, so a breath between words
      // does not count as silence, but never less than the voice as a whole minus 6
      const v = Math.max(around(row.t).S ?? -120, around(Math.min(row.t + 1.5, voice.at(-1).t)).S ?? -120, whole - 6);
      if (v - row.M < worst.margin) worst = { margin: v - row.M, t: row.t, storm: row.M, voice: v, take: n + 1 };
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`voice ${whole.toFixed(1)} LUFS as a whole. Loudest moment of the storm in ${takes} take(s): ${loudest.toFixed(1)} LUFS, ${(whole - loudest).toFixed(1)} LU under the voice.`);
console.log(`closest the storm comes to the voice around it: ${worst.margin.toFixed(1)} LU under, at ${worst.t.toFixed(1)} s (storm ${worst.storm.toFixed(1)}, voice ${worst.voice.toFixed(1)} LUFS, take ${worst.take})`);
if (worst.margin < MARGIN || whole - loudest < MARGIN) {
  console.error(`the storm must stay at least ${MARGIN} LU under the voice`);
  process.exit(1);
}
console.log(`thunder and wind stay at least ${MARGIN} LU under the voice`);
