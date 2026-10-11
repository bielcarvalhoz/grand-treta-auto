import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseConfig } from '../../src/player/pose-config.js';

test('calibration persists per weapon, perspective and target with a portable identified export', () => {
  let value; const storage = { getItem: () => value, setItem: (_key, next) => { value = next; } };
  const config = createPoseConfig(storage);
  config.set('axe', 'first', 'weapon', 'position', 'x', .12);
  config.set('axe', 'third', 'weapon', 'rotation', 'z', 25);
  config.set('fists', 'first', 'arms', 'scale', 'x', .9);
  const restored = createPoseConfig(storage);
  assert.equal(restored.get('axe', 'first').position.x, .12);
  assert.equal(restored.get('axe', 'third').position.x, -.02);
  assert.equal(restored.get('axe', 'third').rotation.z, 25);
  assert.equal(restored.get('knife', 'first').position.x, -.01);
  const exported = restored.export('fists', 'first', 'arms');
  assert.equal(exported.weapon, 'fists'); assert.equal(exported.view, 'first'); assert.equal(exported.target, 'arms');
  assert.equal(exported.units.rotation, 'deg'); assert.equal(exported.scale.x, .9);
  exported.scale.x = 2; assert.equal(restored.get('fists', 'first', 'arms').scale.x, .9);
  restored.reset('axe', 'first', 'weapon'); assert.equal(restored.get('axe', 'first').position.x, -.03);
  assert.equal(restored.get('axe', 'third').rotation.z, 25);
});

test('approved mobile calibrations are defaults for both shaft weapons and all knives, including reset', () => {
  const config = createPoseConfig({ getItem: () => null });
  for (const id of ['axe', 'bat']) {
    assert.deepEqual(config.get(id, 'first'), { position: { x: -.03, y: -.14, z: -.1 }, rotation: { x: 29, y: -8, z: 68 }, scale: { x: 1, y: 1, z: 1 } });
    assert.deepEqual(config.get(id, 'third'), { position: { x: -.02, y: -.01, z: -.06 }, rotation: { x: -44, y: -56, z: 45 }, scale: { x: .99, y: 1, z: 1 } });
  }
  for (const id of ['knife', 'knife-tactical', 'knife-combat']) {
    assert.deepEqual(config.get(id, 'first'), { position: { x: -.01, y: 0, z: .02 }, rotation: { x: 78, y: 9, z: -29 }, scale: { x: 1, y: 1, z: 1.03 } });
    assert.deepEqual(config.get(id, 'third'), { position: { x: 0, y: -.01, z: .02 }, rotation: { x: -64, y: -62, z: -33 }, scale: { x: 1, y: 1, z: 1 } });
  }
  config.set('axe', 'first', 'weapon', 'position', 'x', .8); config.reset('axe', 'first');
  assert.equal(config.get('axe', 'first').position.x, -.03);
  assert.equal(config.get('axe', 'first', 'arms').position.x, 0);
  assert.equal(config.get('pistol', 'first').rotation.x, 0);
});

test('legacy visited sockets inherit new defaults while real saved edits survive without being added twice', () => {
  const identity = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  const approved = createPoseConfig({ getItem: () => null }).export('axe', 'first', 'weapon');
  const saves = new Map([['cdd-training-pose-v1', JSON.stringify({ 'bat/first/weapon': identity, 'axe/first/weapon': approved })]]);
  const storage = { getItem: key => saves.get(key), setItem: (key, value) => saves.set(key, value) };
  const config = createPoseConfig(storage);
  assert.equal(config.get('bat', 'first').rotation.z, 68);
  assert.equal(config.get('axe', 'first').position.y, -.14);
  config.set('axe', 'first', 'weapon', 'rotation', 'z', 0);
  assert.equal(createPoseConfig(storage).get('axe', 'first').rotation.z, 0);
});

test('invalid saves, unavailable storage and non-finite edits cannot corrupt the rig', () => {
  const config = createPoseConfig({ getItem() { throw new Error('private mode'); }, setItem() { throw new Error('quota'); } });
  assert.equal(config.set('pistol', 'first', 'weapon', 'position', 'x', NaN), false);
  assert.equal(config.set('pistol', 'first', 'weapon', 'scale', 'y', -10), true);
  assert.equal(config.get('pistol', 'first').scale.y, .1);
  assert.equal(createPoseConfig({ getItem: () => '{oops' }).get('pistol', 'first').scale.x, 1);
});
