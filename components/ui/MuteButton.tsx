"use client";

import { useSyncExternalStore } from "react";
import { words } from "@/content/site";
import { sound } from "@/lib/sound";

export default function MuteButton() {
  const muted = useSyncExternalStore(
    sound.subscribe,
    () => sound.muted,
    () => false,
  );
  return (
    <button type="button" className="tag mute" aria-pressed={muted} onClick={() => sound.setMuted(!muted)}>
      {muted ? words.soundOff : words.soundOn}
    </button>
  );
}
