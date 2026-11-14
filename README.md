# Sala Libre · San Joaquín

Buscador de salas sin clases programadas en la USM, campus Santiago San Joaquín. Funciona con un sitio estático, sin instalar dependencias.

```sh
python3 -m http.server 8000 --directory docs
```

Abre [http://localhost:8000](http://localhost:8000). Para publicar en GitHub Pages, usa **Settings → Pages → Deploy from a branch → main → /docs**.

## Horario de 2026-2

La [página Horario USM](https://alviniscrack.github.io/horario-usm/) muestra 518 ramos y 1.110 paralelos en **Crear horario → Santiago San Joaquín → Diurna → 2026-2**. El catálogo importado coincide con el listado visible en siglas y número de paralelos por ramo. La [revisión fuente](https://github.com/AlvinIsCrack/horario-usm/commit/d4cbbc20598c65294cc19a610dba8fc4f0564af5) corresponde al horario del 13 de noviembre de 2026 a las 12:52 (hora de Santiago). Se verificó el hash publicado del archivo y se conservaron todas las asignaciones originales.

| Control | Resultado |
| --- | ---: |
| Ramos | 518 |
| Paralelos | 1.110 |
| Bloques del catálogo de San Joaquín | 4.094 |
| Paralelos sin horario publicado | 143 |
| Bloques del catálogo sin sala | 25 |
| Bloques locales sin sala identificada | 21 |
| Bloques adicionales con sala en San Joaquín, publicados en Santiago (Vesp. JMC) | 177 |
| Espacios con horario de San Joaquín en la fuente | 100 |
| Aulas consultables | 53 |
| Espacios por revisar, conservados en el inventario | 30 |
| Salas que figuran solo en el mapa, sin horario asociado | 6 |

Las coincidencias de sala, día y bloque entre paralelos conservan todos los registros y se consideran ocupadas. Hay cuatro bloques del catálogo cuya sede de clase figura en Valparaíso. El registro de TUMA Vitacura tiene etiquetas de sede que discrepan y está marcado para revisión.

## Uso y ubicación

- Cada bloque numerado dura 35 minutos. Si la consulta parte a las 13:30, el bloque 8 ya está en curso y el bloque 9 comienza a las 14:40. El filtro cuenta bloques completos que caben desde la hora seleccionada hasta la próxima clase. La duración en horas y minutos mide el tiempo continuo restante, incluidos los recreos y el almuerzo cuando la sala sigue libre.
- La franja se acota al primer bloque y a la última clase con sala registrada ese día en el campus. La próxima clase puede aparecer en otro día de la semana. «Ahora» usa la hora de Santiago y las fechas diurnas del [calendario académico](https://dee.usm.cl/calendario-academico-estudiantes/). La consulta semanal sigue disponible para consultar períodos anteriores.
- Se transcribieron edificio, piso y posiciones aproximadas desde los cuatro planos de «Soy el mapa». El orden por cercanía usa la posición relativa en el plano y el cambio de piso. F406 figura dos veces en el mapa y F411 está en el horario con ubicación exacta pendiente. Ambas tienen clases regulares y están disponibles para consulta con una nota de ubicación.
- Los códigos indicados por el usuario y las salas KS quedan excluidos. Los subcódigos B022A, B022B, B023A y B023B están en revisión. El mapa y el horario dicen K305 y K306 donde la lista menciona B305 y B306. Los cuatro códigos quedan documentados. [Informática USM identifica B049, K203 y K204 como laboratorios](https://informatica.usm.cl/noticias/inauguracion-laboratorios-san-joaquin/).
- Los resultados reflejan el horario publicado. Las reservas, cambios del día y acceso físico dependen de la universidad.

## Actualizar el semestre

1. Selecciona Santiago San Joaquín y el semestre en Horario USM. Identifica la revisión de origen que corresponde al catálogo visible y comprueba su total de ramos y paralelos.
2. Ejecuta la importación. Si tienes el repositorio fuente clonado, puedes pasar `--repo-local RUTA`.

   ```sh
   python3 scripts/importar_horario.py --semestre 2026-2 \
     --revision d4cbbc20598c65294cc19a610dba8fc4f0564af5 \
     --ramos-esperados 518 --paralelos-esperados 1110
   ```

3. Revisa `validacion` y `salas` en el JSON generado. Las salas nuevas sin ubicación o tipo comprobado quedan en revisión. Edita `docs/data/campus.json` y vuelve a importar si confirmas correcciones del mapa, alias o exclusiones.
4. Cambia el semestre y las fechas en `docs/data/periodo.json`. Abre la página y compara un par de resultados con la cuadrícula de Horario USM antes de publicar.

El archivo `docs/data/horario-AAAA-S.json` conserva las asignaturas, los paralelos, los docentes del paralelo y del bloque, el día, la hora de inicio y término, el número de bloque y la sala. La jornada vespertina de otra sede solo aporta bloques cuyo destino es San Joaquín. Los horarios sin asignación conservan los campos que sí publica la fuente.
