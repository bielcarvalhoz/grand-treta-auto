import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { WEAPONS, createWeaponInventory } from '../../src/gameplay/paintball/weapons.js';
import { createPaintball } from '../../src/gameplay/paintball/paintball.js';

function setup(distance = 1) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial());
  wall.position.z = -distance; scene.add(wall); scene.updateMatrixWorld(true);
  return { scene, camera, wall };
}
function tick(paint, duration, dt = .02) { for (let time = 0; time < duration - 1e-8; time += dt) paint.update(dt); }

test('inventory replaces selected firearms first, preserves two firearm slots and swaps melee directly', () => {
  const inventory = createWeaponInventory();
  assert.deepEqual(inventory.state.slots, ['pistol', 'automatic', 'knife']);
  assert.deepEqual(inventory.available.map(w => w.id), ['pistol', 'automatic', 'knife', 'fists']);
  assert.throws(() => inventory.select('sniper'), RangeError);
  inventory.select('automatic');
  assert.deepEqual(inventory.pickup('shotgun'), { picked: 'shotgun', dropped: 'automatic', slot: 1 });
  inventory.select('fists');
  assert.deepEqual(inventory.pickup('sniper'), { picked: 'sniper', dropped: 'shotgun', slot: 1 });
  inventory.select('pistol');
  assert.deepEqual(inventory.pickup('axe'), { picked: 'axe', dropped: 'knife', slot: 2 });
  assert.deepEqual(inventory.pickup('smg'), { picked: 'smg', dropped: 'pistol', slot: 0 });
  const snapshot = inventory.state; snapshot.slots[0] = 'fists';
  assert.deepEqual(inventory.state.slots, ['smg', 'sniper', 'axe'], 'snapshot cannot mutate inventory');
  assert.equal(inventory.state.selected, 'smg');
  assert.equal(inventory.pickup('smg').duplicate, true);
  assert.throws(() => inventory.pickup('fists'), RangeError);
});

test('firearm base damage, cadence, pellet count and spread agree with the captured Valve game data', async () => {
  const reference = JSON.parse(await fs.readFile(new URL('../../data/cs2-weapon-reference.json', import.meta.url), 'utf8'));
  for (const weapon of WEAPONS.filter(w => w.kind === 'firearm')) {
    const source = reference.weapons[weapon.csWeapon];
    assert.equal(weapon.damage, source.m_nDamage);
    assert.equal(weapon.interval, Array.isArray(source.m_flCycleTime) ? source.m_flCycleTime[0] : source.m_flCycleTime);
    assert.equal(weapon.pellets, source.m_nNumBullets);
    assert.equal(weapon.spread, source.m_flSpread[0]);
    assert.equal(weapon.automatic, source.m_bIsFullAuto);
  }
});

test('melee and unarmed attacks hit during the swing and never emit paint or gun audio', () => {
  const { scene, camera, wall } = setup(), hits = [], attacks = [], sounds = [];
  const paint = createPaintball({ scene, camera, colliderRoots: [wall], onImpact: (hit, info) => hits.push(info), onAttack: (weapon, state) => attacks.push([weapon.id, state.sequence]), onShot: id => sounds.push(id) });
  for (const id of ['knife', 'fists']) {
    paint.clearEffects(); paint.setWeapon(id); paint.setAiming(true); assert.equal(paint.aiming, false);
    assert.equal(paint.shoot(), true); assert.equal(paint.shoot(), false);
    const before = hits.length; paint.update(.05); assert.equal(hits.length, before);
    tick(paint, .2); assert.equal(hits.length, before + 1);
    assert.equal(hits.at(-1).weapon.id, id); assert.ok(hits.at(-1).impulse > 0);
    assert.equal(paint.stats.projectiles, 0); assert.equal(paint.stats.marks, 0);
  }
  assert.deepEqual(attacks, [['knife', 0], ['fists', 1]]); assert.deepEqual(sounds, []);
  paint.dispose();
});

