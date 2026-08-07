export const DATA_VERSION = "1.16.0";
export const STORAGE_KEYS = Object.freeze({
  favorites: "poem-favorites-v2",
  theme: "poem-theme-v1",
  font: "poem-font-v1",
  script: "poem-script-v1",
  autoNext: "poem-auto-next-seconds-v1",
  // v2 将 1.13 的新默认迁移到“深度精读”，旧值不能绕过本次定位升级。
  reviewMode: "poem-review-mode-v2",
  readingStats: "poem-reading-stats-v1",
  learningProgress: "poem-learning-progress-v1",
  onboarding: "poem-onboarding-v1",
  webInstallDismissed: "web-install-dismissed-v1",
});
export const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/%E8%AF%97%E6%84%8F%E4%B8%80%E5%88%BB%EF%BD%9C%E5%8F%A4%E8%AF%97%E8%AF%8D%E7%B2%BE%E8%AF%BB%E4%B8%8E%E8%AE%B0%E5%BF%86/lkkinajncnbimchpnkfkgmncpbiamgpm";
export const ONBOARDING_STEPS = new Set(["verse", "guide", "recall", "complete"]);
export const DEFAULT_AUTO_NEXT_SECONDS = 0;
export const AUTO_NEXT_INTERVALS = new Set([0, 30, 60, 120, 300, 600, 1200, 1800, 3600]);
export const MAX_SEARCH_RESULTS = 120;
export const POEM_LIST_PAGE_SIZE = 120;
export const SEARCH_INPUT_DEBOUNCE_MS = 140;
export const MAX_READING_HISTORY = 30;
export const PUZZLE_PIECE_COLORS = [
  "#e89b91",
  "#7fc7ce",
  "#e8cc78",
  "#9dcd85",
  "#b691cf",
  "#dfa572",
  "#88b7dc",
  "#de91b1",
];
export const FEEDBACK_ISSUE_URL = "https://github.com/Kua-Fu/shiyi-yike/issues/new";
export const PERIOD_ORDER = ["先秦", "汉魏六朝", "唐代", "宋代", "元代", "明代", "清代"];
export const THEMES = new Map([
  ["xuan", { name: "宣纸雅韵", shortName: "宣纸", colorScheme: "light", themeColor: "#d5d0c4" }],
  ["yuebai", { name: "月白清辉", shortName: "月白", colorScheme: "light", themeColor: "#b8c4cc" }],
  ["qingci", { name: "雨过青瓷", shortName: "青瓷", colorScheme: "light", themeColor: "#b8c8c0" }],
  ["taojian", { name: "桃花小笺", shortName: "桃笺", colorScheme: "light", themeColor: "#d9c1bd" }],
  ["zhuying", { name: "竹影新绿", shortName: "竹影", colorScheme: "light", themeColor: "#bcc1ae" }],
  ["songyan", { name: "松烟夜读", shortName: "松烟", colorScheme: "dark", themeColor: "#101513" }],
]);
export const FONTS = new Map([
  ["default", { name: "默认雅韵" }],
  ["kai", { name: "楷体书卷" }],
  ["song", { name: "宋体典雅" }],
  ["fangsong", { name: "仿宋清朗" }],
  ["sans", { name: "黑体简净" }],
  ["xingshu", { name: "行书逸韵" }],
]);
