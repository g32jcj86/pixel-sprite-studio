import {
  registerFrames,
  type RegistrationPoint,
  type RegistrationMatch,
  type RegistrationResult,
} from "./registration";
import { icon } from "./icons";
import "./registration.css";

export function createRegistrationControls(onChange: () => void) {
  const element = document.createElement("div");
  element.className = "registration-controls";
  element.innerHTML = `<strong>自動定位：局部特徵比對</strong><p>以參考影格的細節小區塊尋找相同位置，只做平移，不用外框或重心代替特徵。</p><div class="registration-options"><label>搜尋位移 ±<input id="registration-search" type="number" min="1" max="32" value="12">px</label><label>特徵半徑<select id="registration-radius"><option>2</option><option selected>3</option><option>4</option></select>px</label><button type="button" id="registration-run">${icon("target")}重新搜尋</button><button type="button" id="registration-reference-picker">${icon("expand")}放大參考影格選特徵</button></div><p id="registration-status" role="status"></p><div class="registration-matches"></div>`;
  let frames: string[][] = [],
    width = 1,
    height = 1,
    selected: number[] = [],
    referenceIndex = 0;
  let referencePoint: RegistrationPoint | undefined,
    referencePicked = false;
  let result: RegistrationResult | undefined;
  let lastFrames: string[][] = [],
    lastKey = "",
    version = 0;
  const manual = new Map<number, RegistrationPoint>(),
    confirmed = new Set<number>();
  const searchInput = element.querySelector<HTMLInputElement>(
      "#registration-search",
    )!,
    radiusInput = element.querySelector<HTMLSelectElement>(
      "#registration-radius",
    )!;
  function invalidate() {
    version++;
    confirmed.clear();
    onChange();
  }
  function matches() {
    return (result?.matches || []).map((match, i): RegistrationMatch => {
      if (manual.has(i) && result) {
        const found = manual.get(i)!;
        return {
          ...match,
          found,
          dx: result.point.x - found.x,
          dy: result.point.y - found.y,
          reliable: true,
          reason: "已手動指定相符位置",
        };
      }
      if (i === referenceIndex && referencePicked)
        return { ...match, reliable: true, reason: "已手動選取參考特徵" };
      if (confirmed.has(i))
        return { ...match, reliable: true, reason: "已確認候選位置" };
      return match;
    });
  }
  function render() {
    const resolved = matches(),
      host = element.querySelector(".registration-matches")!;
    host.replaceChildren();
    const reliable = selected.filter((i) => resolved[i]?.reliable).length;
    element.querySelector("#registration-status")!.textContent = !frames.length
      ? "請先載入影格。"
      : `參考第 ${referenceIndex + 1} 格 (${result?.point.x ?? 0}, ${result?.point.y ?? 0}) · ${reliable}/${selected.length} 格可靠或已確認。${reliable < selected.length ? "待確認影格不會自動套用；請放大點選相符細節。" : "保留參考影格位置，其他影格移至同一特徵。"}`;
    (
      element.querySelector(
        "#registration-reference-picker",
      ) as HTMLButtonElement
    ).disabled = !frames.length;
    selected.forEach((i) => {
      const match = resolved[i];
      if (!match) return;
      const row = document.createElement("div");
      row.className = "registration-match";
      row.dataset.registrationFrame = String(i);
      const label = document.createElement("span");
      label.textContent = `第 ${i + 1} 格 · ${match.reliable ? "可靠／已確認" : "需確認"} · 特徵 (${match.found.x}, ${match.found.y}) · X ${match.dx >= 0 ? "+" : ""}${match.dx} / Y ${match.dy >= 0 ? "+" : ""}${match.dy}`;
      const detail = document.createElement("small");
      detail.textContent = `${match.reason} · 誤差 ${(match.score * 100).toFixed(1)}% · 重疊 ${(match.coverage * 100).toFixed(0)}% · 區別 ${(match.margin * 100).toFixed(1)}%`;
      row.append(label, detail);
      if (i !== referenceIndex) {
        const pick = document.createElement("button");
        pick.type = "button";
        pick.dataset.registrationPick = String(i);
        pick.textContent = "放大指定相符點";
        pick.onclick = () => openPicker(i, false);
        row.append(pick);
        if (!match.reliable) {
          const accept = document.createElement("label"),
            check = document.createElement("input");
          check.type = "checkbox";
          check.dataset.registrationConfirm = String(i);
          check.checked = confirmed.has(i);
          check.onchange = () => {
            if (check.checked) confirmed.add(i);
            else confirmed.delete(i);
            onChange();
          };
          accept.append(check, document.createTextNode("我已確認此候選"));
          row.append(accept);
        }
      }
      host.append(row);
    });
  }
  function draw(canvas: HTMLCanvasElement, pixels: string[]) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    pixels.forEach((color, i) => {
      if (color) {
        context.fillStyle = color;
        context.fillRect(i % width, Math.floor(i / width), 1, 1);
      }
    });
  }
  function openPicker(index: number, isReference: boolean) {
    if (!frames[index]) return;
    const dialog = document.createElement("dialog");
    dialog.id = "registration-picker";
    dialog.className = "registration-picker";
    dialog.innerHTML = `<header><h2>${isReference ? "放大參考影格選取特徵" : `第 ${index + 1} 格：指定相同細節`}</h2><button type="button" data-close aria-label="關閉特徵選取">${icon("close")}</button></header><p>在角色的眼睛、飾物或衣服細節點選精確座標。滾動／拖曳平移，調整縮放查看像素。</p><div class="registration-picker-tools"><label>縮放<input id="registration-picker-zoom" type="range" min="2" max="32" value="12"><output id="registration-picker-zoom-label"></output></label><label><input id="registration-picker-pan" type="checkbox">拖曳平移</label><output id="registration-picker-coordinates"></output></div><div class="registration-picker-scroll"><div class="registration-picker-holder"><canvas id="registration-picker-canvas"></canvas><span class="registration-picker-patch"></span></div></div><footer><button type="button" data-close>取消</button><button type="button" id="registration-use-point" class="primary">使用此位置</button></footer>`;
    const canvas = dialog.querySelector<HTMLCanvasElement>(
        "#registration-picker-canvas",
      )!,
      viewport = dialog.querySelector<HTMLElement>(
        ".registration-picker-scroll",
      )!,
      holder = dialog.querySelector<HTMLElement>(
        ".registration-picker-holder",
      )!,
      patch = dialog.querySelector<HTMLElement>(".registration-picker-patch")!,
      zoomInput = dialog.querySelector<HTMLInputElement>(
        "#registration-picker-zoom",
      )!;
    let point = isReference
      ? {
          ...(referencePoint ||
            result?.point || {
              x: Math.floor(width / 2),
              y: Math.floor(height / 2),
            }),
        }
      : {
          ...(manual.get(index) ||
            matches()[index]?.found ||
            result?.point || { x: 0, y: 0 }),
        };
    let zoom = Math.max(
      2,
      Math.min(16, Math.floor(600 / Math.max(width, height))),
    );
    zoomInput.value = String(zoom);
    draw(canvas, frames[index]);
    function refresh() {
      const radius = Number(radiusInput.value);
      canvas.style.width = holder.style.width = width * zoom + "px";
      canvas.style.height = holder.style.height = height * zoom + "px";
      patch.style.left = (point.x - radius) * zoom + "px";
      patch.style.top = (point.y - radius) * zoom + "px";
      patch.style.width = patch.style.height = (radius * 2 + 1) * zoom + "px";
      dialog.querySelector("#registration-picker-coordinates")!.textContent =
        `X ${point.x} · Y ${point.y} · ${radius * 2 + 1}×${radius * 2 + 1} 特徵`;
      dialog.querySelector("#registration-picker-zoom-label")!.textContent =
        zoom + " 倍";
    }
    zoomInput.oninput = () => {
      const old = zoom;
      zoom = Number(zoomInput.value);
      viewport.scrollLeft =
        ((viewport.scrollLeft + viewport.clientWidth / 2) * zoom) / old -
        viewport.clientWidth / 2;
      viewport.scrollTop =
        ((viewport.scrollTop + viewport.clientHeight / 2) * zoom) / old -
        viewport.clientHeight / 2;
      refresh();
    };
    let pan: { x: number; y: number; left: number; top: number } | null = null,
      moved = false;
    viewport.addEventListener("pointerdown", (event) => {
      moved = false;
      if (
        !(dialog.querySelector("#registration-picker-pan") as HTMLInputElement)
          .checked ||
        event.pointerType === "touch"
      )
        return;
      pan = {
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!pan) return;
      if (Math.abs(event.clientX - pan.x) + Math.abs(event.clientY - pan.y) > 3)
        moved = true;
      viewport.scrollLeft = pan.left - (event.clientX - pan.x);
      viewport.scrollTop = pan.top - (event.clientY - pan.y);
    });
    viewport.addEventListener("pointerup", () => (pan = null));
    viewport.addEventListener("pointercancel", () => (pan = null));
    canvas.onclick = (event) => {
      if (moved) return;
      const rect = canvas.getBoundingClientRect();
      point = {
        x: Math.max(
          0,
          Math.min(
            width - 1,
            Math.floor(((event.clientX - rect.left) / rect.width) * width),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            height - 1,
            Math.floor(((event.clientY - rect.top) / rect.height) * height),
          ),
        ),
      };
      refresh();
    };
    dialog
      .querySelector("#registration-use-point")!
      .addEventListener("click", () => {
        if (isReference) {
          referencePoint = point;
          referencePicked = true;
          manual.clear();
          version++;
          confirmed.clear();
        } else {
          manual.set(index, point);
          confirmed.delete(index);
        }
        dialog.close();
        onChange();
      });
    dialog
      .querySelectorAll("[data-close]")
      .forEach((button) =>
        button.addEventListener("click", () => dialog.close()),
      );
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    refresh();
    dialog.showModal();
    viewport.scrollLeft = Math.max(
      0,
      point.x * zoom - viewport.clientWidth / 2,
    );
    viewport.scrollTop = Math.max(
      0,
      point.y * zoom - viewport.clientHeight / 2,
    );
  }
  element
    .querySelector("#registration-reference-picker")!
    .addEventListener("click", () => openPicker(referenceIndex, true));
  element
    .querySelector("#registration-run")!
    .addEventListener("click", invalidate);
  searchInput.addEventListener("change", invalidate);
  radiusInput.addEventListener("change", invalidate);
  return {
    element,
    resolve(
      nextFrames: string[][],
      nextWidth: number,
      nextHeight: number,
      nextSelected: number[],
    ) {
      const dimensionsChanged =
        width !== nextWidth ||
        height !== nextHeight ||
        frames.length !== nextFrames.length;
      if (dimensionsChanged) {
        manual.clear();
        confirmed.clear();
        referencePoint = undefined;
        referencePicked = false;
        version++;
      }
      width = nextWidth;
      height = nextHeight;
      frames = nextFrames;
      selected = nextSelected;
      referenceIndex = selected[0] ?? 0;
      const key = [
        width,
        height,
        selected.join(","),
        searchInput.value,
        radiusInput.value,
        version,
      ].join("|");
      if (
        key !== lastKey ||
        nextFrames.some((pixels, i) => pixels !== lastFrames[i])
      ) {
        result = registerFrames(frames, width, height, {
          point: referencePoint,
          radius: Number(radiusInput.value),
          search: Number(searchInput.value),
          selected,
          referenceIndex,
        });
        lastKey = key;
        lastFrames = [...nextFrames];
      }
      render();
      const resolved = matches();
      return {
        matches: resolved,
        point: result?.point || { x: 0, y: 0 },
        radius: result?.radius || 3,
        valid:
          selected.length > 0 && selected.every((i) => resolved[i]?.reliable),
      };
    },
    setFramePoint(index: number, point: RegistrationPoint) {
      if (index === referenceIndex) {
        referencePoint = point;
        referencePicked = true;
        manual.clear();
        confirmed.clear();
        version++;
      } else manual.set(index, point);
      onChange();
    },
    current() {
      return {
        matches: matches(),
        point: result?.point || { x: 0, y: 0 },
        radius: result?.radius || 3,
      };
    },
  };
}
