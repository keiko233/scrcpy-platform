// Run after pnpm build: pnpm exec electron scripts/locale-smoke.cjs
// Uses temporary preferences and the actual main/preload/renderer bundles.
const { app, BrowserWindow } = require('electron');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'android-locale-smoke-')));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(read, matches, description) {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (matches(value)) return value;
    await pause(100);
  }
  throw new Error(`Timed out: ${description}`);
}
const evaluate = (window, code) => window.webContents.executeJavaScript(code);
const heading = (window) => evaluate(window, 'document.querySelector("h1")?.textContent');
async function click(window, expression) {
  const point = await evaluate(window, `(() => {
    const element = ${expression};
    if (!element) throw new Error('Missing control: ' + ${JSON.stringify(expression)});
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  })()`);
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
}
async function chooseLanguage(settings, label) {
  await click(settings, 'document.querySelector("[data-slot=select-trigger]")');
  await until(() => evaluate(settings, 'document.querySelectorAll("[role=option]").length'), n => n > 0, 'language options');
  await click(settings, `Array.from(document.querySelectorAll('[role=option]')).find(e => e.textContent === ${JSON.stringify(label)})`);
}
(async () => {
  await import(pathToFileURL(resolve(__dirname, '../out/main/index.js')).href);
  await app.whenReady();
  const main = await until(async () => BrowserWindow.getAllWindows()[0], Boolean, 'manager window');
  await until(() => heading(main), text => text === 'Devices and screens', 'initial English manager');
  await evaluate(main, 'window.androidPlatform.openSettingsWindow()');
  let settings = await until(async () => BrowserWindow.getAllWindows().find(w => w !== main), Boolean, 'settings window');
  await until(() => heading(settings), text => text === 'Settings', 'initial English settings');
  for (const [locale, label, mainTitle, settingsTitle] of [
    ['zh-cn', '简体中文', '设备与屏幕', '设置'],
    ['en', 'English', 'Devices and screens', 'Settings'],
    ['zh-cn', '简体中文', '设备与屏幕', '设置'],
  ]) {
    await chooseLanguage(settings, label);
    await until(() => heading(main), text => text === mainTitle, `${locale} manager`);
    await until(() => heading(settings), text => text === settingsTitle, `${locale} settings`);
    assert.equal(await evaluate(main, 'window.androidPlatform.getAppLocale()'), locale);
    assert.equal(await evaluate(settings, 'document.querySelector("[data-slot=select-trigger]").textContent'), label);
    if (locale === 'en') {
      assert.doesNotMatch(await evaluate(main, 'document.body.innerText'), /[\p{Script=Han}]/u);
    }
    process.stdout.write(`PASS: settings selection ${locale} updates both windows\n`);
  }
  settings.destroy();
  await evaluate(main, 'window.androidPlatform.openSettingsWindow()');
  settings = await until(async () => BrowserWindow.getAllWindows().find(w => w !== main), Boolean, 'reopened settings');
  await until(() => heading(settings), text => text === '设置', 'reopened settings retains Chinese');
  const reloaded = once(main.webContents, "did-finish-load");
  main.webContents.reload();
  await reloaded;
  await until(() => heading(main), text => text === '设备与屏幕', 'reloaded manager retains Chinese');
  process.stdout.write('PASS: reopened settings and reloaded manager retain the selected language\n');
  app.exit(0);
})().catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
