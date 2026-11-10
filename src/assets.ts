import { icon } from "./icons";
import "./assets.css";
import type { Project } from "./types";
export type AssetProject = Project;
type Apply = (project: AssetProject) => void;
function dialog(strTitle: string, strBody: string, apply: () => void) {
  const element = document.createElement("dialog");
  element.className = "asset-dialog";
  element.innerHTML = `<header><h2>${strTitle}</h2><button type="button" data-close aria-label="關閉">${icon("close")}</button></header><section>${strBody}</section><footer><button data-close>取消</button><button class="primary" data-apply>套用變更</button></footer>`;
  element
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () => element.close()),
    );
  element.querySelector("[data-apply]")!.addEventListener("click", apply);
  element.addEventListener("close", () => element.remove());
  document.body.append(element);
  element.showModal();
  return element;
}
function numberValue(element: Element, strId: string) {
  return Number((element.querySelector(`#${strId}`) as HTMLInputElement).value);
}
function draw(
  canvas: HTMLCanvasElement,
  pixels: string[],
  iWidth: number,
  iHeight: number,
) {
  canvas.width = iWidth;
  canvas.height = iHeight;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, iWidth, iHeight);
  pixels.forEach((strColor, i) => {
    if (strColor) {
      context.fillStyle = strColor;
      context.fillRect(i % iWidth, Math.floor(i / iWidth), 1, 1);
    }
  });
}
function mapSize(
  pixels: string[],
  iOldWidth: number,
  iOldHeight: number,
  iWidth: number,
  iHeight: number,
  isScale: boolean,
  iOffsetX = 0,
  iOffsetY = 0,
) {
  return Array.from({ length: iWidth * iHeight }, (_, i) => {
    const iX = isScale
      ? Math.floor(((i % iWidth) * iOldWidth) / iWidth)
      : (i % iWidth) - iOffsetX;
    const iY = isScale
      ? Math.floor((Math.floor(i / iWidth) * iOldHeight) / iHeight)
      : Math.floor(i / iWidth) - iOffsetY;
    return iX >= 0 && iY >= 0 && iX < iOldWidth && iY < iOldHeight
      ? pixels[iY * iOldWidth + iX] || ""
      : "";
  });
}
export function openResizeDialog(project: AssetProject, onApply: Apply) {
  const element = dialog(
    "調整畫布尺寸",
    `<p>所有動作與影格會一起更新，套用前可預覽第一格。</p><div class="asset-fields"><label>寬度 <input id="aw" type="number" min="1" max="256" value="${project.width}"></label><label>高度 <input id="ah" type="number" min="1" max="256" value="${project.height}"></label><label>處理方式 <select id="am"><option value="crop">裁切／擴展畫布（左上對齊）</option><option value="scale">最近鄰縮放角色</option></select></label></div><canvas class="asset-preview"></canvas><p data-info></p>`,
    () => {
      const next = build();
      if (!next) return;
      onApply(next);
      element.close();
    },
  );
  function build() {
    const iWidth = numberValue(element, "aw"),
      iHeight = numberValue(element, "ah");
    if (
      ![iWidth, iHeight].every((i) => Number.isInteger(i) && i >= 1 && i <= 256)
    )
      return;
    const isScale =
      (element.querySelector("#am") as HTMLSelectElement).value === "scale";
    const next = structuredClone(project);
    next.width = iWidth;
    next.height = iHeight;
    next.pivot = {
      x: isScale
        ? Math.min(
            iWidth - 1,
            Math.round((project.pivot.x * iWidth) / project.width),
          )
        : Math.min(project.pivot.x, iWidth - 1),
      y: isScale
        ? Math.min(
            iHeight - 1,
            Math.round((project.pivot.y * iHeight) / project.height),
          )
        : Math.min(project.pivot.y, iHeight - 1),
    };
    next.actions.forEach((action) =>
      action.frames.forEach((frame) => {
        frame.pixels = mapSize(
          frame.pixels,
          project.width,
          project.height,
          iWidth,
          iHeight,
          isScale,
        );
        if (frame.reference)
          frame.reference = mapSize(
            frame.reference,
            project.width,
            project.height,
            iWidth,
            iHeight,
            isScale,
          );
      }),
    );
    return next;
  }
  const preview = () => {
    const next = build();
    if (next)
      draw(
        element.querySelector("canvas")!,
        next.actions[0]?.frames[0]?.pixels || [],
        next.width,
        next.height,
      );
    element.querySelector("[data-info]")!.textContent = next
      ? `${next.width} × ${next.height} 像素 · 透明區域保留`
      : "請輸入 1–256 的整數。";
  };
  element.addEventListener("input", preview);
  preview();
}
export function openPaletteDialog(project: AssetProject, onApply: Apply) {
  let next = structuredClone(project);
  const element = dialog(
    "整個角色統一減色",
    '<p>統計所有動作與影格，共用同一組色票，透明像素維持透明。</p><label>目標色數 <select id="colors"><option>8</option><option selected>16</option><option>32</option><option>64</option><option>128</option><option>256</option></select></label><div class="asset-compare"><div>原始<canvas class="asset-preview" data-before></canvas></div><div>減色預覽<canvas class="asset-preview" data-after></canvas></div></div><div class="asset-swatches"></div><p data-info></p>',
    () => {
      onApply(next);
      element.close();
    },
  );
  const update = () => {
    const counts = new Map<string, number>();
    project.actions.forEach((action) =>
      action.frames.forEach((frame) =>
        frame.pixels.forEach((strColor) => {
          if (strColor) {
            const strRgb = strColor.slice(0, 7);
            counts.set(strRgb, (counts.get(strRgb) || 0) + 1);
          }
        }),
      ),
    );
    const iLimit = numberValue(element, "colors");
    const colors = [...counts.keys()].sort(
      (strA, strB) => counts.get(strB)! - counts.get(strA)!,
    );
    const channels = colors.map((strColor) =>
      [1, 3, 5].map((i) => parseInt(strColor.slice(i, i + 2), 16)),
    );
    const weights = colors.map((strColor) => Math.sqrt(counts.get(strColor)!));
    const distances = new Float64Array(colors.length).fill(Infinity);
    const winners = new Uint32Array(colors.length);
    const palette: string[] = [];
    let iSelected = 0;
    for (let i = 0; i < Math.min(iLimit, colors.length); i++) {
      palette.push(colors[iSelected]);
      const selected = channels[iSelected];
      let nBestScore = -1,
        iNext = 0;
      for (let j = 0; j < colors.length; j++) {
        const channel = channels[j];
        const nDistance =
          (channel[0] - selected[0]) ** 2 +
          (channel[1] - selected[1]) ** 2 +
          (channel[2] - selected[2]) ** 2;
        if (nDistance < distances[j]) {
          distances[j] = nDistance;
          winners[j] = i;
        }
        const nScore = distances[j] * weights[j];
        if (nScore > nBestScore) {
          nBestScore = nScore;
          iNext = j;
        }
      }
      iSelected = iNext;
    }
    const mapping = new Map(
      colors.map((strColor, i) => [strColor, palette[winners[i]]]),
    );
    next = structuredClone(project);
    next.palette = palette;
    next.actions.forEach((action) =>
      action.frames.forEach((frame) => {
        frame.pixels = frame.pixels.map((strColor) =>
          strColor
            ? mapping.get(strColor.slice(0, 7))! + strColor.slice(7)
            : "",
        );
      }),
    );
    draw(
      element.querySelector("[data-before]")!,
      project.actions[0]?.frames[0]?.pixels || [],
      project.width,
      project.height,
    );
    draw(
      element.querySelector("[data-after]")!,
      next.actions[0]?.frames[0]?.pixels || [],
      project.width,
      project.height,
    );
    const swatches = element.querySelector(".asset-swatches")!;
    swatches.replaceChildren();
    palette.forEach((strColor) => {
      const swatch = document.createElement("span");
      swatch.style.background = strColor;
      swatch.title = strColor;
      swatches.append(swatch);
    });
    element.querySelector("[data-info]")!.textContent =
      `${colors.length} 色 → ${palette.length} 色 · 套用至全部影格`;
  };
  element.addEventListener("change", update);
  update();
}
export function openAlignmentDialog(
  project: AssetProject,
  onApply: Apply,
  iAction = 0,
) {
  let next = structuredClone(project);
  const frames = project.actions[iAction].frames;
  const points = frames.map(() => ({ ...project.pivot }));
  const element = dialog(
    "批次對齊與手動定位",
    `<p>自動以角色底部中央對齊共用定位點；手動模式可逐格點選腳底或固定特徵。</p><p>只調整目前動作，其他動作（例如跳躍）保持原狀。</p><div class="asset-frame-selection">${frames.map((_, i) => `<label><input type="checkbox" data-align-frame="${i}" checked>第 ${i + 1} 格</label>`).join("")}</div><label>模式 <select id="mode"><option value="auto">角色底部中央</option><option value="manual">逐格手動點選</option></select></label><label>影格 <input id="frame" type="number" min="1" max="${frames.length}" value="1"></label><label>目標 X <input id="px" type="number" value="${project.pivot.x}"></label><label>目標 Y <input id="py" type="number" value="${project.pivot.y}"></label><div class="asset-compare"><div>點選原始位置<canvas data-source class="asset-preview"></canvas></div><div>對齊預覽<canvas data-result class="asset-preview"></canvas></div></div><p data-info></p>`,
    () => {
      onApply(next);
      element.close();
    },
  );
  const update = () => {
    const iFrame = Math.max(
      0,
      Math.min(frames.length - 1, numberValue(element, "frame") - 1),
    );
    const iX = numberValue(element, "px"),
      iY = numberValue(element, "py");
    next = structuredClone(project);
    next.pivot = { x: iX, y: iY };
    let iIndex = 0;
    next.actions[iAction].frames.forEach((frame) => {
      const iCurrent = iIndex++;
      if (
        !(
          element.querySelector(
            `[data-align-frame="${iCurrent}"]`,
          ) as HTMLInputElement
        ).checked
      )
        return;
      let point = points[iCurrent];
      if (
        (element.querySelector("#mode") as HTMLSelectElement).value === "auto"
      ) {
        const indexes = frame.pixels.flatMap((strColor, i) =>
          strColor ? [i] : [],
        );
        if (indexes.length) {
          const xs = indexes.map((i) => i % project.width);
          point = {
            x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
            y: Math.max(...indexes.map((i) => Math.floor(i / project.width))),
          };
        }
      }
      frame.pixels = mapSize(
        frame.pixels,
        project.width,
        project.height,
        project.width,
        project.height,
        false,
        iX - point.x,
        iY - point.y,
      );
      if (frame.reference)
        frame.reference = mapSize(
          frame.reference,
          project.width,
          project.height,
          project.width,
          project.height,
          false,
          iX - point.x,
          iY - point.y,
        );
    });
    draw(
      element.querySelector("[data-source]")!,
      frames[iFrame].pixels,
      project.width,
      project.height,
    );
    draw(
      element.querySelector("[data-result]")!,
      next.actions[iAction].frames[iFrame].pixels,
      project.width,
      project.height,
    );
    element.querySelector("[data-info]")!.textContent =
      `第 ${iFrame + 1} 格 · 手動定位 (${points[iFrame].x}, ${points[iFrame].y}) · 超出畫布部分將裁切`;
  };
  element.querySelector("[data-source]")!.addEventListener("click", (event) => {
    const mouse = event as MouseEvent;
    const canvas = event.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const iFrame = Math.max(
      0,
      Math.min(frames.length - 1, numberValue(element, "frame") - 1),
    );
    points[iFrame] = {
      x: Math.floor(((mouse.clientX - rect.left) / rect.width) * project.width),
      y: Math.floor(
        ((mouse.clientY - rect.top) / rect.height) * project.height,
      ),
    };
    (element.querySelector("#mode") as HTMLSelectElement).value = "manual";
    update();
  });
  element.addEventListener("input", update);
  update();
}
function detectSheetGrid(image: HTMLImageElement) {
  const nRatio = Math.min(1, 1400 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * nRatio));
  canvas.height = Math.max(1, Math.round(image.height * nRatio));
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const iTotal = canvas.width * canvas.height,
    visited = new Uint8Array(iTotal),
    exterior = new Uint8Array(iTotal);
  const corner = Array.from(data.slice(0, 4));
  const queue: number[] = [];
  for (let i = 0; i < canvas.width; i++)
    queue.push(i, (canvas.height - 1) * canvas.width + i);
  for (let i = 0; i < canvas.height; i++)
    queue.push(i * canvas.width, i * canvas.width + canvas.width - 1);
  for (let i = 0; i < queue.length; i++) {
    const iPixel = queue[i];
    if (visited[iPixel]) continue;
    visited[iPixel] = 1;
    if (
      data[iPixel * 4 + 3] > 8 &&
      !corner.every((n, j) => Math.abs(data[iPixel * 4 + j] - n) <= 3)
    )
      continue;
    exterior[iPixel] = 1;
    const iX = iPixel % canvas.width,
      iY = Math.floor(iPixel / canvas.width);
    if (iX > 0) queue.push(iPixel - 1);
    if (iX < canvas.width - 1) queue.push(iPixel + 1);
    if (iY > 0) queue.push(iPixel - canvas.width);
    if (iY < canvas.height - 1) queue.push(iPixel + canvas.width);
  }
  const columns = new Uint8Array(canvas.width),
    rows = new Uint8Array(canvas.height);
  for (let i = 0; i < iTotal; i++)
    if (!exterior[i] && data[i * 4 + 3] > 8) {
      columns[i % canvas.width] = 1;
      rows[Math.floor(i / canvas.width)] = 1;
    }
  function axis(occupied: Uint8Array, iSource: number) {
    const bands: { start: number; end: number }[] = [];
    for (let i = 0; i < occupied.length; i++)
      if (occupied[i]) {
        const iStart = i;
        while (i + 1 < occupied.length && occupied[i + 1]) i++;
        bands.push({ start: iStart, end: i });
      }
    if (!bands.length) return null;
    if (bands.length === 1) return { count: 1, origin: 0, size: iSource };
    if (bands.length > 32) return null;
    const centers = bands.map((band) => (band.start + band.end) / 2);
    const differences = centers.slice(1).map((n, i) => n - centers[i]);
    const sorted = [...differences].sort((a, b) => a - b);
    let nPitch = sorted[Math.floor(sorted.length / 2)];
    if (
      nPitch < 5 ||
      differences.some((n) => Math.abs(n - nPitch) > Math.max(3, nPitch * 0.4))
    )
      return null;
    const nFull = occupied.length / bands.length;
    if (
      Math.abs(nFull - nPitch) <= Math.max(2, nPitch * 0.12) &&
      bands.every(
        (band, i) =>
          band.start >= Math.floor(i * nFull) &&
          band.end < Math.ceil((i + 1) * nFull),
      )
    )
      return {
        count: bands.length,
        origin: 0,
        size: Math.floor(iSource / bands.length),
      };
    nPitch = Math.round(nPitch);
    const nMin = Math.max(
      0,
      ...bands.map((band, i) => band.end + 1 - (i + 1) * nPitch),
    );
    const nMax = Math.min(
      occupied.length - bands.length * nPitch,
      ...bands.map((band, i) => band.start - i * nPitch),
    );
    if (nMin > nMax) return null;
    const nOrigin = Math.max(
      nMin,
      Math.min(nMax, Math.round(centers[0] - nPitch / 2)),
    );
    return {
      count: bands.length,
      origin: Math.round((nOrigin * iSource) / occupied.length),
      size: Math.round((nPitch * iSource) / occupied.length),
    };
  }
  const x = axis(columns, image.width) || {
      count: 1,
      origin: 0,
      size: image.width,
    },
    y = axis(rows, image.height) || { count: 1, origin: 0, size: image.height };
  if (x.count * y.count < 3 || x.count * y.count > 256) return null;
  return {
    cols: x.count,
    rows: y.count,
    x: x.origin,
    y: y.origin,
    width: x.size,
    height: y.size,
  };
}
export function openImportDialog(
  project: AssetProject,
  onApply: Apply,
  iAction = 0,
  iFrame = 0,
  initialFiles: File[] = [],
  isChooseFiles = false,
  isNewProject = false,
) {
  let iOutputWidth = project.width,
    iOutputHeight = project.height;
  let hasSuggestedSize = false;
  let suggested: ReturnType<typeof detectSheetGrid> = null;
  let iPreview = 0,
    iTimer = 0;
  const sources: { name: string; image: HTMLImageElement }[] = [];
  let imported: string[][] = [];
  let cellRows: string[] = [];
  const skipped = new Set<number>();
  const rowNames = new Map<string, string>();
  let background: number[] | null = null;
  const element = dialog(
    "匯入圖片與 Sprite Sheet",
    `<p>選擇圖片，預覽後匯入。</p><input id="files" type="file" accept="image/*" multiple><div data-files></div><canvas id="source-preview" class="asset-preview" title="點選背景顏色"></canvas><p>點選圖片選取去背色。</p><div class="asset-fields"><label>切割方式 <select id="layout"><option value="cell">指定每格尺寸</option><option value="count">指定欄數與列數</option></select></label><label>欄數 <input id="cols" type="number" min="1" value="1"></label><label>列數 <input id="rows" type="number" min="1" value="1"></label><label>切格預設 <select id="preset"><option value="">自訂</option><option>16</option><option>32</option><option>48</option><option>64</option><option>128</option><option>256</option></select></label><label>切格寬 <input id="cw" type="number" min="1" value="${iOutputWidth}"></label><label>切格高 <input id="ch" type="number" min="1" value="${iOutputHeight}"></label><label>起點 X <input id="ox" type="number" min="0" value="0"></label><label>起點 Y <input id="oy" type="number" min="0" value="0"></label><label>水平間距 <input id="gx" type="number" min="0" value="0"></label><label>垂直間距 <input id="gy" type="number" min="0" value="0"></label><label>共用縮放倍率 <input id="scale" type="number" min="0.01" max="16" step="0.1" value="1"></label><label><input id="sheet" type="checkbox">依格線切割</label><label><input id="remove" type="checkbox">移除外緣連通背景</label><label>加入為 <select id="target"><option value="pixels">可編輯像素</option><option value="reference">參考底圖</option></select></label></div><div class="asset-grouping"><label>動作分組 <select id="group-mode"><option value="append">加入目前動作（預設）</option><option value="rows">每一列建立一個新動作</option><option value="custom">自訂影格範圍建立新動作</option></select></label><div id="row-groups"></div><label id="custom-groups-label" hidden>每行一個動作：名稱:影格範圍<textarea id="custom-groups" rows="4" placeholder="待機:1-4
行走:5-8
跳躍:9,11-12"></textarea></label><p>取消勾選可略過影格；自訂範圍未列出的影格也會略過。</p><p id="group-error" role="alert"></p></div><div class="asset-import-previews"></div><p data-info></p>`,
    () => {
      const groups = getGroups();
      if (!groups || !groups.length) return;
      if (!validOutput()) return;
      const next = structuredClone(project);
      if (next.width !== iOutputWidth || next.height !== iOutputHeight) {
        next.actions.forEach((action) =>
          action.frames.forEach((frame) => {
            frame.pixels = mapSize(
              frame.pixels,
              project.width,
              project.height,
              iOutputWidth,
              iOutputHeight,
              true,
            );
            if (frame.reference)
              frame.reference = mapSize(
                frame.reference,
                project.width,
                project.height,
                iOutputWidth,
                iOutputHeight,
                true,
              );
          }),
        );
        next.pivot = {
          x: Math.min(
            iOutputWidth - 1,
            Math.round((project.pivot.x * iOutputWidth) / project.width),
          ),
          y: Math.min(
            iOutputHeight - 1,
            Math.round((project.pivot.y * iOutputHeight) / project.height),
          ),
        };
        next.width = iOutputWidth;
        next.height = iOutputHeight;
      }
      const isReference =
        (element.querySelector("#target") as HTMLSelectElement).value ===
        "reference";
      const strGroupMode = (
        element.querySelector("#group-mode") as HTMLSelectElement
      ).value;
      if (strGroupMode !== "append") {
        const names = new Set(next.actions.map((action) => action.name));
        groups.forEach((group) => {
          let strName = group.name,
            iSuffix = 2;
          while (names.has(strName))
            strName = group.name + " (" + iSuffix++ + ")";
          names.add(strName);
          next.actions.push({
            name: strName,
            fps: 8,
            loop: true,
            frames: group.indexes.map((i) =>
              isReference
                ? {
                    pixels: Array(iOutputWidth * iOutputHeight).fill(""),
                    reference: imported[i],
                  }
                : { pixels: imported[i] },
            ),
          });
        });
      } else if (isReference) {
        groups[0].indexes.forEach((iSource, i) => {
          const pixels = imported[iSource];
          const target = next.actions[iAction].frames[iFrame + i];
          if (target) target.reference = pixels;
          else
            next.actions[iAction].frames.push({
              pixels: Array(iOutputWidth * iOutputHeight).fill(""),
              reference: pixels,
            });
        });
      } else {
        next.actions[iAction].frames.splice(
          iFrame + 1,
          0,
          ...groups[0].indexes.map((i) => ({ pixels: imported[i] })),
        );
      }
      next.palette = [
        ...new Set([
          ...next.palette,
          ...groups
            .flatMap((group) => group.indexes.map((i) => imported[i]))
            .flat()
            .filter(Boolean)
            .map((strColor) => strColor.slice(0, 7)),
        ]),
      ].slice(0, 256);
      onApply(next);
      element.close();
    },
  );
  const section = element.querySelector("section")!;
  const simple = document.createElement("div");
  simple.className = "import-wizard";
  simple.innerHTML = `<div class="import-mode-tabs"><button type="button" data-slice-mode="single" class="active">單張圖片</button><button type="button" data-slice-mode="sheet">動畫圖集</button></div><p id="slice-detection" role="status">選擇圖片後即可預覽。</p><div id="simple-grid-controls"></div><div class="import-output-settings"><strong>輸出每格尺寸</strong><label>預設 <select id="output-preset"><option value="native">建議尺寸</option><option>16</option><option>32</option><option>48</option><option>64</option><option>96</option><option>128</option><option>256</option><option value="custom">自訂</option></select></label><label>寬 <input id="output-width" type="number" min="1" max="256"></label><label>高 <input id="output-height" type="number" min="1" max="256"></label><button id="native-size" type="button">使用原始影格尺寸</button><button id="keep-project-size" type="button">符合目前畫布</button><label id="confirm-resize-label"><input id="confirm-resize" type="checkbox">同步縮放既有畫布與全部影格</label><p id="output-status"></p></div><div class="import-live-preview"><canvas id="frame-preview" width="32" height="32"></canvas><div><button id="slice-play" type="button" aria-label="播放切格" aria-pressed="false">${icon("play")} 播放切格</button><input id="slice-frame" type="range" min="1" max="1" value="1"><output id="slice-frame-info">尚未載入</output></div></div>`;
  const fileListNode = section.querySelector("[data-files]")!;
  fileListNode.after(simple);
  const original = document.createElement("div");
  original.className = "import-original";
  original.innerHTML = "<strong>原圖切格預覽</strong>";
  original.append(section.querySelector("#source-preview")!);
  simple.querySelector("#simple-grid-controls")!.after(original);
  const sourceSize = document.createElement("p");
  sourceSize.id = "source-frame-size";
  simple.querySelector(".import-output-settings")!.prepend(sourceSize);
  const advanced = document.createElement("details");
  advanced.className = "import-advanced";
  advanced.innerHTML =
    "<summary>進階設定：切格、去背、參考圖與動作分組</summary>";
  const fields = section.querySelector(".asset-fields")!;
  const originalLabels = fields.querySelectorAll("label");
  [originalLabels[1], originalLabels[2]].forEach((label) =>
    simple.querySelector("#simple-grid-controls")!.append(label),
  );
  const hint = [...section.querySelectorAll("p")].find(
    (node) => node.textContent === "點選圖片選取去背色。",
  );
  if (hint) advanced.append(hint);
  advanced.append(fields, section.querySelector(".asset-grouping")!);
  section.insertBefore(
    advanced,
    section.querySelector(".asset-import-previews"),
  );
  (element.querySelector("#output-width") as HTMLInputElement).value =
    String(iOutputWidth);
  (element.querySelector("#output-height") as HTMLInputElement).value =
    String(iOutputHeight);
  (element.querySelector("#layout") as HTMLSelectElement).value = "count";
  (element.querySelector("#confirm-resize-label") as HTMLElement).hidden =
    isNewProject;
  (element.querySelector("#keep-project-size") as HTMLElement).hidden =
    isNewProject;
  const autoFitLabel = document.createElement("label");
  autoFitLabel.innerHTML =
    '<input id="auto-fit" type="checkbox" checked>自動等比例縮放每格';
  fields.prepend(autoFitLabel);
  function validOutput() {
    const isDimensions = [iOutputWidth, iOutputHeight].every(
      (i) => Number.isInteger(i) && i >= 1 && i <= 256,
    );
    const hasResized =
      iOutputWidth !== project.width || iOutputHeight !== project.height;
    const hasConfirmed =
      isNewProject ||
      !hasResized ||
      (element.querySelector("#confirm-resize") as HTMLInputElement).checked;
    element.querySelector("#output-status")!.textContent = !isDimensions
      ? "尺寸需為 1–256 的整數。"
      : !hasConfirmed
        ? "選擇「符合目前畫布」，或勾選同步縮放後套用。"
        : iOutputWidth + " × " + iOutputHeight + " 像素／格";
    return isDimensions && hasConfirmed;
  }
  function suggestOutput() {
    if (!sources.length) return;
    const image = sources[0].image;
    const isSheet = (element.querySelector("#sheet") as HTMLInputElement)
      .checked;
    const isCount =
      (element.querySelector("#layout") as HTMLSelectElement).value === "count";
    const iWidth = isSheet
      ? isCount
        ? Math.floor(
            (image.width -
              numberValue(element, "ox") -
              (numberValue(element, "cols") - 1) * numberValue(element, "gx")) /
              numberValue(element, "cols"),
          )
        : numberValue(element, "cw")
      : image.width;
    const iHeight = isSheet
      ? isCount
        ? Math.floor(
            (image.height -
              numberValue(element, "oy") -
              (numberValue(element, "rows") - 1) * numberValue(element, "gy")) /
              numberValue(element, "rows"),
          )
        : numberValue(element, "ch")
      : image.height;
    const nFit = Math.min(1, 256 / iWidth, 256 / iHeight);
    iOutputWidth = Math.max(1, Math.round(iWidth * nFit));
    iOutputHeight = Math.max(1, Math.round(iHeight * nFit));
    (element.querySelector("#output-width") as HTMLInputElement).value =
      String(iOutputWidth);
    (element.querySelector("#output-height") as HTMLInputElement).value =
      String(iOutputHeight);
  }
  function selectMode(isSheet: boolean) {
    (element.querySelector("#sheet") as HTMLInputElement).checked = isSheet;
    simple
      .querySelectorAll<HTMLElement>("[data-slice-mode]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.sliceMode === (isSheet ? "sheet" : "single"),
        ),
      );
    (element.querySelector("#simple-grid-controls") as HTMLElement).hidden =
      !isSheet;
  }
  function drawFramePreview() {
    const canvas = element.querySelector<HTMLCanvasElement>("#frame-preview")!;
    if (!imported.length) {
      canvas.width = canvas.height = 1;
      element.querySelector("#slice-frame-info")!.textContent =
        "尚未載入有效影格";
      return;
    }
    iPreview = Math.min(iPreview, imported.length - 1);
    draw(canvas, imported[iPreview], iOutputWidth, iOutputHeight);
    (element.querySelector("#slice-frame") as HTMLInputElement).max = String(
      imported.length,
    );
    (element.querySelector("#slice-frame") as HTMLInputElement).value = String(
      iPreview + 1,
    );
    element.querySelector("#slice-frame-info")!.textContent =
      "第 " +
      (iPreview + 1) +
      " / " +
      imported.length +
      " 格 · " +
      iOutputWidth +
      " × " +
      iOutputHeight;
  }
  element.addEventListener("close", () => window.clearInterval(iTimer));
  element.querySelector("#slice-play")!.addEventListener("click", () => {
    if (iTimer) {
      window.clearInterval(iTimer);
      iTimer = 0;
    } else
      iTimer = window.setInterval(() => {
        if (!imported.length) return;
        iPreview = (iPreview + 1) % imported.length;
        drawFramePreview();
      }, 150);
    element.querySelector("#slice-play")!.innerHTML = iTimer
      ? icon("pause") + " 暫停"
      : icon("play") + " 播放切格";
    element
      .querySelector("#slice-play")!
      .setAttribute("aria-pressed", String(Boolean(iTimer)));
    element
      .querySelector("#slice-play")!
      .setAttribute("aria-label", iTimer ? "暫停切格" : "播放切格");
  });
  element.querySelector("#slice-frame")!.addEventListener("input", () => {
    iPreview = numberValue(element, "slice-frame") - 1;
    drawFramePreview();
  });
  simple.querySelectorAll<HTMLElement>("[data-slice-mode]").forEach((button) =>
    button.addEventListener("click", () => {
      selectMode(button.dataset.sliceMode === "sheet");
      if (isNewProject) suggestOutput();
      update();
    }),
  );
  ["cols", "rows"].forEach((strId) =>
    element.querySelector("#" + strId)!.addEventListener("input", () => {
      (element.querySelector("#layout") as HTMLSelectElement).value = "count";
      (element.querySelector("#ox") as HTMLInputElement).value = "0";
      (element.querySelector("#oy") as HTMLInputElement).value = "0";
      if (isNewProject) suggestOutput();
      update();
    }),
  );
  element.querySelector("#native-size")!.addEventListener("click", () => {
    suggestOutput();
    update();
  });
  element.querySelector("#keep-project-size")!.addEventListener("click", () => {
    iOutputWidth = project.width;
    iOutputHeight = project.height;
    (element.querySelector("#output-width") as HTMLInputElement).value =
      String(iOutputWidth);
    (element.querySelector("#output-height") as HTMLInputElement).value =
      String(iOutputHeight);
    update();
  });
  element
    .querySelector("#output-preset")!
    .addEventListener("change", (event) => {
      const strValue = (event.target as HTMLSelectElement).value;
      if (strValue === "native") suggestOutput();
      else if (strValue !== "custom") {
        iOutputWidth = iOutputHeight = Number(strValue);
        (element.querySelector("#output-width") as HTMLInputElement).value =
          strValue;
        (element.querySelector("#output-height") as HTMLInputElement).value =
          strValue;
      }
      update();
    });
  ["output-width", "output-height"].forEach((strId) =>
    element.querySelector("#" + strId)!.addEventListener("input", () => {
      iOutputWidth = numberValue(element, "output-width");
      iOutputHeight = numberValue(element, "output-height");
      (element.querySelector("#output-preset") as HTMLSelectElement).value =
        "custom";
      update();
    }),
  );
  element.querySelector("#scale")!.addEventListener("input", () => {
    (element.querySelector("#auto-fit") as HTMLInputElement).checked = false;
  });
  selectMode(false);
  const update = () => {
    imported = [];
    cellRows = [];
    (element.querySelector("[data-apply]") as HTMLButtonElement).disabled =
      true;
    const iCellWidth = numberValue(element, "cw"),
      iCellHeight = numberValue(element, "ch");
    const iOriginX = numberValue(element, "ox"),
      iOriginY = numberValue(element, "oy");
    const iGapX = numberValue(element, "gx"),
      iGapY = numberValue(element, "gy"),
      nManualScale = numberValue(element, "scale");
    if (
      ![iCellWidth, iCellHeight].every((i) => Number.isInteger(i) && i > 0) ||
      ![iOriginX, iOriginY, iGapX, iGapY].every(
        (i) => Number.isInteger(i) && i >= 0,
      ) ||
      !validOutput() ||
      nManualScale <= 0 ||
      nManualScale > 16
    ) {
      element.querySelector("[data-info]")!.textContent =
        "請輸入有效切格尺寸、間距與倍率。";
      return;
    }
    const previews = element.querySelector(".asset-import-previews")!;
    previews.replaceChildren();
    const isAutoFit = (element.querySelector("#auto-fit") as HTMLInputElement)
      .checked;
    const hasSheet = (element.querySelector("#sheet") as HTMLInputElement)
      .checked;
    const hasCount =
      (element.querySelector("#layout") as HTMLSelectElement).value === "count";
    const sizes = sources.map((source) => ({
      width: hasSheet
        ? hasCount
          ? Math.floor(
              (source.image.width -
                iOriginX -
                (numberValue(element, "cols") - 1) * iGapX) /
                numberValue(element, "cols"),
            )
          : iCellWidth
        : source.image.width,
      height: hasSheet
        ? hasCount
          ? Math.floor(
              (source.image.height -
                iOriginY -
                (numberValue(element, "rows") - 1) * iGapY) /
                numberValue(element, "rows"),
            )
          : iCellHeight
        : source.image.height,
    }));
    selectMode(hasSheet);
    if (sizes.length)
      element.querySelector("#source-frame-size")!.textContent =
        "來源每格 " + sizes[0].width + " × " + sizes[0].height + " 像素";
    const nScale =
      isAutoFit && sizes.length
        ? Math.min(
            16,
            iOutputWidth / Math.max(...sizes.map((size) => size.width)),
            iOutputHeight / Math.max(...sizes.map((size) => size.height)),
          )
        : nManualScale;
    if (isAutoFit)
      (element.querySelector("#scale") as HTMLInputElement).value =
        String(nScale);
    if (sources.length) {
      const preview =
        element.querySelector<HTMLCanvasElement>("#source-preview")!;
      preview.width = sources[0].image.width;
      preview.height = sources[0].image.height;
      preview.getContext("2d")!.drawImage(sources[0].image, 0, 0);
    }
    sources.forEach((source, iSource) => {
      const canvas = document.createElement("canvas");
      canvas.width = source.image.width;
      canvas.height = source.image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(source.image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      if ((element.querySelector("#remove") as HTMLInputElement).checked) {
        const selected = background || Array.from(data.slice(0, 4));
        const queue: number[] = [];
        const visited = new Set<number>();
        for (let i = 0; i < canvas.width; i++)
          queue.push(i, (canvas.height - 1) * canvas.width + i);
        for (let i = 0; i < canvas.height; i++)
          queue.push(i * canvas.width, i * canvas.width + canvas.width - 1);
        for (let i = 0; i < queue.length; i++) {
          const iPixel = queue[i];
          if (visited.has(iPixel)) continue;
          visited.add(iPixel);
          if (
            !selected.every((nChannel, j) => data[iPixel * 4 + j] === nChannel)
          )
            continue;
          data[iPixel * 4 + 3] = 0;
          const iX = iPixel % canvas.width,
            iY = Math.floor(iPixel / canvas.width);
          if (iX > 0) queue.push(iPixel - 1);
          if (iX < canvas.width - 1) queue.push(iPixel + 1);
          if (iY > 0) queue.push(iPixel - canvas.width);
          if (iY < canvas.height - 1) queue.push(iPixel + canvas.width);
        }
      }
      const isSheet = (element.querySelector("#sheet") as HTMLInputElement)
        .checked;
      const isCount =
        (element.querySelector("#layout") as HTMLSelectElement).value ===
        "count";
      const iColumns = numberValue(element, "cols"),
        iRows = numberValue(element, "rows");
      if (![iColumns, iRows].every((i) => Number.isInteger(i) && i >= 1))
        return;
      const iWidth = isSheet
        ? isCount
          ? Math.floor(
              (canvas.width - iOriginX - (iColumns - 1) * iGapX) / iColumns,
            )
          : iCellWidth
        : canvas.width;
      const iHeight = isSheet
        ? isCount
          ? Math.floor((canvas.height - iOriginY - (iRows - 1) * iGapY) / iRows)
          : iCellHeight
        : canvas.height;
      if (iWidth < 1 || iHeight < 1) return;
      for (
        let iY = iOriginY;
        iY + iHeight <= canvas.height;
        iY += iHeight + iGapY
      ) {
        for (
          let iX = iOriginX;
          iX + iWidth <= canvas.width;
          iX += iWidth + iGapX
        ) {
          if (imported.length >= 256) break;
          const pixels = Array.from(
            { length: iOutputWidth * iOutputHeight },
            (_, i) => {
              const iSourceX = Math.floor((i % iOutputWidth) / nScale),
                iSourceY = Math.floor(Math.floor(i / iOutputWidth) / nScale);
              if (iSourceX >= iWidth || iSourceY >= iHeight) return "";
              const iOffset =
                ((iY + iSourceY) * canvas.width + iX + iSourceX) * 4;
              return data[iOffset + 3] === 0
                ? ""
                : "#" +
                    Array.from(
                      data.slice(
                        iOffset,
                        iOffset + (data[iOffset + 3] === 255 ? 3 : 4),
                      ),
                    )
                      .map((n) => n.toString(16).padStart(2, "0"))
                      .join("");
            },
          );
          if (iSource === 0) {
            const preview =
              element.querySelector<HTMLCanvasElement>("#source-preview")!;
            const context = preview.getContext("2d")!;
            context.strokeStyle = "#ff6200";
            context.lineWidth = Math.max(1, preview.width / 500);
            context.strokeRect(iX, iY, iWidth, iHeight);
            context.fillStyle = "#ff6200";
            context.font = "bold " + Math.max(12, iWidth / 7) + "px sans-serif";
            context.fillText(
              String(imported.length + 1),
              iX + 3,
              iY + Math.max(13, iWidth / 7),
            );
          }
          const iCell = imported.length;
          const strRow = `${iSource}:${Math.floor((iY - iOriginY) / (iHeight + iGapY))}`;
          cellRows.push(strRow);
          imported.push(pixels);
          const preview = document.createElement("canvas");
          preview.className = "asset-thumb";
          draw(preview, pixels, iOutputWidth, iOutputHeight);
          const card = document.createElement("label");
          card.className = "asset-cell";
          const check = document.createElement("input");
          check.type = "checkbox";
          check.checked = !skipped.has(iCell);
          check.dataset.cell = String(iCell);
          check.addEventListener("change", () => {
            if (check.checked) skipped.delete(iCell);
            else skipped.add(iCell);
            refreshGrouping();
          });
          const caption = document.createElement("span");
          caption.dataset.groupCaption = String(iCell);
          card.append(check, preview, caption);
          previews.append(card);
          if (!isSheet) break;
        }
        if (!isSheet) break;
      }
    });
    element.querySelector("[data-info]")!.textContent =
      `${sources.length} 個來源 · ${imported.length} 格（最多 256 格）· 輸出 ${iOutputWidth} × ${iOutputHeight}`;
    renderRowGroups();
    refreshGrouping();
    drawFramePreview();
  };
  function getGroups() {
    const strMode = (element.querySelector("#group-mode") as HTMLSelectElement)
      .value;
    const error = element.querySelector("#group-error")!;
    error.textContent = "";
    const groups: { name: string; indexes: number[] }[] = [];
    if (strMode === "append")
      groups.push({
        name: project.actions[iAction].name,
        indexes: imported.map((_, i) => i).filter((i) => !skipped.has(i)),
      });
    if (strMode === "rows")
      [...new Set(cellRows)].forEach((strRow, i) =>
        groups.push({
          name: rowNames.get(strRow)?.trim() || "動作 " + (i + 1),
          indexes: cellRows.flatMap((strValue, j) =>
            strValue === strRow && !skipped.has(j) ? [j] : [],
          ),
        }),
      );
    if (strMode === "custom") {
      const lines = (
        element.querySelector("#custom-groups") as HTMLTextAreaElement
      ).value
        .split("\n")
        .filter((strLine) => strLine.trim());
      const claimed = new Set<number>();
      const names = new Set<string>();
      for (const strLine of lines) {
        const match = strLine.match(/^([^:：]+)[:：](.+)$/);
        if (!match || !match[1].trim() || match[1].trim().length > 80) {
          error.textContent = "請依「動作名稱:1-4,6」格式輸入，每行一個動作。";
          return null;
        }
        const strName = match[1].trim();
        if (names.has(strName)) {
          error.textContent = "自訂動作名稱不可重複。";
          return null;
        }
        names.add(strName);
        const indexes: number[] = [];
        for (const strPart of match[2].split(/[,，]/)) {
          const range = strPart.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
          if (!range) {
            error.textContent = "影格範圍需為正整數，例如 1-4,6。";
            return null;
          }
          const iStart = Number(range[1]),
            iEnd = Number(range[2] || range[1]);
          if (iStart < 1 || iEnd < iStart || iEnd > imported.length) {
            error.textContent = "影格範圍超出預覽，或起點大於終點。";
            return null;
          }
          for (let i = iStart - 1; i < iEnd; i++) {
            if (claimed.has(i)) {
              error.textContent = "同一影格不可重複分配給多個動作或範圍。";
              return null;
            }
            claimed.add(i);
            if (!skipped.has(i)) indexes.push(i);
          }
        }
        if (indexes.length) groups.push({ name: strName, indexes });
      }
    }
    const usedNames = new Set(project.actions.map((action) => action.name));
    return groups
      .filter((group) => group.indexes.length)
      .map((group) => {
        if (strMode === "append") return group;
        const strBase = group.name;
        let iSuffix = 2;
        while (usedNames.has(group.name))
          group.name = strBase + " (" + iSuffix++ + ")";
        usedNames.add(group.name);
        return group;
      });
  }
  function renderRowGroups() {
    const container = element.querySelector("#row-groups")!;
    container.replaceChildren();
    [...new Set(cellRows)].forEach((strRow, i) => {
      const label = document.createElement("label");
      label.textContent = "第 " + (i + 1) + " 列動作名稱 ";
      const input = document.createElement("input");
      input.value = rowNames.get(strRow) || "動作 " + (i + 1);
      input.maxLength = 80;
      input.dataset.rowName = strRow;
      input.addEventListener("input", () => {
        rowNames.set(strRow, input.value);
        refreshGrouping();
      });
      label.append(input);
      container.append(label);
    });
  }
  function refreshGrouping() {
    const strMode = (element.querySelector("#group-mode") as HTMLSelectElement)
      .value;
    (element.querySelector("#row-groups") as HTMLElement).hidden =
      strMode !== "rows";
    (element.querySelector("#custom-groups-label") as HTMLElement).hidden =
      strMode !== "custom";
    const groups = getGroups();
    (element.querySelector("[data-apply]") as HTMLButtonElement).disabled =
      !groups?.length ||
      !validOutput() ||
      !sources.length ||
      ((element.querySelector("#sheet") as HTMLInputElement).checked &&
        imported.length < 2);
    if (
      (element.querySelector("#sheet") as HTMLInputElement).checked &&
      imported.length < 2 &&
      sources.length
    )
      element.querySelector("[data-info]")!.textContent =
        "動畫圖集至少需切出 2 格，請調整欄數／列數，或選單張圖片。";
    element
      .querySelectorAll<HTMLElement>("[data-group-caption]")
      .forEach((caption) => {
        const i = Number(caption.dataset.groupCaption);
        const group = groups?.find((group) => group.indexes.includes(i));
        caption.textContent =
          "#" +
          (i + 1) +
          " · " +
          (skipped.has(i) ? "略過" : group?.name || "未分組");
        caption.parentElement!.classList.toggle("is-skipped", !group);
      });
  }
  element
    .querySelector("#group-mode")!
    .addEventListener("change", refreshGrouping);
  element
    .querySelector("#custom-groups")!
    .addEventListener("input", refreshGrouping);
  const fileList = () => {
    const list = element.querySelector("[data-files]")!;
    list.replaceChildren();
    sources.forEach((source, i) => {
      const button = document.createElement("button");
      button.textContent = source.name;
      button.insertAdjacentHTML("beforeend", icon("close"));
      button.setAttribute("aria-label", `移除 ${source.name}`);
      button.title = "移除此檔案";
      button.onclick = () => {
        sources.splice(i, 1);
        fileList();
        update();
      };
      list.append(button);
    });
  };
  async function loadFiles(files: File[]) {
    for (const file of files) {
      const strUrl = URL.createObjectURL(file);
      const image = new Image();
      try {
        image.src = strUrl;
        await image.decode();
        if (image.width * image.height > 16777216) {
          element.querySelector("[data-info]")!.textContent =
            "圖片超過 1600 萬像素，請縮小後重試。";
          continue;
        }
        sources.push({ name: file.name, image });
      } catch {
        element.querySelector("[data-info]")!.textContent =
          `無法讀取 ${file.name}`;
      } finally {
        URL.revokeObjectURL(strUrl);
      }
    }
    fileList();
    if (sources.length) {
      const preview =
        element.querySelector<HTMLCanvasElement>("#source-preview")!;
      preview.width = sources[0].image.width;
      preview.height = sources[0].image.height;
      preview.getContext("2d")!.drawImage(sources[0].image, 0, 0);
      suggested = detectSheetGrid(sources[0].image);
      const candidates = sources.map((source) => detectSheetGrid(source.image));
      const isConsistent =
        suggested &&
        candidates.every(
          (candidate) =>
            candidate &&
            candidate.cols === suggested!.cols &&
            candidate.rows === suggested!.rows &&
            candidate.width === suggested!.width &&
            candidate.height === suggested!.height &&
            candidate.x === suggested!.x &&
            candidate.y === suggested!.y,
        );
      if (isConsistent && suggested) {
        selectMode(true);
        (element.querySelector("#layout") as HTMLSelectElement).value = "cell";
        [
          ["cols", suggested.cols],
          ["rows", suggested.rows],
          ["cw", suggested.width],
          ["ch", suggested.height],
          ["ox", suggested.x],
          ["oy", suggested.y],
        ].forEach(
          ([strId, iValue]) =>
            ((element.querySelector("#" + strId) as HTMLInputElement).value =
              String(iValue)),
        );
        element.querySelector("#slice-detection")!.textContent =
          "偵測到規則間隔：" +
          suggested.cols +
          " 欄 × " +
          suggested.rows +
          " 列，請確認切格預覽。";
      } else {
        element.querySelector("#slice-detection")!.textContent =
          "目前以單張匯入；若圖片包含多個姿勢，請選動畫圖集並設定欄／列。";
      }
      if (isNewProject && !hasSuggestedSize) {
        suggestOutput();
        hasSuggestedSize = true;
      }
    }
    update();
  }
  element
    .querySelector("#files")!
    .addEventListener("change", (event) =>
      loadFiles(Array.from((event.target as HTMLInputElement).files || [])),
    );
  element
    .querySelector("#source-preview")!
    .addEventListener("click", (event) => {
      if (!sources.length) return;
      const mouse = event as MouseEvent,
        canvas = event.target as HTMLCanvasElement,
        rect = canvas.getBoundingClientRect();
      const iX = Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.floor(((mouse.clientX - rect.left) / rect.width) * canvas.width),
        ),
      );
      const iY = Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.floor(
            ((mouse.clientY - rect.top) / rect.height) * canvas.height,
          ),
        ),
      );
      const original = document.createElement("canvas");
      original.width = sources[0].image.width;
      original.height = sources[0].image.height;
      original.getContext("2d")!.drawImage(sources[0].image, 0, 0);
      background = Array.from(
        original.getContext("2d")!.getImageData(iX, iY, 1, 1).data,
      );
      (element.querySelector("#remove") as HTMLInputElement).checked = true;
      update();
    });
  element.querySelector("#preset")!.addEventListener("change", (event) => {
    const strSize = (event.target as HTMLSelectElement).value;
    if (!strSize) return;
    (element.querySelector("#cw") as HTMLInputElement).value = strSize;
    (element.querySelector("#ch") as HTMLInputElement).value = strSize;
    update();
  });
  element
    .querySelectorAll(
      ".asset-fields input:not([type=file]), .asset-fields select, #confirm-resize",
    )
    .forEach((input) => input.addEventListener("input", update));
  update();
  if (initialFiles.length) void loadFiles(initialFiles);
  else if (isChooseFiles)
    (element.querySelector("#files") as HTMLInputElement).click();
}
