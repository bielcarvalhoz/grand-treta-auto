import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { setupVisualStyle } from '../../src/core/visual.js';

test('visual style leaves V to paint and never changes renderer resolution', () => {
  const bindings = new Map(); let resolutionChanges = 0;
  const styler = setupVisualStyle({
    engine: { scene: new THREE.Scene(), hemi: { intensity: .25 }, renderer: {
      getPixelRatio: () => 1.5, setPixelRatio: () => resolutionChanges++, setSize() {}, domElement: { style: {} },
    } },
    input: { bind: (code, handler) => bindings.set(code, handler) }, toast() {},
  });
  assert.equal(bindings.has('KeyV'), false); assert.equal(styler.setPixel, undefined);
  assert.equal(styler.cartoon, true); bindings.get('KeyT')(); assert.equal(styler.cartoon, false);
  assert.equal(resolutionChanges, 0);
});
