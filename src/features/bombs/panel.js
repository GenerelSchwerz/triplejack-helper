  function renderQuickBombPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!isHelperPanelActive(QUICK_BOMB_PANEL_ID)) {
      quickBombPanel?.remove();
      quickBombPanel = null;
      return;
    }

    const panelMount = getHelperPanelMount();
    if (!panelMount) {
      return;
    }

    if (!quickBombPanel) {
      quickBombPanel = document.createElement("div");
      quickBombPanel.style.cssText = [
        "width:100%",
        "height:100%",
        "box-sizing:border-box",
        "overflow:auto",
        "padding:12px",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
      ].join(";");
      quickBombPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <strong style="font-size:13px;">Quick Bomb</strong>
        </div>
        <div style="display:grid;gap:10px;">
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Bomb spammer</span>
              <input data-tj-helper-quick-bomb-enabled type="checkbox" style="margin:0;" />
            </label>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 68px;gap:6px;align-items:center;margin-top:8px;color:#BFE7F1;">
              <label>Per ten seconds</label>
              <input data-tj-helper-quick-bomb-rate type="number" step="any" min="1" max="1000" style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
              <label>Speed</label>
              <select data-tj-helper-quick-bomb-speed-mode style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;">
                <option value="timed">Timed</option>
                <option value="instant">Instant</option>
              </select>
              <label>Limit</label>
              <select data-tj-helper-quick-bomb-mode style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;">
                <option value="duration">Duration</option>
                <option value="ammo">Ammo</option>
              </select>
              <label data-tj-helper-quick-bomb-duration-label>Seconds</label>
              <input data-tj-helper-quick-bomb-duration type="number" step="1" style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
              <label data-tj-helper-quick-bomb-ammo-label>Ammo</label>
              <input data-tj-helper-quick-bomb-ammo type="number" step="1" style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
              <button data-tj-helper-quick-bomb-start type="button" style="background:#7ED6C4;color:#0B1B20;border:0;border-radius:4px;padding:5px 8px;font-weight:700;">Start</button>
              <button data-tj-helper-quick-bomb-stop type="button" style="background:#DDEAF2;color:#0B1B20;border:0;border-radius:4px;padding:5px 8px;font-weight:700;">Stop</button>
            </div>
            <div data-tj-helper-quick-bomb-status style="margin-top:6px;color:#8FB8C4;font-size:11px;"></div>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Targets</div>
            <div data-tj-helper-quick-bomb-targets style="display:grid;gap:6px;"></div>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:8px;align-items:center;margin-bottom:8px;">
              <div style="color:#E9F7FA;font-weight:700;">Items</div>
              <select data-tj-helper-quick-bomb-item-sort style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;">
                <option value="cost-asc">Cost ↑</option>
                <option value="cost-desc">Cost ↓</option>
                <option value="name">Name</option>
              </select>
            </div>
            <div data-tj-helper-quick-bomb-items style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;"></div>
          </section>
        </div>
      `;

      let previousRateValue = null;
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-enabled]").addEventListener("change", (event) => {
        setQuickBombEnabled(event.target.checked);
      });
      const rateInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-rate]");
      rateInput.addEventListener("change", (event) => {
        const newValue = parseFloat(event.target.value);
        if (previousRateValue !== null) {
          const diff = Math.abs(newValue - previousRateValue);
          if (Math.abs(diff - 1) < 0.01) {
            const roundedValue = Math.round(newValue);
            event.target.value = String(roundedValue);
            setQuickBombRate(roundedValue);
            previousRateValue = roundedValue;
            return;
          }
        }
        setQuickBombRate(event.target.value);
        previousRateValue = newValue;
      });
      rateInput.addEventListener("input", (event) => {
        previousRateValue = parseFloat(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-speed-mode]").addEventListener("change", (event) => {
        setQuickBombSpeedMode(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-mode]").addEventListener("change", (event) => {
        setQuickBombMode(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration]").addEventListener("change", (event) => {
        setQuickBombDuration(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo]").addEventListener("change", (event) => {
        setQuickBombAmmo(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-item-sort]").addEventListener("change", (event) => {
        setQuickBombItemSort(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-start]").addEventListener("click", () => {
        sendQuickBombControl("start");
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-stop]").addEventListener("click", () => {
        sendQuickBombControl("stop");
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-targets]").addEventListener("click", (event) => {
        const targetButton = event.target.closest("[data-tj-helper-quick-bomb-target]");
        if (!targetButton) {
          return;
        }

        sendQuickBombControl("selectTarget", {
          playerId: targetButton.dataset.tjHelperPlayerId,
          playerName: targetButton.dataset.tjHelperPlayerName,
          seat: targetButton.dataset.tjHelperSeat,
        });
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-items]").addEventListener("click", (event) => {
        const itemButton = event.target.closest("[data-tj-helper-quick-bomb-item]");
        if (!itemButton) {
          return;
        }

        sendQuickBombControl("selectItem", {
          itemKey: itemButton.dataset.tjHelperItemKey,
        });
      });
    }

    refreshQuickBombPanel();

    if (quickBombPanel.parentNode !== panelMount) {
      panelMount.replaceChildren(quickBombPanel);
    }
  }

  function refreshQuickBombPanel() {
    const enabledInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-enabled]");
    const rateInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-rate]");
    const speedModeSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-speed-mode]");
    const modeSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-mode]");
    const durationInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration]");
    const ammoInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo]");
    const durationLabel = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration-label]");
    const ammoLabel = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo-label]");
    const startButton = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-start]");
    const stopButton = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-stop]");
    const statusElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-status]");
    const itemSortSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-item-sort]");
    const itemsElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-items]");
    const targetsElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-targets]");

    enabledInput.checked = getQuickBombEnabled();
    rateInput.value = String(getQuickBombRate());
    speedModeSelect.value = getQuickBombSpeedMode();
    modeSelect.value = getQuickBombMode();
    durationInput.value = String(getQuickBombDuration());
    ammoInput.value = String(getQuickBombAmmo());
    durationInput.style.display = getQuickBombMode() === "duration" ? "" : "none";
    durationLabel.style.display = getQuickBombMode() === "duration" ? "" : "none";
    ammoInput.style.display = getQuickBombMode() === "ammo" ? "" : "none";
    ammoLabel.style.display = getQuickBombMode() === "ammo" ? "" : "none";
    itemSortSelect.value = getQuickBombItemSort();

    const players = Array.isArray(state.quickBombPlayers) ? state.quickBombPlayers : [];
    const selectedTarget = players.find((player) => player.playerId === state.quickBombSelectedPlayerId);
    const hasTarget = Boolean(selectedTarget?.playerName);
    const hasItem = Boolean(state.quickBombSelectedItem || state.quickBombLastItem);
    const canStart = state.quickBombInRoom && hasTarget && hasItem && getQuickBombEnabled() && !state.quickBombActive;
    startButton.disabled = !canStart;
    stopButton.disabled = !state.quickBombActive;
    startButton.style.opacity = startButton.disabled ? ".5" : "1";
    stopButton.style.opacity = stopButton.disabled ? ".5" : "1";
    const activeItem = state.quickBombSelectedItem || state.quickBombLastItem;
    statusElement.textContent = activeItem
      ? `Selected: ${activeItem} | last thrown: ${state.quickBombLastItem || "none"} | cost ${state.quickBombAmmoCost || 1} | sent ${state.quickBombReplayCount || 0}${
          state.quickBombActive ? ` | remaining ${state.quickBombRemaining || 0}` : ""
        }`
      : "Select an item or throw one bomb.";
    renderQuickBombTargets(targetsElement);
    renderQuickBombItems(itemsElement);

  }

  function renderQuickBombItems(itemsElement) {
    const items = sortQuickBombItems(Array.isArray(state.quickBombItems) ? state.quickBombItems : []);
    const selectedItem = state.quickBombSelectedItem || state.quickBombLastItem;
    if (!items.length) {
      itemsElement.innerHTML = `<div style="grid-column:1/-1;color:#8FB8C4;">Waiting for item definitions.</div>`;
      return;
    }

    itemsElement.innerHTML = items
      .map((item) => {
        const selected = item.itemKey === selectedItem;
        return `
          <button
            type="button"
            data-tj-helper-quick-bomb-item="1"
            data-tj-helper-item-key="${escapeQuickBombHtml(item.itemKey)}"
            style="min-width:0;text-align:left;border:1px solid ${selected ? "rgba(126,214,196,.95)" : "rgba(191,231,241,.2)"};border-radius:6px;background:${selected ? "rgba(126,214,196,.16)" : "rgba(255,255,255,.035)"};color:#F5FAFC;padding:7px;cursor:pointer;"
          >
            <span style="display:block;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeQuickBombHtml(item.label || item.itemKey)}</span>
            <span style="display:block;color:#8FB8C4;font-size:11px;margin-top:2px;">${escapeQuickBombHtml(item.itemKey)} | ${escapeQuickBombHtml(item.cost || 1)}</span>
          </button>
        `;
      })
      .join("");
  }

  function sortQuickBombItems(items) {
    const sort = getQuickBombItemSort();
    return [...items].sort((a, b) => {
      if (sort === "cost-asc") {
        return Number(a.cost || 0) - Number(b.cost || 0) || compareQuickBombItemNames(a, b);
      }

      if (sort === "cost-desc") {
        return Number(b.cost || 0) - Number(a.cost || 0) || compareQuickBombItemNames(a, b);
      }

      return compareQuickBombItemNames(a, b);
    });
  }

  function compareQuickBombItemNames(a, b) {
    return String(a.label || a.itemKey).localeCompare(String(b.label || b.itemKey));
  }

  function renderQuickBombTargets(targetsElement) {
    const players = Array.isArray(state.quickBombPlayers) ? state.quickBombPlayers : [];
    if (!state.quickBombInRoom) {
      targetsElement.innerHTML = `<div style="color:#8FB8C4;">Not in a room.</div>`;
      return;
    }

    if (!players.length) {
      targetsElement.innerHTML = `<div style="color:#8FB8C4;">No room players found.</div>`;
      return;
    }

    targetsElement.innerHTML = players
      .map((player) => {
        const selected = player.playerId === state.quickBombSelectedPlayerId;
        return `
          <button
            type="button"
            data-tj-helper-quick-bomb-target="1"
            data-tj-helper-player-id="${escapeQuickBombHtml(player.playerId)}"
            data-tj-helper-player-name="${escapeQuickBombHtml(player.playerName)}"
            data-tj-helper-seat="${escapeQuickBombHtml(player.seat)}"
            style="width:100%;text-align:left;border:1px solid ${selected ? "rgba(126,214,196,.95)" : "rgba(191,231,241,.2)"};border-radius:6px;background:${selected ? "rgba(126,214,196,.16)" : "rgba(255,255,255,.035)"};color:#F5FAFC;padding:8px;cursor:pointer;"
          >
            <span style="display:block;font-weight:700;">${escapeQuickBombHtml(player.playerName || `Seat ${player.seat}`)}</span>
            <span style="display:block;color:#8FB8C4;font-size:11px;margin-top:2px;">Seat ${escapeQuickBombHtml(player.seat)}${selected ? " | selected" : ""}</span>
          </button>
        `;
      })
      .join("");
  }

  function escapeQuickBombHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
