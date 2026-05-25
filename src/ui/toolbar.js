  function installToolbarButton() {
    const observer = new MutationObserver(() => {
      renderToolbarButtons();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("DOMContentLoaded", renderToolbarButtons, { once: true });
    document.addEventListener("click", handleHelperToolbarButtonClick, true);
    document.addEventListener("click", handleNativePanelButtonClick, true);
    window.addEventListener("load", renderToolbarButtons, { once: true });

    for (const delay of [0, 250, 1000, 2500]) {
      window.setTimeout(renderToolbarButtons, delay);
    }
  }

  function renderToolbarButtons() {
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
      }
    }

    for (const helperButton of document.querySelectorAll("[data-tj-helper-toolbar-button]")) {
      if (state.activePanelId === helperButton.dataset.tjHelperToolbarButton) {
        helperButton.className = helperButton.dataset.tjHelperActiveClass || helperButton.className;
        helperButton.dataset.isActive = "true";
      } else {
        helperButton.className = helperButton.dataset.tjHelperInactiveClass || helperButton.className;
        delete helperButton.dataset.isActive;
      }
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

  function handleHelperToolbarButtonClick(event) {
    const helperButton = event.target?.closest?.("[data-tj-helper-toolbar-button]");
    if (!helperButton) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggleHelperPanel(helperButton.dataset.tjHelperToolbarButton);
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
    helperButton.style.background = "transparent";
    helperButton.style.paddingLeft = "5px";
    helperButton.style.paddingRight = "5px";
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
