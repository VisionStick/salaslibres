import { contarBloques, evaluarAulas, hhmm, proximaClaseEnPeriodo } from './disponibilidad.mjs';
import { CAMPUS, dibujarCampus, POSICIONES, SECTORES } from './plano-campus.mjs';

const ESTADOS = {
  ocupada: { titulo: 'Ocupada', icono: '×' },
  corta: { titulo: 'Hasta 2 bloques', icono: '−' },
  larga: { titulo: 'Más de 2 bloques', icono: '+' },
  'sin-datos': { titulo: 'Sin horario para esta consulta', icono: '·' },
};

export function colorSala(ficha) {
  if (ficha.estado !== 'libre') return ficha.estado;
  return ficha.completos > 2 ? 'larga' : 'corta';
}

const porPiso = (lista, piso) => lista.filter(sala => sala.piso === piso);

function elemento(nombre, clase, contenido) {
  const nodo = document.createElement(nombre);
  nodo.className = clase;
  if (contenido) nodo.textContent = contenido;
  return nodo;
}

function opcion(valor, nombre) {
  const nodo = elemento('option', '', nombre);
  nodo.value = valor;
  return nodo;
}

function descripcionBloques(bloques) {
  if (!bloques) return 'Menos de 1 bloque completo';
  return bloques === 1 ? '1 bloque completo' : bloques + ' bloques completos';
}

function duracion(minutos) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return [horas ? horas + ' h' : '', resto ? resto + ' min' : ''].filter(Boolean).join(' ');
}

export function prepararMiniatura(canvas) {
  const vista = { x: 46, y: 75, ancho: 1026, alto: 690 };
  new ResizeObserver(() => dibujarCampus(canvas, vista, new Set(Object.keys(SECTORES)))).observe(canvas);
}

