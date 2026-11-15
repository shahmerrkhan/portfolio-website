"use client";

import { useSyncExternalStore } from "react";
import { player } from "@/lib/player";
import { sound } from "@/lib/sound";

// Only with ?debug=1 in the address: a small panel along the bottom that says what the
// last tapped song did, so a silent song can be explained instead of guessed at.
const READY = ["nothing", "metadata", "current frame", "a little ahead", "enough to play"];
const NETWORK = ["empty", "idle", "loading", "no source"];
const never = () => () => {};

export default function SongDebug() {
  const on = useSyncExternalStore(never, () => new URLSearchParams(window.location.search).has("debug"), () => false);
  const r = useSyncExternalStore(player.watch, () => player.report, () => null);
  const garden = useSyncExternalStore(sound.subscribe, () => sound.garden, () => "");
  if (!on) return null;
  return (
    <aside className="song-debug" aria-label="Song debug">
      <p>garden sound: {garden}</p>
      {!r ? (
        <p>song debug: tap a song</p>
      ) : (
        <>
          <p>
            <b>{r.title}</b> · source: <b>{r.from || "none"}</b> · url: {r.url ? (r.url.length > 70 ? `${r.url.slice(0, 67)}...` : r.url) : "none"}
          </p>
          <p>url status: {r.status || "not checked"}</p>
          <p>
            canPlayType:{" "}
            {Object.entries(r.canPlay)
              .map(([type, answer]) => `${type} = ${answer}`)
              .join(" · ")}
          </p>
          <p>
            readyState: {r.readyState} ({READY[r.readyState]}) · networkState: {r.networkState} ({NETWORK[r.networkState]}) · time: {r.time.toFixed(1)}s · {r.paused ? "paused" : "playing"} · volume: {r.volume}
          </p>
          <p>
            error: {r.error || "none"} · play() rejection: {r.rejected || "none"}
          </p>
          <p>{r.log.join(" → ")}</p>
        </>
      )}
    </aside>
  );
}
