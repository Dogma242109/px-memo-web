const CANVAS_WIDTH = 310;
const CANVAS_HEIGHT = 230;
const MAX_HISTORY = 128;
const PREVIEW_COLOR = "rgba(35, 115, 111, 0.75)";

// DOM references used by the editor.
const canvas = document.querySelector("#drawingCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const onionCanvas = document.querySelector("#onionCanvas");
const onionCtx = onionCanvas.getContext("2d");
const previewCanvas = document.querySelector("#previewCanvas");
const previewCtx = previewCanvas.getContext("2d");

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
const toolboxToggle = document.querySelector("#toolboxToggle");
const toolboxPanel = document.querySelector("#toolboxPanel");
const toolboxTabs = [...document.querySelectorAll(".toolbox-tab")];
const toolboxPages = [...document.querySelectorAll(".toolbox-page")];
const toolboxFrameStrip = document.querySelector("#toolboxFrameStrip");
const duplicateFrameButton = document.querySelector("#duplicateFrameButton");
const copyFrameButton = document.querySelector("#copyFrameButton");
const pasteFrameButton = document.querySelector("#pasteFrameButton");
const deleteFrameButton = document.querySelector("#deleteFrameButton");
const frameActionStatus = document.querySelector("#frameActionStatus");
const shapeModeButton = document.querySelector("#shapeModeButton");
const shapeTypeSelect = document.querySelector("#shapeTypeSelect");
const selectionModeButton = document.querySelector("#selectionModeButton");
const deleteSelectionButton = document.querySelector("#deleteSelectionButton");
const clearSelectionButton = document.querySelector("#clearSelectionButton");
const selectionStatus = document.querySelector("#selectionStatus");
const onionSkinToggle = document.querySelector("#onionSkinToggle");
const onionSkinCountSelect = document.querySelector("#onionSkinCountSelect");
const transformSelectionButton = document.querySelector("#transformSelectionButton");
const transformControls = document.querySelector("#transformControls");
const transformScaleInput = document.querySelector("#transformScaleInput");
const transformRotationSelect = document.querySelector("#transformRotationSelect");
const applyTransformButton = document.querySelector("#applyTransformButton");
const cancelTransformButton = document.querySelector("#cancelTransformButton");

// Current editor state.
let currentTool = "pen";
let currentColor = "#000000";
let displayScale = Number(zoomSelect.value);
let isDrawing = false;
let lastPoint = null;
let activeFrameIndex = 0;
let playbackTimer = null;
let copiedFrameImage = null;
let projectUndoStack = [];
let projectRedoStack = [];
let isShapeMode = false;
let shapeStartPoint = null;
let isSelectionMode = false;
let selectionMask = null;
let lassoPoints = [];
let transformState = null;
let transformDragStart = null;
let frames = [createBlankFrame()];

ctx.imageSmoothingEnabled = false;
onionCtx.imageSmoothingEnabled = false;
previewCtx.imageSmoothingEnabled = false;
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

brushButtons.forEach((button) => {
  button.addEventListener("click", () => {
    brushSelect.value = button.dataset.brush;
    updateOptionButtons(brushButtons, button);
  });
});

patternButtons.forEach((button) => {
  button.addEventListener("click", () => {
    patternSelect.value = button.dataset.pattern;
    updateOptionButtons(patternButtons, button);
  });
});

shapeModeButton.addEventListener("click", () => {
  isShapeMode = !isShapeMode;
  shapeModeButton.classList.toggle("is-active", isShapeMode);
  shapeModeButton.setAttribute("aria-pressed", String(isShapeMode));
  clearPreviewCanvas();
  drawSelectionOverlay();
});

selectionModeButton.addEventListener("click", () => {
  isSelectionMode = !isSelectionMode;
  selectionModeButton.classList.toggle("is-active", isSelectionMode);
  selectionModeButton.setAttribute("aria-pressed", String(isSelectionMode));
  clearPreviewCanvas();
  setSelectionStatus(isSelectionMode ? "選択範囲を作成できます。" : "範囲選択をOFFにしました。");
});

deleteSelectionButton.addEventListener("click", deleteSelection);
clearSelectionButton.addEventListener("click", clearSelection);
transformSelectionButton.addEventListener("click", startTransform);
transformScaleInput.addEventListener("input", updateTransformFromControls);
transformRotationSelect.addEventListener("change", updateTransformFromControls);
applyTransformButton.addEventListener("click", applyTransform);
cancelTransformButton.addEventListener("click", cancelTransform);

onionSkinToggle.addEventListener("change", renderOnionSkin);
onionSkinCountSelect.addEventListener("change", renderOnionSkin);

toolboxToggle.addEventListener("click", () => {
  setToolboxOpen(toolboxPanel.hidden);
});

toolboxTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectToolboxTab(tab.dataset.toolboxTab);
  });
});

