import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sweepHairTips } from './hair.js';
import { GAITS, gaitForSpeed } from './locomotion.js';

const upperTrack = /spine|neck|head|shoulder|upper_arm|forearm|hand|f_index|f_middle|f_ring|f_pinky|thumb|support_elbow/;
const namedClip = (clips, name) => clips.find(clip => clip.name.split('|').at(-1) === name);
const vector = () => new THREE.Vector3();
const quaternion = () => new THREE.Quaternion();
const kindOf = weapon => weapon?.kind || (['fists', 'unarmed'].includes(weapon?.id || weapon) ? 'unarmed'
  : /knife|axe|bat|sword/.test(weapon?.id || weapon || '') ? 'melee' : 'firearm');

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
  const swordClip = namedClip(clips, 'Sword_Idle') || neutral;
  const punchClip = namedClip(clips, 'Punch_Enter') || neutral;
  function samplePose(clip, time = 0) {
    sampler.clipAction(clip).play(); sampler.setTime(time); root.updateMatrixWorld(true);
    const rotation = rightHand.getWorldQuaternion(quaternion()).invert();
    const palm = root.worldToLocal(rightHand.localToWorld(vector().set(-.014, .044, -.004)));
    const center = rightHand.getWorldPosition(vector()).add(leftHand.getWorldPosition(vector())).multiplyScalar(.5);
    root.worldToLocal(center);
    sampler.stopAllAction(); sampler.uncacheRoot(model);
    return { rotation, palm, center };
  }
  const neutralPose = samplePose(neutral);
  const swordPose = samplePose(swordClip);
  // Prepared melee shafts point -Z. The original sword pose holds the blade up;
  // its hand frame then carries the entire authored slash without correction.
  const swordSocket = swordPose.rotation.multiply(quaternion().setFromAxisAngle(vector().set(1, 0, 0), Math.PI / 2));
  const firstSwordSocket = socketRotation.clone().multiply(quaternion().setFromAxisAngle(vector().set(1, 0, 0), Math.PI / 2));
  const firstLongSwordSocket = socketRotation.clone().multiply(quaternion().setFromAxisAngle(vector().set(1, 0, 0), 1));
  const punchPose = samplePose(punchClip, Math.max(0, punchClip.duration - .001));

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
  const swordIdle = layer(swordClip, true).setEffectiveWeight(0).play();
  const punchIdleClip = punchClip.clone(); punchIdleClip.name = 'Punch_Ready';
  punchIdleClip.tracks = punchIdleClip.tracks.map(track => {
    const frozen = track.clone(), values = track.createInterpolant().evaluate(Math.max(0, punchClip.duration - .001));
    frozen.times = new Float32Array([0]); frozen.values = new Float32Array(values); return frozen;
  });
  punchIdleClip.duration = 1;
  const punchIdle = layer(punchIdleClip, true).setEffectiveWeight(0).play();
  const attackActions = new Map();
  let heldKind = 'firearm', heldWeapon = 'pistol', attack = null, punchSequence = 0, currentAimBlend = 0;
  const animationState = { motion: 'Idle_Loop', attack: null, kind: heldKind };
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
    animationState.motion = name;
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
      const gait = GAITS[gaitForSpeed(speed)];
      setMotion(airborne ? 'Jump_Loop' : gait.clip, airborne || !gait.speed ? 1 : speed / gait.speed);
      const frameDt = Math.min(.05, Math.max(0, dt));
      const firstMelee = heldKind === 'melee' && player.cameraMode === 'first';
      if (attack) {
        attack.elapsed += frameDt;
        if (attack.elapsed >= attack.duration) stopAttack();
      }
      const attackWeight = attack ? Math.min(1, attack.elapsed / .045, (attack.duration - attack.elapsed) / .10) : 0;
      if (attack) {
        attack.action.setEffectiveWeight(firstMelee ? 0 : Math.max(0, attackWeight));
        attack.firstAction?.setEffectiveWeight(firstMelee ? Math.max(0, attackWeight) * .65 : 0);
      }
      swordIdle.play().setEffectiveWeight(heldKind === 'melee' && !firstMelee ? 1 - attackWeight : 0);
      punchIdle.play().setEffectiveWeight(heldKind === 'unarmed' ? 1 - attackWeight : 0);
      // First-person shoulders already rotate with the eyes. Third person uses
      // the supplied up/down aim poses without twisting the bones by hand.
      const pitch = player.cameraMode === 'third' ? new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').x : 0;
      const amount = THREE.MathUtils.clamp(Math.abs(pitch) / aimLimits[pitch > 0 ? 0 : 1], 0, 1);
      const weights = [1 - amount, pitch > 0 ? amount : 0, pitch < 0 ? amount : 0];
      aimActions.forEach((action, i) => { action.play(); action.setEffectiveWeight(heldKind === 'firearm' || firstMelee ? weights[i] : 0); });
      if (heldKind !== 'firearm') shootAction?.stop();
      spine.quaternion.copy(authoredSpine);
      // Controller advances this phase by actual displacement. Sound events and
      // the two planted feet therefore share a cycle even when changing speed.
      if (!airborne && gait.speed && player.locomotion) {
        motion.time = (player.locomotion.phase % 1) * motion.getClip().duration - frameDt * motion.getEffectiveTimeScale();
      }
      mixer.update(frameDt);
      authoredSpine.copy(spine.quaternion);
      // Legs retain their gait, while the aiming torso cancels inherited hip
      // rotation. Stabilize the whole arm chain, never the wrists/fingers alone.
      if (heldKind === 'firearm' || firstMelee) {
        root.updateMatrixWorld(true);
        const hipsWorld = hips.getWorldQuaternion(quaternion());
        spine.quaternion.premultiply(hipsWorld.clone().invert().multiply(model.getWorldQuaternion(quaternion())).multiply(hipsReference));
        root.updateMatrixWorld(true);
        if (heldKind === 'firearm') {
          const gunRotation = rightHand.getWorldQuaternion(quaternion()).multiply(socketRotation);
          const aimFrame = player.cameraMode === 'first' ? camera.quaternion.clone() : quaternion().setFromAxisAngle(vector().set(0, 1, 0), player.yaw);
          const relative = aimFrame.clone().invert().multiply(gunRotation);
          const kickPitch = new THREE.Euler().setFromQuaternion(relative, 'YXZ').x;
          const phase = player.locomotion ? player.locomotion.phase * Math.PI * 2 : mixer.time * speed / 7.015 / GAITS.run.duration * Math.PI * 2;
          const runSway = THREE.MathUtils.smoothstep(speed, 3.5, 9.5);
          const aimedSway = currentAimBlend * .25 * THREE.MathUtils.smoothstep(speed, .15, 3.1);
          const sway = !airborne ? Math.max(runSway, aimedSway) * (1 - .35 * currentAimBlend) : 0;
          const desired = aimFrame.multiply(quaternion().setFromEuler(new THREE.Euler(kickPitch + Math.sin(phase * 2) * .011 * sway,
            Math.sin(phase) * .009 * sway, Math.cos(phase) * .014 * sway, 'YXZ')));
          const correction = hipsWorld.clone().invert().multiply(desired).multiply(gunRotation.invert()).multiply(hipsWorld);
          spine.quaternion.premultiply(correction);
        }
      }
    }
    root.updateMatrixWorld(true);
  }
  function playShot() {
    if (!preview && heldKind === 'firearm' && shootAction) shootAction.reset().setEffectiveWeight(player.cameraMode === 'first' ? .18 : .8).play();
  }
  function setWeapon(weapon) {
    const nextKind = kindOf(weapon), nextId = weapon?.id || weapon || 'pistol';
    if (nextId !== heldWeapon) stopAttack();
    heldKind = nextKind; heldWeapon = nextId; animationState.kind = heldKind;
  }
  function stopAttack() {
    attack?.action.stop(); attack?.firstAction?.stop(); attack = null; animationState.attack = null;
  }
  function playAttack(weapon, { sequence } = {}) {
    if (preview) return null;
    setWeapon(weapon);
    if (heldKind === 'firearm') { playShot(); return null; }
    const name = heldKind === 'melee' ? 'Sword_Attack' : (sequence ?? punchSequence++) % 2 ? 'Punch_Cross' : 'Punch_Jab';
    const clip = namedClip(clips, name);
    if (!clip) return null;
    stopAttack();
    if (!attackActions.has(name)) attackActions.set(name, layer(clip, true).setLoop(THREE.LoopOnce, 1));
    const action = attackActions.get(name), duration = Math.max(.2, Number(weapon?.interval) || clip.duration);
    action.reset().setEffectiveTimeScale(clip.duration / duration).setEffectiveWeight(0).play();
    action.clampWhenFinished = true;
    let firstAction = null;
    if (heldKind === 'melee') {
      const key = `${name}-first`;
      if (!attackActions.has(key)) {
        // The sword rest pose puts the hand behind the torso. In first person,
        // use its authored arm delta over a forward guard; keep shoulders/spine
        // fixed so severed upper-arm starts stay behind the camera near plane.
        const delta = THREE.AnimationUtils.makeClipAdditive(clip.clone(), 0, swordClip);
        delta.tracks = delta.tracks.filter(track => /upper_arm|forearm|hand|f_index|f_middle|f_ring|f_pinky|thumb|support_elbow/.test(track.name));
        firstAction = layer(delta, true).setLoop(THREE.LoopOnce, 1);
        attackActions.set(key, firstAction);
      } else firstAction = attackActions.get(key);
      firstAction.reset().setEffectiveTimeScale(clip.duration / duration).setEffectiveWeight(0).play();
      firstAction.clampWhenFinished = true;
    }
    attack = { action, firstAction, duration, elapsed: 0 }; animationState.attack = name;
    return { clip: name, duration };
  }

  const palm = vector(), gripLocal = vector(), weaponDiagnostics = { gripError: 0 };
  function updateWeapon(gun, { weapon = 'pistol', kind = kindOf(weapon), active = true, aimBlend = 0, recoil = 0 } = {}) {
    if (preview) return false;
    const changedKind = heldKind !== kind;
    setWeapon({ id: weapon?.id || weapon, kind }); currentAimBlend = aimBlend;
    if (changedKind) update(0);
    if (gun.parent !== scene) scene.add(gun);
    root.visible = !!active; root.position.copy(poseAnchor); visibility(); root.updateMatrixWorld(true);
    const handRotation = rightHand.getWorldQuaternion(quaternion());
    const firstMelee = heldKind === 'melee' && player.cameraMode === 'first';
    const firstSocket = ['axe', 'bat', 'bat-barbed'].includes(heldWeapon) ? firstLongSwordSocket : firstSwordSocket;
    gun.quaternion.copy(handRotation).multiply(heldKind === 'melee' ? firstMelee ? firstSocket : swordSocket : socketRotation);
    const gripRotation = gun.userData.weaponGripRotation;
    if (gripRotation?.isQuaternion) gun.quaternion.multiply(gripRotation);
    else if (Array.isArray(gripRotation)) gun.quaternion.multiply(quaternion().setFromEuler(new THREE.Euler(...gripRotation)));
    gun.scale.setScalar(.65);
    // Grip centre lies inside the curled fingers, left/forward of the wrist.
    palm.copy(rightHand.localToWorld(vector().set(-.014, .044, -.004)));
    if (gun.userData.weaponGrip) gripLocal.copy(gun.userData.weaponGrip);
    else gripLocal.set(0, weapon === 'automatic' ? -.15 : -.13, weapon === 'automatic' ? .065 : .08);
    gun.position.copy(palm).sub(gripLocal.clone().multiplyScalar(.65).applyQuaternion(gun.quaternion));
    if (player.cameraMode === 'first') {
      // Frame the original animated arms as a unit. Moving their common root
      // preserves every authored joint and keeps ADS readable on narrow screens.
      const firearm = heldKind === 'firearm';
      const desired = vector().set(Math.min(.14, camera.aspect * .11) * (1 - aimBlend), firearm ? -.24 + (weapon === 'automatic' ? .06 : .10) * aimBlend - recoil * .02 : -.31,
        firearm ? -.34 - .04 * aimBlend + recoil * .045 : -.43)
        .applyQuaternion(camera.quaternion).add(player.eyePosition);
      // Center only the idle hand anchor for sword/punches. Re-centering the
      // animated weapon each frame would erase the visible first-person swing.
      const anchor = firstMelee ? neutralPose.palm : heldKind === 'melee' ? swordPose.palm : punchPose.center;
      const shift = desired.sub(firearm ? gun.position : root.localToWorld(anchor.clone()));
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
  return { root, model, bones, meshes, mixer, clips, scale, update, updateWeapon, playShot, playAttack, setWeapon,
    setPreviewAnimation, weaponDiagnostics, animationState };
}

export async function loadPlayerAvatar(options, url) {
  return createAvatarFromGLTF(await new GLTFLoader().loadAsync(url), options);
}
