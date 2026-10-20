"""Crea un HTML autónomo, listo para abrir sin servidor, a partir de src/."""
from pathlib import Path
import base64

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'src/styles.css').read_text(encoding='utf-8')
def inline_module(name):
    source = (root / f'src/{name}.mjs').read_text(encoding='utf-8')
    source = '\n'.join(line for line in source.splitlines() if not line.startswith('import '))
    return source.replace('export const ', 'const ').replace('export function ', 'function ').replace('export class ', 'class ')

modules = '\n'.join(inline_module(name) for name in ['engine', 'boardTargets', 'boardView', 'feedback', 'haptics', 'participationEvents', 'territoryEvents', 'territoryFeedback', 'participationFeedback', 'resultEvents', 'resultFeedback', 'app'])
html = html.replace('<link rel="stylesheet" href="./src/styles.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="./src/app.mjs"></script>', f'<script type="module">\n{modules}\n</script>')
logo = base64.b64encode((root / 'assets/Cerconexo_wordmark_transparente.png').read_bytes()).decode('ascii')
html = html.replace('./assets/Cerconexo_wordmark_transparente.png', f'data:image/png;base64,{logo}')
out = root / 'Cerconexo_Premium_Listo_Para_Jugar.html'
out.write_text(html, encoding='utf-8')
print(f'Listo: {out.name} ({out.stat().st_size:,} bytes)')
