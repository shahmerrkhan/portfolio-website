"use client";

import { useEffect, useState } from "react";
import {
  contact,
  experience,
  projects,
  words,
  type Experience,
} from "@/content/site";
import Linked from "./Linked";

// Page 3: projects on the left, all of the experience on the right.
// The GitHub graph is on the next left-hand page (see Page4).

const PAPERS = ["legal", "blue", "ruled", "pink"];
const FIXINGS = ["taped", "pinned", "taped", "pinned"];
const TILTS = ["-1.6deg", "1.8deg", "-1deg", "2.2deg"];

export function WorkLeft() {
  return (
    <div className="p-work">
      <h2 className="heading">{words.projects}</h2>
      <ul className="projects">
        {projects.map((p, i) => (
          <li
            key={p.name}
            className={`note ${PAPERS[i % 4]} ${FIXINGS[i % 4]}${i === 0 ? " lead" : ""}`}
            style={{ "--tilt": TILTS[i % 4] } as React.CSSProperties}
          >
            <h3>
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                {p.name}
              </a>
            </h3>
            {p.label && <span className="silver">{p.label}</span>}
            <p>
              <Linked>{p.line}</Linked>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// the two strings and the pin a small note hangs from
function Hanger() {
  return (
    <svg
      className="hanger"
      viewBox="0 0 120 34"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path d="M8 33 Q 34 20 60 5 Q 86 20 112 33" />
      <circle cx="60" cy="5" r="4.2" />
    </svg>
  );
}

type Graph = { ok: true; total: number; weeks: number[][] } | { ok: false };

// a square drawn a little off true, the same way every time
function wobble(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 1.5;
}
const INKS = ["none", "#b7cd96", "#84ab5e", "#4c8739", "#2a5f25"];
const WEEKS = 26;

export function GitHubGraph() {
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/github")
      .then((r) => r.json())
      .then((g: Graph) => live && setGraph(g))
      .catch(() => live && setGraph({ ok: false }));
    return () => {
      live = false;
    };
  }, []);

  if (graph && !graph.ok) {
    return (
      <p className="quiet">
        {words.githubDown}{" "}
        <a href={contact.github} target="_blank" rel="noreferrer">
          @{contact.githubUser}
        </a>
      </p>
    );
  }
  const weeks = graph ? graph.weeks.slice(-WEEKS) : [];
  return (
    <>
      <svg
        className="squares"
        viewBox={`0 0 ${WEEKS * 13 + 2} 94`}
        role="img"
        aria-label={
          graph ? words.githubTotal(graph.total) : "GitHub contributions"
        }
      >
        {weeks.map((days, w) =>
          days.map((level, d) => {
            const n = w * 7 + d;
            const x = 2 + w * 13;
            const y = 2 + d * 13;
            const j = (k: number) => wobble(n * 8 + k).toFixed(2);
            return (
              <path
                key={n}
                d={`M${x + +j(0)} ${y + +j(1)} L${x + 10 + +j(2)} ${y + +j(3)} L${x + 10 + +j(4)} ${y + 10 + +j(5)} L${x + +j(6)} ${y + 10 + +j(7)} Z`}
                fill={INKS[level] ?? "none"}
              />
            );
          }),
        )}
      </svg>
      <p className="quiet">
        {graph ? words.githubTotal(graph.total) + ", " : ""}
        <a href={contact.github} target="_blank" rel="noreferrer">
          @{contact.githubUser}
        </a>
      </p>
    </>
  );
}

// How many experience notes fit on one phone page at a readable size. On a tall screen
// the rest carry on at the top of the next page, under the same heading (see Page4).
// On a wide screen all of them are on the one page.
export const JOBS_FIRST = 3;

export function Jobs({
  list,
  from = 0,
  split = false,
}: {
  list: Experience[];
  from?: number;
  split?: boolean;
}) {
  return (
    <ul className="jobs">
      {list.map((e, k) => {
        const i = from + k;
        return (
          <li
            key={e.name}
            className={`hung${split && i >= JOBS_FIRST ? " wide-only" : ""}`}
            style={
              {
                "--tilt": ["1.2deg", "-1.5deg", "0.9deg"][i % 3],
              } as React.CSSProperties
            }
          >
            <Hanger />
            <div className={`note small ${["plain", "legal", "blue"][i % 3]}`}>
              <div className="job-head">
                <h3>
                  <Linked>{e.name}</Linked>
                  {e.tag && <span className="job-tag"> {e.tag}</span>}
                </h3>
                {e.logo && (
                  // eslint-disable-next-line @next/next/no-img-element -- a small logo file, shown as it came
                  <img
                    className="logo"
                    data-wide={!!e.logo.wide}
                    src={e.logo.src}
                    alt=""
                  />
                )}
              </div>
              {e.role && (
                <span className="role">
                  {e.current ? `${words.current}, ` : ""}
                  {e.role}
                </span>
              )}
              {(e.when || e.where) && (
                <span className="when">
                  {[e.when, e.where].filter(Boolean).join(" · ")}
                </span>
              )}
              <p>
                <Linked>{e.line}</Linked>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function WorkRight() {
  return (
    <div className="p-work">
      <h2 className="heading">{words.experience}</h2>
      <Jobs list={experience} split />
    </div>
  );
}
