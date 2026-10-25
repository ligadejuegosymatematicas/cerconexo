# Reglamento completo de Cerconexo

Consulta opcional. Transcripción sin cambios de las reglas de M4 (`0b7f046`).

## Clásico

Tablero 7 × 7, con A1 en (2,2), B1 en (2,6), A2 en (6,6) y B2 en (6,2). Inicialmente no hay muros interiores.


Por ficha: A1 → B1 → A2 → B2. Se alternan fichas activas dentro de cada equipo. Si una se asegura, su compañera ocupa los turnos del equipo.


Por equipo: A y B alternan; cada equipo elige una ficha activa, que puede repetirse en sus turnos. Antes de mover puede cambiar su elección; después del primer paso queda fijada.


Se permiten 0, 1 o 2 pasos ortogonales, sin atravesar muros ni fichas. Se puede girar o regresar al origen con el segundo paso: ambos pasos quedan consumidos. Cada paso es definitivo, también al recargar.


El turno termina construyendo exactamente un muro en un lado interior libre de la casilla final. Se puede construir entre casillas ocupadas. No se puede deshacer un paso ni el muro.


Una región con fichas de un solo equipo puntúa todas sus casillas una única vez, aunque contenga sus dos fichas. Una región sin fichas no puntúa. Las regiones con ambos equipos siguen en disputa.


Las fichas en regiones exclusivas quedan aseguradas y no vuelven a participar en Clásico. Permanecen en el tablero.


La partida termina cuando no hay regiones con ambos equipos. Gana quien aseguró más casillas; si hay igualdad, hay empate. La CPU respeta las mismas reglas.

## Arena

Asegura regiones para obtener sus casillas. Una región con dos o más equipos sigue en disputa; una región vacía no puntúa.


    Elige y muévete. En tu turno puedes dar 0, 1 o 2 pasos ortogonales sin atravesar muros ni fichas. Puedes girar o regresar al origen usando el segundo paso. Cada paso es definitivo.


      Recoge y usa poderes. Entrar en una casilla especial la desactiva y recoge su poder inmediatamente. Puedes usar varios poderes en un turno. Demolición y Muro adicional no gastan pasos; Salto gasta uno. Todos se aplican sobre lados interiores adyacentes.


      Construye. Si sigues activo, termina construyendo un muro en un lado interior libre de tu casilla. Puede haber una ficha al otro lado. Si quedas asegurado, tu turno termina inmediatamente sin exigir ese muro.


      El territorio puede cambiar. Demolición puede unir regiones y reactivar fichas. Un Salto puede cambiar su ocupación sin cambiar los muros. Los puntos se recalculan después de cada acción; puedes perder territorio antes asegurado.


      Resuelve el inventario. Por ficha y con cuatro equipos cabe un poder por ficha, conservado al asegurarse. Por equipo caben tantos poderes como fichas activas tenga. El dueño elige qué descartar si sobra capacidad, aunque se interrumpa un turno rival. El poder recién recogido también puede rechazarse.


      Final. Al desaparecer la última región compartida termina la partida. Gana quien tiene más casillas exclusivas; puede haber empate. No se solicitan descartes después del final.


    Demolición elimina un muro interior adyacente sin gastar pasos. Salto cruza un muro intacto hacia la casilla ortogonal contigua libre: no lo destruye y consume un paso. Muro adicional construye sin gastar pasos y permite continuar; si sigues activo, aún debes construir el muro final.


    Una ficha está activa si comparte componente con algún rival. Puede asegurarse y reactivarse. Asegurada conserva su inventario individual, pero no puede usarlo hasta reactivarse. La capacidad compartida es el número de fichas activas; el afectado decide sus descartes antes de continuar, incluso durante un turno rival.


    Tras cada acción se resuelven territorios y actividad. Si termina la partida se presenta el resultado sin descartes irrelevantes; en otro caso se ajustan capacidades, se resuelven descartes y se recoge el poder visitado, que puede rechazarse si no cabe. La casilla queda desactivada igualmente.


    Las cuatro posiciones iniciales son (2,2), (2,8), (8,8) y (8,2), sin muros interiores. Por ficha: A1 → B1 → A2 → B2. Por equipo: A → B, eligiendo una ficha activa; al actuar queda comprometida. Con cuatro equipos: A → B → C → D, omitiendo fichas aseguradas.


    La configuración inicial añade oleadas después de las intervenciones completadas 8 y 16, si sigue la partida. Solo aparecen en casillas libres de componentes compartidas, sin reemplazar fichas ni poderes. Si no existe un conjunto simétrico válido, esa oleada no aparece.


    Los poderes descartados no se recuperan al aumentar la capacidad. Un muro no siempre divide una región: puede existir otro camino abierto. Las casillas de una región se cuentan una vez, aunque contenga varias fichas del mismo equipo.
