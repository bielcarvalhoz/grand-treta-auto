import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Source models point along +X and contain centimetre/FBX transforms. These
// measurements refer to the loaded scene, before its runtime normalization.
const FIT = {
  pistol: { file: 'pistol-quaternius.glb', length: .26, grip: [-.08, 0, 0], barrelY: .53, tint: 'LightMetal' },
  automatic: { file: 'assault-rifle-quaternius.glb', length: .75, grip: [-.05, .05, 0], barrelY: .22, tint: 'MainLight' },
};

export function prepareWeaponModel(gltf, id) {
  const fit = FIT[id], source = gltf.scene, model = new THREE.Group();
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const scale = fit.length / (bounds.max.x - bounds.min.x) / .65;
  const frame = new THREE.Group(); frame.rotation.y = Math.PI / 2; frame.scale.setScalar(scale);
  frame.add(source); model.add(frame);
  const transform = point => point.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiplyScalar(scale);
  frame.position.copy(transform(new THREE.Vector3(...fit.grip))).negate();
  const muzzle = transform(new THREE.Vector3(bounds.max.x + .015, fit.barrelY, 0)).add(frame.position);
  const accents = [];
  model.name = `quaternius-${id}`;
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true; object.receiveShadow = true;
    object.userData.paintballIgnore = true; object.userData.keepStandard = true;
    object.material = object.material.clone();
    if (object.material.name !== fit.tint) return;
    const material = object.material, original = material.color.clone();
    if (id === 'pistol') {
      // Tint just a band of the slide, retaining the supplied grey everywhere
      // else. Source X is the barrel axis before the FBX node transform.
      const paintTint = { value: new THREE.Color() };
      material.onBeforeCompile = shader => {
        shader.uniforms.paintTint = paintTint;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float paintLocalX;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\npaintLocalX = position.x;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float paintLocalX; uniform vec3 paintTint;')
          .replace('#include <color_fragment>', '#include <color_fragment>\nfloat band = smoothstep(.0058, .0062, paintLocalX) * (1.0 - smoothstep(.0080, .0084, paintLocalX));\ndiffuseColor.rgb = mix(diffuseColor.rgb, paintTint, band * .72);');
      };
      material.customProgramCacheKey = () => 'quaternius-pistol-paint-band';
      accents.push(color => paintTint.value.set(color));
    } else accents.push(color => material.color.copy(original).lerp(new THREE.Color(color), .72));
  });
  return { model, grip: new THREE.Vector3(), muzzle, setColor(color) {
    for (const accent of accents) accent(color);
  } };
}

export async function loadWeaponModels(base) {
  const loader = new GLTFLoader();
  return Object.fromEntries(await Promise.all(Object.entries(FIT).map(async ([id, fit]) =>
    [id, prepareWeaponModel(await loader.loadAsync(`${base}models/${fit.file}`), id)])));
}
