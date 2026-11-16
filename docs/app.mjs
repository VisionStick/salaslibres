import { buscarSalas, coberturaConsulta, hhmm, minutos, ordenarSalas, prepararHorario, proximaClaseEnPeriodo, relojCampus, resolverConsulta } from './disponibilidad.mjs';
import { crearMapa, prepararMiniatura } from './mapa.mjs';

const id = nombre => document.getElementById(nombre);
const formulario = id('buscar');
const formularioMapa = id('mapa-consulta');
const formularios = [formulario, formularioMapa];
const formulariosEditados = new Set();
const duracion = id('duracion');
const orden = id('orden');
const origen = id('origen');
const resultado = id('resultados');
const dialogoMapa = id('dialogo-datos');
const estado = { edificio: '', limite: 12 };
let periodo;
let datos;
let horario;
let mapa;

const numero = new Intl.NumberFormat('es-CL', { useGrouping: 'always' });
const fechaLocal = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
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

function filtrarEdificio(codigo) {
  if (!horario) return;
  estado.edificio = codigo;
  estado.limite = 12;
  for (const boton of document.querySelectorAll('[data-edificio]')) {
    boton.setAttribute('aria-pressed', String(boton.dataset.edificio === codigo));
  }
  mostrar();
}

function prepararFiltros() {
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
  for (const form of formularios) {
    for (const [i, nombre] of datos.dias.entries()) opcion(form.elements.dia, i, nombre);
    for (const bloque of horario.bloques) {
      opcion(form.elements.bloque, bloque.numero, bloque.numero + ' · ' + bloque.inicio);
    }
  }
  opcion(duracion, 0, 'Sin mínimo');
  for (const bloque of horario.bloques) {
    const n = bloque.numero;
    opcion(duracion, n, n === 1 ? '1 bloque' : n + ' bloques');
  }

  for (const [clave, referencia] of Object.entries(datos.referencias)) opcion(origen, clave, referencia.nombre);
  for (const [clave, edificio] of Object.entries(datos.edificios)) opcion(origen, clave, edificio.nombre);
  const porSala = document.createElement('optgroup');
  porSala.label = 'Salas con ubicación';
  for (const sala of horario.aulas.filter(sala => sala.punto)) opcion(porSala, sala.codigo, 'Sala ' + sala.codigo);
  origen.append(porSala);
}

function ajustarModo(form) {
  const { modo, hora, bloque } = form.elements;
  const porBloque = modo.value === 'bloque';
  hora.disabled = porBloque;
  bloque.disabled = !porBloque;
  hora.closest('.campo').hidden = porBloque;
  bloque.closest('.campo').hidden = !porBloque;
}

function leerHora(valor) {
  const partes = /^(\d{1,2}):?(\d{2})$/.exec(valor.trim());
  return partes ? minutos(partes[1].padStart(2, '0') + ':' + partes[2]) : NaN;
}

function bloqueEn(minuto) {
  return horario.bloques.find(bloque => bloque.desde <= minuto && minuto < bloque.hasta);
}

function escribirConsulta(form, consulta) {
  const { dia, modo, hora, bloque } = form.elements;
  dia.value = consulta.dia;
  modo.value = consulta.modo;
  hora.value = hhmm(consulta.horaConsultada ?? consulta.desde);
  hora.setCustomValidity('');
  bloque.value = bloqueEn(consulta.desde)?.numero ?? '';
  ajustarModo(form);
}

