# M6.4 — Contrato revisado antes de implementar

Base: `d3ccc84e4b3b91287124ed3419cb7ec294ac2bbe`. Alcance exclusivo: Arena 2 vs. 2, cuatro personas, una ficha por persona, por ficha, 600.000 ms por equipo. No despliegues ni cambios a servicios existentes.

## Diferencias reales frente al adaptador Clásico

1. `applyArena(state, action)` devuelve el estado oficial completo después de cada acción. No existe el borrador Clásico pendiente de aplicar al construir. Se persistirán `turn`, posiciones, `pending`, `resolution`, inventarios, poderes del tablero, oleadas y eventos juntos.
2. `legalArenaActions` devuelve vacío con descarte pendiente. `applyArena` admite entonces exclusivamente el descarte correcto, lo valida y continúa `settleArena`. El adaptador no reproduce capacidades, recolección ni resolución.
3. `settleArena` termina si no quedan regiones compartidas, y puede cerrar el turno si su actor deja de estar activo aunque la última acción no sea muro. El servidor debe leer el nuevo actor y `pending` después de **todas** las acciones, nunca exigir otro muro o incrementar turnos por su cuenta.
4. La decisión puede pertenecer a un propietario distinto del actor. Su asiento determina quién responde y `pending.team` determina el reloj. Al resolverla se vuelve a consultar el motor; puede aparecer otro descarte.
   En esta modalidad por ficha, el motor conserva capacidad de un poder por ficha incluso asegurada; no se inventa una reducción de capacidad ni un descarte rival al asegurarla. El caso rival se comprueba como decisión persistida para la arquitectura, sin afirmar que lo produce el reglamento normal de esta configuración.
5. Muro adicional y demolición no equivalen necesariamente a terminar turno. Saltos consumen pasos según el motor. Demolición puede reactivar fichas y modificar puntuaciones de inmediato. No se codifican excepciones alternativas en el servidor.

No se identificó una incompatibilidad que exija modificar motores, CPU o guardados locales. El adaptador añade autenticación, forma de mensaje, propiedad y ámbito de partida; la legalidad reglamentaria sigue en el motor oficial.

## Extensión acotada del servidor

- Nuevo `ruleset: arena-duo-online-v1`, solo en salas nuevas y con capacidad de servidor `ARENA_DUO_ENABLED=true`. Las sondas Arena M6.1 persistidas conservan su reglamento. Clásico conserva su adaptador y formatos.
- Comando único `arena.action`, parámetros `{matchId, action}`. Acciones oficiales permitidas: `move`, `wall`, `extraWall`, `demolition`, `jump`, `discard`. Campos exactos y coordenadas/tipos acotados; sin selección por equipo en esta entrega.
- Identidad desde sesión autenticada. Movimiento/poder/muro: solo asiento del actor. Descarte: solo asiento de `pending.owner`. Nunca se confía en equipo, actor, inventario, estado o reloj aportados por el cliente.
- Se conservan protocolo 1, revisión, recibos, transacción, cuenta atrás, sesiones y gracia existentes. `matchId` es obligatorio para Arena. Clientes anuncian `arena-duo-v1`; preparación e inicio/revancha requieren esa capacidad.
- Decisiones normales y de descarte tienen identidad estable: los pasos no repiten avisos; un nuevo descarte distingue propietario y opciones pendientes.
- Resultado territorial desde `game.over`, `winners` y `analyzeArena`. Resultado por tiempo como resultado de sala, sin falsificar `game.over`. Revancha unánime crea Arena oficial nueva y reinicia sus relojes, manteniendo historial e identidades.

## Presentación e aislamiento

Se reutilizan acceso, lobby, sesiones, continuidad, aviso de decisión, revancha, resultado, preferencias y estilos/componentes visuales existentes. La vista Arena presenta el tablero 9×9 con poderes e inspección oficial; envía intenciones y espera estado confirmado, sin aplicar jugadas localmente. No se extrae ni reescribe el controlador Local/CPU.

El servicio público actual no se modifica. El arranque local usa SQLite nuevo y configuración inyectada solo en la respuesta del servidor local. La capacidad Arena queda deshabilitada por defecto fuera de ese entorno. Arena 1 vs. 1 y cuatro equipos no se habilitan.

## Aceptación

Probar contra `applyArena` comando por comando; casos de poderes, descartes propios/rivales, aseguramiento sin muro, reactivación/reconquista, final inmediato, diez minutos, sesión recuperada, recibo perdido, revancha y motor/guardados/CPU/Clásico intactos. Después ejecutar la validación integral una vez preparada la candidata. Las pruebas locales automatizadas no acreditan cuatro dispositivos físicos ni una publicación HTTPS.

## Candidata local Arena 1 vs. 1

