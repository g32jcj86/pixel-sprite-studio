import { createRegistrationControls } from "./registration-ui";
import {
  alphaSummary,
  pixelsToRgba,
  detectBakedChecker,
  removeBakedChecker,
  removeExteriorColor,
  type CheckerModel,
} from "./alpha";
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
function alphaBounds(pixels: string[], width: number) {
  let left = width,
    right = -1,
    top = pixels.length / width,
    bottom = -1;
  pixels.forEach((color, i) => {
    if (!color || (color.length === 9 && parseInt(color.slice(7, 9), 16) === 0))
      return;
    const x = i % width,
      y = Math.floor(i / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  });
  return right < 0
    ? null
    : {
        left,
        right,
        top,
        bottom,
        center: Math.floor((left + right) / 2),
        width: right - left + 1,
        height: bottom - top + 1,
      };
}
const ANCHORS = [
  ["top-left", "左上"],
  ["top-center", "上中"],
  ["top-right", "右上"],
  ["middle-left", "左中"],
  ["center", "正中"],
  ["middle-right", "右中"],
  ["bottom-left", "左下"],
  ["bottom-center", "下中"],
  ["bottom-right", "右下"],
] as const;
function sourceAnchor(
  bounds: NonNullable<ReturnType<typeof alphaBounds>>,
  code: string,
) {
  const i = ANCHORS.findIndex((anchor) => anchor[0] === code),
    column = i % 3,
    row = Math.floor(i / 3);
  return {
    x: column === 0 ? bounds.left : column === 2 ? bounds.right : bounds.center,
    y:
      row === 0
        ? bounds.top
        : row === 2
          ? bounds.bottom
          : Math.floor((bounds.top + bounds.bottom) / 2),
  };
}
function canvasAnchor(width: number, height: number, code: string) {
  const i = ANCHORS.findIndex((anchor) => anchor[0] === code),
    column = i % 3,
    row = Math.floor(i / 3);
  return {
    x: column === 0 ? 1 : column === 2 ? width - 2 : Math.floor(width / 2),
    y: row === 0 ? 1 : row === 2 ? height - 2 : Math.floor(height / 2),
  };
}
function anchorGrid(attribute: string, title: string) {
  return (
    '<fieldset class="anchor-choice"><legend>' +
    title +
    '</legend><div class="anchor-grid">' +
    ANCHORS.map(
      ([code, label]) =>
        '<button type="button" ' +
        attribute +
        '="' +
        code +
        '" aria-label="' +
        title +
        " " +
        label +
        '">' +
        label +
        "</button>",
    ).join("") +
    "</div></fieldset>"
  );
}
function canvasClickPoint(canvas: HTMLCanvasElement, event: MouseEvent) {
  const rect = canvas.getBoundingClientRect(),
    scale = Math.min(
      canvas.clientWidth / canvas.width,
      canvas.clientHeight / canvas.height,
    );
  const x = Math.floor(
      (event.clientX - rect.left - (rect.width - canvas.width * scale) / 2) /
        scale,
    ),
    y = Math.floor(
      (event.clientY - rect.top - (rect.height - canvas.height * scale) / 2) /
        scale,
    );
  return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height
    ? { x, y }
    : null;
}
export function openAlignmentDialog(
  project: AssetProject,
  onApply: Apply,
  iAction = 0,
  iInitialFrame = 0,
) {
  let next = structuredClone(project);
  const frames = project.actions[iAction].frames;
  const points = frames.map(() => ({ ...project.pivot }));
  let alignmentSource = "bottom-center",
    alignmentTarget = "existing";
  const element = dialog(
    "批次對齊與手動定位",
    `<p>選擇角色錨點與畫布定位點；也可在原圖或定位預覽點選自訂位置。</p><p>只調整目前動作，其他動作（例如跳躍）保持原狀。</p><div class="asset-frame-selection">${frames.map((_, i) => `<label><input type="checkbox" data-align-frame="${i}" checked>第 ${i + 1} 格</label>`).join("")}</div><label>模式 <select id="mode"><option value="auto">依角色錨點預設</option><option value="manual">逐格手動點選</option></select></label><label>影格 <input id="frame" type="number" min="1" max="${frames.length}" value="${Math.max(1, Math.min(frames.length, iInitialFrame + 1))}"></label><label>畫布 X <input id="px" type="number" value="${project.pivot.x}"></label><label>畫布 Y <input id="py" type="number" value="${project.pivot.y}"></label><label><input id="alignment-onion" type="checkbox" checked>前後影格洋蔥皮</label><div class="alignment-nudge"><span>微調目前格</span><button type="button" data-alignment-nudge="-1,0" aria-label="目前格向左一像素">${icon("arrowLeft")}</button><button type="button" data-alignment-nudge="0,-1" aria-label="目前格向上一像素">${icon("arrowUp")}</button><button type="button" data-alignment-nudge="0,1" aria-label="目前格向下一像素">${icon("arrowDown")}</button><button type="button" data-alignment-nudge="1,0" aria-label="目前格向右一像素">${icon("arrowRight")}</button></div><div class="asset-compare"><div>點選原始位置<canvas data-source class="asset-preview"></canvas></div><div>對齊預覽<canvas data-result class="asset-preview"></canvas></div></div><p data-info></p>`,
    () => {
      onApply(next);
      element.close();
    },
  );
  const choices = document.createElement("div");
  choices.className = "anchor-choices";
  choices.innerHTML =
    anchorGrid("data-alignment-source-anchor", "角色錨點") +
    anchorGrid("data-alignment-target-anchor", "畫布定位點");
  element.querySelector(".asset-frame-selection")!.after(choices);
  const alignmentRegistration = createRegistrationControls(() => update()),
    alignmentManual = new Map<number, { x: number; y: number }>();
  const method = document.createElement("label");
  method.innerHTML =
    '定位方式 <select id="alignment-method"><option value="patch">自動定位（局部特徵比對）</option><option value="anchors">進階：外框／自訂錨點</option></select>';
  const legacy = document.createElement("div");
  legacy.className = "bbox-registration-settings";
  [
    choices,
    element.querySelector("#mode")!.closest("label")!,
    element.querySelector("#px")!.closest("label")!,
    element.querySelector("#py")!.closest("label")!,
  ].forEach((node) => legacy.append(node));
  element
    .querySelector(".asset-frame-selection")!
    .after(method, alignmentRegistration.element, legacy);
  element.querySelector("section > p")!.textContent =
    "以參考影格的局部細節比對其他影格，不用外框或重心代替特徵；低信心位置需放大確認。";
  element
    .querySelector("#alignment-method")!
    .addEventListener("change", () => update());
  let playTimer = 0;
  const play = document.createElement("button");
  play.id = "alignment-play";
  play.type = "button";
  play.innerHTML = icon("play") + "播放前後對比";
  element.querySelector("#frame")!.closest("label")!.after(play);
  play.onclick = () => {
    if (playTimer) {
      window.clearInterval(playTimer);
      playTimer = 0;
    } else
      playTimer = window.setInterval(() => {
        const input = element.querySelector<HTMLInputElement>("#frame")!;
        input.value = String((Number(input.value) % frames.length) + 1);
        update();
      }, 180);
    play.innerHTML =
      icon(playTimer ? "pause" : "play") +
      (playTimer ? "暫停" : "播放前後對比");
  };
  element.addEventListener("close", () => window.clearInterval(playTimer));
  const sourcePatch = document.createElement("span"),
    resultPatch = document.createElement("span");
  [
    { selector: "[data-source]", marker: sourcePatch },
    { selector: "[data-result]", marker: resultPatch },
  ].forEach(({ selector, marker }) => {
    marker.className = "registration-small-patch";
    marker.setAttribute("aria-hidden", "true");
    const parent = element.querySelector(selector)!.parentElement!;
    parent.style.position = "relative";
    parent.append(marker);
  });
  element
    .querySelectorAll<HTMLElement>("[data-alignment-source-anchor]")
    .forEach(
      (button) =>
        (button.onclick = () => {
          alignmentSource = button.dataset.alignmentSourceAnchor!;
          (element.querySelector("#mode") as HTMLSelectElement).value = "auto";
          update();
        }),
    );
  element
    .querySelectorAll<HTMLElement>("[data-alignment-target-anchor]")
    .forEach(
      (button) =>
        (button.onclick = () => {
          alignmentTarget = button.dataset.alignmentTargetAnchor!;
          const preferred = canvasAnchor(
              project.width,
              project.height,
              alignmentTarget,
            ),
            mode = (element.querySelector("#mode") as HTMLSelectElement).value;
          const selected = frames.flatMap((frame, i) => {
            const bounds = alphaBounds(frame.pixels, project.width);
            return bounds &&
              (
                element.querySelector(
                  '[data-align-frame="' + i + '"]',
                ) as HTMLInputElement
              ).checked
              ? [
                  {
                    bounds,
                    point:
                      mode === "auto"
                        ? sourceAnchor(bounds, alignmentSource)
                        : points[i],
                  },
                ]
              : [];
          });
          let x = preferred.x,
            y = preferred.y;
          if (selected.length) {
            x = Math.max(
              0,
              ...selected.map(({ bounds, point }) => point.x - bounds.left),
              Math.min(
                project.width -
                  1 -
                  Math.max(
                    0,
                    ...selected.map(
                      ({ bounds, point }) => bounds.right - point.x,
                    ),
                  ),
                x,
              ),
            );
            y = Math.max(
              0,
              ...selected.map(({ bounds, point }) => point.y - bounds.top),
              Math.min(
                project.height -
                  1 -
                  Math.max(
                    0,
                    ...selected.map(
                      ({ bounds, point }) => bounds.bottom - point.y,
                    ),
                  ),
                y,
              ),
            );
          }
          (element.querySelector("#px") as HTMLInputElement).value = String(x);
          (element.querySelector("#py") as HTMLInputElement).value = String(y);
          update();
        }),
    );
  element
    .querySelector<HTMLCanvasElement>("[data-result]")!
    .addEventListener("click", (event) => {
      if (
        (element.querySelector("#alignment-method") as HTMLSelectElement)
          .value === "patch"
      )
        return;
      const point = canvasClickPoint(
        event.currentTarget as HTMLCanvasElement,
        event,
      );
      if (!point) return;
      alignmentTarget = "custom";
      (element.querySelector("#px") as HTMLInputElement).value = String(
        point.x,
      );
      (element.querySelector("#py") as HTMLInputElement).value = String(
        point.y,
      );
      update();
    });
  ["px", "py"].forEach((id) =>
    element.querySelector("#" + id)!.addEventListener("input", () => {
      alignmentTarget = "custom";
    }),
  );
  const update = () => {
    const isPatch =
      (element.querySelector("#alignment-method") as HTMLSelectElement)
        .value === "patch";
    legacy.hidden = isPatch;
    alignmentRegistration.element.hidden = !isPatch;
    let patchInfo = "";
    element
      .querySelectorAll<HTMLElement>("[data-alignment-source-anchor]")
      .forEach((button) => {
        const active =
          button.dataset.alignmentSourceAnchor === alignmentSource &&
          (element.querySelector("#mode") as HTMLSelectElement).value ===
            "auto";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    element
      .querySelectorAll<HTMLElement>("[data-alignment-target-anchor]")
      .forEach((button) => {
        const active = button.dataset.alignmentTargetAnchor === alignmentTarget;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    const iFrame = Math.max(
      0,
      Math.min(frames.length - 1, numberValue(element, "frame") - 1),
    );
    const iX = numberValue(element, "px"),
      iY = numberValue(element, "py");
    next = structuredClone(project);
    if (isPatch) {
      const selected = frames.flatMap((_, i) =>
          (
            element.querySelector(
              '[data-align-frame="' + i + '"]',
            ) as HTMLInputElement
          ).checked
            ? [i]
            : [],
        ),
        plan = alignmentRegistration.resolve(
          frames.map((frame) => frame.pixels),
          project.width,
          project.height,
          selected,
        ),
        reference = selected[0];
      const shifts = frames.map((_, i) => {
        const extra = alignmentManual.get(i) || { x: 0, y: 0 };
        return selected.includes(i) && i !== reference
          ? { x: plan.matches[i].dx + extra.x, y: plan.matches[i].dy + extra.y }
          : { x: 0, y: 0 };
      });
      const clipped = selected.some((i) => {
        const b = alphaBounds(frames[i].pixels, project.width);
        return (
          b &&
          (b.left + shifts[i].x < 0 ||
            b.right + shifts[i].x >= project.width ||
            b.top + shifts[i].y < 0 ||
            b.bottom + shifts[i].y >= project.height)
        );
      });
      const valid = plan.valid && !clipped;
      (element.querySelector("[data-apply]") as HTMLButtonElement).disabled =
        !valid;
      if (valid)
        next.actions[iAction].frames.forEach((frame, i) => {
          frame.pixels = mapSize(
            frame.pixels,
            project.width,
            project.height,
            project.width,
            project.height,
            false,
            shifts[i].x,
            shifts[i].y,
          );
        });
      patchInfo = clipped
        ? "位移會超出畫布，已停止套用以免裁切。"
        : !plan.valid
          ? "尚有位置需手動確認；請放大參考影格選特徵，或逐格指定相符點。"
          : "局部特徵比對可靠／已確認；參考影格、定位點與參考圖不變，僅平移選取的像素。";
    } else {
      (element.querySelector("[data-apply]") as HTMLButtonElement).disabled =
        false;
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
          const bounds = alphaBounds(frame.pixels, project.width);
          if (bounds) point = sourceAnchor(bounds, alignmentSource);
          points[iCurrent] = point;
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
    }
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
    if (
      (element.querySelector("#alignment-onion") as HTMLInputElement).checked
    ) {
      [
        {
          canvas: element.querySelector<HTMLCanvasElement>("[data-source]")!,
          list: frames,
        },
        {
          canvas: element.querySelector<HTMLCanvasElement>("[data-result]")!,
          list: next.actions[iAction].frames,
        },
      ].forEach(({ canvas, list }) => {
        draw(canvas, [], project.width, project.height);
        const context = canvas.getContext("2d")!,
          temp = document.createElement("canvas");
        [iFrame - 1, iFrame + 1].forEach((i) => {
          if (!list[i]) return;
          draw(temp, list[i].pixels, project.width, project.height);
          context.globalAlpha = 0.18;
          context.drawImage(temp, 0, 0);
        });
        draw(temp, list[iFrame].pixels, project.width, project.height);
        context.globalAlpha = 1;
        context.drawImage(temp, 0, 0);
      });
    }
    const current = alignmentRegistration.current();
    [
      {
        canvas: element.querySelector<HTMLCanvasElement>("[data-source]")!,
        marker: sourcePatch,
        point: current.matches[iFrame]?.found,
      },
      {
        canvas: element.querySelector<HTMLCanvasElement>("[data-result]")!,
        marker: resultPatch,
        point: current.point,
      },
    ].forEach(({ canvas, marker, point }) => {
      marker.hidden = !isPatch || !point;
      if (marker.hidden || !point) return;
      const r = canvas.getBoundingClientRect(),
        parent = canvas.parentElement!.getBoundingClientRect(),
        scale = Math.min(
          canvas.clientWidth / canvas.width,
          canvas.clientHeight / canvas.height,
        );
      marker.style.left =
        r.left -
        parent.left +
        (r.width - canvas.width * scale) / 2 +
        (point.x - current.radius) * scale +
        "px";
      marker.style.top =
        r.top -
        parent.top +
        (r.height - canvas.height * scale) / 2 +
        (point.y - current.radius) * scale +
        "px";
      marker.style.width = marker.style.height =
        (current.radius * 2 + 1) * scale + "px";
    });
    element.querySelector("[data-info]")!.textContent = isPatch
      ? patchInfo
      : `第 ${iFrame + 1} 格 · 手動定位 (${points[iFrame].x}, ${points[iFrame].y}) · 超出畫布部分將裁切`;
  };
  element
    .querySelectorAll<HTMLElement>("[data-alignment-nudge]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const i = Math.max(
          0,
          Math.min(frames.length - 1, numberValue(element, "frame") - 1),
        );
        const [x, y] = button.dataset.alignmentNudge!.split(",").map(Number);
        if (
          (element.querySelector("#alignment-method") as HTMLSelectElement)
            .value === "patch"
        ) {
          const old = alignmentManual.get(i) || { x: 0, y: 0 };
          alignmentManual.set(i, { x: old.x + x, y: old.y + y });
          update();
          return;
        }
        points[i] = { x: points[i].x - x, y: points[i].y - y };
        (element.querySelector("#mode") as HTMLSelectElement).value = "manual";
        update();
      }),
    );
  element.querySelector("[data-source]")!.addEventListener("click", (event) => {
    const canvas = event.currentTarget as HTMLCanvasElement,
      point = canvasClickPoint(canvas, event as MouseEvent);
    if (!point) return;
    const iFrame = Math.max(
      0,
      Math.min(frames.length - 1, numberValue(element, "frame") - 1),
    );
    if (
      (element.querySelector("#alignment-method") as HTMLSelectElement)
        .value === "patch"
    ) {
      alignmentRegistration.setFramePoint(iFrame, point);
      return;
    }
    points[iFrame] = point;
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
  const sources: {
    name: string;
    image: HTMLImageElement;
    alpha: ReturnType<typeof alphaSummary>;
    checker: CheckerModel | null;
  }[] = [];
  let imported: string[][] = [];
  let unaligned: string[][] = [];
  let repositionValid = true;
  const repositionExcluded = new Set<number>();
  const manualOffsets = new Map<number, { x: number; y: number }>();
  const manualSources = new Map<number, { x: number; y: number }>();
  let sourcePreset = "bottom-center",
    targetPreset = isNewProject ? "bottom-center" : "existing";
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
      if (!validOutput() || !repositionValid) return;
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
                    reference: [...imported[i]],
                  }
                : { pixels: [...imported[i]] },
            ),
          });
        });
      } else if (isReference) {
        groups[0].indexes.forEach((iSource, i) => {
          const pixels = [...imported[iSource]];
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
          ...groups[0].indexes.map((i) => ({ pixels: [...imported[i]] })),
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
      if (isNewProject)
        next.pivot = { x: Math.floor(iOutputWidth / 2), y: iOutputHeight - 1 };
      if (
        (element.querySelector("#reposition-import") as HTMLInputElement)
          .checked &&
        (element.querySelector("#reposition-method") as HTMLSelectElement)
          .value === "anchors" &&
        (element.querySelector("#reposition-update-pivot") as HTMLInputElement)
          .checked
      )
        next.pivot = {
          x: numberValue(element, "reposition-x"),
          y: numberValue(element, "reposition-y"),
        };
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
  const alphaCard = document.createElement("div");
  alphaCard.className = "import-alpha-card";
  alphaCard.hidden = true;
  alphaCard.innerHTML =
    '<strong>圖片實際透明度</strong><p id="import-source-alpha"></p><p id="import-output-alpha"></p><label><input id="remove-baked-checker" type="checkbox">預覽移除圖片內已畫入的外連棋盤</label><p id="import-checker-status"></p>';
  simple.querySelector(".import-live-preview")!.after(alphaCard);
  const reposition = document.createElement("div");
  reposition.className = "import-reposition";
  reposition.innerHTML =
    '<label class="reposition-enable"><input id="reposition-import" type="checkbox">重新定位角色</label><div id="reposition-controls" hidden><p>角色錨點取自每格實際透明輪廓，再移到共用畫布定位點；跳躍等影格可取消勾選。</p><label><input id="reposition-auto-anchor" type="checkbox" checked>依畫布預設自動定位，保留安全留白</label><label>畫布 X<input id="reposition-x" type="number" value="0"></label><label>畫布 Y<input id="reposition-y" type="number" value="0"></label><label><input id="reposition-update-pivot" type="checkbox">同時更新角色定位點</label><div id="reposition-frames"></div><div class="reposition-nudge"><span id="reposition-manual-label">微調目前預覽格</span><button type="button" data-reposition-nudge="-1,0" aria-label="預覽格向左一像素">' +
    icon("arrowLeft") +
    '</button><button type="button" data-reposition-nudge="0,-1" aria-label="預覽格向上一像素">' +
    icon("arrowUp") +
    '</button><button type="button" data-reposition-nudge="0,1" aria-label="預覽格向下一像素">' +
    icon("arrowDown") +
    '</button><button type="button" data-reposition-nudge="1,0" aria-label="預覽格向右一像素">' +
    icon("arrowRight") +
    '</button><button id="reposition-reset" type="button">重置手動位移</button></div><button id="reposition-background" type="button">先處理背景</button><p id="reposition-status" role="status"></p></div>';
  simple.querySelector(".import-live-preview")!.before(reposition);
  (
    element.querySelector("#reposition-update-pivot") as HTMLInputElement
  ).checked = isNewProject;
  const anchorChoices = document.createElement("div");
  anchorChoices.className = "anchor-choices";
  anchorChoices.innerHTML =
    anchorGrid("data-source-anchor", "角色錨點") +
    anchorGrid("data-target-anchor", "畫布定位點");
  element.querySelector("#reposition-controls > p")!.after(anchorChoices);
  const sourceInfo = document.createElement("p");
  sourceInfo.id = "reposition-source-anchor-info";
  sourceInfo.textContent =
    "點選「定位前」可指定本格角色錨點；點選「定位後」可指定共用畫布定位點。";
  anchorChoices.after(sourceInfo);
  const methodLabel = document.createElement("label");
  methodLabel.innerHTML =
    '定位方式 <select id="reposition-method"><option value="patch">自動定位（局部特徵比對）</option><option value="anchors">進階：外框錨點定位</option></select>';
  const registration = createRegistrationControls(() => refreshGrouping());
  const bboxSettings = document.createElement("div");
  bboxSettings.className = "bbox-registration-settings";
  [
    anchorChoices,
    sourceInfo,
    element.querySelector("#reposition-auto-anchor")!.closest("label")!,
    element.querySelector("#reposition-x")!.closest("label")!,
    element.querySelector("#reposition-y")!.closest("label")!,
    element.querySelector("#reposition-update-pivot")!.closest("label")!,
  ].forEach((node) => bboxSettings.append(node));
  const repositionControls = element.querySelector("#reposition-controls")!;
  repositionControls.prepend(methodLabel, registration.element, bboxSettings);
  (repositionControls.querySelector("p") as HTMLElement).textContent =
    "以第一格的穩定細節比對其他影格；可靠或手動確認後才套用。";
  element
    .querySelector("#reposition-method")!
    .addEventListener("change", refreshGrouping);
  const beforePreview = document.createElement("div");
  beforePreview.className = "import-before-position";
  beforePreview.hidden = true;
  beforePreview.innerHTML =
    '<span>定位前</span><canvas id="frame-preview-before"></canvas>';
  const live = simple.querySelector(".import-live-preview")!;
  const afterPreview = document.createElement("div");
  afterPreview.className = "import-after-position";
  const afterCaption = document.createElement("span");
  afterCaption.textContent = "定位後";
  afterCaption.hidden = true;
  const outputCanvas = live.querySelector<HTMLCanvasElement>("#frame-preview")!;
  outputCanvas.before(afterPreview);
  afterPreview.append(afterCaption, outputCanvas);
  live.prepend(beforePreview);
  const sourceMarker = document.createElement("span"),
    targetMarker = document.createElement("span");
  sourceMarker.className = targetMarker.className = "anchor-point-marker";
  sourceMarker.setAttribute("aria-hidden", "true");
  targetMarker.setAttribute("aria-hidden", "true");
  beforePreview.append(sourceMarker);
  afterPreview.append(targetMarker);
  function refreshAnchorButtons() {
    element
      .querySelectorAll<HTMLElement>("[data-source-anchor]")
      .forEach((button) => {
        const active = button.dataset.sourceAnchor === sourcePreset;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    element
      .querySelectorAll<HTMLElement>("[data-target-anchor]")
      .forEach((button) => {
        const active = button.dataset.targetAnchor === targetPreset;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
  }
  element.querySelectorAll<HTMLElement>("[data-source-anchor]").forEach(
    (button) =>
      (button.onclick = () => {
        sourcePreset = button.dataset.sourceAnchor!;
        manualSources.clear();
        refreshGrouping();
      }),
  );
  element.querySelectorAll<HTMLElement>("[data-target-anchor]").forEach(
    (button) =>
      (button.onclick = () => {
        targetPreset = button.dataset.targetAnchor!;
        (
          element.querySelector("#reposition-auto-anchor") as HTMLInputElement
        ).checked = true;
        refreshGrouping();
      }),
  );
  element
    .querySelector<HTMLCanvasElement>("#frame-preview-before")!
    .addEventListener("click", (event) => {
      const point = canvasClickPoint(
        event.currentTarget as HTMLCanvasElement,
        event,
      );
      if (point) {
        if (
          (element.querySelector("#reposition-method") as HTMLSelectElement)
            .value === "patch"
        ) {
          registration.setFramePoint(iPreview, point);
          return;
        }
        manualSources.set(iPreview, point);
        refreshGrouping();
      }
    });
  outputCanvas.addEventListener("click", (event) => {
    if (
      (element.querySelector("#reposition-method") as HTMLSelectElement)
        .value === "patch"
    )
      return;
    const point = canvasClickPoint(outputCanvas, event);
    if (point) {
      targetPreset = "custom";
      (
        element.querySelector("#reposition-auto-anchor") as HTMLInputElement
      ).checked = false;
      (element.querySelector("#reposition-x") as HTMLInputElement).value =
        String(point.x);
      (element.querySelector("#reposition-y") as HTMLInputElement).value =
        String(point.y);
      refreshGrouping();
    }
  });
  function applyReposition(indexes: number[]) {
    imported = unaligned.map((pixels) => [...pixels]);
    repositionValid = true;
    const enabled = (
      element.querySelector("#reposition-import") as HTMLInputElement
    ).checked;
    (element.querySelector("#reposition-controls") as HTMLElement).hidden =
      !enabled;
    beforePreview.hidden = !enabled;
    afterCaption.hidden = !enabled;
    if (!enabled) return;
    const list = element.querySelector<HTMLElement>("#reposition-frames")!;
    if (list.dataset.count !== String(imported.length)) {
      list.replaceChildren();
      list.dataset.count = String(imported.length);
      imported.forEach((_, i) => {
        const label = document.createElement("label"),
          check = document.createElement("input"),
          offset = document.createElement("span");
        check.type = "checkbox";
        check.dataset.repositionFrame = String(i);
        check.checked = !repositionExcluded.has(i);
        check.onchange = () => {
          if (check.checked) repositionExcluded.delete(i);
          else repositionExcluded.add(i);
          refreshGrouping();
        };
        offset.dataset.repositionOffset = String(i);
        label.append(
          check,
          document.createTextNode("第 " + (i + 1) + " 格 "),
          offset,
        );
        list.append(label);
      });
    }
    const bounds = imported.map((pixels) => alphaBounds(pixels, iOutputWidth));
    const anchors = bounds.map((bounds, i) =>
      bounds
        ? manualSources.get(i) || sourceAnchor(bounds, sourcePreset)
        : null,
    );
    refreshAnchorButtons();
    const selected = indexes.filter(
      (i) => !repositionExcluded.has(i) && bounds[i],
    );
    const isPatch =
      (element.querySelector("#reposition-method") as HTMLSelectElement)
        .value === "patch";
    bboxSettings.hidden = isPatch;
    registration.element.hidden = !isPatch;
    const opaque = selected.filter(
      (i) =>
        !unaligned[i].some(
          (color) =>
            !color ||
            (color.length === 9 && parseInt(color.slice(7, 9), 16) === 0),
        ),
    );
    if (isPatch) {
      const plan = registration.resolve(
          unaligned,
          iOutputWidth,
          iOutputHeight,
          selected,
        ),
        reference = selected[0];
      const shifts = imported.map((_, i) => {
        const manual = manualOffsets.get(i) || { x: 0, y: 0 };
        return selected.includes(i) && i !== reference
          ? {
              x: plan.matches[i].dx + manual.x,
              y: plan.matches[i].dy + manual.y,
            }
          : { x: 0, y: 0 };
      });
      const clipped = selected.some(
        (i) =>
          bounds[i] &&
          (bounds[i]!.left + shifts[i].x < 0 ||
            bounds[i]!.top + shifts[i].y < 0 ||
            bounds[i]!.right + shifts[i].x >= iOutputWidth ||
            bounds[i]!.bottom + shifts[i].y >= iOutputHeight),
      );
      repositionValid = plan.valid && !opaque.length && !clipped;
      element.querySelector("#reposition-status")!.textContent = opaque.length
        ? "選取影格沒有空白透明區域，請先處理背景，再辨識角色特徵。"
        : clipped
          ? "比對後有像素超出畫布，不會裁切套用。請保留更多留白或手動調整。"
          : !plan.valid
            ? "尚有不可靠的特徵位置：請放大選參考細節，並確認或手動指定各格相符點。"
            : "局部特徵比對完成；參考影格不移動，僅平移其他選取影格，像素與 Alpha 保持原樣。";
      element
        .querySelector<HTMLElement>("#reposition-status")!
        .classList.toggle("is-error", !repositionValid);
      element
        .querySelectorAll<HTMLElement>("[data-reposition-offset]")
        .forEach((span) => {
          const i = Number(span.dataset.repositionOffset);
          span.textContent = !indexes.includes(i)
            ? "不匯入"
            : repositionExcluded.has(i)
              ? "保留原位置"
              : !bounds[i]
                ? "空白"
                : i === reference
                  ? "參考格不移動"
                  : "X " +
                    shifts[i].x +
                    " / Y " +
                    shifts[i].y +
                    " · " +
                    (plan.matches[i]?.reliable ? "可靠／已確認" : "需確認");
        });
      if (repositionValid)
        imported = imported.map((pixels, i) =>
          mapSize(
            pixels,
            iOutputWidth,
            iOutputHeight,
            iOutputWidth,
            iOutputHeight,
            false,
            shifts[i].x,
            shifts[i].y,
          ),
        );
      return;
    }
    if (
      (element.querySelector("#reposition-auto-anchor") as HTMLInputElement)
        .checked &&
      selected.length
    ) {
      const maxLeft = Math.max(
          ...selected.map((i) => anchors[i]!.x - bounds[i]!.left),
        ),
        maxRight = Math.max(
          ...selected.map((i) => bounds[i]!.right - anchors[i]!.x),
        );
      const maxTop = Math.max(
          ...selected.map((i) => anchors[i]!.y - bounds[i]!.top),
        ),
        maxBottom = Math.max(
          ...selected.map((i) => bounds[i]!.bottom - anchors[i]!.y),
        );
      const preferred =
        targetPreset === "existing"
          ? {
              x: Math.round((project.pivot.x * iOutputWidth) / project.width),
              y: Math.round((project.pivot.y * iOutputHeight) / project.height),
            }
          : canvasAnchor(iOutputWidth, iOutputHeight, targetPreset);
      (element.querySelector("#reposition-x") as HTMLInputElement).value =
        String(
          Math.max(
            Math.max(0, maxLeft),
            Math.min(iOutputWidth - 1 - Math.max(0, maxRight), preferred.x),
          ),
        );
      (element.querySelector("#reposition-y") as HTMLInputElement).value =
        String(
          Math.max(
            Math.max(0, maxTop),
            Math.min(iOutputHeight - 1 - Math.max(0, maxBottom), preferred.y),
          ),
        );
    }
    const targetX = numberValue(element, "reposition-x"),
      targetY = numberValue(element, "reposition-y");
    const offsets = imported.map((_, i) => {
      const manual = manualOffsets.get(i) || { x: 0, y: 0 };
      return indexes.includes(i) && !repositionExcluded.has(i) && bounds[i]
        ? {
            x: targetX - anchors[i]!.x + manual.x,
            y: targetY - anchors[i]!.y + manual.y,
          }
        : { x: 0, y: 0 };
    });
    let left = 0,
      top = 0,
      right = iOutputWidth - 1,
      bottom = iOutputHeight - 1;
    indexes.forEach((i) => {
      if (!bounds[i]) return;
      left = Math.min(left, bounds[i]!.left + offsets[i].x);
      right = Math.max(right, bounds[i]!.right + offsets[i].x);
      top = Math.min(top, bounds[i]!.top + offsets[i].y);
      bottom = Math.max(bottom, bounds[i]!.bottom + offsets[i].y);
    });
    repositionValid =
      selected.length > 0 &&
      !opaque.length &&
      Number.isInteger(targetX) &&
      Number.isInteger(targetY) &&
      targetX >= 0 &&
      targetY >= 0 &&
      targetX < iOutputWidth &&
      targetY < iOutputHeight &&
      left >= 0 &&
      top >= 0 &&
      right < iOutputWidth &&
      bottom < iOutputHeight;
    element.querySelector("#reposition-status")!.textContent = opaque.length
      ? "第 " +
        opaque.map((i) => i + 1).join("、") +
        " 格沒有空白透明區域，無法可靠判斷角色輪廓。請先去背，或取消該格定位。"
      : !selected.length
        ? "請選取至少一格有像素的影格，或取消重新定位。"
        : !repositionValid
          ? "位置超出畫布，至少需要 " +
            (right - left + 1) +
            " × " +
            (bottom - top + 1) +
            "。不會裁切套用；請調整定位點、畫布或重置位移。"
          : "共用畫布定位點 (" +
            targetX +
            ", " +
            targetY +
            ")；保留原始像素與共用縮放，沒有裁切。";
    element
      .querySelector<HTMLElement>("#reposition-status")!
      .classList.toggle("is-error", !repositionValid);
    element
      .querySelectorAll<HTMLElement>("[data-reposition-offset]")
      .forEach((span) => {
        const i = Number(span.dataset.repositionOffset);
        span.textContent = !indexes.includes(i)
          ? "不匯入"
          : repositionExcluded.has(i)
            ? "保留原位置"
            : !bounds[i]
              ? "空白"
              : "X " +
                (offsets[i].x >= 0 ? "+" : "") +
                offsets[i].x +
                " / Y " +
                (offsets[i].y >= 0 ? "+" : "") +
                offsets[i].y;
      });
    if (repositionValid)
      imported = imported.map((pixels, i) =>
        mapSize(
          pixels,
          iOutputWidth,
          iOutputHeight,
          iOutputWidth,
          iOutputHeight,
          false,
          offsets[i].x,
          offsets[i].y,
        ),
      );
  }
  element
    .querySelector("#reposition-import")!
    .addEventListener("change", refreshGrouping);
  element
    .querySelector("#reposition-auto-anchor")!
    .addEventListener("change", () => {
      if (targetPreset === "custom")
        targetPreset = isNewProject ? "bottom-center" : "existing";
      refreshGrouping();
    });
  ["reposition-x", "reposition-y"].forEach((id) =>
    element.querySelector("#" + id)!.addEventListener("input", () => {
      (
        element.querySelector("#reposition-auto-anchor") as HTMLInputElement
      ).checked = false;
      targetPreset = "custom";
      refreshGrouping();
    }),
  );
  element.querySelectorAll<HTMLElement>("[data-reposition-nudge]").forEach(
    (button) =>
      (button.onclick = () => {
        const [x, y] = button.dataset.repositionNudge!.split(",").map(Number),
          point = manualOffsets.get(iPreview) || { x: 0, y: 0 };
        manualOffsets.set(iPreview, { x: point.x + x, y: point.y + y });
        refreshGrouping();
      }),
  );
  element.querySelector("#reposition-reset")!.addEventListener("click", () => {
    manualOffsets.clear();
    refreshGrouping();
  });
  element
    .querySelector("#reposition-background")!
    .addEventListener("click", () => {
      advanced.open = true;
      alphaCard.scrollIntoView({ block: "center" });
    });
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
    draw(
      element.querySelector<HTMLCanvasElement>("#frame-preview-before")!,
      unaligned[iPreview] || imported[iPreview],
      iOutputWidth,
      iOutputHeight,
    );
    element.querySelector("#reposition-manual-label")!.textContent =
      "微調第 " + (iPreview + 1) + " 格";
    const enabled = (
      element.querySelector("#reposition-import") as HTMLInputElement
    ).checked;
    const isPatch =
        (element.querySelector("#reposition-method") as HTMLSelectElement)
          .value === "patch",
      patch = registration.current();
    const bounds = alphaBounds(
        unaligned[iPreview] || imported[iPreview],
        iOutputWidth,
      ),
      point =
        (isPatch ? patch.matches[iPreview]?.found : undefined) ||
        manualSources.get(iPreview) ||
        (bounds ? sourceAnchor(bounds, sourcePreset) : null);
    element.querySelector("#reposition-source-anchor-info")!.textContent = point
      ? "第 " +
        (iPreview + 1) +
        " 格角色錨點 (" +
        point.x +
        ", " +
        point.y +
        ")" +
        (manualSources.has(iPreview) ? " · 本格自訂" : "") +
        "。點定位前可改本格角色錨點；點定位後可改共用畫布定位點。"
      : "此格沒有可用角色輪廓。";
    [
      {
        canvas: element.querySelector<HTMLCanvasElement>(
          "#frame-preview-before",
        )!,
        marker: sourceMarker,
        point,
      },
      {
        canvas,
        marker: targetMarker,
        point: {
          x: isPatch ? patch.point.x : numberValue(element, "reposition-x"),
          y: isPatch ? patch.point.y : numberValue(element, "reposition-y"),
        },
      },
    ].forEach(({ canvas, marker, point }) => {
      marker.classList.toggle("patch-anchor-marker", isPatch);
      marker.hidden =
        !enabled ||
        !point ||
        point.x < 0 ||
        point.y < 0 ||
        point.x >= canvas.width ||
        point.y >= canvas.height;
      if (marker.hidden || !point) return;
      const rect = canvas.getBoundingClientRect(),
        parent = canvas.parentElement!.getBoundingClientRect(),
        scale = Math.min(
          canvas.clientWidth / canvas.width,
          canvas.clientHeight / canvas.height,
        );
      marker.style.width = marker.style.height = isPatch
        ? (patch.radius * 2 + 1) * scale + "px"
        : "9px";
      marker.style.left =
        rect.left -
        parent.left +
        (rect.width - canvas.width * scale) / 2 +
        (point.x + 0.5) * scale +
        "px";
      marker.style.top =
        rect.top -
        parent.top +
        (rect.height - canvas.height * scale) / 2 +
        (point.y + 0.5) * scale +
        "px";
    });
    const alpha = alphaSummary(pixelsToRgba(imported[iPreview]));
    element.querySelector("#import-output-alpha")!.textContent =
      "本格輸出 Alpha：透明 " +
      alpha.transparent +
      "／半透明 " +
      alpha.partial +
      "／不透明 " +
      alpha.opaque;
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
  element
    .querySelector("#remove-baked-checker")!
    .addEventListener("change", () => update());
  function refreshAlphaStatus() {
    alphaCard.hidden = !sources.length;
    const checkerCount = sources.filter((source) => source.checker).length;
    (
      element.querySelector("#remove-baked-checker") as HTMLInputElement
    ).disabled = !checkerCount;
    if (!checkerCount)
      (
        element.querySelector("#remove-baked-checker") as HTMLInputElement
      ).checked = false;
    if (!sources.length) return;
    const alpha = sources[0].alpha;
    element.querySelector("#import-source-alpha")!.textContent =
      "來源" +
      (sources.length > 1 ? "第 1 張" : "") +
      " Alpha：透明 " +
      alpha.transparent +
      "／半透明 " +
      alpha.partial +
      "／不透明 " +
      alpha.opaque +
      (alpha.transparent || alpha.partial
        ? "（來源含真正 Alpha）"
        : "（來源完全不透明）");
    element.querySelector("#import-checker-status")!.textContent = checkerCount
      ? "偵測到疑似已畫入原圖的規則棋盤。僅在勾選後產生去背預覽，請確認角色邊緣再套用。"
      : "未確認規則棋盤；不會自動刪除像素。此處統計不包含動畫預覽的背景圖片或底色。";
  }
  const update = () => {
    refreshAlphaStatus();
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
      if (
        (element.querySelector("#remove-baked-checker") as HTMLInputElement)
          .checked &&
        source.checker
      )
        data.set(
          removeBakedChecker(data, canvas.width, canvas.height, source.checker)
            .data,
        );
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
    unaligned = imported.map((pixels) => [...pixels]);
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
    applyReposition(groups?.flatMap((group) => group.indexes) || []);
    (element.querySelector("[data-apply]") as HTMLButtonElement).disabled =
      !groups?.length ||
      !repositionValid ||
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
    element
      .querySelectorAll<HTMLCanvasElement>(".asset-thumb")
      .forEach((canvas, i) =>
        draw(canvas, imported[i], iOutputWidth, iOutputHeight),
      );
    drawFramePreview();
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
        const analysisCanvas = document.createElement("canvas");
        analysisCanvas.width = image.width;
        analysisCanvas.height = image.height;
        analysisCanvas.getContext("2d")!.drawImage(image, 0, 0);
        const imagePixels = analysisCanvas
          .getContext("2d")!
          .getImageData(0, 0, image.width, image.height).data;
        sources.push({
          name: file.name,
          image,
          alpha: alphaSummary(imagePixels),
          checker: detectBakedChecker(imagePixels, image.width, image.height),
        });
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

export function openBackgroundRemovalDialog(
  project: AssetProject,
  onApply: Apply,
  iAction = 0,
  iFrame = 0,
  inspectionOnly = false,
) {
  const original = project.actions[iAction].frames[iFrame];
  const initial = pixelsToRgba(original.pixels);
  const initialChecker = detectBakedChecker(
    initial,
    project.width,
    project.height,
  );
  let next = structuredClone(project),
    removedTotal = 0;
  const element = dialog(
    "檢查透明與圖片去背",
    '<p>此檢查只顯示圖像的實際 Alpha，不包含動畫預覽的背景圖片或底色。</p><div class="cleanup-options"><label>套用範圍<select id="cleanup-scope"><option value="frame">目前影格</option><option value="action">目前動作全部影格</option><option value="all">所有動作全部影格</option></select></label><label>處理方式<select id="cleanup-method"><option value="inspect">只檢查透明度</option><option value="checker">移除已畫入的外連棋盤</option><option value="color">移除外連單色背景</option></select></label><label id="cleanup-color-label">背景色<input id="cleanup-color" type="color" value="#ffffff"></label><label>預覽影格<select id="cleanup-frame"></select></label></div><p id="cleanup-source-alpha"></p><p id="cleanup-result-alpha"></p><p id="cleanup-status" role="status"></p><div class="asset-compare cleanup-compare"><div>處理前（洋紅底檢查）<canvas data-cleanup-before class="asset-preview"></canvas></div><div>處理後（洋紅底檢查）<canvas data-cleanup-after class="asset-preview"></canvas></div></div><p>只移除與外部連通的背景；封閉外框內的白色會保留。請預覽後套用，可使用復原返回。</p>',
    () => {
      if (removedTotal) {
        onApply(next);
        element.close();
      }
    },
  );
  (element.querySelector("#cleanup-method") as HTMLSelectElement).value =
    !inspectionOnly && initialChecker ? "checker" : "inspect";
  const scopeInput =
      element.querySelector<HTMLSelectElement>("#cleanup-scope")!,
    frameInput = element.querySelector<HTMLSelectElement>("#cleanup-frame")!;
  function targets() {
    const scope = scopeInput.value;
    return project.actions.flatMap((action, a) =>
      action.frames.flatMap((frame, f) =>
        scope === "all" ||
        (a === iAction && (scope === "action" || f === iFrame))
          ? [{ a, f, frame }]
          : [],
      ),
    );
  }
  function refreshFrames() {
    const value = frameInput.value;
    frameInput.replaceChildren();
    targets().forEach(({ a, f }) => {
      const option = document.createElement("option");
      option.value = a + ":" + f;
      option.textContent = project.actions[a].name + " · 第 " + (f + 1) + " 格";
      frameInput.append(option);
    });
    if ([...frameInput.options].some((option) => option.value === value))
      frameInput.value = value;
  }
  function update() {
    next = structuredClone(project);
    removedTotal = 0;
    const method = (
      element.querySelector("#cleanup-method") as HTMLSelectElement
    ).value;
    (element.querySelector("#cleanup-color-label") as HTMLElement).hidden =
      method !== "color";
    const strColor = (
        element.querySelector("#cleanup-color") as HTMLInputElement
      ).value,
      color = [1, 3, 5].map((i) => parseInt(strColor.slice(i, i + 2), 16));
    let detected = 0;
    targets().forEach(({ a, f, frame }) => {
      const data = pixelsToRgba(frame.pixels);
      let result = { data, removed: 0 };
      if (method === "checker") {
        const checker = detectBakedChecker(data, project.width, project.height);
        if (checker) {
          detected++;
          result = removeBakedChecker(
            data,
            project.width,
            project.height,
            checker,
          );
        }
      } else if (method === "color")
        result = removeExteriorColor(
          data,
          project.width,
          project.height,
          color,
        );
      removedTotal += result.removed;
      next.actions[a].frames[f].pixels = frame.pixels.map((pixel, i) =>
        data[i * 4 + 3] !== 0 && result.data[i * 4 + 3] === 0 ? "" : pixel,
      );
    });
    const [a, f] = frameInput.value.split(":").map(Number),
      before = project.actions[a].frames[f].pixels,
      after = next.actions[a].frames[f].pixels;
    const source = alphaSummary(pixelsToRgba(before)),
      result = alphaSummary(pixelsToRgba(after));
    element.querySelector("#cleanup-source-alpha")!.textContent =
      "處理前 Alpha：透明 " +
      source.transparent +
      "／半透明 " +
      source.partial +
      "／不透明 " +
      source.opaque;
    element.querySelector("#cleanup-result-alpha")!.textContent =
      "處理後 Alpha：透明 " +
      result.transparent +
      "／半透明 " +
      result.partial +
      "／不透明 " +
      result.opaque;
    element.querySelector("#cleanup-status")!.textContent =
      method === "inspect"
        ? "目前僅檢查，不修改像素。洋紅透出的區域才是真正透明。"
        : method === "checker" && !detected
          ? "沒有確認規則棋盤；不會自動刪除。可改用外連單色背景，或先確認預覽背景圖片。"
          : "預計移除 " +
            removedTotal +
            " 個背景像素（" +
            targets().length +
            " 格），角色與參考圖其餘資料保持原樣。";
    draw(
      element.querySelector("[data-cleanup-before]")!,
      before,
      project.width,
      project.height,
    );
    draw(
      element.querySelector("[data-cleanup-after]")!,
      after,
      project.width,
      project.height,
    );
    (element.querySelector("[data-apply]") as HTMLButtonElement).disabled =
      !removedTotal;
  }
  scopeInput.addEventListener("change", () => {
    refreshFrames();
    update();
  });
  element
    .querySelectorAll("select:not(#cleanup-scope),input")
    .forEach((input) => input.addEventListener("input", update));
  refreshFrames();
  update();
}