function describirDatos() {
  const info = datos.validacion;
  const actualizado = fechaLocal.format(new Date(datos.fuente.actualizado));
  id('fecha-horario').textContent = 'Datos de Horario USM del ' + actualizado + '.';
  id('nota-horario').hidden = false;
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
  if (datos.fuente.tablaBloques) {
    const guia = texto('a', 'Ver los bloques oficiales en la guía USM ↗');
    guia.href = datos.fuente.tablaBloques;
    guia.target = '_blank';
    guia.rel = 'noopener noreferrer';
    id('datos-semestre').append(guia);
  }

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
  const clases = proximaClaseEnPeriodo(ficha, fechaConsulta, periodo.finDiurno);
  const { dias } = ficha.proxima;
  const proxima = clases[0];
  const etiqueta = tarjeta.querySelector('.proxima-etiqueta');
  const clase = tarjeta.querySelector('.proxima-clase');
  if (!proxima) {
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

function tarjetaSala(ficha, diaConsulta, fechaConsulta) {
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
  const sinClasesDia = !horario.porSala.get(sala.codigo)[diaConsulta].length;
  const nivel = completos >= 3 ? 'Muy conveniente' : completos === 2 ? 'Tiempo acotado' : 'Poco tiempo';
  etiqueta.hidden = sinClasesDia;
  if (completos < 3) etiqueta.classList.add('media');
  etiqueta.lastElementChild.textContent = nivel;

  const tiempos = tarjeta.querySelectorAll('.franja time');
  for (const [i, tiempo] of [libreDesde, hasta].entries()) {
    tiempos[i].dateTime = hhmm(tiempo);
    tiempos[i].textContent = hhmm(tiempo);
  }
  const franja = tarjeta.querySelector('.franja-etiqueta');
  if (sinClasesDia) franja.textContent = 'Sin clases registradas ese día';
  else if (!ficha.siguienteHoy) franja.textContent = 'Hasta el fin del horario registrado';

  const bloques = completos === 1 ? '1 bloque completo' : completos + ' bloques completos';
  tarjeta.querySelector('.sala-tiempo').textContent = 'Te quedan ' + textoDuracion(ficha.minutos) + ' sin recreos · ' + bloques;
  escribirClase(tarjeta, ficha, fechaConsulta);
  return tarjeta;
}

function referenciaActual() {
  return datos.referencias[origen.value] ?? datos.edificios[origen.value]
    ?? horario.aulas.find(sala => sala.codigo === origen.value);
}

function mostrar() {
  if (!horario || !estado.consulta) return;
  const { dia: diaConsulta, desde, minimo, fecha, horaConsultada, bloqueRecreo } = estado.consulta;
  const cobertura = horario.cobertura[diaConsulta];
  const delSemestre = !fecha || (fecha >= periodo.inicioDiurno && fecha <= periodo.finDiurno);
  const enHorario = delSemestre && Boolean(coberturaConsulta(horario, estado.consulta));
  const avisoMapa = !delSemestre ? 'La fecha está fuera del semestre ' + datos.semestre + '.'
    : !cobertura ? 'No hay horarios con sala registrada para este día.'
    : !enHorario ? 'Horario registrado de ' + hhmm(cobertura.desde) + ' a ' + hhmm(cobertura.hasta) + '.'
    : '';
  const bloque = bloqueEn(desde);
  const momento = [fecha && !bloqueRecreo ? 'Ahora' : '', datos.dias[diaConsulta], bloque ? 'Bloque ' + bloque.numero : '', hhmm(desde)]
    .filter(Boolean).join(' · ');
  const contexto = momento + (estado.edificio ? ' · Edificio ' + estado.edificio : '');
  const avisoRecreo = bloqueRecreo ? 'A las ' + hhmm(horaConsultada) + ' hay recreo. Se muestra el bloque '
    + bloqueRecreo + ', que empieza a las ' + hhmm(desde) + '.' : '';
  const sinSala = horario.sinSala[diaConsulta].get(bloque?.numero) ?? 0;
  const avisoSinSala = sinSala === 1 ? 'La fuente registra una clase sin sala publicada en este bloque.'
    : sinSala > 1 ? 'La fuente registra ' + sinSala + ' clases sin sala publicada en este bloque.' : '';
  const aviso = [avisoRecreo, avisoSinSala].filter(Boolean).join(' ');
  id('aviso-consulta').textContent = enHorario ? aviso : '';
  id('aviso-consulta').hidden = !enHorario || !aviso;
  id('salas').replaceChildren();
  id('pie-resultados').hidden = true;
  id('campo-origen').hidden = orden.value !== 'cercania';

  if (dialogoMapa.open) {
    mapa.actualizar(estado.consulta, enHorario, momento, avisoMapa || aviso);
  }

  if (!enHorario) {
    id('resumen').textContent = contexto;
    if (!delSemestre) {
      mensaje('La fecha está fuera del semestre ' + datos.semestre + '.', 'Puedes consultar el horario semanal guardado por hora o bloque.');
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
      alternativa ? 'Ninguna franja sin clases alcanza esa duración.' : 'No hay salas sin clase programada para esa búsqueda.',
      alternativa ? 'Hay salas sin clases durante menos tiempo.' : 'Prueba con otro día, bloque, hora o edificio.',
      alternativa,
    );
    return;
  }

  mensaje('', '');
  id('salas').append(...opciones.slice(0, estado.limite).map(ficha => tarjetaSala(ficha, diaConsulta, fecha)));
  const restantes = cantidad - estado.limite;
  id('pie-resultados').hidden = restantes <= 0;
  id('mas').textContent = 'Mostrar más salas (' + Math.max(0, restantes) + ')';
}

function abrirMapa() {
  if (!horario) return;
  if (!mapa) mapa = crearMapa(dialogoMapa.querySelector('.mapa-interactivo'), datos, horario, periodo);
  dialogoMapa.showModal();
  mostrar();
}

function buscarAhora(origen) {
  const reloj = relojCampus(datos.zonaHoraria);
  const desde = minutos(reloj.hora);
  const anterior = estado.consulta;
  if (!origen && (anterior.horaConsultada ?? anterior.desde) === desde && anterior.fecha === reloj.fecha) return;
  const minimo = origen === formulario ? Number(duracion.value) : anterior.minimo;
  const consulta = { dia: reloj.dia, desde, fecha: reloj.fecha, minimo, modo: 'hora' };
  if (origen) {
    aplicarConsulta(consulta, origen === formulario);
    return;
  }
  estado.consulta = resolverConsulta(horario, consulta);
  for (const form of formularios) {
    if (!formulariosEditados.has(form)) escribirConsulta(form, estado.consulta);
  }
  mostrar();
}

function aplicarConsulta(consulta, desplazar) {
  estado.consulta = resolverConsulta(horario, consulta);
  estado.limite = 12;
  formulariosEditados.clear();
  duracion.value = consulta.minimo;
  for (const form of formularios) escribirConsulta(form, estado.consulta);
  mostrar();
  if (desplazar) irAResultados();
}

function buscarSeleccion(form) {
  const { dia, modo, hora, bloque } = form.elements;
  const porBloque = modo.value === 'bloque';
  const desde = porBloque ? horario.bloques.find(item => item.numero === Number(bloque.value))?.desde : leerHora(hora.value);
  if (!Number.isFinite(desde)) {
    if (!porBloque) {
      hora.setCustomValidity('Escribe una hora de 24 horas, por ejemplo 09:40 o 0940.');
      hora.reportValidity();
    }
    return;
  }
  const principal = form === formulario;
  const minimo = principal ? Number(duracion.value) : estado.consulta.minimo;
  aplicarConsulta({ dia: Number(dia.value), desde, minimo, modo: modo.value }, principal);
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
    prepararFiltros();
    prepararMiniatura(id('mapa-portada'));
    describirDatos();

    const reloj = relojCampus(datos.zonaHoraria);
    const diasConHorario = horario.cobertura.map((ventana, i) => ventana ? i : -1).filter(i => i >= 0);
    const primerDia = diasConHorario.find(i => i >= reloj.dia) ?? diasConHorario[0];
    const primerHorario = horario.cobertura[primerDia];
    if (!primerHorario) throw new Error('No hay sesiones con sala en el horario');
    const estaEnHorario = primerDia === reloj.dia && minutos(reloj.hora) >= primerHorario.desde
      && minutos(reloj.hora) < primerHorario.hasta;
    const desde = estaEnHorario ? minutos(reloj.hora)
      : Math.max(primerHorario.desde, Math.min(minutos('14:40'), primerHorario.hasta - 35));
    id('semestre').textContent = 'Semestre ' + datos.semestre;
    id('semestre').hidden = false;
    id('mapa-semestre').textContent = '· Semestre ' + datos.semestre;
    id('filtros').hidden = false;
    for (const control of [formulario.elements.dia, formulario.elements.modo, duracion, orden, id('ahora'), id('enviar'), id('abrir-datos'), id('abrir-mapa-portada')]) {
      control.disabled = false;
    }
    aplicarConsulta({ dia: primerDia, desde, minimo: 0, modo: 'hora' }, false);
  } catch (error) {
    console.error(error);
    id('resumen').textContent = '';
    mensaje('No pudimos cargar el horario.', 'Recarga la página para volver a intentarlo.');
  }
}

for (const form of formularios) {
  const { dia, modo, hora, bloque } = form.elements;
  form.addEventListener('submit', evento => {
    evento.preventDefault();
    buscarSeleccion(form);
  });
  form.addEventListener('input', () => formulariosEditados.add(form));
  hora.addEventListener('input', () => {
    hora.setCustomValidity('');
    bloque.value = '';
  });
  modo.addEventListener('change', () => {
    if (modo.value === 'bloque' && !bloque.value) {
      const consulta = resolverConsulta(horario, { dia: Number(dia.value), desde: leerHora(hora.value) });
      bloque.value = bloqueEn(consulta.desde)?.numero ?? '';
    }
    ajustarModo(form);
  });
}
id('ahora').addEventListener('click', () => buscarAhora(formulario));
for (const entrada of ['abrir-datos', 'abrir-mapa-portada', 'abrir-mapa-resultados']) {
  id(entrada).addEventListener('click', abrirMapa);
}
id('mapa-ahora').addEventListener('click', () => buscarAhora(formularioMapa));
orden.addEventListener('change', () => { estado.limite = 12; mostrar(); });
origen.addEventListener('change', () => { estado.limite = 12; mostrar(); });
id('menos-tiempo').addEventListener('click', () => {
  duracion.value = '0';
  estado.consulta.minimo = 0;
  estado.limite = 12;
  mostrar();
});
id('mas').addEventListener('click', () => { estado.limite += 12; mostrar(); });
setInterval(() => {
  if (estado.consulta?.fecha && !document.hidden) buscarAhora();
}, 15000);
document.addEventListener('visibilitychange', () => {
  if (estado.consulta?.fecha && !document.hidden) buscarAhora();
});

await iniciar();
