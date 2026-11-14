"use client";

import { useCallback, useEffect, useState } from "react";

type Note = { id: number; name: string; note: string; approved: boolean; created_at: string };

const KEY = "admin-password";

// Asks for the password, then lists the notes: waiting ones first.
// The password is checked by the server on every call and kept only for this tab.
export default function Admin() {
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async (pw: string) => {
    setMessage("");
    const res = await fetch("/api/guestbook/admin", { headers: { "x-admin-password": pw } }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) {
      setNotes(null);
      window.sessionStorage.removeItem(KEY);
      return setMessage(body?.error ?? "Could not reach the server.");
    }
    window.sessionStorage.setItem(KEY, pw);
    setNotes(body.notes);
  }, []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(KEY);
    if (!saved) return;
    // pick up where this tab left off
    queueMicrotask(() => {
      setPassword(saved);
      void load(saved);
    });
  }, [load]);

  const act = async (id: number, action: "approve" | "hide" | "delete") => {
    if (action === "delete" && !window.confirm("Delete this note for good?")) return;
    const res = await fetch("/api/guestbook/admin", {
      method: "POST",
      headers: { "x-admin-password": password, "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).catch(() => null);
    if (!res?.ok) return setMessage("That did not go through.");
    void load(password);
  };

  if (!notes) {
    return (
      <main className="admin">
        <h1>Guestbook notes</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(password);
          }}
        >
          <label>
            <span>password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          <button type="submit" className="tag">
            open
          </button>
        </form>
        <p role="status">{message}</p>
      </main>
    );
  }

  const waiting = notes.filter((n) => !n.approved);
  const showing = notes.filter((n) => n.approved);
  const list = (items: Note[]) => (
    <ul>
      {items.map((n) => (
        <li key={n.id}>
          <p>{n.note}</p>
          <span>
            {n.name}, {new Date(n.created_at).toLocaleString()}
          </span>
          <div>
            {n.approved ? (
              <button type="button" className="tag" onClick={() => act(n.id, "hide")}>
                hide
              </button>
            ) : (
              <button type="button" className="tag" onClick={() => act(n.id, "approve")}>
                approve
              </button>
            )}
            <button type="button" className="tag" onClick={() => act(n.id, "delete")}>
              delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="admin">
      <h1>Guestbook notes</h1>
      <p role="status">{message}</p>
      <h2>Waiting ({waiting.length})</h2>
      {waiting.length ? list(waiting) : <p>Nothing waiting.</p>}
      <h2>Showing in the book ({showing.length})</h2>
      {showing.length ? list(showing) : <p>None yet.</p>}
    </main>
  );
}
