// Plays the song previews. Nothing clever on purpose: every tap makes a new, plain
// <audio> element, gives it the preview file and calls play() in that same tap.
// There is no Web Audio here, so no filter, EQ, gain or compressor: what comes out is
// the file exactly as Apple or Deezer made it.
//
// A song has up to two sources. Apple's own preview (AAC) is used whenever the browser
// can play it. Deezer's copy of the same song (MP3, through /api/songs/mp3) is only for
// browsers that cannot, which is mostly Opera and Chromium on Linux without AAC.
//
// Open the site with ?debug=1 to see what the last tapped song did (see SongDebug.tsx).

export type Source = { url: string; from: "Apple" | "Deezer" };
export type Playable = { title: string; preview: string | null; mp3?: string };

const SECONDS = 30; // the previews are half a minute; never play past that
const QUIET_LIMIT = 7000; // ms a source may take to make its first sound before the next is tried
// These previews are mastered about 9 dB louder than the voiceover (measured: -9 LUFS
// against -18). Half volume on the element brings them level with the rest of the site.
// It is only a level: the tone of the file is not touched.
const VOLUME = 0.5;
const AAC = ['audio/mp4; codecs="mp4a.40.2"', "audio/x-m4a", "audio/aac"]; // what Apple's previews are
const MP3 = "audio/mpeg";
const MEDIA_ERRORS = ["", "stopped by the browser", "network error", "the file could not be decoded", "format not supported"];

export type Report = {
  title: string;
  from: string;
  url: string;
  status: string; // what asking for the address returned
  canPlay: Record<string, string>;
  readyState: number;
  networkState: number;
  time: number;
  paused: boolean;
  volume: number;
  error: string;
  rejected: string; // why play() said no, if it did
  log: string[];
};

type Event = { kind: "time"; at: number } | { kind: "start"; from: string } | { kind: "stop" } | { kind: "fail"; why: string; again: boolean } // why: a few words for the card;

const state = {
  audio: null as HTMLAudioElement | null,
  song: null as number | null,
  left: [] as Source[], // sources not tried yet for this song
  watch: 0,
  tell: (() => {}) as (e: Event) => void,
  report: null as Report | null,
  watchers: new Set<() => void>(),
};

const debugging = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

function note(change: Partial<Report>, line?: string) {
  const r = state.report;
  if (!r) return;
  const a = state.audio;
  const log = line ? [...r.log, `${(performance.now() / 1000).toFixed(1)}s ${line}`].slice(-8) : r.log;
  state.report = { ...r, ...change, log, readyState: a?.readyState ?? 0, networkState: a?.networkState ?? 0, time: a?.currentTime ?? 0, paused: a?.paused ?? true, volume: a?.volume ?? 0 };
  state.watchers.forEach((w) => w());
}

// Only in debug mode: ask for the first bytes of the file and say what came back.
async function check(source: Source, audio: HTMLAudioElement) {
  const mine = () => state.audio === audio && state.report?.url === source.url;
  try {
    const res = await fetch(source.url, { headers: { range: "bytes=0-1" }, cache: "no-store" });
    if (mine()) note({ status: `${res.status} ${res.headers.get("content-type") ?? "no content-type"}` });
  } catch {
    // another site's file that does not allow being read by script: can it be reached at all?
    try {
      await fetch(source.url, { mode: "no-cors", cache: "no-store" });
      if (mine()) note({ status: "reachable (the other site does not let a page read the status)" });
    } catch (e) {
      if (mine()) note({ status: `could not be reached: ${(e as Error).message}` });
    }
  }
}

// `why` is the whole story, for the console and the debug panel; `short` goes on the card
function fail(why: string, short: string, again = false) {
  window.clearTimeout(state.watch);
  console.warn(`[songs] "${state.report?.title}": ${why}`);
  note({}, `gave up: ${why}`);
  state.tell({ kind: "fail", why: short, again });
}

