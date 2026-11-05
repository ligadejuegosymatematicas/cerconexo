# CERCONEXO Clásico Online · cuatro equipos

Candidata local del 4 de noviembre de 2026. Rama `m6-clasico-ffa`, worktree
`Cerconexo_M6_Clasico_FFA`, basada en la versión pública `99156eb`.

## Implementación

- 7 × 7, equipos A/B/C/D, posiciones (2,2), (2,6), (6,6), (6,2).
- Una persona por ficha; rotación por ficha y cinco minutos individuales.
- Desplazamientos irreversibles de cero, uno o dos pasos y un muro obligatorio.
- Componentes exclusivas por un equipo: su extensión íntegra; compartidas y
  vacías: cero puntos, incluido bloqueo general.
- Aseguramiento irreversible: conserva ficha, territorio, puntos y derecho a ganar;
  omite turnos y detiene el consumo de su reloj.
- Eliminación autoritativa por tiempo: retira la ficha y su recorrido pendiente,
  conserva muros y recalcula componentes. El eliminado no puede ganar ni regresar.
- Continuidad, inspección, avisos y revancha con cuatro aceptaciones y cuenta atrás.

Se mantienen los comandos y el almacenamiento transaccional existentes. La
clasificación reutiliza el componente puro de Arena: supervivientes por puntuación
con puestos compartidos; después eliminados en orden inverso de eliminación.
El reglamento y los contratos revisados se detallan en [CLASSIC-FFA.md](CLASSIC-FFA.md).

Commits de implementación:

- `1b70798`: variante, adaptador, relojes, permisos, compatibilidad y 15 pruebas.
- `7732bb8`: selector, tablero, cuatro colores/relojes, inspección y guiones locales.

## Validación

La ejecución consolidada aprobó **466 pruebas automatizadas** sin fallos:
314 de Clásico/Arena y 152 online (137 anteriores y 15 nuevas).
Las **21 suites históricas de navegador aprobaron**, incluidas CPU Arena,
guardados, teclado, animaciones, movimiento reducido y HTML autónomos.
No se modificaron aserciones ni expectativas históricas.

Las 15 pruebas nuevas incluyen 12 partidas puras completas, componentes de dos,
tres y cuatro equipos, empate, bloqueo, eliminación sucesiva, alarmas repetidas y
tardías, permisos, reconexión, navegación sin pausa y revanchas incompatibles.
La propiedad de irreversibilidad se verifica también enumerando todos los turnos
legales siguientes a un aseguramiento, y después de una eliminación.

Dos partidas con cuatro contextos independientes de Edge, conectados mediante
WebSockets reales al Worker local:

| Partida | Turnos / muros | A | B | C | D | Vacías | Resultado |
|---|---:|---:|---:|---:|---:|---:|---|
| Semilla 0 | 34 | 1 | 1 | 2 | 37 | 8 | Gana D; A/B comparten el tercer puesto |
| Semilla 7 | 24 | 1 | 6 | 2 | 1 | 39 | Gana B; A/D comparten el tercer puesto |

Ambas comprobaron pasos de 0/1/2, igualdad del tablero y marcadores entre clientes,
recarga parcial, sustitución de sesión concurrente, acción duplicada, jugada ilegal,
reinicio real de workerd conservando SQLite, inspección de C/D y revancha unánime.
Un cálculo independiente de componentes comprobó la puntuación mostrada.
No hubo errores JavaScript ni recursos HTTP faltantes.

Además se esperó un vencimiento real de cinco minutos durante un paso parcial.
A fue eliminado, desapareció su ficha y B recibió la decisión; B/C/D conservaban
300.000 ms al habilitarse la decisión siguiente. No se aceleró el reloj del servidor.

Un caso específico confirma que un equipo A asegurado con 28 puntos gana frente
al último actor D con 21, tras eliminarse B/C. A conserva sus cinco minutos.
El tablero completamente bloqueado conserva cuatro puntos exclusivos y 45 vacíos,
con empate entre los cuatro equipos: no reparte las casillas vacías.

## Compatibilidad y aislamiento

Se crearon siete salas con el Worker anterior, cuyo archivo tiene el mismo hash
que en `99156eb`, y se recuperaron con la candidata sobre el mismo SQLite local:

- Clásico 1 vs. 1 por ficha y por equipo; 2 vs. 2 por ficha.
- Arena 1 vs. 1 por ficha y por equipo; 2 vs. 2 y cuatro equipos por ficha.

Todas conservaron identidad, fichas, recorrido parcial y tiempos; después pudieron
construir y continuar. Las pruebas de salas antiguas retiradas siguen verificando
su recuperación sin conversión y la restricción de nuevas revanchas.

Auditoría: 32 hashes protegidos y 56 archivos nativos de `src`, `arena/src` y
`arena/assets` idénticos a la base, incluidas CPU, medallas, animaciones y guardados.
Los archivos de configuración de Wrangler y dependencias permanecen idénticos.
El inventario generado contiene 85 recursos, dos módulos públicos más que la base;
no incluye servidor, pruebas, credenciales ni directorios de ejecución.

Se comprobó además el aislamiento de estilos a 360, 390 y 1440 píxeles:
Arena conserva las medidas y colores anteriores; las reglas nuevas se aplican
únicamente al tablero de Clásico de cuatro equipos.

No se efectuó push, PR, merge, publicación ni actualización de Cloudflare. El piloto,
los namespaces, las salas públicas y la facturación permanecen sin modificaciones.
El indicador público `CLASSIC_FFA_ENABLED` está desactivado; el laboratorio lo
habilita expresamente y utiliza almacenamiento independiente.

## Cómo probar

En la raíz de este worktree, con las dependencias locales de M6 disponibles:

```
node online/scripts/ux-local.mjs --classic-ffa --arena-ffa
```

Abrir `http://127.0.0.1:8815/cerconexo/` → Clásico → Nueva partida → Online →
Crear sala → 1 vs. 1 vs. 1 vs. 1. Admitir B/C/D desde tres perfiles de navegador
independientes; todos marcan «Estoy listo» y el anfitrión inicia. Detener con Ctrl+C.
La API está en loopback y no utiliza el backend público.

Guiones reproducibles:

```
node online/scripts/classic-ffa-browser.mjs --timeout
node online/scripts/classic-ffa-browser.mjs --seed 7
node online/scripts/classic-ffa-audit.mjs
```

La comprobación opcional `classic-ffa-compatibility.mjs --legacy-worker RUTA` acepta
un archivo del Worker anterior para repetir la recuperación entre versiones.

Capturas y registros locales, excluidos del paquete público:

- `online/evidence/classic-ffa/`: primera partida y vencimiento real.
- `online/evidence/classic-ffa/seed-7/`: segunda partida y capturas definitivas.
- `online/evidence/classic-ffa/compatibility.json`: siete recuperaciones entre versiones.
- `validation/integration/suites/`: registros individuales de las suites históricas.

## Pendiente

Validación física con cuatro dispositivos y redes distintas; las capturas móviles
proceden de emulación de Android en Edge. La vibración física y el funcionamiento
con pantalla bloqueada no se declaran comprobados. HTTPS/WSS remoto y publicación
requieren la siguiente autorización; esta candidata se ha validado localmente.
