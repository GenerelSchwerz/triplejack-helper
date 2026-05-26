  const SCRIPT_NAME = "Triplejack Helper";
  const DEFAULT_TARGET_LANGUAGE = "en";
  const LANGUAGE_STORAGE_KEY = "triplejack-helper-target-language";
  const OUTGOING_LANGUAGE_STORAGE_KEY = "triplejack-helper-outgoing-language";
  const OUTGOING_ENABLED_STORAGE_KEY = "triplejack-helper-outgoing-enabled";
  const MESSAGE_TIMESTAMPS_STORAGE_KEY = "triplejack-helper-message-timestamps-enabled";
  const SESSION_SUMMARY_STORAGE_KEY = "triplejack-helper-session-summary-enabled";
  const SESSION_HISTORY_STORAGE_KEY = "triplejack-helper-session-history";
  const QUICK_BOMB_ENABLED_STORAGE_KEY = "triplejack-helper-quick-bomb-enabled";
  const QUICK_BOMB_RATE_STORAGE_KEY = "triplejack-helper-quick-bomb-rate";
  const QUICK_BOMB_SPEED_MODE_STORAGE_KEY = "triplejack-helper-quick-bomb-speed-mode";
  const QUICK_BOMB_MODE_STORAGE_KEY = "triplejack-helper-quick-bomb-mode";
  const QUICK_BOMB_DURATION_STORAGE_KEY = "triplejack-helper-quick-bomb-duration";
  const QUICK_BOMB_AMMO_STORAGE_KEY = "triplejack-helper-quick-bomb-ammo";
  const QUICK_BOMB_ITEM_SORT_STORAGE_KEY = "triplejack-helper-quick-bomb-item-sort";
  const HELPER_PANEL_WIDTH_STORAGE_KEY = "triplejack-helper-panel-width";
  const HELPER_PANEL_WIDTH_ENABLED_STORAGE_KEY = "triplejack-helper-panel-width-enabled";
  const PANEL_TOGGLE_KEY = "L";
  const LANGUAGE_PROMPT_KEY = "Y";
  const QUICK_BOMB_KEY = "B";
  const QUICK_BOMB_CONTROL_EVENT = "tj-helper-quick-bomb-control";
  const QUICK_BOMB_DEFAULT_RATE = 8;
  const QUICK_BOMB_DEFAULT_DURATION_SECONDS = 3;
  const QUICK_BOMB_DEFAULT_AMMO = 20;
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
  const PACKET_INTERCEPT_EVENT = "tj-helper-websocket-packet";
  const SOCKET_MESSAGE_EVENT = "tj-helper-websocket-message";
  const STATUS_EVENT = "tj-helper-status";
  const HELPER_PANEL_WIDTH = 390;
  const HELPER_PANEL_MIN_WIDTH = 300;
  const HELPER_PANEL_MAX_WIDTH = 720;
  const PANEL_DEBUG_LOG_PREFIX = "[Triplejack Helper panels]";
  const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
  const translationCache = new Map();
  const state = {
    hooked: false,
    sockets: 0,
    chatsSeen: 0,
    translationsShown: 0,
    lastStatus: "starting",
    activePanelId: "",
    quickBombLastItem: "",
    quickBombSelectedItem: "",
    quickBombItems: [],
    quickBombAmmoCost: 1,
    quickBombInRoom: false,
    quickBombPlayers: [],
    quickBombSelectedPlayerId: "",
    quickBombReplayCount: 0,
    quickBombActive: false,
    quickBombRemaining: 0,
  };
  let statusPanel;
  let sessionSummaryPanel;
  let sessionHistoryPanel;
  let quickBombPanel;
  let helperPanelHost;
  let timestampObserver;
  let timestampRenderQueued = false;
  const privateMessageTimestampsByText = new Map();

  function logPanelDebug(action, details = {}) {
    console.debug(PANEL_DEBUG_LOG_PREFIX, action, details);
  }
