"""La entrega actual es integrada; se reutiliza el empaquetador canónico."""
from pathlib import Path
import runpy

root=Path(__file__).resolve().parents[2]
if __name__=='__main__':
    runpy.run_path(str(root/'scripts/check-package.py'),run_name='__main__')
