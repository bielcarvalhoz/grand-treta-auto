import { pointInPolygon } from '../shared/geo.js';
import { convexHull, frameAt, yawOf, toWorld } from './landmark-kit.js';

// Escadaria da mata (Rua Três -> Agência / Portaria 10): eixo da planta oficial; lances, praça
// redonda com bancos, guarda-corpos e passarela de grades verdes conforme o vídeo de referência.

const TREAD = .28, PARAPET = .2, RAIL_HEIGHT = .92, LAP = .4;
const perp = ([dx, dz]) => [-dz, dx];
const along = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s];
const span = (p, d, w) => { const n = perp(d); return [[p[0] + n[0] * w / 2, p[1] + n[1] * w / 2], [p[0] - n[0] * w / 2, p[1] - n[1] * w / 2]]; };

/**
 * Lances e patamares ao longo do eixo `path` (do topo para a base), ainda sem cotas: os níveis
 * são contados em espelhos abaixo do topo. Os últimos `ramps` trechos são rampa (sem degraus).
 */
export function planStairway(path, { width = 3, rampWidth = 2.2, plaza = -1, plazaRadius = 2.7, ramps = 0, topLanding = 1.6 } = {}) {
  const n = path.length, segments = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = path[i + 1][0] - path[i][0], dz = path[i + 1][1] - path[i][1], L = Math.hypot(dx, dz), ramp = i >= n - 1 - ramps;
    segments.push({ a: path[i], b: path[i + 1], L, d: [dx / L, dz / L], ramp, w: ramp ? rampWidth : width });
  }
  const before = new Array(n).fill(0), after = new Array(n).fill(0);
  after[0] = topLanding;
  for (let i = 1; i < n - 1; i++) {
    const A = segments[i - 1], B = segments[i];
    if (i === plaza) { before[i] = Math.sqrt(plazaRadius ** 2 - (A.w / 2) ** 2); after[i] = Math.sqrt(plazaRadius ** 2 - (B.w / 2) ** 2); continue; }
    const turn = Math.acos(Math.max(-1, Math.min(1, A.d[0] * B.d[0] + A.d[1] * B.d[1])));
    before[i] = after[i] = Math.max(1.3, Math.max(A.w, B.w) / 2 * Math.tan(turn / 2) + .45);
  }
  const last = segments[n - 2];
  if (!last.ramp) before[n - 1] = .4;
  const flights = [], rampsOut = [], landings = [];
  let level = 0;
  const head = along(path[0], segments[0].d, -LAP);
  landings.push({ kind: 'top', node: path[0], level, ring: [...span(head, segments[0].d, width), ...span(along(path[0], segments[0].d, topLanding), segments[0].d, width).reverse()], open: [span(head, segments[0].d, width), span(along(path[0], segments[0].d, topLanding), segments[0].d, width)] });
  for (let i = 0; i < n - 1; i++) {
    const s = segments[i], a = along(s.a, s.d, after[i]), b = along(s.b, s.d, -before[i + 1]), run = s.L - after[i] - before[i + 1];
    if (run < .6) throw new Error(`trecho ${i} da escadaria curto demais (${run.toFixed(2)} m)`);
    if (s.ramp) rampsOut.push({ a, b, d: s.d, w: s.w, run, level0: level, last: i === n - 2 });
    else { const k = Math.max(2, Math.round(run / TREAD)); flights.push({ a, b, d: s.d, w: s.w, k, tread: run / k, run, level0: level, index: i }); level += k; }
    if (i === n - 2) {
      if (!s.ramp) landings.push({ kind: 'bottom', node: s.b, level, ring: [...span(b, s.d, s.w), ...span(along(s.b, s.d, 1.6), s.d, s.w).reverse()], open: [span(b, s.d, s.w), span(along(s.b, s.d, 1.6), s.d, s.w)] });
      break;
    }
    const next = segments[i + 1], start = along(next.a, next.d, after[i + 1]);
    const inA = span(b, s.d, s.w), outB = span(start, next.d, next.w), node = path[i + 1];
    if (i + 1 === plaza) {
      // Praça redonda: os cantos dos lances ficam sobre o círculo; os arcos laterais levam os bancos.
      const angle = (p) => Math.atan2(p[1] - node[1], p[0] - node[0]), wrap = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // cada arco parte de um canto da chegada, afastando-se da abertura, até o canto da saída do mesmo lado
      const entry = wrap(angle(inA[1]) - angle(inA[0])) <= Math.PI ? 1 : -1;
      const arcs = [0, 1].map((side) => {
        const a0 = angle(inA[side]), dir = side === 0 ? -entry : entry, sweep = dir * wrap(dir * (angle(outB[side]) - a0));
        const steps = Math.max(3, Math.ceil(Math.abs(sweep) / .3));
        return { a0, sweep, points: Array.from({ length: steps + 1 }, (_, k) => { const t = a0 + sweep * k / steps; return [node[0] + Math.cos(t) * plazaRadius, node[1] + Math.sin(t) * plazaRadius]; }) };
      });
      landings.push({ kind: 'plaza', node, level, radius: plazaRadius, arcs, ring: [...arcs[0].points, ...arcs[1].points.slice().reverse()], open: [inA, outB] });
    } else {
      const turn = s.d[0] * next.d[1] - s.d[1] * next.d[0], nA = perp(s.d), nB = perp(next.d);
      const bis = [nA[0] + nB[0], nA[1] + nB[1]], bl = Math.hypot(...bis) || 1, half = Math.max(s.w, next.w) / 2;
      const cosHalf = Math.sqrt(Math.max(.05, (1 + s.d[0] * next.d[0] + s.d[1] * next.d[1]) / 2)), out = -Math.sign(turn || 1) * half / cosHalf;
      const mitre = [node[0] + bis[0] / bl * out, node[1] + bis[1] / bl * out];
      landings.push({ kind: 'corner', node, level, ring: convexHull([...inA, ...outB, mitre, node]), open: [inA, outB] });
    }
  }
  return { width, risers: level, flights, ramps: rampsOut, landings, path };
}

