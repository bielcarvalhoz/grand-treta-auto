import { frameAt, rectRing, toWorld } from './landmark-kit.js';

// Locomotiva 801 exposta ao lado do CTI. Posição e rumo medidos na imagem aérea; aparência pelas
// fotos e pelo vídeo de quem trabalha no campus (frente para ESE, tênder atrás, brita branca).

const BLACK = '#1b2125', NAVY = '#1c2433', GREY = '#9a9fa2', RED = '#b4202c', WHITE = '#ecebe3', CREAM = '#d9c7a0', BRASS = '#b8963d';
const STEEL = '#3a3f43', WOOD = '#4b3526', GRAVEL = '#e4dfd2', HEDGE = '#3f7d3a', PLAQUE = '#17191b';
// trilho de exposição medido na imagem aérea: 14,3 m para trás e 11,5 m para a frente do centro
export const TRACK = [-14.3, 11.5], BED_WIDTH = 4.6;

/** rumo geográfico (graus a partir do norte, horário) -> yaw do sistema local (+x = frente) */
export const yawFromBearing = (bearing) => { const r = bearing * Math.PI / 180; return Math.atan2(Math.cos(r), Math.sin(r)); };

export function planLocomotive(mark) {
  const frame = frameAt(mark.x, mark.z, yawFromBearing(mark.heading ?? 113));
  return { ...mark, yaw: frame.yaw, frame, bed: rectRing(frame, TRACK[0] - .5, -BED_WIDTH / 2, TRACK[1] + .5, BED_WIDTH / 2),
    body: rectRing(frame, -9.2, -1.25, 6.6, 1.25), garden: rectRing(frame, TRACK[0] - 2.5, -4.6, TRACK[1] + 3.5, 4.6) };
}

