// What is still waiting for a yes or no. Files live in public/lab/sound.

export type Candidate = { id: string; name: string; note: string };

export const sounds: Candidate[] = [
  { id: "birds_singing_in_garden", name: "Birds singing in garden", note: "49 seconds" },
  { id: "gentle_breeze_and_birds_singing", name: "Gentle breeze and birds singing", note: "33 seconds" },
  { id: "breeze_birds_and_geese", name: "Breeze, birds and geese", note: "63 seconds" },
];
