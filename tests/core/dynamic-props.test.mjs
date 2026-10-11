import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDynamicProps, footballFieldCenter } from '../../src/core/dynamic-props.js';

function fixture() {
  return {
    engine: { scene: new THREE.Scene(), addSystem() {} }, events: { on() {} },
    training: { active: true, spawn: { x: 10000, z: 10000 } }, mode: 'training',
    player: { active: true }, map: { terrain: { heightAt: () => 12 }, world: { areas: [{ id: 'cdd/campo', rings: [[[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]]] }] } },
  };
}

test('campaign crate uses the football-field centre, ignoring closing vertex', () => {
  assert.deepEqual(footballFieldCenter(fixture()), { x: 0, z: 0 });
});

test('Rapier crate settles, receives off-centre shot/melee impulses, and switches spaces', async () => {
  const game = fixture(), props = await createDynamicProps(game);
  try {
    const box = props.crates.find(c => c.mode === 'training'), city = props.crates.find(c => c.mode === 'campaign');
    for (let i = 0; i < 100; i++) props.update(1 / 60);
    assert.ok(Math.abs(box.mesh.position.y - .6) < .03, 'supported by the actual training floor');
    assert.equal(city.mesh.visible, false); assert.equal(city.body.isEnabled(), false);
    const point = box.mesh.position.clone().add(new THREE.Vector3(.4, .25, .6));
    assert.equal(props.impact({ object: box.mesh, point }, { direction: { x: 0, y: 0, z: -1 }, impulse: 12, damage: 33, kind: 'firearm' }), true);
    assert.ok(box.body.linvel().z < -1); assert.ok(Math.abs(box.body.angvel().y) > .1, 'off-centre impact rotates the box');
    assert.equal(box.damage, 33);
    props.update(1 / 60);
    props.impact({ object: box.mesh, point }, { direction: { x: 1, y: 0, z: 0 }, impulse: 8, damage: 40, kind: 'melee' });
    assert.ok(box.body.linvel().x > 0); assert.equal(box.hits, 2);
    game.training.active = false; game.mode = 'campaign'; props.update(0);
    assert.equal(box.mesh.visible, false); assert.equal(box.body.isEnabled(), false); assert.equal(city.mesh.visible, true);
    assert.equal(props.impact({ object: box.mesh, point }, { impulse: 12 }), false, 'hidden space cannot receive impacts');
    for (let i = 0; i < 100; i++) props.update(1 / 60);
    assert.ok(Math.abs(city.mesh.position.y - 12.6) < .04, 'campaign support follows terrain elevation');
    const beforeQuery = city.body.linvel();
    props.collide(0, 0, .18, 12.8, { push: false });
    assert.deepEqual(city.body.linvel(), beforeQuery, 'camera obstruction query cannot push the crate');
    const [x, z] = props.collide(0, 0, .35, 12); assert.ok(Math.hypot(x, z) > .9, 'player cannot walk through the crate');
    assert.equal(props.surfaceHeightAt(0, 0, 12.7), -Infinity, 'crate does not teleport a player below its top');
    assert.ok(props.surfaceHeightAt(0, 0, 14) > 13, 'crate top can be stood on after a jump');
  } finally { props.dispose(); }
});
