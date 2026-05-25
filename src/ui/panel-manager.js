  const SETTINGS_PANEL_ID = "settings";
  const SESSION_HISTORY_PANEL_ID = "session-history";
  const NATIVE_PANEL_CLOSE_WAIT_MS = 1000;
  let isClosingNativePanelForHelper = false;

  function isHelperPanelActive(panelId) {
    return state.activePanelId === panelId;
  }

  function toggleHelperPanel(panelId) {
    const nextPanelId = state.activePanelId === panelId ? "" : panelId;
    logPanelDebug("toggle-helper-panel", {
      panelId,
      activePanelId: state.activePanelId,
      nextPanelId,
    });
    setActiveHelperPanel(nextPanelId);
  }

  function openHelperPanel(panelId) {
    setActiveHelperPanel(panelId);
  }

  function closeHelperPanels() {
    setActiveHelperPanel("");
  }

  function setActiveHelperPanel(panelId) {
    logPanelDebug("set-active-helper-panel", {
      panelId,
      previousPanelId: state.activePanelId,
    });
    state.activePanelId = panelId;
    const closingNativeButton = panelId ? closeActiveNativePanel() : null;
    if (closingNativeButton) {
      renderHelperPanelsAfterNativeClose(closingNativeButton);
      return;
    }

    renderHelperPanels();
  }

  function renderHelperPanels() {
    logPanelDebug("render-helper-panels", {
      activePanelId: state.activePanelId,
      hasHelperPanelHost: Boolean(helperPanelHost?.isConnected),
    });

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
      logPanelDebug("helper-panel-mount-skipped", {
        activePanelId: state.activePanelId,
        hasDocumentElement: Boolean(document.documentElement),
      });
      return null;
    }

    const panelContainer = getNativePanelContainer();
    if (!panelContainer) {
      logPanelDebug("helper-panel-mount-missing-container", {
        activePanelId: state.activePanelId,
      });
      return null;
    }

    if (helperPanelHost && panelContainer.contains(helperPanelHost)) {
      logPanelDebug("helper-panel-mount-reusing-host", {
        activePanelId: state.activePanelId,
      });
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
    logPanelDebug("helper-panel-mount-created", {
      activePanelId: state.activePanelId,
      usedNativeWrapperClass: Boolean(nativeWrapper?.className),
      usedNativeAsideClass: Boolean(nativeAside?.className),
    });
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
      logPanelDebug("close-active-native-panel-none", {
        activePanelId: state.activePanelId,
      });
      return null;
    }

    logPanelDebug("close-active-native-panel-click", {
      activePanelId: state.activePanelId,
      title: activeNativeButton.title || "",
      ariaLabel: activeNativeButton.getAttribute("aria-label") || "",
    });
    isClosingNativePanelForHelper = true;
    try {
      activeNativeButton.click();
    } finally {
      isClosingNativePanelForHelper = false;
    }
    return activeNativeButton;
  }

  function renderHelperPanelsAfterNativeClose(nativeButton) {
    const startedAt = Date.now();
    let loggedWaiting = false;

    const renderWhenReady = () => {
      if (state.activePanelId && nativeButton.isConnected && nativeButton.dataset.isActive === "true") {
        if (Date.now() - startedAt < NATIVE_PANEL_CLOSE_WAIT_MS) {
          if (!loggedWaiting) {
            loggedWaiting = true;
            logPanelDebug("waiting-for-native-panel-close", {
              activePanelId: state.activePanelId,
              title: nativeButton.title || "",
              ariaLabel: nativeButton.getAttribute("aria-label") || "",
            });
          }
          window.requestAnimationFrame(renderWhenReady);
          return;
        }
      }

      logPanelDebug("native-panel-close-wait-complete", {
        activePanelId: state.activePanelId,
        nativeButtonStillActive: nativeButton.dataset.isActive === "true",
        elapsedMs: Date.now() - startedAt,
      });
      renderHelperPanels();
    };

    window.requestAnimationFrame(renderWhenReady);
  }

  function handleNativePanelButtonClick(event) {
    if (isClosingNativePanelForHelper) {
      logPanelDebug("native-panel-click-ignored-during-helper-close", {});
      return;
    }

    const nativePanelButton = event.target?.closest?.('button[data-testid="panel button"]');
    if (!nativePanelButton || nativePanelButton.dataset.tjHelperToolbarButton) {
      return;
    }

    if (!state.activePanelId) {
      return;
    }

    logPanelDebug("native-panel-click-clears-helper-panel", {
      activePanelId: state.activePanelId,
      title: nativePanelButton.title || "",
      ariaLabel: nativePanelButton.getAttribute("aria-label") || "",
    });
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
