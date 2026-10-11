import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProjection, openRing, pointInPolygon, distToSegment } from '../../src/shared/geo.js';
import { createTerrain } from '../../src/map/terrain.js';
import { parseWorld } from '../../src/map/world.js';
import { correctCampusTerrain, gradeCampusTerrain } from '../../src/campus/grading.js';
import { prepareLandmarks } from '../../src/campus/landmarks.js';
import { prepareLeisure, gradeLeisure, buildLeisure, trackShape } from '../../src/campus/leisure.js';

const data = (name) => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url)));
const centre = (ring) => ring.reduce((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length], [0, 0]);

/** A convivência sobre os dados reais (relevo, vias, levantamento), sem renderização. */
let cached;
function actualLeisure() {
  if (cached) return cached;
  const geo = data('cidade-de-deus.geojson'), campusGeo = data('campus-cidade-de-deus.geojson');
  const q = geo.features.find((f) => f.properties.place === 'quarter').geometry.coordinates[0];
  const proj = createProjection((Math.min(...q.map((p) => p[0])) + Math.max(...q.map((p) => p[0]))) / 2, (Math.min(...q.map((p) => p[1])) + Math.max(...q.map((p) => p[1]))) / 2);
  const terrain = createTerrain(data('terrain.json'), proj), world = parseWorld(geo, proj);
  for (const road of world.roads) { const middle = road.pts[Math.floor(road.pts.length / 2)]; road.internal = road.kind !== 'foot' && road.highway === 'service' && pointInPolygon(...middle, world.quarter); }
  const C = { quarter: world.quarter, buildings: [], palms: [], trees: [], floodlights: [] };
  let layout;
  for (const f of campusGeo.features) {
    const p = f.properties, g = f.geometry;
    if (p.kind === 'building') C.buildings.push({ ...p, rings: g.coordinates.map((ring) => openRing(ring.map((c) => proj.toLocal(...c)))) });
    else if (p.kind === 'leisure') layout = p.layout;
    else if (p.kind === 'roadFix') (C.paths ||= []).push({ ...p, pts: g.coordinates.map((c) => proj.toLocal(...c)) });
    else if (p.kind === 'groundControl') { C.controlOffset = p.offset || 0; C.groundControl = g.coordinates.map(([lon, lat, altitude]) => [...proj.toLocal(lon, lat), altitude + (p.offset || 0)]); }
  }
  const osm = { pitches: world.areas.filter((a) => a.kind === 'pitch').length, buildings: C.buildings.length };
  prepareLandmarks(C, world);   // eixos de via corrigidos (a rua contorna a arquibancada)
  const G = prepareLeisure(C, world, proj, layout);
  correctCampusTerrain(terrain, C);
  for (const a of world.areas) if (a.kind === 'water') a.waterLevel = terrain.carveWater(a.rings);
  gradeCampusTerrain(world, terrain, C);
  const report = gradeLeisure(world, terrain, C), built = buildLeisure(C, { terrain });
  return (cached = { C, G, world, terrain, report, built, osm, T: C.track });
}

test('track shape: two straights and two bends, lanes nested, inside/outside distances', () => {
  const pitch = [[-10, -30], [10, -30], [10, 30], [-10, 30]];   // eixo longo = +z
  const T = trackShape(pitch, { centro: [0, 0], meiaReta: 40, raioInterno: 20, raias: 4 });
  assert.ok(Math.abs(T.ux) < 1e-9 && Math.abs(T.uz - 1) < 1e-9);
  assert.ok(Math.abs(T.rOut - 24.88) < 1e-9);
  assert.equal(T.lanes.length, 5);
  assert.ok(Math.abs(T.radiusAt(0, 0)) < 1e-9 && Math.abs(T.radiusAt(22, 10) - 22) < 1e-9 && Math.abs(T.radiusAt(0, 65) - 25) < 1e-9);
  for (const p of T.lanes[0]) assert.ok(Math.abs(T.radiusAt(...p) - 20) < 1e-6);
  for (const p of T.outer) assert.ok(pointInPolygon(...p, [T.outer.map(([x, z]) => [x * 1.01, z * 1.01])]));
});

