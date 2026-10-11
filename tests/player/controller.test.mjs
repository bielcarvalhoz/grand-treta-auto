import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlayer} from '../../src/player/controller.js';
import { GAITS } from '../../src/player/locomotion.js';

function controllerFixture(collide = (x, z) => [x, z]) {
  const originals = Object.fromEntries(['window', 'document', 'innerWidth', 'innerHeight'].map(key => [key, globalThis[key]]));
  globalThis.window = new EventTarget(); globalThis.document = new EventTarget(); globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  const dom = new EventTarget(); dom.ownerDocument = document; dom.getBoundingClientRect = () => ({ left: 0, width: 390 });
  const camera = new THREE.PerspectiveCamera(70);
  const player = createPlayer(camera, dom, { terrain: { heightAt: () => 0 }, bounds: { x0: -100, x1: 100, z0: -100, z1: 100 },
    collide, bridgeHeightAt: () => -Infinity, roofAt: () => -Infinity });
  const send = (type, id, x, y) => {
    const event = new Event(type, { cancelable: true }); Object.assign(event, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y }); dom.dispatchEvent(event);
  };
  player.placeAt(0, 0); player.start(true);
  return { player, camera, send, restore() { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

test('mobile movement stays analog, sprints at full forward, slows/focuses for aim and can jump', () => {
  const originals=Object.fromEntries(['window','document','innerWidth','innerHeight'].map(k=>[k,globalThis[k]]));
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();globalThis.innerWidth=390;globalThis.innerHeight=844;
  try {
    const dom=new EventTarget();dom.ownerDocument=document;dom.getBoundingClientRect=()=>({left:0,width:390});
    const camera=new THREE.PerspectiveCamera(70),player=createPlayer(camera,dom,{terrain:{heightAt:()=>0},bounds:{x0:-100,x1:100,z0:-100,z1:100},collide:(x,z)=>[x,z],bridgeHeightAt:()=>-Infinity,roofAt:()=>-Infinity});
    const send=(type,id,x,y)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerType:'touch',pointerId:id,clientX:x,clientY:y});dom.dispatchEvent(e);};
    player.placeAt(0,0);player.start(true);player.update(.016);
    send('pointerdown',1,60,600);send('pointermove',1,60,574);player.update(.05);const analog=Math.abs(player.feet.z);
    player.placeAt(0,0);send('pointermove',1,60,548);player.update(.05);const sprint=Math.abs(player.feet.z);assert.ok(sprint>analog*2);
    player.placeAt(0,0);player.setFocusedAim(true);player.update(.05);const aimed=Math.abs(player.feet.z);assert.ok(aimed<sprint/2);
    send('pointerup',1,60,548);send('pointerdown',2,280,400);const yaw=player.yaw;
    send('pointermove',2,300,400);const focusedTurn=player.yaw-yaw;player.setFocusedAim(false);
    send('pointermove',2,320,400);const regularTurn=player.yaw-yaw-focusedTurn;assert.ok(Math.abs(focusedTurn/regularTurn-.52)<1e-8);
    assert.equal(player.jump(),true);player.update(.05);assert.ok(player.feet.y>0);assert.equal(player.jump(),false);
    player.stop();assert.equal(player.active,false);
  } finally {for(const[k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('analog intensity continuously controls speed in every direction without Shift', () => {
  const { player, send, restore } = controllerFixture();
  try {
    send('pointerdown', 1, 60, 600);
    for (const [x, y] of [[0, -1], [0, 1], [1, 0], [-1, 0], [Math.SQRT1_2, -Math.SQRT1_2]]) {
      let previous = 0;
      for (const magnitude of [.25, .5, .75, 1]) {
        const radius = (magnitude * .88 + .12) * 52;
        player.placeAt(0, 0); send('pointermove', 1, 60 + x * radius, 600 + y * radius); player.update(.05);
        const speed = Math.hypot(player.velocity.x, player.velocity.z);
        assert.ok(Math.abs(speed - 9.5 * magnitude) < 1e-8, `${x},${y}: strength ${magnitude} is not proportional`);
        assert.ok(speed > previous); previous = speed;
      }
    }
  } finally { restore(); }
});

test('footsteps follow ground distance, stop against walls or in air, and jump/landing fire once', () => {
  let blocked = false;
  const { player, send, restore } = controllerFixture((x, z) => blocked ? [0, 0] : [x, z]);
  try {
    let steps = 0, jumps = 0, lands = 0;
    player.events.addEventListener('footstep', event => { assert.ok(event.detail.speed > 0); assert.ok(event.detail.position.isVector3); steps++; });
    player.events.addEventListener('jump', () => jumps++); player.events.addEventListener('land', () => lands++);
    send('pointerdown', 1, 60, 600); send('pointermove', 1, 60, 548);
    for (let i = 0; i < 20; i++) player.update(.05);
    assert.ok(steps >= 3);
    const completed = Math.floor(player.locomotion.phase), fraction = player.locomotion.phase % 1;
    assert.equal(steps, completed * 2 + GAITS.run.contacts.filter(contact => contact <= fraction).length);
    player.placeAt(0, 0); blocked = true; const beforeWall = steps;
    for (let i = 0; i < 20; i++) player.update(.05);
    assert.equal(steps, beforeWall, 'pushing into a wall must not make footsteps');
    assert.equal(player.jump(), true); assert.equal(player.jump(), false); const beforeAir = steps;
    for (let i = 0; i < 10; i++) player.update(.05);
    assert.equal(steps, beforeAir, 'airborne movement must not make footsteps');
    for (let i = 0; i < 30; i++) player.update(.05);
    assert.equal(jumps, 1); assert.equal(lands, 1);
  } finally { restore(); }
});

test('weapon wheel keeps joystick selection alive while suppressing movement and look', () => {
  const { player, send, restore } = controllerFixture();
  try {
    let joystick = null; player.events.addEventListener('joystick', event => { joystick = event.detail; });
    send('pointerdown', 1, 60, 600); send('pointerdown', 2, 300, 400);
    player.setWeaponWheelOpen(true); const yaw = player.yaw;
    send('pointermove', 1, 112, 600); send('pointermove', 2, 340, 400); player.update(.05);
    assert.ok(joystick.active && joystick.x > .99);
    assert.equal(player.feet.length(), 0); assert.equal(player.yaw, yaw); assert.equal(player.jump(), false);
    player.setWeaponWheelOpen(false); player.update(.05); send('pointermove', 2, 360, 400);
    assert.ok(player.feet.x > .4); assert.notEqual(player.yaw, yaw);
  } finally { restore(); }
});

test('crouch lowers the eyes without moving the feet and caps analog or Shift movement at a crouch walk', () => {
  const { player, camera, send, restore } = controllerFixture();
  try {
    player.setCameraMode('first'); let changes = 0;
    player.events.addEventListener('crouch', () => changes++);
    assert.equal(player.toggleCrouch(), true); assert.equal(changes, 1);
    assert.equal(player.feet.y, 0); assert.equal(player.eyePosition.y, 1.1); assert.equal(camera.position.y, 1.1);
    player.update(.05); assert.equal(player.locomotion.gait, 'crouchIdle');
    send('pointerdown', 1, 60, 600); send('pointermove', 1, 60, 548);
    const shift = new Event('keydown'); Object.assign(shift, { code: 'ShiftLeft' }); window.dispatchEvent(shift);
    player.update(.05); assert.ok(Math.abs(player.velocity.z + 1.6) < 1e-8); assert.equal(player.locomotion.gait, 'crouch');
    player.setFocusedAim(true); player.update(.05); assert.ok(Math.abs(player.velocity.z + 1.6) < 1e-8);
    assert.equal(player.toggleCrouch(), false); assert.equal(changes, 2); assert.equal(player.eyePosition.y, 1.7);
    player.setCrouched(true); player.placeAt(3, 4); assert.equal(player.crouched, false);
  } finally { restore(); }
});

test('both flight controls leave crouch and block crouching until flight ends', () => {
  const { player, restore } = controllerFixture();
  try {
    const flying = []; player.events.addEventListener('fly', event => flying.push(event.detail.flying));
    player.setCrouched(true); player.toggleAutoFly();
    assert.equal(player.fly, true); assert.equal(player.crouched, false); assert.equal(player.toggleCrouch(), false);
    player.toggleAutoFly(); assert.equal(player.toggleCrouch(), true);
    const key = new Event('keydown'); Object.assign(key, { code: 'KeyF' }); window.dispatchEvent(key);
    assert.equal(player.fly, true); assert.equal(player.crouched, false);
    window.dispatchEvent(key); assert.equal(player.fly, false);
    assert.deepEqual(flying, [true, false, true, false]);
    player.setWeaponWheelOpen(true); assert.equal(player.toggleCrouch(), false);
    player.setWeaponWheelOpen(false); player.stop(); assert.equal(player.toggleCrouch(), false);
  } finally { restore(); }
});
