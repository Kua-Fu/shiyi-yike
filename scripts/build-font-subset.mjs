import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Converter } from "opencc-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontRoot = path.join(projectRoot, "assets/fonts");
const sourcePath = path.join(fontRoot, "ZhiMangXing-Regular.ttf");
const deepOutputPath = path.join(fontRoot, "ZhiMangXing-Deep.woff2");
const extendedOutputPath = path.join(fontRoot, "ZhiMangXing-Extended.woff2");
const legacyOutputPath = path.join(fontRoot, "ZhiMangXing-Subset.woff2");
const stylesheetPath = path.join(projectRoot, "reader-fonts.css");
const metadataPath = path.join(fontRoot, "ZhiMangXing-Subset.meta.json");
const expectedSourceSha256 = "644e0cae9b40f0b10ab729a01bd32032e3973bac22be3dccae01bf6ae7fde969";
const baseline = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789，。！？；：、（）《》〈〉“”‘’·—…#%&+-=/↗←→×✓⌕ ";

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

function uniqueCharacters(text) {
  return [...new Set(Array.from(text))]
    .sort((left, right) => left.codePointAt(0) - right.codePointAt(0))
    .join("");
}

function unicodeRanges(characters) {
  const points = Array.from(characters, (character) => character.codePointAt(0));
  const ranges = [];
  for (const point of points) {
    const current = ranges.at(-1);
    if (current && point === current[1] + 1) current[1] = point;
    else ranges.push([point, point]);
  }
  return ranges.map(([start, end]) => {
    const first = start.toString(16).toUpperCase();
    const last = end.toString(16).toUpperCase();
    return start === end ? `U+${first}` : `U+${first}-${last}`;
  }).join(",");
}

async function subsetFont({ characters, textPath, outputPath }) {
  await fs.writeFile(textPath, characters);
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
}

const sourceBuffer = await fs.readFile(sourcePath);
const sourceSha256 = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
if (sourceSha256 !== expectedSourceSha256) {
  throw new Error("原始行书字体发生变化，请先核对许可与字形，再更新固定哈希");
}

const rootEntries = await fs.readdir(projectRoot, { withFileTypes: true });
const runtimeTextFiles = rootEntries
  .filter((entry) => entry.isFile() && /\.(?:js|html)$/.test(entry.name))
  .map((entry) => path.join(projectRoot, entry.name));
const deepTextFiles = [
  ...runtimeTextFiles,
  path.join(projectRoot, "data/poems/startup.json"),
  path.join(projectRoot, "data/deep-readings.json"),
];
const chunkFiles = await collectFiles(path.join(projectRoot, "data/poems/chunks"));
const fullTextFiles = [
  ...deepTextFiles,
  path.join(projectRoot, "data/authors.json"),
  ...chunkFiles,
];
const [deepTexts, fullTexts] = await Promise.all([
  Promise.all(deepTextFiles.map((file) => fs.readFile(file, "utf8"))),
  Promise.all(fullTextFiles.map((file) => fs.readFile(file, "utf8"))),
]);
const toTraditional = Converter({ from: "cn", to: "tw" });
const deepText = deepTexts.join("");
// 阅读器允许整页切换繁体；两种字形都纳入同一层，避免繁体精读页误触发扩展包。
const deepCharacters = uniqueCharacters(`${baseline}${deepText}${toTraditional(deepText)}`);
const deepCharacterSet = new Set(Array.from(deepCharacters));
const fullText = fullTexts.join("");
const fullCharacters = uniqueCharacters(`${baseline}${fullText}${toTraditional(fullText)}`);
const extendedCharacters = Array.from(fullCharacters)
  .filter((character) => !deepCharacterSet.has(character))
  .join("");
if (!extendedCharacters) throw new Error("扩展行书字符集为空，无法生成分层字体");

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shiyi-font-"));
const temporaryDeepOutput = path.join(temporaryDirectory, "ZhiMangXing-Deep.woff2");
const temporaryExtendedOutput = path.join(temporaryDirectory, "ZhiMangXing-Extended.woff2");
try {
  // 精读包覆盖首屏界面与 100 篇深度内容；只有进入更大诗库遇到新字时才请求扩展包。
  await subsetFont({
    characters: deepCharacters,
    textPath: path.join(temporaryDirectory, "deep-characters.txt"),
    outputPath: temporaryDeepOutput,
  });
  await subsetFont({
    characters: extendedCharacters,
    textPath: path.join(temporaryDirectory, "extended-characters.txt"),
    outputPath: temporaryExtendedOutput,
  });

  const [deepBuffer, extendedBuffer] = await Promise.all([
    fs.readFile(temporaryDeepOutput),
    fs.readFile(temporaryExtendedOutput),
  ]);
  const stylesheet = `/* 只有选择“行书逸韵”时才动态加载；unicode-range 继续按实际字符请求精读包或扩展包。 */
@font-face {
  font-family: "Zhi Mang Xing Local";
  src: url("assets/fonts/ZhiMangXing-Deep.woff2") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  unicode-range: ${unicodeRanges(deepCharacters)};
}

@font-face {
  font-family: "Zhi Mang Xing Local";
  src: url("assets/fonts/ZhiMangXing-Extended.woff2") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  unicode-range: ${unicodeRanges(extendedCharacters)};
}
`;
  const metadata = {
    schemaVersion: 2,
    source: "ZhiMangXing-Regular.ttf",
    sourceSha256,
    outputs: {
      deep: {
        file: "ZhiMangXing-Deep.woff2",
        sha256: crypto.createHash("sha256").update(deepBuffer).digest("hex"),
        characterCount: Array.from(deepCharacters).length,
        bytes: deepBuffer.length,
      },
      extended: {
        file: "ZhiMangXing-Extended.woff2",
        sha256: crypto.createHash("sha256").update(extendedBuffer).digest("hex"),
        characterCount: Array.from(extendedCharacters).length,
        bytes: extendedBuffer.length,
      },
    },
    sourceBytes: sourceBuffer.length,
    outputBytes: deepBuffer.length + extendedBuffer.length,
  };

  await Promise.all([
    fs.copyFile(temporaryDeepOutput, deepOutputPath),
    fs.copyFile(temporaryExtendedOutput, extendedOutputPath),
    fs.writeFile(stylesheetPath, stylesheet),
    fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`),
  ]);
  // 旧单文件若继续留在仓库，发布白名单很容易在后续维护中误带回 1.8 MiB 首包。
  await fs.rm(legacyOutputPath, { force: true });
  console.log(
    `行书字体已分层：精读 ${metadata.outputs.deep.characterCount} 字符 / ${metadata.outputs.deep.bytes} bytes，`
    + `扩展 ${metadata.outputs.extended.characterCount} 字符 / ${metadata.outputs.extended.bytes} bytes`,
  );
} finally {
  await fs.rm(temporaryDirectory, { force: true, recursive: true });
}
