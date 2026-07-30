import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(projectRoot, "background.js"), "utf8");
const listeners = {};
const session = new Map();
const tabs = new Map();
const calls = {
  created: [],
  tabUpdates: [],
  windowUpdates: [],
};

const chrome = {
  runtime: {
    getURL: (page) => `chrome-extension://test/${page}`,
    onMessage: {
      addListener: (listener) => {
        listeners.message = listener;
      },
    },
  },
  action: {
    onClicked: {
      addListener: (listener) => {
        listeners.action = listener;
      },
    },
  },
  storage: {
    session: {
      async get(key) {
        return { [key]: session.get(key) };
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) session.set(key, value);
      },
      async remove(key) {
        session.delete(key);
      },
    },
  },
  tabs: {
    async get(tabId) {
      if (!tabs.has(tabId)) throw new Error("No tab");
      return tabs.get(tabId);
    },
    async create(createProperties) {
      calls.created.push(createProperties);
      const tab = {
        id: 101 + calls.created.length,
        windowId: 9,
        url: createProperties.url,
      };
      tabs.set(tab.id, tab);
      return tab;
    },
    async update(tabId, updateProperties) {
      calls.tabUpdates.push({ tabId, updateProperties });
      return tabs.get(tabId);
    },
    onRemoved: {
      addListener: (listener) => {
        listeners.removed = listener;
      },
    },
  },
  windows: {
    async update(windowId, updateInfo) {
      calls.windowUpdates.push({ windowId, updateInfo });
    },
  },
};

vm.runInNewContext(source, { chrome, console });
const flush = () => new Promise((resolve) => setImmediate(resolve));

listeners.action();
await flush();
assert.equal(calls.created.length, 1);
assert.equal(calls.created[0].url, "chrome-extension://test/newtab.html");
assert.equal(session.get("reader-tab-id"), 102, "首次打开后应登记阅读页");

listeners.action();
await flush();
assert.equal(calls.created.length, 1, "再次点击不应创建重复页签");
assert.equal(calls.windowUpdates.at(-1).windowId, 9);
assert.equal(calls.windowUpdates.at(-1).updateInfo.focused, true);
assert.equal(calls.tabUpdates.at(-1).tabId, 102);
assert.equal(calls.tabUpdates.at(-1).updateProperties.active, true);

listeners.message({ type: "reader-page-ready" }, { tab: { id: 88 } });
await flush();
assert.equal(session.get("reader-tab-id"), 88, "恢复的阅读页应重新登记");

listeners.removed(88);
await flush();
assert.equal(session.has("reader-tab-id"), false, "阅读页关闭后应清理会话记录");

session.set("reader-tab-id", 404);
listeners.action();
await flush();
assert.equal(calls.created.length, 2, "登记页签失效时应创建新的阅读页");

console.log("✓ 工具栏与浏览器快捷键入口会复用现有阅读页");
