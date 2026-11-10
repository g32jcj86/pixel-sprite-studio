import type { Project } from "./types";

const encoder = new TextEncoder();

export function downloadBlob(blob: Blob, strFileName: string) {
  const strUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = strUrl;
  link.download = strFileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(strUrl), 1000);
}

export function projectFileName(project: Project) {
  return (
    project.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "sprite"
  );
}

function drawPixels(
  context: CanvasRenderingContext2D,
  pixels: string[],
  iWidth: number,
  iLeft = 0,
  iTop = 0,
) {
  pixels.forEach((strColor, i) => {
    if (!strColor) return;
    context.fillStyle = strColor;
    context.fillRect(iLeft + (i % iWidth), iTop + Math.floor(i / iWidth), 1, 1);
  });
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("無法建立 PNG"))),
      "image/png",
    ),
  );
}

export function paintExportCanvas(
  canvas: HTMLCanvasElement,
  project: Pick<Project, "width" | "height">,
  pixels: string[],
) {
  canvas.width = project.width;
  canvas.height = project.height;
  drawPixels(canvas.getContext("2d")!, pixels, project.width);
}

export async function exportFramePng(
  project: Project,
  iAction: number,
  iFrame: number,
) {
  const canvas = document.createElement("canvas");
  paintExportCanvas(
    canvas,
    project,
    project.actions[iAction].frames[iFrame].pixels,
  );
  downloadBlob(
    await canvasPng(canvas),
    `${projectFileName(project)}-${iAction + 1}-${iFrame + 1}.png`,
  );
}

async function buildSheet(project: Project) {
  const iColumns = Math.max(
    ...project.actions.map((action) => action.frames.length),
  );
  const canvas = document.createElement("canvas");
  canvas.width = iColumns * project.width;
  canvas.height = project.actions.length * project.height;
  const context = canvas.getContext("2d")!;
  project.actions.forEach((action, i) =>
    action.frames.forEach((frame, j) => {
      drawPixels(
        context,
        frame.pixels,
        project.width,
        j * project.width,
        i * project.height,
      );
    }),
  );
  return {
    png: await canvasPng(canvas),
    canvas,
    metadata: {
      name: project.name,
      image: "spritesheet.png",
      width: project.width,
      height: project.height,
      sheetWidth: canvas.width,
      sheetHeight: canvas.height,
      pivot: project.pivot,
      actions: project.actions.map((action, i) => ({
        name: action.name,
        fps: action.fps,
        loop: action.loop,
        frames: action.frames.map((_, j) => ({
          x: j * project.width,
          y: i * project.height,
          width: project.width,
          height: project.height,
        })),
      })),
    },
  };
}

