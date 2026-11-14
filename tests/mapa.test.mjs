import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buscarSalas, coberturaConsulta, evaluarAulas, minutos, prepararHorario, proximaClaseEnPeriodo, relojCampus, resolverConsulta } from '../docs/disponibilidad.mjs';
import { colorSala } from '../docs/mapa.mjs';
import { CAMPUS, POSICIONES, SECTORES } from '../docs/plano-campus.mjs';

const datos = JSON.parse(readFileSync(new URL('../docs/data/horario-2026-2.json', import.meta.url)));
const horario = prepararHorario(datos);
const consulta = (dia, hora) => ({ dia, desde: minutos(hora) });
const estadoF411 = (dia, hora) => evaluarAulas(horario, consulta(dia, hora)).get('F411');

test('las 53 aulas del semestre se encuentran por piso y conservan sus códigos', () => {
  assert.equal(horario.aulas.length, 53);
  assert.deepEqual([1, 2, 3, 4].map(piso => horario.aulas.filter(sala => sala.piso === piso).length), [27, 9, 5, 12]);
  assert.equal(new Set(horario.aulas.map(sala => sala.codigo)).size, 53);
  assert.deepEqual(horario.aulas.filter(sala => !POSICIONES[sala.codigo]).map(sala => sala.codigo), ['F406']);
  assert.match(horario.aulas.find(sala => sala.codigo === 'F406').notaUbicacion, /dos puntos del piso 4/);
  assert.equal(Object.keys(POSICIONES).length, 52);
  assert.equal(POSICIONES.F411[1], POSICIONES.F405[1]);
  assert.equal(POSICIONES.F411[1], POSICIONES.F402[1]);
  assert(POSICIONES.F405[0] < POSICIONES.F411[0] && POSICIONES.F411[0] < POSICIONES.F402[0]);
});

test('en el tamaño mínimo, los marcadores no se superponen ni salen del plano por piso o edificio', () => {
  const anchoBoton = 47;
  const altoBoton = 32;
  for (const piso of [1, 2, 3, 4]) {
    for (const [edificio, vista] of [['', CAMPUS], ...Object.entries(SECTORES)]) {
      const escala = .74;
      const marcadores = horario.aulas.filter(sala => sala.piso === piso && (!edificio || sala.edificio === edificio))
        .filter(sala => POSICIONES[sala.codigo]);
      for (const [i, sala] of marcadores.entries()) {
        const [x, y] = POSICIONES[sala.codigo];
        assert((x - vista.x) * escala >= anchoBoton / 2, sala.codigo + ' borde izquierdo');
        assert((vista.x + vista.ancho - x) * escala >= anchoBoton / 2, sala.codigo + ' borde derecho');
        assert((y - vista.y) * escala >= altoBoton / 2, sala.codigo + ' borde superior');
        assert((vista.y + vista.alto - y) * escala >= altoBoton / 2, sala.codigo + ' borde inferior');
        for (const otra of marcadores.slice(i + 1)) {
          const [ox, oy] = POSICIONES[otra.codigo];
          assert(Math.abs(x - ox) * escala >= anchoBoton || Math.abs(y - oy) * escala >= altoBoton,
            sala.codigo + ' se superpone con ' + otra.codigo);
        }
      }
    }
  }
});

test('F411 pasa de amarillo a rojo y a verde en el límite exacto del horario', () => {
  const corta = estadoF411(1, '12:15');
  assert.equal(corta.completos, 2);
  assert.equal(corta.libreDesde, minutos('12:30'));
  assert.equal(corta.minutos, 130);
  assert.equal(colorSala(corta), 'corta');
  assert.equal(corta.siguienteHoy.sigla, 'ELI347');
  assert.equal(colorSala(estadoF411(1, '14:39')), 'corta');
  assert.equal(estadoF411(1, '14:39').completos, 0);
  const ocupada = estadoF411(1, '14:40');
  assert.equal(colorSala(ocupada), 'ocupada');
  assert.equal(ocupada.hasta, minutos('15:50'));
  assert.deepEqual(ocupada.proximaLibre, { desde: minutos('16:05'), hasta: minutos('22:55') });
  assert.equal(colorSala(estadoF411(1, '15:49')), 'ocupada');
  assert.equal(colorSala(estadoF411(1, '15:50')), 'larga');
  assert.equal(estadoF411(1, '15:50').completos, 10);
  assert.equal(estadoF411(1, '15:50').minutos, 350);
  assert.equal(colorSala({ estado: 'libre', completos: 3 }), 'larga');
});

test('el recreo de 09:25 a 09:40 consulta las mismas salas que el bloque 3', () => {
  const inicioBloque = consulta(1, '09:40');
  const aulas = evaluarAulas(horario, inicioBloque);
  assert.equal([...aulas.values()].filter(ficha => colorSala(ficha) === 'ocupada').length, 50);
  assert.equal(buscarSalas(horario, { ...inicioBloque, minimo: 3 }).length, 2);
  for (const hora of ['09:25', '09:30', '09:39']) {
    const momento = consulta(1, hora);
    assert.deepEqual(resolverConsulta(horario, momento), { ...inicioBloque, horaConsultada: momento.desde, bloqueRecreo: 3 });
    assert.deepEqual(evaluarAulas(horario, momento), aulas);
    assert.deepEqual(buscarSalas(horario, momento), buscarSalas(horario, inicioBloque));
  }
  const ahora = relojCampus(datos.zonaHoraria, new Date('2026-11-10T12:30:00Z'));
  assert.deepEqual(ahora, { dia: 1, hora: '09:30', fecha: '2026-11-10' });
  assert.equal(resolverConsulta(horario, consulta(ahora.dia, ahora.hora)).desde, inicioBloque.desde);
  assert.equal(resolverConsulta(horario, consulta(1, '13:50')).desde, minutos('13:50'));
});

