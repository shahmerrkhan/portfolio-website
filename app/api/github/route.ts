import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { contact } from "@/content/site";

// The last year of contributions for the graph on page 2.
// Needs GITHUB_TOKEN (read-only). Without it, or if GitHub is down, the page shows a
// short handwritten note instead.

const LEVELS: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const QUERY = `query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionLevel } }
      }
    }
  }
}`;

type Calendar = { totalContributions: number; weeks: { contributionDays: { contributionLevel: string }[] }[] };

// asked for at most once an hour; a failed try is not remembered
async function contributions(login: string) {
  "use cache";
  cacheLife("hours");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "content-type": "application/json", "user-agent": "notebook-site" },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const calendar: Calendar | undefined = (await res.json()).data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error("GitHub sent no calendar");
  return {
    total: calendar.totalContributions,
    weeks: calendar.weeks.map((w) => w.contributionDays.map((d) => LEVELS[d.contributionLevel] ?? 0)),
  };
}

export async function GET() {
  await connection();
  if (!process.env.GITHUB_TOKEN) return Response.json({ ok: false });
  try {
    return Response.json({ ok: true, ...(await contributions(contact.githubUser)) });
  } catch {
    return Response.json({ ok: false });
  }
}
