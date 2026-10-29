# LINE 與部署平台決策

查核2026-10-29，使用當日公開官方資料，未建立帳號或啟用資源。

## LINE

預設選 A：PWA 裡計算，本機複製結算文字，由使用者貼入LINE；Web Share可選系統分享面板；PNG下載後可自行傳送。不讀聊天紀錄、不登入LINE、不發API訊息、不在URL帶入私帳；沒有Bot。若權限或分享API不可用，可展開結算純文字手動複製。

[LINE URL scheme](https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/) 可讓使用者選收件人分享文字，但傳送仍依LINE及裝置能力。第一版以複製／Web Share取代強制深連結，避免未安裝LINE及URL長度等問題。

[LIFF overview](https://developers.line.biz/en/docs/liff/overview/)：LIFF有註冊app、channel、LIFF ID、endpoint、SDK與登入／scope條件。HTML可靜態託管，但LINE身份或sendMessages等能力有平台權限與環境限制；在外部瀏覽器的行為不同。這不等於免帳號免維護，第一版不用LIFF SDK。

[MINI App introduction](https://developers.line.biz/en/docs/line-mini-app/discover/introduction/)：MINI App建在LIFF上，分未驗證與經審核能力，服務訊息／發布資格與地區政策有條件。無法單憑靜態託管宣稱具備正式MINI App資格，不提交申請、不將審核時效當產品保證。

[Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/)：官方帳號有免費與固定月費方案，**依國家／地區不同**。官方開發文件展示的200／5,000／30,000是日本範例，不可套成台灣方案。push／multicast／broadcast／narrowcast列入訊息數，reply不列入此訊息計數，但需要Webhook回覆處理，不能說因此Bot零維護。

台灣已核實[費用明細](https://tw.linebiz.com/faq/oa-price/message-price-list/)及[2026調價公告](https://tw.linebiz.com/column/LINEOA-2026-Price-Plan/)：截至10/29，輕用量月費0／200則，中用量800／3,000則，高用量1,200／6,000則；**2026/11/1起中用量改1,000、高用量1,400（NT$未稅）**，免費額度不變。新高用量加購第1～50,000則0.2元／則、第50,001則起0.15元／則，階梯累進。公告也列10/28～11/2等管理功能維護窗口，不沿用當日可升級假設。這是公開讀取，不代表已接受公告中的帳號續用／付款條件。費用免費額度不影響本案決策：Bot仍需公開HTTPS Webhook、簽章驗證、channel secret／token保管、訊息解析、重送去重與平台政策維護；不值得作第一版依賴。

LINE內建瀏覽器的PWA安裝、剪貼簿、檔案／系統分享與儲存持續性不同，不承諾全數支援。建議以系統Chrome或Safari開啟。本輪只有Chromium合成測試，尚未真機LINE、Safari／iOS驗證。

## 靜態託管比較

| 平台 | 官方條件及限制 | 商用與依賴 | 決定 |
|---|---|---|---|
| [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) | Free每月500次建置、單站20,000檔、單檔25MiB；自建dist約數百KB核心，無Functions | 受服務條款、帳號、政策、配額及濫用防護約束；本輪未接受商用合約，不保證永久免費 | 優先部署候選，純靜態、無Worker／DB；先看當時條款再由使用者決定正式發布 |
| [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) | 1GB網站、100GB/月soft、每小時10次buildsoft；public repo Free可用 | 官方明定不作免費營運線上商業／電商或主要提供商業SaaS用途；不可把此產品商用直接視為允許 | 開發文件／非商用參考，**不作預設商業產品主機** |
| [Netlify pricing](https://www.netlify.com/pricing/) | 本輪Free 300 credits/月；頻寬20 credits/GB，另有部署／請求等計費；達免費上限會暫停，可能影響同帳號其他站 | 固定免費限額不自動超收；付費auto-recharge設定不同；商用政策與帳號需發布時確認 | 可攜的備選，不依舊版「100GB免費」寫規格 |
| 自有靜態主機／NAS／本機 | HTTPS或localhost才能可靠用SW；可自行提供dist | 電力／硬體／網路／域名可能有成本；無平台免費永久保證 | 需要保留資料及程式時的退出選項 |

本產品不會因人數增加而向任何分帳／模型API付費；首次下載／更新仍增加靜態頻寬。免費配額屬供應商現行政策，不是法律上永久權利。自訂網域可選且通常有年費。

## 實際部署步驟（尚未公開執行）

1. Node 24.19.0、`npm ci`、`npm run check`、`npm test`、`npm run build`。
2. 本機啟動 `npm start`，跑 `npm run test:browser`。不要部署開發伺服器或上傳node_modules／私帳測試輸出。
3. 在已授權的靜態託管上傳 **dist目錄內容**；建置命令 `npm run build`，輸出目錄 `dist`，不需要環境金鑰、函式或DB。
4. Vite base為相對路徑，Service Worker／manifest以所在路徑為scope。若在子路徑託管，確認尾斜線、相對asset與SW scope；首頁以index.html或路徑尾斜線開啟。不要把SW scope設到同源其他app。
5. Cloudflare／Netlify讀取dist `_headers`；其他主機手動設定同等CSP、nosniff、referrer與SW不長快取標頭。勿在此同源放不可信腳本。
6. 以正式HTTPS測首載→離線→重開、備份→還原、分享與升版。真機Safari／LINE仍是發佈前阻擋項。
7. 發布前完成品牌名稱／商標查核、條款與隱私內容、商用託管資格檢視、回滾與資料遷移演練。本輪不代使用者接受條款或公開服務。

自動化CI於 `.github/workflows/ci.yml`：安裝、型別、unit/property、建置。只驗證不部署，避免未授權發布及主機／域名鎖定。
