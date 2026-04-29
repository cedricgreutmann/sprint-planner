import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(process.env.JIRA_EMAIL || "").trim();
    const apiToken = String(process.env.JIRA_API_TOKEN || "").trim();
    const jql = String(body?.jql || "order by created DESC");

    if (!email || !apiToken) {
      return NextResponse.json(
        { error: "Server is missing one or more Jira env vars: JIRA_EMAIL, JIRA_API_TOKEN." },
        { status: 500 }
      );
    }

    const url = `https://imagic-prod.atlassian.net/rest/api/3/search/jql`;
    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    const jiraRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: ["summary", "status", "assignee", "timeestimate", "timeoriginalestimate", "customfield_10016"]
      }),
      cache: "no-store"
    });

    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      return NextResponse.json(
        { error: `Jira request failed (${jiraRes.status}): ${text.slice(0, 500)}` },
        { status: jiraRes.status }
      );
    }

    const jiraBody = await jiraRes.json();
    return NextResponse.json(jiraBody);
  } catch (error) {
    return NextResponse.json(
      { error: `Unable to load Jira issues: ${String(error?.message || error)}` },
      { status: 500 }
    );
  }
}
