import { mulberry32 } from '../shared/rng.js';

/** Original, procedural menu groove and short UI/paint sounds. No recordings,
 * downloads or work on the render loop; one lazy, gesture-unlocked context. */
export function createAudio({ music = true, effects = true, contextFactory = () => {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Audio ? new Audio({ latencyHint: 'interactive' }) : null;
}, schedule = setInterval, unschedule = clearInterval } = {}) {
  let context = null, musicBus, effectsBus, noiseBuffer, clock = null, step = 0, nextBeat = 0;
  let menu = true, unlocked = false, disposed = false, hidden = false;
  const voices = new Set(), rnd = mulberry32(1947);
  const preferences = { music, effects };
  const retire = item => { voices.delete(item); item.source.onended = null; item.source.disconnect(); item.gain.disconnect(); item.filter?.disconnect(); };
  const stopVoice = item => { try { item.source.stop(); } catch { /* already ended */ } retire(item); };
  function voice(source, duration, volume, bus, when = context.currentTime, filter = null) {
    const active = [...voices].filter(v => v.bus === bus);
    if (active.length >= (bus === musicBus ? 32 : 12)) stopVoice(active[0]);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(volume, when + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    if (filter) { source.connect(filter); filter.connect(gain); } else source.connect(gain);
    gain.connect(bus);
    const item = {source, gain, filter, bus}; voices.add(item);
    source.onended = () => retire(item);
    source.start(when); source.stop(when + duration + .01);
  }
  const note = (frequency, duration, volume, bus, when, type = 'triangle', endFrequency = frequency) => {
    const oscillator = context.createOscillator(); oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    voice(oscillator, duration, volume, bus, when);
  };
  const noise = (duration, volume, bus, when, frequency = 1600, type = 'bandpass') => {
    const source = context.createBufferSource(); source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = .8;
    voice(source, duration, volume, bus, when, filter);
  };
  function stopMusic() {
    if (clock !== null) unschedule(clock); clock = null;
    for (const v of voices) if (v.bus === musicBus) stopVoice(v);
  }
  function tick() {
    if (!context || context.state !== 'running' || hidden) return;
    // A throttled/background tab skips elapsed beats instead of queuing a burst.
    if (nextBeat < context.currentTime - .2) nextBeat = context.currentTime + .04;
    while (nextBeat < context.currentTime + .20) {
      const i = step % 16, bar = Math.floor(step / 16) % 4, when = nextBeat;
      if ([0,6,8,11].includes(i)) note(95,.16,.5,musicBus,when,'sine',42);
      if ([4,12].includes(i)) { noise(.12,.25,musicBus,when,1600); note(155,.065,.12,musicBus,when,'triangle',80); }
      if (i % 2 === 0) noise(.035,.10,musicBus,when,7000,'highpass');
      if ([0,3,6,8,10,14].includes(i)) {
        const bass = [82.41,98,110,73.42][bar] * ([6,14].includes(i) ? 1.5 : 1);
        note(bass,.22,.26,musicBus,when,'triangle'); note(bass*2,.12,.045,musicBus,when,'sine');
      }
      if ([2,7,13].includes(i)) {
        const lead = [329.63,392,440,293.66][(bar + (i === 7 ? 1 : 0)) % 4];
        note(lead,.24,.075,musicBus,when,'triangle'); note(lead*1.004,.29,.035,musicBus,when,'sine');
      }
      step++; nextBeat += 60 / 88 / 4 * (i % 2 ? .94 : 1.06);
    }
  }
  function sync() {
    if (!context) return;
    musicBus.gain.setTargetAtTime(preferences.music ? .34 : 0,context.currentTime,.015);
    effectsBus.gain.setTargetAtTime(preferences.effects ? .7 : 0,context.currentTime,.015);
    if (unlocked && menu && preferences.music && !hidden) {
      if (clock === null) { nextBeat = context.currentTime + .04; step = 0; tick(); clock = schedule(tick,80); }
    } else stopMusic();
    if (!preferences.effects) for (const v of voices) if (v.bus === effectsBus) stopVoice(v);
  }
  async function unlock() {
    if (disposed || hidden) return false;
    try {
      if (!context) {
        context = contextFactory(); if (!context) return false;
        const master = context.createGain(); master.gain.value = .55; master.connect(context.destination);
        musicBus = context.createGain(); effectsBus = context.createGain(); musicBus.connect(master); effectsBus.connect(master);
        noiseBuffer = context.createBuffer(1,Math.ceil(context.sampleRate*.35),context.sampleRate);
        const data = noiseBuffer.getChannelData(0); for (let i=0;i<data.length;i++) data[i] = rnd()*2-1;
      }
      if (context.state !== 'running') await context.resume();
      unlocked = context.state === 'running'; sync(); return unlocked;
    } catch { return false; }
  }
  const audible = () => !disposed && unlocked && !hidden && preferences.effects && context?.state === 'running';
  let lastUi = -Infinity;
  return {
    unlock,
    setPreferences(next) { for (const key of ['music','effects']) if (typeof next[key] === 'boolean') preferences[key] = next[key]; sync(); },
    setMenu(value) { menu = !!value; sync(); },
    async setHidden(value) { hidden = !!value; sync(); if (hidden) for (const v of voices) stopVoice(v); if (context) { if (hidden) await context.suspend().catch(()=>{}); else if (unlocked) await unlock(); } },
    ui(kind = 'select') {
      if (!audible() || context.currentTime - lastUi < .045) return;
      lastUi = context.currentTime; const now = context.currentTime;
      const base = kind === 'back' ? 260 : kind === 'start' ? 440 : 660;
      note(base,.085,.13,effectsBus,now,'triangle',kind === 'back' ? 180 : base*1.15);
      if (kind === 'start' || kind === 'confirm') note(base*1.5,.14,.085,effectsBus,now+.035,'sine');
    },
    shot(weapon = 'pistol') {
      if (!audible()) return;
      const now = context.currentTime;
      const [pitch, duration, volume] = ({ automatic: [190,.045,.30], smg: [220,.035,.25], revolver: [115,.11,.38], shotgun: [85,.17,.42], sniper: [100,.21,.4] })[weapon] || [150,.07,.33];
      note(pitch,.09,volume * .73,effectsBus,now,'sine',55);
      noise(duration,volume,effectsBus,now,1300+ rnd()*500);
    },
    footstep(surface = 'concrete', { speed = 3, foot = 0 } = {}) {
      if (!audible()) return;
      const now = context.currentTime, grass = surface === 'grass';
      const volume = Math.min(.18, .065 + speed * .01) * (foot ? .96 : 1);
      note(grass ? 95 : 165,grass ? .065 : .045,volume,effectsBus,now,'sine',grass ? 45 : 70);
      noise(grass ? .13 : .05,volume * (grass ? 1.15 : .85),effectsBus,now,grass ? 850 + rnd() * 400 : 2400 + rnd() * 600,grass ? 'lowpass' : 'bandpass');
    },
    jump(surface = 'concrete') {
      if (!audible()) return;
      const now = context.currentTime;
      note(125,.08,.11,effectsBus,now,'sine',190);
      noise(.14,.08,effectsBus,now,surface === 'grass' ? 800 : 1700,'lowpass');
    },
    land(surface = 'concrete', speed = 4) {
      if (!audible()) return;
      const now = context.currentTime, strength = Math.min(.27, .09 + Math.abs(speed) * .014);
      note(100,.12,strength,effectsBus,now,'sine',38);
      noise(surface === 'grass' ? .16 : .075,strength * .75,effectsBus,now,surface === 'grass' ? 900 : 2100);
    },
    melee(weapon = {}) {
      if (!audible()) return;
      const now = context.currentTime, fists = weapon.id === 'fists' || weapon.kind === 'unarmed';
      noise(fists ? .09 : .16,.12,effectsBus,now,fists ? 850 : 1600,'lowpass');
    },
    impact(surface = 'wood', impulse = 6) {
      if (!audible()) return;
      const now = context.currentTime, volume = Math.min(.26, .07 + impulse * .007);
      note(surface === 'wood' ? 145 : 210,.085,volume,effectsBus,now,'triangle',65);
      noise(.07,volume * .65,effectsBus,now,700 + rnd() * 300);
    },
    get preferences() { return {...preferences}; },
    get state() { return { unlocked, running: context?.state === 'running', musicPlaying: clock !== null, voices: voices.size }; },
    dispose() { if (disposed) return; disposed = true; stopMusic(); for (const v of voices) stopVoice(v); context?.close().catch(()=>{}); },
  };
}
