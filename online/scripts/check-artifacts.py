"""Verifica inventarios y ausencia de secretos reales en los tres ZIP locales."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

root = Path(__file__).resolve().parents[2]
operator = json.loads((root / 'online/.state/beta-staging/operator.json').read_text())
secrets = [operator['credential'].encode(), operator['hash'].encode()]
fixture = root / 'online/.state/beta-persistence/session.json'
if fixture.exists():
    secrets += [s.encode() for s in json.loads(fixture.read_text())['credentials']]
expected = {'.nojekyll', *json.loads((root / 'scripts/pages-files.json').read_text())}
reports = []
for kind in ['Proyecto', 'Pages', 'Offline']:
    target = root / f'entregas/Aplicacion_Integrada/Cerconexo_Integrado_{kind}.zip'
    with zipfile.ZipFile(target) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Entradas ZIP duplicadas'
        for name in names:
            assert not re.search(r'(^|/)(node_modules|\.state|\.wrangler|\.git|evidence)(/|$)', name), 'Archivo privado en ZIP'
            data = archive.read(name)
            assert all(secret not in data for secret in secrets), 'Secreto real en ZIP'
        if kind == 'Pages':
            assert set(names) == expected, 'Inventario de Pages distinto del aprobado'
            for name in names:
                assert archive.read(name) == (root / 'docs' / name).read_bytes(), 'Recurso público distinto de docs'
        if kind == 'Offline':
            assert set(names) == {'index.html', 'Cerconexo_Clasico.html', 'Cerconexo_Arena.html'}
            assert all(b'cerconexo-m6-beta-staging' not in archive.read(n) for n in names)
    reports.append({'archive': target.name, 'files': len(names), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
result = {'ok': True, 'archives': reports, 'publicResources': len(expected), 'secretsPrinted': False, 'pilotCredentialsRead': False}
out = root / 'online/evidence/beta-artifacts.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
