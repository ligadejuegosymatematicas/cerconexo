CERCONEXO — propuesta online compartida (estudio M4, sin implementación)

Mantener GitHub Pages como cliente estático. Añadir un servicio autoritativo independiente con salas privadas, asientos, versión de reglas, revisión monotónica, estado y diario de acciones. Un adaptador por modalidad utilizaría los motores actuales. El navegador propone acciones; el servidor identifica al jugador, comprueba su autorización y legalidad, persiste atómicamente y solo después confirma y difunde. Nunca aceptar puntuaciones o posiciones calculadas por el cliente.

Cada petición llevaría sala, sesión, `actionId` único y revisión esperada. Repetir una petición confirmada devuelve su respuesta previa; una revisión atrasada devuelve la instantánea actual. Un único escritor por sala evita dos movimientos simultáneos. Guardar instantáneas periódicas y diario permite recuperar sin reproducir animaciones antiguas. La reconexión solicita eventos desde la última revisión o una instantánea; estar desconectado no concede una jugada adicional.

Clásico necesita conservar el estado oficial y el recorrido irreversible incompleto: el servidor debe confirmar cada paso y el bloqueo de ficha, aunque aplique el turno matemático completo al construir. Arena ya trabaja con acciones atómicas y decisiones pendientes; cuando el rival debe descartar, la autorización cambia temporalmente al propietario indicado por el motor y luego vuelve al actor. Los inventarios serán públicos. La distribución de personas/asientos debe diseñarse aparte sin imponer un número de personas al juego local.

No reutilizar un código corto de sala como único secreto de autorización. Usar invitaciones con suficiente entropía, credenciales de sesión revocables, límites de creación/acciones y permisos por sala. Los guardados locales actuales permanecen independientes; una futura transferencia al servidor requeriría una acción explícita. Pruebas indispensables: duplicados, reordenamiento, dos clientes concurrentes, abandono durante un poder o paso, descarte rival pendiente, recarga y reinicio del servidor.

Comparación de infraestructura, consultada el 23 de octubre de 2026; precios en USD, antes de impuestos. Son referencias de planes, no una cotización cerrada.

| Alternativa | Costos publicados | Mantenimiento y encaje propuesto |
|---|---|---|
| Cloudflare Workers + Durable Objects SQLite | Free sujeto a cuotas; Workers Paid parte de USD 5/mes. Durable Objects tiene cuotas y cobro adicional por solicitudes, duración y almacenamiento. | Una sala por objeto facilita el escritor único y WebSocket. Requiere implementar invitaciones, sesiones, retención, migraciones y pruebas del runtime. Mi preferencia técnica para un piloto de salas pequeñas. |
| Supabase | Free: 200 conexiones Realtime y 2 millones de mensajes/mes; proyectos gratuitos se pausan por inactividad. Pro desde USD 25/mes, con consumos adicionales. | Postgres, autenticación y herramientas de operación integradas. Realtime transporta eventos; hace falta un servicio JS autoritativo y transacciones con bloqueo/revisión. El costo total debe incluir ese servicio. |
| Firebase | Spark ofrece cuotas gratuitas; Realtime Database incluye 100 conexiones simultáneas, 1 GB almacenado y 10 GB descargados/mes. Blaze cobra por consumo; el servicio de validación tiene costos y requisitos propios. | SDK y reconexión prácticos. Reglas de seguridad de base de datos no sustituyen al motor: usar Functions o Cloud Run y controlar operaciones/transferencias. |

Fuentes oficiales: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Supabase](https://supabase.com/pricing), [Firebase](https://firebase.google.com/pricing).

Estimación de dimensionamiento, no medida: 1.000 partidas mensuales × 150 acciones × 4 receptores producirían unas 600.000 entregas, más reconexiones y presencia. Presencia no debe escribirse a la base cada frame. El tamaño del estado, las consultas, duración de conexiones, egreso y copias de seguridad determinan el gasto real; medir un piloto y configurar límites y alertas antes de ampliar. Un VPS ofrece más control y costo fijo del servidor, pero exige administrar TLS, actualizaciones, backups y disponibilidad; no lo priorizaría para el primer piloto sin una persona responsable de operación.

La recomendación es una inferencia de arquitectura, no un resultado de una implementación. M4 no crea cuentas, servicios, salas ni conexiones online.
