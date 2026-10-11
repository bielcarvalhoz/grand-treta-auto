import { MathUtils } from 'three';

/** Small runtime rest-shape adjustment; preserve the source GLB and its rig. */
export function sweepHairTips(meshes) {
  for (const mesh of meshes) {
    if (!mesh.name.startsWith('Sato_hair_cap')) continue;
    mesh.geometry = mesh.geometry.clone();
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      // +X is Sato's LEFT (the original DEF-handL is on +X). Leave the
      // lower/back hair at the nape intact, and comb crown/front tips together.
      const front = MathUtils.smoothstep(z, .015, .095);
      // The scalp reaches .936 and the covering shell is around .948. Bend
      // protruding tips only; moving that shell would uncover the character's
      // head, even if the new overall height looked correct.
      const top = MathUtils.smoothstep(y, .948, .996);
      const fringe = front * MathUtils.smoothstep(y, .785, .86) * (1 - MathUtils.smoothstep(y, .89, .96));
      // Every crown tip follows the fringe, while its shell/root stays put.
      const tousle = .95 + .05 * Math.sin(x * 93 + z * 47);
      const sweep = (.060 * top + .025 * fringe) * tousle;
      positions.setXYZ(i, x + sweep, y - .028 * top - .005 * fringe * tousle, z + .004 * fringe - .003 * top);
    }
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  }
}
