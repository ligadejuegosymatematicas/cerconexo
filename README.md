# CERCONEXO

Juego de estrategia territorial local para cuatro personas, en dos equipos, de la Liga de Juegos y Matemáticas. Funciona en computadores y teléfonos. Las cuatro personas comparten un dispositivo; alojar el juego no añade partidas online.

## Sitio previsto

Cuando el propietario autorice y active GitHub Pages:

[ligadejuegosymatematicas.github.io/cerconexo/](https://ligadejuegosymatematicas.github.io/cerconexo/)

La preparación local no significa que esa URL ya esté publicada. Consulta [PUBLICACION.md](PUBLICACION.md) para la primera activación y las versiones futuras.

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
node --test tests/engine.test.mjs tests/targets.test.mjs tests/pages.test.mjs
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
- docs/: siete archivos estáticos que constituyen la raíz pública del sitio.
- scripts/: manifiesto y preparación reproducible de Pages.
- tests/: pruebas originales del motor, geometría y comprobación del sitio bajo /cerconexo/.
- .github/workflows/verificar.yml: comprobaciones automáticas; no publica ni fusiona.
- PUBLICACION.md: configuración de main /docs y procedimiento con aprobación humana.

No editar docs/ a mano. Después de cambiar fuentes, regenerarlo antes del commit. La interfaz, el logo y el motor existentes no se han modificado para el alojamiento.

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
