// Runs before every build (prebuild). Fails if content/chat.ts changed but the
// embeddings were not made again. It does not load the model, so it takes a moment.
import { readFileSync } from "node:fs";
import { embedList } from "../../content/chat.ts";
import { FILE, hashOf } from "./shared.mjs";

const want = hashOf(embedList());
let have = null;
try {
  have = JSON.parse(readFileSync(FILE, "utf8")).hash;
} catch {}
if (have !== want) {
  console.error("public/chat/embeddings.json is out of date with content/chat.ts. Run: npm run chat:embed");
  process.exit(1);
}
console.log("chat embeddings are up to date");
