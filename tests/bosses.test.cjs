const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const { BOSS_CATALOG, parseBoss, selectedBossName } = vm.runInNewContext(
  source.slice(source.indexOf('const BOSS_ALIASES'), source.indexOf('const total =')) + '\n({BOSS_CATALOG,parseBoss,selectedBossName})',
  { BOSS_CATALOG: JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '..', 'content/catalog.json'), 'utf8')).bosses }
);
test('스우부터 시작하는 18종 보스는 중복 없이 각 난이도를 제공한다', () => {
  assert.equal(BOSS_CATALOG.length, 18);
  assert.equal(BOSS_CATALOG[0][0], '스우');
  assert.equal(new Set(BOSS_CATALOG.map(([name]) => name)).size, 18);
  for (const [boss, difficulties] of BOSS_CATALOG) {
    assert.ok(difficulties.length);
    for (const difficulty of difficulties) {
      const form = { elements: { boss: { value: boss }, difficulty: { value: difficulty } } };
      const saved = selectedBossName(form);
      assert.equal(saved, `${difficulty} ${boss}`);
      assert.equal(parseBoss(saved).boss, boss);
      assert.equal(parseBoss(saved).difficulty, difficulty);
    }
  }
});
test('기존 축약 이름은 복원하고 비공식 난이도와 사용자 보스는 보존한다', () => {
  assert.equal(parseBoss('하드 듄켈').boss, '친위대장 듄켈');
  assert.equal(parseBoss('노말 세렌').difficulty, '노멀');
  for (const name of ['이지 시그너스', '우르스', '스토리 데미안']) {
    assert.equal(parseBoss(name).boss, 'custom');
    assert.equal(parseBoss(name).custom, name);
  }
  assert.equal(parseBoss('검은 마법사').difficulty, '');
});
test('지원하지 않는 보스 난이도 조합은 저장할 수 없다', () => {
  assert.equal(selectedBossName({ elements: { boss: { value: '감시자 칼로스' }, difficulty: { value: '하드' } } }), '');
  assert.equal(selectedBossName({ elements: { boss: { value: '루시드' }, difficulty: { value: '' } } }), '');
});
