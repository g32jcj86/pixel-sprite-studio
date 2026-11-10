import "./style.css";
import { mountColorPanel, updateColorSelection } from "./palette";
import type { Project } from "./types";
import {
  openImportDialog,
  openResizeDialog,
  openPaletteDialog,
  openAlignmentDialog,
} from "./assets";
import { openExportDialog } from "./export-ui";
import { bindEditorInteractions } from "./interaction";

const root = document.querySelector<HTMLDivElement>("#app")!;
function createBlankProject(size = 32): Project {
  return {
    name: "未命名作品",
    width: size,
    height: size,
    pivot: { x: size / 2, y: size - 1 },
    palette: [
      "#263238",
      "#546e7a",
      "#90a4ae",
      "#eceff1",
      "#6d4c41",
      "#a1887f",
      "#ef5350",
      "#ff8a65",
      "#ffa726",
      "#ffca28",
      "#d4e157",
      "#9ccc65",
      "#66bb6a",
      "#26a69a",
      "#42a5f5",
      "#ab47bc",
    ],
    actions: [
      {
        name: "動作 1",
        fps: 8,
        loop: true,
        frames: [{ pixels: Array(size * size).fill("") }],
      },
    ],
  };
}
let project = createBlankProject();
let hasActiveProject = false,
  iPreviewFrame = 0;
let iAction = 0,
  iFrame = 0,
  iZoom = Math.max(
    3,
    Math.min(
      14,
      Math.floor(
        (window.innerHeight - (window.innerHeight < 650 ? 270 : 390)) /
          project.height,
      ),
    ),
  ),
  strTool = "pencil",
  strColor = "#4b7863";
let isGrid = true,
  isOnion = false,
  isPlaying = true,
  isDrawing = false,
  isSpace = false,
  hasSpaceMoved = false;
let iBrush = 1,
  iPlayback = 0,
  iSaveTimer = 0;
let lastPoint: { x: number; y: number } | null = null;
let history: string[] = [],
  future: string[] = [];
let db: IDBDatabase;
const pointers = new Map<number, { x: number; y: number }>();
let pinch: {
  distance: number;
  zoom: number;
  x: number;
  y: number;
  panX: number;
  panY: number;
} | null = null;
let iPanX = 0,
  iPanY = 0,
  isOriginalPreview = false,
  isDarkTransparency = false;
let referenceOpacity = 0.35;
let isHomePending = false;
function createProjectId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (iByte) =>
    iByte.toString(16).padStart(2, "0"),
  ).join("");
}
let touchPixels: string[] | null = null;
const icons: Record<string, string> = {
  pencil:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L5 15z"/></svg>',
  eraser:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 4 7 7a2 2 0 0 1 0 3l-6 6H8l-5-5a2 2 0 0 1 0-3l7-8a2 2 0 0 1 3 0ZM7 8l10 10M13 20h8"/></svg>',
  fill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 3 10 10-7 7-8-8 7-7M3 11h12M20 13s-3 4-3 6a3 3 0 0 0 6 0c0-2-3-6-3-6Z"/></svg>',
  picker:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 3 6 6M17 7l-1-1-11 11-1 4 4-1L19 9l-1-1 3-3a2 2 0 0 0-3-3l-3 3"/></svg>',
  move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/></svg>',
};
const TRASH_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
const PAPER_LOGO =
  '<svg viewBox="0 0 36 42" aria-hidden="true"><path d="M3 2h22l9 9v29H3z" fill="white" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M25 2v10h9" fill="#ff6200" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M10 20h4v4h-4zm12 0h4v4h-4zM8 25h4v4H8zm16 0h4v4h-4zM12 29h4v4h-4zm4 3h4v4h-4zm4-3h4v4h-4z" fill="#ff6200"/></svg>';
const UPLOAD_ART =
  '<svg viewBox="0 0 150 90" aria-hidden="true"><rect x="42" y="5" width="66" height="53" rx="3"/><circle cx="90" cy="20" r="5"/><path d="m43 49 19-19 18 19 10-9 17 17M75 66v18m-8-8 8 8 8-8"/><path class="accent-stroke" d="M75 66v18m-8-8 8 8 8-8"/></svg>';
const DRAW_ART =
  '<svg viewBox="0 0 150 90" aria-hidden="true"><path d="M30 8h72v72H30z"/><path class="grid-stroke" d="M48 8v72M66 8v72M84 8v72M30 26h72M30 44h72M30 62h72"/><path class="pencil-fill" d="m104 20 12 7-27 45-15 8 1-17z"/><path d="m104 20 12 7-27 45-15 8 1-17zM75 63l14 9M99 28l12 7M78 68l5 3"/></svg>';
const escape = (strValue: string) =>
  strValue.replace(
    /[&<>"']/g,
    (strCharacter) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        strCharacter
      ]!,
  );
