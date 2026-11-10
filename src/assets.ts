import "./assets.css";
import type { Project } from "./types";
export type AssetProject = Project;
type Apply = (project: AssetProject) => void;
function dialog(strTitle: string, strBody: string, apply: () => void) {
  const element = document.createElement("dialog");
  element.className = "asset-dialog";
  element.innerHTML = `<header><h2>${strTitle}</h2><button type="button" data-close aria-label="關閉">×</button></header><section>${strBody}</section><footer><button data-close>取消</button><button class="primary" data-apply>套用變更</button></footer>`;
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
    '<p>統計所有動作與影格，共用同一組色票，透明像素維持透明。</p><label>目標色數 <select id="colors"><option>8</option><option selected>16</option><option>32</option></select></label><div class="asset-compare"><div>原始<canvas class="asset-preview" data-before></canvas></div><div>減色預覽<canvas class="asset-preview" data-after></canvas></div></div><div class="asset-swatches"></div><p data-info></p>',
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
    const rgb = (strColor: string) =>
      [1, 3, 5].map((i) => parseInt(strColor.slice(i, i + 2), 16));
    const palette = colors.slice(0, 1);
    while (palette.length < Math.min(iLimit, colors.length)) {
      const remaining = colors.filter(
        (strColor) => !palette.includes(strColor),
      );
      remaining.sort((strA, strB) => {
        const score = (strColor: string) =>
          Math.min(
            ...palette.map((strOther) =>
              rgb(strColor).reduce(
                (nSum, nChannel, i) =>
                  nSum + (nChannel - rgb(strOther)[i]) ** 2,
                0,
              ),
            ),
          ) * Math.sqrt(counts.get(strColor)!);
        return score(strB) - score(strA);
      });
      palette.push(remaining[0]);
    }
    const mapping = new Map(
      colors.map((strColor) => [
        strColor,
        [...palette].sort((strA, strB) => {
          const distance = (strOther: string) =>
            rgb(strColor).reduce(
              (nSum, nChannel, i) => nSum + (nChannel - rgb(strOther)[i]) ** 2,
              0,
            );
          return distance(strA) - distance(strB);
        })[0],
      ]),
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
export function openImportDialog(
  project: AssetProject,
  onApply: Apply,
  iAction = 0,
  iFrame = 0,
) {
  const sources: { name: string; image: HTMLImageElement }[] = [];
  let imported: string[][] = [];
  let background: number[] | null = null;
  const element = dialog(
    "匯入圖片與 Sprite Sheet",
    `<p>多張圖片會使用相同縮放比例。可先移除連通背景，再以最近鄰取樣保留像素邊緣。</p><input id="files" type="file" accept="image/*" multiple><div data-files></div><canvas id="source-preview" class="asset-preview" title="點選背景顏色"></canvas><p>點選原圖選取背景色；只移除與圖片外緣連通的同色區域。</p><div class="asset-fields"><label>切割方式 <select id="layout"><option value="cell">指定每格尺寸</option><option value="count">指定欄數與列數</option></select></label><label>欄數 <input id="cols" type="number" min="1" value="1"></label><label>列數 <input id="rows" type="number" min="1" value="1"></label><label>切格預設 <select id="preset"><option value="">自訂</option><option>16</option><option>32</option><option>48</option><option>64</option><option>128</option><option>256</option></select></label><label>切格寬 <input id="cw" type="number" min="1" value="${project.width}"></label><label>切格高 <input id="ch" type="number" min="1" value="${project.height}"></label><label>起點 X <input id="ox" type="number" min="0" value="0"></label><label>起點 Y <input id="oy" type="number" min="0" value="0"></label><label>水平間距 <input id="gx" type="number" min="0" value="0"></label><label>垂直間距 <input id="gy" type="number" min="0" value="0"></label><label>共用縮放倍率 <input id="scale" type="number" min="0.01" max="16" step="0.1" value="1"></label><label><input id="sheet" type="checkbox">依格線切割</label><label><input id="remove" type="checkbox">移除外緣連通背景</label><label>加入為 <select id="target"><option value="pixels">可編輯像素</option><option value="reference">參考底圖</option></select></label></div><div class="asset-import-previews"></div><p data-info></p>`,
    () => {
      if (!imported.length) return;
      const next = structuredClone(project);
      const isReference =
        (element.querySelector("#target") as HTMLSelectElement).value ===
        "reference";
      if (isReference) {
        imported.forEach((pixels, i) => {
          const target = next.actions[iAction].frames[iFrame + i];
          if (target) target.reference = pixels;
          else
            next.actions[iAction].frames.push({
              pixels: Array(project.width * project.height).fill(""),
              reference: pixels,
            });
        });
      } else {
        next.actions[iAction].frames.splice(
          iFrame + 1,
          0,
          ...imported.map((pixels) => ({ pixels })),
        );
      }
      next.palette = [
        ...new Set([
          ...next.palette,
          ...imported
            .flat()
            .filter(Boolean)
            .map((strColor) => strColor.slice(0, 7)),
        ]),
      ].slice(0, 256);
      onApply(next);
      element.close();
    },
  );
  const update = () => {
    imported = [];
    const iCellWidth = numberValue(element, "cw"),
      iCellHeight = numberValue(element, "ch");
    const iOriginX = numberValue(element, "ox"),
      iOriginY = numberValue(element, "oy");
    const iGapX = numberValue(element, "gx"),
      iGapY = numberValue(element, "gy"),
      nScale = numberValue(element, "scale");
    if (
      ![iCellWidth, iCellHeight].every((i) => Number.isInteger(i) && i > 0) ||
      ![iOriginX, iOriginY, iGapX, iGapY].every(
        (i) => Number.isInteger(i) && i >= 0,
      ) ||
      nScale <= 0 ||
      nScale > 16
    ) {
      element.querySelector("[data-info]")!.textContent =
        "請輸入有效切格尺寸、間距與倍率。";
      return;
    }
    const previews = element.querySelector(".asset-import-previews")!;
    previews.replaceChildren();
    sources.forEach((source) => {
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
            { length: project.width * project.height },
            (_, i) => {
              const iSourceX = Math.floor((i % project.width) / nScale),
                iSourceY = Math.floor(Math.floor(i / project.width) / nScale);
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
          imported.push(pixels);
          const preview = document.createElement("canvas");
          preview.className = "asset-thumb";
          draw(preview, pixels, project.width, project.height);
          previews.append(preview);
          if (!isSheet) break;
        }
        if (!isSheet) break;
      }
    });
    element.querySelector("[data-info]")!.textContent =
      `${sources.length} 個來源 · ${imported.length} 格（最多 256 格）· 輸出 ${project.width} × ${project.height}`;
  };
  const fileList = () => {
    const list = element.querySelector("[data-files]")!;
    list.replaceChildren();
    sources.forEach((source, i) => {
      const button = document.createElement("button");
      button.textContent = `${source.name} ×`;
      button.title = "移除此檔案";
      button.onclick = () => {
        sources.splice(i, 1);
        fileList();
        update();
      };
      list.append(button);
    });
  };
  element.querySelector("#files")!.addEventListener("change", async (event) => {
    const files = Array.from((event.target as HTMLInputElement).files || []);
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
      if (!(element.querySelector("#sheet") as HTMLInputElement).checked) {
        const nFit = Math.min(
          1,
          project.width /
            Math.max(...sources.map((source) => source.image.width)),
          project.height /
            Math.max(...sources.map((source) => source.image.height)),
        );
        (element.querySelector("#scale") as HTMLInputElement).value =
          String(nFit);
      }
    }
    update();
  });
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
      background = Array.from(
        canvas.getContext("2d")!.getImageData(iX, iY, 1, 1).data,
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
    .querySelectorAll("input:not([type=file]), select")
    .forEach((input) => input.addEventListener("input", update));
  update();
}
export function createSampleProject(): AssetProject {
  const iWidth = 32,
    iHeight = 32;
  const frames = Array.from({ length: 4 }, (_, iFrame) => {
    const pixels = Array<string>(iWidth * iHeight).fill("");
    const box = (
      iX: number,
      iY: number,
      iW: number,
      iH: number,
      strColor: string,
    ) => {
      for (let i = iY; i < iY + iH; i++)
        for (let j = iX; j < iX + iW; j++) pixels[i * iWidth + j] = strColor;
    };
    const iBob = iFrame % 2;
    box(11, 4 + iBob, 10, 3, "#392c50");
    box(9, 7 + iBob, 14, 7, "#392c50");
    box(11, 7 + iBob, 10, 7, "#f7c796");
    box(10, 6 + iBob, 12, 3, "#8857b7");
    box(17, 10 + iBob, 2, 2, "#392c50");
    box(10, 14 + iBob, 12, 9, "#8857b7");
    box(10, 21 + iBob, 12, 2, "#e6a854");
    box(7, 15 + iBob, 3, 7, "#f7c796");
    box(22, 15 + iBob, 3, 7, "#f7c796");
    box(11, 23, 4, 5 - iBob, "#394c69");
    box(17, 23, 4, 5 - (1 - iBob), "#394c69");
    box(9 + iBob, 28 - iBob, 6, 2, "#392c50");
    box(17, 27 + iBob, 6, 2, "#392c50");
    return { pixels };
  });
  return {
    name: "紫帽冒險家",
    width: iWidth,
    height: iHeight,
    pivot: { x: 16, y: 29 },
    palette: [
      "#392c50",
      "#8857b7",
      "#f7c796",
      "#e6a854",
      "#394c69",
      "#75c9a1",
      "#f6f0dd",
      "#d66a74",
    ],
    actions: [{ name: "行走", fps: 8, loop: true, frames }],
  };
}
