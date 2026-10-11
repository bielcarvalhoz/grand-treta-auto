/** The camera supplies magnification; this aperture supplies the scope optics. */
export function createSniperScope(game) {
  const { paintball, player } = game;
  const overlay = document.createElement('div'); overlay.id = 'sniper-scope'; overlay.hidden = true;
  overlay.setAttribute('aria-label', 'Mira telescópica');
  const lens = document.createElement('div'); lens.className = 'sniper-scope-lens'; lens.setAttribute('aria-hidden', 'true');
  const reticle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  reticle.setAttribute('viewBox', '-100 -100 200 200'); reticle.setAttribute('class', 'sniper-scope-reticle');
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let path = 'M-100 0H100M0-100V100';
  for (const step of [-40, -30, -20, -10, 10, 20, 30, 40]) {
    const half = Math.abs(step) % 20 === 0 ? 2.2 : 1.4;
    path += `M${step} ${-half}V${half}M${-half} ${step}H${half}`;
  }
  lines.setAttribute('d', path); reticle.appendChild(lines);
  const center = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  center.setAttribute('r', '.55'); center.setAttribute('class', 'sniper-scope-center'); reticle.appendChild(center);
  lens.appendChild(reticle);
  const controls = document.createElement('div'); controls.className = 'sniper-scope-zoom';
  const minus = document.createElement('button'), plus = document.createElement('button');
  minus.id = 'scope-zoom-out'; minus.type = plus.type = 'button'; minus.textContent = '−'; plus.textContent = '+'; plus.id = 'scope-zoom-in';
  minus.setAttribute('aria-label', 'Diminuir ampliação do escopo'); plus.setAttribute('aria-label', 'Aumentar ampliação do escopo');
  const magnification = document.createElement('output'); magnification.id = 'scope-magnification'; magnification.setAttribute('aria-label', 'Ampliação do escopo');
  controls.append(minus, magnification, plus); overlay.append(lens, controls);
  document.getElementById('hud').appendChild(overlay);
  const active = () => !!paintball.scoped && !!player.active && !game.ui?.mapOpen && !game.ui?.weaponWheelOpen;
  let previousZoom = null;
  function update() {
    const visible = active(); overlay.hidden = !visible;
    document.body.classList.toggle('sniper-scoped', visible);
    if (!visible || previousZoom === paintball.scopeZoom) return;
    previousZoom = paintball.scopeZoom;
    magnification.textContent = `${Number(previousZoom.toFixed(1))}×`;
    minus.disabled = previousZoom <= 2; plus.disabled = previousZoom >= 8;
  }
  function adjust(delta) {
    if (!active()) return;
    paintball.adjustScopeZoom(delta); update();
  }
  minus.addEventListener('click', () => adjust(-.5)); plus.addEventListener('click', () => adjust(.5));
  function handleWheel(event) {
    if (!active() || event.ctrlKey || !event.deltaY) return false;
    event.preventDefault(); adjust(-Math.sign(event.deltaY) * .5); return true;
  }
  player.events.addEventListener('unlock', update); game.events.on('modechange', update);
  update();
  return { update, handleWheel };
}
