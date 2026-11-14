"use client";

import { useEffect, useRef, useState } from "react";
import { voiceover, words } from "@/content/site";
import { sound } from "@/lib/sound";
import { Clip, cover } from "./clip";

// The intro: tap to begin, clouds with the voiceover and its captions, the blue portal,
// the tunnel down, and then the garden underneath shows through.
//
// The words on screen follow the voiceover's own clock (audio.currentTime) against the
// cue times in content/site.ts, never a separate timer, so they stay right through a
// slow start, a pause, a seek or mute. Only if the file cannot be played at all do the
// same cues run on a plain clock instead.

const GIVE_UP_AFTER = 5; // seconds to wait for the voice to start before using the plain clock
const CLOUD_SPEED = 13; // frames a second; under the 24 they were rendered at, so they drift
const LOOP_BLEND = 20; // frames over which the end of the cloud clip melts into its start
const PORTAL_FPS = 24;
// The portal clip is five seconds: the ring grows, we go through it at about 2.1s, then
// the tunnel. The swoosh starts here, swells for a second so its peak lands on the
// ring, and has died away by 3.6s, before the garden comes up.
const SWOOSH_AT = 1.1;

type Stage = "gate" | "clouds" | "portal" | "out";

// which line is being spoken at a given second
function lineAt(seconds: number) {
  let line = -1;
  voiceover.cues.forEach((cue, i) => seconds >= cue && (line = i));
  return line;
}

export default function Intro({ still, onDone }: { still: boolean; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actions = useRef({ begin: () => {}, skip: () => {} });
  const [stage, setStage] = useState<Stage>("gate");
  const [line, setLine] = useState(-1);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    const tall = window.innerHeight > window.innerWidth;
    const clouds = new Clip(`/frames/clouds${tall ? "-tall" : ""}`);
    const portal = new Clip(`/frames/portal${tall ? "-tall" : ""}`);
    clouds.load().then(() => portal.load());

    const voice = new Audio();
    let voiceOk = true;
    voice.preload = "auto";
    voice.addEventListener("error", () => (voiceOk = false));
    voice.src = voiceover.src;
    const unsubscribe = sound.subscribe(() => (voice.muted = sound.muted));

    let now: Stage = "gate";
    let raf = 0;
    let last = performance.now();
    let cloudAt = 0; // which cloud frame, with a fraction
    let began = 0;
    let clockFrom = -1; // when the plain clock started, if it had to
    let portalBegan = 0;
    let shownLine = -1;
    let ducking = false;

    const go = (next: Stage) => {
      now = next;
      setStage(next);
    };
    const finish = () => {
      if (now === "out") return;
      voice.pause();
      if (ducking) sound.duck(false);
      ducking = false;
      go("out");
      onDone();
    };
    const toPortal = () => {
      if (ducking) sound.duck(false);
      ducking = false;
      setLine(-1);
      // nothing to fly through for people who asked for less motion, or if it never arrived
      if (still || portal.arrived < portal.frames * 0.5) return finish();
      portalBegan = performance.now();
      go("portal");
      sound.swoosh(SWOOSH_AT); // the voice has finished by now, so they never overlap
    };

    actions.current = {
      begin: () => {
        if (now !== "gate") return;
        sound.unlock(); // this tap is what lets the swoosh and the garden sound later
        began = performance.now();
        go("clouds");
        if (voiceOk) {
          voice.muted = sound.muted;
          const start = () =>
            voice.play().then(
              () => {
                if (now !== "clouds") return voice.pause();
                if (!ducking) sound.duck(true);
                ducking = true;
              },
              (e: Error) => {
                // The browser wants another tap before it will make sound: wait for it.
                // The words wait too, because they only follow the voice's clock.
                if (e.name === "NotAllowedError") window.addEventListener("pointerdown", () => now === "clouds" && start(), { once: true });
                else voiceOk = false;
              },
            );
          void start();
        }
      },
      skip: () => {
        sound.stopSwoosh(); // skipped part-way through the portal: the swoosh goes too
        finish();
      },
    };

    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (time - last) / 1000);
      last = time;
      if (!ctx || now === "out") return;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      if (now === "clouds") {
        const waited = (time - began) / 1000;
        const started = voice.played.length > 0 || voice.currentTime > 0;
        // no voice after a fair wait (file missing, or it will not load): fall back to the clock
        if (voiceOk && !started && waited > GIVE_UP_AFTER && voice.readyState < 2) voiceOk = false;
        let current = -1;
        if (voiceOk) {
          // nothing is shown until the voice has really begun
          if (started) current = lineAt(voice.currentTime);
          if (voice.ended) toPortal();
        } else {
          if (clockFrom < 0) clockFrom = time;
          const at = (time - clockFrom) / 1000;
          current = lineAt(at);
          if (at >= voiceover.seconds) toPortal();
        }
        if (now === "clouds" && current !== shownLine) setLine((shownLine = current));
      }

      // the clouds drift on a loop; its last frames blend into its first so it never jumps
      if (clouds.frames) {
        if (!still) cloudAt += dt * CLOUD_SPEED;
        if (cloudAt >= clouds.frames - 1) cloudAt -= clouds.frames - LOOP_BLEND;
        const i = Math.floor(cloudAt);
        const tail = i - (clouds.frames - LOOP_BLEND);
        clouds.want(i, tail >= 0 ? tail : -1);
        const a = clouds.get(i);
        const b = clouds.get(i + 1);
        if (a) cover(ctx, a);
        if (a && b) cover(ctx, b, cloudAt - i);
        if (tail >= 0) {
          const c = clouds.get(tail);
          if (c) cover(ctx, c, (cloudAt - (clouds.frames - LOOP_BLEND)) / LOOP_BLEND);
        }
      }

      if (now === "portal") {
        const seconds = (time - portalBegan) / 1000;
        const i = Math.floor(seconds * PORTAL_FPS);
        if (i >= portal.frames - 1) return finish();
        portal.want(i);
        const frame = portal.get(i) ?? portal.get(i - 1);
        if (frame) cover(ctx, frame, Math.min(1, seconds / 0.7));
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      voice.pause();
      voice.removeAttribute("src");
      if (ducking) sound.duck(false);
      clouds.dispose();
      portal.dispose();
    };
  }, [still, onDone]);

  return (
    <div className="intro" data-stage={stage} aria-hidden={stage === "out"}>
      <canvas ref={canvasRef} className="intro-canvas" aria-hidden="true" />
      {stage === "gate" && (
        <button type="button" className="gate" onClick={() => actions.current.begin()} autoFocus>
          <span className="tag">{words.begin}</span>
        </button>
      )}
      {stage === "clouds" && (
        <p className="caption" aria-live="polite">
          {line >= 0 && <span key={line}>{voiceover.lines[line]}</span>}
        </p>
      )}
      {stage !== "out" && (
        <button type="button" className="tag skip" onClick={() => actions.current.skip()}>
          {words.skip}
        </button>
      )}
    </div>
  );
}
