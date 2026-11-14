import { cacheLife } from "next/cache";

// Finds Apple's official 30 second preview for a song.
// Apple does not have one for every track in every country; those come back null.

type Track = { artistName: string; trackName: string; previewUrl?: string; artworkUrl100?: string };

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

// Looked up once a day per song; a failed try is not remembered.
// `artists` is everyone on the song: Apple files a shared track under only one of them.
export async function findPreview(artists: string[], title: string) {
  "use cache";
  cacheLife("days");
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${artists.join(" ")} ${title}`)}&entity=song&limit=15&country=CA`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apple answered ${res.status}`);
  const tracks: Track[] = (await res.json()).results ?? [];
  const mine = tracks.filter((t) => t.previewUrl && artists.some((a) => plain(t.artistName).includes(plain(a))));
  const want = plain(title);
  // the exact title first, then one that starts with it ("Cameras / Good Ones Go Interlude")
  const hit = mine.find((t) => plain(t.trackName) === want) ?? mine.find((t) => plain(t.trackName).startsWith(want));
  return { preview: hit?.previewUrl ?? null, art: hit?.artworkUrl100 ?? null };
}

// The same song as a 30 second MP3, from Deezer's public search (no key). Used when a
// browser cannot play Apple's AAC file. Never the wrong song: the artist must be one of
// ours and the title must be the same, or ours followed only by a bracket or a slash
// ("Flocky Flocky (feat. Travis Scott)"), and never a live, remix or cover version.
// Not remembered: Deezer's preview addresses stop working after a while.
type DeezerTrack = { title: string; artist: { name: string }; preview?: string };

export async function findMp3(artists: string[], title: string) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(`${artists[0]} ${title}`)}&limit=20`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Deezer answered ${res.status}`);
  const tracks: DeezerTrack[] = (await res.json()).data ?? [];
  const want = plain(title);
  const mine = tracks.filter((t) => t.preview && artists.some((a) => plain(t.artist.name).includes(plain(a))));
  const exact = mine.find((t) => plain(t.title) === want);
  const close = mine.find((t) => {
    const rest = t.title.toLowerCase().slice(title.length).trim();
    return plain(t.title).startsWith(want) && /^[(/[]/.test(rest) && !/live|remix|cover|karaoke|instrumental|version|edit/.test(rest);
  });
  return (exact ?? close)?.preview ?? null;
}

export const artistsOf = (s: { artist: string; featuring?: string }) => (s.featuring ? [s.artist, s.featuring] : [s.artist]);