zoomSelect.addEventListener("change", () => {
  displayScale = Number(zoomSelect.value);
  updateCanvasScale();
});

canvas.addEventListener("pointerdown", (event) => {
  stopPlayback();
  canvas.setPointerCapture(event.pointerId);
  isDrawing = true;
  lastPoint = getCanvasPoint(event);

  if (transformState) {
    transformDragStart = {
      pointer: lastPoint,
      x: transformState.x,
      y: transformState.y,
    };
    return;
  }

  if (isSelectionMode) {
    shapeStartPoint = lastPoint;
    lassoPoints = [lastPoint];
    if (isShapeMode) {
      drawSelectionShapePreview(shapeStartPoint, lastPoint);
    } else {
      drawLassoPreview(lassoPoints);
    }
    return;
  }

  pushUndoState();

  if (isShapeMode) {
    shapeStartPoint = lastPoint;
    drawShapePreview(shapeStartPoint, lastPoint);
    return;
  }

  drawPoint(lastPoint);
  saveCurrentFrameQuietly();
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDrawing || !lastPoint) {
    return;
  }

  const nextPoint = getCanvasPoint(event);

  if (transformState && transformDragStart) {
    transformState.x = transformDragStart.x + (nextPoint.x - transformDragStart.pointer.x);
    transformState.y = transformDragStart.y + (nextPoint.y - transformDragStart.pointer.y);
    drawTransformPreview();
    lastPoint = nextPoint;
    return;
  }

  if (isSelectionMode) {
    if (isShapeMode && shapeStartPoint) {
      drawSelectionShapePreview(shapeStartPoint, nextPoint);
    } else {
      lassoPoints.push(nextPoint);
      drawLassoPreview(lassoPoints);
    }
    lastPoint = nextPoint;
    return;
  }

  if (isShapeMode && shapeStartPoint) {
    drawShapePreview(shapeStartPoint, nextPoint);
    lastPoint = nextPoint;
    return;
  }

  drawLine(lastPoint, nextPoint);
  lastPoint = nextPoint;
  saveCurrentFrameQuietly();
});

canvas.addEventListener("pointerup", finishDrawing);
canvas.addEventListener("pointercancel", cancelDrawing);
canvas.addEventListener("pointerleave", () => {
  if (isDrawing && !isShapeMode && !isSelectionMode) {
    saveCurrentFrameQuietly();
  }
  clearPreviewCanvas();
  drawSelectionOverlay();
  isDrawing = false;
  lastPoint = null;
  shapeStartPoint = null;
  lassoPoints = [];
  transformDragStart = null;
});

addFrameButton.addEventListener("click", () => {
  cancelTransformBeforeNavigation();
  saveCurrentFrame();
  recordProjectState();
  frames.splice(activeFrameIndex + 1, 0, createBlankFrame());
  loadFrame(activeFrameIndex + 1);
  renderFrames();
});

