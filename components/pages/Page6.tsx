"use client";

import { useEffect, useRef, useState } from "react";
import { contact, words } from "@/content/site";

// Page 6: guestbook. Notes people left on the left, the slip to write one on the right.

type Note = { id: number; name: string; note: string };
type Book = { ready: boolean; notes: Note[] };

const PAPERS = ["legal", "pink", "blue", "plain"];
const SHOWN = 5; // the newest few; more than this would not fit on the page at a readable size

export function GuestLeft() {
  const [book, setBook] = useState<Book | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/guestbook")
      .then((r) => r.json())
      .then((b: Book) => live && setBook(b))
      .catch(() => live && setBook({ ready: false, notes: [] }));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="p-guest">
      <h2 className="heading">{words.guestbook}</h2>
      {book && book.notes.length === 0 && book.ready && <p className="quiet">{words.guestbookEmpty}</p>}
      <ul className="guest-notes">
        {book?.notes.slice(0, SHOWN).map((n, i) => (
          <li key={n.id} className={`note small ${PAPERS[i % 4]} ${i % 2 ? "pinned" : "taped"}`} style={{ "--tilt": `${((i * 5) % 5) - 2}deg` } as React.CSSProperties}>
            <p>{n.note}</p>
            <span className="signed">{n.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type State = "idle" | "sending" | "sent" | "down" | "slow" | "short";

export function GuestRight() {
  const [state, setState] = useState<State>("idle");
  const timer = useRef(0);

  // a message stays a few seconds, or until the next key
  const say = (next: State) => {
    window.clearTimeout(timer.current);
    setState(next);
    if (next !== "idle" && next !== "sending") timer.current = window.setTimeout(() => setState("idle"), next === "sent" ? 7000 : 4500);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // The browser's own "fill in this field" bubble is switched off (noValidate):
  // it would hang on screen over the garden. The check and the message are ours.
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.elements.namedItem("name") as HTMLInputElement;
    const note = form.elements.namedItem("note") as HTMLTextAreaElement;
    const empty = !name.value.trim() ? name : !note.value.trim() ? note : null;
    if (empty) {
      empty.focus({ preventScroll: true });
      return say("short");
    }
    say("sending");
    try {
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (res.ok) {
        form.reset();
        say("sent");
      } else say(res.status === 429 ? "slow" : res.status === 400 ? "short" : "down");
    } catch {
      say("down");
    }
  };

  const message = {
    idle: "",
    sending: "",
    sent: words.guestbookThanks,
    down: words.guestbookDown,
    slow: words.guestbookSlow,
    short: words.guestbookShort,
  }[state];

  return (
    <form
      className="p-guest slip note plain taped"
      noValidate
      onSubmit={send}
      onInput={() => state !== "idle" && state !== "sending" && say("idle")}
      style={{ "--tilt": "0.8deg" } as React.CSSProperties}
    >
      <p className="ask">{words.guestbookAsk}</p>
      <label>
        <span>{words.guestbookName}</span>
        <input name="name" maxLength={40} autoComplete="name" />
      </label>
      <label>
        <span>{words.guestbookNote}</span>
        <textarea name="note" maxLength={280} rows={3} />
      </label>
      {/* left empty by people, filled in by scripts */}
      <label className="sr-only" aria-hidden="true">
        website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <button type="submit" className="tag" disabled={state === "sending"}>
        {state === "sending" ? words.guestbookSending : words.guestbookSend}
      </button>
      <p className="slip-says" role="status" data-kind={state}>
        {message && (
          <span key={state}>
            {message} {state === "down" && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
          </span>
        )}
      </p>
    </form>
  );
}
