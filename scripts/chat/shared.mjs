// What the embed, check and test scripts share.
import { createHash } from "node:crypto";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "../..");
export const MODEL = "Xenova/all-MiniLM-L6-v2";
export const FILE = path.join(root, "public/chat/embeddings.json");

// The fingerprint of everything that gets embedded. If it changes, the file is stale.
export const hashOf = (list) => createHash("sha256").update(JSON.stringify([MODEL, list.map((x) => [x.text, x.answer])])).digest("hex").slice(0, 16);

// The same model, settings and files the browser uses (public/chat/worker.js), run in Node.
export async function embedder() {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.localModelPath = path.join(root, "public/models/");
  const extract = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
  return async (text) => (await extract(text, { pooling: "mean", normalize: true })).data;
}
