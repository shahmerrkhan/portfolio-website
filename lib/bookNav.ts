// The chat bubble and the book live in different parts of the page (the bubble is in
// the root layout, the book inside Stage). This is how they talk: whichever book is on
// screen (the 3D garden or the flat fallback) registers a way to turn to a page, and the
// chat calls it. While nothing is registered the book is not on screen yet (the intro is
// still running), and the chat stays hidden.

type Go = (page: number) => void;

let go: Go | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());

export const bookNav = {
  // Returns the function that takes it away again (for a useEffect cleanup).
  register(fn: Go) {
    go = fn;
    tell();
    return () => {
      if (go === fn) go = null;
      tell();
    };
  },
  go: (page: number) => go?.(page),
  shown: () => go !== null,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
