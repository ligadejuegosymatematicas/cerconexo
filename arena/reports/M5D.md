# CERCONEXO M5-D — Corrección táctica localizada

Base: M5-C publicada, `67b07908c486ab72d5ef3e85f53659f0b881fac2`.
Rama y worktree independientes: `m5d-tactica` / `Cerconexo_M5D`.
Entrega local para revisión; sin PR, push, merge ni publicación. No interviene M6.

## Resultado principal

M5-D encuentra el cierre de nueve casillas que M5-C omitía. Ejecuta legalmente
Muro adicional hacia (5,6) y muro final hacia (6,5), desde (5,5). Las nueve
casillas permanecen propias frente a las 66 respuestas completas del siguiente
turno rival enumeradas con el motor. La prueba también cubre ambos equipos,
ambas políticas y las cuatro orientaciones del tablero.

Esto demuestra una corrección táctica en el horizonte examinado, no una garantía
de victoria de toda la partida ni de optimalidad estratégica general.

## Mecanismo

Se modifica únicamente la estrategia de Arena (`arena/src/cpuStrategy.mjs`),
además de su copia generada en `docs/`. La función de evaluación no cambia.

1. Antes de gastar el presupuesto en evaluar todas las alternativas intermedias,
   se sondean muros legales y combinaciones Muro adicional → muro final. Cada
   sucesor se obtiene de `applyArena` y su territorio de `analyzeArena`.
2. El sondeo usa la clasificación oficial para detectar mejora del margen propio
   menos rival. No inventa puntos para una región aún abierta ni premia construir
   más muros. Un resultado terminal se valora con el evaluador original.
3. Los resultados favorables y terminales reciben la evaluación completa. El
   resto continúa por la búsqueda ordinaria cuando corresponde. Los estados
   sondeados se reutilizan; no se aplican dos veces al contabilizar nodos.
4. Se reservan hasta dos consecuencias territoriales distintas, identificadas por
   las casillas de las regiones obtenidas. Así, variantes de un mismo poder no
   desplazan todos los objetivos espaciales alternativos. La representación no
   obliga a elegirlas: siguen sometidas al evaluador y a las respuestas rivales.

Límites conservados: **160 nodos, 90 ms cooperativos, seis acciones, haz seis**.
El sondeo tiene un máximo de 24 muros de continuación, dentro de la misma cuota
propia ordinaria (72 nodos con la configuración normal). No se suman 24 nodos al
presupuesto global. No se amplía la profundidad ni se cambian pesos.

El sondeo se inicia antes del corte blando y completa la pequeña familia de
muros del prefijo iniciado, respetando nodos y reloj global. En la validación se
detectó que un sondeo situado después de toda la capa podía llegar demasiado
tarde en un Worker frío; esa implementación preliminar se corrigió. Una prueba
con reloj simulado conserva la regresión sin introducir pausas arbitrarias.

## Comparación táctica M5-C / M5-D

Se conservan los 13 escenarios de la auditoría y se agregan dos controles: regalar
nueve casillas al rival y un autoaseguramiento pequeño que permite una derrota.
La referencia M5-C es su fuente exacta congelada, con SHA-256 comprobado. Las dos
versiones utilizan los mismos motores, posiciones, pesos y límites de nodos.

Para aislar la estrategia se desactiva únicamente el corte de reloj del programa
de comparación (`now=0`); el juego conserva su reloj. Se replantea cada acción
mediante el contrato normal y se verifica su legalidad.

| Caso | M5-C | M5-D |
|---|---|---|
| Nueve casillas con dos muros | Se aleja; A=0 | Cierra; A=9 |
| Respuestas al caso anterior | 66 secuencias, margen 0 | 66 secuencias, margen +9 |
| Cierre de nueve inmediato / con un paso | Obtiene nueve | Conservado |
| Dos variantes de cierre terminal | Gana 75–6 | Gana 76–5 |
| Defensa de puente, por ficha y por equipo | Demolición defensiva | Conservada |
| Reconexión por Demolición / Salto a región vacía | Decisiones correctas del caso | Conservadas |
| Asegurar una casilla razonablemente | Obtiene una | Conservado, sin penalización universal |
| Asegurar una casilla perdiendo la defensa | Evita la derrota inmediata | Conservado; el cierre descartado sí permite una respuesta ganadora comprobada |
| Cierre que regalaría nueve al rival | No lo realiza | Tampoco lo realiza |

Tres resultados territoriales mejoran y doce se conservan en estas quince
posiciones. No se utiliza un porcentaje de victorias contra rivales aleatorios
como prueba de superioridad estratégica.

Los datos por decisión (acciones, nodos, puntuaciones y respuestas) están en
`arena/reports/m5d/comparison.json`. El generador es
`node arena/scripts/compare_tactics.mjs`.

## Rendimiento comparado

Windows, Node v24, ejecución secuencial, calentamiento de una decisión por caso
y versión, ocho repeticiones por posición con orden alternado. **120 decisiones
medidas por versión**, mismo corte real de 90 ms; no incluye animaciones ni
arranque del Worker. Percentiles por rango más próximo.

