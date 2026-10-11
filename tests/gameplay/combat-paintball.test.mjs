import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPaintball } from '../../src/gameplay/paintball/paintball.js';
import { createCombatSimulation } from '../../src/gameplay/combat/simulation.js';

function fixture(withWall = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70); camera.position.set(0, 1.13, 0); scene.add(camera);
  const simulation = createCombatSimulation({ bounds: { x0: -20, x1: 20, z0: -20, z1: 20 } });
  const player = simulation.spawn({ kind: 'player', position: { x: 0, y: 0, z: 0 } });
  const victim = simulation.spawn({ kind: 'human', position: { x: 0, y: 0, z: -4 }, stationary: true });
  if (withWall) { const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, .1), new THREE.MeshBasicMaterial()); wall.position.set(0, 1, -2); scene.add(wall); }
  scene.updateMatrixWorld(true);
  const paint = createPaintball({ scene, camera, random: () => .5,
    traceActors: (from, to) => {
      const hit = simulation.trace(from, to, { source: player });
      return hit ? { ...hit, point: new THREE.Vector3().copy(hit.point), normal: new THREE.Vector3().copy(hit.normal) } : null;
    },
    onImpact: (hit, info) => { if (hit.entity) simulation.damage(hit.entity, { source: player, region: hit.region, weapon: info.weapon }); },
  });
  return { simulation, victim, player, paint, camera };
}

test('existing ballistic shots damage one actor once per bullet, kill on second chest hit, and create no character paint', () => {
  const { victim, player, paint } = fixture();
  for (const hp of [50, 0]) {
    assert.equal(paint.shoot(), true); for (let i = 0; i < 8; i++) paint.update(.05);
    assert.equal(victim.health.current, hp); assert.equal(paint.stats.projectiles, 0); assert.equal(paint.stats.marks, 0);
  }
  assert.equal(player.stats.kills, 1); paint.dispose();
});

test('nearer scenery blocks character damage and retains the existing surface paint path', () => {
  const { victim, paint } = fixture(true);
  paint.shoot(); for (let i = 0; i < 8; i++) paint.update(.05);
  assert.equal(victim.health.current, 100); assert.equal(paint.stats.marks, 1); paint.dispose();
});

test('existing punch fan damages a reachable actor without a projectile or surface paint', () => {
  const { victim, paint } = fixture(); victim.position.z = -1;
  // Keep the authority's fallback hitboxes in step with this target placement.
  for (const box of victim.hitboxes) for (const end of [box.a, box.b]) end.z += 3;
  paint.setWeapon('fists'); paint.shoot(); paint.update(.1); paint.update(.1);
  assert.equal(victim.health.current, 85); assert.equal(paint.stats.projectiles, 0); assert.equal(paint.stats.marks, 0); paint.dispose();
});
