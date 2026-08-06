import qrcode from "./vendor/qrcode-generator/qrcode.mjs";
import { stringToBytes as utf8StringToBytes } from "./vendor/qrcode-generator/qrcode_UTF8.mjs";

const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1440;
const PROJECT_READER_URL = "https://poetries.cn/newtab.html";

export function buildShareQrText(poem = {}) {
  const url = new URL(PROJECT_READER_URL);
  const poemId = String(poem.id ?? "").trim();
  if (poemId) url.searchParams.set("poem", poemId);
  return url.toString();
}

export function createQrMatrix(text) {
  qrcode.stringToBytes = utf8StringToBytes;
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const size = qr.getModuleCount();
  return {
    size,
    isDark: (row, column) => qr.isDark(row, column),
  };
}

export function buildShareFileName(poem) {
  const title = String(poem.title ?? "诗词")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);
  const author = String(poem.author ?? "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 24);
  return `诗意一刻-${title}${author ? `-${author}` : ""}.png`;
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function wrapCanvasText(context, value, maxWidth) {
  const rows = [];
  let current = "";
  for (const character of String(value ?? "")) {
    if (current && context.measureText(current + character).width > maxWidth) {
      rows.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) rows.push(current);
  return rows.length ? rows : [""];
}

function layoutTitle(context, title, fontFamily) {
  let fontSize = title.length > 12 ? 58 : title.length > 8 ? 66 : 78;
  let rows = [];
  do {
    context.font = `500 ${fontSize}px ${fontFamily}`;
    rows = wrapCanvasText(context, title, 860);
    if (rows.length <= 2) break;
    fontSize -= 4;
  } while (fontSize >= 46);

  if (rows.length > 2) {
    rows = rows.slice(0, 2);
    rows[1] = `${rows[1].slice(0, -1)}…`;
  }
  return { fontSize, rows };
}

function layoutPoem(context, lines, fontFamily, maxHeight) {
  for (const fontSize of [44, 40, 36, 32]) {
    const lineHeight = Math.round(fontSize * 1.66);
    context.font = `400 ${fontSize}px ${fontFamily}`;
    const rows = lines.flatMap((line) => wrapCanvasText(context, line, 820));
    if (rows.length * lineHeight <= maxHeight) {
      return { fontSize, lineHeight, rows, excerpt: false };
    }
  }

  const fontSize = 32;
  const lineHeight = 53;
  context.font = `400 ${fontSize}px ${fontFamily}`;
  const allRows = lines.flatMap((line) => wrapCanvasText(context, line, 820));
  const visibleCount = Math.max(2, Math.floor(maxHeight / lineHeight));
  return {
    fontSize,
    lineHeight,
    rows: [...allRows.slice(0, visibleCount - 1), "……"],
    excerpt: true,
  };
}

function drawQrCode(context, qrText, x, y, boxSize) {
  const matrix = createQrMatrix(qrText);
  const quietZone = 4;
  const cellSize = Math.max(
    1,
    Math.floor(boxSize / (matrix.size + quietZone * 2)),
  );
  const renderedSize = cellSize * (matrix.size + quietZone * 2);
  const startX = Math.round(x + (boxSize - renderedSize) / 2);
  const startY = Math.round(y + (boxSize - renderedSize) / 2);

  context.fillStyle = "#ffffff";
  roundedRect(context, x - 14, y - 14, boxSize + 28, boxSize + 28, 18);
  context.fill();
  context.fillStyle = "#171c19";
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (!matrix.isDark(row, column)) continue;
      context.fillRect(
        startX + (column + quietZone) * cellSize,
        startY + (row + quietZone) * cellSize,
        cellSize,
        cellSize,
      );
    }
  }
}

