# Candidata de integración M5-D + M6 — Clásico Online

Preparación del 31 de octubre de 2026, hora de Chile; evidencias con marcas UTC del 1 de noviembre. Rama independiente `m6-beta-integracion`, worktree `Cerconexo_M6_Beta`. Base exacta: `cd22390f9571e6b6f03a43b84922a825ec823def` (M5-D, PR #20). `origin/main` se comprobó por lectura y coincide con esa base. Las referencias locales preexistentes `main` y `desarrollo` se mantienen sin mover.

La integración parte de M5-D y añade selectivamente el trabajo validado de M6.2.2. No sustituye el árbol público por el árbol antiguo de M6. El código M6 procede de la rama `m6-salas-conexiones`, conservada en `b1e39dcca2c0d1208d1fd05ac0eb46900cf119b1`, posterior a la candidata del piloto `49b399d`. No se ha hecho push, creado PR, fusionado ni publicado Pages.

## Comportamiento integrado

- Portada de dos modalidades: Clásico y Arena.
- Clásico, dentro de Nueva partida: Local, Contra CPU y Online. Online admite dos o cuatro participantes y las políticas por ficha y por equipo. En cuatro personas por equipo, la primera selección válida reserva la ficha hasta construir el muro; la selección simultánea rival se rechaza por revisión obsoleta.
- Se conservan salas, invitación sin credenciales, control individual, pasos irreversibles, muros, puntuación, final territorial, reloj compartido de ocho minutos, gracia, recuperación y recibos idempotentes.
- Aviso de turno, configuración háptica opcional, inspección de solo lectura y revancha unánime de todos los participantes, con cuenta atrás y resultados anteriores separados.
- Arena conserva su código M5-D, estrategia CPU, animaciones y aviso de descarte obligatorio. Online figura pendiente y deshabilitado. No se implementa Arena Online.
- Los guardados Local/CPU, sus formatos y los motores oficiales no cambian. El HTML autónomo conserva Local/CPU; el acceso Online pertenece al paquete web.

Los 50 archivos canónicos de `src/` y `arena/src/` son idénticos byte por byte a M5-D. Los 32 hashes protegidos pasan. Los cambios de integración se limitan al selector HTML, recursos online nuevos, generación de paquetes, comprobaciones y documentación.

## Validación

| Comprobación | Resultado |
|---|---|
| M5-D limpio antes de integrar | 311/311 pruebas |
| M5-D integrado | 311/311, sin omitir ni saltar pruebas |
| Pruebas específicas adicionales de M5-D | 30/30 |
| Núcleo online, sesiones, relojes, políticas, compatibilidad y seguridad | 98/98 |
| Suites históricas de navegador | 21/21 |
| Auditoría de almacenamiento phase2b y phase3a | 2/2 adicionales |
| Recuperación autónoma M4.2 | 4 perfiles/casos, todos correctos |
| Simulación CPU Arena | 32 partidas; cero errores y acciones ilegales |
| Integridad | 32/32 hashes; 50 módulos canónicos idénticos |
| Pages | 69 recursos exactos y rutas bajo `/cerconexo/` |
| Producto móvil/escritorio | Local, CPU, Online y navegación correctos; cero errores JS o recursos fallidos |
| Seguridad real HTTPS/WSS | 8 comprobaciones correctas |
| Empaquetado | Tres ZIP, inventario público exacto y extracción limpia con reconstrucción y regresión |

### Diferencia entre 281 y 311

La regresión de M6.2.2 se ejecutó sobre su base histórica M5-A y contenía 281 pruebas. M5-D añade exactamente 30 en `arena/tests/cpu-strategy.test.mjs`, `arena/tests/cpu-tactics.test.mjs` y `arena/tests/cpuPresentation.test.mjs`. Esta candidata conserva y ejecuta las 311. Las 98 online se suman a ellas; no las reemplazan. El workflow conserva las 21 suites y añade las pruebas online con dependencias de desarrollo fijadas.

Dos suites antiguas requirieron adaptar su expectativa al tercer botón y mantener único el selector de política de turnos; se conservaron sus comprobaciones de accesibilidad, teclado y tamaño táctil. No se eliminó ninguna suite.

### Partidas con servidor real

| Participantes | Política | Turnos completos | Resultado territorial A–B | Recuperación y revancha |
|---|---|---:|---|---|
| 2 | Por ficha | 32 | 34–7; 8 casillas vacías | Correctas |
| 2 | Por equipo | 25 | 3–46 | Correctas |
| 4 | Por ficha | 32 | 34–7; 8 casillas vacías | Correctas |
| 4 | Por equipo | 25 | 3–46 | Correctas, incluida selección simultánea |

Se comparó cada estado con el motor oficial: tablero, recorrido parcial, muros y puntuaciones. Se recorrieron jugadas de cero, uno y dos pasos, se recargó durante un paso, se reconectó la misma identidad y se reenvió el mismo `actionId`. No se aplicaron duplicados ni acciones ilegales, ni se devolvió tiempo consumido. Todas las vistas convergieron. La inspección no envió comandos y las cuatro configuraciones conservaron identidades y resultados al jugar la revancha.

Una prueba adicional mantuvo cuatro navegadores conectados ocho minutos reales: final por tiempo a los 479.928 ms desde la medición posterior al inicio, victoria B, reloj A en cero, reloj B en ocho minutos, recorrido `[8,9]` conservado y recarga final correcta. La primera ejecución detectó una aserción obsoleta que contaba los botones de inspección como acciones; se corrigió el test y la ejecución completa posterior pasó. No fue necesario cambiar la política de reloj ni el juego.

Las solicitudes HTTP y los WebSockets de estas pruebas fueron reales hacia Cloudflare. La interfaz candidata se sirvió solo dentro de los navegadores de prueba mediante interceptación de su paquete `docs/`, con URL y `Origin` `https://ligadejuegosymatematicas.github.io/cerconexo/`. Esto verifica prefijos, recursos y CORS sin publicar sobre Pages. No equivale a haber actualizado ni validado físicamente el despliegue real de GitHub Pages.

La comprobación de persistencia adicional prepara un recorrido parcial en una sala del backend nuevo, actualiza ese mismo backend sin cambiar namespaces y recupera sus cuatro identidades y el recibo anterior. El resultado final y la versión exacta del servidor quedan en `online/evidence/beta-persistence-recovered.json` y `beta-staging-review.json`. No se utiliza ninguna sala del piloto para esta comprobación.

## Backend de pruebas independiente

API: `https://cerconexo-m6-beta-staging.cerconexo-piloto-h89.workers.dev`.

No aloja el frontend y no es una beta abierta. La creación normal responde `BETA_NOT_OPEN`. La admisión de las pruebas utiliza un secreto nuevo instalado mediante Wrangler y una credencial guardada únicamente bajo `online/.state/`, fuera de Git, paquetes públicos y registros. El arnés la añade desde Node a la creación; nunca se incorpora al frontend ni a su almacenamiento. Las credenciales personales siguen generándose criptográficamente por participante; el servidor persiste hashes y no permite tomar una ficha con la invitación.

| Binding | Namespace SQLite |
|---|---|
| ROOMS / Room | `c9c2becaf9474295ac9325af4b383426` |
| ADMISSION / AdmissionGate | `d580684fee7d4733a8bda38f44123599` |

Estos namespaces difieren de ambos namespaces del piloto. Su único secreto de servicio es `TEST_ADMISSION_HASH`; no contiene secretos del piloto. CORS se limita al origen exacto de GitHub Pages, sin comodín, cookies ni loopback en la configuración final. WSS comprueba también `Origin`; los permisos siguen dependiendo de la autenticación y del estado autoritativo, no de CORS.

Se validaron origen ajeno, falta de sesión, expiración de autenticación WSS, cuerpo excesivo, credenciales en query, admisión de operador incorrecta, creación pública cerrada y límite de comandos. Se muestran mensajes de capacidad claros, incluso si el proveedor responde HTML en lugar de JSON. Las herramientas heredadas que podían desplegar el piloto se retiraron de esta candidata; las comprobaciones históricas conservan una fixture sin punto de despliegue.

Límites: 30 nuevas salas diarias en el entorno nuevo, 20 creaciones por IP/hora, 40 incorporaciones o recuperaciones por IP/minuto, 80 conexiones WSS por IP/minuto, 60 mensajes por conexión/10 segundos, cuerpos de 8 KiB y solicitudes de admisión acotadas. Los límites de creación devuelven `429`, `Retry-After` y un mensaje que distingue las salas existentes. La retención es de 24 horas según el reglamento online; las señales de presencia no la prolongan. Cada sala conserva la cota heredada de veinte partidas contando revanchas.

El piloto sigue en `https://cerconexo-m6-experimental.cerconexo-piloto-h89.workers.dev/`, versión Cloudflare `a78f6f07-0711-45e7-9a77-37fdbfb9c874`. No se desplegó allí, no se movieron sus salas y no se reutilizaron sus credenciales. Las salas anteriores permanecen en ese servicio; la compatibilidad de versiones/recuperación se conserva en las pruebas del modelo, sin migrar sesiones entre entornos.

## Coste, capacidad y riesgos

No se cambiaron planes, permisos sensibles ni facturación. Se mantiene la configuración Workers Free confirmada previamente por el usuario. La sesión OAuth no se amplió para consultar facturación.

Límites vigentes consultados en [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) y [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/): 100.000 solicitudes Workers/día; 100.000 solicitudes DO/día, 13.000 GB-s/día; SQLite, cinco millones de filas leídas/día, 100.000 escritas/día y 5 GB almacenados. Se comparten en la cuenta con el piloto. Al superar cuota Free, las operaciones pueden fallar; no se contratará capacidad automáticamente.

La lectura de Analytics del entorno nuevo, tras la matriz de partidas y las pruebas iniciales, mostró 72 solicitudes Workers, cero errores Workers, 710 invocaciones DO, 2.512 filas leídas y 2.632 escritas, sin errores CPU/memoria/fatales. Ventana y fecha exactas: `online/evidence/beta-cloudflare-metrics.json`. Las métricas pueden llegar con retraso o muestreo; no son una factura ni una prueba de carga.

Como estimación conservadora de planificación, treinta salas con una partida de unas 1.500 escrituras cada una representarían 45.000 escrituras, antes de lobbies largos, revanchas, limpieza y uso del piloto. Esa cifra es una hipótesis con margen sobre la muestra, no una capacidad garantizada. Las alarmas también cuentan como escrituras. Un lobby conectado durante horas o muchas revanchas puede consumir bastante más; el límite de salas no asegura por sí solo permanecer bajo cuota. Antes de ampliar el uso se deben revisar las métricas y el presupuesto compartido; el arranque debe ser una beta pequeña y supervisada.

Otros límites pendientes: cuotas compartidas y posibles caídas del proveedor; CORS no impide clientes ajenos fuera del navegador; recuperación privada en navegadores de incógnito requiere conservar la credencial; una interrupción de Internet no pausa indefinidamente el reloj. No se han verificado cuatro dispositivos físicos en distintas redes, vibración física nueva, Safari/iOS real ni notificaciones con pantalla bloqueada. No se añadió infraestructura de notificaciones en segundo plano. Arena Online sigue pendiente.

## Reproducción y publicación

La evidencia local está bajo `validation/m6-beta/`, `validation/integration/suites/`, `validation/m42/`, `validation/m5a/` y `online/evidence/`. Los archivos privados de operador y recuperación de las pruebas quedan exclusivamente bajo `.state/`, ignorados por Git. El paquete público se genera por lista explícita y no contiene servidor, dependencias, tests ni herramientas administrativas.

Comprobaciones: `node scripts/check-integrity.mjs`, `node online/scripts/check-isolation.mjs`, `node --test tests/*.test.mjs arena/tests/*.test.mjs`, `node --test online/tests/*.test.mjs`, `node tests/browser-runner.cjs`, `python scripts/build_pages.py --check`, `python scripts/build_offline.py`, `python scripts/package.py` y `python scripts/check-package.py`. Las pruebas de backend reales requieren OAuth oficial, dependencias de desarrollo y el operador independiente existente; nunca compartir sus valores en chat ni escribirlos en Pages.

El plan de publicación y reversión está en [PUBLICACION.md](PUBLICACION.md). Abrir la beta y fusionar Pages requieren una nueva confirmación final. Hasta entonces el backend permanece cerrado a nuevas salas públicas y el piloto continúa disponible.
