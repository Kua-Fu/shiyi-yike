import assert from "node:assert/strict";
import { createStorageAdapter } from "../storage-adapter.js";

const extensionValues = new Map([["theme", "songyan"]]);
const extensionStorage = {
  async get(keys) {
    return Object.fromEntries(keys.map((key) => [key, extensionValues.get(key)]));
  },
  async set(values) {
    for (const [key, value] of Object.entries(values)) extensionValues.set(key, value);
  },
};
const extensionAdapter = createStorageAdapter({
  getExtensionStorage: () => extensionStorage,
  getWebStorage: () => null,
});
assert.equal(await extensionAdapter.get("theme", { fallback: "xuan" }), "songyan");
assert.equal(await extensionAdapter.set("theme", "qingci"), true);
assert.equal(extensionValues.get("theme"), "qingci");

const webValues = new Map([["favorites", '["poem-a"]']]);
const webStorage = {
  getItem(key) {
    return webValues.get(key) ?? null;
  },
  setItem(key, value) {
    webValues.set(key, value);
  },
};
const webAdapter = createStorageAdapter({
  getExtensionStorage: () => null,
  getWebStorage: () => webStorage,
});
assert.deepEqual(
  await webAdapter.get("favorites", {
    fallback: [],
    deserializeWeb: JSON.parse,
  }),
  ["poem-a"],
);
assert.equal(
  await webAdapter.set("favorites", ["poem-a", "poem-b"], {
    serializeWeb: JSON.stringify,
  }),
  true,
);
assert.deepEqual(JSON.parse(webValues.get("favorites")), ["poem-a", "poem-b"]);

const errors = [];
const failingAdapter = createStorageAdapter({
  getExtensionStorage: () => null,
  getWebStorage: () => ({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  }),
  onError(error, context) {
    errors.push({ message: error.message, ...context });
  },
});
assert.equal(await failingAdapter.get("theme", { fallback: "xuan" }), "xuan");
assert.equal(await failingAdapter.set("theme", "songyan"), false);
assert.deepEqual(
  errors.map(({ operation }) => operation),
  ["read", "write"],
);

console.log("✓ 扩展与网页存储统一适配，并在受限环境中安全降级");
