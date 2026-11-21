// Lets the chat scripts import the site's own TypeScript (content/chat.ts, lib/chat/match.ts)
// with plain Node: Node strips the types itself, this only adds the missing ".ts" to imports.
// Used as `node --import ./scripts/chat/ts.mjs ...`.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {}
    }
    return next(specifier, context);
  },
});
