import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createAvatarFromGLTF } from '../../src/player/avatar.js';
import { loadAvatarGeometry } from './load-avatar.mjs';
import { prepareWeaponModel } from '../../src/gameplay/paintball/weapon-models.js';

const asset = new URL('../../public/models/sato.glb', import.meta.url);
test('player asset is the unmodified functional Sato version supplied by the user', async () => {
  const digest = createHash('sha256').update(await fs.readFile(asset)).digest('hex');
  assert.equal(digest, '96cb51b751f9664cc797bdf04c0d29196dbd8d671b8ba4f4085d439b54f50e20');
});
async function fixture() {
  const gltf = await loadAvatarGeometry(asset), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70);
  const player = {
    feet: new THREE.Vector3(), eyePosition: new THREE.Vector3(0, 1.7, 0), velocity: new THREE.Vector3(),
    active: true, grounded: true, cameraMode: 'third',
    get yaw() { return new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y; },
  };
  const avatar = createAvatarFromGLTF(gltf, { scene, camera, player });
  return { avatar, player, camera, scene, gun: new THREE.Group() };
}

test('neutral idle stays standing and both views reuse the same skinned arm meshes and materials', async () => {
  const { avatar, player } = await fixture();
  avatar.update(.016);
  assert.ok(avatar.bones['DEF-upper_armR'].getWorldPosition(new THREE.Vector3()).y > 1.15,
    'Idle_Loop must not select Crouch_Idle_Loop by a partial suffix');
  const meshes = [...avatar.meshes], materials = meshes.map(mesh => mesh.material);
  player.cameraMode = 'first'; avatar.update(.016);
  assert.equal(meshes.filter(mesh => mesh.visible).length, 2);
  assert.ok(meshes.filter(mesh => mesh.visible).every(mesh => /Sato_arm_hand_[LR]/.test(mesh.name)));
  player.cameraMode = 'third'; avatar.update(.016);
  assert.ok(meshes.every(mesh => mesh.visible));
  assert.deepEqual(avatar.meshes, meshes); assert.deepEqual(meshes.map(mesh => mesh.material), materials);
});

test('weapons follow the original hand socket through camera changes, shooting, yaw and extreme pitch', async () => {
  const { avatar, player, camera, gun } = await fixture();
  for (const mode of ['first', 'third']) for (const weapon of ['pistol', 'automatic']) {
    for (const pitch of [-1.48, -.7, 0, .7, 1.48]) for (const yaw of [0, 1.3, -2]) {
      player.cameraMode = mode; camera.rotation.set(pitch, yaw, 0, 'YXZ');
      avatar.update(.016); avatar.updateWeapon(gun, { weapon, aimBlend: .8, recoil: .6, active: true });
      assert.ok(avatar.weaponDiagnostics.gripError < .003, `${mode}/${weapon}/${pitch}/${yaw}: detached weapon`);
      const position = gun.position.clone();
      avatar.updateWeapon(gun, { weapon, aimBlend: .8, recoil: .6, active: true });
      assert.ok(gun.position.distanceTo(position) < .00001, 'same-frame shot updates must not drift the shared arm root');
      for (const side of ['R', 'L']) assert.ok([...avatar.bones[`DEF-hand${side}`].matrixWorld.elements].every(Number.isFinite));
    }
  }
});

test('neutral wrist and finger articulation comes directly from the supplied animation', async () => {
  const { avatar } = await fixture();
  avatar.update(0);
  const clip = avatar.clips.find(clip => clip.name === 'Rig|Pistol_Aim_Neutral');
  for (const name of ['DEF-handR', 'DEF-handL', 'DEF-f_middle01R', 'DEF-thumb01L']) {
    const track = clip.tracks.find(track => track.name === `${name}.quaternion`);
    const authored = new THREE.Quaternion().fromArray(track.createInterpolant().evaluate(0));
    assert.ok(avatar.bones[name].quaternion.angleTo(authored) < .001, `${name}: authored pose was overwritten`);
  }
  avatar.playShot();
  for (let frame = 0; frame < 16; frame++) avatar.update(.05);
  const restored = clip.tracks.find(track => track.name === 'DEF-handR.quaternion');
  assert.ok(avatar.bones['DEF-handR'].quaternion.angleTo(new THREE.Quaternion().fromArray(restored.createInterpolant().evaluate(0))) < .001,
    'the original grip resumes when the shot finishes');
});