/** cota de cada peça: topo - nível * espelho; a rampa final desce (ou sobe) até `endY` */
export function resolveStairway(plan, { topY, riser, endY }) {
  const y = (level) => topY - level * riser, bottomY = y(plan.risers);
  let from = bottomY;
  const total = plan.ramps.reduce((sum, r) => sum + r.run, 0) || 1;
  const ramps = plan.ramps.map((r) => { const ya = from, yb = from + (endY - bottomY) * r.run / total; from = yb; return { ...r, ya, yb }; });
  return { ...plan, topY, riser, bottomY, endY, yAt: y, ramps };
}

const edgeIsOpen = (a, b, open) => open.some(([p, q]) => {
  const near = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]) < .06;
  return (near(a, p) && near(b, q)) || (near(a, q) && near(b, p));
});

/** pontos [x, z, y] da superfície pronta (com folga lateral), para abrir o relevo por baixo */
export function stairwaySamples(S, margin = .55) {
  const samples = [];
  const strip = (a, d, w, length, yAt) => {
    const n = perp(d), half = w / 2 + PARAPET + margin;
    for (let s = 0; s <= length + 1e-6; s += .28) for (let t = -half; t <= half + 1e-6; t += .5) samples.push([a[0] + d[0] * s + n[0] * t, a[1] + d[1] * s + n[1] * t, yAt(s)]);
  };
  for (const f of S.flights) strip(f.a, f.d, f.w, f.run, (s) => S.yAt(f.level0 + Math.min(f.k, Math.floor(s / f.tread + 1e-6) + 1)));
  for (const r of S.ramps) strip(r.a, r.d, r.w, r.run, (s) => r.ya + (r.yb - r.ya) * s / r.run - .04);
  for (const l of S.landings) {
    const xs = l.ring.map((p) => p[0]), zs = l.ring.map((p) => p[1]), y = S.yAt(l.level);
    for (let x = Math.min(...xs) - margin; x <= Math.max(...xs) + margin; x += .5) for (let z = Math.min(...zs) - margin; z <= Math.max(...zs) + margin; z += .5)
      if (pointInPolygon(x, z, [l.ring]) || l.ring.some((p) => Math.hypot(p[0] - x, p[1] - z) < margin + .3)) samples.push([x, z, y]);
  }
  return samples;
}

