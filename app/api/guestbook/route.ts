import { connection } from "next/server";
import { db, senderOf, type NoteRow } from "@/lib/db";

// The guestbook on page 6. Anyone can read the approved notes and leave a new one.
// A new note stays hidden until it is approved on /admin.

const PER_HOUR = 3; // notes one sender may leave in an hour
const WAITING_MAX = 300; // stop taking notes if this many are waiting to be read

export async function GET() {
  await connection(); // always asked fresh, never baked into the build
  try {
    const sql = await db();
    if (!sql) return Response.json({ ready: false, notes: [] });
    const notes = (await sql`
      select id, name, note from guestbook_notes where approved order by created_at desc limit 40`) as NoteRow[];
    return Response.json({ ready: true, notes: notes.map((n) => ({ id: Number(n.id), name: n.name, note: n.note })) });
  } catch {
    return Response.json({ ready: false, notes: [] });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 280) : "";
  if (!name || !note) return Response.json({ error: "name and note needed" }, { status: 400 });
  // the hidden "website" box: people never see it, scripts fill it in. Say thanks, keep nothing.
  if (typeof body.website === "string" && body.website) return Response.json({ ok: true });

  try {
    const sql = await db();
    if (!sql) return Response.json({ error: "no database" }, { status: 503 });
    const sender = senderOf(request);
    const [counts] = (await sql`
      select
        count(*) filter (where sender = ${sender} and created_at > now() - interval '1 hour') as mine,
        count(*) filter (where not approved) as waiting
      from guestbook_notes`) as { mine: string; waiting: string }[];
    if (Number(counts.mine) >= PER_HOUR || Number(counts.waiting) >= WAITING_MAX) {
      return Response.json({ error: "slow down" }, { status: 429 });
    }
    await sql`insert into guestbook_notes (name, note, sender) values (${name}, ${note}, ${sender})`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "database trouble" }, { status: 503 });
  }
}
