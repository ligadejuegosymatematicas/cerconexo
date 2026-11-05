# Clásico Online · cuatro equipos — validación HTTPS/WSS

Preparación de publicación del 5 de noviembre de 2026 (UTC). Base pública
`99156eb`; candidata local aprobada `dfe4efb`.

## Worker y compatibilidad

Se actualizó exclusivamente `cerconexo-m6-beta-staging`, el Worker público ya
existente. Versión: `322b1fc6-65e8-45be-9ba6-aa5d0f19df0d`. Código:
`67a3d57089e24ce580ce0d3daf7d3034aa1c6fd3`; las modificaciones posteriores son
de habilitación del cliente, documentación y comprobaciones de publicación.

`/api/health` confirma `classic: online`, `classicFfa: online`,
`arena: duo-online` y `arenaFfa: online`. CORS mantiene únicamente el origen
`https://ligadejuegosymatematicas.github.io`; un origen ajeno devuelve 403.
No se cambiaron namespaces SQLite, clases, migraciones ni nombres de secretos.
El límite sigue siendo de 30 creaciones de sala al día.

Antes de actualizar se crearon siete salas de control con las configuraciones
anteriores: Clásico 1 vs. 1 por ficha/equipo, Clásico 2 vs. 2, Arena 1 vs. 1
por ficha/equipo, Arena 2 vs. 2 y Arena de cuatro equipos. Todas se recuperaron
después del cambio con la misma identidad y el mismo recorrido parcial; los
reenvíos fueron idempotentes, el reloj no se restauró y se pudo construir y
continuar. Una sala conservó además el resultado de una partida y su revancha.
Solo se usaron salas propias de pruebas.

El piloto privado mantuvo su versión
`a78f6f07-0711-45e7-9a77-37fdbfb9c874` antes y después. No se reutilizaron
credenciales ni datos del piloto. El primer guion de preparación agotó su plazo
esperando cierres WebSocket: se corrigió solo su cierre de transporte después
de la confirmación autenticada de salida. Ese intento no desplegó el Worker.

## Cuatro navegadores por Internet

Se reutilizó `classic-ffa-browser.mjs`. `--candidate-https` sirve la candidata
únicamente dentro de los cuatro contextos de Edge, bajo el origen de Pages;
la API y todos los WebSockets son reales y públicos, por HTTPS/WSS, sin interceptar
ni simular el servidor. Esto se distingue expresamente de `--public-pages`, que
usa también la interfaz efectivamente publicada sin interceptar recursos.

La partida territorial completa terminó tras 24 muros: A 1, B 6, C 2, D 1,
39 casillas vacías y cero en disputa. Ganó B; A y D compartieron el tercer puesto.
Se comprobaron turnos, pasos de 0/1/2, paredes obligatorias, tablero y puntuación
idénticos, recarga durante un paso parcial, sustitución de sesión concurrente,
rechazo de una jugada ilegal, duplicado idempotente, inspección final y revancha
con las cuatro aceptaciones.

En la revancha se reprodujeron **28 turnos legales**, sin inyectar estados ni
acelerar el reloj: A aseguró 31 casillas, B aseguró 3 y C/D compartían 12.
C avanzó de 43 a 44 y se esperó su vencimiento real. Después:

- C fue retirado definitivamente, con cero tiempo, sin conservar decisiones pendientes.
- Los 28 muros se conservaron exactamente.
- Las 12 casillas disputadas pasaron a ser exclusivas de D.
- A conservó sus mismas 31 casillas y ganó; D, último actor, quedó segundo.
- B quedó tercero y C, eliminado, cuarto. Tres casillas vacías no puntuaron.
- Los relojes de A/B/D no consumieron tiempo durante la espera de C.

El resultado fue A 31, D 12, B 3 y C eliminado. La espera de 293.753 ms consumió
el tiempo que le quedaba a C dentro de su presupuesto inicial de cinco minutos.
No hubo errores JavaScript ni recursos HTTP faltantes.

## Integridad, consumo y publicación

Las 152 pruebas online volvieron a aprobar después de preparar la habilitación.
La integración debe superar en GitHub Actions las **466 pruebas**, **21 suites
históricas**, **32 hashes protegidos** y la extracción/reconstrucción del ZIP,
antes del merge autorizado. Los 56 archivos nativos auditados permanecen idénticos.
El paquete público conserva 85 archivos: 84 recursos servidos y `.nojekyll`.
No contiene servidor, dependencias, registros ni credenciales administrativas.

Consumo agregado observado antes del despliegue, últimas 24 horas: Workers 296
solicitudes, Durable Objects 3.849 solicitudes, SQLite 14.989 filas leídas y
18.485 escritas. Almacenamiento SQLite agregado observado: 2.682.880 bytes.
Después de las pruebas HTTPS, el día UTC llevaba 113 solicitudes a Workers,
1.341 a Durable Objects, 4.090 filas leídas y 3.463 escritas, sin errores de
Workers ni excesos de CPU/memoria. Son métricas con posible retraso o muestreo.

Se conserva Workers Free, previamente confirmado por el titular, sin activar
facturación ni elevar límites. La sesión permite leer Workers y sus métricas,
pero la consulta de suscripciones devolvió 403; no se solicitaron permisos nuevos.
Las cuotas se comparten con el piloto y las revanchas también consumen recursos:
30 salas diarias no constituyen una garantía de capacidad.
Referencias: [Workers Free](https://developers.cloudflare.com/workers/platform/limits/)
y [Durable Objects SQLite](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Tras el despliegue de Pages se comprobarán los recursos exactos, una partida desde
la URL oficial sin intercepción, recuperación de las siete configuraciones y los
guardados anteriores de Clásico/Arena Local/CPU. El Worker no necesita otro despliegue.

Las pruebas físicas con cuatro dispositivos y redes distintas siguen pendientes.
Los contextos automatizados y la emulación móvil no demuestran vibración física
ni funcionamiento con la pantalla bloqueada.
