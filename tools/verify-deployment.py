"""Test the actual distributable on a plain static host at a subdirectory."""
import functools, hashlib, http.server, json, shutil, threading, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import os

out=Path('.artifacts/fold');package=out/'fold-1.0.0-static.zip'
site=Path('.artifacts/static-proof');target=site/'fold'
if target.exists():shutil.rmtree(target)
target.mkdir(parents=True)
with zipfile.ZipFile(package) as z:
 assert all(not p.startswith('/') and '..' not in Path(p).parts for p in z.namelist())
 z.extractall(target)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(site)))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
result={'status':'running'}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':375,'height':900});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  base=f'http://127.0.0.1:{server.server_port}/fold/'
  page.goto(base);expect(page.get_by_role('heading',name='一起花',exact=False)).to_be_visible();page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller !== null')
  metrics=page.evaluate('''()=>({domContentLoadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,resources:performance.getEntriesByType('resource').map(x=>({name:new URL(x.name).pathname,encodedBytes:x.encodedBodySize}))})''')
  page.get_by_role('button',name='載入驗算範例').click();page.get_by_role('navigation',name='主選單').get_by_role('button',name='結算轉帳',exact=True).click();expect(page.get_by_role('button',name='記錄還款',exact=True)).to_have_count(10)
  ctx.set_offline(True);page.reload();page.get_by_role('navigation',name='主選單').get_by_role('button',name='結算轉帳',exact=True).click();expect(page.get_by_role('button',name='記錄還款',exact=True)).to_have_count(10)
  page.goto(base+'guide.html');expect(page.get_by_role('heading',name='一起花',exact=False)).to_be_visible();page.get_by_role('link',name='開啟分帳工具',exact=False).click();expect(page.get_by_role('heading',name='一起花',exact=False)).to_be_visible()
  ctx.set_offline(False);page.goto(base+'guide.html');page.evaluate(Path('node_modules/axe-core/axe.min.js').read_text());a11y=page.evaluate('''async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>v.id)}}''');assert not a11y['violations'],a11y
  assert not errors,errors;result={'status':'passed','host':'plain Python HTTP static server, subpath /fold/','checks':['zip extraction','app at subpath','exact case','offline subpath reopen','offline guide and relative return','guide accessibility'],'a11y':a11y,'errors':errors,'metrics':metrics,'packageSha256':hashlib.sha256(package.read_bytes()).hexdigest()}
  browser.close()
except Exception as e:
 result={'status':'failed','error':str(e)}
 raise
finally:
 server.shutdown();server.server_close();(out/'static-deployment-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False))
