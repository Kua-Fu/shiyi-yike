import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "assets/fonts/ZhiMangXing-Regular.ttf");
const outputPath = path.join(projectRoot, "assets/fonts/ZhiMangXing-Subset.woff2");
const metadataPath = path.join(projectRoot, "assets/fonts/ZhiMangXing-Subset.meta.json");
const expectedSourceSha256 = "644e0cae9b40f0b10ab729a01bd32032e3973bac22be3dccae01bf6ae7fde969";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码为 ${code}`));
    });
  });
}

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(target) : [target];
  }));
  return nested.flat();
}

const sourceBuffer = await fs.readFile(sourcePath);
const sourceSha256 = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
if (sourceSha256 !== expectedSourceSha256) {
  throw new Error("原始行书字体发生变化，请先核对许可与字形，再更新固定哈希");
}

const textSources = [
  "app.js",
  "newtab.html",
  "index.html",
  "privacy.html",
  "README.md",
  "data/authors.json",
  "data/deep-readings.json",
];
const chunkFiles = await collectFiles(path.join(projectRoot, "data/poems/chunks"));
const sourceTexts = await Promise.all(
  [...textSources.map((file) => path.join(projectRoot, file)), ...chunkFiles]
    .map((file) => fs.readFile(file, "utf8")),
);
const baseline = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789，。！？；：、（）《》〈〉“”‘’·—…#%&+-=/↗←→×✓⌕ ";
const characters = [...new Set(Array.from(`${baseline}${sourceTexts.join("")}`))]
  .sort((left, right) => left.codePointAt(0) - right.codePointAt(0))
  .join("");

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shiyi-font-"));
const textPath = path.join(temporaryDirectory, "characters.txt");
try {
  await fs.writeFile(textPath, characters);
  // WOFF2 子集只保留项目实际会展示的字形；原 TTF 留作可复现构建源，不进入网页和扩展发布包。
  await run(process.env.PYTHON ?? "python3", [
    "-m",
    "fontTools.subset",
    sourcePath,
    `--text-file=${textPath}`,
    `--output-file=${outputPath}`,
    "--flavor=woff2",
    "--layout-features=*",
    "--glyph-names",
    "--symbol-cmap",
    "--legacy-cmap",
    "--notdef-outline",
    "--recommended-glyphs",
    "--name-IDs=*",
    "--name-legacy",
    "--name-languages=*",
  ]);
  const outputBuffer = await fs.readFile(outputPath);
  const metadata = {
    schemaVersion: 1,
    source: "ZhiMangXing-Regular.ttf",
    sourceSha256,
    output: "ZhiMangXing-Subset.woff2",
    outputSha256: crypto.createHash("sha256").update(outputBuffer).digest("hex"),
    characterCount: Array.from(characters).length,
    sourceBytes: sourceBuffer.length,
    outputBytes: outputBuffer.length,
  };
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`行书字体子集已生成：${metadata.characterCount} 字符，${metadata.outputBytes} bytes`);
} finally {
  await fs.rm(temporaryDirectory, { force: true, recursive: true });
}
