  function renderStatusPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!isHelperPanelActive(SETTINGS_PANEL_ID)) {
      statusPanel?.remove();
      statusPanel = null;
      return;
    }

    const panelMount = getHelperPanelMount();
    if (!panelMount) {
      return;
    }

    if (!statusPanel) {
      statusPanel = document.createElement("div");
      statusPanel.style.cssText = [
        "width:100%",
        "height:100%",
        "box-sizing:border-box",
        "overflow:auto",
        "padding:12px",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
      ].join(";");
      statusPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <strong style="font-size:13px;">Triplejack Helper</strong>
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
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Panel</div>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Use custom panel width</span>
              <input data-tj-helper-panel-width-enabled type="checkbox" style="margin:0;" />
            </label>
            <input
              data-tj-helper-panel-width
              type="range"
              min="${HELPER_PANEL_MIN_WIDTH}"
              max="${HELPER_PANEL_MAX_WIDTH}"
              step="1"
              style="width:100%;margin:9px 0 0;accent-color:#7ED6C4;"
            />
            <div data-tj-helper-panel-width-value style="margin-top:6px;color:#8FB8C4;font-size:11px;"></div>
          </section>
          <div style="border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
            <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Status</div>
            <div data-tj-helper-stats style="color:#D6EEF5;"></div>
            <div data-tj-helper-status style="margin-top:6px;color:#A7D8AD;"></div>
          </div>
        </div>
      `;

      const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
      const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
      const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
      const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
      const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
      const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");
      const sessionSummaryInput = statusPanel.querySelector("[data-tj-helper-session-summary-enabled]");
      const panelWidthEnabledInput = statusPanel.querySelector("[data-tj-helper-panel-width-enabled]");
      const panelWidthInput = statusPanel.querySelector("[data-tj-helper-panel-width]");
      const panelWidthValueElement = statusPanel.querySelector("[data-tj-helper-panel-width-value]");

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

      panelWidthEnabledInput.addEventListener("change", () => {
        setHelperPanelWidthEnabled(panelWidthEnabledInput.checked);
      });

      panelWidthInput.addEventListener("input", () => {
        setHelperPanelWidth(panelWidthInput.value, { silent: true });
        refreshNativeLayoutAfterPanelWidthChange();
        panelWidthEnabledInput.checked = getHelperPanelWidthEnabled();
        panelWidthValueElement.textContent = `Current custom width: ${getHelperPanelWidth()}px`;
      });

      panelWidthInput.addEventListener("change", () => {
        setHelperPanelWidth(panelWidthInput.value);
        refreshNativeLayoutAfterPanelWidthChange();
      });
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
    const panelWidthEnabledInput = statusPanel.querySelector("[data-tj-helper-panel-width-enabled]");
    const panelWidthInput = statusPanel.querySelector("[data-tj-helper-panel-width]");
    const panelWidthValueElement = statusPanel.querySelector("[data-tj-helper-panel-width-value]");
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
    panelWidthEnabledInput.checked = getHelperPanelWidthEnabled();
    panelWidthInput.value = String(getHelperPanelWidth());
    panelWidthInput.disabled = !getHelperPanelWidthEnabled();
    panelWidthInput.style.opacity = getHelperPanelWidthEnabled() ? "1" : ".48";
    panelWidthValueElement.textContent = `Current custom width: ${getHelperPanelWidth()}px`;
    statsElement.textContent = `${state.hooked ? "hooked" : "not hooked"} | sockets ${state.sockets}, messages ${state.chatsSeen}, translations ${state.translationsShown}`;
    statusElement.textContent = state.lastStatus;

    if (statusPanel.parentNode !== panelMount) {
      panelMount.replaceChildren(statusPanel);
    }

  }
