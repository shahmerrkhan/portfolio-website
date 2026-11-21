// npm run chat:test [site]: checks the chat end to end.
//   1. matching in Node: 10 phrasings of 5 core questions, plus off-topic questions
//   2. the code: no API keys and no AI provider anywhere in the chat code
//   3. a real Chrome (headless, over the DevTools protocol, like capture-still.mjs), on a
//      phone and on a desktop: the bubble hides during the intro, nothing of the model
//      loads before it is opened, it answers and refuses, and every slash command turns
//      the book to its page. Every request the page makes is logged and checked.
// Needs the site running (npm run build && npm start, or npm run dev).

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { answers, commands } from "../../content/chat.ts";
import { pages } from "../../content/site.ts";
import { byKeywords, byMeaning, decode } from "../../lib/chat/match.ts";
import { core, offTopic } from "./cases.mjs";
import { FILE, embedder, root } from "./shared.mjs";

const site = process.argv[2] ?? "http://localhost:3000";
let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  return ok;
};

// ---------- 1. matching ----------
console.log("\n1. matching (model in Node, same files and settings as the browser)");
const data = decode(JSON.parse(readFileSync(FILE, "utf8")));
const embed = await embedder();
let keywordHits = 0;
for (const [want, questions] of Object.entries(core)) {
  for (const q of questions) {
    const r = byMeaning(q, await embed(q), data);
    check(r.kind === "answer" && r.answer.id === want, `${want.padEnd(8)} "${q}"${r.kind === "answer" ? ` -> ${r.answer.id} (${r.score.toFixed(2)})` : ` -> refused: ${r.why}`}`);
    const k = byKeywords(q);
    if (k.kind === "answer" && k.answer.id === want) keywordHits++;
  }
}
for (const q of offTopic) {
  const r = byMeaning(q, await embed(q), data);
  check(r.kind === "refuse", `refuse   "${q}"${r.kind === "refuse" ? ` (${r.why})` : ` -> answered ${r.answer.id}!`}`);
  const k = byKeywords(q);
  if (k.kind === "refuse") keywordHits++;
}
console.log(`  (keyword fallback alone gets ${keywordHits} of ${Object.values(core).flat().length + offTopic.length} of these right)`);

