# Portfolio plan (approved 2026-11-13)

Personal portfolio for Shahmeer Khan. This file is the source of truth for decisions and content.
All text under "Content" is the owner's own wording. Do not add facts that are not here: ask.

## Working rules

- Start every reply with "Shahmeer".
- The owner makes all logic, architecture and design decisions. Ask with one small question at a time.
- Copy must sound like a real person talking. No corporate lines, hype, cliches, LinkedIn or trailer tone.
- No template-looking design: no default gradients, stock card layouts or component-library look.
  Any new visual direction is shown for approval before it is locked.
- Show every texture, HDRI and sound for approval before using it.
- Only three fonts: Caveat (main), Reenie Beanie and Homemade Apple (accents).
- Two past projects the owner named are left off completely. Their names are kept out of this repo on
  purpose (they are in the session memory notes); never add them, in code, comments or copy.
- Tech and dev framing, never "founder" or "startup". Sip and Unbound are "things I built".
- Never use the word "outreach" for Next Generation Hacks.
- After each finished build step, say whether to /clear.

## Decisions

| Topic | Decision |
|---|---|
| Stack | Next.js (App Router) + TypeScript, plain CSS (no Tailwind, no component library) |
| Hosting | Vercel |
| 3D | Three.js, GSAP ScrollTrigger, Lenis. Photoreal, not drawn SVG |
| Materials | Poly Haven CC0 PBR textures (leather, grass) + HDRI lighting; paper from ambientCG (CC0) |
| Clouds / portal / tunnel | Pre-rendered frame sequence on canvas (locked 2026-11-13). Frames come from `scripts/render-cloud-frames.mjs` |
| Page text | Real HTML laid over the 3D pages (sharp, selectable, accessible) |
| GitHub graph | Own route + GitHub GraphQL API, token in env, cached hourly, squares drawn by hand. Username `shahmerrkhan` |
| Songs | Apple/iTunes official 30s previews, custom player. Fallback: Deezer 30s MP3 through our own route, for browsers without AAC (Opera on Linux) |
| Guestbook | Neon Postgres. Notes are pending until approved on a password-protected `/admin` page |
| Ambient sound | Garden sound, with a mute button. Not picked yet: three candidates wait on `/lab` until the owner can listen. They are public-domain dedications (ezwa, Wikimedia Commons), not the CC0 licence itself |
| Phone framing | Tall screens: once open, the camera sits over the right-hand page and comes close enough that it fills about 93% of the width |
| Chat bubble | Bottom-left placeholder only, shows a "coming soon" note. No real AI |
| Book spines | Click shows title and author on a small note |

## Visual direction (approved)

- Book: worn chestnut brown leather, pebbled grain, tooled embossed border, "Shahmeer Khan" pressed into
  the cover, cream stitching, brass clasp on a strap, ribbon bookmark. Cover, spine and edges share one
  leather material. (Oxblood was rejected.)
- Camera: fixed top view, straight down on the book. No drag, orbit or any visitor camera movement, on the
  lab page and the final site. (Changed 2026-11-13; replaces the low camera in the grass.)
- Garden: real grass, shrubs and flowers around the book, soft daylight from an HDRI.
- Pages: real paper texture; content as tilted notes hanging from tape, pins or string.
- UI (skip, contact, mute, chat bubble): small paper tags and a brass-style button, not app buttons.

## Locked materials (owner approved 2026-11-13)

| Use | Choice |
|---|---|
| Leather | Poly Haven `brown_leather`, with the chestnut tint. Wear is painted in: rubbed corners, scratches, spine creases |
| Soil under the grass | Poly Haven `forrest_ground_01` |
| Sky light | Poly Haven HDRI `meadow_2`, plus a low warm sun from the upper left with leaf shade |
| Paper | ambientCG `Paper001`, tinted cream |
| Ribbon | Cream |
| Grass blades | ambientCG `Foliage008` photo cut-outs, instanced. Three sizes, dry and bare patches |
| Daisies, oak leaves, dandelion leaves | ambientCG `FlowerSet001`, `LeafSet030`, `LeafSet020` photo cut-outs. Clover is drawn |
| Look | Depth of field, vignette, grain, Khronos neutral tone mapping. One oak leaf and a few clippings lie on the cover |

Files are in `public/textures`. They are JPG and WebP, not KTX2 yet (no KTX tools on the build machine).

## Phone performance and fallback

- 1K textures on phones, 2K on desktop, KTX2 compressed. Pixel ratio capped at 1.5 to 2.
  One shadow light. Under 100 draw calls.
