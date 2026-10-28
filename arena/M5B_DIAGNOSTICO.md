# Auditoría estratégica M5-A — propuestas para M5-B, sin implementación

Referencia: `arena/src/cpuStrategy.mjs` de `5afd939`. Se conserva íntegra en M5-A.1. Reproducción: `node arena/scripts/diagnose_cpu.mjs`; resultados completos en `validation/m5a1/strategy/results.json`.

## Método y límites

Ocho posiciones sintéticas: apertura por ficha/equipo, defensa de un puente, salto a región vacía, demolición de reconquista, descarte tras recogida, cierre terminal y ramificación con poderes. Todas las acciones se generan/aplican con el motor oficial. Son fixtures estratégicos, no registros de la partida del usuario ni pruebas de frecuencia de estos errores.

Se compara la misma búsqueda con 160 nodos / profundidad 6 / haz 6 y, solo para diagnóstico, 1.600 / 8 / 12. En esta comparación se omite el reloj mediante la opción existente `now`, para aislar profundidad y poda del rendimiento de la máquina. Una instrumentación en memoria cuenta expansiones sin alterar el módulo del juego. Por separado se realizan cinco decisiones por posición con el presupuesto real de 90 ms. No hay una nueva estrategia ni un nivel desplegable.

## Hallazgos demostrados

**No anticipa al rival.** La búsqueda detiene una rama al completar el turno propio o devolver una decisión a otro equipo. En las 16 comparaciones instrumentadas se expandieron cero acciones adversarias. Profundidad 6 significa acciones atómicas del propio turno, no seis turnos. La profundidad efectiva observada fue 3–5 acciones.

**Amenaza terminal sin defender.** En `defensa-puente` hay dos lados de 36 y 45 casillas conectados por una única abertura. A1 dispone de Demolición. La CPU A mueve de (4,4) a (5,4) y construye detrás de sí. B1 puede cerrar inmediatamente la abertura (5,5)–(5,4): el motor termina con A=36, B=45 y victoria de B. Es una derrota concreta verificable, no una valoración heurística.

Una alternativa legal es demoler (4,4)–(4,5) y construir (4,4)–(3,4). Entonces B no dispone de ningún muro final inmediato ganador: se ha abierto otra conexión. Esto demuestra que la amenaza inmediata era evitable; no demuestra que A gane a largo plazo. El evaluador prefiere conservar el poder en vez de pagar su coste para prevenir una pérdida futura que no examina: su evaluación inmediata baja de 3,3 a 0 tras esa demolición. Más presupuesto de la misma búsqueda no cambió la primera acción.

**Hay capacidades tácticas correctas.** Reconoce el salto que asegura una región vacía, la demolición que elimina una región exclusiva rival y el cierre terminal favorable. También considera combinaciones de poderes dentro del turno. Estos controles positivos impiden concluir que la CPU ignore todos los cierres o todos los poderes.

**Más nodos no corrigen la limitación estructural.** En los ocho fixtures la primera acción de ambas configuraciones fue la misma. Se exploraron 46–130 nodos con el haz de lanzamiento y 55–220 con el ampliado. No basta aumentar el tiempo si las respuestas adversarias siguen fuera del horizonte. No se deduce que ampliar el presupuesto nunca ayude en otras posiciones.

## Riesgos constatados en la fórmula, con impacto competitivo aún no demostrado

- El territorio actual vale 45 por casilla; movilidad 0,7 por salida. No hay un término explícito para amenazas de cierre, accesos rivales a un territorio o fragilidad de una conquista reversible.
- Los poderes almacenados valen cantidades fijas: Muro adicional 5, Demolición 4, Salto 3. La utilidad contextual, la capacidad futura y la posibilidad de utilizar un poder retenido por una ficha asegurada no se valoran explícitamente.
- La proximidad a un poder usa distancias del grafo abierto. Es correcta para conectividad, pero optimista para un recorrido que encuentra fichas ocupando casillas.
- El haz descarta alternativas por evaluación estática; los estados terminales se valoran correctamente cuando se alcanzan, pero un cierre futuro puede desaparecer antes de alcanzarlo.
- Los descartes usan sucesores oficiales y pueden comparar su continuación propia. Si devuelven el control al adversario, no se busca la respuesta ni el siguiente turno. El fixture de recogida conserva Muro adicional y descarta Salto; por sí solo no demuestra un descarte malo.
- No se demostró con estos ocho fixtures uso prematuro sistemático de poderes, mala defensa en todas las posiciones ni debilidad estadística frente a Clásico. Comparar porcentajes de dos juegos con tableros y reglas diferentes no sería una medición controlada.

## Propuestas priorizadas para M5-B

1. **Respuesta adversaria antes de subir presupuestos.** Evaluar al menos una intervención legal del rival en posiciones de cierre/reconquista. Añadir el contraejemplo del puente como regresión estratégica. Mantener descartes y cambios de propietario de decisión como nodos del equipo correcto.
2. **Amenazas territoriales y reversibilidad.** Priorizar cierres ganadores y respuestas a pérdidas inmediatas; distinguir puntuación actual de territorio defendible. Utilizar siempre componentes y acciones oficiales.
3. **Valor contextual de poderes/descartes.** Comparar poderes efectivamente utilizables, reconexiones útiles y pérdida de capacidad. Ampliar fixtures antes de cambiar pesos; no penalizar artificialmente un poder para producir una dificultad menor.
4. **Búsqueda acotada por turnos y tácticas.** Profundidad progresiva, ordenación, detección de repeticiones y una frontera mínima de respuestas críticas. Medir nodos, cobertura y tiempo en Worker/fallback antes de aumentar límites.
5. **Evaluación competitiva controlada.** Partidas con ambos equipos, políticas, semillas y rivales fijos. Separar legalidad/completitud de fuerza, reportar diferencias territoriales y percentiles. Incluir Android físico. Introducir niveles solo después de calibrar una estrategia base sólida.

No se implementa ninguna de estas propuestas en M5-A.1. La presentación más lenta facilita observar decisiones; no las convierte en decisiones estratégicamente mejores.
