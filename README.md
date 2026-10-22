# CERCONEXO

Juego de estrategia territorial local con dos equipos y cuatro fichas, de la Liga de Juegos y Matemáticas. Funciona en computadores y teléfonos. Los jugadores se organizan libremente para compartir un dispositivo; alojar el juego no añade partidas online.

## Sitio publicado y versión de trabajo

La revisión de M1, versión estable `b543efd8a5b14f2a54ae3e95c0e85d59534a72c9`, está publicada en:

[ligadejuegosymatematicas.github.io/cerconexo/](https://ligadejuegosymatematicas.github.io/cerconexo/)

M2 se prepara exclusivamente en `desarrollo`: rival CPU con tres niveles, las dos políticas de turnos y portada premium. Conserva los pasos definitivos, la recuperación, las reglas y el motor de la revisión de M1. Esta entrega no actualiza el sitio publicado. Consulta [PUBLICACION.md](PUBLICACION.md) para publicar únicamente versiones aprobadas.

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
- docs/: treinta y dos archivos estáticos que constituyen el paquete candidato del sitio.
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

tests/pages.browser.cjs comprueba escritorio y móvil, movimiento y construcción, persistencia, carga de recursos y equivalencia visual entre las fuentes y el paquete. Requiere Playwright en el entorno de desarrollo y Edge instalado; CERCONEXO_PLAYWRIGHT_PATH permite indicar la ruta del módulo. No es una dependencia de ejecución del juego.

```sh
node tests/pages.browser.cjs
node tests/phase2a.browser.cjs
node tests/phase2b.browser.cjs
node tests/phase3a.browser.cjs
node tests/phase3b.browser.cjs
node tests/phase4.browser.cjs
node tests/phase5a.browser.cjs
```

La segunda prueba usa animaciones reales y comprueba bloqueo de entradas, recorridos, reinicios y recargas durante transiciones, aislamiento, partida completa, teclado, movimiento reducido y HTML autónomo. Genera capturas y resultados en `validation/phase2a/`, excluidos del repositorio y del sitio. La prueba de `file://` requiere generar antes el HTML autónomo.

Los pasos ejecutados se conservan al recargar mediante el avance parcial del turno. El muro confirma la jugada completa y limpia ese avance antes del efecto visual. La Guía del tablero se consulta de forma independiente; los jugadores con territorio asegurado se identifican con ✓ y permanecen en el tablero. Las comprobaciones de viewport no sustituyen la evaluación en teléfonos físicos.

## Vibración y marca derivada

En **Opciones → Vibración**, la opción comienza activada si no existe una decisión previa. Las preferencias guardadas true/false se respetan y se conservan por separado en `cerconexo-preferences-v1`. Muro: 12 ms; aislamiento: dos pulsos de 12 ms separados por 35 ms, sustituyendo al pulso del muro; inicio manual de partida: 8 ms. No vibra al cargar ni después de cada paso. Se evitan señales duplicadas, se limitan ráfagas, se cancela al ocultar la página y se pausa con movimiento reducido. Sin API o si el navegador la rechaza, el juego continúa normalmente. La presencia de la API no permite confirmar que exista hardware de vibración.

La prueba `phase2b.browser.cjs` verifica colores calculados, capturas y comportamiento con API simulada, ausente, rechazada y con excepciones. La vibración física requiere probar un teléfono compatible.

Los archivos `Cerconexo_logo_v3_original.png` y `Cerconexo_wordmark_original.png` permanecen intactos. Los derivados `*_transparente.png` tienen el mismo tamaño y recorte; solo se extrae el fondo y se desmatizan los bordes para eliminar contaminación negra. No se utilizó generación de imágenes, redibujado ni cambio de paleta de la marca. El original con extensión `.png` contiene datos JPEG, por lo que tiene residuos de compresión y no proporciona una máscara alfa original.

`python scripts/derive_logo.py` reproduce los derivados con Pillow y NumPy, solo como herramientas de preparación; no son dependencias del juego ni de CI. Las pruebas de los derivados usan únicamente Node y comprueban hashes oficiales, dimensiones, colores opacos, recomposición sobre negro y recorte exacto. Capturas y resultados de Fase 2B quedan en `validation/phase2b/`, fuera del repositorio y del sitio.

## Conquista territorial — Fase 3A

`src/territoryEvents.mjs` compara las componentes anteriores y posteriores devueltas por el motor. Solo genera conquistas para casillas que pasan de región compartida a exclusiva; atribuye el evento al propietario, aunque construya el rival. Las regiones vacías y los territorios ya asegurados no se celebran. Un BFS adicional calcula únicamente distancias visuales por conexiones abiertas, con todas las fichas aliadas de la componente como fuentes simultáneas.

`src/territoryFeedback.mjs` presenta las capas en hasta 500 ms y los valores oficiales del marcador en 300 ms, en paralelo con un aviso de 1200 ms. Las dos conquistas posibles comparten el aviso y se animan simultáneamente. El turno siguiente y el resultado existente esperan el aviso; la pausa adicional es de aproximadamente 1,2 segundos. Se mantienen movimiento de 180 ms, muro de 280 ms y énfasis de turno de 320 ms.

Los nodos de casillas, fichas y muros persisten. Los objetivos de la jugada anterior se ocultan durante la conquista y quedan bloqueados; al finalizar aparecen los del siguiente turno. El aviso utiliza el espacio del panel de turno, sin desplazar ni reducir el tablero. Las regiones vacías conservan una trama marfil grisácea y cero puntos.

El estado verdadero se guarda inmediatamente al confirmar el muro. Los números intermedios, eventos, temporizadores y animaciones nunca se guardan. Recargar restaura directamente el estado confirmado sin repetir conquistas; una nueva partida cancela las continuaciones pendientes. Con movimiento reducido, colores y cifras son inmediatos y se conserva el aviso informativo. Cambiar esa preferencia durante la animación también termina sus efectos.

`tests/territory.test.mjs` añade diez casos, incluidos BFS con obstáculos y dos fuentes, atribución rival, conquistas simultáneas, regiones vacías, subdivisiones ya aseguradas y 40 partidas completas. En todos los estados comprobados, A + B + casillas en disputa + vacías = 49. La subdivisión de territorio ya asegurado se verifica con estados estructurales sintéticos: una ficha inactiva no puede realizar esa jugada mediante la interfaz.

`tests/phase3a.browser.cjs` verifica las cuatro resoluciones, las duraciones reales de Web Animations, avisos, contadores, finalización, recarga y reinicio durante conquista, reducción de movimiento y HTML autónomo. Las pruebas de Fase 2A muestrean ahora los efectos dentro del clic real para evitar falsos fallos por latencia del protocolo al observar transiciones de solo 180 ms. No se modifica el reloj del juego.

Las capturas, GIF de navegador real e informe se conservan en `validation/phase3a/`, excluidos del repositorio y del paquete público. No se han subido cambios, fusionado ramas ni actualizado GitHub Pages. La siguiente fase y la publicación requieren aprobación.

La comparación de capturas tolera únicamente diez píxeles con una diferencia máxima de 20/255 por canal, para el suavizado de bordes del navegador entre contextos. Registra la diferencia observada; la comprobación de archivos mantiene identidad byte a byte. El lector PNG de las pruebas de marca se comparte en `tests/png.mjs`, sin dependencias nuevas.

## Fichas aseguradas y enfrentamiento — Fase 3B local

`src/participationEvents.mjs` deriva fichas recién aseguradas, participantes por equipo, redistribuciones y composición del enfrentamiento. En la integración reutiliza las componentes mixtas ya obtenidas por `territoryEvents.mjs`; no vuelve a recorrer el tablero ni calcula turnos o puntos. Solo el motor establece qué ficha sigue activa y quién juega después. Los eventos no forman parte del guardado.

`src/participationFeedback.mjs` presenta confirmaciones simultáneas de 350 ms desde el final de la propagación (500 ms). Terminan hacia los 850 ms, dentro del aviso territorial existente de 1200 ms: no se añade espera a esa secuencia crítica. Con movimiento reducido se muestran distintivos y estados directamente. Cada ficha conserva posición, color e identificador, con un ✓ circular y sin el halo de participación.

Al liberar el turno real, un solo aviso de 1400 ms reúne el enfrentamiento y la redistribución: «CONTINÚA LA DISPUTA» o «¡ÚLTIMA DISPUTA!», con identificadores derivados del estado. No hay cola de mensajes por ficha. El aviso usa el espacio existente, no intercepta el tablero y puede desaparecer si una nueva construcción da prioridad a otro acontecimiento. Los participantes se presentan como Asegurado, En juego o Turno. La disposición móvil reserva el mismo espacio para todos esos estados sin reducir el tablero.

El resultado final suprime avisos de enfrentamiento, después de la conquista y la confirmación de todas las fichas correspondientes. La vibración conserva exactamente los pulsos de Fase 2B; la comparación de participantes ya disponible sustituye las consultas repetidas anteriores sin añadir señales.

Cada reinicio invalida la generación de las confirmaciones, resuelve esperas canceladas, detiene efectos y retira avisos. Una recarga reconstruye los distintivos a partir del motor, sin reproducir eventos antiguos. El estado oficial se guarda antes de los efectos, como en Fase 3A.

El aviso combina sus datos en una única región de estado accesible. Mientras está visible se evita que el texto ordinario del turno produzca anuncios redundantes; los controles, el identificador del turno y los mensajes visibles siguen funcionando. La evaluación manual con lectores de pantalla continúa pendiente.

Las 33 pruebas anteriores se mantienen, con doce pruebas nuevas de participación: 45 en total. `tests/phase3b.browser.cjs` comprueba las cuatro resoluciones, rotación, confirmaciones, avisos no bloqueantes, concurrencia, teclado, recarga y reinicio durante efectos y HTML autónomo. La prueba territorial distingue ahora el aviso de conquista del aviso posterior de participación mediante el tipo del evento; mantiene los casos, puntuaciones y tiempos de Fase 3A.

La evidencia local queda en `validation/phase3b/`. No se modifica main, no se crea PR, no se suben cambios ni se publica GitHub Pages. La publicación estable sigue en c9f3e98. La Fase 4 requiere autorización independiente.


## Final de partida — Fase 4 local

`src/resultEvents.mjs` prepara el título, el detalle y el anuncio accesible usando `game.over`, `game.winner` y la puntuación oficial de `territory`. No decide ganadores ni modifica el motor. Las casillas vacías proceden de `score.empty`, sin confundirlas con regiones mixtas. La diferencia es el valor absoluto entre las puntuaciones finales.

`src/resultFeedback.mjs` presenta el resultado en el panel existente del turno: el tablero real, sus 49 casillas, todos los muros y las cuatro fichas permanecen visibles. Se retira la antigua superposición y sus controles Ver tablero / Nueva partida duplicados; el control de la cabecera inicia la nueva partida con el mecanismo existente. Los marcadores mantienen sus colores y la distribución indica A + B + Vacías = 49 solamente al finalizar.

El resultado aparece después del muro (280 ms), las conquistas (BFS 500 ms, contador 300 ms y aviso 1200 ms) y las confirmaciones simultáneas de fichas (350 ms). No se anuncian turnos ni enfrentamientos al terminar. Su entrada de opacidad dura 450 ms y no bloquea Nueva partida. La presentación no modifica el tamaño del panel ni el tablero. El título usa composición equilibrada y los textos se adaptan a las cinco resoluciones, incluyendo 740×360.

El estado oficial se guarda antes de cualquier efecto. Al recargar se reconstruye directamente el resultado estable, sin repetir las animaciones. El reinicio cancela los efectos del resultado y los mecanismos de Fases 2 y 3, limpia los distintivos y conserva preferencias. Con movimiento reducido se omite también la espera del aviso territorial únicamente en la jugada final; el resultado aparece directamente. Los tiempos normales y las animaciones anteriores se conservan.

Una región viva independiente anuncia una sola vez el resultado y las tres cantidades definitivas; los marcadores no son regiones vivas. No se añade vibración final: permanece la única señal existente por jugada, opcional y desactivada por defecto.

Las pruebas de Fase 4 cubren resultados oficiales A/B/empate, vacías/cero vacías, diferencia singular/plural, final desde 2 vs. 2 y desde 1 vs. 1, invariantes, persistencia y 50 partidas completas adicionales. La suite real de navegador muestrea cada frame de las transiciones, comprueba capturas en cinco resoluciones, recargas/reinicios durante los efectos, teclado, movimiento reducido, preferencias, partida completa y HTML autónomo. La prueba anterior 2A conserva sus casos y utiliza el único botón Nueva partida, ya que el tablero ahora se ve permanentemente.

Las evidencias y el informe están en `validation/phase4/`, fuera del sitio y del repositorio. Esta entrega es local; main y GitHub Pages permanecen en 762f327. No se inicia la Fase 5. Se requiere aprobación independiente para publicar.


## Interfaz y experiencia de uso — Fase 5A local

La cabecera conserva exclusivamente el logotipo oficial, Reglas, Opciones y Nueva partida. Se retiran el texto institucional, el eslogan y el pie permanente; el guardado automático se mantiene sin mensajes nuevos. La altura de la aplicación utiliza visualViewport en todos los tamaños. Se elimina la altura mínima de 640 px que provocaba scroll en ventanas de PC de menor altura útil. La cabecera y los márgenes se compactan y el SVG se adapta al espacio cuadrado realmente disponible, sin zoom CSS ni ocultar el desbordamiento de la página. En alturas excepcionalmente pequeñas se permite desplazamiento accesible.

Reglas presenta la introducción y los cuatro pasos aprobados: Muévete, Construye, Asegura territorio y Gana. El desplegable Ver reglas completas conserva posiciones, turnos, recorrido de 0/1/2 pasos con giro y regreso, muros obligatorios, fichas aseguradas, regiones vacías, puntuación y empate. No contiene opciones ni la guía. Los diálogos nativos de Reglas, Opciones y Guía comparten `src/dialogs.mjs`: X, Escape, gesto exterior iniciado y terminado fuera, foco inicial, ciclo de Tab y restauración de foco. El tablero queda inerte y el manejador de acciones rechaza también entradas durante un modal.

Opciones contiene únicamente Vibración. El nuevo valor inicial true solo se usa si no hay una decisión booleana guardada. El constructor no escribe preferencias ni emite pulsos, de modo que no convierte el valor predeterminado en una decisión del usuario. Se mantienen false y true guardados, la clave y el formato existentes, el límite de pulsos y las pausas por movimiento reducido o visibilidad. Sin API, el control queda deshabilitado y se indica que el navegador no ofrece vibración.

La guía lateral permanece en escritorio amplio con altura suficiente. En móvil, tablet o escritorio de altura reducida, su único contenido se traslada a un diálogo independiente que se abre desde Guía del tablero, en la franja existente sobre el SVG. No se añade una fila a la mesa ni se reduce el tablero al abrirla.

`src/matchup.mjs` prepara el enfrentamiento usando los identificadores activos obtenidos por el motor. El panel del turno reserva espacio fijo para la composición y para el contexto: 2 vs. 2, 1 vs. 2, 2 vs. 1 o 1 vs. 1 · Última disputa, con los identificadores reales. El último acontecimiento permanece durante el siguiente turno y los turnos ordinarios posteriores, hasta otro aseguramiento, el resultado o el reinicio. No hay historial ni temporizador de desaparición. El texto se sustituye en el espacio reservado y no bloquea acciones. Los pasos seleccionados se indican también en la cabecera del turno. La recarga reconstruye el enfrentamiento desde el estado oficial y no repite un acontecimiento antiguo.

Se reutilizan detección de participación, confirmaciones simultáneas de 350 ms y halo de última disputa. No cambian movimiento, muro, BFS, marcadores ni entrada del resultado. Un anuncio accesible independiente comunica cada acontecimiento una sola vez; el estado permanente no es una región viva. El resultado final elimina el acontecimiento y oculta el enfrentamiento sin cambiar la retícula.

Las 59 pruebas anteriores permanecen, ajustando las expectativas de háptica al nuevo valor inicial aprobado. Se añaden doce pruebas de Fase 5A (71 en total). Las suites anteriores de navegador mantienen sus escenarios funcionales y adaptan únicamente el acceso a Opciones, los selectores de diálogo y la permanencia del acontecimiento. La nueva suite verifica nueve resoluciones a escala 1, todas las formas de cierre, foco, modalidad, preferencias, composición simétrica, mensajes persistentes sin anuncios repetidos, recarga, reinicio, movimiento reducido, HTML autónomo y un viewport excepcional de 280 px con scroll accesible. Las evidencias, comparación con la versión estable e informe están en validation/phase5a, excluidos del repositorio y del sitio.

No se suben cambios, no se crea PR y no se publica. main y GitHub Pages conservan 89dbe98. No se comienza la Fase 5B ni la auditoría 5C.


## La matemática de tu partida — Fase 5B local

Después del resultado, «Explorar las regiones» habilita una consulta del mismo tablero. El panel informativo ofrece Región, Resumen («Cómo quedó dividido el tablero») y Matemática («¿Qué matemática hay detrás?»). No se alteran los marcadores oficiales ni se reconstruye el tablero. «Volver al resultado» o Escape desde una casilla cierra la consulta sin reiniciar.

`src/explorationData.mjs` obtiene una instantánea con `territory(game)` del motor: componentes, fichas y puntuaciones oficiales. Prepara un índice de las 49 casillas y conexiones ortogonales abiertas una sola vez por estado final. El BFS de selección calcula exclusivamente capas visuales desde la casilla elegida; nunca decide conquistas ni puntos.

`src/exploration.mjs` administra selección, foco, contornos y propagación educativa de 320 ms. No recibe funciones de jugada, persistencia ni vibración. Las casillas, muros y fichas reales permanecen intactos. Las 49 superficies de consulta incluyen las fichas y usan un solo punto de tabulación con flechas, Home/End y Enter/Espacio. Seleccionar otra casilla de la misma región no repite efectos ni anuncios. Una nueva región cancela los efectos anteriores; movimiento reducido omite la propagación.

El acceso usa la franja de controles existente y el contenido ocupa el panel del turno/resultado. Las explicaciones extensas tienen desplazamiento interno accesible, sin agrandar paneles ni reducir el tablero. Reglas, Opciones y Guía conservan su modalidad y gestión del foco. La recarga vuelve al resultado verdadero, sin guardar selecciones educativas. Nueva partida cancela y elimina toda la consulta.

Pruebas: `node --test tests/*.test.mjs` (83 casos) y ocho suites de navegador, incluida `node tests/phase5b.browser.cjs`. El manifiesto de Pages y `build.py` incluyen ambos módulos nuevos; no hay dependencias de ejecución adicionales. Informes, capturas y demostraciones están en `validation/phase5b/`, excluidos del repositorio y del sitio público.

Fase desarrollada únicamente en desarrollo. La referencia pública sigue siendo e88cfa677e468a3f6fb893093fb3ace2eb7fe619; no se publica, sube ni fusiona esta entrega. No se inicia Fase 5C.


## Ajuste final de experiencia — desarrollo local

El resultado permanece visible y, tras completar la última jugada y sus animaciones, las 49 casillas permiten consultar directamente las componentes conexas. Se retiran el botón de entrada/salida, las pestañas y la teoría separada. El mismo panel de puntuaciones conserva ambos marcadores, las fichas con ✓, la distribución y las casillas vacías; muestra el resumen real o la componente seleccionada, con una breve explicación contextual. Las reglas incluyen solo introducción y cuatro pasos, con empate y la precisión de que una región debe contener fichas del equipo.

La selección educativa usa violeta #8B5CF6, sombreado al 12 % y halo suave. La frontera y la BFS de 320 ms reutilizan los algoritmos aprobados. Se puede quitar la selección tocando cualquier casilla de la misma componente, pulsando la X, Escape o fondo libre. Reglas, Opciones, Nueva partida y Guía conservan sus interacciones sin quitar accidentalmente la selección. El teclado mantiene una sola casilla en la secuencia de tabulación.

En móvil, el marcador final conserva su altura: las cuatro fichas aseguradas se presentan con identificador y ✓, y la información contextual ocupa el espacio recuperado. El tamaño y la posición del tablero se contrastan con la estable 2ece078. No se ocultan contenidos para evitar scroll; las ventanas excepcionalmente pequeñas conservan desplazamiento accesible.

Los acontecimientos de participación separan encabezado de confirmación y explicación de redistribución. Un énfasis de borde y encabezado de 280 ms no bloquea el juego; el mensaje permanece durante el siguiente turno. Recarga no repite avisos y reinicio cancela efectos pendientes. El estado de enfrentamiento sigue derivándose del motor.

Se conservan las 92 pruebas previas, adaptando únicamente las expectativas de navegación/textos sustituidos, y se añaden diez casos en `tests/experience.test.mjs` (102 en total). Las ocho suites de navegador incluyen la consulta directa, deselección, avisos de las cuatro fichas, movimiento reducido, reinicio y mediciones por fotograma. El motor, la persistencia y las animaciones matemáticas anteriores permanecen intactos.

Entrega local únicamente en desarrollo. No se sube ni publica; main y GitHub Pages deben conservar 2ece078f5b2563c35016ade18327e75daa4b2f55 hasta nueva autorización. No se comienza Fase 5C.


## Referencia histórica — M1 original, publicada en 5c1ffdca

Esta sección describe la entrega anterior. La revisión al final de este documento sustituye su comportamiento de cancelación y su guardado de recorridos.

Referencia estable: `d1264a190f122a29778048b7166efb1b8ec4b6f6`. Esta entrega se desarrolla exclusivamente en `desarrollo`; no autoriza publicación, PR ni fusión. No incorpora CPU, online ni Arena.

Nueva partida abre un selector local con dos sistemas. Turnos por ficha conserva A1 → B1 → A2 → B2 y la redistribución clásica. Turnos por equipo alterna A/B y permite elegir cualquier ficha activa del equipo, incluso repetirla en su siguiente turno. No se configura el número de personas. Se propone la modalidad de la partida actual para repetirla; sin partida previa se propone Clásico. La elección queda fijada al comenzar.

En el tablero, las candidatas tienen aro discontinuo y la seleccionada conserva el aro sólido habitual. Tocar otra candidata cancela el recorrido provisional anterior; no confirma una jugada ni escribe almacenamiento. Una única ficha activa se selecciona automáticamente. Solo construir un muro confirma el turno, guarda el estado y pasa al equipo rival. El botón existente Cambiar recorrido y los controles de teclado se conservan.

### Responsabilidades

- `src/turnPolicies.mjs`: política de asignación de fichas. No calcula territorios ni puntuación.
- `src/engine.mjs`: autoridad única para validar ficha, recorrido y muro; aplica la jugada y calcula componentes, participación, puntos y resultado.
- `src/turnDraft.mjs`: selección y recorrido provisionales, separados del estado oficial.
- `src/app.mjs` y `src/boardView.mjs`: controles locales y presentación, sin decidir legalidad por su cuenta.

Un controlador futuro puede consultar `legalActors`, `availableMoves` y `wallOptions`, y confirmar mediante `applyTurn`. M1 no contiene controladores CPU ni una segunda implementación territorial.

### Compatibilidad

Se conserva la clave `wallgo-league-v2`, la envoltura `{game}` y la versión 2. La ausencia de `game.turnMode` equivale a Clásico, sin reescribir la partida al cargarla. Las partidas nuevas por equipo añaden `turnMode: "team"`; `currentActor` es nulo cuando hay dos opciones o contiene la única ficha disponible. La selección provisional no se guarda y se descarta al recargar. Las preferencias de vibración no se modifican. Resultado y exploración usan el mismo estado definitivo de ambas modalidades.

### Comprobación

`node --test tests/*.test.mjs`: 113 pruebas, incluidas las 102 anteriores. Las comprobaciones antiguas de SHA del motor se aplican al oráculo congelado `tests/classic-engine-v2.mjs`; la equivalencia funcional se verifica en `tests/modes.test.mjs`, comparando estados completos y todas las jugadas legales de 24 partidas clásicas deterministas. Se prueban además 24 partidas completas por equipo y casos dirigidos de aislamiento, puntuación, victoria y empate.

Ejecutar las ocho suites históricas y `node tests/modes.browser.cjs`. Los escenarios de reinicio históricos completan el nuevo selector; mantienen las aserciones originales de las fases anteriores. El empaquetado local se regenera con `python scripts/build_pages.py` y `python build.py`. `python scripts/build_pages.py --check` verifica los 22 archivos publicables sin publicar nada.

Evidencias e informe en `validation/m1/`; entrega autónoma y ZIP en `entregas/M1/`. Se detiene el desarrollo al finalizar M1, pendiente de aprobación.


## Revisión de M1 — pasos definitivos (solo desarrollo)

Referencia pública: `5c1ffdca6ded1485b75f8cce008a2b5d6956ac6e`. Esta revisión no se sube ni publica. Conserva ambas políticas de M1 y todo el motor matemático, incluido su SHA-256 `ee7982394c38dbdee738f04bb7811590e70dc4d9d6e3b39bea44aac8844b3a90`.

Cada paso legal es definitivo. Se elimina Cambiar recorrido y Escape deja de cancelar pasos. En turnos por equipo se puede cambiar de ficha solamente antes del primer paso; después se fija hasta construir el muro. Regresar al origen sigue siendo un segundo paso legal, consume ambos pasos y exige construir. Las animaciones siguen usando 180 ms por paso y 280 ms por muro.

`src/turnDraft.mjs` mantiene el recorrido ejecutado separado de la partida oficial. `src/gameSave.mjs` escribe atómicamente `{game, pendingTurn}` en la misma clave `wallgo-league-v2`. El estado oficial v2 no cambia. `pendingTurn`, solo presente tras mover, contiene versión 1, identidad de la ficha, recorrido ordenado, pasos consumidos y una firma textual exacta del estado base. El paso se guarda antes de animar. El muro se aplica con `applyTurn` y reemplaza la envoltura por `{game}` antes de presentarlo.

La recarga valida el estado con el motor, verifica la base y recorre el camino utilizando `availableMoves`; recupera posición y pasos sin repetir animaciones antiguas. Los guardados anteriores sin pendingTurn se cargan sin reescritura y conservan su modalidad. Un avance inválido se descarta, se conserva la partida oficial válida y se informa de la recuperación. Un fallo de escritura impide aceptar el paso, muro o reinicio para no perder decisiones ejecutadas.

No hay que alterar legalidad ni filtrar nuevos movimientos: todo paso legal mantiene abierto el borde interior por el que se llegó, que siempre permite construir un muro. Las pruebas comprueban este argumento en callejones y en todos los prefijos de partidas completas.

El rectángulo negro se reprodujo como outline nativo `rgb(16,16,16) auto 5px` sobre grupos SVG con foco táctil, pese a no coincidir con :focus-visible. Se elimina únicamente el outline nativo de los controles SVG que tienen indicadores de teclado propios; las fichas usan un círculo explícito al navegar por teclado y los botones exteriores conservan su foco. La restauración de foco al reconstruir objetivos solo se realiza para teclado. No se cambian sus superficies de selección. La guía añade dos explicaciones contextuales para los aros de ficha disponible y seleccionada.

Pruebas: 132 casos (113 anteriores y 19 nuevos), nueve suites anteriores y `tests/committed.browser.cjs`. Se conservan las pruebas de equivalencia clásica; se actualizan solo los escenarios que exigían cancelación o pérdida de pasos al recargar. La suite nueva incluye recuperación, bloqueos, almacenamiento dañado o sin cuota, teclado, tacto, partidas completas y fotogramas en nueve resoluciones. El paquete local ahora contiene 23 archivos, incluido gameSave.mjs. Regenerar con `python scripts/build_pages.py` y `python build.py`.

Evidencias y diagnóstico: `validation/m1-revision/`. Entrega: `entregas/M1_Revision/`. No se inicia M2, CPU, online ni una pantalla inicial nueva.


## M2 — CPU local y portada (candidata local, sin publicar)

La portada utiliza el logotipo completo transparente ya existente, sin lemas. Jugar abre un selector compacto Local / Contra CPU; se conservan ambas políticas. Contra CPU permite elegir dificultad y equipo humano, sin intercambiar colores ni posiciones. A comienza siempre. Continuar conserva todos los parámetros. Inicio pausa sin borrar. La confirmación de reemplazo se integra en el selector, mediante el aviso y Reemplazar y comenzar; cerrarlo conserva la partida.

### Núcleo estratégico

- `cpuMoves.mjs`: jugadas completas mediante `legalActors`, `availableMoves` y `wallOptions`. Enumera cero, uno y dos pasos, giros, regreso y todos los muros; puede deduplicar resultados equivalentes y respetar un prefijo irreversible.
- `cpuEvaluate.mjs`: evaluación pura con territorio oficial, influencia por distancias BFS del grafo abierto, movilidad y oportunidades de puentes. Los puntos siempre proceden de `territory`. Pesos iniciales normalizados: asegurado 90, potencial 42, movilidad 10 y conexiones 20; no son pesos óptimos. Los resultados oficiales terminales tienen prioridad absoluta (±1.000.000; empate 0).
- `cpuSearch.mjs`: Principiante elige entre hasta cinco alternativas razonables próximas al mejor valor inmediato; Intermedio evalúa amenazas de resultado y pérdidas territoriales en las respuestas a sus cinco mejores candidatas; Avanzado realiza minimax selectivo de dos plies con poda alfa-beta sobre doce candidatas propias y respuestas legales del rival. Los empates numéricos se resuelven con semilla para evitar sesgo de enumeración.
- Presupuestos orientativos: 120/340/850 ms, con 200/900/2600 nodos. La pasada inicial examina todas las candidatas únicas y conserva una alternativa legal incluso si se agotó el presupuesto; el límite se aplica a la búsqueda adicional. No se promete optimalidad ni mayor fuerza en toda posición.
- `cpuPlanner.mjs` y `cpuWorker.mjs`: cálculo en Worker de módulo; el autónomo utiliza un Worker Blob con exactamente las mismas fuentes. Si no está disponible o falla, el generador cede el hilo aproximadamente cada 6 ms. El watchdog de un Worker sin respuesta es de 2,5 s; es recuperación de fallo, no un retraso de dificultad.
- `cpuController.mjs`: cancela por generación, revalida la jugada, persiste el plan y ejecuta selección, pasos y muro con las acciones comunes de la interfaz. No contiene reglas ni puntuación.

### Guardado y cancelación

Se mantiene `wallgo-league-v2` y el estado oficial versión 2. Los guardados locales mantienen su formato. Solo las partidas CPU añaden `control` (versión 1, equipo humano, dificultad, semilla) y, mientras corresponde, `cpuPlan` (versión 1, equipo, estado base textual y jugada completa). `pendingTurn` sigue registrando los pasos realmente aceptados. Una sola escritura guarda estos elementos coherentemente antes de cada acción irreversible; el muro limpia plan y avance al guardar el siguiente estado.

Recargar vuelve a la portada; Continuar reanuda el plan ya fijado sin cambiar de decisión. Un plan dañado se descarta con aviso, preservando el juego oficial y cualquier prefijo legal para buscar únicamente su continuación. Si la configuración CPU es irreconocible, se preserva el tablero válido en recuperación local con aviso; no se inventan equipo ni dificultad. Los guardados locales antiguos nunca se convierten a CPU. Un fallo de escritura impide aceptar nuevas acciones; Inicio / Continuar permite reintentar. Preferencias de vibración intactas.

Inicio y Nueva partida cancelan búsquedas y efectos de otra generación. Se recupera el estado realmente guardado, incluido un muro que ya se confirmó aunque su efecto visual siguiera en curso. Reglas y Opciones pausan la ejecución automática de forma segura y reanudan al cerrar. No hay sonidos, servicios externos, nuevas reglas ni funcionalidades online.

### Verificación M2

Ejecutar `node --test tests/*.test.mjs`, las diez suites históricas y `node tests/m2.browser.cjs`. Las suites antiguas usan `tests/navigation.cjs` para abrir sus fixtures por Continuar; solo cambia navegación, confirmación de reemplazo y muestreo cuando el tablero está visible. Sus aserciones de reglas, resultados, animaciones y geometría se conservan. M2 verifica por separado la portada sin guardado y el flujo nuevo completo.

`validation/m2/` contiene pruebas, simulaciones reproducibles, tiempos reales y evidencias. Los resultados y limitaciones finales se incluyen en `entregas/M2/`. El paquete local contiene 32 archivos; regenerar con `python scripts/build_pages.py` y `python build.py`. No se publica sin autorización posterior.

Simulaciones reproducibles: `node tests/cpu.simulate.mjs` (224 partidas, semillas independientes por agente y colores intercambiados; informe en `validation/m2/simulations.json`). Incluyen comprobaciones del guardado en cada prefijo CPU, sin DOM. Los tiempos de cálculo excluyen animaciones.
