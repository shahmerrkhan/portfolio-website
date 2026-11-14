import { db, isAdmin, type NoteRow } from "@/lib/db";

// For /admin only: list every note, approve one, hide one again, or delete one.
// Every call must carry the password in the x-admin-password header.

const refuse = () => Response.json({ error: "wrong password" }, { status: 401 });

export async function GET(request: Request) {
  if (!process.env.ADMIN_PASSWORD) return Response.json({ error: "ADMIN_PASSWORD is not set" }, { status: 503 });
  if (!isAdmin(request)) return refuse();
  try {
    const sql = await db();
    if (!sql) return Response.json({ error: "DATABASE_URL is not set" }, { status: 503 });
    const notes = (await sql`
      select id, name, note, approved, created_at from guestbook_notes order by approved, created_at desc limit 500`) as NoteRow[];
    return Response.json({ notes: notes.map((n) => ({ ...n, id: Number(n.id) })) });
  } catch {
    return Response.json({ error: "the database did not answer" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return refuse();
  const { id, action } = (await request.json().catch(() => ({}))) as { id?: number; action?: string };
  if (!Number.isInteger(id)) return Response.json({ error: "which note?" }, { status: 400 });
  try {
    const sql = await db();
    if (!sql) return Response.json({ error: "DATABASE_URL is not set" }, { status: 503 });
    if (action === "approve") await sql`update guestbook_notes set approved = true where id = ${id}`;
    else if (action === "hide") await sql`update guestbook_notes set approved = false where id = ${id}`;
    else if (action === "delete") await sql`delete from guestbook_notes where id = ${id}`;
    else return Response.json({ error: "approve, hide or delete" }, { status: 400 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "the database did not answer" }, { status: 503 });
  }
}
