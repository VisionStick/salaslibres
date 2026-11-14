import { buscarSalas, hhmm, minutos, ordenarSalas, prepararHorario, relojCampus } from './disponibilidad.mjs';

const id = nombre => document.getElementById(nombre);
const dia = id('dia');
const hora = id('hora');
const duracion = id('duracion');
const orden = id('orden');
const origen = id('origen');
const resultado = id('resultados');
const estado = { edificio: '', modoAhora: false, limite: 12 };
let periodo;
let datos;
let horario;

const numero = new Intl.NumberFormat('es-CL', { useGrouping: 'always' });
const fechaLocal = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'medium',
});

function texto(etiqueta, contenido, clase) {
  const elemento = document.createElement(etiqueta);
  elemento.textContent = contenido;
  if (clase) elemento.className = clase;
  return elemento;
}

function opcion(control, valor, etiqueta) {
  const elemento = texto('option', etiqueta);
  elemento.value = valor;
  control.append(elemento);
}

function boton(etiqueta, clase, alPulsar) {
  const elemento = texto('button', etiqueta, clase);
  elemento.type = 'button';
  elemento.addEventListener('click', alPulsar);
  return elemento;
}

function mensaje(titulo, detalle, alternativa = false) {
  id('mensaje').hidden = !titulo;
  id('mensaje-titulo').textContent = titulo;
  id('mensaje-detalle').textContent = detalle;
  id('menos-tiempo').hidden = !alternativa;
}

function irAResultados() {
  resultado.scrollIntoView({ block: 'start' });
}

function filtrarEdificio(codigo, desplazar = false) {
  if (!horario) return;
  estado.edificio = codigo;
  estado.limite = 12;
  for (const boton of document.querySelectorAll('[data-edificio]')) {
    boton.setAttribute('aria-pressed', String(boton.dataset.edificio === codigo));
  }
  mostrar();
  if (desplazar) irAResultados();
}

function prepararMapa() {
  const crearPin = (codigo, edificio, dialogo) => {
    const pin = boton(codigo, 'plano-punto', () => {
      if (dialogo) id('dialogo-datos').close();
      filtrarEdificio(estado.edificio === codigo ? '' : codigo, true);
    });
    pin.setAttribute('aria-label', edificio.nombre);
    pin.setAttribute('aria-pressed', 'false');
    pin.dataset.edificio = codigo;
    const [x, y] = edificio.punto;
    pin.style.setProperty('--x', (11 + (x - 190) * 0.076) + '%');
    pin.style.setProperty('--y', (14 + (y - 140) * 0.085) + '%');
    return pin;
  };

  for (const [codigo, edificio] of Object.entries(datos.edificios)) {
    id('mapa-portada').append(crearPin(codigo, edificio, false));
    id('mapa-dialogo').append(crearPin(codigo, edificio, true));
  }
  for (const [codigo, etiqueta] of [['', 'Todos'], ...Object.entries(datos.edificios).map(
    ([clave, edificio]) => [clave, edificio.nombre],
  )]) {
    const filtro = boton(etiqueta, 'chip', () => filtrarEdificio(codigo));
    filtro.dataset.edificio = codigo;
    filtro.setAttribute('aria-pressed', String(!codigo));
    id('edificios').append(filtro);
  }
}

function prepararOpciones() {
  for (const [i, nombre] of datos.dias.entries()) opcion(dia, i, nombre);
  opcion(duracion, 0, 'Cualquier duración');
  for (const bloque of horario.bloques) {
    const n = bloque.numero;
    opcion(duracion, n, n === 1 ? '1 bloque (35 min)' : n + ' bloques');
  }

  for (const [clave, referencia] of Object.entries(datos.referencias)) opcion(origen, clave, referencia.nombre);
  for (const [clave, edificio] of Object.entries(datos.edificios)) opcion(origen, clave, edificio.nombre);
  const porSala = document.createElement('optgroup');
  porSala.label = 'Salas con ubicación';
  for (const sala of horario.aulas.filter(sala => sala.punto)) opcion(porSala, sala.codigo, 'Sala ' + sala.codigo);
  origen.append(porSala);
}

