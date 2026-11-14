import { songs } from "@/content/site";
import { artistsOf, findMp3 } from "@/lib/songs";

// One song's 30 second preview as an MP3, found on Deezer and passed through from here.
// It goes through this site because Deezer's files cannot be fetched from a page on
// another address, and so the lookup needs no key in the browser. Only the six songs
// in content/site.ts can be asked for, by number. Byte ranges are passed along,
// because Safari will not play audio without them. Deezer's file addresses
// stop working after a while, so they are never remembered: each request looks the song
// up again. Only the sound itself may be kept, by the visitor's own browser, for ten
// minutes. It runs on the normal Node.js runtime and asks Deezer directly, so it works
// the same on Vercel as on a laptop.

export async function GET(request: Request) {
  const i = Number(new URL(request.url).searchParams.get("i"));
  const song = Number.isInteger(i) ? songs[i] : undefined;
  if (!song) return new Response("no such song", { status: 404 });
  try {
    const preview = await findMp3(artistsOf(song), song.title);
    if (!preview) return new Response("no preview", { status: 404 });
    const range = request.headers.get("range");
    const deezer = await fetch(preview, { headers: range ? { range } : {}, cache: "no-store" });
    if (!deezer.ok || !deezer.body) return new Response("preview unavailable", { status: 502 });
    const headers = new Headers({ "content-type": "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, max-age=600" });
    for (const name of ["content-length", "content-range"]) {
      const value = deezer.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(deezer.body, { status: deezer.status, headers });
  } catch {
    return new Response("preview unavailable", { status: 502 });
  }
}
