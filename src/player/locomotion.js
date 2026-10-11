// Planted-toe speeds in the supplied Sato clips at the player's 1.8 m scale.
// Distance advances the cycle, so a wall or an airborne player cannot make steps.
export const GAITS = {
  idle: { clip: 'Idle_Loop', speed: 0, duration: 2.5 },
  walk: { clip: 'Walk_Loop', speed: .821, duration: 4 / 3, contacts: [.058, .558] },
  jog: { clip: 'Jog_Fwd_Loop', speed: 4.588, duration: 11 / 12, contacts: [.025, .542] },
  run: { clip: 'Sprint_Loop', speed: 7.015, duration: 2 / 3, contacts: [.025, .600] },
  crouchIdle: { clip: 'Crouch_Idle_Loop', speed: 0, duration: 35 / 12 },
  crouch: { clip: 'Crouch_Fwd_Loop', speed: .615, duration: 2, contacts: [.025, .525] },
};

export function gaitForSpeed(speed, crouched = false) {
  if (crouched) return speed <= .15 ? 'crouchIdle' : 'crouch';
  return speed <= .15 ? 'idle' : speed < 2 ? 'walk' : speed < 7 ? 'jog' : 'run';
}
