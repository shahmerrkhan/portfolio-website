// The chat's model, off the main thread so the garden keeps its frame rate while it loads.
// Started only when a visitor first opens the chat bubble. Everything it loads comes from
// this site (public/chat and public/models): nothing goes to Hugging Face, a CDN or any
// AI service (the runtime and model are put there by scripts/chat/fetch-model.mjs).

import { env, pipeline } from "/chat/transformers.js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.backends.onnx.wasm.wasmPaths = { mjs: "/chat/ort/ort-wasm-simd-threaded.mjs", wasm: "/chat/ort/ort-wasm-simd-threaded.wasm" };
env.backends.onnx.wasm.numThreads = 1; // threads need cross-origin isolation, which would break the song previews
env.backends.onnx.wasm.proxy = false;

const ready = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8", device: "wasm" });
ready.then(
  () => self.postMessage({ type: "ready" }),
  (e) => self.postMessage({ type: "failed", error: String(e) }),
);

self.onmessage = async ({ data }) => {
  if (data.type !== "embed") return;
  try {
    const extract = await ready;
    const out = await extract(data.text, { pooling: "mean", normalize: true });
    self.postMessage({ type: "vector", id: data.id, vector: out.data }, [out.data.buffer]);
  } catch (e) {
    self.postMessage({ type: "vector", id: data.id, error: String(e) });
  }
};
