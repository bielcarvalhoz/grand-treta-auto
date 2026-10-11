import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProjection, openRing, pointInPolygon, ringArea, distToSegment } from '../../src/shared/geo.js';
import { createTerrain } from '../../src/map/terrain.js';
import { parseWorld } from '../../src/map/world.js';
import { correctCampusTerrain, gradeCampusTerrain } from '../../src/campus/grading.js';
import { planCampusAmenities } from '../../src/campus/amenities.js';
import { prepareLandmarks, gradeLandmarks, buildLandmarks } from '../../src/campus/landmarks.js';
import { planStairway, resolveStairway, stairwaySamples } from '../../src/campus/stairway.js';
import { prepareAlley, planAlleyStair, nearestStreet } from '../../src/campus/prata-access.js';
import { planLocomotive, yawFromBearing, TRACK } from '../../src/campus/locomotive.js';

const data = (name) => JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url)));
const area = (ring) => Math.abs(ringArea(ring));

/** Os marcos sobre os dados reais (relevo SRTM, vias do OSM, planta do campus), sem renderização. */
let cached;
function actualLandmarks() {
  if (cached) return cached;
  const geo = data('cidade-de-deus.geojson'), campusGeo = data('campus-cidade-de-deus.geojson');
  const q = geo.features.find((f) => f.properties.place === 'quarter').geometry.coordinates[0];
  const proj = createProjection((Math.min(...q.map((p) => p[0])) + Math.max(...q.map((p) => p[0]))) / 2, (Math.min(...q.map((p) => p[1])) + Math.max(...q.map((p) => p[1]))) / 2);
  const terrain = createTerrain(data('terrain.json'), proj), world = parseWorld(geo, proj);
  for (const road of world.roads) { const middle = road.pts[Math.floor(road.pts.length / 2)]; road.internal = road.kind !== 'foot' && road.highway === 'service' && pointInPolygon(...middle, world.quarter); }
  const C = { quarter: world.quarter, buildings: [], gates: [], landmarks: [], paths: [], busStops: [] };
  for (const f of campusGeo.features) {
    const p = f.properties, g = f.geometry;
    if (p.kind === 'building') C.buildings.push({ ...p, rings: g.coordinates.map((ring) => openRing(ring.map((c) => proj.toLocal(...c)))) });
    else if (p.kind === 'landmark') { const [x, z] = proj.toLocal(...g.coordinates); C.landmarks.push({ ...p, x, z }); }
    else if (p.kind === 'plateau') (C.plateaus ||= []).push({ ...p, rings: g.coordinates.map((ring) => openRing(ring.map((c) => proj.toLocal(...c)))) });
    else if (p.kind === 'groundControl') C.groundControl = g.coordinates.map(([lon, lat, altitude]) => [...proj.toLocal(lon, lat), altitude + (p.offset || 0)]);
    else if (g.type === 'LineString') C.paths.push({ ...p, pts: g.coordinates.map((c) => proj.toLocal(...c)) });
  }
  C.insideSolid = (x, z) => C.buildings.some((b) => pointInPolygon(x, z, b.rings));
  const original = { balanca: C.buildings.find((b) => b.planId === 'b8').rings[0], prataLevels: C.buildings.find((b) => b.planId === 'b6').levels };
  prepareLandmarks(C, world);
  const control = correctCampusTerrain(terrain, C);
  gradeCampusTerrain(world, terrain, C);
  const report = gradeLandmarks(world, terrain, C), built = buildLandmarks(C, { terrain, world });
  return (cached = { C, world, terrain, proj, report, built, original, control });
}

/** anda de `from` a `to` com a regra do personagem (degrau máximo de 0,7 m) e devolve o maior salto */
function walk({ terrain, built }, points) {
  const groundAt = (x, z, y) => Math.max(terrain.heightAt(x, z), built.surfaceHeightAt(x, z, y + .7));
  let [x, z] = points[0], y = groundAt(x, z, terrain.heightAt(x, z) + 1.5), jump = 0;
  const start = y;
  for (const [tx, tz] of points.slice(1)) for (;;) {
    const d = Math.hypot(tx - x, tz - z);
    if (d < .05) break;
    const step = Math.min(.1, d); x += (tx - x) / d * step; z += (tz - z) / d * step;
    const g = groundAt(x, z, y); jump = Math.max(jump, Math.abs(g - y)); y = g;
  }
  return { start, end: y, jump };
}

