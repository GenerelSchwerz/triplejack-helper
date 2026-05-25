  const SETTINGS_PANEL_ID = "settings";
  const SESSION_HISTORY_PANEL_ID = "session-history";
  let isClosingNativePanelForHelper = false;

  function isHelperPanelActive(panelId) {
    return state.activePanelId === panelId;
  }

  function toggleHelperPanel(panelId) {
    const nextPanelId = state.activePanelId === panelId ? "" : panelId;
    setActiveHelperPanel(nextPanelId);
  }

  function openHelperPanel(panelId) {
    setActiveHelperPanel(panelId);
  }

  function closeHelperPanels() {
    setActiveHelperPanel("");
  }

  function setActiveHelperPanel(panelId) {
    state.activePanelId = panelId;
    if (panelId && closeActiveNativePanel()) {
      window.setTimeout(renderHelperPanels, 0);
      return;
    }

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

  function closeActiveNativePanel() {
    const activeNativeButton = document.querySelector(
      'button[data-testid="panel button"][data-is-active="true"]:not([data-tj-helper-toolbar-button])',
    );
    if (!activeNativeButton) {
      return false;
    }

    isClosingNativePanelForHelper = true;
    try {
      activeNativeButton.click();
    } finally {
      isClosingNativePanelForHelper = false;
    }
    return true;
  }

  function handleNativePanelButtonClick(event) {
    if (isClosingNativePanelForHelper) {
      return;
    }

    const nativePanelButton = event.target?.closest?.('button[data-testid="panel button"]');
    if (!nativePanelButton || nativePanelButton.dataset.tjHelperToolbarButton) {
      return;
    }

    if (!state.activePanelId) {
      return;
    }

    state.activePanelId = "";
    removeHelperPanelHost();
    renderToolbarButtons();
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
