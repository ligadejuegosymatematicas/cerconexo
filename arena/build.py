"""Construcción independiente de Arena. No toca Premium ni docs/."""
from pathlib import Path
import base64
import re

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'src/styles.css').read_text(encoding='utf-8')+'\n'+(root.parent/'src/gameShell.css').read_text(encoding='utf-8')+'\n'+(root.parent/'src/experience.css').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="../src/gameShell.css">','').replace('<link rel="stylesheet" href="../src/experience.css">','')
modules = [(root.parent/'src/contextHelp.mjs').read_text(encoding='utf-8').replace('export function ', 'function ')]
modules.append((root.parent/'src/illustratedManual.mjs').read_text(encoding='utf-8').replace('export function ', 'function '))
modules.append(re.sub(r'\bexport (const|function)\b', r'\1', (root.parent/'src/haptics.mjs').read_text(encoding='utf-8')))
for name in ['geometry', 'config', 'engine', 'session', 'regionInspection', 'powerIcons', 'app']:
    source = (root / f'src/{name}.mjs').read_text(encoding='utf-8')
    source = '\n'.join(line for line in source.splitlines() if not line.startswith('import '))
    source = re.sub(r'\bexport (const|function|class)\b', r'\1', source)
    modules.append(source)
html = html.replace('<link rel="stylesheet" href="./src/styles.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="./src/app.mjs"></script>', '<script type="module">\n' + '\n'.join(modules) + '\n</script>')
logo = base64.b64encode((root.parent / 'assets/Cerconexo_wordmark_transparente.png').read_bytes()).decode('ascii')
html = html.replace('../assets/Cerconexo_wordmark_transparente.png', f'data:image/png;base64,{logo}')
out = root / 'Cerconexo_Arena_M3B.html'
html = html.replace('href="../"', 'href="index.html"')
home_logo = base64.b64encode((root.parent / 'assets/Cerconexo_logo_v3_transparente.png').read_bytes()).decode('ascii')
html = html.replace('../assets/Cerconexo_logo_v3_transparente.png', f'data:image/png;base64,{home_logo}')
html = html.replace('href="../clasico/?continue=1"', 'href="Cerconexo_Clasico.html?continue=1"').replace('href="../clasico/?new=1"', 'href="Cerconexo_Clasico.html?new=1"').replace('href="../arena/?continue=1"', 'href="Cerconexo_Arena.html?continue=1"').replace('href="../arena/?new=1"', 'href="Cerconexo_Arena.html?new=1"')
out.write_bytes(html.encode('utf-8'))
print(f'HTML independiente: {out.name} ({out.stat().st_size:,} bytes)')
