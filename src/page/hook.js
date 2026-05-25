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
