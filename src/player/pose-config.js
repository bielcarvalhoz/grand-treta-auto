const KEY = 'cdd-training-pose-v2';
const axes = ['x', 'y', 'z'];
const identity = () => ({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
// Calibrated in the mobile training panel; values remain relative to the same
// original hand socket, so existing edits are never applied twice.
const meleeDefaults = {
  shaft: {
    first: { position: { x: -.03, y: -.14, z: -.10 }, rotation: { x: 29, y: -8, z: 68 }, scale: { x: 1, y: 1, z: 1 } },
    third: { position: { x: -.02, y: -.01, z: -.06 }, rotation: { x: -44, y: -56, z: 45 }, scale: { x: .99, y: 1, z: 1 } },
  },
  knife: {
    first: { position: { x: -.01, y: 0, z: .02 }, rotation: { x: 78, y: 9, z: -29 }, scale: { x: 1, y: 1, z: 1.03 } },
    third: { position: { x: 0, y: -.01, z: .02 }, rotation: { x: -64, y: -62, z: -33 }, scale: { x: 1, y: 1, z: 1 } },
  },
};
function defaultPose(weapon, view, target) {
  const family = ['axe', 'bat'].includes(weapon) ? 'shaft' : ['knife', 'knife-tactical', 'knife-combat'].includes(weapon) ? 'knife' : null;
  return structuredClone(target === 'weapon' && meleeDefaults[family]?.[view] || identity());
}

/** Values are offsets in metres/degrees and scale multipliers. Separate sockets
 * per weapon/view; arm framing is camera-local and first-person only. */
export function createPoseConfig(storage = globalThis.localStorage) {
  let saved = {};
  try {
    const current = storage?.getItem(KEY);
    saved = JSON.parse(current || storage?.getItem('cdd-training-pose-v1') || '{}') || {};
    // v1 persisted every visited socket, including unedited identity values.
    // Let those slots inherit the new defaults while preserving actual edits.
    if (!current) for (const [key, value] of Object.entries(saved)) {
      if (key.endsWith('/weapon') && ['position', 'rotation', 'scale'].every(group =>
        axes.every(axis => value?.[group]?.[axis] === (group === 'scale' ? 1 : 0)))) delete saved[key];
    }
  } catch { /* private browsing/corrupt save */ }
  const records = new Map();
  const keyFor = (weapon, view, target) => `${weapon}/${target === 'arms' ? 'first' : view}/${target}`;
  function get(weapon, view, target = 'weapon') {
    const key = keyFor(weapon, view, target);
    if (!records.has(key)) {
      const value = defaultPose(weapon, view, target), candidate = saved[key];
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
    reset(weapon, view, target = 'weapon') {
      const value = get(weapon, view, target), base = defaultPose(weapon, view, target);
      for (const group of Object.keys(base)) Object.assign(value[group], base[group]);
      persist();
    },
    export(weapon, view, target) {
      return { schema: 'cdd-pose-v1', weapon, view: target === 'arms' ? 'first' : view, target,
        units: { position: 'm', rotation: 'deg', scale: 'multiplier' }, ...structuredClone(get(weapon, view, target)) };
    },
  };
}
