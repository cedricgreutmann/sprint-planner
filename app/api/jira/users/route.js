import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const projectKey = String(body?.projectKey || "").trim();
    const issueKey = String(body?.issueKey || "").trim();
    const email = String(process.env.JIRA_EMAIL || "").trim();
    const apiToken = String(process.env.JIRA_API_TOKEN || "").trim();
    const defaultProjectKey = String(process.env.JIRA_PROJECT_KEY || "").trim();
    const jiraBaseUrl = String(process.env.JIRA_BASE_URL || "https://imagic-prod.atlassian.net").trim();

    if (!query) {
      return NextResponse.json({ users: [] });
    }

    if (!email || !apiToken) {
      return NextResponse.json(
        { error: "Server is missing one or more Jira env vars: JIRA_EMAIL, JIRA_API_TOKEN." },
        { status: 500 }
      );
    }

    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
    const contextProjectKey = projectKey || defaultProjectKey;
    const params = new URLSearchParams({
      query,
      maxResults: "20"
    });

    if (issueKey) {
      params.set("issueKey", issueKey);
    } else if (contextProjectKey) {
      params.set("project", contextProjectKey);
    }

    let jiraRes = await fetch(`${jiraBaseUrl}/rest/api/3/user/assignable/search?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!jiraRes.ok && jiraRes.status === 400 && !issueKey && !contextProjectKey) {
      const fallbackParams = new URLSearchParams({
        query,
        maxResults: "20"
      });
      jiraRes = await fetch(`${jiraBaseUrl}/rest/api/3/user/search?${fallbackParams.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json"
        },
        cache: "no-store"
      });
    }

    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      return NextResponse.json(
        { error: `Jira user lookup failed (${jiraRes.status}): ${text.slice(0, 500)}` },
        { status: jiraRes.status }
      );
    }

    const jiraUsers = await jiraRes.json();
    const users = Array.isArray(jiraUsers)
      ? jiraUsers
          .filter((user) => user?.active && user?.accountId && user?.displayName)
          .map((user) => ({
            accountId: user.accountId,
            displayName: user.displayName
          }))
      : [];

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: `Unable to load Jira users: ${String(error?.message || error)}` },
      { status: 500 }
    );
  }
}
