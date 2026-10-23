> Integración actual: Arena continúa con motor y guardado independientes, pero comparte portada y empaquetador con Clásico. Ver [INTEGRACION.md](../INTEGRACION.md). Los apartados siguientes documentan las entregas M3-A/M3-B originales; el manifiesto de publicación vigente es `../scripts/pages-files.json`.

# CERCONEXO ARENA — revisión experimental M3-B

Aplicación local independiente. No reemplaza Premium, no importa su motor y no forma parte del paquete de GitHub Pages. Sirve para probar las reglas, no constituye una versión definitiva de Arena.

## Jugar

Abre `Cerconexo_Arena_M3B.html` en un navegador moderno. Contiene código, estilos y la marca oficial, sin recursos de red. El guardado depende de que el navegador permita almacenamiento local; los guardados de un archivo local, localhost y otro dispositivo no se transfieren automáticamente.

Para las fuentes modulares, inicia un servidor desde esta carpeta y abre su raíz:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

No es necesario instalar bibliotecas para jugar. Los controles disponibles se presentan directamente en el tablero: casillas para pasos, bordes para el muro final y fichas para elegir actor en turnos por equipo. Para usar un poder, selecciona su botón y después un objetivo del tablero. «Volver a mover o construir» abandona solo la herramienta seleccionada: no revierte ninguna acción ejecutada.

## Reglas implementadas

- Tablero 9×9, sin muros interiores iniciales. Posiciones (2,2), (2,8), (8,8), (8,2).
- 2 vs. 2: A1 y A2 frente a B1 y B2. Por ficha: A1 → B1 → A2 → B2, omitiendo fichas aseguradas y redistribuyendo dentro del equipo. Por equipo: A → B, elección libre de una ficha activa al comienzo. La primera acción ejecutada compromete la ficha, incluido un poder que no consume pasos.
- Cuatro equipos independientes: A → B → C → D en sentido horario. Una ficha por equipo. Los equipos asegurados se omiten y vuelven a ser elegibles inmediatamente si se reactivan antes del final.
- Cada intervención admite 0–2 pasos ortogonales, incluidos giro y regreso al origen. Los pasos ejecutados son definitivos.
- El muro final se construye sobre un lado interior libre de la casilla actual, incluso si al otro lado hay una ficha. Termina la intervención. No se exige si una acción asegura al actor.
- Demolición retira un muro interior adyacente; no consume pasos. Salto cruza un muro interior hacia una casilla contigua desocupada, sin destruirlo, y consume un paso. Muro adicional construye un muro interior adyacente sin consumir pasos. Se pueden usar varios poderes disponibles antes, entre y después de los dos pasos.
- Se recalcula el estado territorial después de cada acción: compartido con dos o más equipos, exclusivo con uno, vacío sin fichas. Solo puntúan las regiones exclusivas, una vez por región. Los puntos pueden disminuir y recuperarse. La actividad no es irreversible.
- Al no quedar componentes compartidas termina inmediatamente la partida. Gana el máximo de casillas exclusivas; hay empate si varios equipos comparten ese máximo. No se solicita ningún descarte posterior al final.

## Inventarios y orden de resolución

En turnos por ficha y cuatro equipos cada ficha conserva como máximo un poder, incluso asegurada. No puede utilizarlo hasta reactivarse.

En turnos por equipo el inventario es compartido y su capacidad es el número real de fichas activas. Una pérdida de capacidad abre una decisión manual del dueño. Si el afectado es el rival del actor, se pausa la intervención y después vuelve el mismo actor con sus pasos y acciones ya consumidos. La capacidad recuperada no repone poderes descartados.

Una visita desactiva inmediatamente la casilla especial. El motor conserva temporalmente el objeto recogido hasta poder resolverlo. Orden: acción → territorio/actividad/puntos → final, si corresponde → capacidad y descartes → recolección, con elección de qué conservar si no cabe → continuación o cierre del turno. Se permite descartar el poder recién recogido. Elegir la herramienta de un poder no lo consume; aplicarlo sí.

## Apariciones experimentales configurables

`src/config.mjs` define los valores propuestos. También pueden editarse en Nueva partida → Parámetros experimentales, antes de empezar. El JSON usa índices 0–80 por filas, tipos `demolition`, `jump`, `extraWall`, y no modifica la geometría ni las reglas.

| Modalidad | Inicio | Tras completar turno 8 | Tras completar turno 16 | Máximo previsto |
| --- | --- | --- | --- | --- |
| 2 vs. 2 | 2 Demoliciones, 2 Saltos, 2 Muros adicionales | 2 Saltos | 2 Demoliciones | 10 |
| Cuatro equipos | 4 Muros adicionales | 4 Saltos | 4 Demoliciones | 12 |

