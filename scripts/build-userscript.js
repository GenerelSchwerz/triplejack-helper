const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "src");
const outputPath = path.join(rootDir, "triplejack.user.js");

const sections = [
  ["Configuration", "core/config.js"],
  ["Translation protocol", "features/translation/protocol.js"],
  ["Translation renderer", "features/translation/renderer.js"],
  ["Translation controller", "features/translation/controller.js"],
  ["Quick bomb controller", "features/bombs/quick-bomb.js"],
  ["Page WebSocket hook", "page/hook.js"],
  ["Translation service", "features/translation/service.js"],
  ["Translation bridge", "features/translation/bridge.js"],
  ["Panel manager", "ui/panel-manager.js"],
  ["Settings", "core/settings.js"],
  ["Toolbar", "ui/toolbar.js"],
  ["Message timestamps", "features/messages/timestamps.js"],
  ["Session history store", "features/session/history.js"],
  ["Session history panel", "features/session/history-panel.js"],
  ["Session tracker", "features/session/tracker.js"],
  ["Settings panel", "ui/panel.js"],
  ["Startup", "core/main.js"],
];

function readSourceFile(fileName) {
  return fs.readFileSync(path.join(sourceDir, fileName), "utf8").replace(/^\uFEFF/, "").trimEnd();
}

const output = [
  readSourceFile("metadata.js"),
  "",
  "(function () {",
  '  "use strict";',
  "",
  ...sections.flatMap(([title, fileName]) => {
    return [`  // ${title}`, readSourceFile(fileName), ""];
  }),
  "})();",
  "",
].join("\n");

fs.writeFileSync(outputPath, output, "utf8");
