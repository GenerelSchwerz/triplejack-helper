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
