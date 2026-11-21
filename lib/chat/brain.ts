// The chat's thinking, in the browser. Nothing here loads until the bubble is first
// opened: then the model starts warming up in a worker (public/chat/worker.js) and the
// answer vectors are fetched. Until the model is ready, or if it never is (an old phone,
// a failed download), questions are matched by keywords instead.

import { byKeywords, byMeaning, decode, type Embeddings, type EmbeddingsFile, type Reply } from "./match";

export type State = "idle" | "warming" | "ready" | "failed";

// How long a question waits for the model, counted from when warming started.
// After that it gets a keyword answer and the model keeps loading for the next one.
const PATIENCE_MS = 8000;
const EMBED_MS = 4000; // a single question should take well under a second

let state: State = "idle";
let startedAt = 0;
let worker: Worker | null = null;
let data: Embeddings | null = null;
let modelReady = false;
let nextId = 0;
const pending = new Map<number, (v: Float32Array | null) => void>();
const listeners = new Set<() => void>();
let whenReady: Promise<boolean> = Promise.resolve(false);

const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

export const brain = {
  state: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  start() {
    if (state !== "idle") return;
    startedAt = performance.now();
    set("warming");
    let model: Promise<boolean>;
    try {
      worker = new Worker("/chat/worker.js", { type: "module" });
      model = new Promise<boolean>((resolve) => {
        worker!.onmessage = ({ data: m }) => {
          if (m.type === "ready") resolve(true);
          if (m.type === "failed") {
            console.warn("chat model failed to load:", m.error);
            resolve(false);
          }
          if (m.type === "vector") {
            pending.get(m.id)?.(m.error ? null : (m.vector as Float32Array));
            pending.delete(m.id);
          }
        };
        worker!.onerror = () => resolve(false);
      });
    } catch {
      model = Promise.resolve(false);
    }
    const vectors = fetch("/chat/embeddings.json")
      .then((r) => (r.ok ? (r.json() as Promise<EmbeddingsFile>) : Promise.reject(new Error(String(r.status)))))
      .then((f) => {
        data = decode(f);
        return true;
      })
      .catch(() => false);
    whenReady = Promise.all([model, vectors]).then(([m, v]) => {
      modelReady = m && v;
      set(modelReady ? "ready" : "failed");
      if (!modelReady) worker?.terminate();
      return modelReady;
    });
  },

  async ask(text: string): Promise<Reply> {
    if (!modelReady && state === "warming") {
      const left = PATIENCE_MS - (performance.now() - startedAt);
      if (left > 0) await Promise.race([whenReady, new Promise((r) => setTimeout(r, left))]);
    }
    if (!modelReady || !worker || !data) return byKeywords(text);
    const id = nextId++;
    const vector = await Promise.race([
      new Promise<Float32Array | null>((resolve) => {
        pending.set(id, resolve);
        worker!.postMessage({ type: "embed", id, text });
      }),
      new Promise<null>((r) => setTimeout(() => r(null), EMBED_MS)),
    ]);
    pending.delete(id);
    return vector ? byMeaning(text, vector, data) : byKeywords(text);
  },
};