test('profile grading clears a narrow stair without touching protected ground or distant terrain', () => {
  const proj = { toLocal: (x, y) => [x, 100 - y] };
  const terrain = createTerrain({ nx: 21, ny: 21, min: 0, max: 30, bbox: [0, 0, 100, 100], heights: Array.from({ length: 441 }, (_, k) => 20 + (k % 21) * .4) }, proj);
  const far = terrain.heightAt(8, 90), kept = terrain.heightAt(60, 50), samples = [];
  for (let x = 30; x <= 70; x += .3) for (let z = 48.5; z <= 51.5; z += .5) samples.push([x, z, 24 - (x - 30) * .25]);
  const report = terrain.gradeProfile(samples, { radius: 3, band: 8, clearance: .35, minClearance: .1, protect: (x, z) => Math.hypot(x - 60, z - 50) < .1 });
  assert.ok(report.changed > 0 && report.cutFill > 3);
  let pinned = 0;
  for (const [x, z, y] of samples) {
    // os triângulos presos ao vértice protegido (células vizinhas, de 5 m) não descem por inteiro
    if (Math.abs(x - 60) <= 5 && Math.abs(z - 50) <= 5) { pinned++; continue; }
    assert.ok(terrain.heightAt(x, z) <= y - .1 + 1e-6, `relevo acima do degrau em ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  assert.ok(pinned > 0 && pinned < samples.length / 3);
  assert.equal(terrain.heightAt(60, 50), kept, 'vértice protegido intacto');
  assert.equal(terrain.heightAt(8, 90), far, 'relevo distante intacto');
});

test('stairway plan: flights, corner landings and the round bench plaza stay connected', () => {
  const plan = planStairway([[0, 0], [12, 4], [18, 0], [28, 1], [36, -3], [38, 4], [48, 9]], { width: 3, rampWidth: 2.2, plaza: 3, plazaRadius: 2.7, ramps: 1 });
  assert.equal(plan.flights.length, 5);
  assert.equal(plan.ramps.length, 1);
  assert.deepEqual(plan.landings.map((l) => l.kind), ['top', 'corner', 'corner', 'plaza', 'corner', 'corner']);
  assert.equal(plan.risers, plan.flights.reduce((sum, f) => sum + f.k, 0));
  for (const f of plan.flights) assert.ok(f.tread >= .255 && f.tread <= .3, `piso de ${f.tread.toFixed(3)} m`);
  plan.landings.forEach((landing, i) => {
    if (i) assert.equal(landing.level, plan.flights.slice(0, i).reduce((sum, f) => sum + f.k, 0));
    assert.ok(pointInPolygon(...landing.node, [landing.ring]) || landing.ring.some((p) => Math.hypot(p[0] - landing.node[0], p[1] - landing.node[1]) < .5));
  });
  // os dois arcos de banco ficam em lados opostos e deixam livres a chegada e a saída
  const plaza = plan.landings[3], [inA, outB] = plaza.open, mid = (seg) => [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2];
  for (const arc of plaza.arcs) {
    assert.ok(Math.abs(arc.sweep) > .5 && Math.abs(arc.sweep) < Math.PI);
    for (const p of arc.points.slice(1, -1)) for (const gap of [inA, outB]) assert.ok(Math.hypot(p[0] - mid(gap)[0], p[1] - mid(gap)[1]) > 1.2, 'banco na frente de um lance');
  }
  assert.ok(plaza.arcs[0].sweep * plaza.arcs[1].sweep < 0, 'arcos em sentidos opostos');
  const S = resolveStairway(plan, { topY: 50, riser: .17, endY: 33 });
  assert.ok(Math.abs(S.bottomY - (50 - plan.risers * .17)) < 1e-9);
  assert.ok(Math.abs(S.ramps.at(-1).yb - 33) < 1e-9);
  assert.ok(stairwaySamples(S).every(([x, z, y]) => Number.isFinite(x + z + y)));
});

test('forest stairway follows the official plan from Rua Três down to the Agência and is walkable both ways', () => {
  const L = actualLandmarks(), S = L.built.plan.stairways[0], agencia = L.C.buildings.find((b) => b.planId === 'b34');
  assert.equal(L.built.plan.stairways.length, 1);
  assert.equal(S.flights.length, 5);
  assert.ok(S.risers >= 105 && S.risers <= 125, `${S.risers} espelhos`);
  assert.ok(S.riser >= .15 && S.riser <= .185);
  for (const f of S.flights) assert.ok(f.tread >= .25 && f.tread <= .32, `piso de ${f.tread.toFixed(3)} m`);
  assert.ok(S.topY - S.bottomY > 19 && S.topY - S.bottomY < 23, `desnível do barranco: ${(S.topY - S.bottomY).toFixed(1)} m`);
  assert.equal(nearestStreet(L.world.roads, ...S.path[0], 14).road.name, 'Rua Três');
  const foot = S.flights.at(-1).b;
  assert.ok(Math.min(...agencia.rings[0].map((p, i, ring) => distToSegment(...foot, ...p, ...ring[(i + 1) % ring.length]).d)) < 15, 'pé da escada junto à Agência');
  assert.equal(S.landings.filter((landing) => landing.kind === 'plaza').length, 1);
  assert.equal(L.report.stairways[0].blocked, 0);
  // começa 30 cm dentro do patamar do topo (o ponto `a` do lance é a própria quina do 1º degrau)
  const first = S.flights[0], inside = [first.a[0] - first.d[0] * .3, first.a[1] - first.d[1] * .3];
  const route = [inside, ...S.flights.flatMap((f) => [f.a, f.b]), ...S.ramps.flatMap((r) => [r.a, r.b])];
  const down = walk(L, route), up = walk(L, route.slice().reverse());
  assert.ok(down.jump <= .19 && up.jump <= .19, `salto de ${Math.max(down.jump, up.jump).toFixed(2)} m`);
  assert.ok(Math.abs(down.start - S.topY) < .01 && Math.abs(up.end - S.topY) < .01, `topo: desce de ${down.start.toFixed(2)}, sobe até ${up.end.toFixed(2)}, patamar ${S.topY.toFixed(2)}`);
  assert.ok(Math.abs(down.end - S.endY) < .15);
  // guarda-corpos contínuos: nenhum ponto da lateral de um lance fica sem colisão
  for (const f of S.flights) for (const side of [-1, 1]) for (let s = .3; s < f.run - .3; s += .5) {
    const x = f.a[0] + f.d[0] * s - f.d[1] * side * (f.w / 2 + .1), z = f.a[1] + f.d[1] * s + f.d[0] * side * (f.w / 2 + .1);
    assert.ok(L.built.solids.some((solid) => pointInPolygon(x, z, solid.rings)), 'vão no guarda-corpo');
  }
});

test('every landmark floor is above the graded terrain and clear of trees', () => {
  const { terrain, built } = actualLandmarks();
  for (const surface of built.surfaces) {
    const ring = surface.rings[0], cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    assert.ok(terrain.heightAt(cx, cz) <= surface.y + .03, `relevo ${(terrain.heightAt(cx, cz) - surface.y).toFixed(2)} m acima de um piso`);
  }
  assert.ok(built.trees.length >= 30, 'mata em volta da escadaria');
  for (const tree of built.trees) {
    assert.ok(!built.surfaces.some((surface) => pointInPolygon(tree.x, tree.z, surface.rings)));
    assert.ok(Number.isFinite(tree.x + tree.z + tree.s));
  }
  assert.ok(built.stats.triangles > 5000 && built.stats.meshes <= 16);
});

test('alley cut separates a retaining block from the building end and its stair fits the gap', () => {
  const ring = [[0, 0], [40, 0], [40, 10], [0, 10]];
  const C = { buildings: [{ planId: 'x', name: 'X', rings: [ring] }, { planId: 'y', rings: [[[10, 30], [30, 30], [30, 40], [10, 40]]] }] };
  const alley = prepareAlley(C, { building: 'x', toward: 'y', end: 'leste', offset: 5, width: 2.6 });
  assert.equal(C.buildings.length, 2, 'o bloco de arrimo não vira prédio');
  assert.ok(Math.abs(area(C.buildings[0].rings[0]) + area(alley.block) - (400 - 26)) < 1e-6);
  assert.ok(Math.abs(alley.nz - 1) < 1e-9, 'beco aponta para o prédio de referência');
  assert.ok(Math.abs(alley.at(alley.uA, 0)[0] - 35) < 1e-9, 'vão a 5 m da ponta leste');
  for (const rise of [2.4, 4.5, 6.2]) {
    const stair = planAlleyStair({ ...alley, v0: -9, v1: 6 }, 10, 10 + rise, 4);
    assert.ok(stair.riser <= .18 && stair.tread >= .24);
    assert.equal(stair.flights.reduce((sum, run) => sum + run.k, 0), stair.K);
    assert.ok(stair.sBottom >= -9 && stair.sTop <= 6);
    let last = 10;
    for (let s = -9; s <= 6; s += .05) { const y = stair.yAt(s); assert.ok(y >= last - 1e-9 && y - last <= stair.riser + 1e-9); last = y; }
    assert.ok(Math.abs(stair.yAt(6) - (10 + rise)) < 1e-9);
  }
});

test('Balança sits at parking level with the alley stair up to the Prata street; Prata gains its buried floors', () => {
  const L = actualLandmarks(), { C, terrain, built, original } = L, A = C.alley, notes = built.plan.access;
  const balanca = C.buildings.find((b) => b.planId === 'b8'), prata = C.buildings.find((b) => b.planId === 'b6');
  assert.ok(area(balanca.rings[0]) + area(A.block) < area(original.balanca) && area(A.block) > 20);
  assert.ok(A.at(A.uA, 0)[0] > balanca.rings[0].reduce((s, p) => s + p[0], 0) / balanca.rings[0].length + 30, 'beco na ponta leste, não no meio');
  assert.ok(notes.alley.topY - notes.alley.bottomY > 6 && notes.alley.topY - notes.alley.bottomY < 9 && notes.alley.riser <= .18, 'beco: ~7 m (dois andares)');
  assert.ok(notes.alley.flights.length >= 2, 'lances com patamar');
  // a laje do Balança fica rente à rua do Prata (prédio semienterrado)
  const roof = terrain.platformFor(balanca).height + balanca.height;
  assert.ok(Math.abs(roof - notes.alley.topY) < .15, `laje ${(roof - notes.alley.topY).toFixed(2)} m acima da rua`);
  assert.ok(notes.deck.strip > 20 && notes.deck.drive, 'laje-estacionamento ligada à rua, com entrada de veículos');
  // (sem a malha das calçadas neste teste: o percurso para 1,2 m antes do meio-fio da rua)
  const [low, high] = notes.alley.path, span = Math.hypot(high[0] - low[0], high[1] - low[1]), inside = [high[0] - (high[0] - low[0]) / span * 1.2, high[1] - (high[1] - low[1]) / span * 1.2];
  const climb = walk(L, [low, inside]), descend = walk(L, [inside, low]);
  assert.ok(climb.jump <= .19 && descend.jump <= .19);
  assert.ok(Math.abs(climb.end - notes.alley.topY) < .05 && Math.abs(descend.end - climb.start) < .05);
  // Prata: andar zero pela rua de trás; a rua do Balança fica andares abaixo (acesso do -2). O
  // desnível entre as duas ruas vem do controle altimétrico (rua norte 741 m, rua sul 747 m).
  assert.ok(prata.levels >= original.prataLevels + 2);
  assert.ok(prata.floorZero - notes.lower.top > 4 && prata.floorZero - notes.lower.top < 8, `-2 a ${(prata.floorZero - notes.lower.top).toFixed(1)} m do andar zero`);
  assert.ok(Math.abs(notes.ground0.doorY - prata.floorZero) < .3, 'porta dos fundos no piso do andar zero');
  assert.ok(Math.abs(notes.ground0.stairTop - notes.ground0.baseY - 1.65) < 1e-9, 'escada colorida: 10 espelhos de 16,5 cm');
  for (const [name, path, top] of [['-2', notes.lower.path, notes.lower.top], ['escada colorida', notes.ground0.path, notes.ground0.stairTop], ['principal', notes.main.path, notes.main.top]]) {
    const result = walk(L, path);
    assert.ok(result.jump <= .24, `${name}: salto de ${result.jump.toFixed(2)} m`);
    assert.ok(Math.abs(result.end - top) < .05, `${name}: não chega à porta`);
  }
  assert.deepEqual(built.entrances.map((entrance) => entrance.name).sort(), ['Prédio Balança', 'Prédio Prata']);
  assert.ok(built.entrances.every((e) => Number.isFinite(e.x + e.z + e.yaw + e.frontage.clearance)));
});

test('locomotive 801 uses the surveyed spot beside the CTI, heading ESE, clear of roads and buildings', () => {
  const { C, world, built } = actualLandmarks(), loco = built.plan.locomotive, cti = C.buildings.find((b) => b.planId === 'b0');
  const mark = C.landmarks.find((m) => m.type === 'locomotiva');
  assert.ok(Math.abs(Math.cos(yawFromBearing(113)) - Math.sin(113 * Math.PI / 180)) < 1e-12);
  assert.ok(Math.abs(-Math.sin(yawFromBearing(113)) + Math.cos(113 * Math.PI / 180)) < 1e-12);
  const front = [Math.cos(loco.yaw), -Math.sin(loco.yaw)];
  assert.ok(front[0] > .85 && front[1] > .3, 'frente para ESE (leste e um pouco ao sul)');
  assert.ok(Math.hypot(loco.x - mark.x, loco.z - mark.z) <= 9.01, 'no máximo recuada ao longo do próprio trilho');
  assert.ok(Math.abs((loco.x - mark.x) * front[1] - (loco.z - mark.z) * front[0]) < 1e-6, 'recuo só no eixo do trilho');
  assert.ok(TRACK[1] - TRACK[0] > 24 && TRACK[1] - TRACK[0] < 28);
  for (const [x, z] of [...loco.bed, ...loco.body]) {
    assert.ok(!C.insideSolid(x, z));
    const street = nearestStreet(world.roads, x, z, 30);
    assert.ok(!street || street.d - street.road.w / 2 >= 2.5, 'leito fora das calçadas');
  }
  assert.ok(Math.min(...cti.rings[0].map((p) => Math.hypot(p[0] - loco.x, p[1] - loco.z))) < 45, 'ao lado do CTI');
  assert.ok(built.solids.some((solid) => solid.kind === 'locomotiva-801'));
  assert.equal(planCampusAmenities(C, world).train, null, 'sem uma segunda locomotiva aproximada');
  const moved = planLocomotive({ x: 10, z: 20, heading: 90 });
  assert.ok(Math.abs(moved.bed[1][0] - moved.bed[0][0] - (TRACK[1] - TRACK[0] + 1)) < 1e-9, 'rumo 90° = eixo leste');
});

test('surveyed ground control: the field, Portaria 10 and the lake share one level; the Balança lot is flat', () => {
  const L = actualLandmarks(), { C, terrain, world, proj } = L, campusGeo = data('campus-cidade-de-deus.geojson');
  // o relevo corrigido reproduz as altitudes levantadas (antes de qualquer terraplenagem)
  const fresh = createTerrain(data('terrain.json'), proj), report = correctCampusTerrain(fresh, C);
  assert.ok(report.points > 100 && report.maxShift > 15, 'o SRTM chegava a ficar mais de 15 m acima do chão');
  const residuals = C.groundControl.map(([x, z, altitude]) => Math.abs(fresh.heightAt(x, z) + fresh.base - altitude));
  assert.ok(Math.max(...residuals) < 1.5 && residuals.reduce((a, b) => a + b, 0) / residuals.length < .4, `resíduo máximo ${Math.max(...residuals).toFixed(2)} m`);
  // campo de futebol, Portaria Bussocaba (10) e lago na mesma baixada
  const pitch = world.areas.filter((a) => a.kind === 'pitch').sort((a, b) => area(b.rings[0]) - area(a.rings[0]))[0].rings[0];
  const centre = pitch.reduce((s, p) => [s[0] + p[0] / pitch.length, s[1] + p[1] / pitch.length], [0, 0]), field = terrain.heightAt(...centre);
  for (const f of campusGeo.features.filter((q) => q.properties.kind === 'gate' && q.properties.num === 10)) {
    const gate = terrain.heightAt(...proj.toLocal(...f.geometry.coordinates));
    assert.ok(Math.abs(gate - field) < 2.5, `Portaria 10 ${(gate - field).toFixed(1)} m acima do campo`);   // levantado: campo 732 m, portaria 730–731 m
  }
  const lake = campusGeo.features.find((q) => q.properties.kind === 'leisure').properties.layout.lago.map(([lat, lon]) => proj.toLocal(lon, lat));
  for (const [x, z] of lake.filter((_, i) => i % 6 === 0)) assert.ok(Math.abs(terrain.heightAt(x, z) - field) < 2.5, 'margem do lago no nível do campo');
  // estacionamento em frente ao Balança: plano, na base do prédio (sem a "barriga" do relevo de satélite)
  const lot = C.plateaus.find((p) => p.id === 'estacionamento-balanca'), balanca = C.buildings.find((b) => b.planId === 'b8'), level = lot.altitude - terrain.base;
  let xs = lot.rings[0].map((p) => p[0]), zs = lot.rings[0].map((p) => p[1]), samples = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 4) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 4) {
    // miolo do platô: a borda (uma célula do relevo, ~8,5 m) é a transição para as rampas e taludes vizinhos
    const edge = (ring, d) => ring.some((p, i) => distToSegment(x, z, ...p, ...ring[(i + 1) % ring.length]).d < d);
    if (!pointInPolygon(x, z, lot.rings) || edge(lot.rings[0], 9) || edge(balanca.rings[0], 10)) continue;
    assert.ok(Math.abs(terrain.heightAt(x, z) - level) < .2, `estacionamento com ${(terrain.heightAt(x, z) - level).toFixed(2)} m de desnível`); samples++;
  }
  assert.ok(samples > 80, `${samples} amostras`);
  assert.ok(Math.abs(terrain.platformFor(balanca).height - level) < .05, 'o térreo do Balança fica no nível do estacionamento');
  for (const road of world.roads.filter((r) => r.internal)) for (const [x, z] of road.pts) if (pointInPolygon(x, z, lot.rings)) assert.ok(Math.abs(terrain.roadHeightAt(road, x, z) - level) < 1e-6, 'vias do estacionamento no mesmo nível');
});

test('Portaria Bussocaba is ONE double canopy over both carriageways, inside the campus', () => {
  const { C, world, built } = actualLandmarks(), P = built.plan.portaria;
  assert.ok(P && P.half * 2 >= 24, 'cobertura única');
  assert.ok(C.gates.filter((g) => g.num === 10 && g.type === 'portaria').every((g) => g.combined), 'os cruzamentos de muro não ganham marquise própria');
  // as duas pistas internas passam sob a mesma cobertura
  const under = world.roads.filter((r) => r.internal && r.pts.some((p, i) => i && [0, .25, .5, .75, 1].some((t) => pointInPolygon(r.pts[i - 1][0] + (p[0] - r.pts[i - 1][0]) * t, r.pts[i - 1][1] + (p[1] - r.pts[i - 1][1]) * t, [P.ring]))));
  assert.ok(under.length >= 2, `${under.length} pista(s) sob a cobertura`);
  for (const p of P.ring) assert.ok(pointInPolygon(...p, C.quarter), 'cobertura para fora do campus');
  // nenhum pilar ou guarita no leito das pistas
  for (const s of built.solids.filter((q) => /portaria|guarita/.test(q.kind))) for (const p of s.rings[0]) { const street = nearestStreet(world.roads, ...p, 20); assert.ok(!street || street.d - street.road.w / 2 > .2, `${s.kind} no leito da via`); }
  assert.ok(built.solids.filter((q) => q.kind === 'pilar-portaria').length >= 3);
});
