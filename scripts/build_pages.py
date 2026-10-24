"""Prepara docs/ para Pages, o comprueba su vigencia. No publica ni usa red."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "docs"


def payload():
    files = json.loads((ROOT / "scripts/pages-files.json").read_text(encoding="utf-8"))
    if len(files) != len(set(files)):
        raise SystemExit("El manifiesto contiene archivos repetidos.")
    result = {".nojekyll": b""}
    for name in files:
        relative = Path(name)
        source = ROOT / relative
        if relative.is_absolute() or ".." in relative.parts or source.is_symlink():
            raise SystemExit(f"Ruta no permitida: {name}")
        if not source.resolve().is_relative_to(ROOT):
            raise SystemExit(f"Recurso fuera del proyecto: {name}")
        result[name] = source.read_bytes()
    return result


def prepare(destination=DESTINATION, *, check=False):
    destination = Path(destination)
    expected = payload()
    if destination.is_symlink() or not destination.resolve().is_relative_to(ROOT):
        raise SystemExit("Destino no permitido.")
    actual = set()
    if destination.exists():
        for entry in destination.rglob("*"):
            if entry.is_symlink():
                raise SystemExit(f"Enlace no permitido en docs/: {entry.name}")
            if entry.is_file():
                actual.add(entry.relative_to(destination).as_posix())
    extra = actual - expected.keys()
    if extra:
        raise SystemExit("Archivos ajenos en docs/; revisar antes de publicar: " + ", ".join(sorted(extra)))
    stale = [name for name, data in expected.items()
             if not (destination / name).is_file() or (destination / name).read_bytes() != data]
    if check:
        if stale:
            raise SystemExit("docs/ desactualizado. Ejecuta python scripts/build_pages.py: " + ", ".join(stale))
        print(f"Pages verificado: {len(expected)} archivos, idénticos a sus fuentes.")
        return
    for name, data in expected.items():
        target = destination / name
        if not target.resolve().is_relative_to(destination.resolve()):
            raise SystemExit(f"Destino no permitido: {name}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print(f"Pages preparado: {destination.relative_to(ROOT)} ({len(expected)} archivos). No se ha publicado nada.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Comprobar sin modificar archivos")
    prepare(check=parser.parse_args().check)


if __name__ == "__main__":
    main()
