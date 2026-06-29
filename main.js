const CANVAS_WIDTH = 310;
const CANVAS_HEIGHT = 230;
const MAX_HISTORY = 128;

// 画面上の操作部品を取得する。
const canvas = document.querySelector("#drawingCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const sizeInput = document.querySelector("#sizeInput");
const sizeOutput = document.querySelector("#sizeOutput");
const brushSelect = document.querySelector("#brushSelect");
const patternSelect = document.querySelector("#patternSelect");
const zoomSelect = document.querySelector("#zoomSelect");
const speedSelect = document.querySelector("#speedSelect");
const framesList = document.querySelector("#framesList");
const addFrameButton = document.querySelector("#addFrameButton");
const playButton = document.querySelector("#playButton");
const stopButton = document.querySelector("#stopButton");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const clearFrameButton = document.querySelector("#clearFrameButton");
const statusText = document.querySelector("#statusText");
const toolButtons = [...document.querySelectorAll(".tool-button")];
const colorButtons = [...document.querySelectorAll(".color-swatch")];
const brushButtons = [...document.querySelectorAll(".brush-option")];
const patternButtons = [...document.querySelectorAll(".pattern-option")];

// アプリ全体の現在状態。
let currentTool = "pen";
let currentColor = "#000000";
let displayScale = Number(zoomSelect.value);
let isDrawing = false;
let lastPoint = null;
let activeFrameIndex = 0;
let playbackTimer = null;
let frames = [createBlankFrame()];

// Canvas API側でも拡大縮小時にぼけないようにしておく。
ctx.imageSmoothingEnabled = false;
updateCanvasScale();
loadFrame(0);
renderFrames();
updateHistoryButtons();

toolButtons.forEach((button) => {
  // ペン/消しゴムの切り替え。
  button.addEventListener("click", () => {
    currentTool = button.dataset.tool;
    toolButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
  });
});

sizeInput.addEventListener("input", () => {
  sizeOutput.textContent = sizeInput.value;
});

colorButtons.forEach((button) => {
  // 6色パレットの切り替え。
  button.addEventListener("click", () => {
    currentColor = button.dataset.color;
    colorButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
  });
});

brushButtons.forEach((button) => {
  // ペン先は見た目ボタンで選び、内部的には隠しselectの値に反映する。
  button.addEventListener("click", () => {
    brushSelect.value = button.dataset.brush;
    updateOptionButtons(brushButtons, button);
  });
});

patternButtons.forEach((button) => {
  // 模様もペン先と同じく、見た目ボタンから隠しselectへ反映する。
  button.addEventListener("click", () => {
    patternSelect.value = button.dataset.pattern;
    updateOptionButtons(patternButtons, button);
  });
});

zoomSelect.addEventListener("change", () => {
  displayScale = Number(zoomSelect.value);
  updateCanvasScale();
});

canvas.addEventListener("pointerdown", (event) => {
  // 描き始める直前の状態をUndo履歴に積む。
  stopPlayback();
  pushUndoState();
  canvas.setPointerCapture(event.pointerId);
  isDrawing = true;
  lastPoint = getCanvasPoint(event);
  drawPoint(lastPoint);
  saveCurrentFrame();
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDrawing || !lastPoint) {
    return;
  }

  const nextPoint = getCanvasPoint(event);
  drawLine(lastPoint, nextPoint);
  lastPoint = nextPoint;
  saveCurrentFrame();
});

canvas.addEventListener("pointerup", endDrawing);
canvas.addEventListener("pointercancel", endDrawing);
canvas.addEventListener("pointerleave", () => {
  if (isDrawing) {
    saveCurrentFrame();
  }
  isDrawing = false;
  lastPoint = null;
});

addFrameButton.addEventListener("click", () => {
  saveCurrentFrame();
  frames.splice(activeFrameIndex + 1, 0, createBlankFrame());
  loadFrame(activeFrameIndex + 1);
  renderFrames();
});

playButton.addEventListener("click", () => {
  if (playbackTimer) {
    return;
  }

  saveCurrentFrame();
  playButton.classList.add("is-playing");
  playbackTimer = window.setInterval(() => {
    const nextIndex = (activeFrameIndex + 1) % frames.length;
    loadFrame(nextIndex);
    renderFrames();
  }, 1000 / getFps());
});

stopButton.addEventListener("click", stopPlayback);

undoButton.addEventListener("click", () => {
  undo();
});

redoButton.addEventListener("click", () => {
  redo();
});

clearFrameButton.addEventListener("click", () => {
  stopPlayback();
  pushUndoState();
  fillCanvasWhite();
  saveCurrentFrame();
  updateHistoryButtons();
});

