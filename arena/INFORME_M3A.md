# Arena M3-A — entrega experimental

## Resultado

Prototipo jugable independiente con tablero 9×9, 2 vs. 2 por ficha o por equipo, y cuatro equipos A/B/C/D. Se entrega como fuentes modulares, HTML autónomo y ZIP completo de Arena. No se publicó ni se modificó Cerconexo Premium.

Se validó primero el motor 2 vs. 2 (29 pruebas iniciales y 60 partidas completas). Luego se incorporó la configuración de cuatro equipos al mismo motor, con 40 partidas adicionales. No hay dos implementaciones de componentes o puntuación dentro de Arena.

## Reglas y persistencia

El motor calcula regiones compartidas con dos o más equipos, exclusivas con uno y vacías sin fichas. Cada acción vuelve a calcular actividad y puntuaciones; una demolición puede restar territorio y reactivar fichas, y un salto puede cambiar la ocupación sin cambiar el grafo. La suma territorial es siempre 81 y las regiones exclusivas nunca se cuentan dos veces por contener fichas compañeras.

Los poderes se ejecutan como acciones definitivas, con las reglas de pasos y muro final aprobadas. Una ficha que se asegura cierra su intervención inmediatamente; el final general tiene prioridad sobre descartes y recolección. La capacidad compartida se obtiene del número real de fichas activas.

Las decisiones de descarte quedan en el estado de resolución. Si B debe descartar durante una acción de A, el tablero se bloquea para acciones ordinarias, B decide y vuelve la intervención original. Al llenarse el inventario por una visita se puede rechazar el poder nuevo. La casilla visitada queda desactivada aunque el objeto sea rechazado.

El guardado propio `cerconexo-arena-m3a-v1` contiene configuración inicial y diario de comandos. Cada comando se valida y se guarda mediante una escritura atómica antes de mostrar su efecto. Recargar reproduce el diario con el motor, recuperando pasos, consumos, visitas, descartes pendientes y resultado. Un fallo de escritura no confirma la acción. Un diario inválido se conserva, bloqueando nuevas acciones hasta que el usuario decida reemplazarlo. No se leen ni migran guardados de Premium.

## Oleadas

Los valores aprobados están en `src/config.mjs` y son editables antes de empezar mediante el JSON de Nueva partida. Las oleadas de los turnos completados 8 y 16 utilizan conjuntos simétricos completos, únicamente sobre casillas libres de regiones compartidas. La selección es determinista. Si no hay conjunto válido se omite toda la oleada y se registra. Se conservan distancias de acceso por conexiones abiertas, sin considerar bloqueos temporales de fichas.

## Verificación

- **219/219 pruebas automatizadas**: 175 históricas de Premium y 44 propias de Arena; sin fallos.
- **100 partidas completas simuladas**: 60 en 2 vs. 2 y 40 con cuatro equipos. Invariantes territoriales y finalización comprobadas.
- **12 grupos de comprobación de navegador**, con ratón, tacto emulado, teclado y movimiento reducido. Incluyen seis resoluciones: 1440×900, 1366×768, 1366×600, 390×844, 360×740 y 740×360.
- Inventario lleno, descarte del adversario, recargas pendientes, poder tras dos pasos, turno siguiente, final real de una partida legal, recuperación segura de datos dañados y HTML `file://` verificados en Edge.
- **23 capturas reales**, en `evidence/`, y resultados en `browser-results.json` y `unit-results.txt`.
- **114 archivos de Premium idénticos byte a byte** a la base `c4be595`; sus 32 recursos publicables siguen coincidiendo con las fuentes.
- SHA-256 del motor Premium sin cambios: `ee7982394c38dbdee738f04bb7811590e70dc4d9d6e3b39bea44aac8844b3a90`.

El control de aislamiento está en `evidence/premium-isolation.json`. Las pruebas propias usan fixtures estructurales para escenarios concretos, además de diarios completos legales. Los fixtures de navegador cambian únicamente la creación inicial en un envoltorio de prueba; no forman parte del juego entregado.

## Archivos y aislamiento

Todo el prototipo está dentro de `arena/`: geometría, configuración, motor, sesión, interfaz, estilos, marca oficial copiada sin editar, construcción y pruebas. El único cambio fuera de esa carpeta es permitir que Git registre `arena/` mediante `.gitignore`. No se alteraron `src/`, `docs/`, el manifiesto de Pages, los flujos de publicación ni las pruebas originales de Premium.

Trabajo local en `desarrollo`. Sin push, PR, merge ni publicación. La referencia local `main` se mantiene idéntica; no se ejecutaron operaciones de escritura sobre GitHub ni Pages. El identificador final de la entrega se registra junto al ZIP.

## Limitaciones y próxima revisión

- Es un prototipo de reglas. Faltan partidas humanas para evaluar equilibrio, ubicaciones y frecuencia de poderes; la simetría no garantiza acceso equivalente.
- La interfaz permite scroll vertical accesible, especialmente en móvil y horizontal, para inventarios y explicaciones. No se intentó reproducir todavía toda la compactación visual de Premium. No hay desbordamiento horizontal y el tamaño del tablero permanece estable durante las interacciones medidas.
- Los objetivos del tablero 9×9 necesitan evaluación física en Android/iOS. Tacto y movimiento reducido se probaron mediante emulación; no se afirma validación física.
- No se realizó una auditoría con lectores de pantalla reales. Hay etiquetas, foco de teclado, avisos y diálogos nativos.
- Se trabaja con una partida por pestaña; no existe coordinación entre pestañas abiertas simultáneamente. Un diario excesivamente grande o incompatible se rechaza sin sobrescritura silenciosa.
- No hay CPU, online, sonidos, alianzas, nuevas mecánicas ni acabado visual definitivo. No se transportó a Arena la secuencia audiovisual de Premium.
- No se incluye vídeo: falta el binario FFmpeg opcional de Playwright. Las evidencias son capturas reales y comprobaciones automatizadas.

Detenerse aquí para evaluación del prototipo; cualquier publicación o ampliación requiere autorización.
