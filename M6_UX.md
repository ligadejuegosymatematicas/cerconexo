# Candidata M6 — Simplificación de experiencia online

Revisión local del 1 de noviembre de 2026. Rama `m6-ux-simplificacion`, worktree `Cerconexo_M6_UX`, base pública `0eb4d274ddf109df07daa4d57176f99fc7196be8` (M5-D + PR #21).

No se realizó push, PR, merge, despliegue ni acceso de las pruebas al servicio público. Cloudflare, el piloto, sus credenciales y las otras ramas permanecen sin cambios. No se inició Arena Online.

## Commits revisables

| Etapa | Commit | Cambio |
|---|---|---|
| 1 | `8a4acaf` | Crear/Unirse, configuración única, textos, lobby y cabeceras compactos. |
| 2 | `caf1a8d` | Continuar desde Inicio y salida voluntaria sin pausa del reloj. |
| 3 | `16d437a` | Restricciones autoritativas y recuperación de salas antiguas. |
| 4 | `158ebe6` | Presentación final compartida, efectos y controles de regresión. |

El commit posterior de cierre contiene este informe y el inventario reproducible; no cambia el funcionamiento.

## Experiencia implementada

- Inicio conserva Clásico y Arena. Nueva partida mantiene Local, Contra CPU y Online; Arena Online permanece deshabilitado.
- Online ofrece Crear sala o Unirse. Solo el creador elige formato: 1 vs. 1 por ficha (inicial) o por equipo; 2 vs. 2 exclusivamente por ficha. Siempre hay cuatro fichas y dos equipos en Clásico. Local/CPU conservan sus configuraciones.
- Las invitaciones piden únicamente nombre; la entrada sin invitación añade el código. No repiten participantes ni política.
- Lobby compacto con código, participantes, invitación, listo e inicio; el tiempo se resume en una línea. Cabecera con Inicio, logo legible y ayuda. Los relojes completos aparecen al jugar; Invitar queda oculto durante la partida.
- Recuperación normal mediante Continuar partida online, sin solicitar credencial al navegador que la conserva. La recuperación manual en otro navegador sigue disponible en opciones avanzadas. Las invitaciones no incluyen credenciales personales.
- Inicio conserva identidad, fichas y pasos parciales. Los relojes continúan. Desconectar este navegador permanece separado y no implica rendición. No se incorporó una regla de abandono o rendición.
- Resultado coloreado según el ganador oficial en Clásico/Arena, Local/CPU/Online. Ganador personal: brillo breve y vibración opcional mediante la preferencia existente; perdedor: resultado sobrio; empate: neutral; Local compartido: celebración del equipo sin atribuir triunfo al dispositivo. Recargar o recuperar no repite efectos.
- Se conserva la inspección final, el resultado consultable y la revancha unánime de todos los participantes admitidos. El texto final de Arena evita repetir puntuaciones que ya muestra el marcador.

## Continuidad y seguridad

El aviso WebSocket `view-away` es un control de presencia autenticado y limitado por conexión. Comprueba versión, sala, generación de sesión, identificador y lista exacta de campos; no admite identidad de otro jugador ni tiempos aportados por el cliente. El servidor guarda el cambio antes de confirmarlo.

Salir voluntariamente marca al propio participante fuera de la vista y deja agotada su ventana de esa incidencia, sin consumir ni devolver presupuesto de gracia. Repetir el aviso no crea pausas nuevas. Una conexión que ya se perdió conserva su incidencia real; un aviso tardío no la reemplaza. La reconexión normal y la gracia de 30 segundos por incidencia/60 acumulados conservan su política. La prueba de seguridad comprueba además que recuperar la misma credencial invalida la conexión anterior y conserva un paso parcial.

El nuevo índice de Inicio almacena referencias a salas, sin duplicar credenciales ni modificar guardados. La consulta HTTP desde Inicio no toma el control WebSocket de otra ventana. Los comandos pendientes conservan su identificador para resolver confirmaciones perdidas sin repetir jugadas.

## Salas y clientes anteriores

| Situación | Comportamiento |
|---|---|
| 2 vs. 2 por equipo ya activa | Recupera identidades, recorrido, muros y reloj; termina con sus reglas originales. |
| Esa partida ya terminada | Conserva el resultado y ofrece crear otra sala; rechaza revancha. |
| Lobby antiguo, incluso con solicitudes pendientes | Conserva acceso, participantes y configuración; explica la retirada y bloquea comenzar. No convierte la sala. |
| Cuenta atrás antigua | Vuelve al lobby sin iniciar una partida con configuración retirada. |
| Revancha antigua pendiente/aceptada | Se cancela la propuesta retirada; se conserva el resultado anterior. |
| Página anterior conectada | Las reglas del servidor siguen siendo obligatorias; recibe una explicación al alcanzar un lobby o resultado retirado. Puede actualizar sin perder su credencial. |

La compatibilidad se comprobó arrancando realmente el servidor de `0eb4d27`, creando sus salas, cerrándolo y recuperando el mismo SQLite con la candidata. La partida antigua terminó tras 15 turnos con el resultado oficial. Un recibo pendiente repetido no duplicó el paso. No se cambió el esquema persistido ni el protocolo principal de comandos; `viewAway` se anuncia como capacidad adicional.

Para una publicación futura se recomienda actualizar primero el backend y después la interfaz. Si la interfaz nueva se conecta a un backend anterior que no anuncia `viewAway`, conserva la recuperación, pero no puede garantizar la semántica nueva de salida voluntaria. Esta candidata requiere ambos componentes para su aceptación completa.

## Validación y evidencias

| Comprobación | Resultado |
|---|---|
| Pruebas de Clásico/Arena | **314/314**: se conservan las 311 de M5-D y se añaden tres de presentación. |
| Núcleo y cliente online | **110/110**, incluidos controles de gracia, configuración retirada y recuperación. |
| Suites históricas de navegador | **21/21**, sin cambiar sus aserciones. |
| CPU Arena real | **32/32** simulaciones completas, cero acciones ilegales. |
| Configuraciones actuales en navegador | Partidas completas de 13 turnos en 2/ficha, 2/equipo y 4/ficha; estado oficial común, resultado 2–47, ficha ajena rechazada, reenvío idempotente, recarga, inspección y revancha unánime con relojes nuevos. |
| Continuidad | Inicio no pausa; conserva paso parcial; recuperación automática y desconexión normal verificadas. |
| Seguridad de presencia | Identidad ajena rechazada, avisos repetidos sin pausa, sesión concurrente invalidada y gracia real conservada. |
| Presentación final | Victoria, derrota, empate, Local compartido, movimiento reducido, cuatro colores y recarga sin efectos. |
| Móvil/escritorio | Capturas y controles a 390×844 y 1440×1000; las suites históricas incluyen otros tamaños y teclado. |
| Integridad | **32/32** hashes protegidos; 48 módulos canónicos idénticos y dos controladores con adiciones exactas de presentación comprobadas contra M5-D. |
| Pages | **74 recursos del manifiesto + `.nojekyll` = 75 archivos**; copias generadas idénticas a las fuentes. Sin backend, estados privados ni dependencias en ese inventario. |

Registros locales: `validation/m6-ux/unit.log`, `online-unit.log`, `historical-final.json` y `online/evidence/ux-*.json`. Se conservan los registros originales: el primer ensayo unitario tuvo un EACCES al conectar con loopback; pasó al ejecutar con acceso al servidor local. La suite histórica M3-B inicialmente carecía de `arena/staging/unified`; pasó tras generarlo. El resumen histórico final reúne esa ejecución independiente y las otras veinte, manteniendo ambos registros. Los ajustes de selectores y diarios de las pruebas de presentación no exigieron cambiar reglas ni motores.

La transición de victoria de Arena CPU se aísla con una respuesta de Worker controlada que propone un muro legal conocido; el controlador y el motor oficiales validan y ejecutan la acción. Las 21 suites y las 32 simulaciones prueban además la CPU real. Esto no acredita vibración física en un teléfono.

Capturas locales (no contienen credenciales):

- `online/evidence/ux-create-390.png`, `ux-join-390.png` y `ux-stage1-lobby-390.png`.
- `online/evidence/ux-active-mobile.png`, `ux-active-desktop.png` y `ux-continue-home-mobile.png`.
- `online/evidence/ux-final-4-piece-mobile.png` y `ux-final-desktop.png`.
- `online/evidence/ux-arena-duo-cpu-winner-result.png` y `ux-arena-ffa-local-result.png`.

## Revisión del diff y reproducción

Los cambios fuente están limitados a flujo/presentación online, continuidad y las restricciones de sala. En los controladores nativos solo se añaden ganchos de presentación y se simplifican dos textos; el comprobador `online/tests/presentation-hooks.mjs` exige que, retirando esas líneas exactas, los 50 módulos vuelvan a sus hashes canónicos M5-D. Los 32 protegidos se exigen idénticos sin normalización.

`docs/` es salida generada desde fuentes mediante `scripts/build_pages.py`. Los constructores autónomos solo incorporan el módulo visual compartido y omiten los módulos online en file://. Los manifiestos y `.gitignore` enumeran los nuevos archivos. Pruebas, fixtures con identidades ficticias y scripts locales quedan fuera de Pages; `.state`, dependencias, capturas y registros no se incluyen en Git. No se detectaron cambios accidentales ni modificaciones de configuración Cloudflare, motores, CPU, inventarios o formatos de guardado.

El diff acumulado final frente a `0eb4d27` comprende 64 rutas: 20 de funcionamiento/presentación, 17 copias generadas en `docs/`, siete de construcción/inventarios, 19 de pruebas y herramientas locales y este informe. Incluye las tres etapas ya confirmadas; no equivale al recuento de archivos pendientes en el momento de la interrupción.

Desde este worktree, con sus dependencias existentes:

```powershell
node online/scripts/ux-local.mjs
```

Abrir `http://127.0.0.1:8815/cerconexo/` y usar navegadores o perfiles separados. El servidor autoritativo local usa `127.0.0.1:8820` y SQLite aislado en `online/.state/ux-local`. Ctrl+C detiene el proceso. Solo escucha en loopback; no expone Internet ni cambia el firewall. El origen/API se sustituyen exclusivamente en la respuesta local, sin modificar la configuración pública.

Controles reproducibles: `node online/scripts/ux-audit.mjs`, `node scripts/check-integrity.mjs`, `node --test tests/*.test.mjs arena/tests/*.test.mjs`, `node --test online/tests/*.test.mjs` y los scripts `online/scripts/ux-*-browser.mjs`. Las suites históricas usan `tests/browser-runner.cjs` con Playwright/Edge; requieren generar previamente Pages, los HTML autónomos y `arena/staging/unified` según el workflow existente.

## Pendientes antes de publicar

- Revisión humana de esta candidata y autorización independiente de publicación. No se hizo push ni despliegue.
- Validación física nueva en Android/iOS y entre redes tras un futuro despliegue autorizado. Las pruebas actuales son locales HTTP/WS y navegadores automatizados; no acreditan HTTPS/WSS de esta versión aún inédita.
- Vibración depende del navegador, preferencias y movimiento reducido. No se añadieron notificaciones del sistema, servicio en segundo plano ni avisos con pantalla bloqueada.
- Abandonar una vista mantiene corriendo la partida; no se añadió rendición. Con zoom o pantallas pequeñas sigue siendo posible desplazarse.
- Arena Online y sus cuatro equipos independientes siguen pendientes. El componente visual final ya admite sus colores, sin añadir mecánicas online.
- No hay nuevos costes de infraestructura ni cambios de cuotas: se usó el runtime local. Las condiciones del backend publicado permanecen como estaban.

Paquete reproducible y extracción limpia: comprobación de cierre registrada en `entregas/Aplicacion_Integrada/EXTRACCION_LIMPIA.json`.
Tras cerrar el informe se reconstruye el ZIP y se exige que cualquier diferencia con la extracción funcionalmente validada sea exclusivamente este documento; no se repiten las baterías por un cambio documental.
