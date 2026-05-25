const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "src");
const outputPath = path.join(rootDir, "triplejack.user.js");

const sections = [
  ["Configuration", "config.js"],
  ["Userscript bridge", "bridge.js"],
  ["Page WebSocket hook", "page-hook.js"],
  ["Translation service", "translate.js"],
  ["Settings", "settings.js"],
  ["Toolbar", "toolbar.js"],
  ["Message timestamps", "timestamps.js"],
  ["Session tracker", "session-tracker.js"],
  ["Settings panel", "panel.js"],
  ["Startup", "main.js"],
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
