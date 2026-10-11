import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadAvatarGeometry } from './load-avatar.mjs';
import { createAvatarFromGLTF } from '../../src/player/avatar.js';
import { createStyler } from '../../src/core/style.js';
import { DEFAULT_APPEARANCE } from '../../src/core/characters.js';

async function fixture() {
  const gltf = await loadAvatarGeometry(new URL('../../public/models/sato.glb', import.meta.url));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70);
  const player = { feet: new THREE.Vector3(), eyePosition: new THREE.Vector3(0, 1.7, 0), velocity: new THREE.Vector3(), active: true, grounded: true, cameraMode: 'third', yaw: 0 };
  return { avatar: createAvatarFromGLTF(gltf, { scene, camera, player }), scene, player };
}

test('appearance styles preserve skeleton/skin data, reset rest shapes and follow the animated head', async () => {
  const { avatar, player } = await fixture();
  const trousers = avatar.meshes.find(m => m.name === 'Sato_trousers_1');
  const original = trousers.geometry.attributes.position.array.slice(), skin = trousers.geometry.attributes.skinWeight.array.slice();
  const clips = avatar.clips.map(clip => clip.toJSON()), bones = Object.values(avatar.bones);
  const look = { ...DEFAULT_APPEARANCE, hairStyle: 'mohawk', beard: 'full', shirtStyle: 'stripes', shirtColor: '#ff3300', pantsStyle: 'cargo', shoeStyle: 'high', faceAccessory: 'mask', headAccessory: 'headphones' };
  avatar.appearance.apply(look); avatar.setWeapon({ holstered: true }); avatar.update(.016);
  assert.notDeepEqual(trousers.geometry.attributes.position.array, original);
  assert.deepEqual(trousers.geometry.attributes.skinWeight.array, skin);
  assert.deepEqual(avatar.clips.map(clip => clip.toJSON()), clips); assert.deepEqual(Object.values(avatar.bones), bones);
  assert.ok(avatar.meshes.filter(m => m.name.startsWith('Sato_hair_cap')).every(m => !m.visible));
  const mohawk = avatar.model.getObjectByName('character-hair:mohawk');
  assert.equal(mohawk.parent, avatar.bones['DEF-head']); assert.equal(mohawk.visible, true);
  avatar.appearance.apply(look); assert.deepEqual(trousers.geometry.attributes.skinWeight.array, skin);
  player.cameraMode = 'first'; avatar.update(.016); assert.equal(mohawk.visible, false);
  avatar.appearance.apply(DEFAULT_APPEARANCE); player.cameraMode = 'third'; avatar.update(.016);
  assert.deepEqual(trousers.geometry.attributes.position.array, original);
  assert.ok(avatar.meshes.filter(m => m.name.startsWith('Sato_hair_cap')).every(m => m.visible));
  assert.equal(mohawk.visible, false);
});

test('new appearances reach collected toon and standard materials and do not leak between avatars', async () => {
  const first = await fixture(), second = await fixture();
  const styler = createStyler(first.scene, {}, { intensity: 1 }); styler.collect(); styler.setCartoon(true);
  const shirt = first.avatar.meshes.find(m => m.name === 'Sato_shirt_2');
  first.avatar.appearance.apply({ shirtColor: '#ee1122', shirtStyle: 'sport', hairStyle: 'afro', hairColor: '#ffcc00', headAccessory: 'beanie' });
  assert.equal(shirt.material.color.getHexString(), 'ee1122');
  assert.equal(shirt.userData.stdMaterial.color.getHexString(), 'ee1122');
  assert.ok(shirt.material.map?.isDataTexture);
  assert.equal(first.avatar.model.getObjectByName('character-hair:afro').visible, false, 'headwear hides protruding hair');
  assert.equal(first.avatar.model.getObjectByName('character-head:beanie').visible, true);
  assert.deepEqual(second.avatar.appearance.value, DEFAULT_APPEARANCE);
  styler.setCartoon(false); assert.equal(shirt.material.color.getHexString(), 'ee1122');
  first.avatar.appearance.apply(DEFAULT_APPEARANCE); assert.equal(shirt.material.map, null);
});
