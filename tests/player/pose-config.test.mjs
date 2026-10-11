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
  assert.equal(restored.get('axe', 'third').position.x, 0);
  assert.equal(restored.get('axe', 'third').rotation.z, 25);
  assert.equal(restored.get('knife', 'first').position.x, 0);
  const exported = restored.export('fists', 'first', 'arms');
  assert.equal(exported.weapon, 'fists'); assert.equal(exported.view, 'first'); assert.equal(exported.target, 'arms');
  assert.equal(exported.units.rotation, 'deg'); assert.equal(exported.scale.x, .9);
  exported.scale.x = 2; assert.equal(restored.get('fists', 'first', 'arms').scale.x, .9);
  restored.reset('axe', 'first', 'weapon'); assert.equal(restored.get('axe', 'first').position.x, 0);
  assert.equal(restored.get('axe', 'third').rotation.z, 25);
});

test('invalid saves, unavailable storage and non-finite edits cannot corrupt the rig', () => {
  const config = createPoseConfig({ getItem() { throw new Error('private mode'); }, setItem() { throw new Error('quota'); } });
  assert.equal(config.set('pistol', 'first', 'weapon', 'position', 'x', NaN), false);
  assert.equal(config.set('pistol', 'first', 'weapon', 'scale', 'y', -10), true);
  assert.equal(config.get('pistol', 'first').scale.y, .1);
  assert.equal(createPoseConfig({ getItem: () => '{oops' }).get('pistol', 'first').scale.x, 1);
});
