import {
  addReading,
  dailyPoemIndex,
  localDateKey,
  normalizeReadingStats,
  readingStreak,
} from "./reading-insights.js";
import {
  checkRecallAnswer,
  createRecallPrompt,
  dueLearningPoemIds,
  learningProgressCounts,
  normalizeLearningProgress,
  scheduleLearningReview,
} from "./learning-progress.js";
import {
  buildShareFileName,
  createSharePoster,
} from "./share-poster.js";

const DATA_VERSION = "1.15.0";
const FAVORITES_KEY = "poem-favorites-v2";
const THEME_KEY = "poem-theme-v1";
const FONT_KEY = "poem-font-v1";
const SCRIPT_KEY = "poem-script-v1";
const AUTO_NEXT_KEY = "poem-auto-next-seconds-v1";
// v2 将 1.13 的新默认迁移到“深度精读”；旧版保存的“已校精选”不应绕过本次定位升级。
const REVIEW_MODE_KEY = "poem-review-mode-v2";
const READING_STATS_KEY = "poem-reading-stats-v1";
const LEARNING_PROGRESS_KEY = "poem-learning-progress-v1";
// 自动切换首次使用时保持关闭；用户主动选择过的合法间隔仍会从本地设置恢复。
const DEFAULT_AUTO_NEXT_SECONDS = 0;
const AUTO_NEXT_INTERVALS = new Set([0, 30, 60, 120, 300, 600, 1200, 1800, 3600]);
const MAX_SEARCH_RESULTS = 120;
const MAX_READING_HISTORY = 30;
const FEEDBACK_ISSUE_URL = "https://github.com/Kua-Fu/shiyi-yike/issues/new";
const PERIOD_ORDER = ["先秦", "汉魏六朝", "唐代", "宋代", "元代", "明代", "清代"];
const THEMES = new Map([
  ["xuan", { name: "宣纸雅韵", shortName: "宣纸", colorScheme: "light", themeColor: "#d5d0c4" }],
  ["yuebai", { name: "月白清辉", shortName: "月白", colorScheme: "light", themeColor: "#b8c4cc" }],
  ["qingci", { name: "雨过青瓷", shortName: "青瓷", colorScheme: "light", themeColor: "#b8c8c0" }],
  ["taojian", { name: "桃花小笺", shortName: "桃笺", colorScheme: "light", themeColor: "#d9c1bd" }],
  ["zhuying", { name: "竹影新绿", shortName: "竹影", colorScheme: "light", themeColor: "#bcc1ae" }],
  ["songyan", { name: "松烟夜读", shortName: "松烟", colorScheme: "dark", themeColor: "#101513" }],
]);
const FONTS = new Map([
  ["default", { name: "默认雅韵" }],
  ["kai", { name: "楷体书卷" }],
  ["song", { name: "宋体典雅" }],
  ["fangsong", { name: "仿宋清朗" }],
  ["sans", { name: "黑体简净" }],
  ["xingshu", { name: "行书逸韵" }],
]);
// 诗库只保留一份简体源数据：展示时转为繁体，搜索时再归一化为简体，避免维护两套正文。
const OPENCC = globalThis.OpenCC;
const TO_TRADITIONAL = OPENCC?.Converter
  ? OPENCC.Converter({ from: "cn", to: "tw" })
  : (value) => String(value);
const TO_SIMPLIFIED = OPENCC?.Converter
  ? OPENCC.Converter({ from: "tw", to: "cn" })
  : (value) => String(value);
const STATIC_SCRIPT_CONVERTER = OPENCC?.HTMLConverter
  ? OPENCC.HTMLConverter(
      TO_TRADITIONAL,
      document.documentElement,
      "zh-CN",
      "zh-Hant",
    )
  : { convert() {}, restore() {} };

const state = {
  index: [],
  poemsById: new Map(),
  authors: new Map(),
  deepReadings: new Map(),
  deepSources: new Map(),
  deepEditorialPolicy: "",
  category: "全部",
  period: "",
  author: "",
  tag: "",
  reviewMode: "deep",
  reviewCounts: { deep: 0, reviewed: 0, all: 0 },
  current: null,
  previousPoems: [],
  recentPoemIds: [],
  activeAuthor: null,
  theme: "xuan",
  font: "default",
  script: "simplified",
  noticeMessage: "正在展开一百篇深度精读诗词…",
  emptyCollection: false,
  favorites: new Set(),
  readingStats: normalizeReadingStats(null),
  learningProgress: normalizeLearningProgress(null),
  practice: null,
  chunks: new Map(),
  searchRecordsPromise: null,
  searchRequestId: 0,
  requestId: 0,
  busy: false,
  ready: false,
  autoNextSeconds: DEFAULT_AUTO_NEXT_SECONDS,
  autoNextTimer: null,
  autoNextProgressTimer: null,
  autoNextStartedAt: null,
  autoNextDeadline: null,
  noticeDismissTimer: null,
  sharePosterPoemId: null,
};

const elements = {
  categoryButtons: [...document.querySelectorAll("[data-category]")],
  themeColorMeta: document.querySelector("#theme-color-meta"),
  themeTrigger: document.querySelector("#theme-trigger"),
  themeTriggerName: document.querySelector("#theme-trigger-name"),
  themeDialog: document.querySelector("#theme-dialog"),
  themeDialogClose: document.querySelector("#theme-dialog-close"),
  themeOptions: [...document.querySelectorAll("[data-theme-option]")],
  fontOptions: [...document.querySelectorAll("[data-font-option]")],
  scriptOptions: [...document.querySelectorAll("[data-script-option]")],
  dailyTrigger: document.querySelector("#daily-trigger"),
  dailyTriggerMark: document.querySelector("#daily-trigger-mark"),
  dailyTriggerName: document.querySelector("#daily-trigger-name"),
  libraryPanel: document.querySelector("#library-panel"),
  librarySummary: document.querySelector("#library-summary"),
  reviewModeSelect: document.querySelector("#review-mode-select"),
  periodSelect: document.querySelector("#period-select"),
  authorLabel: document.querySelector("#author-label"),
  authorSelect: document.querySelector("#author-select"),
  tagSelect: document.querySelector("#tag-select"),
  resultCount: document.querySelector("#result-count"),
  resultUnit: document.querySelector("#result-unit"),
  resultTrigger: document.querySelector("#result-trigger"),
  clearFilter: document.querySelector("#clear-filter"),
  favoriteNavCount: document.querySelector("#favorite-nav-count"),
  folioNo: document.querySelector("#folio-no"),
  readingScroll: document.querySelector("#reading-scroll"),
  poem: document.querySelector("#poem"),
  bigCharacter: document.querySelector("#big-character"),
  context: document.querySelector("#context"),
  favoriteAction: document.querySelector("#favorite-action"),
  favoriteIcon: document.querySelector("#favorite-icon"),
  favoriteLabel: document.querySelector("#favorite-label"),
  favoriteLabelShort: document.querySelector("#favorite-label-short"),
  nextAction: document.querySelector("#next-action"),
  nextLabel: document.querySelector("#next-label"),
  previousAction: document.querySelector("#previous-action"),
  autoNextField: document.querySelector("#auto-next-field"),
  autoNextSelect: document.querySelector("#auto-next-select"),
  autoNextProgress: document.querySelector("#auto-next-progress"),
  autoNextProgressTrack: document.querySelector("#auto-next-progress-track"),
  autoNextProgressFill: document.querySelector("#auto-next-progress-fill"),
  autoNextRemaining: document.querySelector("#auto-next-remaining"),
  copyAction: document.querySelector("#copy-action"),
  shareAction: document.querySelector("#share-action"),
  shareDialog: document.querySelector("#share-dialog"),
  shareDialogClose: document.querySelector("#share-dialog-close"),
  shareCanvas: document.querySelector("#share-canvas"),
  shareLoading: document.querySelector("#share-loading"),
  shareDialogStatus: document.querySelector("#share-dialog-status"),
  shareCopyAction: document.querySelector("#share-copy-action"),
  shareDownloadAction: document.querySelector("#share-download-action"),
  shareDownloadLabel: document.querySelector("#share-download-label"),
  notice: document.querySelector("#notice"),
  poemListDialog: document.querySelector("#poem-list-dialog"),
  poemListTitle: document.querySelector("#poem-list-title"),
  poemListSummary: document.querySelector("#poem-list-summary"),
  poemListClose: document.querySelector("#poem-list-close"),
  poemListSearch: document.querySelector("#poem-list-search"),
  poemList: document.querySelector("#poem-list"),
  poemListEmpty: document.querySelector("#poem-list-empty"),
  searchTrigger: document.querySelector("#search-trigger"),
  feedbackTrigger: document.querySelector("#feedback-trigger"),
  searchDialog: document.querySelector("#search-dialog"),
  searchDialogClose: document.querySelector("#search-dialog-close"),
  globalSearchInput: document.querySelector("#global-search-input"),
  searchSummary: document.querySelector("#search-summary"),
  searchResults: document.querySelector("#search-results"),
  searchEmpty: document.querySelector("#search-empty"),
  authorDialog: document.querySelector("#author-dialog"),
  authorDialogName: document.querySelector("#author-dialog-name"),
  authorDialogMeta: document.querySelector("#author-dialog-meta"),
  authorDialogBiography: document.querySelector("#author-dialog-biography"),
  authorDialogSource: document.querySelector("#author-dialog-source"),
  authorDialogClose: document.querySelector("#author-dialog-close"),
  authorWorksAction: document.querySelector("#author-works-action"),
  authorWorksCount: document.querySelector("#author-works-count"),
  learningDialog: document.querySelector("#learning-dialog"),
  learningDialogTitle: document.querySelector("#learning-dialog-title"),
  learningDialogMeta: document.querySelector("#learning-dialog-meta"),
  learningDialogClose: document.querySelector("#learning-dialog-close"),
  learningPractice: document.querySelector("#learning-practice"),
  learningStep: document.querySelector("#learning-step"),
  learningProgressTrack: document.querySelector("#learning-progress-track"),
  learningProgressFill: document.querySelector("#learning-progress-fill"),
  learningPrompt: document.querySelector("#learning-prompt"),
  learningAnswer: document.querySelector("#learning-answer"),
  learningCheck: document.querySelector("#learning-check"),
  learningNext: document.querySelector("#learning-next"),
  learningResult: document.querySelector("#learning-result"),
  learningResultTitle: document.querySelector("#learning-result-title"),
  learningResultAnswer: document.querySelector("#learning-result-answer"),
  learningComplete: document.querySelector("#learning-complete"),
  learningScore: document.querySelector("#learning-score"),
  learningRatingHint: document.querySelector("#learning-rating-hint"),
  learningRatingButtons: [
    ...document.querySelectorAll("[data-learning-rating]"),
  ],
};

function displayText(value) {
  const text = String(value ?? "");
  return state.script === "traditional" ? TO_TRADITIONAL(text) : text;
}

function localizedTextNode(text) {
  return document.createTextNode(displayText(text));
}

function setLocalizedText(element, text) {
  element.textContent = displayText(text);
}

function setLocalizedAttribute(element, name, value) {
  element.setAttribute(name, displayText(value));
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) setLocalizedText(element, text);
  return element;
}

function updateAppearanceTrigger() {
  const theme = THEMES.get(state.theme);
  const font = FONTS.get(state.font);
  const scriptName = state.script === "traditional" ? "繁体中文" : "简体中文";
  setLocalizedAttribute(
    elements.themeTrigger,
    "aria-label",
    `打开外观设置，当前皮肤为${theme.name}，字体为${font.name}，文字为${scriptName}`,
  );
  elements.themeTrigger.title = displayText(
    `外观设置 · ${theme.shortName} · ${font.name} · ${scriptName}`,
  );
}

function applyTheme(themeId, options = {}) {
  const normalizedThemeId = THEMES.has(themeId) ? themeId : "xuan";
  const theme = THEMES.get(normalizedThemeId);
  state.theme = normalizedThemeId;
  document.documentElement.dataset.theme = normalizedThemeId;
  document.documentElement.style.colorScheme = theme.colorScheme;
  elements.themeColorMeta.content = theme.themeColor;
  setLocalizedText(elements.themeTriggerName, theme.shortName);
  updateAppearanceTrigger();

  for (const option of elements.themeOptions) {
    option.setAttribute(
      "aria-checked",
      String(option.dataset.themeOption === normalizedThemeId),
    );
  }

  if (options.persist) saveTheme();
  if (options.announce) updateNotice(`已换上「${theme.name}」`);
}