export function crearMapa(raiz, datos, horario, periodo) {
  const buscar = selector => raiz.querySelector(selector);
  const pisos = buscar('.mapa-pisos');
  const sector = buscar('#mapa-sector');
  const buscarSala = buscar('#mapa-sala');
  const viewport = buscar('.mapa-ventana');
  const escena = buscar('.mapa-escena');
  const canvas = buscar('canvas');
  const marcadores = buscar('.mapa-marcadores');
  const pendientes = buscar('.mapa-pendientes');
  const pendientesBotones = buscar('.mapa-pendientes-salas');
  const detalle = buscar('.mapa-detalle');
  const mini = matchMedia('(max-width: 640px)');
  const detalleAbajo = matchMedia('(max-width: 850px)');
  const niveles = [...new Set(horario.aulas.map(sala => sala.piso))].sort((a, b) => a - b);
  const botonesPiso = new Map();
  const botonesSala = new Map();
  const salas = new Map(horario.aulas.map(sala => [sala.codigo, sala]));
  const ubicacionEnPlano = sala => POSICIONES[sala.codigo];
  let piso = niveles[0];
  let seleccion = '';
  let vistaPrevia = '';
  let consultaActual;
  let estados = new Map();
  let vista = CAMPUS;
  let activos = new Set();
  let claveConsulta;

  function actualizarDetalle(codigo) {
    const ficha = estados.get(codigo);
    buscar('.mapa-detalle-vacio').hidden = Boolean(ficha);
    buscar('.mapa-detalle-ficha').hidden = !ficha;
    if (!ficha) return;

    const { sala } = ficha;
    const color = colorSala(ficha);
    const etiqueta = detalle.querySelector('.mapa-estado');
    etiqueta.dataset.color = color;
    etiqueta.firstElementChild.textContent = ESTADOS[color].icono;
    etiqueta.lastElementChild.textContent = ficha.estado === 'libre' ? 'Disponible' : ESTADOS[color].titulo;
    buscar('.mapa-detalle-codigo').textContent = sala.codigo;
    buscar('.mapa-detalle-ubicacion').textContent = 'Edificio ' + sala.edificio + ' · Piso ' + sala.piso;
    const referencia = buscar('.mapa-detalle-referencia');
    referencia.textContent = sala.referenciaUbicacion ?? sala.notaUbicacion
      ?? (!ubicacionEnPlano(sala) ? 'Ubicación exacta por confirmar' : '');
    referencia.hidden = !referencia.textContent;

    const tramo = buscar('.mapa-detalle-tramo');
    const duracionSala = buscar('.mapa-detalle-duracion');
    const siguiente = buscar('.mapa-detalle-clase');
    duracionSala.textContent = '';
    siguiente.textContent = '';
    if (ficha.estado === 'libre') {
      tramo.textContent = 'Libre de ' + hhmm(ficha.libreDesde) + ' a ' + hhmm(ficha.hasta);
      duracionSala.textContent = descripcionBloques(ficha.completos) + ' · ' + duracion(ficha.minutos) + ' desde la hora consultada';
      const [clase] = proximaClaseEnPeriodo(ficha, consultaActual?.fecha, periodo.finDiurno);
      const salto = ficha.proxima.dias;
      if (clase) {
        const dia = salto ? datos.dias[clase.dia] + (salto === 7 ? ' siguiente ' : ' ') : '';
        siguiente.textContent = 'Próxima clase · ' + dia + hhmm(clase.desde) + ' · ' + clase.nombre;
      } else {
        siguiente.textContent = 'Sin otra clase programada';
      }
      if (!ficha.siguienteHoy) siguiente.textContent += ' · Franja hasta el fin del horario registrado';
    } else if (ficha.estado === 'ocupada') {
      tramo.textContent = 'Ocupada hasta las ' + hhmm(ficha.hasta);
      siguiente.textContent = ficha.enCurso.map(clase => clase.nombre).join(' · ');
      if (ficha.proximaLibre) {
        const { desde, hasta } = ficha.proximaLibre;
        const bloques = contarBloques(horario.bloques, desde, hasta);
        duracionSala.textContent = 'Luego libre de ' + hhmm(desde) + ' a ' + hhmm(hasta) + ' · ' + descripcionBloques(bloques);
      }
    } else {
      tramo.textContent = 'Consulta otro día u hora para ver la disponibilidad.';
    }
  }

  function actualizarBotones() {
    for (const [codigo, boton] of botonesSala) {
      const ficha = estados.get(codigo);
      const color = ficha ? colorSala(ficha) : 'sin-datos';
      const marca = ESTADOS[color];
      boton.dataset.color = color;
      boton.lastElementChild.textContent = marca.icono;
      boton.setAttribute('aria-pressed', String(codigo === seleccion));
      const textoEstado = ficha?.estado === 'libre' ? 'Disponible · ' + descripcionBloques(ficha.completos) : marca.titulo;
      boton.setAttribute('aria-label', codigo + ', ' + textoEstado);
    }
    actualizarDetalle(vistaPrevia || seleccion);
  }

  function vistaSala(sala, desplazar) {
    seleccion = sala.codigo;
    vistaPrevia = '';
    buscarSala.value = sala.codigo;
    actualizarBotones();
    if (desplazar && detalleAbajo.matches) detalle.scrollIntoView({ block: 'nearest' });
  }

  function botonSala(sala, punto) {
    const boton = elemento('button', 'mapa-sala', sala.codigo);
    boton.type = 'button';
    boton.dataset.sala = sala.codigo;
    const icono = elemento('span', 'mapa-simbolo');
    icono.setAttribute('aria-hidden', 'true');
    boton.append(icono);
    if (punto) {
      boton.style.setProperty('--x', ((punto[0] - vista.x) / vista.ancho * 100) + '%');
      boton.style.setProperty('--y', ((punto[1] - vista.y) / vista.alto * 100) + '%');
    }
    const previsualizar = () => {
      vistaPrevia = sala.codigo;
      actualizarDetalle(vistaPrevia);
    };
    const terminar = () => {
      vistaPrevia = '';
      actualizarDetalle(seleccion);
    };
    boton.addEventListener('pointerenter', evento => { if (evento.pointerType === 'mouse') previsualizar(); });
    boton.addEventListener('pointerleave', terminar);
    boton.addEventListener('focus', previsualizar);
    boton.addEventListener('blur', terminar);
    boton.addEventListener('click', evento => vistaSala(sala, evento.detail > 0));
    botonesSala.set(sala.codigo, boton);
    return boton;
  }

  function redibujar() {
    dibujarCampus(canvas, vista, activos);
    const texto = buscar('.mapa-deslizar');
    texto.hidden = viewport.scrollWidth <= viewport.clientWidth + 1;
    if (texto.hidden) {
      viewport.removeAttribute('tabindex');
      viewport.removeAttribute('aria-describedby');
    } else {
      viewport.tabIndex = 0;
      viewport.setAttribute('aria-describedby', texto.id);
    }
  }

  function renderPlano() {
    const salasPiso = porPiso(horario.aulas, piso);
    vista = SECTORES[sector.value] ?? CAMPUS;
    const salasVisibles = sector.value ? salasPiso.filter(sala => sala.edificio === sector.value) : salasPiso;
    activos = new Set(salasVisibles.map(sala => sala.edificio));
    marcadores.replaceChildren();
    pendientesBotones.replaceChildren();
    botonesSala.clear();
    escena.style.setProperty('--proporcion', vista.ancho + ' / ' + vista.alto);
    escena.style.setProperty('--min-plano', Math.ceil(vista.ancho * .74) + 'px');
    escena.style.setProperty('--max-plano', Math.max(vista.ancho * .74, vista.ancho / vista.alto * 596) + 'px');
    for (const sala of salasVisibles) {
      const punto = ubicacionEnPlano(sala);
      (punto ? marcadores : pendientesBotones).append(botonSala(sala, punto));
    }
    pendientes.hidden = !pendientesBotones.childElementCount;
    buscar('.mapa-total').textContent = salasVisibles.length + (salasVisibles.length === 1 ? ' sala' : ' salas');
    viewport.scrollLeft = 0;
    viewport.setAttribute('aria-label', 'Plano del piso ' + piso + (sector.value ? ', edificio ' + sector.value : ''));
    actualizarBotones();
    redibujar();
  }

  function elegirPiso(nivel, edificio) {
    piso = nivel;
    vistaPrevia = '';
    const edificios = [...new Set(porPiso(horario.aulas, piso).map(sala => sala.edificio))].sort();
    sector.replaceChildren(opcion('', 'Todo el campus'), ...edificios.map(codigo => opcion(codigo, 'Edificio ' + codigo)));
    sector.value = edificios.includes(edificio) ? edificio : mini.matches ? edificios[0] : '';
    const salaSeleccionada = salas.get(seleccion);
    if (salaSeleccionada?.piso !== piso || (sector.value && salaSeleccionada.edificio !== sector.value)) {
      seleccion = '';
      buscarSala.value = '';
    }
    for (const [n, boton] of botonesPiso) boton.setAttribute('aria-pressed', String(n === piso));
    renderPlano();
  }

  for (const nivel of niveles) {
    const boton = elemento('button', 'mapa-piso', String(nivel));
    boton.type = 'button';
    boton.setAttribute('aria-label', 'Piso ' + nivel);
    boton.addEventListener('click', () => elegirPiso(nivel, sector.value));
    botonesPiso.set(nivel, boton);
    pisos.append(boton);
    const grupo = elemento('optgroup', '');
    grupo.label = 'Piso ' + nivel;
    for (const sala of porPiso(horario.aulas, nivel)) grupo.append(opcion(sala.codigo, sala.codigo));
    buscarSala.append(grupo);
  }

  sector.addEventListener('change', () => {
    const sala = salas.get(seleccion);
    if (sector.value && sala?.edificio !== sector.value) {
      seleccion = '';
      buscarSala.value = '';
    }
    vistaPrevia = '';
    renderPlano();
  });

  buscarSala.addEventListener('change', () => {
    const sala = salas.get(buscarSala.value);
    if (!sala) {
      seleccion = '';
      actualizarBotones();
      return;
    }
    seleccion = sala.codigo;
    elegirPiso(sala.piso, mini.matches || sector.value ? sala.edificio : '');
    vistaSala(sala, true);
    const boton = botonesSala.get(sala.codigo);
    if (boton && viewport.contains(boton) && viewport.scrollWidth > viewport.clientWidth) {
      const posicion = boton.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
      viewport.scrollLeft += posicion - viewport.clientWidth / 2;
    }
  });

  mini.addEventListener('change', () => elegirPiso(piso, salas.get(seleccion)?.edificio));
  new ResizeObserver(redibujar).observe(escena);
  elegirPiso(piso);

  return {
    actualizar(consulta, vigente, aviso) {
      const clave = [consulta.dia, consulta.desde, consulta.fecha, vigente].join('|');
      if (clave !== claveConsulta) {
        consultaActual = consulta;
        claveConsulta = clave;
        estados = evaluarAulas(horario, consulta, vigente);
        buscar('.mapa-momento').textContent = (consulta.fecha ? 'Ahora · ' : '')
          + datos.dias[consulta.dia] + ' · ' + hhmm(consulta.desde);
        actualizarBotones();
      }
      const alerta = buscar('.mapa-aviso');
      alerta.hidden = !aviso;
      if (aviso) alerta.textContent = aviso;
      buscar('.mapa-leyenda-sin-datos').hidden = vigente;
      buscar('.mapa-minimo').hidden = !consulta.minimo;
    },
  };
}