function resolvedColor(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function createSharePoster(canvas, poem, appearance = {}) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("当前环境无法创建诗词图片");

  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;

  const colors = {
    paper: resolvedColor(appearance.paper, "#f4f0e5"),
    paperDeep: resolvedColor(appearance.paperDeep, "#e9e2d2"),
    ink: resolvedColor(appearance.ink, "#202522"),
    inkSoft: resolvedColor(appearance.inkSoft, "#5f665f"),
    line: resolvedColor(appearance.line, "#c9c1af"),
    accent: resolvedColor(appearance.accent, "#9f3f32"),
    moss: resolvedColor(appearance.moss, "#617265"),
  };
  const serif = appearance.serif || '"Songti SC", "STSong", serif';
  const kai = appearance.kai || '"Kaiti SC", "STKaiti", serif';
  const lines = Array.isArray(poem.lines) && poem.lines.length
    ? poem.lines
    : ["诗文暂未展开"];

  context.fillStyle = colors.paper;
  context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  // 纸纹与淡墨圆环均为确定性绘制，保证同一首诗反复导出的图片一致。
  context.save();
  context.globalAlpha = 0.07;
  context.strokeStyle = colors.inkSoft;
  context.lineWidth = 2;
  for (let radius = 170; radius <= 430; radius += 86) {
    context.beginPath();
    context.arc(910, 250, radius, 0, Math.PI * 2);
    context.stroke();
  }
  context.globalAlpha = 0.06;
  context.fillStyle = colors.moss;
  for (let index = 0; index < 34; index += 1) {
    const x = 52 + ((index * 137) % 960);
    const y = 44 + ((index * 211) % 1320);
    context.beginPath();
    context.arc(x, y, index % 3 === 0 ? 2.4 : 1.4, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  context.strokeStyle = colors.line;
  context.lineWidth = 2;
  context.strokeRect(42, 42, POSTER_WIDTH - 84, POSTER_HEIGHT - 84);
  context.strokeStyle = colors.accent;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(92, 116);
  context.lineTo(196, 116);
  context.stroke();

  context.fillStyle = colors.accent;
  context.font = `600 24px ${serif}`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("诗 意 一 刻", 220, 124);
  context.fillStyle = colors.inkSoft;
  context.font = `400 18px ${serif}`;
  context.fillText("一诗一笺 · 与君共赏", 220, 162);

  context.save();
  context.globalAlpha = 0.08;
  context.fillStyle = colors.accent;
  context.font = `400 236px ${kai}`;
  context.textAlign = "right";
  context.fillText(String(poem.title ?? "诗").slice(0, 1), 948, 306);
  context.restore();

  const titleLayout = layoutTitle(context, String(poem.title ?? "无题"), kai);
  context.fillStyle = colors.ink;
  context.font = `500 ${titleLayout.fontSize}px ${kai}`;
  context.textAlign = "center";
  const titleLineHeight = Math.round(titleLayout.fontSize * 1.22);
  titleLayout.rows.forEach((row, index) => {
    context.fillText(row, POSTER_WIDTH / 2, 278 + index * titleLineHeight);
  });

  const authorY = 278 + titleLayout.rows.length * titleLineHeight + 32;
  context.fillStyle = colors.inkSoft;
  context.font = `400 27px ${serif}`;
  context.fillText(
    [poem.dynasty, poem.author].filter(Boolean).join(" · "),
    POSTER_WIDTH / 2,
    authorY,
  );

  const contentTop = authorY + 86;
  const contentBottom = 1040;
  context.fillStyle = colors.moss;
  context.font = `600 17px ${serif}`;
  context.letterSpacing = "5px";
  context.fillText("原 文", POSTER_WIDTH / 2, contentTop - 36);
  context.letterSpacing = "0px";

  const poemLayout = layoutPoem(
    context,
    lines,
    serif,
    contentBottom - contentTop,
  );
  const poemHeight = poemLayout.rows.length * poemLayout.lineHeight;
  const poemStartY =
    contentTop + Math.max(0, (contentBottom - contentTop - poemHeight) / 2);
  context.fillStyle = colors.ink;
  context.font = `400 ${poemLayout.fontSize}px ${serif}`;
  context.textAlign = "center";
  poemLayout.rows.forEach((row, index) => {
    context.fillText(
      row,
      POSTER_WIDTH / 2,
      poemStartY + (index + 1) * poemLayout.lineHeight,
    );
  });

  context.strokeStyle = colors.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(92, 1080);
  context.lineTo(988, 1080);
  context.stroke();

  context.fillStyle = colors.accent;
  roundedRect(context, 94, 1150, 82, 82, 8);
  context.fill();
  context.fillStyle = colors.paper;
  context.font = `600 43px ${kai}`;
  context.textAlign = "center";
  context.fillText("诗", 135, 1208);

  context.fillStyle = colors.ink;
  context.font = `600 35px ${serif}`;
  context.textAlign = "left";
  context.fillText("诗意一刻", 206, 1183);
  context.fillStyle = colors.inkSoft;
  context.font = `400 20px ${serif}`;
  context.fillText("每日一诗 · 逐句精读", 206, 1223);
  context.font = `400 17px ${serif}`;
  context.fillText("扫码直达本篇 · 邂逅更多诗意", 206, 1272);

  const qrText = buildShareQrText(poem);
  drawQrCode(context, qrText, 738, 1124, 220);
  context.fillStyle = colors.inkSoft;
  context.font = `500 17px ${serif}`;
  context.textAlign = "center";
  context.fillText("扫码直达本篇", 848, 1380);

  return { excerpt: poemLayout.excerpt, qrText };
}
