import { icon } from "./icons";
import "./interaction.css";
let binding: AbortController | undefined;
let resizeObserver: ResizeObserver | undefined;
let holderObserver: MutationObserver | undefined;

export function bindEditorInteractions() {
  binding?.abort();
  resizeObserver?.disconnect();
  holderObserver?.disconnect();
  binding = new AbortController();
  const signal = binding.signal;
  const canvas = document.querySelector<HTMLCanvasElement>("#drawing-canvas");
  const holder = document.querySelector<HTMLElement>("#canvas-holder");
  const area = document.querySelector<HTMLElement>("#canvas-area");
  if (!canvas || !holder || !area) return;
  area
    .querySelectorAll(".pixel-hover, .pixel-coordinates, .compact-tool-picker")
    .forEach((node) => node.remove());
  const outline = document.createElement("div");
  outline.className = "pixel-hover";
  outline.hidden = true;
  holder.append(outline);
  const coordinates = document.createElement("output");
  coordinates.className = "pixel-coordinates";
  coordinates.textContent = "X — · Y —";
  coordinates.setAttribute("aria-label", "像素座標");
  area.append(coordinates);
  const picker = document.createElement("details");
  picker.className = "compact-tool-picker";
  picker.innerHTML = `<summary aria-label="開啟工具與快捷鍵">工具與快捷鍵 <span>${icon("chevronDown")}</span></summary><div class="compact-tool-content"><div class="compact-tool-buttons"><button data-pick-tool="pencil" title="鉛筆 B" aria-label="鉛筆 B">${icon("pencil")}<small>B</small></button><button data-pick-tool="eraser" title="橡皮擦 E" aria-label="橡皮擦 E">${icon("eraser")}<small>E</small></button><button data-pick-tool="backgroundEraser" title="去背橡皮擦 K" aria-label="去背橡皮擦 K">${icon("eraser")}<small>K 去背</small></button><button data-pick-tool="fill" title="填色 G" aria-label="填色 G">${icon("fill")}<small>G</small></button><button data-pick-tool="picker" title="滴管 I" aria-label="滴管 I">${icon("picker")}<small>I</small></button><button data-pick-tool="move" title="平移 H" aria-label="平移 H">${icon("move")}<small>H</small></button></div><div class="compact-brush-row"><button data-brush-step="-1" aria-label="縮小筆刷">${icon("minus")}<small>[</small></button><span data-brush-label></span><button data-brush-step="1" aria-label="放大筆刷">${icon("plus")}<small>]</small></button></div><div class="compact-shortcut-list"><button data-editor-command="palette">色庫 <kbd>P</kbd></button><button data-editor-command="grid">格線 <kbd>Shift G</kbd></button><button data-editor-command="previous">上一格 <kbd>←</kbd></button><button data-editor-command="next">下一格 <kbd>→</kbd></button><span>縮放 <kbd>− / ＋</kbd></span><span>播放 <kbd>Space</kbd></span><span>復原 <kbd>Ctrl / ⌘ Z</kbd></span><span>平移 <kbd>H / Space 拖曳</kbd></span></div></div>`;
  area.append(picker);
  picker.addEventListener("pointerdown", (event) => event.stopPropagation(), {
    signal,
  });
  picker.addEventListener("wheel", (event) => event.stopPropagation(), {
    signal,
  });
  picker.addEventListener(
    "pointermove",
    (event) => {
      event.stopPropagation();
      pointer = null;
      outline.hidden = true;
      coordinates.textContent = "X — · Y —";
    },
    { signal },
  );
  let pointer: { x: number; y: number } | null = null;
  let isPan = false;
  function refresh() {
    if (picker.open) {
      const rect = picker.querySelector("summary")!.getBoundingClientRect();
      const content = picker.querySelector<HTMLElement>(
        ".compact-tool-content",
      )!;
      content.style.left =
        Math.max(8, Math.min(rect.left, window.innerWidth - 274)) + "px";
      content.style.bottom = window.innerHeight - rect.top + "px";
      content.style.maxHeight = Math.max(90, rect.top - 8) + "px";
    }
    const brush = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      "#brush",
    );
    const strTool =
      document.querySelector<HTMLElement>("[data-tool].active")?.dataset.tool ||
      "pencil";
    picker.querySelector("[data-brush-label]")!.textContent =
      strTool === "backgroundEraser"
        ? "去背容差 " +
          (document.querySelector<HTMLInputElement>("#erase-tolerance")
            ?.value || "0")
        : `${brush?.value || 1} px 筆刷`;
    picker
      .querySelector("[data-brush-step='-1']")!
      .setAttribute(
        "aria-label",
        strTool === "backgroundEraser" ? "降低去背容差" : "縮小筆刷",
      );
    picker
      .querySelector("[data-brush-step='1']")!
      .setAttribute(
        "aria-label",
        strTool === "backgroundEraser" ? "提高去背容差" : "放大筆刷",
      );
    picker
      .querySelectorAll<HTMLElement>("[data-pick-tool]")
      .forEach((button) =>
        button.classList.toggle(
          "is-selected",
          button.dataset.pickTool === strTool,
        ),
      );
    if (!pointer || isPan || strTool === "move") {
      outline.hidden = true;
      coordinates.textContent = "X — · Y —";
      return;
    }
    const rect = canvas!.getBoundingClientRect();
    const iX = Math.floor(
      ((pointer.x - rect.left) / rect.width) * canvas!.width,
    );
    const iY = Math.floor(
      ((pointer.y - rect.top) / rect.height) * canvas!.height,
    );
    if (iX < 0 || iY < 0 || iX >= canvas!.width || iY >= canvas!.height) {
      outline.hidden = true;
      coordinates.textContent = "X — · Y —";
      return;
    }
    const iBrush =
      strTool === "pencil" || strTool === "eraser"
        ? Number(brush?.value || 1)
        : 1;
    const iWidth = Math.min(iBrush, canvas!.width - iX),
      iHeight = Math.min(iBrush, canvas!.height - iY);
    outline.hidden = false;
    outline.dataset.tool = strTool;
    outline.style.left = `${(iX / canvas!.width) * 100}%`;
    outline.style.top = `${(iY / canvas!.height) * 100}%`;
    outline.style.width = `${(iWidth / canvas!.width) * 100}%`;
    outline.style.height = `${(iHeight / canvas!.height) * 100}%`;
    coordinates.textContent = `X ${iX} · Y ${iY}${iBrush > 1 ? ` · ${iWidth} × ${iHeight}` : ""}`;
  }
  picker.addEventListener("toggle", refresh, { signal });
  window.addEventListener("resize", refresh, { signal });
  function stepBrush(iStep: number) {
    const isBackground =
      document.querySelector<HTMLElement>("[data-tool].active")?.dataset
        .tool === "backgroundEraser";
    const control = document.querySelector<
      HTMLInputElement | HTMLSelectElement
    >(isBackground ? "#erase-tolerance" : "#brush");
    if (!control) return;
    if (control instanceof HTMLSelectElement)
      control.selectedIndex = Math.max(
        0,
        Math.min(control.options.length - 1, control.selectedIndex + iStep),
      );
    else
      control.value = String(
        Math.max(
          control.min ? Number(control.min) : 0,
          Math.min(Number(control.max) || 256, Number(control.value) + iStep),
        ),
      );
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
  }
  function command(strCommand: string) {
    if (strCommand === "previous" || strCommand === "next") {
      const frames = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-frame]"),
      );
      const iCurrent = frames.findIndex((frame) =>
        frame.classList.contains("selected"),
      );
      frames[
        (iCurrent + (strCommand === "next" ? 1 : frames.length - 1)) %
          frames.length
      ]?.click();
      return;
    }
    const ids: Record<string, string> = {
      palette: "open-color-library",
      grid: "grid",
      "zoom-in": "zoom-in",
      "zoom-out": "zoom-out",
    };
    document.getElementById(ids[strCommand])?.click();
    refresh();
  }
  picker
    .querySelectorAll<HTMLButtonElement>("[data-pick-tool]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () =>
          document
            .querySelector<HTMLButtonElement>(
              `[data-tool="${button.dataset.pickTool}"]`,
            )
            ?.click(),
        { signal },
      ),
    );
  picker
    .querySelectorAll<HTMLButtonElement>("[data-brush-step]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => stepBrush(Number(button.dataset.brushStep)),
        { signal },
      ),
    );
  picker
    .querySelectorAll<HTMLButtonElement>("[data-editor-command]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        () => command(button.dataset.editorCommand!),
        { signal },
      ),
    );
  area.addEventListener(
    "pointermove",
    (event) => {
      pointer =
        event.pointerType === "touch"
          ? null
          : { x: event.clientX, y: event.clientY };
      refresh();
    },
    { signal },
  );
  area.addEventListener(
    "pointerleave",
    () => {
      pointer = null;
      refresh();
    },
    { signal },
  );
  area.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "touch") {
        pointer = null;
        refresh();
      }
    },
    { signal },
  );
  area.addEventListener("scroll", refresh, { signal });
  document
    .querySelector("#brush")
    ?.addEventListener("change", refresh, { signal });
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        (event.target as HTMLElement).matches(
          'input,select,textarea,[contenteditable="true"]',
        ) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (event.code === "Space") {
        isPan = true;
        refresh();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        picker.open = false;
        return;
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        stepBrush(event.key === "[" ? -1 : 1);
      } else if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        command("palette");
      } else if (event.key.toLowerCase() === "g" && event.shiftKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        command("grid");
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        command("zoom-in");
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        command("zoom-out");
      } else if (event.key === "?") {
        event.preventDefault();
        picker.open = !picker.open;
      }
    },
    { signal, capture: true },
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "Space") {
        isPan = false;
        refresh();
      }
    },
    { signal },
  );
  window.addEventListener(
    "blur",
    () => {
      pointer = null;
      isPan = false;
      refresh();
    },
    { signal },
  );
  resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(canvas);
  holderObserver = new MutationObserver(refresh);
  holderObserver.observe(holder, {
    attributes: true,
    attributeFilter: ["style"],
  });
  refresh();
}
