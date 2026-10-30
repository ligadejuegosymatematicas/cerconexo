# M5-C — integración de estrategia y presentación

Candidata local del 30 de octubre de 2026. Rama y worktree independientes `m5c-integracion` / `Cerconexo_M5C`, desde M5-A publicado `0ce64e92c744e75cdcd9383b7ddb00270cd64df8`.

## Procedencia y cambios

- Presentación M5-A.1: `96c8a470c1c31f3ad552e0998bcdd02e72484954`, conservada en la PR #18. Se incorporan sus animaciones, barrera de interacción, mensajes, cancelación, corrección de foco y pruebas ya existentes, incluida la sincronización de Windows.
- Estrategia M5-B: `5789196f4da6572c27769b792c58d37b11ba34dd`. Evaluación y búsqueda se incorporan sin cambiar un byte.
- Integración localizada: unión de dependencias en `arena/build.py` y los manifiestos; dos pruebas añadidas al archivo existente `arena/tests/cpuPresentation.test.mjs`; este informe. No se crea otra suite de navegador ni se cambia CI.

`app.mjs` y `cpuPresentation.mjs` son idénticos a M5-A.1. `cpuStrategy.mjs` y `cpuEvaluation.mjs` son idénticos a M5-B. El controlador, Worker, sesión, configuración CPU y motores mantienen sus bytes de M5-A. Las versiones generadas en `docs/` se obtienen por el mecanismo del proyecto, sin copias manuales que eludan el generador.

Los únicos puntos compartidos eran el generador y los manifiestos: el Worker recibe evaluación y estrategia; la presentación solo se incluye en la interfaz. Se evitan reexportaciones duplicadas al construir el autónomo. El paquete público preparado localmente contiene 56 recursos, con cada módulo una sola vez.

No se modifican reglas, políticas, poderes, inventarios reglamentarios, puntuación, CPU Clásico, formatos de guardado, interfaz de selección ni dificultades. No se incorpora ningún cambio de M6. Las ramas originales, sus archivos y evidencias se conservan; no se opera sobre la PR #18, main, GitHub Actions o Pages.

## Ejecución integrada

El flujo sigue siendo: instantánea → decisión legal → validación de revisión/propietario → `ArenaSession.dispatch` → guardado oficial → presentación → siguiente decisión. La animación no escribe partidas ni vuelve a aplicar acciones. La identidad de solicitud, revisión y sesión sigue invalidando respuestas antiguas.

Durante la presentación se pausa el controlador y se bloquean acciones de juego, incluso si el turno oficial ya pasó al humano. Guía, inspección, Inicio, Nueva partida y recarga cancelan efectos; las acciones ya guardadas permanecen. Un descarte humano no lo decide la CPU.

Se conservan los tiempos M5-A.1: selección 260 ms; paso 360 ms; muro final 460 ms; poder 700 ms; recogida/descarte 850 ms; territorio 900 ms. Se muestra acción → recogida → territorio. Movimiento reducido omite efectos decorativos y conserva texto y tiempo de lectura. No se introduce una demora inicial en el cálculo ni se amplía su presupuesto.

## Estrategia: comparación con M5-B

Además de comprobar la identidad de los módulos, se ejecutaron ambos sobre 14 posiciones, con el mismo presupuesto nodal y reloj desactivado para aislar las decisiones. Coincidieron **las 42 acciones y los estados finales de las intervenciones**, incluyendo defensas, inventarios, poderes, reconquista, cierre y ambas políticas.

SHA-256 de estrategia: `068a8dd681c560e639db02e58aa0a253bf8089a1162687073a702fbe97d749ad`.

SHA-256 de evaluación: `bb84bf3f229a06fb02b4107fa1198307440799b5de56bc14fcafe518cf234afc`.

Se reutiliza como antecedente el torneo M5-B contra M5-A: 24 partidas, 23 victorias y un empate. No se presenta como un torneo nuevo de M5-C. La igualdad bajo nodos fijos demuestra conservación del algoritmo, no fuerza idéntica en cualquier dispositivo: con reloj real, la carga y la creación del Worker afectan la cantidad de nodos explorados.

## Verificación funcional

