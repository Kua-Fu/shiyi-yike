import assert from "node:assert/strict";
import {
  buildShareFileName,
  buildShareQrText,
  createQrMatrix,
  selectSharePosterLines,
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
assert.equal(
  buildShareQrText(poem, "illustration-3"),
  "https://poetries.cn/newtab.html?poem=seed-tang-jing-ye-si#illustration-3",
  "插画诗笺二维码应定位到对应配图",
);

assert.equal(buildShareFileName(poem), "诗意一刻-静夜思-李白.png");
assert.equal(buildShareFileName(poem, "举头望明月"), "诗意一刻-静夜思-李白-举头望明月.png");
assert.deepEqual(selectSharePosterLines(poem.lines, { verse: "举头望明月" }), poem.lines, "短诗诗笺应保留全文");
const longPoemLines = [
  "有耳莫洗颍川水，有口莫食首阳蕨。",
  "含光混世贵无名，何用孤高比云月。",
  "华亭鹤唳讵可闻，上蔡苍鹰何足道。",
  "且乐生前一杯酒，何须身后千载名。",
];
assert.deepEqual(
  selectSharePosterLines(longPoemLines, { verse: "上蔡苍鹰何足道" }),
  ["华亭鹤唳讵可闻，上蔡苍鹰何足道。"],
  "长诗插画诗笺应展示与所点图片相对应的原句",
);
assert.deepEqual(selectSharePosterLines(longPoemLines), longPoemLines, "普通诗笺仍使用完整原诗");
assert.equal(
  buildShareFileName({ title: '水调歌头/明月?"', author: "苏/轼" }),
  "诗意一刻-水调歌头明月-苏轼.png",
);

const matrix = createQrMatrix(buildShareQrText(poem));
assert.ok(matrix.size <= 41, "作品深链接仍应保持适合海报扫描的二维码密度");
assert.equal(typeof matrix.isDark(0, 0), "boolean");
assert.equal(matrix.isDark(0, 0), true, "二维码左上角应包含定位图案");

console.log("✓ 官网分享二维码、文件名与离线生成功能均通过校验");
