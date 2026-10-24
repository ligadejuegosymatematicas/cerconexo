"""Entrega local reproducible. No crea PR ni modifica ninguna referencia remota."""
from pathlib import Path
import argparse
import hashlib
import json
import runpy
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'entregas/Aplicacion_Integrada'
MANIFEST=ROOT/'scripts/project-files.json'

def digest(data):return hashlib.sha256(data).hexdigest()
def archive(target,files,prefix=''):
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(prefix+name,date_time=(2026,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16
            z.writestr(info,data)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-manifest',action='store_true',help='Registrar únicamente los archivos ya incluidos en el índice local de Git')
    args=parser.parse_args()
    if args.refresh_manifest:
        names=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode('utf-8').split('\0')
        names=sorted(set(n for n in names if n)|{'scripts/project-files.json'})
        MANIFEST.write_bytes((json.dumps(names,indent=2,ensure_ascii=False)+'\n').encode('utf-8'))
    subprocess.run([sys.executable,str(ROOT/'scripts/build_pages.py'),'--check'],cwd=ROOT,check=True)
    runpy.run_path(str(ROOT/'scripts/build_offline.py'),run_name='__main__')
    names=json.loads(MANIFEST.read_text(encoding='utf-8'))
    if len(names)!=len(set(names)):raise ValueError('Recurso del proyecto duplicado')
    files={}
    for name in names:
        p=ROOT/name
        if Path(name).is_absolute() or '..' in Path(name).parts or p.is_symlink() or not p.resolve().is_relative_to(ROOT):raise ValueError('Ruta de proyecto no permitida')
        files[name]=p.read_bytes()
    for name in ['index.html','Cerconexo_Clasico.html','Cerconexo_Arena.html']:
        p=ROOT/'offline'/name;files[p.relative_to(ROOT).as_posix()]=p.read_bytes()
    pages={n:files['docs/'+n] for n in ['.nojekyll',*json.loads((ROOT/'scripts/pages-files.json').read_text(encoding='utf-8'))]}
    OUT.mkdir(parents=True,exist_ok=True)
    archive(OUT/'Cerconexo_Integrado_Proyecto.zip',files,'Cerconexo/')
    archive(OUT/'Cerconexo_Integrado_Pages.zip',pages)
    archive(OUT/'Cerconexo_Integrado_Offline.zip',{n.removeprefix('offline/'):d for n,d in files.items() if n.startswith('offline/')})
    hashes={n:digest(d) for n,d in files.items()}
    (OUT/'SHA256.json').write_bytes((json.dumps(hashes,indent=2,ensure_ascii=False)+'\n').encode('utf-8'))
    print(f'Proyecto: {len(files)} archivos. Pages: {len(pages)} recursos. Tres HTML autónomos. Solo entrega local: {OUT}')

if __name__=='__main__':main()
