# 資料、備份與隱私草案

版本：1.0.0；格式schemaVersion=2。無帳號、雲端DB、AI、遠端計算或追蹤。費用與姓名保存在此瀏覽器的IndexedDB，未加密；共用裝置上的他人可能讀取。網站託管仍可記錄IP、請求與時間；這份草案不能取代正式營運者的法定揭露。

## 完整備份

「備份與匯入」→下載JSON。包含全部帳本、成員、原幣金額、逐筆匯率、分攤、還款、已刪除紀錄及偏好。檔案未加密，放在可信的位置。檔名只有日期，不在URL或檔名放姓名。CSV可讀但不能完整還原，PNG／PDF只是結算快照。

還原：先下載現有備份→選JSON→檢查schema、上限、金額與成員→確認取代。成功後原工作區保留一份previous；可按還原上次匯入／清空前。下一次匯入或清空會覆寫此單一復原位置，因此它不是永久版本歷史。無效檔案整筆拒絕，不會部分覆寫，不會自動合併不同裝置編輯。

新裝置／瀏覽器／網域：重新安裝靜態程式後匯入備份。檔案傳送與外部雲端硬碟是使用者自行選擇的服務，具有自己的政策；合帳不代上傳。

## 格式

```
{ schemaVersion: 2, revision: integer,
  groups: [{ id, name, currency, members: [{id,name}],
    expenses: [{ id,title,kind,amount,discount,tip,currency,rate,
      payers:[{memberId,value}],mode,shares:[{memberId,value}],
      category,date,note,roundingOffset,deleted }],
    payments: [{id,from,to,amount,date,note,confirmed,deleted}],
    settlements: [{id,createdAt,revision,mode,exact,balances,transfers,
      totalMinor,expenseIds,paymentIds}], archived,createdAt }],
  settings: {language:"zh"|"en", theme:"system"|"light"|"dark"} }
```

結算快照的balances與transfers使用帶正負號的最小單位整數字串；快照保存當時名字、餘額及轉帳與來源ID，不保留舊費用全文，最多每帳本100份。當前帳目修改後，快照仍維持當時數字，不能當已付款證明或直接套用舊轉帳。

所有金額／比例為十進位字串，內部計算BigInt，不在JSON寫BigInt。id為不透明字串，不靠成員名字做帳務關聯。revision只為本機樂觀並行防護，匯入不沿用檔案revision覆蓋本機次序。

已定義v1匯入：同樣groups資料，沒有settings／revision、archived／deleted／roundingOffset或confirmed時補安全預設，再經v2全部驗證。此為已寫測試的相容格式，不代表支援所有競品匯出。未來schema拒絕，先用對應新版開啟；不能把未知資料硬改版本號。

## 刪除與損壞

費用／還款的刪除是可復原的tombstone，仍在JSON，不能當作隱私抹除。帳本封存只禁止編輯，仍保留資料。姓名若有歷史不可移除，可改名。整個工具清空會留previous供復原，損壞重設會保留corrupt原值，兩者都不是安全抹除。

**要完全移除本工具的資料與復原快照**：需要時先下載備份，再到瀏覽器「網站資料」清除此來源的儲存。這也會刪除離線快取，需要連線重新下載；同源有其他App時可能一起刪除，請先檢查。外部已分享檔案、LINE文字與收件人的副本不會被撤回。

讀取損壞時不自動建空帳覆寫，提供原始JSON下載與明確重設。若IndexedDB本身不可用，會顯示錯誤，不偽裝已保存。quota或過時跨分頁寫入會拒絕，保留表單輸入；可先複製草稿再重載。navigator.storage.persist可能被拒，無論允許與否都要備份。

## 支援與回饋

第一版沒有遠端客服或自動上傳。若回報問題，先提供去識別重現步驟、瀏覽器版本與合成備份，避免寄送真實財務／銀行資料。正式對外回饋管道、營運者聯絡、資料權利處理與法律條款須在公開授權後另行確定；沒有假電子郵件或假隱私認證。
