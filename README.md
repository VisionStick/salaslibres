# Sala Libre · San Joaquín

Buscador de salas sin clases programadas en la USM, campus Santiago San Joaquín. Funciona con un sitio estático, sin instalar dependencias.

```sh
python3 -m http.server 8000 --directory docs
```

Abre [http://localhost:8000](http://localhost:8000). Para publicar en GitHub Pages, usa **Settings → Pages → Deploy from a branch → main → /docs**.

## Horario de 2026-2

La [página Horario USM](https://alviniscrack.github.io/horario-usm/) muestra 518 ramos y 1.110 paralelos en **Crear horario → Santiago San Joaquín → Diurna → 2026-2**. Se contrastaron las asignaciones de sala, día y bloque con los datos que carga la página. La importación conserva esas asignaciones y usa la [revisión fuente del 16 de noviembre de 2026 a las 14:49, hora de Santiago](https://github.com/AlvinIsCrack/horario-usm/commit/07eeddcf82cacd07b0f83e7980f99e8be9aefa91).

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

- El buscador y el mapa permiten consultar una hora exacta en formato de 24 horas o el inicio de uno de los 20 bloques numerados. Cada bloque dura 35 minutos. El filtro cuenta los bloques completos que caben a partir del momento consultado.
- Durante los recreos de 10 y 15 minutos, la búsqueda muestra el inicio del siguiente bloque. Los recreos se descuentan y la franja de almuerzo cuenta si la sala sigue sin clase. Para convertir los números de bloque en horas se usa la tabla de la [Guía de Estudiante USM 2026](https://dee.usm.cl/wp-content/uploads/2025/12/2026-Gui%CC%81a-de-Estudiante-.pdf).
- La franja se acota al primer bloque y a la última clase con sala registrada ese día en el campus. La próxima clase puede aparecer en otro día de la semana. «Ahora» usa la hora de Santiago y las fechas diurnas del [calendario académico](https://dee.usm.cl/calendario-academico-estudiantes/). La consulta semanal sigue disponible para consultar períodos anteriores.
- El orden por cercanía usa la posición aproximada en los cuatro planos de «Soy el mapa» y el cambio de piso. F411 está junto a F405 y F402, en el cuarto piso del edificio F, según la referencia indicada por el usuario. F406 figura dos veces en el mapa y requiere confirmar su ubicación exacta.
- Los códigos indicados por el usuario y las salas KS quedan excluidos. Los subcódigos B022A, B022B, B023A y B023B están en revisión. El mapa y el horario dicen K305 y K306 donde la lista menciona B305 y B306. Los cuatro códigos quedan documentados. [Informática USM identifica B049, K203 y K204 como laboratorios](https://informatica.usm.cl/noticias/inauguracion-laboratorios-san-joaquin/).
- Los resultados muestran salas sin clase programada. El mapa permite consultar todas las clases publicadas de cada sala para el día elegido. El buscador y el mapa avisan cuando el bloque contiene alguna clase a la que la fuente no le asigna sala.

## Actualizar el semestre

1. Selecciona Santiago San Joaquín y el semestre en Horario USM. Identifica la revisión de origen que corresponde al catálogo visible y comprueba su total de ramos y paralelos.
2. Ejecuta la importación. Si tienes el repositorio fuente clonado, puedes pasar `--repo-local RUTA`.

   ```sh
   python3 scripts/importar_horario.py --semestre 2026-2 \
     --revision 07eeddcf82cacd07b0f83e7980f99e8be9aefa91 \
     --ramos-esperados 518 --paralelos-esperados 1110
   ```

3. Revisa `validacion` y `salas` en el JSON generado. Las salas nuevas sin ubicación o tipo comprobado quedan en revisión. Edita `docs/data/campus.json` y vuelve a importar si confirmas correcciones del mapa, alias o exclusiones.
4. Si cambia el semestre, revisa la tabla de la guía oficial en `scripts/importar_horario.py` y actualiza las fechas en `docs/data/periodo.json`. Abre la página y compara los resultados con los bloques de Horario USM y las horas de la guía oficial antes de publicar.

El archivo `docs/data/horario-AAAA-S.json` conserva las asignaturas, los paralelos, los docentes del paralelo y del bloque, el día, la hora de inicio y término, el número de bloque y la sala. La jornada vespertina de otra sede solo aporta bloques cuyo destino es San Joaquín. Los horarios sin asignación conservan los campos que sí publica la fuente.
