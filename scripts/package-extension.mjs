import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await fs.readFile(path.join(projectRoot, "manifest.json"), "utf8"),
);
const outputDirectory = path.join(projectRoot, "dist");
const outputPath = path.join(
  outputDirectory,
  `shiyi-yike-chrome-extension-${manifest.version}.zip`,
);
const stagingDirectory = await fs.mkdtemp(
  path.join(os.tmpdir(), "shiyi-yike-extension-"),
);

const runtimeEntries = [
  "manifest.json",
  "background.js",
  "newtab.html",
  "app.js",
  "share-poster.js",
  "reading-insights.js",
  "learning-progress.js",
  "poem-puzzle.js",
  "styles.css",
  "extension.css",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "CONTENT_LICENSE_AUDIT.md",
  "assets/icon.svg",
  "assets/fonts",
  "assets/icons",
  "vendor/opencc-js/full.js",
  "vendor/opencc-js/LICENSE",
  "vendor/opencc-js/THIRD_PARTY_LICENSES.md",
  "vendor/qrcode-generator/qrcode.mjs",
  "vendor/qrcode-generator/qrcode_UTF8.mjs",
  "vendor/qrcode-generator/LICENSE",
  "data/authors.json",
  "data/deep-readings.json",
  "data/poems/startup.json",
  "data/poems/index.json",
  "data/poems/search-reviewed.json",
  "data/poems/search.json",
  "data/poems/chunks",
  "data/sources",
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码为 ${code}`));
    });
  });
}

function runForOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} 退出码为 ${code}`));
    });
  });
}

try {
  for (const entry of runtimeEntries) {
    const source = path.join(projectRoot, entry);
    const target = path.join(stagingDirectory, entry);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // 只复制白名单中的运行文件，避免把测试、构建脚本或 node_modules 带入商店包。
    await fs.cp(source, target, { recursive: true });
  }

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.rm(outputPath, { force: true });
  await run("/usr/bin/zip", ["-X", "-q", "-r", outputPath, "."], {
    cwd: stagingDirectory,
  });

  const entries = (await runForOutput("/usr/bin/unzip", ["-Z1", outputPath]))
    .split("\n")
    .filter(Boolean);
  for (const requiredEntry of [
    "manifest.json",
    "background.js",
    "newtab.html",
    "app.js",
    "share-poster.js",
    "reading-insights.js",
    "learning-progress.js",
    "poem-puzzle.js",
    "CONTENT_LICENSE_AUDIT.md",
    "assets/fonts/ZhiMangXing-Regular.ttf",
    "assets/fonts/ZhiMangXing-OFL.txt",
    "vendor/qrcode-generator/qrcode.mjs",
    "vendor/qrcode-generator/qrcode_UTF8.mjs",
    "vendor/qrcode-generator/LICENSE",
    "data/poems/startup.json",
    "data/poems/index.json",
    "data/poems/search-reviewed.json",
    "data/poems/search.json",
    "data/deep-readings.json",
    "data/sources/content-license-audit.json",
  ]) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`扩展包缺少必需文件：${requiredEntry}`);
    }
  }
  // 草书选项已从产品中下线；显式阻断旧字体回流，避免发布包体积悄然增加约 2.6 MiB。
  for (const removedEntry of [
    "assets/fonts/LiuJianMaoCao-Regular.ttf",
    "assets/fonts/LiuJianMaoCao-OFL.txt",
  ]) {
    if (entries.includes(removedEntry)) {
      throw new Error(`扩展包仍包含已移除资源：${removedEntry}`);
    }
  }
  if (entries.some((entry) => /^(?:node_modules|scripts|tests)\//.test(entry))) {
    throw new Error("扩展包混入开发依赖、脚本或测试文件");
  }
} finally {
  await fs.rm(stagingDirectory, { force: true, recursive: true });
}

console.log(`扩展包已生成：${path.relative(projectRoot, outputPath)}`);
