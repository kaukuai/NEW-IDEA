# PROGRESS — 合帳 Fold

2026-10-29（Asia/Taipei）。

## CURRENT STATE

可建置的合帳Fold1.0.0已完成，使用者要求更新至 `kaukuai/NEW-IDEA`。遠端查核為公開空儲存庫，預設main。因此公開Git歷史將從合帳乾淨初始提交開始；私人本機開發分支及原需求備份不推送。公開文件、測試與程式示範皆使用化名。

## VERIFIED RESULTS

29個Vitest（780組固定種子property）、14組Chromium工作流、6項全新目錄的純靜態部署驗證完成。11人案例最少10筆已求證。完整測試與界限在docs/TEST_REPORT.md。

公開準備未修改財務演算法或產品流程；化名與文件調整後再跑npm test，並以遠端main的SHA核對實際推送。GitHub Actions定義只測試／建置，不部署。

## OPEN ISSUES

未部署網站；Safari／iOS／LINE與真實輔助技術、付費需求尚未驗證。沒有多人即時同步或銀行入帳驗證。本機資料可能遺失，請備份。

## NEXT ACTION

GitHub同步以遠端SHA為準，CI狀態以實際Actions結果為準。之後優先真機測試與產品任務比較；不自動啟用付費資源、正式服務或對外聯絡。

## RESUME INSTRUCTIONS

檢查main、git status及遠端狀態，讀PROJECT_STATE／TASKS／README。Node24.19.0、`npm ci`→`npm test`→`npm start`，另終端`npm run test:browser`。不要推送本機私有work歷史、不要建立worktree或覆寫遠端。原始私人紀錄及已驗證bundle留在本機備份目錄，不屬於公開部署包。