const C_STEP = '#918c82', C_LANDING = '#99948a', C_WALL = '#6d7174', C_SEAT = '#a9a59c', C_RAIL = '#35393c', C_YELLOW = '#d8b13a';
const C_GRATE = '#2a2d2f', C_SLAB = '#b7b1a4', C_GREEN = '#3c7550', C_BIN = '#2e6a44', C_BAMBOO = '#7c9a45', C_LEAF = '#4f8a3a';

/** malha, pisos e colisão; `ground(x, z)` = relevo já escavado */
export function buildStairway(kit, S, { ground, sawtoothFrom = Infinity } = {}) {
  const surfaces = [], solids = [], exclusions = [];
  const wallSolid = (a, b, top) => {
    const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d) || 1, n = [-d[1] / L * PARAPET / 2, d[0] / L * PARAPET / 2];
    solids.push({ rings: [[[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]], top, kind: 'guarda-corpo-escadaria' });
  };
  const floorUnder = (points, y) => Math.min(y - .45, ...points.map(([x, z]) => ground(x, z) - .3));

  for (const f of S.flights) {
    const frame = frameAt(f.a[0], f.a[1], yawOf(f.d[0], f.d[1])), n = perp(f.d), half = f.w / 2, sawtooth = f.index >= sawtoothFrom;
    for (let j = 0; j < f.k; j++) {
      const y = S.yAt(f.level0 + j + 1), x0 = j * f.tread, x1 = x0 + f.tread;
      const ring = [toWorld(frame, x0, -half), toWorld(frame, x1, -half), toWorld(frame, x1, half), toWorld(frame, x0, half)];
      const base = floorUnder(ring, y);
      kit.box(C_STEP, frame, (x0 + x1) / 2, (y + base) / 2, 0, f.tread + .004, y - base, f.w);
      surfaces.push({ rings: [ring], y });
      if (j < f.k - 1) for (const side of [-1, 1]) kit.box(C_YELLOW, frame, x1 - .04, y + .006, side * (half - .24), .07, .012, .42);
    }
    // piso tátil amarelo na cabeça do lance
    kit.box(C_YELLOW, frame, -.26, S.yAt(f.level0) + .007, 0, .4, .014, f.w - .2);
    for (const side of [-1, 1]) {
      const offset = side * (half + PARAPET / 2), chunk = 4;
      for (let j = 0; j < f.k; j += chunk) {
        const j1 = Math.min(f.k, j + chunk), a = toWorld(frame, j * f.tread, offset), b = toWorld(frame, j1 * f.tread, offset);
        const ya = S.yAt(f.level0 + j), yb = S.yAt(f.level0 + j1), base = Math.min(ground(...a), ground(...b), yb) - .4;
        if (sawtooth) kit.wall(C_WALL, a, b, PARAPET, base, ya + .98, base, ya + .98);
        else kit.wall(C_WALL, a, b, PARAPET, base, ya + 1.02, base, yb + 1.02);
        wallSolid(a, b, ya + 1.0);
      }
      // corrimão de aço com suportes presos à mureta
      const inner = side * (half - .09), top = S.yAt(f.level0) + RAIL_HEIGHT, bottom = S.yAt(f.level0 + f.k) + RAIL_HEIGHT;
      kit.tube(C_RAIL, frame, [.05, top, inner], [f.run - .05, bottom, inner], .028, 6);
      for (let s = .5; s < f.run; s += 1.6) { const y = top + (bottom - top) * (s - .05) / (f.run - .1); kit.tube(C_RAIL, frame, [s, y, inner], [s, y - .12, side * half], .018, 4); }
    }
    const pad = 2.2;
    exclusions.push({ kind: 'escadaria', rings: [[toWorld(frame, -pad, -half - pad), toWorld(frame, f.run + pad, -half - pad), toWorld(frame, f.run + pad, half + pad), toWorld(frame, -pad, half + pad)]] });
  }

  for (const l of S.landings) {
    const y = S.yAt(l.level), base = floorUnder(l.ring, y);
    kit.prism(C_LANDING, l.ring, base, y);
    surfaces.push({ rings: [l.ring], y });
    exclusions.push({ kind: 'escadaria', x: l.node[0], z: l.node[1], radius: (l.radius || S.width / 2 + 1) + 2.4 });
    if (l.kind === 'plaza') {
      // Dois bancos semicirculares de concreto com encosto: o par que forma a praça redonda.
      for (const arc of l.arcs) {
        const R = l.radius, steps = Math.max(4, Math.ceil(Math.abs(arc.sweep) / .22));
        const at = (t, r) => [l.node[0] + Math.cos(t) * r, l.node[1] + Math.sin(t) * r];
        for (let k = 0; k < steps; k++) {
          const t0 = arc.a0 + arc.sweep * k / steps, t1 = arc.a0 + arc.sweep * (k + 1) / steps;
          const a = at(t0, R + PARAPET / 2), b = at(t1, R + PARAPET / 2), wallBase = Math.min(ground(...a), ground(...b), y) - .4;
          kit.wall(C_WALL, a, b, PARAPET + .06, wallBase, y + 1.0, wallBase, y + 1.0);
          wallSolid(a, b, y + 1.0);
          const trim = .16 * Math.abs(arc.sweep);
          if (Math.abs(t0 - arc.a0) < trim - 1e-6 || Math.abs(arc.a0 + arc.sweep - t1) < trim - 1e-6) continue;
          kit.prism(C_SEAT, [at(t0, R - .62), at(t1, R - .62), at(t1, R - .02), at(t0, R - .02)], y + .36, y + .46);
          kit.prism(C_WALL, [at(t0, R - .5), at(t1, R - .5), at(t1, R - .02), at(t0, R - .02)], y, y + .36);
          solids.push({ rings: [[at(t0, R - .62), at(t1, R - .62), at(t1, R), at(t0, R)]], top: y + .46, kind: 'banco-escadaria' });
        }
      }
      continue;
    }
    for (let i = 0; i < l.ring.length; i++) {
      const a = l.ring[i], b = l.ring[(i + 1) % l.ring.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < .08 || edgeIsOpen(a, b, l.open)) continue;
      const wallBase = Math.min(ground(...a), ground(...b), y) - .4;
      kit.wall(C_WALL, a, b, PARAPET, wallBase, y + 1.0, wallBase, y + 1.0);
      wallSolid(a, b, y + 1.0);
    }
  }
  // grelha de drenagem no último patamar antes da base, como no vídeo
  const drain = S.landings.filter((l) => l.kind === 'corner').at(-2) || S.landings.at(-1);
  if (drain) { const f = S.flights.find((q) => q.level0 === drain.level); if (f) kit.box(C_GRATE, frameAt(f.a[0], f.a[1], yawOf(...f.d)), -.75, S.yAt(drain.level) + .008, 0, .32, .016, f.w - .3); }

  for (const r of S.ramps) {
    const frame = frameAt(r.a[0], r.a[1], yawOf(r.d[0], r.d[1])), half = r.w / 2, slices = Math.max(1, Math.ceil(r.run / .6)), yAt = (s) => r.ya + (r.yb - r.ya) * s / r.run;
    for (let k = 0; k < slices; k++) {
      const s0 = r.run * k / slices, s1 = r.run * (k + 1) / slices, y0 = yAt(s0), y1 = yAt(s1);
      const P = (s, t, y) => { const [x, z] = toWorld(frame, s, t); return [x, y, z]; };
      const ring = [toWorld(frame, s0, -half), toWorld(frame, s1, -half), toWorld(frame, s1, half), toWorld(frame, s0, half)], base = floorUnder(ring, Math.min(y0, y1));
      kit.quad(C_SLAB, P(s0, -half, y0), P(s1, -half, y1), P(s1, half, y1), P(s0, half, y0), [0, 1, 0]);
      for (const side of [-1, 1]) kit.quad(C_SLAB, P(s0, side * half, base), P(s1, side * half, base), P(s1, side * half, y1), P(s0, side * half, y0), [toWorld(frame, 0, side)[0] - frame.x, 0, toWorld(frame, 0, side)[1] - frame.z]);
      surfaces.push({ rings: [ring], y: Math.max(y0, y1) });
    }
    // Grades tubulares verdes dos dois lados (montantes + dois tubos), abertas nas pontas.
    for (const side of [-1, 1]) {
      const t = side * (half - .06);
      for (const h of [.55, 1.02]) kit.tube(C_GREEN, frame, [0, r.ya + h, t], [r.run, r.yb + h, t], .032, 6);
      const posts = Math.max(2, Math.round(r.run / 1.7));
      for (let k = 0; k <= posts; k++) { const s = r.run * k / posts; kit.tube(C_GREEN, frame, [s, yAt(s) - .02, t], [s, yAt(s) + 1.02, t], .034, 6); }
      for (let s = 0; s < r.run - 1e-6; s += 2.4) {
        const s1 = Math.min(r.run, s + 2.4), a = toWorld(frame, s, t), b = toWorld(frame, s1, t);
        solids.push({ rings: [[toWorld(frame, s, t - .06), toWorld(frame, s1, t - .06), toWorld(frame, s1, t + .06), toWorld(frame, s, t + .06)]], top: Math.max(yAt(s), yAt(s1)) + 1.0, kind: 'grade-verde', a, b });
      }
    }
    exclusions.push({ kind: 'passarela', rings: [[toWorld(frame, -1.5, -half - 1.6), toWorld(frame, r.run + 1.5, -half - 1.6), toWorld(frame, r.run + 1.5, half + 1.6), toWorld(frame, -1.5, half + 1.6)]] });
    if (r.last) {
      // emenda com a calçada da via
      const lap = [toWorld(frame, r.run, -half), toWorld(frame, r.run + LAP, -half), toWorld(frame, r.run + LAP, half), toWorld(frame, r.run, half)];
      kit.box(C_SLAB, frame, r.run + LAP / 2, r.yb - .3, 0, LAP, .6, r.w); surfaces.push({ rings: [lap], y: r.yb });
      // lixeiras verdes junto à passarela e a touceira de bambu ao pé da escada
      for (let k = 0; k < 3; k++) { kit.box(C_BIN, frame, 2.4 + k * .95, r.ya + .55 + (r.yb - r.ya) * (2.4 + k * .95) / r.run, half + .65, .7, 1.1, .75); kit.box('#22262a', frame, 2.4 + k * .95, r.ya + 1.13 + (r.yb - r.ya) * (2.4 + k * .95) / r.run, half + .65, .74, .06, .79); }
    }
  }
  const foot = S.flights.at(-1);
  if (foot) {
    const frame = frameAt(foot.b[0], foot.b[1], yawOf(...foot.d));
    for (let k = 0; k < 16; k++) {
      const u = -3.4 + (k % 4) * .34 + (k * 37 % 7) * .05, v = foot.w / 2 + 1.5 + Math.floor(k / 4) * .36 + (k * 53 % 5) * .05, [x, z] = toWorld(frame, u, v), g = ground(x, z), h = 4.2 + (k * 29 % 9) * .22;
      kit.cylinder(C_BAMBOO, frameAt(x, z, 0, g), 0, h / 2, 0, .045, h, 'y', 5);
      kit.sphere(C_LEAF, frameAt(x, z, 0, g), 0, h - .25, 0, .55, .7);
    }
    exclusions.push({ kind: 'bambu', x: toWorld(frame, -2.9, foot.w / 2 + 2)[0], z: toWorld(frame, -2.9, foot.w / 2 + 2)[1], radius: 2 });
  }
  return { surfaces, solids, exclusions };
}
