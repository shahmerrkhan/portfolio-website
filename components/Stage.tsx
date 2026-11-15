"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Intro from "@/components/intro/Intro";
import FlatGarden from "@/components/scene/FlatGarden";
import GardenScene from "@/components/scene/GardenScene";
import MuteButton from "@/components/ui/MuteButton";
import SongDebug from "@/components/ui/SongDebug";
import { pickQuality } from "@/lib/quality";
import { sound } from "@/lib/sound";

// Runs the whole visit: the intro in front, the garden loading behind it, and the
// choice between the real 3D garden and the flat fallback.

type Mode = "3d" | "flat" | "still";
type Phase = "intro" | "leaving" | "garden";

const calmQuery = "(prefers-reduced-motion: reduce)";
let picked: Mode | null = null;
let slow = false; // a device on the low tier: it gets the storm without the lightning
function mode(): Mode {
  if (picked) return picked;
  // ?still is for scripts/capture-still.mjs, which photographs the empty open book
  if (new URLSearchParams(window.location.search).has("still")) return (picked = "still");
  const calm = window.matchMedia(calmQuery).matches;
  slow = pickQuality().tier === "low";
  return (picked = slow || calm ? "flat" : "3d");
}
const never = () => () => {};

export default function Stage() {
  // decided in the browser only; the server sends the page without a garden
  const detected = useSyncExternalStore(never, mode, () => null);
  const calm = useSyncExternalStore(never, () => window.matchMedia(calmQuery).matches, () => false);
  const [noWebGL, setNoWebGL] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");

  const onFail = useCallback(() => setNoWebGL(true), []);
  const onDone = useCallback((skipped: boolean) => {
    setPhase("leaving"); // the intro fades while the garden shows through
    void sound.startGarden();
    window.setTimeout(() => setPhase("garden"), skipped ? 450 : 1500); // a skip fades faster (garden.css)
  }, []);

  if (detected === "still") return <GardenScene shown still onFail={onFail} />;

  const which = noWebGL ? "flat" : detected;
  const shown = phase !== "intro";
  return (
    <main data-phase={phase}>
      {which === "3d" && <GardenScene shown={shown} onFail={onFail} />}
      {which === "flat" && <FlatGarden shown={shown} calm={calm} />}
      {phase !== "garden" && <Intro still={calm} flashes={!calm && !slow} onDone={onDone} />}
      <MuteButton />
      <SongDebug />
    </main>
  );
}
