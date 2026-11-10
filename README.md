# Pixel Sprite Studio

在瀏覽器製作像素角色與逐格動畫，所有繪製與匯出都在本機執行。

## Windows 啟動

安裝 Node.js 20.19 以上版本（建議 LTS），雙擊 `start.cmd`。首次啟動會以 npm 或 pnpm 安裝相依套件，之後開啟終端機顯示的本機網址。終端機需保持開啟，按 Ctrl+C 停止。已有相依套件時會直接啟動，不需要重新安裝；可使用 `start.cmd --no-open` 避免自動開啟瀏覽器。

也可以執行 `npm install`、`npm run dev`。正式靜態檔案以 `npm run build` 產生於 `dist/`。

## 同一個 Wi-Fi 使用

在電腦上的專案資料夾執行 `npm run dev`（或 `pnpm run dev`），此指令會開放區域網路存取。雙擊啟動器預設僅供本機使用。讓另一台電腦、平板或手機連上相同 Wi-Fi，再開啟終端機列出的 Network 網址，例如 `http://192.168.1.20:5173/`。若未顯示網址，可執行 `ipconfig` 找到目前網路卡的 IPv4 位址，搭配終端機顯示的連接埠。Windows 防火牆若詢問，允許私人網路即可；電腦需保持開機且伺服器持續執行。

每個裝置／瀏覽器的專案與版本快照各自保存在本機，沒有跨裝置同步。要換裝置繼續，先匯出可編輯專案 JSON，再傳到另一個裝置匯入。

## 工作方式

使用筆刷、橡皮擦與填色工具編輯透明像素畫布；管理調色盤、動作、影格與各動作的 FPS／循環設定。預覽與洋蔥皮協助比對影格。參考圖是輔助底圖，不會出現在匯出的像素素材中。

請定期下載專案 JSON 作為備份；瀏覽器儲存受目前網址與瀏覽器設定影響。可再匯入專案繼續編輯。

## 匯出

- **單格 PNG**：目前影格，原始解析度，保留透明度，不含格線、參考圖或編輯輔助線。
- **Web ZIP**：包含 `spritesheet.png`、`animations.json` 與 `index.html`。每個動作佔一列，影格由左至右排列，短列剩餘區域透明。解壓縮後直接開啟 HTML，可切換動作、依 FPS 播放並重新播放；PNG 已內嵌於預覽，不需啟動伺服器。JSON 提供每格區域、FPS、loop 與 pivot。
- **Godot 4 ZIP**：包含圖集、SpriteFrames `.tres`、AnimatedSprite2D 範例場景、切換動畫腳本與獨立 `project.godot`。解壓縮後從 Godot 專案管理員匯入專案並執行。匯入既有專案時，將 `spritesheet.png`、`sprite_frames.tres`、`preview.gd`、`preview.tscn` 一起放進同一資料夾，例如 `res://characters/hero/`；資源使用相對路徑，不需修改。請勿複製匯出包的 `project.godot` 到該資料夾，以免 Godot 將它視為另一個專案而略過素材。

pivot 以畫布左上角為 `(0, 0)`。Godot 場景使用 `centered = false` 與 `offset = -pivot`；圖集不裁去透明邊緣，因此所有動作共用相同定位。節點明確使用最近鄰篩選，放大時保持像素邊緣。

Godot API 參考：[SpriteFrames](https://docs.godotengine.org/en/stable/classes/class_spriteframes.html)、[AnimatedSprite2D](https://docs.godotengine.org/en/stable/classes/class_animatedsprite2d.html)。

## 注意

匯入 PNG／Sprite sheet 時可設定格子尺寸、間距與起點來切割影格，並選擇去背、縮放及匯入為像素或參考底圖。參考底圖只用於對照；匯入為像素後才能直接編輯與匯出。Web 預覽與 Godot 專案皆可離線使用；首次安裝開發工具的相依套件需要網路。
