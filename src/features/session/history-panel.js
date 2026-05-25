  let sessionHistoryChart = null;
  let sessionHistoryChartMode = "bbPerHour";

  function renderSessionHistoryPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!isHelperPanelActive(SESSION_HISTORY_PANEL_ID)) {
      destroySessionHistoryChart();
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
      destroySessionHistoryChart();
      body.innerHTML = `<div style="color:#8FB8C4;">No tracked sessions match this date range.</div>`;
      return;
    }

    destroySessionHistoryChart();
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
    installSessionHistoryGraphControls();
    renderHistoryTrendChart(report);
  }

  function renderHistoryTrendGraph(report) {
    const sessions = report.sessions || [];
    if (!sessions.length) {
      return "";
    }

    return `
      <section style="${getHistorySectionStyle()}margin-bottom:12px;">
        <div style="display:grid;gap:8px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div data-tj-session-history-chart-title style="${getHistoryHeadingStyle()}margin-bottom:0;">Results (big blinds per hour)</div>
            <div style="display:flex;gap:5px;align-items:center;">
              <button type="button" data-tj-session-history-zoom="in" title="Zoom in" style="${getHistoryButtonStyle()}">+</button>
              <button type="button" data-tj-session-history-zoom="out" title="Zoom out" style="${getHistoryButtonStyle()}">-</button>
              <button type="button" data-tj-session-history-zoom="reset" title="Reset time range" style="${getHistoryButtonStyle()}">All</button>
            </div>
          </div>
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            ${renderHistoryChartModeButton("bbPerHour", "BB/hour")}
            ${renderHistoryChartModeButton("netBigBlinds", "Net BB")}
            ${renderHistoryChartModeButton("cumulativeBigBlinds", "Cumulative BB")}
          </div>
        </div>
        <div style="position:relative;height:250px;width:100%;min-width:0;overflow:hidden;">
          <canvas data-tj-session-history-chart aria-label="Session history graph for selected range" role="img" style="display:block;width:100%;height:100%;box-sizing:border-box;"></canvas>
          <div data-tj-session-history-chart-fallback style="display:none;color:#8FB8C4;padding:10px;border:1px solid rgba(191,231,241,.16);border-radius:6px;background:rgba(8,17,23,.25);">
            Chart.js did not load, so the history graph cannot be rendered.
          </div>
        </div>
      </section>
    `;
  }

  function renderHistoryTrendChart(report) {
    const chartElement = sessionHistoryPanel?.querySelector("[data-tj-session-history-chart]");
    if (!chartElement) {
      return;
    }

    const ChartConstructor = getChartConstructor();
    if (!ChartConstructor) {
      chartElement.style.display = "none";
      const fallback = sessionHistoryPanel.querySelector("[data-tj-session-history-chart-fallback]");
      if (fallback) {
        fallback.style.display = "block";
      }
      return;
    }
    chartElement.style.display = "block";
    chartElement.style.width = "100%";
    chartElement.style.height = "100%";

    let cumulativeBigBlinds = 0;
    const chronologicalSessions = (report.sessions || []).slice().sort((a, b) => a.endedAt - b.endedAt);
    const chartPoints = chronologicalSessions.map((session, index) => {
      cumulativeBigBlinds += Number(session.bigBlindDelta) || 0;
      return {
        label: formatHistoryChartPointLabel(session, chronologicalSessions[index - 1]),
        tooltipLabel: formatHistoryDateTime(session.endedAt),
        endedAt: session.endedAt,
        netBigBlinds: Number(session.bigBlindDelta) || 0,
        bbPerHour: getSessionBigBlindsPerHour(session),
        cumulativeBigBlinds,
      };
    });
    const chartMode = getSessionHistoryChartModeConfig();
    const chartValues = chartPoints
      .map((point) => point[chartMode.valueKey])
      .filter((value) => Number.isFinite(Number(value)))
      .map(Number);
    const yLimit = getHistoryChartYAxisLimit(chartValues);
    const chartTitle = sessionHistoryPanel.querySelector("[data-tj-session-history-chart-title]");
    if (chartTitle) {
      chartTitle.textContent = chartMode.title;
    }

    sessionHistoryChart = new ChartConstructor(chartElement, {
      type: "line",
      data: {
        labels: chartPoints.map((point) => point.label),
        datasets: [
          {
            label: "Zero",
            data: chartPoints.map(() => 0),
            borderColor: "rgba(245,250,252,.46)",
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 0,
            tension: 0,
            fill: false,
            yAxisID: "results",
            order: 2,
          },
          {
            label: chartMode.label,
            data: chartPoints.map((point) => getFiniteHistoryChartValue(point[chartMode.valueKey])),
            borderColor: chartMode.color,
            backgroundColor: chartMode.color,
            borderWidth: 3,
            clip: false,
            pointBackgroundColor(context) {
              const value = Number(context.raw);
              if (!Number.isFinite(value)) {
                return "#8FB8C4";
              }

              return value >= 0 ? chartMode.positiveColor : chartMode.negativeColor;
            },
            pointBorderColor: "#111820",
            pointBorderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointHitRadius: 10,
            spanGaps: true,
            tension: 0.2,
            fill: false,
            yAxisID: "results",
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: {
          padding: {
            top: 18,
            right: 12,
            bottom: 6,
            left: 4,
          },
        },
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
            labels: {
              color: "#BFE7F1",
              boxWidth: 10,
              boxHeight: 10,
              font: {
                size: 11,
              },
            },
          },
          tooltip: {
            filter(context) {
              return context.dataset.label !== "Zero";
            },
            callbacks: {
              title(context) {
                return chartPoints[context[0]?.dataIndex]?.tooltipLabel || "";
              },
              label(context) {
                return `${context.dataset.label}: ${formatHistoryChartValue(context.parsed.y, chartMode)}`;
              },
            },
          },
        },
        scales: {
          x: {
            offset: chartPoints.length === 1,
            ticks: {
              color: "#8FB8C4",
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: Math.min(6, Math.max(chartPoints.length, 2)),
              padding: 6,
            },
            grid: {
              color: "rgba(191,231,241,.08)",
            },
          },
          results: {
            beginAtZero: true,
            min: -yLimit,
            max: yLimit,
            afterFit(scale) {
              scale.width = Math.max(scale.width, 46);
            },
            ticks: {
              color: "#8FB8C4",
              maxTicksLimit: 5,
              padding: 6,
              callback(value) {
                return formatHistoryChartAxisValue(value);
              },
            },
            grid: {
              color(context) {
                return Number(context.tick.value) === 0 ? "rgba(245,250,252,.52)" : "rgba(191,231,241,.12)";
              },
              lineWidth(context) {
                return Number(context.tick.value) === 0 ? 2 : 1;
              },
            },
          },
        },
      },
    });
    scheduleSessionHistoryChartResize();
  }

  function scheduleSessionHistoryChartResize() {
    const refresh = () => {
      sessionHistoryChart?.resize?.();
      sessionHistoryChart?.update?.("none");
    };

    window.requestAnimationFrame(refresh);
    window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
    window.setTimeout(refresh, 120);
  }

  function installSessionHistoryGraphControls() {
    for (const button of sessionHistoryPanel.querySelectorAll("[data-tj-session-history-chart-mode]")) {
      button.addEventListener("click", () => {
        sessionHistoryChartMode = button.dataset.tjSessionHistoryChartMode || "bbPerHour";
        renderSessionHistoryPanelBody();
      });
    }

    for (const button of sessionHistoryPanel.querySelectorAll("[data-tj-session-history-zoom]")) {
      button.addEventListener("click", () => {
        zoomSessionHistoryDateRange(button.dataset.tjSessionHistoryZoom);
      });
    }
  }

  function renderHistoryChartModeButton(mode, label) {
    const active = mode === sessionHistoryChartMode;
    return `
      <button type="button" data-tj-session-history-chart-mode="${escapeHistoryAttribute(mode)}" style="${getHistoryButtonStyle(active)}">${escapeHistoryHtml(label)}</button>
    `;
  }

  function getSessionHistoryChartModeConfig() {
    if (sessionHistoryChartMode === "netBigBlinds") {
      return {
        valueKey: "netBigBlinds",
        title: "Results (net big blinds)",
        label: "Net BB",
        suffix: " BB",
        color: "#6EA8FE",
        fillColor: "rgba(110,168,254,.16)",
        positiveColor: "#6EA8FE",
        negativeColor: "#FF8D7A",
      };
    }

    if (sessionHistoryChartMode === "cumulativeBigBlinds") {
      return {
        valueKey: "cumulativeBigBlinds",
        title: "Results (cumulative big blinds)",
        label: "Cumulative BB",
        suffix: " BB",
        color: "#F6C85F",
        fillColor: "rgba(246,200,95,.16)",
        positiveColor: "#F6C85F",
        negativeColor: "#FF8D7A",
      };
    }

    return {
      valueKey: "bbPerHour",
      title: "Results (big blinds per hour)",
      label: "BB/hour",
      suffix: " BB/h",
      color: "#7ED6C4",
      fillColor: "rgba(126,214,196,.14)",
      positiveColor: "#7ED6C4",
      negativeColor: "#FF8D7A",
    };
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
      <div style="${getHistoryCompactRowStyle()}">
        <div style="${getHistoryRowPrimaryLineStyle()}">
          <span style="${getHistoryRowLabelStyle()}">${escapeHistoryHtml(period.periodLabel)}</span>
          <span style="${getHistoryRowMutedValueStyle()}">${period.sessions} ses</span>
        </div>
        <div style="${getHistoryRowMetricLineStyle()}">
          <strong style="${getHistoryRowMetricStyle(getHistoryStatColor(period.bigBlindDelta))}">${formatHistorySigned(period.bigBlindDelta)} BB</strong>
          <span style="${getHistoryRowMetricStyle(getHistoryStatColor(period.bigBlindDelta))}">${formatHistorySigned(period.bigBlindsPerHour)}/h</span>
        </div>
      </div>
    `;
  }

  function renderHistoryRoomRow(roomStats) {
    return `
      <div style="${getHistoryCompactRowStyle()}">
        <div style="${getHistoryRowPrimaryLineStyle()}">
          <span style="${getHistoryRowLabelStyle()}" title="${escapeHistoryAttribute(roomStats.roomType)}">${escapeHistoryHtml(roomStats.roomType)}</span>
          <span style="${getHistoryRowMutedValueStyle()}">${roomStats.sessions} ses</span>
        </div>
        <div style="${getHistoryRowMetricLineStyle()}">
          <strong style="${getHistoryRowMetricStyle(getHistoryStatColor(roomStats.bigBlindDelta))}">${formatHistorySigned(roomStats.bigBlindsPerHour)}/h</strong>
        </div>
      </div>
    `;
  }

  function renderHistorySessionRow(session) {
    return `
      <div style="${getHistoryCompactRowStyle()}border-top:1px solid rgba(191,231,241,.1);padding-top:4px;">
        <div style="${getHistoryRowPrimaryLineStyle()}">
          <span style="${getHistoryRowLabelStyle()}color:#8FB8C4;">${escapeHistoryHtml(formatHistoryDateTime(session.endedAt))}</span>
          <span style="${getHistoryRowMutedValueStyle()}">${formatHistoryDuration(session.durationMs)}</span>
        </div>
        <div style="${getHistoryRowMetricLineStyle()}">
          <strong style="${getHistoryRowMetricStyle(getHistoryStatColor(session.bigBlindDelta))}">${formatHistorySigned(session.bigBlindDelta)} BB</strong>
          <span style="${getHistoryRowMetricStyle(getHistoryStatColor(session.bigBlindDelta))}">${formatHistorySigned(session.bigBlindsPerHour)}/h</span>
        </div>
      </div>
    `;
  }

  function getHistoryInputStyle() {
    return "width:100%;min-width:0;box-sizing:border-box;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:5px;";
  }

  function getHistoryButtonStyle(active = false) {
    return [
      "border:1px solid rgba(191,231,241,.38)",
      `background:${active ? "rgba(126,214,196,.22)" : "rgba(8,17,23,.34)"}`,
      `color:${active ? "#F5FAFC" : "#BFE7F1"}`,
      "border-radius:4px",
      "padding:4px 7px",
      "font:11px/1.1 Arial,sans-serif",
      "cursor:pointer",
      "white-space:nowrap",
    ].join(";");
  }

  function getHistoryControlGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-bottom:12px;";
  }

  function getHistoryMetricGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;";
  }

  function getHistorySplitGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-bottom:12px;";
  }

  function getHistorySectionStyle() {
    return "border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:9px;background:rgba(255,255,255,.025);";
  }

  function getHistoryHeadingStyle() {
    return "margin-bottom:6px;color:#BFE7F1;font-weight:700;";
  }

  function getHistoryCompactRowStyle() {
    return "display:grid;gap:3px;min-width:0;";
  }

  function getHistoryRowPrimaryLineStyle() {
    return "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:baseline;min-width:0;";
  }

  function getHistoryRowMetricLineStyle() {
    return "display:flex;justify-content:flex-end;gap:14px;align-items:baseline;min-width:0;flex-wrap:wrap;text-align:right;";
  }

  function getHistoryRowLabelStyle() {
    return "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  }

  function getHistoryRowMutedValueStyle() {
    return "color:#8FB8C4;white-space:nowrap;";
  }

  function getHistoryRowMetricStyle(color) {
    return `color:${color};white-space:nowrap;`;
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

  function formatHistoryChartValue(value, chartMode) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "n/a";
    }

    return `${number >= 0 ? "+" : ""}${number.toFixed(1)}${chartMode.suffix}`;
  }

  function formatHistoryChartAxisValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "0";
    }

    if (Math.abs(number) >= 1000) {
      return `${Math.round(number / 100) / 10}k`;
    }

    if (Math.abs(number) >= 100) {
      return String(Math.round(number));
    }

    return number.toFixed(1);
  }

  function getFiniteHistoryChartValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatHistoryChartPointLabel(session, previousSession) {
    const dateLabel = new Date(session.endedAt).toLocaleDateString([], {
      month: "numeric",
      day: "numeric",
    });
    const timeLabel = new Date(session.endedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const previousDateLabel = previousSession
      ? new Date(previousSession.endedAt).toLocaleDateString([], {
          month: "numeric",
          day: "numeric",
        })
      : "";

    if (!previousSession || previousDateLabel !== dateLabel) {
      return `${dateLabel}, ${timeLabel}`;
    }

    return timeLabel;
  }

  function getSessionBigBlindsPerHour(session) {
    const savedValue = Number(session.bigBlindsPerHour);
    if (Number.isFinite(savedValue)) {
      return savedValue;
    }

    const bigBlindDelta = Number(session.bigBlindDelta);
    const durationMs = Number(session.durationMs);
    if (!Number.isFinite(bigBlindDelta) || !Number.isFinite(durationMs) || durationMs <= 0) {
      return null;
    }

    return bigBlindDelta / (durationMs / 3600000);
  }

  function getHistoryChartYAxisLimit(values) {
    const maxMagnitude = Math.max(1, ...values.map((value) => Math.abs(value)));
    return maxMagnitude * 1.18;
  }

  function getChartConstructor() {
    return globalThis.Chart || window.Chart || pageWindow.Chart || null;
  }

  function destroySessionHistoryChart() {
    if (!sessionHistoryChart) {
      return;
    }

    sessionHistoryChart.destroy();
    sessionHistoryChart = null;
  }

  function zoomSessionHistoryDateRange(action) {
    const startInput = sessionHistoryPanel?.querySelector("[data-tj-session-history-start]");
    const endInput = sessionHistoryPanel?.querySelector("[data-tj-session-history-end]");
    if (!startInput || !endInput) {
      return;
    }

    const fullRange = getSessionHistoryDateRange();
    if (action === "reset") {
      startInput.value = fullRange.startDate;
      endInput.value = fullRange.endDate;
      renderSessionHistoryPanelBody();
      return;
    }

    const startTime = parseHistoryDateInput(startInput.value || fullRange.startDate);
    const endTime = parseHistoryDateInput(endInput.value || fullRange.endDate);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return;
    }

    const fullStartTime = parseHistoryDateInput(fullRange.startDate);
    const fullEndTime = parseHistoryDateInput(fullRange.endDate);
    const dayMs = 86400000;
    const inclusiveRangeMs = Math.max(dayMs, endTime - startTime + dayMs);
    const nextRangeMs = action === "in" ? Math.max(dayMs, inclusiveRangeMs / 2) : inclusiveRangeMs * 2;
    const centerTime = startTime + inclusiveRangeMs / 2;
    let nextStartTime = centerTime - nextRangeMs / 2;
    let nextEndTime = centerTime + nextRangeMs / 2 - dayMs;

    if (Number.isFinite(fullStartTime) && Number.isFinite(fullEndTime)) {
      if (nextStartTime < fullStartTime) {
        nextEndTime += fullStartTime - nextStartTime;
        nextStartTime = fullStartTime;
      }
      if (nextEndTime > fullEndTime) {
        nextStartTime -= nextEndTime - fullEndTime;
        nextEndTime = fullEndTime;
      }
      nextStartTime = Math.max(nextStartTime, fullStartTime);
      nextEndTime = Math.min(nextEndTime, fullEndTime);
    }

    startInput.value = formatSessionDateInput(nextStartTime);
    endInput.value = formatSessionDateInput(Math.max(nextStartTime, nextEndTime));
    renderSessionHistoryPanelBody();
  }

  function parseHistoryDateInput(value) {
    return new Date(`${value}T00:00:00`).getTime();
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