test('fin de semana, fuera de horario y fuera de semestre no marcan disponibilidad', () => {
  for (const momento of [consulta(5, '11:05'), consulta(6, '11:05'), consulta(0, '08:14'), consulta(0, '22:55'), consulta(0, '')]) {
    assert.equal(coberturaConsulta(horario, momento), null);
    assert([...evaluarAulas(horario, momento).values()].every(ficha => colorSala(ficha) === 'sin-datos'));
    assert.deepEqual(buscarSalas(horario, momento), []);
  }
  assert([...evaluarAulas(horario, consulta(0, '09:00'), false).values()].every(ficha => colorSala(ficha) === 'sin-datos'));
  const viernes = estadoF411(4, '17:15');
  assert.equal(proximaClaseEnPeriodo(viernes, '2026-12-04', '2026-12-04').length, 0);
  assert.equal(proximaClaseEnPeriodo(viernes, '2026-11-20', '2026-12-04')[0].dia, 0);
});

test('ocupaciones simultáneas y contiguas aplazan el primer momento libre', () => {
  const sala = horario.aulas.find(aula => aula.codigo === 'F411');
  const clases = [
    { desde: 495, hasta: 565 },
    { desde: 530, hasta: 600 },
    { desde: 600, hasta: 630 },
    { desde: 670, hasta: 705 },
  ];
  const ejemplo = { ...horario, aulas: [sala], porSala: new Map([['F411', [clases]]]) };
  const ficha = evaluarAulas(ejemplo, { dia: 0, desde: 530 }).get('F411');
  assert.equal(ficha.enCurso.length, 2);
  assert.equal(ficha.hasta, 630);
  assert.deepEqual(ficha.proximaLibre, { desde: 630, hasta: 670 });
});

test('un recreo entre clases no se ofrece como franja libre ni se suma al final de una franja', () => {
  const sala = horario.aulas.find(aula => aula.codigo === 'F411');
  const clases = [['08:50', '09:25'], ['09:40', '10:15'], ['11:05', '11:40']]
    .map(([inicio, fin]) => ({ desde: minutos(inicio), hasta: minutos(fin) }));
  const ejemplo = { ...horario, aulas: [sala], porSala: new Map([['F411', [clases]]]) };
  const ocupada = evaluarAulas(ejemplo, consulta(0, '09:15')).get('F411');
  assert.equal(ocupada.hasta, minutos('10:15'));
  assert.deepEqual(ocupada.proximaLibre, { desde: minutos('10:15'), hasta: minutos('10:50') });

  const libre = evaluarAulas(ejemplo, consulta(0, '10:20')).get('F411');
  assert.equal(libre.hasta, minutos('10:50'));
  assert.equal(libre.minutos, 30);
  assert.equal(libre.siguienteHoy.desde, minutos('11:05'));
});

test('mapa y buscador coinciden para cada aula y cada minuto del horario semanal', () => {
  const minutosRecreo = new Set();
  for (const [i, bloque] of datos.bloques.slice(1).entries()) {
    const finAnterior = minutos(datos.bloques[i].fin);
    const siguiente = minutos(bloque.inicio);
    if (siguiente - finAnterior === 15) {
      for (let minuto = finAnterior; minuto < siguiente; minuto += 1) minutosRecreo.add(minuto);
    }
  }
  const utilHasta = [0];
  for (let minuto = 0; minuto < 24 * 60; minuto += 1) {
    utilHasta.push(utilHasta.at(-1) + Number(!minutosRecreo.has(minuto)));
  }

  let verificados = 0;
  for (const [dia, cobertura] of horario.cobertura.entries()) {
    if (!cobertura) continue;
    for (let desde = cobertura.desde; desde < cobertura.hasta; desde += 1) {
      const momento = { dia, desde };
      const lista = buscarSalas(horario, momento);
      const fichas = evaluarAulas(horario, momento);
      assert.deepEqual(lista, [...fichas.values()].filter(ficha => ficha.estado === 'libre'));
      let efectivo = desde;
      while (minutosRecreo.has(efectivo)) efectivo += 1;
      for (const [codigo, ficha] of fichas) {
        const sesiones = horario.porSala.get(codigo)[dia];
        const enCurso = sesiones.some(s => s.desde <= efectivo && efectivo < s.hasta);
        if (enCurso) {
          assert.equal(colorSala(ficha), 'ocupada');
          assert(ficha.hasta > efectivo);
          assert(!sesiones.some(s => s.desde <= ficha.hasta && ficha.hasta < s.hasta));
          if (ficha.proximaLibre) {
            const franja = ficha.proximaLibre;
            assert(!minutosRecreo.has(franja.desde) && !minutosRecreo.has(franja.hasta - 1));
            assert(!sesiones.some(s => s.desde < franja.hasta && s.hasta > franja.desde));
          }
        } else {
          let hasta = sesiones.find(s => s.desde > efectivo)?.desde ?? cobertura.hasta;
          while (minutosRecreo.has(hasta - 1)) hasta -= 1;
          const completos = datos.bloques.filter(bloque => minutos(bloque.inicio) >= efectivo && minutos(bloque.fin) <= hasta).length;
          assert.equal(ficha.hasta, hasta);
          assert.equal(ficha.completos, completos);
          assert.equal(ficha.minutos, utilHasta[hasta] - utilHasta[efectivo]);
          assert(ficha.minutos > 0);
          assert.equal(colorSala(ficha), completos > 2 ? 'larga' : 'corta');
        }
        verificados += 1;
      }
    }
  }
  assert.equal(verificados, 233200);
});