function configurarBloques() {
  const opciones = id('opciones-bloque');
  opciones.replaceChildren();
  const cobertura = horario.cobertura[Number(dia.value)];
  const disponibles = horario.bloques.filter(bloque => cobertura && bloque.hasta <= cobertura.hasta);
  if (!disponibles.length) {
    opciones.append(texto('p', 'Este día no tiene bloques con sala registrada.'));
    return;
  }
  for (const bloque of disponibles) {
    const item = boton('Bloque ' + bloque.numero, '', () => {
      estado.modoAhora = false;
      hora.value = bloque.inicio;
      id('dialogo-bloques').close();
      hora.focus();
    });
    item.append(texto('small', bloque.inicio + ' – ' + bloque.fin));
    opciones.append(item);
  }
}

function describirDatos() {
  const info = datos.validacion;
  const actualizado = fechaLocal.format(new Date(datos.fuente.actualizado));
  id('datos-semestre').append(
    texto('p', 'Semestre ' + datos.semestre + ' · Horario del ' + actualizado),
    texto('p', numero.format(info.ramos) + ' ramos · ' + numero.format(info.paralelos) + ' paralelos · ' + info.aulasConsultables + ' aulas consultables.'),
    texto('p', 'Incluye clases vespertinas con sala identificada en San Joaquín. Hay ' + info.paralelosSinHorario + ' paralelos sin horario y ' + info.bloquesSinSalaEnSanJoaquin + ' bloques locales sin sala publicada.'),
  );
  const descarga = texto('a', 'Descargar el horario completo (JSON)');
  descarga.href = './data/horario-' + datos.semestre + '.json';
  descarga.download = 'horario-' + datos.semestre + '.json';
  const calendario = texto('a', 'Ver calendario académico USM ↗');
  calendario.href = periodo.calendario;
  calendario.target = '_blank';
  calendario.rel = 'noopener noreferrer';
  id('datos-semestre').append(descarga, calendario);

  id('revision').querySelector('summary').textContent = 'Espacios por revisar (' + info.espaciosPorRevisar + ')';
  id('solo-mapa').querySelector('summary').textContent = 'Salas que figuran solo en el mapa (' + info.espaciosSoloMapa + ')';
  for (const sala of datos.salas) {
    if (!['revision', 'solo_mapa'].includes(sala.estado)) continue;
    const item = texto('li', sala.codigo);
    if (sala.motivo && sala.estado === 'revision') item.append(' · ' + sala.motivo);
    id(sala.estado === 'revision' ? 'lista-revision' : 'lista-mapa').append(item);
  }
}

function textoDuracion(minutosLibres) {
  const horas = Math.floor(minutosLibres / 60);
  const resto = minutosLibres % 60;
  return [horas ? horas + ' h' : '', resto ? resto + ' min' : ''].filter(Boolean).join(' ');
}

function escribirClase(tarjeta, ficha, fechaConsulta) {
  const { clases, dias } = ficha.proxima;
  const proxima = clases[0];
  const etiqueta = tarjeta.querySelector('.proxima-etiqueta');
  const clase = tarjeta.querySelector('.proxima-clase');
  let fueraDePeriodo = false;
  if (fechaConsulta && dias > 0) {
    const fechaProxima = new Date(fechaConsulta + 'T00:00:00Z');
    fechaProxima.setUTCDate(fechaProxima.getUTCDate() + dias);
    fueraDePeriodo = fechaProxima.toISOString().slice(0, 10) > periodo.finDiurno;
  }
  if (!proxima || fueraDePeriodo) {
    etiqueta.textContent = 'Próxima clase';
    clase.textContent = 'Sin clase posterior en el horario';
    return;
  }
  const diaSiguiente = dias ? datos.dias[proxima.dia] + (dias === 7 ? ' siguiente ' : ' ') : '';
  etiqueta.textContent = 'Próxima clase · ' + diaSiguiente + hhmm(proxima.desde);
  const detalle = item => item.sigla + ' P' + item.paralelo + ' · ' + item.nombre;
  clase.textContent = detalle(proxima);
  const extra = clases.slice(1);
  if (extra.length) {
    const mas = tarjeta.querySelector('.proxima-mas');
    mas.hidden = false;
    mas.querySelector('summary').textContent = extra.length === 1 ? 'Otro paralelo a la misma hora' : 'Otros paralelos a la misma hora';
    mas.querySelector('ul').append(...extra.map(item => texto('li', detalle(item))));
  }
}

