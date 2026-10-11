import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPaintball } from '../../src/gameplay/paintball/paintball.js';

const settle = paint => { for (let i = 0; i < 30; i++) paint.update(.05); };
const zoomFov = (base, zoom) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) / zoom));

test('sniper scope zoom is bounded, first-person only and restores ordinary aiming on other weapons', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70);
  let mode = 'first', active = true;
  const paint = createPaintball({ scene, camera, colliderRoots: [], getCameraMode: () => mode, getActive: () => active });
  paint.pickupWeapon('sniper');
  assert.equal(paint.scoped, false);
  paint.adjustScopeZoom(1); assert.equal(paint.scopeZoom, 2, 'scroll must not change zoom outside the scope');
  paint.setAiming(true); settle(paint);
  assert.equal(paint.scoped, true); assert.equal(paint.gun.visible, false);
  assert.ok(Math.abs(camera.fov - zoomFov(70, 2)) < .001);
  paint.adjustScopeZoom(3); settle(paint);
  assert.equal(paint.scopeZoom, 5); assert.ok(Math.abs(camera.fov - zoomFov(70, 5)) < .001);
  paint.adjustScopeZoom(Infinity); assert.equal(paint.scopeZoom, 5);
  paint.adjustScopeZoom(100); assert.equal(paint.scopeZoom, 8);
  paint.adjustScopeZoom(-100); assert.equal(paint.scopeZoom, 2);
  mode = 'third'; settle(paint);
  assert.equal(paint.scoped, false); assert.equal(paint.gun.visible, true);
  assert.ok(Math.abs(camera.fov - 40) < .001);
  mode = 'first'; paint.setWeapon('automatic'); paint.pickupWeapon('smg'); settle(paint);
  assert.equal(paint.scoped, false); assert.equal(paint.gun.visible, true);
  assert.ok(Math.abs(camera.fov - 45) < .001);
  paint.setWeapon('sniper'); paint.setAiming(true); settle(paint);
  active = false; paint.update(.05);
  assert.equal(paint.scoped, false); assert.equal(camera.fov, 70);
  paint.dispose();
});

test('scope supplies hidden-viewmodel state without stopping shots, then reset restores the camera', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70), states = [];
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial());
  wall.position.z = -8; scene.add(wall); scene.updateMatrixWorld(true);
  const hits = [];
  const paint = createPaintball({ scene, camera, colliderRoots: [wall], random: () => 0,
    updateWeaponPose: (_gun, state) => { states.push(state); return false; }, onImpact: hit => hits.push(hit) });
  paint.pickupWeapon('sniper'); paint.setAiming(true); settle(paint);
  assert.equal(states.at(-1).scoped, true);
  paint.adjustScopeZoom(2); settle(paint);
  assert.equal(paint.shoot(), true); assert.equal(paint.stats.shots, 1);
  for (let i = 0; i < 10; i++) paint.update(.02);
  assert.equal(hits.length, 1); assert.ok(Math.abs(hits[0].point.x) < .001, 'scope center remains the shot target');
  assert.equal(paint.gun.visible, false, 'firing does not reveal the hidden weapon');
  paint.resetInput(); paint.update(0);
  assert.equal(paint.scoped, false); assert.equal(camera.fov, 70); assert.equal(paint.gun.visible, true);
  paint.dispose();
});
