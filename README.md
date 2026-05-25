# Triplejack Helper

Tampermonkey userscript for Triplejack Poker chat translation.

## Install

Open the raw `triplejack.user.js` file from this repository in your browser and let Tampermonkey install it.

## Features

- Translates public chat messages.
- Translates direct messages.
- Optional translation for sent public chat and direct messages.
- Configurable incoming and outgoing target languages.

## Development

Edit the readable source files in `src/`, then run `npm run build` to regenerate `triplejack.user.js`.
The generated userscript is intentionally not minified or obfuscated so it remains easy to review before publishing.

### WebSocket Packet Interceptors

Modules can listen for `tj-helper-websocket-packet` to observe, modify, or cancel WebSocket packets before the page handles them.

```js
document.addEventListener("tj-helper-websocket-packet", (event) => {
  if (event.detail.direction !== "incoming") {
    return;
  }

  if (event.detail.command === "lounge") {
    event.detail.data = event.detail.data.replace("lounge:", "lounge:[seen] ");
  }

  if (event.detail.command === "newbomb") {
    event.preventDefault();
  }
});
```

## Privacy

Messages translated by this script are sent to Google Translate through `translate.googleapis.com`.

## License

MIT
