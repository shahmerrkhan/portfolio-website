<div align="center">

# Shahmeer's notebook

My personal portfolio: a worn leather notebook lying open in a garden, built to scroll through like a real book.

![Next.js 16](https://img.shields.io/badge/Next.js-16.4.6-black?logo=nextdotjs)
![Three.js](https://img.shields.io/badge/Three.js-0.187-5a3e2b?logo=threedotjs)

**Live site:** _coming soon_

</div>

<p align="center">
  <img src="docs/desktop-work.webp" alt="The notebook open on the work pages, projects on the left and experience on the right, lying in the grass" width="760">
</p>

<p align="center">
  <img src="docs/desktop-hi.webp" alt="The first page of the notebook: Hi, I'm Shahmeer" width="470">
  &nbsp;
  <img src="docs/phone-hi.webp" alt="The first page on a phone" width="190">
</p>

## What it is

You start above the clouds. Tap once, a short voiceover plays with captions, and the clouds open into a portal that pulls you down through a cloud tunnel. You land in a garden with a leather notebook lying in the grass. Scroll and the cover opens, then the pages turn one by one.

There are seven pages:

1. **Hi**, who I am and what I'm doing right now
2. **Work**, the things I've built, where I've worked and my GitHub
3. **What I believe**
4. **Fun**, songs, books and hobbies
5. **Guestbook**, leave me a note
6. **My story**
7. **Secrets**, for whatever you found in the garden

Birds play quietly in the background once you've tapped in, and there's a tag in the corner to mute them. The skip intro button is there from the very first screen if you just want the book.

It was built for phones first. On a phone the book shows one page at a time and the camera slides across the spread. Devices that can't run the 3D scene smoothly, and anyone with reduced motion turned on, get a flat version instead: a still photo of the same garden and book with a simple page turn.

## Things to find

- A live GitHub contributions graph, pulled through the site's own server route
- Song previews you can play right on the page, from iTunes, with Deezer as a backup for browsers that can't play Apple's files
- A guestbook where notes only show up after I approve them
- Hidden daisies in the garden. Find them and they show up on the last page
- A contact tag in the corner with my LinkedIn and email
- A chat bubble in the bottom left. It's only a placeholder for now

## Built with

- [Next.js](https://nextjs.org) 16.4.6 and React 19.3, in TypeScript
- [Three.js](https://threejs.org) 0.187 for the garden and the book
- [GSAP](https://gsap.com) 3.15 with ScrollTrigger, and [Lenis](https://lenis.darkroom.engineering) 1.3 for smooth scrolling
- [Neon](https://neon.tech) Postgres for the guestbook
- Three handwriting fonts from Google Fonts: Caveat, Reenie Beanie and Homemade Apple

The clouds and the portal are pre-rendered frames (WebP) played on a canvas, so they look the same on a cheap phone as on a desktop.

## Run it locally

You'll need Node 20 or newer.

```bash
npm install
cp .env.example .env.local
```

Then fill in `.env.local`:

| Name | What it's for |
|---|---|
| `GITHUB_TOKEN` | A read-only GitHub token, used for the contributions graph |
| `DATABASE_URL` | A Neon Postgres connection string, used for the guestbook |
| `ADMIN_PASSWORD` | The password for `/admin`, where guestbook notes get approved |

The site still runs without them. The graph and guestbook just stay empty.

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the build
```

## Where things live

```
app/            pages, styles and the API routes (github, songs, guestbook)
app/admin/      the private page for approving guestbook notes
components/
  intro/        tap to begin, cloud frames, voiceover and captions
  scene/        the Three.js garden, the book and the page-turn rig
  pages/        the seven notebook pages
  ui/           contact tag, mute, chat bubble, page tabs
content/site.ts every word on the site, in one file
lib/            scroll plan, sound, songs lookup, database
public/         frames, textures, audio, logos and the flat fallback image
scripts/        how the cloud frames and the fallback still were made
```

## Credits

- Leather, ground and the `meadow_2` HDRI sky from [Poly Haven](https://polyhaven.com) (CC0)
- Paper, grass, daisy and leaf cut-outs from [ambientCG](https://ambientcg.com) (CC0)
- The garden sound is "Birds singing in garden" by ezwa on [Wikimedia Commons](https://commons.wikimedia.org), released into the public domain
- The voiceover was made with [ElevenLabs](https://elevenlabs.io)
- Song previews come from the iTunes Search API, with [Deezer](https://www.deezer.com) as the fallback
- Company logos belong to their owners and were taken from their own sites

## Say hi

- LinkedIn: [shahmerrkhann](https://www.linkedin.com/in/shahmerrkhann/)
- GitHub: [shahmerrkhan](https://github.com/shahmerrkhan)
- Email: [m.shahmeer.khan8@gmail.com](mailto:m.shahmeer.khan8@gmail.com)

Or just leave a note in the guestbook.
