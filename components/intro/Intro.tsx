"use client";

import { useEffect, useRef, useState } from "react";
import { voiceover, words } from "@/content/site";
import { sound } from "@/lib/sound";
import { Clip, cover } from "./clip";
import storm from "./storm.json";

// The intro: tap to begin, a flight through storm cloud with the voiceover and its
// captions, lightning that builds with the voice, the blue portal opening like the calm
// eye of the storm, the tunnel down, and then the sunny garden underneath shows through.
//
// Everything runs on the voiceover's own clock (audio.currentTime), never a separate
// timer: the captions against the cue times in content/site.ts, and the cloud frame,
// each flash and each roll of thunder against storm.json. So they stay right through a
// slow start, a pause or mute. Only if the file cannot be played at all do the same
// cues run on a plain clock instead.
//
// The lightning is not painted into the cloud frames. Each flash is its own short run of
// frames holding only the light it adds, laid over the clouds and faded up and down
// here. That is what lets a visitor who needs calm have the same storm with no flashing.

const GIVE_UP_AFTER = 5; // seconds to wait for the voice to start before using the plain clock
const CLOUD_FPS = storm.fps; // under the 24 a film runs at, so the clouds drift
const BLEND = 0.8; // seconds for the clouds at the gate to melt into the start of the flight
const PORTAL_FPS = 24;
const PORTAL_FADE = 0.6;
const STILL_FRAME = 84; // the one frame shown to people who asked for less motion
const FLASH_GAIN = 0.85; // lightning never reaches the full brightness it was rendered at
// The portal clip is five seconds: the eye grows, we go through it at about 2.1s, then
// the tunnel. The swoosh starts here, swells for a second so its peak lands on the
// crossing, and has died away by 3.6s, before the garden comes up.
const SWOOSH_AT = 1.1;

type Stage = "gate" | "clouds" | "portal" | "out";
type Flash = { name: string; at: number; len: number; env: number[][] };

// which line is being spoken at a given second
function lineAt(seconds: number) {
  let line = -1;
  voiceover.cues.forEach((cue, i) => seconds >= cue && (line = i));
  return line;
}