function tryNext(audio: HTMLAudioElement, why: string, short = "") {
  if (state.audio !== audio) return; // an older tap's element
  window.clearTimeout(state.watch);
  const source = state.left.shift();
  if (!source) return fail(why || "no preview to play", short || "no preview");
  if (why) console.warn(`[songs] "${state.report?.title}": ${why}. Trying ${source.from}.`);
  note({ from: source.from, url: source.url, status: debugging() ? "checking..." : "", error: "", rejected: "" }, `${why ? `${why}; ` : ""}trying ${source.from}`);
  audio.src = source.url;
  audio.play().then(
    () => {
      if (state.audio !== audio) return;
      note({}, "play() accepted");
      state.tell({ kind: "start", from: source.from });
    },
    (e: Error) => {
      if (state.audio !== audio) return;
      note({ rejected: `${e.name}: ${e.message}` }, `play() rejected: ${e.name}`);
      // the browser wants a tap of its own for this: say so on the card
      if (e.name === "NotAllowedError") fail(`the browser blocked it: ${e.message}`, "blocked", true);
      // AbortError is a newer tap taking over; a file that will not load is dealt with
      // by the error listener, which moves on to the next source
    },
  );
  if (debugging()) void check(source, audio);
  // some browsers neither play nor report an error: do not wait for ever
  state.watch = window.setTimeout(() => {
    if (state.audio === audio && audio.currentTime < 0.05) tryNext(audio, `${source.from} made no sound in ${QUIET_LIMIT / 1000}s`, "no sound came");
  }, QUIET_LIMIT);
}

function drop() {
  window.clearTimeout(state.watch);
  const old = state.audio;
  state.audio = null;
  state.song = null;
  if (!old) return;
  old.pause();
  old.removeAttribute("src");
  old.load(); // lets go of the download
}

export const player = {
  get song() {
    return state.song;
  },
  // Start song i. Call it straight from the tap: the element is made, pointed at the
  // file and told to play before this returns.
  start(i: number, song: Playable) {
    drop();
    const audio = new Audio();
    state.audio = audio;
    state.song = i;
    audio.preload = "auto";
    audio.volume = VOLUME;

    const canPlay = Object.fromEntries([...AAC, MP3].map((t) => [t, audio.canPlayType(t) || "no"]));
    const aac = AAC.some((t) => audio.canPlayType(t) !== "");
    state.left = [];
    if (song.preview && aac) state.left.push({ url: song.preview, from: "Apple" });
    if (song.mp3) state.left.push({ url: song.mp3, from: "Deezer" });
    state.report = { title: song.title, from: "", url: "", status: "", canPlay, readyState: 0, networkState: 0, time: 0, paused: true, volume: VOLUME, error: "", rejected: "", log: [] };
    if (song.preview && !aac) note({}, "this browser says it cannot play AAC, so Apple's file is skipped");

    const mine = () => state.audio === audio;
    audio.addEventListener("timeupdate", () => {
      if (!mine()) return;
      state.tell({ kind: "time", at: Math.min(1, audio.currentTime / SECONDS) });
      if (debugging()) note({});
      if (audio.currentTime >= SECONDS) {
        drop();
        state.tell({ kind: "stop" });
      }
    });
    audio.addEventListener("ended", () => {
      if (!mine()) return;
      drop();
      state.tell({ kind: "stop" });
    });
    audio.addEventListener("error", () => {
      if (!mine()) return;
      const e = audio.error;
      const what = `media error ${e?.code ?? "?"} (${MEDIA_ERRORS[e?.code ?? 0] || "unknown"}${e?.message ? `: ${e.message}` : ""})`;
      const from = state.report?.from ?? "";
      note({ error: what }, `${from}: ${what}`);
      tryNext(audio, `${from} file would not play, ${what}`, MEDIA_ERRORS[e?.code ?? 0] || "media error");
    });
    for (const name of ["loadedmetadata", "canplay", "playing", "waiting", "stalled", "pause"]) {
      audio.addEventListener(name, () => mine() && note({}, name));
    }
    tryNext(audio, "");
  },
  stop() {
    drop();
  },
  listen(tell: (e: Event) => void) {
    state.tell = tell;
  },
  // for the debug panel
  get report() {
    return state.report;
  },
  watch(fn: () => void) {
    state.watchers.add(fn);
    return () => {
      state.watchers.delete(fn);
    };
  },
};
