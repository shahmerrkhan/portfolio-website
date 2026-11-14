"use client";

import { useEffect, useState } from "react";
import { books, hobbies, songs, words } from "@/content/site";
import { player } from "@/lib/player";
import { sound } from "@/lib/sound";

// Page 5: fun. Songs on the left; the bookshelf and hobbies on the right.

type Song = { title: string; artist: string; featuring?: string; preview: string | null; mp3?: string; art: string | null };

const SONG_TILTS = ["-2.2deg", "1.6deg", "2.2deg", "-1.4deg", "-2deg", "1.2deg"];
const RING = 2 * Math.PI * 17;

export function FunLeft() {
  const [list, setList] = useState<Song[]>(() => songs.map((s) => ({ ...s, preview: null, art: null })));
  const [state, setState] = useState<"loading" | "ok" | "down">("loading");
  const [playing, setPlaying] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Record<number, string>>({}); // what to say on a song that would not play

  useEffect(() => {
    let live = true;
    fetch("/api/songs")
      .then((r) => r.json())
      .then((d: { songs: Song[] }) => {
        if (!live) return;
        setList(d.songs);
        setState("ok");
      })
      .catch(() => live && setState("down"));

    player.listen((e) => {
      if (e.kind === "time") return setProgress(e.at);
      if (e.kind === "start") return setFrom(e.from);
      const i = player.song;
      if (e.kind === "fail" && i !== null) setFailed((f) => ({ ...f, [i]: e.again ? words.songAgain : `${words.songFailed} (${e.why})` }));
      player.stop();
      setPlaying(null);
    });
    return () => {
      live = false;
      player.listen(() => {});
      player.stop();
    };
  }, []);

  // the garden sound drops back while a song plays
  useEffect(() => {
    if (playing === null) return;
    sound.duck(true);
    return () => sound.duck(false);
  }, [playing]);

  // Starting a song stops the one before; tapping the one that is playing stops it.
  const toggle = (i: number) => {
    if (playing === i) {
      player.stop();
      return setPlaying(null);
    }
    setFailed((f) => ({ ...f, [i]: "" })); // a second tap is a fresh try
    setPlaying(i);
    setProgress(0);
    setFrom("");
    player.start(i, list[i]); // in the tap itself, which is what browsers want
  };

  return (
    <div className="p-fun">
      <h2 className="heading">{words.songs}</h2>
      <ul className="songs">
        {list.map((s, i) => {
          const on = playing === i;
          const who = s.featuring ? `${s.artist}, with ${s.featuring}` : s.artist;
          const playable = !!(s.preview || s.mp3);
          return (
            <li key={s.title} className="song note plain taped" data-playing={on} data-from={on ? from : undefined} style={{ "--tilt": SONG_TILTS[i % 6] } as React.CSSProperties}>
              {/* the whole slip is the button, so there is no small target to miss */}
              <button type="button" className="song-row" disabled={!playable} aria-pressed={on} aria-label={`${on ? "Stop" : "Play"} ${s.title} by ${s.artist}`} onClick={() => toggle(i)}>
                {s.art ? (
                  // eslint-disable-next-line @next/next/no-img-element -- album art comes straight from Apple
                  <img src={s.art} alt="" width={56} height={56} loading="lazy" />
                ) : (
                  <span className="no-art" aria-hidden="true" />
                )}
                <span className="song-words">
                  <strong>{s.title}</strong>
                  <span>{who}</span>
                  {on && <em className="now">{words.playing}</em>}
                  {failed[i] && <em role="status">{failed[i]}</em>}
                  {state !== "loading" && !playable && <em>{words.noPreview}</em>}
                </span>
                {playable && (
                  <svg className="play" viewBox="0 0 40 40" aria-hidden="true">
                    <circle className="ring" cx="20" cy="20" r="17" />
                    {on && <circle className="ring gone" cx="20" cy="20" r="17" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />}
                    {on ? <path className="icon" d="M14 13 h4.5 v14 h-4.5 z M21.5 13 h4.5 v14 h-4.5 z" /> : <path className="icon" d="M15.5 12.5 L28 20 L15.5 27.5 z" />}
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {state === "down" && <p className="quiet">{words.songsDown}</p>}
    </div>
  );
}

// Twenty spines, each a different cloth, height and width, the same every visit.
const CLOTHS = ["#7a2f2a", "#2f4a63", "#40593a", "#8a6a2c", "#4a3a5c", "#6b4a30", "#2d5552", "#8c4a2a", "#3b3f47", "#7d5a66"];
const spine = (i: number) => ({
  "--cloth": CLOTHS[(i * 7 + 3) % CLOTHS.length],
  "--tall": `${72 + ((i * 37) % 26)}%`,
  "--thick": `${0.8 + ((i * 53) % 5) * 0.11}`,
  "--lean": i % 7 === 4 ? "-4deg" : i % 9 === 6 ? "3deg" : "0deg",
});

export function FunRight() {
  const [picked, setPicked] = useState<number | null>(null);
  const shelves = [books.slice(0, 10), books.slice(10)];
  const book = picked === null ? null : books[picked];

  return (
    <div className="p-fun">
      <h2 className="heading">{words.books}</h2>
      <div className="shelves">
        {shelves.map((row, r) => (
          <ul className="shelf" key={r}>
            {row.map((b, k) => {
              const i = r * 10 + k;
              return (
                <li key={b.title} style={spine(i) as React.CSSProperties}>
                  <button type="button" aria-label={b.title} aria-pressed={picked === i} onClick={() => setPicked(picked === i ? null : i)} />
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <p className="note legal pinned small book-note" role="status" style={{ "--tilt": "-1.5deg" } as React.CSSProperties} hidden={!book}>
        {book && (
          <>
            <strong>{book.title}</strong>
            {book.author && <span>{book.author}</span>}
          </>
        )}
      </p>

      <h2 className="heading">{words.hobbies}</h2>
      <ul className="hobbies">
        {hobbies.map((h, i) => (
          <li key={h} data-hand={i % 3} style={{ "--tilt": `${((i * 47) % 9) - 4}deg` } as React.CSSProperties}>
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}
