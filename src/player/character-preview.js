import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createStyler } from '../core/index.js';

/** A small independent stage: render only while the character panel is visible. */
export function createCharacterPreview(source, container) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#111e2a');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Prévia 3D do personagem. Arraste para girar; use scroll ou pinça para zoom.');
  container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 20); camera.position.set(.45, 1.2, -3.65);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, .84, 0); controls.enablePan = false; controls.enableDamping = true;
  controls.minDistance = 1.2; controls.maxDistance = 6; controls.minPolarAngle = .25; controls.maxPolarAngle = Math.PI * .56;
  controls.update();
  const hemi = new THREE.HemisphereLight('#e4efff', '#8391a0', 2); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0da', 2.8); key.position.set(-3, 5, -4); scene.add(key);
  const rim = new THREE.DirectionalLight('#719bcf', 1.5); rim.position.set(3, 2, 3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(.58, .64, .08, 48), new THREE.MeshStandardMaterial({ color: '#263d50' }));
  floor.position.y = -.05; scene.add(floor);
  const player = { feet: new THREE.Vector3(), eyePosition: new THREE.Vector3(0, 1.7, 0), velocity: new THREE.Vector3(),
    active: true, grounded: true, fly: false, crouched: false, cameraMode: 'third', yaw: 0 };
  const avatar = source.cloneForPreview({ scene, camera, player }); avatar.setWeapon({ holstered: true }); avatar.update(0);
  const styler = createStyler(scene, renderer, hemi); styler.collect(); styler.setCartoon(true);
  let frame = null, previous = 0;
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(container);
  function draw(now) {
    avatar.update(Math.min(.05, (now - previous) / 1000)); previous = now;
    controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(draw);
  }
  return {
    show(value) {
      avatar.appearance.apply(value); avatar.update(0); controls.enabled = true; resize();
      if (frame === null) { previous = performance.now(); frame = requestAnimationFrame(draw); }
    },
    stop() { if (frame !== null) cancelAnimationFrame(frame); frame = null; controls.enabled = false; },
  };
}
