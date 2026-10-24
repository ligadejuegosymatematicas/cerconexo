"""Ensayo local integrado. Utiliza el manifiesto canónico; no publica nada."""
from pathlib import Path
import argparse
import importlib.util

ARENA=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('cerconexo_pages',ARENA.parent/'scripts/build_pages.py')
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    # La carpeta nueva evita mezclar el ensayo histórico de M3-B con esta entrega.
    builder.prepare(ARENA/'staging/unified',check=args.check)
