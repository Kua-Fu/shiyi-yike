import assert from "node:assert/strict";
import {
  buildShareFileName,
  buildShareQrText,
  createQrMatrix,
  truncateTextToBytes,
} from "../share-poster.js";

const encoder = new TextEncoder();
const poem = {
  title: "静夜思",
  dynasty: "唐",
  author: "李白",
  lines: [
    "床前明月光，疑是地上霜。",
    "举头望明月，低头思故乡。",
  ],
};

const qrText = buildShareQrText(poem);
assert.match(qrText, /《静夜思》/);
assert.match(qrText, /唐 · 李白/);
assert.match(qrText, /床前明月光/);
assert.match(qrText, /https:\/\/github\.com\/Kua-Fu\/shiyi-yike/);
assert.ok(encoder.encode(qrText).length <= 300, "二维码内容应保持易扫描的密度");

const longQrText = buildShareQrText({
  ...poem,
  title: "很长的题目".repeat(30),
  author: "很长的作者".repeat(20),
  lines: ["天地玄黄，宇宙洪荒。".repeat(300)],
});
assert.ok(encoder.encode(longQrText).length <= 300, "异常长诗也不得超过二维码容量");

assert.equal(truncateTextToBytes("明月abc", 7), "明月a");
assert.equal(buildShareFileName(poem), "诗意一刻-静夜思-李白.png");
assert.equal(
  buildShareFileName({ title: '水调歌头/明月?"', author: "苏/轼" }),
  "诗意一刻-水调歌头明月-苏轼.png",
);

const matrix = createQrMatrix(qrText);
assert.ok(matrix.size >= 21 && matrix.size <= 177, "二维码矩阵尺寸应符合 QR 规格");
assert.equal(typeof matrix.isDark(0, 0), "boolean");
assert.equal(matrix.isDark(0, 0), true, "二维码左上角应包含定位图案");

console.log("✓ 诗词分享文本、文件名与离线二维码生成均通过校验");
