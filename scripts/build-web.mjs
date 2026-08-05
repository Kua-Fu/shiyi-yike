import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist", "site");

// 官网负责产品说明与获客，在线阅读器仍与扩展共用同一套运行文件。
// 白名单避免把扩展后台、测试、构建脚本和开发依赖发布到公开站点。
const runtimeEntries = [
  "index.html",
  "newtab.html",
  "privacy.html",
  "landing.css",
  "app.js",
  "share-poster.js",
  "reading-insights.js",
  "learning-progress.js",
  "poem-puzzle.js",
  "styles.css",
  "extension.css",
  "robots.txt",
  "sitemap.xml",
  "CNAME",
  "PRIVACY.md",
  "assets/fonts",
  "assets/icons",
  "assets/store",
  "vendor/opencc-js/full.js",
  "vendor/qrcode-generator/qrcode.mjs",
  "vendor/qrcode-generator/qrcode_UTF8.mjs",
  "data/authors.json",
  "data/deep-readings.json",
  "data/poems/startup.json",
  "data/poems/index.json",
  "data/poems/search-reviewed.json",
  "data/poems/search.json",
  "data/poems/chunks",
];

await fs.rm(outputDirectory, { force: true, recursive: true });
await fs.mkdir(outputDirectory, { recursive: true });

for (const entry of runtimeEntries) {
  const source = path.join(projectRoot, entry);
  const target = path.join(outputDirectory, entry);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

await fs.writeFile(path.join(outputDirectory, ".nojekyll"), "");

console.log(`网页版已生成：${path.relative(projectRoot, outputDirectory)}`);