| Medida | M5-C | M5-D |
|---|---:|---:|
| Mediana | 90,41 ms | 90,33 ms |
| Percentil 95 | 91,12 ms | 91,05 ms |
| Máximo | 92,80 ms | 91,68 ms |
| Mediana de nodos | 106 | 97 |
| Máximo de nodos observado | 157 | 155 |

No se observa un aumento considerable de tiempo en esta muestra. Que ambos
tiempos se aproximen al límite no significa que realicen idéntico trabajo:
M5-D redistribuye el esfuerzo y evita evaluar heurísticamente muchos sondeos
sin ganancia. Los pequeños excesos sobre 90 ms corresponden a un corte
cooperativo entre operaciones, no a un temporizador capaz de interrumpir una
operación JavaScript a mitad de ejecución.

Con reloj real, las ocho decisiones iniciales del caso de nueve casillas de
M5-D eligen uno de los dos Muro adicional correctos; M5-C no lo hace en ninguna.
Eso valida la entrada al cierre, además de la secuencia completa determinista.

El Worker real completó la secuencia en seis vistas: por ficha y equipo en
390×844, 740×360 y 1366×600, con presentación publicada, guardado, recarga e
inspección. En el arranque más lento observado, cálculo y arranque/transporte
fueron distintos: unos 94 ms de cálculo frente a unos 970 ms de respuesta total.
Es una observación de escritorio con emulación, no una medida física de Android
ni una comparación de arranque entre versiones. No se cambió el controlador,
sus plazos ni las animaciones para disimularla.

## Verificación y entrega

Los resultados finales de pruebas, simulaciones y empaquetado se acompañan en
el archivo `VALIDACION.json` de esta entrega. Se mantienen sin cambios todas las
pruebas históricas y la infraestructura de CI.

- **311 pruebas automatizadas aprobadas**, sin omisiones ni fallos en la
  validación final. Un primer ensayo de Pages fue bloqueado por `EACCES` al
  conectar con localhost; aprobó al permitir exclusivamente ese acceso y después
  la batería final completa también aprobó. No se cambió esa prueba.
- **Dos suites históricas aprobadas**: `arena/tests/cpu.browser.cjs` y
  `tests/unified.browser.cjs`, además de seis vistas tácticas y dos ensayos del
  HTML autónomo con/sin Worker. Se comprobaron las siete resoluciones históricas,
  teclado/tacto, animaciones, descartes, inspección y guardados anteriores.
- **32 simulaciones completas**, cero errores/bloqueos y cero acciones ilegales.
  Son ambas políticas, CPU A/B y ocho semillas por combinación; incluyen ocho
  partidas de autojuego. Las 2.283 decisiones CPU dieron mediana 38,76 ms,
  percentil 95 72,94 ms y máximo 91,65 ms. Esta muestra más variada incluye muchos
  finales sencillos; no se mezcla con la comparación controlada anterior.
- **32 hashes protegidos intactos**. La evaluación de Arena también conserva su
  SHA-256 de M5-C, verificado por la referencia de pruebas.

No se ejecutaron las otras 19 suites históricas de navegador ni CI remoto en
esta revisión localizada. Se conserva su código y obligatoriedad antes de
publicar; no se declara completada la validación Linux/Chromium.

- Regresiones específicas: nueve casillas, alternativas rivales completas,
  ambos equipos/políticas, orientación, cierres perjudiciales, regiones pequeñas,
  límites de nodos, reloj, estado de entrada inmutable y referencia exacta.
- Regresiones anteriores: puentes, descartes, Demolición, Salto, conservación de
  poderes, controladores, persistencia, puntuación y motores.
- HTML autónomo: `offline/Cerconexo_Arena.html`; se entrega junto con Inicio y
  Clásico para mantener los enlaces de navegación.
- Los 32 archivos protegidos se verifican con el control existente.
- No se modifican evaluación, concentración futura de turnos, reglas, motores,
  inventarios, formatos de guardado, UI ni animaciones.

## Limitaciones y recomendación

El sondeo protege cierres cortos con una continuación de muro; no enumera todas
las cadenas posibles de movimientos y varios poderes ni todos los turnos del
rival. El reloj puede limitar la cobertura, especialmente bajo carga extrema o
con la alternativa sin Worker de presupuesto menor. Siempre queda una acción
legal de respaldo; no existe una garantía táctica universal con tiempo finito.

No se ha añadido valoración de concentración futura B1/B2, nuevas dificultades
ni otros cambios estratégicos de largo plazo. Tampoco se declara resuelto ningún
fallo histórico de `file://`.

La mejora demostrada justifica preparar esta candidata para revisión física en
Android. Esa comprobación, la calibración amplia con jugadores y Linux/Chromium
en CI quedan pendientes antes de considerar una publicación. Esta entrega no
publica ni inicia nuevas etapas.
