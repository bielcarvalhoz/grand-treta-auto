import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTraining } from '../../src/core/training.js';

function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const sky = new THREE.Mesh(), city = new THREE.Group(), alreadyHidden = new THREE.Group();
  alreadyHidden.visible = false;
  const sun = new THREE.DirectionalLight();
  scene.add(sky, city, alreadyHidden, sun, sun.target);
  scene.fog = new THREE.Fog(0x987654, 300, 900);
  scene.background = new THREE.Color(0xabcdef);
  camera.position.set(12, 16, 34);
  camera.rotation.set(.1, .7, 0);
  const feet = new THREE.Vector3(12, 14, 34);
  const placements = [];
  const game = {
    engine: { scene, camera, sky, sun },
    player: { feet, yaw: .7, placeAt(x, z, yaw) { placements.push({x, z, yaw}); feet.set(x, 0, z); camera.position.set(x, 1.7, z); } },
  };
  return { game, city, alreadyHidden, sun, placements };
}

test('training isolates the city and restores its visibility, atmosphere and player state', () => {
  const { game, city, alreadyHidden, sun, placements } = fixture();
  const { scene, camera, sky } = game.engine;
  const fog = scene.fog, background = scene.background;
  const position = camera.position.clone(), rotation = camera.quaternion.clone(), feet = game.player.feet.clone();
  const training = createTraining(game);
  // Avatar and paintball are mounted after the training module.
  const avatar = new THREE.Group(); scene.add(avatar);
  assert.equal(training.active, false);
  assert.equal(training.floor.visible, false);
  training.start();
  training.start();
  assert.equal(placements.length, 1, 'repeated entry cannot overwrite the city checkpoint');
  assert.equal(training.active, true);
  assert.equal(city.visible, false);
  assert.equal(sky.visible, false);
  assert.equal(sun.visible, true);
  assert.equal(avatar.visible, true);
  assert.equal(training.floor.visible, true);
  assert.notEqual(scene.fog, fog);
  assert.deepEqual(placements[0], training.spawn);
  game.player.feet.set(10030, 4, 10050);
  training.stop();
  training.stop();
  assert.equal(placements.length, 2);
  assert.equal(training.active, false);
  assert.equal(training.floor.visible, false);
  assert.equal(city.visible, true);
  assert.equal(alreadyHidden.visible, false);
  assert.equal(sky.visible, true);
  assert.equal(scene.fog, fog);
  assert.equal(scene.background, background);
  assert.deepEqual(game.player.feet, feet);
  assert.deepEqual(camera.position, position);
  assert.equal(camera.quaternion.equals(rotation), true);
});

test('training physics is flat and bounded, with no city roofs or surfaces', () => {
  const training = createTraining(fixture().game);
  const { bounds, spawn } = training;
  assert.equal(training.terrain.heightAt(spawn.x + 10, spawn.z - 20), 0);
  assert.equal(training.surfaceHeightAt(spawn.x, spawn.z, 300), -Infinity);
  assert.equal(training.roofAt(spawn.x, spawn.z, 300), -Infinity);
  assert.deepEqual(training.collide(spawn.x, spawn.z, .35), [spawn.x, spawn.z]);
  assert.deepEqual(training.collide(bounds.x0 - 100, bounds.z1 + 100, .35), [bounds.x0 + .35, bounds.z1 - .35]);
});
