import assert from "node:assert/strict";
import { authorKey, createAuthorChoices, poemMatchesAuthor } from "../author-library.js";
import { requestedPoemId, syncPoemUrl } from "../reader-routing.js";

const choices = createAuthorChoices([
  { dynasty: "明", author: "张潮" },
  { dynasty: "唐", author: "张潮" },
  { dynasty: "唐", author: "李白" },
  { dynasty: "唐", author: "李白" },
]);
assert.equal(authorKey("唐", "李白"), "唐:李白");
assert.deepEqual(choices.map(({ label, works }) => [label, works]), [
  ["李白", 2],
  ["张潮 · 明", 1],
  ["张潮 · 唐", 1],
]);
assert.equal(poemMatchesAuthor({ dynasty: "唐", author: "张潮" }, "张潮", "明"), false);

const locationLike = { protocol: "https:", href: "https://poetries.cn/newtab.html?from=test" };
const calls = [];
assert.equal(requestedPoemId(locationLike), "");
assert.equal(syncPoemUrl("poem-1", { locationLike, historyLike: { replaceState: (...args) => calls.push(args) } }), true);
assert.equal(calls[0][2].toString(), "https://poetries.cn/newtab.html?from=test&poem=poem-1");
assert.equal(requestedPoemId({ protocol: "https:", href: calls[0][2].toString() }), "poem-1");
assert.equal(requestedPoemId({ protocol: "chrome-extension:", href: "chrome-extension://id/newtab.html?poem=x" }), "");

console.log("✓ 作者筛选与诗篇路由边界均通过模块测试");
