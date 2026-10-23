"""Extrae el ZIP y comprueba fuentes, reconstrucción, motores y navegación reales."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
archive=ROOT/'entregas/Aplicacion_Integrada/Cerconexo_Integrado_Proyecto.zip'
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
dest=ROOT/'validation'/('integrated-clean-'+sha[:12])
dest.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as z:
    for name in z.namelist():
        if not (dest/name).resolve().is_relative_to(dest.resolve()):raise ValueError('Ruta ZIP no válida')
    z.extractall(dest)
clean=dest/'Cerconexo'
results=[]
def run(name,cmd):
    proc=subprocess.run(cmd,cwd=clean,capture_output=True,text=True,encoding='utf-8',errors='replace',env=os.environ)
    (dest/(name+'.log')).write_bytes((proc.stdout+proc.stderr).encode('utf-8'))
    results.append({'check':name,'exit':proc.returncode})
    if proc.returncode:raise RuntimeError(f'{name}: revisar {dest/(name+".log")}')
    print('PASS '+name)
before={p.name:p.read_bytes() for p in (clean/'offline').glob('*.html')}
run('pages',[sys.executable,'scripts/build_pages.py','--check'])
run('integrity',['node','scripts/check-integrity.mjs'])
run('offline',[sys.executable,'scripts/build_offline.py'])
for name,data in before.items():
    if (clean/'offline'/name).read_bytes()!=data:raise RuntimeError('HTML no reproducible: '+name)
run('unit',['node','--test',*[p.relative_to(clean).as_posix() for folder in ['tests','arena/tests'] for p in sorted((clean/folder).glob('*.test.mjs'))]])
run('browser',['node','tests/unified.browser.cjs'])
report={'ok':True,'zipSha256':sha,'extraction':str(clean),'autonomousIdentical':list(before),'checks':results}
(ROOT/'entregas/Aplicacion_Integrada/EXTRACCION_LIMPIA.json').write_bytes((json.dumps(report,indent=2,ensure_ascii=False)+'\n').encode('utf-8'))
print(json.dumps(report,indent=2))
