"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "sprint-planner-state-v1";
const DEFAULT_JQL = "project = ABC AND statusCategory != Done ORDER BY priority DESC";
const controlClass =
  "h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm";
const primaryButtonClass =
  "h-9 rounded-lg border border-blue-600 bg-blue-600 px-3 text-sm font-medium text-white shadow-sm";
const secondaryButtonClass =
  "h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm";

function toIsoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayIso() {
  return toIsoDate(new Date());
}

function getWorkingDays(startIso, count = 10) {
  const start = fromIsoDate(startIso);
  const result = [];
  const d = new Date(start);
  while (result.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      result.push(toIsoDate(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return result;
}

function dayLabel(iso) {
  const d = fromIsoDate(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function buildDefaultSessionName(startIso) {
  const d = fromIsoDate(startIso);
  const formattedDate = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  return `${formattedDate} new`;
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function slotKey(devId, dayIso, slot) {
  return `${devId}|${dayIso}|${slot}`;
}

function emptyState() {
  return {
    sprintStart: todayIso(),
    skipFirstDay: false,
    developers: [],
    tickets: [],
    assignments: {},
    blockedSlots: {},
    jira: {
      jql: DEFAULT_JQL
    }
  };
}

function normalizeJiraSettings(value) {
  const jira = value && typeof value === "object" ? value : {};
  return {
    jql: String(jira.jql || DEFAULT_JQL)
  };
}

export default function Page() {
  const [state, setState] = useState(emptyState);
  const [devName, setDevName] = useState("");
  const [assignForm, setAssignForm] = useState({
    devId: "",
    dayIso: "",
    slot: "AM",
    ticketId: ""
  });
  const [jiraStatus, setJiraStatus] = useState("");
  const [sessionName, setSessionName] = useState(() => buildDefaultSessionName(todayIso()));
  const [isDefaultSessionName, setIsDefaultSessionName] = useState(true);
  const [savedSessions, setSavedSessions] = useState([]);
  const [sessionStatus, setSessionStatus] = useState("");
  const [dragOverSlotKey, setDragOverSlotKey] = useState("");
  const [sessionParam, setSessionParam] = useState("");
  const [issueLookup, setIssueLookup] = useState("");
  const [issueLookupStatus, setIssueLookupStatus] = useState("");

  const days = useMemo(() => {
    const workingDays = getWorkingDays(state.sprintStart, state.skipFirstDay ? 11 : 10);
    return state.skipFirstDay ? workingDays.slice(1) : workingDays;
  }, [state.sprintStart, state.skipFirstDay]);

  const plannedByTicket = useMemo(() => {
    const counts = {};
    Object.values(state.assignments).forEach((ticketId) => {
      counts[ticketId] = (counts[ticketId] || 0) + 4;
    });
    return counts;
  }, [state.assignments]);

  const assignedDeveloperByTicket = useMemo(() => {
    const devCountsByTicket = {};
    Object.entries(state.assignments).forEach(([assignmentKey, ticketId]) => {
      const [devId] = assignmentKey.split("|");
      if (!devId || !ticketId) return;
      if (!devCountsByTicket[ticketId]) devCountsByTicket[ticketId] = {};
      devCountsByTicket[ticketId][devId] = (devCountsByTicket[ticketId][devId] || 0) + 1;
    });

    const ownerByTicket = {};
    Object.entries(devCountsByTicket).forEach(([ticketId, devCounts]) => {
      const topDev = Object.entries(devCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topDev) ownerByTicket[ticketId] = topDev;
    });
    return ownerByTicket;
  }, [state.assignments]);

  const developerColorById = useMemo(() => {
    const colors = {};
    state.developers.forEach((dev, index) => {
      const hue = (index * 67) % 360;
      colors[dev.id] = `hsl(${hue} 55% 92%)`;
    });
    return colors;
  }, [state.developers]);

  const refreshSavedSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) throw new Error(`Unable to list sessions (${res.status})`);
      const body = await res.json();
      setSavedSessions(body.sessions || []);
    } catch (error) {
      setSessionStatus(`Unable to load saved sessions: ${String(error.message || error)}`);
    }
  }, []);

  const applyLoadedSession = useCallback((session) => {
    const loadedState = session?.state;
    if (!loadedState || typeof loadedState !== "object") {
      throw new Error("Session payload is invalid.");
    }

    setState({
      ...emptyState(),
      ...loadedState,
      jira: normalizeJiraSettings(loadedState.jira)
    });

    if (session?.name) {
      setSessionName(session.name);
      setIsDefaultSessionName(false);
    }
  }, []);

  const loadSessionById = useCallback(
    async (id) => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Unable to load session (${res.status})`);
      }

      const body = await res.json();
      const session = body?.session;
      applyLoadedSession(session);
      return session;
    },
    [applyLoadedSession]
  );

  const loadSessionByName = useCallback(
    async (name) => {
      const res = await fetch(`/api/sessions?name=${encodeURIComponent(name)}`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Unable to load session (${res.status})`);
      }

      const body = await res.json();
      const session = body?.session;
      applyLoadedSession(session);
      return session;
    },
    [applyLoadedSession]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const querySession = new URLSearchParams(window.location.search).get("session");
    setSessionParam(String(querySession || "").trim());
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setState({
          ...emptyState(),
          ...parsed,
          jira: normalizeJiraSettings(parsed.jira)
        });
      } catch {
        setState(emptyState());
      }
    }
    void refreshSavedSessions();
  }, [refreshSavedSessions]);

  useEffect(() => {
    if (!isDefaultSessionName) return;
    setSessionName(buildDefaultSessionName(state.sprintStart));
  }, [isDefaultSessionName, state.sprintStart]);

  useEffect(() => {
    if (!sessionParam) return;

    setSessionStatus("Loading session from URL...");
    void (async () => {
      try {
        let loaded;
        try {
          loaded = await loadSessionById(sessionParam);
        } catch {
          loaded = await loadSessionByName(sessionParam);
        }

        setSessionStatus(`Loaded "${loaded.name}" from URL parameter.`);
      } catch (error) {
        setSessionStatus(`Unable to load URL session: ${String(error.message || error)}`);
      }
    })();
  }, [sessionParam, loadSessionById, loadSessionByName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addDeveloper = () => {
    const name = devName.trim();
    if (!name) return;
    const dev = { id: makeId("dev"), name };
    setState((prev) => ({ ...prev, developers: [...prev.developers, dev] }));
    setDevName("");
    setAssignForm((prev) => ({ ...prev, devId: prev.devId || dev.id }));
  };

  const assignSlot = () => {
    const { devId, dayIso, slot, ticketId } = assignForm;
    if (!devId || !dayIso || !slot || !ticketId) return;
    const targetSlotKey = slotKey(devId, dayIso, slot);
    setState((prev) => ({
      ...prev,
      assignments: placeTicketForward(prev, ticketId, targetSlotKey)
    }));
  };

  const clearSlot = () => {
    const { devId, dayIso, slot } = assignForm;
    if (!devId || !dayIso || !slot) return;
    const key = slotKey(devId, dayIso, slot);
    clearSlotByKey(key);
  };

  const clearSlotByKey = (key) => {
    setState((prev) => {
      const next = { ...prev.assignments };
      delete next[key];
      return { ...prev, assignments: next };
    });
  };

  const clearTicketAssignments = (ticketId) => {
    setState((prev) => {
      const next = {};
      Object.entries(prev.assignments).forEach(([key, assignedTicketId]) => {
        if (assignedTicketId !== ticketId) next[key] = assignedTicketId;
      });
      return { ...prev, assignments: next };
    });
  };

  const getForwardSlotKeysForDeveloper = (devId, startDayIso, startSlot) => {
    const startDayIndex = days.indexOf(startDayIso);
    if (startDayIndex === -1) return [];

    const orderedSlots = [];
    for (let i = startDayIndex; i < days.length; i += 1) {
      const day = days[i];
      if (i === startDayIndex) {
        if (startSlot === "AM") {
          orderedSlots.push(slotKey(devId, day, "AM"), slotKey(devId, day, "PM"));
        } else {
          orderedSlots.push(slotKey(devId, day, "PM"));
        }
      } else {
        orderedSlots.push(slotKey(devId, day, "AM"), slotKey(devId, day, "PM"));
      }
    }
    return orderedSlots;
  };

  const placeTicketForward = (prev, ticketId, targetSlotKey) => {
    const [devId, dayIso, slot] = targetSlotKey.split("|");
    if (!devId || !dayIso || !slot) return prev.assignments;

    const ticket = prev.tickets.find((t) => t.id === ticketId);
    if (!ticket) return prev.assignments;

    const requiredSlots = Math.max(1, Math.ceil(ticket.hours / 4));
    const forwardSlotKeys = getForwardSlotKeysForDeveloper(devId, dayIso, slot);
    if (!forwardSlotKeys.length) return prev.assignments;
    if (prev.blockedSlots?.[targetSlotKey]) return prev.assignments;

    const nextAssignments = {};
    Object.entries(prev.assignments).forEach(([key, assignedTicketId]) => {
      if (assignedTicketId !== ticketId) nextAssignments[key] = assignedTicketId;
    });

    let placed = 0;
    for (let i = 0; i < forwardSlotKeys.length && placed < requiredSlots; i += 1) {
      const key = forwardSlotKeys[i];
      if (prev.blockedSlots?.[key]) continue;
      if (i === 0) {
        nextAssignments[key] = ticketId;
        placed += 1;
        continue;
      }
      if (!nextAssignments[key]) {
        nextAssignments[key] = ticketId;
        placed += 1;
      }
    }

    return nextAssignments;
  };

  const startDraggingTicket = (event, ticketId, fromSlotKey = "") => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify({ ticketId, fromSlotKey }));
  };

  const handleDragOverSlot = (event, targetSlotKey) => {
    if (state.blockedSlots?.[targetSlotKey]) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverSlotKey(targetSlotKey);
  };

  const handleDropOnSlot = (event, targetSlotKey) => {
    if (state.blockedSlots?.[targetSlotKey]) return;
    event.preventDefault();
    setDragOverSlotKey("");

    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (!payload.ticketId) return;

    setState((prev) => {
      const ticketExists = prev.tickets.some((ticket) => ticket.id === payload.ticketId);
      if (!ticketExists) return prev;

      return {
        ...prev,
        assignments: placeTicketForward(prev, payload.ticketId, targetSlotKey)
      };
    });
  };

  const toggleSlotBlocked = (targetSlotKey) => {
    setDragOverSlotKey((current) => (current === targetSlotKey ? "" : current));
    setState((prev) => {
      const isBlocked = Boolean(prev.blockedSlots?.[targetSlotKey]);
      const nextBlockedSlots = { ...(prev.blockedSlots || {}) };
      if (isBlocked) {
        delete nextBlockedSlots[targetSlotKey];
      } else {
        nextBlockedSlots[targetSlotKey] = true;
      }

      const nextAssignments = { ...prev.assignments };
      if (!isBlocked && nextAssignments[targetSlotKey]) {
        delete nextAssignments[targetSlotKey];
      }

      return {
        ...prev,
        blockedSlots: nextBlockedSlots,
        assignments: nextAssignments
      };
    });
  };

  const removeDeveloper = (devId) => {
    setState((prev) => {
      const nextAssignments = {};
      Object.entries(prev.assignments).forEach(([k, v]) => {
        if (!k.startsWith(`${devId}|`)) nextAssignments[k] = v;
      });

      const nextBlockedSlots = {};
      Object.entries(prev.blockedSlots || {}).forEach(([k, v]) => {
        if (!k.startsWith(`${devId}|`)) nextBlockedSlots[k] = v;
      });

      return {
        ...prev,
        developers: prev.developers.filter((d) => d.id !== devId),
        assignments: nextAssignments,
        blockedSlots: nextBlockedSlots
      };
    });
  };

  const removeTicket = (ticketId) => {
    setState((prev) => {
      const nextAssignments = {};
      Object.entries(prev.assignments).forEach(([k, v]) => {
        if (v !== ticketId) nextAssignments[k] = v;
      });
      return {
        ...prev,
        tickets: prev.tickets.filter((t) => t.id !== ticketId),
        assignments: nextAssignments
      };
    });
  };

  const saveNamedSession = () => {
    const name = sessionName.trim();
    if (!name) return;
    setSessionStatus("Saving session...");
    void (async () => {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ name, state })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Unable to save session (${res.status})`);
        }
        await refreshSavedSessions();
        setSessionStatus(`Saved "${name}" to the database.`);
      } catch (error) {
        setSessionStatus(`Unable to save session: ${String(error.message || error)}`);
      }
    })();
  };

  const loadNamedSession = (name) => {
    const found = savedSessions.find((s) => s.name === name);
    if (!found?.id) return;
    setSessionStatus(`Loading "${name}"...`);
    void (async () => {
      try {
        const loaded = await loadSessionById(found.id);
        setSessionStatus(`Loaded "${loaded.name}" from the database.`);
      } catch (error) {
        setSessionStatus(`Unable to load session: ${String(error.message || error)}`);
      }
    })();
  };

  const loadJiraTickets = async () => {
    setJiraStatus("Loading Jira issues...");
    try {
      const res = await fetch("/api/jira/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          jql: state.jira.jql
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Jira request failed (${res.status})`);
      }

      const body = await res.json();
      const imported = (body.issues || []).map((issue) => {
        const fields = issue.fields || {};
        const estSec = fields.timeestimate || fields.timeoriginalestimate || 14400;
        const estimatedHours = Math.max(4, Math.ceil(estSec / 3600 / 4) * 4);
        return {
          id: makeId("ticket"),
          key: issue.key,
          summary: fields.summary || "",
          hours: estimatedHours
        };
      });

      setState((prev) => ({
        ...prev,
        tickets: imported
      }));
      setJiraStatus(`Loaded ${imported.length} issues from Jira.`);
    } catch (error) {
      setJiraStatus(`Unable to load Jira issues: ${String(error.message || error)}`);
    }
  };

  const mapJiraIssueToTicket = (issue) => {
    const fields = issue.fields || {};
    const estSec = fields.timeestimate || fields.timeoriginalestimate || 14400;
    const estimatedHours = Math.max(4, Math.ceil(estSec / 3600 / 4) * 4);
    return {
      id: makeId("ticket"),
      key: issue.key,
      summary: fields.summary || "",
      hours: estimatedHours
    };
  };

  const loadSingleIssueByKey = async (issueKey) => {
    const res = await fetch("/api/jira/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        jql: `issuekey = "${issueKey}"`
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Jira request failed (${res.status})`);
    }
    const body = await res.json();
    return (body.issues || [])[0] || null;
  };

  const findIssueAndAddTicket = async () => {
    const raw = issueLookup.trim().toUpperCase();
    if (!raw) {
      setIssueLookupStatus("Enter an issue key or number first.");
      return;
    }

    const validIssueKeyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;
    const validIssueNumberPattern = /^\d+$/;
    const knownProjectPrefixes = Array.from(
      new Set(
        state.tickets
          .map((ticket) => String(ticket.key || "").toUpperCase())
          .filter((ticketKey) => validIssueKeyPattern.test(ticketKey))
          .map((ticketKey) => ticketKey.split("-")[0])
      )
    );

    const issueKeysToTry = validIssueKeyPattern.test(raw)
      ? [raw]
      : validIssueNumberPattern.test(raw)
        ? knownProjectPrefixes.map((prefix) => `${prefix}-${raw}`)
        : [];

    if (!issueKeysToTry.length) {
      setIssueLookupStatus(
        validIssueNumberPattern.test(raw)
          ? "Load Jira tickets first or search with a full key like ABC-123."
          : "Use a valid issue key (ABC-123) or number."
      );
      return;
    }

    setIssueLookupStatus(`Searching ${issueKeysToTry.length > 1 ? "matching keys" : "issue"}...`);

    try {
      let foundIssue = null;
      for (const issueKey of issueKeysToTry) {
        // Jira issue numbers are project-scoped, so number-only search may need multiple project prefixes.
        // Try known project prefixes one by one and stop at the first hit.
        const issue = await loadSingleIssueByKey(issueKey);
        if (issue) {
          foundIssue = issue;
          break;
        }
      }

      if (!foundIssue) {
        setIssueLookupStatus(
          issueKeysToTry.length > 1
            ? `No issue found for #${raw} in loaded projects.`
            : `No issue found for ${issueKeysToTry[0]}.`
        );
        return;
      }

      const ticket = mapJiraIssueToTicket(foundIssue);
      const alreadyExists = state.tickets.some((current) => current.key === ticket.key);
      if (alreadyExists) {
        setIssueLookupStatus(`${ticket.key} is already in the ticket list.`);
        return;
      }

      setState((prev) => {
        return {
          ...prev,
          tickets: [ticket, ...prev.tickets]
        };
      });
      setIssueLookupStatus(`Added ${ticket.key}. You can now drag it into the planner.`);
    } catch (error) {
      setIssueLookupStatus(`Unable to find Jira issue: ${String(error.message || error)}`);
    }
  };

  return (
    <main className="mx-auto grid gap-4 p-6">
      <h1 className="mb-2 text-3xl font-semibold">Sprint Planner</h1>
      <p className="text-sm text-slate-500">
        Plan a 2-week sprint (10 working days), with AM/PM 4-hour slots per developer.
      </p>

      <section className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
        <h2 className="mb-2 text-xl font-semibold">Sprint Setup</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium">Sprint start date</label>
          <input
            className={controlClass}
            type="date"
            value={state.sprintStart}
            onChange={(e) => setState((p) => ({ ...p, sprintStart: e.target.value }))}
          />
          <label className="text-sm font-medium">Skip first sprint day</label>
          <select
            className={controlClass}
            value={state.skipFirstDay ? "yes" : "no"}
            onChange={(e) =>
              setState((p) => ({ ...p, skipFirstDay: e.target.value === "yes" }))
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </section>

      <section className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
        <h2 className="mb-2 text-xl font-semibold">Session Save/Load (database)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${controlClass} min-w-56`}
            placeholder="Session name"
            value={sessionName}
            onChange={(e) => {
              setSessionName(e.target.value);
              setIsDefaultSessionName(false);
            }}
          />
          <button className={primaryButtonClass} onClick={saveNamedSession}>
            Save Session
          </button>
          <select
            className={`${controlClass} min-w-56`}
            onChange={(e) => loadNamedSession(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>
              Load saved session
            </option>
            {savedSessions.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button className={secondaryButtonClass} onClick={refreshSavedSessions}>
            Refresh
          </button>
        </div>
        <p className="text-xs text-slate-500">{sessionStatus}</p>
      </section>

      <section className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
        <h2 className="mb-2 text-xl font-semibold">Developers</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${controlClass} min-w-56`}
            placeholder="Developer name"
            value={devName}
            onChange={(e) => setDevName(e.target.value)}
          />
          <button className={primaryButtonClass} onClick={addDeveloper}>
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.developers.map((dev) => (
            <button
              key={dev.id}
              className="h-9 rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm font-medium text-slate-800 shadow-sm"
              onClick={() => removeDeveloper(dev.id)}
            >
              {dev.name} ×
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
        <h2 className="mb-2 text-xl font-semibold">Jira Import</h2>
        <p className="text-xs text-slate-500">
          Requests are sent through this app server to avoid browser CORS blocks.
        </p>
        <p className="text-xs text-slate-500">
          Set Jira server values in .env: JIRA_EMAIL, and JIRA_API_TOKEN.
        </p>
        <div className="grid items-center gap-2 md:grid-cols-[160px_minmax(250px,1fr)]">
          <label className="text-sm font-medium">JQL</label>
          <input
            className={`${controlClass} w-full`}
            value={state.jira.jql}
            onChange={(e) => setState((p) => ({ ...p, jira: { ...p.jira, jql: e.target.value } }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={primaryButtonClass} onClick={loadJiraTickets}>
            Load Jira Tickets
          </button>
          <span className="text-xs text-slate-500">{jiraStatus}</span>
        </div>
      </section>

      <div className="flex gap-4 flex-col xl:flex-row overflow-scroll scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-slate-300 scrollbar-track-slate-100">
        <section className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
          <h2 className="mb-2 text-xl font-semibold">Tickets</h2>
          <p className="text-xs text-slate-500">Drag ticket rows into AM/PM cells to plan them.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${controlClass} min-w-56`}
              placeholder="Issue number or key (e.g. 123 or ABC-123)"
              value={issueLookup}
              onChange={(event) => setIssueLookup(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void findIssueAndAddTicket();
              }}
            />
            <button className={secondaryButtonClass} type="button" onClick={() => void findIssueAndAddTicket()}>
              Find issue
            </button>
            <span className="text-xs text-slate-500">{issueLookupStatus}</span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-200 p-2 text-left align-top font-semibold">Key</th>
                <th className="border border-slate-200 p-2 text-left align-top font-semibold">Summary</th>
                <th className="border border-slate-200 p-2 text-left align-top font-semibold">Est. (h)</th>
                <th className="border border-slate-200 p-2 text-left align-top font-semibold">
                  Planned (h)
                </th>
                {/* <th className="border border-slate-200 p-2 text-left align-top font-semibold" /> */}
              </tr>
            </thead>
            <tbody>
              {state.tickets.map((ticket) => {
                const isScheduled = Boolean(plannedByTicket[ticket.id]);
                const assignedDevId = assignedDeveloperByTicket[ticket.id];
                const scheduledCellStyle =
                  isScheduled && assignedDevId
                    ? { backgroundColor: developerColorById[assignedDevId] }
                    : undefined;
                return (
                  <tr
                    key={ticket.id}
                    className={`${isScheduled ? "cursor-default text-slate-600" : "cursor-grab active:cursor-grabbing"}`}
                    draggable={!isScheduled}
                    onDragStart={
                      isScheduled ? undefined : (event) => startDraggingTicket(event, ticket.id)
                    }
                  >
                    <td className="border border-slate-200 p-2 text-left align-top" style={scheduledCellStyle}>
                      {ticket.key}
                    </td>
                    <td className="border border-slate-200 p-2 text-left align-top" style={scheduledCellStyle}>
                      {ticket.summary}
                    </td>
                    <td className="border border-slate-200 p-2 text-left align-top" style={scheduledCellStyle}>
                      {ticket.hours}
                    </td>
                    <td className="border border-slate-200 p-2 text-left align-top" style={scheduledCellStyle}>
                      {plannedByTicket[ticket.id] || 0}
                    </td>
                    {/* <td className="border border-slate-200 p-2 text-left align-top" style={scheduledCellStyle}>
                      <button
                        className="h-auto border-0 bg-transparent p-0 text-sm text-red-700"
                        onClick={() => removeTicket(ticket.id)}
                      >
                        Remove
                      </button>
                    </td> */}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* <section className="grid gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
          <h2 className="mb-2 text-xl font-semibold">Assign Slot</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={controlClass}
              value={assignForm.devId}
              onChange={(e) => setAssignForm((p) => ({ ...p, devId: e.target.value }))}
            >
              <option value="">Developer</option>
              {state.developers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className={controlClass}
              value={assignForm.dayIso}
              onChange={(e) => setAssignForm((p) => ({ ...p, dayIso: e.target.value }))}
            >
              <option value="">Day</option>
              {days.map((day) => (
                <option key={day} value={day}>
                  {dayLabel(day)}
                </option>
              ))}
            </select>
            <select
              className={controlClass}
              value={assignForm.slot}
              onChange={(e) => setAssignForm((p) => ({ ...p, slot: e.target.value }))}
            >
              <option value="AM">AM (4h)</option>
              <option value="PM">PM (4h)</option>
            </select>
            <select
              className={controlClass}
              value={assignForm.ticketId}
              onChange={(e) => setAssignForm((p) => ({ ...p, ticketId: e.target.value }))}
            >
              <option value="">Ticket</option>
              {state.tickets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} - {t.summary}
                </option>
              ))}
            </select>
            <button className={primaryButtonClass} onClick={assignSlot}>
              Assign
            </button>
            <button className={secondaryButtonClass} onClick={clearSlot}>
              Clear
            </button>
          </div>
        </section> */}

        <section className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-3.5">
          <h2 className="mb-2 text-xl font-semibold">Sprint Day View</h2>
          <p className="text-xs text-slate-500">
            You can drag tickets between slots, remove planned slots, and block AM/PM cells directly in the grid.
          </p>
          <div className="overflow-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr>
                  <th className="min-w-[150px] border border-slate-200 p-2 text-left align-top font-semibold">
                    Developer
                  </th>
                  {days.map((day) => (
                    <th
                      key={day}
                      className="min-w-[120px] border border-slate-200 p-2 text-left align-top font-semibold"
                    >
                      {dayLabel(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.developers.map((dev) => (
                  <tr key={dev.id}>
                    <td className="sticky left-0 z-10 min-w-[150px] border border-slate-200 bg-white p-2 text-left align-top">
                      {dev.name}
                    </td>
                    {days.map((day) => (
                      <td
                        key={`${dev.id}-${day}`}
                        className="min-w-[120px] border border-slate-200 p-2 text-left align-top"
                      >
                        <div className="grid gap-1.5">
                          {["AM", "PM"].map((slot) => {
                            const currentSlotKey = slotKey(dev.id, day, slot);
                            const ticketId = state.assignments[currentSlotKey];
                            const ticket = state.tickets.find((t) => t.id === ticketId);
                            const isBlocked = Boolean(state.blockedSlots?.[currentSlotKey]);

                            return (
                              <div className="grid grid-cols-[30px_1fr] items-stretch gap-1.5" key={`${dev.id}-${day}-${slot}`}>
                                <div className="flex items-center text-xs font-semibold text-slate-500">
                                  {slot}
                                </div>
                                <div
                                  className={`min-h-[52px] rounded-md p-1.5 transition-colors ${
                                    isBlocked
                                      ? "bg-red-100"
                                      : dragOverSlotKey === currentSlotKey
                                        ? "bg-blue-50"
                                        : ""
                                  }`}
                                  onDragOver={(event) => handleDragOverSlot(event, currentSlotKey)}
                                  onDrop={(event) => handleDropOnSlot(event, currentSlotKey)}
                                  onDragLeave={() =>
                                    setDragOverSlotKey((current) =>
                                      current === currentSlotKey ? "" : current
                                    )
                                  }
                                >
                                  {isBlocked ? (
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-xs font-semibold text-red-800">Blocked</span>
                                      <button
                                        type="button"
                                        className="h-[22px] min-w-[22px] rounded-full border border-slate-300 bg-white p-0 text-xs leading-none text-slate-600"
                                        onClick={() => toggleSlotBlocked(currentSlotKey)}
                                      >
                                        ↺
                                      </button>
                                    </div>
                                  ) : ticket ? (
                                    <div
                                      className="flex cursor-grab justify-between gap-2 active:cursor-grabbing"
                                      draggable
                                      onDragStart={(event) =>
                                        startDraggingTicket(event, ticket.id, currentSlotKey)
                                      }
                                    >
                                      <div>
                                        <div className="font-semibold">{ticket.key}</div>
                                        <div className="text-xs text-slate-700">{ticket.summary}</div>
                                      </div>
                                      <button
                                        type="button"
                                        className="h-[22px] min-w-[22px] rounded-full border border-slate-300 bg-white p-0 text-sm leading-none text-slate-500"
                                        onClick={() => clearTicketAssignments(ticket.id)}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-xs text-slate-500">Free</span>
                                      <button
                                        type="button"
                                        className="h-[22px] min-w-[22px] rounded-full border border-slate-300 bg-white p-0 text-xs leading-none text-slate-600"
                                        onClick={() => toggleSlotBlocked(currentSlotKey)}
                                      >
                                        Block
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
