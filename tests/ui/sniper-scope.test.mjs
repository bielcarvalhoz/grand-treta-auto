import test from 'node:test';
import assert from 'node:assert/strict';
import { createSniperScope } from '../../src/ui/sniper-scope.js';
import { createEvents } from '../../src/core/events.js';

class Element extends EventTarget {
  constructor() { super(); this.children = []; this.attributes = {}; this.classes = new Set(); this.classList = { toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name) }; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = value; }
}
function fixture(run) {
  const previousDocument = globalThis.document, host = new Element(), body = new Element();
  globalThis.document = { body, createElement: () => new Element(), createElementNS: () => new Element(), getElementById: () => host };
  let scoped = false, zoom = 2; const changes = [];
  const paintball = { get scoped() { return scoped; }, get scopeZoom() { return zoom; }, adjustScopeZoom(delta) { changes.push(delta); return zoom = Math.min(8, Math.max(2, zoom + delta)); } };
  const game = { paintball, player: { active: true, events: new EventTarget() }, events: createEvents(), ui: { mapOpen: false, weaponWheelOpen: false } };
  const scope = createSniperScope(game), overlay = host.children[0];
  const find = (id, root = overlay) => root.id === id ? root : root.children.map(child => find(id, child)).find(Boolean);
  const wheel = (deltaY, extra = {}) => Object.assign(new Event('wheel', { cancelable: true }), { deltaY, ...extra });
  try { run({ scope, game, overlay, body, find, wheel, changes, set scoped(value) { scoped = value; }, set zoom(value) { zoom = value; } }); }
  finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; }
}

test('optics follow scoped state and hide immediately when controls, map or weapon wheel take focus', () => fixture(s => {
  assert.equal(s.overlay.hidden, true); assert.equal(s.body.classes.has('sniper-scoped'), false);
  s.scoped = true; s.scope.update(); assert.equal(s.overlay.hidden, false); assert.equal(s.body.classes.has('sniper-scoped'), true);
  assert.equal(s.find('scope-magnification').textContent, '2×');
  s.game.ui.mapOpen = true; s.scope.update(); assert.equal(s.overlay.hidden, true);
  s.game.ui.mapOpen = false; s.game.ui.weaponWheelOpen = true; s.scope.update(); assert.equal(s.overlay.hidden, true);
  s.game.ui.weaponWheelOpen = false; s.game.player.active = false; s.game.player.events.dispatchEvent(new Event('unlock'));
  assert.equal(s.overlay.hidden, true); assert.equal(s.body.classes.has('sniper-scoped'), false);
  s.game.player.active = true; s.scope.update(); assert.equal(s.overlay.hidden, false);
  s.scoped = false; s.scope.update(); assert.equal(s.overlay.hidden, true);
}));

test('scroll consumes zoom only while scoped, so the camera mode wheel can keep its normal behavior otherwise', () => fixture(s => {
  let event = s.wheel(-100); assert.equal(s.scope.handleWheel(event), false); assert.equal(event.defaultPrevented, false);
  s.scoped = true; event = s.wheel(-120); assert.equal(s.scope.handleWheel(event), true); assert.equal(event.defaultPrevented, true);
  assert.deepEqual(s.changes, [.5]); assert.equal(s.game.paintball.scopeZoom, 2.5); assert.equal(s.find('scope-magnification').textContent, '2.5×');
  event = s.wheel(120); assert.equal(s.scope.handleWheel(event), true); assert.equal(s.game.paintball.scopeZoom, 2);
  event = s.wheel(0); assert.equal(s.scope.handleWheel(event), false); assert.equal(event.defaultPrevented, false);
  event = s.wheel(-100, { ctrlKey: true }); assert.equal(s.scope.handleWheel(event), false); assert.equal(event.defaultPrevented, false);
  s.game.ui.weaponWheelOpen = true; event = s.wheel(-100); assert.equal(s.scope.handleWheel(event), false);
}));

test('mobile magnification buttons respect optical limits and stop changing zoom after leaving the scope', () => fixture(s => {
  const plus = s.find('scope-zoom-in'), minus = s.find('scope-zoom-out');
  plus.dispatchEvent(new Event('click')); assert.equal(s.changes.length, 0);
  s.scoped = true; s.scope.update(); assert.equal(minus.disabled, true); assert.equal(plus.disabled, false);
  plus.dispatchEvent(new Event('click')); assert.equal(s.game.paintball.scopeZoom, 2.5); assert.equal(minus.disabled, false);
  s.zoom = 7.5; s.scope.update(); plus.dispatchEvent(new Event('click')); assert.equal(s.game.paintball.scopeZoom, 8); assert.equal(plus.disabled, true);
  minus.dispatchEvent(new Event('click')); assert.equal(s.game.paintball.scopeZoom, 7.5); assert.equal(plus.disabled, false);
  s.scoped = false; minus.dispatchEvent(new Event('click')); assert.equal(s.game.paintball.scopeZoom, 7.5);
}));
