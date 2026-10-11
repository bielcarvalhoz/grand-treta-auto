import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAvatarGeometry } from './load-avatar.mjs';
import { sweepHairTips } from '../../src/player/hair.js';

test('hair changes only a small rest-shape region and preserves rig, UVs and other meshes', async () => {
  const gltf = await loadAvatarGeometry(new URL('../../public/models/sato.glb', import.meta.url)), meshes = [];
  gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const originals = meshes.map(mesh => ({ geometry: mesh.geometry, positions: mesh.geometry.attributes.position.array.slice() }));
  sweepHairTips(meshes);
  let changed = 0;
  meshes.forEach((mesh, i) => {
    const old = originals[i];
    if (!mesh.name.startsWith('Sato_hair_cap')) { assert.equal(mesh.geometry, old.geometry); return; }
    assert.deepEqual(mesh.geometry.attributes.skinIndex.array, old.geometry.attributes.skinIndex.array);
    assert.deepEqual(mesh.geometry.attributes.skinWeight.array, old.geometry.attributes.skinWeight.array);
    assert.deepEqual(mesh.geometry.attributes.uv?.array, old.geometry.attributes.uv?.array);
    assert.deepEqual(mesh.geometry.index.array, old.geometry.index.array);
    const positions = mesh.geometry.attributes.position.array;
    for (let j = 0; j < positions.length; j += 3) {
      const dx = positions[j] - old.positions[j], dy = positions[j + 1] - old.positions[j + 1], dz = positions[j + 2] - old.positions[j + 2];
      assert.ok(Math.hypot(dx, dy, dz) < .04, 'hair change must remain subtle');
      assert.ok(dx >= -1e-7 && dy <= 1e-7, 'tips sweep sideways/down, rather than growing upwards');
      if (Math.hypot(dx, dy, dz) > .00001) changed++;
    }
  });
  assert.ok(changed > 0);
});
