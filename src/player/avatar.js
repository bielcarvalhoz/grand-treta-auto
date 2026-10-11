import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sweepHairTips } from './hair.js';

const upperTrack = /spine|neck|head|shoulder|upper_arm|forearm|hand|f_index|f_middle|f_ring|f_pinky|thumb|support_elbow/;
const namedClip = (clips, name) => clips.find(clip => clip.name.split('|').at(-1) === name);
const vector = () => new THREE.Vector3();
const quaternion = () => new THREE.Quaternion();

/** Keep the supplied GLB intact. Both views share its meshes, materials and
 * skeleton; authored pistol animations drive the arms, wrists and fingers. */
export function createAvatarFromGLTF(gltf, { scene, camera, player }) {
  const root = new THREE.Group(); root.name = 'sato-player'; root.userData.paintballIgnore = true;
  const model = gltf.scene; root.add(model); scene.add(root);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const scale = 1.8 / Math.max(.1, box.max.y - box.min.y);
  model.scale.setScalar(scale); model.position.y = -box.min.y * scale;
  model.rotation.y = Math.PI; // Sato faces +Z; the game faces -Z.
  const bones = {}, meshes = [];
  model.traverse(object => {
    if (object.isBone) bones[object.name] = object;
    if (object.isMesh) {
      meshes.push(object); object.frustumCulled = false;
      object.receiveShadow = object.castShadow = true; object.userData.paintballIgnore = true;
    }
  });
  sweepHairTips(meshes);
  const clips = gltf.animations, mixer = new THREE.AnimationMixer(model);
  const rightHand = bones['DEF-handR'], leftHand = bones['DEF-handL'];
  const neutral = namedClip(clips, 'Pistol_Aim_Neutral');
  if (!rightHand || !leftHand || !neutral) throw new Error('Sato precisa do esqueleto e da pose original de pistola.');

  // Calibrate the existing gun against the ORIGINAL neutral hand frame. The
  // weapon follows this socket; no guessed wrist rotations overwrite the GLB.
  const sampler = new THREE.AnimationMixer(model);
  sampler.clipAction(neutral).play(); sampler.setTime(0); root.updateMatrixWorld(true);
  const socketRotation = rightHand.getWorldQuaternion(quaternion()).invert();
  const spine = bones['DEF-spine001'], hips = spine.parent;
  const hipsReference = model.getWorldQuaternion(quaternion()).invert().multiply(hips.getWorldQuaternion(quaternion()));
  sampler.stopAllAction(); sampler.uncacheRoot(model);
  const aimLimits = ['Pistol_Aim_Up', 'Pistol_Aim_Down'].map(name => {
    sampler.clipAction(namedClip(clips, name) || neutral).play(); sampler.setTime(0); root.updateMatrixWorld(true);
    const forward = vector().set(0, 0, -1).applyQuaternion(rightHand.getWorldQuaternion(quaternion()).multiply(socketRotation));
    const limit = Math.max(.1, Math.abs(Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1))));
    sampler.stopAllAction(); sampler.uncacheRoot(model); return limit;
  });

  const lowerActions = new Map(); let motion = null, preview = null;
  function layer(clip, upper) {
    return mixer.clipAction(new THREE.AnimationClip(`${upper ? 'upper' : 'lower'}-${clip.name}`, clip.duration,
      clip.tracks.filter(track => upperTrack.test(track.name) === upper), clip.blendMode));
  }
  const aimActions = ['Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down'].map(name => {
    const action = layer(namedClip(clips, name) || neutral, true);
    action.setEffectiveWeight(0).play(); return action;
  });
  const shootClip = namedClip(clips, 'Pistol_Shoot');
  // Keep the selected aim pose while applying the authored shot's recoil delta.
  const shootAction = shootClip ? layer(THREE.AnimationUtils.makeClipAdditive(shootClip.clone(), 0, neutral), true)
    .setLoop(THREE.LoopOnce, 1) : null;
  const poseAnchor = vector();
  const authoredSpine = spine.quaternion.clone();
  function setMotion(name, speed) {
    if (!lowerActions.has(name)) {
      const clip = namedClip(clips, name) || namedClip(clips, 'Idle_Loop');
      lowerActions.set(name, layer(clip, false));
    }
    const next = lowerActions.get(name);
    if (motion !== next) {
      next.reset().setEffectiveWeight(1).play();
      if (motion) motion.crossFadeTo(next, .16, false);
      motion = next;
    }
    next.setEffectiveTimeScale(speed);
  }
  function visibility() {
    for (const mesh of meshes) {
      mesh.visible = !!preview || player.cameraMode === 'third' || /Sato_arm_hand_[LR]/.test(mesh.name);
      mesh.castShadow = player.cameraMode === 'third';
    }
  }
  function update(dt) {
    root.position.copy(player.feet);
    if (player.cameraMode === 'first' && !preview) {
      root.quaternion.copy(camera.quaternion);
      const eyeOffset = player.eyePosition.clone().sub(player.feet);
      root.position.copy(player.eyePosition).sub(eyeOffset.applyQuaternion(root.quaternion));
      root.position.add(vector().set(0, .18, -.10).applyQuaternion(root.quaternion));
    } else root.rotation.set(0, player.yaw, 0);
    poseAnchor.copy(root.position);
    root.visible = player.active || !!preview; visibility();
    if (preview) mixer.setTime(preview.time);
    else {
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const airborne = !player.grounded && player.active;
      // Median planted-toe speeds measured on the source clips at 1.8 m height.
      setMotion(airborne ? 'Jump_Loop' : speed > 7 ? 'Sprint_Loop' : speed > .15 ? 'Jog_Fwd_Loop' : 'Idle_Loop',
        airborne ? 1 : speed > 7 ? speed / 7.015 : speed > .15 ? speed / 4.588 : 1);
      // First-person shoulders already rotate with the eyes. Third person uses
      // the supplied up/down aim poses without twisting the bones by hand.
      const pitch = player.cameraMode === 'third' ? new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').x : 0;
      const amount = THREE.MathUtils.clamp(Math.abs(pitch) / aimLimits[pitch > 0 ? 0 : 1], 0, 1);
      const weights = [1 - amount, pitch > 0 ? amount : 0, pitch < 0 ? amount : 0];
      aimActions.forEach((action, i) => { action.play(); action.setEffectiveWeight(weights[i]); });
      spine.quaternion.copy(authoredSpine);
      mixer.update(Math.min(.05, Math.max(0, dt)));
      authoredSpine.copy(spine.quaternion);
      // Legs retain their gait, while the aiming torso cancels inherited hip
      // rotation. Stabilize the whole arm chain, never the wrists/fingers alone.
      root.updateMatrixWorld(true);
      const hipsWorld = hips.getWorldQuaternion(quaternion());
      spine.quaternion.premultiply(hipsWorld.clone().invert().multiply(model.getWorldQuaternion(quaternion())).multiply(hipsReference));
      root.updateMatrixWorld(true);
      const gunRotation = rightHand.getWorldQuaternion(quaternion()).multiply(socketRotation);
      const aimFrame = player.cameraMode === 'first' ? camera.quaternion.clone() : quaternion().setFromAxisAngle(vector().set(0, 1, 0), player.yaw);
      const relative = aimFrame.clone().invert().multiply(gunRotation);
      const kickPitch = new THREE.Euler().setFromQuaternion(relative, 'YXZ').x;
      const desired = aimFrame.multiply(quaternion().setFromEuler(new THREE.Euler(kickPitch, 0, 0, 'YXZ')));
      const correction = hipsWorld.clone().invert().multiply(desired).multiply(gunRotation.invert()).multiply(hipsWorld);
      spine.quaternion.premultiply(correction);
    }
    root.updateMatrixWorld(true);
  }
  function playShot() {
    if (!preview && shootAction) shootAction.reset().setEffectiveWeight(player.cameraMode === 'first' ? .18 : .8).play();
  }

  const palm = vector(), gripLocal = vector(), weaponDiagnostics = { gripError: 0 };
  function updateWeapon(gun, { weapon = 'pistol', active = true, aimBlend = 0, recoil = 0 } = {}) {
    if (preview) return false;
    if (gun.parent !== scene) scene.add(gun);
    root.visible = !!active; root.position.copy(poseAnchor); visibility(); root.updateMatrixWorld(true);
    const handRotation = rightHand.getWorldQuaternion(quaternion());
    gun.quaternion.copy(handRotation).multiply(socketRotation);
    gun.scale.setScalar(.65);
    // Grip centre lies inside the curled fingers, left/forward of the wrist.
    palm.copy(rightHand.localToWorld(vector().set(-.014, .044, -.004)));
    if (gun.userData.weaponGrip) gripLocal.copy(gun.userData.weaponGrip);
    else gripLocal.set(0, weapon === 'automatic' ? -.15 : -.13, weapon === 'automatic' ? .065 : .08);
    gun.position.copy(palm).sub(gripLocal.clone().multiplyScalar(.65).applyQuaternion(gun.quaternion));
    if (player.cameraMode === 'first') {
      // Frame the original animated arms as a unit. Moving their common root
      // preserves every authored joint and keeps ADS readable on narrow screens.
      const desired = vector().set(Math.min(.14, camera.aspect * .11) * (1 - aimBlend), -.24 + (weapon === 'automatic' ? .06 : .10) * aimBlend - recoil * .02, -.34 - .04 * aimBlend + recoil * .045)
        .applyQuaternion(camera.quaternion).add(player.eyePosition);
      const shift = desired.sub(gun.position);
      root.position.add(shift); gun.position.add(shift); palm.add(shift);
      root.updateMatrixWorld(true);
    }
    gun.updateWorldMatrix(true, true);
    weaponDiagnostics.gripError = gun.localToWorld(gripLocal.clone()).distanceTo(palm);
    return true;
  }
  function setPreviewAnimation(name, time = 0) {
    mixer.stopAllAction(); motion = null;
    authoredSpine.copy(spine.quaternion);
    if (!name) { preview = null; update(0); return; }
    const clip = clips.find(clip => clip.name === name) || namedClip(clips, name);
    if (!clip) throw new Error(`Animação Sato desconhecida: ${name}`);
    preview = { name: clip.name, time }; mixer.clipAction(clip).play(); update(0);
  }
  update(0);
  return { root, model, bones, meshes, mixer, clips, scale, update, updateWeapon, playShot, setPreviewAnimation, weaponDiagnostics };
}

export async function loadPlayerAvatar(options, url) {
  return createAvatarFromGLTF(await new GLTFLoader().loadAsync(url), options);
}
