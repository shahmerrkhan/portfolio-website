import type { View } from "@/components/scene/scene";
import { inkArriving, inkLeaving } from "@/lib/scrollPlan";

// Lays the real text over the pages. Used by the 3D garden (which measures where the
// pages are every frame) and by the flat fallback (which works it out from a picture).
//
// A spread is what you see with the book open at one place. Its left side sits on the
// left-hand page and its right side on the right-hand page, always: each piece is glued
// to one flat sheet of paper and gets exactly that sheet's position, turn and size.
// Nothing is ever drawn on a leaf while it is in the air: the writing fades off before
// the leaf lifts and the next spread's writing fades in after it has landed.

export type Geometry = Pick<View, "hx" | "hy" | "rot" | "pw" | "ph" | "lw" | "rest">;

export type Show = {
  page: number; // the spread in view, or being left
  turn: number; // 0..1 through the turn to the next spread
  open: number; // 0..1, the cover
};

export type Spread = {
  root: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  leftIn: HTMLElement;
  rightIn: HTMLElement;
  was: string; // the last thing written to its style, so nothing is rewritten for no reason
};

export function collect(book: HTMLElement): Spread[] {
  return Array.from(book.querySelectorAll<HTMLElement>(".spread")).map((root) => {
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    return { root, left: q(".side.left"), right: q(".side.right"), leftIn: q(".side.left > .inner"), rightIn: q(".side.right > .inner"), was: "" };
  });
}

export function setSizes(book: HTMLElement, g: Geometry, single: boolean) {
  book.style.setProperty("--pw", `${g.rest.pw.toFixed(1)}px`);
  book.style.setProperty("--ph", `${g.rest.ph.toFixed(1)}px`);
  book.style.setProperty("--lw", `${g.rest.lw.toFixed(1)}px`);
  book.dataset.single = String(single); // one page in view at a time (tall screens)
}

// The type is sized from the page, so a page looks the same at every screen size. If a
// page still holds more than fits, its type is made smaller, a step at a time, until it
// does. Nothing is ever allowed to run past the paper.
const SMALLEST = 0.58;
function fitOne(inner: HTMLElement, height: number) {
  const fits = (k: number) => {
    inner.style.setProperty("--fit", k.toFixed(3));
    return inner.scrollHeight <= height + 0.5;
  };
  let k = 1;
  if (!fits(1)) {
    let lo = SMALLEST;
    let hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    k = lo;
    fits(k);
  }
  inner.dataset.fit = k.toFixed(2);
}

export function fit(spreads: Spread[], g: Geometry) {
  for (const s of spreads) {
    fitOne(s.leftIn, g.rest.ph);
    fitOne(s.rightIn, g.rest.ph);
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function place(spreads: Spread[], g: Geometry, show: Show) {
  const k = g.pw / g.rest.pw;
  const turn = `rotate(${g.rot}rad) scale(${k.toFixed(5)})`;
  const right = `translate(${g.hx.toFixed(2)}px, ${g.hy.toFixed(2)}px) ${turn}`;
  const left = `translate(${(g.hx - g.rest.lw).toFixed(2)}px, ${g.hy.toFixed(2)}px) ${turn}`;
  spreads.forEach((s, i) => {
    let ink = 0;
    if (i === show.page) ink = inkLeaving(show.turn) * (i === 0 ? smooth(0.72, 0.97, show.open) : 1);
    else if (i === show.page + 1) ink = inkArriving(show.turn);
    const now = ink <= 0.001 ? "gone" : `${right}|${ink.toFixed(3)}`;
    if (now === s.was) return;
    s.was = now;
    if (ink <= 0.001) {
      s.root.style.visibility = "hidden";
      s.left.style.willChange = s.right.style.willChange = ""; // a page out of view keeps no layer of its own
      return;
    }
    if (s.root.style.visibility !== "visible") {
      s.root.style.visibility = "visible";
      s.left.style.willChange = s.right.style.willChange = "transform, opacity";
    }
    s.root.style.pointerEvents = ink > 0.6 ? "" : "none";
    s.right.style.transform = right;
    s.left.style.transform = left;
    s.right.style.opacity = s.left.style.opacity = ink >= 0.999 ? "" : ink.toFixed(3);
  });
}

// after a resize every piece has to be written again
export function forget(spreads: Spread[]) {
  for (const s of spreads) s.was = "";
}
