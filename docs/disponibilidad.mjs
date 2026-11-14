export function minutos(hora) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora ?? '')) return NaN;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

export function hhmm(valor) {
  return [Math.floor(valor / 60), valor % 60].map(n => String(n).padStart(2, '0')).join(':');
}

export function relojCampus(zonaHoraria, fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  const fechaLocal = [valor.year, valor.month, valor.day].join('-');
  const dia = (new Date(fechaLocal + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return { fecha: fechaLocal, dia, hora: valor.hour + ':' + valor.minute };
}

const ordenarCodigo = new Intl.Collator('es-CL', { numeric: true });
const RECREO_MINUTOS = 15;

export function prepararHorario(datos) {
  const bloques = datos.bloques.map(bloque => ({
    ...bloque, desde: minutos(bloque.inicio), hasta: minutos(bloque.fin),
  }));
  const recreos = bloques.slice(1).flatMap((siguiente, i) => {
    const anterior = bloques[i];
    // El intervalo largo de almuerzo tiene tratamiento propio en la consulta.
    return siguiente.desde - anterior.hasta === RECREO_MINUTOS
      ? [{ desde: anterior.hasta, hasta: siguiente.desde, bloque: siguiente.numero }]
      : [];
  });
  const cobertura = Array.from({ length: datos.dias.length }, () => null);
  const porSala = new Map(datos.salas.map(sala => [
    sala.codigo, Array.from({ length: datos.dias.length }, () => []),
  ]));

  for (const turno of [...datos.oferta, ...datos.ocupacionesAdicionales]) {
    for (const ramo of turno.ramos) {
      for (const paralelo of ramo.paralelos) {
        const clases = new Map();
        for (const fila of paralelo.horario) {
          if (!fila.enSanJoaquin || !porSala.has(fila.sala)) continue;
          const clave = JSON.stringify([fila.sala, fila.dia, fila.tipo, fila.profesor]);
          if (!clases.has(clave)) clases.set(clave, []);
          clases.get(clave).push(fila);
        }

        for (const clase of clases.values()) {
          const { sala, dia, tipo, profesor } = clase[0];
          const ocupaciones = porSala.get(sala)[dia];
          let sesion;
          for (const fila of clase.sort((a, b) => a.bloque - b.bloque)) {
            const desde = minutos(fila.inicio);
            const hasta = minutos(fila.fin);
            if (sesion && fila.bloque <= sesion.ultimoBloque + 1 && desde - sesion.hasta <= RECREO_MINUTOS) {
              sesion.hasta = Math.max(sesion.hasta, hasta);
              sesion.ultimoBloque = Math.max(sesion.ultimoBloque, fila.bloque);
            } else {
              sesion = {
                desde, hasta, ultimoBloque: fila.bloque, dia, tipo, profesor,
                sigla: ramo.sigla, nombre: paralelo.nombre ?? ramo.nombre,
                paralelo: paralelo.numero, sede: turno.sede ?? datos.sede,
              };
              ocupaciones.push(sesion);
            }
            cobertura[dia] ??= { desde: bloques[0].desde, hasta: 0 };
            cobertura[dia].hasta = Math.max(cobertura[dia].hasta, hasta);
          }
        }
      }
    }
  }

  for (const semana of porSala.values()) {
    for (const sesiones of semana) {
      sesiones.sort((a, b) => a.desde - b.desde || ordenarCodigo.compare(a.sigla, b.sigla));
    }
  }
  return { bloques, recreos, cobertura, porSala, aulas: datos.salas.filter(sala => sala.estado === 'aula') };
}

function clasesQueEmpiezan(sesiones) {
  return sesiones.filter(sesion => sesion.desde === sesiones[0]?.desde);
}

function proximaClase(semana, dia, desde) {
  const hoy = semana[dia].filter(sesion => sesion.desde > desde);
  if (hoy.length) return { clases: clasesQueEmpiezan(hoy), dias: 0 };
  for (let salto = 1; salto <= semana.length; salto += 1) {
    const siguiente = semana[(dia + salto) % semana.length];
    if (siguiente.length) return { clases: clasesQueEmpiezan(siguiente), dias: salto };
  }
  return { clases: [], dias: null };
}

export function contarBloques(bloques, desde, hasta) {
  return bloques.filter(bloque => bloque.desde >= desde && bloque.hasta <= hasta).length;
}

function recreoEn(horario, minuto) {
  return horario.recreos.find(pausa => minuto >= pausa.desde && minuto < pausa.hasta);
}

function minutosSinRecreos(recreos, desde, hasta) {
  const minutosRecreo = recreos.reduce((total, pausa) => total + Math.max(0,
    Math.min(hasta, pausa.hasta) - Math.max(desde, pausa.desde)), 0);
  return hasta - desde - minutosRecreo;
}

export function proximaClaseEnPeriodo(ficha, fechaConsulta, finSemestre) {
  const { clases, dias } = ficha.proxima;
  if (!fechaConsulta || !dias) return clases;
  const fecha = new Date(fechaConsulta + 'T00:00:00Z');
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10) <= finSemestre ? clases : [];
}

export function coberturaConsulta(horario, { dia, desde }) {
  const cobertura = horario.cobertura[dia];
  return cobertura && Number.isFinite(desde) && desde >= cobertura.desde && desde < cobertura.hasta
    ? cobertura : null;
}

export function resolverConsulta(horario, consulta) {
  const recreo = recreoEn(horario, consulta.desde);
  if (!recreo || !coberturaConsulta(horario, consulta)) return consulta;
  return { ...consulta, horaConsultada: consulta.desde, desde: recreo.hasta, bloqueRecreo: recreo.bloque };
}

function siguienteMomentoUtil(horario, desde) {
  return recreoEn(horario, desde)?.hasta ?? desde;
}

function finDeFranja(horario, hasta) {
  return recreoEn(horario, hasta - 1)?.desde ?? hasta;
}

function evaluarSala(horario, sala, dia, desde, cobertura) {
  const semana = horario.porSala.get(sala.codigo);
  const sesiones = semana[dia];
  const enCurso = sesiones.filter(sesion => sesion.desde <= desde && desde < sesion.hasta);
  if (enCurso.length) {
    let hasta = Math.max(...enCurso.map(sesion => sesion.hasta));
    let hastaLibre = cobertura.hasta;
    for (const sesion of sesiones) {
      if (sesion.desde > siguienteMomentoUtil(horario, hasta)) {
        hastaLibre = sesion.desde;
        break;
      }
      hasta = Math.max(hasta, sesion.hasta);
    }
    const siguienteInicio = siguienteMomentoUtil(horario, hasta);
    hastaLibre = finDeFranja(horario, hastaLibre);
    const proximaLibre = siguienteInicio < hastaLibre ? { desde: siguienteInicio, hasta: hastaLibre } : null;
    return { sala, estado: 'ocupada', hasta, enCurso, proximaLibre };
  }

  const proxima = proximaClase(semana, dia, desde);
  const siguienteHoy = proxima.dias === 0 ? proxima.clases[0] : null;
  const hasta = finDeFranja(horario, siguienteHoy?.desde ?? cobertura.hasta);
  const ultimaClase = sesiones.reduce(
    (inicio, sesion) => sesion.hasta <= desde ? Math.max(inicio, sesion.hasta) : inicio,
    cobertura.desde,
  );
  const libreDesde = siguienteMomentoUtil(horario, ultimaClase);
  const completos = contarBloques(horario.bloques, desde, hasta);
  return {
    sala, estado: 'libre', libreDesde, hasta, completos,
    minutos: minutosSinRecreos(horario.recreos, desde, hasta), proxima, siguienteHoy,
  };
}

export function evaluarAulas(horario, consulta, vigente = true) {
  const { dia, desde } = resolverConsulta(horario, consulta);
  const cobertura = vigente ? coberturaConsulta(horario, { dia, desde }) : null;
  return new Map(horario.aulas.map(sala => [sala.codigo, cobertura
    ? evaluarSala(horario, sala, dia, desde, cobertura)
    : { sala, estado: 'sin-datos' }]));
}

export function buscarSalas(horario, consulta) {
  const { dia, desde, minimo = 0, edificio = '' } = resolverConsulta(horario, consulta);
  const cobertura = coberturaConsulta(horario, { dia, desde });
  if (!cobertura) return [];

  const resultados = [];
  for (const sala of horario.aulas) {
    if (edificio && sala.edificio !== edificio) continue;
    const ficha = evaluarSala(horario, sala, dia, desde, cobertura);
    if (ficha.estado === 'libre' && ficha.completos >= minimo) resultados.push(ficha);
  }
  return resultados;
}

function distancia(sala, origen) {
  if (sala.codigo === origen.codigo) return 0;
  if (!sala.punto || !origen.punto) return Infinity;
  return Math.hypot(
    sala.punto[0] - origen.punto[0],
    sala.punto[1] - origen.punto[1],
    75 * Math.abs((sala.piso ?? 1) - (origen.piso ?? 1)),
  );
}

export function ordenarSalas(salas, orden, origen) {
  return [...salas].sort((a, b) => {
    if (orden === 'cercania' && origen) {
      const diferencia = distancia(a.sala, origen) - distancia(b.sala, origen);
      if (diferencia) return diferencia;
    }
    if (orden !== 'codigo') {
      const diferencia = b.minutos - a.minutos || b.completos - a.completos;
      if (diferencia) return diferencia;
    }
    return ordenarCodigo.compare(a.sala.codigo, b.sala.codigo);
  });
}
