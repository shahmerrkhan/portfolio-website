// Every word shown on the site lives here, exactly as Shahmeer gave it.
// Do not add facts. If something is missing, ask.

export const contact = {
  linkedin: "https://www.linkedin.com/in/shahmerrkhann/",
  email: "m.shahmeer.khan8@gmail.com",
  github: "https://github.com/shahmerrkhan",
  githubUser: "shahmerrkhan",
};

// Names that are links wherever they appear in the text below (new tab).
export const links: Record<string, string> = {
  Prettiflow: "https://www.prettiflow.com",
  "Magic Hour": "https://magichour.ai",
  "Next Generation Hacks": "https://www.ngnhacks.ca",
  Unbound: "https://www.becomeunbound.org",
};

// The voiceover. `cues` is the second each line starts being spoken, measured from the
// real file (pauses found with ffmpeg silencedetect, checked against a transcript).
// If the recording is replaced, measure again.
export const voiceover = {
  src: "/audio/voiceover.mp3",
  seconds: 18.3,
  lines: [
    "Bezos asks one question: at eighty, what will you regret not trying?",
    "That's why I do things. It's why I do everything.",
    "I just like doing things, because I don't want to regret anything.",
    "I'm always open to learning.",
    "Work with me, you get that.",
  ],
  cues: [0, 6.45, 9.65, 14.35, 16.55],
};

export const intro = {
  greeting: "Hi, I'm Shahmeer.",
  line: "Inside: things I've built, what I believe, songs, books, and a few secrets in the garden.",
  work: "AI/ML Prototyping at Magic Hour (YC W24)",
};

export type Project = { name: string; url: string; line: string; label?: string };

export const projects: Project[] = [
  {
    name: "Clicky",
    url: "https://github.com/shahmerrkhan/heyclicky-linux",
    line: "Linux screen buddy you talk to by typing or voice. It looks at your screen, answers with Gemini (web search through Tavily), and types drafts into the right box. Voice runs locally with Whisper and Piper.",
  },
  {
    name: "Sip",
    url: "https://getsip.co",
    line: "Free 1:1 platform connecting students with professionals, 60+ signups and 28 mentors. Built on Next.js, Drizzle ORM, Neon Postgres, Clerk and Resend, deployed on Vercel.",
  },
  {
    name: "Commutr",
    url: "https://github.com/kostslava/commutr",
    label: "CommuniHacks 2nd place",
    line: "Walking and transit rewards app. I built the backend on Render, with points per travel mode and a trip confidence score that penalizes suspicious trips, like car-like speed on a walk.",
  },
  {
    name: "Spiral",
    url: "https://github.com/shahmerrkhan/spiral",
    line: "Free, live goal-tracking app where AI turns one 6-month goal into monthly milestones and weekly actions. Built in one week during Prettiflow's FlowHouse, Cohort 1.",
  },
];

// name: the organisation (a link if it is in `links`). tag: plain text after the name.
// logo: a file in public/logos, fetched from the organisation's own site.
export type Experience = {
  name: string;
  tag?: string;
  role?: string;
  current?: boolean;
  when?: string;
  where?: string;
  line: string;
  logo?: { src: string; wide?: boolean };
};

// Newest first: the current one, then by date; the two without dates last.
export const experience: Experience[] = [
  {
    name: "Magic Hour",
    tag: "(YC W24)",
    role: "AI/ML Prototyping",
    current: true,
    line: "Clip-extraction pipeline and scene-based reframing, generation time cut from 30+ min to about 6 min on an L4 GPU. Benchmarked against Opus Clip, and my clipper runs faster.",
    logo: { src: "/logos/magic-hour.svg" },
  },
  {
    name: "McMaster University",
    role: "Leader In Training (LIT)",
    when: "Aug 2026, 1 month",
    where: "Hamilton, Ontario",
    line: "Mentored Grade 6-8 students one-on-one at McMaster's summer engineering camp. Ran robotics and Arduino labs.",
    logo: { src: "/logos/mcmaster.svg" },
  },
  {
    name: "Prettiflow",
    role: "FlowHouse Builder, Cohort 1",
    when: "May 2026 to Jun 2026, 2 months",
    where: "Remote",
    line: "One of 200 builders picked for Cohort 1. Built and shipped Spiral, a goal tracking app, in one week.",
    logo: { src: "/logos/prettiflow.svg" },
  },
  {
    name: "Unbound",
    line: "Ran an event at Waterloo Tech Week (72 hrs, all spots filled), partnered with YPLS on a 500+ person summit, and currently sponsoring Terminal X26, a hackathon backed by 4 YC companies.",
    logo: { src: "/logos/unbound.svg", wide: true },
  },
  {
    name: "Next Generation Hacks",
    line: "Worldwide online hackathon for high schoolers, built with York University and Y Space. 342 participants across 35+ countries, and $25K CAD in sponsor value from companies like Mozilla and Siemens.",
    // the owl from their site, on its own; their square badge (next-generation-hacks.webp) is a blur at this size
    logo: { src: "/logos/next-generation-hacks-owl.webp" },
  },
];

