import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadAvatarGeometry } from '../player/load-avatar.mjs';
import { createActorView } from '../../src/gameplay/combat/actors.js';
import { createCombatSimulation } from '../../src/gameplay/combat/simulation.js';
import { traceHitboxes } from '../../src/gameplay/combat/hitboxes.js';
import { prepareWeaponModel } from '../../src/gameplay/paintball/weapon-models.js';

test('real Sato and supplied Quaternius GLBs clone independent animated skeletons with bone-following hitboxes', async () => {
  for (const [kind, path] of [['human', '../../public/models/sato.glb'], ['zombie', '../../public/models/enemies/zombie-quaternius.glb']]) {
    const asset = await loadAvatarGeometry(new URL(path, import.meta.url));
    const sim = createCombatSimulation({ bounds: { x0: -10, x1: 10, z0: -10, z1: 10 } });
    const a = sim.spawn({ kind, position: { x: 0, y: 0, z: 0 }, stationary: true });
    const b = sim.spawn({ kind, role: 'ally', position: { x: 4, y: 0, z: 0 }, stationary: true });
    const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera();
    const first = createActorView(a, asset, { parent }), second = createActorView(b, asset, { parent });
    const head = a.hitboxes.find(c => c.region === 'head'), before = head.a.clone();
    const source = before.clone(); source.z += 5;
    const destination = before.clone(); destination.z -= 5;
    assert.equal(traceHitboxes(source, destination, [a]).region, 'head');
    assert.notEqual(Object.values(first.bones)[0], Object.values(second.bones)[0]);
    a.action = 'walk'; first.update(.3, .3, camera, true); second.update(0, .3, camera);
    assert.ok(head.a.distanceTo(before) > 1e-5);
    for (const box of a.hitboxes) for (const end of [box.a, box.b]) assert.ok(end.toArray().every(Number.isFinite));
    assert.equal(first.debugRoot.visible, true); assert.equal(second.debugRoot.visible, false);
    a.health.lastHitAt = .3; first.update(0, .3, camera);
    assert.equal(first.healthBar.visible, kind === 'zombie');
    first.update(0, 4, camera); assert.equal(first.healthBar.visible, false);
    sim.damage(a, { region: 'head', weapon: { kind: 'firearm', damage: 30 } }); first.update(.1, 4, camera, true);
    assert.equal(first.debugRoot.visible, false); assert.equal(first.healthBar.visible, false);
    first.dispose(); second.dispose(); assert.equal(parent.children.length, 0);
  }
});

test('armed Sato keeps the authored aim and the real rifle grip while walking and firing', async t => {
  const asset = await loadAvatarGeometry(new URL('../../public/models/sato.glb', import.meta.url));
  const weapon = prepareWeaponModel(await loadAvatarGeometry(new URL('../../public/models/weapons/automatic.glb', import.meta.url)), 'automatic');
  const sim = createCombatSimulation({ bounds: { x0: -10, x1: 10, z0: -10, z1: 10 } });
  const actor = sim.spawn({ kind: 'human', position: { x: 2, y: 0, z: 3 } });
  const view = createActorView(actor, asset, { parent: new THREE.Group(), weaponModel: weapon }); t.after(() => view.dispose());
  const gun = view.root.getObjectByName('npc-weapon'), hand = view.bones['DEF-handR'];
  actor.action = 'walk'; view.update(.25, .25, new THREE.PerspectiveCamera());
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(gun.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(forward.dot(new THREE.Vector3(0, 0, -1)) > .98, 'walking lower-body tracks cannot blend idle arms into the firing pose');
  function checkGrip() {
    const palm = hand.localToWorld(new THREE.Vector3(-.014, .044, -.004));
    assert.ok(gun.localToWorld(weapon.grip.clone()).distanceTo(palm) < 1e-7);
    assert.ok(actor.muzzle.distanceTo(gun.localToWorld(weapon.muzzle.clone())) < 1e-7);
  }
  checkGrip(); view.shoot(); view.update(.05, .3, new THREE.PerspectiveCamera()); checkGrip();
});
