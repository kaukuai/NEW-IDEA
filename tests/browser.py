import json, os, time, tempfile, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('FOLD_TEST_URL','http://127.0.0.1:3000').rstrip('/')
BINARY=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')
OUT=Path('.artifacts/fold');OUT.mkdir(parents=True,exist_ok=True)
report={'status':'running','checks':[],'a11y':[],'errors':[]}
def save(): (OUT/'browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
def done(name):report['checks'].append(name);save();print('PASS',name,flush=True)
def click_nav(page,name):page.get_by_role('navigation',name='主選單').get_by_role('button',name=name,exact=True).click()
def scan(page,name):
 page.wait_for_timeout(220)
 page.evaluate(Path('node_modules/axe-core/axe.min.js').read_text())
 result=page.evaluate('''async()=>{const r=await axe.run(document.querySelector('dialog[open]')||document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))}}''')
 report['a11y'].append({'screen':name,**result});save();assert not result['violations'],json.dumps(result['violations'],ensure_ascii=False)

save()
try:
 with sync_playwright() as p:
  profile=tempfile.mkdtemp(prefix='fold-browser-')
  ctx=p.chromium.launch_persistent_context(profile,executable_path=BINARY,headless=True,args=['--no-sandbox'],viewport={'width':1440,'height':1050},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
  page=ctx.pages[0];errors=[];external=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:external.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith(('data:','blob:')) else None)
  page.goto(BASE);expect(page.get_by_role('heading',name='一起花，各自清楚。')).to_be_visible();page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller !== null')
  scan(page,'empty-home');page.screenshot(path=OUT/'home-desktop.png',full_page=True)
  page.get_by_role('button',name='開始一筆分帳',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('帳本名稱',exact=True).fill('週末小旅行');dialog.get_by_label('成員名字',exact=True).fill('小安、小宇、阿哲');scan(page,'create-ledger');dialog.get_by_role('button',name='建立帳本，開始記帳').click();expect(dialog).not_to_be_visible();expect(page.get_by_role('heading',name='每一筆，都有交代。')).to_be_visible()
  page.get_by_role('button',name='記一筆費用',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('費用名稱',exact=True).fill('晚餐');dialog.get_by_label('原始金額',exact=True).fill('1000');scan(page,'add-expense');dialog.get_by_role('button',name='儲存費用').click();expect(dialog).not_to_be_visible();expect(page.get_by_role('heading',name='晚餐',exact=True)).to_be_visible();expect(page.get_by_text('TWD 1,000',exact=True).first).to_be_visible()
  done('create ledger and exact nondivisible expense; no sign-in')
  # Edit, reject overprecision, then refund and restore deleted expense.
  page.get_by_role('button',name='明細／編輯').first.click();dialog=page.get_by_role('dialog');dialog.get_by_label('原始金額',exact=True).fill('1000.001');dialog.get_by_role('button',name='儲存費用').click();expect(dialog.get_by_role('alert')).to_be_visible();dialog.get_by_label('原始金額',exact=True).fill('1200');dialog.get_by_role('button',name='儲存費用').click();expect(dialog).not_to_be_visible()
  page.get_by_role('button',name='刪除',exact=True).first.click();expect(page.get_by_role('heading',name='晚餐',exact=True)).not_to_be_visible();page.get_by_label('含已刪除').check();page.get_by_role('button',name='復原',exact=True).click();expect(page.get_by_role('heading',name='晚餐',exact=True)).to_be_visible()
  page.get_by_role('button',name='記一筆費用',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('費用名稱',exact=True).fill('店家退款');dialog.get_by_label('類型',exact=True).select_option('refund');dialog.get_by_label('原始金額',exact=True).fill('300');dialog.get_by_role('button',name='儲存費用').click();expect(dialog).not_to_be_visible();expect(page.get_by_text('TWD 900',exact=True).first).to_be_visible()
  done('edit rejects overprecision; deletion and undo; refund reverses balances')
  # Multi-payer percentages and manual FX.
  page.get_by_role('button',name='記一筆費用',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('費用名稱',exact=True).fill('共同付款');dialog.get_by_label('原始金額',exact=True).fill('100');dialog.get_by_role('checkbox',name='小宇',exact=True).first.check();dialog.get_by_label('小安 付款金額',exact=True).fill('60');dialog.get_by_label('小宇 付款金額',exact=True).fill('40');dialog.get_by_label('分攤方式',exact=True).select_option('percent');dialog.get_by_label('小安 分攤值',exact=True).fill('20');dialog.get_by_label('小宇 分攤值',exact=True).fill('30');dialog.get_by_label('阿哲 分攤值',exact=True).fill('50');dialog.get_by_role('button',name='儲存費用').click();expect(dialog).not_to_be_visible()
  page.get_by_role('button',name='記一筆費用',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('費用名稱',exact=True).fill('日本車票');dialog.get_by_label('支出幣別',exact=True).select_option('JPY');dialog.get_by_label('原始金額',exact=True).fill('1000');dialog.get_by_label('1 JPY = ? TWD',exact=True).fill('0.215');dialog.get_by_role('button',name='儲存費用').click();expect(dialog).not_to_be_visible();expect(page.get_by_text('TWD 1,215',exact=True).first).to_be_visible();scan(page,'ledger');page.screenshot(path=OUT/'ledger-desktop.png',full_page=True)
  done('joint payers, percentage shares and per-expense manual exchange rate')
  # Rule parser blocks entire bad batch and duplicate warning.
  page.get_by_role('button',name='貼上文字記帳').click();dialog=page.get_by_role('dialog');dialog.get_by_label('貼上固定格式文字',exact=True).fill('小安：咖啡90、點心60\n不存在：飯100');expect(dialog.get_by_role('button',name='全部新增到帳本')).to_be_disabled();dialog.get_by_label('貼上固定格式文字',exact=True).fill('小安：咖啡90、點心60');dialog.get_by_role('button',name='全部新增到帳本').click();expect(dialog).not_to_be_visible()
  page.get_by_role('button',name='貼上文字記帳').click();dialog=page.get_by_role('dialog');dialog.get_by_label('貼上固定格式文字',exact=True).fill('小安：咖啡90');expect(dialog.get_by_text('發現相似／重複項目，我確認仍要新增')).to_be_visible();dialog.get_by_role('button',name='全部新增到帳本').click();expect(dialog.get_by_role('alert')).to_be_visible();dialog.get_by_role('button',name='關閉 Close').click()
  done('strict parser preview; unknown names block batch; duplicates require acknowledgement')
  # Cross-tab transaction conflict keeps draft inputs.
  page.get_by_role('button',name='記一筆費用',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('費用名稱',exact=True).fill('未存草稿');dialog.get_by_label('原始金額',exact=True).fill('50')
  other=ctx.new_page();other.goto(BASE);other.get_by_role('navigation',name='主選單').get_by_role('button',name='成員',exact=True).click();other.get_by_label('新成員名稱',exact=True).fill('第四人');other.get_by_role('button',name='加入成員',exact=True).click();expect(other.get_by_label('第四人 名稱')).to_be_visible();other.close()
  dialog.get_by_role('button',name='儲存費用').click();expect(dialog.get_by_role('alert')).to_contain_text('另一個分頁');expect(dialog.get_by_label('費用名稱',exact=True)).to_have_value('未存草稿');dialog.get_by_role('button',name='關閉 Close').click();page.reload();click_nav(page,'費用明細');expect(page.get_by_role('heading',name='未存草稿',exact=True)).not_to_be_visible()
  done('atomic IndexedDB rejects stale cross-tab saves and retains form input')
  # Exact solver example and independent proof; repayments.
  click_nav(page,'總覽');page.get_by_role('button',name='載入驗算範例').click();expect(page.get_by_text('TWD 43,813',exact=True).first).to_be_visible();click_nav(page,'結算轉帳');expect(page.get_by_text('精確證明：11 位非零成員，最多可拆成 1 個零和組，因此最少 11 − 1 = 10 筆。')).to_be_visible();expect(page.get_by_role('button',name='記錄還款',exact=True)).to_have_count(10);page.get_by_role('button',name='保存結算快照').click();expect(page.get_by_role('heading',name='結算快照紀錄 · 1')).to_be_visible();expect(page.get_by_role('button',name='記錄還款',exact=True)).to_have_count(10);scan(page,'exact-settlement');page.screenshot(path=OUT/'settlement-desktop.png',full_page=True)
  page.get_by_role('button',name='複製 LINE 文字').click();clipboard=page.evaluate('navigator.clipboard.readText()');assert '43,813' in clipboard and '10 筆' in clipboard;(OUT/'line-settlement.txt').write_text(clipboard)
  with page.expect_download() as d:page.get_by_role('button',name='PNG 圖片').click()
  d.value.save_as(OUT/'settlement.png');assert (OUT/'settlement.png').read_bytes().startswith(b'\x89PNG')
  page.pdf(path=OUT/'settlement.pdf',format='A4',print_background=True)
  page.get_by_role('button',name='記錄還款',exact=True).first.click();dialog=page.get_by_role('dialog');dialog.get_by_label('還款金額 (TWD)').fill('100');dialog.get_by_role('checkbox').uncheck();dialog.get_by_role('button',name='儲存還款紀錄').click();expect(dialog).not_to_be_visible();expect(page.get_by_text('待確認，不計入餘額',exact=False)).to_be_visible();page.get_by_role('button',name='確認已付款',exact=True).click();expect(page.get_by_text('自行確認已付款',exact=False)).to_be_visible();page.get_by_role('button',name='編輯還款',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('還款金額 (TWD)').fill('80');from_id=dialog.get_by_label('轉出人',exact=True).input_value();to_id=dialog.get_by_label('收款人',exact=True).input_value();dialog.get_by_role('button',name='儲存還款紀錄').click();expect(dialog).not_to_be_visible();expect(page.get_by_text('TWD 80',exact=True)).to_be_visible();page.get_by_role('button',name='手動記錄部分還款').click();dialog=page.get_by_role('dialog');dialog.get_by_label('轉出人',exact=True).select_option(from_id);dialog.get_by_label('收款人',exact=True).select_option(to_id);dialog.get_by_label('還款金額 (TWD)').fill('80');dialog.get_by_role('button',name='儲存還款紀錄').click();expect(dialog.get_by_role('alert')).to_contain_text('發現相似還款');dialog.get_by_role('button',name='關閉 Close').click();page.get_by_role('button',name='刪除',exact=True).last.click();expect(page.get_by_role('button',name='復原',exact=True)).to_be_visible()
  done('11-person exact minimum is 10; LINE clipboard, PNG/PDF and partial pending/confirmed repayments')
  page.get_by_role('button',name='集中收付，對象簡單',exact=False).click();expect(page.get_by_text('集中收付不是最少筆數保證；請先收齊款項再付出。')).to_be_visible();page.get_by_label('統籌人（須經手款項）').select_option(label='A');expect(page.get_by_role('button',name='記錄還款',exact=True)).to_have_count(10);page.get_by_role('button',name='最少轉帳次數',exact=False).click()
  done('coordinator choice and explicit optimality tradeoff')
  # Backup, malicious import, reset, restore and readable CSV.
  page.get_by_role('button',name='資料備份',exact=False).click();scan(page,'backups')
  with page.expect_download() as d:page.get_by_role('button',name='下載完整 JSON 備份').click()
  d.value.save_as(OUT/'backup.json');backup=json.loads((OUT/'backup.json').read_text());assert len(backup['groups'])==2
  malicious=json.loads(json.dumps(backup));malicious['groups'][0]['expenses'][0]['amount']='1e99';page.get_by_label('選擇 JSON 檔').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(malicious).encode()});expect(page.get_by_role('status')).to_be_visible();expect(page.get_by_role('dialog')).not_to_be_visible()
  page.get_by_role('button',name='清空所有帳本',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='確認',exact=True).click();expect(page.get_by_role('dialog')).not_to_be_visible();page.get_by_label('選擇 JSON 檔').set_input_files(OUT/'backup.json');dialog=page.get_by_role('dialog');expect(dialog).to_contain_text('檔案有 2 本帳本');dialog.get_by_role('button',name='確認',exact=True).click();expect(dialog).not_to_be_visible();page.get_by_role('button',name='資料備份',exact=False).click();page.get_by_label('選擇帳本',exact=True).select_option(label='11 人旅行・驗算範例')
  with page.expect_download() as d:page.get_by_role('button',name='下載 CSV',exact=True).click()
  d.value.save_as(OUT/'ledger.csv');assert 'payer_allocations' in (OUT/'ledger.csv').read_text()
  done('JSON backup, hostile import rejection, atomic reset/restore and Excel-compatible CSV')
  # Offline reopen and edit, then persist through full browser restart.
  ctx.set_offline(True);page.reload();expect(page.get_by_role('heading',name='一起花，各自清楚。')).to_be_visible();click_nav(page,'費用明細');expect(page.get_by_role('heading',name='晚餐',exact=True)).to_be_visible();page.get_by_role('button',name='記一筆費用',exact=True).click();dialog=page.get_by_role('dialog');dialog.get_by_label('費用名稱',exact=True).fill('離線點心');dialog.get_by_label('原始金額',exact=True).fill('10');dialog.get_by_role('button',name='儲存費用').click();expect(dialog).not_to_be_visible();page.reload();click_nav(page,'費用明細');expect(page.get_by_role('heading',name='離線點心',exact=True)).to_be_visible();expect(page.get_by_text('離線可用',exact=True)).to_be_visible();ctx.set_offline(False)
  done('service worker offline reload, existing data and offline writes survive reopening')
  # Dark/mobile/English and no document overflow.
  for width in [320,375,768]:
   page.set_viewport_size({'width':width,'height':900})
   for nav in ['總覽','費用明細','結算轉帳','成員','支出分析']:
    click_nav(page,nav);page.wait_for_timeout(80);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'overflow {width} {nav}'
   if width==375:
    click_nav(page,'結算轉帳');scan(page,'mobile-settlement');page.screenshot(path=OUT/'mobile-settlement.png',full_page=True)
    click_nav(page,'總覽');page.screenshot(path=OUT/'mobile-home.png',full_page=True)
  page.get_by_role('button',name='開啟設定與說明').click();page.get_by_label('外觀',exact=True).select_option('dark');scan(page,'dark-settings');page.screenshot(path=OUT/'dark-settings.png',full_page=True);page.get_by_label('語言',exact=True).select_option('en');expect(page.get_by_role('heading',name='Make it yours')).to_be_visible();scan(page,'english-settings');page.get_by_label('Language',exact=True).select_option('zh');page.get_by_label('外觀',exact=True).select_option('light')
  done('320/375/768 responsive screens; dark mode; English; automated accessibility scans')
  # Archival and original identifiers on duplicate.
  click_nav(page,'成員');page.get_by_role('button',name='封存活動',exact=True).click();expect(page.get_by_role('button',name='解除封存',exact=True)).to_be_visible();click_nav(page,'費用明細');expect(page.get_by_role('button',name='記一筆費用',exact=True)).not_to_be_visible();click_nav(page,'成員');page.get_by_role('button',name='解除封存',exact=True).click();page.get_by_role('button',name='複製完整帳本',exact=True).click();expect(page.get_by_role('heading',name='晚餐',exact=True)).to_be_visible()
  done('archive blocks edits; unarchive and full ledger duplication')
  # Security, quota retry and corruption are tested in a separate synthetic profile.
  private_browser=p.chromium.launch(executable_path=BINARY,headless=True,args=['--no-sandbox'])
  isolated=private_browser.new_context(accept_downloads=True);q=isolated.new_page();q.goto(BASE);q.get_by_role('button',name='資料備份',exact=False).click()
  hostile=json.loads(json.dumps(backup));hostile['groups'][0]['members'][0]['name']='<img src=x onerror=alert(1)>';hostile['groups'][0]['expenses'][0]['title']='=HYPERLINK("bad")'
  q.get_by_label('選擇 JSON 檔').set_input_files({'name':'quoted.json','mimeType':'application/json','buffer':json.dumps(hostile).encode()});q.get_by_role('dialog').get_by_role('button',name='確認',exact=True).click();expect(q.get_by_role('dialog')).not_to_be_visible();click_nav(q,'費用明細');assert q.locator('img[src=x]').count()==0;expect(q.get_by_role('heading',name='=HYPERLINK("bad")',exact=True)).to_be_visible()
  q.evaluate("""()=>{const original=IDBObjectStore.prototype.put;let once=true;IDBObjectStore.prototype.put=function(value,key){if(key==='current'&&once){once=false;throw new DOMException('模擬空間不足','QuotaExceededError');}return original.call(this,value,key);};}""")
  q.get_by_role('button',name='記一筆費用',exact=True).click();qd=q.get_by_role('dialog');qd.get_by_label('費用名稱',exact=True).fill('空間不足後重試');qd.get_by_label('原始金額',exact=True).fill('12');qd.get_by_role('button',name='儲存費用').click();expect(qd.get_by_role('alert')).to_contain_text('模擬空間不足');expect(qd.get_by_label('費用名稱',exact=True)).to_have_value('空間不足後重試');qd.get_by_role('button',name='儲存費用').click();expect(qd).not_to_be_visible();expect(q.get_by_role('heading',name='空間不足後重試',exact=True)).to_have_count(1)
  q.evaluate("""async()=>{await new Promise((resolve,reject)=>{const r=indexedDB.open('fold-ledger');r.onsuccess=()=>{const db=r.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({schemaVersion:999,marker:'preserve-me'},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});}""");q.reload();expect(q.get_by_role('heading',name='無法讀取本機帳本')).to_be_visible()
  with q.expect_download() as d:q.get_by_role('button',name='下載原始資料 Export raw').click()
  d.value.save_as(OUT/'corruption-recovery.json');assert json.loads((OUT/'corruption-recovery.json').read_text())['marker']=='preserve-me'
  q.once('dialog',lambda d:d.accept());q.get_by_role('button',name='重設此工具 Reset').click();expect(q.get_by_role('heading',name='一起花，各自清楚。')).to_be_visible();isolated.close();private_browser.close()
  done('inert imported HTML; quota failure preserves draft and retries once; corruption export before explicit reset')
  assert not errors,errors;assert not external,external
  ctx.close()
  ctx=p.chromium.launch_persistent_context(profile,executable_path=BINARY,headless=True,args=['--no-sandbox'],viewport={'width':1440,'height':1050})
  page=ctx.pages[0];ctx.set_offline(True);page.goto(BASE);click_nav(page,'費用明細');expect(page.get_by_role('heading',name='離線點心',exact=True)).to_be_visible();expect(page.get_by_text('離線可用',exact=True)).to_be_visible();ctx.set_offline(False)
  done('full Chromium shutdown/restart while offline preserves IndexedDB and shell')
  # Exercise a new shell install, explicit user activation and data continuity.
  sw=Path('dist/sw.js');original_sw=sw.read_text()
  try:
   import re
   sw.write_text(re.sub(r"const CACHE='[^']+';","const CACHE='fold-shell-upgrade-test';",original_sw))
   page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())');expect(page.get_by_role('button',name='更新並重載',exact=True)).to_be_visible(timeout=15000)
   with page.expect_navigation():page.get_by_role('button',name='更新並重載',exact=True).click()
   click_nav(page,'費用明細');expect(page.get_by_role('heading',name='離線點心',exact=True)).to_be_visible()
  finally:sw.write_text(original_sw)
  ctx.close();done('new shell waits for explicit activation; update reload preserves financial data')
  report['errors']=errors;report['external_requests']=external;report['status']='passed';save()
except Exception as e:

 try:
  page.screenshot(path=OUT/'failure.png',full_page=True); (OUT/'failure-body.txt').write_text(page.locator('body').inner_text())
 except Exception: pass
 report['status']='failed';report['failure']=str(e);report['traceback']=traceback.format_exc();save();raise
print(json.dumps({'status':report['status'],'checks':len(report['checks']),'a11y_scans':len(report['a11y'])}))
