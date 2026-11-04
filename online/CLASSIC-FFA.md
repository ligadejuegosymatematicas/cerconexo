# Clásico Online · cuatro equipos — candidata local

Base: `99156eb3b61142e32f9749189f72d0e12f3cf9e8`. Rama: `m6-clasico-ffa`.

## Contratos revisados y arquitectura aplicada

El motor oficial de Clásico está limitado a A/B en `territory`, `activeIds`,
la rotación y `applyTurn`. Sus funciones `regions`, `availableMoves`,
`wallOptions` y `validateTurn` sí operan sobre el grafo genérico de 49 casillas.
La geometría de Arena aplica la clasificación matemática solicitada, pero está
fijada a 81 casillas; no se importa como si aceptara tableros de otro tamaño.

`online/classic-ffa.mjs` reutiliza el BFS y el validador de turnos de Clásico,
clasifica las componentes por el número de equipos y añade la rotación A/B/C/D,
el registro irreversible de aseguramientos y la eliminación por tiempo.
No hay otro algoritmo de desplazamientos, muros ni búsqueda de componentes.
El adaptador conserva los mismos comandos, persistencia transaccional,
confirmaciones idempotentes y recuperación. El reglamento nuevo es
`classic-ffa-online-v1`; las salas anteriores mantienen su reglamento.

No se han encontrado contradicciones reglamentarias. El bloqueo general y la
resolución territorial coinciden en estados legales: toda ficha en una componente
compartida tiene un lado interior abierto, donde puede construir con cero pasos,
incluso si la casilla vecina está ocupada. Nunca se asignan puntos vacíos o
compartidos para resolver un bloqueo.

## Aseguramiento, tiempo y clasificación

Los asegurados conservan la ficha, las casillas y su puntuación. No se les asigna
decisión ni reloj activo. El registro `secured` conserva las casillas originales:
ninguna acción posterior puede cruzar sus muros ni introducir otra ficha.

Al vencer el reloj autoritativo se elimina únicamente el actor activo, se conserva
todo muro aceptado, se retira la ficha, se descarta su recorrido pendiente y se
recalculan componentes. Una alarma tardía no consume tiempo del actor siguiente.
Eliminado y asegurado son estados distintos; ser el último actor no da la victoria.
Los equipos asegurados siguen siendo supervivientes con derecho a ganar.

La clasificación usa el mismo componente puro que Arena: supervivientes por
puntuación, con empates de rango; después eliminados en orden inverso de
eliminación. Los eliminados nunca ganan. La revancha conserva el resultado anterior,
requiere las cuatro aceptaciones y reinicia tablero, relojes y eliminaciones.

## Aislamiento y clientes anteriores

`CLASSIC_FFA_ENABLED` queda desactivado en la configuración distribuible. Solo el
servidor local lo habilita expresamente. Un cliente debe anunciar `classic-ffa-v1`
para prepararse, jugar o aceptar una revancha de esta variante. Un cliente anterior
conserva su sesión y recibe una indicación para actualizar; las salas publicadas
de Clásico y Arena conservan sus capacidades anteriores.

El renderizador reutiliza el SVG, objetivos y teclado del tablero oficial; una
capa de presentación añade C/D y retira fichas eliminadas. La inspección de
regiones reutiliza el componente común de Arena. No se modifican motores,
guardados, CPU ni los recursos originales de las medallas.

## Prueba local

Desde la raíz, después de construir `docs/` mediante `scripts/build_pages.py`:

```
node online/scripts/ux-local.mjs --classic-ffa --arena-ffa
```

Abrir `http://127.0.0.1:8815/cerconexo/`, entrar a Clásico → Nueva partida →
Online → Crear sala → 1 vs. 1 vs. 1 vs. 1. Unirse con otros tres perfiles de
navegador y admitirlos como B/C/D. La API y SQLite son locales e independientes.
No conecta con Cloudflare ni publica recursos. Las credenciales privadas no se
incluyen en invitaciones ni evidencias.