export const beliefs = [
  "I believe in love for everyone.",
  "Everyone has a story worth hearing.",
  "I'm always open to learning.",
];

export const songs = [
  { artist: "Drake", title: "Cameras" },
  { artist: "Drake", title: "Sticky" },
  { artist: "The Weeknd", title: "After Hours" },
  { artist: "The Weeknd", title: "Out of Time" },
  { artist: "Travis Scott", title: "My Eyes" },
  { artist: "Travis Scott", title: "Flocky Flocky", featuring: "Don Toliver" },
];

// Authors are only listed where Shahmeer gave them.
export const books: { title: string; author?: string }[] = [
  { title: "Meditations" },
  { title: "Man's Search for Meaning" },
  { title: "The Myth of Sisyphus" },
  { title: "The Stranger" },
  { title: "Notes from Underground" },
  { title: "Symposium" },
  { title: "The Republic" },
  { title: "The Prince" },
  { title: "Sophie's World" },
  { title: "The Alchemist" },
  { title: "The Power of Now" },
  { title: "The Picture of Dorian Gray" },
  { title: "1984" },
  { title: "Animal Farm" },
  { title: "No Longer Human" },
  { title: "The Pathans", author: "Abdul Ghani Khan" },
  { title: "The Communist Manifesto" },
  { title: "The Kite Runner" },
  { title: "A Thousand Splendid Suns" },
  { title: "And the Mountains Echoed" },
];

export const hobbies = [
  "gym",
  "reading and poetry",
  "love for everyone",
  "walks",
  "meeting new people and hearing their stories",
  "hanging out with friends",
  "running",
  "soccer",
  "photography",
  "drawing (used to)",
  "chess (a little)",
  "gaming (used to)",
  "swimming (a little)",
  "really want to learn guitar",
  "deep conversations",
  'down for anything ("hit me up")',
];

// Final wording of the story page still needs Shahmeer's approval.
export const story = [
  "I'm a grade 12 student living in Ontario.",
  "I moved to Canada in November 2024.",
  "Eager and curious. I'm into reading and poetry, and I like meeting new people and hearing their stories.",
];

export const secrets = [
  "I moved to Canada in November 2024.",
  "I really want to learn guitar.",
  "I believe in love for everyone.",
  "I'll go on a walk or meet someone new just to hear their story.",
  "I once coached a grade 8 soccer team of 20 for their tournament.",
];

// Small working words: headings, button labels and the notes shown when something
// cannot load. None of these are facts about Shahmeer; change them freely.
export const pages = [
  { id: "hi", tab: "hi", name: "intro" },
  { id: "story", tab: "story", name: "my story" },
  { id: "work", tab: "work", name: "projects, experience and GitHub" },
  { id: "believe", tab: "believe", name: "what I believe" },
  { id: "fun", tab: "fun", name: "songs, books and hobbies" },
  { id: "guestbook", tab: "guestbook", name: "guestbook" },
  { id: "secrets", tab: "secrets", name: "garden secrets" },
] as const;

export const words = {
  begin: "tap to begin",
  skip: "skip intro",
  soundOn: "sound on",
  soundOff: "sound off",
  openHint: "scroll to open it",
  projects: "projects",
  experience: "experience",
  current: "current",
  github: "github",
  githubTotal: (n: number) => `${n} contributions in the last year`,
  githubDown: "The graph won't load right now. It's all on my GitHub.",
  beliefs: "what I believe",
  songs: "songs",
  songsDown: "The songs won't load right now.",
  noPreview: "no preview",
  playing: "playing",
  songFailed: "This one won't play in your browser.",
  songAgain: "tap again",
  books: "Some books I've read",
  hobbies: "hobbies",
  guestbook: "guestbook",
  guestbookAsk: "Leave a note.",
  guestbookName: "your name",
  guestbookNote: "your note",
  guestbookSend: "leave it",
  guestbookSending: "leaving it...",
  guestbookThanks: "Thanks. It shows up here once I've read it.",
  guestbookEmpty: "No notes yet.",
  guestbookDown: "The guestbook can't take notes right now. Email me instead.",
  guestbookSlow: "That's a few notes in a row. Try again in a while.",
  guestbookShort: "Write a name and a note first.",
  story: "my story",
  secrets: "garden secrets",
  secretsHint: "Five of the daisies around this book are blue. Tap one.",
  secretsHintFlat: "Tap a flower.",
  secretsCount: (n: number, of: number) => `${n} of ${of} found`,
  previous: "back",
  next: "next page",
};
