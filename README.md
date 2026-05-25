# Triplejack Helper

Tampermonkey userscript for Triplejack Poker chat translation, message utilities, and session tracking.

## Install

Open the raw `triplejack.user.js` file from this repository in your browser and let Tampermonkey install it.

## Features

- Translates public chat messages.
- Translates direct messages.
- Optional translation for sent public chat and direct messages.
- Configurable incoming and outgoing target languages.
- Optional message timestamps.
- Quick bomb spammer: provides a dedicated panel, selects throwable item types from live item definitions, targets selected room players, and sends by rate, duration, ammo count, or instant burst with `Ctrl+Shift+B`.
- Ammo count mode converts ammo to throw packets using item costs learned from websocket item-definition frames.
- Optional table session summary when leaving a room.
- Persistent session history with date, room type, and period filters.
- Session history charting with selectable BB/hour, net BB, and cumulative BB line views over the selected time range.

## External Libraries

The userscript loads Chart.js through Tampermonkey `@require`:

```txt
https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js
```

Chart.js is used only for the session history chart. The dependency is pinned to version `4.5.1` and is loaded from jsDelivr's npm CDN. Chart.js is licensed under MIT.

## Development

Edit the readable source files in `src/`, then run `npm run build` to regenerate `triplejack.user.js`.
The generated userscript is intentionally not minified or obfuscated so it remains easy to review before publishing.

Run `npm run check` before committing to rebuild the userscript and syntax-check the generated output.

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
Chart.js is loaded by Tampermonkey from jsDelivr when the userscript is installed or updated. Session history is stored locally in your browser storage.

## License

MIT
