"use client";

import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore, type SubmitEvent, type KeyboardEvent, type ReactNode } from "react";
import { chatWords, commands, contactText, helpText, refusal, type Command } from "@/content/chat";
import { pages } from "@/content/site";
import { bookNav } from "@/lib/bookNav";
import { brain } from "@/lib/chat/brain";
import { command, suggest } from "@/lib/chat/match";

// The chat bubble, bottom left. It shows once the book is on screen (never during the
// intro) and answers questions about Shahmeer from the fixed list in content/chat.ts.
// The model behind it loads only when the bubble is first opened (lib/chat/brain.ts).

type Line = { from: "me" | "you"; text: string; answer?: string; by?: string };

const PHONE = "(max-width: 640px)";
const never = () => () => {};

// "/work" in a reply is a button that runs it; emails and site addresses are links.
const PIECES = /(\/[a-z]+\b|[\w.+-]+@[\w-]+\.[\w.]+[a-z]|\b(?:[a-z0-9-]+\.)+(?:com|org|co|ai|ca)(?:\/[\w\-/]*[\w\-])?)/g;
function Rich({ text, run }: { text: string; run: (c: Command) => void }) {
  const parts = text.split(PIECES);
  return parts.map((part, i): ReactNode => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    const cmd = part.startsWith("/") ? commands.find((c) => c.name === part.slice(1)) : undefined;
    if (cmd)
      return (
        <button key={i} type="button" className="chat-inline" onClick={() => run(cmd)}>
          {part}
        </button>
      );
    if (part.startsWith("/")) return <Fragment key={i}>{part}</Fragment>;
    const href = part.includes("@") ? `mailto:${part}` : `https://${part}`;
    return (
      <a key={i} href={href} target={part.includes("@") ? undefined : "_blank"} rel="noreferrer">
        {part}
      </a>
    );
  });
}

export default function ChatBubble() {
  const shown = useSyncExternalStore(bookNav.subscribe, bookNav.shown, () => false);
  const state = useSyncExternalStore(brain.subscribe, brain.state, () => "idle" as const);
  const phone = useSyncExternalStore(never, () => window.matchMedia(PHONE).matches, () => false);
  const [wantOpen, setOpen] = useState(false);
  const open = wantOpen && shown; // the bubble goes away with the book (back at the intro, say)
  const [lines, setLines] = useState<Line[]>([{ from: "me", text: chatWords.hello }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const panel = useRef<HTMLElement>(null);
  const listId = useId();

  const list = suggest(text);
  const listOpen = open && list.length > 0;

  // the newest line in view
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [lines, open]);

  // On a phone the keyboard covers the bottom of the screen; keep the panel above it.
  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.chat = "open";
    const vv = window.visualViewport;
    const fit = () => {
      if (!vv || !panel.current) return;
      const below = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      panel.current.style.setProperty("--kb", `${below}px`);
      panel.current.style.setProperty("--vh", `${vv.height}px`);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      delete document.documentElement.dataset.chat;
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      brain.start(); // the first open is what downloads the model
      // a phone keyboard would cover half the book the moment it opens: let them tap in
      if (!window.matchMedia("(pointer: coarse)").matches) requestAnimationFrame(() => input.current?.focus());
    }
    setOpen(!open);
  };

  const say = (...add: Line[]) => setLines((l) => [...l, ...add]);

  const run = (c: Command) => {
    setText("");
    setPick(0);
    const you: Line = { from: "you", text: `/${c.name}` };
    if (c.action === "help") return say(you, { from: "me", text: helpText });
    if (c.action === "contact") return say(you, { from: "me", text: contactText, answer: "contact" });
    say(you, { from: "me", text: chatWords.turning(pages[c.page!].name) });
    bookNav.go(c.page!);
    // on a phone the panel would hide the page it just turned to
    if (window.matchMedia(PHONE).matches) {
      input.current?.blur();
      setOpen(false);
    }
  };

  const send = async (e?: SubmitEvent) => {
    e?.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    const c = command(q);
    if (c && "unknown" in c) {
      // a half-typed command with one match left: run that one
      if (listOpen) return run(list[Math.min(pick, list.length - 1)]);
      setText("");
      return say({ from: "you", text: q }, { from: "me", text: chatWords.unknownCommand(c.unknown) });
    }
    if (c) return run(c);
    setText("");
    say({ from: "you", text: q });
    setBusy(true);
    const r = await brain.ask(q);
    setBusy(false);
    say(r.kind === "answer" ? { from: "me", text: r.answer.say, answer: r.answer.id, by: r.by } : { from: "me", text: refusal, answer: "refuse", by: r.why });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (listOpen) setText("");
      else setOpen(false);
      return;
    }
    if (!listOpen) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setPick((p) => (p + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      setText(`/${list[Math.min(pick, list.length - 1)].name}`);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const exact = command(text);
      run(exact && !("unknown" in exact) ? exact : list[Math.min(pick, list.length - 1)]);
    }
  };

  return (
    <div className="chat" data-shown={shown} data-open={open} aria-hidden={!shown}>
      {open && (
        <section className="chat-panel" ref={panel} id="chat-panel" aria-label="Chat with Shahmeer" data-lenis-prevent data-phone={phone}>
          <header className="chat-head">
            <h2>ask me</h2>
            {state === "warming" && (
              <span className="chat-warming" role="status">
                {chatWords.warming}
              </span>
            )}
            <button type="button" className="chat-close" aria-label={chatWords.close} onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <ol className="chat-log" ref={log} aria-live="polite">
            {lines.map((l, i) => (
              <li key={i} data-from={l.from} data-answer={l.answer} data-by={l.by}>
                <span className="chat-who">{l.from === "me" ? chatWords.me : chatWords.you}</span>
                <p>{l.from === "me" ? <Rich text={l.text} run={run} /> : l.text}</p>
              </li>
            ))}
            {busy && (
              <li data-from="me" className="chat-thinking" aria-label="thinking">
                <span className="chat-who">{chatWords.me}</span>
                <p>...</p>
              </li>
            )}
          </ol>
          {listOpen && (
            <ul className="chat-commands" id={listId} role="listbox" aria-label="Commands">
              {list.map((c, i) => (
                <li key={c.name} role="option" aria-selected={i === pick}>
                  {/* mousedown, not click: the input keeps focus, so a phone keyboard stays up */}
                  <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => run(c)}>
                    <span className="chat-cmd">/{c.name}</span>
                    <span className="chat-cmd-line">{c.line}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="chat-form" onSubmit={send}>
            <input
              ref={input}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPick(0);
              }}
              onKeyDown={onKey}
              placeholder={chatWords.placeholder}
              aria-label={chatWords.placeholder}
              aria-autocomplete="list"
              aria-controls={listOpen ? listId : undefined}
              aria-expanded={listOpen}
              role="combobox"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="send"
              maxLength={200}
            />
            <button type="submit" className="chat-send" disabled={!text.trim() || busy}>
              {chatWords.send}
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="chat-button"
        aria-label={open ? chatWords.close : chatWords.open}
        aria-expanded={open}
        aria-controls="chat-panel"
        tabIndex={shown ? 0 : -1}
        onClick={toggle}
      >
        {open ? "×" : "?"}
      </button>
    </div>
  );
}
