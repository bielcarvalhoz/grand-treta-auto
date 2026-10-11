import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createTouchControls } from './touch-controls.js';
import { GAITS, gaitForSpeed } from './locomotion.js';

// Primeira pessoa.
//  Teclado/mouse: WASD + mouse, Shift corre, Espaço pula, F alterna voo livre.
//  Toque (celular, qualquer orientação): analógico esquerdo = andar, direita = olhar;
//  botão de tiro permite arrastar a mira enquanto dispara; voo pelo botão ↟.

const EYE = 1.7;
const CROUCH_EYE = 1.1;
const CROUCH_SPEED = 1.6;
const RADIUS = 0.35;
const GRAVITY = 22;
const STEP_UP = 0.7;
const TOUCH_FLY_SPEED = 16; // m/s

export function createPlayer(camera, dom, { terrain, collide, bridgeHeightAt, roofAt, bounds, allowFlight = () => true }) {
  const controls = new PointerLockControls(camera, dom);
  const keys = new Set();
  const feet = new THREE.Vector3();
  const eyePosition = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let cameraMode = 'third';
  let vy = 0;
  let onGround = false;
  let fly = false; // voo livre do teclado (F)
  let autoFly = false; // voo direcional pelo botão do celular
  let flySpeed = 0;
  let focusedAim = false;
  let crouched = false;
  let weaponWheelOpen = false;
  const locomotion = { speed: 0, distance: 0, totalDistance: 0, phase: 0, gait: 'idle', foot: 0 };

  // Estado "jogando": pointer lock, modo arrastar (pointer lock bloqueado) ou modo toque
  const events = new EventTarget();
  let active = false;
  let mode = 'mouse'; // 'mouse' | 'drag' | 'touch'
  const setActive = (v) => {
    if (active === v) return;
    active = v;
    if (!v) { keys.clear(); touchControls.reset(); focusedAim = weaponWheelOpen = false; controls.pointerSpeed = 1; }
    events.dispatchEvent(new CustomEvent(v ? 'lock' : 'unlock', { detail: { dragMode: mode === 'drag', touch: mode === 'touch' } }));
  };
  controls.addEventListener('lock', () => { mode = 'mouse'; setActive(true); });
  controls.addEventListener('unlock', () => { if (mode === 'mouse') setActive(false); });
  const enableDragMode = () => { if (!controls.isLocked && mode !== 'touch') { mode = 'drag'; setActive(true); } };
  document.addEventListener('pointerlockerror', enableDragMode);

  /** touch = true quando o jogo foi iniciado por toque (celular/tablet) */
  function start(touch = false) {
    if (touch) {
      mode = 'touch';
      setActive(true);
      return;
    }
    mode = 'mouse';
    try {
      const p = dom.requestPointerLock();
      if (p && p.catch) p.catch(enableDragMode);
    } catch { enableDragMode(); return; }
    // alguns ambientes ignoram o pedido em silêncio
    setTimeout(() => { if (!controls.isLocked && !active) enableDragMode(); }, 700);
  }
  function stop() {
    setActive(false);
    dragging = false;
    if (controls.isLocked) controls.unlock();
  }

  // ---------------------------------------------------------------- olhar arrastando
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const look = (dx, dy, k) => {
    if (weaponWheelOpen) return;
    euler.setFromQuaternion(camera.quaternion);
    const scale = focusedAim ? .52 : 1;
    euler.y -= dx * k * scale;
    euler.x = Math.max(-1.5, Math.min(1.5, euler.x - dy * k * scale));
    camera.quaternion.setFromEuler(euler);
  };
  let dragging = false;
  let stickX = 0, stickY = 0;
  const touchControls = createTouchControls(dom, {
    isActive: () => active && mode === 'touch', onLook: look,
    onStick(state) {
      stickX = state.x; stickY = state.y;
      events.dispatchEvent(new CustomEvent('joystick', { detail: state }));
    },
  });
  dom.addEventListener('pointerdown', (e) => {
    if (!active) return;
    if (e.pointerType !== 'touch' && mode === 'drag') dragging = true;
  });
  window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerType === 'touch') return;
    look(e.movementX, e.movementY, 0.004);
  });

  function toggleAutoFly() {
    if (!allowFlight()) return false;
    setCrouched(false);
    autoFly = !autoFly;
    fly = false;
    vy = 0;
    flySpeed = 0;
    events.dispatchEvent(new CustomEvent('fly', { detail: { flying: autoFly } }));
  }

  function setCrouched(value) {
    const next = !!value;
    if (next && (!active || weaponWheelOpen || fly || autoFly)) return crouched;
    if (next !== crouched) {
      crouched = next; updateCamera();
      events.dispatchEvent(new CustomEvent('crouch', { detail: { crouched } }));
    }
    return crouched;
  }

  function jump() {
    if (!active || weaponWheelOpen || fly || autoFly || !onGround) return false;
    vy = 7; onGround = false;
    events.dispatchEvent(new CustomEvent('jump', { detail: { position: feet.clone() } }));
    return true;
  }

  // ---------------------------------------------------------------- teclado
  const onKey = (e, down) => {
    if (down) keys.add(e.code); else keys.delete(e.code);
    if (down && e.code === 'Space') jump();
    if (down && !e.repeat && e.code === 'KeyF' && allowFlight()) {
      setCrouched(false); fly = !fly; autoFly = false; vy = 0;
      events.dispatchEvent(new CustomEvent('fly', { detail: { flying: fly } }));
    }
  };
  window.addEventListener('keydown', (e) => {
    if (e.target?.closest?.('button, input, select, textarea, [contenteditable=true]')) return;
    if (mode === 'drag' && active && e.code === 'Escape') { setActive(false); return; }
    if (active) { onKey(e, true); if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });

  function groundAt(x, z, fromY) {
    let g = terrain.heightAt(x, z);
    const b = bridgeHeightAt(x, z, fromY + STEP_UP);
    if (b > g) g = b;
    const r = roofAt(x, z, fromY + 0.05);
    if (r > g) g = r;
    return g;
  }

  function placeAt(x, z, yaw = 0) {
    feet.set(x, terrain.heightAt(x, z), z);
    feet.y = groundAt(x, z, feet.y + 100);
    if (feet.y > terrain.heightAt(x, z) + 3) feet.y = terrain.heightAt(x, z); // não nascer em telhado
    vy = 0;
    autoFly = fly = false;
    setCrouched(false);
    velocity.set(0, 0, 0);
    onGround = true;
    Object.assign(locomotion, { speed: 0, distance: 0, totalDistance: 0, phase: 0, gait: 'idle', foot: 0 });
    camera.rotation.set(0, yaw, 0, 'YXZ');
    updateCamera();
  }

  // Sweep a small camera volume from the eyes to the shoulder view. This uses
  // the same obstacle and terrain queries as movement, including training mode.
  const cameraOffset = new THREE.Vector3(), sample = new THREE.Vector3();
  function updateCamera() {
    eyePosition.copy(feet).y += crouched ? CROUCH_EYE : EYE;
    camera.position.copy(eyePosition);
    if (cameraMode === 'first') return;
    cameraOffset.set(.48, .12, focusedAim ? 2.05 : 3.15).applyQuaternion(camera.quaternion);
    const steps = Math.ceil(cameraOffset.length() / .12);
    let clear = 0;
    for (let i = 1; i <= steps; i++) {
      sample.copy(eyePosition).addScaledVector(cameraOffset, i / steps);
      const [x, z] = collide(sample.x, sample.z, .18, sample.y - .18, { push: false });
      if (Math.hypot(x - sample.x, z - sample.z) > .015 || sample.y < terrain.heightAt(sample.x, sample.z) + .2) break;
      clear = i / steps;
    }
    camera.position.addScaledVector(cameraOffset, clear);
  }

  function setCameraMode(value) {
    if (value !== 'first' && value !== 'third') return cameraMode;
    cameraMode = value;
    updateCamera();
    events.dispatchEvent(new CustomEvent('cameramode', { detail: { mode: value } }));
    return cameraMode;
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();

  function update(dt) {
    if (!active) { velocity.set(0, 0, 0); locomotion.speed = locomotion.distance = 0; locomotion.gait = 'idle'; return; }
    dt = Math.min(dt, 0.05);
    const before = feet.clone();
    const wasGrounded = onGround, fallSpeed = Math.max(0, -vy);
    const run = !focusedAim && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const keyboardMove = ['KeyW', 'KeyS', 'KeyD', 'KeyA', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(key => keys.has(key));
    // Every stick direction has the same continuous walk-to-run range. Shift
    // remains a keyboard modifier and does not change analog thumb strength.
    const analog = !keyboardMove && Math.hypot(stickX, stickY) > 0;
    const flying = fly || autoFly;
    const speed = fly ? (run ? 90 : 28) : crouched ? CROUCH_SPEED : focusedAim ? 3.1 : analog || run ? 9.5 : 4.6;

    camera.getWorldDirection(fwd);
    move.set(0, 0, 0);
    if (weaponWheelOpen) {
      // Keep the gesture alive for radial selection while movement is paused.
    } else if (autoFly) {
      // voa para onde a câmera aponta (inclusive para cima/baixo)
      flySpeed += (TOUCH_FLY_SPEED - flySpeed) * Math.min(1, dt * 2.5);
      move.copy(fwd).multiplyScalar(flySpeed * dt);
    } else {
      if (!fly) { fwd.y = 0; fwd.normalize(); }
      right.crossVectors(fwd, camera.up).normalize();
      if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(fwd);
      if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(fwd);
      if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
      move.addScaledVector(fwd, stickY).addScaledVector(right, stickX);
      if (move.lengthSq() > 1) move.normalize();
      move.multiplyScalar(speed * dt);
      if (fly) {
        if (keys.has('KeyE') || keys.has('Space')) move.y += speed * dt;
        if (keys.has('ControlLeft') || keys.has('ControlRight')) move.y -= speed * dt;
      }
    }

    if (flying) {
      feet.y += move.y;
      const wantX = feet.x + move.x, wantZ = feet.z + move.z;
      const [nx, nz] = collide(wantX, wantZ, RADIUS, feet.y); // não atravessa prédios e muros
      // bloqueado por muro/prédio: sobe por cima dele em vez de ficar preso
      const want = Math.hypot(move.x, move.z), got = Math.hypot(nx - feet.x, nz - feet.z);
      if (want > 1e-4 && got < want * 0.6) feet.y += Math.max(want, (autoFly ? flySpeed : speed) * dt) * 0.9;
      feet.x = nx; feet.z = nz;
      const g = groundAt(feet.x, feet.z, feet.y);
      if (feet.y < g) feet.y = g; // desliza sobre o chão e os telhados
      onGround = false;
    } else {
      let nx = feet.x + move.x, nz = feet.z + move.z;
      [nx, nz] = collide(nx, nz, RADIUS, feet.y);
      feet.x = nx; feet.z = nz;
      vy -= GRAVITY * dt;
      feet.y += vy * dt;
      const g = groundAt(feet.x, feet.z, feet.y);
      if (feet.y <= g) {
        feet.y = g;
        vy = 0;
        onGround = true;
      } else if (feet.y - g < 0.25 && vy <= 0) {
        feet.y = g; vy = 0; onGround = true; // gruda em descidas
      } else onGround = false;
    }

    // não sair do mapa nem subir demais
    const m = 3;
    const limits = typeof bounds === 'function' ? bounds() : bounds;
    feet.x = Math.min(limits.x1 - m, Math.max(limits.x0 + m, feet.x));
    feet.z = Math.min(limits.z1 - m, Math.max(limits.z0 + m, feet.z));
    feet.y = Math.min(feet.y, terrain.heightAt(feet.x, feet.z) + 400);

    velocity.copy(feet).sub(before).divideScalar(Math.max(dt, 1e-6));
    locomotion.speed = Math.hypot(velocity.x, velocity.z);
    locomotion.distance = onGround && wasGrounded && !flying ? Math.hypot(feet.x - before.x, feet.z - before.z) : 0;
    locomotion.gait = gaitForSpeed(locomotion.speed, crouched && !flying);
    if (locomotion.distance > .00001 && GAITS[locomotion.gait].speed) {
      const gait = GAITS[locomotion.gait], previousPhase = locomotion.phase;
      locomotion.totalDistance += locomotion.distance;
      locomotion.phase += locomotion.distance / (gait.speed * gait.duration);
      for (let cycle = Math.floor(previousPhase); cycle <= Math.floor(locomotion.phase); cycle++) for (let foot = 0; foot < 2; foot++) {
        const contact = cycle + gait.contacts[foot];
        if (contact <= previousPhase || contact > locomotion.phase) continue;
        locomotion.foot = foot;
        events.dispatchEvent(new CustomEvent('footstep', { detail: { foot: locomotion.foot, speed: locomotion.speed,
          distance: locomotion.totalDistance, position: feet.clone() } }));
      }
    }
    if (!wasGrounded && onGround && !flying && fallSpeed > 1) {
      events.dispatchEvent(new CustomEvent('land', { detail: { speed: fallSpeed, position: feet.clone() } }));
    }
    updateCamera();
  }

  return {
    events,
    start,
    stop,
    update,
    placeAt,
    feet,
    eyePosition,
    velocity,
    locomotion,
    updateCamera,
    setCameraMode,
    toggleCameraMode: () => setCameraMode(cameraMode === 'first' ? 'third' : 'first'),
    getShotOrigin: target => target.copy(eyePosition),
    toggleAutoFly,
    setCrouched,
    toggleCrouch: () => setCrouched(!crouched),
    jump,
    setFocusedAim(value) { focusedAim = active && !!value; controls.pointerSpeed = weaponWheelOpen ? 0 : focusedAim ? .52 : 1; },
    setWeaponWheelOpen(value) { weaponWheelOpen = active && !!value; controls.pointerSpeed = weaponWheelOpen ? 0 : focusedAim ? .52 : 1; dragging = false; },
    bindFireButton: touchControls.bindFireButton,
    releasePointerForUI() {
      keys.clear(); dragging = false; touchControls.reset();
      if (controls.isLocked) { mode = 'drag'; controls.unlock(); }
    },
    get active() { return active; },
    get dragMode() { return mode === 'drag'; },
    get touchMode() { return mode === 'touch'; },
    get fly() { return fly || autoFly; },
    get grounded() { return onGround; },
    get crouched() { return crouched; },
    get weaponWheelOpen() { return weaponWheelOpen; },
    get cameraMode() { return cameraMode; },
    get yaw() { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); return e.y; },
  };
}
