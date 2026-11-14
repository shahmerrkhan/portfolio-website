"use client";

import { useState } from "react";
import { contact } from "@/content/site";

export default function ContactButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="contact">
      {open && (
        <ul className="contact-list" id="contact-list">
          <li>
            <a
              className="tag"
              href={contact.linkedin}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </li>
          <li>
            <a className="tag" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </li>
          <li>
            <a
              className="tag"
              href={contact.github}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </li>
        </ul>
      )}
      <button
        type="button"
        className="tag"
        aria-expanded={open}
        aria-controls="contact-list"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "close" : "contact"}
      </button>
    </div>
  );
}
