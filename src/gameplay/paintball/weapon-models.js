import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Measurements include the supplied GLB's FBX centimetre transform. All models
// are normalized to a grip at 0 and a blade/barrel pointing along -Z.
export const WEAPON_MODEL_FITS = Object.freeze({
  pistol: { axis: 'x', length: .26, grip: [-.08, 0, 0], barrelY: .53, tint: 'LightMetal' },
  automatic: { axis: 'x', length: .75, grip: [-.05, .05, 0], barrelY: .22, tint: 'MainLight' },
  revolver: { axis: 'x', length: .31, grip: [.10, 0, 0], barrelY: .53, tint: 'LightMetal' },
  shotgun: { axis: 'x', length: .93, grip: [-.05, -.13, 0], barrelY: .24, tint: 'DarkWood' },
  sniper: { axis: 'x', length: 1.02, grip: [-.05, -.25, 0], barrelY: .22, tint: 'Grey' },
  smg: { axis: 'x', length: .60, grip: [.15, -.05, 0], barrelY: .30, tint: 'Metal' },
  knife: { axis: 'y', length: .30, grip: [0, .02, 0], tint: 'Wood' },
  'knife-tactical': { axis: 'y', length: .31, grip: [0, .08, 0], tint: 'Black' },
  'knife-combat': { axis: 'z', length: .32, grip: [0, 0, -.04], tint: 'Atlas.017' },
  axe: { axis: 'y', length: .79, grip: [0, -.38, 0], tint: 'Red' },
  bat: { axis: 'z', length: .86, grip: [0, 0, -.22], tint: 'Atlas.018' },
});

function accentBand(material, geometry, accents) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox, size = bounds.getSize(new THREE.Vector3());
  const axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
  const low = bounds.min[axis] + size[axis] * .53, high = bounds.min[axis] + size[axis] * .72;
  const edge = Math.max(size[axis] * .015, .000001), paintTint = { value: new THREE.Color('#c8102e') };
  const number = value => Number(value).toFixed(9);
  material.onBeforeCompile = shader => {
    shader.uniforms.paintTint = paintTint;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float paintAxis;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\npaintAxis = position.${axis};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float paintAxis; uniform vec3 paintTint;')
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat band = smoothstep(${number(low - edge)}, ${number(low)}, paintAxis) * (1.0 - smoothstep(${number(high)}, ${number(high + edge)}, paintAxis));\ndiffuseColor.rgb = mix(diffuseColor.rgb, paintTint, band * .82);`);
  };
  material.customProgramCacheKey = () => `weapon-paint-band-${axis}-${low}-${high}`;
  accents.push(color => paintTint.value.set(color));
}

export function prepareWeaponModel(gltf, id) {
  const fit = WEAPON_MODEL_FITS[id];
  if (!fit) throw new RangeError('Modelo de arma inválido');
  const source = gltf.scene, model = new THREE.Group(); source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const scale = fit.length / (bounds.max[fit.axis] - bounds.min[fit.axis]) / .65;
  const rotation = new THREE.Quaternion();
  if (fit.axis === 'x') rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  else if (fit.axis === 'y') rotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  else rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const frame = new THREE.Group(); frame.quaternion.copy(rotation); frame.scale.setScalar(scale);
  frame.add(source); model.add(frame);
  const transform = point => point.clone().applyQuaternion(rotation).multiplyScalar(scale);
  frame.position.copy(transform(new THREE.Vector3(...fit.grip))).negate();
  const tip = fit.axis === 'x' ? new THREE.Vector3(bounds.max.x + .015, fit.barrelY, 0)
    : fit.axis === 'y' ? new THREE.Vector3(0, bounds.max.y, 0) : new THREE.Vector3(0, 0, bounds.max.z);
  const muzzle = transform(tip).add(frame.position), accents = [];
  model.name = `quaternius-${id}`;
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true; object.receiveShadow = true;
    object.userData.paintballIgnore = true; object.userData.keepStandard = true;
    const clone = material => {
      const copy = material.clone();
      if (material.name === fit.tint) accentBand(copy, object.geometry, accents);
      return copy;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  return { model, grip: new THREE.Vector3(), muzzle, length: fit.length,
    setColor(color) { for (const accent of accents) accent(color); },
  };
}

export async function loadWeaponModels(base) {
  const loader = new GLTFLoader();
  return Object.fromEntries(await Promise.all(Object.keys(WEAPON_MODEL_FITS).map(async id =>
    [id, prepareWeaponModel(await loader.loadAsync(`${base}models/weapons/${id}.glb`), id)])));
}
