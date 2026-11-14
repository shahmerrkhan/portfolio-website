// Turns "how far has the visitor scrolled" into "what is the book doing".
// The scroll track is cut into stretches: one that opens the cover, then a stretch to
// read each stop, with a stretch between stops that either turns a leaf or (on a tall
// screen, where only one page fits) slides the camera from the left page to the right.
//
// Everything the book and the text do is worked out from this one number, so they
// cannot drift apart however fast or in whichever direction the scrolling goes.

// A place the book rests at: which spread is open and which of its two pages is in view.
export type Stop = { page: number; side: 0 | 1 };

type Stretch = { kind: "rest" | "slide" | "turn"; start: number; length: number; from: number };

export type Plan = {
  open: number; // pixels of scrolling that open the cover
  stops: Stop[];
  starts: number[]; // where each stop's rest begins
  stretches: Stretch[];
  total: number;
};

export type Place = {
  open: number; // 0..1
  page: number; // the spread in view, or being left while its leaf turns
  turn: number; // 0..1 through the whole turn, fades included
  side: number; // 0 over the left page .. 1 over the right
  stop: number; // the stop we are at, or nearest to
};

// A turn has three parts: the writing fades off the page, the blank leaf goes over,
// the writing of the next spread fades in. FADE is the share of the turn each fade takes.
export const FADE = 0.15;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
export const leafOf = (turn: number) => clamp((turn - FADE) / (1 - 2 * FADE)); // how far the leaf itself has gone
export const inkLeaving = (turn: number) => 1 - ease(clamp(turn / FADE)); // how dark the writing being left is
export const inkArriving = (turn: number) => ease(clamp((turn - (1 - FADE)) / FADE));

export function makePlan(screen: number, stops: Stop[]): Plan {
  const open = screen * 0.9;
  const stretches: Stretch[] = [];
  const starts: number[] = [];
  let at = open;
  stops.forEach((stop, i) => {
    starts.push(at);
    stretches.push({ kind: "rest", start: at, length: screen * 0.5, from: i });
    at += screen * 0.5;
    const next = stops[i + 1];
    if (!next) return;
    const turn = next.page !== stop.page;
    const length = screen * (turn ? 1 : 0.6);
    stretches.push({ kind: turn ? "turn" : "slide", start: at, length, from: i });
    at += length;
  });
  return { open, stops, starts, stretches, total: at };
}

export function locate(plan: Plan, y: number): Place {
  const first = plan.stops[0];
  if (y < plan.open) return { open: Math.max(0, y / plan.open), page: first.page, turn: 0, side: first.side, stop: 0 };
  const s = plan.stretches.find((x) => y < x.start + x.length) ?? plan.stretches[plan.stretches.length - 1];
  const a = plan.stops[s.from];
  if (s.kind === "rest") return { open: 1, page: a.page, turn: 0, side: a.side, stop: s.from };
  const b = plan.stops[s.from + 1];
  const f = clamp((y - s.start) / s.length);
  if (s.kind === "slide") {
    return { open: 1, page: a.page, turn: 0, side: a.side + (b.side - a.side) * ease(f), stop: f < 0.5 ? s.from : s.from + 1 };
  }
  // the camera crosses over while the leaf is in the air
  return { open: 1, page: a.page, turn: f, side: a.side + (b.side - a.side) * ease(leafOf(f)), stop: f < 0.5 ? s.from : s.from + 1 };
}
