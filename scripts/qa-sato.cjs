// Optional real-browser regression: Playwright + Chromium/Edge, like qa-intro.cjs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

async function run() {
  const directory = process.env.QA_ARTIFACT_DIR || path.join(os.tmpdir(), 'jogo-sato-qa');
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const reports = [];
  try {
    for (const [label, width, height, touch] of [['desktop', 1280, 800, false], ['portrait', 390, 844, true], ['landscape', 844, 390, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(process.argv[2] || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__cdd && !document.querySelector('#training').disabled, null, { timeout: 120000 });
      const activate = async selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
      const checkpoint = await page.evaluate(() => __cdd.player.feet.toArray());
      await activate('#training');
      await page.waitForFunction(() => __cdd.player.active && __cdd.game.training.active);
      await page.waitForTimeout(350);
      let data = await page.evaluate(() => ({ mode: __cdd.game.mode, cameraMode: __cdd.player.cameraMode,
        feet: __cdd.player.feet.toArray(), floor: __cdd.game.training.floor.visible,
        visibleMeshes: __cdd.player.avatar.meshes.filter(mesh => mesh.visible).map(mesh => mesh.name),
        gripError: __cdd.player.avatar.weaponDiagnostics.gripError,
      }));
      assert.equal(data.mode, 'training'); assert.equal(data.cameraMode, 'third'); assert.equal(data.floor, true);
      assert.ok(data.visibleMeshes.length > 2); assert.ok(data.gripError < .003);
      await page.screenshot({ path: path.join(directory, `${label}-third.png`) });
      if (touch) await activate('#btn-camera');
      else {
        await page.mouse.move(640, 350); await page.mouse.wheel(0, -120);
        await page.waitForFunction(() => __cdd.player.cameraMode === 'first');
        await page.mouse.wheel(0, -120);
        assert.equal(await page.evaluate(() => __cdd.player.cameraMode), 'first', 'one scroll direction must not flicker between views');
        await page.mouse.wheel(0, 120);
        await page.waitForFunction(() => __cdd.player.cameraMode === 'third');
        await page.mouse.wheel(0, -120);
      }
      await page.waitForFunction(() => __cdd.player.cameraMode === 'first');
      await page.waitForTimeout(150);
      const visible = await page.evaluate(() => __cdd.player.avatar.meshes.filter(mesh => mesh.visible).map(mesh => mesh.name));
      assert.equal(visible.length, 2); assert.ok(visible.every(name => /Sato_arm_hand_[LR]/.test(name)));
      await page.screenshot({ path: path.join(directory, `${label}-first.png`) });
      if (touch) { await activate('#btn-weapon'); await activate('#btn-aim'); }
      else { await page.keyboard.press('KeyQ'); await page.mouse.down({ button: 'right' }); }
      await page.waitForFunction(() => __cdd.paintball.weapon.id === 'automatic' && __cdd.paintball.aiming);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(directory, `${label}-automatic-aim.png`) });
      assert.ok(await page.evaluate(() => __cdd.paintball.gun.getObjectByName('quaternius-automatic')));
      await page.evaluate(() => __cdd.paintball.setColor('azul'));
      await page.screenshot({ path: path.join(directory, `${label}-automatic-blue.png`) });
      // Keyboard activation exercises the accessible fire action on all layouts.
      if (touch) await page.locator('#btn-fire').press('Enter');
      else { await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.up(); await page.mouse.up({ button: 'right' }); }
      assert.ok(await page.evaluate(() => __cdd.paintball.stats.shots > 0));
      if (touch) await activate('#btn-menu'); else await page.keyboard.press('Escape');
      await page.waitForFunction(() => __cdd.game.mode === null && !__cdd.game.training.active);
      assert.deepEqual(await page.evaluate(() => __cdd.player.feet.toArray()), checkpoint);
      assert.equal(await page.evaluate(() => __cdd.paintball.stats.projectiles + __cdd.paintball.stats.marks), 0);
      await activate('#play'); await page.waitForFunction(() => __cdd.game.mode === 'campaign' && __cdd.player.active);
      assert.equal(await page.evaluate(() => __cdd.game.training.floor.visible), false);
      if (touch) await activate('#btn-menu'); else await page.keyboard.press('Escape');
      await page.waitForFunction(() => __cdd.game.mode === null);
      await activate('#tour'); await page.waitForFunction(() => __cdd.game.tour.active);
      // The mode event precedes the next player/paintball render update.
      await page.waitForFunction(() => !__cdd.player.avatar.root.visible && !__cdd.paintball.gun.visible);
      assert.equal(await page.evaluate(() => __cdd.player.avatar.root.visible), false);
      assert.equal(await page.evaluate(() => __cdd.paintball.gun.visible), false);
      assert.deepEqual(errors, []);
      reports.push({ label, viewport: [width, height], training: data, errors });
      await context.close();
    }
    fs.writeFileSync(path.join(directory, 'sato-qa.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify(reports));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
