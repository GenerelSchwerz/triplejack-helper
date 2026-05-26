// ==UserScript==
// @name         Triplejack Helper
// @namespace    https://triplejack.com/
// @version      0.8.35
// @description  Adds Triplejack chat translation, message tools, and session tracking helpers.
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
// @require      https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js
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
  const SESSION_HISTORY_STORAGE_KEY = "triplejack-helper-session-history";
  const QUICK_BOMB_ENABLED_STORAGE_KEY = "triplejack-helper-quick-bomb-enabled";
  const QUICK_BOMB_RATE_STORAGE_KEY = "triplejack-helper-quick-bomb-rate";
  const QUICK_BOMB_SPEED_MODE_STORAGE_KEY = "triplejack-helper-quick-bomb-speed-mode";
  const QUICK_BOMB_MODE_STORAGE_KEY = "triplejack-helper-quick-bomb-mode";
  const QUICK_BOMB_DURATION_STORAGE_KEY = "triplejack-helper-quick-bomb-duration";
  const QUICK_BOMB_AMMO_STORAGE_KEY = "triplejack-helper-quick-bomb-ammo";
  const QUICK_BOMB_ITEM_SORT_STORAGE_KEY = "triplejack-helper-quick-bomb-item-sort";
  const HELPER_PANEL_WIDTH_STORAGE_KEY = "triplejack-helper-panel-width";
  const HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY = "triplejack-helper-panel-width-enabled";
  const PANEL_TOGGLE_KEY = "L";
  const LANGUAGE_PROMPT_KEY = "Y";
  const QUICK_BOMB_KEY = "B";
  const QUICK_BOMB_CONTROL_EVENT = "tj-helper-quick-bomb-control";
  const QUICK_BOMB_DEFAULT_RATE = 8;
  const QUICK_BOMB_DEFAULT_DURATION_SECONDS = 3;
  const QUICK_BOMB_DEFAULT_AMMO = 20;
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
  const HELPER_PANEL_WIDTH = 390;
  const HELPER_PANEL_MIN_WIDTH = 300;
  const HELPER_PANEL_MAX_WIDTH = 720;
  const PANEL_DEBUG_LOG_PREFIX = "[Triplejack Helper panels]";
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const translationCache = new Map();
  const state = {
    hooked: false,
    sockets: 0,
    chatsSeen: 0,
    translationsShown: 0,
    lastStatus: "starting",
    activePanelId: "",
    quickBombLastItem: "",
    quickBombSelectedItem: "",
    quickBombItems: [],
    quickBombAmmoCost: 1,
    quickBombInRoom: false,
    quickBombPlayers: [],
    quickBombSelectedPlayerId: "",
    quickBombReplayCount: 0,
    quickBombActive: false,
    quickBombRemaining: 0,
  };
  let statusPanel;
  let sessionSummaryPanel;
  let sessionHistoryPanel;
  let quickBombPanel;
  let helperPanelHost;
  let timestampObserver;
  let timestampRenderQueued = false;
  const privateMessageTimestampsByText = new Map();

  function logPanelDebug(action, details = {}) {
    console.debug(PANEL_DEBUG_LOG_PREFIX, action, details);
  }

  // Translation protocol
  function translationProtocolModule() {
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

  // Translation renderer
  function translationRendererModule(translatedMarker) {
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

  // Translation controller
  function translationControllerModule(config, messageProtocol, translationRenderer) {
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

  // Quick bomb controller
  function quickBombControllerModule(config) {
    const state = {
      lastItemKey: "",
      selectedItemKey: "",
      lastBombCountOrFlag: "1",
      nativeSend: null,
      socketId: "",
      ammoCostByItemKey: new Map(),
      itemDefinitionByKey: new Map(),
      playerNameById: new Map(),
      inRoom: false,
      selfPlayerId: "",
      players: [],
      selectedTarget: null,
      replayCount: 0,
      lastReplayAt: 0,
      active: false,
      runSent: 0,
      targetSends: 0,
      timerId: 0,
    };

    function install() {
      document.addEventListener(config.socketMessageEvent, handleSocketMessage);
      document.addEventListener(config.controlEvent, handleControl);
      document.addEventListener("keydown", handleKeyDown, true);
    }

    function handleSocketMessage(event) {
      const detail = event.detail;
      if (!detail || typeof detail.data !== "string") {
        return;
      }

      if (detail.direction === "incoming") {
        updateAmmoCosts(detail.data);
        updateIncomingBombTemplate(detail.data);
        return;
      }

      if (detail.direction !== "outgoing") {
        return;
      }

      if (typeof detail.nativeSend === "function") {
        state.nativeSend = detail.nativeSend;
        state.socketId = detail.socketId || state.socketId;
      }

      const itemKey = getBombItemKey(detail.data);
      if (!itemKey || typeof detail.nativeSend !== "function") {
        return;
      }

      state.lastItemKey = itemKey;
      state.lastBombCountOrFlag = getBombCountOrFlag(detail.data) || state.lastBombCountOrFlag;
      state.nativeSend = detail.nativeSend;
      state.socketId = detail.socketId || "";
      setStatus(`quick bomb saved ${itemKey}`);
    }

    function updateIncomingBombTemplate(data) {
      if (!data.startsWith("newbomb:")) {
        return;
      }

      const itemKey = getBombItemKey(data);
      if (!itemKey) {
        return;
      }

      state.lastItemKey = itemKey;
      setStatus(`quick bomb saw ${itemKey} animation`);
    }

    function handleKeyDown(event) {
      if (!isQuickBombHotkey(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      toggleSpam();
    }

    function handleControl(event) {
      const action = event.detail?.action;
      if (action === "start") {
        startSpam();
        return;
      }

      if (action === "stop") {
        stopSpam("quick bomb stopped");
        return;
      }

      if (action === "toggle") {
        toggleSpam();
        return;
      }

      if (action === "selectTarget") {
        selectTarget(event.detail);
        return;
      }

      if (action === "selectItem") {
        selectItem(event.detail);
      }
    }

    function toggleSpam() {
      if (state.active) {
        stopSpam("quick bomb stopped");
        return;
      }

      startSpam();
    }

    function startSpam() {
      if (!isQuickBombEnabled()) {
        setStatus("quick bomb disabled");
        return;
      }

      if (!getSelectedItemKey() || typeof state.nativeSend !== "function") {
        setStatus("quick bomb needs an item and websocket sender");
        return;
      }

      if (!state.inRoom || !state.selectedTarget) {
        setStatus("quick bomb needs a room target");
        return;
      }

      if (!state.selectedTarget.playerName) {
        setStatus("quick bomb target needs player name");
        return;
      }

      stopTimer();
      state.active = true;
      state.runSent = 0;
      state.targetSends = getTargetSends();
      setStatus(`quick bomb started ${getSelectedItemKey()} x${state.targetSends}`);
      if (getSpeedMode() === "instant") {
        sendInstantBombs();
        return;
      }

      sendNextBomb();
    }

    function sendInstantBombs() {
      while (state.active && state.runSent < state.targetSends) {
        state.nativeSend(buildTargetedBombPacket());
        state.runSent += 1;
        state.replayCount += 1;
        state.lastReplayAt = Date.now();
      }

      stopSpam(`quick bomb finished ${state.runSent}`);
    }

    function sendNextBomb() {
      if (!state.active) {
        return;
      }

      if (!isQuickBombEnabled()) {
        stopSpam("quick bomb disabled");
        return;
      }

      if (!getSelectedItemKey() || typeof state.nativeSend !== "function") {
        stopSpam("quick bomb lost socket");
        return;
      }

      if (!state.inRoom || !state.selectedTarget) {
        stopSpam("quick bomb needs a room target");
        return;
      }

      if (!state.selectedTarget.playerName) {
        stopSpam("quick bomb target needs player name");
        return;
      }

      if (state.runSent >= state.targetSends) {
        stopSpam(`quick bomb finished ${state.runSent}`);
        return;
      }

      state.nativeSend(buildTargetedBombPacket());
      state.runSent += 1;
      state.replayCount += 1;
      state.lastReplayAt = Date.now();
      setStatus(`quick bomb threw ${getSelectedItemKey()}`);

      if (state.runSent >= state.targetSends) {
        stopSpam(`quick bomb finished ${state.runSent}`);
        return;
      }

      state.timerId = window.setTimeout(sendNextBomb, getIntervalMs());
    }

    function stopSpam(status) {
      stopTimer();
      state.active = false;
      setStatus(status);
    }

    function stopTimer() {
      if (!state.timerId) {
        return;
      }

      window.clearTimeout(state.timerId);
      state.timerId = 0;
    }

    function getTargetSends() {
      if (getMode() === "ammo") {
        return getAmmoTargetSends();
      }

      return Math.max(1, getRate() * getDurationSeconds());
    }

    function getAmmoTargetSends() {
      return Math.floor(getAmmo() / getAmmoCost(getSelectedItemKey()));
    }

    function getAmmoCost(itemKey) {
      return state.ammoCostByItemKey.get(normalizeItemKey(itemKey)) || 1;
    }

    function buildTargetedBombPacket() {
      return `bomb:${getSelectedItemKey()},${encodeBombTargetName(state.selectedTarget.playerName)},${state.lastBombCountOrFlag || "1"}`;
    }

    function updateAmmoCosts(data) {
      updateKnownPlayerNames(data);
      updateRoomState(data);

      if (data.startsWith("inventory_defs:")) {
        updateAmmoCostsFromInventoryDefs(data.slice("inventory_defs:".length));
        setStatus(`quick bomb items loaded ${state.itemDefinitionByKey.size}`);
        return;
      }

      if (data.startsWith("bombs_init:")) {
        updateAmmoCostsFromBombsInit(data.slice("bombs_init:".length));
        setStatus(`quick bomb items loaded ${state.itemDefinitionByKey.size}`);
      }
    }

    function updateRoomState(data) {
      if (data.startsWith("#(init_game):")) {
        updateRoomPlayersFromInitGame(data);
        return;
      }

      const command = getPacketCommand(data);
      if (command === "sit") {
        updateRoomPlayersFromSit(data);
        return;
      }

      if (command === "su") {
        updateRoomPlayersFromStandUp(data);
        return;
      }

      if (isLobbyReturnPacket(command, data)) {
        leaveRoom();
      }
    }

    function updateRoomPlayersFromInitGame(data) {
      const selfPayload = getCompoundSubframe(data, "self_data");
      const gamePayload = getCompoundSubframe(data, "init_game_data");
      if (!gamePayload) {
        return;
      }

      const selfFields = splitProtocolFields(stripOuterBraces(selfPayload));
      const gameFields = splitProtocolFields(gamePayload);
      const players = splitProtocolFields(stripOuterBraces(gameFields[7] || ""))
        .map(parseRoomPlayerRow)
        .filter((player) => player.playerId && player.seat !== "" && Number(player.seat) >= 0);

      state.inRoom = true;
      state.selfPlayerId = selfFields[1] || state.selfPlayerId;
      state.players = players;
      if (!players.some((player) => player.playerId === state.selectedTarget?.playerId)) {
        state.selectedTarget = null;
      }

      setStatus(`quick bomb room targets ${players.length}`);
    }

    function parseRoomPlayerRow(rowText) {
      const fields = splitProtocolFields(stripOuterBraces(rowText));
      return {
        playerId: fields[2] || "",
        playerName: rememberPlayerName(fields[2], fields[3]),
        seat: fields[8] || "",
      };
    }

    function updateRoomPlayersFromSit(data) {
      const fields = splitProtocolFields(data.slice("sit:".length));
      const playerId = fields[1] || "";
      const seat = fields[2] || "";
      if (!playerId || seat === "" || Number(seat) < 0) {
        return;
      }

      state.inRoom = true;
      upsertRoomPlayer({
        playerId,
        playerName: getKnownPlayerName(playerId),
        seat,
      });
      setStatus(`quick bomb target joined seat ${seat}`);
    }

    function updateRoomPlayersFromStandUp(data) {
      const fields = splitProtocolFields(data.slice("su:".length));
      const playerId = fields[1] || "";
      if (!playerId) {
        return;
      }

      removeRoomPlayer(playerId);
      setStatus(`quick bomb target left ${playerId}`);
    }

    function upsertRoomPlayer(player) {
      const nextPlayers = state.players.filter((existingPlayer) => {
        return existingPlayer.playerId !== player.playerId && existingPlayer.seat !== player.seat;
      });
      nextPlayers.push(player);
      nextPlayers.sort((a, b) => Number(a.seat) - Number(b.seat));
      state.players = nextPlayers;
      if (state.selectedTarget?.playerId === player.playerId) {
        state.selectedTarget = player;
      }
    }

    function removeRoomPlayer(playerId) {
      state.players = state.players.filter((player) => player.playerId !== playerId);
      if (state.selectedTarget?.playerId === playerId) {
        state.selectedTarget = null;
        if (state.active) {
          stopSpam("quick bomb target left");
        }
      }
    }

    function getKnownPlayerName(playerId) {
      return state.playerNameById.get(String(playerId || "")) || "";
    }

    function updateKnownPlayerNames(data) {
      if (data.startsWith("pc:")) {
        const fields = splitProtocolFields(data.slice("pc:".length));
        rememberPlayerName(fields[0], fields[1]);
        refreshRoomPlayerNames();
        return;
      }

      if (data.startsWith("side_bet_added:")) {
        const fields = splitProtocolFields(data.slice("side_bet_added:".length));
        rememberPlayerReference(fields[3]);
        rememberPlayerReference(fields[4]);
        refreshRoomPlayerNames();
      }
    }

    function rememberPlayerReference(reference) {
      const [playerName = "", playerId = ""] = String(reference || "").split(":");
      rememberPlayerName(playerId, playerName);
    }

    function rememberPlayerName(playerId, playerName) {
      const normalizedPlayerId = String(playerId || "");
      const normalizedPlayerName = decodeProtocolText(playerName || "").trim();
      if (normalizedPlayerId && normalizedPlayerName) {
        state.playerNameById.set(normalizedPlayerId, normalizedPlayerName);
      }

      return normalizedPlayerName || getKnownPlayerName(normalizedPlayerId);
    }

    function refreshRoomPlayerNames() {
      state.players = state.players.map((player) => {
        return {
          ...player,
          playerName: player.playerName || getKnownPlayerName(player.playerId),
        };
      });
      if (state.selectedTarget) {
        state.selectedTarget = state.players.find((player) => player.playerId === state.selectedTarget?.playerId) || null;
      }
    }

    function leaveRoom() {
      state.inRoom = false;
      state.selfPlayerId = "";
      state.players = [];
      state.selectedTarget = null;
      if (state.active) {
        stopSpam("quick bomb left room");
        return;
      }

      setStatus("quick bomb left room");
    }

    function isLobbyReturnPacket(command, data) {
      return command === "gamesdone" || data === "lounge:0" || command === "init_lobby";
    }

    function selectTarget(detail) {
      const target = state.players.find((player) => {
        return player.playerId === String(detail?.playerId || "") && player.seat === String(detail?.seat || "");
      });
      if (!target) {
        setStatus("quick bomb target unavailable");
        return;
      }

      state.selectedTarget = target;
      setStatus(`quick bomb target ${target.playerName}`);
    }

    function selectItem(detail) {
      const itemKey = normalizeItemKey(detail?.itemKey);
      if (!itemKey || !state.itemDefinitionByKey.has(itemKey)) {
        setStatus("quick bomb item unavailable");
        return;
      }

      state.selectedItemKey = itemKey;
      setStatus(`quick bomb item ${getItemLabel(itemKey)}`);
    }

    function updateAmmoCostsFromInventoryDefs(payload) {
      const groups = splitProtocolFields(stripOuterBraces(payload));
      for (const group of groups) {
        const groupFields = splitProtocolFields(stripOuterBraces(group));
        if (groupFields[0] !== "BOMB") {
          continue;
        }

        for (const itemDefinition of splitProtocolFields(stripOuterBraces(groupFields[1] || ""))) {
          const itemFields = splitProtocolFields(stripOuterBraces(itemDefinition));
          setItemDefinition(itemFields[0], "", itemFields[1]);
          setAmmoCost(itemFields[0], itemFields[1]);
        }
      }
    }

    function updateAmmoCostsFromBombsInit(payload) {
      for (const itemDefinition of splitProtocolFields(stripOuterBraces(payload))) {
        const itemFields = splitProtocolFields(stripOuterBraces(itemDefinition));
        setItemDefinition(itemFields[0], itemFields[1], itemFields[5]);
        setAmmoCost(itemFields[0], itemFields[5]);
      }
    }

    function setItemDefinition(itemKey, label, cost) {
      const normalizedItemKey = normalizeItemKey(itemKey);
      if (!normalizedItemKey) {
        return;
      }

      const numericCost = Number(cost);
      const existingDefinition = state.itemDefinitionByKey.get(normalizedItemKey) || {};
      state.itemDefinitionByKey.set(normalizedItemKey, {
        itemKey: normalizedItemKey,
        label: decodeProtocolText(label || existingDefinition.label || normalizedItemKey),
        cost: Number.isFinite(numericCost) && numericCost > 0 ? Math.max(1, Math.round(numericCost)) : existingDefinition.cost || 1,
      });
    }

    function setAmmoCost(itemKey, cost) {
      const normalizedItemKey = normalizeItemKey(itemKey);
      const numericCost = Number(cost);
      if (!normalizedItemKey || !Number.isFinite(numericCost) || numericCost <= 0) {
        return;
      }

      state.ammoCostByItemKey.set(normalizedItemKey, Math.max(1, Math.round(numericCost)));
    }

    function normalizeItemKey(itemKey) {
      return String(itemKey || "").trim().toLowerCase();
    }

    function getSelectedItemKey() {
      return state.selectedItemKey || state.lastItemKey;
    }

    function getItemLabel(itemKey) {
      return state.itemDefinitionByKey.get(normalizeItemKey(itemKey))?.label || itemKey;
    }

    function getItemDefinitions() {
      return Array.from(state.itemDefinitionByKey.values()).sort((a, b) => {
        return a.label.localeCompare(b.label);
      });
    }

    function stripOuterBraces(value) {
      const text = String(value || "").trim();
      if (text.startsWith("{") && text.endsWith("}")) {
        return text.slice(1, -1);
      }

      return text;
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

    function getPacketCommand(data) {
      const colonIndex = data.indexOf(":");
      return colonIndex === -1 ? data : data.slice(0, colonIndex);
    }

    function decodeProtocolText(value) {
      try {
        return decodeURIComponent(String(value || "").replace(/\+/g, "%20"));
      } catch {
        return String(value || "");
      }
    }

    function splitProtocolFields(value) {
      const fields = [];
      let depth = 0;
      let fieldStart = 0;
      const text = String(value || "");

      for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth = Math.max(0, depth - 1);
        } else if (character === "," && depth === 0) {
          fields.push(text.slice(fieldStart, index));
          fieldStart = index + 1;
        }
      }

      if (fieldStart <= text.length) {
        fields.push(text.slice(fieldStart));
      }

      return fields;
    }

    function getIntervalMs() {
      return Math.max(1, Math.round(1000 / getRate()));
    }

    function getBombItemKey(data) {
      const match = String(data).match(/^(?:bomb|newbomb):([^,]+)/);
      return match?.[1] || "";
    }

    function getBombCountOrFlag(data) {
      if (!data.startsWith("bomb:")) {
        return "";
      }

      const fields = splitProtocolFields(data.slice("bomb:".length));
      return fields[2] || "";
    }

    function encodeBombTargetName(playerName) {
      return String(playerName || "").replace(/,/g, "");
    }

    function isQuickBombHotkey(event) {
      return (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.toUpperCase() === config.hotkey
      );
    }

    function isQuickBombEnabled() {
      return window.localStorage?.getItem(config.enabledStorageKey) !== "0";
    }

    function getRate() {
      return normalizePositiveInteger(
        window.localStorage?.getItem(config.rateStorageKey) || config.defaultRate,
        config.defaultRate,
      );
    }

    function getMode() {
      return window.localStorage?.getItem(config.modeStorageKey) === "ammo" ? "ammo" : "duration";
    }

    function getSpeedMode() {
      return window.localStorage?.getItem(config.speedModeStorageKey) === "instant" ? "instant" : "timed";
    }

    function getDurationSeconds() {
      return normalizePositiveInteger(
        window.localStorage?.getItem(config.durationStorageKey) || config.defaultDurationSeconds,
        config.defaultDurationSeconds,
      );
    }

    function getAmmo() {
      return normalizePositiveInteger(
        window.localStorage?.getItem(config.ammoStorageKey) || config.defaultAmmo,
        config.defaultAmmo,
      );
    }

    function normalizePositiveInteger(value, fallback) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallback;
      }

      return Math.round(numericValue);
    }

    function setStatus(status) {
      document.dispatchEvent(
        new CustomEvent(config.statusEvent, {
          detail: {
            quickBombLastItem: state.lastItemKey,
            quickBombSelectedItem: getSelectedItemKey(),
            quickBombItems: getItemDefinitions(),
            quickBombReplayCount: state.replayCount,
            quickBombSocketId: state.socketId,
            quickBombLastReplayAt: state.lastReplayAt,
            quickBombAmmoCost: getAmmoCost(getSelectedItemKey()),
            quickBombInRoom: state.inRoom,
            quickBombPlayers: state.players,
            quickBombSelectedPlayerId: state.selectedTarget?.playerId || "",
            quickBombActive: state.active,
            quickBombRemaining: state.active ? Math.max(0, state.targetSends - state.runSent) : 0,
            lastStatus: status,
          },
        }),
      );
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
      if (window.__triplejackHelperWebSocketHookInstalled) {
        setStatus("WebSocket hook already installed");
        return;
      }

      if (!NativeWebSocket) {
        setStatus("WebSocket is not available");
        return;
      }

      window.__triplejackHelperWebSocketHookInstalled = true;

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

  // Translation bridge
  function log(...args) {
    console.log(`[${SCRIPT_NAME}]`, ...args);
  }

  function setStatus(status) {
    state.lastStatus = status;
    log(status);
    renderStatusPanel();
  }

  function installTranslationFeature() {
    installTranslationBridge();
    injectTranslationPageModules();
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
      renderQuickBombPanel();
    });
  }

  function injectTranslationPageModules() {
    const script = document.createElement("script");
    script.textContent = `(() => {
      const messageProtocol = (${translationProtocolModule.toString()})();
      const translationRenderer = (${translationRendererModule.toString()})(messageProtocol.translatedMarker);
      const translationController = (${translationControllerModule.toString()})(
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
      const quickBombController = (${quickBombControllerModule.toString()})(${JSON.stringify({
      socketMessageEvent: SOCKET_MESSAGE_EVENT,
      statusEvent: STATUS_EVENT,
      controlEvent: QUICK_BOMB_CONTROL_EVENT,
      enabledStorageKey: QUICK_BOMB_ENABLED_STORAGE_KEY,
      rateStorageKey: QUICK_BOMB_RATE_STORAGE_KEY,
      speedModeStorageKey: QUICK_BOMB_SPEED_MODE_STORAGE_KEY,
      modeStorageKey: QUICK_BOMB_MODE_STORAGE_KEY,
      durationStorageKey: QUICK_BOMB_DURATION_STORAGE_KEY,
      ammoStorageKey: QUICK_BOMB_AMMO_STORAGE_KEY,
      hotkey: QUICK_BOMB_KEY,
      defaultRate: QUICK_BOMB_DEFAULT_RATE,
      defaultDurationSeconds: QUICK_BOMB_DEFAULT_DURATION_SECONDS,
      defaultAmmo: QUICK_BOMB_DEFAULT_AMMO,
    })});
      translationController.install();
      quickBombController.install();
      (${pageWebSocketHook.toString()})(${JSON.stringify({
      scriptName: SCRIPT_NAME,
      packetInterceptEvent: PACKET_INTERCEPT_EVENT,
      socketMessageEvent: SOCKET_MESSAGE_EVENT,
      statusEvent: STATUS_EVENT,
    })});
    })();`;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
    setStatus("translation page modules injected");
  }

  // Panel manager
  const SETTINGS_PANEL_ID = "settings";
  const SESSION_HISTORY_PANEL_ID = "session-history";
  const QUICK_BOMB_PANEL_ID = "quick-bomb";
  let nativePanelWrapperClassName = "";
  let nativePanelAsideClassName = "";
  let pendingHelperPanelOpenId = 0;
  let helperShellNativeButton = null;
  let helperPanelSizingStyle = null;
  let helperPanelSizingReconcileQueued = false;

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
    state.activePanelId = "";
    renderHelperPanels({ preservePanelShell: false });
    collapsePanelShellImmediately();
    if (shellButton?.isConnected) {
      dispatchNativePanelPointerDown(shellButton);
      collapsePanelShellImmediately();
      window.requestAnimationFrame(collapsePanelShellImmediately);
      window.setTimeout(collapsePanelShellImmediately, 0);
    }
    helperShellNativeButton = null;
    scheduleHelperPanelCloseCleanup();
  }

  function setActiveHelperPanel(panelId) {
    logPanelDebug("set-active-helper-panel", {
      panelId,
      previousPanelId: state.activePanelId,
    });
    state.activePanelId = panelId;
    renderHelperPanels();
  }

  function renderHelperPanels(options = {}) {
    logPanelDebug("render-helper-panels", {
      activePanelId: state.activePanelId,
      hasHelperPanelHost: Boolean(helperPanelHost?.isConnected),
    });

    if (!state.activePanelId) {
      removeHelperPanelHost({ preservePanelShell: options.preservePanelShell ?? Boolean(helperShellNativeButton) });
    } else {
      getHelperPanelMount();
    }

    renderStatusPanel();
    renderSessionHistoryPanel();
    renderQuickBombPanel();
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

    wrapper.appendChild(aside);
    panelContainer.appendChild(wrapper);
    helperPanelHost = aside;
    ensureHelperPanelResizeHandle();
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
    clearHelperPanelLayoutOverrides();
    syncHelperPanelResizeHandle();
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
    ensureHelperPanelResizeHandle();
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
    activateHelperPanelSizing(panelWidth);
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
    ensureHelperPanelResizeHandle();
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
      "width:14px",
      "z-index:20",
      "cursor:col-resize",
      "touch-action:none",
      "background:transparent",
      "display:flex",
      "align-items:center",
      "justify-content:flex-end",
    ].join(";");
    resizeHandle.innerHTML = `
      <div data-tj-helper-panel-resize-indicator aria-hidden="true" style="width:2px;height:100%;background:rgba(126,214,196,.28);box-shadow:0 0 0 1px rgba(3,10,14,.12);opacity:.42;transition:opacity .12s ease,background .12s ease;"></div>
    `;
    const indicator = resizeHandle.querySelector("[data-tj-helper-panel-resize-indicator]");
    resizeHandle.addEventListener("pointerenter", () => {
      indicator.style.opacity = ".95";
      indicator.style.background = "rgba(126,214,196,.85)";
    });
    resizeHandle.addEventListener("pointerleave", () => {
      indicator.style.opacity = ".42";
      indicator.style.background = "rgba(126,214,196,.28)";
    });
    resizeHandle.addEventListener("pointerdown", handleHelperPanelResizePointerDown);
    return resizeHandle;
  }

  function ensureHelperPanelResizeHandle() {
    if (!document.body) {
      return null;
    }

    const existingHandle = document.querySelector("[data-tj-helper-panel-resize-handle]");
    if (existingHandle) {
      if (existingHandle.parentElement !== document.body) {
        document.body.appendChild(existingHandle);
      }
      syncHelperPanelResizeHandle();
      return existingHandle;
    }

    const resizeHandle = createHelperPanelResizeHandle();
    document.body.appendChild(resizeHandle);
    syncHelperPanelResizeHandle();
    return resizeHandle;
  }

  function syncHelperPanelResizeHandle() {
    const resizeHandle = document.querySelector("[data-tj-helper-panel-resize-handle]");
    if (!resizeHandle) {
      return;
    }

    const panelContainer = document.querySelector('[data-testid="panel-container"]');
    const panelRegion = panelContainer?.parentElement;
    const hasPanel = Boolean(panelContainer && panelRegion && panelRegion.offsetParent !== null);
    resizeHandle.style.display = hasPanel ? "flex" : "none";
    if (hasPanel) {
      positionHelperPanelResizeHandle(panelRegion);
    }
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
      clearNativeStageWidthStyle();
      if (panelContainer.dataset.tjHelperPanelContainer || panelRegion.dataset.tjHelperPanelRegion) {
        activateHelperPanelSizing(HELPER_PANEL_WIDTH);
        setPanelRegionWidthStyle(panelRegion, HELPER_PANEL_WIDTH);
        setPanelContainerWidthStyle(panelContainer, HELPER_PANEL_WIDTH);
        setNativeStageWidthStyle(HELPER_PANEL_WIDTH);
      }
      scheduleLayoutRefresh();
      return;
    }

    const panelWidth = getResolvedHelperPanelWidth();
    activateHelperPanelSizing(panelWidth);
    setNativeStageWidthStyle(panelWidth);
    setPanelRegionWidthStyle(panelRegion, panelWidth);
    setPanelContainerWidthStyle(panelContainer, panelWidth);
    for (const child of panelContainer.children) {
      if (child.matches?.("[data-tj-helper-panel-wrapper]") || !panelContainer.dataset.tjHelperPanelContainer) {
        setPanelFillStyle(child);
      }
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

  function setPanelRegionWidthStyle(element, panelWidth) {
    if (!element?.style) {
      return;
    }

    element.style.setProperty("flex", `0 0 ${panelWidth}px`, "important");
    element.style.setProperty("flex-basis", `${panelWidth}px`, "important");
    element.style.setProperty("width", `${panelWidth}px`, "important");
    element.style.setProperty("min-width", `${panelWidth}px`, "important");
    element.style.setProperty("max-width", `min(${panelWidth}px,calc(100vw - 64px))`, "important");
  }

  function setPanelContainerWidthStyle(element, panelWidth) {
    if (!element?.style) {
      return;
    }

    element.style.removeProperty("flex");
    element.style.removeProperty("flex-basis");
    element.style.setProperty("width", `${panelWidth}px`, "important");
    element.style.setProperty("min-width", `${panelWidth}px`, "important");
    element.style.setProperty("max-width", `min(${panelWidth}px,calc(100vw - 64px))`, "important");
  }

  function setPanelFillStyle(element) {
    if (!element?.style) {
      return;
    }

    element.style.setProperty("flex", "1 1 auto", "important");
    element.style.setProperty("width", "100%", "important");
    element.style.setProperty("min-width", "0", "important");
    element.style.setProperty("max-width", "100%", "important");
    element.style.setProperty("height", "100%", "important");
    element.style.setProperty("min-height", "0", "important");
    element.style.setProperty("align-self", "stretch", "important");
    element.style.setProperty("overflow", "hidden", "important");
  }

  function getResolvedHelperPanelWidth() {
    return getHelperPanelWidthEnabled() ? getHelperPanelWidth() : HELPER_PANEL_WIDTH;
  }

  function ensureHelperPanelSizingStyle() {
    if (helperPanelSizingStyle?.isConnected) {
      return helperPanelSizingStyle;
    }

    helperPanelSizingStyle = document.createElement("style");
    helperPanelSizingStyle.dataset.tjHelperPanelSizingStyle = "1";
    helperPanelSizingStyle.textContent = `
      :root[data-tj-helper-panel-sizing-active="1"] [data-testid="poker-stage-container"] {
        flex:1 1 0 !important;
        flex-basis:0 !important;
        width:calc(100% - var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px)) !important;
        min-width:0 !important;
        max-width:calc(100% - var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px)) !important;
        overflow:hidden !important;
      }
      :root[data-tj-helper-panel-sizing-active="1"] [data-testid="poker-stage-container"] + *:has([data-testid="panel-container"]) {
        flex:0 0 var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px) !important;
        flex-basis:var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px) !important;
        width:var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px) !important;
        min-width:var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px) !important;
        max-width:min(var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px), calc(100vw - 64px)) !important;
      }
      :root[data-tj-helper-panel-sizing-active="1"] [data-testid="poker-stage-container"] + *:has([data-testid="panel-container"]) > [data-testid="panel-container"] {
        width:var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px) !important;
        min-width:var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px) !important;
        max-width:min(var(--tj-helper-panel-width, ${HELPER_PANEL_WIDTH}px), calc(100vw - 64px)) !important;
      }
    `;
    document.head?.appendChild(helperPanelSizingStyle);
    return helperPanelSizingStyle;
  }

  function activateHelperPanelSizing(panelWidth = getResolvedHelperPanelWidth()) {
    const resolvedWidth = clampHelperPanelWidth(panelWidth);
    document.documentElement?.style.setProperty("--tj-helper-panel-width", `${resolvedWidth}px`);
    document.documentElement?.dataset && (document.documentElement.dataset.tjHelperPanelSizingActive = "1");
    ensureHelperPanelSizingStyle();
  }

  function deactivateHelperPanelSizingIfClosed() {
    if (hasOpenPanel()) {
      return;
    }

    document.documentElement?.removeAttribute("data-tj-helper-panel-sizing-active");
    document.documentElement?.style.removeProperty("--tj-helper-panel-width");
    clearNativeStageWidthStyle();
  }

  function queueHelperPanelSizingReconcile() {
    if (helperPanelSizingReconcileQueued) {
      return;
    }

    helperPanelSizingReconcileQueued = true;
    window.requestAnimationFrame(() => {
      helperPanelSizingReconcileQueued = false;
      reconcileHelperPanelSizingState();
    });
  }

  function reconcileHelperPanelSizingState() {
    if (hasOpenPanel()) {
      syncHelperPanelResizeHandle();
      return;
    }

    collapsePanelShellImmediately();
  }

  function prepareHelperPanelWidthBeforeOpen() {
    const panelWidth = getResolvedHelperPanelWidth();
    activateHelperPanelSizing(panelWidth);
    setNativeStageWidthStyle(panelWidth);
  }

  function hasOpenPanel() {
    return Boolean(state.activePanelId || getActiveNativePanelButton());
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

  function setNativeStageWidthStyle(panelWidth) {
    for (const stageContainer of document.querySelectorAll('[data-testid="poker-stage-container"]')) {
      const sceneRow = stageContainer.parentElement;
      if (!stageContainer?.style || !sceneRow?.style) {
        continue;
      }

      sceneRow.style.setProperty("min-width", "0", "important");
      sceneRow.style.setProperty("overflow", "hidden", "important");
      stageContainer.style.setProperty("flex", "1 1 0", "important");
      stageContainer.style.setProperty("flex-basis", "0", "important");
      stageContainer.style.setProperty("width", `calc(100% - ${panelWidth}px)`, "important");
      stageContainer.style.setProperty("min-width", "0", "important");
      stageContainer.style.setProperty("max-width", `calc(100% - ${panelWidth}px)`, "important");
      stageContainer.style.setProperty("overflow", "hidden", "important");
    }
  }

  function clearNativeStageWidthStyle() {
    for (const stageContainer of document.querySelectorAll('[data-testid="poker-stage-container"]')) {
      const sceneRow = stageContainer.parentElement;
      if (sceneRow?.style) {
        sceneRow.style.removeProperty("overflow");
        sceneRow.style.removeProperty("min-width");
      }
      if (!stageContainer?.style) {
        continue;
      }

      for (const property of ["flex", "flex-basis", "width", "min-width", "max-width", "overflow"]) {
        stageContainer.style.removeProperty(property);
      }
    }
  }

  function clearHelperPanelLayoutOverrides(panelContainer = document.querySelector('[data-testid="panel-container"]')) {
    clearHelperPanelWidth(panelContainer);
    clearNativeStageWidthStyle();
  }

  function scheduleHelperPanelCloseCleanup() {
    const cleanup = () => {
      if (!hasOpenPanel()) {
        collapsePanelShellImmediately();
        return;
      }

      clearHelperPanelLayoutOverrides();
      deactivateHelperPanelSizingIfClosed();
      resizeNativeStageToContainer();
      window.dispatchEvent(new Event("resize"));
    };

    window.requestAnimationFrame(cleanup);
    window.setTimeout(cleanup, 120);
  }

  function collapsePanelShellImmediately() {
    const panelContainer = document.querySelector('[data-testid="panel-container"]');
    const panelRegion = panelContainer?.parentElement;
    clearHelperPanelLayoutOverrides(panelContainer);
    document.documentElement?.removeAttribute("data-tj-helper-panel-sizing-active");
    document.documentElement?.style.removeProperty("--tj-helper-panel-width");

    if (panelRegion) {
      panelRegion.style.display = "none";
      panelRegion.dataset.tjHelperHiddenEmpty = "1";
    }
    if (panelContainer) {
      panelContainer.dataset.tjHelperHiddenEmpty = "1";
    }

    syncHelperPanelResizeHandle();
    resizeNativeStageToContainer();
    window.dispatchEvent(new Event("resize"));
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
      const panelContainer = document.querySelector('[data-testid="panel-container"]');
      const activeNativePanelButton = getActiveNativePanelButton();
      if (!state.activePanelId && !activeNativePanelButton && !panelContainer?.dataset.tjHelperPanelContainer) {
        collapsePanelShellImmediately();
        return;
      }

      ensureHelperPanelResizeHandle();
      applyHelperPanelWidth(panelContainer);
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

    if (!state.activePanelId && isNativePanelButtonActive(nativePanelButton)) {
      collapsePanelShellImmediately();
      window.setTimeout(() => {
        deactivateHelperPanelSizingIfClosed();
        resizeNativeStageToContainer();
        window.dispatchEvent(new Event("resize"));
      }, 0);
      return;
    }

    ensureHelperPanelResizeHandle();
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
    clearHelperPanelLayoutOverrides();
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

  function isNativePanelButtonActive(nativePanelButton) {
    return (
      nativePanelButton?.getAttribute?.("data-is-active") === "true" ||
      nativePanelButton?.dataset?.isActive === "true" ||
      nativePanelButton?.title?.startsWith("Hide ")
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
      syncHelperPanelResizeHandle();
      window.dispatchEvent(new Event("resize"));
      sessionHistoryChart?.resize?.();
    });
  }

  function syncNativePanelGeometry() {
    const panelContainer = hasOpenPanel() ? document.querySelector('[data-testid="panel-container"]') : null;
    const panelRegion = panelContainer?.parentElement;
    if (!panelContainer || !panelRegion) {
      return;
    }

    ensureHelperPanelResizeHandle();
    if (state.activePanelId && helperPanelHost?.isConnected) {
      panelRegion.style.setProperty("height", "100%", "important");
      panelContainer.style.setProperty("height", "100%", "important");
      for (const child of panelContainer.children) {
        child.style.setProperty("height", "100%", "important");
      }
    }

    const stageHeight = getNativeStageHeight();
    positionHelperPanelResizeHandle(panelRegion, stageHeight);
  }

  function positionHelperPanelResizeHandle(panelRegion, stageHeight = getNativeStageHeight()) {
    const resizeHandle = document.querySelector("[data-tj-helper-panel-resize-handle]");
    if (!resizeHandle || !panelRegion) {
      return;
    }

    const panelRect = panelRegion.getBoundingClientRect();
    resizeHandle.style.left = `${Math.round(panelRect.left - 12)}px`;
    resizeHandle.style.top = `${Math.round(panelRect.top)}px`;
    resizeHandle.style.height = `${Math.round(panelRect.height || stageHeight || 0)}px`;
  }

  function getNativeStageHeight() {
    const stageContainer = document.querySelector('[data-testid="poker-stage-container"]');
    return Math.round(stageContainer?.clientHeight || stageContainer?.getBoundingClientRect?.().height || 0);
  }

  function resizeNativeStageToContainer() {
    for (const stageContainer of document.querySelectorAll('[data-testid="poker-stage-container"]')) {
      const canvas = stageContainer?.querySelector?.("canvas");
      if (!stageContainer || !canvas) {
        continue;
      }

      const sceneRow = stageContainer.parentElement;
      const panelRegion = hasOpenPanel()
        ? [...(sceneRow?.children || [])].find((child) => child.querySelector?.('[data-testid="panel-container"]'))
        : null;
      const panelWidth = Math.round(panelRegion?.getBoundingClientRect?.().width || 0);
      const rowWidth = Math.round(sceneRow?.clientWidth || sceneRow?.getBoundingClientRect?.().width || 0);
      const width = Math.round(
        (rowWidth && panelWidth ? rowWidth - panelWidth : 0) ||
          stageContainer.clientWidth ||
          stageContainer.getBoundingClientRect().width ||
          0,
      );
      const height = Math.round(stageContainer.clientHeight || stageContainer.getBoundingClientRect().height || 0);
      if (width <= 0 || height <= 0) {
        continue;
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
  }

  function getActiveHelperPanelElement() {
    if (state.activePanelId === SETTINGS_PANEL_ID) {
      return statusPanel || helperPanelHost;
    }

    if (state.activePanelId === SESSION_HISTORY_PANEL_ID) {
      return sessionHistoryPanel || helperPanelHost;
    }

    if (state.activePanelId === QUICK_BOMB_PANEL_ID) {
      return quickBombPanel || helperPanelHost;
    }

    return null;
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

  function getQuickBombEnabled() {
    return localStorage.getItem(QUICK_BOMB_ENABLED_STORAGE_KEY) !== "0";
  }

  function getQuickBombRate() {
    return normalizePositiveInteger(
      localStorage.getItem(QUICK_BOMB_RATE_STORAGE_KEY) || QUICK_BOMB_DEFAULT_RATE,
      QUICK_BOMB_DEFAULT_RATE,
    );
  }

  function getQuickBombSpeedMode() {
    return localStorage.getItem(QUICK_BOMB_SPEED_MODE_STORAGE_KEY) === "instant" ? "instant" : "timed";
  }

  function getQuickBombMode() {
    const mode = localStorage.getItem(QUICK_BOMB_MODE_STORAGE_KEY);
    return mode === "ammo" ? "ammo" : "duration";
  }

  function getQuickBombDuration() {
    return normalizePositiveInteger(
      localStorage.getItem(QUICK_BOMB_DURATION_STORAGE_KEY) || QUICK_BOMB_DEFAULT_DURATION_SECONDS,
      QUICK_BOMB_DEFAULT_DURATION_SECONDS,
    );
  }

  function getQuickBombAmmo() {
    return normalizePositiveInteger(
      localStorage.getItem(QUICK_BOMB_AMMO_STORAGE_KEY) || QUICK_BOMB_DEFAULT_AMMO,
      QUICK_BOMB_DEFAULT_AMMO,
    );
  }

  function getQuickBombItemSort() {
    const sort = localStorage.getItem(QUICK_BOMB_ITEM_SORT_STORAGE_KEY);
    return ["cost-asc", "cost-desc", "name"].includes(sort) ? sort : "cost-asc";
  }

  function getHelperPanelWidth() {
    return clampHelperPanelWidth(localStorage.getItem(HELPER_PANEL_WIDTH_STORAGE_KEY) || HELPER_PANEL_WIDTH);
  }

  function getHelperPanelWidthEnabled() {
    const storedValue = localStorage.getItem(HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY);
    if (storedValue !== null) {
      return storedValue === "1";
    }

    return localStorage.getItem(HELPER_PANEL_WIDTH_STORAGE_KEY) !== null;
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

  function setQuickBombEnabled(enabled) {
    localStorage.setItem(QUICK_BOMB_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
    setStatus(`quick bomb ${enabled ? "enabled" : "disabled"}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombRate(rate) {
    const value = normalizePositiveInteger(rate, QUICK_BOMB_DEFAULT_RATE);
    localStorage.setItem(QUICK_BOMB_RATE_STORAGE_KEY, String(value));
    setStatus(`quick bomb rate set to ${value}/s`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombSpeedMode(mode) {
    const value = mode === "instant" ? "instant" : "timed";
    localStorage.setItem(QUICK_BOMB_SPEED_MODE_STORAGE_KEY, value);
    setStatus(`quick bomb speed set to ${value}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombMode(mode) {
    const value = mode === "ammo" ? "ammo" : "duration";
    localStorage.setItem(QUICK_BOMB_MODE_STORAGE_KEY, value);
    setStatus(`quick bomb mode set to ${value}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombDuration(durationSeconds) {
    const value = normalizePositiveInteger(durationSeconds, QUICK_BOMB_DEFAULT_DURATION_SECONDS);
    localStorage.setItem(QUICK_BOMB_DURATION_STORAGE_KEY, String(value));
    setStatus(`quick bomb duration set to ${value}s`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombAmmo(ammo) {
    const value = normalizePositiveInteger(ammo, QUICK_BOMB_DEFAULT_AMMO);
    localStorage.setItem(QUICK_BOMB_AMMO_STORAGE_KEY, String(value));
    setStatus(`quick bomb ammo set to ${value}`);
    renderStatusPanel();
    renderQuickBombPanel();
  }

  function setQuickBombItemSort(sort) {
    const value = ["cost-asc", "cost-desc", "name"].includes(sort) ? sort : "cost-asc";
    localStorage.setItem(QUICK_BOMB_ITEM_SORT_STORAGE_KEY, value);
    setStatus(`quick bomb item sort set to ${value}`);
    renderQuickBombPanel();
  }

  function sendQuickBombControl(action, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(QUICK_BOMB_CONTROL_EVENT, {
        detail: { ...detail, action },
      }),
    );
  }

  function setHelperPanelWidth(width, options = {}) {
    const panelWidth = clampHelperPanelWidth(width);
    localStorage.setItem(HELPER_PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
    if (options.enable !== false) {
      localStorage.setItem(HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY, "1");
    }
    applyHelperPanelWidth();
    if (options.silent) {
      return;
    }

    setStatus(`panel width set to ${panelWidth}px`);
    renderStatusPanel();
  }

  function setHelperPanelWidthEnabled(enabled) {
    localStorage.setItem(HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
    refreshNativeLayoutAfterPanelWidthChange();
    setStatus(`custom panel width ${enabled ? "enabled" : "disabled"}`);
    renderStatusPanel();
  }

  function clampHelperPanelWidth(width) {
    return clampNumber(width, HELPER_PANEL_MIN_WIDTH, HELPER_PANEL_MAX_WIDTH, HELPER_PANEL_WIDTH);
  }

  function clampNumber(value, min, max, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(numericValue)));
  }

  function normalizePositiveInteger(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return fallback;
    }

    return Math.round(numericValue);
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
    toggleHelperPanel(SETTINGS_PANEL_ID);
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

  // Toolbar
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
      {
        id: QUICK_BOMB_PANEL_ID,
        title: "Quick Bomb",
        label: "💣",
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

  // Message timestamps
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
      '[aria-label="chat messages"] > div > .MuiTypography-root.MuiTypography-body1.scaling-panel-contents',
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

    if (isPublicChatMessage && !isTopLevelPublicChatMessageElement(element)) {
      return false;
    }

    const messageText = getMessageElementText(element).replace(/\d{1,2}:\d{2}\s*(AM|PM)?/gi, "").trim();
    return Boolean(messageText);
  }

  function isTopLevelPublicChatMessageElement(element) {
    const chatMessagesElement = element.closest('[aria-label="chat messages"]');
    return Boolean(chatMessagesElement && element.parentElement?.parentElement === chatMessagesElement);
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

  // Session history store
  function persistSessionSummary(summary) {
    const history = getSessionHistory();
    history.push({
      endedAt: summary.endedAt,
      roomName: summary.roomName,
      roomType: summary.roomType,
      variantName: summary.variantName,
      variantType: summary.variantType,
      gameType: summary.gameType,
      smallBlind: summary.smallBlind,
      bigBlind: summary.bigBlind,
      startStack: summary.startStack,
      endStack: summary.endStack,
      chipDelta: summary.chipDelta,
      bigBlindDelta: summary.bigBlindDelta,
      bigBlindsPerHour: summary.bigBlindsPerHour,
      durationMs: summary.durationMs,
    });

    try {
      localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-500)));
    } catch {
      // Losing history should not block the per-session summary.
    }
  }

  function getSessionHistory() {
    try {
      const parsedHistory = JSON.parse(localStorage.getItem(SESSION_HISTORY_STORAGE_KEY) || "[]");
      return Array.isArray(parsedHistory) ? parsedHistory.filter(isValidSessionRecord) : [];
    } catch {
      return [];
    }
  }

  function isValidSessionRecord(record) {
    return (
      record &&
      Number.isFinite(record.endedAt) &&
      Number.isFinite(record.durationMs) &&
      Number.isFinite(record.bigBlindDelta)
    );
  }

  function getSessionTrackingStats() {
    const sessions = getSessionHistory();
    const overall = aggregateSessionRecords(sessions);
    const byRoomType = Array.from(groupSessionsByRoomType(sessions).entries())
      .map(([roomType, records]) => {
        return {
          roomType,
          ...aggregateSessionRecords(records),
        };
      })
      .sort((a, b) => b.sessions - a.sessions || Math.abs(b.bigBlindsPerHour || 0) - Math.abs(a.bigBlindsPerHour || 0))
      .slice(0, 4);
    const sortedSessions = sortSessionsNewestFirst(sessions);
    const recentSessions = sortedSessions.slice(0, 5);
    const recentTrend = aggregateSessionRecords(recentSessions);
    const previousTrend = aggregateSessionRecords(sortedSessions.slice(5, 10));

    return {
      overall,
      byRoomType,
      recentSessions,
      recentTrend,
      previousTrend,
    };
  }

  function getSessionHistoryReport(filters = {}) {
    const sessions = filterSessionHistory(getSessionHistory(), filters);
    const groupedSessions = groupSessionsByPeriod(sessions, filters.groupBy || "week");

    return {
      sessions: sortSessionsNewestFirst(sessions),
      overall: aggregateSessionRecords(sessions),
      periods: Array.from(groupedSessions.entries()).map(([periodKey, records]) => {
        return {
          periodKey,
          periodLabel: formatSessionPeriodLabel(periodKey, filters.groupBy || "week"),
          ...aggregateSessionRecords(records),
        };
      }),
      byRoomType: Array.from(groupSessionsByRoomType(sessions).entries()).map(([roomType, records]) => {
        return {
          roomType,
          ...aggregateSessionRecords(records),
        };
      }),
    };
  }

  function filterSessionHistory(sessions, filters) {
    const startTime = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : -Infinity;
    const endTime = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`).getTime() : Infinity;
    const roomType = filters.roomType || "";

    return sessions.filter((session) => {
      return (
        session.endedAt >= startTime &&
        session.endedAt <= endTime &&
        (!roomType || (session.roomType || "Unknown room") === roomType)
      );
    });
  }

  function getSessionHistoryDateRange() {
    const sessions = getSessionHistory();
    if (!sessions.length) {
      const today = formatSessionDateInput(Date.now());
      return { startDate: today, endDate: today };
    }

    const timestamps = sessions.map((session) => session.endedAt);
    return {
      startDate: formatSessionDateInput(Math.min(...timestamps)),
      endDate: formatSessionDateInput(Math.max(...timestamps)),
    };
  }

  function getSessionHistoryRoomTypes() {
    return Array.from(groupSessionsByRoomType(getSessionHistory()).keys()).sort((a, b) => a.localeCompare(b));
  }

  function groupSessionsByPeriod(sessions, groupBy) {
    const groups = new Map();
    for (const session of sessions.slice().sort((a, b) => a.endedAt - b.endedAt)) {
      const periodKey = getSessionPeriodKey(session.endedAt, groupBy);
      if (!groups.has(periodKey)) {
        groups.set(periodKey, []);
      }
      groups.get(periodKey).push(session);
    }

    return groups;
  }

  function getSessionPeriodKey(timestamp, groupBy) {
    const date = new Date(timestamp);
    if (groupBy === "month") {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    if (groupBy === "day") {
      return formatSessionDateInput(timestamp);
    }

    if (groupBy === "all") {
      return "all";
    }

    const weekStart = new Date(date);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return formatSessionDateInput(weekStart.getTime());
  }

  function formatSessionPeriodLabel(periodKey, groupBy) {
    if (groupBy === "all") {
      return "All tracked";
    }

    if (groupBy === "month") {
      const [year, month] = periodKey.split("-").map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString([], { month: "short", year: "numeric" });
    }

    if (groupBy === "day") {
      return new Date(`${periodKey}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
    }

    const start = new Date(`${periodKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })}`;
  }

  function groupSessionsByRoomType(sessions) {
    const groups = new Map();
    for (const session of sessions) {
      const roomType = session.roomType || "Unknown room";
      if (!groups.has(roomType)) {
        groups.set(roomType, []);
      }
      groups.get(roomType).push(session);
    }

    return groups;
  }

  function aggregateSessionRecords(sessions) {
    const totals = sessions.reduce(
      (accumulator, session) => {
        accumulator.sessions += 1;
        accumulator.durationMs += Math.max(session.durationMs || 0, 0);
        accumulator.bigBlindDelta += Number(session.bigBlindDelta) || 0;
        accumulator.chipDelta += Number(session.chipDelta) || 0;
        return accumulator;
      },
      { sessions: 0, durationMs: 0, bigBlindDelta: 0, chipDelta: 0 },
    );

    return {
      ...totals,
      bigBlindsPerHour:
        totals.durationMs > 0 ? totals.bigBlindDelta / (totals.durationMs / 3600000) : null,
    };
  }

  function sortSessionsNewestFirst(sessions) {
    return sessions.slice().sort((a, b) => b.endedAt - a.endedAt);
  }

  function formatSessionDateInput(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Session history panel
  let sessionHistoryChart = null;
  let sessionHistoryChartMode = "bbPerHour";

  function renderSessionHistoryPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!isHelperPanelActive(SESSION_HISTORY_PANEL_ID)) {
      destroySessionHistoryChart();
      sessionHistoryPanel?.remove();
      sessionHistoryPanel = null;
      return;
    }

    const panelMount = getHelperPanelMount();
    if (!panelMount) {
      return;
    }

    if (sessionHistoryPanel) {
      if (sessionHistoryPanel.parentNode !== panelMount) {
        panelMount.replaceChildren(sessionHistoryPanel);
      }
      renderSessionHistoryPanelBody();
      return;
    }

    sessionHistoryPanel = document.createElement("div");
    sessionHistoryPanel.style.cssText = [
      "width:100%",
      "height:100%",
      "box-sizing:border-box",
      "overflow:auto",
      "overflow-x:hidden",
      "padding:14px",
      "color:#F5FAFC",
      "font:12px/1.35 Arial,sans-serif",
    ].join(";");

    const dateRange = getSessionHistoryDateRange();
    sessionHistoryPanel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
        <strong style="font-size:15px;">Session History</strong>
      </div>
      <div style="${getHistoryControlGridStyle()}">
        <label style="display:grid;gap:3px;color:#BFE7F1;">Start
          <input type="date" data-tj-session-history-start value="${dateRange.startDate}" style="${getHistoryInputStyle()}" />
        </label>
        <label style="display:grid;gap:3px;color:#BFE7F1;">End
          <input type="date" data-tj-session-history-end value="${dateRange.endDate}" style="${getHistoryInputStyle()}" />
        </label>
        <label style="display:grid;gap:3px;color:#BFE7F1;">Group
          <select data-tj-session-history-group style="${getHistoryInputStyle()}">
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="day">Day</option>
            <option value="all">All</option>
          </select>
        </label>
        <label style="display:grid;gap:3px;color:#BFE7F1;">Room type
          <select data-tj-session-history-room style="${getHistoryInputStyle()}"></select>
        </label>
      </div>
      <div data-tj-session-history-body></div>
    `;

    const roomSelect = sessionHistoryPanel.querySelector("[data-tj-session-history-room]");

    roomSelect.appendChild(new Option("All room types", ""));
    for (const roomType of getSessionHistoryRoomTypes()) {
      roomSelect.appendChild(new Option(roomType, roomType));
    }

    for (const control of sessionHistoryPanel.querySelectorAll("input,select")) {
      control.addEventListener("change", renderSessionHistoryPanelBody);
    }

    panelMount.replaceChildren(sessionHistoryPanel);
    renderSessionHistoryPanelBody();
  }

  function renderSessionHistoryPanelBody() {
    if (!sessionHistoryPanel) {
      return;
    }

    const body = sessionHistoryPanel.querySelector("[data-tj-session-history-body]");
    const filters = {
      startDate: sessionHistoryPanel.querySelector("[data-tj-session-history-start]").value,
      endDate: sessionHistoryPanel.querySelector("[data-tj-session-history-end]").value,
      groupBy: sessionHistoryPanel.querySelector("[data-tj-session-history-group]").value,
      roomType: sessionHistoryPanel.querySelector("[data-tj-session-history-room]").value,
    };
    const report = getSessionHistoryReport(filters);

    if (!report.overall.sessions) {
      destroySessionHistoryChart();
      body.innerHTML = `<div style="color:#8FB8C4;">No tracked sessions match this date range.</div>`;
      return;
    }

    destroySessionHistoryChart();
    body.innerHTML = `
      <div style="${getHistoryMetricGridStyle()}">
        ${renderHistoryMetric("Sessions", report.overall.sessions)}
        ${renderHistoryMetric("Net BB", formatHistorySigned(report.overall.bigBlindDelta), getHistoryStatColor(report.overall.bigBlindDelta))}
        ${renderHistoryMetric("BB/hour", `${formatHistorySigned(report.overall.bigBlindsPerHour)}/h`, getHistoryStatColor(report.overall.bigBlindDelta))}
        ${renderHistoryMetric("Time", formatHistoryDuration(report.overall.durationMs))}
      </div>
      ${renderHistoryTrendGraph(report)}
      <div style="${getHistorySplitGridStyle()}">
        <section style="${getHistorySectionStyle()}">
          <div style="${getHistoryHeadingStyle()}">Period trend</div>
          <div style="display:grid;gap:5px;">${report.periods.map(renderHistoryPeriodRow).join("")}</div>
        </section>
        <section style="${getHistorySectionStyle()}">
          <div style="${getHistoryHeadingStyle()}">Room types</div>
          <div style="display:grid;gap:5px;">${report.byRoomType.map(renderHistoryRoomRow).join("")}</div>
        </section>
      </div>
      <section style="${getHistorySectionStyle()}">
        <div style="${getHistoryHeadingStyle()}">Sessions</div>
        <div style="display:grid;gap:4px;">${report.sessions.map(renderHistorySessionRow).join("")}</div>
      </section>
    `;
    installSessionHistoryGraphControls();
    renderHistoryTrendChart(report);
  }

  function renderHistoryTrendGraph(report) {
    const sessions = report.sessions || [];
    if (!sessions.length) {
      return "";
    }

    return `
      <section style="${getHistorySectionStyle()}margin-bottom:12px;">
        <div style="display:grid;gap:8px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div data-tj-session-history-chart-title style="${getHistoryHeadingStyle()}margin-bottom:0;">Results (big blinds per hour)</div>
            <div style="display:flex;gap:5px;align-items:center;">
              <button type="button" data-tj-session-history-zoom="in" title="Zoom in" style="${getHistoryButtonStyle()}">+</button>
              <button type="button" data-tj-session-history-zoom="out" title="Zoom out" style="${getHistoryButtonStyle()}">-</button>
              <button type="button" data-tj-session-history-zoom="reset" title="Reset time range" style="${getHistoryButtonStyle()}">All</button>
            </div>
          </div>
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            ${renderHistoryChartModeButton("bbPerHour", "BB/hour")}
            ${renderHistoryChartModeButton("netBigBlinds", "Net BB")}
            ${renderHistoryChartModeButton("cumulativeBigBlinds", "Cumulative BB")}
            ${renderHistoryChartModeButton("cumulativeChips", "Cumulative chips")}
            ${renderHistoryChartModeButton("cumulativeBigBlindsPerHour", "Cumulative BB/hour")}
          </div>
        </div>
        <div style="position:relative;height:250px;width:100%;min-width:0;overflow:hidden;">
          <canvas data-tj-session-history-chart aria-label="Session history graph for selected range" role="img" style="display:block;width:100%;height:100%;box-sizing:border-box;"></canvas>
          <div data-tj-session-history-chart-fallback style="display:none;color:#8FB8C4;padding:10px;border:1px solid rgba(191,231,241,.16);border-radius:6px;background:rgba(8,17,23,.25);">
            Chart.js did not load, so the history graph cannot be rendered.
          </div>
        </div>
      </section>
    `;
  }

  function renderHistoryTrendChart(report) {
    const chartElement = sessionHistoryPanel?.querySelector("[data-tj-session-history-chart]");
    if (!chartElement) {
      return;
    }

    const ChartConstructor = getChartConstructor();
    if (!ChartConstructor) {
      chartElement.style.display = "none";
      const fallback = sessionHistoryPanel.querySelector("[data-tj-session-history-chart-fallback]");
      if (fallback) {
        fallback.style.display = "block";
      }
      return;
    }
    chartElement.style.display = "block";
    chartElement.style.width = "100%";
    chartElement.style.height = "100%";

    let cumulativeBigBlinds = 0;
    let cumulativeChips = 0;
    let cumulativeDurationMs = 0;
    const chronologicalSessions = (report.sessions || []).slice().sort((a, b) => a.endedAt - b.endedAt);
    const chartPoints = chronologicalSessions.map((session, index) => {
      cumulativeBigBlinds += Number(session.bigBlindDelta) || 0;
      cumulativeChips += Number(session.chipDelta) || 0;
      cumulativeDurationMs += Math.max(0, Number(session.durationMs) || 0);
      return {
        label: formatHistoryChartPointLabel(session, chronologicalSessions[index - 1]),
        tooltipLabel: formatHistoryDateTime(session.endedAt),
        endedAt: session.endedAt,
        netBigBlinds: Number(session.bigBlindDelta) || 0,
        bbPerHour: getSessionBigBlindsPerHour(session),
        cumulativeBigBlinds,
        cumulativeChips,
        cumulativeBigBlindsPerHour: getCumulativeBigBlindsPerHour(cumulativeBigBlinds, cumulativeDurationMs),
      };
    });
    const chartMode = getSessionHistoryChartModeConfig();
    const chartValues = chartPoints
      .map((point) => point[chartMode.valueKey])
      .filter((value) => Number.isFinite(Number(value)))
      .map(Number);
    const yLimit = getHistoryChartYAxisLimit(chartValues);
    const chartTitle = sessionHistoryPanel.querySelector("[data-tj-session-history-chart-title]");
    if (chartTitle) {
      chartTitle.textContent = chartMode.title;
    }

    sessionHistoryChart = new ChartConstructor(chartElement, {
      type: "line",
      data: {
        labels: chartPoints.map((point) => point.label),
        datasets: [
          {
            label: "Zero",
            data: chartPoints.map(() => 0),
            borderColor: "rgba(245,250,252,.46)",
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 0,
            tension: 0,
            fill: false,
            yAxisID: "results",
            order: 2,
          },
          {
            label: chartMode.label,
            data: chartPoints.map((point) => getFiniteHistoryChartValue(point[chartMode.valueKey])),
            borderColor: chartMode.color,
            backgroundColor: chartMode.color,
            borderWidth: 3,
            clip: false,
            pointBackgroundColor(context) {
              const value = Number(context.raw);
              if (!Number.isFinite(value)) {
                return "#8FB8C4";
              }

              return value >= 0 ? chartMode.positiveColor : chartMode.negativeColor;
            },
            pointBorderColor: "#111820",
            pointBorderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointHitRadius: 10,
            spanGaps: true,
            tension: 0.2,
            fill: false,
            yAxisID: "results",
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: {
          padding: {
            top: 18,
            right: 12,
            bottom: 6,
            left: 4,
          },
        },
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
            labels: {
              color: "#BFE7F1",
              boxWidth: 10,
              boxHeight: 10,
              font: {
                size: 11,
              },
            },
          },
          tooltip: {
            filter(context) {
              return context.dataset.label !== "Zero";
            },
            callbacks: {
              title(context) {
                return chartPoints[context[0]?.dataIndex]?.tooltipLabel || "";
              },
              label(context) {
                return `${context.dataset.label}: ${formatHistoryChartValue(context.parsed.y, chartMode)}`;
              },
            },
          },
        },
        scales: {
          x: {
            axis: "x",
            offset: chartPoints.length === 1,
            ticks: {
              color: "#8FB8C4",
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: Math.min(6, Math.max(chartPoints.length, 2)),
              padding: 6,
            },
            grid: {
              color: "rgba(191,231,241,.08)",
            },
          },
          results: {
            axis: "y",
            position: "left",
            beginAtZero: true,
            min: -yLimit,
            max: yLimit,
            title: {
              display: true,
              text: chartMode.axisLabel,
              color: "#8FB8C4",
              font: {
                size: 11,
                weight: "700",
              },
            },
            afterFit(scale) {
              scale.width = Math.max(scale.width, 54);
            },
            ticks: {
              color: "#8FB8C4",
              maxTicksLimit: 5,
              padding: 6,
              callback(value) {
                return formatHistoryChartAxisValue(value, chartMode);
              },
            },
            grid: {
              color(context) {
                return Number(context.tick.value) === 0 ? "rgba(245,250,252,.52)" : "rgba(191,231,241,.12)";
              },
              lineWidth(context) {
                return Number(context.tick.value) === 0 ? 2 : 1;
              },
            },
          },
        },
      },
    });
    scheduleSessionHistoryChartResize();
  }

  function scheduleSessionHistoryChartResize() {
    const refresh = () => {
      sessionHistoryChart?.resize?.();
      sessionHistoryChart?.update?.("none");
    };

    window.requestAnimationFrame(refresh);
    window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
    window.setTimeout(refresh, 120);
  }

  function installSessionHistoryGraphControls() {
    for (const button of sessionHistoryPanel.querySelectorAll("[data-tj-session-history-chart-mode]")) {
      button.addEventListener("click", () => {
        sessionHistoryChartMode = button.dataset.tjSessionHistoryChartMode || "bbPerHour";
        renderSessionHistoryPanelBody();
      });
    }

    for (const button of sessionHistoryPanel.querySelectorAll("[data-tj-session-history-zoom]")) {
      button.addEventListener("click", () => {
        zoomSessionHistoryDateRange(button.dataset.tjSessionHistoryZoom);
      });
    }
  }

  function renderHistoryChartModeButton(mode, label) {
    const active = mode === sessionHistoryChartMode;
    return `
      <button type="button" data-tj-session-history-chart-mode="${escapeHistoryAttribute(mode)}" style="${getHistoryButtonStyle(active)}">${escapeHistoryHtml(label)}</button>
    `;
  }

  function getSessionHistoryChartModeConfig() {
    if (sessionHistoryChartMode === "netBigBlinds") {
      return {
        valueKey: "netBigBlinds",
        title: "Results (net big blinds)",
        label: "Net BB",
        axisLabel: "Net BB",
        suffix: " BB",
        decimals: 1,
        color: "#6EA8FE",
        fillColor: "rgba(110,168,254,.16)",
        positiveColor: "#6EA8FE",
        negativeColor: "#FF8D7A",
      };
    }

    if (sessionHistoryChartMode === "cumulativeBigBlinds") {
      return {
        valueKey: "cumulativeBigBlinds",
        title: "Results (cumulative big blinds)",
        label: "Cumulative BB",
        axisLabel: "Cumulative BB",
        suffix: " BB",
        decimals: 1,
        color: "#F6C85F",
        fillColor: "rgba(246,200,95,.16)",
        positiveColor: "#F6C85F",
        negativeColor: "#FF8D7A",
      };
    }

    if (sessionHistoryChartMode === "cumulativeChips") {
      return {
        valueKey: "cumulativeChips",
        title: "Results (cumulative chips)",
        label: "Cumulative chips",
        axisLabel: "Chips",
        suffix: " chips",
        decimals: 0,
        compactAxis: true,
        color: "#C9A7FF",
        fillColor: "rgba(201,167,255,.14)",
        positiveColor: "#C9A7FF",
        negativeColor: "#FF8D7A",
      };
    }

    if (sessionHistoryChartMode === "cumulativeBigBlindsPerHour") {
      return {
        valueKey: "cumulativeBigBlindsPerHour",
        title: "Results (cumulative big blinds per hour)",
        label: "Cumulative BB/hour",
        axisLabel: "Cumulative BB/hour",
        suffix: " BB/h",
        decimals: 1,
        color: "#9AD8FF",
        fillColor: "rgba(154,216,255,.14)",
        positiveColor: "#9AD8FF",
        negativeColor: "#FF8D7A",
      };
    }

    return {
      valueKey: "bbPerHour",
      title: "Results (big blinds per hour)",
      label: "BB/hour",
      axisLabel: "BB/hour",
      suffix: " BB/h",
      decimals: 1,
      color: "#7ED6C4",
      fillColor: "rgba(126,214,196,.14)",
      positiveColor: "#7ED6C4",
      negativeColor: "#FF8D7A",
    };
  }

  function renderHistoryMetric(label, value, color = "#F5FAFC") {
    return `
      <div style="${getHistorySectionStyle()}">
        <div style="color:#8FB8C4;margin-bottom:3px;">${escapeHistoryHtml(label)}</div>
        <strong style="font-size:15px;color:${color};">${escapeHistoryHtml(value)}</strong>
      </div>
    `;
  }

  function renderHistoryPeriodRow(period) {
    return `
      <div style="${getHistoryPeriodRowStyle()}">
        <span style="${getHistoryRowLabelStyle()}">${escapeHistoryHtml(period.periodLabel)}</span>
        <span style="${getHistoryRowMutedValueStyle()}">${period.sessions} ses</span>
        <strong style="${getHistoryRowMetricStyle(getHistoryStatColor(period.bigBlindDelta))}">${formatHistorySigned(period.bigBlindDelta)} BB</strong>
        <span style="${getHistoryRowMetricStyle(getHistoryStatColor(period.bigBlindDelta))}">${formatHistorySigned(period.bigBlindsPerHour)}/h</span>
      </div>
    `;
  }

  function renderHistoryRoomRow(roomStats) {
    return `
      <div style="${getHistoryRoomRowStyle()}">
        <span style="${getHistoryRowLabelStyle()}" title="${escapeHistoryAttribute(roomStats.roomType)}">${escapeHistoryHtml(roomStats.roomType)}</span>
        <span style="${getHistoryRowMutedValueStyle()}">${roomStats.sessions} ses</span>
        <strong style="${getHistoryRowMetricStyle(getHistoryStatColor(roomStats.bigBlindDelta))}">${formatHistorySigned(roomStats.bigBlindsPerHour)}/h</strong>
      </div>
    `;
  }

  function renderHistorySessionRow(session) {
    return `
      <div style="${getHistorySessionRowStyle()}">
        <span style="${getHistoryRowLabelStyle()}color:#8FB8C4;">${escapeHistoryHtml(formatHistoryDateTime(session.endedAt))}</span>
        <strong style="${getHistoryRowMetricStyle(getHistoryStatColor(session.bigBlindDelta))}">${formatHistorySigned(session.bigBlindDelta)} BB</strong>
        <span style="${getHistoryRowMetricStyle(getHistoryStatColor(session.bigBlindDelta))}">${formatHistorySigned(session.bigBlindsPerHour)}/h</span>
        <span style="${getHistoryRowMutedValueStyle()}">${formatHistoryDuration(session.durationMs)}</span>
      </div>
    `;
  }

  function getHistoryInputStyle() {
    return "width:100%;min-width:0;box-sizing:border-box;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:5px;";
  }

  function getHistoryButtonStyle(active = false) {
    return [
      "border:1px solid rgba(191,231,241,.38)",
      `background:${active ? "rgba(126,214,196,.22)" : "rgba(8,17,23,.34)"}`,
      `color:${active ? "#F5FAFC" : "#BFE7F1"}`,
      "border-radius:4px",
      "padding:4px 7px",
      "font:11px/1.1 Arial,sans-serif",
      "cursor:pointer",
      "white-space:nowrap",
    ].join(";");
  }

  function getHistoryControlGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-bottom:12px;";
  }

  function getHistoryMetricGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px;";
  }

  function getHistorySplitGridStyle() {
    return "display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-bottom:12px;";
  }

  function getHistorySectionStyle() {
    return "border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:9px;background:rgba(255,255,255,.025);";
  }

  function getHistoryHeadingStyle() {
    return "margin-bottom:6px;color:#BFE7F1;font-weight:700;";
  }

  function getHistoryPeriodRowStyle() {
    return "display:grid;grid-template-columns:minmax(0,1fr) minmax(34px,auto) minmax(60px,auto) minmax(58px,auto);gap:6px;align-items:center;min-width:0;";
  }

  function getHistoryRoomRowStyle() {
    return "display:grid;grid-template-columns:minmax(0,1fr) minmax(34px,auto) minmax(62px,auto);gap:6px;align-items:center;min-width:0;";
  }

  function getHistorySessionRowStyle() {
    return "display:grid;grid-template-columns:minmax(92px,1fr) minmax(66px,auto) minmax(66px,auto) minmax(50px,auto);gap:8px;border-top:1px solid rgba(191,231,241,.1);padding-top:4px;align-items:center;min-width:0;";
  }

  function getHistoryRowLabelStyle() {
    return "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  }

  function getHistoryRowMutedValueStyle() {
    return "color:#8FB8C4;white-space:nowrap;text-align:right;";
  }

  function getHistoryRowMetricStyle(color) {
    return `color:${color};white-space:nowrap;text-align:right;`;
  }

  function formatHistorySigned(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return "n/a";
    }

    const number = Number(value);
    return `${number >= 0 ? "+" : ""}${number.toFixed(1)}`;
  }

  function getHistoryStatColor(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return "#8FB8C4";
    }

    return Number(value) >= 0 ? "#A7D8AD" : "#FFB0A8";
  }

  function formatHistoryChartValue(value, chartMode) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "n/a";
    }

    const decimals = Number.isInteger(chartMode.decimals) ? chartMode.decimals : 1;
    const formatted = decimals === 0 ? formatHistoryInteger(number) : number.toFixed(decimals);
    return `${number >= 0 ? "+" : ""}${formatted}${chartMode.suffix}`;
  }

  function formatHistoryChartAxisValue(value, chartMode = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "0";
    }

    if (chartMode.compactAxis || Math.abs(number) >= 1000) {
      return formatHistoryCompactNumber(number);
    }

    if (Number.isInteger(chartMode.decimals) && chartMode.decimals === 0) {
      return formatHistoryInteger(number);
    }

    if (Math.abs(number) >= 100) {
      return String(Math.round(number));
    }

    return number.toFixed(1);
  }

  function formatHistoryCompactNumber(value) {
    const number = Number(value);
    if (Math.abs(number) >= 1000) {
      return `${Math.round(number / 100) / 10}k`;
    }

    return formatHistoryInteger(number);
  }

  function formatHistoryInteger(value) {
    return String(Math.round(Number(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function getFiniteHistoryChartValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatHistoryChartPointLabel(session, previousSession) {
    const dateLabel = new Date(session.endedAt).toLocaleDateString([], {
      month: "numeric",
      day: "numeric",
    });
    const timeLabel = new Date(session.endedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const previousDateLabel = previousSession
      ? new Date(previousSession.endedAt).toLocaleDateString([], {
          month: "numeric",
          day: "numeric",
        })
      : "";

    if (!previousSession || previousDateLabel !== dateLabel) {
      return `${dateLabel}, ${timeLabel}`;
    }

    return timeLabel;
  }

  function getSessionBigBlindsPerHour(session) {
    const savedValue = Number(session.bigBlindsPerHour);
    if (Number.isFinite(savedValue)) {
      return savedValue;
    }

    const bigBlindDelta = Number(session.bigBlindDelta);
    const durationMs = Number(session.durationMs);
    if (!Number.isFinite(bigBlindDelta) || !Number.isFinite(durationMs) || durationMs <= 0) {
      return null;
    }

    return bigBlindDelta / (durationMs / 3600000);
  }

  function getCumulativeBigBlindsPerHour(cumulativeBigBlinds, cumulativeDurationMs) {
    if (!Number.isFinite(cumulativeBigBlinds) || !Number.isFinite(cumulativeDurationMs) || cumulativeDurationMs <= 0) {
      return null;
    }

    return cumulativeBigBlinds / (cumulativeDurationMs / 3600000);
  }

  function getHistoryChartYAxisLimit(values) {
    const maxMagnitude = Math.max(1, ...values.map((value) => Math.abs(value)));
    return maxMagnitude * 1.18;
  }

  function getChartConstructor() {
    return globalThis.Chart || window.Chart || pageWindow.Chart || null;
  }

  function destroySessionHistoryChart() {
    if (!sessionHistoryChart) {
      return;
    }

    sessionHistoryChart.destroy();
    sessionHistoryChart = null;
  }

  function zoomSessionHistoryDateRange(action) {
    const startInput = sessionHistoryPanel?.querySelector("[data-tj-session-history-start]");
    const endInput = sessionHistoryPanel?.querySelector("[data-tj-session-history-end]");
    if (!startInput || !endInput) {
      return;
    }

    const fullRange = getSessionHistoryDateRange();
    if (action === "reset") {
      startInput.value = fullRange.startDate;
      endInput.value = fullRange.endDate;
      renderSessionHistoryPanelBody();
      return;
    }

    const startTime = parseHistoryDateInput(startInput.value || fullRange.startDate);
    const endTime = parseHistoryDateInput(endInput.value || fullRange.endDate);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return;
    }

    const fullStartTime = parseHistoryDateInput(fullRange.startDate);
    const fullEndTime = parseHistoryDateInput(fullRange.endDate);
    const dayMs = 86400000;
    const inclusiveRangeMs = Math.max(dayMs, endTime - startTime + dayMs);
    const nextRangeMs = action === "in" ? Math.max(dayMs, inclusiveRangeMs / 2) : inclusiveRangeMs * 2;
    const centerTime = startTime + inclusiveRangeMs / 2;
    let nextStartTime = centerTime - nextRangeMs / 2;
    let nextEndTime = centerTime + nextRangeMs / 2 - dayMs;

    if (Number.isFinite(fullStartTime) && Number.isFinite(fullEndTime)) {
      if (nextStartTime < fullStartTime) {
        nextEndTime += fullStartTime - nextStartTime;
        nextStartTime = fullStartTime;
      }
      if (nextEndTime > fullEndTime) {
        nextStartTime -= nextEndTime - fullEndTime;
        nextEndTime = fullEndTime;
      }
      nextStartTime = Math.max(nextStartTime, fullStartTime);
      nextEndTime = Math.min(nextEndTime, fullEndTime);
    }

    startInput.value = formatSessionDateInput(nextStartTime);
    endInput.value = formatSessionDateInput(Math.max(nextStartTime, nextEndTime));
    renderSessionHistoryPanelBody();
  }

  function parseHistoryDateInput(value) {
    return new Date(`${value}T00:00:00`).getTime();
  }

  function formatHistoryDateTime(timestamp) {
    return new Date(timestamp).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatHistoryDuration(durationMs) {
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) {
      return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  function escapeHistoryHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeHistoryAttribute(value) {
    return escapeHistoryHtml(value);
  }

  // Session tracker
  const sessionTracker = {
    active: false,
    selfPlayerId: "",
    selfPlayerName: "",
    selfSeat: null,
    roomName: "",
    roomId: "",
    roomType: "",
    variantName: "",
    variantType: "",
    gameType: "",
    smallBlind: null,
    bigBlind: null,
    startStack: null,
    endStack: null,
    finalStackSeen: false,
    startedAt: 0,
    lastUpdateAt: 0,
  };
  let pendingSessionSummaryRender = null;

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

    cancelPendingSessionSummaryRender();
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
      roomType: "",
      variantName: "",
      variantType: "",
      gameType: "",
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
      sessionTracker.variantName = roomInfo.variantName || sessionTracker.variantName;
      sessionTracker.variantType = roomInfo.variantType || sessionTracker.variantType;
      const blindsField = roomInfo.infoFields?.find(([label]) => label === "Blinds");
      const gameTypeField = roomInfo.infoFields?.find(([label]) => label === "Game Type");
      if (gameTypeField?.[1]) {
        sessionTracker.gameType = gameTypeField[1];
      }
      if (blindsField) {
        const blindMatch = String(blindsField[1]).match(/\$?([\d,]+)\s*\/\s*\$?([\d,]+)/);
        if (blindMatch) {
          sessionTracker.smallBlind = Number(blindMatch[1].replace(/,/g, ""));
          sessionTracker.bigBlind = Number(blindMatch[2].replace(/,/g, ""));
        }
      }
      sessionTracker.roomType = getSessionRoomType();
    } catch {
      // Room info is optional; tuple-derived blinds still work without it.
    }
  }

  function finishSession() {
    if (!sessionTracker.active) {
      return;
    }

    const summary = buildSessionSummary();
    if (summary) {
      persistSessionSummary(summary);
      renderHelperPanels();
    }
    resetSessionTracker();

    if (summary && getSessionSummaryEnabled()) {
      scheduleSessionSummaryRender(summary);
    }
  }

  function scheduleSessionSummaryRender(summary) {
    cancelPendingSessionSummaryRender();

    let finished = false;
    let timerId = 0;
    const startedAt = performance.now();
    let lastMotionAt = startedAt;
    const minimumWaitMs = 500;
    const quietWaitMs = 180;
    const maximumWaitMs = 2500;

    const cleanup = () => {
      document.removeEventListener("transitionrun", markMotion, true);
      document.removeEventListener("transitionstart", markMotion, true);
      document.removeEventListener("transitionend", markMotion, true);
      document.removeEventListener("transitioncancel", markMotion, true);
      document.removeEventListener("animationstart", markMotion, true);
      document.removeEventListener("animationend", markMotion, true);
      document.removeEventListener("animationcancel", markMotion, true);
      window.clearTimeout(timerId);
      pendingSessionSummaryRender = null;
    };

    const finish = () => {
      if (finished) {
        return;
      }

      finished = true;
      cleanup();
      renderSessionSummary(summary);
    };

    function markMotion() {
      lastMotionAt = performance.now();
    }

    function hasRunningPageAnimations() {
      if (typeof document.getAnimations !== "function") {
        return false;
      }

      return document.getAnimations({ subtree: true }).some((animation) => {
        const target = animation.effect?.target;
        if (sessionSummaryPanel?.contains?.(target)) {
          return false;
        }

        return animation.playState === "running" || animation.playState === "pending";
      });
    }

    const tick = () => {
      const now = performance.now();
      if (hasRunningPageAnimations()) {
        lastMotionAt = now;
      }

      if (now - startedAt >= maximumWaitMs || (now - startedAt >= minimumWaitMs && now - lastMotionAt >= quietWaitMs)) {
        finish();
        return;
      }

      timerId = window.setTimeout(tick, 80);
    };

    document.addEventListener("transitionrun", markMotion, true);
    document.addEventListener("transitionstart", markMotion, true);
    document.addEventListener("transitionend", markMotion, true);
    document.addEventListener("transitioncancel", markMotion, true);
    document.addEventListener("animationstart", markMotion, true);
    document.addEventListener("animationend", markMotion, true);
    document.addEventListener("animationcancel", markMotion, true);

    pendingSessionSummaryRender = {
      cancel: cleanup,
    };
    tick();
  }

  function cancelPendingSessionSummaryRender() {
    pendingSessionSummaryRender?.cancel();
    pendingSessionSummaryRender = null;
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
      roomType: getSessionRoomType(),
      variantName: sessionTracker.variantName,
      variantType: sessionTracker.variantType,
      gameType: sessionTracker.gameType,
      smallBlind: sessionTracker.smallBlind,
      bigBlind,
      startStack: sessionTracker.startStack,
      endStack: sessionTracker.endStack,
      chipDelta,
      bigBlindDelta,
      bigBlindsPerHour,
      durationMs,
      endedAt,
    };
  }

  function getSessionRoomType() {
    const roomKind =
      sessionTracker.variantName || sessionTracker.variantType || sessionTracker.gameType || sessionTracker.roomName || "Unknown room";
    const blinds = formatBlindLevel(sessionTracker.smallBlind, sessionTracker.bigBlind);
    return blinds === "n/a" ? roomKind : `${roomKind} | ${blinds}`;
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

  // Quick bomb panel
  function renderQuickBombPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!isHelperPanelActive(QUICK_BOMB_PANEL_ID)) {
      quickBombPanel?.remove();
      quickBombPanel = null;
      return;
    }

    const panelMount = getHelperPanelMount();
    if (!panelMount) {
      return;
    }

    if (!quickBombPanel) {
      quickBombPanel = document.createElement("div");
      quickBombPanel.style.cssText = [
        "width:100%",
        "height:100%",
        "box-sizing:border-box",
        "overflow:auto",
        "padding:12px",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
      ].join(";");
      quickBombPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <strong style="font-size:13px;">Quick Bomb</strong>
        </div>
        <div style="display:grid;gap:10px;">
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Bomb spammer</span>
              <input data-tj-helper-quick-bomb-enabled type="checkbox" style="margin:0;" />
            </label>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 68px;gap:6px;align-items:center;margin-top:8px;color:#BFE7F1;">
              <label>Per ten seconds</label>
              <input data-tj-helper-quick-bomb-rate type="number" step="any" min="1" max="1000" style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
              <label>Speed</label>
              <select data-tj-helper-quick-bomb-speed-mode style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;">
                <option value="timed">Timed</option>
                <option value="instant">Instant</option>
              </select>
              <label>Limit</label>
              <select data-tj-helper-quick-bomb-mode style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;">
                <option value="duration">Duration</option>
                <option value="ammo">Ammo</option>
              </select>
              <label data-tj-helper-quick-bomb-duration-label>Seconds</label>
              <input data-tj-helper-quick-bomb-duration type="number" step="1" style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
              <label data-tj-helper-quick-bomb-ammo-label>Ammo</label>
              <input data-tj-helper-quick-bomb-ammo type="number" step="1" style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
              <button data-tj-helper-quick-bomb-start type="button" style="background:#7ED6C4;color:#0B1B20;border:0;border-radius:4px;padding:5px 8px;font-weight:700;">Start</button>
              <button data-tj-helper-quick-bomb-stop type="button" style="background:#DDEAF2;color:#0B1B20;border:0;border-radius:4px;padding:5px 8px;font-weight:700;">Stop</button>
            </div>
            <div data-tj-helper-quick-bomb-status style="margin-top:6px;color:#8FB8C4;font-size:11px;"></div>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Targets</div>
            <div data-tj-helper-quick-bomb-targets style="display:grid;gap:6px;"></div>
          </section>
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:8px;align-items:center;margin-bottom:8px;">
              <div style="color:#E9F7FA;font-weight:700;">Items</div>
              <select data-tj-helper-quick-bomb-item-sort style="min-width:0;background:#DDEAF2;color:#111;border:1px solid #74A7B9;border-radius:4px;padding:4px;">
                <option value="cost-asc">Cost ↑</option>
                <option value="cost-desc">Cost ↓</option>
                <option value="name">Name</option>
              </select>
            </div>
            <div data-tj-helper-quick-bomb-items style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;"></div>
          </section>
        </div>
      `;

      let previousRateValue = null;
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-enabled]").addEventListener("change", (event) => {
        setQuickBombEnabled(event.target.checked);
      });
      const rateInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-rate]");
      rateInput.addEventListener("change", (event) => {
        const newValue = parseFloat(event.target.value);
        if (previousRateValue !== null) {
          const diff = Math.abs(newValue - previousRateValue);
          if (Math.abs(diff - 1) < 0.01) {
            const roundedValue = Math.round(newValue);
            event.target.value = String(roundedValue);
            setQuickBombRate(roundedValue);
            previousRateValue = roundedValue;
            return;
          }
        }
        setQuickBombRate(event.target.value);
        previousRateValue = newValue;
      });
      rateInput.addEventListener("input", (event) => {
        previousRateValue = parseFloat(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-speed-mode]").addEventListener("change", (event) => {
        setQuickBombSpeedMode(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-mode]").addEventListener("change", (event) => {
        setQuickBombMode(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration]").addEventListener("change", (event) => {
        setQuickBombDuration(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo]").addEventListener("change", (event) => {
        setQuickBombAmmo(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-item-sort]").addEventListener("change", (event) => {
        setQuickBombItemSort(event.target.value);
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-start]").addEventListener("click", () => {
        sendQuickBombControl("start");
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-stop]").addEventListener("click", () => {
        sendQuickBombControl("stop");
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-targets]").addEventListener("click", (event) => {
        const targetButton = event.target.closest("[data-tj-helper-quick-bomb-target]");
        if (!targetButton) {
          return;
        }

        sendQuickBombControl("selectTarget", {
          playerId: targetButton.dataset.tjHelperPlayerId,
          playerName: targetButton.dataset.tjHelperPlayerName,
          seat: targetButton.dataset.tjHelperSeat,
        });
      });
      quickBombPanel.querySelector("[data-tj-helper-quick-bomb-items]").addEventListener("click", (event) => {
        const itemButton = event.target.closest("[data-tj-helper-quick-bomb-item]");
        if (!itemButton) {
          return;
        }

        sendQuickBombControl("selectItem", {
          itemKey: itemButton.dataset.tjHelperItemKey,
        });
      });
    }

    refreshQuickBombPanel();

    if (quickBombPanel.parentNode !== panelMount) {
      panelMount.replaceChildren(quickBombPanel);
    }
  }

  function refreshQuickBombPanel() {
    const enabledInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-enabled]");
    const rateInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-rate]");
    const speedModeSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-speed-mode]");
    const modeSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-mode]");
    const durationInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration]");
    const ammoInput = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo]");
    const durationLabel = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-duration-label]");
    const ammoLabel = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-ammo-label]");
    const startButton = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-start]");
    const stopButton = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-stop]");
    const statusElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-status]");
    const itemSortSelect = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-item-sort]");
    const itemsElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-items]");
    const targetsElement = quickBombPanel.querySelector("[data-tj-helper-quick-bomb-targets]");

    enabledInput.checked = getQuickBombEnabled();
    rateInput.value = String(getQuickBombRate());
    speedModeSelect.value = getQuickBombSpeedMode();
    modeSelect.value = getQuickBombMode();
    durationInput.value = String(getQuickBombDuration());
    ammoInput.value = String(getQuickBombAmmo());
    durationInput.style.display = getQuickBombMode() === "duration" ? "" : "none";
    durationLabel.style.display = getQuickBombMode() === "duration" ? "" : "none";
    ammoInput.style.display = getQuickBombMode() === "ammo" ? "" : "none";
    ammoLabel.style.display = getQuickBombMode() === "ammo" ? "" : "none";
    itemSortSelect.value = getQuickBombItemSort();

    const players = Array.isArray(state.quickBombPlayers) ? state.quickBombPlayers : [];
    const selectedTarget = players.find((player) => player.playerId === state.quickBombSelectedPlayerId);
    const hasTarget = Boolean(selectedTarget?.playerName);
    const hasItem = Boolean(state.quickBombSelectedItem || state.quickBombLastItem);
    const canStart = state.quickBombInRoom && hasTarget && hasItem && getQuickBombEnabled() && !state.quickBombActive;
    startButton.disabled = !canStart;
    stopButton.disabled = !state.quickBombActive;
    startButton.style.opacity = startButton.disabled ? ".5" : "1";
    stopButton.style.opacity = stopButton.disabled ? ".5" : "1";
    const activeItem = state.quickBombSelectedItem || state.quickBombLastItem;
    statusElement.textContent = activeItem
      ? `Selected: ${activeItem} | last thrown: ${state.quickBombLastItem || "none"} | cost ${state.quickBombAmmoCost || 1} | sent ${state.quickBombReplayCount || 0}${
          state.quickBombActive ? ` | remaining ${state.quickBombRemaining || 0}` : ""
        }`
      : "Select an item or throw one bomb.";
    renderQuickBombTargets(targetsElement);
    renderQuickBombItems(itemsElement);

  }

  function renderQuickBombItems(itemsElement) {
    const items = sortQuickBombItems(Array.isArray(state.quickBombItems) ? state.quickBombItems : []);
    const selectedItem = state.quickBombSelectedItem || state.quickBombLastItem;
    if (!items.length) {
      itemsElement.innerHTML = `<div style="grid-column:1/-1;color:#8FB8C4;">Waiting for item definitions.</div>`;
      return;
    }

    itemsElement.innerHTML = items
      .map((item) => {
        const selected = item.itemKey === selectedItem;
        return `
          <button
            type="button"
            data-tj-helper-quick-bomb-item="1"
            data-tj-helper-item-key="${escapeQuickBombHtml(item.itemKey)}"
            style="min-width:0;text-align:left;border:1px solid ${selected ? "rgba(126,214,196,.95)" : "rgba(191,231,241,.2)"};border-radius:6px;background:${selected ? "rgba(126,214,196,.16)" : "rgba(255,255,255,.035)"};color:#F5FAFC;padding:7px;cursor:pointer;"
          >
            <span style="display:block;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeQuickBombHtml(item.label || item.itemKey)}</span>
            <span style="display:block;color:#8FB8C4;font-size:11px;margin-top:2px;">${escapeQuickBombHtml(item.itemKey)} | ${escapeQuickBombHtml(item.cost || 1)}</span>
          </button>
        `;
      })
      .join("");
  }

  function sortQuickBombItems(items) {
    const sort = getQuickBombItemSort();
    return [...items].sort((a, b) => {
      if (sort === "cost-asc") {
        return Number(a.cost || 0) - Number(b.cost || 0) || compareQuickBombItemNames(a, b);
      }

      if (sort === "cost-desc") {
        return Number(b.cost || 0) - Number(a.cost || 0) || compareQuickBombItemNames(a, b);
      }

      return compareQuickBombItemNames(a, b);
    });
  }

  function compareQuickBombItemNames(a, b) {
    return String(a.label || a.itemKey).localeCompare(String(b.label || b.itemKey));
  }

  function renderQuickBombTargets(targetsElement) {
    const players = Array.isArray(state.quickBombPlayers) ? state.quickBombPlayers : [];
    if (!state.quickBombInRoom) {
      targetsElement.innerHTML = `<div style="color:#8FB8C4;">Not in a room.</div>`;
      return;
    }

    if (!players.length) {
      targetsElement.innerHTML = `<div style="color:#8FB8C4;">No room players found.</div>`;
      return;
    }

    targetsElement.innerHTML = players
      .map((player) => {
        const selected = player.playerId === state.quickBombSelectedPlayerId;
        return `
          <button
            type="button"
            data-tj-helper-quick-bomb-target="1"
            data-tj-helper-player-id="${escapeQuickBombHtml(player.playerId)}"
            data-tj-helper-player-name="${escapeQuickBombHtml(player.playerName)}"
            data-tj-helper-seat="${escapeQuickBombHtml(player.seat)}"
            style="width:100%;text-align:left;border:1px solid ${selected ? "rgba(126,214,196,.95)" : "rgba(191,231,241,.2)"};border-radius:6px;background:${selected ? "rgba(126,214,196,.16)" : "rgba(255,255,255,.035)"};color:#F5FAFC;padding:8px;cursor:pointer;"
          >
            <span style="display:block;font-weight:700;">${escapeQuickBombHtml(player.playerName || `Seat ${player.seat}`)}</span>
            <span style="display:block;color:#8FB8C4;font-size:11px;margin-top:2px;">Seat ${escapeQuickBombHtml(player.seat)}${selected ? " | selected" : ""}</span>
          </button>
        `;
      })
      .join("");
  }

  function escapeQuickBombHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Settings panel
  function renderStatusPanel() {
    if (!document.documentElement) {
      return;
    }

    if (!isHelperPanelActive(SETTINGS_PANEL_ID)) {
      statusPanel?.remove();
      statusPanel = null;
      return;
    }

    const panelMount = getHelperPanelMount();
    if (!panelMount) {
      return;
    }

    if (!statusPanel) {
      statusPanel = document.createElement("div");
      statusPanel.style.cssText = [
        "width:100%",
        "height:100%",
        "box-sizing:border-box",
        "overflow:auto",
        "padding:12px",
        "color:#F5FAFC",
        "font:12px/1.35 Arial,sans-serif",
      ].join(";");
      statusPanel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
          <strong style="font-size:13px;">Triplejack Helper</strong>
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
          <section style="border:1px solid rgba(191,231,241,.2);border-radius:6px;padding:10px;background:rgba(255,255,255,.025);">
            <div style="margin-bottom:8px;color:#E9F7FA;font-weight:700;">Panel</div>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#BFE7F1;">
              <span>Use custom panel width</span>
              <input data-tj-helper-panel-width-enabled type="checkbox" style="margin:0;" />
            </label>
            <input
              data-tj-helper-panel-width
              type="range"
              min="${HELPER_PANEL_MIN_WIDTH}"
              max="${HELPER_PANEL_MAX_WIDTH}"
              step="1"
              style="width:100%;margin:9px 0 0;accent-color:#7ED6C4;"
            />
            <div data-tj-helper-panel-width-value style="margin-top:6px;color:#8FB8C4;font-size:11px;"></div>
          </section>
          <div style="border-top:1px solid rgba(191,231,241,.22);padding-top:8px;">
            <div style="margin-bottom:6px;color:#E9F7FA;font-weight:700;">Status</div>
            <div data-tj-helper-stats style="color:#D6EEF5;"></div>
            <div data-tj-helper-status style="margin-top:6px;color:#A7D8AD;"></div>
          </div>
        </div>
      `;

      const languageSelect = statusPanel.querySelector("[data-tj-helper-language]");
      const customLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-language]");
      const outgoingEnabledInput = statusPanel.querySelector("[data-tj-helper-outgoing-enabled]");
      const outgoingLanguageSelect = statusPanel.querySelector("[data-tj-helper-outgoing-language]");
      const customOutgoingLanguageInput = statusPanel.querySelector("[data-tj-helper-custom-outgoing-language]");
      const messageTimestampsInput = statusPanel.querySelector("[data-tj-helper-message-timestamps-enabled]");
      const sessionSummaryInput = statusPanel.querySelector("[data-tj-helper-session-summary-enabled]");
      const panelWidthEnabledInput = statusPanel.querySelector("[data-tj-helper-panel-width-enabled]");
      const panelWidthInput = statusPanel.querySelector("[data-tj-helper-panel-width]");
      const panelWidthValueElement = statusPanel.querySelector("[data-tj-helper-panel-width-value]");

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

      panelWidthEnabledInput.addEventListener("change", () => {
        setHelperPanelWidthEnabled(panelWidthEnabledInput.checked);
      });

      panelWidthInput.addEventListener("input", () => {
        setHelperPanelWidth(panelWidthInput.value, { silent: true });
        refreshNativeLayoutAfterPanelWidthChange();
        panelWidthEnabledInput.checked = getHelperPanelWidthEnabled();
        panelWidthValueElement.textContent = `Current custom width: ${getHelperPanelWidth()}px`;
      });

      panelWidthInput.addEventListener("change", () => {
        setHelperPanelWidth(panelWidthInput.value);
        refreshNativeLayoutAfterPanelWidthChange();
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
    const panelWidthEnabledInput = statusPanel.querySelector("[data-tj-helper-panel-width-enabled]");
    const panelWidthInput = statusPanel.querySelector("[data-tj-helper-panel-width]");
    const panelWidthValueElement = statusPanel.querySelector("[data-tj-helper-panel-width-value]");
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
    panelWidthEnabledInput.checked = getHelperPanelWidthEnabled();
    panelWidthInput.value = String(getHelperPanelWidth());
    panelWidthInput.disabled = !getHelperPanelWidthEnabled();
    panelWidthInput.style.opacity = getHelperPanelWidthEnabled() ? "1" : ".48";
    panelWidthValueElement.textContent = `Current custom width: ${getHelperPanelWidth()}px`;
    statsElement.textContent = `${state.hooked ? "hooked" : "not hooked"} | sockets ${state.sockets}, messages ${state.chatsSeen}, translations ${state.translationsShown}`;
    statusElement.textContent = state.lastStatus;

    if (statusPanel.parentNode !== panelMount) {
      panelMount.replaceChildren(statusPanel);
    }

  }

  // Startup
  function main() {
    GM_registerMenuCommand("Show Triplejack Helper status", () => {
      openHelperPanel(SETTINGS_PANEL_ID);
      alert(`${SCRIPT_NAME}\n${state.lastStatus}`);
    });
    GM_registerMenuCommand("Set Triplejack target language", promptForTargetLanguage);

    installKeyboardShortcuts();
    installToolbarButton();
    installMessageTimestamps();
    installSessionTracker();
    installTranslationFeature();
    setStatus("loaded");
    renderHelperPanels();
  }

  main();

})();
