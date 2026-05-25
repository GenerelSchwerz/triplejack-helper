  function openSessionHistoryPanel() {
    sessionHistoryPanel?.remove();

    sessionHistoryPanel = document.createElement("div");
    sessionHistoryPanel.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:50%",
      "z-index:2147483646",
      "transform:translate(-50%,-50%)",
      "width:min(820px,calc(100vw - 28px))",
      "max-height:min(760px,calc(100vh - 28px))",
      "overflow:auto",
      "padding:14px",
      "border:1px solid rgba(137,198,215,.9)",
      "border-radius:8px",
      "background:rgba(18,31,39,.98)",
      "color:#F5FAFC",
      "font:12px/1.35 Arial,sans-serif",
      "box-shadow:0 12px 36px rgba(0,0,0,.5)",
    ].join(";");

    const dateRange = getSessionHistoryDateRange();
    sessionHistoryPanel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
        <strong style="font-size:15px;">Session History</strong>
        <button type="button" data-tj-session-history-close style="border:0;background:#294655;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;">x</button>
      </div>
      <div style="${getHistoryControlGridStyle()}">
        <label style="display:grid;gap:3px;color:#BFE7F1;">Start
          <input type="date" data-tj-session-history-start value="${dateRange.startDate}" style="${getHistoryInputStyle()}" />
        </label>
        <label style="display:grid;gap:3px;color:#BFE7F1;">End
          <input type="date" data-tj-session-history-end value="${dateRange.endDate}" style="${getHistoryInputStyle()}" />
        </label>
        <label style="display:grid;gap:3px;color:#BFE7F1;">Group
          <select data-tj-session-history-group style="${getHistoryInputStyle()}">
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="day">Day</option>
            <option value="all">All</option>
          </select>
        </label>
        <label style="display:grid;gap:3px;color:#BFE7F1;">Room type
          <select data-tj-session-history-room style="${getHistoryInputStyle()}"></select>
        </label>
      </div>
      <div data-tj-session-history-body></div>
    `;

    const closeButton = sessionHistoryPanel.querySelector("[data-tj-session-history-close]");
    const roomSelect = sessionHistoryPanel.querySelector("[data-tj-session-history-room]");
    closeButton.addEventListener("click", closeSessionHistoryPanel);

    roomSelect.appendChild(new Option("All room types", ""));
    for (const roomType of getSessionHistoryRoomTypes()) {
      roomSelect.appendChild(new Option(roomType, roomType));
    }

    for (const control of sessionHistoryPanel.querySelectorAll("input,select")) {
      control.addEventListener("change", renderSessionHistoryPanelBody);
    }

    (document.body || document.documentElement).appendChild(sessionHistoryPanel);
    renderSessionHistoryPanelBody();
  }

  function closeSessionHistoryPanel() {
    sessionHistoryPanel?.remove();
    sessionHistoryPanel = null;
  }

  function renderSessionHistoryPanelBody() {
    if (!sessionHistoryPanel) {
      return;
    }

    const body = sessionHistoryPanel.querySelector("[data-tj-session-history-body]");
    const filters = {
      startDate: sessionHistoryPanel.querySelector("[data-tj-session-history-start]").value,
      endDate: sessionHistoryPanel.querySelector("[data-tj-session-history-end]").value,
      groupBy: sessionHistoryPanel.querySelector("[data-tj-session-history-group]").value,
      roomType: sessionHistoryPanel.querySelector("[data-tj-session-history-room]").value,
    };
    const report = getSessionHistoryReport(filters);

    if (!report.overall.sessions) {
      body.innerHTML = `<div style="color:#8FB8C4;">No tracked sessions match this date range.</div>`;
      return;
    }

    body.innerHTML = `
      <div style="${getHistoryMetricGridStyle()}">
        ${renderHistoryMetric("Sessions", report.overall.sessions)}
        ${renderHistoryMetric("Net BB", formatHistorySigned(report.overall.bigBlindDelta), getHistoryStatColor(report.overall.bigBlindDelta))}
        ${renderHistoryMetric("BB/hour", `${formatHistorySigned(report.overall.bigBlindsPerHour)}/h`, getHistoryStatColor(report.overall.bigBlindDelta))}
        ${renderHistoryMetric("Hours", (report.overall.durationMs / 3600000).toFixed(1))}
      </div>
      <div style="${getHistorySplitGridStyle()}">
        <section style="${getHistorySectionStyle()}">
          <div style="${getHistoryHeadingStyle()}">Period trend</div>
          <div style="display:grid;gap:5px;">${report.periods.map(renderHistoryPeriodRow).join("")}</div>
        </section>
        <section style="${getHistorySectionStyle()}">
          <div style="${getHistoryHeadingStyle()}">Room types</div>
          <div style="display:grid;gap:5px;">${report.byRoomType.map(renderHistoryRoomRow).join("")}</div>
        </section>
      </div>
      <section style="${getHistorySectionStyle()}">
        <div style="${getHistoryHeadingStyle()}">Sessions</div>
        <div style="display:grid;gap:4px;">${report.sessions.map(renderHistorySessionRow).join("")}</div>
      </section>
    `;
  }

  function renderHistoryMetric(label, value, color = "#F5FAFC") {
    return `
      <div style="${getHistorySectionStyle()}">
        <div style="color:#8FB8C4;margin-bottom:3px;">${escapeHistoryHtml(label)}</div>
        <strong style="font-size:15px;color:${color};">${escapeHistoryHtml(value)}</strong>
      </div>
    `;
  }

  function renderHistoryPeriodRow(period) {
    return `
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 64px 72px 64px;gap:8px;">
        <span>${escapeHistoryHtml(period.periodLabel)}</span>
        <span style="color:#8FB8C4;">${period.sessions} ses</span>
        <strong style="color:${getHistoryStatColor(period.bigBlindDelta)};">${formatHistorySigned(period.bigBlindDelta)} BB</strong>
        <span style="color:${getHistoryStatColor(period.bigBlindDelta)};">${formatHistorySigned(period.bigBlindsPerHour)}/h</span>
      </div>
    `;
  }

  function renderHistoryRoomRow(roomStats) {
    return `
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 64px 72px;gap:8px;">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHistoryAttribute(roomStats.roomType)}">${escapeHistoryHtml(roomStats.roomType)}</span>
        <span style="color:#8FB8C4;">${roomStats.sessions} ses</span>
        <strong style="color:${getHistoryStatColor(roomStats.bigBlindDelta)};">${formatHistorySigned(roomStats.bigBlindsPerHour)}/h</strong>
      </div>
    `;
  }

  function renderHistorySessionRow(session) {
    return `
      <div style="display:grid;grid-template-columns:120px minmax(0,1fr) 72px 72px 72px;gap:8px;border-top:1px solid rgba(191,231,241,.1);padding-top:4px;">
        <span style="color:#8FB8C4;">${escapeHistoryHtml(formatHistoryDateTime(session.endedAt))}</span>
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHistoryAttribute(session.roomType || "")}">${escapeHistoryHtml(session.roomType || "Unknown room")}</span>
        <strong style="color:${getHistoryStatColor(session.bigBlindDelta)};">${formatHistorySigned(session.bigBlindDelta)} BB</strong>
        <span style="color:${getHistoryStatColor(session.bigBlindDelta)};">${formatHistorySigned(session.bigBlindsPerHour)}/h</span>
        <span style="color:#8FB8C4;">${formatHistoryDuration(session.durationMs)}</span>
      </div>
    `;
  }

  function getHistoryInputStyle() {
    return "width:100%;min-width:0;box-sizing:border-box;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:5px;";
  }

  function getHistoryControlGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-bottom:12px;";
  }

  function getHistoryMetricGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;";
  }

  function getHistorySplitGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:12px;";
  }

  function getHistorySectionStyle() {
    return "border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:9px;background:rgba(255,255,255,.025);";
  }

  function getHistoryHeadingStyle() {
    return "margin-bottom:6px;color:#BFE7F1;font-weight:700;";
  }

  function formatHistorySigned(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return "n/a";
    }

    const number = Number(value);
    return `${number >= 0 ? "+" : ""}${number.toFixed(1)}`;
  }

  function getHistoryStatColor(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return "#8FB8C4";
    }

    return Number(value) >= 0 ? "#A7D8AD" : "#FFB0A8";
  }

  function formatHistoryDateTime(timestamp) {
    return new Date(timestamp).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatHistoryDuration(durationMs) {
    const minutes = Math.max(1, Math.round(durationMs / 60000));
    if (minutes < 60) {
      return `${minutes}m`;
    }

    return `${(minutes / 60).toFixed(1)}h`;
  }

  function escapeHistoryHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeHistoryAttribute(value) {
    return escapeHistoryHtml(value);
  }
