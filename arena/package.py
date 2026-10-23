"""ZIP autónomo del proyecto Arena y su evidencia; no incluye el proyecto Premium."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parent
out = root.parent / 'entregas' / 'Arena_M3A'
out.mkdir(parents=True, exist_ok=True)
subprocess.run([__import__('sys').executable, str(root / 'build.py')], check=True)
html = root / 'Cerconexo_Arena_M3A.html'
(out / html.name).write_bytes(html.read_bytes())
files = [p for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name not in {'failure.png'} and 'recordings' not in p.parts]
archive = out / 'Cerconexo_Arena_M3A_Proyecto.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted(files):
        z.write(p, Path('Cerconexo_Arena_M3A') / p.relative_to(root))
manifest = {str(p.relative_to(root)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
(out / 'SHA256.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(f'ZIP completo Arena: {archive} ({len(files)} archivos)')
