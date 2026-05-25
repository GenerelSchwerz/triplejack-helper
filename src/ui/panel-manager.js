  const SETTINGS_PANEL_ID = "settings";
  const SESSION_HISTORY_PANEL_ID = "session-history";
  let nativePanelWrapperClassName = "";
  let nativePanelAsideClassName = "";

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
    if (panelId) {
      deactivateNativePanelsForHelper();
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
      deactivateNativePanelsForHelper();
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
    if (nativeWrapper?.className || nativePanelWrapperClassName) {
      wrapper.className = nativeWrapper?.className || nativePanelWrapperClassName;
    }
    wrapper.style.cssText = [
      "width:100%",
      "height:100%",
      "min-width:0",
      "display:flex",
      "align-items:stretch",
      "flex:1 1 auto",
    ].join(";");

    const aside = document.createElement("aside");
    aside.className = nativeAside?.className || nativePanelAsideClassName || "scaling-panel-container";
    aside.dataset.tjHelperPanelHost = "1";
    aside.setAttribute("aria-label", "Triplejack Helper panel");
    aside.style.cssText = [
      "width:100%",
      "height:100%",
      "min-width:0",
      "flex:1 1 auto",
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
      usedNativeWrapperClass: Boolean(nativeWrapper?.className || nativePanelWrapperClassName),
      usedNativeAsideClass: Boolean(nativeAside?.className || nativePanelAsideClassName),
    });
    return helperPanelHost;
  }

  function removeHelperPanelHost(options = {}) {
    const hostRoot = helperPanelHost?.closest?.("[data-tj-helper-panel-wrapper]") || helperPanelHost;
    hostRoot?.remove();
    helperPanelHost = null;
    if (!options.preservePanelShell) {
      removeEmptyHelperPanelRegion();
    }
  }

  function removeEmptyHelperPanelRegion() {
    const panelContainer = document.querySelector('[data-testid="panel-container"]');
    if (!panelContainer || panelContainer.children.length) {
      return;
    }

    const panelRegion = panelContainer.parentElement;
    if (panelContainer.dataset.tjHelperPanelContainer || panelRegion?.dataset.tjHelperPanelRegion) {
      panelRegion?.remove();
      return;
    }

    panelContainer.style.display = "none";
    panelContainer.dataset.tjHelperHiddenEmpty = "1";
  }

  function showNativePanelContainer(panelContainer) {
    if (!panelContainer?.dataset.tjHelperHiddenEmpty) {
      return;
    }

    panelContainer.style.display = "";
    delete panelContainer.dataset.tjHelperHiddenEmpty;
  }

  function getNativePanelContainer() {
    const existingPanelContainer = document.querySelector('[data-testid="panel-container"]');
    if (existingPanelContainer) {
      showNativePanelContainer(existingPanelContainer);
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
      `flex:0 1 ${HELPER_PANEL_WIDTH}px`,
      `max-width:min(${HELPER_PANEL_WIDTH}px,calc(100vw - 64px))`,
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

  function deactivateNativePanelsForHelper() {
    const activeNativeButtons = document.querySelectorAll(
      'button[data-testid="panel button"][data-is-active="true"]:not([data-tj-helper-toolbar-button])',
    );

    for (const nativeButton of activeNativeButtons) {
      const toolbar = nativeButton.parentElement;
      const inactiveNativeButton = toolbar?.querySelector(
        'button[data-testid="panel button"]:not([data-is-active="true"]):not([data-tj-helper-toolbar-button])',
      );
      if (inactiveNativeButton?.className) {
        nativeButton.className = inactiveNativeButton.className;
      }

      delete nativeButton.dataset.isActive;
      if (nativeButton.title?.startsWith("Hide ")) {
        nativeButton.title = nativeButton.title.replace(/^Hide /, "Show ");
      }
    }

    const panelContainer = getNativePanelContainer();
    let removedNativePanelCount = 0;
    if (panelContainer) {
      const nativeWrapper = panelContainer.querySelector(":scope > div:not([data-tj-helper-panel-wrapper])");
      const nativeAside = panelContainer.querySelector("aside.scaling-panel-container");
      if (nativeWrapper?.className) {
        nativePanelWrapperClassName = nativeWrapper.className;
      }
      if (nativeAside?.className) {
        nativePanelAsideClassName = nativeAside.className;
      }

      for (const child of [...panelContainer.children]) {
        if (child.matches("[data-tj-helper-panel-wrapper]")) {
          continue;
        }

        child.remove();
        removedNativePanelCount += 1;
      }
    }

    if (activeNativeButtons.length || removedNativePanelCount) {
      logPanelDebug("native-panels-deactivated-for-helper", {
        activePanelId: state.activePanelId,
        deactivatedButtonCount: activeNativeButtons.length,
        removedNativePanelCount,
      });
    }
  }

  function handleNativePanelButtonClick(event) {
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
    showNativePanelContainer(document.querySelector('[data-testid="panel-container"]'));
    removeHelperPanelHost({ preservePanelShell: true });
    renderToolbarButtons();
    for (const helperButton of document.querySelectorAll("[data-tj-helper-toolbar-button]")) {
      helperButton.blur();
    }
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
