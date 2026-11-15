import { beliefs, experience, words } from "@/content/site";
import { GitHubGraph, Jobs, JOBS_FIRST } from "./Page3";

// Page 4. Its left-hand page carries on the experience list from page 3, under the same
// heading: six notes do not fit on one page at a size anyone can read. On the right,
// what I believe, with the GitHub graph under it.
export function BelieveLeft() {
  return (
    <div className="p-work">
      <h2 className="heading">{words.experience}</h2>
      <Jobs list={experience.slice(JOBS_FIRST)} from={JOBS_FIRST} />
    </div>
  );
}

export function BelieveRight() {
  return (
    <div className="p-believe">
      <h2 className="title">{words.beliefs}</h2>
      <ul>
        {beliefs.map((b, i) => (
          <li key={b} style={{ "--tilt": ["-1.5deg", "1deg", "-0.6deg", "1.6deg"][i % 4] } as React.CSSProperties}>
            {b}
          </li>
        ))}
      </ul>
      <h2 className="heading">{words.github}</h2>
      <GitHubGraph />
    </div>
  );
}
