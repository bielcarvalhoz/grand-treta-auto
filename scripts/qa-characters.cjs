// Optional end-to-end check: NODE_PATH points to a Playwright installation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const output = path.resolve('artifacts/characters'); fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    const dimensions = process.env.QA_VIEWPORT?.split('x').map(Number);
    const viewports = dimensions ? [[...dimensions, process.env.QA_TOUCH !== 'false']] : [[1366, 900, false], [390, 844, true], [844, 390, true]];
    for (const [width, height, touch] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(process.argv[2] || 'http://127.0.0.1:5179/', { waitUntil: 'domcontentloaded' });
      await page.locator('#intro-skip').click();
      await page.waitForFunction(() => window.__cdd && !document.querySelector('#play').disabled, null, { timeout: 180000 });
      console.log(`${width}: scene ready`);
      const idleFrame = await page.evaluate(() => __cdd.renderer.info.render.frame);
      await page.locator('#play').click();
      assert.equal(await page.locator('#treta-menu').isVisible(), true);
      assert.equal(await page.locator('#treta-multi').isDisabled(), true);
      await page.locator('#treta-single').click();
      assert.equal(await page.locator('#character-panel').isVisible(), true);
      assert.equal(await page.locator('#character-confirm').isDisabled(), true);
      assert.equal(await page.evaluate(() => __cdd.player.active), false);
      await page.locator('#character-new').click();
      await page.locator('#character-name').fill('Biel da Treta');
      for (const [key, value] of Object.entries({ hairStyle: 'mohawk', eyeStyle: 'sharp', beard: 'full', shirtStyle: 'stripes', pantsStyle: 'cargo', shoeStyle: 'high', faceAccessory: 'sunglasses', headAccessory: 'headphones' })) await page.locator(`#character-${key}`).selectOption(value);
      await page.locator('#character-shirtColor').fill('#d52a40');
      await page.locator('#character-pantsColor').fill('#3c7057');
      await page.locator('#character-hairColor').fill('#d5ab4c');
      await page.locator('#character-editor').evaluate(el => { el.scrollTop = 0; });
      const stage = await page.locator('.character-stage').boundingBox();
      assert.ok(stage.y >= 0 && stage.y + stage.height <= height, 'the live preview stays visible while editing');
      assert.equal(await page.evaluate(() => __cdd.renderer.info.render.frame), idleFrame, 'the covered city stays idle during character preview');
      await page.screenshot({ path: path.join(output, `creator-${width}.png`), fullPage: true });
      await page.locator('#character-save').click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(output, `roster-${width}.png`), fullPage: true });
      await page.locator('#character-confirm').click();
      await page.waitForFunction(() => __cdd.player.active && !document.querySelector('body').classList.contains('menu-open'));
      assert.equal(await page.evaluate(() => __cdd.player.avatar.appearance.value.shirtColor), '#d52a40');
      await page.evaluate(() => __cdd.paintball.setHolstered(true));
      await page.waitForFunction(() => __cdd.player.holstered);
      if (touch) {
        const cdp = await context.newCDPSession(page);
        const x1 = Math.round(width * .55), x2 = Math.round(width * .78), y = Math.round(height * .48);
        const distance = await page.evaluate(() => __cdd.player.orbitDistance);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y, id: 1 }, { x: x2, y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 - 12, y, id: 1 }, { x: Math.round(width * .9), y, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.ok(await page.evaluate(before => __cdd.player.orbitDistance < before, distance), 'native two-finger input must zoom the camera');
      }
      const before = await page.evaluate(() => ({ yaw: __cdd.player.yaw, distance: __cdd.player.orbitDistance }));
      await page.evaluate(() => {
        const canvas = __cdd.renderer.domElement;
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, cancelable: true, bubbles: true }));
      });
      assert.ok(await page.evaluate(distance => __cdd.player.orbitDistance < distance, before.distance));
      await page.evaluate(() => {
        const p = __cdd.player, c = __cdd.camera;
        c.rotation.set(0, p.yaw + Math.PI, 0, 'YXZ'); p.updateCamera();
      });
      assert.equal(await page.evaluate(() => __cdd.player.yaw), before.yaw);
      await page.screenshot({ path: path.join(output, `front-${width}.png`), fullPage: true });
      await page.evaluate(() => __cdd.paintball.setHolstered(false));
      await page.waitForFunction(() => !__cdd.player.cameraReturning && !__cdd.player.holstered);
      assert.equal(await page.evaluate(() => __cdd.player.avatar.animationState.kind), 'firearm');
      await page.evaluate(() => __cdd.game.ui.showMenu());
      for (const [button, mode] of [['training', 'training'], ['tour', 'tour']]) {
        await page.locator(`#${button}`).click();
        assert.equal(await page.locator('#character-panel').isVisible(), true);
        await page.locator('#character-confirm').click();
        await page.waitForFunction(mode => __cdd.game.mode === mode, mode);
        assert.equal(await page.evaluate(() => __cdd.player.character.name), 'Biel da Treta');
        await page.evaluate(() => __cdd.game.ui.showMenu());
      }
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#intro-skip').click();
      await page.waitForFunction(() => window.__cdd && !document.querySelector('#play').disabled, null, { timeout: 180000 });
      await page.locator('#characters-open').click();
      assert.equal(await page.locator('#character-list button').count(), 2);
      assert.match(await page.locator('#character-preview-name').textContent(), /Biel da Treta/);
      await page.locator('#character-edit').click();
      assert.equal(await page.locator('#character-shirtColor').inputValue(), '#d52a40');
      await page.locator('#character-name').fill('Edição cancelada');
      await page.locator('#character-hairStyle').selectOption('bald');
      await page.locator('#character-edit-cancel').click();
      assert.equal(await page.locator('#character-preview-name').textContent(), 'Biel da Treta');
      if (!touch || process.env.QA_VARIANTS === '1') {
        await page.locator('#character-edit').click();
        await page.locator('#character-faceAccessory').selectOption('none');
        for (const hairStyle of ['original', 'crop', 'spikes', 'mohawk', 'afro', 'bald']) {
          await page.locator('#character-hairStyle').selectOption(hairStyle);
          await page.locator('#character-preview').screenshot({ path: path.join(output, `hair-${hairStyle}.png`) });
        }
        for (const [eyeStyle, beard, headAccessory] of [['round', 'none', 'cap'], ['sharp', 'stubble', 'backwards'], ['sleepy', 'goatee', 'beanie'], ['original', 'full', 'none']]) {
          await page.locator('#character-eyeStyle').selectOption(eyeStyle);
          await page.locator('#character-beard').selectOption(beard);
          await page.locator('#character-headAccessory').selectOption(headAccessory);
          await page.locator('#character-preview').screenshot({ path: path.join(output, `look-${eyeStyle}-${beard}.png`) });
        }
        await page.locator('#character-edit-cancel').click();
      }
      await page.locator('#character-close').click();
      assert.deepEqual(errors, []);
      results.push({ width, height, touch, errors, rosterSaved: true, modes: ['campaign', 'training', 'tour'], cameraReturned: true });
      console.log(JSON.stringify(results.at(-1))); await context.close();
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
