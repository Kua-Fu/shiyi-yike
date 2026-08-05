import assert from "node:assert/strict";
import {
  buildShareFileName,
  buildShareQrText,
  createQrMatrix,
} from "../share-poster.js";

const poem = {
  title: "静夜思",
  dynasty: "唐",
  author: "李白",
  lines: [
    "床前明月光，疑是地上霜。",
    "举头望明月，低头思故乡。",
  ],
};

const qrText = buildShareQrText();
assert.equal(qrText, "https://poetries.cn", "二维码应只包含官网地址");
assert.equal(
  buildShareQrText({
    ...poem,
    title: "很长的题目".repeat(30),
    lines: ["天地玄黄，宇宙洪荒。".repeat(300)],
  }),
  "https://poetries.cn",
  "二维码内容不应随诗词变化",
);

assert.equal(buildShareFileName(poem), "诗意一刻-静夜思-李白.png");
assert.equal(
  buildShareFileName({ title: '水调歌头/明月?"', author: "苏/轼" }),
  "诗意一刻-水调歌头明月-苏轼.png",
);

const matrix = createQrMatrix(qrText);
assert.equal(matrix.size, 25, "短官网地址应生成低密度二维码以提升识别率");
assert.equal(typeof matrix.isDark(0, 0), "boolean");
assert.equal(matrix.isDark(0, 0), true, "二维码左上角应包含定位图案");

console.log("✓ 官网分享二维码、文件名与离线生成功能均通过校验");
