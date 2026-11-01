# Publicación beta de Clásico Online — pendiente de autorización final

Esta candidata se prepara en `m6-beta-integracion`, partiendo exactamente de M5-D `cd22390f9571e6b6f03a43b84922a825ec823def`. No se ha fusionado, hecho push ni actualizado GitHub Pages. El informe de integración y las evidencias están en [M6_BETA.md](M6_BETA.md).

## Rutas y paquete

| Ruta | Contenido de la candidata |
|---|---|
| `/cerconexo/` | Portada con Clásico y Arena |
| `/cerconexo/clasico/` | Nueva partida: Local, Contra CPU y Online |
| `/cerconexo/arena/` | M5-D Local/CPU; Online deshabilitado y pendiente |
| `/cerconexo/online/` | Sala de Clásico Online, dos/cuatro personas, ambas políticas |

`scripts/pages-files.json` genera 69 recursos en `docs/`, incluida `.nojekyll`. Los 50 módulos canónicos de `src/` y `arena/src/` se conservan byte por byte respecto de M5-D. Los 32 hashes protegidos no cambian. Los HTML autónomos conservan Local/CPU sin ofrecer un servidor online en `file://`.

El frontend usa HTTPS/WSS hacia un Worker independiente. No contiene secretos, credenciales del piloto ni dependencias del servidor. Las claves y formatos Local/CPU no se renombran. La portada mantiene el origen público habitual y permite continuar los guardados existentes.

## Backend preparado, todavía cerrado

Worker: `cerconexo-m6-beta-staging`. API: `https://cerconexo-m6-beta-staging.cerconexo-piloto-h89.workers.dev`. Almacenamiento: dos namespaces SQLite propios. No se comparten con `cerconexo-m6-experimental`.

La configuración versionada `online/wrangler.beta.jsonc` tiene `workers_dev=false`, previews deshabilitadas, sin assets ni rutas del sitio estable. El script de preparación solo habilita el entorno de pruebas cerrado: exige una candidata registrada y limpia sobre M5-D, Workers Free confirmado y revisión explícita del secreto independiente de admisión. La URL de pruebas ya habilitada devuelve `BETA_NOT_OPEN` ante intentos normales de crear salas. Solo el arnés del operador admite las creaciones de prueba; la credencial no llega al frontend ni a su almacenamiento.

No ejecutar herramientas de despliegue de la antigua rama del piloto para publicar esta candidata. El piloto privado y sus secretos deben permanecer intactos.

## Secuencia después de una autorización nueva

1. Volver a comprobar `origin/main`. Si avanzó respecto de M5-D, integrar y validar sus cambios antes de proponer la publicación. No copiar directorios completos de la rama antigua M6 sobre el sitio actual.
2. Revisar el commit candidato, los artefactos, los resultados completos y el presupuesto gratuito compartido con el piloto. Confirmar una ventana de prueba real con participantes.
3. Preparar una configuración explícita para abrir exclusivamente el backend nuevo: `SERVICE_MODE=beta-public`, `PUBLIC_CREATION=true`, `LOCAL_DEMO=false`, `PUBLIC_DEMO=false`, origen permitido exclusivamente `https://ligadejuegosymatematicas.github.io`; sin loopback, cookies del piloto ni credencial global para visitantes. Retirar el secreto de admisión de pruebas cuando ya no sea necesario. Esta promoción no está ejecutada ni disponible como un comando de publicación automática en la candidata.
4. Mantener los namespaces SQLite del backend nuevo; no borrar ni migrar el piloto. Verificar salud, admisión pública controlada, HTTPS/WSS, límites y revisión de permisos sin cambiar Free ni activar facturación. La versión estable Local/CPU todavía no depende de esta API.
5. Subir exclusivamente la rama candidata y abrir una PR hacia `main`. Esperar `verificar`, con las 311 pruebas de M5-D, pruebas online y las 21 suites históricas. No omitir protecciones ni habilitar auto-merge.
6. Tras aprobación de la PR y autorización de publicación, fusionar y conservar la configuración existente de Pages (`main`, `/docs`). No cambiar dominios ni permisos del repositorio.
7. Cuando Pages termine, comprobar desde la URL real los 69 recursos, las cuatro rutas, ausencia de secretos, guardados Local/CPU, descarte de Arena, dos/cuatro jugadores, ambas políticas, reconexión, reloj e invitación. Esta comprobación del despliegue real complementa la validación previa del paquete bajo el origen público simulado en navegadores aislados.
8. Realizar partidas físicas en Android y otras redes. No considerar cuatro contextos automatizados como cuatro personas o dispositivos físicos. Observar lecturas/escrituras y errores de cuota antes de ampliar el uso.

## Contingencia

Si el backend falla, conservar sus datos y cerrar nuevas creaciones mediante `PUBLIC_CREATION=false`; no destruir namespaces ni borrar sesiones. Los modos Local/CPU siguen funcionando. Si el frontend requiere reversión, usar una PR de reversión al commit estable, conservando el almacenamiento de los navegadores y el backend. No usar `push --force` ni sustituir archivos M5-D por copias de M6.

Las cuotas gratuitas son de la cuenta, no una reserva separada por Worker. Treinta salas nuevas diarias es un límite de admisión, no una garantía de treinta partidas o de veinte revanchas por sala sin alcanzar cuota. Mantener vigilados los lobbies conectados durante mucho tiempo y las alarmas. No activar un plan de pago automáticamente ante errores de capacidad.