- Device check picks a high, medium or low tier (`lib/quality.ts`).
- Low tier and reduced-motion: pre-rendered still of the garden and book with a 2D page turn.
  All content stays readable.
- Cloud frames: about 150 to 200 WebP frames, roughly 4 to 7 MB on phones.

## Flow

1. Tap-to-begin screen (browsers block audio until a tap). Skip intro is visible here and always.
2. Clouds with the voiceover and captions.
3. Blue portal, then cloud tunnel down to the garden.
4. Garden with the leather notebook in the grass. Scrolling opens it and turns pages.

## Content

### Voiceover script (locked, about 15 seconds, ElevenLabs file supplied by owner)

> Bezos asks one question: at eighty, what will you regret not trying?
> That's why I do things. It's why I do everything.
> I just like doing things, because I don't want to regret anything.
> I'm always open to learning.
> Work with me, you get that.

File goes at `public/audio/voiceover.mp3`.

### Page 1: intro

> Hi, I'm Shahmeer.
> Inside: things I've built, what I believe, songs, books, and a few secrets in the garden.

AI/ML Prototyping at Magic Hour

(The "I like doing things" idea now appears only in the voiceover. Changed 2026-11-13, wording to be approved.)

### Page 2: projects, then experience, then GitHub graph

Projects, in this order:

- **Clicky** (lead): Linux screen buddy you talk to by typing or voice. It looks at your screen, answers
  with Gemini (web search through Tavily), and types drafts into the right box. Voice runs locally with
  Whisper and Piper.
- **Sip**: Free 1:1 platform connecting students with professionals, 60+ signups and 28 mentors. Built on
  Next.js, Drizzle ORM, Neon Postgres, Clerk and Resend, deployed on Vercel.
- **Commutr** (silver label "CommuniHacks 2nd place"): Walking and transit rewards app. I built the
  backend on Render, with points per travel mode and a trip confidence score that penalizes suspicious
  trips, like car-like speed on a walk.
- **Spiral**: Free, live goal-tracking app where AI turns one 6-month goal into monthly milestones and
  weekly actions. Built during Prettiflow's FlowHouse fellowship (Cohort 1).

Project names are links (new tab, `rel="noopener noreferrer"`): Sip https://getsip.co, Clicky
https://github.com/shahmerrkhan/heyclicky-linux, Commutr https://github.com/kostslava/commutr, Spiral
https://github.com/shahmerrkhan/spiral. Spiral's card ends "Built in one week during Prettiflow's FlowHouse,
Cohort 1."