La rama parte de `9046525129a96eae4880b6a497ea166aa5972101`. La sala conserva el reglamento Arena y persiste la política elegida. Los asientos A y B controlan las dos fichas de su equipo. En turnos por ficha, cada ficha conserva su propio inventario. En turnos por equipo, el motor permite elegir ficha antes de comprometer la intervención y gestiona un inventario compartido. Seleccionar ficha mantiene el reloj y la identidad del aviso del turno. Cuando hay un descarte obligatorio, solo responde la persona que controla el inventario indicado y corre el reloj de ese equipo.

Los clientes anuncian `arena-1v1-v1` para actuar en salas de dos personas. Las salas de cuatro personas conservan `arena-duo-v1` y los turnos por ficha. La revancha mantiene las fichas, la política y el resultado anterior, y repone los diez minutos de cada equipo.

Para probar en Windows con las dependencias de `online` disponibles, ejecuta `node online/scripts/ux-local.mjs --arena-1v1` desde el worktree. Abre `http://127.0.0.1:8815/cerconexo/arena/`, elige **Online → Crear sala → 1 vs. 1** y usa un segundo navegador o perfil para unirte. El Worker y SQLite se ejecutan en loopback. La opción se activa en esta demostración local. La candidata de publicación también habilita el selector y requiere `ARENA_1V1_ENABLED=true` en el Worker público.

Las pruebas de navegador se ejecutan con `node online/scripts/arena-browser.mjs --1v1-piece` y `node online/scripts/arena-browser.mjs --1v1-team`. Cada partida se compara acción por acción con el motor oficial.

## Candidata local Arena de cuatro equipos

La base es `151800f1322b8f3d09ae676f5ea7f21406574e4f`. El modo usa `createArena({mode:'ffa',policy:'piece'})`, con las posiciones oficiales, el tablero de 81 casillas y los equipos A/B/C/D. Cada asiento controla su ficha y dispone de 300.000 ms. La configuración nueva tiene el reglamento `arena-ffa-online-v1` y requiere el cliente `arena-ffa-v1`. Las sondas FFA antiguas conservan su configuración.

La única transición nueva de reglas online es `eliminateByTime`. El servidor la ejecuta después de resolver el vencimiento de su reloj. Retira la ficha, inutiliza su inventario y limpia su decisión y recolección pendientes. Conserva muros, posiciones de supervivientes, poderes del tablero ya aceptados, intervenciones completadas y oleadas. La geometría oficial recalcula actividad y puntuación. El nuevo turno comienza con la siguiente ficha superviviente activa y su tiempo intacto en el momento de habilitarlo. La eliminación no completa una intervención ni genera una oleada.

En la política oficial por ficha, cada inventario tiene capacidad uno. El descarte normal nace de la recolección de la ficha que está actuando. Por ello, el vencimiento durante un descarte elimina a ese propietario y no exige una respuesta de un jugador retirado. Las acciones aceptadas anteriormente permanecen y el poder pendiente no vuelve al tablero. Una ficha asegurada conserva su condición territorial de superviviente hasta que se cumpla una condición final.

Si queda un equipo, gana como último superviviente. Si la retirada elimina las regiones compartidas, el resultado territorial se toma de la geometría. La clasificación sigue lo acordado para M6. Los supervivientes van primero, ordenados por puntuación final con puestos compartidos en los empates. Después se sitúan los eliminados en orden inverso de eliminación. El registro conserva el territorio que tenían al ser retirados. Una reconexión permite observar y aceptar una futura revancha, pero no actuar ni reactivar una ficha retirada. La revancha exige los cuatro votos y restaura el inicio oficial, sus fichas y los cuatro relojes de cinco minutos.

Las oleadas mantienen la simetría rotacional y los tamaños oficiales del modo FFA, incluso después de una eliminación. No se cambian los cálculos de regiones, capacidades, poderes ni aseguramientos del motor local.

Para probar la candidata, ejecuta `node online/scripts/ux-local.mjs --arena-ffa` desde el worktree. Abre `http://127.0.0.1:8815/cerconexo/arena/`, elige Online, crea una sala y selecciona el formato de cuatro equipos. Abre la invitación en otros tres perfiles o navegadores. La configuración de prueba se sirve solo en loopback con SQLite local. La capacidad pública de cuatro equipos queda deshabilitada.

La prueba `node online/scripts/arena-browser.mjs --ffa` compara dos partidas completas con el motor y observa una tercera hasta tres vencimientos reales, unos quince minutos. También comprueba las revanchas, la inspección y la recuperación del eliminado. `node online/scripts/arena-network.mjs --ffa` reinicia el Worker durante un paso y durante un descarte, y comprueba los recibos repetidos.
