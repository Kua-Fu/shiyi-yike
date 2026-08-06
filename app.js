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
  checkPuzzleOrder,
  createJigsawPath,
  createPuzzleRounds,
  movePuzzlePieceToSlot,
  resolvePuzzleShapeIndex,
} from "./poem-puzzle.js";
import { createStorageAdapter } from "./storage-adapter.js";
import {
  highlightTextSegments,
  normalizeSearchText,
} from "./search-core.js";
import { authorKey, createAuthorChoices, poemMatchesAuthor } from "./author-library.js";
import { isWebReader, requestedPoemId, syncPoemUrl } from "./reader-routing.js";
import {
  AUTO_NEXT_INTERVALS,
  CHROME_STORE_URL,
  DATA_VERSION,
  DEFAULT_AUTO_NEXT_SECONDS,
  FEEDBACK_ISSUE_URL,
  FONTS,
  MAX_READING_HISTORY,
  MAX_SEARCH_RESULTS,
  ONBOARDING_STEPS,
  PERIOD_ORDER,
  POEM_LIST_PAGE_SIZE,
  PUZZLE_PIECE_COLORS,
  SEARCH_INPUT_DEBOUNCE_MS,
  STORAGE_KEYS,
  THEMES,
} from "./reader-config.js";

const {
  favorites: FAVORITES_KEY,
  theme: THEME_KEY,
  font: FONT_KEY,
  script: SCRIPT_KEY,
  autoNext: AUTO_NEXT_KEY,
  reviewMode: REVIEW_MODE_KEY,
  readingStats: READING_STATS_KEY,
  learningProgress: LEARNING_PROGRESS_KEY,
  onboarding: ONBOARDING_KEY,
  webInstallDismissed: WEB_INSTALL_DISMISSED_KEY,
} = STORAGE_KEYS;
// 诗库只保留一份简体源数据：展示时转为繁体，搜索时再归一化为简体，避免维护两套正文。
let TO_TRADITIONAL = (value) => String(value);
let TO_SIMPLIFIED = (value) => String(value);
let STATIC_SCRIPT_CONVERTER = { convert() {}, restore() {} };
let openCCPromise = null;
let sharePosterModulePromise = null;
let storageWarningShown = false;

const storageAdapter = createStorageAdapter({
  onError(error, context) {
    console.error(`本地存储${context.operation === "write" ? "写入" : "读取"}失败`, error);
    // 只在用户操作触发写入失败时提示一次；初始化读取失败会安全回退默认值，不用错误打断首屏。
    if (context.operation === "write" && state.ready && !storageWarningShown) {
      storageWarningShown = true;
      updateNotice("设置暂未能保存，本次打开期间仍可继续使用");
    }
  },
});

function loadOpenCC() {
  if (globalThis.OpenCC?.Converter) return Promise.resolve(globalThis.OpenCC);
  if (!openCCPromise) {
    openCCPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `vendor/opencc-js/full.js?v=${DATA_VERSION}`;
      script.async = true;
      script.addEventListener("load", () => resolve(globalThis.OpenCC), { once: true });
      script.addEventListener(
        "error",
        () => {
          script.remove();
          reject(new Error("繁简转换组件加载失败"));
        },
        { once: true },
      );
      document.head.append(script);
    }).then((openCC) => {
      if (!openCC?.Converter) throw new Error("繁简转换组件不可用");
      TO_TRADITIONAL = openCC.Converter({ from: "cn", to: "tw" });
      TO_SIMPLIFIED = openCC.Converter({ from: "tw", to: "cn" });
      STATIC_SCRIPT_CONVERTER = openCC.HTMLConverter(
        TO_TRADITIONAL,
        document.documentElement,
        "zh-CN",
        "zh-Hant",
      );
      return openCC;
    }).catch((error) => {
      // 移动网络偶发失败后允许用户再次切换重试，不把失败 Promise 永久缓存。
      openCCPromise = null;
      throw error;
    });
  }
  return openCCPromise;
}

function loadSharePosterModule() {
  if (!sharePosterModulePromise) {
    sharePosterModulePromise = import("./share-poster.js").catch((error) => {
      sharePosterModulePromise = null;
      throw error;
    });
  }
  return sharePosterModulePromise;
}

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
  authorDynasty: "",
  authorChoices: [],
  visibleAuthorChoices: [],
  activeAuthorChoiceIndex: -1,
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
  puzzle: null,
  chunks: new Map(),
  searchScopePromises: new Map(),
  searchWorker: null,
  searchWorkerSequence: 0,
  searchWorkerPending: new Map(),
  deepSearchRecords: [],
  searchRequestId: 0,
  searchDebounceTimer: null,
  poemListVisibleLimit: POEM_LIST_PAGE_SIZE,
  requestId: 0,
  busy: false,
  ready: false,
  libraryReady: false,
  libraryLoading: false,
  libraryPromise: null,
  deferredReviewMode: null,
  authorsPromise: null,
  autoNextSeconds: DEFAULT_AUTO_NEXT_SECONDS,
  autoNextTimer: null,
  autoNextProgressTimer: null,
  autoNextStartedAt: null,
  autoNextDeadline: null,
  noticeDismissTimer: null,
  sharePosterPoemId: null,
  focusMode: false,
  onboardingStep: "complete",
  isFirstVisit: false,
  webInstallDismissed: false,
};

const elements = {
  readerShell: document.querySelector(".scroll"),
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
  authorField: document.querySelector("#author-field"),
  authorLabel: document.querySelector("#author-label"),
  authorInput: document.querySelector("#author-input"),
  authorClear: document.querySelector("#author-clear"),
  authorOptions: document.querySelector("#author-options"),
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
  puzzleAction: document.querySelector("#puzzle-action"),
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
  poemListMore: document.querySelector("#poem-list-more"),
  searchTrigger: document.querySelector("#search-trigger"),
  focusTrigger: document.querySelector("#focus-trigger"),
  focusView: document.querySelector("#focus-view"),
  focusExit: document.querySelector("#focus-exit"),
  focusTitle: document.querySelector("#focus-title"),
  focusByline: document.querySelector("#focus-byline"),
  focusLines: document.querySelector("#focus-lines"),
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
  puzzleDialog: document.querySelector("#puzzle-dialog"),
  puzzleDialogTitle: document.querySelector("#puzzle-dialog-title"),
  puzzleDialogMeta: document.querySelector("#puzzle-dialog-meta"),
  puzzleDialogClose: document.querySelector("#puzzle-dialog-close"),
  puzzlePractice: document.querySelector("#puzzle-practice"),
  puzzleStep: document.querySelector("#puzzle-step"),
  puzzleProgressTrack: document.querySelector("#puzzle-progress-track"),
  puzzleProgressFill: document.querySelector("#puzzle-progress-fill"),
  puzzleAnswer: document.querySelector("#puzzle-answer"),
  puzzleAnswerEmpty: document.querySelector("#puzzle-answer-empty"),
  puzzleBank: document.querySelector("#puzzle-bank"),
  puzzleRemaining: document.querySelector("#puzzle-remaining"),
  puzzleResult: document.querySelector("#puzzle-result"),
  puzzleResultTitle: document.querySelector("#puzzle-result-title"),
  puzzleResultAnswer: document.querySelector("#puzzle-result-answer"),
  puzzleReset: document.querySelector("#puzzle-reset"),
  puzzleCheck: document.querySelector("#puzzle-check"),
  puzzleNext: document.querySelector("#puzzle-next"),
  puzzleComplete: document.querySelector("#puzzle-complete"),
  puzzleScore: document.querySelector("#puzzle-score"),
  puzzleCompleteNote: document.querySelector("#puzzle-complete-note"),
  puzzleReplay: document.querySelector("#puzzle-replay"),
  puzzleFinish: document.querySelector("#puzzle-finish"),
  onboardingGuide: document.querySelector("#onboarding-guide"),
  onboardingGuideMark: document.querySelector("#onboarding-guide-mark"),
  onboardingGuideStep: document.querySelector("#onboarding-guide-step"),
  onboardingGuideTitle: document.querySelector("#onboarding-guide-title"),
  onboardingGuideDescription: document.querySelector("#onboarding-guide-description"),
  onboardingGuideAction: document.querySelector("#onboarding-guide-action"),
  onboardingGuideDismiss: document.querySelector("#onboarding-guide-dismiss"),
  webInstallPrompt: document.querySelector("#web-install-prompt"),
  webInstallAction: document.querySelector("#web-install-action"),
  webInstallDismiss: document.querySelector("#web-install-dismiss"),
};

