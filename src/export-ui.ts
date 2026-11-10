import "./export-ui.css";
import type { Project } from "./types";
import {
  downloadBlob,
  exportFramePng,
  exportGodotZip,
  exportWebZip,
  paintExportCanvas,
  projectFileName,
} from "./export";

type ExportKind = "png" | "web" | "godot" | "project";

export function openExportDialog(
  source: Project,
  iCurrentAction: number,
  iCurrentFrame: number,
  projectFile: unknown,
) {
  const project = structuredClone(source);
  const payload = structuredClone(projectFile);
  const versions =
    (payload as { versions?: { name?: string; savedAt?: number }[] })
      .versions || [];
  const selected = new Set([iCurrentAction]);
  let kind: ExportKind = "png";
  let iPreviewAction = iCurrentAction;
  let startedAt = performance.now();
  let iAnimation = 0;
  let iLastFrame = -1;
  const dialog = document.createElement("dialog");
  dialog.className = "export-dialog";
  dialog.id = "export-dialog";
  dialog.innerHTML = `<div class="export-dialog-heading"><div><h2>下載作品</h2><p>先預覽內容，再確認下載。</p></div><button data-export-close aria-label="關閉下載視窗">×</button></div>
        <div class="export-dialog-body"><section class="export-config"><div class="export-format-tabs" aria-label="下載格式"><button data-export-kind="png">PNG 圖片</button><button data-export-kind="web">Web 動畫</button><button data-export-kind="godot">Godot 素材</button><button data-export-kind="project">專案備份</button></div><div id="export-scope"></div><div class="export-file-list"><h3>下載內容</h3><ul id="export-files"></ul></div></section>
        <section class="export-inspection"><div class="export-preview-heading"><h3 id="export-preview-title">圖片預覽</h3><select id="export-preview-action" aria-label="預覽動作"></select><button id="export-replay">重新播放</button></div><div class="export-artboard"><canvas id="export-preview-canvas" aria-label="實際匯出像素預覽"></canvas></div><p id="export-preview-info"></p><div id="export-metadata"></div><p class="export-preview-note" id="export-note"></p></section></div>
        <div class="export-dialog-footer"><span id="export-status" role="status"></span><button data-export-close>取消</button><button id="export-confirm" class="primary">下載 PNG</button></div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector<HTMLCanvasElement>(
    "#export-preview-canvas",
  )!;
  const scope = dialog.querySelector<HTMLElement>("#export-scope")!;
  const metadata = dialog.querySelector<HTMLElement>("#export-metadata")!;
  const actionSelect = dialog.querySelector<HTMLSelectElement>(
    "#export-preview-action",
  )!;
  const confirm = dialog.querySelector<HTMLButtonElement>("#export-confirm")!;
  const status = dialog.querySelector<HTMLElement>("#export-status")!;
  const replay = dialog.querySelector<HTMLButtonElement>("#export-replay")!;
  const info = dialog.querySelector<HTMLElement>("#export-preview-info")!;
  const fileNames: Record<ExportKind, string[]> = {
    png: [
      `${projectFileName(project)}-${iCurrentAction + 1}-${iCurrentFrame + 1}.png`,
    ],
    web: [
      "spritesheet.png",
      "animations.json",
      "index.html（可直接開啟的動畫預覽）",
    ],
    godot: [
      "spritesheet.png",
      "animations.json",
      "sprite_frames.tres",
      "preview.tscn",
      "preview.gd",
      "project.godot",
      "README.txt",
    ],
    project: [`${projectFileName(project)}.pixel.json`],
  };
  const labels: Record<ExportKind, string> = {
    png: "下載 PNG",
    web: "下載 Web ZIP",
    godot: "下載 Godot ZIP",
    project: "下載專案 JSON",
  };
  function detail(label: string, value: string) {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const content = document.createElement("strong");
    name.textContent = label;
    content.textContent = value;
    row.append(name, content);
    metadata.append(row);
  }
  function render() {
    cancelAnimationFrame(iAnimation);
    scope.replaceChildren();
    metadata.replaceChildren();
    status.textContent = "";
    iLastFrame = -1;
    startedAt = performance.now();
    const isAnimation = kind === "web" || kind === "godot";
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-export-kind]")
      .forEach((button) => {
        button.classList.toggle("active", button.dataset.exportKind === kind);
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.exportKind === kind),
        );
      });
    const files = dialog.querySelector("#export-files")!;
    files.replaceChildren();
    fileNames[kind].forEach((name) => {
      const item = document.createElement("li");
      item.textContent = name;
      files.append(item);
    });
    confirm.textContent = labels[kind];
    confirm.disabled = isAnimation && !selected.size;
    dialog.querySelector("#export-preview-title")!.textContent =
      kind === "png"
        ? "目前影格"
        : kind === "project"
          ? "專案內容"
          : "動畫預覽";
    actionSelect.hidden = !isAnimation;
    replay.hidden = !isAnimation;
    dialog
      .querySelector(".export-artboard")!
      .classList.toggle("is-project", kind === "project");
    canvas.hidden = kind === "project";
    info.hidden = kind === "project";
    actionSelect.replaceChildren();
    if (isAnimation) {
      const heading = document.createElement("h3");
      heading.textContent = "選擇要下載的動作";
      scope.append(heading);
      const all = document.createElement("button");
      all.className = "export-select-all";
      all.textContent =
        selected.size === project.actions.length ? "取消全選" : "選擇全部";
      all.onclick = () => {
        if (selected.size === project.actions.length) selected.clear();
        else project.actions.forEach((_, i) => selected.add(i));
        render();
      };
      scope.append(all);
      project.actions.forEach((action, i) => {
        const label = document.createElement("label");
        label.className = "export-action-choice";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = selected.has(i);
        input.dataset.exportAction = String(i);
        const text = document.createElement("span");
        text.textContent = action.name;
        const summary = document.createElement("small");
        summary.textContent = `${action.frames.length} 格 · ${action.fps} FPS · ${action.loop ? "循環" : "單次"}`;
        label.append(input, text, summary);
        scope.append(label);
        input.onchange = () => {
          if (input.checked) selected.add(i);
          else selected.delete(i);
          render();
        };
        if (selected.has(i)) {
          const option = document.createElement("option");
          option.value = String(i);
          option.textContent = action.name;
          actionSelect.append(option);
        }
      });
      if (!selected.has(iPreviewAction))
        iPreviewAction = [...selected][0] ?? iCurrentAction;
      actionSelect.value = String(iPreviewAction);
      const actions = project.actions.filter((_, i) => selected.has(i));
      detail(
        "所選動作",
        `${actions.length} 個 · ${actions.reduce((total, action) => total + action.frames.length, 0)} 格`,
      );
      status.textContent = `${actions.length} 個動作 · ${actions.reduce((total, action) => total + action.frames.length, 0)} 格`;
      detail(
        "圖集尺寸",
        actions.length
          ? `${Math.max(...actions.map((action) => action.frames.length)) * project.width} × ${actions.length * project.height} px`
          : "請至少選擇一個動作",
      );
      dialog.querySelector("#export-note")!.textContent =
        "只包含所選動作的像素。透明度、FPS、循環與對齊基準會保留；參考底圖、格線與洋蔥皮不會出現在素材中。";
    } else if (kind === "png") {
      const description = document.createElement("p");
      description.className = "export-scope-summary";
      description.textContent = `${project.actions[iCurrentAction].name} · 第 ${iCurrentFrame + 1} 格`;
      scope.append(description);
      detail("圖片尺寸", `${project.width} × ${project.height} px`);
      detail("背景", "透明 PNG");
      status.textContent = `目前影格 · ${project.width} × ${project.height} px`;
      dialog.querySelector("#export-note")!.textContent =
        "這裡顯示實際下載的單格像素。棋盤格只表示透明區域；參考底圖、格線、對齊標記與洋蔥皮不會下載。";
    } else {
      const description = document.createElement("p");
      description.className = "export-scope-summary";
      description.textContent = project.name;
      scope.append(description);
      detail("畫布", `${project.width} × ${project.height} px`);
      detail(
        "動作與影格",
        `${project.actions.length} 個動作 · ${project.actions.reduce((total, action) => total + action.frames.length, 0)} 格`,
      );
      detail("專案色盤", `${project.palette.length} 色`);
      detail(
        "參考底圖",
        `${project.actions.reduce((total, action) => total + action.frames.filter((frame) => frame.reference?.some(Boolean)).length, 0)} 格`,
      );
      detail("版本快照", `${versions.length} 個`);
      status.textContent = `${project.actions.length} 個動作 · ${versions.length} 個版本`;
      project.actions.forEach((action) =>
        detail(
          action.name,
          `${action.frames.length} 格 · ${action.fps} FPS · ${action.loop ? "循環" : "單次"}`,
        ),
      );
      versions.forEach((version) =>
        detail(
          version.name || "未命名版本",
          version.savedAt
            ? new Date(version.savedAt).toLocaleString("zh-TW")
            : "",
        ),
      );
      dialog.querySelector("#export-note")!.textContent =
        "完整可編輯備份，包含所有動作、影格、參考底圖、色盤、對齊基準及此專案的版本快照。";
    }
    if (kind !== "project")
      detail("對齊基準", `${project.pivot.x}, ${project.pivot.y}`);
    if (kind === "png") {
      paintExportCanvas(
        canvas,
        project,
        project.actions[iCurrentAction].frames[iCurrentFrame].pixels,
      );
      info.textContent = `${project.actions[iCurrentAction].name} · 第 ${iCurrentFrame + 1} 格 · ${project.width} × ${project.height} px`;
    } else if (isAnimation && selected.size) tick(performance.now());
    else if (isAnimation) {
      canvas.width = project.width;
      canvas.height = project.height;
      info.textContent = "請選擇要下載的動作。";
    }
  }
  function tick(now: number) {
    if (!dialog.open || kind === "project" || kind === "png" || !selected.size)
      return;
    const action = project.actions[iPreviewAction];
    const elapsed = Math.floor(((now - startedAt) * action.fps) / 1000);
    const iFrame = action.loop
      ? elapsed % action.frames.length
      : Math.min(elapsed, action.frames.length - 1);
    if (iLastFrame !== iFrame) {
      paintExportCanvas(canvas, project, action.frames[iFrame].pixels);
      info.textContent = `${action.name} · 第 ${iFrame + 1} / ${action.frames.length} 格 · ${action.fps} FPS · ${action.loop ? "循環" : "單次"}`;
      iLastFrame = iFrame;
    }
    iAnimation = requestAnimationFrame(tick);
  }
  dialog.querySelectorAll<HTMLButtonElement>("[data-export-kind]").forEach(
    (button) =>
      (button.onclick = () => {
        kind = button.dataset.exportKind as ExportKind;
        render();
      }),
  );
  dialog
    .querySelectorAll("[data-export-close]")
    .forEach((button) =>
      button.addEventListener("click", () => dialog.close()),
    );
  actionSelect.onchange = () => {
    iPreviewAction = Number(actionSelect.value);
    startedAt = performance.now();
    iLastFrame = -1;
  };
  replay.onclick = () => {
    startedAt = performance.now();
    iLastFrame = -1;
  };
  confirm.onclick = async () => {
    confirm.disabled = true;
    status.textContent = "正在準備下載…";
    try {
      if (kind === "png")
        await exportFramePng(project, iCurrentAction, iCurrentFrame);
      else if (kind === "project")
        downloadBlob(
          new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          }),
          `${projectFileName(project)}.pixel.json`,
        );
      else {
        const subset = {
          ...project,
          actions: project.actions.filter((_, i) => selected.has(i)),
        };
        if (kind === "web") await exportWebZip(subset);
        else await exportGodotZip(subset);
      }
      status.textContent = "下載已開始";
    } catch {
      status.textContent = "無法建立下載，請再試一次。";
    }
    confirm.disabled = false;
  };
  dialog.onclose = () => {
    cancelAnimationFrame(iAnimation);
    dialog.remove();
  };
  dialog.showModal();
  render();
}
