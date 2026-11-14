"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Notebook, { stopsFor } from "@/components/pages/Notebook";
import { collect, fit, forget, place, setSizes, type Geometry } from "@/components/pages/bind";
import { BookContext } from "@/components/pages/context";
import Tabs from "@/components/ui/Tabs";
import { words } from "@/content/site";
import type { Stop } from "@/lib/scrollPlan";
import still from "./still.json";

// The fallback for weak phones, for people who asked their device for less motion, and
// for browsers with no WebGL: one photograph of the garden with the book lying open,
// the same pages laid over it. No scroll tricks: buttons, the tabs or the arrow keys
// move through the book. Going to another spread fades the writing out and in; on a
// tall screen, going from the left page to the right slides the picture across.
//
// The photograph and still.json come from scripts/capture-still.mjs.

const MOVE_MS = 460;
const ease = (t: number) => t * t * (3 - 2 * t);

export default function FlatGarden({ shown, calm }: { shown: boolean; calm: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0); // which stop
  const [stops, setStops] = useState<Stop[]>(() => stopsFor(true));
  const [tall, setTall] = useState(true);
  const [found, setFound] = useState<number[]>([]);
  const state = useRef({ at: 0, moving: false, frame: 0, stops });
  // draws the book somewhere between stop `from` and the one after it (amount 0..1)
  const draw = useRef<(from: number, amount: number) => void>(() => {});

  useEffect(() => {
    const book = bookRef.current!;
    const img = imgRef.current!;
    const spreads = collect(book);
    let upright = true;

    // where the book is on screen, from where it is in the photograph
    const geometry = (side: number): Geometry => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const m = upright ? still.tall : still.wide;
      const focusW = upright ? m.pw : m.pw + m.lw;
      let s = Math.min(((upright ? 0.93 : 0.86) * vw) / focusW, ((upright ? 0.8 : 0.84) * vh) / m.ph);
      s = Math.max(s, vw / m.w, vh / m.h);
      const cx = upright ? m.hx + m.pw / 2 - (1 - side) * (m.pw + m.lw) * 0.5 : m.hx + (m.pw - m.lw) / 2;
      const cy = m.hy + m.ph / 2;
      const ox = Math.min(0, Math.max(vw - m.w * s, vw / 2 - cx * s));
      const oy = Math.min(0, Math.max(vh - m.h * s, vh / 2 - cy * s));
      img.style.width = `${m.w * s}px`;
      img.style.height = `${m.h * s}px`;
      img.style.transform = `translate(${ox}px, ${oy}px)`;
      const sizes = { pw: m.pw * s, ph: m.ph * s, lw: m.lw * s };
      return { hx: ox + m.hx * s, hy: oy + m.hy * s, rot: m.rot, ...sizes, rest: sizes };
    };

    draw.current = (from, amount) => {
      const list = state.current.stops;
      const a = list[from];
      const b = list[from + 1] ?? a;
      const g = geometry(a.side + (b.side - a.side) * ease(amount));
      place(spreads, g, { page: a.page, turn: b.page !== a.page ? amount : 0, open: 1 });
    };

    const layout = () => {
      upright = window.innerWidth / window.innerHeight <= 1.15;
      const next = stopsFor(upright);
      // keep the same spread open if the stops change with the screen's shape
      const spread = state.current.stops[state.current.at].page;
      state.current.stops = next;
      state.current.at = Math.max(0, next.findIndex((s) => s.page === spread));
      setTall(upright);
      setStops(next);
      setAt(state.current.at);
      const g = geometry(next[state.current.at].side);
      setSizes(book, g, upright);
      fit(spreads, g);
      forget(spreads);
      draw.current(state.current.at, 0);
    };
    layout();

    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const observer = new ResizeObserver(later);
    spreads.forEach((s) => {
      for (const el of [s.leftIn, s.rightIn]) if (el.firstElementChild) observer.observe(el.firstElementChild);
    });
    window.addEventListener("resize", later);
    void document.fonts?.ready.then(later);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", later);
    };
  }, []);

  const go = useCallback(
    (to: number) => {
      const s = state.current;
      to = Math.min(s.stops.length - 1, Math.max(0, to));
      if (s.moving || to === s.at) return;
      const from = s.at;
      const done = () => {
        s.moving = false;
        s.at = to;
        setAt(to);
        draw.current(to, 0);
      };
      // only a move to the stop next door is animated; a jump just lands
      if (calm || Math.abs(to - from) !== 1) return done();
      s.moving = true;
      const first = Math.min(from, to);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / MOVE_MS);
        if (t >= 1) return done();
        draw.current(first, to > from ? t : 1 - t);
        s.frame = requestAnimationFrame(step);
      };
      s.frame = requestAnimationFrame(step);
    },
    [calm],
  );

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(state.current.at + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(state.current.at - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, go]);

  useEffect(() => {
    const s = state.current;
    return () => cancelAnimationFrame(s.frame);
  }, []);

  const m = tall ? still.tall : still.wide;
  return (
    <div className="garden flat" data-shown={shown}>
      {/* eslint-disable-next-line @next/next/no-img-element -- sized and placed by hand to line up with the pages */}
      <img ref={imgRef} className="flat-photo" src={m.src} alt="" width={m.w} height={m.h} />
      <BookContext value={{ flat: true, found, reveal: (i) => setFound((f) => (f.includes(i) ? f : [...f, i])) }}>
        <Notebook ref={bookRef} flat />
      </BookContext>
      {shown && <Tabs page={stops[at]?.page ?? 0} onGo={(n) => go(stops.findIndex((s) => s.page === n))} />}
      {shown && (
        <div className="flat-turn">
          <button type="button" className="tag" onClick={() => go(at - 1)} disabled={at === 0}>
            {words.previous}
          </button>
          <button type="button" className="tag" onClick={() => go(at + 1)} disabled={at === stops.length - 1}>
            {words.next}
          </button>
        </div>
      )}
    </div>
  );
}
