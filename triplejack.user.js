// ==UserScript==
// @name         Triplejack Helper
// @namespace    https://triplejack.com/
// @version      0.5.7
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

  // Configuration
  const SCRIPT_NAME = "Triplejack Helper";
  const DEFAULT_TARGET_LANGUAGE = "en";
  const LANGUAGE_STORAGE_KEY = "triplejack-helper-target-language";
  const OUTGOING_LANGUAGE_STORAGE_KEY = "triplejack-helper-outgoing-language";
  const OUTGOING_ENABLED_STORAGE_KEY = "triplejack-helper-outgoing-enabled";
  const MESSAGE_TIMESTAMPS_STORAGE_KEY = "triplejack-helper-message-timestamps-enabled";
  const SESSION_SUMMARY_STORAGE_KEY = "triplejack-helper-session-summary-enabled";
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
  const PACKET_INTERCEPT_EVENT = "tj-helper-websocket-packet";
  const SOCKET_MESSAGE_EVENT = "tj-helper-websocket-message";
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
  let sessionSummaryPanel;
  let outsideClickDismissalInstalled = false;
  let timestampObserver;
  let timestampRenderQueued = false;

  // Page message protocol
  function pageMessageProtocolModule() {
    const TRANSLATED_MARKER = "data-tj-translated";
    const requestedPrivateMessageIds = new Set();

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

    function parseTranslatableMessages(data, onParseError) {
      const publicChatMessage = parsePlayerChatMessage(data);
      if (publicChatMessage && !publicChatMessage.html.includes(TRANSLATED_MARKER)) {
        return [publicChatMessage];
      }

      return parsePrivateChatMessages(data, onParseError);
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

    function parsePrivateChatMessages(data, onParseError) {
      if (data.startsWith("privatemsg:")) {
        const payload = parseJsonFrame(data, "privatemsg:", onParseError);
        const chatMessage = parsePrivateChatMessage(payload);
        return chatMessage ? [chatMessage] : [];
      }

      if (data.startsWith("privatemsg_log:")) {
        const payload = parseJsonFrame(data, "privatemsg_log:", onParseError);
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

    function parseJsonFrame(data, prefix, onParseError) {
      try {
        return JSON.parse(data.slice(prefix.length));
      } catch (error) {
        onParseError?.(error);
        return null;
      }
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

    function decodeProtocolText(value) {
      try {
        return decodeURIComponent(String(value).replace(/\+/g, "%20"));
      } catch {
        return String(value);
      }
    }

    return {
      translatedMarker: TRANSLATED_MARKER,
      parseOutgoingMessage,
      parseTranslatableMessages,
    };
  }

  // Page translation renderer
  function pageTranslationRendererModule(translatedMarker) {
    function buildOutgoingMessageData(outgoingMessage, translatedText) {
      if (!translatedText) {
        return outgoingMessage.originalData;
      }

      if (outgoingMessage.kind === "private message") {
        return `${outgoingMessage.privateMessagePrefix}${encodeURIComponent(translatedText)}`;
      }

      return `c:${translatedText}`;
    }

    function buildTranslatedPlayerChatMessage(chatMessage, translatedText, targetLanguage) {
      const translatedHtml = [
        `<!-- ${chatMessage.playerId} -->`,
        `<!-- ${translatedMarker} -->`,
        `<font color="#336699">${escapeHtml(chatMessage.playerName)}&gt;</font>`,
        ` <font ${translatedMarker}="1" color="#006B3F">[${targetLanguage}] ${escapeHtml(translatedText)}</font>`,
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
        messageHtml: `<font ${translatedMarker}="1" color="#006B3F">[${targetLanguage}] ${escapeHtml(translatedText)}</font>`,
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
        messageHtml: `<font ${translatedMarker}="1" color="#006B3F">[${targetLanguage}] ${escapeHtml(translatedText)}</font>`,
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

    return {
      buildOutgoingMessageData,
      buildTranslatedPlayerChatMessage,
      buildTranslatedPrivateChatMessage,
      buildTranslatedPrivateLogMessage,
      buildTranslatedPrivateLog,
      shouldShowTranslation,
    };
  }

  // Page translation controller
  function pageTranslationControllerModule(config, messageProtocol, translationRenderer) {
    const pendingRequests = new Map();
    const pendingOutgoingRequests = new Map();
    const state = {
      chatsSeen: 0,
      translationsShown: 0,
      lastStatus: "starting",
    };

    function install() {
      document.addEventListener(config.socketMessageEvent, handleSocketMessage);
      document.addEventListener(config.responseEvent, handleTranslationResponse);
      document.addEventListener(config.outgoingResponseEvent, handleOutgoingTranslationResponse);
    }

    function setStatus(status) {
      state.lastStatus = status;
      document.dispatchEvent(new CustomEvent(config.statusEvent, { detail: { ...state } }));
    }

    function handleSocketMessage(event) {
      const detail = event.detail;
      if (!detail || typeof detail.data !== "string") {
        return;
      }

      if (detail.direction === "incoming") {
        handleIncomingMessage(detail.data, detail.socket, detail.socketId);
        return;
      }

      if (detail.direction === "outgoing" && handleOutgoingMessage(detail.data, detail.nativeSend, detail.socketId)) {
        event.preventDefault();
      }
    }

    function handleIncomingMessage(data, socket, socketId) {
      const chatMessages = messageProtocol.parseTranslatableMessages(data, (error) => {
        setStatus(`private message parse failed: ${error.message}`);
      });
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

    function handleOutgoingMessage(data, nativeSend, socketId) {
      if (!isOutgoingTranslationEnabled() || typeof nativeSend !== "function") {
        return false;
      }

      const outgoingMessage = messageProtocol.parseOutgoingMessage(data);
      if (!outgoingMessage) {
        return false;
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

      return true;
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
        translationRenderer.buildOutgoingMessageData(outgoingMessage, detail.translatedText);
      nativeSend(translatedData);
      setStatus(`sent ${outgoingMessage.kind}: ${detail.translatedText || outgoingMessage.text}`);
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

      if (!translationRenderer.shouldShowTranslation(chatMessage.text, detail.translatedText)) {
        setStatus(`translation skipped: ${chatMessage.text}`);
        return;
      }

      const translatedData =
        chatMessage.kind === "private message"
          ? translationRenderer.buildTranslatedPrivateChatMessage(chatMessage, detail.translatedText, detail.targetLanguage)
          : translationRenderer.buildTranslatedPlayerChatMessage(chatMessage, detail.translatedText, detail.targetLanguage);

      socket.dispatchEvent(new MessageEvent("message", { data: translatedData }));
      state.translationsShown += 1;
      setStatus(`translated ${chatMessage.playerName}: ${detail.translatedText}`);
    }

    function handlePrivateLogTranslationResponse(socket, chatMessage, detail) {
      const batch = chatMessage.privateLogBatch;
      batch.remaining -= 1;

      if (detail.error) {
        setStatus(`translation failed: ${detail.error}`);
      } else if (translationRenderer.shouldShowTranslation(chatMessage.text, detail.translatedText)) {
        batch.translatedMessagesByIndex.set(
          chatMessage.privateLogMessageIndex,
          translationRenderer.buildTranslatedPrivateLogMessage(chatMessage, detail.translatedText, detail.targetLanguage),
        );
        state.translationsShown += 1;
        setStatus(`translated ${chatMessage.playerName}: ${detail.translatedText}`);
      } else {
        setStatus(`translation skipped: ${chatMessage.text}`);
      }

      if (batch.remaining > 0) {
        return;
      }

      socket.dispatchEvent(new MessageEvent("message", { data: translationRenderer.buildTranslatedPrivateLog(batch) }));
    }

    function isOutgoingTranslationEnabled() {
      return window.localStorage?.getItem(config.outgoingEnabledStorageKey) === "1";
    }

    return {
      install,
    };
  }

  // Page WebSocket hook
  function pageWebSocketHook(config) {
    const NativeWebSocket = window.WebSocket;
    const redispatchedIncomingEvents = new WeakSet();
    const state = {
      hooked: false,
      sockets: 0,
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
            handleNativeIncomingWebSocketMessage(event, socket, socketId, String(url || ""));
          });

          const nativeSend = socket.send.bind(socket);
          socket.send = (data) => {
            const interceptedPacket = interceptWebSocketPacket({
              direction: "outgoing",
              socketId,
              url: String(url || ""),
              data,
            });
            if (interceptedPacket.canceled) {
              setStatus(`outgoing ${interceptedPacket.command || "packet"} canceled`);
              return undefined;
            }

            const socketEvent = dispatchSocketMessageEvent({
              direction: "outgoing",
              socketId,
              url: String(url || ""),
              data: interceptedPacket.data,
              socket,
              nativeSend,
            });

            return socketEvent.defaultPrevented ? undefined : nativeSend(interceptedPacket.data);
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

    function handleNativeIncomingWebSocketMessage(event, socket, socketId, url) {
      if (redispatchedIncomingEvents.has(event)) {
        return;
      }

      const interceptedPacket = interceptWebSocketPacket({
        direction: "incoming",
        socketId,
        url,
        data: event.data,
      });
      if (interceptedPacket.canceled) {
        event.stopImmediatePropagation();
        setStatus(`incoming ${interceptedPacket.command || "packet"} canceled`);
        return;
      }

      if (interceptedPacket.data !== event.data) {
        event.stopImmediatePropagation();
        const replacementEvent = cloneMessageEvent(event, interceptedPacket.data);
        redispatchedIncomingEvents.add(replacementEvent);
        socket.dispatchEvent(replacementEvent);
      }

      dispatchSocketMessageEvent({
        direction: "incoming",
        socketId,
        url,
        data: interceptedPacket.data,
        socket,
      });
    }

    function interceptWebSocketPacket(packet) {
      const originalData = packet.data;
      const detail = {
        direction: packet.direction,
        socketId: packet.socketId,
        url: packet.url,
        originalData,
        data: packet.data,
        command: getPacketCommand(packet.data),
        modified: false,
      };

      const interceptEvent = new CustomEvent(config.packetInterceptEvent, {
        cancelable: true,
        detail,
      });
      document.dispatchEvent(interceptEvent);

      detail.modified = detail.data !== originalData;
      return {
        ...detail,
        canceled: interceptEvent.defaultPrevented,
      };
    }

    function dispatchSocketMessageEvent(detail) {
      const socketEvent = new CustomEvent(config.socketMessageEvent, {
        cancelable: detail.direction === "outgoing",
        detail: {
          ...detail,
          command: getPacketCommand(detail.data),
        },
      });
      document.dispatchEvent(socketEvent);
      return socketEvent;
    }

    function getPacketCommand(data) {
      if (typeof data !== "string") {
        return "";
      }

      const colonIndex = data.indexOf(":");
      if (colonIndex === -1) {
        return data.slice(0, 40);
      }

      return data.slice(0, colonIndex);
    }

    function cloneMessageEvent(event, data) {
      return new MessageEvent("message", {
        data,
        origin: event.origin,
        lastEventId: event.lastEventId,
        source: event.source,
        ports: event.ports,
      });
    }

    install();
  }

  // Userscript bridge
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
    script.textContent = `(() => {
      const messageProtocol = (${pageMessageProtocolModule.toString()})();
      const translationRenderer = (${pageTranslationRendererModule.toString()})(messageProtocol.translatedMarker);
      const translationController = (${pageTranslationControllerModule.toString()})(
        ${JSON.stringify({
      requestEvent: REQUEST_EVENT,
      responseEvent: RESPONSE_EVENT,
      outgoingRequestEvent: OUTGOING_REQUEST_EVENT,
      outgoingResponseEvent: OUTGOING_RESPONSE_EVENT,
      outgoingEnabledStorageKey: OUTGOING_ENABLED_STORAGE_KEY,
      socketMessageEvent: SOCKET_MESSAGE_EVENT,
      statusEvent: STATUS_EVENT,
    })},
        messageProtocol,
        translationRenderer,
      );
      translationController.install();
      (${pageWebSocketHook.toString()})(${JSON.stringify({
      scriptName: SCRIPT_NAME,
      packetInterceptEvent: PACKET_INTERCEPT_EVENT,
      socketMessageEvent: SOCKET_MESSAGE_EVENT,
      statusEvent: STATUS_EVENT,
    })});
    })();`;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
    setStatus("page-context WebSocket hook injected");
  }

  // Translation service
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

  // Settings
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

  function getSessionSummaryEnabled() {
    return localStorage.getItem(SESSION_SUMMARY_STORAGE_KEY) !== "0";
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

  function setSessionSummaryEnabled(enabled) {
    localStorage.setItem(SESSION_SUMMARY_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`session summary ${enabled ? "enabled" : "disabled"}`);
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

  function installOutsideClickDismissal() {
    if (outsideClickDismissalInstalled) {
      return;
    }

    outsideClickDismissalInstalled = true;
    document.addEventListener("click", (event) => {
      const target = event.target;

      if (sessionSummaryPanel && !sessionSummaryPanel.contains(target)) {
        sessionSummaryPanel.remove();
        sessionSummaryPanel = null;
      }

      if (!state.panelVisible || !statusPanel || statusPanel.contains(target)) {
        return;
      }

      if (target?.closest?.("[data-tj-helper-toolbar-button]")) {
        return;
      }

      state.panelVisible = false;
      renderStatusPanel();
    });
  }

  // Toolbar
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

  // Message timestamps
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

  // Session tracker
  const sessionTracker = {
    active: false,
    selfPlayerId: "",
    selfPlayerName: "",
    selfSeat: null,
    roomName: "",
    roomId: "",
    smallBlind: null,
    bigBlind: null,
    startStack: null,
    endStack: null,
    finalStackSeen: false,
    startedAt: 0,
    lastUpdateAt: 0,
  };

  function installSessionTracker() {
    document.addEventListener(SOCKET_MESSAGE_EVENT, handleSessionSocketMessage);
  }

  function handleSessionSocketMessage(event) {
    const detail = event.detail;
    if (detail?.direction !== "incoming" || typeof detail.data !== "string") {
      return;
    }

    const command = detail.command || getSessionPacketCommand(detail.data);
    if (command === "#(init_game)") {
      startSessionFromInitGame(detail.data);
      return;
    }

    if (!sessionTracker.active) {
      return;
    }

    if (isLobbyReturnPacket(command)) {
      finishSession();
      return;
    }

    if (command === "update_players") {
      updateSessionFromPlayers(detail.data);
      return;
    }

    if (command === "update_chip_stacks") {
      updateSessionFromChipStacks(detail.data);
      return;
    }

    if (command === "last_chip_stack") {
      updateSessionStack(toNumberOrNull(detail.data.slice("last_chip_stack:".length)), null, { final: true });
      return;
    }

    if (detail.data.includes("/bet:")) {
      updateSessionFromBet(detail.data);
      return;
    }

    if (command === "win") {
      updateSessionFromWin(detail.data);
      return;
    }

    if (command === "h") {
      updateSessionFromHand(detail.data);
      return;
    }

    if (command === "poker_room_info") {
      updateSessionFromRoomInfo(detail.data);
    }
  }

  function startSessionFromInitGame(data) {
    const selfPayload = getCompoundSubframe(data, "self_data");
    const gamePayload = getCompoundSubframe(data, "init_game_data");
    if (!selfPayload || !gamePayload) {
      return;
    }

    resetSessionTracker();

    const selfFields = splitProtocolFields(stripOuterBraces(selfPayload));
    const gameFields = splitProtocolFields(gamePayload);
    const playerRows = splitProtocolFields(stripOuterBraces(gameFields[7] || ""));
    const selfPlayerId = selfFields[1] || "";
    const selfRow = playerRows.map(parseInitGamePlayerRow).find((row) => row.playerId === selfPlayerId);

    sessionTracker.active = true;
    sessionTracker.selfPlayerId = selfPlayerId;
    sessionTracker.selfPlayerName = decodeSessionProtocolText(selfFields[2] || "");
    sessionTracker.startedAt = Date.now();
    sessionTracker.lastUpdateAt = sessionTracker.startedAt;
    sessionTracker.smallBlind = toNumberOrNull(gameFields[4]);
    sessionTracker.bigBlind = toNumberOrNull(gameFields[5]);

    if (selfRow) {
      sessionTracker.selfSeat = selfRow.seat;
      sessionTracker.startStack = selfRow.seat === null || selfRow.seat < 0 ? null : selfRow.stack;
      sessionTracker.endStack = sessionTracker.startStack;
    }

    const roomNameIndex = playerRows.length ? 10 : -1;
    if (roomNameIndex >= 0 && gameFields[roomNameIndex]) {
      sessionTracker.roomName = decodeSessionProtocolText(gameFields[roomNameIndex]);
    }

    const roomIdIndex = roomNameIndex + 1;
    if (roomIdIndex >= 0 && gameFields[roomIdIndex]) {
      sessionTracker.roomId = gameFields[roomIdIndex];
    }
  }

  function resetSessionTracker() {
    Object.assign(sessionTracker, {
      active: false,
      selfPlayerId: "",
      selfPlayerName: "",
      selfSeat: null,
      roomName: "",
      roomId: "",
      smallBlind: null,
      bigBlind: null,
      startStack: null,
      endStack: null,
      finalStackSeen: false,
      startedAt: 0,
      lastUpdateAt: 0,
    });
  }

  function parseInitGamePlayerRow(rowText) {
    const fields = splitProtocolFields(stripOuterBraces(rowText));
    return {
      playerId: fields[2] || "",
      playerName: decodeSessionProtocolText(fields[3] || ""),
      stack: toNumberOrNull(fields[4]),
      bankChips: toNumberOrNull(fields[5]),
      seat: toNumberOrNull(fields[8]),
    };
  }

  function updateSessionFromPlayers(data) {
    const rows = getProtocolTupleRows(data.slice("update_players:".length));
    for (const rowText of rows) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      if (fields[0] !== sessionTracker.selfPlayerId) {
        continue;
      }

      updateSessionStack(toNumberOrNull(fields[1]));
      return;
    }
  }

  function updateSessionFromChipStacks(data) {
    if (sessionTracker.selfSeat === null || sessionTracker.selfSeat < 0) {
      return;
    }

    const rows = getProtocolTupleRows(data.slice("update_chip_stacks:".length));
    for (const rowText of rows) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      if (toNumberOrNull(fields[0]) !== sessionTracker.selfSeat) {
        continue;
      }

      updateSessionStack(toNumberOrNull(fields[1]));
      return;
    }
  }

  function updateSessionFromBet(data) {
    const betPayload = getCompoundSubframe(data, "bet");
    if (!betPayload) {
      return;
    }

    const fields = splitProtocolFields(betPayload);
    const stackRows = getProtocolTupleRows(fields[14] || "");
    for (const rowText of stackRows) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      if (fields[0] !== sessionTracker.selfPlayerId) {
        continue;
      }

      updateSessionStack(toNumberOrNull(fields[1]), toNumberOrNull(fields[2]));
      return;
    }
  }

  function updateSessionFromWin(data) {
    const fields = splitProtocolFields(stripOuterBraces(data.slice("win:".length)));
    const winBlocks = getProtocolTupleRows(fields[0] || "");
    const firstWinBlock = splitProtocolFields(stripOuterBraces(winBlocks[0] || ""));
    const playerRows = getProtocolTupleRows(firstWinBlock[5] || "");

    for (const rowText of playerRows) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      if (fields[0] !== sessionTracker.selfPlayerId) {
        continue;
      }

      updateSessionStack(toNumberOrNull(fields[4]));
      return;
    }
  }

  function updateSessionStack(stack, committedAmount = null, options = {}) {
    if (stack === null) {
      return;
    }

    if (sessionTracker.finalStackSeen && !options.final) {
      return;
    }

    if ((sessionTracker.startStack === null || sessionTracker.startStack <= 0) && stack > 0) {
      sessionTracker.startStack = stack + Math.max(committedAmount || 0, 0);
    }

    sessionTracker.endStack = stack;
    sessionTracker.finalStackSeen = Boolean(options.final);
    sessionTracker.lastUpdateAt = Date.now();
  }

  function updateSessionFromHand(data) {
    const fields = splitProtocolFields(data.slice(2));
    const smallBlind = toNumberOrNull(fields[2]);
    const bigBlind = toNumberOrNull(fields[3]);
    if (smallBlind !== null) {
      sessionTracker.smallBlind = smallBlind;
    }
    if (bigBlind !== null) {
      sessionTracker.bigBlind = bigBlind;
    }
  }

  function updateSessionFromRoomInfo(data) {
    try {
      const roomInfo = JSON.parse(data.slice("poker_room_info:".length));
      sessionTracker.roomName = roomInfo.roomName || sessionTracker.roomName;
      const blindsField = roomInfo.infoFields?.find(([label]) => label === "Blinds");
      if (blindsField) {
        const blindMatch = String(blindsField[1]).match(/\$?([\d,]+)\s*\/\s*\$?([\d,]+)/);
        if (blindMatch) {
          sessionTracker.smallBlind = Number(blindMatch[1].replace(/,/g, ""));
          sessionTracker.bigBlind = Number(blindMatch[2].replace(/,/g, ""));
        }
      }
    } catch {
      // Room info is optional; tuple-derived blinds still work without it.
    }
  }

  function finishSession() {
    if (!sessionTracker.active) {
      return;
    }

    const summary = buildSessionSummary();
    resetSessionTracker();

    if (summary && getSessionSummaryEnabled()) {
      renderSessionSummary(summary);
    }
  }

  function buildSessionSummary() {
    if (sessionTracker.startStack === null || sessionTracker.endStack === null) {
      return null;
    }

    const endedAt = sessionTracker.lastUpdateAt || Date.now();
    const durationMs = Math.max(endedAt - sessionTracker.startedAt, 1000);
    const chipDelta = sessionTracker.endStack - sessionTracker.startStack;
    const bigBlind = sessionTracker.bigBlind || 0;
    const bigBlindDelta = bigBlind > 0 ? chipDelta / bigBlind : null;
    const bigBlindsPerHour = bigBlindDelta === null ? null : bigBlindDelta / (durationMs / 3600000);

    return {
      roomName: sessionTracker.roomName,
      smallBlind: sessionTracker.smallBlind,
      bigBlind,
      startStack: sessionTracker.startStack,
      endStack: sessionTracker.endStack,
      chipDelta,
      bigBlindDelta,
      bigBlindsPerHour,
      durationMs,
    };
  }

  function renderSessionSummary(summary) {
    sessionSummaryPanel?.remove();

    const targetRect = getPlayAreaRect();
    sessionSummaryPanel = document.createElement("div");
    sessionSummaryPanel.style.cssText = [
      "position:fixed",
      `left:${targetRect.left + targetRect.width / 2}px`,
      `top:${targetRect.top + targetRect.height / 2}px`,
      "z-index:2147483646",
      "transform:translate(-50%,-50%)",
      "width:min(340px,calc(100vw - 32px))",
      "padding:14px",
      "border:1px solid rgba(137,198,215,.9)",
      "border-radius:8px",
      "background:rgba(18,31,39,.96)",
      "color:#F5FAFC",
      "font:13px/1.35 Arial,sans-serif",
      "box-shadow:0 10px 30px rgba(0,0,0,.45)",
    ].join(";");
    sessionSummaryPanel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <strong style="font-size:15px;">Session Summary</strong>
        <button type="button" data-tj-helper-session-summary-close style="border:0;background:#294655;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;">x</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:6px 12px;">
        ${summary.roomName ? `<span style="color:#BFE7F1;">Room</span><span>${escapeSessionHtml(summary.roomName)}</span>` : ""}
        <span style="color:#BFE7F1;">Length</span><span>${formatDuration(summary.durationMs)}</span>
        <span style="color:#BFE7F1;">Blinds</span><span>${formatBlindLevel(summary.smallBlind, summary.bigBlind)}</span>
        <span style="color:#BFE7F1;">Started</span><span>${formatChipCount(summary.startStack)}</span>
        <span style="color:#BFE7F1;">Ended</span><span>${formatChipCount(summary.endStack)}</span>
        <span style="color:#BFE7F1;">Net chips</span><strong style="color:${summary.chipDelta >= 0 ? "#A7D8AD" : "#FFB0A8"};">${formatSignedNumber(summary.chipDelta)}</strong>
        <span style="color:#BFE7F1;">Net BB</span><strong style="color:${summary.chipDelta >= 0 ? "#A7D8AD" : "#FFB0A8"};">${formatNullableSigned(summary.bigBlindDelta)}</strong>
        <span style="color:#BFE7F1;">BB/hour</span><strong style="color:${summary.chipDelta >= 0 ? "#A7D8AD" : "#FFB0A8"};">${formatNullableSigned(summary.bigBlindsPerHour)}</strong>
      </div>
    `;

    sessionSummaryPanel.querySelector("[data-tj-helper-session-summary-close]").addEventListener("click", () => {
      sessionSummaryPanel?.remove();
      sessionSummaryPanel = null;
    });

    (document.body || document.documentElement).appendChild(sessionSummaryPanel);
  }

  function getPlayAreaRect() {
    const playArea =
      document.querySelector('[data-testid="poker-stage-container"]') ||
      document.querySelector('[data-testid="poker-scene"]') ||
      document.querySelector("canvas");
    const rect = playArea?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return rect;
    }

    return {
      left: 0,
      top: 0,
      width: window.innerWidth || document.documentElement.clientWidth || 800,
      height: window.innerHeight || document.documentElement.clientHeight || 600,
    };
  }

  function isLobbyReturnPacket(command) {
    return command === "gamesdone";
  }

  function getSessionPacketCommand(data) {
    const colonIndex = data.indexOf(":");
    return colonIndex === -1 ? data : data.slice(0, colonIndex);
  }

  function getCompoundSubframe(data, name) {
    const markerPattern = new RegExp(`(?:^|/)\\d+/${name}:`, "g");
    const markerMatch = markerPattern.exec(data);
    if (!markerMatch) {
      return "";
    }

    const start = markerPattern.lastIndex;
    const nextPattern = /\/\d+\/[a-zA-Z_]+:/g;
    nextPattern.lastIndex = start;
    const nextMatch = nextPattern.exec(data);
    return data.slice(start, nextMatch ? nextMatch.index : undefined);
  }

  function getProtocolTupleRows(value) {
    return splitProtocolFields(stripOuterBraces(value)).filter(Boolean);
  }

  function splitProtocolFields(value) {
    const fields = [];
    let depth = 0;
    let start = 0;
    const text = String(value || "");

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth = Math.max(0, depth - 1);
      } else if (char === "," && depth === 0) {
        fields.push(text.slice(start, index));
        start = index + 1;
      }
    }

    fields.push(text.slice(start));
    return fields;
  }

  function stripOuterBraces(value) {
    const text = String(value || "").trim();
    if (text.startsWith("{") && text.endsWith("}")) {
      return text.slice(1, -1);
    }

    return text;
  }

  function toNumberOrNull(value) {
    if (value === "" || value === undefined || value === null) {
      return null;
    }

    const number = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function decodeSessionProtocolText(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, "%20"));
    } catch {
      return String(value || "");
    }
  }

  function escapeSessionHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatChipCount(value) {
    return value === null ? "n/a" : Math.round(value).toLocaleString();
  }

  function formatSignedNumber(value) {
    const roundedValue = Math.round(value);
    return `${roundedValue >= 0 ? "+" : ""}${roundedValue.toLocaleString()}`;
  }

  function formatNullableSigned(value) {
    if (value === null || !Number.isFinite(value)) {
      return "n/a";
    }

    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  }

  function formatBlindLevel(smallBlind, bigBlind) {
    if (!smallBlind || !bigBlind) {
      return "n/a";
    }

    return `${formatChipCount(smallBlind)} / ${formatChipCount(bigBlind)}`;
  }

  function formatDuration(durationMs) {
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) {
      return `${minutes}m ${seconds}s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  // Settings panel
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
        "width:min(380px,calc(100vw - 16px))",
        "max-height:calc(100vh - 64px)",
        "overflow:auto",
        "padding:12px",
        "border:1px solid #2D6F89",
        "border-radius:6px",
        "background:rgba(18,31,39,.96)",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
        "box-shadow:0 4px 16px rgba(0,0,0,.32)",
      ].join(";");
      statusPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <strong style="font-size:13px;">Triplejack Helper</strong>
          <button type="button" data-tj-helper-close style="border:0;background:#294655;color:#fff;border-radius:4px;padding:2px 7px;cursor:pointer;">x</button>
        </div>
        <div style="display:grid;gap:10px;">
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Translation</div>
            <div style="display:grid;grid-template-columns:94px minmax(0,1fr) 72px;gap:6px;align-items:center;margin-bottom:8px;">
              <label style="color:#BFE7F1;">Incoming</label>
              <select data-tj-helper-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
              <input data-tj-helper-custom-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
            </div>
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#BFE7F1;">
              <input data-tj-helper-outgoing-enabled type="checkbox" style="margin:0;" />
              Translate sent messages
            </label>
            <div style="display:grid;grid-template-columns:94px minmax(0,1fr) 72px;gap:6px;align-items:center;">
              <label style="color:#BFE7F1;">Outgoing</label>
              <select data-tj-helper-outgoing-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;"></select>
              <input data-tj-helper-custom-outgoing-language style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
            </div>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Messages</div>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Message timestamps</span>
              <input data-tj-helper-message-timestamps-enabled type="checkbox" style="margin:0;" />
            </label>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Session Tracking</div>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Summary on leave</span>
              <input data-tj-helper-session-summary-enabled type="checkbox" style="margin:0;" />
            </label>
          </section>
          <div style="border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
            <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Status</div>
            <div data-tj-helper-stats style="color:#D6EEF5;"></div>
            <div data-tj-helper-status style="margin-top:6px;color:#A7D8AD;"></div>
          </div>
        </div>
      `;

      const closeButton = statusPanel.querySelector("[data-tj-helper-close]");
      const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
      const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
      const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
      const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
      const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
      const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");
      const sessionSummaryInput = statusPanel.querySelector("[data-tj-helper-session-summary-enabled]");

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

      sessionSummaryInput.addEventListener("change", () => {
        setSessionSummaryEnabled(sessionSummaryInput.checked);
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
    const sessionSummaryInput = statusPanel.querySelector("[data-tj-helper-session-summary-enabled]");
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
    sessionSummaryInput.checked = getSessionSummaryEnabled();
    statsElement.textContent = `${state.hooked ? "hooked" : "not hooked"} | sockets ${state.sockets}, messages ${state.chatsSeen}, translations ${state.translationsShown}`;
    statusElement.textContent = state.lastStatus;

    const parent = document.body || document.documentElement;
    if (statusPanel.parentNode !== parent) {
      parent.appendChild(statusPanel);
    }

    renderToolbarButtons();
  }

  // Startup
  function main() {
    GM_registerMenuCommand("Show Triplejack Helper status", () => {
      state.panelVisible = true;
      renderStatusPanel();
      alert(`${SCRIPT_NAME}\n${state.lastStatus}`);
    });
    GM_registerMenuCommand("Set Triplejack target language", promptForTargetLanguage);

    installKeyboardShortcuts();
    installOutsideClickDismissal();
    installToolbarButton();
    installMessageTimestamps();
    installSessionTracker();
    installTranslationBridge();
    injectWebSocketHook();
    setStatus("loaded");
    renderStatusPanel();
  }

  main();

})();
