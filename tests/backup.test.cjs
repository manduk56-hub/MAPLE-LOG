const test = require('node:test');
const assert = require('node:assert/strict');
const backup = require('../backup.js');
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test('all systems travel together, including systems unknown to this app', () => {
  const from = storage(), to = storage();
  backup.systems(from).set('future-system', { rows: [{ id: 1 }] }, 7);
  const diary = [{ id: 'diary' }];
  backup.restore(to, backup.parse(backup.create(from, diary)));
  assert.deepEqual(JSON.parse(to.getItem('maplelog.records.v1')), diary);
  assert.deepEqual(backup.systems(to).get('future-system'), { version: 7, data: { rows: [{ id: 1 }] } });
  assert.deepEqual(backup.create(to, diary).systems, backup.create(from, diary).systems);
});
test('version 1 and 2 diary backups do not erase newer systems', () => {
  for (const version of [1, 2]) {
    const saved = storage(); backup.systems(saved).set('new-menu', { balance: 100 });
    backup.restore(saved, backup.parse({ app: 'maplelog', version, records: [] }));
    assert.deepEqual(backup.systems(saved).get('new-menu').data, { balance: 100 });
    assert.deepEqual(JSON.parse(saved.getItem('maplelog.records.v1')), []);
  }
});
test('partial system backups replace included systems and preserve the rest', () => {
  const saved = storage(); saved.setItem('maplelog.records.v1', '[{"id":"keep"}]');
  backup.systems(saved).set('first', [1]); backup.systems(saved).set('second', [2]);
  backup.restore(saved, backup.parse({ app: 'maplelog', version: 3, systems: { first: { version: 2, data: [] } } }));
  assert.deepEqual(backup.systems(saved).get('first'), { version: 2, data: [] });
  assert.deepEqual(backup.systems(saved).get('second').data, [2]);
  assert.equal(saved.getItem('maplelog.records.v1'), '[{"id":"keep"}]');
});
test('a failed diary write rolls back additional system changes', () => {
  const saved = storage(); backup.systems(saved).set('future', [1]);
  saved.setItem('maplelog.records.v1', '[]');
  const before = saved.getItem(backup.SYSTEMS_STORAGE), write = saved.setItem;
  saved.setItem = (key, value) => { if (key === 'maplelog.records.v1') throw new Error('quota'); write(key, value); };
  assert.throws(() => backup.restore(saved, { future: { version: 1, data: [2] }, 'boss-diary': { version: 2, data: [{ id: 'new' }] } }), /quota/);
  assert.equal(saved.getItem(backup.SYSTEMS_STORAGE), before);
  assert.equal(saved.getItem('maplelog.records.v1'), '[]');
});
test('invalid backups and corrupt stored systems are rejected without overwrite', () => {
  for (const data of [null, { app: 'other', version: 3, systems: {} }, { app: 'maplelog', version: 4, systems: {} }, { app: 'maplelog', version: 3, systems: { bad: { version: 0, data: [] } } }]) assert.throws(() => backup.parse(data));
  const saved = storage(); saved.setItem(backup.SYSTEMS_STORAGE, 'broken');
  assert.throws(() => backup.create(saved, []));
  assert.equal(saved.getItem(backup.SYSTEMS_STORAGE), 'broken');
});
