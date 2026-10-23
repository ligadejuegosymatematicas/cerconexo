"""ZIP autónomo del proyecto Arena y su evidencia; no incluye el proyecto Premium."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent
out = root.parent / 'entregas' / 'Arena_M3B'
out.mkdir(parents=True, exist_ok=True)
subprocess.run([__import__('sys').executable, str(root / 'build.py')], check=True)
html = root / 'Cerconexo_Arena_M3B.html'
(out / html.name).write_bytes(html.read_bytes())
files = []
for p in root.rglob('*'):
    relative=p.relative_to(root)
    if not p.is_file() or any(part in {'__pycache__','staging','recordings'} for part in relative.parts) or p.name in {'failure.png','package-check.json','clean-unit-results.txt','clean-browser-results.txt'}:
        continue
    if relative.parts[0]=='evidence' and (len(relative.parts)<2 or relative.parts[1] not in {'m3b','m3b-regression'}):
        continue
    if p.name=='Cerconexo_Arena_M3A.html':
        continue
    files.append(p)
archive = out / 'Cerconexo_Arena_M3B_Proyecto.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files):
        z.write(p, Path('Cerconexo_Arena_M3B') / p.relative_to(root))
manifest = {str(p.relative_to(root)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
(out / 'SHA256.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(f'ZIP completo Arena: {archive} ({len(files)} archivos)')
