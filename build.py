"""Crea un HTML autónomo, listo para abrir sin servidor, a partir de src/."""
from pathlib import Path
import base64

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'src/styles.css').read_text(encoding='utf-8')
engine = (root / 'src/engine.mjs').read_text(encoding='utf-8')
app = (root / 'src/app.mjs').read_text(encoding='utf-8')
targets = (root / 'src/boardTargets.mjs').read_text(encoding='utf-8').replace('export function ', 'function ')
engine = engine.replace('export const ', 'const ').replace('export function ', 'function ')
assert app.startswith('import ')
app = '\n'.join(line for line in app.splitlines() if not line.startswith('import '))
html = html.replace('<link rel="stylesheet" href="./src/styles.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="./src/app.mjs"></script>', f'<script type="module">\n{engine}\n{targets}\n{app}\n</script>')
logo = base64.b64encode((root / 'assets/Cerconexo_wordmark_original.png').read_bytes()).decode('ascii')
html = html.replace('./assets/Cerconexo_wordmark_original.png', f'data:image/png;base64,{logo}')
out = root / 'Cerconexo_Premium_Listo_Para_Jugar.html'
out.write_text(html, encoding='utf-8')
print(f'Listo: {out.name} ({out.stat().st_size:,} bytes)')