// ---------- 2. the code ----------
console.log("\n2. chat code: no keys, no AI providers");
const chatFiles = ["components/ui/ChatBubble.tsx", "lib/bookNav.ts", "content/chat.ts", "public/chat/worker.js", ...readdirSync(path.join(root, "lib/chat")).map((f) => `lib/chat/${f}`)];
const PROVIDERS = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|aiplatform\.googleapis|api\.groq|api\.mistral|api\.cohere|localhost:11434|ollama|huggingface\.co|hf\.co\/|jsdelivr|unpkg|api[_-]?key|apikey|authorization|bearer|process\.env/i;
for (const f of chatFiles) {
  const text = readFileSync(path.join(root, f), "utf8");
  const hit = text.split("\n").find((l) => PROVIDERS.test(l) && !/^\s*\/\//.test(l));
  check(!hit, `${f}${hit ? `: ${hit.trim()}` : ""}`);
  // the only things the chat code fetches or loads are its own files
  for (const m of text.matchAll(/(?:fetch|new Worker)\(\s*["'`]([^"'`]+)/g)) check(m[1].startsWith("/"), `${f} loads ${m[1]} from this site`);
}
const sizeOf = (dir) => readdirSync(dir, { recursive: true }).reduce((n, f) => n + (statSync(path.join(dir, f)).isFile() ? statSync(path.join(dir, f)).size : 0), 0);
console.log(`  (self-hosted: model ${(sizeOf(path.join(root, "public/models")) / 1e6).toFixed(1)}MB, runtime ${(sizeOf(path.join(root, "public/chat")) / 1e6).toFixed(1)}MB)`);

// ---------- 3. in the browser ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browser(name, { width, height, mobile, calm = false }) {
  console.log(`\n3. in Chrome, ${name} (${width}x${height})`);
  const tmp = mkdtempSync(path.join(tmpdir(), "chat-test-"));
  // port 0: Chrome picks a free one and writes it down, so a Chrome left over from an
  // earlier run can never answer in its place
  const chrome = spawn("google-chrome", ["--headless=new", "--no-first-run", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=gl-egl", "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--remote-debugging-port=0", `--user-data-dir=${tmp}/profile`, `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore", detached: true });
  try {
    let target;
    let port;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try {
        port ??= readFileSync(`${tmp}/profile/DevToolsActivePort`, "utf8").split("\n")[0];
      } catch {
        continue;
      }
      target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page"), () => null);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const waiting = new Map();
    const requests = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.method === "Network.requestWillBeSent") requests.push(msg.params.request.url);
      // the model loads inside a worker, which has its own network log: listen to it too
      if (msg.method === "Target.attachedToTarget") {
        const sessionId = msg.params.sessionId;
        ws.send(JSON.stringify({ id: ++id, sessionId, method: "Network.enable" }));
      }
      waiting.get(msg.id)?.(msg);
      waiting.delete(msg.id);
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        waiting.set(++id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
        ws.send(JSON.stringify({ id, method, params }));
      });
    const run = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
    const until = async (expression, ms = 30000) => {
      for (let t = 0; t < ms; t += 150) {
        const v = await run(expression);
        if (v) return v;
        await sleep(150);
      }
      return null;
    };
    const tap = async (selector) => {
      const box = await run(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
      if (!box) throw new Error(`nothing to tap at ${selector}`);
      if (mobile) {
        await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [box] });
        await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, ...box, button: "left", clickCount: 1 });
      }
    };
    const chatModelLoaded = () => requests.filter((u) => /\/models\/|\/chat\//.test(u));

    await send("Network.enable");
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    // reduced motion gets the flat notebook, the same one low-end phones get
    if (calm) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const shot = async (label) => {
      if (!process.env.SHOTS) return;
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path.join(process.env.SHOTS, `${name.replace(/\W+/g, "-")}-${label}.png`), Buffer.from(data, "base64"));
    };
    await send("Page.navigate", { url: site });
    // once the stylesheets are in: before that nothing is painted anyway
    await until(`document.readyState === "complete" && !!document.querySelector(".gate") && !!document.querySelector(".chat")`);

    const during = await run(`(() => { const s = getComputedStyle(document.querySelector(".chat")); return s.visibility + " " + s.opacity; })()`);
    check(during === "hidden 0", `bubble hidden during the intro (${during})`);
    await tap(".gate");
    await until(`!!document.querySelector(".skip")`, 10000);
    check(await run(`getComputedStyle(document.querySelector(".chat")).visibility === "hidden"`), "still hidden while the intro plays");
    await tap(".skip");
    const shown = await until(`document.querySelector(".chat")?.dataset.shown === "true"`, 60000);
    if (!shown) console.log("   DEBUG", JSON.stringify(await run(`[document.querySelector("main")?.dataset.phase, !!document.querySelector(".skip"), !!document.querySelector(".gate"), document.querySelector(".garden-canvas")?.dataset.ready, document.querySelector(".intro")?.dataset.stage]`)));
    check(!!shown, "bubble shows once the book is on screen");
    const flat = await run(`!!document.querySelector(".garden.flat")`);
    console.log(`  (${flat ? "flat fallback" : "3D garden"} on this machine)`);
    await sleep(1500);
    check(chatModelLoaded().length === 0, `nothing of the model loaded before the bubble is opened${chatModelLoaded().length ? `: ${chatModelLoaded().join(", ")}` : ""}`);

    await tap(".chat-button");
    check(!!(await until(`!!document.querySelector(".chat-panel")`, 3000)), "tapping the bubble opens the chat");
    const warming = await run(`!!document.querySelector(".chat-warming")`);
    check(warming, "shows \"warming up...\" while the model loads");
    const t0 = Date.now();
    const ready = await until(`!document.querySelector(".chat-warming")`, 60000);
    check(!!ready, `model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    check(chatModelLoaded().some((u) => u.includes("model_quantized.onnx")), "the model downloaded after opening, from this site");

    if (mobile) {
      const fits = await run(`(() => { const r = document.querySelector(".chat-panel").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`);
      check(fits, "the chat fits on the phone screen");
      const fontSize = await run(`parseFloat(getComputedStyle(document.querySelector(".chat-form input")).fontSize)`);
      check(fontSize >= 16, `input text is ${fontSize}px (16+ so the phone does not zoom in)`);
    }

    const ask = async (q) => {
      const before = await run(`document.querySelectorAll(".chat-log li[data-from=me]").length`);
      await run(`document.querySelector(".chat-form input").focus()`);
      await send("Input.insertText", { text: q });
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await until(`document.querySelectorAll(".chat-log li[data-from=me]:not(.chat-thinking)").length > ${before}`, 10000);
      return run(`(() => { const l = [...document.querySelectorAll(".chat-log li[data-from=me]:not(.chat-thinking)")].pop(); return { answer: l.dataset.answer, by: l.dataset.by }; })()`);
    };

    for (const [want, questions] of Object.entries(core)) {
      for (const q of questions) {
        const r = await ask(q);
        check(r.answer === want && r.by === "meaning", `${want.padEnd(8)} "${q}" -> ${r.answer} by ${r.by}`);
      }
    }
    for (const q of offTopic) {
      const r = await ask(q);
      check(r.answer === "refuse", `refuse   "${q}" -> ${r.answer}`);
    }

    await shot("answers");
    // the "/" list
    await run(`document.querySelector(".chat-form input").focus()`);
    await send("Input.insertText", { text: "/" });
    const listed = await until(`document.querySelectorAll(".chat-commands li").length`, 2000);
    check(listed === commands.length, `typing / lists all ${commands.length} commands (got ${listed})`);
    await send("Input.insertText", { text: "s" });
    await shot("commands");
    const filtered = await run(`[...document.querySelectorAll(".chat-cmd")].map((e) => e.textContent).join(" ")`);
    check(filtered.startsWith("/story /secrets"), `"/s" filters it to: ${filtered}`);
    if (mobile) {
      const tall = await run(`Math.min(...[...document.querySelectorAll(".chat-commands button")].map((b) => b.getBoundingClientRect().height))`);
      check(tall >= 44, `each command row is ${tall.toFixed(0)}px tall, easy to tap`);
    }
    await tap(".chat-commands li:first-child button");
    await sleep(400);
    if (mobile) check(!(await run(`!!document.querySelector(".chat-panel")`)), "tapping a command on a phone closes the chat down to the bubble");

    // every page command lands on its page; the tabs say which page is open
    const openPage = `[...document.querySelectorAll(".tabs button")].findIndex((b) => b.getAttribute("aria-current") === "page")`;
    for (const c of [...commands.filter((x) => x.page !== undefined)].reverse().concat(commands.filter((x) => x.page !== undefined))) {
      if (!(await run(`!!document.querySelector(".chat-panel")`))) await tap(".chat-button");
      await until(`!!document.querySelector(".chat-form input")`, 3000);
      await run(`document.querySelector(".chat-form input").focus()`);
      await send("Input.insertText", { text: `/${c.name}` });
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      const landed = (await until(`(${openPage}) === ${c.page} ? ${c.page + 1} : null`, 6000)) - 1;
      await sleep(flat ? 300 : 1700); // let the scroll and the leaf settle
      const at = await run(openPage);
      check(landed === c.page && at === c.page, `/${c.name.padEnd(9)} -> page ${at + 1} (${pages[at]?.name ?? "?"})`);
    }
    for (const c of commands.filter((x) => x.action)) {
      if (!(await run(`!!document.querySelector(".chat-panel")`))) await tap(".chat-button");
      await until(`!!document.querySelector(".chat-form input")`, 3000);
      await run(`document.querySelector(".chat-form input").focus()`);
      await send("Input.insertText", { text: `/${c.name}` });
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      await sleep(300);
      const last = await run(`[...document.querySelectorAll(".chat-log li[data-from=me] p")].pop().textContent`);
      check(c.action === "help" ? last.includes("/work") : last.includes("@"), `/${c.name} answers in the chat: "${last.slice(0, 60)}..."`);
    }

    // the songs page loads album art from Apple; that is the site, not the chat
    const outside = [...new Set(requests.filter((u) => /^https?:/.test(u) && !u.startsWith(site)).map((u) => new URL(u).host))];
    const AI = /openai|anthropic|claude|googleapis|gemini|huggingface|hf\.co|ollama|jsdelivr|unpkg|cohere|mistral|groq|together|replicate/i;
    check(!outside.some((h) => AI.test(h)), `no request to an AI provider or model CDN (other hosts seen: ${outside.join(", ") || "none"})`);
    check(chatModelLoaded().every((u) => u.startsWith(site)), `all ${chatModelLoaded().length} model and runtime files came from this site`);
    ws.close();
  } finally {
    // google-chrome is a wrapper script: end the whole process group, not just the script
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {}
    // wait until the last of its processes is gone before the next Chrome starts
    for (let i = 0; i < 50; i++) {
      try {
        process.kill(-chrome.pid, 0);
        await sleep(200);
      } catch {
        break;
      }
    }
    rmSync(tmp, { recursive: true, force: true });
  }
}

const only = process.env.ONLY;
if (!only || only === "phone") await browser("phone", { width: 390, height: 844, mobile: true });
if (!only || only === "desktop") await browser("desktop", { width: 1440, height: 900, mobile: false });
if (!only || only === "flat") await browser("phone, flat notebook", { width: 390, height: 844, mobile: true, calm: true });

// answers that are never reachable would be dead weight
check(answers.every((a) => a.ask.length >= 4), "every answer has at least 4 phrasings");

console.log(failures ? `\n${failures} check(s) failed` : "\nall chat checks passed");
process.exit(failures ? 1 : 0);
