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
        "width:260px",
        "padding:10px",
        "border:1px solid #2D6F89",
        "border-radius:6px",
        "background:rgba(18,31,39,.96)",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
        "box-shadow:0 4px 16px rgba(0,0,0,.32)",
      ].join(";");
      statusPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <strong style="font-size:13px;">Triplejack Helper</strong>
          <button type="button" data-tj-helper-close style="border:0;background:#294655;color:#fff;border-radius:4px;padding:2px 7px;cursor:pointer;">x</button>
        </div>
        <div style="margin-bottom:10px;border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
          <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Translation</div>
          <label style="display:block;margin-bottom:4px;color:#BFE7F1;">Incoming language</label>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <select data-tj-helper-language style="flex:1;min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
            <input data-tj-helper-custom-language style="width:62px;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
          </div>
          <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#BFE7F1;">
            <input data-tj-helper-outgoing-enabled type="checkbox" style="margin:0;" />
            Translate sent messages
          </label>
          <label style="display:block;margin-bottom:4px;color:#BFE7F1;">Outgoing language</label>
          <div style="display:flex;gap:6px;">
            <select data-tj-helper-outgoing-language style="flex:1;min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
            <input data-tj-helper-custom-outgoing-language style="width:62px;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
          </div>
        </div>
        <div style="margin-bottom:10px;border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
          <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Messages</div>
          <label style="display:flex;align-items:center;gap:6px;color:#BFE7F1;">
            <input data-tj-helper-message-timestamps-enabled type="checkbox" style="margin:0;" />
            Show timestamps
          </label>
        </div>
        <div style="border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
          <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Status</div>
          <div data-tj-helper-stats style="color:#D6EEF5;"></div>
          <div data-tj-helper-status style="margin-top:6px;color:#A7D8AD;"></div>
        </div>
      `;

      const closeButton = statusPanel.querySelector("[data-tj-helper-close]");
      const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
      const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
      const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
      const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
      const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
      const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");

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
    }

    const targetLanguage = getTargetLanguage();
    const outgoingTargetLanguage = getOutgoingTargetLanguage();
    const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
    const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
    const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
    const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
    const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
    const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");
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
    statsElement.textContent = `${state.hooked ? "hooked" : "not hooked"} | sockets ${state.sockets}, messages ${state.chatsSeen}, translations ${state.translationsShown}`;
    statusElement.textContent = state.lastStatus;

    const parent = document.body || document.documentElement;
    if (statusPanel.parentNode !== parent) {
      parent.appendChild(statusPanel);
    }

    renderToolbarButtons();
  }
