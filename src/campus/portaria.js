import { frameAt, rectRing, toWorld } from './landmark-kit.js';
import { yawFromBearing } from './locomotive.js';

// Portaria dupla (Bussocaba): UMA cobertura com duas lajes lado a lado sobre as duas pistas,
// vigas e pilares vermelhos, testeira "bradesco", guarita e canteiro — conforme a vista aérea
// enviada pelo usuário. Substitui as duas marquises separadas que o jogo gerava por cruzamento de muro.

const RED = '#c8102e', SLAB = '#e7e3da', WHITE = '#f4f3ef', GLASS = 'glass', HEDGE = '#3f7d3a', CURB = '#cfc9bc';

export function planPortaria(mark, inside) {
  let yaw = yawFromBearing(mark.heading ?? 90) ;
  let frame = frameAt(mark.x, mark.z, yaw);
  // +z local aponta para FORA do campus (rua)
  if (inside(...toWorld(frame, 0, 14))) frame = frameAt(mark.x, mark.z, yaw + Math.PI);
  const half = (mark.width ?? 36) / 2, depth = mark.depth ?? 10.5;
  return { ...mark, frame, half, depth, ring: rectRing(frame, -half, -depth / 2, half, depth / 2) };
}

const paintFascia = (name) => (g, w, h) => {
  g.fillStyle = RED; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `bold ${Math.round(h * .62)}px Arial`; g.fillText('bradesco', h * .5, h * .52);
  g.textAlign = 'right'; g.font = `${Math.round(h * .4)}px Arial`; g.fillText(name, w - h * .5, h * .54);
};

export function buildPortaria(kit, P, { ground, clearance }) {
  const solids = [], exclusions = [], f = { ...P.frame }, top = Math.max(...P.ring.map((p) => ground(...p)), ground(f.x, f.z)) + 5.6, slabW = P.half - .35;
  f.y = 0;
  const pillar = (x, z) => { const [wx, wz] = toWorld(f, x, z), g = ground(wx, wz); kit.box(RED, f, x, (g + top + .75) / 2, z, .75, top + .75 - g, .75); solids.push({ rings: [rectRing(f, x - .45, z - .45, x + .45, z + .45)], top: top + .7, kind: 'pilar-portaria' }); };
  for (const side of [-1, 1]) {
    const cx = side * (slabW / 2 + .35);
    kit.box(SLAB, f, cx, top - .28, 0, slabW, .56, P.depth);
    kit.box(WHITE, f, cx, top - .75, P.depth / 2 - .1, slabW, .5, .2); kit.box(WHITE, f, cx, top - .75, -P.depth / 2 + .1, slabW, .5, .2);
  }
  // vigas vermelhas atravessando as lajes, com pilares nas pontas (fora das pistas)
  for (const x of [-P.half + .6, -.9, P.half * .55]) {
    kit.box(RED, f, x, top + .3, 0, .75, .6, P.depth + 2.2);
    for (const z of [-P.depth / 2 - .7, P.depth / 2 + .7]) { const [wx, wz] = toWorld(f, x, z); if (clearance(wx, wz) > .9) pillar(x, z); }
  }
  // testeira vermelha "bradesco" na laje da direita, voltada para a rua (e a mesma por dentro)
  const signW = slabW * .78, sx = P.half * .5;
  for (const side of [1, -1]) kit.sign('portaria-bussocaba', paintFascia(P.name || 'Portaria'), f, sx, top - .7, side * (P.depth / 2 + .02), signW, .95, { reverse: side < 0, size: [1024, 96] });
  // guarita branca envidraçada e canteiro na ilha entre as pistas (onde não passa via)
  for (const [x, z, w, d] of [[2.2, 0, 3.6, 4.4], [-P.half * .5, 0, 3, 3.6], [P.half - 3, 0, 3.6, 4.4]]) {
    const ring = rectRing(f, x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    if (ring.some((p) => clearance(...p) < .7)) continue;
    const g = Math.min(...ring.map((p) => ground(...p)));
    kit.box(WHITE, f, x, g + 1.5, z, w, 3, d); kit.box(GLASS, f, x, g + 1.75, z, w + .06, 1.1, d + .06); kit.box(RED, f, x, g + 3.1, z, w + .3, .22, d + .3);
    solids.push({ rings: [ring], top: g + 3.1, kind: 'guarita' });
  }
  for (let x = -4; x <= 6; x += 1.2) { const [wx, wz] = toWorld(f, x, P.depth / 2 + 4.5); if (clearance(wx, wz) < 1.6) continue; const g = ground(wx, wz); kit.cylinder(CURB, { ...f, x: wx, z: wz, y: g }, 0, .12, 0, 1.3, .24, 'y', 10); kit.sphere(HEDGE, { ...f, x: wx, z: wz, y: g }, 0, .55, 0, 1, .6); }
  exclusions.push({ kind: 'portaria', rings: [rectRing(f, -P.half - 3, -P.depth / 2 - 5, P.half + 3, P.depth / 2 + 7)] });
  return { solids, surfaces: [], exclusions, top };
}