function applyFont(fontId, options = {}) {
  const normalizedFontId = FONTS.has(fontId) ? fontId : "default";
  const font = FONTS.get(normalizedFontId);
  state.font = normalizedFontId;
  document.documentElement.dataset.font = normalizedFontId;
  updateAppearanceTrigger();

  for (const option of elements.fontOptions) {
    option.setAttribute(
      "aria-checked",
      String(option.dataset.fontOption === normalizedFontId),
    );
  }

  if (options.persist) saveFont();
  if (options.announce) updateNotice(`已切换为「${font.name}」`);
}

function loadTheme() {
  return new Promise((resolve) => {
    const finish = (themeId) => {
      applyTheme(typeof themeId === "string" ? themeId : "xuan");
      resolve();
    };

    if (!globalThis.chrome?.storage?.local) {
      try {
        finish(localStorage.getItem(THEME_KEY));
      } catch {
        finish("xuan");
      }
      return;
    }

    chrome.storage.local.get([THEME_KEY], (result) => finish(result[THEME_KEY]));
  });
}

function saveTheme() {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [THEME_KEY]: state.theme });
    return;
  }
  try {
    localStorage.setItem(THEME_KEY, state.theme);
  } catch {
    // 隐私浏览或受限预览环境可能禁止本地存储，皮肤仍可在本次页面中使用。
  }
}

function loadFont() {
  return new Promise((resolve) => {
    const finish = (fontId) => {
      applyFont(typeof fontId === "string" ? fontId : "default");
      resolve();
    };

    if (!globalThis.chrome?.storage?.local) {
      try {
        finish(localStorage.getItem(FONT_KEY));
      } catch {
        finish("default");
      }
      return;
    }

    chrome.storage.local.get([FONT_KEY], (result) => finish(result[FONT_KEY]));
  });
}

function saveFont() {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [FONT_KEY]: state.font });
    return;
  }
  try {
    localStorage.setItem(FONT_KEY, state.font);
  } catch {
    // 隐私浏览或受限预览环境可能禁止本地存储，字体仍可在本次页面中使用。
  }
}

function openThemeDialog() {
  clearAutoNextTimer();
  if (!elements.themeDialog.open) elements.themeDialog.showModal();
  elements.themeOptions
    .find((option) => option.dataset.themeOption === state.theme)
    ?.focus({ preventScroll: true });
}

function updateScriptOptions() {
  for (const option of elements.scriptOptions) {
    option.setAttribute(
      "aria-checked",
      String(option.dataset.scriptOption === state.script),
    );
  }
}

function refreshLocalizedSurface() {
  applyTheme(state.theme);
  updateScriptOptions();
  updateAutoNextControl();
  updateFeedbackLink(state.current);
  if (state.index.length) renderFilters();
  if (state.current) {
    renderPoem(state.current, { scroll: false });
  } else if (state.emptyCollection) {
    showEmptyCollection({ announce: false });
  }
  if (elements.poemListDialog.open) renderPoemList();
  if (elements.searchDialog.open) void renderGlobalSearch();
  if (elements.authorDialog.open) renderActiveAuthorDialog();
  setBusy(state.busy);
  updateNotice(state.noticeMessage);
}

function applyScript(scriptId, options = {}) {
  const normalizedScript = scriptId === "traditional" ? "traditional" : "simplified";
  const changed = normalizedScript !== state.script;
  state.script = normalizedScript;

  if (changed) {
    if (normalizedScript === "traditional") {
      STATIC_SCRIPT_CONVERTER.convert();
    } else {
      STATIC_SCRIPT_CONVERTER.restore();
    }
  }

  document.documentElement.dataset.script = normalizedScript;
  document.documentElement.lang =
    normalizedScript === "traditional" ? "zh-Hant" : "zh-CN";
  refreshLocalizedSurface();

  if (options.persist) saveScriptPreference();
  if (options.announce) {
    updateNotice(normalizedScript === "traditional" ? "已切换为繁体中文" : "已切换为简体中文");
  }
}

function loadScriptPreference() {
  return new Promise((resolve) => {
    const finish = (scriptId) => {
      applyScript(scriptId === "traditional" ? "traditional" : "simplified");
      resolve();
    };

    if (!globalThis.chrome?.storage?.local) {
      try {
        finish(localStorage.getItem(SCRIPT_KEY));
      } catch {
        finish("simplified");
      }
      return;
    }

    chrome.storage.local.get([SCRIPT_KEY], (result) => finish(result[SCRIPT_KEY]));
  });
}

function normalizeAutoNextSeconds(value) {
  const seconds = Number(value);
  return AUTO_NEXT_INTERVALS.has(seconds) ? seconds : DEFAULT_AUTO_NEXT_SECONDS;
}

function autoNextIntervalLabel(seconds = state.autoNextSeconds) {
  if (!seconds) return "已关闭";
  if (seconds < 60) return `${seconds} 秒`;
  return `${seconds / 60} 分钟`;
}

function updateAutoNextControl() {
  elements.autoNextSelect.value = String(state.autoNextSeconds);
  elements.autoNextField.dataset.active = String(state.autoNextSeconds > 0);
  setLocalizedAttribute(
    elements.autoNextSelect,
    "aria-label",
    state.autoNextSeconds
      ? `自动下一首间隔，当前为${autoNextIntervalLabel()}`
      : "自动下一首已关闭",
  );
}

function formatRemainingTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const minuteText = String(minutes).padStart(2, "0");
  const secondText = String(remainder).padStart(2, "0");
  return hours
    ? `${hours}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`;
}

function resetAutoNextProgress() {
  elements.autoNextProgress.hidden = true;
  elements.autoNextProgressFill.style.width = "0%";
  setLocalizedText(elements.autoNextRemaining, "还剩 --:--");
  elements.autoNextProgressTrack.setAttribute("aria-valuemax", "0");
  elements.autoNextProgressTrack.setAttribute("aria-valuenow", "0");
  elements.autoNextProgressTrack.removeAttribute("aria-valuetext");
}

function updateAutoNextProgress() {
  if (state.autoNextStartedAt === null || state.autoNextDeadline === null) {
    resetAutoNextProgress();
    return;
  }

  const totalMilliseconds = state.autoNextSeconds * 1000;
  const remainingMilliseconds = Math.max(0, state.autoNextDeadline - Date.now());
  const remainingSeconds = Math.ceil(remainingMilliseconds / 1000);
  const remainingRatio =
    totalMilliseconds > 0 ? remainingMilliseconds / totalMilliseconds : 0;
  const remainingText = formatRemainingTime(remainingSeconds);

  elements.autoNextProgress.hidden = false;
  elements.autoNextProgressFill.style.width = `${Math.min(100, remainingRatio * 100)}%`;
  setLocalizedText(elements.autoNextRemaining, `还剩 ${remainingText}`);
  elements.autoNextProgressTrack.setAttribute(
    "aria-valuemax",
    String(state.autoNextSeconds),
  );
  elements.autoNextProgressTrack.setAttribute(
    "aria-valuenow",
    String(remainingSeconds),
  );
  setLocalizedAttribute(
    elements.autoNextProgressTrack,
    "aria-valuetext",
    `距离自动下一首还有 ${remainingText}`,
  );
}

function clearAutoNextTimer() {
  if (state.autoNextTimer !== null) clearTimeout(state.autoNextTimer);
  if (state.autoNextProgressTimer !== null) {
    clearInterval(state.autoNextProgressTimer);
  }
  state.autoNextTimer = null;
  state.autoNextProgressTimer = null;
  state.autoNextStartedAt = null;
  state.autoNextDeadline = null;
  resetAutoNextProgress();
}

function autoNextCanRun() {
  return (
    state.autoNextSeconds > 0 &&
    !state.busy &&
    !state.emptyCollection &&
    Boolean(state.current) &&
    filteredPoems().length > 1 &&
    !document.hidden &&
    ![
      elements.poemListDialog,
      elements.searchDialog,
      elements.authorDialog,
      elements.themeDialog,
      elements.learningDialog,
    ]
      .some((dialog) => dialog.open)
  );
}

function scheduleAutoNext() {
  clearAutoNextTimer();
  if (!autoNextCanRun()) return;

  // 同一截止时间同时驱动换诗与进度显示，避免长间隔下出现倒计时和实际跳转不同步。
  state.autoNextStartedAt = Date.now();
  state.autoNextDeadline =
    state.autoNextStartedAt + state.autoNextSeconds * 1000;
  updateAutoNextProgress();
  state.autoNextProgressTimer = setInterval(updateAutoNextProgress, 250);
  state.autoNextTimer = setTimeout(() => {
    clearAutoNextTimer();
    if (autoNextCanRun()) showRandom("已自动翻至下一首");
  }, state.autoNextSeconds * 1000);
}

function saveAutoNextPreference() {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [AUTO_NEXT_KEY]: state.autoNextSeconds });
    return;
  }
  try {
    localStorage.setItem(AUTO_NEXT_KEY, String(state.autoNextSeconds));
  } catch {
    // 受限预览环境可能禁止本地存储，自动下一首仍可在本次页面中使用。
  }
}

function applyAutoNext(seconds, options = {}) {
  state.autoNextSeconds = normalizeAutoNextSeconds(seconds);
  updateAutoNextControl();
  scheduleAutoNext();
  if (options.persist) saveAutoNextPreference();
  if (options.announce) {
    updateNotice(
      state.autoNextSeconds
        ? `自动下一首已设为 ${autoNextIntervalLabel()}`
        : "自动下一首已关闭",
    );
  }
}

function loadAutoNextPreference() {
  return new Promise((resolve) => {
    const finish = (seconds) => {
      applyAutoNext(seconds);
      resolve();
    };

    if (!globalThis.chrome?.storage?.local) {
      try {
        const saved = localStorage.getItem(AUTO_NEXT_KEY);
        finish(saved === null ? DEFAULT_AUTO_NEXT_SECONDS : saved);
      } catch {
        finish(DEFAULT_AUTO_NEXT_SECONDS);
      }
      return;
    }

    chrome.storage.local.get([AUTO_NEXT_KEY], (result) => {
      finish(result[AUTO_NEXT_KEY] ?? DEFAULT_AUTO_NEXT_SECONDS);
    });
  });
}

function saveScriptPreference() {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [SCRIPT_KEY]: state.script });
    return;
  }
  try {
    localStorage.setItem(SCRIPT_KEY, state.script);
  } catch {
    // 受限预览环境可能禁止本地存储，简繁切换仍可在本次页面中使用。
  }
}

function normalizeMeta(meta, ordinal) {
  const reviewStatus =
    meta.reviewStatus === "reviewed"
      ? "reviewed"
      : meta.reviewStatus === "pending-review"
        ? "pending-review"
        : "ai-draft";
  return {
    ...meta,
    period:
      meta.period ||
      (meta.category === "先秦"
        ? "先秦"
        : meta.category === "唐诗"
          ? "唐代"
          : meta.category === "宋词"
            ? "宋代"
            : meta.dynasty),
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    reviewStatus,
    // 深度层只由独立精读稿显式授予；“已校订”不会自动等同于“深度精读”。
    depthStatus: state.deepReadings.has(meta.id)
      ? "deep"
      : reviewStatus === "reviewed"
        ? "reviewed"
        : "basic",
    ordinal: Number.isInteger(meta.ordinal) ? meta.ordinal : ordinal,
  };
}

function normalizeTranslationMeta(meta = {}) {
  const reviewStatus =
    meta.reviewStatus === "reviewed"
      ? "reviewed"
      : meta.reviewStatus === "pending-review"
        ? "pending-review"
        : "ai-draft";
  return {
    ...meta,
    source: typeof meta.source === "string" ? meta.source : "开放语料整理",
    reviewStatus,
  };
}

function translationReviewLabel(meta) {
  const { reviewStatus } = normalizeTranslationMeta(meta);
  if (reviewStatus === "reviewed") return "已人工校订";
  if (reviewStatus === "pending-review") return "待人工校订";
  return "AI 辅助草稿，待人工校订";
}

