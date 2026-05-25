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
      enabledStorageKey: QUICK_BOMB_ENABLED_STORAGE_KEY,
      hotkey: QUICK_BOMB_KEY,
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
