import assert from "node:assert/strict";
import { authorEpithet, authorKey, authorSearchText, createAuthorChoices, poemMatchesAuthor } from "../author-library.js";
import { requestedPoemId, syncPoemUrl } from "../reader-routing.js";

const choices = createAuthorChoices([
  { dynasty: "明", author: "张潮" },
  { dynasty: "唐", author: "张潮" },
  { dynasty: "唐", author: "李白" },
  { dynasty: "唐", author: "李白" },
  { dynasty: "唐", author: "杜甫" },
]);
assert.equal(authorKey("唐", "李白"), "唐:李白");
assert.equal(authorEpithet("唐", "李白"), "诗仙");
assert.equal(authorEpithet("唐", "杜甫"), "诗圣");
assert.equal(authorEpithet("唐", "王维"), "诗佛");
assert.equal(authorEpithet("唐", "王昌龄"), "七绝圣手");
assert.equal(authorEpithet("唐", "张潮"), "");
assert.deepEqual(choices.map(({ label, works }) => [label, works]), [
  ["杜甫 · 诗圣", 1],
  ["李白 · 诗仙", 2],
  ["张潮 · 明", 1],
  ["张潮 · 唐", 1],
]);
assert.deepEqual(choices.filter((choice) => authorSearchText(choice).includes("诗仙")).map((choice) => choice.name), ["李白"]);
assert.deepEqual(choices.filter((choice) => authorSearchText(choice).includes("诗圣")).map((choice) => choice.name), ["杜甫"]);
assert.equal(poemMatchesAuthor({ dynasty: "唐", author: "张潮" }, "张潮", "明"), false);

const locationLike = { protocol: "https:", href: "https://poetries.cn/newtab.html?from=test" };
const calls = [];
assert.equal(requestedPoemId(locationLike), "");
assert.equal(syncPoemUrl("poem-1", { locationLike, historyLike: { replaceState: (...args) => calls.push(args) } }), true);
assert.equal(calls[0][2].toString(), "https://poetries.cn/newtab.html?from=test&poem=poem-1");
assert.equal(requestedPoemId({ protocol: "https:", href: calls[0][2].toString() }), "poem-1");
assert.equal(requestedPoemId({ protocol: "chrome-extension:", href: "chrome-extension://id/newtab.html?poem=x" }), "");

console.log("✓ 作者筛选与诗篇路由边界均通过模块测试");
