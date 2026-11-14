"use client";

import type { ComponentType, PointerEvent, Ref } from "react";
import { pages } from "@/content/site";
import type { Stop } from "@/lib/scrollPlan";
import { HiRight } from "./Page1";
import { StoryLeft, StoryRight } from "./Page2";
import { WorkLeft, WorkRight } from "./Page3";
import { BelieveLeft, BelieveRight } from "./Page4";
import { FunLeft, FunRight } from "./Page5";
import { GuestLeft, GuestRight } from "./Page6";
import { SecretsLeft, SecretsRight } from "./Page7";

// The seven places the book opens at, in the same order as `pages` in content/site.ts. Left is the left-hand page, right the right-hand
// one. The first has no left page: the inside of the cover is there.
// `title` marks a left page that only carries the page's name; on a tall screen, where
// one page is in view at a time, that page is skipped and the name goes on the right.
const SIDES: { Left?: ComponentType; Right: ComponentType; title?: boolean }[] = [
  { Right: HiRight },
  { Left: StoryLeft, Right: StoryRight, title: true },
  { Left: WorkLeft, Right: WorkRight },
  { Left: BelieveLeft, Right: BelieveRight },
  { Left: FunLeft, Right: FunRight },
  { Left: GuestLeft, Right: GuestRight },
  { Left: SecretsLeft, Right: SecretsRight, title: true },
];

// Where the book rests. With both pages in view: once per spread. With one page in
// view: on the left page (when it has something on it), then on the right.
export function stopsFor(single: boolean): Stop[] {
  return SIDES.flatMap(({ Left, title }, page): Stop[] =>
    single && Left && !title ? [{ page, side: 0 }, { page, side: 1 }] : [{ page, side: 1 }],
  );
}

// Paper that answers a touch: a taped note sways, a hung one swings, then settles.
function touch(e: PointerEvent) {
  const target = e.target as HTMLElement;
  const el = target.closest<HTMLElement>(".hung") ?? target.closest<HTMLElement>(".note:not(.slip)");
  if (!el || el.classList.contains("touched")) return;
  el.classList.add("touched");
  el.addEventListener("animationend", () => el.classList.remove("touched"), { once: true });
  // if motion is turned off no animation runs, so nothing would ever take the class off
  window.setTimeout(() => el.classList.remove("touched"), 1400);
}

// All the text, as real HTML. Whoever renders this moves the pieces onto the pages
// (see bind.ts); on its own it is just seven sections in reading order.
export default function Notebook({ ref, flat = false }: { ref: Ref<HTMLDivElement>; flat?: boolean }) {
  return (
    <div className="notebook" ref={ref} data-flat={flat} onPointerOver={touch} onPointerDown={touch}>
      {SIDES.map(({ Left, Right, title }, i) => (
        <section className="spread" key={pages[i].id} aria-label={`Page ${i + 1}: ${pages[i].name}`}>
          <div className={`side left${title ? " title-only" : ""}`}>
            <div className="inner">{Left && <Left />}</div>
          </div>
          <div className="side right">
            <div className="inner">
              <Right />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
