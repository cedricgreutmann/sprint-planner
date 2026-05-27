"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ISSUE_PROJECT_KEY = "IWA";
const DEFAULT_JQL = `project = ${ISSUE_PROJECT_KEY} AND statusCategory != Done ORDER BY priority DESC`;
const controlClass = "input input-bordered input-sm";
const primaryButtonClass = "btn btn-primary btn-sm";
const secondaryButtonClass = "btn btn-outline btn-sm";
const accordionClass = "collapse collapse-plus rounded-box border border-base-300 bg-base-100 shadow-sm";

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

function getWorkingDays(startIso, count = 9) {
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

function extractProjectKeyFromJql(jql) {
  const input = String(jql || "");
  const match = input.match(/\bproject\s*=\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))/i);
  return String(match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function buildDefaultSessionName(startIso, locale = "en-GB", nextSprintNumber = "") {
  if (nextSprintNumber) {
    return `sprint-${nextSprintNumber}`;
  }
  const d = fromIsoDate(startIso);
  const formattedDate = d.toLocaleDateString(locale, {
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

function hasPlannerData(value) {
  if (!value || typeof value !== "object") return false;
  const developers = Array.isArray(value.developers) ? value.developers : [];
  const tickets = Array.isArray(value.tickets) ? value.tickets : [];
  const assignments =
    value.assignments && typeof value.assignments === "object" ? value.assignments : {};
  const blockedSlots =
    value.blockedSlots && typeof value.blockedSlots === "object" ? value.blockedSlots : {};
  return (
    developers.length > 0 ||
    tickets.length > 0 ||
    Object.keys(assignments).length > 0 ||
    Object.keys(blockedSlots).length > 0
  );
}

function accordionDefaults(dataPresent) {
  if (dataPresent) {
    return {
      sprintSetup: false,
      sessionSaveLoad: false,
      developers: false,
      jiraImport: true
    };
  }

  return {
    sprintSetup: true,
    sessionSaveLoad: true,
    developers: true,
    jiraImport: false
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
  const [developerStatus, setDeveloperStatus] = useState("");
  const [dateLocale, setDateLocale] = useState("en-GB");
  const [sessionName, setSessionName] = useState(() => buildDefaultSessionName(todayIso(), "en-GB"));
  const [isDefaultSessionName, setIsDefaultSessionName] = useState(true);
  const [savedSessions, setSavedSessions] = useState([]);
  const [sessionStatus, setSessionStatus] = useState("");
  const [dragOverSlotKey, setDragOverSlotKey] = useState("");
  const [sessionParam, setSessionParam] = useState("");
  const [issueLookup, setIssueLookup] = useState("");
  const [issueLookupStatus, setIssueLookupStatus] = useState("");
  const [accordionOpen, setAccordionOpen] = useState(() => accordionDefaults(false));
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [nextSprintId, setNextSprintId] = useState("");
  const [nextSprintNumber, setNextSprintNumber] = useState("");
  const assignmentUpdateOriginRef = useRef("");
  const previousAssignedDeveloperByTicketRef = useRef({});
  const searchedTicketKeysRef = useRef(new Set());
  const issueLookupValueRef = useRef("");

  const days = useMemo(() => {
    const workingDays = getWorkingDays(state.sprintStart, state.skipFirstDay ? 10 : 9);
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
    const safeHues = [210, 165, 260, 48, 130, 285, 195, 95];
    const colors = {};
    state.developers.forEach((dev, index) => {
      const hue = safeHues[index % safeHues.length];
      const lightness = index % 2 === 0 ? 92 : 88;
      colors[dev.id] = `hsl(${hue} 55% ${lightness}%)`;
    });
    return colors;
  }, [state.developers]);

  const freeDaysByDeveloper = useMemo(() => {
    const result = {};
    state.developers.forEach((dev) => {
      let freeSlots = 0;
      days.forEach((day) => {
        ["AM", "PM"].forEach((slot) => {
          const key = slotKey(dev.id, day, slot);
          const isBlocked = Boolean(state.blockedSlots?.[key]);
          const hasAssignment = Boolean(state.assignments?.[key]);
          if (!isBlocked && !hasAssignment) freeSlots += 1;
        });
      });
      result[dev.id] = freeSlots / 2;
    });
    return result;
  }, [days, state.assignments, state.blockedSlots, state.developers]);

  const ticketsById = useMemo(() => {
    const byId = {};
    state.tickets.forEach((ticket) => {
      byId[ticket.id] = ticket;
    });
    return byId;
  }, [state.tickets]);

  const developersById = useMemo(() => {
    const byId = {};
    state.developers.forEach((developer) => {
      byId[developer.id] = developer;
    });
    return byId;
  }, [state.developers]);

  const downloadSprintDayViewXlsx = async () => {
    const exceljsModule = await import("exceljs");
    const Workbook = exceljsModule.Workbook || exceljsModule.default?.Workbook;
    if (!Workbook) {
      throw new Error("ExcelJS Workbook export is unavailable.");
    }

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Sprint Day View");

    const slotExport = (devId, day, slot) => {
      const key = slotKey(devId, day, slot);
      if (state.blockedSlots?.[key]) return { text: "Blocked", kind: "blocked" };
      const ticketId = state.assignments?.[key];
      if (!ticketId) return { text: "Free", kind: "free" };
      const ticket = ticketsById[ticketId];
      return {
        text: ticket ? `${ticket.key} - ${ticket.summary}` : String(ticketId),
        kind: "assigned"
      };
    };

    const totalColumns = 2 + days.length;
    worksheet.columns = [
      { width: 24 },
      { width: 10 },
      ...Array.from({ length: totalColumns - 2 }, () => ({ width: 24 }))
    ];
    worksheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

    worksheet.getCell(1, 1).value = "Developer";
    worksheet.getCell(1, 2).value = "Slot";
    days.forEach((day, index) => {
      const col = 3 + index;
      worksheet.getCell(1, col).value = dayLabel(day);
    });

    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF4FB" } };
    for (let col = 1; col <= totalColumns; col += 1) {
      const cell = worksheet.getCell(1, col);
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = headerFill;
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D7DE" } },
        left: { style: "thin", color: { argb: "FFD0D7DE" } },
        bottom: { style: "thin", color: { argb: "FFD0D7DE" } },
        right: { style: "thin", color: { argb: "FFD0D7DE" } }
      };
    }

    state.developers.forEach((dev, devIndex) => {
      const amRowNumber = 2 + devIndex * 2;
      const pmRowNumber = amRowNumber + 1;
      const amRow = worksheet.getRow(amRowNumber);
      const pmRow = worksheet.getRow(pmRowNumber);
      const freeDays = freeDaysByDeveloper[dev.id] ?? 0;
      worksheet.mergeCells(amRowNumber, 1, pmRowNumber, 1);
      const devCell = worksheet.getCell(amRowNumber, 1);
      devCell.value = `${dev.name} (${freeDays} free day${freeDays === 1 ? "" : "s"})`;
      devCell.font = { bold: true };
      devCell.alignment = { vertical: "middle", wrapText: true };

      amRow.getCell(2).value = "AM";
      pmRow.getCell(2).value = "PM";
      amRow.getCell(2).font = { bold: true };
      pmRow.getCell(2).font = { bold: true };
      amRow.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      pmRow.getCell(2).alignment = { horizontal: "center", vertical: "middle" };

      days.forEach((day, dayIndex) => {
        const col = 3 + dayIndex;
        const am = slotExport(dev.id, day, "AM");
        const pm = slotExport(dev.id, day, "PM");
        const cells = [
          { row: amRow, value: am },
          { row: pmRow, value: pm }
        ];

        cells.forEach(({ row, value }) => {
          const cell = row.getCell(col);
          cell.value = value.text;
          cell.alignment = { vertical: "top", wrapText: true };
          if (value.kind === "blocked") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } };
          } else if (value.kind === "assigned") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFFBF2" } };
          }
        });
      });

      [amRow, pmRow].forEach((row) => {
        for (let col = 1; col <= totalColumns; col += 1) {
          const cell = row.getCell(col);
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } }
          };
        }
        row.height = 30;
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sprint-day-view-${state.sprintStart}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

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
    setAccordionOpen(accordionDefaults(hasPlannerData(loadedState)));

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
    const locale = String(window.navigator?.language || "").trim();
    if (locale) {
      setDateLocale(locale);
    }
  }, []);

  useEffect(() => {
    issueLookupValueRef.current = issueLookup;
  }, [issueLookup]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const querySession = params.get("session") || params.get("sessions");
    setSessionParam(String(querySession || "").trim());
    setState(emptyState());
    setAccordionOpen(accordionDefaults(false));
    void refreshSavedSessions();
  }, [refreshSavedSessions]);

  useEffect(() => {
    if (!isDefaultSessionName) return;
    setSessionName(buildDefaultSessionName(state.sprintStart, dateLocale, nextSprintNumber));
  }, [isDefaultSessionName, state.sprintStart, dateLocale, nextSprintNumber]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/jira/next-sprint", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store"
        });
        if (!res.ok) return;
        const body = await res.json();
        const sprintId = String(body?.id || "").trim();
        const number = String(body?.number || "").trim();
        if (!cancelled) {
          if (sprintId) setNextSprintId(sprintId);
          if (number) setNextSprintNumber(number);
        }
      } catch {
        // Keep the date-based fallback session name if Jira sprint lookup is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const addDeveloper = () => {
    const name = devName.trim();
    if (!name) return;
    setDeveloperStatus(`Checking Jira users for "${name}"...`);
    void (async () => {
      let linkedJiraUser = null;
      try {
        const res = await fetch("/api/jira/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            query: name,
            projectKey: extractProjectKeyFromJql(state.jira.jql)
          })
        });

        if (res.ok) {
          const body = await res.json();
          const users = Array.isArray(body?.users) ? body.users : [];
          const exactMatch = users.find(
            (user) => String(user?.displayName || "").trim().toLowerCase() === name.toLowerCase()
          );
          linkedJiraUser = exactMatch || (users.length === 1 ? users[0] : null);
        }
      } catch {
        // Keep local developer creation available even when Jira lookup is unavailable.
      }

      const dev = {
        id: makeId("dev"),
        name,
        jiraAccountId: linkedJiraUser?.accountId || "",
        jiraDisplayName: linkedJiraUser?.displayName || ""
      };

      setState((prev) => ({ ...prev, developers: [...prev.developers, dev] }));
      setDevName("");
      setAssignForm((prev) => ({ ...prev, devId: prev.devId || dev.id }));
      setDeveloperStatus(
        linkedJiraUser
          ? `Added "${name}" and linked Jira user "${linkedJiraUser.displayName}".`
          : `Added "${name}" without a Jira link. Assignments to this developer won't sync to Jira.`
      );
    })();
  };

  const assignSlot = () => {
    const { devId, dayIso, slot, ticketId } = assignForm;
    if (!devId || !dayIso || !slot || !ticketId) return;
    const targetSlotKey = slotKey(devId, dayIso, slot);
    assignmentUpdateOriginRef.current = "user";
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
    assignmentUpdateOriginRef.current = "user";
    setState((prev) => {
      const next = { ...prev.assignments };
      delete next[key];
      return { ...prev, assignments: next };
    });
  };

  const clearTicketAssignments = (ticketId) => {
    assignmentUpdateOriginRef.current = "user";
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

    assignmentUpdateOriginRef.current = "user";
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
    assignmentUpdateOriginRef.current = "user";
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
    assignmentUpdateOriginRef.current = "user";
    setState((prev) => {
      const ticketToRemove = prev.tickets.find((t) => t.id === ticketId);
      if (ticketToRemove?.key) {
        searchedTicketKeysRef.current.delete(ticketToRemove.key);
      }
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
      const importedDevelopersByAccountId = {};
      const imported = (body.issues || []).map((issue) => {
        const fields = issue.fields || {};
        const estSec = fields.timeestimate || fields.timeoriginalestimate || 14400;
        const estimatedHours = Math.max(4, Math.ceil(estSec / 3600 / 4) * 4);
        const assignee = fields.assignee || null;
        if (assignee?.accountId && assignee?.displayName) {
          importedDevelopersByAccountId[assignee.accountId] = {
            accountId: assignee.accountId,
            displayName: assignee.displayName
          };
        }
        return {
          id: makeId("ticket"),
          key: issue.key,
          summary: fields.summary || "",
          hours: estimatedHours
        };
      });

      setState((prev) => ({
        ...prev,
        tickets: imported,
        developers: (() => {
          const importedDevelopers = Object.values(importedDevelopersByAccountId);
          if (!importedDevelopers.length) return prev.developers;

          const nextDevelopers = [...prev.developers];
          importedDevelopers.forEach((jiraDeveloper) => {
            const accountId = String(jiraDeveloper.accountId || "").trim();
            const displayName = String(jiraDeveloper.displayName || "").trim();
            if (!accountId || !displayName) return;

            const byAccount = nextDevelopers.find((dev) => dev.jiraAccountId === accountId);
            if (byAccount) return;

            const byName = nextDevelopers.find(
              (dev) =>
                !dev.jiraAccountId && String(dev.name || "").trim().toLowerCase() === displayName.toLowerCase()
            );
            if (byName) {
              const byNameIndex = nextDevelopers.findIndex((dev) => dev.id === byName.id);
              if (byNameIndex !== -1) {
                nextDevelopers[byNameIndex] = {
                  ...byName,
                  jiraAccountId: accountId,
                  jiraDisplayName: displayName
                };
              }
              return;
            }

            nextDevelopers.push({
              id: makeId("dev"),
              name: displayName,
              jiraAccountId: accountId,
              jiraDisplayName: displayName
            });
          });
          return nextDevelopers;
        })()
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

  const clearSearchedTickets = () => {
    if (!searchedTicketKeysRef.current.size) return;
    const searchedKeys = new Set(searchedTicketKeysRef.current);
    assignmentUpdateOriginRef.current = "user";
    setState((prev) => {
      const ticketIdsToRemove = new Set(
        prev.tickets.filter((ticket) => searchedKeys.has(ticket.key)).map((ticket) => ticket.id)
      );
      if (!ticketIdsToRemove.size) return prev;

      const nextTickets = prev.tickets.filter((ticket) => !ticketIdsToRemove.has(ticket.id));
      const nextAssignments = {};
      Object.entries(prev.assignments || {}).forEach(([key, ticketId]) => {
        if (!ticketIdsToRemove.has(ticketId)) nextAssignments[key] = ticketId;
      });

      return { ...prev, tickets: nextTickets, assignments: nextAssignments };
    });
    searchedTicketKeysRef.current.clear();
  };

  useEffect(() => {
    if (issueLookup.trim()) return;
    clearSearchedTickets();
  }, [issueLookup, state.assignments, state.tickets]);

  const findIssueAndAddTicket = async () => {
    const raw = issueLookup.trim();
    if (!raw) {
      setIssueLookupStatus("Enter an issue number first.");
      return;
    }

    const validIssueNumberPattern = /^\d+$/;
    if (!validIssueNumberPattern.test(raw)) {
      setIssueLookupStatus(`Use issue number only (for example: ${ISSUE_PROJECT_KEY}-123 => 123).`);
      return;
    }

    const issueKey = `${ISSUE_PROJECT_KEY}-${raw}`;

    setIssueLookupStatus(`Searching ${issueKey}...`);

    try {
      const foundIssue = await loadSingleIssueByKey(issueKey);

      if (!foundIssue) {
        setIssueLookupStatus(`No issue found for ${issueKey}.`);
        return;
      }

      const ticket = mapJiraIssueToTicket(foundIssue);
      searchedTicketKeysRef.current.add(ticket.key);
      if (!issueLookupValueRef.current.trim()) {
        clearSearchedTickets();
      }
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

  useEffect(() => {
    const previous = previousAssignedDeveloperByTicketRef.current;
    const current = assignedDeveloperByTicket;
    previousAssignedDeveloperByTicketRef.current = current;

    if (assignmentUpdateOriginRef.current !== "user") return;
    assignmentUpdateOriginRef.current = "";

    const changedTickets = [];
    const candidateTicketIds = new Set([...Object.keys(previous), ...Object.keys(current)]);
    candidateTicketIds.forEach((ticketId) => {
      const previousDevId = String(previous[ticketId] || "").trim();
      const currentDevId = String(current[ticketId] || "").trim();
      if (previousDevId === currentDevId) return;
      changedTickets.push({ ticketId, developerId: currentDevId });
    });
    if (!changedTickets.length) return;

    void (async () => {
      for (const { ticketId, developerId } of changedTickets) {
        const ticket = ticketsById[ticketId];
        if (!ticket?.key) continue;

        const isRemoval = !developerId;
        const developer = isRemoval ? null : developersById[developerId];

        if (!isRemoval && !developer) continue;

        const jiraAccountId = String(developer?.jiraAccountId || "").trim();
        if (!isRemoval && !jiraAccountId) {
          setDeveloperStatus(`"${developer.name}" is not linked to Jira, so ${ticket.key} was not synced.`);
          continue;
        }

        try {
          const res = await fetch("/api/jira/assign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json"
            },
            body: JSON.stringify({
              issueKey: ticket.key,
              accountId: jiraAccountId,
              sprintId: nextSprintId,
              unassign: isRemoval,
              removeFromSprint: isRemoval
            })
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Jira assignee update failed (${res.status})`);
          }
          if (isRemoval) {
            setDeveloperStatus(`Cleared ${ticket.key} assignee in Jira and removed it from sprint.`);
          } else {
            setDeveloperStatus(
              `Synced ${ticket.key} to "${developer.name}" in Jira and updated sprint ${nextSprintNumber || "(current)"}.`
            );
          }
        } catch (error) {
          setDeveloperStatus(`Unable to sync ${ticket.key} to Jira: ${String(error.message || error)}`);
        }
      }
    })();
  }, [assignedDeveloperByTicket, developersById, ticketsById, nextSprintId, nextSprintNumber]);

  const unscheduledTickets = state.tickets.filter((ticket) => !plannedByTicket[ticket.id]);

  return (
    <main className="flex h-screen overflow-hidden text-sm">
      <aside className="w-80 shrink-0 border-r border-base-300 bg-base-100">
        <div className="border-b border-base-300 p-4">
          <h1 className="text-2xl font-semibold text-slate-900">Sprint Planner</h1>
          <p className="text-xs text-slate-500">Plan a sprint with AM/PM 4-hour slots per developer.</p>
        </div>

        <div className="max-h-[calc(100vh-72px)] overflow-y-auto p-4">
          <div className="grid gap-3">
            <details
              className={accordionClass}
              open={accordionOpen.sprintSetup}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setAccordionOpen((prev) => ({ ...prev, sprintSetup: isOpen }));
              }}
            >
              <summary className="collapse-title text-lg font-semibold">Sprint Setup</summary>
              <div className="collapse-content">
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sprint start date
                  </label>
                  <input
                    className={controlClass}
                    type="date"
                    value={state.sprintStart}
                    onChange={(e) => setState((p) => ({ ...p, sprintStart: e.target.value }))}
                  />
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Skip first sprint day
                  </label>
                  <select
                    className={controlClass}
                    value={state.skipFirstDay ? "yes" : "no"}
                    onChange={(e) => setState((p) => ({ ...p, skipFirstDay: e.target.value === "yes" }))}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>
            </details>

            <details
              className={accordionClass}
              open={accordionOpen.sessionSaveLoad}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setAccordionOpen((prev) => ({ ...prev, sessionSaveLoad: isOpen }));
              }}
            >
              <summary className="collapse-title text-lg font-semibold">Session Save/Load</summary>
              <div className="collapse-content grid gap-2">
                <input
                  className={controlClass}
                  placeholder="Session name"
                  value={sessionName}
                  onChange={(e) => {
                    setSessionName(e.target.value);
                    setIsDefaultSessionName(false);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button className={primaryButtonClass} onClick={saveNamedSession}>
                    Save Session
                  </button>
                  <button className={secondaryButtonClass} onClick={refreshSavedSessions}>
                    Refresh
                  </button>
                </div>
                <select className={controlClass} onChange={(e) => loadNamedSession(e.target.value)} defaultValue="">
                  <option value="" disabled>
                    Load saved session
                  </option>
                  {savedSessions.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">{sessionStatus}</p>
              </div>
            </details>

            <details
              className={accordionClass}
              open={accordionOpen.developers}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setAccordionOpen((prev) => ({ ...prev, developers: isOpen }));
              }}
            >
              <summary className="collapse-title text-lg font-semibold">Developers</summary>
              <div className="collapse-content grid gap-2">
                <div className="flex gap-2">
                  <input
                    className={`${controlClass} flex-1`}
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
                      className="btn btn-sm border-base-300"
                      style={{ backgroundColor: developerColorById[dev.id] }}
                      onClick={() => removeDeveloper(dev.id)}
                    >
                      {dev.name}
                      {dev.jiraAccountId ? " (Jira linked)" : ""}
                      {" ×"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">{developerStatus}</p>
              </div>
            </details>

            <details
              className={accordionClass}
              open={accordionOpen.jiraImport}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setAccordionOpen((prev) => ({ ...prev, jiraImport: isOpen }));
              }}
            >
              <summary className="collapse-title text-lg font-semibold">Jira Import</summary>
              <div className="collapse-content grid gap-2">
                <p className="text-xs text-slate-500">
                  Requests are proxied by this app server to avoid browser CORS blocks.
                </p>
                <input
                  className={controlClass}
                  value={state.jira.jql}
                  onChange={(e) => setState((p) => ({ ...p, jira: { ...p.jira, jql: e.target.value } }))}
                />
                <button className={primaryButtonClass} onClick={loadJiraTickets}>
                  Load Jira Tickets
                </button>
                <p className="text-xs text-slate-500">{jiraStatus}</p>
              </div>
            </details>
          </div>

          <div className="mt-4 border-t border-base-300 pt-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Unassigned Stories</h2>
            <div className="mb-3 flex flex-col gap-2">
              <input
                className={controlClass}
                placeholder={`Issue number (e.g. 123 for ${ISSUE_PROJECT_KEY}-123)`}
                value={issueLookup}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  issueLookupValueRef.current = nextValue;
                  setIssueLookup(nextValue);
                  if (!nextValue.trim()) clearSearchedTickets();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void findIssueAndAddTicket();
                }}
              />
              <button className={secondaryButtonClass} type="button" onClick={() => void findIssueAndAddTicket()}>
                Find issue
              </button>
              <p className="text-xs text-slate-500">{issueLookupStatus}</p>
            </div>

            <div className="grid gap-2">
              {unscheduledTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  draggable
                  onDragStart={(event) => startDraggingTicket(event, ticket.id)}
                  className="cursor-grab rounded-lg border border-base-300 bg-base-200 p-3 active:cursor-grabbing"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-indigo-700">{ticket.key}</span>
                    <span className="rounded bg-base-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {ticket.hours}h
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-slate-700">{ticket.summary}</p>
                </div>
              ))}
              {unscheduledTickets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-base-300 p-4 text-center text-xs text-slate-500">
                  All tickets have planned slots.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      <section className="flex-1 overflow-auto bg-base-200 p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Sprint Day View</h2>
          <button className={secondaryButtonClass} type="button" onClick={() => void downloadSprintDayViewXlsx()}>
            Download Excel
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Drag tickets into the timeline. Drag existing assigned slots to move them or clear/block cells inline.
        </p>

        {state.developers.length === 0 ? (
          <div className="flex h-[70vh] items-center justify-center rounded-xl border border-base-300 bg-base-100 text-slate-500">
            Add developers in the sidebar to start planning.
          </div>
        ) : (
          <div className="inline-block min-w-full overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
            <div className="flex border-b border-base-300 bg-base-200">
              <div className="w-[180px] shrink-0 border-r border-base-300 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                Developer
              </div>
              <div className="flex flex-1">
                {days.map((day) => (
                  <div key={day} className="w-[128px] shrink-0 border-r border-base-300 py-2 text-center text-slate-500">
                    <span className="block text-[11px] font-bold uppercase">{dayLabel(day)}</span>
                    <div className="mt-1 flex justify-around text-[10px] font-semibold">
                      <span>AM</span>
                      <span>PM</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {state.developers.map((dev) => (
              <div key={dev.id} className="flex border-b border-base-300 last:border-b-0">
                <div
                  className="w-[180px] shrink-0 border-r border-base-300 px-4 py-3"
                  style={{ backgroundColor: developerColorById[dev.id] || "hsl(var(--b1))" }}
                >
                  <div className="truncate text-xs font-bold text-slate-800">{dev.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-600">
                    {(freeDaysByDeveloper[dev.id] ?? 0).toFixed(1)} free day
                    {(freeDaysByDeveloper[dev.id] ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex flex-1">
                  {days.map((day) =>
                    ["AM", "PM"].map((slot, slotIndex) => {
                      const currentSlotKey = slotKey(dev.id, day, slot);
                      const ticketId = state.assignments[currentSlotKey];
                      const ticket = state.tickets.find((t) => t.id === ticketId);
                      const isBlocked = Boolean(state.blockedSlots?.[currentSlotKey]);
                      const isDayStart = slotIndex === 0;
                      return (
                        <div
                          key={`${dev.id}-${day}-${slot}`}
                          className={`group relative h-[110px] w-[64px] shrink-0 border-l p-1 ${
                            isDayStart ? "border-base-300" : "border-base-200"
                          }`}
                          onDragOver={(event) => handleDragOverSlot(event, currentSlotKey)}
                          onDrop={(event) => handleDropOnSlot(event, currentSlotKey)}
                          onDragLeave={() =>
                            setDragOverSlotKey((current) => (current === currentSlotKey ? "" : current))
                          }
                        >
                          <div
                            className={`h-full rounded border p-1.5 shadow-sm transition-colors ${
                              isBlocked
                                ? "border-red-200 bg-red-100"
                                : dragOverSlotKey === currentSlotKey
                                  ? "border-indigo-300 bg-indigo-50"
                                  : "border-base-300 bg-base-100"
                            }`}
                          >
                            {isBlocked ? (
                              <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                                <span className="text-[11px] font-semibold text-red-800">Blocked</span>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline"
                                  onClick={() => toggleSlotBlocked(currentSlotKey)}
                                >
                                  Revert
                                </button>
                              </div>
                            ) : ticket ? (
                              <div
                                className="flex h-full cursor-grab flex-col justify-between gap-1 active:cursor-grabbing"
                                draggable
                                onDragStart={(event) => startDraggingTicket(event, ticket.id, currentSlotKey)}
                              >
                                <div className="min-h-0">
                                  <div className="truncate text-[11px] font-bold text-indigo-700">{ticket.key}</div>
                                  <div className="line-clamp-3 break-words text-[10px] text-slate-700">
                                    {ticket.summary}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline self-end"
                                  onClick={() => clearTicketAssignments(ticket.id)}
                                >
                                  Clear
                                </button>
                              </div>
                            ) : (
                              <div className="flex h-full items-end justify-end">
                                <button
                                  type="button"
                                  className="btn btn-xs btn-error btn-outline pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
                                  onClick={() => toggleSlotBlocked(currentSlotKey)}
                                >
                                  Block
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
