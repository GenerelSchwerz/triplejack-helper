// ==UserScript==
// @name         Triplejack Helper
// @namespace    https://triplejack.com/
// @version      0.4.3
// @description  Translates Triplejack public chat and direct messages using Google Translate requests.
// @author       Rocco A.
// @license      MIT
// @homepageURL  https://github.com/GenerelSchwerz/triplejack-helper
// @supportURL   https://github.com/GenerelSchwerz/triplejack-helper/issues
// @match        http://triplejack.com/*
// @match        https://triplejack.com/*
// @match        http://www.triplejack.com/*
// @match        https://www.triplejack.com/*
// @match        http://*.triplejack.com/*
// @match        https://*.triplejack.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      translate.googleapis.com
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_NAME = "Triplejack Helper";
  const DEFAULT_TARGET_LANGUAGE = "en";
  const LANGUAGE_STORAGE_KEY = "triplejack-helper-target-language";
  const OUTGOING_LANGUAGE_STORAGE_KEY = "triplejack-helper-outgoing-language";
  const OUTGOING_ENABLED_STORAGE_KEY = "triplejack-helper-outgoing-enabled";
  const MESSAGE_TIMESTAMPS_STORAGE_KEY = "triplejack-helper-message-timestamps-enabled";
  const PANEL_TOGGLE_KEY = "L";
  const LANGUAGE_PROMPT_KEY = "Y";
  const LANGUAGE_OPTIONS = [
    ["en", "English"],
    ["es", "Spanish"],
    ["fr", "French"],
    ["de", "German"],
    ["it", "Italian"],
    ["pt", "Portuguese"],
    ["ja", "Japanese"],
    ["ko", "Korean"],
    ["zh-CN", "Chinese Simplified"],
    ["zh-TW", "Chinese Traditional"],
    ["tl", "Tagalog / Filipino"],
  ];
  const REQUEST_EVENT = "tj-helper-translate-request";
  const RESPONSE_EVENT = "tj-helper-translate-response";
  const OUTGOING_REQUEST_EVENT = "tj-helper-outgoing-translate-request";
  const OUTGOING_RESPONSE_EVENT = "tj-helper-outgoing-translate-response";
  const STATUS_EVENT = "tj-helper-status";
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const translationCache = new Map();
  const state = {
    hooked: false,
    sockets: 0,
    chatsSeen: 0,
    translationsShown: 0,
    lastStatus: "starting",
    panelVisible: false,
  };
  let statusPanel;
  let timestampObserver;
  let timestampRenderQueued = false;

  function log(...args) {
    console.log(`[${SCRIPT_NAME}]`, ...args);
  }

  function setStatus(status) {
    state.lastStatus = status;
    log(status);
    renderStatusPanel();
  }

  function installTranslationBridge() {
    document.addEventListener(REQUEST_EVENT, async (event) => {
      const detail = event.detail;
      if (!detail?.requestId || !detail.chatMessage?.text) {
        return;
      }

      state.chatsSeen += 1;
      setStatus(`chat seen from ${detail.chatMessage.playerName}: ${detail.chatMessage.text}`);

      try {
        const targetLanguage = getTargetLanguage();
        const translatedText = await translateText(detail.chatMessage.text, targetLanguage);
        document.dispatchEvent(
          new CustomEvent(RESPONSE_EVENT, {
            detail: {
              requestId: detail.requestId,
              targetLanguage,
              translatedText,
            },
          }),
        );
      } catch (error) {
        document.dispatchEvent(
          new CustomEvent(RESPONSE_EVENT, {
            detail: {
              requestId: detail.requestId,
              error: error.message,
            },
          }),
        );
      }
    });

    document.addEventListener(OUTGOING_REQUEST_EVENT, async (event) => {
      const detail = event.detail;
      if (!detail?.requestId || !detail.outgoingMessage?.text) {
        return;
      }

      try {
        if (!getOutgoingTranslationEnabled()) {
          document.dispatchEvent(
            new CustomEvent(OUTGOING_RESPONSE_EVENT, {
              detail: {
                requestId: detail.requestId,
                translatedData: detail.outgoingMessage.originalData,
              },
            }),
          );
          return;
        }

        const targetLanguage = getOutgoingTargetLanguage();
        const translatedText = await translateText(detail.outgoingMessage.text, targetLanguage);
        document.dispatchEvent(
          new CustomEvent(OUTGOING_RESPONSE_EVENT, {
            detail: {
              requestId: detail.requestId,
              targetLanguage,
              translatedText,
            },
          }),
        );
      } catch (error) {
        document.dispatchEvent(
          new CustomEvent(OUTGOING_RESPONSE_EVENT, {
            detail: {
              requestId: detail.requestId,
              error: error.message,
            },
          }),
        );
      }
    });

    document.addEventListener(STATUS_EVENT, (event) => {
      Object.assign(state, event.detail);
      log(state.lastStatus);
      renderStatusPanel();
    });
  }

  function injectWebSocketHook() {
    const script = document.createElement("script");
    script.textContent = `(${pageWebSocketHook.toString()})(${JSON.stringify({
      scriptName: SCRIPT_NAME,
      requestEvent: REQUEST_EVENT,
      responseEvent: RESPONSE_EVENT,
      outgoingRequestEvent: OUTGOING_REQUEST_EVENT,
      outgoingResponseEvent: OUTGOING_RESPONSE_EVENT,
      outgoingEnabledStorageKey: OUTGOING_ENABLED_STORAGE_KEY,
      statusEvent: STATUS_EVENT,
    })});`;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
    setStatus("page-context WebSocket hook injected");
  }

  function pageWebSocketHook(config) {
    const TRANSLATED_MARKER = "data-tj-translated";
    const NativeWebSocket = window.WebSocket;
    const pendingRequests = new Map();
    const pendingOutgoingRequests = new Map();
    const requestedPrivateMessageIds = new Set();
    const state = {
      hooked: false,
      sockets: 0,
      chatsSeen: 0,
      translationsShown: 0,
      lastStatus: "starting",
    };

    function log(...args) {
      console.log(`[${config.scriptName}]`, ...args);
    }

    function setStatus(status) {
      state.lastStatus = status;
      log(status);
      document.dispatchEvent(new CustomEvent(config.statusEvent, { detail: { ...state } }));
    }

    function install() {
      if (window.__triplejackTranslateWebSocketHookInstalled) {
        setStatus("WebSocket hook already installed");
        return;
      }

      if (!NativeWebSocket) {
        setStatus("WebSocket is not available");
        return;
      }

      window.__triplejackTranslateWebSocketHookInstalled = true;

      window.WebSocket = new Proxy(NativeWebSocket, {
        construct(Target, args) {
          const socket = new Target(...args);
          const [url] = args;
          const socketId = String(++state.sockets);

          setStatus(`websocket opened: ${url}`);

          socket.addEventListener("message", (event) => {
            handleIncomingWebSocketMessage(event, socket, socketId);
          });

          const nativeSend = socket.send.bind(socket);
          socket.send = (data) => {
            if (!isOutgoingTranslationEnabled()) {
              return nativeSend(data);
            }

            const outgoingMessage = parseOutgoingMessage(data);
            if (!outgoingMessage) {
              return nativeSend(data);
            }

            const requestId = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
            pendingOutgoingRequests.set(requestId, { nativeSend, outgoingMessage });
            setStatus(`outgoing ${outgoingMessage.kind} queued: ${outgoingMessage.text}`);
            document.dispatchEvent(
              new CustomEvent(config.outgoingRequestEvent, {
                detail: {
                  requestId,
                  socketId,
                  outgoingMessage,
                },
              }),
            );

            return undefined;
          };

          return socket;
        },
      });

      Object.defineProperty(window.WebSocket, "CONNECTING", { value: NativeWebSocket.CONNECTING });
      Object.defineProperty(window.WebSocket, "OPEN", { value: NativeWebSocket.OPEN });
      Object.defineProperty(window.WebSocket, "CLOSING", { value: NativeWebSocket.CLOSING });
      Object.defineProperty(window.WebSocket, "CLOSED", { value: NativeWebSocket.CLOSED });
      window.WebSocket.prototype = NativeWebSocket.prototype;

      state.hooked = true;
      setStatus("WebSocket hook installed in page context");
    }

    function handleIncomingWebSocketMessage(event, socket, socketId) {
      if (typeof event.data !== "string") {
        return;
      }

      const chatMessages = parseTranslatableMessages(event.data);
      if (!chatMessages.length) {
        return;
      }

      for (const chatMessage of chatMessages) {
        const requestId = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
        pendingRequests.set(requestId, { socket, chatMessage });
        state.chatsSeen += 1;
        setStatus(`${chatMessage.kind} seen from ${chatMessage.playerName}: ${chatMessage.text}`);

        document.dispatchEvent(
          new CustomEvent(config.requestEvent, {
            detail: {
              requestId,
              socketId,
              chatMessage,
            },
          }),
        );
      }
    }

    function parseOutgoingMessage(data) {
      if (typeof data !== "string") {
        return null;
      }

      if (data.startsWith("c:")) {
        const text = data.slice(2).trim();
        return text
          ? {
              kind: "chat",
              originalData: data,
              text,
            }
          : null;
      }

      if (data.startsWith("private_msg:")) {
        const commaIndex = data.indexOf(",");
        if (commaIndex === -1) {
          return null;
        }

        const conversationPlayerId = data.slice("private_msg:".length, commaIndex);
        const encodedText = data.slice(commaIndex + 1);
        const text = decodeProtocolText(encodedText).trim();
        return text
          ? {
              kind: "private message",
              originalData: data,
              privateMessagePrefix: data.slice(0, commaIndex + 1),
              text,
              conversationPlayerId,
            }
          : null;
      }

      return null;
    }

    function handleOutgoingTranslationResponse(event) {
      const detail = event.detail;
      const pendingRequest = pendingOutgoingRequests.get(detail?.requestId);
      if (!pendingRequest) {
        return;
      }

      pendingOutgoingRequests.delete(detail.requestId);

      const { nativeSend, outgoingMessage } = pendingRequest;
      if (detail.error) {
        setStatus(`outgoing translation failed: ${detail.error}`);
        nativeSend(outgoingMessage.originalData);
        return;
      }

      const translatedData =
        detail.translatedData ||
        buildOutgoingMessageData(outgoingMessage, detail.translatedText, detail.targetLanguage);
      nativeSend(translatedData);
      setStatus(`sent ${outgoingMessage.kind}: ${detail.translatedText || outgoingMessage.text}`);
    }

    function buildOutgoingMessageData(outgoingMessage, translatedText) {
      if (!translatedText) {
        return outgoingMessage.originalData;
      }

      if (outgoingMessage.kind === "private message") {
        return `${outgoingMessage.privateMessagePrefix}${encodeURIComponent(translatedText)}`;
      }

      return `c:${translatedText}`;
    }

    function decodeProtocolText(value) {
      try {
        return decodeURIComponent(String(value).replace(/\+/g, "%20"));
      } catch {
        return String(value);
      }
    }

    function parseTranslatableMessages(data) {
      const publicChatMessage = parsePlayerChatMessage(data);
      if (publicChatMessage && !publicChatMessage.html.includes(TRANSLATED_MARKER)) {
        return [publicChatMessage];
      }

      return parsePrivateChatMessages(data);
    }

    function parsePlayerChatMessage(data) {
      if (!data.startsWith("pc:")) {
        return null;
      }

      const firstCommaIndex = data.indexOf(",");
      const secondCommaIndex = data.indexOf(",", firstCommaIndex + 1);
      if (firstCommaIndex === -1 || secondCommaIndex === -1) {
        return null;
      }

      const playerId = data.slice(3, firstCommaIndex);
      const playerName = data.slice(firstCommaIndex + 1, secondCommaIndex);
      const html = data.slice(secondCommaIndex + 1);
      const text = extractChatText(html);

      if (!text) {
        return null;
      }

      return {
        kind: "chat",
        playerId,
        playerName,
        html,
        text,
      };
    }

    function parsePrivateChatMessages(data) {
      if (data.startsWith("privatemsg:")) {
        const payload = parseJsonFrame(data, "privatemsg:");
        const chatMessage = parsePrivateChatMessage(payload);
        return chatMessage ? [chatMessage] : [];
      }

      if (data.startsWith("privatemsg_log:")) {
        const payload = parseJsonFrame(data, "privatemsg_log:");
        if (!payload?.conversationPlayer || !Array.isArray(payload.messages)) {
          return [];
        }

        const batch = {
          payload,
          remaining: 0,
          translatedMessagesByIndex: new Map(),
        };
        const chatMessages = payload.messages
          .map((message) => {
            return parsePrivateChatMessage({
              ...message,
              conversationPlayer: payload.conversationPlayer,
            });
          })
          .filter(Boolean);

        batch.remaining = chatMessages.length;
        for (const chatMessage of chatMessages) {
          chatMessage.kind = "private message log";
          chatMessage.privateLogBatch = batch;
          chatMessage.privateLogMessageIndex = payload.messages.findIndex((message) => {
            return message.id === chatMessage.privatePayload.messageId;
          });
        }

        return chatMessages;
      }

      return [];
    }

    function parseJsonFrame(data, prefix) {
      try {
        return JSON.parse(data.slice(prefix.length));
      } catch (error) {
        setStatus(`private message parse failed: ${error.message}`);
        return null;
      }
    }

    function isOutgoingTranslationEnabled() {
      return window.localStorage?.getItem(config.outgoingEnabledStorageKey) === "1";
    }

    function parsePrivateChatMessage(payload) {
      if (!payload?.conversationPlayer || !payload.messageHtml || payload.messageHtml.includes(TRANSLATED_MARKER)) {
        return null;
      }

      const conversationPlayer = parsePlayerReference(payload.conversationPlayer);
      const fromPlayer = parsePlayerReference(payload.fromPlayer);
      const fromPlayerId = fromPlayer.playerId || String(payload.fromPlayerId ?? "");
      const messageId = payload.messageId ?? payload.id;
      if (!conversationPlayer.playerId || fromPlayerId !== conversationPlayer.playerId || messageId === -1) {
        return null;
      }

      const messageKey = `${conversationPlayer.playerId}:${messageId}:${payload.messageHtml}`;
      if (requestedPrivateMessageIds.has(messageKey)) {
        return null;
      }

      const text = extractPrivateChatText(payload.messageHtml);
      if (!text) {
        return null;
      }

      requestedPrivateMessageIds.add(messageKey);

      return {
        kind: "private message",
        playerId: conversationPlayer.playerId,
        playerName: fromPlayer.playerName || conversationPlayer.playerName,
        html: payload.messageHtml,
        text,
        privatePayload: {
          conversationPlayer: payload.conversationPlayer,
          fromPlayer: payload.fromPlayer || payload.conversationPlayer,
          fromPlayerId,
          messageId,
          timestampSecs: payload.timestampSecs,
        },
      };
    }

    function parsePlayerReference(value) {
      const [playerName = "", playerId = ""] = String(value || "").split(":");
      return { playerName, playerId };
    }

    function extractChatText(html) {
      const template = document.createElement("template");
      template.innerHTML = html;

      const chatTextElement = Array.from(template.content.querySelectorAll("font")).find((element) => {
        return element.getAttribute("color")?.toLowerCase() === "#444444";
      });

      return chatTextElement?.textContent?.trim() ?? "";
    }

    function extractPrivateChatText(html) {
      const template = document.createElement("template");
      template.innerHTML = html;

      const chatTextElement = Array.from(template.content.querySelectorAll("font")).find((element) => {
        return element.getAttribute("color")?.toLowerCase() === "#003366";
      });

      return chatTextElement?.textContent?.trim() ?? "";
    }

    function handleTranslationResponse(event) {
      const detail = event.detail;
      const pendingRequest = pendingRequests.get(detail?.requestId);
      if (!pendingRequest) {
        return;
      }

      pendingRequests.delete(detail.requestId);

      const { socket, chatMessage } = pendingRequest;
      if (chatMessage.privateLogBatch) {
        handlePrivateLogTranslationResponse(socket, chatMessage, detail);
        return;
      }

      if (detail.error) {
        setStatus(`translation failed: ${detail.error}`);
        return;
      }

      if (!shouldShowTranslation(chatMessage.text, detail.translatedText)) {
        setStatus(`translation skipped: ${chatMessage.text}`);
        return;
      }

      const translatedData =
        chatMessage.kind === "private message"
          ? buildTranslatedPrivateChatMessage(chatMessage, detail.translatedText, detail.targetLanguage)
          : buildTranslatedPlayerChatMessage(chatMessage, detail.translatedText, detail.targetLanguage);

      socket.dispatchEvent(new MessageEvent("message", { data: translatedData }));
      state.translationsShown += 1;
      setStatus(`translated ${chatMessage.playerName}: ${detail.translatedText}`);
    }

    function handlePrivateLogTranslationResponse(socket, chatMessage, detail) {
      const batch = chatMessage.privateLogBatch;
      batch.remaining -= 1;

      if (detail.error) {
        setStatus(`translation failed: ${detail.error}`);
      } else if (shouldShowTranslation(chatMessage.text, detail.translatedText)) {
        batch.translatedMessagesByIndex.set(
          chatMessage.privateLogMessageIndex,
          buildTranslatedPrivateLogMessage(chatMessage, detail.translatedText, detail.targetLanguage),
        );
        state.translationsShown += 1;
        setStatus(`translated ${chatMessage.playerName}: ${detail.translatedText}`);
      } else {
        setStatus(`translation skipped: ${chatMessage.text}`);
      }

      if (batch.remaining > 0) {
        return;
      }

      socket.dispatchEvent(new MessageEvent("message", { data: buildTranslatedPrivateLog(batch) }));
    }

    function buildTranslatedPlayerChatMessage(chatMessage, translatedText, targetLanguage) {
      const translatedHtml = [
        `<!-- ${chatMessage.playerId} -->`,
        `<!-- ${TRANSLATED_MARKER} -->`,
        `<font color="#336699">${escapeHtml(chatMessage.playerName)}&gt;</font>`,
        ` <font ${TRANSLATED_MARKER}="1" color="#006B3F">[${targetLanguage}] ${escapeHtml(translatedText)}</font>`,
      ].join("");

      return `pc:${chatMessage.playerId},${chatMessage.playerName},${translatedHtml}`;
    }

    function buildTranslatedPrivateChatMessage(chatMessage, translatedText, targetLanguage) {
      const sourcePayload = chatMessage.privatePayload;
      const sourceMessageId = Number(sourcePayload.messageId);
      const translatedPayload = {
        conversationPlayer: sourcePayload.conversationPlayer,
        fromPlayer: sourcePayload.fromPlayer,
        messageId: Number.isFinite(sourceMessageId) ? -Math.abs(sourceMessageId) : -Date.now(),
        messageHtml: `<font ${TRANSLATED_MARKER}="1" color="#006B3F">[${targetLanguage}] ${escapeHtml(translatedText)}</font>`,
        timestampSecs: sourcePayload.timestampSecs,
      };

      return `privatemsg:${JSON.stringify(translatedPayload)}`;
    }

    function buildTranslatedPrivateLogMessage(chatMessage, translatedText, targetLanguage) {
      const sourcePayload = chatMessage.privatePayload;
      const sourceMessageId = Number(sourcePayload.messageId);

      return {
        id: Number.isFinite(sourceMessageId) ? -Math.abs(sourceMessageId) : -Date.now(),
        fromPlayerId: Number(sourcePayload.playerId || sourcePayload.fromPlayerId || chatMessage.playerId),
        messageHtml: `<font ${TRANSLATED_MARKER}="1" color="#006B3F">[${targetLanguage}] ${escapeHtml(translatedText)}</font>`,
        timestampSecs: sourcePayload.timestampSecs,
      };
    }

    function buildTranslatedPrivateLog(batch) {
      const translatedPayload = {
        ...batch.payload,
        messages: [],
      };

      batch.payload.messages.forEach((message, index) => {
        translatedPayload.messages.push(message);
        const translatedMessage = batch.translatedMessagesByIndex.get(index);
        if (translatedMessage) {
          translatedPayload.messages.push(translatedMessage);
        }
      });

      return `privatemsg_log:${JSON.stringify(translatedPayload)}`;
    }

    function shouldShowTranslation(originalText, translatedText) {
      return normalizeText(originalText) !== normalizeText(translatedText);
    }

    function normalizeText(text) {
      return String(text).trim().toLocaleLowerCase().replace(/\s+/g, " ");
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    document.addEventListener(config.responseEvent, handleTranslationResponse);
    document.addEventListener(config.outgoingResponseEvent, handleOutgoingTranslationResponse);
    install();
  }

  function translateText(text, targetLanguage) {
    const trimmedText = text.trim();
    const cacheKey = `${targetLanguage}:${trimmedText}`;
    const cachedText = translationCache.get(cacheKey);
    if (cachedText) {
      return Promise.resolve(cachedText);
    }

    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", targetLanguage);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", trimmedText);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url.toString(),
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Google Translate returned HTTP ${response.status}`));
            return;
          }

          try {
            const payload = JSON.parse(response.responseText);
            const translatedText = payload?.[0]?.map((part) => part?.[0] ?? "").join("").trim();
            if (!translatedText) {
              reject(new Error("Google Translate returned an empty translation"));
              return;
            }

            translationCache.set(cacheKey, translatedText);
            resolve(translatedText);
          } catch (error) {
            reject(error);
          }
        },
        onerror() {
          reject(new Error("Google Translate request failed"));
        },
      });
    });
  }

  function getTargetLanguage() {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_TARGET_LANGUAGE;
  }

  function getOutgoingTargetLanguage() {
    return localStorage.getItem(OUTGOING_LANGUAGE_STORAGE_KEY) || getTargetLanguage();
  }

  function getOutgoingTranslationEnabled() {
    return localStorage.getItem(OUTGOING_ENABLED_STORAGE_KEY) === "1";
  }

  function getMessageTimestampsEnabled() {
    return localStorage.getItem(MESSAGE_TIMESTAMPS_STORAGE_KEY) === "1";
  }

  function setTargetLanguage(language) {
    const normalizedLanguage = normalizeLanguageCode(language);
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(normalizedLanguage)) {
      alert("Use a language code like en, es, fr, de, ja, ko, zh-CN, or pt.");
      return;
    }

    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
    setStatus(`target language set to ${normalizedLanguage}`);
    renderStatusPanel();
  }

  function setOutgoingTargetLanguage(language) {
    const normalizedLanguage = normalizeLanguageCode(language);
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(normalizedLanguage)) {
      alert("Use a language code like en, es, fr, de, ja, ko, zh-CN, or pt.");
      return;
    }

    localStorage.setItem(OUTGOING_LANGUAGE_STORAGE_KEY, normalizedLanguage);
    setStatus(`outgoing language set to ${normalizedLanguage}`);
    renderStatusPanel();
  }

  function setOutgoingTranslationEnabled(enabled) {
    localStorage.setItem(OUTGOING_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`outgoing translation ${enabled ? "enabled" : "disabled"}`);
    renderStatusPanel();
  }

  function setMessageTimestampsEnabled(enabled) {
    localStorage.setItem(MESSAGE_TIMESTAMPS_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`message timestamps ${enabled ? "enabled" : "disabled"}`);
    renderMessageTimestamps();
    renderStatusPanel();
  }

  function normalizeLanguageCode(language) {
    const trimmedLanguage = language.trim();
    const languageAlias = trimmedLanguage.toLowerCase();
    if (languageAlias === "tagalog" || languageAlias === "filipino") {
      return "tl";
    }

    const [baseLanguage, region] = trimmedLanguage.split("-");
    if (!region) {
      return baseLanguage.toLowerCase();
    }

    return `${baseLanguage.toLowerCase()}-${region.toUpperCase()}`;
  }

  function promptForTargetLanguage() {
    const language = prompt("Target language code:", getTargetLanguage());
    if (language === null) {
      return;
    }

    setTargetLanguage(language);
  }

  function toggleStatusPanel() {
    state.panelVisible = !state.panelVisible;
    renderStatusPanel();
  }

  function installKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) {
        return;
      }

      const key = event.key.toUpperCase();
      if (key === PANEL_TOGGLE_KEY) {
        event.preventDefault();
        toggleStatusPanel();
      }

      if (key === LANGUAGE_PROMPT_KEY) {
        event.preventDefault();
        promptForTargetLanguage();
      }
    });
  }

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

  function installMessageTimestamps() {
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
      if (!isTimestampMessageElement(timestampElement.parentElement)) {
        delete timestampElement.parentElement?.dataset.tjHelperTimestampValue;
        timestampElement.remove();
      }
    }

    for (const messageElement of getTimestampMessageElements()) {
      if (messageElement.querySelector("[data-tj-helper-timestamp]")) {
        continue;
      }

      const timestampElement = document.createElement("span");
      timestampElement.dataset.tjHelperTimestamp = "1";
      timestampElement.textContent = getMessageTimestamp(messageElement);
      timestampElement.style.cssText = [
        "display:inline-block",
        "margin-left:6px",
        "opacity:.68",
        "font:10px/1 Arial,sans-serif",
        "white-space:nowrap",
        "vertical-align:baseline",
      ].join(";");

      messageElement.appendChild(timestampElement);
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
    if (!element || statusPanel?.contains(element)) {
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

    const messageTextElement = element.matches(".MuiTypography-root.MuiTypography-body1")
      ? element
      : element.querySelector(".MuiTypography-root.MuiTypography-body1");
    if (!messageTextElement) {
      return false;
    }

    const isPublicChatMessage = Boolean(element.closest('[aria-label="chat messages"]'));
    const isPrivateMessage = Boolean(element.closest('aside[aria-label="active conversation panel"]'));
    if (!isPublicChatMessage && !isPrivateMessage) {
      return false;
    }

    const messageText = element.textContent?.replace(/\d{1,2}:\d{2}\s*(AM|PM)?/gi, "").trim();
    return Boolean(messageText);
  }

  function getMessageTimestamp(messageElement) {
    if (!messageElement.dataset.tjHelperTimestampValue) {
      messageElement.dataset.tjHelperTimestampValue = formatTimestamp(new Date());
    }

    return messageElement.dataset.tjHelperTimestampValue;
  }

  function formatTimestamp(date) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
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

  function renderStatusPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!state.panelVisible) {
      statusPanel?.remove();
      renderToolbarButtons();
      return;
    }

    if (!statusPanel) {
      statusPanel = document.createElement("div");
      statusPanel.style.cssText = [
        "position:fixed",
        "right:8px",
        "top:48px",
        "z-index:2147483647",
        "width:260px",
        "padding:10px",
        "border:1px solid #2D6F89",
        "border-radius:6px",
        "background:rgba(18,31,39,.96)",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
        "box-shadow:0 4px 16px rgba(0,0,0,.32)",
      ].join(";");
      statusPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <strong style="font-size:13px;">Triplejack Helper</strong>
          <button type="button" data-tj-helper-close style="border:0;background:#294655;color:#fff;border-radius:4px;padding:2px 7px;cursor:pointer;">x</button>
        </div>
        <div style="margin-bottom:10px;border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
          <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Translation</div>
          <label style="display:block;margin-bottom:4px;color:#BFE7F1;">Incoming language</label>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <select data-tj-helper-language style="flex:1;min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
            <input data-tj-helper-custom-language style="width:62px;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
          </div>
          <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#BFE7F1;">
            <input data-tj-helper-outgoing-enabled type="checkbox" style="margin:0;" />
            Translate sent messages
          </label>
          <label style="display:block;margin-bottom:4px;color:#BFE7F1;">Outgoing language</label>
          <div style="display:flex;gap:6px;">
            <select data-tj-helper-outgoing-language style="flex:1;min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
            <input data-tj-helper-custom-outgoing-language style="width:62px;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
          </div>
        </div>
        <div style="margin-bottom:10px;border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
          <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Messages</div>
          <label style="display:flex;align-items:center;gap:6px;color:#BFE7F1;">
            <input data-tj-helper-message-timestamps-enabled type="checkbox" style="margin:0;" />
            Show timestamps
          </label>
        </div>
        <div style="border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
          <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Status</div>
          <div data-tj-helper-stats style="color:#D6EEF5;"></div>
          <div data-tj-helper-status style="margin-top:6px;color:#A7D8AD;"></div>
        </div>
      `;

      const closeButton = statusPanel.querySelector("[data-tj-helper-close]");
      const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
      const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
      const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
      const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
      const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
      const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");

      for (const [value, label] of LANGUAGE_OPTIONS) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        languageSelect.appendChild(option);

        const outgoingOption = document.createElement("option");
        outgoingOption.value = value;
        outgoingOption.textContent = label;
        outgoingLanguageSelect.appendChild(outgoingOption);
      }

      closeButton.addEventListener("click", () => {
        state.panelVisible = false;
        renderStatusPanel();
      });

      languageSelect.addEventListener("change", () => {
        setTargetLanguage(languageSelect.value);
      });

      customLanguageInput.addEventListener("change", () => {
        setTargetLanguage(customLanguageInput.value);
      });

      outgoingEnabledInput.addEventListener("change", () => {
        setOutgoingTranslationEnabled(outgoingEnabledInput.checked);
      });

      outgoingLanguageSelect.addEventListener("change", () => {
        setOutgoingTargetLanguage(outgoingLanguageSelect.value);
      });

      customOutgoingLanguageInput.addEventListener("change", () => {
        setOutgoingTargetLanguage(customOutgoingLanguageInput.value);
      });

      messageTimestampsInput.addEventListener("change", () => {
        setMessageTimestampsEnabled(messageTimestampsInput.checked);
      });
    }

    const targetLanguage = getTargetLanguage();
    const outgoingTargetLanguage = getOutgoingTargetLanguage();
    const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
    const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
    const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
    const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
    const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
    const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");
    const statsElement = statusPanel.querySelector("[data-tj-helper-stats]");
    const statusElement = statusPanel.querySelector("[data-tj-helper-status]");

    if (LANGUAGE_OPTIONS.some(([value]) => value === targetLanguage)) {
      languageSelect.value = targetLanguage;
    }

    if (LANGUAGE_OPTIONS.some(([value]) => value === outgoingTargetLanguage)) {
      outgoingLanguageSelect.value = outgoingTargetLanguage;
    }

    customLanguageInput.value = targetLanguage;
    outgoingEnabledInput.checked = getOutgoingTranslationEnabled();
    customOutgoingLanguageInput.value = outgoingTargetLanguage;
    messageTimestampsInput.checked = getMessageTimestampsEnabled();
    statsElement.textContent = `${state.hooked ? "hooked" : "not hooked"} | sockets ${state.sockets}, messages ${state.chatsSeen}, translations ${state.translationsShown}`;
    statusElement.textContent = state.lastStatus;

    const parent = document.body || document.documentElement;
    if (statusPanel.parentNode !== parent) {
      parent.appendChild(statusPanel);
    }

    renderToolbarButtons();
  }

  function main() {
    GM_registerMenuCommand("Show Triplejack Helper status", () => {
      state.panelVisible = true;
      renderStatusPanel();
      alert(`${SCRIPT_NAME}\n${state.lastStatus}`);
    });
    GM_registerMenuCommand("Set Triplejack target language", promptForTargetLanguage);

    installKeyboardShortcuts();
    installToolbarButton();
    installMessageTimestamps();
    installTranslationBridge();
    injectWebSocketHook();
    setStatus("loaded");
    renderStatusPanel();
  }

  main();
})();
