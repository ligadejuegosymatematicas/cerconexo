# Arena Online · cuatro equipos — candidata local

Base pública: `151800f1322b8f3d09ae676f5ea7f21406574e4f` (PR #24). Rama: `m6-arena-ffa`. Worktree: `Cerconexo_M6_Arena_FFA`. Fecha: 4 de noviembre de 2026.

Implementación funcional: `802501eb622105fc72747dc24f78b4bde64f0fba`. El cierre documental posterior registra la validación integral sin cambiar el comportamiento.

## Alcance aplicado

Cuatro participantes, cuatro equipos A/B/C/D, una ficha por persona, tablero oficial 9 × 9, turnos por ficha y cinco minutos individuales. Se reutilizan el motor y la geometría oficiales de Arena, las posiciones y colores locales, poderes y medallas, inventarios individuales, descartes, aseguramientos, reactivaciones y reconquistas. Se conservan las salas, sesiones, cuenta atrás, gracia, avisos, inspección, historial y revancha existentes.

El módulo `src/arena-timeout.mjs` implementa exclusivamente la transición online de eliminación por tiempo. Retira ficha e inventario, limpia la decisión/recolección pendiente y conserva muros y acciones aceptadas. Recalcula mediante la geometría oficial, sin completar una intervención ni generar una oleada. No modifica el motor. El siguiente participante recibe su tiempo restante al habilitarse su decisión; una alarma tardía no lo consume retrospectivamente.

Si queda un equipo, gana. Si desaparecen las regiones compartidas, se aplica el resultado territorial oficial. La clasificación sitúa primero a los supervivientes por puntuación, con puestos compartidos; los eliminados siguen en orden inverso de eliminación. El eliminado conserva su acceso como espectador y participa en la unanimidad de revancha. La nueva partida restaura las cuatro fichas y sus tiempos, conservando el resultado anterior por separado.

En FFA por ficha, un descarte pendiente pertenece al inventario individual del actor que recoge el poder. Su vencimiento limpia esa decisión. El módulo valida esta propiedad antes de eliminar. Las oleadas conservan la simetría y los tamaños oficiales incluso con menos supervivientes.

## Prueba local

Desde este worktree, con las dependencias de `online` disponibles:

```text
node online/scripts/ux-local.mjs --arena-ffa
```

Abrir `http://127.0.0.1:8815/cerconexo/arena/`. Elegir **Nueva partida → Online → Crear sala**, seleccionar **1 vs. 1 vs. 1 vs. 1 · cuatro equipos**, compartir la invitación con otros tres perfiles/navegadores, admitirlos y confirmar los cuatro participantes listos. El anfitrión inicia la cuenta atrás.

El servidor y SQLite permanecen en loopback, con estado independiente en `online/.state/ux-local`. No se conecta con Cloudflare público. En esta máquina se reutilizó el directorio de dependencias existente mediante una unión local ignorada por Git. En otro equipo se requiere preparar esas dependencias.

## Resultados

- 451 pruebas automatizadas aprobadas: las 438 existentes y 13 específicas nuevas. Incluyen vencimiento tras movimiento, salto, demolición, muro adicional y descarte; alarma repetida/tardía; territorio, empates, reactivación y reconquista después de una eliminación; recuperación, cliente incompatible y revancha.
- Las 21 suites históricas de navegador aprobaron, incluidas Local/CPU, guardados, navegación, accesibilidad, animaciones y manuales. Se generaron los HTML autónomos oficiales después de que las primeras ejecuciones de `phase2a` y `phase2b` detectaran su ausencia en este worktree nuevo. Se repitieron únicamente esas dos suites; el resumen final tiene 21 resultados satisfactorios.
- Cuatro contextos independientes de Edge: dos partidas territoriales completas, 87 acciones/27 turnos y 109 acciones/38 turnos. Resultados A/B/C/D: **1/78/1/1** y **1/75/1/1**, con tres casillas vacías en la segunda. Cada acción se comparó con el motor oficial. Se ejercitaron los tres poderes, descartes, aseguramientos, reactivación, inspección y recargas durante movimiento y descarte.
- Tercera partida de navegador con relojes reales de 300.000 ms: A, B y C vencieron sucesivamente en unos quince minutos. Cada retirada conservó muros, intervenciones y oleadas; el siguiente reloj recibió 300.000 ms. D ganó con 81 casillas. Clasificación: D primero, C segundo, B tercero, A cuarto. Recargar A conservó la identidad eliminada; la revancha unánime recuperó las cuatro fichas y tiempos.
- Cuatro conexiones WebSocket y SQLite local: reinicio después de un paso y durante un descarte, sin acción automática ni tiempo devuelto; permisos y recibos duplicados comprobados; partida territorial y revancha completas.
- Regresión en navegador: Arena 1 vs. 1 por ficha y por equipo, Arena 2 vs. 2 y las tres configuraciones vigentes de Clásico, con partidas completas, recuperación, inspección y revancha.
- 32 hashes protegidos intactos. Los directorios canónicos `src`, `arena/src`, las medallas y la configuración del backend público no presentan cambios frente a la base.
- Construcción oficial: 83 recursos públicos, tres HTML autónomos y paquete local de 375 archivos de proyecto. El manifiesto incorpora el módulo de eliminación, su prueba y este informe; SQLite, dependencias y evidencia privada quedan excluidos.

Los informes crudos y capturas se conservan localmente, excluidos del repositorio:

- `online/evidence/arena-ffa/arena-browser.json`
- `online/evidence/arena-ffa-network.json`
- `online/evidence/arena-ffa/*.png`
- `validation/integration/suites/summary.json`

Capturas móviles con emulación Pixel 7: `arena-lobby-mobile.png`, `arena-active-mobile.png`, `arena-final-mobile.png`, `arena-eliminated-mobile.png` y `arena-timeout-final-mobile.png`. La captura `arena-timeout-winner-desktop.png` muestra el triunfo verde de D y la clasificación final. Todas se encuentran en `online/evidence/arena-ffa/`.

Las primeras comprobaciones detectaron y corrigieron dos pérdidas de metadatos: el adaptador debía conservar el historial de eliminaciones al aplicar una acción y la instantánea pública debía incluirlo. Las pruebas de recuperación y las partidas completas se ejecutaron nuevamente sobre esas correcciones.

## Compatibilidad y límites

Las salas nuevas emplean `arena-ffa-online-v1` y requieren el cliente `arena-ffa-v1`; un cliente anterior conserva el acceso y recibe la instrucción de actualizar, sin permiso para actuar. Las sondas FFA históricas mantienen su reglamento. Los formatos existentes de Clásico y Arena de dos equipos no se convierten. Los guardados Local/CPU no cambian.

La capacidad FFA está deshabilitada por defecto tanto en la interfaz pública generada como en el Worker. Solo el arranque local la habilita. No hubo push, PR, despliegue, cambios del piloto, namespaces públicos, secretos, cuotas ni facturación.

Esta entrega acredita HTTP/WS local y cuatro contextos automatizados; no acredita cuatro dispositivos físicos, Android real, redes diferentes ni HTTPS/WSS público. La revisión HTTPS y una eventual publicación requieren autorización posterior. La demostración está limitada a loopback; no ofrece por sí sola una dirección accesible desde otro dispositivo.
