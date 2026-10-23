"""La entrega actual es integrada; se reutiliza el empaquetador canónico."""
from pathlib import Path
import runpy

root=Path(__file__).resolve().parents[1]
if __name__=='__main__':
    runpy.run_path(str(root/'scripts/package.py'),run_name='__main__')