// how bright a flash is, `t` seconds into its life
function envelope(env: number[][], t: number) {
  for (let i = 1; i < env.length; i++) {
    const [t0, v0] = env[i - 1];
    const [t1, v1] = env[i];
    if (t <= t1) return t < t0 ? 0 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return env[env.length - 1][1];
}

// a tile of film grain, made once
function grainTile() {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 192;
  const g = tile.getContext("2d");
  if (!g) return null;
  const image = g.createImageData(192, 192);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 128 + (Math.random() + Math.random() - 1) * 70;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  return tile;
}

type Props = {
  still: boolean; // reduced motion: one calm frame, no flight, no portal
  flashes: boolean; // false for reduced motion and slow devices: the storm without lightning
  onDone: (skipped: boolean) => void;
};

export default function Intro({ still, flashes, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actions = useRef({ begin: () => {}, skip: () => {} });
  const [stage, setStage] = useState<Stage>("gate");
  const [line, setLine] = useState(-1);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    const tall = window.innerHeight > window.innerWidth;
    const cloudDir = `/frames/clouds${tall ? "-tall" : ""}`;
    const portalDir = `/frames/portal${tall ? "-tall" : ""}`;
    const clouds = new Clip(cloudDir, true);
    const portal = new Clip(portalDir, false, 0, true); // not needed for twenty seconds: behind everything else in the queue
    const layers = new Map<string, { clip: Clip; first: number }>();
    const grain = still ? null : grainTile();
    const grainPattern = grain && ctx ? ctx.createPattern(grain, "repeat") : null;

    // Clouds first, so there is something to look at straight away. The lightning comes
    // down alongside, in the order it fires, then the portal.
    let gone = false;
    const addLayers = async (clip: Clip, dir: string, wanted: (name: string) => boolean) => {
      for (const layer of clip.layers) {
        if (gone) return; // the intro is over: nothing more is fetched
        if (!wanted(layer.name)) continue;
        const made = new Clip(`${dir}/${layer.name}`, false, layer.count, true);
        layers.set(layer.name, { clip: made, first: layer.first });
        await made.load();
      }
    };
    void (async () => {
      await clouds.open();
      if (still) return clouds.load(STILL_FRAME);
      await Promise.all([clouds.load(), addLayers(clouds, cloudDir, (name) => flashes || name === "eye")]);
      if (gone) return;
      await portal.load();
      if (flashes) await addLayers(portal, portalDir, () => true);
    })();

    const voice = new Audio();
    let voiceOk = true;
    voice.preload = "auto";
    voice.addEventListener("error", () => (voiceOk = false));
    voice.src = voiceover.src;
    const unsubscribe = sound.subscribe(() => (voice.muted = sound.muted));

    let now: Stage = "gate";
    let raf = 0;
    let last = performance.now();
    let drift = 0; // where the clouds at the gate have drifted to, in frames
    let began = 0;
    let clock = 0; // seconds into the voiceover, smoothed
    let clockFrom = -1; // when the plain clock started, if it had to
    let portalBegan = 0;
    let shownLine = -1;
    let ducking = false;
    let thundered = 0; // how many of the thunder cues have sounded

    const go = (next: Stage) => {
      now = next;
      setStage(next);
    };
    const finish = (skipped = false) => {
      if (now === "out") return;
      // whatever of the intro has not arrived is not needed now: leave the line to the garden
      gone = true;
      clouds.halt();
      portal.halt();
      layers.forEach((l) => l.clip.halt());
      if (skipped) {
        setSkipped(true);
        // the rest of the voiceover is not going to be heard: stop downloading it
        voice.removeAttribute("src");
        voice.load();
      }
      voice.pause();
      if (ducking) sound.duck(false);
      ducking = false;
      sound.stopStorm(now === "portal" ? 1.2 : 0.3);
      go("out");
      onDone(skipped);
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
        sound.unlock(); // this tap is what lets the storm, the swoosh and the garden sound
        sound.startStorm();
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
        sound.stopStorm(0.3); // and the thunder and the wind
        finish(true);
      },
    };

    // one layer of light over the clouds: `at` is the cloud frame showing, with a fraction
    const light = (c: CanvasRenderingContext2D, name: string, at: number, strength: number) => {
      const layer = layers.get(name);
      if (!layer || strength <= 0.004) return;
      const i = Math.floor(at) - layer.first;
      const a = layer.clip.get(i);
      const b = layer.clip.get(i + 1);
      const f = at - Math.floor(at);
      if (a) cover(c, a, strength * (b ? 1 - f : 1), true);
      if (b) cover(c, b, strength * f, true);
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
          // The storm follows the voice too. Its clock runs smoothly between the audio
          // element's coarse updates and is pulled back to it if they part.
          if (started && !voice.paused) clock += dt;
          const off = voice.currentTime - clock;
          clock = Math.abs(off) > 0.25 ? voice.currentTime : clock + off * 0.1;
          if (voice.ended) toPortal();
        } else {
          if (clockFrom < 0) clockFrom = time;
          clock = (time - clockFrom) / 1000;
          current = lineAt(clock);
          if (clock >= voiceover.seconds) toPortal();
        }
        if (now === "clouds" && current !== shownLine) setLine((shownLine = current));

        // thunder, a beat after its flash (light before sound). The calm version keeps
        // the far rumbles and leaves out the big clap, since it has no strike.
        while (thundered < storm.thunder.length && clock >= storm.thunder[thundered].at) {
          const t = storm.thunder[thundered++];
          if (flashes || t.size < 1) sound.thunder(t.level, t.size);
        }
      }

      if (clouds.frames) {
        if (still) {
          clouds.want(STILL_FRAME);
          const frame = clouds.get(STILL_FRAME);
          if (frame) cover(ctx, frame);
        } else {
          // At the gate the clouds just drift. From the tap on, the frame is set by the
          // voice's clock, and the drifting clouds melt into it. The loop has no seam: the
          // camera travels exactly one period of the cloud noise.
          const flying = now !== "gate";
          const melt = flying ? Math.min(1, (time - began) / 1000 / BLEND) : 0;
          if (now === "portal") clock += dt;
          if (melt < 1) drift += dt * CLOUD_FPS;
          const at = clock * CLOUD_FPS;
          const covered = now === "portal" && time - portalBegan > PORTAL_FADE * 1000 + 100;
          const draw = (pos: number, alpha: number) => {
            const i = Math.floor(pos) % clouds.frames;
            const a = clouds.get(i);
            const b = clouds.get((i + 1) % clouds.frames);
            if (a) cover(ctx, a, alpha);
            if (a && b) cover(ctx, b, alpha * (pos - Math.floor(pos)));
          };
          if (!covered) {
            // while they melt, two places in the clip are on screen: keep both decoded
            if (!flying) clouds.want(Math.floor(drift));
            else clouds.want(Math.floor(at), melt < 1 ? Math.floor(drift) : -1);
            if (melt < 1) draw(drift, 1);
            if (flying) draw(at, melt);
          }

          if (flying && !covered) {
            const leaving = now === "portal" ? Math.max(0, 1 - (time - portalBegan) / 1000 / PORTAL_FADE) : 1;
            for (const flash of [...(storm.flashes as Flash[]), storm.eye as Flash]) {
              const t = clock - flash.at;
              const layer = layers.get(flash.name);
              if (!layer) continue;
              // have its first frames decoded just before it fires, and let them go after
              if (t > -0.7 && t < flash.len + 0.3) layer.clip.want(Math.floor(at) - layer.first);
              else if (t >= flash.len + 0.3 && t < flash.len + 1) layer.clip.rest();
              if (t < 0 || t > flash.len + 0.3) continue;
              const gain = flash.name === "eye" ? leaving : FLASH_GAIN;
              light(ctx, flash.name, at, envelope(flash.env, t) * gain * melt);
            }
          }
        }
      }

      if (now === "portal") {
        const seconds = (time - portalBegan) / 1000;
        const i = Math.floor(seconds * PORTAL_FPS);
        if (i >= portal.frames - 1) return finish();
        portal.want(i);
        const frame = portal.get(i) ?? portal.get(i - 1);
        if (frame) cover(ctx, frame, Math.min(1, seconds / PORTAL_FADE));
        // a last flicker or two running along the tunnel wall
        for (const flash of storm.tunnel as Flash[]) {
          const t = seconds - flash.at;
          const layer = layers.get(flash.name);
          if (!layer || t < -0.5 || t > flash.len) continue;
          layer.clip.want(i - layer.first);
          const lit = layer.clip.get(i - layer.first);
          if (lit && t >= 0) cover(ctx, lit, envelope(flash.env, t) * FLASH_GAIN, true);
        }
      }

      // a touch of film grain, moved every frame
      if (grainPattern) {
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.globalCompositeOperation = "overlay";
        ctx.translate(-Math.floor(Math.random() * 192), -Math.floor(Math.random() * 192));
        ctx.fillStyle = grainPattern;
        ctx.fillRect(0, 0, w + 192, h + 192);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      voice.pause();
      voice.removeAttribute("src");
      if (ducking) sound.duck(false);
      sound.stopStorm(0.3);
      clouds.dispose();
      portal.dispose();
      layers.forEach((l) => l.clip.dispose());
    };
  }, [still, flashes, onDone]);

  return (
    <div className="intro" data-stage={stage} data-skipped={skipped} aria-hidden={stage === "out"}>
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
