  function renderSessionHistoryPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!isHelperPanelActive(SESSION_HISTORY_PANEL_ID)) {
      sessionHistoryPanel?.remove();
      sessionHistoryPanel = null;
      return;
    }

    const panelMount = getHelperPanelMount();
    if (!panelMount) {
      return;
    }

    if (sessionHistoryPanel) {
      if (sessionHistoryPanel.parentNode !== panelMount) {
        panelMount.replaceChildren(sessionHistoryPanel);
      }
      renderSessionHistoryPanelBody();
      return;
    }

    sessionHistoryPanel = document.createElement("div");
    sessionHistoryPanel.style.cssText = [
      "width:100%",
      "height:100%",
      "box-sizing:border-box",
      "overflow:auto",
      "overflow-x:hidden",
      "padding:14px",
      "color:#F5FAFC",
      "font:12px/1.35 Arial,sans-serif",
    ].join(";");

    const dateRange = getSessionHistoryDateRange();
    sessionHistoryPanel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
        <strong style="font-size:15px;">Session History</strong>
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

    const roomSelect = sessionHistoryPanel.querySelector("[data-tj-session-history-room]");

    roomSelect.appendChild(new Option("All room types", ""));
    for (const roomType of getSessionHistoryRoomTypes()) {
      roomSelect.appendChild(new Option(roomType, roomType));
    }

    for (const control of sessionHistoryPanel.querySelectorAll("input,select")) {
      control.addEventListener("change", renderSessionHistoryPanelBody);
    }

    panelMount.replaceChildren(sessionHistoryPanel);
    renderSessionHistoryPanelBody();
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
        ${renderHistoryMetric("Time", formatHistoryDuration(report.overall.durationMs))}
      </div>
      ${renderHistoryTrendGraph(report)}
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

  function renderHistoryTrendGraph(report) {
    const periods = report.periods || [];
    if (!periods.length) {
      return "";
    }

    const chartWidth = 360;
    const chartHeight = 190;
    const padding = { top: 14, right: 14, bottom: 32, left: 42 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    let cumulativeBigBlinds = 0;
    const chartPoints = periods.map((period) => {
      cumulativeBigBlinds += Number(period.bigBlindDelta) || 0;
      return {
        label: period.periodLabel,
        netBigBlinds: Number(period.bigBlindDelta) || 0,
        cumulativeBigBlinds,
      };
    });
    const values = chartPoints.flatMap((point) => [point.netBigBlinds, point.cumulativeBigBlinds, 0]);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue === minValue ? 1 : maxValue - minValue;
    const xForIndex = (index) =>
      chartPoints.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (chartPoints.length - 1)) * plotWidth;
    const yForValue = (value) => padding.top + ((maxValue - value) / range) * plotHeight;
    const zeroY = yForValue(0);
    const barSlotWidth = plotWidth / Math.max(chartPoints.length, 1);
    const barWidth = Math.max(5, Math.min(22, barSlotWidth * 0.42));
    const linePoints = chartPoints
      .map((point, index) => `${xForIndex(index).toFixed(1)},${yForValue(point.cumulativeBigBlinds).toFixed(1)}`)
      .join(" ");
    const labelStep = Math.max(1, Math.ceil(chartPoints.length / 5));
    const yTicks = [maxValue, (maxValue + minValue) / 2, minValue];

    return `
      <section style="${getHistorySectionStyle()}margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div style="${getHistoryHeadingStyle()}margin-bottom:0;">Selected range graph</div>
          <div style="display:flex;gap:8px;align-items:center;color:#8FB8C4;font-size:11px;white-space:nowrap;">
            <span><span style="${getHistoryLegendSwatchStyle("#6EA8FE")}"></span>Net BB</span>
            <span><span style="${getHistoryLegendSwatchStyle("#F6C85F")}"></span>Cumulative</span>
          </div>
        </div>
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Session history graph for selected range" style="display:block;width:100%;height:auto;max-height:230px;overflow:visible;">
          <rect x="0" y="0" width="${chartWidth}" height="${chartHeight}" rx="6" fill="rgba(8,17,23,.35)"></rect>
          ${yTicks
            .map((tick) => {
              const y = yForValue(tick);
              return `
                <line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${chartWidth - padding.right}" y2="${y.toFixed(1)}" stroke="rgba(191,231,241,.12)" stroke-width="1"></line>
                <text x="${padding.left - 7}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="#8FB8C4" font-size="9">${escapeHistoryHtml(formatHistoryAxisValue(tick))}</text>
              `;
            })
            .join("")}
          <line x1="${padding.left}" y1="${zeroY.toFixed(1)}" x2="${chartWidth - padding.right}" y2="${zeroY.toFixed(1)}" stroke="rgba(245,250,252,.32)" stroke-width="1"></line>
          ${chartPoints
            .map((point, index) => {
              const x = xForIndex(index) - barWidth / 2;
              const y = Math.min(zeroY, yForValue(point.netBigBlinds));
              const height = Math.max(1, Math.abs(zeroY - yForValue(point.netBigBlinds)));
              const color = point.netBigBlinds >= 0 ? "#6EA8FE" : "#FF8D7A";
              return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="2" fill="${color}" opacity=".78"><title>${escapeHistoryHtml(point.label)}: ${formatHistorySigned(point.netBigBlinds)} BB</title></rect>`;
            })
            .join("")}
          <polyline points="${linePoints}" fill="none" stroke="#F6C85F" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
          ${chartPoints
            .map((point, index) => {
              const x = xForIndex(index);
              const y = yForValue(point.cumulativeBigBlinds);
              return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.8" fill="#F6C85F"><title>${escapeHistoryHtml(point.label)} cumulative: ${formatHistorySigned(point.cumulativeBigBlinds)} BB</title></circle>`;
            })
            .join("")}
          ${chartPoints
            .map((point, index) => {
              if (index % labelStep !== 0 && index !== chartPoints.length - 1) {
                return "";
              }

              return `<text x="${xForIndex(index).toFixed(1)}" y="${chartHeight - 10}" text-anchor="middle" fill="#8FB8C4" font-size="9">${escapeHistoryHtml(formatHistoryGraphLabel(point.label))}</text>`;
            })
            .join("")}
        </svg>
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
      <div style="display:grid;grid-template-columns:minmax(110px,1fr) repeat(3,minmax(56px,auto));gap:8px;align-items:center;">
        <span>${escapeHistoryHtml(period.periodLabel)}</span>
        <span style="color:#8FB8C4;">${period.sessions} ses</span>
        <strong style="color:${getHistoryStatColor(period.bigBlindDelta)};">${formatHistorySigned(period.bigBlindDelta)} BB</strong>
        <span style="color:${getHistoryStatColor(period.bigBlindDelta)};">${formatHistorySigned(period.bigBlindsPerHour)}/h</span>
      </div>
    `;
  }

  function renderHistoryRoomRow(roomStats) {
    return `
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(48px,auto) minmax(62px,auto);gap:8px;align-items:center;">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHistoryAttribute(roomStats.roomType)}">${escapeHistoryHtml(roomStats.roomType)}</span>
        <span style="color:#8FB8C4;">${roomStats.sessions} ses</span>
        <strong style="color:${getHistoryStatColor(roomStats.bigBlindDelta)};">${formatHistorySigned(roomStats.bigBlindsPerHour)}/h</strong>
      </div>
    `;
  }

  function renderHistorySessionRow(session) {
    return `
      <div style="display:grid;grid-template-columns:minmax(88px,1fr) repeat(3,minmax(58px,auto));gap:8px;border-top:1px solid rgba(191,231,241,.1);padding-top:4px;align-items:center;">
        <span style="color:#8FB8C4;">${escapeHistoryHtml(formatHistoryDateTime(session.endedAt))}</span>
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

  function getHistoryLegendSwatchStyle(color) {
    return `display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};margin-right:4px;vertical-align:-1px;`;
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

  function formatHistoryAxisValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "0";
    }

    if (Math.abs(number) >= 100) {
      return String(Math.round(number));
    }

    return number.toFixed(1);
  }

  function formatHistoryGraphLabel(label) {
    const text = String(label || "");
    return text.length > 12 ? `${text.slice(0, 11)}...` : text;
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
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) {
      return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
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
