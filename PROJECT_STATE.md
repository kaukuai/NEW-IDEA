# 合帳 Fold — 目前狀態

更新：2026-10-29 Asia/Taipei。

## CURRENT STATE

合帳 Fold 1.0.0：離線優先的多人分帳靜態PWA。已更新GitHub `kaukuai/NEW-IDEA` 的 `main`，初始公開提交為 `424eab55995cd3403d32608e2044f5b409795a9a`。使用者已授權更新此儲存庫；這不包含正式部署網站、付款、真人聯絡或額外私人資料的授權。

公開版本只包含合帳目前程式與文件。公開範例、測試及主需求均採化名；原始需求中的姓名、早期實驗與私人開發紀錄僅保存在本機歷史及備份，不合併到公開main。不要推送本機work分支、所有分支或私人bundle。

功能：免帳號帳本／成員、多人墊款、四種分攤、折扣／小費／退款、逐筆手動匯率、精確／近似／統籌結算、部分還款與確認／編輯／復原、結算快照、圖表、封存與複製、LINE文字／PNG／PDF／CSV／JSON、IndexedDB原子保存與離線更新。無AI、付費API或後端資料庫依賴。

## VERIFIED RESULTS

- 29項Vitest通過，含780組property、2～100人、10,000費用及IndexedDB交易。
- 14組Chromium工作流、核心9次無障礙自動掃描未回報違規；另6項純靜態子路徑部署檢查、指南1次掃描通過。
- 11人案例43,813元、每人3,983元；DP與2046個真子集枚舉求證最少10筆。
- TypeScript、正式build、凍結安裝及包含授權通知的部署ZIP已驗證。公開準備只有化名與文件修改，已重跑型別／build／29項測試通過。
- 初始公開提交已核對遠端SHA一致，GitHub Actions run `40830374278` completed/success；最後紀錄更新請以最新main為準。
- GitHub同步狀態須以 `git rev-parse HEAD` 和 `git ls-remote origin refs/heads/main` 相同確認，不能只看本機commit。

## OPEN ISSUES

- 沒有正式公開服務或市場／付費／留存驗證；Safari／iOS／Android／LINE及螢幕閱讀器真機待驗證，自動掃描不是認證。
- SLICE身分與部分競品權益未知；無原生xlsx（提供Excel相容CSV）。
- 本機未加密，需備份。沒有即時協作、雲端備份、LINE Bot／LIFF、自動匯率、銀行驗證或實際付款。
- 18位以內非零餘額精確，19～100位近似；統籌模式可能更多筆。儲存／資料集限制見README。
- 環境安裝／啟動設定已存草稿，未發布新快照；新任務還原未驗證。

## NEXT ACTION

GitHub程式更新已完成；下一階段優先真機及替代工具任務比較，不擴建雲端／金流。正式部署需使用者對應授權。

## RESUME INSTRUCTIONS

先讀本檔、PROGRESS、TASKS、DECISIONS、README與git status／log。GitHub更新使用main，保持fast-forward，不推送私人歷史。不建立worktree。雲端checkout為 `/workspace/NEW-IDEA`。

Node24.19.0；README說明npm ci、npm test（含build）、npm start及Playwright1.62.0。正式 `/health` 識別fold。測試使用獨立profile，不讀真人帳本；正式dist才驗證SW離線。不要建立使用者可見localhost預覽，不承諾回合結束後仍工作。
