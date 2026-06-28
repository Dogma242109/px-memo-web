const CANVAS_WIDTH = 310;
const CANVAS_HEIGHT = 230;
const MAX_HISTORY = 128;

const canvas = document.querySelector("#drawingCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const sizeInput = document.querySelector("#sizeInput");
const sizeOutput = document.querySelector("#sizeOutput");
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

let currentTool = "pen";
let currentColor = "#111111";
let displayScale = Number(zoomSelect.value);
let isDrawing = false;
let lastPoint = null;
let activeFrameIndex = 0;
let playbackTimer = null;
let frames = [createBlankFrame()];

ctx.imageSmoothingEnabled = false;
updateCanvasScale();
loadFrame(0);
renderFrames();
updateHistoryButtons();

toolButtons.forEach((button) => {
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
  button.addEventListener("click", () => {
    currentColor = button.dataset.color;
    colorButtons.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
  });
});

zoomSelect.addEventListener("change", () => {
  displayScale = Number(zoomSelect.value);
  updateCanvasScale();
});

canvas.addEventListener("pointerdown", (event) => {
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
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT);

  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH - 1, x)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT - 1, y)),
  };
}

function drawPoint(point) {
  paintSquareBrush(point.x, point.y);
}

function drawLine(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  if (steps === 0) {
    paintSquareBrush(from.x, from.y);
    return;
  }

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(from.x + (dx * step) / steps);
    const y = Math.round(from.y + (dy * step) / steps);
    paintSquareBrush(x, y);
  }
}

function paintSquareBrush(x, y) {
  const size = Number(sizeInput.value);
  const offset = Math.floor(size / 2);
  const startX = x - offset;
  const startY = y - offset;

  ctx.fillStyle = getDrawColor();
  ctx.fillRect(startX, startY, size, size);
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
