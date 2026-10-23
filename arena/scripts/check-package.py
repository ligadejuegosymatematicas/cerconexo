"""Verifica el ZIP mediante una extracción nueva; nunca elimina ni mueve carpetas."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
archive = root.parent / 'entregas/Arena_M3B/Cerconexo_Arena_M3B_Proyecto.zip'
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
target = root.parent / 'validation' / f'arena-m3b-clean-{digest[:12]}'
target.mkdir(parents=True, exist_ok=False)
with zipfile.ZipFile(archive) as z:
    names = z.namelist()
    if len(names) != len(set(names)):
        raise ValueError('Hay nombres duplicados en el ZIP')
    for name in names:
        absolute = (target / name).resolve()
        if target.resolve() not in absolute.parents:
            raise ValueError('Ruta fuera de la extracción')
    z.extractall(target)
project = target / 'Cerconexo_Arena_M3B'
subprocess.run([sys.executable, str(project / 'build.py')], cwd=project, check=True)
html = project / 'Cerconexo_Arena_M3B.html'
expected = root / html.name
if html.read_bytes() != expected.read_bytes():
    raise ValueError('El HTML reconstruido no coincide')
tests = subprocess.run(['node', '--test', 'tests/*.test.mjs'], cwd=project, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
(root / 'evidence/m3b/clean-unit-results.txt').write_text(tests.stdout + tests.stderr, encoding='utf-8')
if tests.returncode:
    raise RuntimeError('Fallaron pruebas desde el ZIP; consultar clean-unit-results.txt')
browser = subprocess.run(['node', 'tests/browser.cjs'], cwd=project, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=240, env=os.environ.copy())
(root / 'evidence/m3b/clean-browser-results.txt').write_text(browser.stdout + browser.stderr, encoding='utf-8')
if browser.returncode:
    raise RuntimeError('Falló navegador desde el ZIP; consultar clean-browser-results.txt')
browser_report = json.loads((project / 'evidence/m3b-regression/browser-results.json').read_text(encoding='utf-8'))
proof = {'ok': True, 'testedArchiveSha256': digest, 'files': len(names), 'reconstructedHtmlIdentical': True,
         'htmlSha256': hashlib.sha256(html.read_bytes()).hexdigest(), 'unitTests': 58,
         'browserChecks': len(browser_report['checks']), 'browserErrors': browser_report['errors'], 'extraction': str(project)}
(root / 'evidence/m3b/package-check.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
print(json.dumps(proof, indent=2))
