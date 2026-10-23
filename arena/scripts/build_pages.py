"""Ensayo local de /cerconexo/arena/. No modifica docs/, manifiesto Premium ni GitHub."""
from pathlib import Path
import argparse
import json

ARENA=Path(__file__).resolve().parents[1]
DEST=ARENA/'staging/pages'

def payload():
    # Premium se incluye sin alterar sus bytes para verificar convivencia en el mismo origen.
    premium=ARENA.parent/'docs'
    expected={p.relative_to(premium).as_posix():p.read_bytes() for p in premium.rglob('*') if p.is_file()}
    names=json.loads((ARENA/'scripts/pages-files.json').read_text(encoding='utf-8'))
    if len(names)!=len(set(names)):
        raise ValueError('Recurso Arena duplicado')
    for name in names:
        p=Path(name)
        if p.is_absolute() or '..' in p.parts or (ARENA/p).is_symlink():
            raise ValueError('Ruta Arena no permitida')
        expected['arena/'+p.as_posix()]=(ARENA/p).read_bytes()
    return expected

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    expected=payload()
    if DEST.is_symlink():raise ValueError('Destino no permitido')
    actual={p.relative_to(DEST).as_posix() for p in DEST.rglob('*') if p.is_file()}
    if actual-set(expected):raise ValueError('Hay archivos extra en el ensayo local')
    stale=[name for name,data in expected.items() if not (DEST/name).is_file() or (DEST/name).read_bytes()!=data]
    if args.check:
        if stale:raise ValueError('Ensayo desactualizado: '+', '.join(stale))
    else:
        for name,data in expected.items():
            target=DEST/name
            if not target.resolve().is_relative_to(DEST.resolve()):raise ValueError('Destino fuera del ensayo')
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    print(f'Ensayo local: {len(expected)} recursos (Premium idéntico + Arena). Sin publicación.')

if __name__=='__main__':main()
