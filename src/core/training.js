import * as THREE from 'three';

/** A separate, flat space for checking the avatar, cameras and paintball. */
export function createTraining(game) {
  const { scene, camera, sky } = game.engine;
  const spawn = { x: 10000, z: 10000, yaw: 0 };
  const extent = 140;
  const bounds = { x0: spawn.x - extent, x1: spawn.x + extent, z0: spawn.z - extent, z1: spawn.z + extent };
  // Capture only the city. Player/weapon roots are added after this module.
  const world = scene.children.filter(object => object !== sky && !object.isLight && object !== game.engine.sun.target);
  const texture = new THREE.DataTexture(new Uint8Array([
    123, 134, 145, 255, 156, 166, 176, 255,
    156, 166, 176, 255, 123, 134, 145, 255,
  ]), 2, 2, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(256, 256); // each square is 2 metres
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1024, 1024), new THREE.MeshStandardMaterial({ map: texture, roughness: .95 }));
  floor.name = 'Training checker floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(spawn.x, 0, spawn.z);
  floor.receiveShadow = true;
  floor.visible = false;
  scene.add(floor);

  let active = false, saved = null;
  const terrain = { heightAt: () => 0, bounds };
  function start() {
    if (active) return;
    saved = {
      visibility: world.map(object => object.visible), sky: sky.visible,
      background: scene.background, fog: scene.fog,
      feet: game.player.feet.clone(), yaw: game.player.yaw,
      cameraPosition: camera.position.clone(), cameraRotation: camera.quaternion.clone(),
    };
    active = true;
    world.forEach(object => { object.visible = false; });
    sky.visible = false;
    floor.visible = true;
    scene.background = new THREE.Color(0xc8d3df);
    scene.fog = new THREE.Fog(0xc8d3df, 45, 180);
    game.player.placeAt(spawn.x, spawn.z, spawn.yaw);
  }
  function stop() {
    if (!active) return;
    active = false;
    floor.visible = false;
    world.forEach((object, index) => { object.visible = saved.visibility[index]; });
    sky.visible = saved.sky;
    scene.background = saved.background;
    scene.fog = saved.fog;
    game.player.placeAt(saved.feet.x, saved.feet.z, saved.yaw);
    game.player.feet.copy(saved.feet);
    camera.position.copy(saved.cameraPosition);
    camera.quaternion.copy(saved.cameraRotation);
    saved = null;
  }
  return {
    start, stop, spawn, terrain, bounds, floor,
    get active() { return active; },
    // No city surfaces or roofs participate in this space.
    surfaceHeightAt: () => -Infinity,
    roofAt: () => -Infinity,
    collide(x, z, radius = 0) {
      return [THREE.MathUtils.clamp(x, bounds.x0 + radius, bounds.x1 - radius), THREE.MathUtils.clamp(z, bounds.z0 + radius, bounds.z1 - radius)];
    },
  };
}
