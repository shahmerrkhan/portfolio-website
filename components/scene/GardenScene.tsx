"use client";

import { useEffect, useRef, useState } from "react";
import Notebook, { stopsFor } from "@/components/pages/Notebook";
import { collect, fit, forget, place, setSizes } from "@/components/pages/bind";
import { BookContext } from "@/components/pages/context";
import Tabs from "@/components/ui/Tabs";
import { secrets, words } from "@/content/site";
import { leafOf, locate, makePlan } from "@/lib/scrollPlan";
import type { SceneRig, View } from "./scene";

// The fixed top view of the garden, the tall empty track whose scrolling opens the
// notebook and turns its leaves, and the real text laid over the pages.
// Three.js, GSAP and Lenis are only downloaded once this mounts.
//
// One tick does everything, in this order: Lenis moves the scroll, ScrollTrigger reads
// it, the book and the text are both set from that one reading, and the picture is
// drawn. So the text and the 3D pages are always from the same moment.
//
// `shown` is false while the intro is in front: everything loads, nothing scrolls.
// `still` is only for scripts/capture-still.mjs, which photographs the empty open book.
export default function GardenScene({ shown, onFail, still = false }: { shown: boolean; onFail: () => void; still?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const flowersRef = useRef<HTMLDivElement>(null);
  const control = useRef<{ show: (on: boolean) => void; go: (page: number) => void; poke: (i: number) => void } | null>(null);
  const shownNow = useRef(shown);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(-1); // -1 while the book is closed
  const [found, setFound] = useState<number[]>([]);
  const [openSecret, setOpenSecret] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      const [{ build }, { pickQuality }, { default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
        import("./scene"),
        import("@/lib/quality"),
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      const canvas = canvasRef.current;
      const track = trackRef.current;
      const book = bookRef.current;
      const probe = probeRef.current;
      if (cancelled || !canvas || !track || !book || !probe) return;

      const quality = pickQuality();
      const spreads = collect(book);
      const flowers = Array.from(flowersRef.current?.querySelectorAll<HTMLElement>(".secret") ?? []);
      const screen = () => probe.offsetHeight || window.innerHeight;
      let plan = makePlan(screen(), stopsFor(false));
      let visible = false;
      let lastPage = -2;
      let progress = 0; // the one number everything follows: ScrollTrigger's reading of the track
      let view: View | null = null;
      let rig: SceneRig | null = null;

      // set the book and the text from the scroll reading
      const update = () => {
        if (!rig) return;
        const at = still ? { open: 1, page: 3, turn: 0, side: 1, stop: 0 } : locate(plan, visible ? progress * plan.total : 0);
        const v = (view = rig.set(at.open, at.page + leafOf(at.turn), at.side));
        place(spreads, v, at);
        flowers.forEach((el, i) => {
          const f = v.flowers[i];
          el.hidden = !f;
          if (!f) return;
          el.style.transform = `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px)`;
          el.style.setProperty("--r", `${Math.max(20, f.r).toFixed(1)}px`);
          el.dataset.h = f.x < canvas.clientWidth / 2 ? "right" : "left";
          el.dataset.v = f.y < canvas.clientHeight / 2 ? "below" : "above";
        });
        const now = at.open < 0.5 ? -1 : at.turn > 0.5 ? at.page + 1 : at.page;
        if (now !== lastPage) setPage((lastPage = now));
      };

      // the screen changed or something on a page changed size: size the type, lay the track out again
      const relayout = () => {
        if (!rig) return;
        const v = rig.view();
        setSizes(book, v, !v.wide);
        fit(spreads, v);
        forget(spreads);
        plan = makePlan(screen(), stopsFor(!v.wide));
        track.style.height = visible ? `${plan.total + screen()}px` : "0px";
        lenis?.resize();
        ScrollTrigger.refresh();
        update();
      };

      try {
        rig = build(canvas, quality, { onReady: () => setReady(true), onResize: () => relayout(), still });
      } catch {
        onFail(); // no WebGL here: the flat version takes over
        return;
      }
      gsap.registerPlugin(ScrollTrigger);

      // Lenis gives the scroll a little weight. It runs on GSAP's clock and tells
      // ScrollTrigger at once, so there is one scroll source and one timer.
      const lenis = quality.wind && !still ? new Lenis({ lerp: 0.085 }) : null;
      lenis?.on("scroll", ScrollTrigger.update);
      const trigger = ScrollTrigger.create({
        trigger: track,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          progress = self.progress;
        },
        onRefresh: (self) => {
          progress = self.progress;
        },
      });
      const tick = (time: number) => {
        lenis?.raf(time * 1000);
        update();
        rig?.frame(performance.now());
      };
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(relayout);
      });
      spreads.forEach((s) => {
        for (const el of [s.leftIn, s.rightIn]) if (el.firstElementChild) observer.observe(el.firstElementChild);
      });
      observer.observe(probe);
      // fonts arriving change how much fits
      void document.fonts?.ready.then(() => !cancelled && relayout());

      // The loose corner of the right-hand page lifts under the pointer or a finger.
      let dropCorner = 0;
      const overCorner = (e: PointerEvent) => {
        if (!view || !rig) return;
        const dx = e.clientX - view.hx;
        const dy = e.clientY - view.hy;
        const c = Math.cos(-view.rot);
        const s = Math.sin(-view.rot);
        const u = (dx * c - dy * s) / view.pw;
        const w = (dx * s + dy * c) / view.ph;
        const on = u > 0.8 && u < 1.04 && w > 0.84 && w < 1.03;
        rig.liftCorner(on);
        window.clearTimeout(dropCorner);
        // a finger does not hover: let the corner fall back by itself
        if (on && e.pointerType !== "mouse") dropCorner = window.setTimeout(() => rig?.liftCorner(false), 700);
      };
      if (quality.wind && !still) {
        window.addEventListener("pointermove", overCorner, { passive: true });
        window.addEventListener("pointerdown", overCorner, { passive: true });
      }

      control.current = {
        show: (on) => {
          visible = on;
          rig?.setActive(on);
          if (on) window.scrollTo(0, 0);
          relayout();
        },
        // the first stop of that spread
        go: (n) => {
          const y = plan.starts[plan.stops.findIndex((s) => s.page === n)] + 2;
          if (lenis) lenis.scrollTo(y, { duration: 1.4 });
          else window.scrollTo({ top: y, behavior: "smooth" });
        },
        poke: (i) => rig?.pokeFlower(i),
      };
      control.current.show(shownNow.current);
      if (still) {
        const v = rig.view();
        canvas.dataset.pages = JSON.stringify({ hx: v.hx, hy: v.hy, rot: v.rot, pw: v.pw, ph: v.ph, lw: v.lw });
      }

      cleanup = () => {
        control.current = null;
        observer.disconnect();
        cancelAnimationFrame(frame);
        window.clearTimeout(dropCorner);
        window.removeEventListener("pointermove", overCorner);
        window.removeEventListener("pointerdown", overCorner);
        trigger.kill();
        gsap.ticker.remove(tick);
        lenis?.destroy();
        rig?.dispose();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [onFail, still]);

  useEffect(() => {
    shownNow.current = shown;
    control.current?.show(shown);
  }, [shown]);

  const reveal = (i: number) => {
    control.current?.poke(i);
    setOpenSecret((o) => (o === i ? null : i));
    setFound((f) => (f.includes(i) ? f : [...f, i]));
  };

  return (
    <div className="garden" data-shown={shown} data-still={still}>
      <canvas ref={canvasRef} className="garden-canvas" data-ready={ready} aria-hidden="true" />
      <div ref={probeRef} className="screen-probe" />
      <div ref={trackRef} className="garden-track" />
      <BookContext value={{ flat: false, found, reveal }}>
        <Notebook ref={bookRef} />
      </BookContext>
      <div className="secrets-layer" ref={flowersRef}>
        {secrets.map((text, i) => (
          <div className="secret" key={text} hidden>
            <button type="button" aria-label={`Blue daisy ${i + 1}`} aria-expanded={openSecret === i} onClick={() => reveal(i)} />
            {openSecret === i && (
              <p className="secret-note" role="status">
                {text}
              </p>
            )}
          </div>
        ))}
      </div>
      {shown && <Tabs page={page} onGo={(n) => control.current?.go(n)} />}
      {shown && ready && page < 0 && <p className="tag garden-hint">{words.openHint}</p>}
    </div>
  );
}
