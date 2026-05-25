  const sessionTracker = {
    active: false,
    selfPlayerId: "",
    selfPlayerName: "",
    selfSeat: null,
    roomName: "",
    roomId: "",
    smallBlind: null,
    bigBlind: null,
    startStack: null,
    endStack: null,
    startedAt: 0,
    lastUpdateAt: 0,
  };

  function installSessionTracker() {
    document.addEventListener(PACKET_INTERCEPT_EVENT, handleSessionPacket);
  }

  function handleSessionPacket(event) {
    const detail = event.detail;
    if (detail?.direction !== "incoming" || typeof detail.data !== "string") {
      return;
    }

    const command = detail.command || getSessionPacketCommand(detail.data);
    if (command === "#(init_game)") {
      startSessionFromInitGame(detail.data);
      return;
    }

    if (!sessionTracker.active) {
      return;
    }

    if (isLobbyReturnPacket(command)) {
      finishSession();
      return;
    }

    if (command === "update_players") {
      updateSessionFromPlayers(detail.data);
      return;
    }

    if (command === "update_chip_stacks") {
      updateSessionFromChipStacks(detail.data);
      return;
    }

    if (command === "h") {
      updateSessionFromHand(detail.data);
      return;
    }

    if (command === "poker_room_info") {
      updateSessionFromRoomInfo(detail.data);
    }
  }

  function startSessionFromInitGame(data) {
    const selfPayload = getCompoundSubframe(data, "self_data");
    const gamePayload = getCompoundSubframe(data, "init_game_data");
    if (!selfPayload || !gamePayload) {
      return;
    }

    resetSessionTracker();

    const selfFields = splitProtocolFields(stripOuterBraces(selfPayload));
    const gameFields = splitProtocolFields(gamePayload);
    const playerRows = splitProtocolFields(stripOuterBraces(gameFields[7] || ""));
    const selfPlayerId = selfFields[1] || "";
    const selfRow = playerRows.map(parseInitGamePlayerRow).find((row) => row.playerId === selfPlayerId);

    sessionTracker.active = true;
    sessionTracker.selfPlayerId = selfPlayerId;
    sessionTracker.selfPlayerName = decodeSessionProtocolText(selfFields[2] || "");
    sessionTracker.startedAt = Date.now();
    sessionTracker.lastUpdateAt = sessionTracker.startedAt;
    sessionTracker.smallBlind = toNumberOrNull(gameFields[4]);
    sessionTracker.bigBlind = toNumberOrNull(gameFields[5]);

    if (selfRow) {
      sessionTracker.selfSeat = selfRow.seat;
      sessionTracker.startStack = selfRow.seat === null || selfRow.seat < 0 ? null : selfRow.stack;
      sessionTracker.endStack = sessionTracker.startStack;
    }

    const roomNameIndex = playerRows.length ? 10 : -1;
    if (roomNameIndex >= 0 && gameFields[roomNameIndex]) {
      sessionTracker.roomName = decodeSessionProtocolText(gameFields[roomNameIndex]);
    }

    const roomIdIndex = roomNameIndex + 1;
    if (roomIdIndex >= 0 && gameFields[roomIdIndex]) {
      sessionTracker.roomId = gameFields[roomIdIndex];
    }
  }

  function resetSessionTracker() {
    Object.assign(sessionTracker, {
      active: false,
      selfPlayerId: "",
      selfPlayerName: "",
      selfSeat: null,
      roomName: "",
      roomId: "",
      smallBlind: null,
      bigBlind: null,
      startStack: null,
      endStack: null,
      startedAt: 0,
      lastUpdateAt: 0,
    });
  }

  function parseInitGamePlayerRow(rowText) {
    const fields = splitProtocolFields(stripOuterBraces(rowText));
    return {
      playerId: fields[2] || "",
      playerName: decodeSessionProtocolText(fields[3] || ""),
      stack: toNumberOrNull(fields[4]),
      bankChips: toNumberOrNull(fields[5]),
      seat: toNumberOrNull(fields[8]),
    };
  }

  function updateSessionFromPlayers(data) {
    const rows = getProtocolTupleRows(data.slice("update_players:".length));
    for (const rowText of rows) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      if (fields[0] !== sessionTracker.selfPlayerId) {
        continue;
      }

      updateSessionStack(toNumberOrNull(fields[1]));
      return;
    }
  }

  function updateSessionFromChipStacks(data) {
    if (sessionTracker.selfSeat === null || sessionTracker.selfSeat < 0) {
      return;
    }

    const rows = getProtocolTupleRows(data.slice("update_chip_stacks:".length));
    for (const rowText of rows) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      if (toNumberOrNull(fields[0]) !== sessionTracker.selfSeat) {
        continue;
      }

      updateSessionStack(toNumberOrNull(fields[1]));
      return;
    }
  }

  function updateSessionStack(stack) {
    if (stack === null) {
      return;
    }

    if (sessionTracker.startStack === null && stack > 0) {
      sessionTracker.startStack = stack;
    }

    sessionTracker.endStack = stack;
    sessionTracker.lastUpdateAt = Date.now();
  }

  function updateSessionFromHand(data) {
    const fields = splitProtocolFields(data.slice(2));
    const smallBlind = toNumberOrNull(fields[2]);
    const bigBlind = toNumberOrNull(fields[3]);
    if (smallBlind !== null) {
      sessionTracker.smallBlind = smallBlind;
    }
    if (bigBlind !== null) {
      sessionTracker.bigBlind = bigBlind;
    }
  }

  function updateSessionFromRoomInfo(data) {
    try {
      const roomInfo = JSON.parse(data.slice("poker_room_info:".length));
      sessionTracker.roomName = roomInfo.roomName || sessionTracker.roomName;
      const blindsField = roomInfo.infoFields?.find(([label]) => label === "Blinds");
      if (blindsField) {
        const blindMatch = String(blindsField[1]).match(/\$?([\d,]+)\s*\/\s*\$?([\d,]+)/);
        if (blindMatch) {
          sessionTracker.smallBlind = Number(blindMatch[1].replace(/,/g, ""));
          sessionTracker.bigBlind = Number(blindMatch[2].replace(/,/g, ""));
        }
      }
    } catch {
      // Room info is optional; tuple-derived blinds still work without it.
    }
  }

  function finishSession() {
    if (!sessionTracker.active) {
      return;
    }

    const summary = buildSessionSummary();
    resetSessionTracker();

    if (summary && getSessionSummaryEnabled()) {
      renderSessionSummary(summary);
    }
  }

  function buildSessionSummary() {
    if (sessionTracker.startStack === null || sessionTracker.endStack === null) {
      return null;
    }

    const endedAt = sessionTracker.lastUpdateAt || Date.now();
    const durationMs = Math.max(endedAt - sessionTracker.startedAt, 1000);
    const chipDelta = sessionTracker.endStack - sessionTracker.startStack;
    const bigBlind = sessionTracker.bigBlind || 0;
    const bigBlindDelta = bigBlind > 0 ? chipDelta / bigBlind : null;
    const bigBlindsPerHour = bigBlindDelta === null ? null : bigBlindDelta / (durationMs / 3600000);

    return {
      roomName: sessionTracker.roomName,
      smallBlind: sessionTracker.smallBlind,
      bigBlind,
      startStack: sessionTracker.startStack,
      endStack: sessionTracker.endStack,
      chipDelta,
      bigBlindDelta,
      bigBlindsPerHour,
      durationMs,
    };
  }

  function renderSessionSummary(summary) {
    sessionSummaryPanel?.remove();

    const targetRect = getPlayAreaRect();
    sessionSummaryPanel = document.createElement("div");
    sessionSummaryPanel.style.cssText = [
      "position:fixed",
      `left:${targetRect.left + targetRect.width / 2}px`,
      `top:${targetRect.top + targetRect.height / 2}px`,
      "z-index:2147483646",
      "transform:translate(-50%,-50%)",
      "width:min(340px,calc(100vw - 32px))",
      "padding:14px",
      "border:1px solid rgba(137,198,215,.9)",
      "border-radius:8px",
      "background:rgba(18,31,39,.96)",
      "color:#F5FAFC",
      "font:13px/1.35 Arial,sans-serif",
      "box-shadow:0 10px 30px rgba(0,0,0,.45)",
    ].join(";");
    sessionSummaryPanel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <strong style="font-size:15px;">Session Summary</strong>
        <button type="button" data-tj-helper-session-summary-close style="border:0;background:#294655;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;">x</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:6px 12px;">
        ${summary.roomName ? `<span style="color:#BFE7F1;">Room</span><span>${escapeSessionHtml(summary.roomName)}</span>` : ""}
        <span style="color:#BFE7F1;">Length</span><span>${formatDuration(summary.durationMs)}</span>
        <span style="color:#BFE7F1;">Blinds</span><span>${formatBlindLevel(summary.smallBlind, summary.bigBlind)}</span>
        <span style="color:#BFE7F1;">Started</span><span>${formatChipCount(summary.startStack)}</span>
        <span style="color:#BFE7F1;">Ended</span><span>${formatChipCount(summary.endStack)}</span>
        <span style="color:#BFE7F1;">Net chips</span><strong style="color:${summary.chipDelta >= 0 ? "#A7D8AD" : "#FFB0A8"};">${formatSignedNumber(summary.chipDelta)}</strong>
        <span style="color:#BFE7F1;">Net BB</span><strong style="color:${summary.chipDelta >= 0 ? "#A7D8AD" : "#FFB0A8"};">${formatNullableSigned(summary.bigBlindDelta)}</strong>
        <span style="color:#BFE7F1;">BB/hour</span><strong style="color:${summary.chipDelta >= 0 ? "#A7D8AD" : "#FFB0A8"};">${formatNullableSigned(summary.bigBlindsPerHour)}</strong>
      </div>
    `;

    sessionSummaryPanel.querySelector("[data-tj-helper-session-summary-close]").addEventListener("click", () => {
      sessionSummaryPanel?.remove();
      sessionSummaryPanel = null;
    });

    (document.body || document.documentElement).appendChild(sessionSummaryPanel);
  }

  function getPlayAreaRect() {
    const playArea =
      document.querySelector('[data-testid="poker-stage-container"]') ||
      document.querySelector('[data-testid="poker-scene"]') ||
      document.querySelector("canvas");
    const rect = playArea?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return rect;
    }

    return {
      left: 0,
      top: 0,
      width: window.innerWidth || document.documentElement.clientWidth || 800,
      height: window.innerHeight || document.documentElement.clientHeight || 600,
    };
  }

  function isLobbyReturnPacket(command) {
    return ["init_lobby", "lbrowse", "addgames", "gamesdone"].includes(command);
  }

  function getSessionPacketCommand(data) {
    const colonIndex = data.indexOf(":");
    return colonIndex === -1 ? data : data.slice(0, colonIndex);
  }

  function getCompoundSubframe(data, name) {
    const markerPattern = new RegExp(`(?:^|/)\\d+/${name}:`, "g");
    const markerMatch = markerPattern.exec(data);
    if (!markerMatch) {
      return "";
    }

    const start = markerPattern.lastIndex;
    const nextPattern = /\/\d+\/[a-zA-Z_]+:/g;
    nextPattern.lastIndex = start;
    const nextMatch = nextPattern.exec(data);
    return data.slice(start, nextMatch ? nextMatch.index : undefined);
  }

  function getProtocolTupleRows(value) {
    return splitProtocolFields(stripOuterBraces(value)).filter(Boolean);
  }

  function splitProtocolFields(value) {
    const fields = [];
    let depth = 0;
    let start = 0;
    const text = String(value || "");

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth = Math.max(0, depth - 1);
      } else if (char === "," && depth === 0) {
        fields.push(text.slice(start, index));
        start = index + 1;
      }
    }

    fields.push(text.slice(start));
    return fields;
  }

  function stripOuterBraces(value) {
    const text = String(value || "").trim();
    if (text.startsWith("{") && text.endsWith("}")) {
      return text.slice(1, -1);
    }

    return text;
  }

  function toNumberOrNull(value) {
    if (value === "" || value === undefined || value === null) {
      return null;
    }

    const number = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function decodeSessionProtocolText(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, "%20"));
    } catch {
      return String(value || "");
    }
  }

  function escapeSessionHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatChipCount(value) {
    return value === null ? "n/a" : Math.round(value).toLocaleString();
  }

  function formatSignedNumber(value) {
    const roundedValue = Math.round(value);
    return `${roundedValue >= 0 ? "+" : ""}${roundedValue.toLocaleString()}`;
  }

  function formatNullableSigned(value) {
    if (value === null || !Number.isFinite(value)) {
      return "n/a";
    }

    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  }

  function formatBlindLevel(smallBlind, bigBlind) {
    if (!smallBlind || !bigBlind) {
      return "n/a";
    }

    return `${formatChipCount(smallBlind)} / ${formatChipCount(bigBlind)}`;
  }

  function formatDuration(durationMs) {
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) {
      return `${minutes}m ${seconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
