# Propuesta de publicación experimental de Arena M3-B

**No ejecutada. Requiere aprobación posterior.** Esta entrega no hace push, PR, merge ni modifica `docs/` o GitHub Pages.

La ruta propuesta es `https://ligadejuegosymatematicas.github.io/cerconexo/arena/`. Es compatible con Pages desde `main` y `/docs`: `docs/index.html` seguirá siendo Premium y `docs/arena/index.html` será Arena. No se propone sustituir la portada Premium ni añadirle enlaces en esta revisión.

## Ensayo local disponible

Desde el repositorio completo:

```sh
python arena/scripts/build_pages.py
python arena/scripts/build_pages.py --check
python -m http.server 8080 --bind 127.0.0.1 --directory arena/staging/pages
```

Para reproducir exactamente el prefijo `/cerconexo/`, la prueba `node arena/tests/m3b.browser.cjs` monta ese directorio en dicho prefijo. El servidor Python sencillo anterior permite probar `/arena/` con la misma estructura relativa. No es una publicación.

El ensayo contiene **42 archivos**: los **32 recursos Premium, sin cambiar un byte**, y los **10 recursos de ejecución de Arena**, enumerados en `arena/scripts/pages-files.json`. Se excluyen pruebas, informes, diagnósticos, ZIP y evidencias. Todos los imports, estilos y la marca usan rutas relativas. Se verifican entrada directa, `/index.html`, recursos MIME y convivencia bajo el mismo origen.

## Cambio concreto propuesto para una futura PR autorizada

1. Añadir al manifiesto público raíz las diez entradas del manifiesto Arena, con prefijo `arena/`.
2. Permitir registrar `docs/arena/` en `.gitignore`, regenerar `docs/` con el empaquetador existente y mantener idénticos los 32 archivos Premium actuales. El comprobador raíz actual rechaza extras: **no copiar manualmente Arena a `docs/` antes de adaptar el manifiesto**.
3. Incluir las pruebas Arena en la comprobación de CI, conservar las pruebas Premium y verificar los hashes de los 32 recursos anteriores. Añadir la comprobación del subdirectorio al proceso de validación de la publicación.
4. Revisar una PR `desarrollo` → `main` exclusivamente con el candidato autorizado y esperar sus controles. Fusionar solo con autorización. Pages seguirá publicando desde `main` y `/docs`; no se cambia su configuración ni se activan despliegues desde `desarrollo`.
5. Verificar la raíz Premium y la ruta Arena por HTTPS después del despliegue, con sus recursos equivalentes a las fuentes aprobadas.

Esta ampliación del manifiesto y del flujo de CI está descrita, **no aplicada**. Así la revisión local de M3-B no altera la versión Premium ni su paquete publicable.

## Datos y límites

- Arena conserva la clave `cerconexo-arena-m3a-v1` y el formato de diario original. Los guardados de M3-A en el mismo origen siguen siendo válidos; no hay migración destructiva.
- Premium conserva `wallgo-league-v2` y sus preferencias. La inspección no escribe en ninguna clave.
- Un HTML `file://`, localhost y GitHub Pages son orígenes diferentes: una partida guardada localmente no aparecerá automáticamente en Pages.
- No hay service worker nuevo, recursos CDN, bibliotecas externas, CPU ni online en Arena.
- Probar Android físico antes de considerarlo una versión definitiva. En 320×568 y ventanas excepcionalmente pequeñas se permite scroll accesible, sin recortar contenido.