speedSelect.addEventListener("change", () => {
  if (playbackTimer) {
    stopPlayback();
    playButton.click();
  }
});

document.addEventListener("keydown", (event) => {
  // 入力欄ではブラウザ標準のCtrl+Zを優先する。
  if (isEditableTarget(event.target)) {
    return;
  }

  const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
  const isRedoShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z";

  if (isUndoShortcut) {
    event.preventDefault();
    undo();
  }

  if (isRedoShortcut) {
    event.preventDefault();
    redo();
  }
});

function createBlankFrame() {
  // 新しいフレームは白紙キャンバスの画像として作る。
  const scratch = document.createElement("canvas");
  scratch.width = CANVAS_WIDTH;
  scratch.height = CANVAS_HEIGHT;
  const scratchCtx = scratch.getContext("2d");
  scratchCtx.fillStyle = "#ffffff";
  scratchCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  return {
    id: crypto.randomUUID(),
    image: scratch.toDataURL("image/png"),
    undoStack: [],
    redoStack: [],
  };
}

function fillCanvasWhite() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function getCanvasPoint(event) {
  // CSSで拡大表示しているので、画面座標を内部310x230座標へ変換する。
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT);

  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH - 1, x)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT - 1, y)),
  };
}

function drawPoint(point) {
  paintBrush(point.x, point.y);
}

function drawLine(from, to) {
  // ポインタ移動の間を整数座標で埋めて、線が途切れないようにする。
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  if (steps === 0) {
    paintBrush(from.x, from.y);
    return;
  }

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(from.x + (dx * step) / steps);
    const y = Math.round(from.y + (dy * step) / steps);
    paintBrush(x, y);
  }
}

function paintBrush(x, y) {
  // ペン先形状と模様を組み合わせて、1点ぶんのブラシを描く。
  const size = Number(sizeInput.value);
  const color = getDrawColor();
  const brush = brushSelect.value;
  const pattern = patternSelect.value;

  if (brush === "square") {
    paintSquareMask(x, y, size, color, pattern);
    return;
  }

  if (brush === "plus") {
    paintPlusMask(x, y, size, color, pattern);
    return;
  }

  paintRoundMask(x, y, size, color, pattern);
}

function paintSquareMask(x, y, size, color, pattern) {
  const offset = Math.floor(size / 2);
  const startX = x - offset;
  const startY = y - offset;

  paintMaskPixels(startX, startY, size, color, pattern, () => true);
}

function paintPlusMask(x, y, size, color, pattern) {
  const radius = Math.floor(size / 2);
  const arm = Math.max(1, Math.ceil(size / 3));
  const startX = x - radius;
  const startY = y - radius;
  const armOffset = Math.floor(arm / 2);

  paintMaskPixels(startX, startY, size, color, pattern, (maskX, maskY) => {
    const isHorizontalArm = Math.abs(maskY - radius) <= armOffset;
    const isVerticalArm = Math.abs(maskX - radius) <= armOffset;
    return isHorizontalArm || isVerticalArm;
  });
}

function paintRoundMask(x, y, size, color, pattern) {
  if (size === 1) {
    paintSquareMask(x, y, size, color, pattern);
    return;
  }

  const radius = Math.floor(size / 2);
  const startX = x - radius;
  const startY = y - radius;
  const centerOffset = (size - 1) / 2;
  const radiusSquared = (size / 2 - 0.15) ** 2;

  paintMaskPixels(startX, startY, size, color, pattern, (maskX, maskY) => {
    const dx = maskX - centerOffset;
    const dy = maskY - centerOffset;
    return dx * dx + dy * dy <= radiusSquared;
  });
}

function paintMaskPixels(startX, startY, size, color, pattern, isInsideShape) {
  // ペン先形状の中で、さらに模様パターンが塗る場所だけ1pxずつ描画する。
  ctx.fillStyle = color;

  for (let maskY = 0; maskY < size; maskY += 1) {
    for (let maskX = 0; maskX < size; maskX += 1) {
      const canvasX = startX + maskX;
      const canvasY = startY + maskY;

      if (isInsideShape(maskX, maskY) && shouldPaintPattern(pattern, canvasX, canvasY)) {
        ctx.fillRect(canvasX, canvasY, 1, 1);
      }
    }
  }
}

