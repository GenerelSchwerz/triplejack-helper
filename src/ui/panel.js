  function renderStatusPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!state.panelVisible) {
      statusPanel?.remove();
      renderToolbarButtons();
      return;
    }

    if (!statusPanel) {
      statusPanel = document.createElement("div");
      statusPanel.style.cssText = [
        "position:fixed",
        "right:8px",
        "top:48px",
        "z-index:2147483647",
        "width:min(380px,calc(100vw - 16px))",
        "max-height:calc(100vh - 64px)",
        "overflow:auto",
        "padding:12px",
        "border:1px solid #2D6F89",
        "border-radius:6px",
        "background:rgba(18,31,39,.96)",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
        "box-shadow:0 4px 16px rgba(0,0,0,.32)",
      ].join(";");
      statusPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <strong style="font-size:13px;">Triplejack Helper</strong>
          <button type="button" data-tj-helper-close style="border:0;background:#294655;color:#fff;border-radius:4px;padding:2px 7px;cursor:pointer;">x</button>
        </div>
        <div style="display:grid;gap:10px;">
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Translation</div>
            <div style="display:grid;grid-template-columns:94px minmax(0,1fr) 72px;gap:6px;align-items:center;margin-bottom:8px;">
              <label style="color:#BFE7F1;">Incoming</label>
              <select data-tj-helper-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
              <input data-tj-helper-custom-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
            </div>
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#BFE7F1;">
              <input data-tj-helper-outgoing-enabled type="checkbox" style="margin:0;" />
              Translate sent messages
            </label>
            <div style="display:grid;grid-template-columns:94px minmax(0,1fr) 72px;gap:6px;align-items:center;">
              <label style="color:#BFE7F1;">Outgoing</label>
              <select data-tj-helper-outgoing-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
              <input data-tj-helper-custom-outgoing-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
            </div>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Messages</div>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Message timestamps</span>
              <input data-tj-helper-message-timestamps-enabled type="checkbox" style="margin:0;" />
            </label>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Session Tracking</div>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Summary on leave</span>
              <input data-tj-helper-session-summary-enabled type="checkbox" style="margin:0;" />
            </label>
            <div data-tj-helper-session-tracking-stats style="margin-top:8px;color:#D6EEF5;"></div>
            <button type="button" data-tj-helper-session-history-open style="margin-top:8px;width:100%;border:1px solid #74A7B9;background:#294655;color:#fff;border-radius:4px;padding:5px;cursor:pointer;">Detailed history</button>
          </section>
          <div style="border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
            <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Status</div>
            <div data-tj-helper-stats style="color:#D6EEF5;"></div>
            <div data-tj-helper-status style="margin-top:6px;color:#A7D8AD;"></div>
          </div>
        </div>
      `;

      const closeButton = statusPanel.querySelector("[data-tj-helper-close]");
      const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
      const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
      const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
      const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
      const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
      const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");
      const sessionSummaryInput = statusPanel.querySelector("[data-tj-helper-session-summary-enabled]");
      const sessionHistoryOpenButton = statusPanel.querySelector("[data-tj-helper-session-history-open]");

      for (const [value, label] of LANGUAGE_OPTIONS) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        languageSelect.appendChild(option);

        const outgoingOption = document.createElement("option");
        outgoingOption.value = value;
        outgoingOption.textContent = label;
        outgoingLanguageSelect.appendChild(outgoingOption);
      }

      closeButton.addEventListener("click", () => {
        state.panelVisible = false;
        renderStatusPanel();
      });

      languageSelect.addEventListener("change", () => {
        setTargetLanguage(languageSelect.value);
      });

      customLanguageInput.addEventListener("change", () => {
        setTargetLanguage(customLanguageInput.value);
      });

      outgoingEnabledInput.addEventListener("change", () => {
        setOutgoingTranslationEnabled(outgoingEnabledInput.checked);
      });

      outgoingLanguageSelect.addEventListener("change", () => {
        setOutgoingTargetLanguage(outgoingLanguageSelect.value);
      });

      customOutgoingLanguageInput.addEventListener("change", () => {
        setOutgoingTargetLanguage(customOutgoingLanguageInput.value);
      });

      messageTimestampsInput.addEventListener("change", () => {
        setMessageTimestampsEnabled(messageTimestampsInput.checked);
      });

      sessionSummaryInput.addEventListener("change", () => {
        setSessionSummaryEnabled(sessionSummaryInput.checked);
      });

      sessionHistoryOpenButton.addEventListener("click", openSessionHistoryPanel);
    }

    const targetLanguage = getTargetLanguage();
    const outgoingTargetLanguage = getOutgoingTargetLanguage();
    const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
    const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
    const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
    const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
    const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
    const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");
    const sessionSummaryInput = statusPanel.querySelector("[data-tj-helper-session-summary-enabled]");
    const sessionTrackingStatsElement = statusPanel.querySelector("[data-tj-helper-session-tracking-stats]");
    const statsElement = statusPanel.querySelector("[data-tj-helper-stats]");
    const statusElement = statusPanel.querySelector("[data-tj-helper-status]");

    if (LANGUAGE_OPTIONS.some(([value]) => value === targetLanguage)) {
      languageSelect.value = targetLanguage;
    }

    if (LANGUAGE_OPTIONS.some(([value]) => value === outgoingTargetLanguage)) {
      outgoingLanguageSelect.value = outgoingTargetLanguage;
    }

    customLanguageInput.value = targetLanguage;
    outgoingEnabledInput.checked = getOutgoingTranslationEnabled();
    customOutgoingLanguageInput.value = outgoingTargetLanguage;
    messageTimestampsInput.checked = getMessageTimestampsEnabled();
    sessionSummaryInput.checked = getSessionSummaryEnabled();
    sessionTrackingStatsElement.innerHTML = renderSessionTrackingStats();
    statsElement.textContent = `${state.hooked ? "hooked" : "not hooked"} | sockets ${state.sockets}, messages ${state.chatsSeen}, translations ${state.translationsShown}`;
    statusElement.textContent = state.lastStatus;

    const parent = document.body || document.documentElement;
    if (statusPanel.parentNode !== parent) {
      parent.appendChild(statusPanel);
    }

    renderToolbarButtons();
  }

  function renderSessionTrackingStats() {
    const trackingStats = getSessionTrackingStats();
    if (!trackingStats.overall.sessions) {
      return `<div style="color:#8FB8C4;">No tracked sessions yet.</div>`;
    }

    const roomRows = trackingStats.byRoomType
      .map((roomStats) => {
        return `
          <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;">
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapePanelAttribute(roomStats.roomType)}">${escapePanelHtml(roomStats.roomType)}</span>
            <strong style="color:${getSessionStatColor(roomStats.bigBlindDelta)};">${formatSessionStatSigned(roomStats.bigBlindsPerHour)}/h</strong>
          </div>
        `;
      })
      .join("");

    const recentRows = trackingStats.recentSessions
      .map((session) => {
        return `
          <div style="display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:6px;align-items:center;">
            <span style="color:#8FB8C4;">${formatSessionDate(session.endedAt)}</span>
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapePanelAttribute(session.roomType || "")}">${escapePanelHtml(session.roomType || "Unknown room")}</span>
            <strong style="color:${getSessionStatColor(session.bigBlindDelta)};">${formatSessionStatSigned(session.bigBlindDelta)} BB</strong>
          </div>
        `;
      })
      .join("");

    return `
      <div style="margin-top:8px;border-top:1px solid rgba(191,231,241,.16);padding-top:8px;">
        <div style="display:grid;grid-template-columns:1fr auto;gap:6px;margin-bottom:6px;">
          <span style="color:#BFE7F1;">Overall</span>
          <strong style="color:${getSessionStatColor(trackingStats.overall.bigBlindDelta)};">${formatSessionStatSigned(trackingStats.overall.bigBlindsPerHour)}/h</strong>
          <span style="color:#8FB8C4;">${trackingStats.overall.sessions} sessions</span>
          <span style="color:${getSessionStatColor(trackingStats.overall.bigBlindDelta)};">${formatSessionStatSigned(trackingStats.overall.bigBlindDelta)} BB</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:6px;margin-bottom:8px;">
          <span style="color:#BFE7F1;">Recent 5</span>
          <strong style="color:${getSessionStatColor(trackingStats.recentTrend.bigBlindDelta)};">${formatSessionStatSigned(trackingStats.recentTrend.bigBlindsPerHour)}/h</strong>
          <span style="color:#8FB8C4;">Previous 5</span>
          <span style="color:${getSessionStatColor(trackingStats.previousTrend.bigBlindDelta)};">${formatSessionStatSigned(trackingStats.previousTrend.bigBlindsPerHour)}/h</span>
        </div>
        <div style="margin-bottom:4px;color:#BFE7F1;">By room type</div>
        <div style="display:grid;gap:4px;margin-bottom:8px;">${roomRows}</div>
        <div style="margin-bottom:4px;color:#BFE7F1;">Recent sessions</div>
        <div style="display:grid;gap:4px;">${recentRows}</div>
      </div>
    `;
  }

  function formatSessionStatSigned(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "n/a";
    }

    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  }

  function getSessionStatColor(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "#8FB8C4";
    }

    return value >= 0 ? "#A7D8AD" : "#FFB0A8";
  }

  function formatSessionDate(timestamp) {
    return new Date(timestamp).toLocaleDateString([], { month: "numeric", day: "numeric" }) +
      " " +
      new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function escapePanelHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapePanelAttribute(value) {
    return escapePanelHtml(value);
  }
