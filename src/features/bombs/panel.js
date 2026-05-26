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
            <div style="color:#BFE7F1;font-weight:700;">Bomb spammer</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;align-items:end;margin-top:10px;color:#BFE7F1;">
              <label style="${getQuickBombFieldStyle()}">
                <span>Per ten seconds</span>
                <input data-tj-helper-quick-bomb-rate type="number" step="any" min="1" max="1000" style="${getQuickBombInputStyle()}" />
              </label>
              <label style="${getQuickBombFieldStyle()}">
                <span>Mode</span>
                <select data-tj-helper-quick-bomb-run-mode style="${getQuickBombInputStyle()}">
                  <option value="one-off">One-off</option>
                  <option value="timed">Timed</option>
                  <option value="instant">Instant</option>
                </select>
              </label>
              <label style="${getQuickBombFieldStyle()}">
                <span>Limit</span>
                <select data-tj-helper-quick-bomb-mode style="${getQuickBombInputStyle()}">
                  <option value="duration">Duration</option>
                  <option value="ammo">Ammo</option>
                </select>
              </label>
              <label data-tj-helper-quick-bomb-duration-label style="${getQuickBombFieldStyle()}">
                <span>Seconds</span>
                <input data-tj-helper-quick-bomb-duration type="number" step="1" style="${getQuickBombInputStyle()}" />
              </label>
            </div>
            <div data-tj-helper-quick-bomb-ammo-label style="${getQuickBombFieldStyle()}margin-top:8px;">
              <span>Ammo</span>
              <div data-tj-helper-quick-bomb-ammo-controls style="display:grid;grid-template-columns:minmax(48px,auto) minmax(42px,auto) minmax(72px,1fr) minmax(42px,auto) minmax(48px,auto);gap:6px;min-width:0;align-items:center;">
                <button data-tj-helper-quick-bomb-ammo-step="-100" type="button" style="${getQuickBombSmallButtonStyle()}">-100</button>
                <button data-tj-helper-quick-bomb-ammo-step="-10" type="button" style="${getQuickBombSmallButtonStyle()}">-10</button>
                <input data-tj-helper-quick-bomb-ammo type="number" step="1" style="${getQuickBombInputStyle()}" />
                <button data-tj-helper-quick-bomb-ammo-step="10" type="button" style="${getQuickBombSmallButtonStyle()}">+10</button>
                <button data-tj-helper-quick-bomb-ammo-step="100" type="button" style="${getQuickBombSmallButtonStyle()}">+100</button>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-top:10px;">
              <button data-tj-helper-quick-bomb-start type="button" style="${getQuickBombActionButtonStyle("#7ED6C4")}">Start</button>
              <button data-tj-helper-quick-bomb-stop type="button" style="${getQuickBombActionButtonStyle("#DDEAF2")}">Stop</button>
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
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-run-mode]").addEventListener("change", (event) => {
        setQuickBombRunMode(event.target.value);
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
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo-controls]").addEventListener("click", (event) => {
        const stepButton = event.target.closest("[data-tj-helper-quick-bomb-ammo-step]");
        if (!stepButton) {
          return;
        }

        const step = parseInt(stepButton.dataset.tjHelperQuickBombAmmoStep, 10);
        if (!Number.isFinite(step)) {
          return;
        }

        setQuickBombAmmo(Math.max(1, getQuickBombAmmo() + step));
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
    const rateInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-rate]");
    const runModeSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-run-mode]");
    const modeSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-mode]");
    const durationInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration]");
    const ammoInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo]");
    const ammoControls = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo-controls]");
    const durationLabel = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration-label]");
    const ammoLabel = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo-label]");
    const startButton = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-start]");
    const stopButton = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-stop]");
    const statusElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-status]");
    const itemSortSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-item-sort]");
    const itemsElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-items]");
    const targetsElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-targets]");

    rateInput.value = String(getQuickBombRate());
    const runMode = getQuickBombRunMode();
    runModeSelect.value = runMode;
    modeSelect.value = getQuickBombMode();
    durationInput.value = String(getQuickBombDuration());
    ammoInput.value = String(getQuickBombAmmo());
    durationInput.style.display = getQuickBombMode() === "duration" ? "" : "none";
    durationLabel.style.display = getQuickBombMode() === "duration" ? "" : "none";
    ammoControls.style.display = getQuickBombMode() === "ammo" ? "grid" : "none";
    ammoLabel.style.display = getQuickBombMode() === "ammo" ? "" : "none";
    const disableRate = runMode === "instant" || runMode === "one-off";
    const disableLimitOptions = runMode === "one-off";
    rateInput.disabled = disableRate;
    rateInput.style.opacity = disableRate ? ".48" : "1";
    modeSelect.disabled = disableLimitOptions;
    modeSelect.style.opacity = disableLimitOptions ? ".48" : "1";
    durationInput.disabled = disableLimitOptions;
    durationInput.style.opacity = disableLimitOptions ? ".48" : "1";
    ammoInput.disabled = disableLimitOptions;
    ammoInput.style.opacity = disableLimitOptions ? ".48" : "1";
    for (const stepButton of ammoControls.querySelectorAll("[data-tj-helper-quick-bomb-ammo-step]")) {
      stepButton.disabled = disableLimitOptions;
      stepButton.style.opacity = disableLimitOptions ? ".48" : "1";
    }
    itemSortSelect.value = getQuickBombItemSort();

    const players = Array.isArray(state.quickBombPlayers) ? state.quickBombPlayers : [];
    const selectedTarget = players.find((player) => player.playerId === state.quickBombSelectedPlayerId);
    const hasTarget = Boolean(selectedTarget?.playerName);
    const hasItem = Boolean(state.quickBombSelectedItem || state.quickBombLastItem);
    const canStart = state.quickBombInRoom && hasTarget && hasItem && !state.quickBombActive;
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

  function getQuickBombFieldStyle() {
    return "display:grid;gap:4px;min-width:0;color:#BFE7F1;";
  }

  function getQuickBombInputStyle() {
    return "width:100%;min-width:0;box-sizing:border-box;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;";
  }

  function getQuickBombSmallButtonStyle() {
    return "min-width:42px;white-space:nowrap;text-align:center;background:rgba(191,231,241,.12);color:#BFE7F1;border:1px solid rgba(191,231,241,.36);border-radius:4px;padding:6px 8px;font:11px/1.1 Arial,sans-serif;font-weight:700;cursor:pointer;";
  }

  function getQuickBombActionButtonStyle(background) {
    return `min-width:104px;background:${background};color:#0B1B20;border:0;border-radius:4px;padding:6px 12px;font-weight:700;cursor:pointer;`;
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
