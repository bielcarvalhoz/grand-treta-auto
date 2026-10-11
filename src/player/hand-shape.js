import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A small web at the thumb root, merged into the existing skinned hand. No
 * extra draw calls, material, finger rotations or source-asset edits. */
export function fillThumbWebs(meshes) {
  for (const mesh of meshes) {
    const side = /^Sato_arm_hand_([LR])$/.exec(mesh.name)?.[1];
    if (!side || !mesh.isSkinnedMesh) continue;
    const handIndex = mesh.skeleton.bones.findIndex(bone => bone.name === `DEF-hand${side}`);
    if (handIndex < 0) continue;
    mesh.updateWorldMatrix(true, false);
    const hand = mesh.skeleton.bones[handIndex]; hand.updateWorldMatrix(true, false);
    const fill = new THREE.SphereGeometry(1, 8, 4);
    fill.deleteAttribute('uv');
    fill.scale(.010, .017, .008); fill.translate(side === 'L' ? .006 : -.006, .024, .006);
    fill.applyMatrix4(mesh.matrixWorld.clone().invert().multiply(hand.matrixWorld));
    const count = fill.attributes.position.count;
    const indices = new mesh.geometry.attributes.skinIndex.array.constructor(count * 4);
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = handIndex; weights[i * 4] = 1; }
    fill.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    fill.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    mesh.geometry = mergeGeometries([mesh.geometry, fill]); fill.dispose();
    mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
  }
}
