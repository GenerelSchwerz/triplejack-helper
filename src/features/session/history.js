  function persistSessionSummary(summary) {
    const history = getSessionHistory();
    history.push({
      endedAt: summary.endedAt,
      roomName: summary.roomName,
      roomType: summary.roomType,
      variantName: summary.variantName,
      variantType: summary.variantType,
      gameType: summary.gameType,
      smallBlind: summary.smallBlind,
      bigBlind: summary.bigBlind,
      startStack: summary.startStack,
      endStack: summary.endStack,
      chipDelta: summary.chipDelta,
      bigBlindDelta: summary.bigBlindDelta,
      bigBlindsPerHour: summary.bigBlindsPerHour,
      durationMs: summary.durationMs,
    });

    try {
      localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-500)));
    } catch {
      // Losing history should not block the per-session summary.
    }
  }

  function getSessionHistory() {
    try {
      const parsedHistory = JSON.parse(localStorage.getItem(SESSION_HISTORY_STORAGE_KEY) || "[]");
      return Array.isArray(parsedHistory) ? parsedHistory.filter(isValidSessionRecord) : [];
    } catch {
      return [];
    }
  }

  function isValidSessionRecord(record) {
    return (
      record &&
      Number.isFinite(record.endedAt) &&
      Number.isFinite(record.durationMs) &&
      Number.isFinite(record.bigBlindDelta)
    );
  }

  function getSessionTrackingStats() {
    const sessions = getSessionHistory();
    const overall = aggregateSessionRecords(sessions);
    const byRoomType = Array.from(groupSessionsByRoomType(sessions).entries())
      .map(([roomType, records]) => {
        return {
          roomType,
          ...aggregateSessionRecords(records),
        };
      })
      .sort((a, b) => b.sessions - a.sessions || Math.abs(b.bigBlindsPerHour || 0) - Math.abs(a.bigBlindsPerHour || 0))
      .slice(0, 4);
    const sortedSessions = sortSessionsNewestFirst(sessions);
    const recentSessions = sortedSessions.slice(0, 5);
    const recentTrend = aggregateSessionRecords(recentSessions);
    const previousTrend = aggregateSessionRecords(sortedSessions.slice(5, 10));

    return {
      overall,
      byRoomType,
      recentSessions,
      recentTrend,
      previousTrend,
    };
  }

  function getSessionHistoryReport(filters = {}) {
    const sessions = filterSessionHistory(getSessionHistory(), filters);
    const groupedSessions = groupSessionsByPeriod(sessions, filters.groupBy || "week");

    return {
      sessions: sortSessionsNewestFirst(sessions),
      overall: aggregateSessionRecords(sessions),
      periods: Array.from(groupedSessions.entries()).map(([periodKey, records]) => {
        return {
          periodKey,
          periodLabel: formatSessionPeriodLabel(periodKey, filters.groupBy || "week"),
          ...aggregateSessionRecords(records),
        };
      }),
      byRoomType: Array.from(groupSessionsByRoomType(sessions).entries()).map(([roomType, records]) => {
        return {
          roomType,
          ...aggregateSessionRecords(records),
        };
      }),
    };
  }

  function filterSessionHistory(sessions, filters) {
    const startTime = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : -Infinity;
    const endTime = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`).getTime() : Infinity;
    const roomType = filters.roomType || "";

    return sessions.filter((session) => {
      return (
        session.endedAt >= startTime &&
        session.endedAt <= endTime &&
        (!roomType || (session.roomType || "Unknown room") === roomType)
      );
    });
  }

  function getSessionHistoryDateRange() {
    const sessions = getSessionHistory();
    if (!sessions.length) {
      const today = formatSessionDateInput(Date.now());
      return { startDate: today, endDate: today };
    }

    const timestamps = sessions.map((session) => session.endedAt);
    return {
      startDate: formatSessionDateInput(Math.min(...timestamps)),
      endDate: formatSessionDateInput(Math.max(...timestamps)),
    };
  }

  function getSessionHistoryRoomTypes() {
    return Array.from(groupSessionsByRoomType(getSessionHistory()).keys()).sort((a, b) => a.localeCompare(b));
  }

  function groupSessionsByPeriod(sessions, groupBy) {
    const groups = new Map();
    for (const session of sessions.slice().sort((a, b) => a.endedAt - b.endedAt)) {
      const periodKey = getSessionPeriodKey(session.endedAt, groupBy);
      if (!groups.has(periodKey)) {
        groups.set(periodKey, []);
      }
      groups.get(periodKey).push(session);
    }

    return groups;
  }

  function getSessionPeriodKey(timestamp, groupBy) {
    const date = new Date(timestamp);
    if (groupBy === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    if (groupBy === "day") {
      return formatSessionDateInput(timestamp);
    }

    if (groupBy === "all") {
      return "all";
    }

    const weekStart = new Date(date);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return formatSessionDateInput(weekStart.getTime());
  }

  function formatSessionPeriodLabel(periodKey, groupBy) {
    if (groupBy === "all") {
      return "All tracked";
    }

    if (groupBy === "month") {
      const [year, month] = periodKey.split("-").map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString([], { month: "short", year: "numeric" });
    }

    if (groupBy === "day") {
      return new Date(`${periodKey}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
    }

    const start = new Date(`${periodKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })}`;
  }

  function groupSessionsByRoomType(sessions) {
    const groups = new Map();
    for (const session of sessions) {
      const roomType = session.roomType || "Unknown room";
      if (!groups.has(roomType)) {
        groups.set(roomType, []);
      }
      groups.get(roomType).push(session);
    }

    return groups;
  }

  function aggregateSessionRecords(sessions) {
    const totals = sessions.reduce(
      (accumulator, session) => {
        accumulator.sessions += 1;
        accumulator.durationMs += Math.max(session.durationMs || 0, 0);
        accumulator.bigBlindDelta += Number(session.bigBlindDelta) || 0;
        accumulator.chipDelta += Number(session.chipDelta) || 0;
        return accumulator;
      },
      { sessions: 0, durationMs: 0, bigBlindDelta: 0, chipDelta: 0 },
    );

    return {
      ...totals,
      bigBlindsPerHour:
        totals.durationMs > 0 ? totals.bigBlindDelta / (totals.durationMs / 3600000) : null,
    };
  }

  function sortSessionsNewestFirst(sessions) {
    return sessions.slice().sort((a, b) => b.endedAt - a.endedAt);
  }

  function formatSessionDateInput(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
