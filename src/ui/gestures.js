/** Keep native Safari/Chrome page gestures out of the game's pointer controls.
 * Application pinch gestures on the map/tour still use pointer events. */
export function installGestureGuard(target = document) {
  const prevent = e => { if (e.cancelable) e.preventDefault(); };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'selectstart', 'contextmenu', 'dblclick']) target.addEventListener(type, prevent, { passive: false, capture: true });
  // Safari can ignore viewport zoom limits. Cancel native pinch and button
  // touch defaults explicitly; game/map gestures still use pointer events.
  for (const type of ['touchstart', 'touchmove']) target.addEventListener(type, e => {
    if (e.touches?.length > 1) prevent(e);
  }, { passive: false, capture: true });
  let lastTouch = null;
  target.addEventListener('touchend', e => {
    const touch = e.changedTouches?.[0], now = performance.now();
    if (e.target?.closest?.('button, canvas') || (touch && lastTouch && now - lastTouch.time < 350
      && Math.hypot(touch.clientX - lastTouch.x, touch.clientY - lastTouch.y) < 36)) prevent(e);
    lastTouch = touch ? { time: now, x: touch.clientX, y: touch.clientY } : null;
  }, { passive: false, capture: true });

  // Browsers generally generate a compatibility click only for the primary
  // touch. HUD actions must also work with a second/third finger while moving.
  const taps = new Map(); let lastAction = null;
  target.addEventListener('pointerdown', e => {
    if (!['touch', 'pen'].includes(e.pointerType)) return;
    if (e.isPrimary) taps.clear();
    const button = e.target?.closest?.('button:not(#btn-fire):not(#btn-weapon), #minimap');
    if (button && !button.disabled) taps.set(e.pointerId, { button, x: e.clientX, y: e.clientY, moved: false });
  }, true);
  target.addEventListener('pointermove', e => {
    const tap = taps.get(e.pointerId);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) tap.moved = true;
  }, true);
  target.addEventListener('pointerup', e => {
    const tap = taps.get(e.pointerId); taps.delete(e.pointerId);
    if (!tap || tap.moved || tap.button.disabled || !tap.button.isConnected) return;
    lastAction = { time: performance.now(), x: e.clientX, y: e.clientY };
    prevent(e); tap.button.click();
  }, true);
  target.addEventListener('pointercancel', e => taps.delete(e.pointerId), true);
  target.addEventListener('click', e => {
    // Consume the delayed native click, including one retargeted after opening
    // a map/menu. Synthetic activation above and keyboard clicks have detail 0.
    if ((e.detail || e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents) && lastAction && performance.now() - lastAction.time < 700
      && Math.hypot(e.clientX - lastAction.x, e.clientY - lastAction.y) < 24) {
      prevent(e); e.stopImmediatePropagation();
    }
  }, true);
  const reset = () => { taps.clear(); lastAction = lastTouch = null; };
  target.addEventListener('visibilitychange', reset);
  target.defaultView?.addEventListener('blur', reset);
}
