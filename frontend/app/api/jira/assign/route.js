import { NextResponse } from "next/server";

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

async function resolveSprintId({ sprintId, boardId, jiraBaseUrl, auth }) {
  if (sprintId) return sprintId;
  if (!boardId) {
    throw new Error("Missing sprintId and JIRA_BOARD_ID. Configure JIRA_BOARD_ID or provide sprintId.");
  }

  const sprintRes = await fetch(
    `${jiraBaseUrl}/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint?state=future&maxResults=50`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );
  if (!sprintRes.ok) {
    const text = await sprintRes.text();
    throw new Error(`Unable to load Jira future sprint (${sprintRes.status}): ${text.slice(0, 500)}`);
  }

  const sprintBody = await sprintRes.json();
  const sprint = pickNextFutureSprint(sprintBody?.values || []);
  const resolved = String(sprint?.id || "").trim();
  if (!resolved) {
    throw new Error("No future sprint found for this board.");
  }
  return resolved;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const issueKey = String(body?.issueKey || "").trim();
    const accountId = String(body?.accountId || "").trim();
    const unassign = body?.unassign === true;
    const removeFromSprint = body?.removeFromSprint === true;
    const sprintIdInput = String(body?.sprintId || "").trim();
    const email = String(process.env.JIRA_EMAIL || "").trim();
    const apiToken = String(process.env.JIRA_API_TOKEN || "").trim();
    const boardId = String(process.env.JIRA_BOARD_ID || "").trim();
    const jiraBaseUrl = String(process.env.JIRA_BASE_URL || "https://imagic-prod.atlassian.net").trim();

    if (!issueKey || (!accountId && !unassign)) {
      return NextResponse.json(
        { error: "Missing required fields: issueKey and either accountId or unassign=true." },
        { status: 400 }
      );
    }

    if (!email || !apiToken) {
      return NextResponse.json(
        { error: "Server is missing one or more Jira env vars: JIRA_EMAIL, JIRA_API_TOKEN." },
        { status: 500 }
      );
    }

    const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    const assigneeUrl = `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`;
    const assigneeRes = await fetch(assigneeUrl, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ accountId: unassign ? null : accountId })
    });

    if (!assigneeRes.ok) {
      const text = await assigneeRes.text();
      return NextResponse.json(
        { error: `Jira assignee update failed (${assigneeRes.status}): ${text.slice(0, 500)}` },
        { status: assigneeRes.status }
      );
    }

    let sprintId = "";
    if (unassign && removeFromSprint) {
      const backlogUrl = `${jiraBaseUrl}/rest/agile/1.0/backlog/issue`;
      const backlogRes = await fetch(backlogUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ issues: [issueKey] })
      });

      if (!backlogRes.ok) {
        const text = await backlogRes.text();
        return NextResponse.json(
          { error: `Jira sprint removal failed (${backlogRes.status}): ${text.slice(0, 500)}` },
          { status: backlogRes.status }
        );
      }
    }

    if (!unassign) {
      sprintId = await resolveSprintId({
        sprintId: sprintIdInput,
        boardId,
        jiraBaseUrl,
        auth
      });

      const sprintUrl = `${jiraBaseUrl}/rest/agile/1.0/sprint/${encodeURIComponent(sprintId)}/issue`;
      const sprintRes = await fetch(sprintUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ issues: [issueKey] })
      });

      if (!sprintRes.ok) {
        const text = await sprintRes.text();
        return NextResponse.json(
          { error: `Jira sprint update failed (${sprintRes.status}): ${text.slice(0, 500)}` },
          { status: sprintRes.status }
        );
      }
    }

    return NextResponse.json({ ok: true, sprintId });
  } catch (error) {
    return NextResponse.json(
      { error: `Unable to update Jira assignment and sprint: ${String(error?.message || error)}` },
      { status: 500 }
    );
  }
}
