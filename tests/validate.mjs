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

const appSource = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
assert.match(appSource, /state\.category === "收藏"/, "收藏入口应筛选本地收藏 ID");
assert.match(appSource, /诗笺尚空/, "收藏为空时应提供明确提示");
assert.match(appSource, /function openPoemList\(\)/, "应支持打开当前筛选结果列表");
assert.match(appSource, /showPoem\(poem, `已从列表打开/, "点击列表项应直接进入诗词正文");

const extensionStyles = fs.readFileSync(path.join(projectRoot, "extension.css"), "utf8");
assert.match(extensionStyles, /height <= 820px/, "应适配商店截图常用的 1280×800 视口");

console.log("✓ Manifest V3、收藏与筛选列表入口、扩展资源和 2000 首诗词数据均通过校验");