function tarjetaSala(ficha, fechaConsulta) {
  const tarjeta = id('plantilla-sala').content.firstElementChild.cloneNode(true);
  const { sala, libreDesde, hasta, completos } = ficha;
  const piso = sala.piso == null ? '' : ' · Piso ' + sala.piso;
  tarjeta.querySelector('.ubicacion').textContent = (datos.edificios[sala.edificio]?.nombre ?? 'San Joaquín') + piso;
  tarjeta.querySelector('.codigo').textContent = sala.codigo;
  if (sala.referenciaUbicacion || sala.notaUbicacion) {
    const nota = tarjeta.querySelector('.ubicacion-nota');
    nota.textContent = sala.referenciaUbicacion ?? 'Ubicación exacta por confirmar';
    if (sala.notaUbicacion) nota.title = sala.notaUbicacion;
    nota.hidden = false;
  }

  const etiqueta = tarjeta.querySelector('.conveniencia');
  const nivel = completos >= 3 ? 'Muy conveniente' : completos === 2 ? 'Disponible' : 'Poco tiempo';
  if (completos < 3) etiqueta.classList.add(completos === 2 ? 'media' : 'breve');
  etiqueta.lastElementChild.textContent = nivel;

  const tiempos = tarjeta.querySelectorAll('.franja time');
  for (const [i, tiempo] of [libreDesde, hasta].entries()) {
    tiempos[i].dateTime = hhmm(tiempo);
    tiempos[i].textContent = hhmm(tiempo);
  }
  if (!ficha.siguienteHoy) tarjeta.querySelector('.franja-etiqueta').textContent = 'Hasta el fin del horario registrado';

  const bloques = completos === 1 ? '1 bloque completo' : completos + ' bloques completos';
  tarjeta.querySelector('.sala-tiempo').textContent = 'Te quedan ' + textoDuracion(ficha.minutos) + ' · ' + bloques;
  escribirClase(tarjeta, ficha, fechaConsulta);
  return tarjeta;
}

function referenciaActual() {
  return datos.referencias[origen.value] ?? datos.edificios[origen.value]
    ?? horario.aulas.find(sala => sala.codigo === origen.value);
}

function mostrar() {
  if (!horario || !estado.consulta) return;
  const { dia: diaConsulta, desde, minimo, fecha } = estado.consulta;
  const cobertura = horario.cobertura[diaConsulta];
  const delSemestre = !fecha || (fecha >= periodo.inicioDiurno && fecha <= periodo.finDiurno);
  const sector = estado.edificio ? ' · Edificio ' + estado.edificio : '';
  const contexto = (fecha ? 'Ahora · ' : '') + datos.dias[diaConsulta] + ' · ' + hhmm(desde) + sector;
  id('salas').replaceChildren();
  id('pie-resultados').hidden = true;
  id('campo-origen').hidden = orden.value !== 'cercania';

  if (!delSemestre || !cobertura || desde < cobertura.desde || desde >= cobertura.hasta) {
    id('resumen').textContent = contexto;
    if (!delSemestre) {
      mensaje('La fecha está fuera del semestre ' + datos.semestre + '.', 'Puedes consultar el horario semanal guardado con la búsqueda por día y hora.');
    } else if (!cobertura) {
      mensaje('Este día no tiene horarios con sala registrada.', 'Elige un día de lunes a viernes para consultar las aulas del semestre.');
    } else {
      mensaje('Hora fuera del horario registrado.', datos.dias[diaConsulta] + ' · de ' + hhmm(cobertura.desde) + ' a ' + hhmm(cobertura.hasta) + ' en San Joaquín.');
    }
    return;
  }

  const seleccion = { dia: diaConsulta, desde, minimo, edificio: estado.edificio };
  const opciones = ordenarSalas(buscarSalas(horario, seleccion), orden.value, referenciaActual());
  const cantidad = opciones.length;
  id('resumen').textContent = contexto + ' · ' + cantidad + (cantidad === 1 ? ' sala' : ' salas');
  if (!cantidad) {
    const alternativa = minimo > 0 && buscarSalas(horario, { ...seleccion, minimo: 0 }).length > 0;
    mensaje(
      alternativa ? 'Ninguna sala alcanza esa duración.' : 'No hay salas disponibles para esa búsqueda.',
      alternativa ? 'Hay salas libres durante menos tiempo.' : 'Prueba con otro día, hora o edificio.',
      alternativa,
    );
    return;
  }

  mensaje('', '');
  id('salas').append(...opciones.slice(0, estado.limite).map(ficha => tarjetaSala(ficha, fecha)));
  const restantes = cantidad - estado.limite;
  id('pie-resultados').hidden = restantes <= 0;
  id('mas').textContent = 'Mostrar más salas (' + Math.max(0, restantes) + ')';
}

