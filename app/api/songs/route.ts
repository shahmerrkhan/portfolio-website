import { connection } from "next/server";
import { songs } from "@/content/site";
import { artistsOf, findPreview } from "@/lib/songs";

// The six songs on page 5, each with its cover and two places to play it from:
// `preview` is Apple's own 30 second file (AAC), `mp3` is the same song as an MP3
// through this site (see ./mp3/route.ts) for browsers that cannot play AAC.
// A song Apple does not have comes back with preview: null; the MP3 may still work.

export async function GET() {
  await connection();
  const found = await Promise.all(
    songs.map(async (s, i) => {
      const mp3 = `/api/songs/mp3?i=${i}`;
      try {
        return { ...s, ...(await findPreview(artistsOf(s), s.title)), mp3 };
      } catch {
        return { ...s, preview: null, art: null, mp3 };
      }
    }),
  );
  // never kept by a browser or a CDN: the list is cheap and the addresses in it can change
  return Response.json({ songs: found }, { headers: { "cache-control": "no-store" } });
}