test('melee reach starts at the character in both camera modes and cannot hit beyond reach', () => {
  const { scene, camera, wall } = setup(1.2), hits = [];
  let source = new THREE.Vector3();
  const paint = createPaintball({ scene, camera, colliderRoots: [wall], getShotOrigin: target => target.copy(source), onImpact: hit => hits.push(hit) });
  paint.setWeapon('knife');
  for (const z of [0, 3]) { camera.position.z = z; paint.clearEffects(); paint.shoot(); tick(paint, .25); }
  assert.equal(hits.length, 2, 'camera behind character must not consume attack reach');
  wall.position.z = -3; wall.updateMatrixWorld(true); paint.clearEffects(); paint.shoot(); tick(paint, .25);
  assert.equal(hits.length, 2);
  paint.dispose();
});

test('shotgun emits nine damaging pellets per shell, with one sound and bounded cadence', () => {
  const { scene, camera, wall } = setup(8), hits = [], sounds = [];
  const paint = createPaintball({ scene, camera, colliderRoots: [wall], onImpact: (hit, info) => hits.push(info), onShot: id => sounds.push(id), random: () => .5 });
  assert.throws(() => paint.setWeapon('shotgun'), RangeError);
  const swap = paint.pickupWeapon('shotgun'); assert.equal(swap.dropped, 'pistol');
  paint.shoot(); assert.equal(paint.stats.projectiles, 9); assert.deepEqual(sounds, ['shotgun']);
  tick(paint, .3); assert.equal(hits.length, 9); assert.equal(paint.stats.marks, 9);
  assert.ok(hits.every(hit => hit.damage === 26 && hit.weapon.id === 'shotgun'));
  assert.equal(paint.shoot(), false); tick(paint, .6); assert.equal(paint.shoot(), true);
  paint.dispose();
});

test('R8 trigger windup can be cancelled and completes one actual firearm event', () => {
  const { scene, camera } = setup(), sounds = [];
  const paint = createPaintball({ scene, camera, colliderRoots: [], onShot: id => sounds.push(id) });
  paint.pickupWeapon('revolver'); paint.setTrigger(true); paint.update(.1); assert.equal(sounds.length, 0);
  paint.setTrigger(false); tick(paint, .5); assert.equal(sounds.length, 0);
  paint.setTrigger(true); tick(paint, .22); assert.deepEqual(sounds, ['revolver']);
  paint.setWeapon('fists'); tick(paint, 1); assert.deepEqual(sounds, ['revolver']);
  paint.dispose();
});

test('a projectile keeps its fired weapon damage and dynamic splats follow crate movement', () => {
  const { scene, camera, wall } = setup(3), hits = []; wall.userData.dynamicPaint = true;
  let roots = [];
  const paint = createPaintball({ scene, camera, colliderRoots: () => [...roots], onImpact: (hit, info) => hits.push(info), random: () => 0 });
  roots = [wall]; paint.shoot(); paint.setWeapon('knife'); tick(paint, .2);
  assert.equal(hits.length, 1); assert.equal(hits[0].weapon.id, 'pistol'); assert.equal(hits[0].damage, 30);
  const mark = paint.root.children.find(o => o.name === 'marca-tinta' && o.visible), before = mark.position.clone();
  wall.position.x += 2; wall.updateMatrixWorld(true); paint.update(.02);
  assert.ok(Math.abs(mark.position.x - before.x - 2) < 1e-8);
  wall.removeFromParent(); paint.update(.02); assert.equal(mark.visible, false);
  paint.dispose();
});

test('AWP scope changes its field of view and reduces its unscoped dispersion', () => {
  const { scene, camera } = setup(), paint = createPaintball({ scene, camera, colliderRoots: [], random: () => .5 });
  paint.pickupWeapon('sniper'); paint.shoot();
  const ball = paint.root.children.find(o => o.name === 'bolinha-tinta' && o.visible);
  const hipStart = ball.position.clone(); paint.update(.02);
  const hip = Math.abs(ball.position.x - hipStart.x);
  paint.clearEffects(); paint.setAiming(true); tick(paint, .8); assert.ok(Math.abs(camera.fov - 40) < .01);
  paint.shoot();
  const scopedBall = paint.root.children.find(o => o.name === 'bolinha-tinta' && o.visible), start = scopedBall.position.clone(); paint.update(.02);
  const scoped = Math.abs(scopedBall.position.x - start.x);
  assert.ok(scoped < hip * .1);
  paint.dispose();
});
