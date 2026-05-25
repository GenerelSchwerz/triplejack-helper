  function quickBombControllerModule(config) {
    const AMMO_COST_BY_ITEM_KEY = {
      pie: 2,
    };

    const state = {
      lastPacket: "",
      lastItemKey: "",
      nativeSend: null,
      socketId: "",
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
      if (detail?.direction !== "outgoing" || typeof detail.data !== "string") {
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
      return AMMO_COST_BY_ITEM_KEY[String(itemKey || "").toLowerCase()] || 1;
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