- **301/301 pruebas unitarias**, ejecutadas en serie, sin omisiones ni cambios de expectativas o tolerancias. Comando: `node --test --test-concurrency=1 tests/*.test.mjs arena/tests/*.test.mjs`.
- Las dos pruebas nuevas verifican un diario real con Demolición, recolección, Muro adicional, Salto y muro final; restauran el guardado después de cada acción. También integran estrategia, controlador y reloj de presentación para comprobar la pausa y el rechazo de respuestas después de cancelar o reemplazar la sesión.
- **Suite existente `arena/tests/cpu.browser.cjs` aprobada**: 18 grupos de comprobación más la matriz de siete resoluciones, sin errores JavaScript. Incluye secuencias con varios poderes, recogida, descarte CPU/humano, territorio, teclado/tacto, movimiento reducido, inspección, Guía, recarga y Nueva partida durante efectos. Comprueba también el autónomo con Worker Blob y respaldo sin Worker.
- Los fotogramas muestreados mantienen geometría y ausencia de scroll principal durante las secuencias verificadas. Tamaños de tablero: 778, 646, 478, 438, 358, 328 y 338 px, respectivamente en 1440×900, 1366×768, 1366×600, 1280×560, 390×844, 360×740 y 740×360. No se cambió CSS ni geometría.
- Se mantienen los **32 hashes protegidos** y las pruebas de compatibilidad de partidas anteriores. El motor Clásico conserva SHA-256 `ee7982394c38dbdee738f04bb7811590e70dc4d9d6e3b39bea44aac8844b3a90`; Arena, `4f4527c9ba3153f0c760def8e5b89f748a82b320a6e9df9592d9789be49fe158`.
- Paquete y extracción limpia: recursos idénticos a fuentes y reconstrucción idéntica de los tres HTML. No se ejecutan las otras 20 suites ni CI en esta entrega local; siguen siendo controles de una futura publicación.

### Incidencia de la primera ejecución unitaria

El primer lote concurrente de tres archivos obtuvo 35/36: `arena/tests/cpu.test.mjs:64` no alcanzó el resultado terminal esperado después de Muro adicional y muro. No se cambió código para satisfacerlo. El caso aislado aprobó en 128,75 ms; tres comparaciones alternadas por versión completaron el cierre en ambos módulos; la validación completa en serie también aprobó.

La estrategia es idéntica a M5-B y está limitada por reloj. Los tiempos del primer lote fueron muy superiores a los posteriores, lo que es compatible con un corte de búsqueda bajo carga, pero **no demuestra la causa exacta del fallo inicial**. El registro se conserva como una incidencia no reproducida en el diagnóstico localizado. No se afirma que esté resuelta ni se cambia la ejecución de CI para ocultarla.

## Rendimiento y límites

Se mantiene el presupuesto M5-B de 160 nodos / 90 ms; respaldo de 48 nodos / 32 ms. Son límites cooperativos comprobados entre operaciones, no tiempo real estricto.

En la matriz de aplicación se registraron siete respuestas de Worker: mediana 694,70 ms y máximo 820,40 ms, **incluida su creación y carga**. No son tiempos exclusivos de búsqueda ni percentiles representativos de Android.

Un perfil adicional, sobre tres posiciones con Worker/respaldo y renderizador normal/ralentizado cuatro veces, registró un máximo de **1.563,70 ms total** y **162,50 ms de decisión**, con pocos nodos explorados. Hubo intervalos entre fotogramas de hasta 210 ms en una muestra ralentizada; sin Worker se observó una decisión de 137,50 ms. Todas las acciones fueron legales. No se atribuyen automáticamente estos valores al juego ni se declaran aceptables para Android.

Se realizó una única comparación acotada adicional en el mismo Chromium, alternando M5-B/M5-C y el orden: ocho decisiones, dos posiciones. M5-B: 159,20–246,10 ms totales; M5-C: 188,90–251,90 ms. Decisiones de 85,80–91,80 ms. Ambas versiones eligieron la Demolición defensiva; la selección de ficha de apertura varió con el presupuesto efectivo en ambas. La muestra no demuestra una degradación sistemática causada por la integración, pero tampoco explica el perfil lento anterior.

No se altera estrategia, presupuesto, temporizadores o pruebas para mejorar esos números. Permanecen pendientes:

1. Android físico: fluidez, claridad de los tiempos y posibles congelamientos.
2. Variabilidad de creación del Worker y calidad cuando el presupuesto permite pocos nodos. El respaldo reducido puede ser estratégicamente inferior.
3. Linux/Chromium y controles integrales antes de publicar.
4. Incidencia histórica de fixtures Clásico `file://`, conservada en la línea M5-A.1: no se reabre su investigación ni se declara resuelta por las comprobaciones de Arena.

Recomendación: entregar M5-C para la evaluación física solicitada, **sin considerarla todavía aprobada para publicación**. No se implementan dificultades ni se avanza sobre M6.
