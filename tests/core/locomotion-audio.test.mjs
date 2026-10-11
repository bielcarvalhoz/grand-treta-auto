import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { footSurface, bindLocomotionAudio } from '../../src/core/locomotion-audio.js';

function fixture() {
  return { training: { active: false }, player: { events: new EventTarget(), feet: new THREE.Vector3() },
    map: { terrain: { heightAt: () => 0 }, roads: { surfaceHeightAt: () => -Infinity },
      world: { roads: [{ w: 4, pts: [[20, -10], [20, 10]] }], areas: [{ kind: 'pitch', rings: [[[-10,-10],[10,-10],[10,10],[-10,10]]] }] } } };
}

test('foot surfaces distinguish football grass, paved road, raised decks and training', () => {
  const game = fixture();
  assert.equal(footSurface(game, { x: 0, y: 0, z: 0 }), 'grass');
  assert.equal(footSurface(game, { x: 20, y: 0, z: 0 }), 'concrete');
  assert.equal(footSurface(game, { x: 0, y: 1, z: 0 }), 'concrete');
  game.training.active = true;
  assert.equal(footSurface(game, { x: 0, y: 0, z: 0 }), 'concrete');
});

test('sound triggers follow player footfalls, takeoff and landing events only', () => {
  const game = fixture(), calls = [];
  game.audio = Object.fromEntries(['footstep', 'jump', 'land'].map(name => [name, (...args) => calls.push([name, ...args])]));
  const unbind = bindLocomotionAudio(game), events = game.player.events;
  const send = (name, detail) => events.dispatchEvent(new CustomEvent(name, { detail }));
  assert.equal(calls.length, 0);
  send('footstep', { speed: 3, foot: 1, position: { x: 0, y: 0, z: 0 } });
  send('jump', { position: { x: 0, y: 0, z: 0 } });
  send('land', { speed: 7, position: { x: 20, y: 0, z: 0 } });
  assert.deepEqual(calls.map(c => c.slice(0, 2)), [['footstep', 'grass'], ['jump', 'grass'], ['land', 'concrete']]);
  assert.equal(calls[2][2], 7); unbind(); send('footstep', {}); assert.equal(calls.length, 3);
});
