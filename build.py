"""Crea un HTML autónomo, listo para abrir sin servidor, a partir de src/."""
from pathlib import Path
import base64
import json

root = Path(__file__).resolve().parent
html = (root / 'clasico/index.html').read_text(encoding='utf-8')
css = (root / 'src/styles.css').read_text(encoding='utf-8')+'\n'+(root/'src/gameShell.css').read_text(encoding='utf-8')
def inline_module(name):
    source = (root / f'src/{name}.mjs').read_text(encoding='utf-8')
    source = '\n'.join(line for line in source.splitlines() if not line.startswith('import '))
    return source.replace('export const ', 'const ').replace('export async function ', 'async function ').replace('export function* ', 'function* ').replace('export function ', 'function ').replace('export class ', 'class ')

worker = '\n'.join(inline_module(name) for name in ['turnPolicies','engine','cpuMoves','cpuEvaluate','cpuSearch','cpuWorker'])
modules = '\n'.join(inline_module(name) for name in ['turnPolicies', 'engine', 'turnDraft', 'cpuSession', 'gameSave', 'cpuMoves', 'cpuEvaluate', 'cpuSearch', 'cpuPlanner', 'cpuController', 'boardTargets', 'boardView', 'feedback', 'haptics', 'dialogs', 'navigation', 'matchup', 'participationEvents', 'territoryEvents', 'territoryFeedback', 'participationFeedback', 'resultEvents', 'resultFeedback', 'explorationData', 'exploration', 'liveInspection', 'app'])
toolkit=(root/'arena/src/regionInspection.mjs').read_text(encoding='utf-8').replace('export class ','class ').replace('export function ','function ')
modules='const {InspectionModel,inspectionDescription,inspectionAnnotation,inspectionBoundary}=(()=>{'+toolkit+'\nreturn {InspectionModel:RegionInspection,inspectionDescription:regionDescription,inspectionAnnotation:regionAnnotation,inspectionBoundary:regionBoundary};})();\n'+modules
html=html.replace('<link rel="stylesheet" href="../src/gameShell.css">','')
modules = modules.replace("new URL('./cpuWorker.mjs',import.meta.url)", 'URL.createObjectURL(new Blob([' + json.dumps(worker,ensure_ascii=True).replace('</','<\\/') + '],{type:"text/javascript"}))')
html = html.replace('<link rel="stylesheet" href="../src/styles.css">', f'<style>\n{css}\n</style>')
html = html.replace('<script type="module" src="../src/app.mjs"></script>', f'<script type="module">\n{modules}\n</script>')
logo = base64.b64encode((root / 'assets/Cerconexo_wordmark_transparente.png').read_bytes()).decode('ascii')
html = html.replace('../assets/Cerconexo_wordmark_transparente.png', f'data:image/png;base64,{logo}')
home_logo = base64.b64encode((root / 'assets/Cerconexo_logo_v3_transparente.png').read_bytes()).decode('ascii')
html = html.replace('../assets/Cerconexo_logo_v3_transparente.png', f'data:image/png;base64,{home_logo}')
out = root / 'Cerconexo_Premium_Listo_Para_Jugar.html'
html = html.replace('href="../"', 'href="index.html"').replace('data-home="../"', 'data-home="index.html"')
out.write_bytes(html.encode('utf-8'))
print(f'Listo: {out.name} ({out.stat().st_size:,} bytes)')
