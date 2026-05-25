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
