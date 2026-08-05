const PUZZLE_PUNCTUATION = /[\p{P}\p{S}\s]/gu;
const CLAUSE_PATTERN = /[^，。！？；：!?;]+[，。！？；：!?;]?/gu;

export function normalizePuzzleText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(PUZZLE_PUNCTUATION, "");
}

function cleanDisplayLine(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[“”‘’"'（）()【】\[\]]+/u, "")
    .replace(/[“”‘’"'（）()【】\[\]]+$/u, "")
    .trim();
}

export function collectPuzzleLines(
  lines,
  { minLength = 4, maxLength = 24 } = {},
) {
  const candidates = new Map();
  const addCandidate = (value) => {
    const sourceLine = cleanDisplayLine(value);
    const target = normalizePuzzleText(sourceLine);
    if (
      target.length < minLength ||
      target.length > maxLength ||
      candidates.has(target)
    ) {
      return;
    }
    candidates.set(target, sourceLine);
  };

  for (const value of Array.isArray(lines) ? lines : []) {
    const sourceLine = cleanDisplayLine(value);
    const target = normalizePuzzleText(sourceLine);
    if (target.length <= maxLength) {
      addCandidate(sourceLine);
      continue;
    }

    // 长篇辞赋和散体诗可能把整段放在一行；只截取原有标点划分的完整分句，
    // 不从句中硬切，确保游戏核对时展示的仍是可辨认的原文单位。
    for (const clause of sourceLine.match(CLAUSE_PATTERN) ?? []) {
      addCandidate(clause);
    }
  }

  return [...candidates.entries()].map(([target, sourceLine]) => ({
    sourceLine,
    target,
  }));
}

export function createPuzzlePieces(sourceLine) {
  const target = normalizePuzzleText(sourceLine);
  const groupSize = target.length <= 8 ? 1 : target.length <= 16 ? 2 : 3;
  const clauses = String(sourceLine ?? "")
    .split(/[\p{P}\p{S}]+/gu)
    .map(normalizePuzzleText)
    .filter(Boolean);
  const pieces = [];
  // 较长诗句会合并相邻字以减少按钮数量，但每逢原文标点重新分块，
  // 避免把上下分句的末字与首字拼成一个失去语义的字块。
  for (const clause of clauses) {
    const characters = [...clause];
    for (let index = 0; index < characters.length; index += groupSize) {
      pieces.push({
        id: `piece-${pieces.length}`,
        text: characters.slice(index, index + groupSize).join(""),
        targetIndex: pieces.length,
      });
    }
  }
  return pieces;
}

export function createPuzzleLayout(pieceCount) {
  const total = Math.max(0, Math.floor(Number(pieceCount) || 0));
  if (!total) return { columns: 0, rows: 0 };
  // 采用接近正方形的二维拼板，避免五言、七言诗再次退化成横向单行字块。
  const columns = Math.ceil(Math.sqrt(total));
  return {
    columns,
    rows: Math.ceil(total / columns),
  };
}

export function resolvePuzzleShapeIndex(targetIndex, slotIndex = null) {
  const normalizedTarget = Math.max(0, Math.floor(Number(targetIndex) || 0));
  // 散落拼片保留各自轮廓；进入拼图板后改为贴合当前槽位。
  // 文字对应的 targetIndex 不变，因此视觉贴合不会干扰最终的诗句顺序判定。
  return Number.isInteger(slotIndex) && slotIndex >= 0
    ? slotIndex
    : normalizedTarget;
}

export function movePuzzlePieceToSlot(
  placedPieceIds,
  pieceId,
  targetSlotIndex,
  sourceSlotIndex = null,
) {
  const next = Array.isArray(placedPieceIds) ? [...placedPieceIds] : [];
  const target = Number(targetSlotIndex);
  const source = sourceSlotIndex === null ? null : Number(sourceSlotIndex);
  if (
    !pieceId ||
    !Number.isInteger(target) ||
    target < 0 ||
    target >= next.length
  ) {
    return next;
  }
  if (
    source !== null &&
    (!Number.isInteger(source) ||
      source < 0 ||
      source >= next.length ||
      next[source] !== pieceId)
  ) {
    return next;
  }
  if (source === target) return next;

  // 从散落区拖入已占用槽位时，原拼片自然回到散落区；板内拖动则交换两块，
  // 让鼠标和手指都能用一次连续动作完成重排，而不必先逐块取回。
  const displacedPieceId = next[target] ?? null;
  next[target] = pieceId;
  if (source !== null) next[source] = displacedPieceId;
  return next;
}

function horizontalJoinDirection(row, column) {
  return (row + column) % 2 === 0 ? 1 : -1;
}

function verticalJoinDirection(row, column) {
  return (row + column) % 2 === 0 ? -1 : 1;
}

export function createJigsawEdges(targetIndex, pieceCount) {
  const total = Math.max(0, Math.floor(Number(pieceCount) || 0));
  const index = Math.max(0, Math.min(total - 1, Math.floor(targetIndex) || 0));
  const { columns } = createPuzzleLayout(total);
  if (!columns) return { top: 0, right: 0, bottom: 0, left: 0 };
  const row = Math.floor(index / columns);
  const column = index % columns;
  const hasRight = column + 1 < columns && index + 1 < total;
  const hasBottom = index + columns < total;
  return {
    top: row === 0 ? 0 : -verticalJoinDirection(row - 1, column),
    right: hasRight ? horizontalJoinDirection(row, column) : 0,
    bottom: hasBottom ? verticalJoinDirection(row, column) : 0,
    left: column === 0 ? 0 : -horizontalJoinDirection(row, column - 1),
  };
}

function pointOnEdge(start, end, normal, progress, offset = 0) {
  return [
    start[0] + (end[0] - start[0]) * progress + normal[0] * offset,
    start[1] + (end[1] - start[1]) * progress + normal[1] * offset,
  ];
}

function formatPoint(point) {
  return point.map((value) => Number(value.toFixed(2))).join(" ");
}

function jigsawEdgePath(start, end, normal, direction) {
  if (!direction) return `L ${formatPoint(end)}`;
  const offset = direction * 21;
  const p1 = pointOnEdge(start, end, normal, 0.34);
  const c11 = pointOnEdge(start, end, normal, 0.4);
  const c12 = pointOnEdge(start, end, normal, 0.42, offset * 0.18);
  const p2 = pointOnEdge(start, end, normal, 0.39, offset * 0.34);
  const c21 = pointOnEdge(start, end, normal, 0.33, offset * 0.78);
  const c22 = pointOnEdge(start, end, normal, 0.42, offset);
  const p3 = pointOnEdge(start, end, normal, 0.5, offset);
  const c31 = pointOnEdge(start, end, normal, 0.58, offset);
  const c32 = pointOnEdge(start, end, normal, 0.67, offset * 0.78);
  const p4 = pointOnEdge(start, end, normal, 0.61, offset * 0.34);
  const c41 = pointOnEdge(start, end, normal, 0.58, offset * 0.18);
  const c42 = pointOnEdge(start, end, normal, 0.6);
  const p5 = pointOnEdge(start, end, normal, 0.66);
  return [
    `L ${formatPoint(p1)}`,
    `C ${formatPoint(c11)} ${formatPoint(c12)} ${formatPoint(p2)}`,
    `C ${formatPoint(c21)} ${formatPoint(c22)} ${formatPoint(p3)}`,
    `C ${formatPoint(c31)} ${formatPoint(c32)} ${formatPoint(p4)}`,
    `C ${formatPoint(c41)} ${formatPoint(c42)} ${formatPoint(p5)}`,
    `L ${formatPoint(end)}`,
  ].join(" ");
}

export function createJigsawPath(targetIndex, pieceCount) {
  const edges = createJigsawEdges(targetIndex, pieceCount);
  const topLeft = [14, 14];
  const topRight = [86, 14];
  const bottomRight = [86, 86];
  const bottomLeft = [14, 86];
  return [
    `M ${formatPoint(topLeft)}`,
    jigsawEdgePath(topLeft, topRight, [0, -1], edges.top),
    jigsawEdgePath(topRight, bottomRight, [1, 0], edges.right),
    jigsawEdgePath(bottomRight, bottomLeft, [0, 1], edges.bottom),
    jigsawEdgePath(bottomLeft, topLeft, [-1, 0], edges.left),
    "Z",
  ].join(" ");
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pieceText(pieces) {
  return pieces.map((piece) => piece.text).join("");
}

export function shufflePuzzlePieces(pieces, random = Math.random) {
  const targetText = pieceText(pieces);
  let shuffled = shuffle(pieces, random);
  if (shuffled.length < 2 || pieceText(shuffled) !== targetText) return shuffled;

  // 随机结果偶尔会保持原序；主动轮转到一个不同次序，避免用户打开后直接得到答案。
  for (let offset = 1; offset < shuffled.length; offset += 1) {
    const rotated = [...shuffled.slice(offset), ...shuffled.slice(0, offset)];
    if (pieceText(rotated) !== targetText) return rotated;
  }
  return shuffled;
}

export function createPuzzleRounds(
  lines,
  { limit = 3, random = Math.random } = {},
) {
  const candidates = shuffle(collectPuzzleLines(lines), random);
  const rounds = [];
  for (const candidate of candidates) {
    const orderedPieces = createPuzzlePieces(candidate.sourceLine);
    if (
      orderedPieces.length < 3 ||
      new Set(orderedPieces.map((piece) => piece.text)).size < 2
    ) {
      continue;
    }
    rounds.push({
      ...candidate,
      layout: createPuzzleLayout(orderedPieces.length),
      pieces: shufflePuzzlePieces(orderedPieces, random),
    });
    if (rounds.length >= limit) break;
  }
  return rounds;
}

export function checkPuzzleOrder(pieces, target) {
  return normalizePuzzleText(pieceText(pieces)) === normalizePuzzleText(target);
}
