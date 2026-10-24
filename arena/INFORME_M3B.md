# Arena M3-B — interfaz y preparación experimental

Candidata local para revisión. **Sin push, PR, merge ni publicación.** Premium y el núcleo de Arena M3-A permanecen intactos.

## Cambios

- Marcador con indicadores compactos de cada ficha: identificador, en juego (●), asegurada (✓) y énfasis del turno. Su nombre accesible conserva estado e inventario.
- Indicaciones de movimiento breves. Poderes y descartes compactos; los descartes sustituyen temporalmente al inventario inutilizable durante la pausa.
- Guía en un panel temporal accesible, con Escape, cierre exterior, X y restauración del foco. Sin leyendas técnicas ni registro de oleadas permanentes. Los datos de oleadas siguen en el motor y se reconstruyen con el diario original.
- Tres dibujos SVG originales, compartidos por casillas especiales, inventario, objetivos de Salto y guía. Contraste y trazados distintos; los nombres de los poderes siguen siendo texto accesible.
- Vista vertical optimizada y distribución de tablero/controles en paralelo para 740×360. Se conserva el ancho de tablero M3-A en móvil: 358 px en 390×844, 328 px en 360×740 y 338 px en horizontal. No se modificaron los objetivos de movimiento o muro.

## Inspección de regiones

`src/regionInspection.mjs` recibe las componentes ya calculadas, dimensiones y ocupaciones. No importa el motor, el DOM ni el almacenamiento; puede adaptarse posteriormente al tablero 7×7 de Premium sin cambiarlo ahora.

«Inspeccionar regiones» cambia exclusivamente la capa de interacción. Las 81 casillas son consultables, incluidas las ocupadas. Un toque selecciona la región; otro en la misma componente la deselecciona. Se resalta el conjunto real, se conserva la coloración territorial y el texto distingue exclusiva, compartida y vacía. El número se ancla en una casilla perteneciente a la componente, preferentemente libre. En una casilla ocupada se desplaza dentro de ella para conservar el identificador y el ✓. Se comprobaron también los límites reales de la tipografía SVG.

En consulta no hay objetivos de juego, los poderes y descartes no se pueden ejecutar y el controlador rechaza acciones. No se llama al diario ni al guardado. Al salir vuelven las opciones del turno pendiente. Funciona después del final sin modificar el resultado. La selección se limpia al salir, reiniciar o cambiar la topología/clasificación; no se persiste ni se repite al recargar.

Teclado: un único objetivo de tabulación para el tablero, flechas ortogonales, Home/End, Enter/Espacio. Los nombres accesibles incluyen fila, columna, estado y tamaño. La selección produce un solo aviso textual; no hay propagaciones ni animaciones decorativas nuevas.

## Verificación

- 175 pruebas Premium originales y 58 pruebas Arena, con las 44 de M3-A conservadas y 14 adicionales.
- 100 partidas completas simuladas en las pruebas del motor, sin alterar componentes, actividad ni puntuación.
- Suite de interacción anterior de Arena (12 grupos), más la suite M3-B de inspección, guardados históricos, recursos y responsive.
- 1440×900, 1366×768, 1366×600, 390×844, 360×740, 740×360 y 320×568; ratón, teclado, tacto Android emulado y movimiento reducido. Muestreo por fotogramas al consultar, abrir/cerrar la guía y regresar al juego.
- Cinco diarios creados con M3-A: ambas políticas 2 vs. 2, cuatro equipos, descarte pendiente y partida terminada. Se recuperan sin migración ni escrituras de inspección.
- Hashes de `engine.mjs`, `geometry.mjs`, `config.mjs` y `session.mjs` de Arena idénticos a M3-A. Comprobación adicional de los 114 archivos Premium y de sus 32 recursos publicables.

Resultados y capturas actuales en `evidence/m3b/` y `evidence/m3b-regression/`. Las pruebas estructurales de navegador utilizan estados controlados exclusivamente en la creación inicial de su entorno de prueba; no son mecanismos del juego entregado.

## Publicación propuesta

Ruta: `/cerconexo/arena/`. El ensayo local se genera en `arena/staging/pages`, nunca en `docs/`. Contiene 42 recursos: 32 Premium idénticos y 10 Arena. Se verifican acceso directo, recursos, rutas relativas y guardados separados bajo el mismo origen.

La adaptación futura del manifiesto público, la inclusión de `docs/arena/` y las comprobaciones de CI se describen concretamente en `PUBLICACION_M3B.md`. **No se aplicaron**. La raíz Premium no recibe enlaces ni cambios visuales.

## Pendientes

- Validación física Android/iOS y prueba con lectores de pantalla reales.
- En 320×568 y ventanas menores se conserva desplazamiento accesible. Los mensajes largos pueden desplazarse dentro de su zona reservada; no se ocultan controles para simular que caben.
- La calibración del equilibrio de poderes sigue siendo experimental. Se conservan las limitaciones de almacenamiento entre orígenes y de coordinación entre pestañas de M3-A.
- No hay CPU, online, nuevos poderes, reglas o animaciones del motor.

Detenerse para revisión antes de cualquier publicación.
