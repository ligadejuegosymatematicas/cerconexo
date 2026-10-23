# Cerconexo · Clásico y Arena

Candidata local en `desarrollo`, basada en Arena M3-B `0bb5e7609fec05b1e30ca14af290bc7f0d451957`. No autoriza ni realiza push, Pull Request, fusión ni despliegue.

## Interfaz y navegación

- `/cerconexo/`: portada con el logotipo oficial y dos tarjetas, Clásico 7×7 y Arena 9×9 experimental. Los tableros ilustrados son SVG sencillos; no sustituyen ningún tablero de juego.
- `/cerconexo/clasico/`: juego original, CPU de tres dificultades y ambas políticas locales. El acceso directo conserva su menú de Jugar/Continuar, Reglas y Opciones. Los enlaces de la portada abren directamente la partida o su selector, evitando pasos intermedios.
- `/cerconexo/arena/`: Arena M3-B, ambas políticas 2 vs. 2 y cuatro equipos. Recupera la partida existente; si no existe, presenta el selector sin escribir un guardado hasta confirmar.
- Inicio vuelve a la portada. Clásico cancela primero la búsqueda CPU y las continuaciones visuales; las acciones y los planes ya aceptados conservan su persistencia habitual. Arena usa un enlace normal después de las acciones atómicas existentes.
- Una partida terminada ofrece **Jugar de nuevo** con la misma modalidad, política, dificultad/equipo humano o parámetros experimentales. Una nueva partida CPU obtiene una semilla nueva, manteniendo las decisiones y presupuestos de búsqueda anteriores. **Nueva partida** permite cambiar la configuración.
- Los controles de repetición rápida solo están disponibles después del final. Una partida pendiente se reemplaza únicamente al pulsar **Reemplazar y comenzar**, después de ver el aviso; cerrar el selector conserva todo.
- Arena utiliza **Salir de inspección** en cualquier estado. Solo abandona la consulta, sin reiniciar ni confirmar acciones. El control no se expande innecesariamente en horizontal.

## Guardados: sin migración de formato ni cambio de claves

`localStorage` pertenece al origen, no a la carpeta de la URL. Al conservar el origen público y mover Clásico a `/clasico/`, se sigue leyendo `wallgo-league-v2`, incluyendo partidas anteriores sin campo de modalidad, pasos consumidos y planes CPU pendientes. Se mantiene `cerconexo-preferences-v1`.

Arena continúa usando `cerconexo-arena-m3a-v1`: diario versionado de configuración y acciones, validado por el motor al cargar. Los cinco diarios de referencia de M3-A cubren ambas políticas, cuatro equipos, un descarte pendiente y una partida terminada. No se cambian ni se convierten.

La portada llama a los decodificadores reales de cada modalidad y solo consulta su estado. No crea partidas, no guarda selecciones y no escribe preferencias. Distingue partida pendiente, finalizada, ausencia de guardado y datos inválidos. Los guardados dañados se conservan; el reemplazo exige una acción explícita. Los enlaces estáticos también son seguros antes de terminar la inicialización de la portada.

Una partida de Clásico no altera la clave de Arena, ni a la inversa. El almacenamiento de localhost, archivos locales y Pages es distinto: esta entrega no promete transferir partidas entre orígenes, navegadores o dispositivos.

## Integridad de las modalidades

`scripts/frozen-files.json` fija el SHA-256 de 32 archivos de la base aprobada: motores, geometría, políticas de turnos, pasos definitivos, persistencia, CPU, animaciones, exploración e imágenes oficiales. `node scripts/check-integrity.mjs` los verifica sin necesitar Git ni conexión.

- Motor Clásico: `ee7982394c38dbdee738f04bb7811590e70dc4d9d6e3b39bea44aac8844b3a90`.
- Motor Arena: `4f4527c9ba3153f0c760def8e5b89f748a82b320a6e9df9592d9789be49fe158`.

