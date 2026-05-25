  const SETTINGS_PANEL_ID = "settings";
  const SESSION_HISTORY_PANEL_ID = "session-history";
  let nativePanelWrapperClassName = "";
  let nativePanelAsideClassName = "";
  let pendingHelperPanelOpenId = 0;
  let helperShellNativeButton = null;

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
    if (nextPanelId) {
      openHelperPanel(nextPanelId);
    } else {
      closeHelperPanels();
    }
  }

  function openHelperPanel(panelId) {
    if (state.activePanelId && helperShellNativeButton?.isConnected) {
      setActiveHelperPanel(panelId);
      return;
    }

    const activeNativePanelButton = getActiveNativePanelButton();
    if (activeNativePanelButton) {
      const panelContainer = document.querySelector('[data-testid="panel-container"]');
      captureNativePanelClasses(panelContainer);
      helperShellNativeButton = activeNativePanelButton;
      setActiveHelperPanel(panelId);
      return;
    }

    const shellButton = getNativeShellPanelButton();
    if (!shellButton) {
      logPanelDebug("helper-panel-open-missing-native-shell", { panelId });
      setActiveHelperPanel(panelId);
      return;
    }

    logPanelDebug("helper-panel-opening-native-shell", {
      panelId,
      nativeTitle: shellButton.title || "",
      nativeAriaLabel: shellButton.getAttribute("aria-label") || "",
    });
    dispatchNativePanelPointerDown(shellButton);
    waitForNativePanelOpen(shellButton, () => {
      helperShellNativeButton = getActiveNativePanelButton() || shellButton;
      setActiveHelperPanel(panelId);
    });
  }

  function closeHelperPanels() {
    pendingHelperPanelOpenId += 1;
    const shellButton = helperShellNativeButton;
    setActiveHelperPanel("");
    if (shellButton?.isConnected) {
      dispatchNativePanelPointerDown(shellButton);
    }
    helperShellNativeButton = null;
  }

  function setActiveHelperPanel(panelId) {
    logPanelDebug("set-active-helper-panel", {
      panelId,
      previousPanelId: state.activePanelId,
    });
    state.activePanelId = panelId;
    renderHelperPanels();
  }

  function renderHelperPanels() {
    logPanelDebug("render-helper-panels", {
      activePanelId: state.activePanelId,
      hasHelperPanelHost: Boolean(helperPanelHost?.isConnected),
    });

    if (!state.activePanelId) {
      removeHelperPanelHost({ preservePanelShell: Boolean(helperShellNativeButton) });
    } else {
      getHelperPanelMount();
    }

    renderStatusPanel();
    renderSessionHistoryPanel();
    renderToolbarButtons();
    syncNativePanelButtonsForHelper();
  }

  function getHelperPanelMount() {
    if (!state.activePanelId || !document.documentElement) {
      logPanelDebug("helper-panel-mount-skipped", {
        activePanelId: state.activePanelId,
        hasDocumentElement: Boolean(document.documentElement),
      });
      return null;
    }

    if (helperPanelHost?.isConnected) {
      logPanelDebug("helper-panel-mount-reusing-host", {
        activePanelId: state.activePanelId,
      });
      return helperPanelHost;
    }

    removeHelperPanelHost({ preservePanelShell: true });

    const panelContainer = getNativePanelContainer();
    if (!panelContainer) {
      logPanelDebug("helper-panel-mount-missing-container", {
        activePanelId: state.activePanelId,
      });
      return null;
    }

    const nativeWrapper = panelContainer.querySelector(":scope > div:not([data-tj-helper-panel-wrapper])");
    const nativeAside = panelContainer.querySelector("aside.scaling-panel-container");
    captureNativePanelClasses(panelContainer);
    for (const child of [...panelContainer.children]) {
      if (!child.matches("[data-tj-helper-panel-wrapper]")) {
        child.remove();
      }
    }

    const wrapper = document.createElement("div");
    wrapper.dataset.tjHelperPanelWrapper = "1";
    if (nativeWrapper?.className || nativePanelWrapperClassName) {
      wrapper.className = nativeWrapper?.className || nativePanelWrapperClassName;
    }
    wrapper.style.cssText = [
      "width:100%",
      "height:100%",
      "min-width:0",
      "min-height:0",
      "display:flex",
      "align-items:stretch",
      "flex:1 1 auto",
      "position:relative",
      "overflow:hidden",
    ].join(";");

    const resizeHandle = createHelperPanelResizeHandle();

    const aside = document.createElement("aside");
    aside.className = nativeAside?.className || nativePanelAsideClassName || "scaling-panel-container";
    aside.dataset.tjHelperPanelHost = "1";
    aside.setAttribute("aria-label", "Triplejack Helper panel");
    aside.style.cssText = [
      "width:100%",
      "height:100%",
      "min-width:0",
      "min-height:0",
      "flex:1 1 auto",
      "box-sizing:border-box",
      "overflow:hidden",
      "display:flex",
      "flex-direction:column",
      "background:rgba(18,31,39,.96)",
      "color:#F5FAFC",
      "border-left:1px solid rgba(137,198,215,.55)",
    ].join(";");

    wrapper.appendChild(resizeHandle);
    wrapper.appendChild(aside);
    panelContainer.appendChild(wrapper);
    helperPanelHost = aside;
    applyHelperPanelWidth(panelContainer);
    logPanelDebug("helper-panel-mount-created", {
      activePanelId: state.activePanelId,
      usedNativeWrapperClass: Boolean(nativeWrapper?.className || nativePanelWrapperClassName),
      usedNativeAsideClass: Boolean(nativeAside?.className || nativePanelAsideClassName),
    });
    return helperPanelHost;
  }

  function removeHelperPanelHost(options = {}) {
    const helperRoots = new Set(document.querySelectorAll("[data-tj-helper-panel-wrapper]"));
    const hostRoot = helperPanelHost?.closest?.("[data-tj-helper-panel-wrapper]") || helperPanelHost;
    if (hostRoot) {
      helperRoots.add(hostRoot);
    }

    for (const helperRoot of helperRoots) {
      helperRoot.remove();
    }

    helperPanelHost = null;
    if (!options.preservePanelShell) {
      removeEmptyHelperPanelRegion();
    }
    scheduleLayoutRefresh();
  }

  function removeEmptyHelperPanelRegion() {
    const panelContainer = document.querySelector('[data-testid="panel-container"]');
    if (!panelContainer) {
      scheduleLayoutRefresh();
      return;
    }

    const panelRegion = panelContainer.parentElement;
    if (panelContainer.dataset.tjHelperPanelContainer || panelRegion?.dataset.tjHelperPanelRegion) {
      panelRegion?.remove();
      scheduleLayoutRefresh();
      return;
    }

    if (panelContainer.children.length) {
      return;
    }

    if (panelRegion) {
      panelRegion.style.display = "none";
      panelRegion.dataset.tjHelperHiddenEmpty = "1";
    }

    panelContainer.dataset.tjHelperHiddenEmpty = "1";
    scheduleLayoutRefresh();
  }

  function showNativePanelContainer(panelContainer) {
    const panelRegion = panelContainer?.parentElement;
    if (!panelContainer?.dataset.tjHelperHiddenEmpty && !panelRegion?.dataset.tjHelperHiddenEmpty) {
      return;
    }

    if (panelRegion) {
      panelRegion.style.display = "";
      delete panelRegion.dataset.tjHelperHiddenEmpty;
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

    const panelWidth = getResolvedHelperPanelWidth();
    const panelRegion = document.createElement("div");
    panelRegion.dataset.tjHelperPanelRegion = "1";
    panelRegion.style.cssText = [
      "height:100%",
      "min-width:0",
      "min-height:0",
      "display:flex",
      "align-items:stretch",
      "align-self:stretch",
      "overflow:hidden",
      `flex:0 1 ${panelWidth}px`,
      `max-width:min(${panelWidth}px,calc(100vw - 64px))`,
    ].join(";");

    const panelContainer = document.createElement("div");
    panelContainer.setAttribute("data-testid", "panel-container");
    panelContainer.dataset.tjHelperPanelContainer = "1";
    panelContainer.style.cssText = [
      "height:100%",
      "min-width:0",
      "min-height:0",
      "display:flex",
      "align-items:stretch",
      "overflow:hidden",
    ].join(";");

    panelRegion.appendChild(panelContainer);
    sceneRow.appendChild(panelRegion);
    applyHelperPanelWidth(panelContainer);
    scheduleLayoutRefresh();
    return panelContainer;
  }

  function createHelperPanelResizeHandle() {
    const resizeHandle = document.createElement("div");
    resizeHandle.dataset.tjHelperPanelResizeHandle = "1";
    resizeHandle.title = "Resize panel";
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-orientation", "vertical");
    resizeHandle.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "height:100%",
      "width:24px",
      "z-index:20",
      "cursor:col-resize",
      "touch-action:none",
      "background:transparent",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    resizeHandle.innerHTML = `
      <div aria-hidden="true" style="width:14px;height:62px;border:1px solid rgba(137,198,215,.72);border-right-color:rgba(137,198,215,.42);border-radius:7px 0 0 7px;background:rgba(18,31,39,.98);box-shadow:0 0 0 1px rgba(3,10,14,.65),0 4px 14px rgba(0,0,0,.36);display:flex;align-items:center;justify-content:center;">
        <div style="width:5px;height:34px;border-left:1px solid rgba(191,231,241,.62);border-right:1px solid rgba(191,231,241,.34);"></div>
      </div>
    `;
    resizeHandle.addEventListener("pointerdown", handleHelperPanelResizePointerDown);
    return resizeHandle;
  }

  function handleHelperPanelResizePointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    target.setPointerCapture?.(pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (moveEvent) => {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      if (!viewportWidth) {
        return;
      }

      setHelperPanelWidth(viewportWidth - moveEvent.clientX, { silent: true });
    };

    const stop = () => {
      const panelWidth = getHelperPanelWidth();
      target.releasePointerCapture?.(pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      setStatus(`panel width set to ${panelWidth}px`);
      refreshNativeLayoutAfterPanelWidthChange();
      renderStatusPanel();
    };

    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
  }

  function applyHelperPanelWidth(panelContainer = document.querySelector('[data-testid="panel-container"]')) {
    const panelRegion = panelContainer?.parentElement;
    if (!panelRegion) {
      scheduleLayoutRefresh();
      return;
    }

    if (!getHelperPanelWidthEnabled()) {
      clearHelperPanelWidth(panelContainer);
      if (panelContainer.dataset.tjHelperPanelContainer || panelRegion.dataset.tjHelperPanelRegion) {
        setPanelWidthStyle(panelRegion, HELPER_PANEL_WIDTH);
        setPanelWidthStyle(panelContainer, HELPER_PANEL_WIDTH);
      }
      scheduleLayoutRefresh();
      return;
    }

    const panelWidth = getResolvedHelperPanelWidth();
    setPanelWidthStyle(panelRegion, panelWidth);
    setPanelWidthStyle(panelContainer, panelWidth);
    for (const child of panelContainer.children) {
      setPanelFillStyle(child);
    }
    syncNativePanelGeometry();
    scheduleLayoutRefresh();
  }

  function clearHelperPanelWidth(panelContainer = document.querySelector('[data-testid="panel-container"]')) {
    const panelRegion = panelContainer?.parentElement;
    clearPanelWidthStyle(panelRegion);
    clearPanelWidthStyle(panelContainer);
    if (panelContainer) {
      for (const child of panelContainer.children) {
        clearPanelWidthStyle(child);
      }
    }
  }

  function setPanelWidthStyle(element, panelWidth) {
    if (!element?.style) {
      return;
    }

    element.style.setProperty("flex", `0 0 ${panelWidth}px`, "important");
    element.style.setProperty("flex-basis", `${panelWidth}px`, "important");
    element.style.setProperty("width", `${panelWidth}px`, "important");
    element.style.setProperty("min-width", `${panelWidth}px`, "important");
    element.style.setProperty("max-width", `min(${panelWidth}px,calc(100vw - 64px))`, "important");
    const stageHeight = getNativeStageHeight();
    element.style.setProperty("height", stageHeight ? `${stageHeight}px` : "100%", "important");
    element.style.setProperty("min-height", "0", "important");
    element.style.setProperty("align-self", "stretch", "important");
    element.style.setProperty("overflow", "hidden", "important");
  }

  function setPanelFillStyle(element) {
    if (!element?.style) {
      return;
    }

    const stageHeight = getNativeStageHeight();
    element.style.setProperty("flex", "1 1 auto", "important");
    element.style.setProperty("width", "100%", "important");
    element.style.setProperty("min-width", "0", "important");
    element.style.setProperty("max-width", "100%", "important");
    element.style.setProperty("height", stageHeight ? `${stageHeight}px` : "100%", "important");
    element.style.setProperty("min-height", "0", "important");
    element.style.setProperty("align-self", "stretch", "important");
    element.style.setProperty("overflow", "hidden", "important");
  }

  function getResolvedHelperPanelWidth() {
    return getHelperPanelWidthEnabled() ? getHelperPanelWidth() : HELPER_PANEL_WIDTH;
  }

  function clearPanelWidthStyle(element) {
    if (!element?.style) {
      return;
    }

    for (const property of [
      "flex",
      "flex-basis",
      "width",
      "min-width",
      "max-width",
      "height",
      "min-height",
      "align-self",
      "overflow",
    ]) {
      element.style.removeProperty(property);
    }
  }

  function refreshNativeLayoutAfterPanelWidthChange() {
    applyHelperPanelWidth();
    syncNativePanelGeometry();
    resizeNativeStageToContainer();
    scheduleLayoutRefresh();
    window.requestAnimationFrame(() => {
      syncNativePanelGeometry();
      resizeNativeStageToContainer();
      scheduleLayoutRefresh();
    });
    window.setTimeout(() => {
      syncNativePanelGeometry();
      resizeNativeStageToContainer();
      scheduleLayoutRefresh();
    }, 120);
  }

  function scheduleNativePanelWidthApply() {
    const refresh = () => {
      applyHelperPanelWidth();
      syncNativePanelGeometry();
      resizeNativeStageToContainer();
      scheduleLayoutRefresh();
    };

    window.requestAnimationFrame(refresh);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(refresh);
    });
    window.setTimeout(refresh, 80);
    window.setTimeout(refresh, 250);
  }

  function captureNativePanelClasses(panelContainer) {
    const nativeWrapper = panelContainer?.querySelector?.(":scope > div:not([data-tj-helper-panel-wrapper])");
    const nativeAside = panelContainer?.querySelector?.("aside.scaling-panel-container");

    if (nativeWrapper?.className) {
      nativePanelWrapperClassName = nativeWrapper.className;
    }
    if (nativeAside?.className) {
      nativePanelAsideClassName = nativeAside.className;
    }
  }

  function handleNativePanelButtonPointerDown(event) {
    const nativePanelButton = event.target?.closest?.('button[data-testid="panel button"]');
    if (!nativePanelButton || nativePanelButton.dataset.tjHelperToolbarButton) {
      return;
    }

    scheduleNativePanelWidthApply();

    if (!state.activePanelId) {
      return;
    }

    logPanelDebug("native-panel-pointerdown-switches-from-helper", {
      activePanelId: state.activePanelId,
      title: nativePanelButton.title || "",
      ariaLabel: nativePanelButton.getAttribute("aria-label") || "",
    });
    const clickedShellButton = nativePanelButton === helperShellNativeButton;
    pendingHelperPanelOpenId += 1;
    state.activePanelId = "";
    removeHelperPanelHost({ preservePanelShell: true });
    helperShellNativeButton = null;
    renderToolbarButtons();
    if (clickedShellButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      dispatchNativePanelPointerDown(nativePanelButton);
      window.requestAnimationFrame(() => {
        dispatchNativePanelPointerDown(nativePanelButton);
        scheduleNativePanelWidthApply();
      });
      return;
    }
    // Let other native panel pointerdowns continue into the native React handler.
  }

  function getActiveNativePanelButton() {
    return document.querySelector(
      'button[data-testid="panel button"][data-is-active="true"]:not([data-tj-helper-toolbar-button])',
    );
  }

  function getNativeShellPanelButton() {
    return (
      document.querySelector('button[aria-label="Chat"][data-testid="panel button"]:not([data-tj-helper-toolbar-button])') ||
      document.querySelector('button[data-testid="panel button"]:not([data-tj-helper-toolbar-button])')
    );
  }

  function dispatchNativePanelPointerDown(nativePanelButton) {
    if (!nativePanelButton?.isConnected) {
      return;
    }

    const PointerEventCtor = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
    nativePanelButton.dispatchEvent(
      new PointerEventCtor("pointerdown", {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
  }

  function waitForNativePanelOpen(shellButton, callback) {
    const openId = ++pendingHelperPanelOpenId;
    const startedAt = performance.now();

    const wait = () => {
      if (openId !== pendingHelperPanelOpenId) {
        logPanelDebug("helper-panel-open-cancelled", { openId });
        return;
      }

      const panelContainer = document.querySelector('[data-testid="panel-container"]');
      if (panelContainer || performance.now() - startedAt > 600) {
        logPanelDebug("helper-panel-native-open-wait-complete", {
          openId,
          hasPanelContainer: Boolean(panelContainer),
          shellStillActive: shellButton?.hasAttribute?.("data-is-active") || false,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
        callback();
        return;
      }

      window.requestAnimationFrame(wait);
    };

    window.requestAnimationFrame(wait);
  }

  function syncNativePanelButtonsForHelper() {
    if (!state.activePanelId || !helperShellNativeButton?.isConnected) {
      return;
    }

    const nativeButton = helperShellNativeButton;
    const toolbar = nativeButton.parentElement;
    const inactiveNativeButton = toolbar?.querySelector(
      'button[data-testid="panel button"]:not([data-is-active="true"]):not([data-tj-helper-toolbar-button])',
    );
    if (inactiveNativeButton?.className) {
      nativeButton.className = inactiveNativeButton.className;
    }
    nativeButton.removeAttribute("data-is-active");
    delete nativeButton.dataset.isActive;
    if (nativeButton.title?.startsWith("Hide ")) {
      nativeButton.title = nativeButton.title.replace(/^Hide /, "Show ");
    }
  }

  function scheduleLayoutRefresh() {
    window.dispatchEvent(new Event("resize"));
    window.requestAnimationFrame(() => {
      syncNativePanelGeometry();
      resizeNativeStageToContainer();
      window.dispatchEvent(new Event("resize"));
      sessionHistoryChart?.resize?.();
    });
  }

  function syncNativePanelGeometry() {
    const panelContainer = document.querySelector('[data-testid="panel-container"]');
    const panelRegion = panelContainer?.parentElement;
    if (!panelContainer || !panelRegion) {
      return;
    }

    const stageHeight = getNativeStageHeight();
    if (stageHeight > 0) {
      panelRegion.style.setProperty("height", `${stageHeight}px`, "important");
      panelContainer.style.setProperty("height", `${stageHeight}px`, "important");
      for (const child of panelContainer.children) {
        child.style.setProperty("height", `${stageHeight}px`, "important");
      }
    }

    positionHelperPanelResizeHandle(panelRegion, stageHeight);
  }

  function positionHelperPanelResizeHandle(panelRegion, stageHeight = getNativeStageHeight()) {
    const resizeHandle = document.querySelector("[data-tj-helper-panel-resize-handle]");
    if (!resizeHandle || !panelRegion) {
      return;
    }

    const panelRect = panelRegion.getBoundingClientRect();
    resizeHandle.style.left = `${Math.round(panelRect.left - 14)}px`;
    resizeHandle.style.top = `${Math.round(panelRect.top)}px`;
    resizeHandle.style.height = `${Math.round(stageHeight || panelRect.height || 0)}px`;
  }

  function getNativeStageHeight() {
    const stageContainer = document.querySelector('[data-testid="poker-stage-container"]');
    return Math.round(stageContainer?.clientHeight || stageContainer?.getBoundingClientRect?.().height || 0);
  }

  function resizeNativeStageToContainer() {
    const stageContainer = document.querySelector('[data-testid="poker-stage-container"]');
    const canvas = stageContainer?.querySelector?.("canvas");
    if (!stageContainer || !canvas) {
      return;
    }

    const width = Math.round(stageContainer.clientWidth || stageContainer.getBoundingClientRect().width || 0);
    const height = Math.round(stageContainer.clientHeight || stageContainer.getBoundingClientRect().height || 0);
    if (width <= 0 || height <= 0) {
      return;
    }

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== width) {
      canvas.width = width;
    }
    if (canvas.height !== height) {
      canvas.height = height;
    }

    const statusOverlay = document.querySelector('section[aria-label="table status"]')?.parentElement;
    if (statusOverlay?.style) {
      statusOverlay.style.width = `${width}px`;
      statusOverlay.style.height = `${height}px`;
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