function feedbackIssueUrl(poem) {
  const url = new URL(FEEDBACK_ISSUE_URL);
  const title = poem ? `[知识纠错] 《${poem.title}》` : "[知识纠错] 诗意一刻";
  const context = poem
    ? [
        `- 作品：${poem.title}`,
        `- 朝代 / 作者：${poem.dynasty} · ${poem.author}`,
        `- 作品 ID：${poem.id}`,
        `- 原文来源：${poem.source}`,
        `- 译文来源：${normalizeTranslationMeta(poem.translationMeta).source}`,
        `- 译文状态：${normalizeTranslationMeta(poem.translationMeta).reviewStatus}`,
      ]
    : ["- 作品：请填写出现问题的诗词或人物"];
  const body = [
    "## 错误位置",
    ...context,
    "",
    "## 错误类型",
    "标题 / 作者 / 朝代 / 原文 / 译文 / 标签 / 人物小传 / 其他",
    "",
    "## 目前显示",
    "请简要说明现在看到的错误内容。",
    "",
    "## 建议修改",
    "请写下你认为正确的内容。",
    "",
    "## 参考依据",
    "如有权威书目或网页，请附上名称或链接。",
    "",
    `扩展数据版本：${DATA_VERSION}`,
    "",
    "> GitHub Issue 提交后为公开内容，请勿填写手机号、邮箱等个人信息。",
  ].join("\n");
  url.searchParams.set("title", displayText(title));
  url.searchParams.set("body", displayText(body));
  return url.toString();
}

function updateFeedbackLink(poem) {
  elements.feedbackTrigger.href = feedbackIssueUrl(poem);
  const subject = poem ? `《${poem.title}》` : "诗词知识";
  const label = `反馈${subject}中的错误，将在新标签页打开 GitHub 公开 Issue`;
  setLocalizedAttribute(elements.feedbackTrigger, "aria-label", label);
  elements.feedbackTrigger.title = displayText(label);
}

function matchesReviewMode(poem) {
  if (state.reviewMode === "deep") return poem.depthStatus === "deep";
  return state.reviewMode === "all" || poem.reviewStatus === "reviewed";
}

function matchesFilters(poem) {
  // 默认仅进入已人工校订的安全范围；用户明确选择“全库广览”后才展示待校与 AI 草稿。
  const matchesCategory =
    state.category === "全部" || state.favorites.has(poem.id);
  return (
    matchesReviewMode(poem) &&
    matchesCategory &&
    (!state.period || poem.period === state.period) &&
    (!state.author || poem.author === state.author) &&
    (!state.tag || poem.tags.includes(state.tag))
  );
}

function poemsInCurrentCategory() {
  return state.index.filter(
    (poem) =>
      matchesReviewMode(poem) &&
      (state.category === "全部" || state.favorites.has(poem.id)) &&
      (!state.period || poem.period === state.period),
  );
}

function poemsInCurrentCollection() {
  return state.index.filter(
    (poem) =>
      matchesReviewMode(poem) &&
      (state.category === "全部" || state.favorites.has(poem.id)),
  );
}

function filteredPoems() {
  return state.index.filter(matchesFilters);
}

