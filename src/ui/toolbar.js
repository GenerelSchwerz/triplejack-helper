  function installToolbarButton() {
    const observer = new MutationObserver(() => {
      renderToolbarButtons();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("DOMContentLoaded", renderToolbarButtons, { once: true });
    window.addEventListener("load", renderToolbarButtons, { once: true });

    for (const delay of [0, 250, 1000, 2500]) {
      window.setTimeout(renderToolbarButtons, delay);
    }
  }

  function renderToolbarButtons() {
    for (const toolbar of findPanelToolbars()) {
      if (!toolbar || toolbar.querySelector("[data-tj-helper-toolbar-button]")) {
        continue;
      }

      const insertTarget = getToolbarInsertTarget(toolbar);
      if (!insertTarget) {
        continue;
      }

      const helperButton = buildToolbarButton(toolbar, insertTarget);
      toolbar.insertBefore(helperButton, insertTarget);
    }

    for (const helperButton of document.querySelectorAll("[data-tj-helper-toolbar-button]")) {
      if (state.panelVisible) {
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

  function buildToolbarButton(toolbar, insertTarget) {
    const referenceButton =
      toolbar.querySelector('button[data-testid="panel button"]:not([data-is-active="true"])') || insertTarget;
    const outerClassName = referenceButton.firstElementChild?.className || "";
    const iconWrapperClassName =
      referenceButton.querySelector('[data-testid="icon-scale-wrapper"]')?.className || "";
    const helperButton = document.createElement("button");
    const activeButton = toolbar.querySelector('button[data-testid="panel button"][data-is-active="true"]');

    helperButton.type = "button";
    helperButton.title = "Translate Settings";
    helperButton.className = referenceButton.className;
    helperButton.style.background = "transparent";
    helperButton.style.paddingLeft = "5px";
    helperButton.style.paddingRight = "5px";
    helperButton.dataset.tjHelperInactiveClass = referenceButton.className;
    helperButton.dataset.tjHelperActiveClass =
      activeButton?.className || insertTarget.className || referenceButton.className;
    helperButton.dataset.tjHelperToolbarButton = "1";
    helperButton.setAttribute("data-testid", "panel button");
    helperButton.setAttribute("aria-label", "Translate Settings");
    helperButton.innerHTML = `
      <div class="${escapeAttribute(outerClassName)}">
        <div data-testid="icon-scale-wrapper" class="${escapeAttribute(iconWrapperClassName)}">
          <span style="font:700 23px/1 Arial,sans-serif;color:currentColor;">T</span>
        </div>
      </div>
    `;

    helperButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleStatusPanel();
    });

    return helperButton;
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
