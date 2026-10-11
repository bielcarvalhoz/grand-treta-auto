const KEY = 'cdd-training-pose-v1';
const axes = ['x', 'y', 'z'];
const identity = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });

/** Values are offsets in metres/degrees and scale multipliers. Separate sockets
 * per weapon/view; arm framing is camera-local and first-person only. */
export function createPoseConfig(storage = globalThis.localStorage) {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch { /* private browsing/corrupt save */ }
  const records = new Map();
  const keyFor = (weapon, view, target) => `${weapon}/${target === 'arms' ? 'first' : view}/${target}`;
  function get(weapon, view, target = 'weapon') {
    const key = keyFor(weapon, view, target);
    if (!records.has(key)) {
      const value = identity(), candidate = saved[key];
      for (const group of ['position', 'rotation', 'scale']) for (const axis of axes) {
        const n = candidate?.[group]?.[axis];
        if (Number.isFinite(n)) value[group][axis] = clamp(group, n);
      }
      records.set(key, value);
    }
    return records.get(key);
  }
  function clamp(group, value) {
    const [min, max] = group === 'scale' ? [.1, 3] : group === 'rotation' ? [-180, 180] : [-1.5, 1.5];
    return Math.min(max, Math.max(min, value));
  }
  function persist() {
    for (const [key, value] of records) saved[key] = value;
    try { storage?.setItem(KEY, JSON.stringify(saved)); } catch { /* edits still work in memory */ }
  }
  return {
    get,
    set(weapon, view, target, group, axis, number) {
      if (!['position', 'rotation', 'scale'].includes(group) || !axes.includes(axis) || !Number.isFinite(number)) return false;
      get(weapon, view, target)[group][axis] = clamp(group, number); persist(); return true;
    },
    reset(weapon, view, target) {
      const value = get(weapon, view, target), base = identity();
      for (const group of Object.keys(base)) Object.assign(value[group], base[group]);
      persist();
    },
    export(weapon, view, target) {
      return { schema: 'cdd-pose-v1', weapon, view: target === 'arms' ? 'first' : view, target,
        units: { position: 'm', rotation: 'deg', scale: 'multiplier' }, ...structuredClone(get(weapon, view, target)) };
    },
  };
}
