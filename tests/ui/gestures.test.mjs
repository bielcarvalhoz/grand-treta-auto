import test from 'node:test';
import assert from 'node:assert/strict';
import { installGestureGuard } from '../../src/ui/gestures.js';

test('native zoom, callouts and selection are blocked without consuming action clicks or application pointer gestures', () => {
  const target = new EventTarget(); installGestureGuard(target);
  for (const type of ['gesturestart','gesturechange','gestureend','selectstart','contextmenu']) {
    const event = new Event(type,{cancelable:true}); target.dispatchEvent(event); assert.equal(event.defaultPrevented,true);
  }
  for (const type of ['pointerdown','pointermove','pointerup','click','touchstart','touchmove']) {
    const event = new Event(type,{cancelable:true}); target.dispatchEvent(event); assert.equal(event.defaultPrevented,false);
  }
});

test('additional touch HUD actions activate once and consume delayed/retargeted clicks', () => {
  const target = new EventTarget(); installGestureGuard(target);
  let activations = 0;
  const button = {isConnected:true,disabled:false,closest:()=>button,click:()=>{activations++;}};
  const send = (type, id, x, y, detail=0) => {
    const event = new Event(type,{cancelable:true});
    Object.assign(event,{pointerId:id,pointerType:type === 'click' && detail === 0 ? '' : 'touch',clientX:x,clientY:y,detail});
    Object.defineProperty(event,'target',{value:button});target.dispatchEvent(event);return event;
  };
  send('pointerdown',2,100,100);send('pointerup',2,100,100);assert.equal(activations,1);
  assert.equal(send('click',2,100,100,1).defaultPrevented,true);assert.equal(activations,1);
  assert.equal(send('click',2,100,100,0).defaultPrevented,false,'keyboard activation remains available');
  send('pointerdown',3,100,100);send('pointermove',3,130,100);send('pointerup',3,130,100);assert.equal(activations,1);
  send('pointerdown',4,100,100);send('pointercancel',4,100,100);send('pointerup',4,100,100);assert.equal(activations,1);
});

test('rapid button taps and native pinch cannot zoom the page or duplicate an action', () => {
  const target = new EventTarget(); installGestureGuard(target); let activations = 0;
  const button = { isConnected: true, disabled: false, closest: () => button, click: () => activations++ };
  const send = (type, values = {}) => {
    const event = new Event(type, { cancelable: true }); Object.assign(event, values);
    Object.defineProperty(event, 'target', { value: button }); target.dispatchEvent(event); return event;
  };
  for (let i = 0; i < 4; i++) {
    const point = { pointerId: i, pointerType: 'touch', clientX: 100, clientY: 100 };
    send('pointerdown', point); send('pointerup', point);
    assert.equal(send('touchend', { changedTouches: [{ clientX: 100, clientY: 100 }] }).defaultPrevented, true);
    assert.equal(send('click', { ...point, detail: 1 }).defaultPrevented, true);
    assert.equal(send('click', { ...point, detail: 1 }).defaultPrevented, true);
  }
  assert.equal(activations, 4);
  for (const type of ['touchstart', 'touchmove']) {
    assert.equal(send(type, { touches: [{}, {}] }).defaultPrevented, true);
  }
  assert.equal(send('dblclick').defaultPrevented, true);
});
