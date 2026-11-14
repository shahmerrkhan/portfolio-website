import { story, words } from "@/content/site";

// Page 6: my story.
export function StoryLeft() {
  return (
    <div className="p-title">
      <h2 className="title">{words.story}</h2>
    </div>
  );
}

export function StoryRight() {
  return (
    <div className="p-story">
      <h2 className="title only-single">{words.story}</h2>
      {story.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
