import * as THREE from 'three';

/** Ground copies are reusable scene objects; swapping never changes slot count. */
export function createWeaponPickups(game, models) {
  const root = new THREE.Group(); root.name = 'ground-weapons'; root.userData.paintballIgnore = true;
  game.engine.scene.add(root);
  const records = [], weapons = game.paintball.weapons.filter(weapon => weapon.kind !== 'unarmed' && models[weapon.id]);
  const ringGeometry = new THREE.TorusGeometry(.42, .018, 4, 24);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xeec765, transparent: true, opacity: .65, depthWrite: false, toneMapped: false });
  let serial = 0, nearby = null;
  function setModel(record, id) {
    if (record.model) record.group.remove(record.model);
    const model = models[id].model.clone(true);
    model.scale.setScalar(.65); model.rotation.z = Math.PI / 2;
    model.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(model);
    model.position.set(-(b.min.x + b.max.x) / 2, .055 - b.min.y, -(b.min.z + b.max.z) / 2);
    record.group.add(model); record.model = model; record.weaponId = id;
    record.label = weapons.find(weapon => weapon.id === id)?.label || id;
  }
  function add(id, mode, x, z) {
    const group = new THREE.Group(); group.position.set(x, mode === 'training' ? 0 : game.map.terrain.heightAt(x, z), z);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = .04; group.add(ring);
    const record = { id: `pickup-${serial++}`, weaponId: id, group, ring, mode, distance: Infinity, label: '' };
    group.name = record.id; root.add(group); setModel(record, id); records.push(record);
    return record;
  }
  const spawn = game.training.spawn, center = game.dynamicProps.campaign;
  weapons.forEach((weapon, i) => {
    // Two lines on either side of the box leave the firing lane unobstructed.
    add(weapon.id, 'training', spawn.x + (i % 2 ? 3.2 : -3.2), spawn.z - 1.7 - Math.floor(i / 2) * 1.25);
  });
  const campaignWeapons = weapons.filter(weapon => !game.paintball.inventory.slots.includes(weapon.id));
  campaignWeapons.forEach((weapon, i) => {
    const angle = i / campaignWeapons.length * Math.PI * 2;
    add(weapon.id, 'campaign', center.x + Math.sin(angle) * 3.1, center.z + Math.cos(angle) * 3.1);
  });
  function update() {
    nearby = null;
    for (const record of records) {
      record.group.visible = (record.mode === 'training') === !!game.training.active;
      if (!record.group.visible || !game.player.active) continue;
      record.distance = record.group.position.distanceTo(game.player.feet);
      if (record.distance > 2.05 || game.paintball.inventory.slots.includes(record.weaponId)) continue;
      if (!nearby || record.distance < nearby.distance) nearby = record;
    }
    for (const record of records) record.ring.scale.setScalar(record === nearby ? 1.15 : 1);
  }
  function pickup() {
    update(); if (!nearby || game.ui?.weaponWheelOpen || game.ui?.mapOpen) return false;
    const record = nearby, result = game.paintball.pickupWeapon(record.weaponId);
    if (!result) return false;
    if (result.dropped) setModel(record, result.dropped);
    else { record.group.removeFromParent(); records.splice(records.indexOf(record), 1); }
    game.audio?.ui('confirm');
    update(); return result;
  }
  update(); game.events.on('modechange', update); game.engine.addSystem(update, 'world');
  return { root, records, update, pickup, get nearby() { return nearby; },
    dispose() { root.removeFromParent(); ringGeometry.dispose(); ringMaterial.dispose(); },
  };
}
