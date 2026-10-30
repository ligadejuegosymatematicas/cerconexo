# M5-B — primera mejora estratégica de la CPU Arena

Entrega local del 29 de octubre de 2026. Rama `m5b-estrategia`, creada en un worktree independiente desde M5-A publicado, `0ce64e92c744e75cdcd9383b7ddb00270cd64df8`. No incorpora M5-A.1. No crea PR, no ejecuta CI ni publica.

## Resultado y alcance

Se añadió anticipación selectiva de la siguiente intervención rival y una evaluación más contextual de territorio e inventarios. En la comparación determinista con M5-A se completaron 24 partidas: **23 victorias, un empate y ninguna derrota para M5-B**, sin acciones ilegales ni bloqueos. El resultado justifica continuar probando esta estrategia; no demuestra fuerza equivalente a Clásico ni garantiza buen juego contra personas.

No se implementaron dificultades, CPU para cuatro equipos, mecánicas ni cambios de interfaz. Los motores, reglas, controlador, Worker, sesión, formatos de guardado, CPU Clásico y animaciones conservan sus bytes anteriores. Los 32 archivos protegidos mantienen sus hashes. La presentación sigue siendo la de M5-A, sin las animaciones pendientes de la PR #18.

## Debilidades comprobadas de M5-A

La referencia exacta está en `arena/tests/reference/cpuStrategy-m5a.mjs.txt`, con SHA-256 `c04f64d358b1c539ff066121a41885ea91022e8a5289254c1eaa40f82419f451`. Las comparaciones importan esta estrategia con el mismo motor oficial; no reproducen las reglas en otro motor.

1. **Profundidad aparente frente a anticipación real.** M5-A explora hasta seis acciones propias con haz de seis y 160 nodos/90 ms. Deja de expandir al terminar la intervención o aparecer una decisión ajena. Por tanto, no examina la respuesta rival: seis acciones no equivalen a seis turnos. En una posición con regiones de 36 y 45 casillas conectadas por una única abertura, mueve y construye sin evitar que el rival cierre y gane inmediatamente. El fallo se conserva incluso con 1.600 nodos, profundidad ocho y haz de doce. Aumentar solamente la búsqueda propia no lo corrige.
2. **Descarte guiado por valores fijos.** Con la misma amenaza y un inventario excedido, conserva Muro adicional y descarta Demolición, necesaria para abrir una segunda conexión. Termina permitiendo la derrota inmediata. Se reproduce tanto en inventario individual como compartido.
3. **Utilidad de inventarios demasiado uniforme.** La evaluación anterior valora igual un poder retenido por una ficha asegurada y uno utilizable por una ficha activa, y suma duplicados sin matices. Esto se comprueba directamente sobre sus rasgos de evaluación; no implica que cada inventario de ese tipo produzca una mala jugada.

Los casos de defensa se reflejan entre A/B y ambas políticas. Son variantes de un mismo patrón, no cuatro descubrimientos independientes. La comprobación externa de las respuestas enumera acciones oficiales y señala si agota el horizonte: en los casos defensivos entregados completa la enumeración del siguiente turno sin encontrar una victoria rival tras la secuencia M5-B.

Los controles de Salto que asegura una casilla, Demolición que anula puntos rivales y cierre ganador 42–39 ya eran acertados en M5-A y siguen acertados. La posición de respuesta a un paso también la resuelven ambas versiones. No se presentan como mejoras nuevas.

## Implementación

### Evaluación separada

`arena/src/cpuEvaluation.mjs` obtiene la puntuación y clasificación mediante `analyzeArena`. Conserva el predominio del resultado terminal y de la diferencia territorial oficial. Añade:

- Acceso potencial de fichas activas a las casillas compartidas, utilizando `arenaDistances`, con peso pequeño.
- Utilidad inmediata de poderes según las fichas que realmente pueden utilizar el inventario, menor valor operativo de los poderes retenidos y utilidad marginal decreciente de duplicados.
- Exposición estimada de territorios exclusivos ante un rival activo con Demolición o Salto adyacente.
- Movilidad y acceso a casillas especiales, conservando los rasgos anteriores.

Estos valores son **estimaciones estratégicas**, no puntos adicionales. Nunca se escriben en el marcador ni en el guardado. Las distancias del grafo no incorporan el bloqueo temporal de otras fichas: pueden ser optimistas. Toda acción posterior sigue necesitando validación oficial.

### Búsqueda selectiva de dos intervenciones

`arena/src/cpuStrategy.mjs` conserva sus interfaces y el presupuesto público: **160 nodos, 90 ms, profundidad seis y haz seis**. Reserva aproximadamente un 45 % del trabajo para planes propios y el resto para respuestas. Mantiene hasta seis alternativas diversas, incluyendo planes con poderes o entrada en territorio anteriormente rival, para no descartarlos solo por su coste inmediato.

