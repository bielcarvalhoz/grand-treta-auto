import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareWeaponModel, WEAPON_MODEL_FITS } from '../../src/gameplay/paintball/weapon-models.js';
import { createPaintball } from '../../src/gameplay/paintball/paintball.js';
import { loadAvatarGeometry } from '../player/load-avatar.mjs';

async function loadModels() {
  const models = {};
  for (const [id, file] of [['pistol', 'pistol-quaternius'], ['automatic', 'assault-rifle-quaternius']]) {
    models[id] = prepareWeaponModel(await loadAvatarGeometry(new URL(`../../public/models/${file}.glb`, import.meta.url)), id);
  }
  return models;
}

test('Quaternius weapons normalize source transforms, tint only accents and fire from the selected barrel', async () => {
  const models = await loadModels(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70);
  const paint = createPaintball({ scene, camera, colliderRoots: [] });
  paint.setWeaponModels(models);
  for (const [id, length] of [['pistol', .26], ['automatic', .75]]) {
    paint.setWeapon(id); scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(models[id].model);
    assert.ok(Math.abs(box.getSize(new THREE.Vector3()).z - length) < .0001);
    const base = [];
    models[id].model.traverse(o => { if (o.isMesh) base.push([o.material, o.material.color.clone()]); });
    paint.setColor('azul');
    assert.ok(base.filter(([material, original]) => material.color.equals(original)).length >= 2,
      'most material regions must retain their original grey');
    assert.ok(models[id].muzzle.z < models[id].grip.z);
    assert.ok(paint.shoot());
    const ball = paint.root.children.find(o => o.name === 'bolinha-tinta' && o.visible);
    assert.ok(ball.position.distanceTo(paint.gun.localToWorld(models[id].muzzle.clone())) < .00001);
    paint.clearEffects();
  }
  paint.dispose();
});

test('all supplied firearm and melee GLBs normalize to their physical length and a forward tip', async () => {
  for (const [id, fit] of Object.entries(WEAPON_MODEL_FITS)) {
    const loaded = await loadAvatarGeometry(new URL(`../../public/models/weapons/${id}.glb`, import.meta.url));
    const model = prepareWeaponModel(loaded, id), holder = new THREE.Group(); holder.scale.setScalar(.65); holder.add(model.model); holder.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(holder);
    assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).z - fit.length) < .00001, `${id} length`);
    assert.ok(model.muzzle.z < model.grip.z, `${id} tip must point forward`);
    assert.equal(model.grip.length(), 0, `${id} grip belongs at hand socket`);
    let accents = 0;
    model.model.traverse(object => {
      if (!object.isMesh || object.material.name !== fit.tint) return;
      const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
      object.material.onBeforeCompile(shader); model.setColor('#2879b6');
      assert.equal(shader.uniforms.paintTint.value.getHexString(), '2879b6'); accents++;
    });
    assert.ok(accents > 0, `${id} must have a working color accent`);
  }
});
