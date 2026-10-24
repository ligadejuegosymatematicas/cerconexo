"""Comparte la portada inicial sin cargar ni reescribir partidas guardadas."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def backdrop(mode):
    source = (ROOT / 'index.html').read_text(encoding='utf-8')
    markup = re.search(r'<main class="portal".*?</main>', source, re.S).group()
    markup = markup.replace('<main class="portal"', '<main id="homeScreen" class="portal"')
    markup = markup.replace('./assets/', '../assets/').replace('./clasico/', '../clasico/').replace('./arena/', '../arena/')
    if mode == 'classic':
        begin = markup.index('<nav class="card-actions"')
        end = markup.index('</nav>', begin) + len('</nav>')
        markup = markup[:begin] + '''<nav class="card-actions" aria-label="Cerconexo Clásico">
          <button class="enter-mode" type="button" id="continueGame" data-continue hidden>Continuar partida</button>
          <button class="enter-mode" type="button" id="play">Jugar</button>
        </nav>''' + markup[end:]
        markup = markup.replace('id="portalNotice"', 'id="homeStatus"')
        markup = markup.replace('</main>', '<nav class="portal-utilities" aria-label="Ayuda"><button id="homeRules" type="button">Guía</button><button id="homeOptions" type="button">Opciones</button></nav></main>')
        markup = markup.replace('alt="CERCONEXO"', 'class="home-logo" alt="CERCONEXO"')
    return '<!-- shared-portal:start -->\n' + markup + '\n<!-- shared-portal:end -->'

def sync(check=False):
    for mode, path in [('classic', 'clasico/index.html'), ('arena', 'arena/index.html')]:
        target = ROOT / path
        source = target.read_text(encoding='utf-8')
        expected = re.sub(r'<!-- shared-portal:start -->.*?<!-- shared-portal:end -->', lambda _: backdrop(mode), source, flags=re.S)
        if expected != source:
            if check:
                raise SystemExit('Portada compartida desactualizada: ' + path)
            target.write_bytes(expected.encode('utf-8'))

if __name__ == '__main__':
    import sys
    sync('--check' in sys.argv)
