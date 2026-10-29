# 靜態、離線、資料自有

選用 TypeScript 5.9、React 19、Vite 建置；原生 CSS，沒有 Tailwind、路由、圖表、金流、PWA 外掛或遠端 SDK。React 負責複雜表單與一致重繪，Vite 只在建置時需要。最終 dist 是 HTML、CSS、JS、圖示、manifest 和 Service Worker，可移至不同靜態託管。沒有執行時 npm 伺服器需求；server.mjs 僅供本機驗證 dist。

React／ReactDOM 是唯二執行套件，實際打包到本機資源，不向 CDN 讀取。工具版本及 transitive integrity 由 package-lock 鎖定，Node 24.19.0。沒有生成式 AI、模型或遠端金額 API；沒有環境金鑰。

| 層 | 檔案 | 邊界 |
|---|---|---|
| 資料型別 | model.ts | 版本 2、群組、成員、費用、還款、設定 |
| 金額 | money.ts | 十進位解析、BigInt、比例分配、固定匯率 |
| 帳務 | ledger.ts | 付款與分攤、退款、尾差輪替、淨額守恆 |
| 最佳化 | settle.ts / solver.worker.ts | 精確 DP／近似／統籌，獨立驗證 |
| 輸入 | parser.ts / validate.ts | 固定規則解析、匯入 schema 與金額驗證 |
| 儲存 | storage.ts | IndexedDB 交易、revision、原始損壞資料保留 |
| 輸出 | exports.ts | LINE 文字、PNG、CSV、JSON |
| 互動 | main.tsx / styles.css | 首頁、費用、成員、結算、統計、設定 |
| 離線 | tools/build-sw.mjs | 依內容 hash 產生可重現的完整 shell 快取 |

IndexedDB `fold-ledger` / `snapshots` 保存單一 `current` 工作區、匯入／清空前 `previous`、明確損壞重設的 `corrupt` 原始值。每次 write transaction 先讀 current revision，過時寫入整筆拒絕；不會把失敗的 UI 草稿當成已存。跨頁面不即時同步；另一分頁更新後請先保留草稿再重載。舊專案 localStorage 完全不讀不寫。

無效備份不會部分套用。成功還原取代整個工作區，保留一份上一版，不宣稱多人合併。v1 → v2 遷移僅支援文件定義格式，未來版本拒絕，不能猜測未知格式。10 MiB、30 帳本、每帳本 100 人、10,000 費用／10,000 還款／100結算快照、全工作區 30,000 明細，且可序列化的工作區亦受10MiB限制。成員有歷史（含刪除）則禁止移除，保留追溯；封存禁止修改、可解除；費用及還款採 tombstone 可復原。

Service Worker 首次連線成功安裝後，快取完整版本 shell（包含 worker 及圖示）。導覽從同版 shell 讀取，避免新 HTML 引用舊版缺失資源。新版完成快取後提示使用者先存草稿再啟用，沒有強制重載。保留舊 shell 快取以支援仍開著的舊分頁：長期多次更新可能增加儲存量，可由使用者清除網站快取（也會影響資料，務必先備份），後續可加安全清理策略；不假裝零維護。

安全：React 輸入一律作文字，沒有 innerHTML；原生 dialog；檔案上限先檢查；完整結構、日期、成員、數字、ID 重複檢查；CSV 防試算表公式注入；嚴格同源 CSP 禁 inline script、frame、object、表單外送；不接受伺服器寫入請求。託管部署時也須保留 `_headers` 或相等標頭，不能因為開發伺服器有標頭就假定所有平台自動套用。

隱私／可靠性界限：本機未加密，裝置與網站同源腳本可存取；清除資料、私人模式、儲存驅逐或裝置損毀可丟失；持續儲存請求可能被拒。備份含所有明細及刪除紀錄。分享是使用者自行將資料交給其他平台，不能撤銷轉傳。靜態託管有 IP／存取紀錄。首次下載、重裝、新版取得需要網路與 HTTPS（本機 localhost 例外）。file:// 不能保證 PWA 或 IndexedDB 運作。

建置時從鎖定node_modules讀取React、ReactDOM、Scheduler完整MIT，以及Vite核心產生helper的MIT通知，寫入dist/LICENSES.html後納入版本hash與離線shell。不接受外部授權服務、不將僅開發用的Vite伺服器當正式依賴。產品示範採化名／一般品項，原案例僅留主需求與本機測試，部署包未包含原始姓名。
