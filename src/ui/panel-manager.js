  const SETTINGS_PANEL_ID = "settings";
  const SESSION_HISTORY_PANEL_ID = "session-history";

  function isHelperPanelActive(panelId) {
    return state.activePanelId === panelId;
  }

  function toggleHelperPanel(panelId) {
    state.activePanelId = state.activePanelId === panelId ? "" : panelId;
    renderHelperPanels();
  }

  function openHelperPanel(panelId) {
    state.activePanelId = panelId;
    renderHelperPanels();
  }

  function closeHelperPanels() {
    state.activePanelId = "";
    renderHelperPanels();
  }

  function renderHelperPanels() {
    renderStatusPanel();
    renderSessionHistoryPanel();
    renderToolbarButtons();
  }

  function getActiveHelperPanelElement() {
    if (state.activePanelId === SETTINGS_PANEL_ID) {
      return statusPanel;
    }

    if (state.activePanelId === SESSION_HISTORY_PANEL_ID) {
      return sessionHistoryPanel;
    }

    return null;
  }
