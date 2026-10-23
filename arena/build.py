"""Construcción independiente de Arena. No toca Premium ni docs/."""
from pathlib import Path
import base64
import re

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'src/styles.css').read_text(encoding='utf-8')
modules = []
for name in ['geometry', 'config', 'engine', 'session', 'app']:
    source = (root / f'src/{name}.mjs').read_text(encoding='utf-8')
    source = '\n'.join(line for line in source.splitlines() if not line.startswith('import '))
    source = re.sub(r'\bexport (const|function|class)\b', r'\1', source)
    modules.append(source)
html = html.replace('<link rel="stylesheet" href="./src/styles.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="./src/app.mjs"></script>', '<script type="module">\n' + '\n'.join(modules) + '\n</script>')
logo = base64.b64encode((root / 'assets/wordmark.png').read_bytes()).decode('ascii')
html = html.replace('./assets/wordmark.png', f'data:image/png;base64,{logo}')
out = root / 'Cerconexo_Arena_M3A.html'
out.write_text(html, encoding='utf-8')
print(f'HTML independiente: {out.name} ({out.stat().st_size:,} bytes)')
