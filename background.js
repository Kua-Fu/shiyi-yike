const READER_TAB_KEY = "reader-tab-id";
const READER_PAGE_URL = chrome.runtime.getURL("newtab.html");

async function rememberReaderTab(tabId) {
  await chrome.storage.session.set({ [READER_TAB_KEY]: tabId });
}

function reportBackgroundError(error) {
  console.error("诗意一刻入口操作失败", error);
}

async function openOrFocusReader() {
  const saved = await chrome.storage.session.get(READER_TAB_KEY);
  const tabId = saved[READER_TAB_KEY];

  if (Number.isInteger(tabId)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url?.startsWith(READER_PAGE_URL)) {
        // 记录内部页签 ID，可在不申请 tabs 权限的前提下复用用户主动打开的阅读页。
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
        return;
      }
    } catch {
      // 页签已关闭或浏览器恢复失败时，下面创建一个新的阅读页。
    }
  }

  const tab = await chrome.tabs.create({ url: READER_PAGE_URL });
  if (Number.isInteger(tab.id)) await rememberReaderTab(tab.id);
}

chrome.action.onClicked.addListener(() => {
  // 只响应用户主动点击，不声明新标签页覆盖，避免与 Momentum 等新标签页扩展互相抢占。
  void openOrFocusReader().catch(reportBackgroundError);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "reader-page-ready" && Number.isInteger(sender.tab?.id)) {
    void rememberReaderTab(sender.tab.id).catch(reportBackgroundError);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session
    .get(READER_TAB_KEY)
    .then((saved) => {
      if (saved[READER_TAB_KEY] === tabId) {
        return chrome.storage.session.remove(READER_TAB_KEY);
      }
      return undefined;
    })
    .catch(reportBackgroundError);
});
