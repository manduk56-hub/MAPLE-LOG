// Run with node tests/upgrade-smoke.cjs <old app.asar> <new app.asar>.
// Both versions use a disposable profile; the user's real diary is never opened.
const fs = require('node:fs');
const path = require('node:path');
const expected = [{ id: 'upgrade-test', date: '2026-10-11', boss: '스토리 예전 보스', character: '보존 확인', party: '파티원', split: 3, memo: '설치 경로가 달라도 유지', items: [{ name: '예전 아이템', quantity: 2, price: 123456789 }] }];

if (process.argv.includes('--profile-test')) {
  const { app } = require('electron');
  const [profileRoot, application, mode, output] = process.argv.slice(process.argv.indexOf('--profile-test') + 1);
  const originalGetPath = app.getPath.bind(app);
  app.getPath = name => name === 'appData' ? profileRoot : originalGetPath(name);
  app.getAppPath = () => application;
  app.on('browser-window-created', (_event, window) => {
    window.on('show', () => window.hide());
    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await window.webContents.executeJavaScript(mode === 'seed'
          ? `localStorage.setItem('maplelog.records.v1', ${JSON.stringify(JSON.stringify(expected))}); ({saved: JSON.parse(localStorage.getItem('maplelog.records.v1')), origin: location.origin})`
          : `(() => {
              openEditor(records[0]);
              const retainedBoss = selectedBossName(document.querySelector('#record-form'));
              document.querySelector('#editor').close();
              openEditor();
              const newBossOptions = Array.from(document.querySelector('#record-form').elements.boss.options).map(option => option.value);
              return {saved: JSON.parse(localStorage.getItem('maplelog.records.v1')), loaded: records, parsed: parseBoss(records[0].boss), origin: location.origin, catalogCount: BOSS_CATALOG.length, retainedBoss, newBossOptions};
            })()`);
        fs.writeFileSync(output, JSON.stringify({ ...result, profile: app.getPath('userData') }));
        app.quit();
      } catch (error) { fs.writeFileSync(output, JSON.stringify({ error: error.message })); app.exit(1); }
    });
  });
  require(path.join(application, 'desktop', 'main.cjs'));
} else {
  const { spawnSync } = require('node:child_process');
  const assert = require('node:assert/strict');
  const os = require('node:os');
  const [oldApp, newApp] = process.argv.slice(2).map(value => path.resolve(value));
  if (!oldApp || !newApp) throw new Error('Provide old and new app.asar paths');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maplelog-upgrade-'));
  const run = (application, mode) => {
    const output = path.join(root, `${mode}.json`);
    const result = spawnSync(require('electron'), [__filename, '--profile-test', root, application, mode, output], { timeout: 30000, windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0 || result.error) throw new Error(`${result.error || result.stderr}\nProfile: ${root}`);
    const data = JSON.parse(fs.readFileSync(output, 'utf8'));
    if (data.error) throw new Error(data.error);
    return data;
  };
  const old = run(oldApp, 'seed');
  const upgraded = run(newApp, 'verify');
  assert.equal(upgraded.profile, old.profile);
  assert.equal(upgraded.origin, old.origin);
  assert.deepEqual(upgraded.saved, expected);
  assert.deepEqual(upgraded.loaded, expected.map(record => ({ ...record, items: [{ name: '예전 아이템', price: 246913578 }] })));
  assert.equal(upgraded.parsed.custom, expected[0].boss);
  assert.ok(upgraded.catalogCount > 0);
  assert.equal(upgraded.retainedBoss, expected[0].boss);
  assert.equal(upgraded.newBossOptions.includes('custom'), false);
  assert.equal(upgraded.newBossOptions.includes('legacy'), false);
  console.log('PASS: Different installation paths retain the exact stored diary, legacy totals, and custom boss names.');
  console.log(`Disposable test profile: ${root}`);
}
