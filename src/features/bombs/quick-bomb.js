  function quickBombControllerModule(config) {
    const state = {
      lastPacket: "",
      lastItemKey: "",
      nativeSend: null,
      socketId: "",
      replayCount: 0,
      lastReplayAt: 0,
    };

    function install() {
      document.addEventListener(config.socketMessageEvent, handleSocketMessage);
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
      replayLastBomb();
    }

    function replayLastBomb() {
      if (!isQuickBombEnabled()) {
        setStatus("quick bomb disabled");
        return;
      }

      if (!state.lastPacket || typeof state.nativeSend !== "function") {
        setStatus("quick bomb has no saved bomb");
        return;
      }

      state.nativeSend(state.lastPacket);
      state.replayCount += 1;
      state.lastReplayAt = Date.now();
      setStatus(`quick bomb threw ${state.lastItemKey}`);
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

    function setStatus(status) {
      document.dispatchEvent(
        new CustomEvent(config.statusEvent, {
          detail: {
            quickBombLastItem: state.lastItemKey,
            quickBombReplayCount: state.replayCount,
            quickBombSocketId: state.socketId,
            quickBombLastReplayAt: state.lastReplayAt,
            lastStatus: status,
          },
        }),
      );
    }

    return {
      install,
    };
  }
