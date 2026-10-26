# M5-A — CPU de Arena experimental

Base: M4.2 publicada `4e02097f632279e137d24fee4e2d9cd809461d4b`. Solo desarrollo, sin PR ni publicación.

## Contratos y arquitectura

El motor, la geometría, configuración experimental y ArenaSession conservan exactamente sus bytes protegidos. La CPU de Clásico tampoco cambia.

- `cpuStrategy.mjs`: consulta `legalArenaActions`, genera sucesores mediante `applyArena` y clasifica con `analyzeArena`. Para un descarte pendiente, el motor no incluye opciones en `legalArenaActions`: se enumeran los identificadores del inventario del propietario que indica `pending`; `applyArena` valida cada sucesor. No se calculan capacidades o territorios alternativos.
- `cpuWorker.mjs`: una instantánea y un identificador de solicitud; devuelve una acción atómica y la revisión. No accede a almacenamiento ni interfaz.
- `cpuController.mjs`: valida sesión, identidad del estado, revisión, equipo controlador, pausa y pertenencia al conjunto legal vigente. Solo entonces pide a la interfaz ejecutar `ArenaSession.dispatch`. Una respuesta antigua no se aplica. Inicio, inspección, diálogos, ocultación y nueva partida cancelan el Worker. La decisión de descarte pertenece a `pending.team`, aunque otro equipo haya provocado la pausa.
- `app.mjs`: la misma ruta de acciones humanas y CPU realiza confirmación, guardado, mensajes y presentación. Las superficies de acción humanas no aparecen cuando decide la CPU; navegación, guía e inspección permanecen disponibles.

Por equipo, cuando aún no hay actor se comparan ambas selecciones. Una vez elegido, la CPU conserva esa elección para evitar ciclos de selección sin ejecutar acciones. Esta es una decisión del jugador automático: el motor conserva la selección humana libre antes del compromiso.

## Estrategia y límites de cálculo

Búsqueda de haz de seis estados, hasta seis acciones de profundidad, 160 sucesores o aproximadamente 90 ms, lo que ocurra primero. Los sucesores se evalúan una vez. El presupuesto se comprueba entre acciones, no interrumpe una llamada del motor a mitad de ejecución. La duración puede superar ligeramente el presupuesto por la última evaluación y por planificación del sistema operativo.

La evaluación utiliza el resultado oficial, diferencia de puntos reversibles, movilidad, distancias abiertas a poderes y valor del inventario. Prefiere cierres completos de turno cuando dispone de ellos. Las pruebas tácticas verifican reconquista por Demolición, conquista por Salto y cierre mediante Muro adicional seguido de muro final. Puede volver a decidir tras cada poder: la profundidad de búsqueda no impone un límite de poderes por turno.

No hay niveles, minimax profundo ni afirmación de competitividad. No se exploran respuestas estratégicas del adversario en esta primera CPU. Los pesos son experimentales y no modifican las reglas.

## Worker y HTML autónomo

HTTP usa un Worker de módulo. El constructor habitual incluye el mismo motor y la misma estrategia en un Worker Blob para el HTML autónomo; no hay una implementación distinta de reglas. Si Worker no existe, falla o excede 1,6 s, la alternativa cede el hilo cada doce sucesores y limita su trabajo a 48 nodos, unos 32 ms y cuatro niveles. Un error de cálculo o respuesta ilegal conserva una acción legal determinista de respaldo. Un fallo de persistencia pausa la CPU y presenta un error: no continúa en bucle ni confirma una acción que no se pudo guardar.

## Persistencia compatible

El diario `cerconexo-arena-m3a-v1`, su esquema de versión 1 y sus comandos permanecen intactos. Se añade una clave independiente `cerconexo-arena-controller-v1`, con rival y equipo humano ligados a una identidad de contenido del diario. Esta identidad es un resumen de longitud y dos acumuladores de 32 bits: no es una credencial ni sustituye la validación del motor.

Los metadatos se escriben antes del diario, admitiendo la identidad actual y la anterior. Si la escritura oficial falla, se restaura el registro de configuración anterior; la identidad anterior también permite recuperar un diario previo diferente si esa restauración no pudo escribirse. Se prueba expresamente el reemplazo fallido de un diario inicial idéntico. La sesión solo actualiza su estado en memoria después de guardar. Las partidas antiguas sin metadatos coincidentes continúan como locales; cuatro equipos siempre es local. Un cambio de opciones sin confirmar no escribe nada. Revancha conserva la configuración anterior.

Si se borra o daña exclusivamente la clave del controlador, la partida sigue siendo recuperable como local; no se inventa una asignación CPU. Exportar solo un diario antiguo no transporta la configuración CPU. Guardados y preferencias de Clásico permanecen independientes.

## Validación reproducible

- Unitarias: `node --test tests/*.test.mjs arena/tests/*.test.mjs`.
- CPU específica: `node --test arena/tests/cpu.test.mjs`.
- Partidas: `node arena/scripts/simulate_cpu.mjs` (24 contra rival legal por semillas y ocho sesiones de autojuego determinista; las repeticiones de autojuego no son muestras estratégicas independientes).
- Navegador: `node arena/tests/cpu.browser.cjs`, reutilizando servidor y Playwright existentes. Forma parte del ejecutor histórico, sin omitir ninguna suite.
- Integridad y entrega: los constructores y verificadores normales del proyecto, incluidos los 32 hashes y extracción limpia.

Los informes medidos, capturas, proyecto y HTML autónomos se entregan en `entregas/M5A`. No se simula una prueba física: Android real queda pendiente de revisión del usuario. M5-B podrá estudiar adversario, calibración y rendimiento físico. No se implementan CPU de cuatro equipos, online ni nuevas reglas.
