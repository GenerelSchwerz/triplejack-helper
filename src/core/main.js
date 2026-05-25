  function main() {
    GM_registerMenuCommand("Show Triplejack Helper status", () => {
      openHelperPanel(SETTINGS_PANEL_ID);
      alert(`${SCRIPT_NAME}\n${state.lastStatus}`);
    });
    GM_registerMenuCommand("Set Triplejack target language", promptForTargetLanguage);

    installKeyboardShortcuts();
    installToolbarButton();
    installMessageTimestamps();
    installSessionTracker();
    installTranslationFeature();
    setStatus("loaded");
    renderHelperPanels();
  }

  main();
