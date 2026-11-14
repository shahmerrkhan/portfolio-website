"use client";

import { pages } from "@/content/site";

// Paper tabs along the top: which page is open, and a way to jump to another.
export default function Tabs({ page, onGo }: { page: number; onGo: (page: number) => void }) {
  return (
    <nav className="tabs" aria-label="Pages">
      {pages.map((p, i) => (
        <button key={p.id} type="button" aria-current={page === i ? "page" : undefined} aria-label={`Page ${i + 1}: ${p.name}`} onClick={() => onGo(i)}>
          <span className="tab-number">{i + 1}</span>
          <span className="tab-word">{p.tab}</span>
        </button>
      ))}
    </nav>
  );
}