function toast(strText: string) {
  const node = document.querySelector("#toast")!;
  node.textContent = strText;
  node.classList.add("visible");
  setTimeout(() => node.classList.remove("visible"), 2600);
}
function checkpoint() {
  history.push(JSON.stringify(project));
  if (history.length > 80) history.shift();
  future = [];
}
function changed() {
  renderCanvases();
  renderTimeline();
  window.clearTimeout(iSaveTimer);
  document.querySelector("#save-status")!.textContent = "儲存中…";
  iSaveTimer = window.setTimeout(() => saveProject(), 500);
}
function applyProject(next: Project) {
  if (project.id !== next.id) {
    history = [];
    future = [];
  } else checkpoint();
  hasActiveProject = true;
  project = next;
  iAction = 0;
  iFrame = 0;
  render();
  fitCanvas();
  changed();
}
function applyCurrentProject(next: Project) {
  hasActiveProject = true;
  const hasResized =
    next.width !== project.width || next.height !== project.height;
  checkpoint();
  project = next;
  iAction = Math.min(iAction, project.actions.length - 1);
  iFrame = Math.min(iFrame, action().frames.length - 1);
  render();
  if (hasResized) fitCanvas();
  changed();
}
function action() {
  return project.actions[iAction];
}
function frame() {
  return action().frames[iFrame];
}
function undo(isRedo = false) {
  const source = isRedo ? future : history,
    target = isRedo ? history : future;
  if (!source.length) return;
  target.push(JSON.stringify(project));
  project = JSON.parse(source.pop()!);
  iAction = Math.min(iAction, project.actions.length - 1);
  iFrame = Math.min(iFrame, action().frames.length - 1);
  render();
  changed();
}
function paintCanvas(canvas: HTMLCanvasElement, pixels: string[], iScale = 1) {
  canvas.width = project.width * iScale;
  canvas.height = project.height * iScale;
  const context = canvas.getContext("2d")!;
  pixels.forEach((strPixel, i) => {
    if (strPixel) {
      context.fillStyle = strPixel;
      context.fillRect(
        (i % project.width) * iScale,
        Math.floor(i / project.width) * iScale,
        iScale,
        iScale,
      );
    }
  });
}
function render() {
  document.body.classList.remove("home-open");
  root.innerHTML = `<div class="orientation-gate"><div class="rotate-icon">▯ ↻</div><h2>請將裝置轉為橫向</h2><p>請將手機或平板轉為橫向，<br>讓畫布與工具擁有足夠空間。</p><span>我的點陣圖</span></div>
    <header><a class="brand" href="#"><span class="brand-icon">${PAPER_LOGO}</span><span>我的點陣圖</span></a><div class="project-heading"><input id="project-name" aria-label="專案名稱" value="${escape(project.name)}"><span id="save-status">● 已自動儲存於此裝置</span></div><div class="header-actions"><button id="gallery">▦ <span>首頁</span></button><button class="primary" id="export">↓ 預覽與下載</button></div></header>
    <main><aside class="left-panel"><div class="section-label">繪圖工具 </div><div class="tools">${Object.entries(
      icons,
    )
      .map(
        ([strKey, strIcon]) =>
          `<button data-tool="${strKey}" class="tool ${strTool === strKey ? "active" : ""}" title="${({ pencil: "鉛筆 B", eraser: "橡皮擦 E", fill: "油漆桶 G", picker: "滴管 I", move: "平移 H" } as Record<string, string>)[strKey]}"><b>${strIcon}</b><span>${({ pencil: "鉛筆", eraser: "橡皮擦", fill: "填色", picker: "滴管", move: "平移" } as Record<string, string>)[strKey]}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="brush-row"><label for="brush">筆刷大小</label><select id="brush"><option value="1">1 px</option><option value="2">2 px</option><option value="3">3 px</option></select></div><div id="color-panel"></div><div class="left-bottom"><span>⌘ Z 復原</span><span>B 鉛筆 · E 橡皮擦</span><span>Space ＋ 拖曳平移</span><button id="help">⌨ 快捷鍵與操作說明</button></div></aside>
    <section class="workspace"><div class="canvas-toolbar"><div class="canvas-title"><span class="status-dot"></span><strong>${escape(action().name)}</strong><span class="muted">/ 第 ${iFrame + 1} 格</span></div><div class="canvas-controls"><button id="undo" title="復原 Ctrl+Z">↶</button><button id="redo" title="重做 Ctrl+Shift+Z">↷</button><i></i><button id="grid" class="${isGrid ? "toggle-on" : ""}" title="切換格線">▦</button><button id="onion" class="${isOnion ? "toggle-on" : ""}" title="洋蔥皮：顯示前一格">◉</button><i></i><button id="zoom-out" title="縮小">−</button><button id="zoom-reset" class="zoom-value">${Math.round(iZoom * 100)}%</button><button id="zoom-in" title="放大">＋</button></div></div><div id="canvas-area"><div class="canvas-caption">${project.width} × ${project.height} px · 透明背景</div><div id="canvas-holder"><canvas id="reference-canvas"></canvas><canvas id="onion-canvas"></canvas><canvas id="drawing-canvas" aria-label="像素繪圖畫布"></canvas><div id="grid-overlay"></div><div id="pivot-marker" title="對齊基準點">＋</div></div><div class="canvas-tip">${icons[strTool]} ${({ pencil: "鉛筆工具", eraser: "橡皮擦工具", fill: "填色工具", picker: "滴管工具", move: "平移工具" } as Record<string, string>)[strTool]}<span>滾輪縮放 · 雙指縮放</span></div></div><div class="timeline"><div class="timeline-heading"><div><strong>時間軸</strong><span id="frame-count">${action().frames.length} 格</span></div><div class="timeline-actions"><button id="duplicate-frame" title="複製目前影格">▣ 複製</button><button id="delete-frame" title="刪除目前影格">⌫</button><button id="add-frame" class="soft-button">＋ 新增影格</button></div></div><div class="timeline-bottom"><button id="play" class="play-button" aria-label="播放動畫">${isPlaying ? "Ⅱ" : "▶"}</button><div id="frames"></div><div class="timeline-fps"><label for="fps">速度</label><div><input id="fps" type="number" min="1" max="30" value="${action().fps}"><span>FPS</span></div></div></div></div></section>
    <aside class="right-panel"><div class="section-label">動畫預覽 </div><div class="preview-box"><canvas id="preview-canvas"></canvas><span>${isPlaying ? "播放中" : "即時預覽"}</span></div><div class="preview-options"><label><input id="loop" type="checkbox" ${action().loop ? "checked" : ""}> 匯出循環</label><span>1× 原始比例</span></div><div class="divider"></div><div class="section-label">動作列表 <button id="add-action" title="新增動作">＋</button></div><div class="action-list">${project.actions.map((item, i) => `<button data-action="${i}" class="action-item ${i === iAction ? "selected" : ""}"><span class="action-symbol">${i === 0 ? "↔" : "◇"}</span><span><strong>${escape(item.name)}</strong><small>${item.frames.length} 格影格 · ${item.fps} FPS</small></span><span class="action-arrow">${i === iAction ? "●" : "›"}</span></button>`).join("")}</div><div class="action-management"><button id="rename-action">重新命名</button><button id="delete-action">刪除動作</button></div><div class="divider"></div><div class="section-label">畫布設定</div><div class="setting-row"><span>畫布尺寸</span><button id="resize">${project.width} × ${project.height} ↗</button></div><div class="setting-row"><span>對齊基準</span><button id="alignment">${project.pivot.x}, ${project.pivot.y} ⌖</button></div><div class="setting-row"><span>背景</span><span class="muted">透明</span></div><button id="templates" class="template-card"><span>＋</span><strong>新增空白作品</strong></button><button id="versions" class="version-link">◷ 版本紀錄與快照</button></aside></main><footer><span><i class="status-dot"></i> 自動儲存於此瀏覽器</span><span>${project.width} × ${project.height} px <b>·</b> ${project.actions.length} 個動作 <b>·</b> ${action().frames.length} 格影格</span></footer><div id="toast" role="status"></div><dialog id="modal"></dialog>`;
  mountColorPanel(
    document.querySelector<HTMLElement>("#color-panel")!,
    strColor,
    project.palette,
    selectColor,
    () => openPaletteDialog(project, applyCurrentProject),
  );
  bind();
  bindEditorInteractions();
  positionTimeline();
  if (isPlaying) play();
  renderCanvases();
  renderTimeline();
  const previewDock = document.createElement("section");
  previewDock.className = "preview-dock";
  const rightPanel = document.querySelector(".right-panel")!;
  previewDock.append(...Array.from(rightPanel.children).slice(0, 3));
  rightPanel.prepend(previewDock);
  const addAction = document.querySelector<HTMLButtonElement>("#add-action")!;
  addAction.textContent = "＋ 新增動作";
  document.querySelector(".action-list")!.after(addAction);
  const toolbarResize = document.createElement("button");
  toolbarResize.className = "canvas-size";
  toolbarResize.textContent = `${project.width} × ${project.height} ⌄`;
  toolbarResize.setAttribute("aria-label", "調整畫布尺寸");
  toolbarResize.onclick = () => openResizeDialog(project, applyCurrentProject);
  document.querySelector(".canvas-controls")!.before(toolbarResize);
  const headerHelp = document.createElement("button");
  headerHelp.className = "header-help";
  headerHelp.textContent = "？";
  headerHelp.setAttribute("aria-label", "操作說明");
  headerHelp.onclick = () =>
    (document.querySelector("#help") as HTMLButtonElement).click();
  document.querySelector(".header-actions")!.prepend(headerHelp);
  const timelineActions = document.querySelector(".timeline-actions")!;
  const rotateButton = document.createElement("button");
  rotateButton.className = "primary";
  rotateButton.textContent = "嘗試切換為橫向";
  rotateButton.onclick = async () => {
    try {
      await document.documentElement.requestFullscreen();
      await (
        screen.orientation as ScreenOrientation & {
          lock: (orientation: string) => Promise<void>;
        }
      ).lock("landscape");
    } catch {
      rotateButton.textContent = "請手動旋轉裝置並關閉直向鎖定";
    }
  };
  document.querySelector(".orientation-gate")!.append(rotateButton);
  const previewToggle = document.createElement("button");
  previewToggle.id = "preview-size";
  previewToggle.textContent = isOriginalPreview ? "1× 原始比例" : "放大預覽";
  previewToggle.onclick = () => {
    isOriginalPreview = !isOriginalPreview;
    render();
  };
  document.querySelector(".preview-options>span")!.replaceWith(previewToggle);
  const background = document.createElement("button");
  background.textContent = isDarkTransparency ? "深色棋盤 ▧" : "淺色棋盤 ▧";
  background.onclick = () => {
    isDarkTransparency = !isDarkTransparency;
    render();
  };
  document
    .querySelector(".setting-row:last-of-type .muted")
    ?.replaceWith(background);
  document
    .querySelector("#canvas-holder")!
    .classList.toggle("dark-transparency", isDarkTransparency);
  const baseline = document.createElement("div");
  baseline.className = "ground-baseline";
  baseline.style.top = `${(project.pivot.y / project.height) * 100}%`;
  baseline.title = "角色腳底基準線";
  document.querySelector("#canvas-holder")!.append(baseline);
  const opacity = document.createElement("label");
  opacity.className = "reference-opacity";
  opacity.innerHTML = `參考圖透明度 <input type="range" min="0" max="100" value="${Math.round(referenceOpacity * 100)}" aria-label="參考圖透明度"><span>${Math.round(referenceOpacity * 100)}%</span>`;
  opacity.querySelector("input")!.oninput = (event) => {
    referenceOpacity = Number((event.target as HTMLInputElement).value) / 100;
    opacity.querySelector("span")!.textContent =
      `${Math.round(referenceOpacity * 100)}%`;
    renderCanvases();
  };
  document.querySelector("#templates")!.before(opacity);
  const more = document.createElement("button");
  more.textContent = "⋯";
  more.title = "影格操作與位移";
  more.onclick = frameMenu;
  timelineActions.prepend(more);
  const actions = document.querySelector(".action-management")!;
  const duplicate = document.createElement("button");
  duplicate.textContent = "複製";
  duplicate.onclick = () =>
    textDialog("複製動作", "新動作名稱", `${action().name} 副本`, (strName) => {
      checkpoint();
      const copy = structuredClone(action());
      copy.name = strName;
      project.actions.splice(iAction + 1, 0, copy);
      iAction++;
      iFrame = 0;
      render();
      changed();
    });
  actions.insertBefore(duplicate, actions.lastElementChild);
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button, i) => {
      button.draggable = true;
      button.title = "點選切換動作，拖曳可排序";
      button.ondragstart = (event) =>
        event.dataTransfer!.setData("application/action", String(i));
      button.ondragover = (event) => event.preventDefault();
      button.ondrop = (event) => {
        event.preventDefault();
        const strSource = event.dataTransfer!.getData("application/action");
        if (!strSource) return;
        const iFrom = Number(strSource);
        checkpoint();
        const [item] = project.actions.splice(iFrom, 1);
        project.actions.splice(i, 0, item);
        iAction = i;
        iFrame = 0;
        render();
        changed();
      };
    });
}
function renderCanvases() {
  const holder = document.querySelector<HTMLDivElement>("#canvas-holder")!;
  holder.style.width = `${project.width * iZoom}px`;
  holder.style.height = `${project.height * iZoom}px`;
  holder.style.transform = `translate(${iPanX}px, ${iPanY}px)`;
  paintCanvas(document.querySelector("#drawing-canvas")!, frame().pixels);
  paintCanvas(
    document.querySelector("#reference-canvas")!,
    frame().reference || [],
  );
  document.querySelector<HTMLCanvasElement>(
    "#reference-canvas",
  )!.style.opacity = String(referenceOpacity);
  const onion = document.querySelector<HTMLCanvasElement>("#onion-canvas")!;
  const onionPixels = Array(project.width * project.height).fill("");
  if (isOnion)
    [iFrame - 1, iFrame + 1].forEach((iNeighbor) => {
      if (action().frames[iNeighbor])
        action().frames[iNeighbor].pixels.forEach((strPixel, i) => {
          if (strPixel)
            onionPixels[i] = iNeighbor < iFrame ? "#a9bb86" : "#c2a2a0";
        });
    });
  paintCanvas(onion, onionPixels);
  const grid = document.querySelector<HTMLDivElement>("#grid-overlay")!;
  grid.style.backgroundSize = `${iZoom}px ${iZoom}px`;
  grid.style.display = isGrid && iZoom >= 7 ? "block" : "none";
  const pivot = document.querySelector<HTMLDivElement>("#pivot-marker")!;
  pivot.style.left = `${(project.pivot.x / project.width) * 100}%`;
  pivot.style.top = `${(project.pivot.y / project.height) * 100}%`;
  renderPreview();
  const preview = document.querySelector<HTMLCanvasElement>("#preview-canvas")!;
  preview.classList.toggle("original-size", isOriginalPreview);
  const previewScale = isOriginalPreview
    ? 1
    : Math.max(
        50,
        Math.min(
          document.querySelector(".preview-box")!.clientWidth - 32,
          document.querySelector(".preview-box")!.clientHeight - 36,
        ),
      ) / Math.max(project.width, project.height);
  preview.style.width = `${project.width * previewScale}px`;
  preview.style.height = `${project.height * previewScale}px`;
  document.querySelector(".zoom-value")!.textContent =
    `${Math.round(iZoom * 100)}%`;
}
function renderTimeline() {
  const frames = document.querySelector("#frames")!;
  frames.innerHTML = action()
    .frames.map(
      (_, i) =>
        `<button class="frame ${i === iFrame ? "selected" : ""}" data-frame="${i}" draggable="true" title="選擇影格 ${i + 1}；拖曳可排序"><span>${String(i + 1).padStart(2, "0")}</span><canvas></canvas><i>${i === iFrame ? "●" : "·"}</i></button>`,
    )
    .join("");
  frames.querySelectorAll<HTMLButtonElement>(".frame").forEach((button, i) => {
    paintCanvas(button.querySelector("canvas")!, action().frames[i].pixels);
    button.onclick = () => {
      iFrame = i;
      render();
    };
    button.ondragstart = (event) =>
      event.dataTransfer!.setData("text/plain", String(i));
    button.ondragover = (event) => event.preventDefault();
    button.ondrop = (event) => {
      event.preventDefault();
      const iFrom = Number(event.dataTransfer!.getData("text/plain"));
      if (
        !Number.isInteger(iFrom) ||
        iFrom < 0 ||
        iFrom >= action().frames.length
      )
        return;
      checkpoint();
      const [item] = action().frames.splice(iFrom, 1);
      action().frames.splice(i, 0, item);
      iFrame = i;
      render();
      changed();
    };
  });
}
function point(event: PointerEvent) {
  const bounds = document
    .querySelector("#drawing-canvas")!
    .getBoundingClientRect();
  return {
    x: Math.floor(
      ((event.clientX - bounds.left) / bounds.width) * project.width,
    ),
    y: Math.floor(
      ((event.clientY - bounds.top) / bounds.height) * project.height,
    ),
  };
}
function drawPoint(iX: number, iY: number) {
  for (let y = 0; y < iBrush; y++)
    for (let x = 0; x < iBrush; x++) {
      const iColumn = iX + x,
        iRow = iY + y;
      if (
        iColumn >= 0 &&
        iColumn < project.width &&
        iRow >= 0 &&
        iRow < project.height
      )
        frame().pixels[iRow * project.width + iColumn] =
          strTool === "eraser" ? "" : strColor;
    }
}
function stroke(next: { x: number; y: number }) {
  const previous = lastPoint || next,
    iSteps = Math.max(
      Math.abs(next.x - previous.x),
      Math.abs(next.y - previous.y),
      1,
    );
  for (let i = 0; i <= iSteps; i++)
    drawPoint(
      Math.round(previous.x + ((next.x - previous.x) * i) / iSteps),
      Math.round(previous.y + ((next.y - previous.y) * i) / iSteps),
    );
  lastPoint = next;
  renderCanvases();
}
function fill(iX: number, iY: number) {
  const iStart = iY * project.width + iX,
    strOld = frame().pixels[iStart];
  if (strOld === strColor) return;
  const pending = [iStart];
  frame().pixels[iStart] = strColor;
  while (pending.length) {
    const i = pending.pop()!,
      iColumn = i % project.width;
    const neighbors = [
      i - project.width,
      i + project.width,
      ...(iColumn ? [i - 1] : []),
      ...(iColumn < project.width - 1 ? [i + 1] : []),
    ];
    neighbors.forEach((iNeighbor) => {
      if (
        iNeighbor >= 0 &&
        iNeighbor < frame().pixels.length &&
        frame().pixels[iNeighbor] === strOld
      ) {
        frame().pixels[iNeighbor] = strColor;
        pending.push(iNeighbor);
      }
    });
  }
}
function selectColor(strNext: string) {
  strColor = strNext;
  updateColorSelection(strColor);
}
function setTool(strNext: string) {
  strTool = strNext;
  render();
}
function zoom(iNext: number) {
  iZoom = Math.max(1, Math.min(40, iNext));
  renderCanvases();
}
function bind() {
  const click = (strId: string, handler: () => void) =>
    document.getElementById(strId)!.addEventListener("click", handler);
  document
    .querySelectorAll<HTMLButtonElement>("[data-tool]")
    .forEach(
      (button) => (button.onclick = () => setTool(button.dataset.tool!)),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-color]")
    .forEach(
      (button) => (button.onclick = () => selectColor(button.dataset.color!)),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(
    (button) =>
      (button.onclick = () => {
        iAction = Number(button.dataset.action);
        iFrame = 0;
        render();
      }),
  );
  (document.querySelector("#brush") as HTMLSelectElement).value =
    String(iBrush);
  document.querySelector("#brush")!.addEventListener("change", (event) => {
    iBrush = Number((event.target as HTMLSelectElement).value);
  });
  document
    .querySelector("#color")!
    .addEventListener("input", (event) =>
      selectColor((event.target as HTMLInputElement).value),
    );
  document
    .querySelector("#project-name")!
    .addEventListener("change", (event) => {
      checkpoint();
      project.name =
        (event.target as HTMLInputElement).value.trim().slice(0, 80) ||
        "未命名作品";
      changed();
    });
  document.querySelector("#fps")!.addEventListener("change", (event) => {
    checkpoint();
    action().fps = Math.max(
      1,
      Math.min(30, Number((event.target as HTMLInputElement).value) || 8),
    );
    changed();
    if (isPlaying) {
      play();
    }
  });
  document.querySelector("#loop")!.addEventListener("change", (event) => {
    checkpoint();
    action().loop = (event.target as HTMLInputElement).checked;
    changed();
  });
  click("undo", () => undo());
  click("redo", () => undo(true));
  click("grid", () => {
    isGrid = !isGrid;
    render();
  });
  click("onion", () => {
    isOnion = !isOnion;
    render();
  });
  click("zoom-in", () => zoom(iZoom + 2));
  click("zoom-out", () => zoom(iZoom - 2));
  click("zoom-reset", () => {
    iPanX = iPanY = 0;
    zoom(1);
  });
  click("add-frame", () => {
    checkpoint();
    action().frames.splice(iFrame + 1, 0, {
      pixels: Array(project.width * project.height).fill(""),
    });
    iFrame++;
    render();
    changed();
  });
  click("duplicate-frame", () => {
    checkpoint();
    action().frames.splice(iFrame + 1, 0, structuredClone(frame()));
    iFrame++;
    render();
    changed();
  });
  click("delete-frame", () => {
    if (action().frames.length === 1) return toast("至少需要保留一格影格");
    checkpoint();
    action().frames.splice(iFrame, 1);
    iFrame = Math.max(0, iFrame - 1);
    render();
    changed();
  });
  click("play", () => (isPlaying ? stopPlayback() : play()));
  click("add-action", () =>
    textDialog("新增動作", "動作名稱", "待機", (strName) => {
      checkpoint();
      project.actions.push({
        name: strName,
        fps: 8,
        loop: true,
        frames: [{ pixels: Array(project.width * project.height).fill("") }],
      });
      iAction = project.actions.length - 1;
      iFrame = 0;
      render();
      changed();
    }),
  );
  click("rename-action", () =>
    textDialog("重新命名動作", "動作名稱", action().name, (strName) => {
      checkpoint();
      action().name = strName;
      render();
      changed();
    }),
  );
  click("delete-action", () => {
    if (project.actions.length === 1) return toast("至少需要保留一個動作");
    confirmDialog(
      "刪除此動作？",
      "此動作的所有影格將移除。你仍可使用復原還原。",
      () => {
        checkpoint();
        project.actions.splice(iAction, 1);
        iAction = 0;
        iFrame = 0;
        render();
        changed();
      },
    );
  });

  click("resize", () => openResizeDialog(project, applyCurrentProject));

  click("alignment", () =>
    openAlignmentDialog(project, applyCurrentProject, iAction),
  );
  click("export", exportMenu);
  click("templates", templates);
  click("gallery", gallery);
  click("versions", versions);
  click("help", () =>
    modal(
      "快捷鍵與操作說明",
      '<div class="help-grid"><p><b>B / E / G / I / H</b><br>鉛筆 / 橡皮擦 / 填色 / 滴管 / 平移</p><p><b>Ctrl 或 ⌘ + Z</b><br>復原；加 Shift 重做</p><p><b>Space</b><br>播放 / 暫停；按住拖曳平移</p><p><b>滾輪 / 雙指</b><br>縮放畫布，拖曳影格可調整順序</p><p><b>參考圖</b><br>匯入 PNG 作為底圖，描繪自己的角色</p><p><b>自動儲存</b><br>儲存於目前瀏覽器，請匯出專案備份</p></div>',
    ),
  );
  document.querySelector(".brand")!.addEventListener("click", (event) => {
    event.preventDefault();
    gallery();
  });
  const area = document.querySelector<HTMLDivElement>("#canvas-area")!;
  area.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(iZoom + (event.deltaY > 0 ? -1 : 1));
    },
    { passive: false },
  );
  area.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    area.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      if (touchPixels) {
        frame().pixels = touchPixels;
        touchPixels = null;
        history.pop();
        renderCanvases();
      }
      const values = [...pointers.values()];
      pinch = {
        distance: Math.hypot(
          values[0].x - values[1].x,
          values[0].y - values[1].y,
        ),
        zoom: iZoom,
        x: (values[0].x + values[1].x) / 2,
        y: (values[0].y + values[1].y) / 2,
        panX: iPanX,
        panY: iPanY,
      };
      isDrawing = false;
      return;
    }
    if (strTool === "move" || isSpace) {
      lastPoint = { x: event.clientX, y: event.clientY };
      return;
    }
    const position = point(event);
    if (
      position.x < 0 ||
      position.y < 0 ||
      position.x >= project.width ||
      position.y >= project.height
    )
      return;
    if (strTool === "picker") {
      const strPicked = frame().pixels[position.y * project.width + position.x];
      if (strPicked) selectColor(strPicked);
      return;
    }
    if (event.pointerType === "touch") touchPixels = [...frame().pixels];
    checkpoint();
    if (strTool === "fill") {
      fill(position.x, position.y);
      changed();
      return;
    }
    isDrawing = true;
    lastPoint = null;
    stroke(position);
  });
  area.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size === 2) {
      const values = [...pointers.values()];
      iPanX = pinch.panX + (values[0].x + values[1].x) / 2 - pinch.x;
      iPanY = pinch.panY + (values[0].y + values[1].y) / 2 - pinch.y;
      zoom(
        (pinch.zoom *
          Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y)) /
          pinch.distance,
      );
      return;
    }
    if ((strTool === "move" || isSpace) && lastPoint) {
      hasSpaceMoved = true;
      iPanX += event.clientX - lastPoint.x;
      iPanY += event.clientY - lastPoint.y;
      renderCanvases();
      lastPoint = { x: event.clientX, y: event.clientY };
      return;
    }
    if (isDrawing) stroke(point(event));
  });
  const end = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (isDrawing) changed();
    isDrawing = false;
    lastPoint = null;
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) touchPixels = null;
  };
  area.addEventListener("pointerup", end);
  area.addEventListener("pointercancel", end);
}
function play() {
  clearTimeout(iPlayback);
  isPlaying = true;
  const button = document.querySelector("#play");
  if (button) button.textContent = "Ⅱ";
  iPlayback = window.setTimeout(function tick() {
    if (!isPlaying) return;
    iPreviewFrame = (iPreviewFrame + 1) % action().frames.length;
    renderPreview();
    iPlayback = window.setTimeout(tick, 1000 / action().fps);
  }, 1000 / action().fps);
}
function renderPreview() {
  const canvas = document.querySelector<HTMLCanvasElement>("#preview-canvas");
  if (!canvas) return;
  iPreviewFrame %= action().frames.length;
  paintCanvas(canvas, action().frames[iPreviewFrame].pixels);
  const label = document.querySelector(".preview-box>span");
  if (label)
    label.textContent = `${isPlaying ? "播放中" : "已暫停"} · ${iPreviewFrame + 1} / ${action().frames.length}`;
}

function stopPlayback() {
  isPlaying = false;
  clearTimeout(iPlayback);
  const button = document.querySelector("#play");
  if (button) button.textContent = "▶";
  renderPreview();
}
function modal(strTitle: string, strContent: string, strFooter = "") {
  document.querySelector("#modal")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "modal";
  root.append(dialog);
  dialog.innerHTML = `<div class="modal-heading"><div><h2>${strTitle}</h2></div><button class="close-modal" aria-label="關閉">×</button></div>${strContent}${strFooter}`;
  dialog
    .querySelector(".close-modal")!
    .addEventListener("click", () => dialog.close());
  dialog.showModal();
  return dialog;
}
function textDialog(
  strTitle: string,
  strLabel: string,
  strInitial: string,
  onSave: (strValue: string) => void,
) {
  const dialog = modal(
    strTitle,
    `<form id="text-form"><label class="field-label">${strLabel}<input id="dialog-name" required maxlength="60" value="${escape(strInitial)}"></label><div class="modal-footer"><button type="submit" class="primary">確認</button></div></form>`,
  );
  dialog.querySelector("form")!.onsubmit = (event) => {
    event.preventDefault();
    const strValue = dialog
      .querySelector<HTMLInputElement>("input")!
      .value.trim();
    if (strValue) {
      dialog.close();
      onSave(strValue);
    }
  };
  dialog.querySelector("input")!.focus();
}
function confirmDialog(
  strTitle: string,
  strText: string,
  onConfirm: () => void,
) {
  const dialog = modal(
    strTitle,
    `<p>${strText}</p><div class="modal-footer"><button id="confirm" class="primary">確認</button></div>`,
  );
  dialog.querySelector("#confirm")!.addEventListener("click", () => {
    dialog.close();
    onConfirm();
  });
}
function templates() {
  const dialog = modal(
    "自由繪畫",
    '<p class="modal-intro">選擇空白畫布尺寸</p><div class="template-grid">' +
      [16, 32, 64, 128]
        .map(
          (size) =>
            `<button data-template="${size}"><span class="template-emoji">▦</span><strong>${size} × ${size}</strong><small>空白畫布</small></button>`,
        )
        .join("") +
      "</div>",
  );
  dialog.addEventListener(
    "close",
    () => {
      if (!hasActiveProject) gallery();
    },
    { once: true },
  );
  dialog.querySelectorAll<HTMLButtonElement>("[data-template]").forEach(
    (button) =>
      (button.onclick = async () => {
        await saveProject();
        const next = createBlankProject(Number(button.dataset.template));
        next.id = createProjectId();
        hasActiveProject = true;
        dialog.close();
        applyProject(next);
      }),
  );
}

async function exportMenu() {
  const versions = db
    ? (await getAll("versions")).filter(belongsToProject)
    : [];
  openExportDialog(project, iAction, iFrame, {
    format: "pixel-sprite-studio",
    version: 1,
    project,
    versions,
  });
}

function importMenu() {
  const dialog = modal(
    "匯入素材或專案",
    '<p class="modal-intro">匯入素材開始描繪，或接續另一台裝置上的作品。</p><div class="export-options"><button id="image-import"><strong>匯入 PNG / Sprite sheet</strong><small>切割影格、去背、縮放與參考底圖</small></button><button id="project-import"><strong>匯入可編輯專案</strong><small>開啟先前匯出的 .pixel.json</small></button></div><input id="project-file" type="file" accept=".json,application/json" hidden>',
  );
  dialog.querySelector("#image-import")!.addEventListener("click", () => {
    dialog.close();
    openImportDialog(project, applyCurrentProject, iAction, iFrame);
  });
  const input = dialog.querySelector<HTMLInputElement>("#project-file")!;
  dialog.querySelector(".close-modal")!.addEventListener("click", () => {
    if (!hasActiveProject) gallery();
  });
  dialog
    .querySelector("#project-import")!
    .addEventListener("click", () => input.click());
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 30000000) throw new Error();
      const source = JSON.parse(await file.text());
      const next = source.project || source;
      if (!isValidProject(next)) throw new Error();
      if (Array.isArray(source.versions) && source.versions.length > 200)
        throw new Error();
      if (Array.isArray(source.versions)) {
        for (const entry of source.versions) {
          if (
            !entry ||
            typeof entry.name !== "string" ||
            entry.name.length > 80 ||
            !Number.isFinite(entry.savedAt) ||
            !isValidProject(entry.project)
          )
            throw new Error();
        }
      }
      await saveProject();
      next.id = createProjectId();
      if (db && Array.isArray(source.versions))
        source.versions.forEach((entry: any, i: number) =>
          transaction("versions", "readwrite").put({
            ...entry,
            project: { ...entry.project, id: next.id },
            id: Date.now() + i,
          }),
        );
      dialog.close();
      applyProject(next);
      toast("專案與版本已匯入");
    } catch {
      toast("無法讀取專案，請選擇有效的工坊 JSON 檔");
    }
  };
}
function openImageImport(files: File[], isNew = !hasActiveProject) {
  let hasApplied = false;
  const base = isNew ? createBlankProject() : project;
  if (isNew) base.actions[0].frames = [];
  openImportDialog(
    base,
    (next) => {
      hasApplied = true;
      if (isNew)
        next.actions = next.actions.filter((item) => item.frames.length > 0);
      if (isNew) {
        next.id = createProjectId();
        next.name = files[0]?.name.replace(/\.[^.]+$/, "") || "未命名作品";
        applyProject(next);
      } else applyCurrentProject(next);
    },
    isNew ? 0 : iAction,
    isNew ? 0 : iFrame,
    files,
  );
  const dialog = [
    ...document.querySelectorAll<HTMLDialogElement>(".asset-dialog"),
  ].at(-1);
  dialog?.addEventListener(
    "close",
    () => {
      if (isNew && !hasApplied) gallery();
    },
    { once: true },
  );
}
function isValidProject(candidate: any): candidate is Project {
  if (
    !candidate ||
    typeof candidate.name !== "string" ||
    !candidate.name.trim() ||
    candidate.name.length > 80 ||
    ![candidate.width, candidate.height].every(
      (i) => Number.isInteger(i) && i > 0 && i <= 256,
    ) ||
    !candidate.pivot ||
    ![candidate.pivot.x, candidate.pivot.y].every(Number.isFinite) ||
    !Array.isArray(candidate.palette) ||
    candidate.palette.length > 256 ||
    !candidate.palette.every(
      (strHex: unknown) =>
        typeof strHex === "string" && /^#[\da-f]{6}$/i.test(strHex),
    )
  )
    return false;
  const isPixels = (pixels: unknown) =>
    Array.isArray(pixels) &&
    pixels.length === candidate.width * candidate.height &&
    pixels.every(
      (strPixel) =>
        typeof strPixel === "string" &&
        (strPixel === "" || /^#[\da-f]{6}([\da-f]{2})?$/i.test(strPixel)),
    );
  return (
    Array.isArray(candidate.actions) &&
    candidate.actions.length > 0 &&
    candidate.actions.length <= 100 &&
    candidate.actions.every(
      (item: any) =>
        item &&
        typeof item.name === "string" &&
        item.name.length <= 80 &&
        Number.isFinite(item.fps) &&
        item.fps >= 1 &&
        item.fps <= 60 &&
        typeof item.loop === "boolean" &&
        Array.isArray(item.frames) &&
        item.frames.length > 0 &&
        item.frames.length <= 1000 &&
        item.frames.every(
          (itemFrame: any) =>
            itemFrame &&
            isPixels(itemFrame.pixels) &&
            (!itemFrame.reference || isPixels(itemFrame.reference)),
        ),
    )
  );
}
function frameMenu() {
  const dialog = modal(
    "影格操作",
    '<div class="nudge-layout"><div><h3>角色位移</h3><p class="tiny">每次移動 1 px，畫布外的像素會裁切。</p><div class="nudge-buttons"><button data-nudge="0,-1">↑</button><button data-nudge="-1,0">←</button><button data-nudge="1,0">→</button><button data-nudge="0,1">↓</button></div></div><div><h3>動作整理</h3><div class="export-options"><button id="frame-left"><strong>影格向前移</strong></button><button id="frame-right"><strong>影格向後移</strong></button><button id="new-role"><strong>從目前姿勢建立新角色</strong><small>保留色盤與尺寸，以這一格重新開始</small></button></div></div></div>',
  );
  dialog.querySelectorAll<HTMLButtonElement>("[data-nudge]").forEach(
    (button) =>
      (button.onclick = () => {
        checkpoint();
        const [iX, iY] = button.dataset.nudge!.split(",").map(Number);
        const pixels = Array(project.width * project.height).fill("");
        frame().pixels.forEach((strPixel, i) => {
          const iNextX = (i % project.width) + iX,
            iNextY = Math.floor(i / project.width) + iY;
          if (
            iNextX >= 0 &&
            iNextX < project.width &&
            iNextY >= 0 &&
            iNextY < project.height
          )
            pixels[iNextY * project.width + iNextX] = strPixel;
        });
        frame().pixels = pixels;
        changed();
        toast("已移動 1 px");
      }),
  );
  const reorder = (iDelta: number) => {
    const iTarget = iFrame + iDelta;
    if (iTarget < 0 || iTarget >= action().frames.length)
      return toast("已經在時間軸邊緣");
    checkpoint();
    [action().frames[iFrame], action().frames[iTarget]] = [
      action().frames[iTarget],
      action().frames[iFrame],
    ];
    iFrame = iTarget;
    changed();
    toast("已調整影格順序");
  };
  dialog
    .querySelector("#frame-left")!
    .addEventListener("click", () => reorder(-1));
  dialog
    .querySelector("#frame-right")!
    .addEventListener("click", () => reorder(1));
  const roleButton = dialog.querySelector("#new-role")!;
  roleButton.innerHTML =
    "<strong>從此動作建立新角色</strong><small>保留全部姿勢作為參考圖，開始描繪新角色</small>";
  roleButton.addEventListener("click", () => {
    const source = structuredClone(project);
    const iSelected = iAction;
    dialog.close();
    createReferenceRole(source, iSelected);
  });
}
async function createReferenceRole(source: Project, iSelected: number) {
  await saveProject();
  const next = structuredClone(source);
  next.id = createProjectId();
  next.name = `${source.name}・新角色`;
  const selected = structuredClone(source.actions[iSelected]);
  selected.frames = selected.frames.map((item) => ({
    pixels: Array(source.width * source.height).fill(""),
    reference: item.pixels.some(Boolean)
      ? [...item.pixels]
      : [...(item.reference || Array(source.width * source.height).fill(""))],
  }));
  next.actions = [selected];
  applyProject(next);
  toast("已保留此動作的全部姿勢作為參考，開始描繪新角色");
}
function transaction(strStore: string, strMode: IDBTransactionMode) {
  return db.transaction(strStore, strMode).objectStore(strStore);
}
async function saveProject() {
  if (!db || !hasActiveProject) return;
  project.id ||= createProjectId();
  const entry = {
    id: project.id,
    project: structuredClone(project),
    savedAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const request = transaction("projects", "readwrite").put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => toast("儲存失敗，請匯出專案檔備份"));
  const status = document.querySelector("#save-status");
  if (status) status.textContent = "● 已自動儲存於此裝置";
  localStorage.setItem("pixel-studio-last", project.id);
}
function getAll(strStore: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = transaction(strStore, "readonly").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function gallery() {
  document.body.classList.add("home-open");
  await saveProject();
  const entries = (await getAll("projects")).sort(
    (first, second) => second.savedAt - first.savedAt,
  );
  const dialog = modal(
    "我的點陣圖",
    `<div class="start-choices"><button id="gallery-upload"><span class="start-card-drop">${UPLOAD_ART}<span>將圖片拖放到這裡</span></span><strong>↥ 上傳圖片</strong></button><button id="gallery-new"><span class="start-card-drawing">${DRAW_ART}</span><strong>✎ 自由繪畫</strong></button></div><button id="gallery-import" class="start-project-import">匯入專案 JSON</button><input id="start-files" type="file" accept="image/png,image/webp,image/jpeg" multiple hidden>${entries.length ? '<h3 class="recent-title">我的作品</h3>' : ""}<div class="gallery-grid">${entries.map((entry, i) => `<div class="gallery-item"><button data-open="${i}"><canvas></canvas><strong>${escape(entry.project.name)}</strong><small>${entry.project.width} × ${entry.project.height} · ${new Date(entry.savedAt).toLocaleDateString("zh-TW")}</small></button><div class="gallery-action-thumbs">${entry.project.actions.map((item: any, j: number) => `<span><canvas data-thumb="${i}-${j}"></canvas><small>${escape(item.name)}</small></span>`).join("")}</div><button data-remove="${i}" class="gallery-delete" aria-label="刪除作品 ${escape(entry.project.name)}">${TRASH_ICON}<span>刪除</span></button></div>`).join("")}</div>`,
  );
  dialog.className = "home-dialog";
  const title = dialog.querySelector("h2")!;
  title.className = "home-title";
  title.prepend(document.querySelector(".brand-icon")!.cloneNode(true));
  const close = dialog.querySelector<HTMLButtonElement>(".close-modal")!;
  close.textContent = "返回編輯";
  close.hidden = !hasActiveProject;
  dialog.oncancel = (event) => {
    if (!hasActiveProject) event.preventDefault();
  };
  dialog.addEventListener(
    "close",
    () => {
      document.body.classList.toggle("home-open", !hasActiveProject);
      dialog.className = "";
    },
    { once: true },
  );
  const picker = dialog.querySelector<HTMLInputElement>("#start-files")!;
  dialog
    .querySelector("#gallery-upload")!
    .addEventListener("click", () => picker.click());
  picker.onchange = () => {
    const files = [...(picker.files || [])];
    if (!files.length) return;
    dialog.close();
    openImageImport(files, true);
  };
  dialog.querySelector("#gallery-new")!.addEventListener("click", () => {
    dialog.close();
    templates();
  });
  dialog.querySelector("#gallery-import")!.addEventListener("click", () => {
    dialog.close();
    importMenu();
    (document.querySelector("#project-file") as HTMLInputElement).click();
  });
  entries.forEach((entry, i) =>
    entry.project.actions.forEach((item: any, j: number) => {
      const canvas = dialog.querySelector<HTMLCanvasElement>(
        `[data-thumb="${i}-${j}"]`,
      )!;
      canvas.width = entry.project.width;
      canvas.height = entry.project.height;
      const context = canvas.getContext("2d")!;
      item.frames[0].pixels.forEach((strPixel: string, k: number) => {
        if (strPixel) {
          context.fillStyle = strPixel;
          context.fillRect(
            k % canvas.width,
            Math.floor(k / canvas.width),
            1,
            1,
          );
        }
      });
    }),
  );
  dialog
    .querySelectorAll<HTMLSpanElement>(".gallery-action-thumbs>span")
    .forEach((item) => {
      const [iEntry, iSelected] = item
        .querySelector<HTMLCanvasElement>("canvas")!
        .dataset.thumb!.split("-")
        .map(Number);
      const button = document.createElement("button");
      button.append(...item.childNodes);
      const hint = document.createElement("small");
      hint.textContent = "描繪此動作 ↗";
      button.append(hint);
      button.title = "以全部影格姿勢作為參考，建立新角色";
      button.onclick = () => {
        dialog.close();
        createReferenceRole(entries[iEntry].project, iSelected);
      };
      item.replaceWith(button);
    });
  entries.forEach((entry, i) => {
    const button = dialog.querySelector<HTMLButtonElement>(
      `[data-open="${i}"]`,
    )!;
    const canvas = button.querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    canvas.width = entry.project.width;
    canvas.height = entry.project.height;
    entry.project.actions[0].frames[0].pixels.forEach(
      (strPixel: string, j: number) => {
        if (strPixel) {
          context.fillStyle = strPixel;
          context.fillRect(
            j % canvas.width,
            Math.floor(j / canvas.width),
            1,
            1,
          );
        }
      },
    );
    button.onclick = () => {
      dialog.close();
      applyProject(structuredClone(entry.project));
    };
  });
  dialog.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach(
    (button) =>
      (button.onclick = () => {
        const entry = entries[Number(button.dataset.remove)];
        confirmProjectDelete(entry);
      }),
  );
}
function confirmProjectDelete(entry: { id: string; project: Project }) {
  const dialog = document.createElement("dialog");
  dialog.id = "delete-project-dialog";
  dialog.className = "delete-confirm-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-labelledby", "delete-project-title");
  dialog.setAttribute("aria-describedby", "delete-project-description");
  dialog.innerHTML = `<div class="delete-confirm-heading">${TRASH_ICON}<h2 id="delete-project-title">刪除作品？</h2></div><p id="delete-project-description">「${escape(entry.project.name)}」將從此瀏覽器移除，刪除後無法復原。</p><p class="delete-error" role="alert" hidden></p><div class="delete-confirm-actions"><button id="cancel-delete" autofocus>取消</button><button id="confirm-delete" class="danger-button">${TRASH_ICON}<span>刪除作品</span></button></div>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog
    .querySelector("#cancel-delete")!
    .addEventListener("click", () => dialog.close());
  const confirm = dialog.querySelector<HTMLButtonElement>("#confirm-delete")!;
  confirm.onclick = async () => {
    confirm.disabled = true;
    const isActive = hasActiveProject && entry.id === project.id;
    if (isActive) {
      clearTimeout(iSaveTimer);
      hasActiveProject = false;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const pending = db.transaction("projects", "readwrite");
        pending.objectStore("projects").delete(entry.id);
        pending.oncomplete = () => resolve();
        pending.onerror = () => reject(pending.error);
        pending.onabort = () => reject(pending.error);
      });
      if (isActive) {
        history = [];
        future = [];
      }
      if (localStorage.getItem("pixel-studio-last") === entry.id)
        localStorage.removeItem("pixel-studio-last");
      dialog.close();
      await gallery();
      toast("已刪除作品");
    } catch {
      if (isActive) hasActiveProject = true;
      const message = dialog.querySelector<HTMLElement>(".delete-error")!;
      message.textContent = "刪除失敗，作品仍保留。請再試一次。";
      message.hidden = false;
      confirm.disabled = false;
    }
  };
  dialog.showModal();
}
function belongsToProject(entry: any) {
  return entry.project.id
    ? entry.project.id === project.id
    : entry.project.name === project.name;
}
function snapshot(strName: string) {
  transaction("versions", "readwrite").put({
    id: Date.now(),
    name: strName,
    project: structuredClone(project),
    savedAt: Date.now(),
  });
}
async function versions() {
  const entries = (await getAll("versions"))
    .filter(belongsToProject)
    .sort((first, second) => second.savedAt - first.savedAt);
  const dialog = modal(
    "版本紀錄",
    `<p class="modal-intro">儲存具名版本，或還原先前的編輯進度。</p><button id="snapshot" class="primary">＋ 儲存目前版本</button><div class="versions">${entries.length ? entries.map((entry, i) => `<button data-version="${i}"><span>◷ ${escape(entry.name || "未命名快照")}<small style="display:block;margin-top:5px;color:#9da78d">${new Date(entry.savedAt).toLocaleString("zh-TW")}</small></span><span>還原 ↗</span></button>`).join("") : '<p class="empty-state">還沒有版本紀錄。點選上方按鈕儲存目前狀態。</p>'}</div>`,
  );
  dialog.querySelector("#snapshot")!.addEventListener("click", () => {
    dialog.close();
    textDialog(
      "儲存版本",
      "版本名稱",
      `版本 ${entries.length + 1}`,
      (strName) => {
        transaction("versions", "readwrite").put({
          id: Date.now(),
          name: strName,
          project: structuredClone(project),
          savedAt: Date.now(),
        });
        toast("已儲存版本快照");
      },
    );
  });
  dialog.querySelectorAll<HTMLButtonElement>("[data-version]").forEach(
    (button) =>
      (button.onclick = () => {
        snapshot("還原前自動備份");
        const next = structuredClone(
          entries[Number(button.dataset.version)].project,
        );
        next.id = project.id;
        dialog.close();
        applyProject(next);
        toast("已還原版本，並保存還原前的快照");
      }),
  );
}
document.addEventListener("keydown", (event) => {
  if (
    (event.target as HTMLElement).matches("input, select, textarea") ||
    document.querySelector("dialog[open]")
  )
    return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo(event.shiftKey);
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (!isSpace) hasSpaceMoved = false;
    isSpace = true;
    return;
  }
  const tools: Record<string, string> = {
    b: "pencil",
    e: "eraser",
    g: "fill",
    i: "picker",
    h: "move",
  };
  if (tools[event.key.toLowerCase()]) setTool(tools[event.key.toLowerCase()]);
  if (event.key === "ArrowRight") {
    event.preventDefault();
    iFrame = (iFrame + 1) % action().frames.length;
    render();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    iFrame = (iFrame + action().frames.length - 1) % action().frames.length;
    render();
  }
});
document.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    isSpace = false;
    if (
      !hasSpaceMoved &&
      !(event.target as HTMLElement).matches("input,select,textarea") &&
      !document.querySelector("dialog[open]")
    )
      isPlaying ? stopPlayback() : play();
  }
});
render();
function positionTimeline() {
  const timeline = document.querySelector(".timeline");
  if (!timeline) return;
  if (window.innerHeight <= 650)
    document.querySelector(".workspace")!.append(timeline);
  else
    document
      .querySelector("#app")!
      .insertBefore(timeline, document.querySelector("#app>footer"));
}
function fitCanvas() {
  positionTimeline();
  const area = document.querySelector<HTMLDivElement>("#canvas-area");
  if (
    window.matchMedia("(orientation:portrait) and (max-width:1100px)").matches
  ) {
    if (document.querySelector(".home-dialog[open]")) isHomePending = true;
    document
      .querySelectorAll<HTMLDialogElement>("dialog[open]")
      .forEach((dialog) => dialog.close());
    return;
  }
  if (!area) return;
  iPanX = iPanY = 0;
  iZoom = Math.max(
    1,
    Math.min(
      14,
      Math.floor(
        Math.min(
          (area.clientWidth - 56) / project.width,
          (area.clientHeight - (window.innerHeight <= 650 ? 40 : 56)) /
            project.height,
        ),
      ),
    ),
  );
  renderCanvases();
  if (isHomePending) {
    isHomePending = false;
    gallery();
  }
}
window.addEventListener("resize", fitCanvas);
document.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  document.body.classList.add("file-drag-over");
});
document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) document.body.classList.remove("file-drag-over");
});
document.addEventListener("drop", (event) => {
  document.body.classList.remove("file-drag-over");
  const files = [...(event.dataTransfer?.files || [])].filter((file) =>
    file.type.startsWith("image/"),
  );
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  if (!files.length) return toast("請拖曳圖片；專案 JSON 可從首頁匯入");
  const isNew = document.body.classList.contains("home-open");
  document
    .querySelectorAll<HTMLDialogElement>("dialog[open]")
    .forEach((dialog) => dialog.close());
  openImageImport(files, isNew);
});
document.body.classList.add("home-open");
const openRequest = indexedDB.open("pixel-sprite-studio", 1);
openRequest.onupgradeneeded = () => {
  openRequest.result.createObjectStore("projects", { keyPath: "id" });
  openRequest.result.createObjectStore("versions", { keyPath: "id" });
};
openRequest.onsuccess = async () => {
  db = openRequest.result;
  if (
    window.matchMedia("(orientation:portrait) and (max-width:1100px)").matches
  )
    isHomePending = true;
  else gallery();
};
openRequest.onerror = () => toast("本機儲存無法使用，請匯出專案檔備份");
