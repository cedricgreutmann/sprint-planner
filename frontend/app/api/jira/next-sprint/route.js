import { NextResponse } from "next/server";

function parseSprintNumber(value) {
  const text = String(value || "");
  const matches = text.match(/\d+/g);
  if (!matches?.length) return "";
  return matches[matches.length - 1];
}

function pickNextFutureSprint(sprints) {
  if (!Array.isArray(sprints) || sprints.length === 0) return null;
  return [...sprints]
    .sort((a, b) => {
      const aTime = a?.startDate ? Date.parse(a.startDate) : Number.POSITIVE_INFINITY;
      const bTime = b?.startDate ? Date.parse(b.startDate) : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    })
    .find(Boolean);
}

export async function GET() {
  try {
    const email = String(process.env.JIRA_EMAIL || "").trim();
    const apiToken = String(process.env.JIRA_API_TOKEN || "").trim();
    const boardId = String(process.env.JIRA_BOARD_ID || "").trim();
    const jiraBaseUrl = String(process.env.JIRA_BASE_URL || "https://imagic-prod.atlassian.net").trim();

    if (!email || !apiToken || !boardId) {
      return NextResponse.json(
        { error: "Server is missing Jira env vars: JIRA_EMAIL, JIRA_API_TOKEN, JIRA_BOARD_ID." },
        { status: 500 }
      );
    }

    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const url = `${jiraBaseUrl}/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint?state=future&maxResults=50`;
    const jiraRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      return NextResponse.json(
        { error: `Jira sprint request failed (${jiraRes.status}): ${text.slice(0, 500)}` },
        { status: jiraRes.status }
      );
    }

    const body = await jiraRes.json();
    const sprint = pickNextFutureSprint(body?.values || []);
    if (!sprint) {
      return NextResponse.json({ error: "No future sprint found for this board." }, { status: 404 });
    }

    return NextResponse.json({
      id: sprint.id,
      name: sprint.name,
      number: parseSprintNumber(sprint.name)
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Unable to load Jira next sprint: ${String(error?.message || error)}` },
      { status: 500 }
    );
  }
}