2 vs. 2 comienza con Demolición en (3,3)/(3,7), Salto en (7,3)/(7,7), Muro adicional en (5,4)/(5,6). Cuatro equipos comienza con Muro adicional en (3,3)/(3,7)/(7,7)/(7,3).

Las oleadas consideran únicamente casillas desocupadas, sin poder activo y en componentes compartidas. Buscan parejas reflejadas verticalmente o conjuntos rotacionales de 90°. Deben caber todos los conjuntos previstos: no aparece una oleada parcial. Si no hay conjunto completo, se omite y registra. El criterio determinista `center-first` prioriza cercanía Manhattan al centro y luego orden de índices; `row-major` usa el orden de índices. El centro y las casillas fijas de una reflexión no cuentan como parejas completas.

El motor conserva internamente casillas, omisiones y distancias del grafo abierto a las fichas; no hay registro técnico en la interfaz de juego. Las distancias ignoran la ocupación temporal por otras fichas; `sin camino` significa otra componente. La simetría no garantiza igual accesibilidad ni equilibrio competitivo.

## Arquitectura y guardado

- `geometry.mjs`: vecindad ortogonal 9×9 y única clasificación de componentes/puntos de Arena.
- `config.mjs`: configuraciones y validación de parámetros experimentales.
- `engine.mjs`: acciones legales, poderes, actividad, inventarios, decisiones pendientes, oleadas y políticas locales. API pura: `createArena`, `legalArenaActions`, `applyArena`.
- `session.mjs`: diario validado de comandos, persistencia y recuperación.
- `app.mjs`: tablero, controles, mensajes y diálogos. No decide puntos, legalidad ni turnos.

La clave `cerconexo-arena-m3a-v1` es independiente de `wallgo-league-v2` y de las preferencias de Premium. Cada acción se calcula en una copia, se guarda mediante una única escritura y solo entonces pasa a la interfaz. Se guardan la configuración inicial y todos los comandos, incluidos descartes y selecciones; al recargar se reconstruyen con el motor. Así se recuperan pasos, poderes consumidos, visitas, pausas de descarte y el resultado sin confiar en un tablero arbitrario almacenado. La selección de ficha no cuenta como intervención completada. Si la escritura falla, la acción no se confirma. Un diario dañado se conserva sin sobrescribirlo automáticamente y se ofrece iniciar otra partida de Arena.

El formato es propio de Arena; no migra ni abre guardados de Premium. No hay temporizadores que puedan aplicar una acción antigua después de un reinicio.

## Construcción y pruebas

```sh
python build.py
node --test tests/*.test.mjs
node tests/browser.cjs
```

Las pruebas de navegador requieren Playwright y Edge, solo para desarrollo. `CERCONEXO_PLAYWRIGHT_PATH` permite usar una instalación existente. Los resultados y capturas se generan en `evidence/`. La grabación de vídeo es opcional mediante `CERCONEXO_RECORD_VIDEO=1` y requiere el FFmpeg de Playwright.

Desde la raíz Premium, se usan `python arena/build.py`, `node --test arena/tests/*.test.mjs` y `node arena/tests/browser.cjs`. No ejecutar los empaquetadores de Premium para incluir Arena: su manifiesto público permanece intacto.

## Límites del prototipo

- Interfaz funcional, sin animaciones elaboradas, sonidos, CPU ni online. La prioridad es probar las reglas.
- En las resoluciones móviles principales se compactan inventarios y descartes; la guía se abre en un panel temporal. En ventanas excepcionalmente pequeñas se conserva desplazamiento accesible. El tablero no cambia de tamaño al seleccionar o confirmar acciones.
- Los objetivos de un tablero 9×9 son más pequeños que los de Premium 7×7; falta evaluación física de precisión en Android/iOS.
- Teclado mediante Tab, Enter/Espacio y flechas entre objetivos legales; no equivale todavía a una auditoría con lectores de pantalla reales.
- El diario se reproduce entero al cargar. Es adecuado para el prototipo finito de poderes y paredes; no es un sistema de historial navegable ni de seguridad contra manipulación de archivos.
- Las apariciones y la política de prioridad espacial son experimentales; no se afirma equilibrio entre modalidades o posiciones.
- Al confirmar una acción se guarda antes de presentarla. Cerrar el navegador antes de que reciba el gesto no puede registrarse como una acción ejecutada.

Sin publicación, PR ni fusión. Premium conserva sus fuentes, motor, guardados y paquete público.

## M3-B: consulta y propuesta de publicación

Ver INFORME_M3B.md y PUBLICACION_M3B.md. Inspeccionar regiones es una consulta temporal sobre las componentes del motor, sin acciones ni escrituras. La guía y el inventario usan los mismos SVG originales. El núcleo y la clave de guardado M3-A no cambian. Las pruebas nuevas se ejecutan con node tests/m3b.browser.cjs después de preparar el ensayo mediante python scripts/build_pages.py desde este directorio dentro del repositorio Premium. El ensayo no modifica docs/.
