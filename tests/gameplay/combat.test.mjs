import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatSimulation, COMBAT_STEP } from '../../src/gameplay/combat/simulation.js';
import { DEFAULT_COMBAT_RULES } from '../../src/gameplay/combat/config.js';
import { traceHitboxes, updateHumanoidHitboxes } from '../../src/gameplay/combat/hitboxes.js';
import { createFlowField } from '../../src/gameplay/combat/flow-field.js';

const bounds = { x0: -20, x1: 20, z0: -20, z1: 20 };
const bullet = { id: 'pistol', kind: 'firearm', damage: 30, pellets: 1 };
const fixture = (options = {}) => {
  const events = [], simulation = createCombatSimulation({ bounds, random: () => .5, onEvent: e => events.push(e), ...options });
  const player = simulation.spawn({ kind: 'player', position: { x: 0, y: 0, z: 0 } });
  return { simulation, player, events };
};
const advance = (s, seconds, dt = COMBAT_STEP) => { for (let t = 0; t < seconds - 1e-8; t += dt) s.update(dt); };
const wall = { min: { x: -4, y: 0, z: -1 }, max: { x: 4, y: 3, z: 1 } };

test('training shot counts: human 1/2/4, zombie 1/4/8; every lethal hit records one death and one kill', () => {
  for (const [kind, counts] of [['human', { head: 1, thorax: 2, limb: 4 }], ['zombie', { head: 1, thorax: 4, limb: 8 }]]) {
    for (const [region, count] of Object.entries(counts)) {
      const { simulation: s, player, events } = fixture();
      const victim = s.spawn({ kind, position: { x: 0, y: 0, z: -5 }, stationary: true });
      for (let i = 0; i < count; i++) {
        assert.equal(!!victim.dead, false);
        s.damage(victim, { source: player, region, weapon: bullet });
      }
      assert.equal(victim.health.current, 0); assert.ok(victim.dead);
      assert.equal(player.stats.kills, 1); assert.equal(victim.stats.deaths, 1);
      assert.equal(player.stats.headshots, region === 'head' ? 1 : 0);
      assert.equal(s.damage(victim, { source: player, region, weapon: bullet }), null);
      assert.equal(events.filter(e => e.type === 'death').length, 1);
      assert.equal([...s.agents].includes(victim), false, 'dead entities leave the AI query');
    }
  }
});

test('weapon damage, melee, custom health, pellets and team damage use the same authority', () => {
  const { simulation: s, player } = fixture({ rules: { zombie: { health: 400 } } });
  const ally = s.spawn({ kind: 'human', role: 'ally', position: { x: 2, y: 0, z: -5 }, stationary: true });
  const zombie = s.spawn({ kind: 'zombie', position: { x: 0, y: 0, z: -5 }, stationary: true });
  assert.equal(zombie.health.max, 400); assert.equal(s.rules.zombie.speed, DEFAULT_COMBAT_RULES.zombie.speed);
  assert.equal(s.damage(ally, { source: player, weapon: bullet }), null);
  s.configure({ friendlyFire: true, damageMode: 'weapon' });
  assert.equal(s.damage(ally, { source: player, region: 'limb', weapon: bullet }).damage, 22.5);
  s.damage(zombie, { source: player, region: 'head', weapon: { kind: 'unarmed', damage: 15 } });
  assert.equal(zombie.health.current, 385, 'a punch to the head is not a firearm headshot');
  s.damage(zombie, { source: player, region: 'head', weapon: bullet }); assert.ok(zombie.dead);
  s.configure({ damageMode: 'training' });
  const target = s.spawn({ kind: 'human', position: { x: 4, y: 0, z: -5 }, stationary: true });
  for (let i = 0; i < 9; i++) s.damage(target, { source: player, region: 'thorax', weapon: { ...bullet, pellets: 9 } });
  assert.ok(Math.abs(target.health.current - 50) < 1e-8, 'nine chest pellets total one training shell');
  s.revive(player); assert.equal(s.damage(player, { source: ally, weapon: bullet }), null, 'respawn protection');
  advance(s, 2.1); s.configure({ playerDamage: false });
  assert.equal(s.damage(player, { source: ally, weapon: bullet }), null);
});

test('swept capsules identify head, chest, arms and legs; nearest actor shields those behind it', () => {
  const { simulation: s } = fixture();
  const actor = s.spawn({ position: { x: 0, y: 0, z: -4 }, stationary: true });
  const behind = s.spawn({ position: { x: 0, y: 0, z: -8 }, stationary: true });
  for (const [x, y, region] of [[0, 1.64, 'head'], [0, 1.1, 'thorax'], [.39, 1.1, 'limb'], [.13, .4, 'limb']]) {
    const hit = traceHitboxes({ x, y, z: 0 }, { x, y, z: -100 }, [actor, behind]);
    assert.equal(hit.entity, actor); assert.equal(hit.region, region); assert.ok(hit.distance < 4.1);
  }
  assert.equal(traceHitboxes({ x: 2, y: 1, z: 0 }, { x: 2, y: 1, z: -100 }, [actor]), null);
  assert.equal(traceHitboxes({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -2 }, [actor]), null);
  updateHumanoidHitboxes(actor, true);
  assert.equal(traceHitboxes({ x: 0, y: 1.65, z: 0 }, { x: 0, y: 1.65, z: -5 }, [actor]), null);
  assert.equal(traceHitboxes({ x: 0, y: 1.1, z: 0 }, { x: 0, y: 1.1, z: -5 }, [actor]).region, 'head');
});

