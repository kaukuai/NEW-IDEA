# 合帳 Fold

離線優先、免帳號的多人分帳工具。金額以整數計算，18位以內非零餘額可證明全域最少轉帳筆數；不依賴AI、付費API、雲端資料庫或後端計算。這是可建置的靜態產品候選版，尚未正式公開營運或證明付費需求。

本儲存庫的公開版本為合帳 Fold。先前實驗不在新版原始碼、路由或建置中提供；私人本機開發紀錄另行保存。

## 啟動

需要Node **24.19.0**（`.node-version`）。套件精確鎖定於`package-lock.json`。

```bash
git clone https://github.com/kaukuai/NEW-IDEA.git
cd NEW-IDEA
export npm_config_cache=/tmp/fold-npm-cache
npm ci --ignore-scripts --no-fund --no-audit
npm run check
npm test
npm start
```

`npm test`會先完成正式建置，再跑unit／property／IndexedDB與靜態服務測試；`npm start`只讀取dist、不接受資料上傳，預設只監聽`127.0.0.1:3000`。內部健康檢查`/health`識別`fold`。用HOST／PORT可覆寫；不要誤停其他服務。

開發熱更新：`npm run dev`。開發模式不註冊Service Worker；**離線及部署驗證請用正式build + npm start**，避免開發快取混淆。

## 用法

1. 開啟工具，建立帳本、設定本位幣，輸入2～100個名字（或人數自動建名）。不需註冊。
2. 記費用，選誰先付及誰分攤。共同付款填各自金額；可選均分／金額／百分比／權重，折扣、小費、退款及逐筆手動匯率。
3. 固定格式文字可一次新增，例如`小安：晚餐1000、交通200`；儲存前看預覽。不明格式、找不到成員、比例不符會阻擋；相似費用要確認。
4. 看結算。小群組顯示最少筆數證明；超過18位非零餘額明確標示近似。可改用統籌收付，其他人只找一位對象，統籌須先收後付。
5. 複製LINE文字／系統分享／PNG／列印另存PDF。工具不自動發訊息、不轉帳。實際轉出後記錄部分或全部還款；待確認不計入餘額。
6. 可保存結算的餘額與轉帳快照，這不是銀行證明或舊費用還原點。編輯、刪除、復原費用／還款後重新計算。
7. 經常下載JSON備份。換瀏覽器、裝置或網域時先匯出、再匯入。JSON還原是整個工作區取代，不會自動合併；可只匯出單本供交接。

首頁可選載入需求中的11人驗算案例（產品採化名與一般品項，公開主需求與測試同樣採化名，原案僅留私人本機備份）；不預先灌假帳本、不當成真實使用者。總額43,813元、每人3,983元，精確最少10筆，詳見[演算法說明](docs/ALGORITHM.md)。

## 測試

```bash
npm run check
npm test
```

E2E需要Python3、Playwright **1.62.0**及Chromium。此雲端映像已提供，不需重複安裝。其他機器可於虛擬環境安裝測試依賴：

```bash
python3 -m venv /tmp/fold-test-env
/tmp/fold-test-env/bin/pip install -r requirements-test.txt
/tmp/fold-test-env/bin/python -m playwright install chromium
```

另個終端在正式服務啟動後：

```bash
cd /workspace/NEW-IDEA
npm run test:browser
```

測試預設`/usr/bin/chromium`，自裝瀏覽器時以`CHROMIUM_PATH`指定可執行檔；自訂服務埠以`FOLD_TEST_URL`指定測試來源。所有資料均在獨立合成瀏覽器profile，截圖／JSON／PNG／PDF等輸出於忽略的`.artifacts/fold/`，不使用真實帳目。結果檔逐次更新running／failed／passed，不將舊成功誤報為新通過。

`npm run package`產生正式靜態ZIP與SHA256SUMS。`.github/workflows/ci.yml`只驗證與保存建置，不自動部署；雲端CI是否實際通過須推送後另查，本輪僅本機執行。

## 架構與界限

TypeScript、React、Vite、原生CSS、IndexedDB、自產Service Worker。所有執行資源在dist，沒有遠端CDN／字型／SDK；建置自動附上LICENSES.html第三方授權通知。沒有帳號、即時多人同步、付款驗證、LINE Bot、LIFF、自動匯率或生成式AI。PDF使用瀏覽器列印，Excel相容CSV是報表，未提供原生`.xlsx`。

首次連線完成離線快取後可斷網重開。安裝到桌面依瀏覽器；iPhone用Safari加入主畫面。Safari／iOS／LINE WebView尚未真機驗證。file://不支援可靠PWA，需HTTPS或localhost。不同來源的IndexedDB不共用。

本機儲存未加密、可能清除／驅逐／損壞，並非永久備份。清空保留一份復原快照，刪除明細仍在JSON；完全刪除須由瀏覽器清除網站資料，注意同源其他工具。跨分頁revision交易防過時覆寫，但沒有即時同步或檔案合併。

上限：10MiB可備份工作區、30帳本、每帳本100人／10,000費用／10,000還款／100結算快照、工作區30,000明細，以先到的限制為準。列表每次顯示100筆、可繼續載入。單筆金額上限10^15最小單位；多幣匯率最多8位小數、來源與換算均須符合上限。

自動掃描不等於無障礙認證；實際使用與付費價值尚待驗證。低營運成本不代表瀏覽器與第三方永遠免維護。

## 文件與接續

- [專案主需求](docs/PROJECT_BRIEF.md)、[目前狀態](PROJECT_STATE.md)、[進度與下一步](PROGRESS.md)、[待辦](TASKS.md)
- [競品證據](docs/research/2026-10-29-expense-market.md)、[商業模式](docs/BUSINESS.md)
- [技術架構](docs/ARCHITECTURE.md)、[演算法](docs/ALGORITHM.md)、[資料與隱私草案](docs/DATA_AND_PRIVACY.md)
- [LINE／靜態部署](docs/LINE_AND_HOSTING.md)、[維護與成本](MAINTENANCE_AND_COST.md)、[測試報告](docs/TEST_REPORT.md)
- [決策](DECISIONS.md)、[變更](CHANGELOG.md)、[開發約定](AGENTS.md)

正式公開上線、費用、真人資料／聯絡及具有法律效力的條款仍須另行明確授權。本輪沒有公開部署。雲端工作區為`/workspace/NEW-IDEA`。接到「繼續」先檢查Git與上述進度檔，延續合帳，不重新開發已終止產品；不宣稱對話結束後仍在背景工作。
