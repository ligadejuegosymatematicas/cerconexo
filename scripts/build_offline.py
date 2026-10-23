"""Tres HTML autónomos enlazados, sin servidor ni dependencias de ejecución."""
from pathlib import Path
import base64
import re
import runpy

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'offline'

def inline(name):
    source=(ROOT/name).read_text(encoding='utf-8')
    source='\n'.join(line for line in source.splitlines() if not line.startswith('import '))
    return re.sub(r'\bexport (const|async function|function\*|function|class)\b',r'\1',source)

def build():
    DEST.mkdir(exist_ok=True)
    runpy.run_path(str(ROOT/'build.py'),run_name='__main__')
    runpy.run_path(str(ROOT/'arena/build.py'),run_name='__main__')
    for source,name in [('Cerconexo_Premium_Listo_Para_Jugar.html','Cerconexo_Clasico.html'),('arena/Cerconexo_Arena_M3B.html','Cerconexo_Arena.html')]:
        (DEST/name).write_bytes((ROOT/source).read_bytes())
    # Cada motor queda en su ámbito. Se reutilizan sus decodificadores reales.
    classic='\n'.join(inline('src/'+n+'.mjs') for n in ['turnPolicies','engine','turnDraft','cpuSession','gameSave'])
    arena='\n'.join(inline('arena/src/'+n+'.mjs') for n in ['geometry','config','engine','session'])
    script='const {decodeGameSave,GAME_SAVE_KEY}=(()=>{'+classic+'\nreturn {decodeGameSave,GAME_SAVE_KEY};})();\n'
    script+='const {replayArenaSave,ARENA_SAVE_KEY}=(()=>{'+arena+'\nreturn {replayArenaSave,ARENA_SAVE_KEY};})();\n'
    script+=inline('src/launchData.mjs')+'\n'+inline('src/portal.mjs')
    script=script.replace("'./clasico/'","'./Cerconexo_Clasico.html'").replace("'./arena/'","'./Cerconexo_Arena.html'")
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=html.replace('<link rel="stylesheet" href="./src/portal.css">','<style>\n'+(ROOT/'src/portal.css').read_text(encoding='utf-8')+'\n</style>')
    html=html.replace('<script type="module" src="./src/portal.mjs"></script>','<script type="module">\n'+script+'\n</script>')
    logo=base64.b64encode((ROOT/'assets/Cerconexo_logo_v3_transparente.png').read_bytes()).decode('ascii')
    html=html.replace('./assets/Cerconexo_logo_v3_transparente.png','data:image/png;base64,'+logo)
    html=html.replace('./clasico/?','./Cerconexo_Clasico.html?').replace('./arena/?','./Cerconexo_Arena.html?')
    (DEST/'index.html').write_bytes(html.encode('utf-8'))
    print('Offline: index.html + Cerconexo_Clasico.html + Cerconexo_Arena.html. Sin publicación.')

if __name__=='__main__':build()
