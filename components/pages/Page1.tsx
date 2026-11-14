import { intro } from "@/content/site";
import Linked from "./Linked";

// Page 1: hello.
export function HiRight() {
  return (
    <div className="p-hi">
      <h1 className="hi-hello">{intro.greeting}</h1>
      <svg className="scribble" viewBox="0 0 200 14" aria-hidden="true">
        <path d="M3 9 C 30 2, 52 13, 80 7 S 128 3, 150 8 S 185 10, 197 5" />
      </svg>
      <p className="hi-line">{intro.line}</p>
      <p className="note kraft taped hi-work" style={{ "--tilt": "-3deg" } as React.CSSProperties}>
        <Linked>{intro.work}</Linked>
      </p>
    </div>
  );
}
