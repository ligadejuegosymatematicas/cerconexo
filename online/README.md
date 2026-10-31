# CERCONEXO · Piloto privado M6

**M6.3 desplegado:** [abrir el piloto privado](https://cerconexo-m6-experimental.cerconexo-piloto-h89.workers.dev/). Conserva portada, Clásico y Arena Local/CPU; Online está disponible únicamente en Clásico. Consultar [informe, pruebas y límites](../M63.md). El Pages estable no cambia.

El acceso requiere la credencial privada del piloto, conservada solo para el responsable en `online/.state/pilot/ACCESO-PRIVADO.txt`, fuera de Git. No es una clave de Cloudflare ni el código de una sala. Cada dispositivo debe entrar primero al piloto; después puede solicitar admisión con la invitación de sala. La sesión de acceso dura siete días. Las credenciales personales de las salas son independientes.

Cloudflare funciona sin los servidores locales; los puertos M6 8787, 8791 y 8800 se detuvieron para verificarlo. No se activó facturación ni Zero Trust. El control privado se ejecuta en el propio Worker antes de servir recursos o API/WSS.

## Herramientas locales de desarrollo

```powershell
npm run dev:experimental
```

Abrir `http://127.0.0.1:8800/`. Este servidor usa almacenamiento separado de la demo M6.2 y genera sus recursos en `.experimental/`, excluido de Git. No ejecutar un segundo proceso si ya está activo. `npm run build:experimental` prepara solo el paquete. `npm run deploy:experimental -- --help` explica la preparación en seco; publicar exige una acción explícita y confirmar Workers Free.

## Laboratorio M6.2 conservado

Clásico online 2 vs. 2 para cuatro personas, una por ficha: **A1, B1, A2 y B2**. El servidor reutiliza el motor oficial y confirma pasos, muros, territorios y resultados. Arena online queda pendiente de su etapa autorizada. La primera publicación estable de M6 seguirá requiriendo Clásico 2 vs. 2, Arena 2 vs. 2 y Arena de cuatro equipos independientes.

Base: `0ce64e92c744e75cdcd9383b7ddb00270cd64df8`; rama `m6-salas-conexiones`. El juego publicado, los motores, CPU, guardados y manifiestos de Pages conservan sus bytes.

## Ejecutar

Probado en Windows con Node 24.20.0, Wrangler 4.156.0, workerd 1.20261023.1 y Edge. Las dependencias son de desarrollo y quedan en esta carpeta.

```powershell
cd C:\Users\Henry\Documents\Cerconexo\Cerconexo_M6\online
npm ci
npm run dev
```

Las dependencias ya están instaladas en este worktree; `npm ci` solo es necesario en una instalación nueva. Evitar abrir otro `dev` si ya está ejecutándose.

Abrir **http://127.0.0.1:8787/** en el PC que ejecuta el servidor. No se necesita cuenta ni token de Cloudflare. El lanzador usa `--local`, excluye credenciales heredadas de Cloudflare, aísla su configuración en `.state/config` y desactiva métricas. No hay script de despliegue, rutas públicas ni facturación. Al arrancar prepara copias exactas de nueve recursos oficiales para servir la interfaz; esos archivos generados están ignorados por Git.

Conservar `.state/` permite reiniciar y recuperar salas. Dependencias, `.state/`, `.wrangler/`, registros, variables privadas y evidencias están ignorados por Git y fuera del paquete de Pages.

## Demostración con cuatro clientes

1. Crear una sala en el perfil local 1. El anfitrión ocupa la primera posición.
2. Abrir los perfiles 2, 3 y 4 del pie en otras pestañas y solicitar entrada. Cada perfil tiene su credencial independiente. También pueden utilizarse cuatro contextos de navegador separados.
3. El anfitrión admite las solicitudes y asigna las posiciones. Cada persona pulsa **Estoy listo**.
4. El anfitrión inicia la cuenta atrás común de tres segundos. En el turno de tu ficha, elige hasta dos pasos turquesa y después un muro dorado obligatorio; puedes construir directamente sin desplazarte. Cada paso aceptado es irreversible y se comparte al instante.
5. Desconectar a quien decide: los demás observan su gracia. Reconectar o recargar conserva identidad y tiempo. Reiniciar con la misma `.state/` recupera las salas.
6. El muro completa el turno; el reloj pasa al equipo que deba decidir según el motor. La partida termina por territorio o cuando un equipo agota sus ocho minutos. Los cuatro ven el resultado.

Solo la ficha habilitada recibe objetivos de juego. Las fichas aseguradas y sus regiones se calculan con el motor oficial. Para crear otra sala, volver a la dirección raíz sin el parámetro `room`.

## Android y otros dispositivos en la misma Wi-Fi

Con `dev` activo, ejecutar una sola pasarela en otra terminal:

```powershell
npm run lan -- --host 172.17.56.19
```

Abrir **http://172.17.56.19:8791/** desde Android y desde los otros dispositivos de la misma Wi-Fi. En esta sesión, la interfaz comprobada es **Wi-Fi, 172.17.56.19/19**; el usuario confirmó que Android abre la página. Crear la sala desde esa dirección y compartir el enlace de **Invitar**, o introducir su código en el otro dispositivo. Usar la misma dirección LAN también en el PC evita compartir por error un enlace `127.0.0.1`.

Para tres jugadores en el PC y uno en Android, el PC puede usar los perfiles locales 1, 2 y 3; Android conserva su propia sesión. No abrir la misma identidad en dos ventanas: la conexión nueva sustituye a la anterior. No compartir la credencial personal como invitación.

La pasarela escucha únicamente en la IPv4 privada elegida y acepta clientes de su subred; valida `Host` y `Origin`, y conserva el backend en loopback. No crea túneles ni cambia el firewall. Es HTTP/WS sin cifrado, adecuado únicamente para esta demostración en una LAN de confianza. No usar redirección de puertos ni exponerlo a Internet. Si cambia la dirección Wi-Fi, `npm run lan -- --check` muestra las candidatas; seleccionar la dirección actual con `--host`.

Cerrar la terminal LAN o pulsar Ctrl+C corta el acceso Wi-Fi. Conservar `.state/` al detener el backend permite recuperar las salas. En este Windows, un arranque en frío de workerd puede tardar más de cien segundos; esperar a que responda la página.

Las invitaciones contienen solo código y perfil público. Para recuperar una sesión en otra ventana se introduce la credencial personal en el campo protegido; nunca se añade a la URL. Copiarla requiere una pulsación expresa. La nueva conexión desplaza a la anterior. La demo no abre el PC a Internet.

## Contrato y persistencia

| Operación | Entrada |
|---|---|
| `POST /api/rooms` | `{code,name,mode,policy,credential}`; creación idempotente para el mismo código, credencial y configuración |
| `POST /api/rooms/{code}/join` | `{name,credential}`; solicitar admisión o recuperar la identidad registrada |
| `POST /api/rooms/{code}/resume` | Credencial en `Authorization: Bearer ...`; devuelve la vista personal |
| `GET /api/rooms/{code}/socket` | WebSocket con origen permitido; autenticación en el primer mensaje dentro de 5 segundos |
| `GET /api/health` | Etapa, versión, SHA base y prueba de importación de los motores en workerd |

El cliente genera una credencial de 256 bits antes de registrarse; el servidor almacena solo su SHA-256. Los códigos legibles tienen 50 bits y permiten solicitar entrada, no apropiarse de posiciones.

Cada comando autenticado lleva `protocolVersion`, `roomId`, `actionId`, `expectedRevision`, `type` y `params`. Clásico usa `classic-online-v1`, con `classic.step` y `classic.wall`, que aceptan solo `{to}`: el servidor deriva actor y recorrido de su estado persistido. También se admiten `admit`, `reject`, `ready` y `start`. `sync` solicita una instantánea. Las sondas `probe.complete`, `probe.discard` y `probe.resolve` quedan restringidas al reglamento histórico M6.1 y nunca actúan sobre partidas reales de Clásico.

Una cola por Durable Object serializa HTTP, WebSockets, cierres y alarmas. Una transacción SQLite guarda estado, reloj, revisión, evento y recibo antes de confirmar. Un identificador repetido con contenido idéntico devuelve el recibo anterior; otro contenido se rechaza. Una revisión obsoleta exige revisar y enviar una intención nueva. Los fallos transitorios conservan la intención pendiente y consultan su recibo al reconectar.

La generación de conexión se persiste por participante: solo la vigente puede actuar. El cierre tardío de una conexión reemplazada no desconecta a la nueva. La vista pública excluye credenciales y hashes; únicamente el anfitrión ve solicitudes pendientes.

## Reloj y presencia

Clásico: 480.000 ms por equipo. Los pasos parciales y las solicitudes inválidas no detienen su reloj; solo el muro legal completa el turno. No hay incremento, límite adicional por turno, movimientos automáticos ni CPU. El servidor resuelve el vencimiento antes de una acción llegada al límite. La victoria por tiempo es un resultado de sala, sin falsificar un final territorial del motor.

La infraestructura conserva los parámetros previstos de Arena (600.000 ms por equipo y 300.000 ms individuales) y las pruebas de decisión/descarte de M6.1. Su lógica de juego online todavía no está implementada. El aviso visual de inactividad de 60 segundos del laboratorio M6.1 queda pendiente de trasladar al tablero Clásico.

Heartbeat cada 5 segundos mediante respuesta automática de la API de hibernación; lease de 15 segundos. La gracia empieza al detectar falta de una persona necesaria: hasta 30 segundos por incidencia y 60 acumulados por jugador. Un compañero conectado que pueda decidir evita la pausa; las ventanas de compañeros transcurren en paralelo. Una misma incidencia no crea otra ventana por cambiar de decisión.

Las alarmas atienden autenticación, presencia, gracia, reloj y retención; sus efectos son idempotentes. Lobbies abandonados y resultados expiran a las 24 horas. Pings y presencia no amplían la retención. Expirar elimina los datos privados de la sala.

Límites iniciales: 20 creaciones/hora por IP y 100/día globales; entradas y recuperación, 40/minuto por IP; conexiones, 80/minuto por IP; 60 mensajes de aplicación por conexión cada 10 segundos; mensajes hasta 8 KiB; 24 conexiones por sala; 12 solicitudes/participantes vigentes y 32 registros totales. El limitador conserva hashes de IP. Estos límites no garantizan por sí solos gratuidad de producción.

## Verificar

```powershell
npm test
node scripts/regression.mjs
npm run test:integration
npm run test:browser
npm run check
node scripts/prepare-static.mjs --check
```

Pruebas adicionales con la demo ya activa, sin reiniciar sus salas:

```powershell
node scripts/lan-smoke.mjs --host 172.17.56.19
node scripts/classic-timeout.mjs
```

La segunda tarda ocho minutos reales y abre cuatro contextos Edge independientes para comprobar victoria por reloj y recuperación del resultado. No altera relojes ni configuración de la demo. Las pruebas crean salas propias; no se necesitan para cada arranque manual.

Las pruebas de red necesitan permiso para localhost y ejecutar workerd. Las de navegador usan Edge headless; no descargan navegadores. Crean runtimes y almacenamiento independientes en los puertos 8788, 8789 y 8790, con directorios de compilación separados de la demo de 8787. Solo cierran procesos de prueba creados por sus scripts.

En este Windows se observó un arranque en frío superior a 100 segundos. La preparación espera la señal `Ready` de Wrangler y luego exige una respuesta de salud; esto no modifica los plazos de las pruebas de juego, sesiones o reloj.

Los resultados y capturas quedan en `evidence/`, excluido de Git. [Informe M6.2](../M62.md). [Entrega histórica M6.1](../M61.md).

Referencias oficiales: [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [alarmas](https://developers.cloudflare.com/durable-objects/api/alarms/), [cuotas](https://developers.cloudflare.com/durable-objects/platform/pricing/).
