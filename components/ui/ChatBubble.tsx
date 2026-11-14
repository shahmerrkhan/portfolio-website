"use client";

import { useState } from "react";

// Placeholder only. There is no AI behind this yet.
export default function ChatBubble() {
  const [open, setOpen] = useState(false);

  return (
    <div className="chat">
      {open && (
        <p className="chat-note" id="chat-note" role="status">
          coming soon
        </p>
      )}
      <button
        type="button"
        className="chat-button"
        aria-label="Chat (coming soon)"
        aria-expanded={open}
        aria-controls="chat-note"
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
    </div>
  );
}
