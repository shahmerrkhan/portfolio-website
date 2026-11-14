"use client";

import { useRef, useState } from "react";
import { sounds } from "./candidates";
import styles from "./lab.module.css";

// What is still waiting for a yes or no: only the garden sound.
export default function Lab() {
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggleSound = (id: string) => {
    const audio = audioRef.current!;
    if (playing === id) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = `/lab/sound/${id}.mp3`;
    audio.loop = true;
    audio.volume = 0.6;
    audio.play().then(() => setPlaying(id), () => setPlaying(null));
  };

  return (
    <main className={styles.lab}>
      <header>
        <h1>Still to pick</h1>
        <p>The materials and the clouds are locked. The garden sound is the last one. Listen, then say which.</p>
      </header>

      <section>
        <h2>Garden sound</h2>
        <audio ref={audioRef} onEnded={() => setPlaying(null)} />
        <ul className={styles.sounds}>
          {sounds.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`tag ${styles.pick}`}
                aria-pressed={playing === s.id}
                onClick={() => toggleSound(s.id)}
              >
                {playing === s.id ? "stop" : "play"}
              </button>
              <span>
                {s.name} <small>{s.note}</small>
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.small}>
          All three were recorded by ezwa and given to the public domain (Wikimedia Commons, from pdsounds.org). That is
          free to use like CC0, but it is not the CC0 licence itself.
        </p>
      </section>
    </main>
  );
}
