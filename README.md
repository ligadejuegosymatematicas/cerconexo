# CERCONEXO

Juego de estrategia territorial local para cuatro personas, en dos equipos, de la Liga de Juegos y Matemáticas. Funciona en computadores y teléfonos. Las cuatro personas comparten un dispositivo; alojar el juego no añade partidas online.

## Sitio publicado y versión de trabajo

La Fase 3B (incorporación `762f327`, candidata `265ea0b`) está publicada en:

[ligadejuegosymatematicas.github.io/cerconexo/](https://ligadejuegosymatematicas.github.io/cerconexo/)

La Fase 4 se prepara exclusivamente en `desarrollo`: victoria, empate y tablero final visible. Conserva la Fase 3A, el motor, las superficies táctiles y el formato de guardado. Esta entrega no actualiza el sitio publicado. Consulta [PUBLICACION.md](PUBLICACION.md) para publicar únicamente versiones aprobadas.

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
- docs/: dieciséis archivos estáticos que constituyen el paquete candidato del sitio.
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
```

La segunda prueba usa animaciones reales y comprueba bloqueo de entradas, recorridos, reinicios y recargas durante transiciones, aislamiento, partida completa, teclado, movimiento reducido y HTML autónomo. Genera capturas y resultados en `validation/phase2a/`, excluidos del repositorio y del sitio. La prueba de `file://` requiere generar antes el HTML autónomo.

Los pasos provisionales se descartan al recargar, como en la Fase 1. El muro confirma la jugada y guarda el estado completo antes del efecto visual. En móvil, Reglas conserva la guía detallada; los jugadores con territorio asegurado se identifican con ✓ y permanecen en el tablero. Las comprobaciones de viewport no sustituyen la evaluación en teléfonos físicos.

## Vibración y marca derivada

En **Reglas y opciones → Vibración**, la opción comienza desactivada y se guarda por separado en `cerconexo-preferences-v1`. Muro: 12 ms; aislamiento: dos pulsos de 12 ms separados por 35 ms, sustituyendo al pulso del muro; inicio manual de partida: 8 ms. No vibra al cargar ni después de cada paso. Se evitan señales duplicadas, se limitan ráfagas, se cancela al ocultar la página y se pausa con movimiento reducido. Sin API o si el navegador la rechaza, el juego continúa normalmente. La presencia de la API no permite confirmar que exista hardware de vibración.

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
