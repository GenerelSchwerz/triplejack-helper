  function pageWebSocketHook(config) {
    const TRANSLATED_MARKER = "data-tj-translated";
    const NativeWebSocket = window.WebSocket;
    const pendingRequests = new Map();
    const pendingOutgoingRequests = new Map();
    const requestedPrivateMessageIds = new Set();
    const redispatchedIncomingEvents = new WeakSet();
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

            data = interceptedPacket.data;

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
        handleIncomingWebSocketMessage(interceptedPacket.data, socket, socketId);
        return;
      }

      handleIncomingWebSocketMessage(event.data, socket, socketId);
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

    function handleIncomingWebSocketMessage(data, socket, socketId) {
      if (typeof data !== "string") {
        return;
      }

      const chatMessages = parseTranslatableMessages(data);
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