test('the track goes AROUND the tennis courts, the pitch and the three sports courts', () => {
  const { G, T, world, osm } = actualLeisure();
  assert.ok(T.surveyed && T.straight > 55 && T.rOut - T.rIn > 5.5);
  const inside = [G.campo, G.tenis.piso, ...G.tenis.quadras, ...G.quadras.map((q) => q.anel)];
  for (const ring of inside) for (const p of ring) assert.ok(T.radiusAt(...p) < T.rIn - .1, `quadra cortada pela pista (${(T.radiusAt(...p) - T.rIn).toFixed(2)} m)`);
  // tênis ao norte e poliesportivas ao sul do campo, sem sobreposição
  const along = (p) => (p[0] - T.cx) * T.ux + (p[1] - T.cz) * T.uz, ends = G.campo.map(along);
  assert.ok(Math.max(...G.tenis.piso.map(along)) < Math.min(...ends) && Math.min(...G.quadras.flatMap((q) => q.anel.map(along))) > Math.max(...ends));
  const rings = [...G.tenis.quadras, ...G.quadras.map((q) => q.anel)];
  rings.forEach((a, i) => rings.forEach((b, j) => { if (i !== j) for (const p of a) assert.ok(!pointInPolygon(...p, [b]), 'quadras sobrepostas'); }));
  assert.deepEqual(G.quadras.map((q) => q.tipo), ['futsal', 'basquete', 'futsal']);
  // as formas do OSM/planta dessa área saíram; ficou um campo só
  assert.equal(world.areas.filter((a) => a.kind === 'pitch' && Math.hypot(centre(a.rings[0])[0] - T.cx, centre(a.rings[0])[1] - T.cz) < 150).length, 1);
  assert.equal(world.areas.filter((a) => a.kind === 'track').length, 1);
  assert.ok(osm.pitches >= 1);
});

test('lake, kiosks, statue, pools and buildings sit outside the track and clear of each other', () => {
  const { G, T, C, world } = actualLeisure();
  for (const p of [...G.lago, ...G.quiosques, G.estatua, ...G.quadraLago, ...G.piscina.deck, ...G.vestiario, ...G.clube, ...G.arquibancada.frente]) assert.ok(T.radiusAt(...p) > T.rOut + .5, `invade a pista (${(T.radiusAt(...p) - T.rOut).toFixed(2)} m)`);
  for (const p of [...G.quiosques, G.estatua, ...G.quadraLago]) assert.ok(!pointInPolygon(...p, [G.lago]));
  assert.equal(G.quiosques.length, 2);
  for (const pool of [G.piscina.raias, G.piscina.oeste, G.piscina.leste]) for (const p of pool) assert.ok(pointInPolygon(...p, [G.piscina.deck]), 'piscina fora do deck');
  assert.equal(world.areas.filter((a) => a.kind === 'pool' && pointInPolygon(...centre(a.rings[0]), [G.piscina.deck])).length, 3);
  assert.ok(C.buildings.some((b) => b.leisure === 'vestiario') && C.buildings.some((b) => b.leisure === 'clube'));
  assert.ok(C.palms.length >= 15, 'palmeiras na margem do lago');
  // nada sobre o leito das vias internas
  const clear = (p, margin) => world.roads.every((r) => !r.internal || r.kind === 'foot' || r.pts.every((q, i) => !i || distToSegment(...p, ...r.pts[i - 1], ...q).d > r.w / 2 + margin));
  for (const p of [...G.lago, ...G.quiosques, G.estatua, ...G.vestiario, ...G.clube, ...G.piscina.deck]) assert.ok(clear(p, 2.4), 'sobre uma via');
});

