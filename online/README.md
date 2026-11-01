# Clásico Online — candidata sobre M5-D

Estado y resultados: [M6_BETA.md](../M6_BETA.md). Publicación pendiente de confirmación final: [PUBLICACION.md](../PUBLICACION.md).

El frontend de este directorio se empaqueta por lista explícita en `docs/online/`; reutiliza los motores y componentes oficiales de M5-D mediante rutas relativas. Local y CPU conservan sus sesiones y sus guardados. Arena Online aparece pendiente.

El servidor `src/worker.mjs` usa Workers y dos clases Durable Objects SQLite: `Room` y `AdmissionGate`. Una sala tiene un escritor autoritativo, snapshots, eventos y recibos persistentes. Los relojes usan tiempo del servidor y alarmas. No mantener el PC encendido para servir las partidas de Cloudflare.

## Pruebas

Node 24, Python 3, Playwright 1.62.1 y Edge/Chromium para navegador. Las dependencias son de desarrollo y no van a Pages. Instalación reproducible en una copia independiente: `npm ci --ignore-scripts` dentro de `online/`. No instalar sobre una junction que comparta dependencias de otro worktree.

```sh
node --test tests/*.test.mjs
node scripts/check-isolation.mjs
```

Las siguientes pruebas utilizan la API nueva de staging, el paquete `docs/` y el operador independiente local. No publican nada en GitHub Pages:

```sh
node --use-system-ca scripts/configurations-browser.mjs
node --use-system-ca scripts/product-browser.mjs
node --use-system-ca scripts/classic-timeout.mjs
node --use-system-ca scripts/beta-security.mjs
node scripts/check-beta-secrets.mjs
```

El arnés sirve la candidata únicamente dentro del navegador aislado bajo `/cerconexo/` y el origen real esperado de Pages. Las conexiones HTTPS/WSS a Cloudflare sí son reales. No usar sus capturas para afirmar que Pages fue actualizado o que se probaron cuatro dispositivos físicos.

## Staging cerrado

Configuración: `wrangler.beta.jsonc`. Worker independiente: `cerconexo-m6-beta-staging`. No usa bindings, salas ni secretos de `cerconexo-m6-experimental`. La configuración versionada no habilita una URL y tiene `PUBLIC_CREATION=false`. El helper exige rama/base correctas, árbol limpio, confirmación de Free y revisión explícita antes de habilitar HTTPS de pruebas. No abre la beta pública.

El acceso del operador se genera fuera de Git bajo `.state/beta-staging/operator.json`; solo su hash se instala como secreto `TEST_ADMISSION_HASH` mediante Wrangler. No mostrar sus valores, no ponerlos en URLs, registros, frontend, capturas, tickets ni Actions. Se usa únicamente desde Node para admitir creaciones de prueba. Cada participante genera además una credencial personal aleatoria; la invitación contiene solo el código de sala. El servidor guarda hashes.

`review-beta-staging.mjs --account-id ID` y `cloudflare-metrics.mjs --account-id ID` realizan consultas de lectura con la sesión OAuth oficial de Wrangler. No cambian el plan ni solicitan permisos de facturación. `beta-persistence.mjs --prepare`, seguido de una actualización autorizada del backend y `beta-persistence.mjs`, prueba la recuperación de un recorrido parcial y el mismo recibo. Sus sesiones de prueba quedan bajo `.state/`, sin exposición pública.

El control de aislamiento está ligado a las referencias locales observadas durante esta entrega. Los hashes M5-D de la fixture permiten ejecutar las pruebas unitarias también desde el ZIP, sin exigir un historial Git. La fixture histórica de política privada no es una configuración de despliegue. El módulo LAN se conserva para sus pruebas de seguridad históricas; no inicia servicios al importarse.

No ejecutar una promoción pública hasta revisar el informe y recibir autorización. No activar facturación ni modificar el piloto para publicar esta candidata.
