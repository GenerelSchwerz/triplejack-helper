  function getTargetLanguage() {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_TARGET_LANGUAGE;
  }

  function getOutgoingTargetLanguage() {
    return localStorage.getItem(OUTGOING_LANGUAGE_STORAGE_KEY) || getTargetLanguage();
  }

  function getOutgoingTranslationEnabled() {
    return localStorage.getItem(OUTGOING_ENABLED_STORAGE_KEY) === "1";
  }

  function getMessageTimestampsEnabled() {
    return localStorage.getItem(MESSAGE_TIMESTAMPS_STORAGE_KEY) === "1";
  }

  function getSessionSummaryEnabled() {
    return localStorage.getItem(SESSION_SUMMARY_STORAGE_KEY) !== "0";
  }

  function getQuickBombEnabled() {
    return localStorage.getItem(QUICK_BOMB_ENABLED_STORAGE_KEY) !== "0";
  }

  function getQuickBombRate() {
    return normalizePositiveInteger(
      localStorage.getItem(QUICK_BOMB_RATE_STORAGE_KEY) || QUICK_BOMB_DEFAULT_RATE,
      QUICK_BOMB_DEFAULT_RATE,
    );
  }

  function getQuickBombRunMode() {
    const mode = localStorage.getItem(QUICK_BOMB_RUN_MODE_STORAGE_KEY);
    return ["one-off", "timed", "instant"].includes(mode) ? mode : "one-off";
  }

  function getQuickBombMode() {
    const mode = localStorage.getItem(QUICK_BOMB_MODE_STORAGE_KEY);
    return mode === "ammo" ? "ammo" : "duration";
  }

  function getQuickBombDuration() {
    return normalizePositiveInteger(
      localStorage.getItem(QUICK_BOMB_DURATION_STORAGE_KEY) || QUICK_BOMB_DEFAULT_DURATION_SECONDS,
      QUICK_BOMB_DEFAULT_DURATION_SECONDS,
    );
  }

  function getQuickBombAmmo() {
    return normalizePositiveInteger(
      localStorage.getItem(QUICK_BOMB_AMMO_STORAGE_KEY) || QUICK_BOMB_DEFAULT_AMMO,
      QUICK_BOMB_DEFAULT_AMMO,
    );
  }

  function getQuickBombItemSort() {
    const sort = localStorage.getItem(QUICK_BOMB_ITEM_SORT_STORAGE_KEY);
    return ["cost-asc", "cost-desc", "name"].includes(sort) ? sort : "cost-asc";
  }

  function getHelperPanelWidth() {
    return clampHelperPanelWidth(localStorage.getItem(HELPER_PANEL_WIDTH_STORAGE_KEY) || HELPER_PANEL_WIDTH);
  }

  function getHelperPanelWidthEnabled() {
    const storedValue = localStorage.getItem(HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY);
    if (storedValue !== null) {
      return storedValue === "1";
    }

    return localStorage.getItem(HELPER_PANEL_WIDTH_STORAGE_KEY) !== null;
  }

  function setTargetLanguage(language) {
    const normalizedLanguage = normalizeLanguageCode(language);
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(normalizedLanguage)) {
      alert("Use a language code like en, es, fr, de, ja, ko, zh-CN, or pt.");
      return;
    }

    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
    setStatus(`target language set to ${normalizedLanguage}`);
    renderStatusPanel();
  }

  function setOutgoingTargetLanguage(language) {
    const normalizedLanguage = normalizeLanguageCode(language);
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(normalizedLanguage)) {
      alert("Use a language code like en, es, fr, de, ja, ko, zh-CN, or pt.");
      return;
    }

    localStorage.setItem(OUTGOING_LANGUAGE_STORAGE_KEY, normalizedLanguage);
    setStatus(`outgoing language set to ${normalizedLanguage}`);
    renderStatusPanel();
  }

  function setOutgoingTranslationEnabled(enabled) {
    localStorage.setItem(OUTGOING_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`outgoing translation ${enabled ? "enabled" : "disabled"}`);
    renderStatusPanel();
  }

  function setMessageTimestampsEnabled(enabled) {
    localStorage.setItem(MESSAGE_TIMESTAMPS_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`message timestamps ${enabled ? "enabled" : "disabled"}`);
    renderMessageTimestamps();
    renderStatusPanel();
  }

  function setSessionSummaryEnabled(enabled) {
    localStorage.setItem(SESSION_SUMMARY_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`session summary ${enabled ? "enabled" : "disabled"}`);
    renderStatusPanel();
  }

  function setQuickBombEnabled(enabled) {
    localStorage.setItem(QUICK_BOMB_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`quick bomb ${enabled ? "enabled" : "disabled"}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombRate(rate) {
    const value = normalizePositiveInteger(rate, QUICK_BOMB_DEFAULT_RATE);
    localStorage.setItem(QUICK_BOMB_RATE_STORAGE_KEY, String(value));
    setStatus(`quick bomb rate set to ${value}/s`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombRunMode(mode) {
    const value = ["one-off", "timed", "instant"].includes(mode) ? mode : "one-off";
    localStorage.setItem(QUICK_BOMB_RUN_MODE_STORAGE_KEY, value);
    setStatus(`quick bomb mode set to ${value}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombMode(mode) {
    const value = mode === "ammo" ? "ammo" : "duration";
    localStorage.setItem(QUICK_BOMB_MODE_STORAGE_KEY, value);
    setStatus(`quick bomb mode set to ${value}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombDuration(durationSeconds) {
    const value = normalizePositiveInteger(durationSeconds, QUICK_BOMB_DEFAULT_DURATION_SECONDS);
    localStorage.setItem(QUICK_BOMB_DURATION_STORAGE_KEY, String(value));
    setStatus(`quick bomb duration set to ${value}s`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombAmmo(ammo) {
    const value = normalizePositiveInteger(ammo, QUICK_BOMB_DEFAULT_AMMO);
    localStorage.setItem(QUICK_BOMB_AMMO_STORAGE_KEY, String(value));
    setStatus(`quick bomb ammo set to ${value}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombItemSort(sort) {
    const value = ["cost-asc", "cost-desc", "name"].includes(sort) ? sort : "cost-asc";
    localStorage.setItem(QUICK_BOMB_ITEM_SORT_STORAGE_KEY, value);
    setStatus(`quick bomb item sort set to ${value}`);
    renderQuickBombPanel();
  }

  function sendQuickBombControl(action, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(QUICK_BOMB_CONTROL_EVENT, {
        detail: { ...detail, action },
      }),
    );
  }

  function setHelperPanelWidth(width, options = {}) {
    const panelWidth = clampHelperPanelWidth(width);
    localStorage.setItem(HELPER_PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
    if (options.enable !== false) {
      localStorage.setItem(HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY, "1");
    }
    applyHelperPanelWidth();
    if (options.silent) {
      return;
    }

    setStatus(`panel width set to ${panelWidth}px`);
    renderStatusPanel();
  }

  function setHelperPanelWidthEnabled(enabled) {
    localStorage.setItem(HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
    refreshNativeLayoutAfterPanelWidthChange();
    setStatus(`custom panel width ${enabled ? "enabled" : "disabled"}`);
    renderStatusPanel();
  }

  function clampHelperPanelWidth(width) {
    return clampNumber(width, HELPER_PANEL_MIN_WIDTH, HELPER_PANEL_MAX_WIDTH, HELPER_PANEL_WIDTH);
  }

  function clampNumber(value, min, max, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(numericValue)));
  }

  function normalizePositiveInteger(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return fallback;
    }

    return Math.round(numericValue);
  }

  function normalizeLanguageCode(language) {
    const trimmedLanguage = language.trim();
    const languageAlias = trimmedLanguage.toLowerCase();
    if (languageAlias === "tagalog" || languageAlias === "filipino") {
      return "tl";
    }

    const [baseLanguage, region] = trimmedLanguage.split("-");
    if (!region) {
      return baseLanguage.toLowerCase();
    }

    return `${baseLanguage.toLowerCase()}-${region.toUpperCase()}`;
  }

  function promptForTargetLanguage() {
    const language = prompt("Target language code:", getTargetLanguage());
    if (language === null) {
      return;
    }

    setTargetLanguage(language);
  }

  function toggleStatusPanel() {
    toggleHelperPanel(SETTINGS_PANEL_ID);
  }

  function installKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) {
        return;
      }

      const key = event.key.toUpperCase();
      if (key === PANEL_TOGGLE_KEY) {
        event.preventDefault();
        toggleStatusPanel();
      }

      if (key === LANGUAGE_PROMPT_KEY) {
        event.preventDefault();
        promptForTargetLanguage();
      }
    });
  }