Cada sucesor se obtiene con `applyArena`; las acciones proceden del adaptador existente de `legalArenaActions`. La propagación de valores maximiza o minimiza según el propietario real de cada decisión, incluidos descartes. La sesión y el controlador existentes siguen decidiendo quién puede actuar: la CPU no ejecuta decisiones humanas.

Se priorizan cierres rivales, orientando su orden mediante distancias oficiales del grafo. El horizonte llega al final de la intervención propia y a la siguiente rival, con expansión selectiva de anchura limitada. **No es minimax exhaustivo ni una garantía de defensa perfecta**. Una respuesta no expandida puede quedar fuera del análisis. Si no hay tiempo, conserva una acción legal determinista.

Durante el desarrollo, una poda inicial descartaba la continuación que entraba en una región después de demolerla. La prueba estratégica original detectó el retroceso; se conservaron las alternativas de invasión y de uso de poderes sin cambiar esa prueba. Otro ensayo en un Worker recién creado mostró que la cuota blanda podía cortar un plan defensivo antes de su muro final. Se permite completar una pared del plan con poder ya explorado, siempre dentro de los límites globales. El caso pasó de cerrar un muro inadecuado a demoler la conexión defensiva.

El límite de tiempo se comprueba entre acciones oficiales. No es tiempo real estricto: una evaluación, una acción o la planificación del sistema puede sobrepasarlo ligeramente. El respaldo existente sigue limitado a 48 nodos/32 ms, profundidad cuatro y haz tres, cediendo periódicamente el hilo. No se cambió el controlador.

## Comparación reproducible

Se prepararon 14 posiciones: defensas reflejadas, descartes individuales/compartidos, respuesta con desplazamiento, Salto, reconquista, cierre terminal, conservación de un poder, dos poderes disponibles y aperturas de ambas políticas. Fixtures, alternativas y sucesores completos quedan en los JSON de entrega.

Para las partidas, cada semilla genera cuatro intervenciones iniciales legales. Desde **exactamente ese mismo estado** se enfrentan las dos estrategias, intercambiando A/B. Se usan las mismas reglas, acciones y presupuestos máximos; no se otorgan poderes ni turnos adicionales.

| Ensayo | Partidas / estados iniciales únicos | M5-B: gana / empata / pierde | Diferencia territorial media | Ilegales / errores / bloqueos |
|---|---:|---:|---:|---:|
| Nodos fijos, seis semillas por política, lados intercambiados | 24 / 12 | 23 / 1 / 0 | +53,46 | 0 / 0 / 0 |
| Reloj real, dos semillas por política, lados intercambiados | 8 / 4 | 8 / 0 / 0 | +52,75 | 0 / 0 / 0 |

Por ficha: 12 victorias en 12; por equipo: 11 victorias y un empate en 12, en el ensayo nodal. Las ocho partidas con reloj reutilizan cuatro de los doce estados anteriores: son una comprobación del presupuesto temporal, **no una muestra independiente adicional**.

El ensayo nodal desactiva expresamente el corte por reloj para aislar la elección estratégica y obtener decisiones reproducibles. Ambas versiones tienen el mismo tope de 160 sucesores; M5-B suele aprovechar más de ellos y cada evaluación cuesta más. La mejora tampoco equivale a igual trabajo de CPU. El complemento con reloj real comprueba que se mantiene en esta muestra con el límite de 90 ms. Hay selección de posiciones y muestra pequeña; hace falta un conjunto reservado, rivales diferentes y partidas humanas antes de calibrar fuerza o dificultades.

Comandos desde la raíz del proyecto:

```powershell
node --test arena/tests/cpu.test.mjs arena/tests/cpu-strategy.test.mjs
node arena/scripts/compare_strategy.mjs
$env:M5B_CLOCK='real'
$env:M5B_SEEDS='2'
node arena/scripts/compare_strategy.mjs --games-only
```

Los resultados se escriben en `validation/m5b/`. Para repetir el ensayo nodal en la misma consola, quitar primero las variables `M5B_CLOCK` y `M5B_SEEDS`.

## Rendimiento medido

Windows, Node 24.20.0; tiempos en milisegundos por decisión, sin animaciones ni controlador:

| Ensayo / estrategia | Decisiones | Mediana | P95 | P99 | Máximo |
|---|---:|---:|---:|---:|---:|
| Nodos fijos — M5-A | 1.311 | 9,58 | 34,87 | 52,31 | 70,80 |
| Nodos fijos — M5-B | 1.376 | 36,95 | 67,03 | 82,92 | 116,87 |
| Reloj real — M5-A | 442 | 10,65 | 38,31 | 49,25 | 63,38 |
| Reloj real — M5-B | 460 | 36,52 | 64,89 | 79,87 | 89,42 |