function shouldPaintPattern(pattern, x, y) {
  // 模様はペン位置ではなくキャンバス絶対座標で決める。
  // こうすると同じ場所をなぞっても点々や市松の位相がズレない。
  const normalizedX = positiveModulo(x, 2);
  const normalizedY = positiveModulo(y, 2);

  if (pattern === "solid") {
    return true;
  }

  if (pattern === "dots") {
    return normalizedX === 0 && normalizedY === 0;
  }

  if (pattern === "checker") {
    return positiveModulo(x + y, 2) === 0;
  }

  if (pattern === "vertical") {
    return normalizedX === 0;
  }

  if (pattern === "horizontal") {
    return normalizedY === 0;
  }

  if (pattern === "diagonal") {
    return positiveModulo(x + y, 4) === 0 || positiveModulo(x - y, 4) === 0;
  }

  if (pattern === "mesh") {
    return normalizedX === 0 || normalizedY === 0;
  }

  if (pattern === "blackChecker") {
    return normalizedX === 1 || normalizedY === 1;
  }

  if (pattern === "holes") {
    return !(positiveModulo(x, 3) === 2 && positiveModulo(y, 3) === 2);
  }

  return true;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function updateOptionButtons(buttons, activeButton) {
  buttons.forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getDrawColor() {
  return currentTool === "eraser" ? "#ffffff" : currentColor;
}

function updateCanvasScale() {
  canvas.style.width = `${CANVAS_WIDTH * displayScale}px`;
  statusText.textContent = `${CANVAS_WIDTH} x ${CANVAS_HEIGHT} / ${displayScale}x`;
}

function endDrawing() {
  if (isDrawing) {
    saveCurrentFrame();
  }

  isDrawing = false;
  lastPoint = null;
}

function saveCurrentFrame() {
  frames[activeFrameIndex].image = canvas.toDataURL("image/png");
  updateActiveThumb();
}

function loadFrame(index) {
  activeFrameIndex = index;
  const image = new Image();
  image.addEventListener("load", () => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(image, 0, 0);
    updateHistoryButtons();
  });
  image.src = frames[index].image;
}

function pushUndoState() {
  // 現在フレームごとにUndo/Redo履歴を持つ。
  const frame = frames[activeFrameIndex];
  frame.undoStack.push(canvas.toDataURL("image/png"));

  if (frame.undoStack.length > MAX_HISTORY) {
    frame.undoStack.shift();
  }

  frame.redoStack = [];
  updateHistoryButtons();
}

function restoreHistory(direction) {
  const frame = frames[activeFrameIndex];
  const fromStack = direction === "undo" ? frame.undoStack : frame.redoStack;
  const toStack = direction === "undo" ? frame.redoStack : frame.undoStack;

  if (fromStack.length === 0) {
    return;
  }

  toStack.push(canvas.toDataURL("image/png"));
  const image = fromStack.pop();
  frame.image = image;
  drawImageUrl(image, updateActiveThumb);
  updateHistoryButtons();
}

function undo() {
  stopPlayback();
  restoreHistory("undo");
}

function redo() {
  stopPlayback();
  restoreHistory("redo");
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.matches("input, textarea, select") || target.isContentEditable;
}

function drawImageUrl(imageUrl, afterLoad) {
  const image = new Image();
  image.addEventListener("load", () => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(image, 0, 0);
    afterLoad?.();
  });
  image.src = imageUrl;
}

function updateHistoryButtons() {
  const frame = frames[activeFrameIndex];
  undoButton.disabled = frame.undoStack.length === 0;
  redoButton.disabled = frame.redoStack.length === 0;
}

function renderFrames() {
  // フレーム一覧を現在のframes配列から作り直す。
  framesList.replaceChildren();

  frames.forEach((frame, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "frame-item";
    button.classList.toggle("is-active", index === activeFrameIndex);
    button.addEventListener("click", () => {
      stopPlayback();
      saveCurrentFrame();
      loadFrame(index);
      renderFrames();
    });

    const thumb = document.createElement("img");
    thumb.className = "frame-thumb";
    thumb.src = frame.image;
    thumb.alt = "";

    const label = document.createElement("span");
    label.className = "frame-label";
    label.textContent = `${index + 1}枚目`;

    button.append(thumb, label);
    framesList.append(button);
  });
}

function updateActiveThumb() {
  const activeThumb = framesList.children[activeFrameIndex]?.querySelector(".frame-thumb");
  if (activeThumb) {
    activeThumb.src = frames[activeFrameIndex].image;
  }
}

function getFps() {
  const fps = Number(speedSelect.value);
  return Number.isFinite(fps) ? fps : 8;
}

function stopPlayback() {
  if (!playbackTimer) {
    return;
  }

  window.clearInterval(playbackTimer);
  playbackTimer = null;
  playButton.classList.remove("is-playing");
}