const ONBOARDING_COPY = {
  verse: {
    mark: "一",
    step: "初次相逢 · 第 1 步 / 3",
    title: "先读懂一句，不必急着背全文",
    description: "轻点任一句原文，译文与难词会在原处展开。",
    action: "找到第一句",
    target: ".verse-trigger",
  },
  guide: {
    mark: "二",
    step: "已读懂一句 · 第 2 步 / 3",
    title: "再看整首诗如何转折",
    description: "展开精读导览，把背景、诗意与写法连成一条线。",
    action: "找到精读导览",
    target: ".deep-reading-summary",
  },
  recall: {
    mark: "三",
    step: "已读完导览 · 第 3 步 / 3",
    title: "最后，用回想把它真正记住",
    description: "不看原文补全诗句，完成后会自动安排下一次复习。",
    action: "找到开始回想",
    target: ".learning-card-action",
  },
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

async function loadOnboardingProgress() {
  const savedStep = await storageAdapter.get(ONBOARDING_KEY);
  const hasSavedStep = ONBOARDING_STEPS.has(savedStep);
  state.onboardingStep = hasSavedStep ? savedStep : "verse";
  state.isFirstVisit = !hasSavedStep;
}

function saveOnboardingProgress() {
  void storageAdapter.set(ONBOARDING_KEY, state.onboardingStep);
}

function renderOnboardingGuide() {
  const copy = ONBOARDING_COPY[state.onboardingStep];
  const canGuideCurrentPoem = Boolean(state.current?.deepReading);
  elements.onboardingGuide.hidden = !copy || !canGuideCurrentPoem;
  if (!copy || !canGuideCurrentPoem) return;

  elements.onboardingGuide.dataset.step = state.onboardingStep;
  setLocalizedText(elements.onboardingGuideMark, copy.mark);
  setLocalizedText(elements.onboardingGuideStep, copy.step);
  setLocalizedText(elements.onboardingGuideTitle, copy.title);
  setLocalizedText(elements.onboardingGuideDescription, copy.description);
  setLocalizedText(elements.onboardingGuideAction, copy.action);
}

function advanceOnboarding(expectedStep, nextStep) {
  if (state.onboardingStep !== expectedStep) return;
  state.onboardingStep = nextStep;
  saveOnboardingProgress();
  renderOnboardingGuide();
}

function focusOnboardingTarget() {
  const copy = ONBOARDING_COPY[state.onboardingStep];
  const target = copy ? elements.poem.querySelector(copy.target) : null;
  if (!(target instanceof HTMLElement)) return;
  target.scrollIntoView({
    block: "center",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
  target.focus({ preventScroll: true });
}

function dismissOnboarding() {
  state.onboardingStep = "complete";
  saveOnboardingProgress();
  renderOnboardingGuide();
  updateNotice("引导已收起，随时按自己的节奏赏读");
}

async function loadWebInstallPreference() {
  if (!isWebReader()) return;
  const saved = await storageAdapter.get(WEB_INSTALL_DISMISSED_KEY, { fallback: false });
  state.webInstallDismissed = saved === true || saved === "true";
}

function revealWebInstallPrompt() {
  // 只在网页版完成一次真实阅读动作后邀请安装；扩展页及已主动关闭的读者始终不受打扰。
  if (!isWebReader() || state.webInstallDismissed || !elements.webInstallPrompt.hidden) return;
  elements.webInstallPrompt.hidden = false;
}

function dismissWebInstallPrompt() {
  state.webInstallDismissed = true;
  elements.webInstallPrompt.hidden = true;
  void storageAdapter.set(WEB_INSTALL_DISMISSED_KEY, true);
  updateNotice("安装提示已收起，继续在线赏读");
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

async function loadTheme() {
  const themeId = await storageAdapter.get(THEME_KEY, { fallback: "xuan" });
  applyTheme(typeof themeId === "string" ? themeId : "xuan");
}

function saveTheme() {
  void storageAdapter.set(THEME_KEY, state.theme);
}

async function loadFont() {
  const fontId = await storageAdapter.get(FONT_KEY, { fallback: "default" });
  applyFont(typeof fontId === "string" ? fontId : "default");
}

function saveFont() {
  void storageAdapter.set(FONT_KEY, state.font);
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
  if (elements.poemListDialog.open) renderPoemList({ preserveScroll: true });
  if (elements.searchDialog.open) void renderGlobalSearch();
  if (elements.authorDialog.open) renderActiveAuthorDialog();
  setBusy(state.busy);
  updateNotice(state.noticeMessage);
}

async function applyScript(scriptId, options = {}) {
  const normalizedScript = scriptId === "traditional" ? "traditional" : "simplified";
  if (normalizedScript === "traditional") await loadOpenCC();
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

async function loadScriptPreference() {
  const scriptId = await storageAdapter.get(SCRIPT_KEY, { fallback: "simplified" });
  try {
    await applyScript(scriptId === "traditional" ? "traditional" : "simplified");
  } catch (error) {
    console.error(error);
    await applyScript("simplified");
  }
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
    !state.focusMode &&
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
      elements.puzzleDialog,
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
  void storageAdapter.set(AUTO_NEXT_KEY, state.autoNextSeconds);
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

async function loadAutoNextPreference() {
  const seconds = await storageAdapter.get(AUTO_NEXT_KEY, {
    fallback: DEFAULT_AUTO_NEXT_SECONDS,
  });
  applyAutoNext(seconds);
}

function saveScriptPreference() {
  void storageAdapter.set(SCRIPT_KEY, state.script);
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

function matchesAuthorFilter(poem) {
  return poemMatchesAuthor(poem, state.author, state.authorDynasty);
}

function clearAuthorFilter() {
  state.author = "";
  state.authorDynasty = "";
}

function matchesFilters(poem) {
  // 默认仅进入已人工校订的安全范围；用户明确选择“全库广览”后才展示待校与 AI 草稿。
  const matchesCategory =
    state.category === "全部" || state.favorites.has(poem.id);
  return (
    matchesReviewMode(poem) &&
    matchesCategory &&
    (!state.period || poem.period === state.period) &&
    matchesAuthorFilter(poem) &&
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
  clearAuthorFilter();
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

function selectedAuthorChoice() {
  return state.authorChoices.find(
    (choice) =>
      choice.name === state.author &&
      (!state.authorDynasty || choice.dynasty === state.authorDynasty),
  );
}

function closeAuthorOptions() {
  elements.authorOptions.hidden = true;
  elements.authorInput.setAttribute("aria-expanded", "false");
  elements.authorInput.removeAttribute("aria-activedescendant");
  state.activeAuthorChoiceIndex = -1;
}

function renderAuthorSuggestions() {
  const selected = selectedAuthorChoice();
  const rawQuery = elements.authorInput.value;
  const query = selected && rawQuery === displayText(selected.label)
    ? ""
    : normalizeSearchValue(rawQuery);
  const visibleChoices = state.authorChoices
    .filter((choice) =>
      !query || normalizeSearchValue(`${choice.name} ${choice.dynasty}`).includes(query),
    )
    .slice(0, 60);
  state.visibleAuthorChoices = visibleChoices;
  state.activeAuthorChoiceIndex = Math.min(
    state.activeAuthorChoiceIndex,
    visibleChoices.length - 1,
  );

  const fragment = document.createDocumentFragment();
  visibleChoices.forEach((choice, index) => {
    const option = makeElement("div", "author-option");
    option.id = `author-option-${index}`;
    option.role = "option";
    option.dataset.authorKey = choice.key;
    option.tabIndex = -1;
    option.setAttribute("aria-selected", String(choice === selected));
    option.dataset.active = String(index === state.activeAuthorChoiceIndex);
    option.append(
      makeElement("span", "author-option-name", choice.label),
      makeElement("span", "author-option-count", `${choice.works} 篇`),
    );
    option.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      selectAuthorChoice(choice);
    });
    fragment.append(option);
  });
  if (!visibleChoices.length) {
    fragment.append(makeElement("div", "author-options-empty", "没有找到这位作者"));
  } else if (!query && state.authorChoices.length > visibleChoices.length) {
    fragment.append(
      makeElement("div", "author-options-hint", `输入名字可检索全部 ${state.authorChoices.length} 位作者`),
    );
  }
  elements.authorOptions.replaceChildren(fragment);
}

function openAuthorOptions() {
  if (elements.authorInput.disabled) return;
  elements.authorOptions.hidden = false;
  elements.authorInput.setAttribute("aria-expanded", "true");
  renderAuthorSuggestions();
}

function moveActiveAuthorChoice(offset) {
  if (!state.visibleAuthorChoices.length) return;
  state.activeAuthorChoiceIndex = state.activeAuthorChoiceIndex < 0
    ? offset > 0
      ? 0
      : state.visibleAuthorChoices.length - 1
    : (state.activeAuthorChoiceIndex + offset + state.visibleAuthorChoices.length) %
      state.visibleAuthorChoices.length;
  renderAuthorSuggestions();
  const activeOption = elements.authorOptions.querySelector(
    `#author-option-${state.activeAuthorChoiceIndex}`,
  );
  if (activeOption) {
    elements.authorInput.setAttribute("aria-activedescendant", activeOption.id);
    activeOption.scrollIntoView({ block: "nearest" });
  }
}

function selectAuthorChoice(choice) {
  state.author = choice.name;
  state.authorDynasty = choice.dynasty;
  elements.authorInput.value = displayText(choice.label);
  closeAuthorOptions();
  keepTagIfAvailable();
  resetReadingHistory();
  renderFilters();
  showRandom(`${choice.label} · 共 ${filteredPoems().length} ${workUnit()}`, {
    recordPrevious: false,
  });
}

function clearSelectedAuthor() {
  clearAuthorFilter();
  closeAuthorOptions();
  keepTagIfAvailable();
  resetReadingHistory();
  renderFilters();
  showRandom(`${categoryAuthorLabel()[1]} · 共 ${filteredPoems().length} ${workUnit()}`, {
    recordPrevious: false,
  });
  elements.authorInput.focus({ preventScroll: true });
}

function renderAuthorCombobox(poems, placeholder) {
  state.authorChoices = createAuthorChoices(poems);
  if (state.author && !selectedAuthorChoice()) clearAuthorFilter();
  const selected = selectedAuthorChoice();
  setLocalizedAttribute(elements.authorInput, "placeholder", placeholder);
  elements.authorInput.value = selected ? displayText(selected.label) : "";
  elements.authorClear.hidden = !selected;
  if (!elements.authorOptions.hidden) renderAuthorSuggestions();
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
  const [label, placeholder] = categoryAuthorLabel();
  setLocalizedText(elements.authorLabel, label);
  renderAuthorCombobox(categoryPoems, placeholder);

  const tagCounts = new Map();
  categoryPoems
    .filter(matchesAuthorFilter)
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
  const libraryBusy = busy || state.libraryLoading;
  for (const control of elements.categoryButtons) {
    control.disabled = libraryBusy || !state.index.length;
  }
  elements.reviewModeSelect.disabled =
    libraryBusy || !state.libraryReady || !state.index.length;
  elements.periodSelect.disabled = libraryBusy || !poemsInCurrentCollection().length;
  elements.authorInput.disabled = libraryBusy || !poemsInCurrentCategory().length;
  elements.authorClear.disabled = libraryBusy;
  if (elements.authorInput.disabled) closeAuthorOptions();
  elements.tagSelect.disabled = libraryBusy || !poemsInCurrentCategory().length;
  elements.resultTrigger.disabled = libraryBusy || !filteredPoems().length;
  // 默认精读搜索只依赖 100 篇首屏数据，可先于 1.6 MB 完整诗库开放；其他范围仍等待作品元数据就绪。
  elements.searchTrigger.disabled =
    busy || !state.index.length || (state.reviewMode !== "deep" && !state.libraryReady);
  elements.focusTrigger.disabled = busy || !state.current;
  renderDailyAction();
  elements.favoriteAction.disabled = busy || !state.current;
  elements.nextAction.disabled = busy || !filteredPoems().length;
  elements.copyAction.disabled = busy || !state.current;
  elements.shareAction.disabled = busy || !state.current;
  elements.puzzleAction.disabled = busy || !state.current;
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
  if (state.author) parts.push(selectedAuthorChoice()?.label ?? state.author);
  if (state.tag) parts.push(`标签「${state.tag}」`);
  return parts.join(" · ");
}

function poemMatchesListSearch(poem, query) {
  if (!query) return true;
  return normalizeSearchValue(
    [poem.title, poem.author, poem.dynasty, poem.period, ...poem.tags].join(" "),
  ).includes(query);
}

function appendHighlightedText(element, value, terms = []) {
  const segments = highlightTextSegments(value, terms);
  const fragment = document.createDocumentFragment();
  for (const segment of segments) {
    if (segment.highlight) fragment.append(makeElement("mark", "search-match", segment.text));
    else fragment.append(localizedTextNode(segment.text));
  }
  element.replaceChildren(fragment);
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
  const title = makeElement("span", "poem-list-item-title");
  const meta = makeElement("span", "poem-list-item-meta");
  appendHighlightedText(title, poem.title, options.highlightTerms);
  appendHighlightedText(
    meta,
    `${poem.dynasty} · ${poem.author}${poem.tags.length ? ` · ${poem.tags.slice(0, 3).join(" / ")}` : ""}`,
    options.highlightTerms,
  );
  main.append(title, meta);
  if (options.excerpt) {
    const excerpt = makeElement("span", "poem-list-item-excerpt");
    appendHighlightedText(excerpt, options.excerpt, options.highlightTerms);
    main.append(excerpt);
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

function renderPoemList(options = {}) {
  const allResults = filteredPoems();
  const query = normalizeSearchValue(elements.poemListSearch.value);
  const matchingResults = allResults.filter((poem) => poemMatchesListSearch(poem, query));
  // 全库最多有五千余篇；只渲染用户当前能浏览的一批，避免弹层打开和输入筛选时阻塞主线程。
  const visibleResults = matchingResults.slice(0, state.poemListVisibleLimit);
  const fragment = document.createDocumentFragment();
  visibleResults.forEach((poem, index) => {
    fragment.append(createPoemListItem(poem, index + 1));
  });

  const previousScrollTop = elements.poemList.scrollTop;
  const remaining = Math.max(0, matchingResults.length - visibleResults.length);
  elements.poemListMore.hidden = remaining === 0;
  setLocalizedText(
    elements.poemListMore,
    `再显示 ${Math.min(POEM_LIST_PAGE_SIZE, remaining)} ${workUnit()}`,
  );
  elements.poemList.replaceChildren(fragment, elements.poemListMore);
  elements.poemList.hidden = !visibleResults.length;
  elements.poemListEmpty.hidden = Boolean(visibleResults.length);
  const unit = workUnit();
  setLocalizedText(
    elements.poemListSummary,
    query
      ? `${currentFilterSummary()} · 找到 ${matchingResults.length} / ${allResults.length} ${unit} · 已显示 ${visibleResults.length}`
      : `${currentFilterSummary()} · 共 ${matchingResults.length} ${unit} · 已显示 ${visibleResults.length}`,
  );
  elements.poemList.scrollTop = options.preserveScroll ? previousScrollTop : 0;
}

function openPoemList() {
  if (!filteredPoems().length) return;
  clearAutoNextTimer();
  elements.poemListSearch.value = "";
  state.poemListVisibleLimit = POEM_LIST_PAGE_SIZE;
  setLocalizedText(
    elements.poemListTitle,
    state.category === "收藏" ? "我的收藏" : "可赏诗词",
  );
  renderPoemList();
  elements.poemListDialog.showModal();
  elements.poemListClose.focus();
}

function normalizeSearchValue(value) {
  return normalizeSearchText(TO_SIMPLIFIED(String(value)));
}

function createEmbeddedSearchRecord(poem) {
  return {
    id: poem.id,
    text: normalizeSearchValue([
      poem.title,
      poem.author,
      poem.dynasty,
      poem.period,
      poem.category,
      poem.form,
      ...poem.tags,
      ...poem.lines,
      ...poem.translation,
    ].join(" ")),
    excerpt: poem.lines.slice(0, 2).join(" "),
  };
}

function searchIndexScope(mode = state.reviewMode) {
  if (mode === "deep") return "deep";
  return mode === "all" ? "all" : "reviewed";
}

function searchMetadata(scope) {
  return state.index
    .filter((poem) =>
      scope === "deep"
        ? poem.depthStatus === "deep"
        : scope === "reviewed"
          ? poem.reviewStatus === "reviewed"
          : true,
    )
    .map((poem) => ({
      id: poem.id,
      title: poem.title,
      author: poem.author,
      tags: poem.tags,
      ordinal: poem.ordinal,
    }));
}

function failSearchWorker(error) {
  for (const { reject } of state.searchWorkerPending.values()) reject(error);
  state.searchWorkerPending.clear();
  state.searchScopePromises.clear();
  state.searchWorker?.terminate();
  state.searchWorker = null;
}

function getSearchWorker() {
  if (state.searchWorker) return state.searchWorker;
  const workerUrl = new URL("./search-worker.js", import.meta.url);
  workerUrl.searchParams.set("v", DATA_VERSION);
  const worker = new Worker(workerUrl, { type: "module", name: "poem-search" });
  worker.addEventListener("message", (event) => {
    const pending = state.searchWorkerPending.get(event.data?.requestId);
    if (!pending) return;
    state.searchWorkerPending.delete(event.data.requestId);
    if (event.data.ok) pending.resolve(event.data.result);
    else pending.reject(new Error(event.data.error || "搜索任务未完成"));
  });
  worker.addEventListener("error", (event) => {
    failSearchWorker(new Error(event.message || "搜索 Worker 运行失败"));
  });
  worker.addEventListener("messageerror", () => {
    failSearchWorker(new Error("搜索 Worker 消息解析失败"));
  });
  state.searchWorker = worker;
  return worker;
}

function requestSearchWorker(type, payload) {
  const requestId = ++state.searchWorkerSequence;
  return new Promise((resolve, reject) => {
    state.searchWorkerPending.set(requestId, { resolve, reject });
    try {
      getSearchWorker().postMessage({ requestId, type, payload });
    } catch (error) {
      state.searchWorkerPending.delete(requestId);
      reject(error);
    }
  });
}

async function prepareSearchScope(mode = state.reviewMode) {
  const scope = searchIndexScope(mode);
  if (!state.searchScopePromises.has(scope)) {
    const filename = scope === "reviewed" ? "search-reviewed.json" : "search.json";
    const expectedCount = scope === "reviewed"
      ? state.reviewCounts.reviewed
      : scope === "all"
        ? state.reviewCounts.all
        : state.deepSearchRecords.length;
    const pending = requestSearchWorker("load", {
      scope,
      expectedCount,
      // 百篇精读沿用启动包，不追加索引请求；更大范围由 Worker 自己下载和解析数 MB JSON。
      records: scope === "deep" ? state.deepSearchRecords : null,
      url: scope === "deep"
        ? null
        : new URL(`data/poems/${filename}?v=${DATA_VERSION}`, location.href).href,
      metadata: searchMetadata(scope),
    })
      .catch((error) => {
        state.searchScopePromises.delete(scope);
        throw error;
      });
    state.searchScopePromises.set(scope, pending);
  }
  await state.searchScopePromises.get(scope);
  return scope;
}

function warmSearchRecords() {
  if (!state.index.length) return;
  // hover、键盘聚焦或按下入口时预热当前范围；失败后仍允许正式打开搜索时重新请求。
  void prepareSearchScope(state.reviewMode).catch(() => {});
}

function setSearchLoading(loading) {
  elements.searchResults.setAttribute("aria-busy", String(loading));
  if (loading) elements.searchDialog.dataset.loading = "true";
  else delete elements.searchDialog.dataset.loading;
}

function cancelScheduledGlobalSearch() {
  if (!state.searchDebounceTimer) return;
  clearTimeout(state.searchDebounceTimer);
  state.searchDebounceTimer = null;
}

function scheduleGlobalSearch() {
  state.searchRequestId += 1;
  cancelScheduledGlobalSearch();
  if (!normalizeSearchValue(elements.globalSearchInput.value)) {
    void renderGlobalSearch();
    return;
  }
  // 中文输入法合成和连续键入期间不反复扫描数千条记录，停顿一瞬后只执行最后一次查询。
  state.searchDebounceTimer = window.setTimeout(() => {
    state.searchDebounceTimer = null;
    void renderGlobalSearch();
  }, SEARCH_INPUT_DEBOUNCE_MS);
}

async function renderGlobalSearch() {
  cancelScheduledGlobalSearch();
  const query = normalizeSearchValue(elements.globalSearchInput.value);
  const requestId = ++state.searchRequestId;
  const searchableCount = reviewModeCount();
  elements.searchResults.replaceChildren();
  elements.searchResults.hidden = true;

  if (!query) {
    setSearchLoading(false);
    setLocalizedText(elements.searchSummary, "题目、作者、原文、译文与标签均可搜索");
    setLocalizedText(elements.searchEmpty, "输入几个字，循着诗句与古人相逢");
    elements.searchEmpty.hidden = false;
    return;
  }

  setLocalizedText(elements.searchSummary, `正在检索当前范围的 ${searchableCount} 篇诗词…`);
  setLocalizedText(elements.searchEmpty, "正在循句寻诗…");
  elements.searchEmpty.hidden = false;
  setSearchLoading(true);

  try {
    const scope = await prepareSearchScope(state.reviewMode);
    if (requestId !== state.searchRequestId) return;
    const searchResult = await requestSearchWorker("search", {
      scope,
      query,
      limit: MAX_SEARCH_RESULTS,
    });
    if (requestId !== state.searchRequestId) return;
    const visibleMatches = searchResult.results
      .map((record) => ({ record, poem: state.poemsById.get(record.id) }))
      .filter((item) => item.poem && matchesReviewMode(item.poem));
    const fragment = document.createDocumentFragment();
    visibleMatches.forEach(({ poem, record }, index) => {
      fragment.append(
        createPoemListItem(poem, index + 1, {
          excerpt: record.excerpt,
          highlightTerms: searchResult.terms,
          message: `已从搜索打开《${poem.title}》`,
          onOpen: () => {
            // 搜索继承当前校订范围；打开结果时只重置其他筛选，避免“下一篇”落入无关旧条件。
            state.category = "全部";
            state.period = "";
            clearAuthorFilter();
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
      searchResult.total > MAX_SEARCH_RESULTS
        ? `找到 ${searchResult.total} 篇，显示前 ${MAX_SEARCH_RESULTS} 篇`
        : `找到 ${searchResult.total} 篇`,
    );
    setSearchLoading(false);
  } catch (error) {
    if (requestId !== state.searchRequestId) return;
    console.error(error);
    setSearchLoading(false);
    setLocalizedText(elements.searchSummary, "搜索索引暂未能展开");
    setLocalizedText(elements.searchEmpty, "搜索暂不可用，请稍后重试");
  }
}

async function openGlobalSearch() {
  clearAutoNextTimer();
  cancelScheduledGlobalSearch();
  const preparationRequestId = ++state.searchRequestId;
  elements.globalSearchInput.value = "";
  setLocalizedText(elements.searchSummary, "正在准备本地全文索引…");
  elements.searchResults.replaceChildren();
  elements.searchResults.hidden = true;
  const searchableCount = reviewModeCount();
  setLocalizedText(elements.searchEmpty, `正在展开当前范围的 ${searchableCount} 篇诗词…`);
  elements.searchEmpty.hidden = false;
  setSearchLoading(true);
  elements.searchDialog.showModal();
  elements.globalSearchInput.focus();
  try {
    await prepareSearchScope(state.reviewMode);
    if (
      !elements.searchDialog.open ||
      preparationRequestId !== state.searchRequestId ||
      normalizeSearchValue(elements.globalSearchInput.value)
    ) return;
    setSearchLoading(false);
    setLocalizedText(elements.searchSummary, "题目、作者、原文、译文与标签均可搜索");
    setLocalizedText(elements.searchEmpty, "输入几个字，循着诗句与古人相逢");
  } catch (error) {
    if (preparationRequestId !== state.searchRequestId) return;
    console.error(error);
    setSearchLoading(false);
    setLocalizedText(elements.searchSummary, "搜索索引暂未能展开");
    setLocalizedText(elements.searchEmpty, "搜索暂不可用，请稍后重试");
  }
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

function loadAuthors() {
  if (state.authors.size) return Promise.resolve(state.authors);
  if (!state.authorsPromise) {
    state.authorsPromise = fetch(`data/authors.json?v=${DATA_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`作者资料读取失败：${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data.authors) || !data.authors.length) {
          throw new Error("作者资料为空");
        }
        state.authors = new Map(
          data.authors.map((author) => [
            authorKey(author.dynasty, author.name),
            author,
          ]),
        );
        return state.authors;
      })
      .catch((error) => {
        state.authorsPromise = null;
        throw error;
      });
  }
  return state.authorsPromise;
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

async function openAuthorDialog(poem) {
  clearAutoNextTimer();
  const profile = authorProfileFor(poem);
  const unit = workUnit(poem.period);
  state.activeAuthor = { ...profile, period: poem.period, unit };
  renderActiveAuthorDialog();
  elements.authorDialog.showModal();
  elements.authorDialogClose.focus();
  const requestedAuthor = authorKey(poem.dynasty, poem.author);
  try {
    await loadAuthors();
    if (
      !elements.authorDialog.open ||
      authorKey(state.activeAuthor?.dynasty, state.activeAuthor?.name) !== requestedAuthor
    ) {
      return;
    }
    state.activeAuthor = {
      ...authorProfileFor(poem),
      period: poem.period,
      unit,
    };
    renderActiveAuthorDialog();
  } catch (error) {
    console.error(error);
  }
}

function showActiveAuthorWorks() {
  const profile = state.activeAuthor;
  if (!profile) return;

  // 人物小传与作者筛选各司其职：只有明确点击“赏读其作品”时才改变当前筛选。
  state.category = "全部";
  state.period = profile.period;
  state.author = profile.name;
  state.authorDynasty = profile.dynasty;
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
      if (!expanded) {
        advanceOnboarding("verse", "guide");
        revealWebInstallPrompt();
      }
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
  block.addEventListener("toggle", () => {
    if (block.open) advanceOnboarding("guide", "recall");
  });
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
  action.addEventListener("click", () => {
    advanceOnboarding("recall", "complete");
    openLearningPractice(poem);
  });
  card.append(mark, copy, action);
  return card;
}

function createTags(poem) {
  const tags = makeElement("div", "poem-tags");
  setLocalizedAttribute(tags, "aria-label", "本篇标签");
  for (const tag of poem.tags) {
    const button = makeElement("button", "poem-tag", tag);
    button.type = "button";
    button.disabled = !state.index.length;
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

function splitFocusLine(line) {
  return (
    String(line)
      .match(/[^，。！？；：]+[，。！？；：]?/gu)
      ?.map((segment) => segment.trim())
      .filter(Boolean) ?? [String(line)]
  );
}

function renderFocusView() {
  if (!state.current) return;
  const poem = state.current;
  setLocalizedText(elements.focusTitle, poem.title);
  if (poem.title.length > 8) {
    elements.focusTitle.dataset.longTitle = "true";
  } else {
    delete elements.focusTitle.dataset.longTitle;
  }
  setLocalizedText(elements.focusByline, `${poem.dynasty} · ${poem.author}`);
  let longestSegment = 0;
  const focusLines = poem.lines.map((line) => {
    const paragraph = makeElement("p", "focus-poem-line");
    for (const segment of splitFocusLine(line)) {
      const segmentElement = makeElement(
        "span",
        "focus-poem-line-segment",
        segment,
      );
      const segmentLength = [...segment].length;
      longestSegment = Math.max(longestSegment, segmentLength);
      if (segmentLength <= 12) segmentElement.dataset.singleLine = "true";
      paragraph.append(segmentElement);
    }
    return paragraph;
  });
  // 桌面端分句保持同行；手机端依据最长分句选择字号，并在标点后分行，避免句中硬折行。
  elements.focusLines.dataset.density =
    longestSegment <= 9 ? "regular" : longestSegment <= 12 ? "compact" : "long";
  elements.focusLines.replaceChildren(...focusLines);
  setLocalizedAttribute(
    elements.focusView,
    "aria-label",
    `专注阅读《${poem.title}》，${poem.author}`,
  );
}

function enterFocusMode() {
  if (!state.current || state.busy) return;
  // 专注层使用独立的纯原文结构，避免译注、标签和隐藏按钮继续进入键盘阅读顺序。
  state.focusMode = true;
  elements.libraryPanel.open = false;
  clearAutoNextTimer();
  renderFocusView();
  elements.focusView.hidden = false;
  document.documentElement.dataset.focusMode = "true";
  elements.focusTrigger.setAttribute("aria-pressed", "true");
  setLocalizedAttribute(elements.focusTrigger, "aria-label", "退出专注模式");
  elements.focusView.focus({ preventScroll: true });
  elements.readerShell.inert = true;
  elements.readerShell.setAttribute("aria-hidden", "true");
}

function exitFocusMode() {
  if (!state.focusMode) return;
  state.focusMode = false;
  elements.focusView.hidden = true;
  elements.readerShell.inert = false;
  elements.readerShell.removeAttribute("aria-hidden");
  delete document.documentElement.dataset.focusMode;
  elements.focusTrigger.setAttribute("aria-pressed", "false");
  setLocalizedAttribute(
    elements.focusTrigger,
    "aria-label",
    "进入专注模式，只显示诗词原文",
  );
  elements.focusTrigger.focus({ preventScroll: true });
  scheduleAutoNext();
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
  setLocalizedAttribute(
    elements.puzzleAction,
    "aria-label",
    `用《${poem.title}》开始诗句拼图`,
  );

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

  if (state.focusMode) renderFocusView();
  renderFavorite();
  renderPreviousAction();
  renderDailyAction();
  renderOnboardingGuide();
  syncPoemUrl(poem.id);
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
  revealWebInstallPrompt();
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

function currentPuzzleRound() {
  const puzzle = state.puzzle;
  return puzzle?.rounds[puzzle.roundIndex] ?? null;
}

function puzzlePieceById(round, pieceId) {
  return round.pieces.find((piece) => piece.id === pieceId) ?? null;
}

function createPuzzleShape(targetIndex, pieceCount, className) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add(className);
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", createJigsawPath(targetIndex, pieceCount));
  svg.append(path);
  return svg;
}

function createPuzzleDragGhost(button, clientX, clientY) {
  const rect = button.getBoundingClientRect();
  const ghost = button.cloneNode(true);
  ghost.classList.add("puzzle-drag-ghost");
  ghost.removeAttribute("aria-pressed");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${clientX}px`;
  ghost.style.top = `${clientY}px`;
  document.body.append(ghost);
  return ghost;
}

function enablePuzzlePieceDrag(button, piece, zone, slotIndex) {
  button.addEventListener("pointerdown", (event) => {
    const puzzle = state.puzzle;
    if (
      !puzzle ||
      puzzle.answered ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let ghost = null;
    let dropSlot = null;

    const setDropSlot = (nextSlot) => {
      if (dropSlot === nextSlot) return;
      delete dropSlot?.dataset.dropTarget;
      dropSlot = nextSlot;
      if (dropSlot) dropSlot.dataset.dropTarget = "true";
    };

    const moveGhost = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (
        !dragging &&
        Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 7
      ) {
        return;
      }
      if (!dragging) {
        dragging = true;
        button.dataset.dragging = "true";
        document.body.dataset.puzzleDragging = "true";
        ghost = createPuzzleDragGhost(button, moveEvent.clientX, moveEvent.clientY);
      }
      moveEvent.preventDefault();
      ghost.style.left = `${moveEvent.clientX}px`;
      ghost.style.top = `${moveEvent.clientY}px`;
      const hitTarget = document.elementFromPoint(
        moveEvent.clientX,
        moveEvent.clientY,
      );
      const nextSlot = hitTarget instanceof Element
        ? hitTarget.closest(".puzzle-slot")
        : null;
      setDropSlot(
        nextSlot && elements.puzzleAnswer.contains(nextSlot) ? nextSlot : null,
      );
    };

    const finishDrag = (finishEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", moveGhost);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      delete document.body.dataset.puzzleDragging;
      delete button.dataset.dragging;
      ghost?.remove();
      const targetSlotIndex = Number(dropSlot?.dataset.slotIndex);
      setDropSlot(null);
      if (!dragging || finishEvent.type === "pointercancel") return;

      button.dataset.suppressClick = "true";
      finishEvent.preventDefault();
      const activePuzzle = state.puzzle;
      if (
        !activePuzzle ||
        activePuzzle.answered ||
        !Number.isInteger(targetSlotIndex)
      ) {
        return;
      }
      activePuzzle.placedPieceIds = movePuzzlePieceToSlot(
        activePuzzle.placedPieceIds,
        piece.id,
        targetSlotIndex,
        zone === "answer" ? slotIndex : null,
      );
      activePuzzle.activePieceId = null;
      renderPuzzleRound({ fallbackToCheck: true });
    };

    // 在窗口级继续追踪指针，避免手指或鼠标越过原按钮边缘后丢失松手事件。
    window.addEventListener("pointermove", moveGhost, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
  });
}

function createPuzzlePieceButton(piece, zone, pieceCount, slotIndex = null) {
  const button = makeElement("button", "puzzle-piece");
  const shapeIndex = resolvePuzzleShapeIndex(
    piece.targetIndex,
    zone === "answer" ? slotIndex : null,
  );
  button.type = "button";
  button.dataset.puzzlePieceId = piece.id;
  button.dataset.zone = zone;
  button.dataset.targetIndex = String(piece.targetIndex);
  button.style.setProperty(
    "--puzzle-piece-color",
    PUZZLE_PIECE_COLORS[piece.targetIndex % PUZZLE_PIECE_COLORS.length],
  );
  button.disabled = Boolean(state.puzzle?.answered);
  button.append(
    createPuzzleShape(shapeIndex, pieceCount, "puzzle-piece-shape"),
    makeElement("span", "puzzle-piece-text", piece.text),
  );
  setLocalizedAttribute(
    button,
    "aria-label",
    zone === "answer"
      ? `拼图板第 ${slotIndex + 1} 位是“${piece.text}”，点按取回拼片`
      : `${state.puzzle?.activePieceId === piece.id ? "已选中" : "选择"}拼片“${piece.text}”`,
  );
  button.setAttribute(
    "aria-pressed",
    String(zone === "bank" && state.puzzle?.activePieceId === piece.id),
  );
  enablePuzzlePieceDrag(button, piece, zone, slotIndex);
  button.addEventListener("click", () => {
    if (button.dataset.suppressClick === "true") {
      delete button.dataset.suppressClick;
      return;
    }
    const puzzle = state.puzzle;
    if (!puzzle || puzzle.answered) return;
    if (zone === "answer") {
      puzzle.placedPieceIds[slotIndex] = null;
      puzzle.activePieceId = piece.id;
      renderPuzzleRound({ focusPieceId: piece.id, focusZone: "bank" });
      return;
    }
    puzzle.activePieceId = puzzle.activePieceId === piece.id ? null : piece.id;
    renderPuzzleRound(
      puzzle.activePieceId
        ? { focusZone: "answer", focusEmptySlot: true }
        : { focusPieceId: piece.id, focusZone: "bank" },
    );
  });
  return button;
}

function createPuzzleSlot(round, slotIndex, piece) {
  const slot = makeElement("div", "puzzle-slot");
  slot.dataset.slotIndex = String(slotIndex);
  slot.dataset.filled = String(Boolean(piece));
  slot.append(createPuzzleShape(slotIndex, round.pieces.length, "puzzle-slot-guide"));
  if (piece) {
    slot.append(
      createPuzzlePieceButton(
        piece,
        "answer",
        round.pieces.length,
        slotIndex,
      ),
    );
    return slot;
  }

  const button = makeElement("button", "puzzle-slot-action");
  button.type = "button";
  button.dataset.puzzleSlotIndex = String(slotIndex);
  button.disabled = Boolean(state.puzzle?.answered);
  setLocalizedAttribute(
    button,
    "aria-label",
    state.puzzle?.activePieceId
      ? `把已选拼片放入第 ${slotIndex + 1} 个空位`
      : `第 ${slotIndex + 1} 个空位，先从下方选择一块拼片`,
  );
  button.addEventListener("click", () => {
    const puzzle = state.puzzle;
    if (!puzzle || puzzle.answered || !puzzle.activePieceId) return;
    puzzle.placedPieceIds = movePuzzlePieceToSlot(
      puzzle.placedPieceIds,
      puzzle.activePieceId,
      slotIndex,
    );
    puzzle.activePieceId = null;
    renderPuzzleRound({ focusZone: "bank", fallbackToCheck: true });
  });
  slot.append(button);
  return slot;
}

function focusPuzzleTarget({
  focusPieceId,
  focusZone,
  focusEmptySlot,
  fallbackToCheck,
} = {}) {
  const containers = {
    answer: elements.puzzleAnswer,
    bank: elements.puzzleBank,
  };
  const container = containers[focusZone];
  const target = container && !focusEmptySlot
    ? [...container.querySelectorAll("[data-puzzle-piece-id]")].find(
        (button) => !focusPieceId || button.dataset.puzzlePieceId === focusPieceId,
      )
    : null;
  if (focusEmptySlot) {
    elements.puzzleAnswer
      .querySelector("[data-puzzle-slot-index]:not(:disabled)")
      ?.focus({ preventScroll: true });
  } else if (target) {
    target.focus({ preventScroll: true });
  } else if (fallbackToCheck && !elements.puzzleCheck.disabled) {
    elements.puzzleCheck.focus({ preventScroll: true });
  }
}

function renderPuzzleRound(focusOptions = {}) {
  const puzzle = state.puzzle;
  const round = currentPuzzleRound();
  if (!puzzle || !round) return;

  const total = puzzle.rounds.length;
  const completed = puzzle.roundIndex + (puzzle.answered ? 1 : 0);
  setLocalizedText(elements.puzzleStep, `第 ${puzzle.roundIndex + 1} / ${total} 题`);
  elements.puzzleProgressTrack.setAttribute("aria-valuemax", String(total));
  elements.puzzleProgressTrack.setAttribute("aria-valuenow", String(completed));
  elements.puzzleProgressFill.style.width = `${(completed / total) * 100}%`;

  const placedPieces = puzzle.placedPieceIds.map((pieceId) =>
    pieceId ? puzzlePieceById(round, pieceId) : null,
  );
  const placedIds = new Set(puzzle.placedPieceIds.filter(Boolean));
  const availablePieces = round.pieces.filter((piece) => !placedIds.has(piece.id));

  elements.puzzleAnswer.style.setProperty(
    "--puzzle-columns",
    String(round.layout.columns),
  );
  elements.puzzleAnswer.style.setProperty(
    "--puzzle-rows",
    String(round.layout.rows),
  );
  elements.puzzleAnswer.dataset.correct = puzzle.answered
    ? String(puzzle.roundCorrect)
    : "";
  elements.puzzleAnswerEmpty.hidden = placedIds.size > 0;
  elements.puzzleAnswer.replaceChildren(
    ...placedPieces.map((piece, slotIndex) =>
      createPuzzleSlot(round, slotIndex, piece),
    ),
    elements.puzzleAnswerEmpty,
  );
  elements.puzzleBank.replaceChildren(
    ...availablePieces.map((piece) =>
      createPuzzlePieceButton(piece, "bank", round.pieces.length),
    ),
  );
  setLocalizedText(elements.puzzleRemaining, `${availablePieces.length} 块`);

  elements.puzzleReset.disabled = puzzle.answered || !placedIds.size;
  elements.puzzleCheck.disabled =
    puzzle.answered || placedIds.size !== round.pieces.length;
  elements.puzzleCheck.hidden = puzzle.answered;
  elements.puzzleNext.hidden = !puzzle.answered;
  setLocalizedText(
    elements.puzzleNext,
    puzzle.roundIndex + 1 === total ? "查看结果" : "下一题",
  );

  elements.puzzleResult.hidden = !puzzle.answered;
  if (puzzle.answered) {
    elements.puzzleResult.dataset.correct = String(puzzle.roundCorrect);
    setLocalizedText(
      elements.puzzleResultTitle,
      puzzle.roundCorrect ? "拼对了" : "次序还差一点",
    );
    setLocalizedText(elements.puzzleResultAnswer, `原句：${round.sourceLine}`);
  } else {
    elements.puzzleResult.dataset.correct = "";
  }

  queueMicrotask(() => focusPuzzleTarget(focusOptions));
}

function beginPuzzleGame(poem) {
  const rounds = createPuzzleRounds(poem?.lines, { limit: 3 });
  if (!rounds.length) {
    updateNotice("这篇原文暂时没有适合拼图的完整诗句");
    return false;
  }
  state.puzzle = {
    poem,
    rounds,
    roundIndex: 0,
    correct: 0,
    answered: false,
    roundCorrect: null,
    activePieceId: null,
    placedPieceIds: Array(rounds[0].pieces.length).fill(null),
  };
  elements.puzzlePractice.hidden = false;
  elements.puzzleComplete.hidden = true;
  setLocalizedText(elements.puzzleDialogTitle, `拼出《${poem.title}》`);
  setLocalizedText(
    elements.puzzleDialogMeta,
    `${poem.dynasty} · ${poem.author} · 本局 ${rounds.length} 题；拼成后核对完整原句。`,
  );
  renderPuzzleRound({ focusZone: "bank" });
  return true;
}

function openPuzzleGame() {
  if (!state.current || state.busy) return;
  clearAutoNextTimer();
  if (!beginPuzzleGame(state.current)) {
    scheduleAutoNext();
    return;
  }
  if (!elements.puzzleDialog.open) elements.puzzleDialog.showModal();
  queueMicrotask(() => focusPuzzleTarget({ focusZone: "bank" }));
}

function resetPuzzleRound() {
  const puzzle = state.puzzle;
  if (!puzzle || puzzle.answered) return;
  puzzle.activePieceId = null;
  puzzle.placedPieceIds = Array(currentPuzzleRound().pieces.length).fill(null);
  renderPuzzleRound({ focusZone: "bank" });
}

function checkPuzzleAnswer() {
  const puzzle = state.puzzle;
  const round = currentPuzzleRound();
  if (!puzzle || !round || puzzle.answered) return;
  const placedPieces = puzzle.placedPieceIds
    .map((pieceId) => puzzlePieceById(round, pieceId))
    .filter(Boolean);
  if (placedPieces.length !== round.pieces.length) return;

  const correct = checkPuzzleOrder(placedPieces, round.target);
  if (correct) puzzle.correct += 1;
  puzzle.answered = true;
  puzzle.roundCorrect = correct;
  renderPuzzleRound();
  queueMicrotask(() => elements.puzzleNext.focus({ preventScroll: true }));
}

function finishPuzzleGame() {
  const puzzle = state.puzzle;
  if (!puzzle) return;
  const total = puzzle.rounds.length;
  elements.puzzlePractice.hidden = true;
  elements.puzzleComplete.hidden = false;
  setLocalizedText(elements.puzzleScore, `本局拼对 ${puzzle.correct} / ${total} 题`);
  setLocalizedText(
    elements.puzzleCompleteNote,
    puzzle.correct === total
      ? "一字不差，原句次序已经稳稳落在心里。"
      : puzzle.correct
        ? "已经找回大半次序，再玩一局会更熟。"
        : "刚刚见过的原句，正适合趁热再拼一次。",
  );
  revealWebInstallPrompt();
  elements.puzzleReplay.focus({ preventScroll: true });
}

function advancePuzzleGame() {
  const puzzle = state.puzzle;
  if (!puzzle?.answered) return;
  if (puzzle.roundIndex + 1 >= puzzle.rounds.length) {
    finishPuzzleGame();
    return;
  }
  puzzle.roundIndex += 1;
  puzzle.answered = false;
  puzzle.roundCorrect = null;
  puzzle.activePieceId = null;
  puzzle.placedPieceIds = Array(currentPuzzleRound().pieces.length).fill(null);
  renderPuzzleRound({ focusZone: "bank" });
}

function replayPuzzleGame() {
  const poem = state.puzzle?.poem;
  if (poem) beginPuzzleGame(poem);
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
  // 首屏精读包已经带有完整正文，直接展开，不再为第一首诗追加一次分卷请求。
  if (Array.isArray(meta.lines)) {
    return {
      ...meta,
      translation: Array.isArray(meta.translation) ? meta.translation : [],
      translationMeta: normalizeTranslationMeta(meta.translationMeta),
      deepReading: meta.deepReading ?? state.deepReadings.get(meta.id) ?? null,
    };
  }
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
      matchesAuthorFilter(poem) &&
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
    const { createSharePoster } = await loadSharePosterModule();
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
      "高清 PNG 已生成；二维码可直接打开当前诗篇。",
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
    const { buildShareFileName } = await loadSharePosterModule();
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

async function loadReviewModePreference() {
  const value = await storageAdapter.get(REVIEW_MODE_KEY, { fallback: "deep" });
  state.reviewMode = normalizeReviewMode(value);
}

function saveReviewModePreference() {
  state.deferredReviewMode = null;
  void storageAdapter.set(REVIEW_MODE_KEY, state.reviewMode);
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

async function loadFavorites() {
  const saved = await storageAdapter.get(FAVORITES_KEY, {
    fallback: [],
    deserializeWeb: JSON.parse,
  });
  state.favorites = new Set(Array.isArray(saved) ? saved : []);
}

function saveFavorites() {
  const saved = [...state.favorites];
  void storageAdapter.set(FAVORITES_KEY, saved, { serializeWeb: JSON.stringify });
}

async function loadReadingStats() {
  const value = await storageAdapter.get(READING_STATS_KEY, {
    fallback: null,
    deserializeWeb: JSON.parse,
  });
  state.readingStats = normalizeReadingStats(value);
}

function saveReadingStats() {
  void storageAdapter.set(READING_STATS_KEY, state.readingStats, {
    serializeWeb: JSON.stringify,
  });
}

async function loadLearningProgress() {
  const value = await storageAdapter.get(LEARNING_PROGRESS_KEY, {
    fallback: null,
    deserializeWeb: JSON.parse,
  });
  state.learningProgress = normalizeLearningProgress(value);
}

function saveLearningProgress() {
  void storageAdapter.set(LEARNING_PROGRESS_KEY, state.learningProgress, {
    serializeWeb: JSON.stringify,
  });
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
      clearAuthorFilter();
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
  elements.libraryPanel.addEventListener("toggle", () => {
    if (!elements.libraryPanel.open || !state.ready || state.libraryReady) return;
    void ensureFullLibrary().catch(() => {});
  });
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
      void applyScript(option.dataset.scriptOption, {
        persist: true,
        announce: true,
      }).catch((error) => {
        console.error(error);
        updateNotice("繁体转换组件暂未能加载，请稍后再试");
      });
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

  elements.puzzleAction.addEventListener("click", openPuzzleGame);
  elements.puzzleDialogClose.addEventListener("click", () => {
    elements.puzzleDialog.close();
  });
  elements.puzzleDialog.addEventListener("click", (event) => {
    if (event.target === elements.puzzleDialog) elements.puzzleDialog.close();
  });
  elements.puzzleDialog.addEventListener("close", () => {
    state.puzzle = null;
    scheduleAutoNext();
    if (!elements.puzzleAction.disabled) {
      elements.puzzleAction.focus({ preventScroll: true });
    }
  });
  elements.puzzleReset.addEventListener("click", resetPuzzleRound);
  elements.puzzleCheck.addEventListener("click", checkPuzzleAnswer);
  elements.puzzleNext.addEventListener("click", advancePuzzleGame);
  elements.puzzleReplay.addEventListener("click", replayPuzzleGame);
  elements.puzzleFinish.addEventListener("click", () => {
    elements.puzzleDialog.close();
  });

  for (const button of elements.categoryButtons) {
    button.addEventListener("click", () => {
      state.category = state.category === "收藏" ? "全部" : "收藏";
      clearAuthorFilter();
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
    clearAuthorFilter();
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
    clearAuthorFilter();
    state.tag = "";
    resetReadingHistory();
    renderFilters();
    showRandom(
      `${state.period || "全部朝代"} · 共 ${filteredPoems().length} ${workUnit()}`,
      { recordPrevious: false },
    );
  });

  elements.authorInput.addEventListener("focus", openAuthorOptions);
  elements.authorInput.addEventListener("input", () => {
    state.activeAuthorChoiceIndex = -1;
    openAuthorOptions();
  });
  elements.authorInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAuthorOptions();
      moveActiveAuthorChoice(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && state.activeAuthorChoiceIndex >= 0) {
      event.preventDefault();
      const choice = state.visibleAuthorChoices[state.activeAuthorChoiceIndex];
      if (choice) selectAuthorChoice(choice);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeAuthorOptions();
    }
  });
  elements.authorInput.addEventListener("blur", () => {
    window.setTimeout(closeAuthorOptions, 0);
  });
  elements.authorClear.addEventListener("click", clearSelectedAuthor);

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
    clearAuthorFilter();
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
  elements.poemListSearch.addEventListener("input", () => {
    state.poemListVisibleLimit = POEM_LIST_PAGE_SIZE;
    renderPoemList();
  });
  elements.poemListMore.addEventListener("click", () => {
    state.poemListVisibleLimit += POEM_LIST_PAGE_SIZE;
    renderPoemList({ preserveScroll: true });
    elements.poemListMore.focus({ preventScroll: true });
  });
  elements.poemListDialog.addEventListener("click", (event) => {
    if (event.target === elements.poemListDialog) elements.poemListDialog.close();
  });
  elements.poemListDialog.addEventListener("close", () => {
    scheduleAutoNext();
    if (!elements.resultTrigger.disabled) elements.resultTrigger.focus({ preventScroll: true });
  });

  elements.searchTrigger.addEventListener("click", openGlobalSearch);
  elements.searchTrigger.addEventListener("pointerenter", warmSearchRecords);
  elements.searchTrigger.addEventListener("pointerdown", warmSearchRecords);
  elements.searchTrigger.addEventListener("focus", warmSearchRecords);
  elements.focusTrigger.addEventListener("click", enterFocusMode);
  elements.focusExit.addEventListener("click", exitFocusMode);
  elements.searchDialogClose.addEventListener("click", () => elements.searchDialog.close());
  elements.globalSearchInput.addEventListener("input", scheduleGlobalSearch);
  elements.searchDialog.addEventListener("click", (event) => {
    if (event.target === elements.searchDialog) elements.searchDialog.close();
  });
  elements.searchDialog.addEventListener("close", () => {
    cancelScheduledGlobalSearch();
    state.searchRequestId += 1;
    setSearchLoading(false);
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
  elements.onboardingGuideAction.addEventListener("click", focusOnboardingTarget);
  elements.onboardingGuideDismiss.addEventListener("click", dismissOnboarding);
  elements.webInstallDismiss.addEventListener("click", dismissWebInstallPrompt);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (state.focusMode) {
      if (event.key === "Escape") {
        event.preventDefault();
        exitFocusMode();
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (event.code === "Space" || event.code === "ArrowRight")
      ) {
        event.preventDefault();
        if (!state.busy) showRandom();
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.code === "ArrowLeft"
      ) {
        event.preventDefault();
        void showPreviousPoem();
      }
      return;
    }
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
    } else if (event.key.toLowerCase() === "p") {
      enterFocusMode();
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

function applyStartupData(data) {
  if (!Array.isArray(data.poems) || !data.poems.length) {
    throw new Error("首屏精读诗词为空");
  }
  if (!Array.isArray(data.sources) || !data.sources.length) {
    throw new Error("首屏精读核对依据为空");
  }
  for (const poem of data.poems) {
    if (!Array.isArray(poem.lines) || !poem.lines.length || !poem.deepReading) {
      throw new Error(`首屏诗词内容不完整：${poem.id}`);
    }
  }

  state.deepSearchRecords = data.poems.map(createEmbeddedSearchRecord);
  state.deepReadings = new Map(
    data.poems.map((poem) => [poem.id, poem.deepReading]),
  );
  state.deepSources = new Map(
    data.sources.map((source) => [source.id, source]),
  );
  state.deepEditorialPolicy =
    typeof data.editorialPolicy === "string" ? data.editorialPolicy : "";
  state.index = data.poems.map(normalizeMeta);
  state.poemsById = new Map(state.index.map((poem) => [poem.id, poem]));
  state.reviewCounts = {
    deep: Number(data.counts?.deep) || state.index.length,
    reviewed: Number(data.counts?.reviewed) || state.index.length,
    all: Number(data.counts?.all) || state.index.length,
  };
}

function normalizeLearningLibrary() {
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
}

function loadFullLibrary() {
  if (!state.libraryPromise) {
    state.libraryPromise = fetch(`data/poems/index.json?v=${DATA_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`诗库索引读取失败：${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data.poems) || !data.poems.length) {
          throw new Error("诗库索引为空");
        }
        state.index = data.poems.map(normalizeMeta);
        state.poemsById = new Map(state.index.map((poem) => [poem.id, poem]));
        state.reviewCounts = {
          deep: state.index.filter((poem) => poem.depthStatus === "deep").length,
          reviewed: state.index.filter((poem) => poem.reviewStatus === "reviewed").length,
          all: state.index.length,
        };
        normalizeLearningLibrary();
        state.favorites = new Set(
          [...state.favorites].filter((id) => state.poemsById.has(id)),
        );
        state.libraryReady = true;
        return state.index;
      })
      .catch((error) => {
        state.libraryPromise = null;
        throw error;
      });
  }
  return state.libraryPromise;
}

async function ensureFullLibrary() {
  if (state.libraryReady) return state.index;
  const startsRequest = !state.libraryPromise;
  if (startsRequest) {
    state.libraryLoading = true;
    elements.libraryPanel.setAttribute("aria-busy", "true");
    setLocalizedText(elements.librarySummary, "诗库 · 正在展开完整索引…");
    setBusy(state.busy);
    updateNotice("正在展开完整诗库，百篇精读仍可继续阅读");
  }

  try {
    const index = await loadFullLibrary();
    if (startsRequest) {
      if (state.deferredReviewMode) {
        state.reviewMode = state.deferredReviewMode;
        state.deferredReviewMode = null;
      }
      if (state.current) renderPoem(state.current, { scroll: false });
      updateNotice(
        `完整诗库已就绪 · ${state.reviewCounts.deep} 篇精读 · ${state.reviewCounts.all} 篇全库`,
      );
    }
    return index;
  } catch (error) {
    if (startsRequest) {
      console.error(error);
      updateNotice("百篇精读仍可阅读，完整诗库暂未能展开；再次打开诗库可重试");
    }
    throw error;
  } finally {
    if (startsRequest) {
      state.libraryLoading = false;
      elements.libraryPanel.setAttribute("aria-busy", "false");
      renderFilters();
      setBusy(state.busy);
    }
  }
}

async function initialize() {
  registerReaderPage();
  updateFeedbackLink(null);
  elements.webInstallAction.href = CHROME_STORE_URL;
  applyTheme(state.theme);
  applyFont(state.font);
  bindEvents();
  try {
    const [startupResponse] = await Promise.all([
      fetch(`data/poems/startup.json?v=${DATA_VERSION}`),
      loadFavorites(),
      loadTheme(),
      loadFont(),
      loadScriptPreference(),
      loadAutoNextPreference(),
      loadReviewModePreference(),
      loadReadingStats(),
      loadLearningProgress(),
      loadOnboardingProgress(),
      loadWebInstallPreference(),
    ]);
    if (!startupResponse.ok) {
      throw new Error(`首屏精读数据读取失败：${startupResponse.status}`);
    }
    applyStartupData(await startupResponse.json());
    // 首屏包只含百篇精读；先以真实可用范围启动，并在读者主动展开诗库后恢复其更大范围偏好。
    if (state.reviewMode !== "deep") {
      state.deferredReviewMode = state.reviewMode;
      state.reviewMode = "deep";
    }
    normalizeLearningLibrary();
    const deepLinkedPoemId = requestedPoemId();
    let deepLinkedPoem = deepLinkedPoemId
      ? state.poemsById.get(deepLinkedPoemId)
      : null;
    if (deepLinkedPoemId && !deepLinkedPoem) {
      try {
        await ensureFullLibrary();
        deepLinkedPoem = state.poemsById.get(deepLinkedPoemId) ?? null;
      } catch {
        // 分享链接加载失败时继续交付百篇精读，不让一条失效链接阻断整个阅读器。
      }
    }
    if (deepLinkedPoem) {
      state.deferredReviewMode = null;
      state.reviewMode = deepLinkedPoem.depthStatus === "deep"
        ? "deep"
        : deepLinkedPoem.reviewStatus === "reviewed"
          ? "reviewed"
          : "all";
      state.category = "全部";
      state.period = "";
      clearAuthorFilter();
      state.tag = "";
    }
    renderFilters();
    // 首次打开先给出稳定的今日诗签，保证首访文案、引导与用户实际看到的内容一致；以后仍保留随机相逢。
    const initialPoem = deepLinkedPoem ?? (state.isFirstVisit
      ? dailyActionTarget().poem
      : chooseRandom(filteredPoems()));
    await showPoem(
      initialPoem,
      deepLinkedPoem
        ? `已从分享链接打开《${deepLinkedPoem.title}》`
        : state.isFirstVisit
        ? "今日诗签已展开 · 轻点一句开始精读"
        : "百篇精读已展开 · 打开诗库可浏览完整范围",
    );
    state.ready = true;
    if (elements.libraryPanel.open) void ensureFullLibrary().catch(() => {});
  } catch (error) {
    console.error(error);
    setBusy(false);
    state.ready = true;
    updateNotice("诗库暂未能展开，请重新打开此页");
  }
}

initialize();
