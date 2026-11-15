"use client";

import { useEffect, useState } from "react";
import { books, hobbies, songs, words } from "@/content/site";
import { player } from "@/lib/player";
import { sound } from "@/lib/sound";
import shelf from "./shelf.json";

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
      // ended, failed, or faded out because the notebook was closed: the button goes
      // back to play and "playing" comes off the card
      player.stop();
      setPlaying(null);
      setProgress(0);
      setFrom("");
    });
    return () => {
      live = false;
      player.listen(() => {});
      player.stop();
    };
  }, []);

  // Only the song is heard while one plays: the garden goes out, and comes back when
  // nothing is playing. Going from one song to the next keeps it out the whole time.
  useEffect(() => {
    sound.song(playing !== null);
  }, [playing]);
  useEffect(() => () => sound.song(false), []);

  // The mute tag covers the songs as well. Muting while one plays silences it and leaves
  // it muted; nothing here ever turns the sound back on.
  useEffect(() => {
    const follow = () => player.mute(sound.muted);
    follow();
    return sound.subscribe(follow);
  }, []);

  // Starting a song stops the one before; tapping the one that is playing stops it.
  const toggle = (i: number) => {
    if (playing === i) {
      player.stop();
      return setPlaying(null);
    }
    // with the sound off a song would only play silently: say so on the card and leave it there
    if (sound.muted) {
      player.stop();
      setPlaying(null);
      return setFailed((f) => ({ ...f, [i]: words.songMuted }));
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

// The shelf is one picture (scripts/bookshelf/render.mjs paints it from photographs of
// cloth, leather, paper and wood), with a clear button laid over each book. shelf.json
// says where each book is in the picture, in the same order as `books`.
type Box = { x: number; y: number; w: number; h: number; turn: number; about: number[]; pose: string };
const boxes = shelf.books as Box[];

// A standing book that is picked is drawn again from the same picture a little higher,
// so it looks pulled part-way out. This is where that book is in the picture.
const cut = (b: Box) => ({
  left: `${b.x}%`,
  top: `${b.y}%`,
  width: `${b.w}%`,
  height: `${b.h}%`,
  backgroundSize: `${10000 / b.w}% ${10000 / b.h}%`,
  backgroundPosition: `${(b.x / (100 - b.w)) * 100}% ${(b.y / (100 - b.h)) * 100}%`,
  transform: b.turn ? `rotate(${b.turn}deg)` : undefined,
  transformOrigin: `${b.about[0] * 100}% ${b.about[1] * 100}%`,
});

export function FunRight() {
  const [picked, setPicked] = useState<number | null>(null);
  const book = picked === null ? null : books[picked];

  return (
    <div className="p-fun">
      <h2 className="heading">{words.books}</h2>
      <div className="shelf" style={{ aspectRatio: `${shelf.w} / ${shelf.h}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- one small picture, placed exactly under its buttons */}
        <img src={shelf.src} alt="" width={shelf.w} height={shelf.h} decoding="async" />
        {books.map((b, i) => (
          <button key={b.title} type="button" data-pose={boxes[i].pose} style={cut(boxes[i])} aria-label={b.title} aria-pressed={picked === i} onClick={() => setPicked(picked === i ? null : i)} />
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
      <div className="hobbies">
        {hobbies.map((group, g) => (
          <section key={group.label}>
            <h3>{group.label}</h3>
            <ul>
              {group.items.map((h, i) => (
                <li key={h} data-hand={(i + g) % 3} style={{ "--tilt": `${(((i + g * 3) * 47) % 7) - 3}deg` } as React.CSSProperties}>
                  {h}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
