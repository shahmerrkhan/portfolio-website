import { createHash, timingSafeEqual } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// The guestbook's database (Neon Postgres). Without DATABASE_URL there is no
// database and every caller gets null, which the pages show as a quiet note.

export type Sql = NeonQueryFunction<false, false>;
export type NoteRow = { id: number; name: string; note: string; approved: boolean; created_at: string };

let ready: Promise<unknown> | null = null;

export async function db(): Promise<Sql | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const sql = neon(url);
  // make the table the first time anything asks for it
  ready ??= sql`
    create table if not exists guestbook_notes (
      id bigserial primary key,
      name text not null,
      note text not null,
      approved boolean not null default false,
      sender text,
      created_at timestamptz not null default now()
    )`;
  try {
    await ready;
  } catch (e) {
    ready = null;
    throw e;
  }
  return sql;
}

// who sent a note, kept only as a scrambled value so a flood from one place can be slowed
export function senderOf(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  return createHash("sha256").update(`guestbook:${ip}:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex").slice(0, 32);
}

export function isAdmin(request: Request) {
  const want = process.env.ADMIN_PASSWORD;
  const got = request.headers.get("x-admin-password");
  if (!want || !got) return false;
  const a = createHash("sha256").update(want).digest();
  const b = createHash("sha256").update(got).digest();
  return timingSafeEqual(a, b);
}
