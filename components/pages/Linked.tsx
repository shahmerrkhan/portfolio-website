import { Fragment } from "react";
import { links } from "@/content/site";

// Text with the names listed in content/site.ts `links` turned into real links.
// Only the name itself is the link: in "Magic Hour (YC W24)" the bracket stays plain text.
const names = Object.keys(links).sort((a, b) => b.length - a.length);
const splitter = new RegExp(`(${names.join("|")})`, "g"); // the names are plain words, nothing to escape

export default function Linked({ children }: { children: string }) {
  return (
    <>
      {children.split(splitter).map((part, i) =>
        links[part] ? (
          <a key={i} href={links[part]} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
