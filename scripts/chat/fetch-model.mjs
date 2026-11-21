// Run once (npm run chat:model): puts everything the chat needs in the browser under
// public/, so the site serves it from its own domain and never calls Hugging Face or a CDN.
//
//   public/chat/transformers.js        Transformers.js, the self-contained browser build. Not the
//                                      .min.js: GitHub's secret scanner reads a minified name in it
//                                      as an API key and blocks the push.
//   public/chat/ort/                   the ONNX runtime it runs the model with (plain wasm, no WebGPU)
//   public/models/Xenova/all-MiniLM-L6-v2/   the model, 8-bit (about 23MB)
//
// The model download is the only network call, and it happens here on a dev machine,
// never in a visitor's browser. Commit the files it writes.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const out = (...p) => path.join(root, "public", ...p);
const mod = (...p) => path.join(root, "node_modules", ...p);

mkdirSync(out("chat", "ort"), { recursive: true });
copyFileSync(mod("@huggingface/transformers/dist/transformers.js"), out("chat", "transformers.js"));
for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  copyFileSync(mod("onnxruntime-web/dist", f), out("chat", "ort", f));
}

const MODEL = "Xenova/all-MiniLM-L6-v2";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "onnx/model_quantized.onnx"];
for (const f of FILES) {
  const dest = out("models", MODEL, f);
  if (existsSync(dest)) continue;
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(`https://huggingface.co/${MODEL}/resolve/main/${f}`);
  if (!res.ok) throw new Error(`${f}: ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("got", f);
}
console.log("chat runtime and model are in public/");
