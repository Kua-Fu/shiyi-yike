import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));

const manifest = readJson("manifest.json");
assert.equal(manifest.manifest_version, 3, "扩展必须使用 Manifest V3");
assert.equal(manifest.chrome_url_overrides.newtab, "newtab.html");
assert.deepEqual(manifest.permissions, ["storage"], "扩展应只申请本地收藏所需权限");

const requiredFiles = [
  manifest.chrome_url_overrides.newtab,
  manifest.background.service_worker,
  "app.js",
  "styles.css",
  "extension.css",
  ...Object.values(manifest.icons),
];
for (const relativePath of requiredFiles) {
  assert.ok(fs.existsSync(path.join(projectRoot, relativePath)), `缺少扩展文件：${relativePath}`);
}

const index = readJson("data/poems/index.json");
assert.equal(index.counts.total, 2000);
assert.equal(index.counts.tang, 1000);
assert.equal(index.counts.song, 1000);
assert.equal(index.poems.length, 2000);

const indexIds = new Set(index.poems.map((poem) => poem.id));
assert.equal(indexIds.size, 2000, "诗词索引 ID 必须唯一");

const searchIndex = readJson("data/poems/search.json");
assert.equal(searchIndex.count, 2000, "全文搜索索引应覆盖全部诗词");
assert.equal(searchIndex.records.length, 2000);
const searchIds = new Set(searchIndex.records.map(([id]) => id));
assert.equal(searchIds.size, 2000, "全文搜索索引 ID 必须唯一");
for (const id of indexIds) assert.ok(searchIds.has(id), `全文搜索索引缺少诗词：${id}`);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("床前明月光")),
  "全文搜索索引应能命中原文诗句",
);
assert.ok(
  searchIndex.records.some(([, text]) => text.includes("明月几时有")),
  "全文搜索索引应能命中宋词原文",
);

const authorData = readJson("data/authors.json");
assert.equal(authorData.counts.total, 406, "应覆盖诗库中的全部 406 位作者");
assert.ok(authorData.counts.sourced >= 400, "开放语料作者简介覆盖率应不低于 400 位");
assert.equal(authorData.authors.length, authorData.counts.total);
const authorKeys = new Set(
  authorData.authors.map((author) => `${author.dynasty}:${author.name}`),
);
assert.equal(authorKeys.size, authorData.authors.length, "作者人物简介不得重复");
for (const poem of index.poems) {
  assert.ok(
    authorKeys.has(`${poem.dynasty}:${poem.author}`),
    `缺少${poem.dynasty}代作者${poem.author}的人物简介`,
  );
}
for (const author of authorData.authors) {
  assert.ok(author.biography.length >= 8, `${author.name}的人物简介缺少基本说明`);
  assert.ok(author.works >= 1, `${author.name}缺少诗库作品数量`);
}

const bodyIds = new Set();
const chunkDirectory = path.join(projectRoot, "data/poems/chunks");
const chunkFiles = fs.readdirSync(chunkDirectory).filter((name) => name.endsWith(".json")).sort();
assert.equal(chunkFiles.length, 20, "应包含唐诗、宋词各 10 个分卷");

for (const filename of chunkFiles) {
  const records = readJson(`data/poems/chunks/${filename}`);
  assert.equal(records.length, 100, `${filename} 应包含 100 首`);
  for (const record of records) {
    assert.ok(indexIds.has(record.id), `${filename} 含有索引外的诗词：${record.id}`);
    assert.ok(!bodyIds.has(record.id), `正文 ID 重复：${record.id}`);
    assert.ok(Array.isArray(record.lines) && record.lines.length > 0, `${record.id} 缺少原文`);
    assert.ok(Array.isArray(record.translation), `${record.id} 的译文格式错误`);
    bodyIds.add(record.id);
  }
}

assert.equal(bodyIds.size, indexIds.size, "正文数量与索引数量不一致");
for (const id of indexIds) assert.ok(bodyIds.has(id), `缺少正文：${id}`);

const newTabHtml = fs.readFileSync(path.join(projectRoot, "newtab.html"), "utf8");
assert.doesNotMatch(newTabHtml, /https?:\/\//, "新标签页不应依赖远程资源");
assert.match(newTabHtml, /data-category="收藏"/, "顶部应提供收藏浏览入口");
assert.match(newTabHtml, /id="result-trigger"/, "“首可赏”数量应提供列表入口");
assert.match(newTabHtml, /id="poem-list-dialog"/, "应提供当前筛选结果的诗词列表弹层");
assert.match(newTabHtml, /id="search-trigger"/, "顶部应提供全库诗词搜索入口");
assert.match(newTabHtml, /id="search-dialog"/, "应提供全库诗词搜索弹层");
assert.match(newTabHtml, /id="global-search-input"/, "搜索弹层应提供关键词输入框");
assert.match(newTabHtml, /id="author-dialog"/, "应提供诗人、词人人物简介弹层");
assert.match(newTabHtml, /id="author-works-action"/, "人物简介应提供作者作品入口");

const appSource = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
assert.match(appSource, /state\.category === "收藏"/, "收藏入口应筛选本地收藏 ID");
assert.match(appSource, /诗笺尚空/, "收藏为空时应提供明确提示");
assert.match(appSource, /function openPoemList\(\)/, "应支持打开当前筛选结果列表");
assert.match(appSource, /showPoem\(poem, options\.message \|\|/, "点击列表项应直接进入诗词正文");
assert.match(appSource, /function openGlobalSearch\(\)/, "应支持打开全库诗词搜索");
assert.match(appSource, /function renderGlobalSearch\(\)/, "应支持渲染全库搜索结果");
assert.match(appSource, /fetch\(`data\/poems\/search\.json/, "全文索引必须从扩展包本地加载");
assert.match(appSource, /function openAuthorDialog\(poem\)/, "点击作者应支持打开人物简介");
assert.match(appSource, /function showActiveAuthorWorks\(\)/, "人物简介应可进入作者作品筛选");
assert.match(appSource, /fetch\(`data\/authors\.json/, "作者资料必须从扩展包本地加载");

const extensionStyles = fs.readFileSync(path.join(projectRoot, "extension.css"), "utf8");
assert.match(extensionStyles, /height <= 820px/, "应适配商店截图常用的 1280×800 视口");

console.log("✓ Manifest V3、全文搜索、406 位作者简介、收藏筛选及 2000 首诗词数据均通过校验");