No se implementan inspección nueva en Clásico, CPU en Arena, online, poderes adicionales ni cambios reglamentarios.

## Empaquetado y CI

Un único manifiesto, `scripts/pages-files.json`, enumera **45 recursos** contando `.nojekyll`. `python scripts/build_pages.py` genera el candidato local en `docs/`; `--check` exige inventario exacto y bytes idénticos a las fuentes. Los dos motores se sirven una sola vez cada uno. Ambas modalidades y la portada comparten las imágenes oficiales de `assets/`; no se publica otra copia del logotipo para Arena.

Los recursos mantienen rutas relativas. Se comprueban las tres entradas, los accesos sin barra final, cada HTML/CSS/módulo/imagen, las importaciones y la ausencia de archivos internos en el sitio. El ensayo de Arena delega en ese mismo empaquetador; no existe una copia manual alternativa de publicación.

`python scripts/build_offline.py` genera tres HTML autocontenidos enlazados en `offline/`, incluyendo el Worker Blob de Clásico. `python scripts/package.py` prepara un ZIP de proyecto, otro con el contenido exacto de Pages y otro con los tres HTML. El manifiesto de proyecto se actualiza expresamente desde el índice de Git con `--refresh-manifest`, sin incluir temporales ni credenciales.

`python scripts/check-package.py` extrae el ZIP en una carpeta limpia y comprueba Pages, los 32 archivos protegidos, las pruebas, la navegación y la reconstrucción byte a byte de los tres HTML. No necesita `.git` para esas comprobaciones.

El workflow conserva el control obligatorio `verificar`, permisos de solo lectura y ramas `main`/`desarrollo`. Incluye Clásico, Arena, integridad, reconstrucción y las 16 suites de navegador. Playwright es únicamente herramienta de pruebas; el juego no recibe dependencias nuevas. El workflow no fusiona ni despliega.

## Validación

Se mantienen las 175 pruebas de Clásico y las 58 de Arena; se añaden 12 de integración: **245 pruebas automatizadas**. Las comprobaciones de HTML existentes siguen examinando el documento de Clásico, ahora situado en `clasico/index.html`. Las 13 suites históricas y las dos de Arena conservan su cobertura; sus rutas y expectativas de Inicio se adaptan a la portada común. Se añade una suite específica de integración.

Resoluciones: 1440×900, 1366×768, 1366×600, 390×844, 360×740, 740×360 y 1280×560, además de los tamaños históricos. Se miden fotogramas durante diálogos, inspección y repetición; se verifican zoom 100 %, tamaños de tablero, dimensiones de página y conservación de los guardados. En ventanas de altura reducida de Arena solo se compactan márgenes; no se reduce su tablero. Las ventanas excepcionalmente pequeñas mantienen desplazamiento accesible.

Las evidencias reales y los resultados de ejecución se entregan en `entregas/Aplicacion_Integrada/`. El informe final enumera cualquier incidencia de la validación.

## Propuesta de publicación (pendiente de aprobación)

Revisar esta candidata y sus evidencias. Solo después de una autorización nueva: subir el commit aprobado a `desarrollo`, abrir PR hacia `main`, esperar `verificar`, fusionar respetando las protecciones y comprobar Pages desde `main /docs`. La raíz cambiará a la portada; los guardados del mismo origen seguirán disponibles en `/clasico/`. No se requieren cambios de dominio ni otro repositorio.

La verificación posterior debe comparar los 45 recursos desplegados con la candidata y repetir Continuar/Inicio/revancha en las dos rutas. Durante esta entrega `main` y el sitio público permanecen sin cambios.

## Limitaciones

La prueba de teléfonos se realiza con emulación táctil de Chromium/Edge; queda pendiente una comprobación física de Android de la navegación integrada. Arena continúa siendo experimental. La calibración competitiva de la CPU y la observación de posibles congelamientos en Android siguen siendo las limitaciones conocidas de M2; no se ha modificado la CPU en esta entrega.
