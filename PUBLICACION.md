# Publicar CERCONEXO en GitHub Pages

**Estado inicial: preparado localmente; sin repositorio remoto conectado y sin publicación.** Este documento no autoriza publicar. Antes de ejecutar el apartado de primera publicación, el propietario debe aprobar expresamente la versión candidata y su contenido.

## Destino previsto

- Cuenta: `ligadejuegosymatematicas`.
- Repositorio: `https://github.com/ligadejuegosymatematicas/cerconexo`.
- URL esperada, cuando se active Pages: `https://ligadejuegosymatematicas.github.io/cerconexo/`.
- Rama publicada: **main**, carpeta **/docs**.
- Rama de trabajo: **desarrollo**.

No se modifica el repositorio del sitio principal `ligadejuegosymatematicas.github.io`, ni otro repositorio de la cuenta. La ruta del juego es un proyecto independiente.

## Qué se publica

`index.html` de la raíz sigue siendo el archivo fuente de entrada. `python scripts/build_pages.py` copia sin modificar sus bytes los archivos de ejecución a `docs/`. Esa carpeta será la raíz del sitio: `docs/index.html` se sirve como `/cerconexo/`.

La lista pública está en `scripts/pages-files.json`: HTML, los cuatro módulos/estilos de `src/` y el PNG usado por la cabecera. Se añade `.nojekyll`. En total son siete archivos. No se publican pruebas, documentación, briefs, capturas ni versiones históricas del juego. El empaquetador rechaza archivos extra en `docs/` y no borra archivos automáticamente.

La lista explícita de `.gitignore` excluye también del repositorio los documentos internos, `validation/`, capturas, herramientas específicas del entorno y HTML generados. El PNG oficial completo se conserva en el repositorio como fuente de identidad, pero el sitio solo recibe la imagen que utiliza la aplicación. No se ha aplicado ninguna propuesta nueva del logo.

`.gitattributes` conserva los bytes originales, incluidos los finales de línea del motor. No se ha reescrito la interfaz ni el motor para preparar el alojamiento.

## Comprobación local

Requisitos de desarrollo: Python 3.9+ y Node 22+ (CI utiliza Node 24).

```sh
python scripts/build_pages.py
python scripts/build_pages.py --check
node --test tests/engine.test.mjs tests/targets.test.mjs tests/pages.test.mjs
```

`--check` no modifica nada: falla si faltan recursos, si hay archivos ajenos al sitio o si `docs/` no coincide con las fuentes. Debe pasar antes de aprobar una versión.

Para revisar visualmente el paquete:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8000/docs/`. La prueba `pages.test.mjs` monta además el paquete en la ruta exacta `/cerconexo/`, comprueba todas sus referencias y los tipos MIME. El navegador se comprueba opcionalmente con `node tests/pages.browser.cjs`; requiere Playwright disponible en desarrollo y Edge instalado. Puede indicarse la ruta del módulo mediante `CERCONEXO_PLAYWRIGHT_PATH` y otro navegador compatible mediante `CERCONEXO_BROWSER_CHANNEL`. No son dependencias del juego ni del despliegue.

El guardado permanece bajo `wallgo-league-v2`. Recargar y abrir `index.html` dentro del mismo origen conserva la partida. La publicación usa un origen distinto de un archivo local o localhost: las partidas locales no se transfieren automáticamente a GitHub Pages. Cambiar de teléfono o navegador tampoco transfiere el guardado.

## Antes de la primera publicación

1. Revisar el estado de la versión candidata, sus pruebas y el manifiesto de archivos. **Solicitar aprobación expresa; no ejecutar push ni activar Pages todavía.**
2. Confirmar que el propietario es `ligadejuegosymatematicas` y que `cerconexo` es el nombre correcto.
3. El propietario puede crear un repositorio vacío desde **GitHub → + → New repository**: Owner `ligadejuegosymatematicas`, nombre `cerconexo`. No inicializar README, `.gitignore` ni licencia porque ya existe el historial local preparado. Si ese repositorio ya existe, detenerse y revisarlo antes de conectar o subir; no sobrescribirlo.
4. Si se utiliza GitHub Free, elegir repositorio público para Pages. Para repositorios privados se necesita un plan compatible. Se requieren permisos de administración o mantenimiento para configurar Pages. [Disponibilidad y permisos de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Crear el repositorio vacío no publica el juego. No introducir credenciales en archivos del proyecto.

## Primera publicación: solo después de la aprobación

Desde la carpeta del proyecto, autenticado con la cuenta de la Liga mediante el gestor de credenciales de Git o GitHub Desktop:

```sh
git remote add origin https://github.com/ligadejuegosymatematicas/cerconexo.git
git remote -v
git push -u origin main
git push -u origin desarrollo
```

Estos comandos se proporcionan para la fase autorizada; no se ejecutaron durante la preparación. Si ya existe `origin`, revisarlo antes de cambiarlo. No utilizar `--force` ni subir a otro repositorio.

En GitHub:

1. Abrir **ligadejuegosymatematicas/cerconexo**, comprobar que la rama predeterminada es `main` y que existen ambas ramas.
2. En **Actions**, esperar a que **Comprobar Cerconexo / verificar** pase.
3. Antes de activar Pages, proteger `main` en **Settings → Branches → Add branch protection rule** (o la opción de regla clásica): patrón `main`, exigir pull request, exigir el control de estado `verificar` y rama actualizada. No permitir force push ni borrado. Si se usa una única cuenta, no exigir revisiones de otra persona; la decisión de fusionar debe seguir siendo manual. La disponibilidad y nombres de estas opciones pueden depender de la configuración de GitHub.
4. Abrir **Settings → Pages → Build and deployment**.
5. Elegir **Source: Deploy from a branch**, **Branch: main**, **Folder: /docs**.
6. Pulsar **Save**. **Este paso activa la publicación**, por lo que requiere la aprobación previa.
7. Esperar a que la ejecución de Pages termine y comprobar `https://ligadejuegosymatematicas.github.io/cerconexo/` en un computador y un teléfono. No se da por publicada hasta comprobar la URL real.

GitHub permite publicar desde una rama y su carpeta `/docs`, y actualiza el sitio cuando esa carpeta cambia en la rama elegida. [Configurar el origen de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Versiones futuras

1. Trabajar en `desarrollo`; nunca modificar `docs/` a mano.
2. Editar las fuentes, ejecutar `python scripts/build_pages.py` y las pruebas. La copia pública forma parte del mismo commit que las fuentes.
3. Subir solamente `desarrollo` y abrir un pull request con **base main ← compare desarrollo**. El workflow de verificación no tiene permiso para publicar ni fusionar.
4. Mostrar los cambios, pruebas y una revisión local al propietario. **Esperar su aprobación expresa**; no activar auto-merge.
5. Después de la aprobación y los controles verdes, fusionar manualmente el pull request en `main`. Ese cambio publica automáticamente la versión aprobada mediante Pages.
6. Actualizar `desarrollo` desde `main` antes del próximo trabajo.

No hay sitio público de pruebas desde `desarrollo`, ni workflows propios de despliegue alternativos. La selección remota `main /docs` es la que limita la publicación. Los controles de protección de rama deben configurarse en GitHub: la documentación y el YAML por sí solos no aplican esa protección.

## Si hay que retirar una versión

Con autorización del propietario, revertir el commit de publicación mediante un pull request y regenerar `docs/` desde las fuentes recuperadas. No reescribir el historial. Pages publicará la reversión aprobada al fusionarla en `main`.