// ZIP 的儲存模式不需外部套件；PNG 本身已壓縮。
export async function createZip(
  files: Record<string, Blob | string>,
): Promise<Blob> {
  const parts: BlobPart[] = [];
  const directories: Uint8Array[] = [];
  let iOffset = 0;
  for (const [strName, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(strName);
    const bytes =
      typeof content === "string"
        ? encoder.encode(content)
        : new Uint8Array(await content.arrayBuffer());
    let iCrc = 0xffffffff;
    for (const iByte of bytes) {
      iCrc ^= iByte;
      for (let i = 0; i < 8; i++)
        iCrc = (iCrc >>> 1) ^ (iCrc & 1 ? 0xedb88320 : 0);
    }
    iCrc = (iCrc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint32(14, iCrc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const directory = new Uint8Array(46 + nameBytes.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint16(8, 0x800, true);
    directoryView.setUint32(16, iCrc, true);
    directoryView.setUint32(20, bytes.length, true);
    directoryView.setUint32(24, bytes.length, true);
    directoryView.setUint16(28, nameBytes.length, true);
    directoryView.setUint32(42, iOffset, true);
    directory.set(nameBytes, 46);
    parts.push(local, bytes);
    directories.push(directory);
    iOffset += local.length + bytes.length;
  }
  const iDirectorySize = directories.reduce(
    (iTotal, directory) => iTotal + directory.length,
    0,
  );
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, directories.length, true);
  endView.setUint16(10, directories.length, true);
  endView.setUint32(12, iDirectorySize, true);
  endView.setUint32(16, iOffset, true);
  return new Blob([...parts, ...directories, end], { type: "application/zip" });
}

export async function exportWebZip(project: Project) {
  const sheet = await buildSheet(project);
  const strData = JSON.stringify(sheet.metadata).replace(/</g, "\\u003c");
  const strNonce = crypto.randomUUID();
  const strHtml = `<!doctype html>
<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${strNonce}'"><title>像素動畫預覽</title><style>body{background:#17202b;color:#eef;font:16px system-ui;text-align:center;padding:32px}canvas{image-rendering:pixelated;background:repeating-conic-gradient(#26323e 0% 25%,#1e2935 0% 50%) 0/24px 24px;width:min(70vw,512px);height:auto}select,button{padding:10px;margin:12px}p{color:#aabbd0}</style>
<h1 id="title"></h1><select id="actions" aria-label="動作"></select><button id="replay">重新播放</button><br><canvas id="sprite"></canvas><p id="info"></p>
<script nonce="${strNonce}">
const data=${strData};
const canvas=document.getElementById('sprite');canvas.width=data.width;canvas.height=data.height;
const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
const select=document.getElementById('actions');document.getElementById('title').textContent=data.name;
data.actions.forEach((action,index)=>{const option=document.createElement('option');option.value=index;option.textContent=action.name;select.append(option)});
const image=new Image();image.src=${JSON.stringify(sheet.canvas.toDataURL("image/png"))};
let started=performance.now();select.onchange=()=>started=performance.now();document.getElementById('replay').onclick=()=>started=performance.now();
function draw(now){const action=data.actions[Number(select.value)];const elapsed=Math.floor((now-started)*action.fps/1000);const index=action.loop?elapsed%action.frames.length:Math.min(elapsed,action.frames.length-1);const frame=action.frames[index];context.clearRect(0,0,data.width,data.height);if(image.complete)context.drawImage(image,frame.x,frame.y,frame.width,frame.height,0,0,data.width,data.height);document.getElementById('info').textContent=action.fps+' FPS · '+(index+1)+' / '+action.frames.length+' · pivot ('+data.pivot.x+', '+data.pivot.y+')';requestAnimationFrame(draw)}requestAnimationFrame(draw);
</script></html>`;
  downloadBlob(
    await createZip({
      "spritesheet.png": sheet.png,
      "animations.json": JSON.stringify(sheet.metadata, null, 2),
      "index.html": strHtml,
    }),
    `${projectFileName(project)}-web.zip`,
  );
}

export async function exportGodotZip(project: Project) {
  const sheet = await buildSheet(project);
  let iTexture = 0;
  const textures: string[] = [];
  const animations = project.actions.map((action, i) => {
    const frames = action.frames.map((_, j) => {
      const strId = `AtlasTexture_${++iTexture}`;
      textures.push(
        `[sub_resource type="AtlasTexture" id="${strId}"]\natlas = ExtResource("1_sheet")\nregion = Rect2(${j * project.width}, ${i * project.height}, ${project.width}, ${project.height})\n`,
      );
      return `{ "duration": 1.0, "texture": SubResource("${strId}") }`;
    });
    return `{ "frames": [${frames.join(", ")}], "loop": ${action.loop}, "name": &${JSON.stringify(action.name)}, "speed": ${Number(action.fps)} }`;
  });
  const strResource = `[gd_resource type="SpriteFrames" load_steps=${iTexture + 2} format=3]\n\n[ext_resource type="Texture2D" path="spritesheet.png" id="1_sheet"]\n\n${textures.join("\n")}\n[resource]\nanimations = [${animations.join(",\n")}]\n`;
  const strScene = `[gd_scene load_steps=3 format=3]\n\n[ext_resource type="SpriteFrames" path="sprite_frames.tres" id="1_frames"]\n[ext_resource type="Script" path="preview.gd" id="2_script"]\n\n[node name="SpritePreview" type="Node2D"]\nscript = ExtResource("2_script")\n\n[node name="AnimatedSprite2D" type="AnimatedSprite2D" parent="."]\ntexture_filter = 1\nposition = Vector2(320, 260)\nscale = Vector2(4, 4)\nsprite_frames = ExtResource("1_frames")\nanimation = &${JSON.stringify(project.actions[0].name)}\nautoplay = ${JSON.stringify(project.actions[0].name)}\ncentered = false\noffset = Vector2(${-project.pivot.x}, ${-project.pivot.y})\n`;
  const strScript = `extends Node2D\n\n@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D\n\nfunc _ready() -> void:\n    var menu := OptionButton.new()\n    menu.position = Vector2(20, 20)\n    add_child(menu)\n    var names := sprite.sprite_frames.get_animation_names()\n    for animation_name in names:\n        menu.add_item(animation_name)\n    menu.select(names.find(sprite.animation))\n    menu.item_selected.connect(func(index: int): sprite.play(names[index]))\n    var replay := Button.new()\n    replay.text = "Replay"\n    replay.position = Vector2(20, 64)\n    add_child(replay)\n    replay.pressed.connect(func():\n        sprite.stop()\n        sprite.play()\n    )\n`;
  const strProject = `config_version=5\n\n[application]\nconfig/name=${JSON.stringify(project.name)}\nrun/main_scene="res://preview.tscn"\nconfig/features=PackedStringArray("4.0", "GL Compatibility")\n\n[display]\nwindow/size/viewport_width=640\nwindow/size/viewport_height=520\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\ntextures/default_filters/use_nearest_mipmap_filter=false\ntextures/canvas_textures/default_texture_filter=0\nenvironment/defaults/default_clear_color=Color(0.08, 0.1, 0.15, 1)\n`;
  downloadBlob(
    await createZip({
      "spritesheet.png": sheet.png,
      "animations.json": JSON.stringify(sheet.metadata, null, 2),
      "sprite_frames.tres": strResource,
      "preview.tscn": strScene,
      "preview.gd": strScript,
      "project.godot": strProject,
      "README.txt":
        "Godot 4：解壓縮後以專案管理員匯入 project.godot，按 F6 或 F5 播放。\n下拉選單切換動作，Replay 重新播放非循環動畫。\n整合至既有專案時，將 spritesheet.png、sprite_frames.tres、preview.gd、preview.tscn 一起放進同一資料夾；資源使用相對路徑，不需修改。不要覆蓋既有 project.godot。\n原點是畫布左上角起算的 pivot；centered=false，offset=-pivot。\ntexture_filter=1 指定最近鄰；每個動作保留 FPS、loop 與完整影格尺寸。\n",
    }),
    `${projectFileName(project)}-godot4.zip`,
  );
}
