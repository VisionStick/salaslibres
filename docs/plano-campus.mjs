export const CAMPUS = { x: 0, y: 0, ancho: 1100, alto: 780 };

export const SECTORES = {
  A: { x: 52, y: 480, ancho: 608, alto: 290 },
  B: { x: 715, y: 142, ancho: 375, alto: 467 },
  E: { x: 716, y: 23, ancho: 375, alto: 235 },
  F: { x: 449, y: 304, ancho: 345, alto: 441 },
  K: { x: 17, y: 168, ancho: 279, alto: 296 },
};

// Posiciones esquemáticas del PDF. Se amplían pasillos y fachadas en los grupos densos.
export const POSICIONES = {
  A001: [515, 535], A002: [447, 535], A003: [379, 535],
  A016: [115, 611], A004: [183, 611], A005: [251, 611], A006: [319, 611],
  A007: [387, 611], A008: [455, 611], A009: [477, 659], A010: [545, 659], A011: [613, 659],
  A012: [527, 721], A013: [459, 721], A014: [391, 721], A015: [323, 721],
  B001: [995, 551], B002: [995, 502], B004: [995, 453], B005: [995, 404],
  B006: [995, 355], B007: [995, 306], B009: [995, 240], B010: [995, 191],
  K100: [127, 253], K101: [113, 306], K102: [99, 359],
  B201: [1001, 549], B202: [928, 549], B203: [855, 549],
  E201: [978, 99], E202: [905, 99], E203: [832, 99],
  K200: [129, 253], K201: [115, 306], K202: [101, 359],
  F310: [673, 440], F325: [544, 675], K300: [129, 253], K301: [115, 306], K302: [101, 359],
  F405: [523, 369], F411: [598, 369], F402: [673, 369],
  F404: [523, 420], F401: [673, 420], F403: [523, 471], F400: [673, 471],
  F409: [523, 549], F408: [523, 600], F407: [673, 600], F425: [553, 683],
};

const zonas = [
  { sector: 'K', sectorEtiqueta: [109, 204], puntos: [[118, 173], [192, 173], [121, 511], [48, 511]] },
  { sector: 'A', sectorEtiqueta: [275, 534], puntos: [[77, 507], [555, 507], [555, 571], [481, 571], [481, 631], [653, 631], [653, 749], [76, 749]] },
  { sector: 'E', sectorEtiqueta: [770, 102], puntos: [[736, 66], [1017, 66], [1017, 135], [736, 135]] },
  { sector: 'B', sectorEtiqueta: [842, 216], puntos: [[768, 166], [1035, 166], [1035, 582], [812, 582], [812, 509], [927, 509], [927, 435], [815, 435], [815, 357], [768, 357]] },
  { sector: 'F', sectorEtiqueta: [596, 425], puntos: [[488, 340], [714, 340], [714, 500], [658, 500], [658, 527], [719, 527], [719, 638], [608, 638], [608, 712], [488, 712]] },
];

function poligono(ctx, puntos, relleno, borde, grosor = 1) {
  ctx.beginPath();
  puntos.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = relleno;
  ctx.fill();
  if (borde) {
    ctx.strokeStyle = borde;
    ctx.lineWidth = grosor;
    ctx.stroke();
  }
}

function caja(ctx, x, y, ancho, alto, color, radio = 10) {
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, radio);
  ctx.fillStyle = color;
  ctx.fill();
}