Experience (hanging notes, newest first; wording from the owner's LinkedIn, 2026-11-14):

- **Magic Hour (YC W24)** (current, AI/ML Prototyping): "Magic Hour" links to https://magichour.ai, the bracket is
  plain text, everywhere the name appears. Clip-extraction pipeline and scene-based reframing, generation time cut
  from 30+ min to about 6 min on an L4 GPU. Benchmarked against Opus Clip, and my clipper runs faster.
- **Faculty of Engineering, McMaster University**: Leader In Training (LIT). Aug 2026, 1 month, Hamilton, Ontario.
  "Mentored Grade 6-8 students one-on-one at McMaster's summer engineering camp. Ran robotics and Arduino labs."
- **Prettiflow** (https://www.prettiflow.com): FlowHouse Builder, Cohort 1. May 2026 to Jun 2026, 2 months, remote.
  "One of 200 builders picked for Cohort 1. Built and shipped Spiral, a goal tracking app, in one week."
- **Unbound** (https://www.becomeunbound.org), no title, no product details: "Ran an event at Waterloo Tech Week
  (72 hrs, all spots filled), partnered with YPLS on a 500+ person summit, and currently sponsoring Terminal X26,
  a hackathon backed by 4 YC companies."
- **Next Generation Hacks** (https://www.ngnhacks.ca): worldwide online hackathon for high schoolers, built with
  York University and Y Space. 342 participants across 35+ countries, and $25K CAD in sponsor value from companies
  like Mozilla and Siemens.

Logos, fetched from each organisation's own site into `public/logos` and never redrawn: Magic Hour (the mark
from their page header), Unbound (their icon file with the empty margin cut off), Next Generation Hacks (the owl).

Wide screens: all five on the experience page. Tall screens: the first three there, the last two at the top of
the next page under the same heading, because five on one phone page came out at 11px.

Then a short live glimpse of the GitHub contributions graph, on the left-hand page facing "what I believe".

### Page 3: what I believe

- I believe in love for everyone.
- Everyone has a story worth hearing.
- I'm always open to learning.

### Page 4: fun

Songs, scattered, about 30 seconds each:
Drake: Cameras, Sticky. The Weeknd: After Hours, Out of Time. Travis Scott: My Eyes, Flocky Flocky (with
Don Toliver).

"Some books I've read" shelf with small clickable spines:
Meditations, Man's Search for Meaning, The Myth of Sisyphus, The Stranger, Notes from Underground,
Symposium, The Republic, The Prince, Sophie's World, The Alchemist, The Power of Now, The Picture of
Dorian Gray, 1984, Animal Farm, No Longer Human, The Pathans (Abdul Ghani Khan), The Communist Manifesto,
The Kite Runner, A Thousand Splendid Suns, And the Mountains Echoed.

Hobbies: gym, reading and poetry, love for everyone, walks, meeting new people and hearing their stories,
hanging out with friends, running, soccer, photography, drawing (used to), chess (a little), gaming (used
to), swimming (a little), really want to learn guitar, deep conversations, down for anything ("hit me up").

### Page 5: guestbook

Visitors leave notes. Stored in Neon, shown after approval.

### Page 6: my story

I'm a grade 12 student living in Ontario. I moved to Canada in November 2024. Eager and curious. I'm into
reading and poetry, and I like meeting new people and hearing their stories. (Wording to be approved.)

### Page 7: garden secrets (clickable flowers or shrubs, first person)

- I moved to Canada in November 2024.
- I really want to learn guitar.
- I believe in love for everyone.
- I'll go on a walk or meet someone new just to hear their story.
- I once coached a grade 8 soccer team of 20 for their tournament.

### Always on every page

- Contact button: LinkedIn https://www.linkedin.com/in/shahmerrkhann/, email m.shahmeer.khan8@gmail.com,
  GitHub https://github.com/shahmerrkhan
- AI chat bubble, bottom-left, placeholder.
- Skip intro (while the intro runs) and mute.

## Files

| File | Does |
|---|---|
| `app/layout.tsx`, `app/globals.css` | Fonts (three only), base styles, always-on UI |
| `app/page.tsx` | Orchestrates intro, garden and notebook |
| `components/intro/*` | Tap-to-begin gate, frame-sequence canvas, voiceover, captions, skip button |
| `components/scene/*` | Three.js canvas, HDRI, grass, plants, leather book, page-turn rig |
| `components/pages/*` | One file per notebook page (1 to 7) |
| `components/ui/*` | Contact button, mute, chat bubble placeholder, skip |
| `content/site.ts` | All text in one place, exactly as given |
| `app/api/github/route.ts` | Contributions via GraphQL, cached hourly |
| `app/api/songs/route.ts` | iTunes preview lookup for the six songs |
| `app/api/guestbook/route.ts`, `app/admin/page.tsx` | Submit notes; private approval page |
| `lib/db.ts`, `lib/quality.ts` | Neon client; device tier check |
| `public/audio`, `public/textures`, `public/frames` | Voiceover, ambient sound, textures, cloud frames |

## What could break

- Autoplay: audio needs a tap first, hence the tap-to-begin screen.
- iOS Safari memory limits can crash heavy WebGL pages: texture caps and the low tier guard this.
- Apple may not have a preview for every track or region: show "preview unavailable".
- GitHub token missing or Neon down: quiet handwritten fallback, page keeps working.
- Lenis and ScrollTrigger must share one scroll source or page turns jitter on phones.
- Guestbook spam: rate limit plus approval.

## Build steps

- [x] 1. Scaffold, fonts, content file, always-on UI.
- [x] 2. Texture, HDRI and sound approval; clouds comparison (real-time vs pre-rendered).
  - Everything is locked except the garden sound. `/lab` now only holds the three sound candidates; remove it
    and `public/lab` once one is picked (move the file to `public/audio`).
- [x] 3. Garden and leather book.
  - `components/scene/scene.ts` (renderer, light, post pass, framing), `book.ts` (cover hinge, six turning
    leaves), `bookCover.ts` (cover maps), `garden.ts` (grass and plants), `GardenScene.tsx` (canvas + scroll,
    Lenis and ScrollTrigger on one clock), `lib/quality.ts` (tiers + automatic resolution scaling).
  - Scroll: first 14% opens the cover, the rest turns six leaves. Wide screens slide the camera over the spine to
    show both pages; tall screens keep the right-hand page and the cover swings out of view. Still straight down.
  - Left for later steps: text on the pages (4), the low tier's pre-rendered still and 2D page turn (6).
  - Open questions for the owner: the phone framing above; the loose sheet of paper from the preview was left
    out of the real scene; no build step covers the intro (clouds, portal, tunnel, tap-to-begin) yet.
- [x] 4. Pages 1 to 7.
  - `components/pages/Page1..7.tsx` hold the content, `Notebook.tsx` lists them, `bind.ts` moves the HTML onto
    the pages. The scene reports where the pages are on screen (`View` in `scene.ts`); text is blended onto the
    paper with multiply so the scene's light and shade still fall across it.
  - Wide screens: left-hand content on the left page, right-hand on the right. Tall screens: the camera comes in
    on the right-hand page and both sides stack on it.
  - `lib/scrollPlan.ts`: one stretch of scrolling opens the cover, then each page gets a stretch to read (longer
    when its content is taller than the page, and the content moves up inside the page) and a stretch to turn.
  - Garden secrets: five blue daisies planted where the open-book shot can see them; page 7 keeps the found ones.
- [x] 5. APIs: GitHub, songs, guestbook and `/admin`.
  - All three answer quietly when their key is missing. Names are in `.env.example`.
  - Guestbook table `guestbook_notes` is created on first use. Limits: 3 notes an hour per sender, 40 and 280
    characters, a hidden box that catches scripts.
- [x] 6. Intro, audio, fallbacks, and the done-when checks.
  - Intro (`components/intro`): tap to begin, cloud loop with captions, portal and tunnel clip, fade to the
    garden. Frames: `public/frames/{clouds,portal}` and `-tall` sets for upright screens. The portal clip comes
    from `scripts/portal.frag` through the same render script.
  - Without `public/audio/voiceover.mp3` the captions run on a 15 second timer. With it they follow the file.
  - `lib/sound.ts`: mute (remembered), garden loop, and the loop dropping back under the voiceover and songs.
  - Flat fallback (`FlatGarden.tsx`) for low tier, reduced motion and no WebGL: a photograph from
    `scripts/capture-still.mjs`, the same pages, tabs and back/next buttons, a 2D turn.

- [x] 7. Fix pass (2026-11-13).
  - Sync: one tick moves the scroll, sets the book and the text from the same ScrollTrigger reading, then draws
    (`GardenScene.tsx`). Text is never on a leaf in the air: it fades off, the blank leaf turns, the next
    spread's text fades in (`FADE` in `lib/scrollPlan.ts`).
  - Fit: type is a fixed share of the page width and shrinks per page until the content fits (`fit` in
    `bind.ts`). Content no longer scrolls inside a page. Tall screens show one page at a time and the camera
    slides from the left page to the right.
  - Songs: the whole slip is the button; previews are passed through `/api/songs/preview` as `audio/mp4`.
  - Guestbook: own check and message, no native bubble.
  - Touch: corner lift, landing bounce, note sway and swing, press-in buttons, flower sway and bob, drifting
    seeds, shifting daylight, closed book breathing. All off under reduced motion; seeds drop first by tier.

- [x] 8. Second fix pass (2026-11-14).
  - Voiceover captions follow `audio.currentTime` against `voiceover.cues` in `content/site.ts`
    (0, 6.45, 9.65, 14.35, 16.55 seconds; file is 18.3 s). Measured with ffmpeg silencedetect and checked with
    a transcript. Measure again if the recording changes.
  - Songs: Apple's AAC preview first; if the browser cannot play AAC, or the file fails or stays silent for 7
    seconds, the same song as an MP3 from Deezer through `/api/songs/mp3`. Failures are logged to the console
    and shown on the card.

## Still open

- Projects page on a phone: four projects on one page come out at about 13px type. If that is too small the
  fix is a layout decision (for example one more leaf), not more shrinking.

- Garden sound: `birds_singing_in_garden` was put in as `public/audio/garden.mp3` (made louder, ends blended so
  it loops) without the owner hearing it. `/lab` and `public/lab` stay until the owner confirms or swaps it.
- Copy changed in the fix pass (page 1 line, one belief removed, story's last line) waits for approval.
- Book authors: only The Pathans has one, because only that one was given.
- Textures are still JPG and WebP, not KTX2.

## Needed from the owner (ask when the step needs it)

- ElevenLabs voiceover file (step 6, or earlier for timing).
- Read-only GitHub token as `GITHUB_TOKEN` (step 5).
- Neon database through Vercel, `DATABASE_URL` (step 5), and an `ADMIN_PASSWORD`.

## Done when

- The site builds and runs with no errors.
- Skip intro works and the contact button shows on every page.
- It looks right at phone width and desktop width.
- The notebook reads as a leather book.
- The two left-off project names appear nowhere in the code.
- Only the three fonts are used.
