import concurrent.futures, json, urllib.request, urllib.error, re
from html.parser import HTMLParser
from pathlib import Path

class Extract(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip=0; self.parts=[]; self.links=[]
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','noscript'): self.skip+=1
        if tag=='a':
            d=dict(attrs)
            if d.get('href'): self.links.append(d['href'])
    def handle_endtag(self, tag):
        if tag in ('script','style','noscript'): self.skip=max(0,self.skip-1)
    def handle_data(self, data):
        if not self.skip and data.strip(): self.parts.append(data.strip())

sources={
'splitwise':'https://www.splitwise.com/',
'splitwise-pro':'https://www.splitwise.com/pro',
'tricount':'https://www.tricount.com/',
'spliit':'https://spliit.app/',
'spliit-source':'https://github.com/spliit-app/spliit',
'splid':'https://splid.app/english',
'settleup':'https://settleup.io/',
'kittysplit':'https://www.kittysplit.com/en/',
'lightsplit':'https://lightsplit.com/',
'mrsplitter':'https://mrsplitter.com/',
'slice-search':'https://www.google.com/search?q=SLICE+%E5%88%86%E5%B8%B3+%E5%AE%98%E7%B6%B2',
'harntung':'https://www.harntung.com/',
'line-search':'https://www.google.com/search?q=LINE+%E5%88%86%E5%B8%B3+%E6%A9%9F%E5%99%A8%E4%BA%BA+%E5%AE%98%E7%B6%B2',
'line-pricing':'https://tw.linebiz.com/service/account-solutions/line-official-account/',
'line-webhook':'https://developers.line.biz/en/docs/messaging-api/receiving-messages/',
'line-share':'https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/',
'liff':'https://developers.line.biz/en/docs/liff/overview/',
'miniapp':'https://developers.line.biz/en/docs/line-mini-app/discover/introduction/',
'cloudflare':'https://developers.cloudflare.com/pages/platform/limits/',
'github-pages':'https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits',
'netlify':'https://www.netlify.com/pricing/',
'idb':'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API',
'sw':'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API',
'storage':'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria'
}
def fetch(item):
    name,url=item
    try:
        req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (compatible; ProductResearch/1.0)'})
        with urllib.request.urlopen(req, timeout=22) as response:
            raw=response.read(1500000).decode('utf-8','replace'); final=response.url; status=response.status
        parser=Extract();parser.feed(raw)
        return {'name':name,'url':url,'final':final,'status':status,'text':'\n'.join(parser.parts)[:70000],'links':parser.links[:350]}
    except Exception as e: return {'name':name,'url':url,'error':str(e)}

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(fetch,sources.items()))
    Path('.artifacts/research').mkdir(parents=True,exist_ok=True)
    Path('.artifacts/research/sources.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    for r in results:
        print(r['name'],r.get('status',r.get('error')),r.get('final',''),len(r.get('text','')))