function linea(ctx, puntos, color, grosor) {
  ctx.beginPath();
  for (const [i, [x, y]] of puntos.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = grosor;
  ctx.stroke();
}

function rotulo(ctx, texto, x, y, color = '#50635a', tamano = 17, peso = 700) {
  ctx.font = peso + ' ' + tamano + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(texto, x, y);
}

export function dibujarCampus(canvas, vista, activos) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#eaf0e9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / vista.ancho, 0, 0, canvas.height / vista.alto,
    -vista.x * canvas.width / vista.ancho, -vista.y * canvas.height / vista.alto);

  poligono(ctx, [[24, 723], [61, 230], [107, 125], [671, 125], [719, 47], [1020, 47],
    [1059, 133], [1064, 726], [1009, 751], [51, 751]], '#f3f5ee', '#a4b8a8', 2.5);

  const caminos = '#dfe7dd';
  linea(ctx, [[63, 710], [81, 529], [201, 529], [211, 166], [686, 166], [748, 142], [1034, 147]], caminos, 19);
  linea(ctx, [[179, 452], [447, 452], [454, 344], [752, 344], [752, 702], [737, 742]], caminos, 19);
  linea(ctx, [[459, 488], [727, 488], [811, 463], [1048, 462]], caminos, 20);
  linea(ctx, [[71, 760], [1037, 760]], '#c8d3c8', 19);

  caja(ctx, 232, 226, 197, 183, '#b4cdb0', 15);
  linea(ctx, [[330, 239], [330, 396]], '#e8f0e4', 2);
  ctx.strokeStyle = '#e8f0e4';
  ctx.lineWidth = 2;
  ctx.strokeRect(244, 239, 172, 157);
  ctx.strokeRect(244, 279, 25, 77);
  ctx.strokeRect(389, 279, 27, 77);
  ctx.beginPath();
  ctx.arc(330, 317, 24, 0, Math.PI * 2);
  ctx.stroke();
  rotulo(ctx, 'Cancha', 330, 367, '#3c594b', 17);

  caja(ctx, 444, 200, 171, 105, '#c1d3cf', 13);
  linea(ctx, [[458, 215], [600, 215], [600, 290], [458, 290], [458, 215]], '#e8f0e9', 2);
  linea(ctx, [[528, 215], [528, 290]], '#e8f0e9', 2);
  rotulo(ctx, 'Gimnasio', 529, 252, '#36584f', 18);

  poligono(ctx, [[769, 535], [817, 578], [959, 581], [1017, 628], [1014, 714], [776, 711]], '#d0dfc6');
  linea(ctx, [[788, 674], [972, 608]], '#edf2e9', 7);
  linea(ctx, [[821, 599], [962, 699]], '#edf2e9', 7);
  caja(ctx, 639, 654, 110, 60, '#dcd3bd');
  caja(ctx, 734, 365, 74, 80, '#dfd5bf');
  caja(ctx, 74, 458, 96, 57, '#dcd3bd');

  const capas = [...zonas.filter(zona => !activos.has(zona.sector)), ...zonas.filter(zona => activos.has(zona.sector))];
  for (const zona of capas) {
    const activo = activos.has(zona.sector);
    poligono(ctx, zona.puntos, activo ? '#d0ded3' : '#e4e9e1', activo ? '#9eb3a4' : '#bdcabe', 2);
    const [x, y] = zona.sectorEtiqueta;
    caja(ctx, x - 16, y - 15, 32, 30, activo ? '#325c50' : '#d7e0d7', 8);
    rotulo(ctx, zona.sector, x, y, activo ? '#f4faf4' : '#566a60', 18, 800);
  }
  const rotulos = [
    ['Biblioteca', 693, 683, 42, '#5c5949', 15],
    ['Auditorio', 119, 489, 40, '#5c5949', 13],
    ['Casino', 769, 409, 30, '#5c5949', 14],
    ['Patio de las Lámparas', 760, 512, 91, '#50635a', 14],
    ['Metro San Joaquín', 174, 760, 72, '#496158', 13],
    ['Av. Vicuña Mackenna', 556, 760, 102, '#496158', 16],
    ['N →', 1034, 705, 21, '#39594d', 15],
  ];
  for (const [nombre, x, y, margen, color, tamano] of rotulos) {
    if (x - margen >= vista.x && x + margen <= vista.x + vista.ancho) {
      rotulo(ctx, nombre, x, y, color, tamano);
    }
  }
}