playButton.addEventListener("click", () => {
  if (playbackTimer) {
    return;
  }

  cancelTransformBeforeNavigation();
  saveCurrentFrame();
  clearOnionSkin();
  playButton.classList.add("is-playing");
  playbackTimer = window.setInterval(() => {
    const nextIndex = (activeFrameIndex + 1) % frames.length;
    loadFrame(nextIndex);
    renderFrames();
  }, 1000 / getFps());
});

stopButton.addEventListener("click", stopPlayback);
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);

clearFrameButton.addEventListener("click", () => {
  stopPlayback();
  pushUndoState();
  fillCanvasWhite();
  saveCurrentFrame();
  updateHistoryButtons();
});

duplicateFrameButton.addEventListener("click", duplicateCurrentFrame);
copyFrameButton.addEventListener("click", copyCurrentFrame);
pasteFrameButton.addEventListener("click", pasteCopiedFrame);
deleteFrameButton.addEventListener("click", deleteCurrentFrame);

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

  if (event.key === "Escape" && !toolboxPanel.hidden) {
    setToolboxOpen(false);
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
    id: createFrameId(),
    image: scratch.toDataURL("image/png"),
    undoStack: [],
    redoStack: [],
  };
}

function createFrameId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `frame-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  paintBrush(point.x, point.y);
}

function drawLine(from, to) {
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

function drawShape(start, end) {
  const shapeType = shapeTypeSelect.value;

  if (shapeType === "line") {
    drawLine(start, end);
    return;
  }

  if (shapeType === "rect") {
    drawRectShape(start, end);
    return;
  }

  drawEllipseShape(start, end);
}

function drawRectShape(start, end) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  drawLine({ x: left, y: top }, { x: right, y: top });
  drawLine({ x: right, y: top }, { x: right, y: bottom });
  drawLine({ x: right, y: bottom }, { x: left, y: bottom });
  drawLine({ x: left, y: bottom }, { x: left, y: top });
}

function drawEllipseShape(start, end) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const width = right - left;
  const height = bottom - top;

  if (width === 0 || height === 0) {
    drawLine(start, end);
    return;
  }

  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const radiusX = width / 2;
  const radiusY = height / 2;
  const steps = Math.max(24, Math.ceil(Math.max(width, height) * 3));
  let previousPoint = null;

  for (let step = 0; step <= steps; step += 1) {
    const angle = (Math.PI * 2 * step) / steps;
    const point = {
      x: Math.round(centerX + Math.cos(angle) * radiusX),
      y: Math.round(centerY + Math.sin(angle) * radiusY),
    };

    if (previousPoint) {
      drawLine(previousPoint, point);
    } else {
      drawPoint(point);
    }

    previousPoint = point;
  }
}

function drawShapePreview(start, end) {
  clearPreviewCanvas();
  previewCtx.save();
  previewCtx.strokeStyle = PREVIEW_COLOR;
  previewCtx.lineWidth = 1;
  previewCtx.setLineDash([4, 3]);

  const shapeType = shapeTypeSelect.value;

  if (shapeType === "line") {
    previewCtx.beginPath();
    previewCtx.moveTo(start.x + 0.5, start.y + 0.5);
    previewCtx.lineTo(end.x + 0.5, end.y + 0.5);
    previewCtx.stroke();
    previewCtx.restore();
    return;
  }

  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  if (shapeType === "rect") {
    previewCtx.strokeRect(left + 0.5, top + 0.5, width, height);
    previewCtx.restore();
    return;
  }

  previewCtx.beginPath();
  previewCtx.ellipse(left + width / 2 + 0.5, top + height / 2 + 0.5, width / 2, height / 2, 0, 0, Math.PI * 2);
  previewCtx.stroke();
  previewCtx.restore();
}

function clearPreviewCanvas() {
  previewCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function renderOnionSkin() {
  clearOnionSkin();

  if (!onionSkinToggle.checked || playbackTimer) {
    return;
  }

  const requestedCount = Number(onionSkinCountSelect.value);
  const onionCount = Number.isFinite(requestedCount) ? requestedCount : 1;
  const frameImages = [];

  for (let offset = onionCount; offset >= 1; offset -= 1) {
    const frameIndex = activeFrameIndex - offset;

    if (frameIndex >= 0) {
      frameImages.push({
        image: frames[frameIndex].image,
        distance: offset,
      });
    }
  }

  frameImages.forEach(({ image, distance }) => {
    const onionImage = new Image();
    onionImage.addEventListener("load", () => {
      if (!onionSkinToggle.checked || playbackTimer) {
        return;
      }

      drawOnionImage(onionImage, getOnionOpacity(distance, onionCount));
    });
    onionImage.src = image;
  });
}

function clearOnionSkin() {
  onionCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawOnionImage(image, opacity) {
  const scratch = document.createElement("canvas");
  scratch.width = CANVAS_WIDTH;
  scratch.height = CANVAS_HEIGHT;
  const scratchCtx = scratch.getContext("2d");
  scratchCtx.drawImage(image, 0, 0);

  const imageData = scratchCtx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const isWhite = red > 245 && green > 245 && blue > 245;

    if (isWhite) {
      pixels[index + 3] = 0;
    } else {
      pixels[index + 3] = Math.round(pixels[index + 3] * opacity);
    }
  }

  scratchCtx.putImageData(imageData, 0, 0);
  onionCtx.drawImage(scratch, 0, 0);
}

function getOnionOpacity(distance, onionCount) {
  const maxOpacity = 0.36;
  const minOpacity = 0.08;

  if (onionCount <= 1) {
    return maxOpacity;
  }

  const normalized = (distance - 1) / (onionCount - 1);
  return maxOpacity - (maxOpacity - minOpacity) * normalized;
}

function drawLassoPreview(points) {
  clearPreviewCanvas();

  if (points.length === 0) {
    return;
  }

  previewCtx.save();
  previewCtx.strokeStyle = PREVIEW_COLOR;
  previewCtx.lineWidth = 1;
  previewCtx.setLineDash([4, 3]);
  previewCtx.beginPath();
  previewCtx.moveTo(points[0].x + 0.5, points[0].y + 0.5);

  for (let index = 1; index < points.length; index += 1) {
    previewCtx.lineTo(points[index].x + 0.5, points[index].y + 0.5);
  }

  previewCtx.stroke();
  previewCtx.restore();
}

function drawSelectionShapePreview(start, end) {
  clearPreviewCanvas();

  if (shapeTypeSelect.value === "line") {
    drawShapePreview(start, end);
    return;
  }

  drawShapePreview(start, end);
}

function finishSelectionGesture() {
  clearPreviewCanvas();

  if (isShapeMode) {
    createShapeSelection(shapeStartPoint, lastPoint);
    return;
  }

  createLassoSelection(lassoPoints);
}

function createLassoSelection(points) {
  if (points.length < 3) {
    clearSelection("選択範囲なし");
    return;
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = CANVAS_WIDTH;
  maskCanvas.height = CANVAS_HEIGHT;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "#fff";
  maskCtx.beginPath();
  maskCtx.moveTo(points[0].x, points[0].y);

  for (let index = 1; index < points.length; index += 1) {
    maskCtx.lineTo(points[index].x, points[index].y);
  }

  maskCtx.closePath();
  maskCtx.fill();
  setSelectionMaskFromCanvas(maskCanvas, "投げ縄で選択しました。");
}

function createShapeSelection(start, end) {
  if (!start || !end || shapeTypeSelect.value === "line") {
    clearSelection("選択範囲なし");
    return;
  }

  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  if (width === 0 || height === 0) {
    clearSelection("選択範囲なし");
    return;
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = CANVAS_WIDTH;
  maskCanvas.height = CANVAS_HEIGHT;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "#fff";

  if (shapeTypeSelect.value === "rect") {
    maskCtx.fillRect(left, top, width + 1, height + 1);
  } else {
    maskCtx.beginPath();
    maskCtx.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    maskCtx.fill();
  }

  setSelectionMaskFromCanvas(maskCanvas, "図形で選択しました。");
}

function setSelectionMaskFromCanvas(maskCanvas, message) {
  const maskCtx = maskCanvas.getContext("2d");
  const alpha = maskCtx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
  const nextMask = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  let selectedPixels = 0;

  for (let index = 0; index < nextMask.length; index += 1) {
    const isSelected = alpha[index * 4 + 3] > 0;
    nextMask[index] = isSelected ? 1 : 0;
    if (isSelected) {
      selectedPixels += 1;
    }
  }

  if (selectedPixels === 0) {
    clearSelection("選択範囲なし");
    return;
  }

  selectionMask = nextMask;
  drawSelectionOverlay();
  updateSelectionButtons();
  setSelectionStatus(message);
}

function drawSelectionOverlay() {
  clearPreviewCanvas();

  if (!selectionMask) {
    return;
  }

  const overlay = previewCtx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);

  for (let index = 0; index < selectionMask.length; index += 1) {
    if (selectionMask[index]) {
      continue;
    }

    const offset = index * 4;
    overlay.data[offset] = 35;
    overlay.data[offset + 1] = 115;
    overlay.data[offset + 2] = 111;
    overlay.data[offset + 3] = 45;
  }

  previewCtx.putImageData(overlay, 0, 0);
}

function isPointInSelection(x, y) {
  if (!selectionMask) {
    return true;
  }

  if (x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) {
    return false;
  }

  return selectionMask[y * CANVAS_WIDTH + x] === 1;
}

function deleteSelection() {
  if (!selectionMask) {
    return;
  }

  stopPlayback();
  pushUndoState();
  ctx.fillStyle = "#ffffff";

  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      if (isPointInSelection(x, y)) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  saveCurrentFrame();
  updateHistoryButtons();
  setSelectionStatus("選択範囲を削除しました。");
}

function clearSelection(message = "選択を解除しました。") {
  selectionMask = null;
  clearPreviewCanvas();
  updateSelectionButtons();
  setSelectionStatus(message);
}

function updateSelectionButtons() {
  const hasSelection = Boolean(selectionMask);
  deleteSelectionButton.disabled = !hasSelection;
  clearSelectionButton.disabled = !hasSelection;
}

function setSelectionStatus(message) {
  selectionStatus.textContent = message;
}

function startTransform() {
  if (transformState) {
    cancelTransform();
    return;
  }

  stopPlayback();
  saveCurrentFrame();
  pushUndoState();

  const targetBounds = getSelectionBounds() ?? {
    left: 0,
    top: 0,
    right: CANVAS_WIDTH - 1,
    bottom: CANVAS_HEIGHT - 1,
  };
  const sourceCanvas = extractTransformSource(targetBounds);

  transformState = {
    sourceCanvas,
    originalImage: frames[activeFrameIndex].image,
    x: targetBounds.left,
    y: targetBounds.top,
    scale: 1,
    rotation: 0,
  };

  clearTransformSource(targetBounds);
  saveCurrentFrameQuietly();
  clearSelection("変形中です。ドラッグで移動できます。");
  transformControls.hidden = false;
  transformSelectionButton.classList.add("is-active");
  transformScaleInput.value = "100";
  transformRotationSelect.value = "0";
  drawTransformPreview();
}

function getSelectionBounds() {
  if (!selectionMask) {
    return null;
  }

  let left = CANVAS_WIDTH;
  let top = CANVAS_HEIGHT;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      if (!isPointInSelection(x, y)) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return { left, top, right, bottom };
}

function extractTransformSource(bounds) {
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d");
  sourceCtx.imageSmoothingEnabled = false;
  const sourceImage = ctx.getImageData(bounds.left, bounds.top, width, height);

  if (selectionMask) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const canvasX = bounds.left + x;
        const canvasY = bounds.top + y;

        if (isPointInSelection(canvasX, canvasY)) {
          continue;
        }

        sourceImage.data[(y * width + x) * 4 + 3] = 0;
      }
    }
  }

  sourceCtx.putImageData(sourceImage, 0, 0);
  return sourceCanvas;
}

function clearTransformSource(bounds) {
  ctx.fillStyle = "#ffffff";

  if (!selectionMask) {
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left + 1, bounds.bottom - bounds.top + 1);
    return;
  }

  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      if (isPointInSelection(x, y)) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function updateTransformFromControls() {
  if (!transformState) {
    return;
  }

  transformState.scale = Number(transformScaleInput.value) / 100;
  transformState.rotation = Number(transformRotationSelect.value);
  drawTransformPreview();
}

function drawTransformPreview() {
  if (!transformState) {
    return;
  }

  clearPreviewCanvas();
  const width = transformState.sourceCanvas.width * transformState.scale;
  const height = transformState.sourceCanvas.height * transformState.scale;

  previewCtx.save();
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.translate(transformState.x + width / 2, transformState.y + height / 2);
  previewCtx.rotate((Math.PI * transformState.rotation) / 180);
  previewCtx.drawImage(transformState.sourceCanvas, -width / 2, -height / 2, width, height);
  previewCtx.restore();
}

function applyTransform() {
  if (!transformState) {
    return;
  }

  drawTransformOnto(ctx);
  saveCurrentFrame();
  finishTransform("変形を確定しました。");
}

function cancelTransform() {
  if (!transformState) {
    return;
  }

  drawImageUrl(transformState.originalImage, () => {
    saveCurrentFrameQuietly();
    finishTransform("変形をキャンセルしました。");
  });
}

function cancelTransformBeforeNavigation() {
  if (!transformState) {
    return;
  }

  const originalImage = transformState.originalImage;
  finishTransform("変形を中断しました。");
  drawImageUrl(originalImage, () => {
    saveCurrentFrameQuietly();
    updateHistoryButtons();
  });
}

function finishTransform(message) {
  transformState = null;
  transformDragStart = null;
  transformControls.hidden = true;
  transformSelectionButton.classList.remove("is-active");
  clearPreviewCanvas();
  updateHistoryButtons();
  setSelectionStatus(message);
}

function drawTransformOnto(targetCtx) {
  const width = transformState.sourceCanvas.width * transformState.scale;
  const height = transformState.sourceCanvas.height * transformState.scale;

  targetCtx.save();
  targetCtx.imageSmoothingEnabled = false;
  targetCtx.translate(transformState.x + width / 2, transformState.y + height / 2);
  targetCtx.rotate((Math.PI * transformState.rotation) / 180);
  targetCtx.drawImage(transformState.sourceCanvas, -width / 2, -height / 2, width, height);
  targetCtx.restore();
}

function paintBrush(x, y) {
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
  ctx.fillStyle = color;

  for (let maskY = 0; maskY < size; maskY += 1) {
    for (let maskX = 0; maskX < size; maskX += 1) {
      const canvasX = startX + maskX;
      const canvasY = startY + maskY;

      if (isInsideShape(maskX, maskY) && shouldPaintPattern(pattern, canvasX, canvasY) && isPointInSelection(canvasX, canvasY)) {
        ctx.fillRect(canvasX, canvasY, 1, 1);
      }
    }
  }
}

function shouldPaintPattern(pattern, x, y) {
  // Patterns are based on canvas coordinates, so repeated strokes keep the same phase.
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
  const scaledWidth = `${CANVAS_WIDTH * displayScale}px`;
  onionCanvas.style.width = scaledWidth;
  canvas.style.width = scaledWidth;
  previewCanvas.style.width = scaledWidth;
  canvas.parentElement.style.width = scaledWidth;
  statusText.textContent = `${CANVAS_WIDTH} x ${CANVAS_HEIGHT} / ${displayScale}x`;
}

function finishDrawing() {
  if (isDrawing && transformState) {
    isDrawing = false;
    lastPoint = null;
    transformDragStart = null;
    return;
  }

  if (isDrawing && isSelectionMode) {
    finishSelectionGesture();
    isDrawing = false;
    lastPoint = null;
    shapeStartPoint = null;
    lassoPoints = [];
    return;
  }

  if (isDrawing && isShapeMode && shapeStartPoint && lastPoint) {
    clearPreviewCanvas();
    drawShape(shapeStartPoint, lastPoint);
    saveCurrentFrame();
    drawSelectionOverlay();
  }

  if (isDrawing) {
    saveCurrentFrame();
  }

  isDrawing = false;
  lastPoint = null;
  shapeStartPoint = null;
}

function cancelDrawing() {
  if (!transformState) {
    clearPreviewCanvas();
    drawSelectionOverlay();
  }
  isDrawing = false;
  lastPoint = null;
  shapeStartPoint = null;
  lassoPoints = [];
  transformDragStart = null;
}

function saveCurrentFrame() {
  frames[activeFrameIndex].image = canvas.toDataURL("image/png");
  updateActiveThumb();
  renderOnionSkin();
}

function saveCurrentFrameQuietly() {
  frames[activeFrameIndex].image = canvas.toDataURL("image/png");
  updateActiveThumb();
}

function loadFrame(index) {
  activeFrameIndex = index;
  const image = new Image();
  image.addEventListener("load", () => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(image, 0, 0);
    renderOnionSkin();
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
  projectRedoStack = [];
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
  drawSelectionOverlay();
  updateHistoryButtons();
}

function undo() {
  stopPlayback();

  if (frames[activeFrameIndex].undoStack.length > 0) {
    restoreHistory("undo");
    return;
  }

  restoreProjectHistory("undo");
}

function redo() {
  stopPlayback();

  if (projectRedoStack.length > 0) {
    restoreProjectHistory("redo");
    return;
  }

  if (frames[activeFrameIndex].redoStack.length > 0) {
    restoreHistory("redo");
    return;
  }
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
  undoButton.disabled = frame.undoStack.length === 0 && projectUndoStack.length === 0;
  redoButton.disabled = frame.redoStack.length === 0 && projectRedoStack.length === 0;
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
      cancelTransformBeforeNavigation();
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

  renderToolboxFrameStrip();
  updateFrameActionButtons();
}

function renderToolboxFrameStrip() {
  toolboxFrameStrip.replaceChildren();

  frames.forEach((frame, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbox-frame-item";
    button.classList.toggle("is-active", index === activeFrameIndex);
    button.addEventListener("click", () => {
      stopPlayback();
      cancelTransformBeforeNavigation();
      saveCurrentFrame();
      loadFrame(index);
      renderFrames();
    });

    const thumb = document.createElement("img");
    thumb.className = "toolbox-frame-thumb";
    thumb.src = frame.image;
    thumb.alt = "";

    const label = document.createElement("span");
    label.className = "toolbox-frame-number";
    label.textContent = `${index + 1}`;

    button.append(thumb, label);
    toolboxFrameStrip.append(button);
  });
}

function updateActiveThumb() {
  const activeThumb = framesList.children[activeFrameIndex]?.querySelector(".frame-thumb");
  if (activeThumb) {
    activeThumb.src = frames[activeFrameIndex].image;
  }

  const activeToolboxThumb = toolboxFrameStrip.children[activeFrameIndex]?.querySelector(".toolbox-frame-thumb");
  if (activeToolboxThumb) {
    activeToolboxThumb.src = frames[activeFrameIndex].image;
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
  renderOnionSkin();
}

function recordProjectState() {
  projectUndoStack.push(createProjectSnapshot());

  if (projectUndoStack.length > MAX_HISTORY) {
    projectUndoStack.shift();
  }

  projectRedoStack = [];
  updateHistoryButtons();
}

function createProjectSnapshot() {
  return {
    activeFrameIndex,
    copiedFrameImage,
    frames: frames.map((frame) => ({
      id: frame.id,
      image: frame.image,
      undoStack: [...frame.undoStack],
      redoStack: [...frame.redoStack],
    })),
  };
}

function restoreProjectHistory(direction) {
  const fromStack = direction === "undo" ? projectUndoStack : projectRedoStack;
  const toStack = direction === "undo" ? projectRedoStack : projectUndoStack;

  if (fromStack.length === 0) {
    return;
  }

  toStack.push(createProjectSnapshot());
  const snapshot = fromStack.pop();
  restoreProjectSnapshot(snapshot);
}

function restoreProjectSnapshot(snapshot) {
  frames = snapshot.frames.map((frame) => ({
    id: frame.id,
    image: frame.image,
    undoStack: [...frame.undoStack],
    redoStack: [...frame.redoStack],
  }));
  copiedFrameImage = snapshot.copiedFrameImage;
  activeFrameIndex = Math.min(snapshot.activeFrameIndex, frames.length - 1);
  loadFrame(activeFrameIndex);
  renderFrames();
  updateHistoryButtons();
}

function duplicateCurrentFrame() {
  stopPlayback();
  cancelTransformBeforeNavigation();
  saveCurrentFrame();
  recordProjectState();

  const sourceFrame = frames[activeFrameIndex];
  const duplicatedFrame = createFrameFromImage(sourceFrame.image);
  frames.splice(activeFrameIndex + 1, 0, duplicatedFrame);
  loadFrame(activeFrameIndex + 1);
  renderFrames();
  setFrameActionStatus("現在のフレームを複製しました。");
}

function copyCurrentFrame() {
  cancelTransformBeforeNavigation();
  saveCurrentFrame();
  copiedFrameImage = frames[activeFrameIndex].image;
  updateFrameActionButtons();
  setFrameActionStatus("現在のフレームをコピーしました。");
}

function pasteCopiedFrame() {
  if (!copiedFrameImage) {
    return;
  }

  stopPlayback();
  cancelTransformBeforeNavigation();
  saveCurrentFrame();
  recordProjectState();
  frames[activeFrameIndex].image = copiedFrameImage;
  drawImageUrl(copiedFrameImage, () => {
    updateActiveThumb();
    updateHistoryButtons();
  });
  setFrameActionStatus("コピーしたフレームを貼り付けました。");
}

function deleteCurrentFrame() {
  stopPlayback();
  cancelTransformBeforeNavigation();
  saveCurrentFrame();
  recordProjectState();

  if (frames.length === 1) {
    fillCanvasWhite();
    saveCurrentFrame();
    updateHistoryButtons();
    setFrameActionStatus("最後の1枚なので、フレームを白紙にしました。");
    return;
  }

  frames.splice(activeFrameIndex, 1);
  const nextIndex = Math.min(activeFrameIndex, frames.length - 1);
  loadFrame(nextIndex);
  renderFrames();
  setFrameActionStatus("現在のフレームを削除しました。");
}

function createFrameFromImage(image) {
  return {
    id: createFrameId(),
    image,
    undoStack: [],
    redoStack: [],
  };
}

function updateFrameActionButtons() {
  pasteFrameButton.disabled = !copiedFrameImage;
  deleteFrameButton.disabled = frames.length === 0;
}

function setFrameActionStatus(message) {
  frameActionStatus.textContent = message;
}

function setToolboxOpen(isOpen) {
  toolboxPanel.hidden = !isOpen;
  toolboxPanel.classList.toggle("is-open", isOpen);
  toolboxToggle.classList.toggle("is-open", isOpen);
  toolboxToggle.setAttribute("aria-expanded", String(isOpen));
  toolboxToggle.setAttribute("aria-label", isOpen ? "道具箱を閉じる" : "道具箱を開く");
}

function selectToolboxTab(tabName) {
  toolboxTabs.forEach((tab) => {
    const isActive = tab.dataset.toolboxTab === tabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  toolboxPages.forEach((page) => {
    const isActive = page.dataset.toolboxPage === tabName;
    page.classList.toggle("is-active", isActive);
    page.hidden = !isActive;
  });
}
