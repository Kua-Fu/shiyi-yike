import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist", "site");

// 网页版与扩展共用同一套运行文件，只在构建时把扩展阅读页复制为站点首页。
// 白名单避免把扩展后台、测试、构建脚本和开发依赖发布到公开站点。
const runtimeEntries = [
  "app.js",
  "share-poster.js",
  "reading-insights.js",
  "learning-progress.js",
  "styles.css",
  "extension.css",
  "assets/fonts",
  "assets/icons",
  "vendor/opencc-js/full.js",
  "vendor/qrcode-generator/qrcode.mjs",
  "vendor/qrcode-generator/qrcode_UTF8.mjs",
  "data/authors.json",
  "data/deep-readings.json",
  "data/poems/startup.json",
  "data/poems/index.json",
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

await fs.copyFile(
  path.join(projectRoot, "newtab.html"),
  path.join(outputDirectory, "index.html"),
);
await fs.writeFile(path.join(outputDirectory, ".nojekyll"), "");

console.log(`网页版已生成：${path.relative(projectRoot, outputDirectory)}`);
