// npm run chat:embed: turns every phrasing in content/chat.ts (and the off-topic
// examples) into a vector and writes public/chat/embeddings.json. Run it after changing
// the questions, and commit the file. Runs fully offline from public/models.
import { writeFileSync } from "node:fs";
import { embedList } from "../../content/chat.ts";
import { encode } from "../../lib/chat/match.ts";
import { FILE, embedder, hashOf } from "./shared.mjs";

const list = embedList();
const embed = await embedder();
const items = [];
for (const { text, answer } of list) items.push({ a: answer, ...encode(await embed(text)) });
writeFileSync(FILE, JSON.stringify({ hash: hashOf(list), dim: 384, items }));
console.log(`embedded ${items.length} phrasings into public/chat/embeddings.json`);
