import { beliefs, experience, words } from "@/content/site";
import { GitHubGraph, Jobs, JOBS_FIRST } from "./Page3";

// Page 4: what I believe, on the right. Its left-hand page finishes page 3 with the
// GitHub graph. On a tall screen, where one page holds less, the experience list
// also carries on here first, under its own heading.
export function BelieveLeft() {
  return (
    <div className="p-work">
      <div className="only-single">
        <h2 className="heading">{words.experience}</h2>
        <Jobs list={experience.slice(JOBS_FIRST)} from={JOBS_FIRST} />
      </div>
      <h2 className="heading">{words.github}</h2>
      <GitHubGraph />
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
    </div>
  );
}
