const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const { total, validRecord, normalizeRecords } = vm.runInNewContext(`${source.slice(source.indexOf('const total ='), source.indexOf('try {\n  const saved'))}\n({total,validRecord,normalizeRecords})`, { localDate });
const record = items => ({ id: 'test', date: '2026-10-11', boss: '루시드', character: '캐릭터', party: '', memo: '', split: 3, items });
test('수량 없는 기록은 입력한 가격 합계를 사용한다', () => {
  const r = record([{ name: '아이템 A', price: 150000000 }, { name: '아이템 B', price: 300000000 }]);
  assert.equal(validRecord(r), true);
  assert.equal(total(r), 450000000);
  assert.equal(Math.floor(total(r) / r.split), 150000000);
});
test('이전 수량 기록은 총액을 보존하며 새 형식으로 변환한다', () => {
  const old = record([{ name: '아이템 A', quantity: 2, price: 150000000 }]);
  assert.equal(validRecord(old), true);
  const converted = normalizeRecords([old])[0];
  assert.equal(converted.items[0].price, 300000000);
  assert.equal('quantity' in converted.items[0], false);
  assert.equal(total(converted), total(old));
  assert.equal(validRecord(converted), true);
  assert.equal(normalizeRecords([converted])[0].items[0].price, 300000000);
});
test('변환된 큰 가격도 보존하며 잘못된 가격과 수량을 거부한다', () => {
  assert.equal(validRecord(normalizeRecords([record([{ name: '아이템', quantity: 2, price: 9000000000000 }])])[0]), true);
  for (const item of [{ name: '아이템', price: -1 }, { name: '아이템', price: 1.5 }, { name: '아이템', price: Number.MAX_SAFE_INTEGER + 1 }, { name: '아이템', quantity: 0, price: 100 }]) assert.equal(validRecord(record([item])), false);
  assert.equal(validRecord(record([])), true);
});