test('relief: pitch, courts and terrace are level; pool deck one step up; bleachers climb to the street behind', () => {
  const L = actualLeisure(), { G, T, terrain, built, world } = L, level = T.groundLevel, S = G.stand;
  for (const ring of [G.campo, G.tenis.piso, ...G.quadras.map((q) => q.anel)]) for (const p of [...ring, centre(ring)]) assert.ok(Math.abs(terrain.heightAt(...p) - level) < .05, 'quadra inclinada');
  assert.ok(Math.abs(terrain.heightAt(...centre(G.piscina.raias)) - G.piscina.level) < .1);
  assert.ok(G.piscina.level - level > .2 && G.piscina.level - level < 2);
  // a pista inteira é plana (nenhuma terraplenagem vizinha mexe nos triângulos que a tocam)
  for (const ring of [T.outer, T.inner, T.lanes[2]]) for (const p of ring) assert.ok(Math.abs(terrain.heightAt(...p) - level) < .02, `pista com ${(terrain.heightAt(...p) - level).toFixed(2)} m de desnível`);
  assert.ok(S.segments.reduce((sum, g) => sum + g.L, 0) > 80, 'arquibancada completa, até a ponta norte');
  assert.ok(S.rows >= 18 && S.rise >= .3 && S.rise <= .47 && S.top - level > 6, `arquibancada com ${(S.top - level).toFixed(1)} m`);
  assert.equal(L.report.stand.blocked, 0);
  for (const surface of built.surfaces) { const c = centre(surface.rings[0]); assert.ok(terrain.heightAt(...c) <= surface.y + .05, 'relevo acima de um piso'); }
  // sobe-se a pé do terraço ao passeio alto (degrau máximo do personagem: 0,7 m)
  assert.ok(S.segments[0].rows < S.rows && S.segments[0].rows >= 4, 'parte esquerda mais baixa, acompanhando a curva');
  const seg = S.segments.at(-2), mid = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2], groundAt = (x, z, y) => Math.max(terrain.heightAt(x, z), built.surfaceHeightAt(x, z, y + .7));
  let [x, z] = [mid[0] - seg.n[0] * 2, mid[1] - seg.n[1] * 2], y = groundAt(x, z, level + 1), jump = 0;
  for (let s = 0; s < S.depth + 3.2; s += .1) { x += seg.n[0] * .1; z += seg.n[1] * .1; const g = groundAt(x, z, y); jump = Math.max(jump, Math.abs(g - y)); y = g; }
  assert.ok(jump <= .5, `degrau de ${jump.toFixed(2)} m`);
  assert.ok(Math.abs(y - S.top) < .05, 'chega ao passeio alto, de onde se vê o campo de cima');
  // a arquibancada não invade a rua de trás
  for (const g of S.segments) for (const s of [0, g.L]) for (const d of [0, g.depth + 2.6]) {
    const p = [g.a[0] + g.d[0] * s + g.n[0] * d, g.a[1] + g.d[1] * s + g.n[1] * d];
    assert.ok(world.roads.every((r) => !r.internal || r.kind === 'foot' || r.pts.every((q, i) => !i || distToSegment(...p, ...r.pts[i - 1], ...q).d > r.w / 2 + 2.2)), 'arquibancada sobre a rua');
  }
});

test('built pieces: fences leave a gate, nets and equipment collide, stats are sane', () => {
  const { built, G } = actualLeisure(), kinds = new Set(built.solids.map((s) => s.kind));
  for (const kind of ['alambrado', 'rede', 'trave', 'tabela', 'churrasqueira', 'estatua', 'mureta-lago', 'bar', 'mureta-arquibancada', 'abrigo']) assert.ok(kinds.has(kind), `falta colisão: ${kind}`);
  // portão do tênis: o meio da aresta voltada para o campo fica livre
  const gate = [(G.tenis.piso[3][0] + G.tenis.piso[0][0]) / 2, (G.tenis.piso[3][1] + G.tenis.piso[0][1]) / 2];
  assert.ok(!built.solids.some((s) => s.kind === 'alambrado' && pointInPolygon(...gate, s.rings)));
  assert.equal(built.stats.kiosks, 2); assert.equal(built.stats.courts, 6);
  assert.ok(built.stats.triangles > 8000 && built.stats.meshes <= 20);
  assert.ok(built.exclusions.length > 10 && built.solids.every((s) => Number.isFinite(s.top) && s.rings[0].every((p) => Number.isFinite(p[0] + p[1]))));
});