test('walls stop bullets and bot line of sight; missed bot rays do not apply automatic damage', () => {
  const { simulation: s, player, events } = fixture();
  const bot = s.spawn({ position: { x: 0, y: 0, z: -8 }, difficulty: 'hard' });
  s.setObstacles([{ min: { x: -20, y: 0, z: -4 }, max: { x: 20, y: 3, z: -3 } }]);
  advance(s, 3); assert.equal(player.health.current, 100); assert.equal(events.filter(e => e.type === 'shot').length, 0);
  assert.equal(s.trace({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: -15 }, { source: player }), null);
  s.setObstacles([]); advance(s, .15); assert.equal(player.health.current, 100, 'reaction delay before the first shot');
  advance(s, 2); assert.ok(player.dead); assert.ok(events.some(e => e.type === 'shot'));
  assert.equal(bot.stats.kills, 1);
});

test('BFS routes a zombie around an obstructing wall to a point without entering inflated obstacles', () => {
  const { simulation: s } = fixture();
  const zombie = s.spawn({ kind: 'zombie', position: { x: 0, y: 0, z: -8 } });
  s.setObstacles([wall]); s.setZombieGoal('point', { x: 0, y: 0, z: 8 });
  let wentAround = false;
  for (let i = 0; i < 2400; i++) {
    s.update(COMBAT_STEP);
    const p = zombie.position; if (Math.abs(p.x) > 4.4) wentAround = true;
    assert.ok(!(p.x > -4.35 && p.x < 4.35 && p.z > -1.35 && p.z < 1.35), 'the zombie must not enter the wall');
  }
  assert.equal(wentAround, true); assert.ok(Math.hypot(zombie.position.x, zombie.position.z - 8) < 1.4, JSON.stringify(zombie.position));
  const revision = s.navigation.stats.revision; s.setObstacles([wall]); assert.equal(s.navigation.stats.revision, revision);
  s.setObstacles([]); assert.ok(s.navigation.stats.revision > revision);
});

test('disconnected flow fields return no path and share bounded cached target fields', () => {
  const nav = createFlowField({ bounds: { x0: -10, x1: 10, z0: -10, z1: 10 }, maxFields: 2 });
  nav.setObstacles([{ min: { x: -11, y: 0, z: -1 }, max: { x: 11, y: 3, z: 1 } }]);
  assert.equal(nav.waypoint({ x: 0, z: -5 }, { x: 0, z: 5 }), null);
  for (let i = 0; i < 8; i++) nav.waypoint({ x: 0, z: -5 }, { x: i, z: 5 });
  assert.ok(nav.stats.fields <= 2); assert.ok(nav.nearestFree({ x: 0, z: 0 }));
});

test('zombies follow and damage an objective; allies follow the player and fight the horde', () => {
  const { simulation: s, player } = fixture();
  const objective = s.spawn({ kind: 'objective', team: 'squad', position: { x: 5, y: 0, z: 5 } });
  const zombie = s.spawn({ kind: 'zombie', position: { x: 5, y: 0, z: 2 } });
  s.setZombieGoal('objective'); advance(s, 4);
  assert.ok(objective.health.current < objective.health.max); assert.equal(player.health.current, 100);
  s.clear(); s.setZombieGoal('players');
  const ally = s.spawn({ kind: 'human', role: 'ally', difficulty: 'hard', position: { x: -7, y: 0, z: 0 } });
  advance(s, 2); assert.ok(ally.position.x > -7, 'idle ally follows the player');
  const target = s.spawn({ kind: 'zombie', position: { x: -5, y: 0, z: -6 }, stationary: true });
  advance(s, 5); assert.ok(target.dead || !s.world.has(target)); assert.equal(ally.stats.kills, 1);
  assert.equal(player.health.current, 100, 'friendly fire defaults off');
});

test('zombie windup cannot damage a target that escaped its reach; pause and clear stop attacks', () => {
  const { simulation: s, player } = fixture();
  const zombie = s.spawn({ kind: 'zombie', position: { x: 0, y: 0, z: -1.2 } });
  advance(s, .5); assert.ok(zombie.ai.pending);
  player.position.x = 10; updateHumanoidHitboxes(player); advance(s, .4); assert.equal(player.health.current, 100);
  s.pausedAI = true; const before = { ...zombie.position }; advance(s, 2); assert.deepEqual(zombie.position, before);
  s.clear(); assert.equal([...s.agents].length, 0); assert.equal([...s.actors].length, 1);
});

test('fixed simulation produces the same pursuit across frame subdivisions and bounds catch-up and population', () => {
  const positions = [];
  for (const dt of [1 / 60, 1 / 30]) {
    const { simulation: s } = fixture();
    const zombie = s.spawn({ kind: 'zombie', position: { x: -5, y: 0, z: -10 } });
    s.setZombieGoal('point', { x: 5, y: 0, z: 10 }); advance(s, 3, dt); positions.push(zombie.position);
  }
  assert.ok(Math.hypot(positions[0].x - positions[1].x, positions[0].z - positions[1].z) < 1e-6);
  const { simulation: s } = fixture({ rules: { maxActors: 2 } });
  s.spawn({ kind: 'zombie' }); s.spawn({ kind: 'human' }); assert.equal(s.spawn({ kind: 'human' }), null);
  s.update(60); assert.ok(s.time <= .100001, 'no catch-up burst after a suspended tab');
});

test('invalid balance configurations are rejected without changing the current valid rules', () => {
  const { simulation: s } = fixture();
  for (const next of [{ human: { health: 0 } }, { zombie: { speed: NaN } }, { firearm: { thorax: -1 } }, { multipliers: { limb: Infinity } }, { maxActors: 0 }, { respawnSeconds: -1 }, { damageMode: 'unknown' }]) {
    assert.throws(() => s.configure(next), RangeError);
    assert.equal(s.rules.human.health, 100); assert.equal(s.rules.damageMode, 'training');
  }
});
