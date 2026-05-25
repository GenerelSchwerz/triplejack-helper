  const SCRIPT_NAME = "Triplejack Helper";
  const DEFAULT_TARGET_LANGUAGE = "en";
  const LANGUAGE_STORAGE_KEY = "triplejack-helper-target-language";
  const OUTGOING_LANGUAGE_STORAGE_KEY = "triplejack-helper-outgoing-language";
  const OUTGOING_ENABLED_STORAGE_KEY = "triplejack-helper-outgoing-enabled";
  const MESSAGE_TIMESTAMPS_STORAGE_KEY = "triplejack-helper-message-timestamps-enabled";
  const PANEL_TOGGLE_KEY = "L";
  const LANGUAGE_PROMPT_KEY = "Y";
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
  const STATUS_EVENT = "tj-helper-status";
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const translationCache = new Map();
  const state = {
    hooked: false,
    sockets: 0,
    chatsSeen: 0,
    translationsShown: 0,
    lastStatus: "starting",
    panelVisible: false,
  };
  let statusPanel;
  let timestampObserver;
  let timestampRenderQueued = false;