function chooseRandom(poems, excludedId = state.current?.id) {
  if (!poems.length) return null;
  // 优先避开本次浏览中过去 30 篇；窄筛选没有新候选时再退回仅避开当前篇。
  const recentIds = new Set(state.recentPoemIds);
  if (excludedId) recentIds.add(excludedId);
  let candidates = poems.filter((poem) => !recentIds.has(poem.id));
  if (!candidates.length) {
    candidates =
      poems.length > 1
        ? poems.filter((poem) => poem.id !== excludedId)
        : poems;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function dailyPoemForToday() {
  // 今日诗签只从已完成逐句点注与导览的精读层选择，同一天反复打开仍是同一篇。
  const deepPoems = state.index.filter(
    (poem) => poem.depthStatus === "deep",
  );
  return deepPoems[dailyPoemIndex(localDateKey(), deepPoems.length)] ?? null;
}

function dueLearningPoems() {
  return dueLearningPoemIds(state.learningProgress, localDateKey())
    .map((id) => state.poemsById.get(id))
    .filter((poem) => poem?.depthStatus === "deep");
}

function dailyActionTarget() {
  const duePoems = dueLearningPoems();
  return {
    poem: duePoems[0] ?? dailyPoemForToday(),
    dueCount: duePoems.length,
  };
}

function renderDailyAction() {
  const { poem, dueCount } = dailyActionTarget();
  const selected = Boolean(poem && state.current?.id === poem.id);
  elements.dailyTrigger.disabled = state.busy || !poem;
  elements.dailyTrigger.setAttribute("aria-pressed", String(selected));
  setLocalizedText(elements.dailyTriggerMark, dueCount ? "习" : "今");
  setLocalizedText(elements.dailyTriggerName, dueCount ? `复习 ${dueCount}` : "今日");
  const label = !poem
    ? "今日诗签正在准备"
    : dueCount
      ? selected
        ? `今日有 ${dueCount} 篇待复习，当前正在阅读《${poem.title}》`
        : `今日有 ${dueCount} 篇待复习，打开《${poem.title}》`
      : selected
        ? `今日诗签《${poem.title}》，当前正在阅读`
        : `打开今日诗签《${poem.title}》`;
  setLocalizedAttribute(elements.dailyTrigger, "aria-label", label);
  elements.dailyTrigger.title = displayText(label);
}

async function openDailyPoem() {
  const { poem, dueCount } = dailyActionTarget();
  if (!poem || state.busy) return;
  state.reviewMode = "deep";
  state.category = "全部";
  state.period = "";
  state.author = "";
  state.tag = "";
  resetReadingHistory();
  saveReviewModePreference();
  renderFilters();
  const opened = await showPoem(
    poem,
    dueCount ? `今日复习 · 《${poem.title}》` : `今日诗签 · 《${poem.title}》`,
    { recordPrevious: false },
  );
  // “复习”入口直接进入主动回想，避免用户打开到期作品后还要寻找第二个按钮。
  if (opened && dueCount && state.current) openLearningPractice(state.current);
}

function categoryAuthorLabel() {
  if (state.category === "收藏") return ["收藏作者", "全部作者"];
  if (state.period === "唐代") return ["诗人", "全部诗人"];
  if (state.period === "宋代") return ["诗人 / 词人", "全部作者"];
  if (state.period === "元代") return ["曲家 / 诗人", "全部作者"];
  return ["作者", "全部作者"];
}

function workUnit(period = state.period) {
  return period === "唐代" || period === "宋代" ? "首" : "篇";
}

function dynastyLabel(dynasty) {
  return ["唐", "宋", "元", "明", "清"].includes(dynasty) ? `${dynasty}代` : dynasty;
}

function setOptions(select, placeholder, values, selectedValue) {
  const fragment = document.createDocumentFragment();
  const first = makeElement("option", "", placeholder);
  first.value = "";
  fragment.append(first);

  for (const item of values) {
    const option = makeElement("option", "", typeof item === "string" ? item : item.label);
    option.value = typeof item === "string" ? item : item.value;
    fragment.append(option);
  }

  select.replaceChildren(fragment);
  select.value = selectedValue;
}

function renderReviewModeOptions() {
  const options = [
    { value: "deep", label: `深度精读（${state.reviewCounts.deep}）` },
    { value: "reviewed", label: `已校精选（${state.reviewCounts.reviewed}）` },
    { value: "all", label: `全库广览（${state.reviewCounts.all}）` },
  ];
  const fragment = document.createDocumentFragment();
  for (const item of options) {
    const option = makeElement("option", "", item.label);
    option.value = item.value;
    fragment.append(option);
  }
  elements.reviewModeSelect.replaceChildren(fragment);
  elements.reviewModeSelect.value = state.reviewMode;
}

function renderFilters() {
  for (const button of elements.categoryButtons) {
    button.setAttribute("aria-pressed", String(state.category === "收藏"));
  }
  renderReviewModeOptions();

  const collectionPoems = poemsInCurrentCollection();
  const periodCounts = new Map();
  for (const poem of collectionPoems) {
    periodCounts.set(poem.period, (periodCounts.get(poem.period) ?? 0) + 1);
  }
  if (state.period && !periodCounts.has(state.period)) state.period = "";
  const periods = PERIOD_ORDER.filter((period) => periodCounts.has(period)).map((period) => ({
    value: period,
    label: `${period}（${periodCounts.get(period)}）`,
  }));
  setOptions(elements.periodSelect, "全部朝代", periods, state.period);

  const categoryPoems = poemsInCurrentCategory();
  const authors = [...new Set(categoryPoems.map((poem) => poem.author))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  const [label, placeholder] = categoryAuthorLabel();
  setLocalizedText(elements.authorLabel, label);
  setOptions(elements.authorSelect, placeholder, authors, state.author);

  const tagCounts = new Map();
  categoryPoems
    .filter((poem) => !state.author || poem.author === state.author)
    .forEach((poem) => {
      for (const tag of poem.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    });
  const tags = [...tagCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .map(([tag, count]) => ({ value: tag, label: `${tag}（${count}）` }));
  setOptions(elements.tagSelect, "全部标签", tags, state.tag);

  const resultTotal = filteredPoems().length;
  const unit = workUnit();
  elements.resultCount.textContent = String(resultTotal);
  setLocalizedText(elements.resultUnit, `${unit}可赏`);
  elements.resultTrigger.disabled = state.busy || !resultTotal;
  setLocalizedAttribute(
    elements.resultTrigger,
    "aria-label",
    `${resultTotal} ${unit}可赏，点击查看诗词列表`,
  );
  elements.favoriteNavCount.textContent = String(state.favorites.size);
  setLocalizedAttribute(
    elements.favoriteNavCount,
    "aria-label",
    `已收藏 ${state.favorites.size} 篇`,
  );
  const modeName = reviewModeLabel();
  setLocalizedText(
    elements.librarySummary,
    `诗库 · ${modeName} ${resultTotal} ${unit}`,
  );
  elements.clearFilter.hidden =
    state.category === "全部" && !state.period && !state.author && !state.tag;
}

function reviewModeLabel(mode = state.reviewMode) {
  if (mode === "deep") return "深度精读";
  if (mode === "reviewed") return "已校精选";
  return "全库广览";
}

function reviewModeCount(mode = state.reviewMode) {
  return state.reviewCounts[mode] ?? 0;
}

function renderPreviousAction() {
  const previous = state.previousPoems.at(-1);
  elements.previousAction.disabled = state.busy || !previous;
  const label = previous ? `返回上一篇《${previous.title}》` : "暂无上一篇";
  setLocalizedAttribute(elements.previousAction, "aria-label", label);
  elements.previousAction.title = displayText(label);
}

function resetReadingHistory() {
  state.previousPoems = [];
  renderPreviousAction();
}

function rememberPreviousPoem(previousMeta, nextId) {
  if (!previousMeta || previousMeta.id === nextId) return;
  const latest = state.previousPoems.at(-1);
  if (latest?.id !== previousMeta.id) state.previousPoems.push(previousMeta);
  if (state.previousPoems.length > MAX_READING_HISTORY) {
    state.previousPoems.splice(0, state.previousPoems.length - MAX_READING_HISTORY);
  }
}

function rememberRecentlyRead(poemId) {
  // 随机去重队列与“上一篇”历史分离，向前返回后也不会立刻随机抽回刚看过的诗。
  state.recentPoemIds = state.recentPoemIds.filter((id) => id !== poemId);
  state.recentPoemIds.push(poemId);
  if (state.recentPoemIds.length > MAX_READING_HISTORY) {
    state.recentPoemIds.splice(
      0,
      state.recentPoemIds.length - MAX_READING_HISTORY,
    );
  }
}

function setBusy(busy) {
  state.busy = busy;
  elements.readingScroll.setAttribute("aria-busy", String(busy));
  for (const control of elements.categoryButtons) control.disabled = busy || !state.index.length;
  elements.reviewModeSelect.disabled = busy || !state.index.length;
  elements.periodSelect.disabled = busy || !poemsInCurrentCollection().length;
  elements.authorSelect.disabled = busy || !poemsInCurrentCategory().length;
  elements.tagSelect.disabled = busy || !poemsInCurrentCategory().length;
  elements.resultTrigger.disabled = busy || !filteredPoems().length;
  elements.searchTrigger.disabled = busy || !state.index.length;
  renderDailyAction();
  elements.favoriteAction.disabled = busy || !state.current;
  elements.nextAction.disabled = busy || !filteredPoems().length;
  elements.copyAction.disabled = busy || !state.current;
  elements.shareAction.disabled = busy || !state.current;
  renderPreviousAction();
  setLocalizedText(elements.nextLabel, busy ? "展开中…" : `下一${workUnit()}`);
  if (busy) clearAutoNextTimer();
  else scheduleAutoNext();
}

function updateNotice(message) {
  state.noticeMessage = message;
  const todayKey = localDateKey();
  const readingSummary = state.index.length
    ? ` · 今日 ${state.readingStats.days[todayKey] ?? 0} 篇 · 连续 ${readingStreak(state.readingStats, todayKey)} 天`
    : "";
  const favoriteSummary = state.index.length ? ` · 已藏 ${state.favorites.size} 篇` : "";
  const messageNode = makeElement("span", "notice-message", message);
  const statsNode = makeElement(
    "span",
    "notice-stats",
    `${readingSummary}${favoriteSummary}`,
  );
  elements.notice.replaceChildren(messageNode, statsNode);

  // 手机端把状态栏改成短时浮层，避免它长期占用本就有限的正文高度。
  if (!state.ready) {
    delete elements.notice.dataset.visible;
    return;
  }
  elements.notice.dataset.visible = "true";
  if (state.noticeDismissTimer) clearTimeout(state.noticeDismissTimer);
  state.noticeDismissTimer = window.setTimeout(() => {
    delete elements.notice.dataset.visible;
    state.noticeDismissTimer = null;
  }, 2400);
}

function currentFilterSummary() {
  const parts = [
    reviewModeLabel(),
    state.category === "收藏" ? "我的收藏" : "全部诗词",
  ];
  if (state.period) parts.push(state.period);
  if (state.author) parts.push(state.author);
  if (state.tag) parts.push(`标签「${state.tag}」`);
  return parts.join(" · ");
}

function poemMatchesListSearch(poem, query) {
  if (!query) return true;
  return normalizeSearchValue(
    [poem.title, poem.author, poem.dynasty, poem.period, ...poem.tags].join(" "),
  ).includes(query);
}

function createPoemListItem(poem, position, options = {}) {
  const button = makeElement("button", "poem-list-item");
  button.type = "button";
  button.setAttribute("aria-current", String(state.current?.id === poem.id));
  setLocalizedAttribute(
    button,
    "aria-label",
    `打开《${poem.title}》，${dynastyLabel(poem.dynasty)}${poem.author}`,
  );
  button.title = displayText(`打开《${poem.title}》`);

  const index = makeElement("span", "poem-list-item-index", String(position).padStart(3, "0"));
  index.setAttribute("aria-hidden", "true");
  const main = makeElement("span", "poem-list-item-main");
  main.append(
    makeElement("span", "poem-list-item-title", poem.title),
    makeElement(
      "span",
      "poem-list-item-meta",
      `${poem.dynasty} · ${poem.author}${poem.tags.length ? ` · ${poem.tags.slice(0, 3).join(" / ")}` : ""}`,
    ),
  );
  if (options.excerpt) {
    main.append(makeElement("span", "poem-list-item-excerpt", options.excerpt));
  }
  const mark = makeElement(
    "span",
    "poem-list-item-mark",
    state.favorites.has(poem.id) ? "♥" : "›",
  );
  mark.setAttribute("aria-hidden", "true");
  button.append(index, main, mark);
  button.addEventListener("click", () => {
    if (options.onOpen) {
      options.onOpen(poem);
    } else {
      elements.poemListDialog.close();
    }
    showPoem(poem, options.message || `已从列表打开《${poem.title}》`);
  });
  return button;
}

function renderPoemList() {
  const allResults = filteredPoems();
  const query = normalizeSearchValue(elements.poemListSearch.value);
  const visibleResults = allResults.filter((poem) => poemMatchesListSearch(poem, query));
  const fragment = document.createDocumentFragment();
  visibleResults.forEach((poem, index) => {
    fragment.append(createPoemListItem(poem, index + 1));
  });

  // 列表只在弹层打开时生成，避免常驻数千个按钮拖慢每个新标签页的首屏。
  elements.poemList.replaceChildren(fragment);
  elements.poemList.hidden = !visibleResults.length;
  elements.poemListEmpty.hidden = Boolean(visibleResults.length);
  const unit = workUnit();
  setLocalizedText(
    elements.poemListSummary,
    query
      ? `${currentFilterSummary()} · 找到 ${visibleResults.length} / ${allResults.length} ${unit}`
      : `${currentFilterSummary()} · 共 ${allResults.length} ${unit}`,
  );
  elements.poemList.scrollTop = 0;
}

function openPoemList() {
  if (!filteredPoems().length) return;
  clearAutoNextTimer();
  elements.poemListSearch.value = "";
  setLocalizedText(
    elements.poemListTitle,
    state.category === "收藏" ? "我的收藏" : "可赏诗词",
  );
  renderPoemList();
  elements.poemListDialog.showModal();
  elements.poemListClose.focus();
}

function normalizeSearchValue(value) {
  return TO_SIMPLIFIED(String(value))
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadSearchRecords() {
  if (!state.searchRecordsPromise) {
    // 全文索引仅在用户打开搜索后按需读取，避免每个新标签页都解析额外数据。
    state.searchRecordsPromise = fetch(`data/poems/search.json?v=${DATA_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`搜索索引读取失败：${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data.records) || data.records.length !== state.index.length) {
          throw new Error("搜索索引与诗库数量不一致");
        }
        return data.records.map(([id, text, excerpt]) => ({ id, text, excerpt }));
      })
      .catch((error) => {
        state.searchRecordsPromise = null;
        throw error;
      });
  }
  return state.searchRecordsPromise;
}

function searchScore(poem, record, query) {
  const title = normalizeSearchValue(poem.title);
  const author = normalizeSearchValue(poem.author);
  if (title === query) return 100;
  if (author === query) return 90;
  if (title.includes(query)) return 80;
  if (author.includes(query)) return 70;
  if (poem.tags.some((tag) => normalizeSearchValue(tag) === query)) return 50;
  return record.text.indexOf(query) >= 0 ? 20 : 10;
}

async function renderGlobalSearch() {
  const query = normalizeSearchValue(elements.globalSearchInput.value);
  const requestId = ++state.searchRequestId;
  const searchableCount = reviewModeCount();
  elements.searchResults.replaceChildren();
  elements.searchResults.hidden = true;

  if (!query) {
    setLocalizedText(elements.searchSummary, "题目、作者、原文、译文与标签均可搜索");
    setLocalizedText(elements.searchEmpty, "输入几个字，循着诗句与古人相逢");
    elements.searchEmpty.hidden = false;
    return;
  }

  setLocalizedText(elements.searchSummary, `正在检索当前范围的 ${searchableCount} 篇诗词…`);
  setLocalizedText(elements.searchEmpty, "正在循句寻诗…");
  elements.searchEmpty.hidden = false;

  try {
    const records = await loadSearchRecords();
    if (requestId !== state.searchRequestId) return;
    const terms = query.split(" ");
    const matches = records
      .filter((record) => terms.every((term) => record.text.includes(term)))
      .map((record) => ({
        record,
        poem: state.poemsById.get(record.id),
      }))
      .filter((item) => item.poem && matchesReviewMode(item.poem))
      .sort(
        (left, right) =>
          searchScore(right.poem, right.record, query) -
            searchScore(left.poem, left.record, query) ||
          left.poem.ordinal - right.poem.ordinal,
      );

    const visibleMatches = matches.slice(0, MAX_SEARCH_RESULTS);
    const fragment = document.createDocumentFragment();
    visibleMatches.forEach(({ poem, record }, index) => {
      fragment.append(
        createPoemListItem(poem, index + 1, {
          excerpt: record.excerpt,
          message: `已从搜索打开《${poem.title}》`,
          onOpen: () => {
            // 搜索继承当前校订范围；打开结果时只重置其他筛选，避免“下一篇”落入无关旧条件。
            state.category = "全部";
            state.period = "";
            state.author = "";
            state.tag = "";
            resetReadingHistory();
            elements.searchDialog.close();
            renderFilters();
          },
        }),
      );
    });

    elements.searchResults.replaceChildren(fragment);
    elements.searchResults.hidden = !visibleMatches.length;
    elements.searchEmpty.hidden = Boolean(visibleMatches.length);
    setLocalizedText(
      elements.searchEmpty,
      "没有找到相符的诗词，换个题目、作者或诗句试试",
    );
    setLocalizedText(
      elements.searchSummary,
      matches.length > MAX_SEARCH_RESULTS
        ? `找到 ${matches.length} 篇，显示前 ${MAX_SEARCH_RESULTS} 篇`
        : `找到 ${matches.length} 篇`,
    );
  } catch (error) {
    if (requestId !== state.searchRequestId) return;
    console.error(error);
    setLocalizedText(elements.searchSummary, "搜索索引暂未能展开");
    setLocalizedText(elements.searchEmpty, "搜索暂不可用，请稍后重试");
  }
}

async function openGlobalSearch() {
  clearAutoNextTimer();
  elements.globalSearchInput.value = "";
  setLocalizedText(elements.searchSummary, "正在准备本地全文索引…");
  elements.searchResults.replaceChildren();
  elements.searchResults.hidden = true;
  const searchableCount = reviewModeCount();
  setLocalizedText(elements.searchEmpty, `正在展开当前范围的 ${searchableCount} 篇诗词…`);
  elements.searchEmpty.hidden = false;
  elements.searchDialog.showModal();
  elements.globalSearchInput.focus();
  try {
    await loadSearchRecords();
    if (!elements.searchDialog.open) return;
    setLocalizedText(elements.searchSummary, "题目、作者、原文、译文与标签均可搜索");
    setLocalizedText(elements.searchEmpty, "输入几个字，循着诗句与古人相逢");
  } catch (error) {
    console.error(error);
    setLocalizedText(elements.searchSummary, "搜索索引暂未能展开");
    setLocalizedText(elements.searchEmpty, "搜索暂不可用，请稍后重试");
  }
}

function authorKey(dynasty, name) {
  return `${dynasty}:${name}`;
}

function authorProfileFor(poem) {
  const profile = state.authors.get(authorKey(poem.dynasty, poem.author));
  if (profile) return profile;

  const works = state.index.filter(
    (item) => item.dynasty === poem.dynasty && item.author === poem.author,
  ).length;
  return {
    name: poem.author,
    dynasty: poem.dynasty,
    role:
      poem.form === "散曲"
        ? "曲家"
        : poem.category === "宋词" || poem.form === "词"
          ? "词人"
          : poem.period === "先秦" && !poem.tags.includes("诗经")
            ? "辞赋家"
            : "诗人",
    works,
    biography: `${dynastyLabel(poem.dynasty)}作者。“诗意一刻”当前收录其作品 ${works} ${workUnit(poem.period)}，可从作品本身认识其创作风貌。`,
    source: "诗库索引整理",
  };
}

function renderAuthorSource(profile) {
  const fragments = [localizedTextNode("资料来源：")];
  if (profile.sourceUrl) {
    const sourceLink = makeElement("a", "author-dialog-source-link", profile.source);
    sourceLink.href = profile.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    setLocalizedAttribute(sourceLink, "aria-label", `${profile.source}，在新标签页打开`);
    fragments.push(sourceLink);
  } else {
    fragments.push(localizedTextNode(profile.source));
  }

  if (profile.sourceLicense) {
    fragments.push(localizedTextNode(" · "));
    if (profile.sourceLicenseUrl) {
      const licenseLink = makeElement(
        "a",
        "author-dialog-source-link",
        profile.sourceLicense,
      );
      licenseLink.href = profile.sourceLicenseUrl;
      licenseLink.target = "_blank";
      licenseLink.rel = "noopener noreferrer";
      fragments.push(licenseLink);
    } else {
      fragments.push(localizedTextNode(profile.sourceLicense));
    }
  }
  if (Array.isArray(profile.sourceChanges) && profile.sourceChanges.length) {
    fragments.push(localizedTextNode(` · 已作${profile.sourceChanges.join("、")}`));
  }
  elements.authorDialogSource.replaceChildren(...fragments);
}

function renderActiveAuthorDialog() {
  const profile = state.activeAuthor;
  if (!profile) return;
  setLocalizedText(elements.authorDialogName, profile.name);
  setLocalizedText(
    elements.authorDialogMeta,
    `${dynastyLabel(profile.dynasty)} · ${profile.role} · 诗库收录 ${profile.works} ${profile.unit}`,
  );
  setLocalizedText(elements.authorDialogBiography, profile.biography);
  renderAuthorSource(profile);
  setLocalizedText(elements.authorWorksCount, `${profile.works} ${profile.unit}`);
  setLocalizedAttribute(
    elements.authorWorksAction,
    "aria-label",
    `赏读${profile.name}的 ${profile.works} ${profile.unit}作品`,
  );
}

function openAuthorDialog(poem) {
  clearAutoNextTimer();
  const profile = authorProfileFor(poem);
  const unit = workUnit(poem.period);
  state.activeAuthor = { ...profile, period: poem.period, unit };
  renderActiveAuthorDialog();
  elements.authorDialog.showModal();
  elements.authorDialogClose.focus();
}

function showActiveAuthorWorks() {
  const profile = state.activeAuthor;
  if (!profile) return;

  // 人物小传与作者筛选各司其职：只有明确点击“赏读其作品”时才改变当前筛选。
  state.category = "全部";
  state.period = profile.period;
  state.author = profile.name;
  state.tag = "";
  resetReadingHistory();
  elements.authorDialog.close();
  renderFilters();

  if (state.current && matchesFilters(state.current)) {
    renderPoem(state.current);
    updateNotice(`${profile.name} · 共 ${filteredPoems().length} ${profile.unit}`);
  } else {
    showRandom(`${profile.name} · 共 ${filteredPoems().length} ${profile.unit}`);
  }
}

function translationBadge(meta) {
  const normalized = normalizeTranslationMeta(meta);
  if (normalized.reviewStatus === "ai-draft") return "AI 辅助译文 · 待人工校订";
  if (normalized.source === "原典暂未配译") return "白话译文 · 待校订";
  if (normalized.reviewStatus === "pending-review") return "白话译文 · 待校订";
  if (normalized.source === "开放语料整理") {
    return normalized.reviewStatus === "reviewed" ? "开放译文 · 已对齐" : "开放译文 · 待校";
  }
  return normalized.reviewStatus === "reviewed" ? "辅助译文 · 已校订" : "辅助译文 · 待校";
}

function firstHanCharacter(text) {
  return text.match(/\p{Script=Han}/u)?.[0] ?? "诗";
}

function contextualHint(poem) {
  if (poem.period === "先秦") {
    return poem.tags.includes("诗经") ? "宜诵读，听先民歌咏" : "宜循香草美人之意";
  }
  const tag = poem.tags.find((item) => !item.endsWith("诗") && !item.endsWith("词"));
  if (tag) return `此篇可从“${tag}”读起`;
  return poem.period === "唐代" ? "宜静读，宜慢品" : "宜清赏，宜低吟";
}

function createAuthorLine(poem) {
  const line = makeElement("div", "author-line");
  line.append(makeElement("span", "", poem.dynasty), makeElement("span", "", "·"));
  line.children[1].setAttribute("aria-hidden", "true");

  const button = makeElement("button", "author-filter");
  button.type = "button";
  setLocalizedAttribute(button, "aria-label", `查看${poem.author}的人物简介`);
  button.title = displayText(`查看${poem.author}的人物简介`);
  button.append(
    makeElement("span", "", poem.author),
    makeElement("span", "author-filter-hint", "人物小传"),
  );
  button.lastElementChild.setAttribute("aria-hidden", "true");
  button.addEventListener("click", () => openAuthorDialog(poem));
  line.append(button);
  return line;
}

function createOriginal(poem) {
  const section = makeElement("section", "original");
  const hasDeepReading = Boolean(poem.deepReading);
  setLocalizedAttribute(
    section,
    "aria-label",
    hasDeepReading ? "诗词原文与逐句点注" : "诗词原文",
  );
  const heading = makeElement("div", "original-heading");
  heading.append(makeElement("div", "section-kicker", "原文"));
  if (hasDeepReading) {
    heading.append(makeElement("span", "line-reading-hint", "轻点诗句，逐句读懂"));
  }
  section.append(heading);
  const verses = makeElement("div", "verses");
  if (!hasDeepReading) {
    for (const verse of poem.lines) verses.append(makeElement("p", "verse", verse));
    section.append(verses);
    return section;
  }

  // 每句只在读者主动点开后显示对齐译文和难词，保持首屏仍以原文为中心。
  poem.lines.forEach((verse, lineIndex) => {
    const study = makeElement("div", "verse-study");
    const panelId = `deep-line-${poem.id}-${lineIndex}`;
    const button = makeElement("button", "verse verse-trigger");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", panelId);
    setLocalizedAttribute(button, "aria-label", `展开第 ${lineIndex + 1} 句译文与难词`);
    button.append(
      makeElement("span", "verse-text", verse),
      makeElement("span", "verse-expand-mark", "＋"),
    );

    const panel = makeElement("div", "verse-reading");
    panel.id = panelId;
    panel.hidden = true;
    panel.append(
      makeElement(
        "p",
        "line-translation",
        poem.translation[lineIndex] || "这一句的对齐译文正在进一步校订中。",
      ),
    );
    const annotations = poem.deepReading.annotations.filter(
      (annotation) => annotation.line === lineIndex,
    );
    if (annotations.length) {
      const terms = makeElement("dl", "line-annotations");
      for (const annotation of annotations) {
        terms.append(
          makeElement("dt", "", annotation.term),
          makeElement("dd", "", annotation.gloss),
        );
      }
      panel.append(terms);
    }

    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      panel.hidden = expanded;
      setLocalizedText(button.querySelector(".verse-expand-mark"), expanded ? "＋" : "－");
      setLocalizedAttribute(
        button,
        "aria-label",
        `${expanded ? "展开" : "收起"}第 ${lineIndex + 1} 句译文与难词`,
      );
    });
    study.append(button, panel);
    verses.append(study);
  });
  section.append(verses);
  return section;
}

function createDeepReadingGuide(poem) {
  const deep = poem.deepReading;
  const block = makeElement("details", "deep-reading-guide");
  const summary = makeElement("summary", "deep-reading-summary");
  summary.append(
    makeElement("span", "deep-reading-summary-mark", "读"),
    makeElement("span", "deep-reading-summary-copy", "展开精读导览"),
    makeElement("span", "deep-reading-summary-hint", "背景 · 诗意 · 转折 · 写法"),
  );

  const body = makeElement("div", "deep-reading-body");
  const background = makeElement("section", "deep-background");
  background.append(
    makeElement("h2", "", "写作与篇章背景"),
    makeElement("p", "", deep.background),
  );

  const guide = makeElement("div", "deep-guide-grid");
  for (const [label, text] of [
    ["这首诗写了什么", deep.guide.summary],
    ["转折在哪里", deep.guide.turn],
    ["它如何写成", deep.guide.craft],
  ]) {
    const card = makeElement("section", "deep-guide-card");
    card.append(makeElement("h3", "", label), makeElement("p", "", text));
    guide.append(card);
  }

  const sourceSection = makeElement("section", "deep-sources");
  sourceSection.append(makeElement("h2", "", "核对依据"));
  const sourceList = makeElement("ul", "");
  for (const sourceId of deep.sourceIds) {
    const source = state.deepSources.get(sourceId);
    if (!source) continue;
    const item = makeElement("li", "");
    item.append(
      makeElement("strong", "", source.label),
      makeElement("span", "", source.detail),
    );
    sourceList.append(item);
  }
  sourceSection.append(
    sourceList,
    makeElement("p", "deep-editorial-note", state.deepEditorialPolicy),
  );
  body.append(background, guide, sourceSection);
  block.append(summary, body);
  return block;
}

function formatLearningDate(dateKey) {
  if (!dateKey) return "完成回想后安排";
  if (dateKey <= localDateKey()) return "今日应复习";
  const [, month, day] = dateKey.split("-");
  return `${Number(month)} 月 ${Number(day)} 日复习`;
}

function createLearningCard(poem) {
  const entry = state.learningProgress.poems[poem.id];
  const counts = learningProgressCounts(state.learningProgress, localDateKey());
  const due = Boolean(entry?.dueDate && entry.dueDate <= localDateKey());
  const card = makeElement("section", "learning-card");
  card.dataset.status = !entry
    ? "new"
    : due
      ? "due"
      : entry.mastered
        ? "mastered"
        : "learning";

  const mark = makeElement("span", "learning-card-mark", entry?.mastered ? "成" : "习");
  mark.setAttribute("aria-hidden", "true");
  const copy = makeElement("div", "learning-card-copy");
  copy.append(
    makeElement(
      "strong",
      "",
      !entry
        ? "学会这首"
        : due
          ? "今天该回想了"
          : entry.mastered
            ? "已进入长期记忆"
            : "正在形成记忆",
    ),
    makeElement(
      "span",
      "",
      entry
        ? `上次答对 ${Math.round(entry.lastScore * 100)}% · ${formatLearningDate(entry.dueDate)}`
        : "不看原文逐句补全，完成后自动安排下一次复习",
    ),
    makeElement(
      "small",
      "",
      `已开始 ${counts.started} / ${state.reviewCounts.deep} 篇 · 按期全对三次才算掌握${counts.mastered ? ` · 已掌握 ${counts.mastered} 篇` : ""}`,
    ),
  );
  const action = makeElement(
    "button",
    "learning-card-action",
    entry ? (due ? "开始复习" : "再次回想") : "开始回想",
  );
  action.type = "button";
  setLocalizedAttribute(
    action,
    "aria-label",
    `${entry ? "再次回想" : "开始学习"}《${poem.title}》`,
  );
  action.addEventListener("click", () => openLearningPractice(poem));
  card.append(mark, copy, action);
  return card;
}

function createTags(poem) {
  const tags = makeElement("div", "poem-tags");
  setLocalizedAttribute(tags, "aria-label", "本篇标签");
  for (const tag of poem.tags) {
    const button = makeElement("button", "poem-tag", tag);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.tag === tag));
    button.addEventListener("click", () => {
      state.tag = state.tag === tag ? "" : tag;
      resetReadingHistory();
      renderFilters();
      const unit = workUnit();
      if (matchesFilters(poem)) {
        updateNotice(`${state.tag ? `标签「${state.tag}」` : "全部标签"} · 共 ${filteredPoems().length} ${unit}`);
        renderPoem(poem);
      } else {
        showRandom(`${state.tag ? `标签「${state.tag}」` : "全部标签"} · 共 ${filteredPoems().length} ${unit}`);
      }
    });
    tags.append(button);
  }
  return tags;
}

