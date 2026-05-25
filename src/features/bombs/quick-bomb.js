  function quickBombControllerModule(config) {
    const state = {
      lastPacket: "",
      lastItemKey: "",
      nativeSend: null,
      socketId: "",
      ammoCostByItemKey: new Map(),
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
        return;
      }

      if (detail.direction !== "outgoing") {
        return;
      }

      const itemKey = getBombItemKey(detail.data);
      if (!itemKey || typeof detail.nativeSend !== "function") {
        return;
      }

      state.lastPacket = detail.data;
      state.lastItemKey = itemKey;
      state.nativeSend = detail.nativeSend;
      state.socketId = detail.socketId || "";
      setStatus(`quick bomb saved ${itemKey}`);
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

      if (!state.lastPacket || typeof state.nativeSend !== "function") {
        setStatus("quick bomb has no saved bomb");
        return;
      }

      stopTimer();
      state.active = true;
      state.runSent = 0;
      state.targetSends = getTargetSends();
      setStatus(`quick bomb started ${state.lastItemKey} x${state.targetSends}`);
      if (getSpeedMode() === "instant") {
        sendInstantBombs();
        return;
      }

      sendNextBomb();
    }

    function sendInstantBombs() {
      while (state.active && state.runSent < state.targetSends) {
        state.nativeSend(state.lastPacket);
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

      if (!state.lastPacket || typeof state.nativeSend !== "function") {
        stopSpam("quick bomb lost socket");
        return;
      }

      if (state.runSent >= state.targetSends) {
        stopSpam(`quick bomb finished ${state.runSent}`);
        return;
      }

      state.nativeSend(state.lastPacket);
      state.runSent += 1;
      state.replayCount += 1;
      state.lastReplayAt = Date.now();
      setStatus(`quick bomb threw ${state.lastItemKey}`);

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
      return Math.floor(getAmmo() / getAmmoCost(state.lastItemKey));
    }

    function getAmmoCost(itemKey) {
      return state.ammoCostByItemKey.get(normalizeItemKey(itemKey)) || 1;
    }

    function updateAmmoCosts(data) {
      if (data.startsWith("inventory_defs:")) {
        updateAmmoCostsFromInventoryDefs(data.slice("inventory_defs:".length));
        return;
      }

      if (data.startsWith("bombs_init:")) {
        updateAmmoCostsFromBombsInit(data.slice("bombs_init:".length));
      }
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
          setAmmoCost(itemFields[0], itemFields[1]);
        }
      }
    }

    function updateAmmoCostsFromBombsInit(payload) {
      for (const itemDefinition of splitProtocolFields(stripOuterBraces(payload))) {
        const itemFields = splitProtocolFields(stripOuterBraces(itemDefinition));
        setAmmoCost(itemFields[0], itemFields[5]);
      }
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

    function stripOuterBraces(value) {
      const text = String(value || "").trim();
      if (text.startsWith("{") && text.endsWith("}")) {
        return text.slice(1, -1);
      }

      return text;
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
      return clampNumber(
        window.localStorage?.getItem(config.rateStorageKey) || config.defaultRate,
        config.minRate,
        config.maxRate,
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
      return clampNumber(
        window.localStorage?.getItem(config.durationStorageKey) || config.defaultDurationSeconds,
        config.minDurationSeconds,
        config.maxDurationSeconds,
        config.defaultDurationSeconds,
      );
    }

    function getAmmo() {
      return clampNumber(
        window.localStorage?.getItem(config.ammoStorageKey) || config.defaultAmmo,
        config.minAmmo,
        config.maxAmmo,
        config.defaultAmmo,
      );
    }

    function clampNumber(value, min, max, fallback) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return fallback;
      }

      return Math.min(max, Math.max(min, Math.round(numericValue)));
    }

    function setStatus(status) {
      document.dispatchEvent(
        new CustomEvent(config.statusEvent, {
          detail: {
            quickBombLastItem: state.lastItemKey,
            quickBombReplayCount: state.replayCount,
            quickBombSocketId: state.socketId,
            quickBombLastReplayAt: state.lastReplayAt,
            quickBombAmmoCost: getAmmoCost(state.lastItemKey),
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
