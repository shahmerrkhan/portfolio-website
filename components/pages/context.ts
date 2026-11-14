"use client";

import { createContext, useContext } from "react";

// What the pages need to know from whatever is holding the book.
export type BookState = {
  flat: boolean; // the flat fallback: no garden to click in, so page 7's flowers are the buttons
  found: number[]; // which garden secrets have been found
  reveal: (i: number) => void;
};

export const BookContext = createContext<BookState>({ flat: true, found: [], reveal: () => {} });
export const useBook = () => useContext(BookContext);
