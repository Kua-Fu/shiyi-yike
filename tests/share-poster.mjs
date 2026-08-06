import assert from "node:assert/strict";
import {
  buildShareFileName,
  buildShareQrText,
  createQrMatrix,
} from "../share-poster.js";

const poem = {
  id: "seed-tang-jing-ye-si",
  title: "静夜思",
  dynasty: "唐",
  author: "李白",
  lines: [
    "床前明月光，疑是地上霜。",
    "举头望明月，低头思故乡。",
  ],
};

const qrText = buildShareQrText();
assert.equal(qrText, "https://poetries.cn/newtab.html", "没有作品 ID 时应回到在线阅读器");
assert.equal(
  buildShareQrText(poem),
  "https://poetries.cn/newtab.html?poem=seed-tang-jing-ye-si",
  "二维码应直达当前作品而非停在官网首页",
);

assert.equal(buildShareFileName(poem), "诗意一刻-静夜思-李白.png");
assert.equal(
  buildShareFileName({ title: '水调歌头/明月?"', author: "苏/轼" }),
  "诗意一刻-水调歌头明月-苏轼.png",
);

const matrix = createQrMatrix(buildShareQrText(poem));
assert.ok(matrix.size <= 41, "作品深链接仍应保持适合海报扫描的二维码密度");
assert.equal(typeof matrix.isDark(0, 0), "boolean");
assert.equal(matrix.isDark(0, 0), true, "二维码左上角应包含定位图案");

console.log("✓ 官网分享二维码、文件名与离线生成功能均通过校验");
