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
      const top = MathUtils.smoothstep(y, .865, 1.005);
      const fringe = front * MathUtils.smoothstep(y, .785, .86) * (1 - MathUtils.smoothstep(y, .89, .96));
      const tip = top * (.30 + .70 * front);
      const tousle = .80 + .20 * Math.sin(x * 93 + z * 47);
      const sweep = (.050 * tip + .031 * fringe) * tousle;
      positions.setXYZ(i, x + sweep, y - .020 * tip - .008 * fringe * tousle, z + .005 * fringe - .004 * tip);
    }
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  }
}
