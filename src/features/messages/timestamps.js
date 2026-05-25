  function installMessageTimestamps() {
    document.addEventListener(SOCKET_MESSAGE_EVENT, handleTimestampSocketMessage);

    timestampObserver = new MutationObserver(queueMessageTimestampRender);
    timestampObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("DOMContentLoaded", renderMessageTimestamps, { once: true });
    window.addEventListener("load", renderMessageTimestamps, { once: true });

    for (const delay of [0, 250, 1000, 2500]) {
      window.setTimeout(renderMessageTimestamps, delay);
    }
  }

  function queueMessageTimestampRender() {
    if (timestampRenderQueued) {
      return;
    }

    timestampRenderQueued = true;
    window.requestAnimationFrame(() => {
      timestampRenderQueued = false;
      renderMessageTimestamps();
    });
  }

  function renderMessageTimestamps() {
    if (!document.documentElement) {
      return;
    }

    if (!getMessageTimestampsEnabled()) {
      for (const timestampElement of document.querySelectorAll("[data-tj-helper-timestamp]")) {
        delete timestampElement.parentElement?.dataset.tjHelperTimestampValue;
        timestampElement.remove();
      }
      return;
    }

    for (const timestampElement of document.querySelectorAll("[data-tj-helper-timestamp]")) {
      if (!isTimestampMessageElement(timestampElement.parentElement) || isStalePrivateTimestampElement(timestampElement)) {
        delete timestampElement.parentElement?.dataset.tjHelperTimestampValue;
        timestampElement.remove();
      }
    }

    for (const messageElement of getTimestampMessageElements()) {
      if (messageElement.querySelector("[data-tj-helper-timestamp]")) {
        continue;
      }

      const timestampText = getMessageTimestamp(messageElement);
      if (!timestampText) {
        continue;
      }

      const timestampTarget = getTimestampRenderTarget(messageElement);
      const timestampElement = document.createElement("span");
      timestampElement.dataset.tjHelperTimestamp = "1";
      timestampElement.dataset.tjHelperTimestampSource = getTimestampSource(messageElement);
      timestampElement.textContent = timestampText;
      timestampElement.style.cssText = getTimestampStyle(messageElement);

      timestampTarget.appendChild(timestampElement);
    }
  }

  function getTimestampMessageElements() {
    const messageElements = new Set();
    const selectors = [
      '[aria-label="chat messages"] .MuiTypography-root.MuiTypography-body1',
      'aside[aria-label="active conversation panel"] .scaling-panel-contents',
    ];

    for (const element of document.querySelectorAll(selectors.join(","))) {
      if (isTimestampMessageElement(element)) {
        messageElements.add(element);
      }
    }

    return messageElements;
  }

  function isTimestampMessageElement(element) {
    if (!element || getActiveHelperPanelElement()?.contains(element)) {
      return false;
    }

    if (element.closest("[data-tj-helper-toolbar-button]")) {
      return false;
    }

    if (element.matches("button,input,select,textarea")) {
      return false;
    }

    if (element.matches("[data-testid='message input'],.MuiTextField-root,.MuiFormControl-root")) {
      return false;
    }

    if (element.closest("[data-testid='message input'],.MuiTextField-root,.MuiFormControl-root")) {
      return false;
    }

    if (element.querySelector("textarea,input,button,[data-testid='message input'],.MuiTextField-root,.MuiFormControl-root")) {
      return false;
    }

    const messageTextElement = getMessageTextElement(element);
    if (!messageTextElement) {
      return false;
    }

    const isPublicChatMessage = Boolean(element.closest('[aria-label="chat messages"]'));
    const isPrivateMessage = Boolean(element.closest('aside[aria-label="active conversation panel"]'));
    if (!isPublicChatMessage && !isPrivateMessage) {
      return false;
    }

    const messageText = getMessageElementText(element).replace(/\d{1,2}:\d{2}\s*(AM|PM)?/gi, "").trim();
    return Boolean(messageText);
  }

  function getMessageTimestamp(messageElement) {
    if (!messageElement.dataset.tjHelperTimestampValue) {
      const timestampValue = resolveMessageTimestamp(messageElement);
      if (!timestampValue) {
        return "";
      }

      messageElement.dataset.tjHelperTimestampValue = timestampValue;
    }

    return messageElement.dataset.tjHelperTimestampValue;
  }

  function getTimestampSource(messageElement) {
    return messageElement.closest('aside[aria-label="active conversation panel"]') ? "private-protocol" : "current";
  }

  function getTimestampRenderTarget(messageElement) {
    if (!messageElement.closest('aside[aria-label="active conversation panel"]')) {
      return messageElement;
    }

    const messageTextElement = getMessageTextElement(messageElement);
    const directBubble = Array.from(messageElement.children).find((child) => {
      return child.contains(messageTextElement) && !child.matches("[data-tj-helper-timestamp]");
    });

    return directBubble || messageTextElement || messageElement;
  }

  function getTimestampStyle(messageElement) {
    if (messageElement.closest('aside[aria-label="active conversation panel"]')) {
      return [
        "display:block",
        "margin:3px 1px 0 auto",
        "opacity:.58",
        "font:9px/1 Arial,sans-serif",
        "letter-spacing:0",
        "white-space:nowrap",
        "text-align:right",
      ].join(";");
    }

    return [
      "display:inline-block",
      "margin-left:6px",
      "opacity:.68",
      "font:10px/1 Arial,sans-serif",
      "white-space:nowrap",
      "vertical-align:baseline",
    ].join(";");
  }

  function getMessageTextElement(element) {
    return element.matches?.(".MuiTypography-root.MuiTypography-body1")
      ? element
      : element.querySelector?.(".MuiTypography-root.MuiTypography-body1");
  }

  function isStalePrivateTimestampElement(timestampElement) {
    return (
      timestampElement.parentElement?.closest('aside[aria-label="active conversation panel"]') &&
      timestampElement.dataset.tjHelperTimestampSource !== "private-protocol"
    );
  }

  function resolveMessageTimestamp(messageElement) {
    if (messageElement.closest('aside[aria-label="active conversation panel"]')) {
      return getPrivateMessageTimestampFromCache(messageElement);
    }

    return formatTimestamp(new Date());
  }

  function handleTimestampSocketMessage(event) {
    const detail = event.detail;
    if (!detail || typeof detail.data !== "string") {
      return;
    }

    if (detail.direction === "incoming") {
      handleIncomingTimestampFrame(detail.data);
      return;
    }

    if (detail.direction === "outgoing") {
      handleOutgoingTimestampFrame(detail.data);
    }
  }

  function handleIncomingTimestampFrame(data) {
    if (data.startsWith("privatemsg_log:")) {
      const payload = parseTimestampJsonFrame(data, "privatemsg_log:");
      if (!payload || !Array.isArray(payload.messages)) {
        return;
      }

      for (const message of payload.messages) {
        cachePrivateMessageTimestamp(message.messageHtml, message.timestampSecs);
      }
      queueMessageTimestampRender();
      return;
    }

    if (data.startsWith("privatemsg:")) {
      const payload = parseTimestampJsonFrame(data, "privatemsg:");
      if (!payload) {
        return;
      }

      cachePrivateMessageTimestamp(payload.messageHtml, payload.timestampSecs || Math.floor(Date.now() / 1000));
      queueMessageTimestampRender();
    }
  }

  function handleOutgoingTimestampFrame(data) {
    if (!data.startsWith("private_msg:")) {
      return;
    }

    const commaIndex = data.indexOf(",");
    if (commaIndex === -1) {
      return;
    }

    const text = decodeTimestampProtocolText(data.slice(commaIndex + 1)).trim();
    if (!text) {
      return;
    }

    cachePrivateMessageTimestampText(text, Date.now());
    queueMessageTimestampRender();
  }

  function parseTimestampJsonFrame(data, prefix) {
    try {
      return JSON.parse(data.slice(prefix.length));
    } catch {
      return null;
    }
  }

  function cachePrivateMessageTimestamp(messageHtml, timestampSecs) {
    const text = extractTimestampMessageText(messageHtml);
    const timestampMs = normalizeTimestampMs(timestampSecs);
    if (!text || !timestampMs) {
      return;
    }

    cachePrivateMessageTimestampText(text, timestampMs);
  }

  function cachePrivateMessageTimestampText(text, timestampMs) {
    const key = getTimestampTextKey(text);
    if (!key || !Number.isFinite(timestampMs)) {
      return;
    }

    const cachedTimestamps = privateMessageTimestampsByText.get(key) || [];
    cachedTimestamps.push(formatTimestamp(new Date(timestampMs)));
    privateMessageTimestampsByText.set(key, cachedTimestamps);
  }

  function getPrivateMessageTimestampFromCache(messageElement) {
    const key = getTimestampTextKey(getMessageElementText(messageElement));
    if (!key) {
      return "";
    }

    const cachedTimestamps = privateMessageTimestampsByText.get(key);
    if (!cachedTimestamps?.length) {
      return "";
    }

    const timestamp = cachedTimestamps.shift();
    if (!cachedTimestamps.length) {
      privateMessageTimestampsByText.delete(key);
    }

    return timestamp || "";
  }

  function extractTimestampMessageText(messageHtml) {
    const template = document.createElement("template");
    template.innerHTML = String(messageHtml || "");

    const timestampTextElement = Array.from(template.content.querySelectorAll("font")).find((element) => {
      const color = element.getAttribute("color")?.toLowerCase();
      return color === "#003366" || color === "#333333" || color === "#006b3f";
    });

    return timestampTextElement?.textContent?.trim() || template.content.textContent?.trim() || "";
  }

  function getMessageElementText(messageElement) {
    const clone = messageElement.cloneNode(true);
    for (const timestampElement of clone.querySelectorAll("[data-tj-helper-timestamp]")) {
      timestampElement.remove();
    }

    return clone.textContent?.trim() || "";
  }

  function getTimestampTextKey(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function normalizeTimestampMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return null;
    }

    return number < 100000000000 ? number * 1000 : number;
  }

  function decodeTimestampProtocolText(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, "%20"));
    } catch {
      return String(value);
    }
  }

  function formatTimestamp(date) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
