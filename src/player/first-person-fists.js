import * as THREE from 'three';

const v = () => new THREE.Vector3();
const q = () => new THREE.Quaternion();

/** Frame the authored boxing motion on arms entering from below the camera.
 * A fixed camera-local mapping preserves the clips' advance/recovery instead
 * of clipping each wrist or dragging the shoulder along with the fist. */
export function createFirstPersonFists(root, bones) {
  const arms = ['R', 'L'].map(side => ({
    sign: side === 'R' ? 1 : -1,
    viewOffset: v().set(side === 'L' ? -.03 : 0, side === 'R' ? -.12 : -.065, -.30),
    upper: bones[`DEF-upper_arm${side}`], fore: bones[`DEF-forearm${side}`], hand: bones[`DEF-hand${side}`],
    position: v(), upperRotation: q(), foreRotation: q(), handRotation: q(),
    curls: ['index', 'middle', 'ring', 'pinky'].flatMap(finger => [1, 2, 3].map((joint, i) => ({
      bone: bones[`DEF-f_${finger}0${joint}${side}`], rotation: q(), angle: [.35, .45, .35][i],
    }))),
  }));
  let applied = false;
  function restore() {
    if (!applied) return;
    for (const arm of arms) {
      arm.upper.position.copy(arm.position); arm.upper.quaternion.copy(arm.upperRotation);
      arm.fore.quaternion.copy(arm.foreRotation); arm.hand.quaternion.copy(arm.handRotation);
      for (const curl of arm.curls) curl.bone.quaternion.copy(curl.rotation);
    }
    applied = false;
  }
  function aimBone(bone, child, target) {
    const origin = bone.getWorldPosition(v());
    const from = child.getWorldPosition(v()).sub(origin).normalize(), to = target.clone().sub(origin).normalize();
    const world = q().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(q()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(q()).invert().multiply(world));
    bone.updateWorldMatrix(false, true);
  }
  function frame(camera, eye, anchor, config) {
    const center = v().set(0, -.14, -.41).applyQuaternion(camera.quaternion).add(eye);
    root.position.add(center.clone().sub(root.localToWorld(anchor.clone())));
    root.updateMatrixWorld(true);
    const toWorld = point => point.applyQuaternion(camera.quaternion).add(eye);
    const toView = point => point.sub(eye).applyQuaternion(camera.quaternion.clone().invert());
    const horizontal = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    // Fit the entire punch envelope, not its current frame. In portrait the
    // lateral travel is narrower; depth and timing stay identical in both orientations.
    const viewScale = v().set(Math.min(.5, horizontal * .9), .6, .5);
    const framePoint = (bone, offset) => toView(bone.getWorldPosition(v())).multiply(viewScale).add(offset);
    for (const arm of arms) {
      const { upper, fore, hand, sign, viewOffset } = arm;
      arm.position.copy(upper.position); arm.upperRotation.copy(upper.quaternion);
      arm.foreRotation.copy(fore.quaternion); arm.handRotation.copy(hand.quaternion);
      for (const curl of arm.curls) curl.rotation.copy(curl.bone.quaternion);
      const wristRotation = hand.getWorldQuaternion(q());
      const upperLength = upper.getWorldPosition(v()).distanceTo(fore.getWorldPosition(v()));
      const foreLength = fore.getWorldPosition(v()).distanceTo(hand.getWorldPosition(v()));
      const wrist = framePoint(hand, viewOffset);
      // Keep the authored shoulder/torso motion independent of the wrist. The
      // elbow can then unfold on impact and bend again during the recovery.
      const shoulder = framePoint(upper, viewOffset).add(v().set(0, -.26, .16));
      const target = toWorld(wrist), start = toWorld(shoulder);
      upper.position.copy(upper.parent.worldToLocal(start.clone()));
      upper.updateWorldMatrix(false, true);
      const direction = target.clone().sub(start), distance = direction.length(); direction.normalize();
      const along = THREE.MathUtils.clamp((upperLength ** 2 + distance ** 2 - foreLength ** 2) / (2 * distance), 0, upperLength);
      const pole = v().set(sign, -1, 0).applyQuaternion(camera.quaternion);
      pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const elbow = start.clone().addScaledVector(direction, along)
        .addScaledVector(pole, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
      aimBone(upper, fore, elbow); aimBone(fore, hand, target);
      hand.quaternion.copy(hand.parent.getWorldQuaternion(q()).invert().multiply(wristRotation));
      for (const curl of arm.curls) curl.bone.quaternion.multiply(q().setFromAxisAngle(v().set(1, 0, 0), curl.angle));
      hand.updateWorldMatrix(false, true);
    }
    applied = true;
    // Apply training edits to the completed guard around its common camera-local
    // anchor, rather than feeding edits back into the framing constraints.
    const localCenter = root.worldToLocal(center.clone());
    root.quaternion.copy(camera.quaternion).multiply(q().setFromEuler(new THREE.Euler(
      ...['x', 'y', 'z'].map(axis => THREE.MathUtils.degToRad(config.rotation[axis])))));
    root.scale.multiply(v().set(config.scale.x, config.scale.y, config.scale.z));
    root.updateMatrixWorld(true);
    root.position.add(center.sub(root.localToWorld(localCenter)))
      .add(v().set(config.position.x, config.position.y, config.position.z).applyQuaternion(camera.quaternion));
    root.updateMatrixWorld(true);
  }
  return { restore, frame };
}
