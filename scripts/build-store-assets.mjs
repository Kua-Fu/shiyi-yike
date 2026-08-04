import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist/store-assets");

await fs.mkdir(path.join(outputDirectory, "screenshots"), { recursive: true });

const conversions = [
  {
    source: "assets/store/promo-small.svg",
    target: "small-promo-440x280.png",
    width: 440,
    height: 280,
  },
  {
    source: "assets/store/promo-marquee.svg",
    target: "marquee-promo-1400x560.png",
    width: 1400,
    height: 560,
  },
];

async function convertSvg(conversion) {
  const source = path.join(projectRoot, conversion.source);
  const target = path.join(outputDirectory, conversion.target);
  try {
    await run("rsvg-convert", [
      "--width",
      String(conversion.width),
      "--height",
      String(conversion.height),
      "--output",
      target,
      source,
    ]);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // CI 或其他开发机没有 librsvg 时，使用 ImageMagick 作为等价的 SVG 转图后备。
    await run("magick", [
      source,
      "-resize",
      `${conversion.width}x${conversion.height}!`,
      target,
    ]);
  }
}

for (const conversion of conversions) await convertSvg(conversion);

await fs.copyFile(
  path.join(projectRoot, "assets/icons/icon-128.png"),
  path.join(outputDirectory, "store-icon-128.png"),
);
await fs.copyFile(
  path.join(projectRoot, "STORE_LISTING.md"),
  path.join(outputDirectory, "STORE_LISTING.md"),
);

console.log(`商店图已生成：${path.relative(projectRoot, outputDirectory)}`);
