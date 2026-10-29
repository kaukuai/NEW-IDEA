from pathlib import Path
import hashlib, zipfile
out=Path('.artifacts/fold');out.mkdir(parents=True,exist_ok=True)
target=out/'fold-1.0.0-static.zip'
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(Path('dist').rglob('*')):
  if p.is_file():
   info=zipfile.ZipInfo(p.relative_to('dist').as_posix(),(2026,10,29,0,0,0));info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,p.read_bytes())
digest=hashlib.sha256(target.read_bytes()).hexdigest()
(out/'SHA256SUMS').write_text(f'{digest}  {target.name}\n')
print(f'{target}: {target.stat().st_size} bytes, sha256 {digest}')
