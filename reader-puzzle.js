import {
  checkPuzzleOrder,
  createJigsawPath,
  createPuzzleRounds,
  movePuzzlePieceToSlot,
  resolvePuzzleShapeIndex,
} from "./poem-puzzle.js";
import { PUZZLE_PIECE_COLORS } from "./reader-config.js";
import { loadStylesheetOnce } from "./reader-resource-loader.js";

export function createPuzzleController({
  elements,
  getCurrentPoem,
  isBusy,
  clearAutoNextTimer,
  scheduleAutoNext,
  updateNotice,
  setLocalizedText,
  setLocalizedAttribute,
  revealWebInstallPrompt,
  makeElement,
}) {
  let puzzle = null;

  function currentPuzzleRound() {
    return puzzle?.rounds[puzzle.roundIndex] ?? null;
  }

  function puzzlePieceById(round, pieceId) {
    return round.pieces.find((piece) => piece.id === pieceId) ?? null;
  }

  function createPuzzleShape(targetIndex, pieceCount, className) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add(className);
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const shapePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shapePath.setAttribute("d", createJigsawPath(targetIndex, pieceCount));
    svg.append(shapePath);
    return svg;
  }

  function createPuzzleDragGhost(button, clientX, clientY) {
    const rect = button.getBoundingClientRect();
    const ghost = button.cloneNode(true);
    ghost.classList.add("puzzle-drag-ghost");
    ghost.removeAttribute("aria-pressed");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${clientX}px`;
    ghost.style.top = `${clientY}px`;
    document.body.append(ghost);
    return ghost;
  }

  function enablePuzzlePieceDrag(button, piece, zone, slotIndex) {
    button.addEventListener("pointerdown", (event) => {
      if (
        !puzzle ||
        puzzle.answered ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) return;

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      let ghost = null;
      let dropSlot = null;

      const setDropSlot = (nextSlot) => {
        if (dropSlot === nextSlot) return;
        delete dropSlot?.dataset.dropTarget;
        dropSlot = nextSlot;
        if (dropSlot) dropSlot.dataset.dropTarget = "true";
      };

      const moveGhost = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 7) return;
        if (!dragging) {
          dragging = true;
          button.dataset.dragging = "true";
          document.body.dataset.puzzleDragging = "true";
          ghost = createPuzzleDragGhost(button, moveEvent.clientX, moveEvent.clientY);
        }
        moveEvent.preventDefault();
        ghost.style.left = `${moveEvent.clientX}px`;
        ghost.style.top = `${moveEvent.clientY}px`;
        const hitTarget = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const nextSlot = hitTarget instanceof Element ? hitTarget.closest(".puzzle-slot") : null;
        setDropSlot(nextSlot && elements.puzzleAnswer.contains(nextSlot) ? nextSlot : null);
      };

      const finishDrag = (finishEvent) => {
        if (finishEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", moveGhost);
        window.removeEventListener("pointerup", finishDrag);
        window.removeEventListener("pointercancel", finishDrag);
        delete document.body.dataset.puzzleDragging;
        delete button.dataset.dragging;
        ghost?.remove();
        const targetSlotIndex = Number(dropSlot?.dataset.slotIndex);
        setDropSlot(null);
        if (!dragging || finishEvent.type === "pointercancel") return;

        button.dataset.suppressClick = "true";
        finishEvent.preventDefault();
        if (!puzzle || puzzle.answered || !Number.isInteger(targetSlotIndex)) return;
        puzzle.placedPieceIds = movePuzzlePieceToSlot(
          puzzle.placedPieceIds,
          piece.id,
          targetSlotIndex,
          zone === "answer" ? slotIndex : null,
        );
        puzzle.activePieceId = null;
        renderPuzzleRound({ fallbackToCheck: true });
      };

      // 在窗口级继续追踪指针，避免手指或鼠标越过原按钮边缘后丢失松手事件。
      window.addEventListener("pointermove", moveGhost, { passive: false });
      window.addEventListener("pointerup", finishDrag);
      window.addEventListener("pointercancel", finishDrag);
    });
  }

  function createPuzzlePieceButton(piece, zone, pieceCount, slotIndex = null) {
    const button = makeElement("button", "puzzle-piece");
    const shapeIndex = resolvePuzzleShapeIndex(piece.targetIndex, zone === "answer" ? slotIndex : null);
    button.type = "button";
    button.dataset.puzzlePieceId = piece.id;
    button.dataset.zone = zone;
    button.dataset.targetIndex = String(piece.targetIndex);
    button.style.setProperty(
      "--puzzle-piece-color",
      PUZZLE_PIECE_COLORS[piece.targetIndex % PUZZLE_PIECE_COLORS.length],
    );
    button.disabled = Boolean(puzzle?.answered);
    button.append(
      createPuzzleShape(shapeIndex, pieceCount, "puzzle-piece-shape"),
      makeElement("span", "puzzle-piece-text", piece.text),
    );
    setLocalizedAttribute(
      button,
      "aria-label",
      zone === "answer"
        ? `拼图板第 ${slotIndex + 1} 位是“${piece.text}”，点按取回拼片`
        : `${puzzle?.activePieceId === piece.id ? "已选中" : "选择"}拼片“${piece.text}”`,
    );
    button.setAttribute("aria-pressed", String(zone === "bank" && puzzle?.activePieceId === piece.id));
    enablePuzzlePieceDrag(button, piece, zone, slotIndex);
    button.addEventListener("click", () => {
      if (button.dataset.suppressClick === "true") {
        delete button.dataset.suppressClick;
        return;
      }
      if (!puzzle || puzzle.answered) return;
      if (zone === "answer") {
        puzzle.placedPieceIds[slotIndex] = null;
        puzzle.activePieceId = piece.id;
        renderPuzzleRound({ focusPieceId: piece.id, focusZone: "bank" });
        return;
      }
      puzzle.activePieceId = puzzle.activePieceId === piece.id ? null : piece.id;
      renderPuzzleRound(
        puzzle.activePieceId
          ? { focusZone: "answer", focusEmptySlot: true }
          : { focusPieceId: piece.id, focusZone: "bank" },
      );
    });
    return button;
  }

  function createPuzzleSlot(round, slotIndex, piece) {
    const slot = makeElement("div", "puzzle-slot");
    slot.dataset.slotIndex = String(slotIndex);
    slot.dataset.filled = String(Boolean(piece));
    slot.append(createPuzzleShape(slotIndex, round.pieces.length, "puzzle-slot-guide"));
    if (piece) {
      slot.append(createPuzzlePieceButton(piece, "answer", round.pieces.length, slotIndex));
      return slot;
    }

    const button = makeElement("button", "puzzle-slot-action");
    button.type = "button";
    button.dataset.puzzleSlotIndex = String(slotIndex);
    button.disabled = Boolean(puzzle?.answered);
    setLocalizedAttribute(
      button,
      "aria-label",
      puzzle?.activePieceId
        ? `把已选拼片放入第 ${slotIndex + 1} 个空位`
        : `第 ${slotIndex + 1} 个空位，先从下方选择一块拼片`,
    );
    button.addEventListener("click", () => {
      if (!puzzle || puzzle.answered || !puzzle.activePieceId) return;
      puzzle.placedPieceIds = movePuzzlePieceToSlot(
        puzzle.placedPieceIds,
        puzzle.activePieceId,
        slotIndex,
      );
      puzzle.activePieceId = null;
      renderPuzzleRound({ focusZone: "bank", fallbackToCheck: true });
    });
    slot.append(button);
    return slot;
  }

  function focusPuzzleTarget({ focusPieceId, focusZone, focusEmptySlot, fallbackToCheck } = {}) {
    const containers = { answer: elements.puzzleAnswer, bank: elements.puzzleBank };
    const container = containers[focusZone];
    const target = container && !focusEmptySlot
      ? [...container.querySelectorAll("[data-puzzle-piece-id]")].find(
          (button) => !focusPieceId || button.dataset.puzzlePieceId === focusPieceId,
        )
      : null;
    if (focusEmptySlot) {
      elements.puzzleAnswer
        .querySelector("[data-puzzle-slot-index]:not(:disabled)")
        ?.focus({ preventScroll: true });
    } else if (target) {
      target.focus({ preventScroll: true });
    } else if (fallbackToCheck && !elements.puzzleCheck.disabled) {
      elements.puzzleCheck.focus({ preventScroll: true });
    }
  }

  function renderPuzzleRound(focusOptions = {}) {
    const round = currentPuzzleRound();
    if (!puzzle || !round) return;

    const total = puzzle.rounds.length;
    const completed = puzzle.roundIndex + (puzzle.answered ? 1 : 0);
    setLocalizedText(elements.puzzleStep, `第 ${puzzle.roundIndex + 1} / ${total} 题`);
    elements.puzzleProgressTrack.setAttribute("aria-valuemax", String(total));
    elements.puzzleProgressTrack.setAttribute("aria-valuenow", String(completed));
    elements.puzzleProgressFill.style.width = `${(completed / total) * 100}%`;

    const placedPieces = puzzle.placedPieceIds.map((pieceId) =>
      pieceId ? puzzlePieceById(round, pieceId) : null,
    );
    const placedIds = new Set(puzzle.placedPieceIds.filter(Boolean));
    const availablePieces = round.pieces.filter((piece) => !placedIds.has(piece.id));
    elements.puzzleAnswer.style.setProperty("--puzzle-columns", String(round.layout.columns));
    elements.puzzleAnswer.style.setProperty("--puzzle-rows", String(round.layout.rows));
    elements.puzzleAnswer.dataset.correct = puzzle.answered ? String(puzzle.roundCorrect) : "";
    elements.puzzleAnswerEmpty.hidden = placedIds.size > 0;
    elements.puzzleAnswer.replaceChildren(
      ...placedPieces.map((piece, slotIndex) => createPuzzleSlot(round, slotIndex, piece)),
      elements.puzzleAnswerEmpty,
    );
    elements.puzzleBank.replaceChildren(
      ...availablePieces.map((piece) => createPuzzlePieceButton(piece, "bank", round.pieces.length)),
    );
    setLocalizedText(elements.puzzleRemaining, `${availablePieces.length} 块`);

    elements.puzzleReset.disabled = puzzle.answered || !placedIds.size;
    elements.puzzleCheck.disabled = puzzle.answered || placedIds.size !== round.pieces.length;
    elements.puzzleCheck.hidden = puzzle.answered;
    elements.puzzleNext.hidden = !puzzle.answered;
    setLocalizedText(elements.puzzleNext, puzzle.roundIndex + 1 === total ? "查看结果" : "下一题");
    elements.puzzleResult.hidden = !puzzle.answered;
    if (puzzle.answered) {
      elements.puzzleResult.dataset.correct = String(puzzle.roundCorrect);
      setLocalizedText(elements.puzzleResultTitle, puzzle.roundCorrect ? "拼对了" : "次序还差一点");
      setLocalizedText(elements.puzzleResultAnswer, `原句：${round.sourceLine}`);
    } else {
      elements.puzzleResult.dataset.correct = "";
    }
    queueMicrotask(() => focusPuzzleTarget(focusOptions));
  }

  function beginPuzzleGame(poem) {
    const rounds = createPuzzleRounds(poem?.lines, { limit: 3 });
    if (!rounds.length) {
      updateNotice("这篇原文暂时没有适合拼图的完整诗句");
      return false;
    }
    puzzle = {
      poem,
      rounds,
      roundIndex: 0,
      correct: 0,
      answered: false,
      roundCorrect: null,
      activePieceId: null,
      placedPieceIds: Array(rounds[0].pieces.length).fill(null),
    };
    elements.puzzlePractice.hidden = false;
    elements.puzzleComplete.hidden = true;
    setLocalizedText(elements.puzzleDialogTitle, `拼出《${poem.title}》`);
    setLocalizedText(
      elements.puzzleDialogMeta,
      `${poem.dynasty} · ${poem.author} · 本局 ${rounds.length} 题；拼成后核对完整原句。`,
    );
    renderPuzzleRound({ focusZone: "bank" });
    return true;
  }

  async function open() {
    const poem = getCurrentPoem();
    if (!poem || isBusy()) return;
    clearAutoNextTimer();
    // 拼图控制器和近 700 行领域样式只在用户主动开始游戏后进入页面。
    await loadStylesheetOnce("reader-puzzle.css", "puzzle-dialog");
    if (!beginPuzzleGame(poem)) {
      scheduleAutoNext();
      return;
    }
    if (!elements.puzzleDialog.open) elements.puzzleDialog.showModal();
    queueMicrotask(() => focusPuzzleTarget({ focusZone: "bank" }));
  }

  function resetPuzzleRound() {
    if (!puzzle || puzzle.answered) return;
    puzzle.activePieceId = null;
    puzzle.placedPieceIds = Array(currentPuzzleRound().pieces.length).fill(null);
    renderPuzzleRound({ focusZone: "bank" });
  }

  function checkPuzzleAnswer() {
    const round = currentPuzzleRound();
    if (!puzzle || !round || puzzle.answered) return;
    const placedPieces = puzzle.placedPieceIds
      .map((pieceId) => puzzlePieceById(round, pieceId))
      .filter(Boolean);
    if (placedPieces.length !== round.pieces.length) return;
    const correct = checkPuzzleOrder(placedPieces, round.target);
    if (correct) puzzle.correct += 1;
    puzzle.answered = true;
    puzzle.roundCorrect = correct;
    renderPuzzleRound();
    queueMicrotask(() => elements.puzzleNext.focus({ preventScroll: true }));
  }

  function finishPuzzleGame() {
    if (!puzzle) return;
    const total = puzzle.rounds.length;
    elements.puzzlePractice.hidden = true;
    elements.puzzleComplete.hidden = false;
    setLocalizedText(elements.puzzleScore, `本局拼对 ${puzzle.correct} / ${total} 题`);
    setLocalizedText(
      elements.puzzleCompleteNote,
      puzzle.correct === total
        ? "一字不差，原句次序已经稳稳落在心里。"
        : puzzle.correct
          ? "已经找回大半次序，再玩一局会更熟。"
          : "刚刚见过的原句，正适合趁热再拼一次。",
    );
    revealWebInstallPrompt();
    elements.puzzleReplay.focus({ preventScroll: true });
  }

  function advancePuzzleGame() {
    if (!puzzle?.answered) return;
    if (puzzle.roundIndex + 1 >= puzzle.rounds.length) {
      finishPuzzleGame();
      return;
    }
    puzzle.roundIndex += 1;
    puzzle.answered = false;
    puzzle.roundCorrect = null;
    puzzle.activePieceId = null;
    puzzle.placedPieceIds = Array(currentPuzzleRound().pieces.length).fill(null);
    renderPuzzleRound({ focusZone: "bank" });
  }

  function replayPuzzleGame() {
    const poem = puzzle?.poem;
    if (poem) beginPuzzleGame(poem);
  }

  elements.puzzleDialogClose.addEventListener("click", () => elements.puzzleDialog.close());
  elements.puzzleDialog.addEventListener("click", (event) => {
    if (event.target === elements.puzzleDialog) elements.puzzleDialog.close();
  });
  elements.puzzleDialog.addEventListener("close", () => {
    puzzle = null;
    scheduleAutoNext();
    if (!elements.puzzleAction.disabled) elements.puzzleAction.focus({ preventScroll: true });
  });
  elements.puzzleReset.addEventListener("click", resetPuzzleRound);
  elements.puzzleCheck.addEventListener("click", checkPuzzleAnswer);
  elements.puzzleNext.addEventListener("click", advancePuzzleGame);
  elements.puzzleReplay.addEventListener("click", replayPuzzleGame);
  elements.puzzleFinish.addEventListener("click", () => elements.puzzleDialog.close());

  return { open };
}
