import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = spawnSync(process.execPath, ["scripts/build-web.mjs"], {
  cwd: projectRoot,
  encoding: "utf8",
});

assert.equal(build.status, 0, build.stderr || build.stdout);

const siteRoot = path.join(projectRoot, "dist", "site");
const sourceHtml = fs.readFileSync(path.join(projectRoot, "newtab.html"), "utf8");
const deployedHtml = fs.readFileSync(path.join(siteRoot, "index.html"), "utf8");
assert.equal(deployedHtml, sourceHtml, "网页版首页必须与扩展阅读页完全一致");

for (const requiredEntry of [
  ".nojekyll",
  "app.js",
  "share-poster.js",
  "styles.css",
  "extension.css",
  "assets/icons/icon-32.png",
  "assets/fonts/ZhiMangXing-Regular.ttf",
  "vendor/opencc-js/full.js",
  "vendor/qrcode-generator/qrcode.mjs",
  "data/poems/index.json",
  "data/poems/search.json",
  "data/deep-readings.json",
]) {
  assert.ok(
    fs.existsSync(path.join(siteRoot, requiredEntry)),
    `网页发布产物缺少：${requiredEntry}`,
  );
}

for (const privateEntry of [
  "manifest.json",
  "background.js",
  "package.json",
  "tests",
  "scripts",
]) {
  assert.ok(
    !fs.existsSync(path.join(siteRoot, privateEntry)),
    `网页发布产物不应包含扩展或开发文件：${privateEntry}`,
  );
}

console.log("✓ 网页发布产物可从根路径加载，并与扩展阅读页保持一致");
