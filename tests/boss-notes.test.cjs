const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const backup = require('../backup.js');
const expense = require('../expense-model.js');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const noteSource = source.slice(source.indexOf("const BOSS_NOTES_ID ="), source.indexOf('function monthRecords()'));
function harness(saved) {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const systems = backup.systems(storage);
  if (saved) systems.set('boss-notes', saved.data, saved.version);
  const elements = new Map();
  const context = vm.createContext({ window: { MapleSystems: systems, addEventListener() {} }, MapleExpense: expense,
    $: id => { if (!elements.has(id)) elements.set(id, { value: '', textContent: '', addEventListener() {} }); return elements.get(id); },
    month: new Date(2026, 9, 1), today: '2026-10-13', selectedDate: null, toast() {}, renderCalendar() {},
    confirmAction: (_, __, callback) => { context.pending = callback; } });
  vm.runInContext(noteSource + '\nrenderBossNote(); globalThis.api = { readBossNotes, saveBossNote, guardBossNote, renderBossNote };', context);
  return { context, elements, systems, storage, api: context.api };
}
test('보스 기록 없이 메모를 저장하고 공통 백업으로 복원한다', () => {
  const h = harness();
  h.elements.get('#boss-note').value = '파티 약속\n20시 보스 도전';
  assert.equal(h.api.saveBossNote(), true);
  const saved = backup.create(h.storage, []);
  const restored = harness();
  backup.restore(restored.storage, backup.parse(saved));
  assert.deepEqual(restored.systems.get('boss-notes'), { version: 1, data: { notes: [{ date: '2026-10-13', text: '파티 약속\n20시 보스 도전' }] } });
  backup.restore(restored.storage, { 'boss-diary': { version: 2, data: [] } });
  assert.equal(restored.systems.get('boss-notes').data.notes.length, 1);
});
test('지원하지 않는 버전·손상된 메모는 덮어쓰지 않는다', () => {
  for (const saved of [
    { version: 2, data: { notes: [] } },
    { version: 1, data: { notes: [{ date: '2026-02-30', text: '원본' }] } },
    { version: 1, data: { notes: [{ date: '2026-10-13', text: 'A' }, { date: '2026-10-13', text: 'B' }] } }
  ]) {
    const h = harness(saved);
    assert.equal(h.elements.get('#boss-save-note').disabled, true);
    assert.equal(h.api.saveBossNote(), false);
    assert.deepEqual(h.systems.get('boss-notes'), saved);
  }
});
test('작성 중인 메모는 저장 확인 전까지 날짜 이동을 막는다', () => {
  const h = harness(); let navigated = false;
  h.elements.get('#boss-note').value = '보스 계획';
  h.api.guardBossNote(() => { navigated = true; });
  assert.equal(navigated, false);
  h.context.pending();
  assert.equal(navigated, true);
  assert.equal(h.systems.get('boss-notes').data.notes[0].text, '보스 계획');
});
test('다른 창에서 변경된 메모와 긴 입력을 덮어쓰지 않는다', () => {
  const h = harness();
  h.elements.get('#boss-note').value = '새 메모';
  h.systems.set('boss-notes', { notes: [{ date: '2026-10-13', text: '다른 창의 메모' }] }, 1);
  assert.equal(h.api.saveBossNote(), false);
  assert.equal(h.systems.get('boss-notes').data.notes[0].text, '다른 창의 메모');
  const long = harness(); long.elements.get('#boss-note').value = 'A'.repeat(2001);
  assert.equal(long.api.saveBossNote(), false);
  assert.equal(long.systems.get('boss-notes'), null);
});
