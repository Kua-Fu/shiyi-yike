import assert from "node:assert/strict";

import {
  checkPuzzleOrder,
  collectPuzzleLines,
  createJigsawEdges,
  createJigsawPath,
  createPuzzleLayout,
  createPuzzlePieces,
  createPuzzleRounds,
  movePuzzlePieceToSlot,
  normalizePuzzleText,
  resolvePuzzleShapeIndex,
  shufflePuzzlePieces,
} from "../poem-puzzle.js";

assert.equal(
  normalizePuzzleText("空山新雨后，天气晚来秋。"),
  "空山新雨后天气晚来秋",
  "拼图判题应忽略标点和空白",
);

assert.deepEqual(
  collectPuzzleLines(["空山新雨后，天气晚来秋。"]),
  [
    {
      sourceLine: "空山新雨后，天气晚来秋。",
      target: "空山新雨后天气晚来秋",
    },
  ],
  "常见律诗句应保留完整上下分句",
);

const longCandidates = collectPuzzleLines([
  "屈原既放，游于江潭，行吟泽畔，颜色憔悴，形容枯槁。渔父见而问之曰：何故至于斯？",
], { maxLength: 8 });
assert.ok(longCandidates.length >= 4, "长篇原文应按原有标点拆成可玩的完整分句");
assert.ok(
  longCandidates.some(({ sourceLine }) => sourceLine === "游于江潭，"),
  "长篇拆句不得从句中硬切",
);

const shortPieces = createPuzzlePieces("白日依山尽");
assert.deepEqual(
  shortPieces.map(({ text }) => text),
  ["白", "日", "依", "山", "尽"],
  "五言诗句应按单字出块",
);
assert.equal(new Set(shortPieces.map(({ id }) => id)).size, shortPieces.length);

const longPieces = createPuzzlePieces("空山新雨后，天气晚来秋。");
assert.deepEqual(
  longPieces.map(({ text }) => text),
  ["空山", "新雨", "后", "天气", "晚来", "秋"],
  "较长诗句应合并相邻字，但不得生成跨越标点的字块",
);

const scrambled = shufflePuzzlePieces(shortPieces, () => 0.999999);
assert.notEqual(
  scrambled.map(({ text }) => text).join(""),
  "白日依山尽",
  "即使随机结果保持原序，也应主动生成一个不同次序",
);
assert.equal(checkPuzzleOrder(shortPieces, "白日依山尽。"), true);
assert.equal(checkPuzzleOrder(scrambled, "白日依山尽。"), false);

assert.deepEqual(
  createPuzzleLayout(8),
  { columns: 3, rows: 3 },
  "八块拼片应排成接近正方形的二维拼图板",
);
assert.ok(createPuzzleLayout(5).rows >= 2, "常见五言诗句不得退化成单行拼图");
const firstEdges = createJigsawEdges(0, 8);
const rightEdges = createJigsawEdges(1, 8);
const bottomEdges = createJigsawEdges(3, 8);
assert.equal(firstEdges.right, -rightEdges.left, "左右相邻拼片的凸榫与凹口必须互补");
assert.equal(firstEdges.bottom, -bottomEdges.top, "上下相邻拼片的凸榫与凹口必须互补");
assert.equal(firstEdges.top, 0, "拼图板外沿必须保持平边");
assert.match(createJigsawPath(0, 8), /^M 14 14 .+ C .+ Z$/, "拼片应生成带曲线榫口的 SVG 轮廓");
assert.equal(
  resolvePuzzleShapeIndex(1),
  1,
  "散落拼片应保留自身轮廓",
);
assert.equal(
  resolvePuzzleShapeIndex(1, 4),
  4,
  "放入拼图板的拼片应自动贴合当前槽位轮廓",
);
assert.deepEqual(
  movePuzzlePieceToSlot([null, null, null], "piece-0", 2),
  [null, null, "piece-0"],
  "散落拼片应支持直接拖入空槽位",
);
assert.deepEqual(
  movePuzzlePieceToSlot(["piece-0", null, "piece-2"], "piece-0", 2, 0),
  ["piece-2", null, "piece-0"],
  "板内拖动到已有拼片时应交换两者位置",
);
assert.deepEqual(
  movePuzzlePieceToSlot(["piece-0", null, "piece-2"], "piece-1", 2),
  ["piece-0", null, "piece-1"],
  "散落拼片拖到已有拼片时，原拼片应返回散落区",
);

const rounds = createPuzzleRounds(
  [
    "白日依山尽，黄河入海流。",
    "欲穷千里目，更上一层楼。",
    "床前明月光，疑是地上霜。",
    "举头望明月，低头思故乡。",
  ],
  { limit: 3, random: () => 0.25 },
);
assert.equal(rounds.length, 3, "每局最多应生成三题");
for (const round of rounds) {
  assert.ok(round.sourceLine, "每题应保留用于核对的标准原句");
  assert.ok(round.pieces.length >= 3, "每题至少需要三个可操作字块");
  assert.ok(round.layout.rows >= 2, "每题都应使用二维拼图板");
  assert.notEqual(
    round.pieces.map(({ text }) => text).join(""),
    round.target,
    "开局字块不得已经处于正确次序",
  );
}

console.log("✓ 诗句拼图拆句、字块生成、乱序与判题均通过校验");
