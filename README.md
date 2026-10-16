# CERCONEXO

Juego de estrategia territorial local para cuatro personas, en dos equipos, de la Liga de Juegos y Matemáticas. Funciona en computadores y teléfonos. Las cuatro personas comparten un dispositivo; alojar el juego no añade partidas online.

## Sitio publicado y versión de trabajo

La Fase 2A (incorporación `2935a2c`, candidata `61145f7`) está publicada en:

[ligadejuegosymatematicas.github.io/cerconexo/](https://ligadejuegosymatematicas.github.io/cerconexo/)

La Fase 2B se prepara exclusivamente en `desarrollo`: vibración opcional, paleta funcional refinada y logo transparente derivado del oficial sobre marfil. Conserva las transiciones de Fase 2A, el motor, las superficies táctiles y el formato de guardado. Esta entrega no actualiza el sitio publicado. Consulta [PUBLICACION.md](PUBLICACION.md) para publicar únicamente versiones aprobadas.

## Abrir en desarrollo

Desde esta carpeta:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abrir http://127.0.0.1:8000/ para las fuentes o http://127.0.0.1:8000/docs/ para el paquete de Pages.

## Preparar y comprobar

Python 3.9+ y Node 22+ para desarrollo; CI usa Node 24. El navegador del jugador no necesita instalar dependencias.

```sh
python scripts/build_pages.py
python scripts/build_pages.py --check
node --test tests/*.test.mjs
```

El empaquetador copia únicamente los recursos enumerados en scripts/pages-files.json y añade .nojekyll. La comprobación falla si el paquete no coincide con las fuentes o contiene archivos adicionales.

Para generar opcionalmente un HTML autónomo:

```sh
python build.py
```

Ese archivo generado se conserva localmente y no es necesario para Pages.

## Estructura

- index.html y src/: fuentes modulares de la interfaz y del motor.
- assets/: marca oficial completa y recorte utilizado por la cabecera.
- docs/: diez archivos estáticos que constituyen el paquete candidato del sitio.
- scripts/: manifiesto y preparación reproducible de Pages.
- tests/: pruebas originales del motor, geometría y comprobación del sitio bajo /cerconexo/.
- .github/workflows/verificar.yml: comprobaciones automáticas; no publica ni fusiona.
- PUBLICACION.md: configuración de main /docs y procedimiento con aprobación humana.

No editar docs/ a mano. Después de cambiar fuentes, regenerarlo antes del commit. `src/boardView.mjs` conserva los nodos del tablero y `src/feedback.mjs` presenta los efectos; el motor permanece independiente del DOM.

`src/haptics.mjs` aísla la API de vibración y su preferencia. Las variables de `:root` en `src/styles.css` definen los colores compartidos por el tablero y las animaciones.

## Publicar versiones aprobadas

1. Desarrollar y probar en desarrollo.
2. Regenerar docs/ y abrir un pull request hacia main.
3. Esperar controles verdes y aprobación explícita del propietario.
4. Fusionar manualmente en main. Con Pages configurado desde main /docs, el sitio se actualizará automáticamente.

No se utiliza desarrollo como origen de Pages. No se activa auto-merge. La primera subida y la activación de Pages requieren autorización previa.

## Guardado

La partida se guarda en el navegador con la clave existente wallgo-league-v2. Recargar la misma URL o abrir su index.html conserva la partida dentro del mismo origen. El HTML local, localhost y GitHub Pages tienen orígenes distintos: los guardados no se transfieren entre ellos ni entre dispositivos.

## Comprobación opcional con navegador

tests/pages.browser.cjs comprueba escritorio y móvil, movimiento y construcción, persistencia, carga de recursos y equivalencia visual exacta entre las fuentes y el paquete. Requiere Playwright en el entorno de desarrollo y Edge instalado; CERCONEXO_PLAYWRIGHT_PATH permite indicar la ruta del módulo. No es una dependencia de ejecución del juego.

```sh
node tests/pages.browser.cjs
node tests/phase2a.browser.cjs
node tests/phase2b.browser.cjs
```

La segunda prueba usa animaciones reales y comprueba bloqueo de entradas, recorridos, reinicios y recargas durante transiciones, aislamiento, partida completa, teclado, movimiento reducido y HTML autónomo. Genera capturas y resultados en `validation/phase2a/`, excluidos del repositorio y del sitio. La prueba de `file://` requiere generar antes el HTML autónomo.

Los pasos provisionales se descartan al recargar, como en la Fase 1. El muro confirma la jugada y guarda el estado completo antes del efecto visual. En móvil, Reglas conserva la guía detallada; los jugadores con territorio asegurado se identifican con ✓ y permanecen en el tablero. Las comprobaciones de viewport no sustituyen la evaluación en teléfonos físicos.

## Vibración y marca derivada

En **Reglas y opciones → Vibración**, la opción comienza desactivada y se guarda por separado en `cerconexo-preferences-v1`. Muro: 12 ms; aislamiento: dos pulsos de 12 ms separados por 35 ms, sustituyendo al pulso del muro; inicio manual de partida: 8 ms. No vibra al cargar ni después de cada paso. Se evitan señales duplicadas, se limitan ráfagas, se cancela al ocultar la página y se pausa con movimiento reducido. Sin API o si el navegador la rechaza, el juego continúa normalmente. La presencia de la API no permite confirmar que exista hardware de vibración.

La prueba `phase2b.browser.cjs` verifica colores calculados, capturas y comportamiento con API simulada, ausente, rechazada y con excepciones. La vibración física requiere probar un teléfono compatible.

Los archivos `Cerconexo_logo_v3_original.png` y `Cerconexo_wordmark_original.png` permanecen intactos. Los derivados `*_transparente.png` tienen el mismo tamaño y recorte; solo se extrae el fondo y se desmatizan los bordes para eliminar contaminación negra. No se utilizó generación de imágenes, redibujado ni cambio de paleta de la marca. El original con extensión `.png` contiene datos JPEG, por lo que tiene residuos de compresión y no proporciona una máscara alfa original.

`python scripts/derive_logo.py` reproduce los derivados con Pillow y NumPy, solo como herramientas de preparación; no son dependencias del juego ni de CI. Las pruebas de los derivados usan únicamente Node y comprueban hashes oficiales, dimensiones, colores opacos, recomposición sobre negro y recorte exacto. Capturas y resultados de Fase 2B quedan en `validation/phase2b/`, fuera del repositorio y del sitio.