function buscarAhora(desplazar) {
  const reloj = relojCampus(datos.zonaHoraria);
  const desde = minutos(reloj.hora);
  if (!desplazar && estado.consulta?.desde === desde && estado.consulta?.fecha === reloj.fecha) return;
  dia.value = reloj.dia;
  hora.value = reloj.hora;
  estado.modoAhora = true;
  if (desplazar) estado.limite = 12;
  estado.consulta = { dia: reloj.dia, desde, fecha: reloj.fecha, minimo: Number(duracion.value) };
  mostrar();
  if (desplazar) irAResultados();
}

function buscarSeleccion(desplazar) {
  if (!id('buscar').checkValidity()) return;
  estado.modoAhora = false;
  estado.limite = 12;
  estado.consulta = { dia: Number(dia.value), desde: minutos(hora.value), minimo: Number(duracion.value) };
  mostrar();
  if (desplazar) irAResultados();
}

async function obtenerJson(ruta) {
  const respuesta = await fetch(ruta);
  if (!respuesta.ok) throw new Error('No se pudo cargar ' + ruta);
  return respuesta.json();
}

async function iniciar() {
  try {
    periodo = await obtenerJson('./data/periodo.json');
    datos = await obtenerJson('./data/horario-' + periodo.semestre + '.json');
    if (datos.version !== 1 || datos.semestre !== periodo.semestre) throw new Error('Versión de datos inválida');
    horario = prepararHorario(datos);
    prepararOpciones();
    prepararMapa();
    describirDatos();

    const reloj = relojCampus(datos.zonaHoraria);
    const diasConHorario = horario.cobertura.map((ventana, i) => ventana ? i : -1).filter(i => i >= 0);
    const primerDia = diasConHorario.find(i => i >= reloj.dia) ?? diasConHorario[0];
    const primerHorario = horario.cobertura[primerDia];
    const estaEnHorario = primerDia === reloj.dia && minutos(reloj.hora) >= primerHorario.desde
      && minutos(reloj.hora) < primerHorario.hasta;
    dia.value = primerDia;
    hora.value = estaEnHorario ? reloj.hora : hhmm(Math.min(minutos('14:40'), primerHorario.hasta - 35));
    duracion.value = '0';
    id('semestre').textContent = 'Semestre ' + datos.semestre;
    id('semestre').hidden = false;
    id('filtros').hidden = false;
    for (const control of [dia, hora, duracion, orden, id('ahora'), id('enviar'), id('ver-bloques')]) {
      control.disabled = false;
    }
    buscarSeleccion(false);
  } catch (error) {
    console.error(error);
    id('resumen').textContent = '';
    mensaje('No pudimos cargar el horario.', 'Recarga la página para volver a intentarlo.');
  }
}

id('buscar').addEventListener('submit', evento => {
  evento.preventDefault();
  buscarSeleccion(true);
});
id('ahora').addEventListener('click', () => buscarAhora(true));
for (const control of [dia, hora, duracion]) {
  control.addEventListener('input', () => { estado.modoAhora = false; });
}
id('ver-bloques').addEventListener('click', () => {
  configurarBloques();
  id('dialogo-bloques').showModal();
});
id('abrir-datos').addEventListener('click', () => id('dialogo-datos').showModal());
orden.addEventListener('change', () => { estado.limite = 12; mostrar(); });
origen.addEventListener('change', () => { estado.limite = 12; mostrar(); });
id('menos-tiempo').addEventListener('click', () => {
  duracion.value = '0';
  buscarSeleccion(false);
});
id('mas').addEventListener('click', () => { estado.limite += 12; mostrar(); });
setInterval(() => {
  if (estado.modoAhora && !document.hidden) buscarAhora(false);
}, 15000);
document.addEventListener('visibilitychange', () => {
  if (estado.modoAhora && !document.hidden) buscarAhora(false);
});

await iniciar();
