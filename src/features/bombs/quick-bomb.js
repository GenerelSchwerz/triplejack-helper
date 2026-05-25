  function quickBombControllerModule(config) {
    const state = {
      lastItemKey: "",
      selectedItemKey: "",
      lastBombCountOrFlag: "1",
      nativeSend: null,
      socketId: "",
      ammoCostByItemKey: new Map(),
      itemDefinitionByKey: new Map(),
      playerNameById: new Map(),
      inRoom: false,
      selfPlayerId: "",
      players: [],
      selectedTarget: null,
      replayCount: 0,
      lastReplayAt: 0,
      active: false,
      runSent: 0,
      targetSends: 0,
      timerId: 0,
    };

    function install() {
      document.addEventListener(config.socketMessageEvent, handleSocketMessage);
      document.addEventListener(config.controlEvent, handleControl);
      document.addEventListener("keydown", handleKeyDown, true);
    }

    function handleSocketMessage(event) {
      const detail = event.detail;
      if (!detail || typeof detail.data !== "string") {
        return;
      }

      if (detail.direction === "incoming") {
        updateAmmoCosts(detail.data);
        updateIncomingBombTemplate(detail.data);
        return;
      }

      if (detail.direction !== "outgoing") {
        return;
      }

      if (typeof detail.nativeSend === "function") {
        state.nativeSend = detail.nativeSend;
        state.socketId = detail.socketId || state.socketId;
      }

      const itemKey = getBombItemKey(detail.data);
      if (!itemKey || typeof detail.nativeSend !== "function") {
        return;
      }

      state.lastItemKey = itemKey;
      state.lastBombCountOrFlag = getBombCountOrFlag(detail.data) || state.lastBombCountOrFlag;
      state.nativeSend = detail.nativeSend;
      state.socketId = detail.socketId || "";
      setStatus(`quick bomb saved ${itemKey}`);
    }

    function updateIncomingBombTemplate(data) {
      if (!data.startsWith("newbomb:")) {
        return;
      }

      const itemKey = getBombItemKey(data);
      if (!itemKey) {
        return;
      }

      state.lastItemKey = itemKey;
      setStatus(`quick bomb saw ${itemKey} animation`);
    }

    function handleKeyDown(event) {
      if (!isQuickBombHotkey(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggleSpam();
    }

    function handleControl(event) {
      const action = event.detail?.action;
      if (action === "start") {
        startSpam();
        return;
      }

      if (action === "stop") {
        stopSpam("quick bomb stopped");
        return;
      }

      if (action === "toggle") {
        toggleSpam();
        return;
      }

      if (action === "selectTarget") {
        selectTarget(event.detail);
        return;
      }

      if (action === "selectItem") {
        selectItem(event.detail);
      }
    }

    function toggleSpam() {
      if (state.active) {
        stopSpam("quick bomb stopped");
        return;
      }

      startSpam();
    }

    function startSpam() {
      if (!isQuickBombEnabled()) {
        setStatus("quick bomb disabled");
        return;
      }

      if (!getSelectedItemKey() || typeof state.nativeSend !== "function") {
        setStatus("quick bomb needs an item and websocket sender");
        return;
      }

      if (!state.inRoom || !state.selectedTarget) {
        setStatus("quick bomb needs a room target");
        return;
      }

      if (!state.selectedTarget.playerName) {
        setStatus("quick bomb target needs player name");
        return;
      }

      stopTimer();
      state.active = true;
      state.runSent = 0;
      state.targetSends = getTargetSends();
      setStatus(`quick bomb started ${getSelectedItemKey()} x${state.targetSends}`);
      if (getSpeedMode() === "instant") {
        sendInstantBombs();
        return;
      }

      sendNextBomb();
    }

    function sendInstantBombs() {
      while (state.active && state.runSent < state.targetSends) {
        state.nativeSend(buildTargetedBombPacket());
        state.runSent += 1;
        state.replayCount += 1;
        state.lastReplayAt = Date.now();
      }

      stopSpam(`quick bomb finished ${state.runSent}`);
    }

    function sendNextBomb() {
      if (!state.active) {
        return;
      }

      if (!isQuickBombEnabled()) {
        stopSpam("quick bomb disabled");
        return;
      }

      if (!getSelectedItemKey() || typeof state.nativeSend !== "function") {
        stopSpam("quick bomb lost socket");
        return;
      }

      if (!state.inRoom || !state.selectedTarget) {
        stopSpam("quick bomb needs a room target");
        return;
      }

      if (!state.selectedTarget.playerName) {
        stopSpam("quick bomb target needs player name");
        return;
      }

      if (state.runSent >= state.targetSends) {
        stopSpam(`quick bomb finished ${state.runSent}`);
        return;
      }

      state.nativeSend(buildTargetedBombPacket());
      state.runSent += 1;
      state.replayCount += 1;
      state.lastReplayAt = Date.now();
      setStatus(`quick bomb threw ${getSelectedItemKey()}`);

      if (state.runSent >= state.targetSends) {
        stopSpam(`quick bomb finished ${state.runSent}`);
        return;
      }

      state.timerId = window.setTimeout(sendNextBomb, getIntervalMs());
    }

    function stopSpam(status) {
      stopTimer();
      state.active = false;
      setStatus(status);
    }

    function stopTimer() {
      if (!state.timerId) {
        return;
      }

      window.clearTimeout(state.timerId);
      state.timerId = 0;
    }

    function getTargetSends() {
      if (getMode() === "ammo") {
        return getAmmoTargetSends();
      }

      return Math.max(1, getRate() * getDurationSeconds());
    }

    function getAmmoTargetSends() {
      return Math.floor(getAmmo() / getAmmoCost(getSelectedItemKey()));
    }

    function getAmmoCost(itemKey) {
      return state.ammoCostByItemKey.get(normalizeItemKey(itemKey)) || 1;
    }

    function buildTargetedBombPacket() {
      return `bomb:${getSelectedItemKey()},${encodeBombTargetName(state.selectedTarget.playerName)},${state.lastBombCountOrFlag || "1"}`;
    }

    function updateAmmoCosts(data) {
      updateKnownPlayerNames(data);
      updateRoomState(data);

      if (data.startsWith("inventory_defs:")) {
        updateAmmoCostsFromInventoryDefs(data.slice("inventory_defs:".length));
        setStatus(`quick bomb items loaded ${state.itemDefinitionByKey.size}`);
        return;
      }

      if (data.startsWith("bombs_init:")) {
        updateAmmoCostsFromBombsInit(data.slice("bombs_init:".length));
        setStatus(`quick bomb items loaded ${state.itemDefinitionByKey.size}`);
      }
    }

    function updateRoomState(data) {
      if (data.startsWith("#(init_game):")) {
        updateRoomPlayersFromInitGame(data);
        return;
      }

      const command = getPacketCommand(data);
      if (command === "sit") {
        updateRoomPlayersFromSit(data);
        return;
      }

      if (command === "su") {
        updateRoomPlayersFromStandUp(data);
        return;
      }

      if (isLobbyReturnPacket(command, data)) {
        leaveRoom();
      }
    }

    function updateRoomPlayersFromInitGame(data) {
      const selfPayload = getCompoundSubframe(data, "self_data");
      const gamePayload = getCompoundSubframe(data, "init_game_data");
      if (!gamePayload) {
        return;
      }

      const selfFields = splitProtocolFields(stripOuterBraces(selfPayload));
      const gameFields = splitProtocolFields(gamePayload);
      const players = splitProtocolFields(stripOuterBraces(gameFields[7] || ""))
        .map(parseRoomPlayerRow)
        .filter((player) => player.playerId && player.seat !== "" && Number(player.seat) >= 0);

      state.inRoom = true;
      state.selfPlayerId = selfFields[1] || state.selfPlayerId;
      state.players = players;
      if (!players.some((player) => player.playerId === state.selectedTarget?.playerId)) {
        state.selectedTarget = null;
      }

      setStatus(`quick bomb room targets ${players.length}`);
    }

    function parseRoomPlayerRow(rowText) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      return {
        playerId: fields[2] || "",
        playerName: rememberPlayerName(fields[2], fields[3]),
        seat: fields[8] || "",
      };
    }

    function updateRoomPlayersFromSit(data) {
      const fields = splitProtocolFields(data.slice("sit:".length));
      const playerId = fields[1] || "";
      const seat = fields[2] || "";
      if (!playerId || seat === "" || Number(seat) < 0) {
        return;
      }

      state.inRoom = true;
      upsertRoomPlayer({
        playerId,
        playerName: getKnownPlayerName(playerId),
        seat,
      });
      setStatus(`quick bomb target joined seat ${seat}`);
    }

    function updateRoomPlayersFromStandUp(data) {
      const fields = splitProtocolFields(data.slice("su:".length));
      const playerId = fields[1] || "";
      if (!playerId) {
        return;
      }

      removeRoomPlayer(playerId);
      setStatus(`quick bomb target left ${playerId}`);
    }

    function upsertRoomPlayer(player) {
      const nextPlayers = state.players.filter((existingPlayer) => {
        return existingPlayer.playerId !== player.playerId && existingPlayer.seat !== player.seat;
      });
      nextPlayers.push(player);
      nextPlayers.sort((a, b) => Number(a.seat) - Number(b.seat));
      state.players = nextPlayers;
      if (state.selectedTarget?.playerId === player.playerId) {
        state.selectedTarget = player;
      }
    }

    function removeRoomPlayer(playerId) {
      state.players = state.players.filter((player) => player.playerId !== playerId);
      if (state.selectedTarget?.playerId === playerId) {
        state.selectedTarget = null;
        if (state.active) {
          stopSpam("quick bomb target left");
        }
      }
    }

    function getKnownPlayerName(playerId) {
      return state.playerNameById.get(String(playerId || "")) || "";
    }

    function updateKnownPlayerNames(data) {
      if (data.startsWith("pc:")) {
        const fields = splitProtocolFields(data.slice("pc:".length));
        rememberPlayerName(fields[0], fields[1]);
        refreshRoomPlayerNames();
        return;
      }

      if (data.startsWith("side_bet_added:")) {
        const fields = splitProtocolFields(data.slice("side_bet_added:".length));
        rememberPlayerReference(fields[3]);
        rememberPlayerReference(fields[4]);
        refreshRoomPlayerNames();
      }
    }

    function rememberPlayerReference(reference) {
      const [playerName = "", playerId = ""] = String(reference || "").split(":");
      rememberPlayerName(playerId, playerName);
    }

    function rememberPlayerName(playerId, playerName) {
      const normalizedPlayerId = String(playerId || "");
      const normalizedPlayerName = decodeProtocolText(playerName || "").trim();
      if (normalizedPlayerId && normalizedPlayerName) {
        state.playerNameById.set(normalizedPlayerId, normalizedPlayerName);
      }

      return normalizedPlayerName || getKnownPlayerName(normalizedPlayerId);
    }

    function refreshRoomPlayerNames() {
      state.players = state.players.map((player) => {
        return {
          ...player,
          playerName: player.playerName || getKnownPlayerName(player.playerId),
        };
      });
      if (state.selectedTarget) {
        state.selectedTarget = state.players.find((player) => player.playerId === state.selectedTarget?.playerId) || null;
      }
    }

    function leaveRoom() {
      state.inRoom = false;
      state.selfPlayerId = "";
      state.players = [];
      state.selectedTarget = null;
      if (state.active) {
        stopSpam("quick bomb left room");
        return;
      }

      setStatus("quick bomb left room");
    }

    function isLobbyReturnPacket(command, data) {
      return command === "gamesdone" || data === "lounge:0" || command === "init_lobby";
    }

    function selectTarget(detail) {
      const target = state.players.find((player) => {
        return player.playerId === String(detail?.playerId || "") && player.seat === String(detail?.seat || "");
      });
      if (!target) {
        setStatus("quick bomb target unavailable");
        return;
      }

      state.selectedTarget = target;
      setStatus(`quick bomb target ${target.playerName}`);
    }

    function selectItem(detail) {
      const itemKey = normalizeItemKey(detail?.itemKey);
      if (!itemKey || !state.itemDefinitionByKey.has(itemKey)) {
        setStatus("quick bomb item unavailable");
        return;
      }

      state.selectedItemKey = itemKey;
      setStatus(`quick bomb item ${getItemLabel(itemKey)}`);
    }

    function updateAmmoCostsFromInventoryDefs(payload) {
      const groups = splitProtocolFields(stripOuterBraces(payload));
      for (const group of groups) {
        const groupFields = splitProtocolFields(stripOuterBraces(group));
        if (groupFields[0] !== "BOMB") {
          continue;
        }

        for (const itemDefinition of splitProtocolFields(stripOuterBraces(groupFields[1] || ""))) {
          const itemFields = splitProtocolFields(stripOuterBraces(itemDefinition));
          setItemDefinition(itemFields[0], "", itemFields[1]);
          setAmmoCost(itemFields[0], itemFields[1]);
        }
      }
    }

    function updateAmmoCostsFromBombsInit(payload) {
      for (const itemDefinition of splitProtocolFields(stripOuterBraces(payload))) {
        const itemFields = splitProtocolFields(stripOuterBraces(itemDefinition));
        setItemDefinition(itemFields[0], itemFields[1], itemFields[5]);
        setAmmoCost(itemFields[0], itemFields[5]);
      }
    }

    function setItemDefinition(itemKey, label, cost) {
      const normalizedItemKey = normalizeItemKey(itemKey);
      if (!normalizedItemKey) {
        return;
      }

      const numericCost = Number(cost);
      const existingDefinition = state.itemDefinitionByKey.get(normalizedItemKey) || {};
      state.itemDefinitionByKey.set(normalizedItemKey, {
        itemKey: normalizedItemKey,
        label: decodeProtocolText(label || existingDefinition.label || normalizedItemKey),
        cost: Number.isFinite(numericCost) && numericCost > 0 ? Math.max(1, Math.round(numericCost)) : existingDefinition.cost || 1,
      });
    }

    function setAmmoCost(itemKey, cost) {
      const normalizedItemKey = normalizeItemKey(itemKey);
      const numericCost = Number(cost);
      if (!normalizedItemKey || !Number.isFinite(numericCost) || numericCost <= 0) {
        return;
      }

      state.ammoCostByItemKey.set(normalizedItemKey, Math.max(1, Math.round(numericCost)));
    }

    function normalizeItemKey(itemKey) {
      return String(itemKey || "").trim().toLowerCase();
    }

    function getSelectedItemKey() {
      return state.selectedItemKey || state.lastItemKey;
    }

    function getItemLabel(itemKey) {
      return state.itemDefinitionByKey.get(normalizeItemKey(itemKey))?.label || itemKey;
    }

    function getItemDefinitions() {
      return Array.from(state.itemDefinitionByKey.values()).sort((a, b) => {
        return a.label.localeCompare(b.label);
      });
    }

    function stripOuterBraces(value) {
      const text = String(value || "").trim();
      if (text.startsWith("{") && text.endsWith("}")) {
        return text.slice(1, -1);
      }

      return text;
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

    function getPacketCommand(data) {
      const colonIndex = data.indexOf(":");
      return colonIndex === -1 ? data : data.slice(0, colonIndex);
    }

    function decodeProtocolText(value) {
      try {
        return decodeURIComponent(String(value || "").replace(/\+/g, "%20"));
      } catch {
        return String(value || "");
      }
    }

    function splitProtocolFields(value) {
      const fields = [];
      let depth = 0;
      let fieldStart = 0;
      const text = String(value || "");

      for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth = Math.max(0, depth - 1);
        } else if (character === "," && depth === 0) {
          fields.push(text.slice(fieldStart, index));
          fieldStart = index + 1;
        }
      }

      if (fieldStart <= text.length) {
        fields.push(text.slice(fieldStart));
      }

      return fields;
    }

    function getIntervalMs() {
      return Math.max(1, Math.round(1000 / getRate()));
    }

    function getBombItemKey(data) {
      const match = String(data).match(/^(?:bomb|newbomb):([^,]+)/);
      return match?.[1] || "";
    }

    function getBombCountOrFlag(data) {
      if (!data.startsWith("bomb:")) {
        return "";
      }

      const fields = splitProtocolFields(data.slice("bomb:".length));
      return fields[2] || "";
    }

    function encodeBombTargetName(playerName) {
      return String(playerName || "").replace(/,/g, "");
    }

    function isQuickBombHotkey(event) {
      return (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.toUpperCase() === config.hotkey
      );
    }

    function isQuickBombEnabled() {
      return window.localStorage?.getItem(config.enabledStorageKey) !== "0";
    }

    function getRate() {
      return normalizePositiveInteger(
        window.localStorage?.getItem(config.rateStorageKey) || config.defaultRate,
        config.defaultRate,
      );
    }

    function getMode() {
      return window.localStorage?.getItem(config.modeStorageKey) === "ammo" ? "ammo" : "duration";
    }

    function getSpeedMode() {
      return window.localStorage?.getItem(config.speedModeStorageKey) === "instant" ? "instant" : "timed";
    }

    function getDurationSeconds() {
      return normalizePositiveInteger(
        window.localStorage?.getItem(config.durationStorageKey) || config.defaultDurationSeconds,
        config.defaultDurationSeconds,
      );
    }

    function getAmmo() {
      return normalizePositiveInteger(
        window.localStorage?.getItem(config.ammoStorageKey) || config.defaultAmmo,
        config.defaultAmmo,
      );
    }

    function normalizePositiveInteger(value, fallback) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallback;
      }

      return Math.round(numericValue);
    }

    function setStatus(status) {
      document.dispatchEvent(
        new CustomEvent(config.statusEvent, {
          detail: {
            quickBombLastItem: state.lastItemKey,
            quickBombSelectedItem: getSelectedItemKey(),
            quickBombItems: getItemDefinitions(),
            quickBombReplayCount: state.replayCount,
            quickBombSocketId: state.socketId,
            quickBombLastReplayAt: state.lastReplayAt,
            quickBombAmmoCost: getAmmoCost(getSelectedItemKey()),
            quickBombInRoom: state.inRoom,
            quickBombPlayers: state.players,
            quickBombSelectedPlayerId: state.selectedTarget?.playerId || "",
            quickBombActive: state.active,
            quickBombRemaining: state.active ? Math.max(0, state.targetSends - state.runSent) : 0,
            lastStatus: status,
          },
        }),
      );
    }

    return {
      install,
    };
  }
