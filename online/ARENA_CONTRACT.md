# M6.4 — Contrato revisado antes de implementar

Base: `d3ccc84e4b3b91287124ed3419cb7ec294ac2bbe`. Alcance exclusivo: Arena 2 vs. 2, cuatro personas, una ficha por persona, por ficha, 600.000 ms por equipo. No despliegues ni cambios a servicios existentes.

## Diferencias reales frente al adaptador Clásico

1. `applyArena(state, action)` devuelve el estado oficial completo después de cada acción. No existe el borrador Clásico pendiente de aplicar al construir. Se persistirán `turn`, posiciones, `pending`, `resolution`, inventarios, poderes del tablero, oleadas y eventos juntos.
2. `legalArenaActions` devuelve vacío con descarte pendiente. `applyArena` admite entonces exclusivamente el descarte correcto, lo valida y continúa `settleArena`. El adaptador no reproduce capacidades, recolección ni resolución.
3. `settleArena` termina si no quedan regiones compartidas, y puede cerrar el turno si su actor deja de estar activo aunque la última acción no sea muro. El servidor debe leer el nuevo actor y `pending` después de **todas** las acciones, nunca exigir otro muro o incrementar turnos por su cuenta.
4. La decisión puede pertenecer a un propietario distinto del actor. Su asiento determina quién responde y `pending.team` determina el reloj. Al resolverla se vuelve a consultar el motor; puede aparecer otro descarte.
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
