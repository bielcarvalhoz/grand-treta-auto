import { MathUtils } from 'three';

/** Small runtime rest-shape adjustment; preserve the source GLB and its rig. */
export function sweepHairTips(meshes) {
  for (const mesh of meshes) {
    if (!mesh.name.startsWith('Sato_hair_cap')) continue;
    mesh.geometry = mesh.geometry.clone();
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const tip = MathUtils.smoothstep(y, .86, 1.012) * (.4 + .6 * MathUtils.smoothstep(z, -.06, .08));
      const fringe = MathUtils.smoothstep(z, .065, .11) * (1 - MathUtils.smoothstep(y, .82, .90));
      const fringeTip = .5 + .5 * Math.sin((x + .08) * 90);
      positions.setXYZ(i, x + .022 * tip + .010 * fringe, y - .022 * tip - .006 * fringe * fringeTip, z + .004 * fringe);
    }
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  }
}