function createTranslation(poem) {
  const block = makeElement("section", "translation-block");
  block.setAttribute("aria-labelledby", "translation-title");

  const heading = makeElement("div", "translation-heading");
  const title = makeElement("h2", "", "白话译文");
  title.id = "translation-title";
  heading.append(title, makeElement("span", "", translationBadge(poem.translationMeta)));

  const translation = makeElement("div", "translation-text");
  const paragraphs = poem.translation.length ? poem.translation : ["此篇译文正在校订中。"];
  for (const paragraph of paragraphs) translation.append(makeElement("p", "", paragraph));

  const translationMeta = normalizeTranslationMeta(poem.translationMeta);
  const note = makeElement(
    "p",
    "translation-note",
    `译文来源：${translationMeta.source}；状态：${translationReviewLabel(translationMeta)}。用于辅助理解诗意，欢迎结合原文品读。`,
  );
  block.append(heading, translation, note);
  return block;
}

function createPoemMeta(text) {
  const meta = makeElement("div", "poem-meta-row");
  meta.append(makeElement("p", "note", text), elements.feedbackTrigger);
  return meta;
}

function renderPoem(poem, options = {}) {
  state.current = poem;
  state.emptyCollection = false;
  updateFeedbackLink(poem);
  const article = makeElement("article", "poem");
  article.id = "poem";
  const hasDeepReading = Boolean(poem.deepReading);
  article.dataset.depth = hasDeepReading ? "deep" : poem.depthStatus;
  article.append(
    makeElement(
      "div",
      `eyebrow${hasDeepReading ? " eyebrow-deep" : ""}`,
      hasDeepReading ? "深度精读 · 人工整理" : "此刻遇见",
    ),
  );

  const title = makeElement("h1", "poem-title", poem.title);
  if (poem.title.length > 8) title.dataset.longTitle = "true";
  article.append(title, createAuthorLine(poem), createOriginal(poem), createTags(poem));
  if (hasDeepReading) {
    article.append(createDeepReadingGuide(poem), createLearningCard(poem));
  } else {
    article.append(createTranslation(poem));
  }
  article.append(
    createPoemMeta(
      hasDeepReading
        ? `精读篇章 · ${poem.source} · ${poem.lines.length} 句对齐译文 · ${poem.deepReading.annotations.length} 条难词点注`
        : `完整篇章 · ${poem.source} · 原文共 ${poem.lines.length} 段 · 译文共 ${poem.translation.length} 段`,
    ),
  );

  elements.poem.replaceWith(article);
  elements.poem = article;
  setLocalizedAttribute(
    elements.readingScroll,
    "aria-label",
    hasDeepReading
      ? `${poem.title}，${poem.author}，逐句点注与精读导览`
      : `${poem.title}，${poem.author}，${poem.translation.length ? "完整原文与译文" : "完整原文，译文待校订"}`,
  );
  setLocalizedText(
    elements.folioNo,
    `卷之${String(
      state.index.findIndex((item) => item.id === poem.id) + 1,
    ).padStart(4, "0")} · ${hasDeepReading ? "精读诗笺" : "随机诗笺"}`,
  );
  setLocalizedText(elements.bigCharacter, firstHanCharacter(poem.title));

  const contextTitle = makeElement("strong", "", poem.form);
  elements.context.replaceChildren(
    contextTitle,
    localizedTextNode(
      hasDeepReading
        ? "深度精读 · 逐句点注"
        : poem.translation.length
          ? "原文与译文完整呈现"
          : "原典全文完整呈现",
    ),
    document.createElement("br"),
    localizedTextNode(
      hasDeepReading ? "轻点诗句读译注，再展开篇章导览" : contextualHint(poem),
    ),
  );

  renderFavorite();
  renderPreviousAction();
  renderDailyAction();
  if (options.scroll !== false) {
    elements.readingScroll.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
}

function renderFavorite() {
  const selected = Boolean(state.current && state.favorites.has(state.current.id));
  elements.favoriteAction.setAttribute("aria-pressed", String(selected));
  setLocalizedAttribute(
    elements.favoriteAction,
    "aria-label",
    state.current
      ? `${selected ? "取消收藏" : "收藏"}《${state.current.title}》`
      : "收藏当前诗词",
  );
  elements.favoriteIcon.textContent = selected ? "♥" : "♡";
  setLocalizedText(elements.favoriteLabel, selected ? "已收藏" : "收藏此篇");
  setLocalizedText(elements.favoriteLabelShort, selected ? "已藏" : "收藏");
}

function renderRecallStep() {
  const practice = state.practice;
  if (!practice) return;
  const { poem, lineIndex } = practice;
  const prompt = createRecallPrompt(poem.lines[lineIndex]);
  practice.prompt = prompt;
  practice.answered = false;

  elements.learningPractice.hidden = false;
  elements.learningComplete.hidden = true;
  setLocalizedText(
    elements.learningStep,
    `第 ${lineIndex + 1} / ${poem.lines.length} 句`,
  );
  elements.learningProgressTrack.setAttribute(
    "aria-valuemax",
    String(poem.lines.length),
  );
  elements.learningProgressTrack.setAttribute("aria-valuenow", String(lineIndex));
  elements.learningProgressFill.style.width = `${(lineIndex / poem.lines.length) * 100}%`;
  setLocalizedText(elements.learningPrompt, prompt.prompt);
  elements.learningAnswer.value = "";
  elements.learningAnswer.disabled = false;
  setLocalizedAttribute(
    elements.learningAnswer,
    "placeholder",
    `回想“${prompt.prefix}”之后的内容`,
  );
  elements.learningResult.hidden = true;
  elements.learningResult.dataset.correct = "";
  elements.learningCheck.hidden = false;
  elements.learningNext.hidden = true;
  setLocalizedText(
    elements.learningNext,
    lineIndex + 1 === poem.lines.length ? "查看结果" : "下一句",
  );
  elements.learningAnswer.focus();
}

function openLearningPractice(poem) {
  if (!poem?.deepReading || state.busy) return;
  clearAutoNextTimer();
  state.practice = {
    poem,
    lineIndex: 0,
    correct: 0,
    answered: false,
    prompt: null,
  };
  setLocalizedText(elements.learningDialogTitle, `回想《${poem.title}》`);
  setLocalizedText(
    elements.learningDialogMeta,
    `${poem.dynasty} · ${poem.author} · 共 ${poem.lines.length} 句；先回想，再核对。`,
  );
  renderRecallStep();
  elements.learningDialog.showModal();
}

function checkLearningAnswer() {
  const practice = state.practice;
  if (!practice || practice.answered) return;
  const answer = elements.learningAnswer.value.trim();
  if (!answer) {
    elements.learningResult.hidden = false;
    elements.learningResult.dataset.correct = "false";
    setLocalizedText(elements.learningResultTitle, "先写下你记得的内容");
    setLocalizedText(elements.learningResultAnswer, "哪怕只记得几个字，也比直接看答案更有效。");
    elements.learningAnswer.focus();
    return;
  }

  const correct = checkRecallAnswer(
    TO_SIMPLIFIED(practice.prompt.answer),
    TO_SIMPLIFIED(answer),
  );
  if (correct) practice.correct += 1;
  practice.answered = true;
  elements.learningAnswer.disabled = true;
  elements.learningResult.hidden = false;
  elements.learningResult.dataset.correct = String(correct);
  setLocalizedText(
    elements.learningResultTitle,
    correct ? "回想正确" : "再看一眼完整诗句",
  );
  setLocalizedText(elements.learningResultAnswer, practice.prompt.fullLine);
  elements.learningCheck.hidden = true;
  elements.learningNext.hidden = false;
  elements.learningProgressTrack.setAttribute(
    "aria-valuenow",
    String(practice.lineIndex + 1),
  );
  elements.learningProgressFill.style.width =
    `${((practice.lineIndex + 1) / practice.poem.lines.length) * 100}%`;
  elements.learningNext.focus();
}

function finishLearningPractice() {
  const practice = state.practice;
  if (!practice) return;
  const total = practice.poem.lines.length;
  const score = practice.correct / total;
  elements.learningPractice.hidden = true;
  elements.learningComplete.hidden = false;
  setLocalizedText(
    elements.learningScore,
    `本轮答对 ${practice.correct} / ${total} 句（${Math.round(score * 100)}%）`,
  );
  setLocalizedText(
    elements.learningRatingHint,
    score === 1
      ? "本轮全部回想正确。完成三次按期复习且全对，才会进入“已掌握”。"
      : score >= 0.6
        ? "还有句子不够牢；即使选择“已经记住”，也会按“有点模糊”安排复习。"
        : "这轮回想还不稳定，将在明天重新出现。",
  );
  for (const button of elements.learningRatingButtons) {
    const blocked = button.dataset.learningRating === "good" && score < 1;
    button.disabled = blocked;
    if (blocked) {
      setLocalizedAttribute(button, "title", "全部答对后才能选择已经记住");
    } else {
      button.removeAttribute("title");
    }
  }
  elements.learningRatingButtons.find((button) => !button.disabled)?.focus();
}

function advanceLearningPractice() {
  const practice = state.practice;
  if (!practice?.answered) return;
  if (practice.lineIndex + 1 >= practice.poem.lines.length) {
    finishLearningPractice();
    return;
  }
  practice.lineIndex += 1;
  renderRecallStep();
}

function rateLearningPractice(rating) {
  const practice = state.practice;
  if (!practice || elements.learningComplete.hidden) return;
  state.learningProgress = scheduleLearningReview(
    state.learningProgress,
    practice.poem.id,
    {
      rating,
      correct: practice.correct,
      total: practice.poem.lines.length,
      todayKey: localDateKey(),
    },
  );
  const entry = state.learningProgress.poems[practice.poem.id];
  saveLearningProgress();
  elements.learningDialog.close();
  if (state.current?.id === practice.poem.id) {
    renderPoem(state.current, { scroll: false });
  }
  renderDailyAction();
  updateNotice(
    entry.mastered
      ? `《${practice.poem.title}》已连续三次全对 · ${formatLearningDate(entry.dueDate)}`
      : `本轮答对 ${Math.round(entry.lastScore * 100)}% · ${formatLearningDate(entry.dueDate)}`,
  );
}

async function loadChunk(chunkName) {
  if (!state.chunks.has(chunkName)) {
    // 诗库按每卷 100 篇拆分并按需加载，避免新标签页启动时一次解析全部正文。
    const pending = fetch(`data/poems/chunks/${chunkName}.json?v=${DATA_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`诗文分卷读取失败：${response.status}`);
        return response.json();
      })
      .then((records) => new Map(records.map((record) => [record.id, record])))
      .catch((error) => {
        state.chunks.delete(chunkName);
        throw error;
      });
    state.chunks.set(chunkName, pending);
  }
  return state.chunks.get(chunkName);
}

async function expandPoem(meta) {
  const chunk = await loadChunk(meta.chunk);
  const body = chunk.get(meta.id);
  if (!body) throw new Error(`未在分卷中找到《${meta.title}》`);
  return {
    ...meta,
    lines: Array.isArray(body.lines) ? body.lines : [],
    translation: Array.isArray(body.translation) ? body.translation : [],
    translationMeta: normalizeTranslationMeta(body.translationMeta),
    deepReading: state.deepReadings.get(meta.id) ?? null,
  };
}

async function showPoem(meta, message, options = {}) {
  if (!meta) {
    updateNotice("当前组合暂无诗词，请换一个筛选条件");
    return false;
  }

  // 用户可能快速切换筛选；只允许最后一次请求更新页面，避免慢分卷覆盖新选择。
  const requestId = ++state.requestId;
  const previousMeta = state.current
    ? state.poemsById.get(state.current.id)
    : null;
  setBusy(true);
  updateNotice("正在展开完整诗笺…");
  try {
    const poem = await expandPoem(meta);
    if (requestId !== state.requestId) return false;
    // 仅在新诗成功展开后记录上一篇，避免分卷读取失败时产生无法返回的伪历史。
    if (options.recordPrevious !== false) {
      rememberPreviousPoem(previousMeta, poem.id);
    }
    renderPoem(poem);
    rememberRecentlyRead(poem.id);
    recordReading(poem.id);
    updateNotice(message);
    return true;
  } catch (error) {
    if (requestId === state.requestId) {
      console.error(error);
      updateNotice("这页诗笺暂未能展开，请再试一首");
    }
    return false;
  } finally {
    if (requestId === state.requestId) setBusy(false);
  }
}

function showEmptyCollection(options = {}) {
  // 收藏为空时清除上一首，避免用户误以为屏幕上的诗仍属于收藏列表。
  state.requestId += 1;
  resetReadingHistory();
  state.current = null;
  state.emptyCollection = true;
  updateFeedbackLink(null);

  const article = makeElement("article", "poem");
  article.id = "poem";
  article.append(makeElement("div", "eyebrow", "我的收藏"));
  article.append(makeElement("h1", "poem-title", "诗笺尚空"));
  article.append(
    makeElement(
      "p",
      "empty-collection-copy",
      "回到“全部”，遇见喜欢的诗词时，点击“收藏此篇”。",
    ),
  );
  article.append(createPoemMeta("发现诗词知识问题，可向项目提交纠错"));
  elements.poem.replaceWith(article);
  elements.poem = article;
  setLocalizedAttribute(elements.readingScroll, "aria-label", "我的收藏目前为空");
  setLocalizedText(elements.folioNo, "卷之0000 · 我的收藏");
  setLocalizedText(elements.bigCharacter, "藏");
  elements.context.replaceChildren(
    makeElement("strong", "", "私藏诗笺 · 待君题写"),
    localizedTextNode("喜欢的篇章会在这里相逢"),
    document.createElement("br"),
    localizedTextNode("从“全部”开始漫游吧"),
  );
  renderFavorite();
  renderDailyAction();
  setBusy(false);
  if (options.announce !== false) updateNotice("诗笺尚空，先去收藏喜欢的诗词吧");
}

function showRandom(message = "又逢一篇好诗词", options = {}) {
  const poems = filteredPoems();
  if (!poems.length && state.category === "收藏") {
    showEmptyCollection();
    return;
  }
  showPoem(
    chooseRandom(poems),
    poems.length === 1 ? `已是此筛选下的唯一一${workUnit()}` : message,
    options,
  );
}

async function showPreviousPoem() {
  if (state.busy) return;
  const previous = state.previousPoems.at(-1);
  if (!previous) {
    updateNotice("暂无上一篇可返回");
    return;
  }

  const opened = await showPoem(
    previous,
    `已返回上一篇《${previous.title}》`,
    { recordPrevious: false },
  );
  if (opened) state.previousPoems.pop();
  renderPreviousAction();
}

function keepTagIfAvailable() {
  if (!state.tag) return;
  const tagStillExists = state.index.some(
    (poem) =>
      matchesReviewMode(poem) &&
      (state.category === "全部" || state.favorites.has(poem.id)) &&
      (!state.period || poem.period === state.period) &&
      (!state.author || poem.author === state.author) &&
      poem.tags.includes(state.tag),
  );
  if (!tagStillExists) state.tag = "";
}

function copyText(poem) {
  const translationMeta = normalizeTranslationMeta(poem.translationMeta);
  const reviewLabel = translationReviewLabel(translationMeta);
  const sections = [
    `《${poem.title}》`,
    `${poem.dynasty}·${poem.author}`,
    poem.lines.join("\n"),
  ];
  if (poem.translation.length) {
    sections.push(`白话译文（${reviewLabel}）\n${poem.translation.join("\n")}`);
  }
  if (poem.deepReading) {
    const deep = poem.deepReading;
    const annotations = deep.annotations
      .map(
        (annotation) =>
          `${poem.lines[annotation.line]}\n- ${annotation.term}：${annotation.gloss}`,
      )
      .join("\n");
    const sourceLabels = deep.sourceIds
      .map((sourceId) => state.deepSources.get(sourceId)?.label)
      .filter(Boolean)
      .join("、");
    sections.push(
      [
        "逐句难词",
        annotations,
        "",
        "精读导览",
        `背景：${deep.background}`,
        `这首诗写了什么：${deep.guide.summary}`,
        `转折在哪里：${deep.guide.turn}`,
        `它如何写成：${deep.guide.craft}`,
        `核对依据：${sourceLabels}`,
      ].join("\n"),
    );
  }
  sections.push(
    [
      "资料来源",
      `原文：${poem.source}`,
      `译文：${translationMeta.source}`,
      `译文状态：${reviewLabel}`,
    ].join("\n"),
  );
  if (poem.tags.length) sections.push(`标签：${poem.tags.join(" · ")}`);
  return displayText(sections.join("\n\n"));
}

async function copyCurrent() {
  if (!state.current) return;
  try {
    await navigator.clipboard.writeText(copyText(state.current));
    updateNotice(
      state.current.translation.length
        ? "原文、译文、来源与校订状态已复制"
        : "原文、来源与校订状态已复制",
    );
  } catch (error) {
    console.error(error);
    updateNotice("复制未成功，请稍后重试");
  }
}

function shareAppearance() {
  const styles = getComputedStyle(document.documentElement);
  return {
    paper: styles.getPropertyValue("--paper"),
    paperDeep: styles.getPropertyValue("--paper-deep"),
    ink: styles.getPropertyValue("--ink"),
    inkSoft: styles.getPropertyValue("--ink-soft"),
    line: styles.getPropertyValue("--line"),
    accent: styles.getPropertyValue("--cinnabar"),
    moss: styles.getPropertyValue("--moss"),
    serif: styles.getPropertyValue("--serif"),
    kai: styles.getPropertyValue("--kai"),
  };
}

function localizedSharePoem(poem) {
  return {
    ...poem,
    title: displayText(poem.title),
    dynasty: displayText(dynastyLabel(poem.dynasty)),
    author: displayText(poem.author),
    lines: poem.lines.map(displayText),
  };
}

function shareCanvasBlob() {
  return new Promise((resolve, reject) => {
    elements.shareCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片导出失败"));
    }, "image/png");
  });
}

function canSharePosterFile() {
  if (!globalThis.File || !navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "诗意一刻.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function openShareDialog() {
  if (!state.current) return;
  clearAutoNextTimer();
  const poem = state.current;
  state.sharePosterPoemId = null;
  elements.shareLoading.hidden = false;
  elements.shareCopyAction.disabled = true;
  elements.shareDownloadAction.disabled = true;
  setLocalizedText(elements.shareDialogStatus, "正在生成高清诗笺与二维码…");
  setLocalizedText(
    elements.shareDownloadLabel,
    canSharePosterFile() ? "分享图片" : "下载高清图片",
  );
  if (!elements.shareDialog.open) elements.shareDialog.showModal();

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    createSharePoster(
      elements.shareCanvas,
      localizedSharePoem(poem),
      shareAppearance(),
    );
    if (!elements.shareDialog.open || state.current?.id !== poem.id) return;
    state.sharePosterPoemId = poem.id;
    elements.shareLoading.hidden = true;
    elements.shareCopyAction.disabled = false;
    elements.shareDownloadAction.disabled = false;
    setLocalizedText(
      elements.shareDialogStatus,
      "高清 PNG 已生成；二维码包含本篇题目、作者、诗句节选与项目入口。",
    );
    elements.shareDownloadAction.focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
    elements.shareLoading.hidden = true;
    setLocalizedText(elements.shareDialogStatus, "诗笺生成未成功，请关闭后再试一次。");
  }
}

async function copySharePoster() {
  if (!state.current || state.sharePosterPoemId !== state.current.id) return;
  if (!navigator.clipboard?.write || !globalThis.ClipboardItem) {
    setLocalizedText(
      elements.shareDialogStatus,
      "当前浏览器暂不支持复制图片，请使用“下载高清图片”。",
    );
    return;
  }
  try {
    const blob = await shareCanvasBlob();
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    setLocalizedText(elements.shareDialogStatus, "图片已复制，可直接粘贴到聊天或笔记中。");
  } catch (error) {
    console.error(error);
    setLocalizedText(
      elements.shareDialogStatus,
      "图片复制未成功，请改用“下载高清图片”。",
    );
  }
}

function downloadShareBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

async function shareOrDownloadPoster() {
  if (!state.current || state.sharePosterPoemId !== state.current.id) return;
  try {
    const localizedPoem = localizedSharePoem(state.current);
    const blob = await shareCanvasBlob();
    const fileName = buildShareFileName(localizedPoem);
    if (canSharePosterFile()) {
      const file = new File([blob], fileName, { type: "image/png" });
      try {
        await navigator.share({
          files: [file],
          title: `《${localizedPoem.title}》· 诗意一刻`,
          text: `${localizedPoem.dynasty} · ${localizedPoem.author}`,
        });
        setLocalizedText(elements.shareDialogStatus, "分享面板已打开。");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
        // 某些桌面环境声明支持文件分享却无法唤起面板，此时仍交付可用的高清图片。
      }
    }
    downloadShareBlob(blob, fileName);
    setLocalizedText(
      elements.shareDialogStatus,
      canSharePosterFile()
        ? "系统分享暂不可用，已改为下载高清图片。"
        : "高清图片已下载。",
    );
  } catch (error) {
    console.error(error);
    setLocalizedText(elements.shareDialogStatus, "图片分享未成功，请稍后重试。");
  }
}

function normalizeReviewMode(value) {
  return value === "all" || value === "reviewed" ? value : "deep";
}

function loadReviewModePreference() {
  return new Promise((resolve) => {
    const finish = (value) => {
      state.reviewMode = normalizeReviewMode(value);
      resolve();
    };

    if (!globalThis.chrome?.storage?.local) {
      try {
        finish(localStorage.getItem(REVIEW_MODE_KEY));
      } catch {
        finish("deep");
      }
      return;
    }

    chrome.storage.local.get([REVIEW_MODE_KEY], (result) => {
      finish(result[REVIEW_MODE_KEY]);
    });
  });
}

function saveReviewModePreference() {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [REVIEW_MODE_KEY]: state.reviewMode });
    return;
  }
  try {
    localStorage.setItem(REVIEW_MODE_KEY, state.reviewMode);
  } catch {
    // 受限预览环境可能禁止本地存储，校订范围仍可在本次页面中使用。
  }
}

function registerReaderPage() {
  if (!globalThis.chrome?.runtime?.sendMessage) return;
  try {
    // 让后台在浏览器重启恢复页签后重新登记本阅读页，后续点击图标即可直接聚焦。
    const pending = chrome.runtime.sendMessage({ type: "reader-page-ready" });
    if (pending?.catch) pending.catch(() => {});
  } catch {
    // 普通网页预览不具备完整扩展上下文，不影响本地视觉检查。
  }
}

function loadFavorites() {
  return new Promise((resolve) => {
    // 普通网页预览没有扩展存储 API，回退到 localStorage 以便本地开发和视觉检查。
    if (!globalThis.chrome?.storage?.local) {
      try {
        state.favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"));
      } catch {
        state.favorites = new Set();
      }
      resolve();
      return;
    }
    chrome.storage.local.get([FAVORITES_KEY], (result) => {
      const saved = Array.isArray(result[FAVORITES_KEY]) ? result[FAVORITES_KEY] : [];
      state.favorites = new Set(saved);
      resolve();
    });
  });
}

function saveFavorites() {
  const saved = [...state.favorites];
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [FAVORITES_KEY]: saved });
  } else {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(saved));
  }
}

function loadReadingStats() {
  return new Promise((resolve) => {
    const finish = (value) => {
      state.readingStats = normalizeReadingStats(value);
      resolve();
    };

    if (!globalThis.chrome?.storage?.local) {
      try {
        finish(JSON.parse(localStorage.getItem(READING_STATS_KEY) ?? "null"));
      } catch {
        finish(null);
      }
      return;
    }

    chrome.storage.local.get([READING_STATS_KEY], (result) => {
      finish(result[READING_STATS_KEY]);
    });
  });
}

function saveReadingStats() {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ [READING_STATS_KEY]: state.readingStats });
    return;
  }
  try {
    localStorage.setItem(READING_STATS_KEY, JSON.stringify(state.readingStats));
  } catch {
    // 受限预览环境可能禁止本地存储，阅读统计仍可在本次页面中使用。
  }
}

function loadLearningProgress() {
  return new Promise((resolve) => {
    const finish = (value) => {
      state.learningProgress = normalizeLearningProgress(value);
      resolve();
    };

    if (!globalThis.chrome?.storage?.local) {
      try {
        finish(JSON.parse(localStorage.getItem(LEARNING_PROGRESS_KEY) ?? "null"));
      } catch {
        finish(null);
      }
      return;
    }

    chrome.storage.local.get([LEARNING_PROGRESS_KEY], (result) => {
      finish(result[LEARNING_PROGRESS_KEY]);
    });
  });
}

function saveLearningProgress() {
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({
      [LEARNING_PROGRESS_KEY]: state.learningProgress,
    });
    return;
  }
  try {
    localStorage.setItem(
      LEARNING_PROGRESS_KEY,
      JSON.stringify(state.learningProgress),
    );
  } catch {
    // 学习进度仅保存在本机；预览环境禁用存储时，本轮练习仍能完整完成。
  }
}

function recordReading(poemId) {
  const result = addReading(state.readingStats, poemId);
  state.readingStats = result.stats;
  if (result.changed) saveReadingStats();
}

function toggleFavorite() {
  if (!state.current) return;
  const removed = state.favorites.has(state.current.id);
  if (removed) {
    state.favorites.delete(state.current.id);
    updateNotice("已取消收藏");
  } else {
    state.favorites.add(state.current.id);
    updateNotice("已收入诗笺");
  }
  saveFavorites();
  renderFavorite();
  renderFilters();

  if (removed && state.category === "收藏") {
    // 当前筛选可能只命中被移除的诗；自动放宽作者与标签，继续展示其余收藏。
    if (!filteredPoems().length && state.favorites.size) {
      state.author = "";
      state.tag = "";
      renderFilters();
    }
    resetReadingHistory();
    showRandom(
      state.favorites.size ? "已从收藏移除" : "收藏已清空",
      { recordPrevious: false },
    );
  }
}

function bindEvents() {
  // 诗库在手机端是覆盖式浮层；点击页面其余区域或按 Esc 都应自然收起。
  document.addEventListener("pointerdown", (event) => {
    if (
      !matchMedia("(max-width: 650px)").matches ||
      !elements.libraryPanel.open ||
      elements.libraryPanel.contains(event.target)
    ) {
      return;
    }
    elements.libraryPanel.open = false;
  });

  elements.dailyTrigger.addEventListener("click", openDailyPoem);
  elements.themeTrigger.addEventListener("click", openThemeDialog);
  elements.themeDialogClose.addEventListener("click", () => elements.themeDialog.close());
  elements.themeDialog.addEventListener("click", (event) => {
    if (event.target === elements.themeDialog) elements.themeDialog.close();
  });
  elements.themeDialog.addEventListener("close", () => {
    scheduleAutoNext();
    elements.themeTrigger.focus({ preventScroll: true });
  });
  for (const option of elements.themeOptions) {
    option.addEventListener("click", () => {
      applyTheme(option.dataset.themeOption, { persist: true, announce: true });
    });
  }
  for (const option of elements.fontOptions) {
    option.addEventListener("click", () => {
      applyFont(option.dataset.fontOption, { persist: true, announce: true });
    });
  }
  for (const option of elements.scriptOptions) {
    option.addEventListener("click", () => {
      applyScript(option.dataset.scriptOption, { persist: true, announce: true });
    });
  }

  elements.learningDialogClose.addEventListener("click", () => {
    elements.learningDialog.close();
  });
  elements.learningDialog.addEventListener("click", (event) => {
    if (event.target === elements.learningDialog) elements.learningDialog.close();
  });
  elements.learningDialog.addEventListener("close", () => {
    state.practice = null;
    scheduleAutoNext();
    elements.poem
      .querySelector(".learning-card-action")
      ?.focus({ preventScroll: true });
  });
  elements.learningCheck.addEventListener("click", checkLearningAnswer);
  elements.learningNext.addEventListener("click", advanceLearningPractice);
  elements.learningAnswer.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (state.practice?.answered) advanceLearningPractice();
    else checkLearningAnswer();
  });
  for (const button of elements.learningRatingButtons) {
    button.addEventListener("click", () => {
      rateLearningPractice(button.dataset.learningRating);
    });
  }

  for (const button of elements.categoryButtons) {
    button.addEventListener("click", () => {
      state.category = state.category === "收藏" ? "全部" : "收藏";
      state.author = "";
      state.tag = "";
      resetReadingHistory();
      renderFilters();
      const unit = workUnit();
      const message =
        state.category === "收藏"
          ? `我的收藏 · 共 ${filteredPoems().length} ${unit}`
          : `已返回全部诗词 · 共 ${filteredPoems().length} ${unit}`;
      showRandom(message, { recordPrevious: false });
    });
  }

  elements.reviewModeSelect.addEventListener("change", () => {
    state.reviewMode = normalizeReviewMode(elements.reviewModeSelect.value);
    state.author = "";
    state.tag = "";
    resetReadingHistory();
    saveReviewModePreference();
    renderFilters();
    const rangeName = reviewModeLabel();
    showRandom(
      `${rangeName} · 共 ${filteredPoems().length} ${workUnit()}`,
      { recordPrevious: false },
    );
  });

  elements.periodSelect.addEventListener("change", () => {
    state.period = elements.periodSelect.value;
    state.author = "";
    state.tag = "";
    resetReadingHistory();
    renderFilters();
    showRandom(
      `${state.period || "全部朝代"} · 共 ${filteredPoems().length} ${workUnit()}`,
      { recordPrevious: false },
    );
  });

  elements.authorSelect.addEventListener("change", () => {
    state.author = elements.authorSelect.value;
    keepTagIfAvailable();
    resetReadingHistory();
    renderFilters();
    showRandom(
      `${state.author || categoryAuthorLabel()[1]} · 共 ${filteredPoems().length} ${workUnit()}`,
      { recordPrevious: false },
    );
  });

  elements.tagSelect.addEventListener("change", () => {
    state.tag = elements.tagSelect.value;
    resetReadingHistory();
    renderFilters();
    showRandom(
      `${state.tag ? `标签「${state.tag}」` : "全部标签"} · 共 ${filteredPoems().length} ${workUnit()}`,
      { recordPrevious: false },
    );
  });

  elements.clearFilter.addEventListener("click", () => {
    state.category = "全部";
    state.period = "";
    state.author = "";
    state.tag = "";
    resetReadingHistory();
    renderFilters();
    showRandom(
      `筛选已清除 · 当前范围共 ${filteredPoems().length} 篇`,
      { recordPrevious: false },
    );
  });

  elements.resultTrigger.addEventListener("click", () => {
    elements.libraryPanel.open = false;
    openPoemList();
  });
  elements.poemListClose.addEventListener("click", () => elements.poemListDialog.close());
  elements.poemListSearch.addEventListener("input", renderPoemList);
  elements.poemListDialog.addEventListener("click", (event) => {
    if (event.target === elements.poemListDialog) elements.poemListDialog.close();
  });
  elements.poemListDialog.addEventListener("close", () => {
    scheduleAutoNext();
    if (!elements.resultTrigger.disabled) elements.resultTrigger.focus({ preventScroll: true });
  });

  elements.searchTrigger.addEventListener("click", openGlobalSearch);
  elements.searchDialogClose.addEventListener("click", () => elements.searchDialog.close());
  elements.globalSearchInput.addEventListener("input", renderGlobalSearch);
  elements.searchDialog.addEventListener("click", (event) => {
    if (event.target === elements.searchDialog) elements.searchDialog.close();
  });
  elements.searchDialog.addEventListener("close", () => {
    state.searchRequestId += 1;
    scheduleAutoNext();
    elements.searchTrigger.focus({ preventScroll: true });
  });

  elements.authorDialogClose.addEventListener("click", () => elements.authorDialog.close());
  elements.authorWorksAction.addEventListener("click", showActiveAuthorWorks);
  elements.authorDialog.addEventListener("click", (event) => {
    if (event.target === elements.authorDialog) elements.authorDialog.close();
  });
  elements.authorDialog.addEventListener("close", () => {
    scheduleAutoNext();
    elements.poem.querySelector(".author-filter")?.focus({ preventScroll: true });
  });

  elements.nextAction.addEventListener("click", () => showRandom());
  elements.previousAction.addEventListener("click", showPreviousPoem);
  elements.autoNextSelect.addEventListener("change", () => {
    applyAutoNext(elements.autoNextSelect.value, { persist: true, announce: true });
  });
  elements.favoriteAction.addEventListener("click", toggleFavorite);
  elements.copyAction.addEventListener("click", copyCurrent);
  elements.shareAction.addEventListener("click", openShareDialog);
  elements.shareDialogClose.addEventListener("click", () => elements.shareDialog.close());
  elements.shareDialog.addEventListener("click", (event) => {
    if (event.target === elements.shareDialog) elements.shareDialog.close();
  });
  elements.shareDialog.addEventListener("close", () => {
    state.sharePosterPoemId = null;
    scheduleAutoNext();
    if (!elements.shareAction.disabled) {
      elements.shareAction.focus({ preventScroll: true });
    }
  });
  elements.shareCopyAction.addEventListener("click", copySharePoster);
  elements.shareDownloadAction.addEventListener("click", shareOrDownloadPoster);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      event.key === "Escape" &&
      matchMedia("(max-width: 650px)").matches &&
      elements.libraryPanel.open &&
      !document.querySelector("dialog[open]")
    ) {
      event.preventDefault();
      elements.libraryPanel.open = false;
      elements.librarySummary.focus({ preventScroll: true });
      return;
    }
    const isFormControl =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLButtonElement;
    if (
      isFormControl ||
      document.querySelector("dialog[open]") ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) return;

    if (event.code === "Space" || event.code === "ArrowRight") {
      event.preventDefault();
      if (!state.busy) showRandom();
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      void showPreviousPoem();
    } else if (event.key.toLowerCase() === "s") {
      openGlobalSearch();
    } else if (event.key.toLowerCase() === "d") {
      void openDailyPoem();
    } else if (event.key.toLowerCase() === "t") {
      openThemeDialog();
    } else if (event.key.toLowerCase() === "f") {
      toggleFavorite();
    } else if (event.key.toLowerCase() === "c") {
      copyCurrent();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearAutoNextTimer();
    else scheduleAutoNext();
  });
  window.addEventListener("pagehide", clearAutoNextTimer);
}

async function initialize() {
  registerReaderPage();
  updateFeedbackLink(null);
  applyTheme(state.theme);
  applyFont(state.font);
  bindEvents();
  try {
    const [response, authorResponse, deepResponse] = await Promise.all([
      fetch(`data/poems/index.json?v=${DATA_VERSION}`),
      fetch(`data/authors.json?v=${DATA_VERSION}`),
      fetch(`data/deep-readings.json?v=${DATA_VERSION}`),
      loadFavorites(),
      loadTheme(),
      loadFont(),
      loadScriptPreference(),
      loadAutoNextPreference(),
      loadReviewModePreference(),
      loadReadingStats(),
      loadLearningProgress(),
    ]);
    if (!response.ok) throw new Error(`诗库索引读取失败：${response.status}`);
    if (!authorResponse.ok) throw new Error(`作者资料读取失败：${authorResponse.status}`);
    if (!deepResponse.ok) throw new Error(`精读稿读取失败：${deepResponse.status}`);
    const [data, authorData, deepData] = await Promise.all([
      response.json(),
      authorResponse.json(),
      deepResponse.json(),
    ]);
    if (!Array.isArray(data.poems) || !data.poems.length) throw new Error("诗库索引为空");
    if (!Array.isArray(authorData.authors) || !authorData.authors.length) {
      throw new Error("作者资料为空");
    }
    if (!Array.isArray(deepData.poems) || !deepData.poems.length) {
      throw new Error("精读稿为空");
    }
    if (!Array.isArray(deepData.sources) || !deepData.sources.length) {
      throw new Error("精读核对依据为空");
    }

    // 必须先建立精读映射，再归一化索引，才能为每篇作品赋予准确的深度层级。
    state.deepReadings = new Map(
      deepData.poems.map((reading) => [reading.id, reading]),
    );
    state.deepSources = new Map(
      deepData.sources.map((source) => [source.id, source]),
    );
    state.deepEditorialPolicy =
      typeof deepData.editorialPolicy === "string" ? deepData.editorialPolicy : "";
    state.index = data.poems.map(normalizeMeta);
    state.reviewCounts = {
      deep: state.index.filter((poem) => poem.depthStatus === "deep").length,
      reviewed: state.index.filter((poem) => poem.reviewStatus === "reviewed").length,
      all: state.index.length,
    };
    state.poemsById = new Map(state.index.map((poem) => [poem.id, poem]));
    const deepPoemIds = new Set(
      state.index
        .filter((poem) => poem.depthStatus === "deep")
        .map((poem) => poem.id),
    );
    state.learningProgress = normalizeLearningProgress({
      version: 1,
      poems: Object.fromEntries(
        Object.entries(state.learningProgress.poems).filter(([id]) =>
          deepPoemIds.has(id),
        ),
      ),
    });
    state.authors = new Map(
      authorData.authors.map((author) => [
        authorKey(author.dynasty, author.name),
        author,
      ]),
    );
    state.favorites = new Set(
      [...state.favorites].filter((id) => state.index.some((poem) => poem.id === id)),
    );
    renderFilters();
    await showPoem(
      chooseRandom(filteredPoems()),
      state.reviewMode === "deep"
        ? `深度精读已展开 · 共 ${state.reviewCounts.deep} 篇 · 轻点诗句逐句读懂`
        : state.reviewMode === "reviewed"
          ? `已校精选已展开 · 共 ${state.reviewCounts.reviewed} 篇`
          : `全库广览已展开 · 共 ${state.reviewCounts.all} 篇 · 含待校内容`,
    );
    state.ready = true;
  } catch (error) {
    console.error(error);
    setBusy(false);
    state.ready = true;
    updateNotice("诗库暂未能展开，请重新打开此页");
  }
}

initialize();
