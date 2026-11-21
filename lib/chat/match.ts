// Picks the reply. Pure functions, no browser needed, so scripts/chat/test.mjs runs the
// exact same code. The chat only ever returns one of the answers in content/chat.ts,
// or the refusal: nothing here writes new text.

import { answers, commands, type Answer, type Command } from "../../content/chat";
import { experience, projects } from "../../content/site";

// How close (cosine similarity, -1..1) a question has to be to one of an answer's
// phrasings before that answer is given. Tuned with scripts/chat/test.mjs: on-topic
// questions land around 0.55-0.95, off-topic ones mostly under 0.4.
export const THRESHOLD = 0.5;
// When the two best answers are this close and neither is a strong match, it's a guess:
// refuse rather than give the wrong one.
const MARGIN = 0.02;
const SURE = 0.6;

export type Reply = { kind: "answer"; answer: Answer; score: number; by: "meaning" | "keywords" } | { kind: "refuse"; why: string };

export type Embeddings = { hash: string; dim: number; answer: number[]; vectors: Float32Array[] };
export type EmbeddingsFile = { hash: string; dim: number; items: { a: number; s: number; v: string }[] };

// The vectors ship as 8-bit numbers (base64) with one scale each: about a quarter of
// the size of plain floats, and the scores move by less than 0.01.
export function decode(file: EmbeddingsFile): Embeddings {
  const fromBase64 = (b: string) => (typeof atob === "function" ? Uint8Array.from(atob(b), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(b, "base64")));
  return {
    hash: file.hash,
    dim: file.dim,
    answer: file.items.map((i) => i.a),
    vectors: file.items.map((i) => {
      const bytes = new Int8Array(fromBase64(i.v).buffer);
      return Float32Array.from(bytes, (x) => x * i.s);
    }),
  };
}

export function encode(vector: ArrayLike<number>): { s: number; v: string } {
  let max = 0;
  for (let i = 0; i < vector.length; i++) max = Math.max(max, Math.abs(vector[i]));
  const s = max / 127 || 1;
  const bytes = Int8Array.from(vector, (x) => Math.round(x / s));
  return { s, v: Buffer.from(bytes.buffer).toString("base64") };
}

const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};
const length = (a: Float32Array) => Math.sqrt(dot(a, a)) || 1;

export const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9:'+\-*/^=.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Sums and equations never go near the matcher.
export function isMath(text: string) {
  const t = clean(text);
  if (/\d/.test(t) && /^[\d\s+\-*/^().=x%]+$/.test(t) && /[+\-*/^=%]/.test(t)) return true;
  return /\b(integrate|integral|derivative|differentiate|equation|calculate|square root|solve for|multiply|divided by|times \d|\d+ (plus|minus|times) \d+)\b/.test(t);
}

export type Scores = { best: number; bestScore: number; second: number; offTopic: number };

export function score(query: Float32Array, data: Embeddings): Scores {
  const per = new Map<number, number>();
  let offTopic = -1;
  const ql = length(query);
  data.vectors.forEach((v, i) => {
    const s = dot(query, v) / (ql * length(v));
    const a = data.answer[i];
    if (a < 0) offTopic = Math.max(offTopic, s);
    else per.set(a, Math.max(per.get(a) ?? -1, s));
  });
  const ranked = [...per.entries()].sort((x, y) => y[1] - x[1]);
  return { best: ranked[0]?.[0] ?? -1, bestScore: ranked[0]?.[1] ?? -1, second: ranked[1]?.[1] ?? -1, offTopic };
}

export function byMeaning(text: string, query: Float32Array, data: Embeddings): Reply {
  if (isMath(text)) return { kind: "refuse", why: "math" };
  const s = score(query, data);
  if (s.bestScore < THRESHOLD) return { kind: "refuse", why: `below ${THRESHOLD} (${s.bestScore.toFixed(2)})` };
  if (s.offTopic >= s.bestScore) return { kind: "refuse", why: `closer to off-topic (${s.offTopic.toFixed(2)} vs ${s.bestScore.toFixed(2)})` };
  if (s.bestScore < SURE && s.bestScore - s.second < MARGIN) return { kind: "refuse", why: "too close to call" };
  return { kind: "answer", answer: answers[s.best], score: s.bestScore, by: "meaning" };
}

// ---------- the keyword fallback ----------

// Words that only show up in questions that are not about Shahmeer.
const OFF_TOPIC_WORDS = [
  "weather", "rain", "snow", "forecast", "temperature", "president", "prime minister", "capital", "recipe", "cook", "joke",
  "poem", "essay", "translate", "news", "bitcoin", "crypto", "stock", "movie", "homework", "python", "javascript", "java",
  "function", "algorithm", "write me", "write a", "write some", "explain", "what time", "population", "world cup",
  "elon", "trump", "biden", "super bowl", "nba", "nfl", "election", "score of", "everest", "moon", "planet", "physics", "chemistry", "history of", "meaning of life", "ignore", "pretend",
];

const NAMES = new Set([...projects, ...experience].map((x) => x.name.toLowerCase().replace(" university", "")));

const words = (t: string) => t.split(" ").map((w) => w.replace(/'s$/, "").replace(/[^a-z0-9:]/g, ""));
const has = (text: string, list: string[], key: string) => (key.includes(" ") || /[^a-z0-9]/.test(key) ? text.includes(key) : list.includes(key) || list.includes(`${key}s`) || (key.endsWith("s") && list.includes(key.slice(0, -1))));

export function byKeywords(text: string): Reply {
  if (isMath(text)) return { kind: "refuse", why: "math" };
  const t = clean(text);
  const list = words(t);
  let best = -1;
  let bestScore = 0;
  answers.forEach((a, i) => {
    // a phrase match counts double: "work now" says more than "work"
    // the name of a project or a place I've worked ("clicky", "magic hour") counts most
    const weight = (k: string) => (NAMES.has(k) ? 3 : k.includes(" ") ? 2 : 1);
    const s = a.keys.reduce((sum, k) => sum + (has(t, list, k) ? weight(k) : 0), 0) + (a.ask.some((q) => clean(q) === t) ? 5 : 0);
    if (s > bestScore) [best, bestScore] = [i, s];
  });
  const off = OFF_TOPIC_WORDS.some((k) => has(t, list, k));
  if (best < 0 || (off && bestScore < 3)) return { kind: "refuse", why: off ? "off-topic word" : "no keywords" };
  return { kind: "answer", answer: answers[best], score: bestScore, by: "keywords" };
}

// ---------- slash commands ----------

// "/fu" -> the commands that start with "fu" (then the ones that only contain it).
export function suggest(input: string): Command[] {
  if (!input.startsWith("/")) return [];
  const typed = input.slice(1).trim().toLowerCase();
  if (typed.includes(" ")) return [];
  const starts = commands.filter((c) => c.name.startsWith(typed));
  const contains = commands.filter((c) => !c.name.startsWith(typed) && (c.name.includes(typed) || c.line.toLowerCase().includes(typed)));
  return [...starts, ...contains];
}

export function command(input: string): Command | { unknown: string } | null {
  if (!input.trim().startsWith("/")) return null;
  const name = input.trim().slice(1).split(/\s+/)[0].toLowerCase();
  return commands.find((c) => c.name === name) ?? { unknown: name };
}
