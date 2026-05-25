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
    if (!state.activePanelId) {
      removeHelperPanelHost();
    } else {
      getHelperPanelMount();
    }

    renderStatusPanel();
    renderSessionHistoryPanel();
    renderToolbarButtons();
  }

  function getHelperPanelMount() {
    if (!state.activePanelId || !document.documentElement) {
      return null;
    }

    const panelContainer = getNativePanelContainer();
    if (!panelContainer) {
      return null;
    }

    if (helperPanelHost && panelContainer.contains(helperPanelHost)) {
      return helperPanelHost;
    }

    removeHelperPanelHost();

    const nativeWrapper = panelContainer.querySelector(":scope > div:not([data-tj-helper-panel-wrapper])");
    const nativeAside = panelContainer.querySelector("aside.scaling-panel-container");
    const wrapper = document.createElement("div");
    wrapper.dataset.tjHelperPanelWrapper = "1";
    if (nativeWrapper?.className) {
      wrapper.className = nativeWrapper.className;
    }
    wrapper.style.cssText = [
      "height:100%",
      "min-width:0",
      "display:flex",
      "align-items:stretch",
    ].join(";");

    const aside = document.createElement("aside");
    aside.className = nativeAside?.className || "scaling-panel-container";
    aside.dataset.tjHelperPanelHost = "1";
    aside.setAttribute("aria-label", "Triplejack Helper panel");
    aside.style.cssText = [
      `width:${HELPER_PANEL_WIDTH}px`,
      `max-width:min(${HELPER_PANEL_WIDTH}px,calc(100vw - 64px))`,
      "height:100%",
      "min-width:0",
      "box-sizing:border-box",
      "overflow:hidden",
      "display:flex",
      "flex-direction:column",
      "background:rgba(18,31,39,.96)",
      "color:#F5FAFC",
      "border-left:1px solid rgba(137,198,215,.55)",
    ].join(";");

    wrapper.appendChild(aside);
    panelContainer.appendChild(wrapper);
    helperPanelHost = aside;
    return helperPanelHost;
  }

  function removeHelperPanelHost() {
    const hostRoot = helperPanelHost?.closest?.("[data-tj-helper-panel-wrapper]") || helperPanelHost;
    hostRoot?.remove();
    helperPanelHost = null;
  }

  function getNativePanelContainer() {
    const existingPanelContainer = document.querySelector('[data-testid="panel-container"]');
    if (existingPanelContainer) {
      return existingPanelContainer;
    }

    const stageContainer = document.querySelector('[data-testid="poker-stage-container"]');
    const sceneRow = stageContainer?.parentElement;
    if (!sceneRow) {
      return null;
    }

    const panelRegion = document.createElement("div");
    panelRegion.dataset.tjHelperPanelRegion = "1";
    panelRegion.style.cssText = [
      "height:100%",
      "min-width:0",
      "display:flex",
      "align-items:stretch",
      "flex:0 0 auto",
    ].join(";");

    const panelContainer = document.createElement("div");
    panelContainer.setAttribute("data-testid", "panel-container");
    panelContainer.dataset.tjHelperPanelContainer = "1";
    panelContainer.style.cssText = [
      "height:100%",
      "min-width:0",
      "display:flex",
      "align-items:stretch",
    ].join(";");

    panelRegion.appendChild(panelContainer);
    sceneRow.appendChild(panelRegion);
    return panelContainer;
  }

  function getActiveHelperPanelElement() {
    if (state.activePanelId === SETTINGS_PANEL_ID) {
      return statusPanel || helperPanelHost;
    }

    if (state.activePanelId === SESSION_HISTORY_PANEL_ID) {
      return sessionHistoryPanel || helperPanelHost;
    }

    return null;
  }
