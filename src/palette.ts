import "./palette.css";

interface ColorFamily {
  name: string;
  keywords: string;
  hue: number | null;
  colors: string[];
}
const LIGHTNESS = [
  97, 94, 90, 85, 79, 72, 65, 58, 51, 44, 38, 32, 26, 20, 14, 8,
];
function hslHex(hue: number, saturation: number, lightness: number) {
  const chroma = ((1 - Math.abs((2 * lightness) / 100 - 1)) * saturation) / 100;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness / 100 - chroma / 2;
  const channels =
    hue < 60
      ? [chroma, secondary, 0]
      : hue < 120
        ? [secondary, chroma, 0]
        : hue < 180
          ? [0, chroma, secondary]
          : hue < 240
            ? [0, secondary, chroma]
            : hue < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  return (
    "#" +
    channels
      .map((channel) =>
        Math.round((channel + offset) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export const COLOR_FAMILIES: ColorFamily[] = [
  ["灰階", "gray grey black white 黑 白 灰", null],
  ["紅", "red 紅", 0],
  ["朱橘", "orange coral 朱 橘", 18],
  ["琥珀", "amber brown 棕 褐 琥珀", 36],
  ["黃", "yellow 黃", 52],
  ["萊姆", "lime 黃綠 萊姆", 74],
  ["草綠", "grass green 草 綠", 96],
  ["綠", "green forest 森林 綠", 130],
  ["薄荷", "mint emerald 薄荷 翠 綠", 162],
  ["青", "cyan teal 青 湖水", 184],
  ["天藍", "sky blue 天 藍", 205],
  ["藍", "blue cornflower 藍", 224],
  ["靛", "indigo 靛 紫藍", 244],
  ["紫", "purple violet 紫", 266],
  ["洋紅", "magenta fuchsia 洋紅 桃", 290],
  ["粉紅", "pink rose 粉 玫瑰", 326],
].map(([name, keywords, hue]) => ({
  name: String(name),
  keywords: String(keywords),
  hue: hue as number | null,
  colors: LIGHTNESS.map((lightness, i) =>
    hue === null
      ? "#" +
        Math.round((255 * (15 - i)) / 15)
          .toString(16)
          .padStart(2, "0")
          .repeat(3)
      : hslHex(Number(hue), 72, lightness),
  ),
}));
export const PALETTE_COLORS = COLOR_FAMILIES.flatMap((family) => family.colors);
const FAVORITES_KEY = "pixel-studio-favorite-colors";
let favorites: string[] = JSON.parse(
  localStorage.getItem(FAVORITES_KEY) || "[]",
);
let selected = "#5078e8";
let chooseColor: (color: string) => void;
let projectColors: string[] = [];
let panel: HTMLElement;
let editProjectPalette: () => void;
let activeFamily = "全部",
  search = "",
  activeTab = "library";
export function mountColorPanel(
  host: HTMLElement,
  color: string,
  colors: string[],
  onSelect: (color: string) => void,
  onEdit: () => void,
) {
  panel = host;
  selected = color.toLowerCase();
  projectColors = colors;
  chooseColor = onSelect;
  editProjectPalette = onEdit;
  panel.innerHTML = `<div class="section-label">顏色 <button id="palette-edit" title="編輯專案色盤" aria-label="編輯專案色盤">⋯</button></div><div class="color-current"><input id="color" type="color" aria-label="自訂顏色"><input id="color-hex" aria-label="自訂 HEX 顏色" maxlength="7" spellcheck="false"><button id="favorite-current" aria-label="收藏目前顏色" title="收藏目前顏色">☆</button></div><button id="open-color-library" class="color-library-button"><span class="mini-spectrum"></span><strong>256 色色庫</strong><span>›</span></button><div class="palette-mini-heading"><span>專案色盤</span><span>${colors.length} 色</span></div><div class="project-color-chips"></div><button id="open-favorites" class="favorites-link">☆ 收藏色彩 <span></span></button>`;
  panel
    .querySelector("#palette-edit")!
    .addEventListener("click", editProjectPalette);
  panel.querySelector<HTMLInputElement>("#color")!.oninput = (event) =>
    pick((event.target as HTMLInputElement).value);
  panel.querySelector<HTMLInputElement>("#color-hex")!.onchange = (event) => {
    const input = event.target as HTMLInputElement;
    let value = input.value.trim();
    if (!value.startsWith("#")) value = "#" + value;
    if (/^#[\da-f]{3}$/i.test(value))
      value =
        "#" +
        value
          .slice(1)
          .split("")
          .map((character) => character.repeat(2))
          .join("");
    if (/^#[\da-f]{6}$/i.test(value)) {
      input.setCustomValidity("");
      pick(value);
    } else {
      input.setCustomValidity("請輸入 3 或 6 位 HEX 色碼，例如 #5078E8");
      input.reportValidity();
    }
  };
  panel
    .querySelector("#favorite-current")!
    .addEventListener("click", toggleFavorite);
  panel
    .querySelector("#open-color-library")!
    .addEventListener("click", () => openLibrary("library"));
  panel
    .querySelector("#open-favorites")!
    .addEventListener("click", () => openLibrary("favorites"));
  const chips = panel.querySelector(".project-color-chips")!;
  colors
    .slice(0, 12)
    .forEach((color) => chips.append(colorButton(color, "專案色盤")));
  updateColorSelection(color);
}
function colorButton(color: string, label: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "color-chip";
  button.style.background = color;
  button.dataset.paletteColor = color.toLowerCase();
  button.title = `${label} ${color.toUpperCase()}`;
  button.setAttribute("aria-label", button.title);
  button.onclick = () => pick(color);
  return button;
}
function pick(color: string) {
  selected = color.toLowerCase();
  chooseColor(selected);
  updateColorSelection(selected);
}
export function updateColorSelection(color: string) {
  selected = color.toLowerCase();
  if (!panel?.isConnected) return;
  panel.querySelector<HTMLInputElement>("#color")!.value = selected;
  panel.querySelector<HTMLInputElement>("#color-hex")!.value =
    selected.toUpperCase();
  const hasFavorite = favorites.includes(selected);
  const button = panel.querySelector("#favorite-current")!;
  button.textContent = hasFavorite ? "★" : "☆";
  button.setAttribute("aria-pressed", String(hasFavorite));
  panel.querySelector("#open-favorites span")!.textContent = String(
    favorites.length,
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-palette-color]")
    .forEach((button) => {
      const isSelected = button.dataset.paletteColor === selected;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  const current = document.querySelector<HTMLElement>("#library-current");
  if (current) {
    current.style.background = selected;
    document.querySelector("#library-hex")!.textContent =
      selected.toUpperCase();
    document.querySelector("#library-favorite")!.textContent = hasFavorite
      ? "★ 已收藏"
      : "☆ 收藏此色";
  }
}
function toggleFavorite() {
  favorites = favorites.includes(selected)
    ? favorites.filter((color) => color !== selected)
    : [...favorites, selected];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  updateColorSelection(selected);
  if (activeTab === "favorites") renderLibraryColors();
}
function openLibrary(tab: string) {
  activeTab = tab;
  activeFamily = "全部";
  search = "";
  const dialog = document.createElement("dialog");
  dialog.id = "color-library";
  dialog.className = "color-library";
  dialog.innerHTML = `<div class="modal-heading"><div><h2>色彩庫</h2><p>依色系與明暗排列，點選即可使用。</p></div><button data-close aria-label="關閉色彩庫">×</button></div><div class="color-library-toolbar"><div class="color-tabs"><button data-color-tab="library">256 色</button><button data-color-tab="favorites">我的收藏</button><button data-color-tab="project">專案色盤</button></div><label class="color-search"><span>⌕</span><input placeholder="搜尋色系或 HEX，如 藍、#5078E8" aria-label="搜尋色系或 HEX"><button id="clear-color-search" aria-label="清除搜尋">×</button></label></div><div class="color-family-tabs"></div><div class="color-library-content" role="region" aria-label="色票"><div id="library-colors"></div></div><div class="color-library-footer"><div><span id="library-current"></span><strong id="library-hex"></strong><button id="library-favorite"></button></div><span id="color-result-count"></span><button data-close class="primary">完成</button></div>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () => dialog.close()),
    );
  dialog.onclose = () => dialog.remove();
  dialog.querySelectorAll<HTMLButtonElement>("[data-color-tab]").forEach(
    (button) =>
      (button.onclick = () => {
        activeTab = button.dataset.colorTab!;
        renderLibraryColors();
      }),
  );
  const input = dialog.querySelector<HTMLInputElement>(".color-search input")!;
  input.oninput = () => {
    search = input.value.trim().toLowerCase();
    renderLibraryColors();
  };
  dialog.querySelector("#clear-color-search")!.addEventListener("click", () => {
    input.value = "";
    search = "";
    renderLibraryColors();
    input.focus();
  });
  dialog
    .querySelector("#library-favorite")!
    .addEventListener("click", toggleFavorite);
  const tabs = dialog.querySelector(".color-family-tabs")!;
  ["全部", ...COLOR_FAMILIES.map((family) => family.name)].forEach((name) => {
    const button = document.createElement("button");
    button.textContent = name;
    button.dataset.family = name;
    button.onclick = () => {
      activeFamily = name;
      activeTab = "library";
      renderLibraryColors();
    };
    tabs.append(button);
  });
  renderLibraryColors();
  updateColorSelection(selected);
}
function renderLibraryColors() {
  const dialog = document.querySelector("#color-library");
  if (!dialog) return;
  const host = dialog.querySelector("#library-colors")!;
  host.replaceChildren();
  let count = 0;
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-color-tab]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.colorTab === activeTab),
    );
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-family]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.family === activeFamily),
    );
  dialog.querySelector<HTMLElement>(".color-family-tabs")!.hidden =
    activeTab !== "library";
  const families =
    activeTab === "library"
      ? COLOR_FAMILIES
      : [
          {
            name: activeTab === "favorites" ? "我的收藏" : "專案色盤",
            keywords: "",
            colors: activeTab === "favorites" ? favorites : projectColors,
          },
        ];
  families.forEach((family) => {
    if (
      activeTab === "library" &&
      activeFamily !== "全部" &&
      family.name !== activeFamily
    )
      return;
    const colors = family.colors.filter(
      (color) =>
        !search ||
        family.name.includes(search) ||
        family.keywords.includes(search) ||
        color.includes(search.startsWith("#") ? search : "#" + search),
    );
    if (!colors.length) return;
    count += colors.length;
    const row = document.createElement("div");
    row.className = "color-ramp";
    const label = document.createElement("span");
    label.textContent = family.name;
    row.append(label);
    const swatches = document.createElement("div");
    swatches.className = "color-ramp-swatches";
    colors.forEach((color) => swatches.append(colorButton(color, family.name)));
    row.append(swatches);
    host.append(row);
  });
  if (!count) {
    const empty = document.createElement("p");
    empty.className = "color-empty";
    empty.textContent =
      activeTab === "favorites" && !search
        ? "還沒有收藏。選一個顏色，再按「☆ 收藏此色」。收藏會保留於此瀏覽器，可跨專案使用。"
        : "找不到符合的顏色。試試其他色系或直接輸入自訂 HEX。";
    host.append(empty);
  }
  let custom = search.startsWith("#") ? search : "#" + search;
  if (/^#[\da-f]{3}$/i.test(custom))
    custom =
      "#" +
      custom
        .slice(1)
        .split("")
        .map((character) => character.repeat(2))
        .join("");
  if (/^#[\da-f]{6}$/i.test(custom) && !PALETTE_COLORS.includes(custom)) {
    const button = document.createElement("button");
    button.className = "custom-search-color";
    const chip = document.createElement("span");
    chip.style.background = custom;
    button.append(
      chip,
      document.createTextNode(`使用自訂顏色 ${custom.toUpperCase()}`),
    );
    button.onclick = () => pick(custom);
    host.append(button);
  }
  dialog.querySelector("#color-result-count")!.textContent =
    `${count} 色${activeTab === "library" && !search && activeFamily === "全部" ? " · 由淺至深 →" : ""}`;
  updateColorSelection(selected);
}