La calidad mejoró con coste apreciable: aproximadamente 1,7 veces el P95 de M5-A en el complemento temporal. En un ensayo preliminar con el reloj desactivado apareció un máximo aislado de 3,506 s sin atribución suficiente de CPU/planificador. Se conserva el registro y no se declara explicada su causa. No apareció en la comparación final: máximo nodal 116,87 ms y temporal 89,42 ms. El registro nodal final más lento consumió unos 109 ms de CPU.

El perfil HTTP de Chromium realiza doce trabajos después de cargar la página: tres posiciones, Worker/respaldo y renderizador normal/ralentizado cuatro veces. Con Worker: decisiones de 57,1–90,4 ms, tiempo total incluida su creación de 108,6–173,6 ms y máximo intervalo observado entre fotogramas de 18,5 ms durante esos trabajos. La ralentización del renderizador no demuestra una ralentización equivalente del Worker ni representa un Android físico.

Sin Worker, los trabajos medidos duran 14,0–37,2 ms. En el caso defensivo con ralentización cuatro veces, el presupuesto reducido solo explora doce nodos y elige un muro en lugar de la Demolición defensiva: **la mejora de defensa no está garantizada en ese respaldo**. Es legal y termina, pero estratégicamente es inferior. Debe revisarse en Android antes de considerar una publicación.

El sondeo de aplicación completa registra también intervalos de arranque y navegación; sus máximos no se atribuyen al cálculo de la CPU. El perfil anterior separa expresamente esa fase. Estos ensayos no equivalen a una auditoría de rendimiento prolongada.

## Verificación y conservación

- **294/294 pruebas unitarias**: 281 de la base M5-A y 13 nuevas, sin omitir ni debilitar pruebas históricas. Incluyen guardados anteriores, decisiones humanas, respuestas obsoletas, legalidad, presupuesto y cancelación.
- Seis flujos HTTP localizados en Chromium: ambas políticas, humano A/B con Worker y respaldo sin Worker; continuación y recarga. Sin errores JavaScript. Tablero 358 × 358 en 390 × 844 y 338 × 338 en 740 × 360, sin cambio entre entrada y salida de la intervención observada. Esta medición de extremos no certifica por sí sola todos los estados transitorios.
- Se mantienen los 32 hashes protegidos. No se modifican motores, políticas, inventarios reglamentarios, formatos de guardado ni archivos de interfaz.
- El empaquetado añade únicamente el módulo de evaluación al conjunto público: 55 recursos. El generador autónomo lo incorpora también al Worker Blob. El manifiesto del proyecto incluye los nuevos módulos, fixtures, referencia, comparación e informe.
- Extracción limpia y reconstrucción idéntica de los tres HTML verificadas en la entrega local. El autónomo de Arena se comprueba por HTTP con Worker Blob; no se reabre el diagnóstico `file://`.
- No se ejecutan las 21 suites históricas de navegador ni GitHub Actions en esta evaluación inicial. Tampoco se modifican esas suites. Quedan como controles obligatorios de una futura candidata de publicación, junto con Linux/Chromium y Android físico.

La línea `desarrollo` y la PR #18 permanecen en `96c8a47`; no se incorporan sus cambios ni se realizan reintentos de CI. La incidencia histórica de fixtures `file://` sigue documentada en su línea de trabajo y no se declara resuelta.

## Prioridades siguientes y futuras dificultades

| Prioridad | Trabajo propuesto | Impacto esperado / coste |
|---|---|---|
| Alta | Probar en Android físico Worker frío, turnos con varios poderes y respaldo | Confirma fluidez y cobertura real; no requiere cambiar reglas |
| Alta | Validar contra posiciones reservadas y humanos, separando ambos equipos | Reduce el riesgo de optimizar solo para M5-A y los fixtures conocidos |
| Alta | Mejorar cobertura de respuestas tácticas con el mismo presupuesto | Evitar cierres no examinados; coste moderado, medir antes de ampliar |
| Media | Reutilizar análisis y estados equivalentes sin alterar la semántica | Reducir coste por nodo; exige claves que incluyan turno, poderes y decisiones pendientes |
| Media | Afinar distancias, exposición y valor de inventarios con ejemplos nuevos | Mejor reconquista y conservación; sin confundir potencial con puntos reales |

Para futuras dificultades: una base sencilla puede conservar la evaluación territorial y comprobaciones de amenazas inmediatas; una intermedia puede usar la búsqueda selectiva actual; una avanzada necesitaría más cobertura útil y evaluación mejor validada, preferentemente mediante reutilización y profundidad progresiva antes de aumentar tiempo. No se recomienda introducir errores deliberados ni diferenciar niveles solo por velocidad, consumo de poderes o etiquetas. Ningún nivel está implementado ni calibrado en esta entrega.

Recomendación: **entregar esta primera estrategia para revisión y prueba física**, sin publicar todavía. Mantener separadas M5-B y M5-A.1 hasta decidir expresamente cómo integrar estrategia y presentación.
