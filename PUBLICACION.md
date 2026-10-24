# Publicación de Cerconexo · propuesta pendiente

Esta candidata se prepara únicamente en `desarrollo`. Durante su elaboración no se hace push, no se abre PR, no se fusiona `main` y no se publica Pages.

## Estructura propuesta

| URL | Contenido |
|---|---|
| `/cerconexo/` | Portada común |
| `/cerconexo/clasico/` | Clásico 7×7, local y contra CPU |
| `/cerconexo/arena/` | Arena M3-B 9×9, experimental |

Conservar el mismo origen `https://ligadejuegosymatematicas.github.io` mantiene accesibles las claves existentes de `localStorage`. No se renombran claves ni formatos. No trasladar a otro dominio como parte de esta publicación. Clásico y Arena recuperan sus propios guardados; la portada solo los consulta.

## Preparar el candidato local

```sh
python scripts/build_pages.py
python scripts/build_pages.py --check
python scripts/build_offline.py
node scripts/check-integrity.mjs
node --test tests/*.test.mjs arena/tests/*.test.mjs
node tests/browser-runner.cjs
python scripts/package.py
python scripts/check-package.py
```

El manifiesto `scripts/pages-files.json` produce 47 recursos exactos en `docs/`, incluida `.nojekyll`. No copiar a `docs/` a mano. El ZIP de Pages contiene exclusivamente ese inventario; el ZIP completo incluye fuentes, pruebas y tres HTML autónomos enlazados. Consultar [INTEGRACION.md](INTEGRACION.md) para detalles y limitaciones.

Para pruebas de navegador se necesita Playwright y un navegador instalado. El workflow usa Playwright 1.62.1 y Chromium; localmente se puede indicar `CERCONEXO_PLAYWRIGHT_PATH` y `CERCONEXO_BROWSER_CHANNEL=msedge`. No son dependencias del juego.

## Pasos después de una autorización nueva

1. Confirmar el commit de `desarrollo`, el árbol limpio y las evidencias aprobadas.
2. Subir exclusivamente esa candidata al repositorio `ligadejuegosymatematicas/cerconexo`.
3. Abrir PR hacia `main`. Esperar el control obligatorio `verificar`, que comprueba integridad, pruebas, navegador y empaquetado. No activar auto-merge ni omitir protecciones.
4. Fusionar únicamente la candidata aprobada. Conservar la configuración existente de Pages: rama `main`, carpeta `/docs`.
5. Esperar Actions y Pages; comparar los 47 recursos públicos con las fuentes aprobadas.
6. Verificar las tres URLs, Inicio/Continuar, ambas políticas de Clásico y la CPU, las tres configuraciones de Arena, repetición rápida, inspección, recarga y los guardados existentes. Probar también un Android físico.

La raíz dejará de abrir directamente el juego original y mostrará la portada. Los enlaces antiguos a la raíz seguirán funcionando. El juego original continuará en `/clasico/` sin perder el almacenamiento del mismo origen. Los enlaces directos a Arena seguirán disponibles.

No se necesita otro repositorio, cambio de dominio ni un workflow de despliegue desde `desarrollo`. El workflow conserva permisos de lectura y no publica. La protección remota de `main` y la elección `main /docs` continúan siendo configuraciones de GitHub; esta entrega no las modifica.

Si una validación requiere cambiar motores o reglas, detener la publicación y solicitar revisión. Para retirar una versión, usar una reversión aprobada mediante PR, sin reescribir el historial y sin `push --force`.
