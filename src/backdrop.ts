import { icon } from "./icons";
import "./backdrop.css";

type BackdropState = {
  mode: "light" | "dark" | "solid";
  color: string;
  previewColor: string;
  previewFit: "contain" | "cover";
  imageUrl: string;
  occupancy: boolean;
};
type MountOptions = {
  projectId?: string;
  drawingHost: HTMLElement;
  previewHost: HTMLElement;
};
const states = new Map<string, BackdropState>();
const loadedImages = new Set<string>();
let activeId = "";
let activeOptions: MountOptions | undefined;
let database: Promise<IDBDatabase> | undefined;

function imageStore() {
  database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pixel-studio-backdrops", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("images", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
function preferences(id: string) {
  if (states.has(id)) return states.get(id)!;
  let saved: Partial<BackdropState> = {};
  try {
    saved = JSON.parse(localStorage.getItem("pixel-backdrop:" + id) || "{}");
  } catch {
    saved = {};
  }
  const isColor = (value: unknown): value is string =>
    typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
  const state: BackdropState = {
    mode: ["light", "dark", "solid"].includes(saved.mode || "")
      ? saved.mode!
      : "light",
    color: isColor(saved.color) ? saved.color : "#ffffff",
    previewColor: isColor(saved.previewColor) ? saved.previewColor : "#ffffff",
    previewFit: saved.previewFit === "cover" ? "cover" : "contain",
    occupancy: saved.occupancy === true,
    imageUrl: "",
  };
  states.set(id, state);
  return state;
}
function savePreferences(id: string) {
  const { imageUrl: _, ...saved } = preferences(id);
  localStorage.setItem("pixel-backdrop:" + id, JSON.stringify(saved));
}
function drawOccupancy(state: BackdropState) {
  const holder = document.querySelector<HTMLElement>("#canvas-holder");
  const drawing = document.querySelector<HTMLCanvasElement>("#drawing-canvas");
  if (!holder || !drawing) return;
  let overlay = holder.querySelector<HTMLCanvasElement>(".occupancy-overlay");
  if (!overlay) {
    overlay = document.createElement("canvas");
    overlay.className = "occupancy-overlay";
    overlay.setAttribute("aria-hidden", "true");
    holder.append(overlay);
  }
  overlay.hidden = !state.occupancy;
  holder.classList.toggle("show-occupancy", state.occupancy);
  if (!state.occupancy) return;
  overlay.width = drawing.width;
  overlay.height = drawing.height;
  const source = drawing
    .getContext("2d")!
    .getImageData(0, 0, drawing.width, drawing.height).data;
  const context = overlay.getContext("2d")!;
  const pixels = context.createImageData(drawing.width, drawing.height);
  for (let i = 0; i < source.length; i += 4)
    if (source[i + 3]) {
      pixels.data[i] = 255;
      pixels.data[i + 1] = 98;
      pixels.data[i + 3] = 105;
    }
  context.putImageData(pixels, 0, 0);
}
function applyState() {
  const state = preferences(activeId);
  const holder = document.querySelector<HTMLElement>("#canvas-holder");
  const preview = document.querySelector<HTMLElement>(".preview-box");
  if (holder) {
    holder.dataset.backdropMode = state.mode;
    const strBase =
      state.mode === "dark"
        ? "#343434"
        : state.mode === "light"
          ? "#ffffff"
          : state.color;
    holder.style.backgroundColor = strBase;
    holder.style.backgroundImage =
      state.mode === "solid"
        ? "none"
        : state.mode === "dark"
          ? "conic-gradient(#505050 25%, transparent 0 50%, #505050 0 75%, transparent 0)"
          : "conic-gradient(#e6e6e6 25%, transparent 0 50%, #e6e6e6 0 75%, transparent 0)";
    holder.style.backgroundSize =
      state.mode === "solid"
        ? "auto"
        : "calc(var(--pixel-cell-size, 8px) * 2) calc(var(--pixel-cell-size, 8px) * 2)";
    const channels = [1, 3, 5].map((i) =>
      parseInt(strBase.slice(i, i + 2), 16),
    );
    const isLight =
      channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 > 145;
    holder.style.setProperty(
      "--pixel-grid-color",
      isLight ? "#17191d38" : "#ffffff59",
    );
    holder.style.setProperty(
      "--pixel-grid-halo",
      isLight ? "#ffffffb3" : "#000000b3",
    );
    drawOccupancy(state);
  }
  if (preview) {
    preview.style.backgroundColor = state.previewColor;
    preview.style.backgroundImage = state.imageUrl
      ? `url("${state.imageUrl}")`
      : "none";
    preview.style.backgroundSize = state.previewFit;
    preview.style.backgroundPosition = "center";
    preview.style.backgroundRepeat = "no-repeat";
    preview.dataset.previewBackdrop = state.imageUrl ? "image" : "solid";
  }
  if (activeOptions) {
    const label = activeOptions.drawingHost.querySelector(
      "[data-drawing-label]",
    );
    if (label) label.textContent = "顯示設定";
    const previewLabel = activeOptions.previewHost.querySelector(
      "[data-preview-label]",
    );
    if (previewLabel) previewLabel.textContent = "預覽背景";
    const occupancy =
      activeOptions.drawingHost.querySelector<HTMLInputElement>(
        "[data-occupancy]",
      );
    if (occupancy) occupancy.checked = state.occupancy;
  }
}
export function mountBackdropControls(options: MountOptions) {
  activeId = options.projectId || "unsaved";
  activeOptions = options;
  const id = activeId,
    state = preferences(id);
  [options.drawingHost, options.previewHost].forEach((host) => {
    host.addEventListener("pointerdown", (event) => event.stopPropagation());
    host.addEventListener("wheel", (event) => event.stopPropagation());
  });
  options.drawingHost.classList.add("backdrop-controls");
  options.previewHost.classList.add("backdrop-controls");
  options.drawingHost.innerHTML = `<button type="button" data-open-backdrop="drawing" aria-label="設定繪圖畫布背景">${icon("checker")}<span data-drawing-label></span>${icon("chevronRight")}</button>`;
  options.previewHost.innerHTML = `<button type="button" data-open-backdrop="preview" aria-label="設定動畫預覽背景">${icon("image")}<span data-preview-label></span>${icon("chevronRight")}</button>`;
  [options.drawingHost, options.previewHost].forEach((host) =>
    host
      .querySelector("[data-open-backdrop]")!
      .addEventListener("click", () =>
        openBackdropDialog(
          (host.querySelector<HTMLElement>("[data-open-backdrop]")!.dataset
            .openBackdrop || "drawing") as "drawing" | "preview",
        ),
      ),
  );
  options.drawingHost
    .querySelector("[data-occupancy]")
    ?.addEventListener("change", (event) => {
      state.occupancy = (event.target as HTMLInputElement).checked;
      savePreferences(id);
      applyState();
    });
  const holder = document.querySelector("#canvas-holder");
  holder?.addEventListener("pixel-art-rendered", () => {
    if (activeId === id) drawOccupancy(preferences(id));
  });
  applyState();
  if (!loadedImages.has(id)) {
    loadedImages.add(id);
    void imageStore()
      .then(
        (db) =>
          new Promise<Blob | undefined>((resolve, reject) => {
            const request = db
              .transaction("images")
              .objectStore("images")
              .get(id);
            request.onsuccess = () => resolve(request.result?.blob);
            request.onerror = () => reject(request.error);
          }),
      )
      .then((blob) => {
        if (!blob || state.imageUrl) return;
        state.imageUrl = URL.createObjectURL(blob);
        if (activeId === id) applyState();
      })
      .catch(() => {
        loadedImages.delete(id);
      });
  }
}
export function openBackdropDialog(tab: "drawing" | "preview" = "drawing") {
  document.querySelector<HTMLDialogElement>("#backdrop-dialog")?.close();
  const id = activeId,
    state = preferences(id);
  const dialog = document.createElement("dialog");
  dialog.addEventListener("dragover", (event) => event.stopPropagation());
  dialog.addEventListener("drop", (event) => event.stopPropagation());
  dialog.id = "backdrop-dialog";
  dialog.className = "backdrop-dialog";
  dialog.innerHTML = `<header><h2>背景與透明度</h2><button type="button" data-close aria-label="關閉背景設定">${icon("close")}</button></header><div class="backdrop-tabs"><button data-tab="drawing">繪圖畫布</button><button data-tab="preview">動畫預覽</button></div><section data-panel="drawing"><h3>畫布背景</h3><div class="checker-choices"><button data-mode="light"><span class="checker-light"></span>淺色棋盤</button><button data-mode="dark"><span class="checker-dark"></span>深色棋盤</button></div><h3>純色背景</h3><div class="backdrop-swatches" data-swatches="drawing"></div><label class="backdrop-color-input">自訂顏色<input id="drawing-backdrop-color" type="color" value="${state.color}"><output id="drawing-backdrop-hex">${state.color.toUpperCase()}</output></label><label class="backdrop-occupancy-setting"><input id="backdrop-occupancy" type="checkbox" ${state.occupancy ? "checked" : ""}>標示非透明像素</label><p>背景與標示只供檢視，不會加入輸出圖片。</p></section><section data-panel="preview"><h3>預覽背景色</h3><div class="backdrop-swatches" data-swatches="preview"></div><label class="backdrop-color-input">自訂顏色<input id="preview-backdrop-color" type="color" value="${state.previewColor}"><output id="preview-backdrop-hex">${state.previewColor.toUpperCase()}</output></label><h3>背景圖片</h3><label class="backdrop-image-upload">${icon("upload")}上傳背景圖片<input id="preview-backdrop-file" type="file" accept="image/*"></label><div class="backdrop-image-options"><label>圖片顯示<select id="preview-backdrop-fit"><option value="contain">完整顯示</option><option value="cover">填滿預覽</option></select></label><button id="clear-preview-backdrop" type="button">${icon("trash")}移除背景圖片</button></div><div class="backdrop-image-thumbnail" id="backdrop-image-thumbnail"></div><p>背景圖片只供預覽，不會加入輸出素材。</p></section><p id="backdrop-status" role="status"></p><footer><button type="button" data-close class="primary">完成</button></footer>`;
  const presets = [
    { color: "#ffffff", label: "白色" },
    { color: "#b8b8b8", label: "中灰" },
    { color: "#202020", label: "黑色" },
    { color: "#00b050", label: "綠色" },
    { color: "#ff00b8", label: "洋紅" },
  ];
  dialog.querySelectorAll<HTMLElement>("[data-swatches]").forEach((host) =>
    presets.forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "backdrop-color-swatch";
      button.style.background = preset.color;
      button.setAttribute(
        "aria-label",
        (host.dataset.swatches === "drawing" ? "畫布" : "預覽") + preset.label,
      );
      button.title = preset.label;
      button.dataset.color = preset.color;
      button.onclick = () => {
        if (host.dataset.swatches === "drawing") {
          state.mode = "solid";
          state.color = preset.color;
        } else state.previewColor = preset.color;
        commit();
      };
      host.append(button);
    }),
  );
  function refreshDialog() {
    dialog.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => {
      const isSelected = button.dataset.mode === state.mode;
      button.classList.toggle("active", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
    dialog.querySelectorAll<HTMLElement>("[data-swatches]").forEach((host) =>
      host.querySelectorAll<HTMLElement>("button").forEach((button) => {
        const isSelected =
          host.dataset.swatches === "drawing"
            ? state.mode === "solid" && state.color === button.dataset.color
            : state.previewColor === button.dataset.color;
        button.classList.toggle("active", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      }),
    );
    (
      dialog.querySelector("#drawing-backdrop-color") as HTMLInputElement
    ).value = state.color;
    (
      dialog.querySelector("#preview-backdrop-color") as HTMLInputElement
    ).value = state.previewColor;
    dialog.querySelector("#drawing-backdrop-hex")!.textContent =
      state.color.toUpperCase();
    dialog.querySelector("#preview-backdrop-hex")!.textContent =
      state.previewColor.toUpperCase();
    const image = dialog.querySelector<HTMLElement>(
      "#backdrop-image-thumbnail",
    )!;
    image.hidden = !state.imageUrl;
    image.style.backgroundImage = state.imageUrl
      ? `url("${state.imageUrl}")`
      : "none";
    (
      dialog.querySelector("#clear-preview-backdrop") as HTMLButtonElement
    ).disabled = !state.imageUrl;
    (dialog.querySelector("#preview-backdrop-fit") as HTMLSelectElement).value =
      state.previewFit;
  }
  function commit() {
    savePreferences(id);
    if (activeId === id) applyState();
    refreshDialog();
  }
  function switchTab(strTab: string) {
    dialog
      .querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((panel) => (panel.hidden = panel.dataset.panel !== strTab));
    dialog.querySelectorAll<HTMLElement>("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === strTab);
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.tab === strTab),
      );
    });
  }
  dialog
    .querySelectorAll<HTMLElement>("[data-tab]")
    .forEach(
      (button) => (button.onclick = () => switchTab(button.dataset.tab!)),
    );
  dialog.querySelectorAll<HTMLElement>("[data-mode]").forEach(
    (button) =>
      (button.onclick = () => {
        state.mode = button.dataset.mode as BackdropState["mode"];
        commit();
      }),
  );
  dialog
    .querySelector("#drawing-backdrop-color")!
    .addEventListener("input", (event) => {
      state.mode = "solid";
      state.color = (event.target as HTMLInputElement).value;
      commit();
    });
  dialog
    .querySelector("#preview-backdrop-color")!
    .addEventListener("input", (event) => {
      state.previewColor = (event.target as HTMLInputElement).value;
      commit();
    });
  dialog
    .querySelector("#backdrop-occupancy")!
    .addEventListener("change", (event) => {
      state.occupancy = (event.target as HTMLInputElement).checked;
      commit();
    });
  dialog
    .querySelector("#preview-backdrop-fit")!
    .addEventListener("change", (event) => {
      state.previewFit = (event.target as HTMLSelectElement)
        .value as BackdropState["previewFit"];
      commit();
    });
  dialog
    .querySelector("#preview-backdrop-file")!
    .addEventListener("change", async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file),
        image = new Image();
      image.src = url;
      try {
        await image.decode();
      } catch {
        URL.revokeObjectURL(url);
        dialog.querySelector("#backdrop-status")!.textContent =
          "無法讀取這張圖片，請重新選擇。";
        return;
      }
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = url;
      commit();
      await imageStore()
        .then(
          (db) =>
            new Promise<void>((resolve, reject) => {
              const request = db
                .transaction("images", "readwrite")
                .objectStore("images")
                .put({ id, blob: file });
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
            }),
        )
        .catch(() => {
          dialog.querySelector("#backdrop-status")!.textContent =
            "圖片可供本次預覽，但無法儲存至此瀏覽器。";
        });
    });
  dialog
    .querySelector("#clear-preview-backdrop")!
    .addEventListener("click", () => {
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = "";
      commit();
      void imageStore().then((db) => {
        db.transaction("images", "readwrite").objectStore("images").delete(id);
      });
      (
        dialog.querySelector("#preview-backdrop-file") as HTMLInputElement
      ).value = "";
    });
  dialog
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () => dialog.close()),
    );
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  switchTab(tab);
  refreshDialog();
  dialog.showModal();
}

export async function removeBackdropSettings(projectId: string) {
  const state = states.get(projectId);
  if (state?.imageUrl) URL.revokeObjectURL(state.imageUrl);
  states.delete(projectId);
  loadedImages.delete(projectId);
  localStorage.removeItem("pixel-backdrop:" + projectId);
  const db = await imageStore();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("images", "readwrite");
    transaction.objectStore("images").delete(projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
