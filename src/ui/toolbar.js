  function installToolbarButton() {
    logPanelDebug("install-toolbar-button", {
      readyState: document.readyState,
    });

    const observer = new MutationObserver(() => {
      renderToolbarButtons();
      queueHelperPanelSizingReconcile();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("pointerdown", handleHelperToolbarPointerProbe, true);
    window.addEventListener("mousedown", handleHelperToolbarPointerProbe, true);
    window.addEventListener("pointerdown", handleHelperToolbarButtonPointerDown, true);
    window.addEventListener("pointerdown", handleNativePanelButtonPointerDown, true);
    window.addEventListener("click", handleHelperToolbarButtonClickFallback, true);
    document.addEventListener("DOMContentLoaded", renderToolbarButtons, { once: true });
    window.addEventListener("load", renderToolbarButtons, { once: true });

    for (const delay of [0, 250, 1000, 2500]) {
      window.setTimeout(() => {
        renderToolbarButtons();
        queueHelperPanelSizingReconcile();
      }, delay);
    }
  }

  function renderToolbarButtons() {
    let insertedCount = 0;

    for (const toolbar of findPanelToolbars()) {
      if (!toolbar) {
        continue;
      }

      const insertTarget = getToolbarInsertTarget(toolbar);
      if (!insertTarget) {
        continue;
      }

      for (const item of getHelperToolbarItems()) {
        if (toolbar.querySelector(`[data-tj-helper-toolbar-button="${item.id}"]`)) {
          continue;
        }

        const helperButton = buildToolbarButton(toolbar, insertTarget, item);
        toolbar.insertBefore(helperButton, insertTarget);
        insertedCount += 1;
      }
    }

    for (const helperButton of document.querySelectorAll("[data-tj-helper-toolbar-button]")) {
      refreshHelperToolbarButtonClasses(helperButton);
      if (state.activePanelId === helperButton.dataset.tjHelperToolbarButton) {
        helperButton.className = helperButton.dataset.tjHelperActiveClass || helperButton.className;
        helperButton.dataset.isActive = "true";
      } else {
        helperButton.className = helperButton.dataset.tjHelperInactiveClass || helperButton.className;
        delete helperButton.dataset.isActive;
        helperButton.removeAttribute("data-is-active");
        helperButton.blur();
      }
    }

    if (insertedCount) {
      logPanelDebug("helper-toolbar-buttons-inserted", {
        insertedCount,
        totalHelperButtons: document.querySelectorAll("[data-tj-helper-toolbar-button]").length,
      });
    }
  }

  function refreshHelperToolbarButtonClasses(helperButton) {
    const toolbar = helperButton.parentElement;
    const inactiveNativeButton = toolbar?.querySelector(
      'button[data-testid="panel button"]:not([data-is-active="true"]):not([data-tj-helper-toolbar-button])',
    );
    const activeNativeButton = toolbar?.querySelector(
      'button[data-testid="panel button"][data-is-active="true"]:not([data-tj-helper-toolbar-button])',
    );

    if (inactiveNativeButton?.className) {
      helperButton.dataset.tjHelperInactiveClass = inactiveNativeButton.className;
    }
    if (activeNativeButton?.className) {
      helperButton.dataset.tjHelperActiveClass = activeNativeButton.className;
    }
  }

  function findPanelToolbars() {
    const toolbars = new Set();
    const panelButtons = document.querySelectorAll('button[data-testid="panel button"]');

    for (const panelButton of panelButtons) {
      const toolbar = panelButton.parentElement;
      if (toolbar?.querySelector('[aria-label="Chat"],[aria-label="Direct Messages"]')) {
        toolbars.add(toolbar);
      }
    }

    return toolbars;
  }

  function getToolbarInsertTarget(toolbar) {
    return (
      toolbar.querySelector(
        [
          'button[aria-label="Chat"][data-testid="panel button"]',
          'button[title="Chat"][data-testid="panel button"]',
          'button[title="Show Chat"][data-testid="panel button"]',
          'button[title="Hide Chat"][data-testid="panel button"]',
        ].join(","),
      ) || toolbar.querySelector('button[data-testid="panel button"]')
    );
  }

  function handleHelperToolbarPointerProbe(event) {
    const helperButton = event.target?.closest?.("[data-tj-helper-toolbar-button]");
    if (!helperButton) {
      return;
    }

    logPanelDebug("helper-toolbar-pointer-event", {
      type: event.type,
      panelId: helperButton.dataset.tjHelperToolbarButton,
      activePanelId: state.activePanelId,
      eventPhase: event.eventPhase,
      targetTagName: event.target?.tagName || "",
    });
  }

  function handleHelperToolbarButtonPointerDown(event) {
    const helperButton = event.target?.closest?.("[data-tj-helper-toolbar-button]");
    if (!helperButton) {
      return;
    }

    logPanelDebug("helper-toolbar-pointerdown-captured", {
      panelId: helperButton.dataset.tjHelperToolbarButton,
      activePanelId: state.activePanelId,
      eventPhase: event.eventPhase,
      targetTagName: event.target?.tagName || "",
      targetTitle: event.target?.title || "",
    });
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggleHelperPanel(helperButton.dataset.tjHelperToolbarButton);
  }

  function handleHelperToolbarButtonClickFallback(event) {
    const helperButton = event.target?.closest?.("[data-tj-helper-toolbar-button]");
    if (!helperButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function getHelperToolbarItems() {
    return [
      {
        id: SETTINGS_PANEL_ID,
        title: "Triplejack Helper Settings",
        label: "⚙",
      },
      {
        id: SESSION_HISTORY_PANEL_ID,
        title: "Session History",
        label: "📈",
      },
    ];
  }

  function buildToolbarButton(toolbar, insertTarget, item) {
    const referenceButton =
      toolbar.querySelector('button[data-testid="panel button"]:not([data-is-active="true"])') || insertTarget;
    const outerClassName = referenceButton.firstElementChild?.className || "";
    const iconWrapperClassName =
      referenceButton.querySelector('[data-testid="icon-scale-wrapper"]')?.className || "";
    const helperButton = document.createElement("button");
    const activeButton = toolbar.querySelector('button[data-testid="panel button"][data-is-active="true"]');

    helperButton.type = "button";
    helperButton.title = item.title;
    helperButton.className = referenceButton.className;
    helperButton.dataset.tjHelperInactiveClass = referenceButton.className;
    helperButton.dataset.tjHelperActiveClass =
      activeButton?.className || insertTarget.className || referenceButton.className;
    helperButton.dataset.tjHelperToolbarButton = item.id;
    helperButton.setAttribute("data-testid", "panel button");
    helperButton.setAttribute("aria-label", item.title);
    helperButton.innerHTML = `
      <div class="${escapeAttribute(outerClassName)}">
        <div data-testid="icon-scale-wrapper" class="${escapeAttribute(iconWrapperClassName)}">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;font:20px/1 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',Arial,sans-serif;color:currentColor;letter-spacing:0;">${escapeAttribute(item.label)}</span>
        </div>
      </div>
    `;

    return helperButton;
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
