"use client";

import { secrets, words } from "@/content/site";
import { useBook } from "./context";

// Page 7: garden secrets. In the garden the blue daisies around the book hold them and
// this page keeps the ones found so far. In the flat fallback there is no garden to
// click in, so the flowers drawn here are the buttons.

function Daisy({ found }: { found: boolean }) {
  return (
    <svg className="daisy" data-found={found} viewBox="-20 -20 40 40" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <ellipse key={i} cx="0" cy="-11.5" rx="3.6" ry="7.2" transform={`rotate(${i * 40 + (i % 2) * 5})`} />
      ))}
      <circle r="4.6" />
    </svg>
  );
}

export function SecretsLeft() {
  return (
    <div className="p-title">
      <h2 className="title">{words.secrets}</h2>
    </div>
  );
}

export function SecretsRight() {
  const { flat, found, reveal } = useBook();
  return (
    <div className="p-secrets">
      <h2 className="title only-single">{words.secrets}</h2>
      <p className="hint">{flat ? words.secretsHintFlat : words.secretsHint}</p>
      <ol>
        {secrets.map((s, i) => {
          const has = found.includes(i);
          return (
            <li key={s}>
              {flat && !has ? (
                <button type="button" onClick={() => reveal(i)} aria-label={`Flower ${i + 1}: show the secret`}>
                  <Daisy found={false} />
                </button>
              ) : (
                <Daisy found={has} />
              )}
              <span data-found={has}>{has ? s : "?"}</span>
            </li>
          );
        })}
      </ol>
      <p className="quiet" role="status">
        {words.secretsCount(found.length, secrets.length)}
      </p>
    </div>
  );
}
