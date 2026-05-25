  function main() {
    GM_registerMenuCommand("Show Triplejack Helper status", () => {
      state.panelVisible = true;
      renderStatusPanel();
      alert(`${SCRIPT_NAME}\n${state.lastStatus}`);
    });
    GM_registerMenuCommand("Set Triplejack target language", promptForTargetLanguage);

    installKeyboardShortcuts();
    installToolbarButton();
    installMessageTimestamps();
    installTranslationBridge();
    injectWebSocketHook();
    setStatus("loaded");
    renderStatusPanel();
  }

  main();