const text = (g, lines, w, h, { background, color, font = 'bold 54px Georgia', border = null }) => {
  g.fillStyle = background; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((line, i) => { g.font = line.font || font; g.fillText(line.text ?? line, w / 2, h * (i + 1) / (lines.length + 1)); });
};
const paintPlate = (g, w, h) => {
  g.fillStyle = '#d9c7a0'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b4202c'; g.beginPath(); g.arc(w / 2, h / 2, h * .46, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8cf7a'; g.lineWidth = 7; g.beginPath(); g.arc(w / 2, h / 2, h * .39, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f1dc8c'; g.font = 'bold 92px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('801', w / 2, h / 2 + 4);
};
// O emblema do tênder não é legível nas referências: só o número e um aro, sem inventar sigla.
const paintTender = (g, w, h) => {
  g.fillStyle = '#1c2433'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b8963d'; g.lineWidth = 5; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = '#d7b85c'; g.font = 'bold 96px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('801', w * .3, h / 2);
  g.lineWidth = 6; g.beginPath(); g.arc(w * .7, h / 2, h * .24, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(w * .7, h / 2, h * .13, 0, Math.PI * 2); g.fill();
};
const paintBoard = (words) => (g, w, h) => text(g, [words], w, h, { background: '#4b3526', color: '#f3efe2', font: 'bold 74px Arial' });
const paintPlaque = (g, w, h) => text(g, [{ text: 'LOCOMOTIVA', font: 'bold 68px Arial' }, { text: 'SÍMBOLO DO TRABALHO E', font: 'bold 34px Arial' }, { text: 'DO PROGRESSO', font: 'bold 34px Arial' }], w, h, { background: '#17191b', color: '#f2f1ea', border: '#8d8f8a' });
// O texto da segunda placa não é legível nas referências: só as linhas, sem inventar dizeres.
const paintHistory = (g, w, h) => {
  g.fillStyle = '#17191b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8d8f8a'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#d8d7cf'; for (let i = 0; i < 6; i++) g.fillRect(w * (.12 + (i % 2) * .04), h * (.16 + i * .125), w * (.76 - (i % 3) * .1), h * .05);
};

/** Recua a peça ao longo do próprio trilho até o leito ficar fora das calçadas das vias. */
export function settleLocomotive(place, clearance, margin = 2.6) {
  for (let back = 0; back <= 9; back += .5) {
    const [x, z] = toWorld(place.frame, -back, 0), moved = back ? planLocomotive({ ...place, x, z }) : place;
    if (moved.bed.every(([px, pz]) => clearance(px, pz) >= margin)) return moved;
  }
  return place;
}

export function buildLocomotive(kit, place, { ground, clearance = () => Infinity }) {
  const f = { ...place.frame }, solids = [], surfaces = [], exclusions = [];
  const heights = [...place.bed, [f.x, f.z]].map(([x, z]) => ground(x, z)), top = Math.max(...heights) + .1, bottom = Math.min(...heights) - .25;
  f.y = top;
  // leito de brita branca, dormentes e trilhos (~26 m)
  kit.box(GRAVEL, { ...f, y: 0 }, (TRACK[0] + TRACK[1]) / 2, (top + bottom) / 2, 0, TRACK[1] - TRACK[0] + 1, top - bottom, BED_WIDTH);
  surfaces.push({ rings: [place.bed], y: top });
  // talude de brita em volta do leito, até o gramado (sem degrau branco aparente)
  const [bx0, bx1, bz] = [TRACK[0] - .5, TRACK[1] + .5, BED_WIDTH / 2], rim = (x, z, out) => { const [wx, wz] = toWorld(f, x, z); return out ? [wx, ground(wx, wz) + .03, wz] : [wx, top, wz]; };
  for (let x = bx0; x < bx1 - 1e-6; x += 2) { const x1 = Math.min(bx1, x + 2); for (const side of [-1, 1]) kit.quad(GRAVEL, rim(x, side * bz), rim(x1, side * bz), rim(x1, side * (bz + 1), true), rim(x, side * (bz + 1), true), [0, 1, 0]); }
  for (const [x, out] of [[bx0, bx0 - 1], [bx1, bx1 + 1]]) kit.quad(GRAVEL, rim(x, -bz), rim(x, bz), rim(out, bz + 1, true), rim(out, -bz - 1, true), [0, 1, 0]);
  for (let x = TRACK[0] + .3; x <= TRACK[1] - .2; x += .62) kit.box(WOOD, f, x, .035, 0, .2, .07, 1.9);
  for (const z of [-.53, .53]) kit.box(STEEL, f, (TRACK[0] + TRACK[1]) / 2, .12, z, TRACK[1] - TRACK[0], .14, .075);
  const R = .14 + .08; // topo do boleto

  // --- locomotiva (x: -1.6 cabine ... 6.5 limpa-trilhos)
  kit.box(BLACK, f, 1.9, R + .98, 0, 7.2, .16, 2.1);
  kit.box(BLACK, f, 2.2, R + .62, 0, 6.0, .5, 1.0);
  kit.cylinder(BLACK, f, 2.35, R + 1.92, 0, .72, 3.5, 'x', 18);
  kit.cylinder(GREY, f, 4.6, R + 1.92, 0, .745, 1.05, 'x', 18);
  kit.cylinder(BLACK, f, 5.15, R + 1.92, 0, .76, .09, 'x', 18);
  kit.cylinder(WHITE, f, 5.21, R + 1.92, 0, .6, .05, 'x', 18);
  kit.sign('loco-801', paintPlate, { ...f, yaw: f.yaw + Math.PI / 2 }, 0, R + 1.92, 5.245, .52, .52, { size: [256, 256] });
  for (const z of [-.5, .5]) kit.box(BLACK, f, 5.24, R + 1.92, z, .03, .05, .16);
  kit.cylinder(GREY, f, 4.55, R + 3.3, 0, .2, 1.45, 'y', 12, .25);
  kit.cylinder(BLACK, f, 4.55, R + 4.05, 0, .27, .08, 'y', 12);
  // farol e caixa do número
  kit.box(BLACK, f, 5.0, R + 2.84, 0, .34, .2, .44);
  kit.cylinder(BLACK, f, 5.05, R + 3.2, 0, .29, .46, 'x', 14);
  kit.cylinder(WHITE, f, 5.29, R + 3.2, 0, .24, .03, 'x', 14);
  kit.box(BLACK, f, 4.86, R + 3.56, -.02, .3, .2, .34);
  // domos com remate de latão, sino e apito
  for (const [x, r] of [[3.35, .3], [2.3, .34]]) { kit.cylinder(NAVY, f, x, R + 2.82, 0, r, .48, 'y', 12); kit.sphere(NAVY, f, x, R + 3.06, 0, r, .6); kit.sphere(BRASS, f, x, R + 3.3, 0, .07); }
  kit.cylinder(BRASS, f, 1.5, R + 2.86, 0, .13, .26, 'y', 8, .09);
  // cabine de madeira escura com janelas abertas
  kit.box(BLACK, f, -.55, R + 1.5, 0, 2.1, .9, 2.14);
  kit.box(BLACK, f, -.55, R + 3.2, 0, 2.5, .12, 2.4);
  for (const z of [-1.03, 1.03]) {
    for (const x of [-1.55, -.55, .45]) kit.box(WOOD, f, x, R + 2.55, z, .12, 1.25, .1);
    kit.box(WOOD, f, -.55, R + 3.08, z, 2.1, .14, .1);
    kit.box(RED, f, -.55, R + 1.98, z * 1.005, 2.0, .07, .1);
  }
  kit.box(WOOD, f, .45, R + 2.55, 0, .1, 1.25, 2.1);
  // cilindros, rodas com aro branco e bielas vermelhas
  for (const z of [-1, 1]) {
    kit.cylinder(BLACK, f, 4.35, R + .62, z * 1.02, .34, .95, 'x', 12);
    kit.cylinder(WHITE, f, 4.85, R + .62, z * 1.02, .345, .05, 'x', 12);
    kit.cylinder(CREAM, f, 3.92, R + .62, z * 1.02, .35, .12, 'x', 12);
    for (const x of [.95, 2.1, 3.25]) {
      kit.cylinder(WHITE, f, x, R + .56, z * .74, .56, .12, 'z', 18);
      kit.cylinder(RED, f, x, R + .56, z * .81, .44, .03, 'z', 14);
      kit.cylinder(BLACK, f, x, R + .56, z * .83, .12, .04, 'z', 8);
    }
    kit.cylinder(WHITE, f, 5.25, R + .36, z * .74, .36, .1, 'z', 14);
    kit.cylinder(BLACK, f, 5.25, R + .36, z * .8, .26, .03, 'z', 12);
    kit.tube(RED, f, [.95, R + .4, z * .9], [3.25, R + .4, z * .9], .05, 6);
    kit.tube(RED, f, [2.1, R + .5, z * .96], [4.0, R + .62, z * .96], .045, 6);
    kit.tube(STEEL, f, [-.4, R + 2.4, z * .78], [4.3, R + 2.4, z * .78], .025, 5);
    // macacos vermelhos sobre a testeira
    kit.cylinder(RED, f, 5.55, R + 1.34, z * .82, .07, .56, 'y', 8);
    kit.box(RED, f, 5.55, R + 1.64, z * .82, .22, .06, .08);
  }
  // testeira, engate e limpa-trilhos de ripas brancas com base vermelha
  kit.box(BLACK, f, 5.55, R + .96, 0, .3, .32, 2.2);
  kit.box(RED, f, 5.72, R + .96, 0, .04, .2, 2.2);
  kit.box(BLACK, f, 5.95, R + .78, 0, .5, .22, .3);
  for (let k = 0; k < 9; k++) { const z = -1 + k * .25; kit.tube(WHITE, f, [5.7, R + .82, z * .5], [6.42, R - .04, z], .05, 4); }
  kit.tube(RED, f, [6.44, R - .06, -1.05], [6.44, R - .06, 1.05], .07, 6);
  for (const z of [-1.05, 1.05]) kit.tube(RED, f, [5.7, R + .82, z * .55], [6.44, R - .06, z], .06, 5);

  // --- tênder (x: -9 ... -2.1) com o número 801
  kit.box(BLACK, f, -5.55, R + .86, 0, 6.9, .18, 2.05);
  kit.box(NAVY, f, -5.55, R + 1.75, 0, 6.5, 1.6, 2.2);
  kit.box(BLACK, f, -5.55, R + 2.58, 0, 6.6, .08, 2.3);
  for (const z of [-1.11, 1.11]) kit.sign('tender-801', paintTender, f, -5.55, R + 1.8, z, 3.6, 1.2, { reverse: z < 0 });
  for (const z of [-1.1, 1.1]) { kit.tube(STEEL, f, [-8.7, R + 3.2, z], [-6.4, R + 3.2, z], .025, 5); for (const x of [-8.7, -7.55, -6.4]) kit.tube(STEEL, f, [x, R + 2.6, z], [x, R + 3.2, z], .025, 5); }
  kit.tube(STEEL, f, [-8.7, R + 3.2, -1.1], [-8.7, R + 3.2, 1.1], .025, 5);
  for (const z of [-1, 1]) for (const x of [-8.1, -7.1, -4.0, -3.0]) {
    kit.cylinder(WHITE, f, x, R + .4, z * .74, .4, .1, 'z', 14);
    kit.cylinder(BLACK, f, x, R + .4, z * .8, .3, .03, 'z', 12);
  }
  for (const x of [-7.6, -3.5]) kit.box(BLACK, f, x, R + .45, 0, 1.6, .3, 1.7);
  kit.box(BLACK, f, -1.85, R + .86, 0, .6, .12, .5);
  solids.push({ rings: [place.body], top: top + 3.3, kind: 'locomotiva-801' });

  // --- cruz de santo andré "PARE OLHE ESCUTE / ESTRADA DE FERRO" à direita da frente
  const cross = frameAt(...toWorld(f, 9.6, 2.9), f.yaw + Math.PI / 2, ground(...toWorld(f, 9.6, 2.9)));
  kit.box(WOOD, cross, 0, 1.6, 0, .16, 3.2, .16);
  for (const [key, words, tilt] of [['cruz-a', 'ESTRADA DE FERRO', -.5], ['cruz-b', 'PARE OLHE ESCUTE', .5]]) {
    // tábua inclinada no plano da placa (gira em torno do eixo que aponta para a frente)
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const corners = (depth) => [[-1.2, -.17], [1.2, -.17], [1.2, .17], [-1.2, .17]].map(([u, v]) => { const [x, z] = toWorld(cross, u * c - v * s, depth); return [x, cross.y + 2.75 + u * s + v * c, z]; });
    kit.quad(WOOD, ...corners(.1), null);
    kit.signCorners(key, paintBoard(words), corners(.115), { size: [1024, 128] });
  }
  solids.push({ rings: [rectRing(cross, -.12, -.12, .12, .12)], top: cross.y + 3.2, kind: 'poste-cruz' });

  // --- placas pretas no jardim da frente
  const plaque = (key, paint, x, z, turn, w, h) => {
    const [px, pz] = toWorld(f, x, z), p = frameAt(px, pz, f.yaw + Math.PI / 2 + turn, ground(px, pz));
    kit.box(PLAQUE, p, 0, .42, 0, .05, .84, .05);
    kit.box(PLAQUE, p, 0, .98, .01, w + .06, h + .06, .03);
    kit.sign(key, paint, p, 0, .98, .03, w, h);
  };
  plaque('placa-locomotiva', paintPlaque, TRACK[1] + .9, -1.2, .25, 1.05, .62);
  plaque('placa-historia', paintHistory, TRACK[1] + 1.1, -3.1, .55, .7, .9);

  // --- sebes baixas dos dois lados do leito
  const hedge = (x0, z0, x1, z1) => {
    const pieces = Math.max(1, Math.ceil((x1 - x0) / 2.5));
    for (let k = 0; k < pieces; k++) {
      const xa = x0 + (x1 - x0) * k / pieces, xb = x0 + (x1 - x0) * (k + 1) / pieces, [cx, cz] = toWorld(f, (xa + xb) / 2, (z0 + z1) / 2), g = ground(cx, cz);
      if (clearance(cx, cz) < 2.9) continue;   // sem sebe em cima de calçada ou via
      kit.box(HEDGE, { ...f, y: g }, (xa + xb) / 2, .2, (z0 + z1) / 2, xb - xa + .02, .75, z1 - z0);
      solids.push({ rings: [rectRing(f, xa, z0, xb, z1)], top: g + .57, kind: 'sebe' });
    }
  };
  // (o caminho de paver do lado do CTI é a própria via interna com calçadas do mapa)
  hedge(TRACK[0], -3.3, TRACK[1] + .5, -2.7); hedge(TRACK[0], 2.7, 8.6, 3.3);
  exclusions.push({ kind: 'locomotiva', rings: [place.garden] });
  return { solids, surfaces, exclusions, top };
}