test('third-person aim tracks camera pitch and shooting retains the selected aim pose', async () => {
  const { avatar, camera, gun } = await fixture();
  const forward = () => new THREE.Vector3(0, 0, -1).applyQuaternion(gun.quaternion);
  for (const pitch of [-1.1, -.55, 0, .55, 1.1]) {
    camera.rotation.set(pitch, 0, 0, 'YXZ'); avatar.update(0); avatar.updateWeapon(gun);
    const aimed = forward(), expected = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    assert.ok(aimed.angleTo(expected) < .13, `camera pitch ${pitch}: barrel misses the aimed direction`);
    avatar.playShot();
    for (let frame = 0; frame < 16; frame++) {
      avatar.update(.05); avatar.updateWeapon(gun);
      assert.ok(forward().angleTo(aimed) < .35, `camera pitch ${pitch}: shooting resets the aimed pose`);
    }
  }
});

test('locomotion and held repeated fire never turn the weapon sideways', async () => {
  const { avatar, player, camera, gun } = await fixture();
  camera.rotation.set(.3, .65, 0, 'YXZ');
  for (const mode of ['first', 'third']) for (const speed of [3.1, 4.6, 9.5]) for (const side of [-1, 1]) {
    player.cameraMode = mode; player.velocity.set(speed * side, 0, 0);
    for (let frame = 0; frame < 90; frame++) {
      if (frame % 8 === 0) avatar.playShot();
      avatar.update(.016); avatar.updateWeapon(gun, { active: true });
      const frameRotation = mode === 'first' ? camera.quaternion.clone() : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
      const relative = new THREE.Euler().setFromQuaternion(frameRotation.invert().multiply(gun.quaternion), 'YXZ');
      assert.ok(Math.abs(relative.y) < .00001 && Math.abs(relative.z) < .00001, `${mode}/${speed}: strafe or recoil introduced sideways aim`);
    }
  }
});

test('first-person Quaternius framing hides shoulder cuts and leaves the reticle clear during recoil', async () => {
  const { avatar, camera, player, gun } = await fixture();
  player.cameraMode = 'first'; camera.position.copy(player.eyePosition);
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3();
  for (const [weapon, file] of [['pistol', 'pistol-quaternius'], ['automatic', 'assault-rifle-quaternius']]) {
    const loaded = prepareWeaponModel(await loadAvatarGeometry(new URL(`../../public/models/${file}.glb`, import.meta.url)), weapon);
    gun.clear(); gun.add(loaded.model); gun.userData.weaponGrip = loaded.grip;
    for (const aspect of [390 / 844, 1.6, 844 / 390]) for (const aimBlend of [0, 1]) for (const pitch of [-1, 0, 1]) {
      camera.aspect = aspect; camera.fov = aimBlend ? 45 : 70;
      camera.rotation.set(pitch, .7, 0, 'YXZ'); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      avatar.update(0); avatar.updateWeapon(gun, { weapon, aimBlend }); avatar.playShot();
      for (let frame = 0; frame < 16; frame++) {
        avatar.update(.025); avatar.updateWeapon(gun, { weapon, aimBlend });
        camera.getWorldDirection(direction); ray.set(camera.position, direction);
        assert.equal(ray.intersectObject(gun, true).length, 0, `${weapon}/${aspect}/${aimBlend}: recoil obscures reticle`);
        for (const side of ['R', 'L']) {
          const shoulder = camera.worldToLocal(avatar.bones[`DEF-upper_arm${side}`].getWorldPosition(new THREE.Vector3()));
          assert.ok(shoulder.z > -camera.near, `${weapon}: shoulder cut enters the visible camera volume`);
        }
      }
    }
  }
});

test('supplied GLB preserves locomotion and pistol clips with bounded finite animated geometry', async () => {
  const { avatar } = await fixture();
  const required = ['Idle_Loop', 'Walk_Loop', 'Sprint_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Reload'];
  assert.ok(required.every(name => avatar.clips.some(clip => clip.name.split('|').at(-1) === name)));
  for (const name of required) {
    const clip = avatar.clips.find(clip => clip.name.split('|').at(-1) === name);
    for (const fraction of [0, .25, .5, .75]) {
      avatar.setPreviewAnimation(name, clip.duration * fraction);
      for (const mesh of avatar.meshes.filter(mesh => mesh.isSkinnedMesh)) {
        mesh.skeleton.update(); mesh.computeBoundingBox();
        const box = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        assert.ok([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite), `${name}/${fraction}/${mesh.name}`);
        assert.ok(box.getSize(new THREE.Vector3()).length() < 4, `${name}: exploding ${mesh.name}`);
      }
    }
  }
  avatar.setPreviewAnimation(null);
});
