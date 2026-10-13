const test = require('node:test');
const assert = require('node:assert/strict');
const expense = require('../expense-model.js');
const backup = require('../backup.js');
const entry = (price = 100000000) => ({ id: 'test', date: '2026-10-13', character: '듀그', category: '아이템 구매', items: [{ name: '장비 구매', price }], memo: '' });
const legacyEntry = () => ({ id: 'old', date: '2026-10-12', character: '듀그', category: '장비 구매', name: '몽환의 벨트', amount: 123456789, memo: '이전 메모' });
function storage() { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; }
test('잘못된 항목, 날짜, 메모와 중복 ID를 거부한다', () => {
  assert(expense.validData({ entries: [entry()], notes: [] }));
  assert(expense.validEntry(entry(0)));
  for (const value of [1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) assert(!expense.validEntry(entry(value)));
  assert(expense.validEntry(entry(-1)));
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '1899-12-31']) assert(!expense.validEntry({ ...entry(), date }));
  assert(!expense.validData({ entries: [entry(), entry()], notes: [] }));
  assert(!expense.validEntry({ ...entry(), character: ' ' }));
  assert(!expense.validEntry({ ...entry(), category: 'invalid' }));
  assert(!expense.validEntry({ ...entry(), items: [] }));
  assert(!expense.validData({ entries: [], notes: [{ date: '2026-02-29', text: '메모' }] }));
  assert(!expense.validData({ entries: [], notes: [{ date: '2026-10-13', text: 'a' }, { date: '2026-10-13', text: 'b' }] }));
  assert(!expense.validData({ entries: [], notes: [{ date: '2026-10-13', text: 'x'.repeat(2001) }] }));
});
test('항목 여러 개와 큰 금액을 마지막 메소까지 합산한다', () => {
  const record = { ...entry(), items: [{ name: 'A', price: Number.MAX_SAFE_INTEGER }, { name: 'B', price: Number.MAX_SAFE_INTEGER }] };
  assert(expense.validEntry(record));
  assert.equal(expense.amount(record), 18014398509481982n);
  assert.equal(expense.sum([entry(123456789), entry(1)]), 123456790n);
});
test('월별 소비 순위는 분류별로 합산하고 큰 금액도 정확히 정렬한다', () => {
  const records = [
    { ...entry(Number.MAX_SAFE_INTEGER), category: '스타포스' },
    { ...entry(2), category: '스타포스' },
    { ...entry(Number.MAX_SAFE_INTEGER), category: '아이템 구매' },
    { ...entry(100), category: '잠재능력' },
    { ...entry(100), category: '소모품' },
    { ...entry(0), category: '기타' },
    { ...entry(Number.MAX_SAFE_INTEGER), date: '2026-09-30', category: '소모품' }
  ];
  assert.deepEqual(expense.topCategories(records, '2026-10'), [
    { category: '스타포스', total: 9007199254740993n },
    { category: '아이템 구매', total: 9007199254740991n },
    { category: '잠재능력', total: 100n }
  ]);
  assert.deepEqual(expense.topCategories(records, '2026-11'), []);
  assert.deepEqual(expense.topCategories([entry(0), entry(12)], '2026-10'), [{ category: '아이템 구매', total: 12n }]);
});

test('일·주·월 소비 정산은 월과 연도 경계를 넘어 정확한 범위만 포함한다', () => {
  const entries = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-06', '2027-01-07'].map((date, i) => ({ ...entry(i + 1), date }));
  assert.equal(expense.periodTotal(entries, '2027-01-01', '2027-01-01'), 3n);
  assert.equal(expense.periodTotal(entries, '2026-12-31', '2027-01-06'), 9n);
  assert.equal(expense.periodTotal(entries, '2027-01-01', '2027-01-31'), 12n);
});
test('버전 1의 가격·날짜·메모를 보존하며 여러 항목 형식으로 변환한다', () => {
  const saved = storage(), systems = backup.systems(saved);
  systems.set(expense.ID, { entries: [legacyEntry()] }, 1);
  const before = saved.getItem(backup.SYSTEMS_STORAGE), migrated = expense.read(systems);
  assert.deepEqual(migrated, { entries: [{ id: 'old', date: '2026-10-12', character: '듀그', category: '아이템 구매', items: [{ name: '몽환의 벨트', price: 123456789 }], memo: '이전 메모' }], notes: [] });
  assert.equal(saved.getItem(backup.SYSTEMS_STORAGE), before);
  expense.write(systems, { ...migrated, notes: [{ date: '2026-10-13', text: '날짜별 메모' }] });
  assert.equal(systems.get(expense.ID).version, 4);
  assert.equal(expense.sum(expense.read(systems).entries), 123456789n);
});
test('일기와 독립적인 날짜별 메모가 공통 백업을 왕복하고 보스 전용 복원에도 유지된다', () => {
  const from = storage(), to = storage(), data = { entries: [entry()], notes: [{ date: '2026-10-14', text: '기록 없는 날의 메모' }] };
  expense.write(backup.systems(from), data);
  const file = backup.create(from, [{ id: 'boss' }]);
  backup.restore(to, backup.parse(file));
  assert.deepEqual(expense.read(backup.systems(to)), data);
  backup.restore(to, backup.parse({ app: 'maplelog', version: 2, records: [] }));
  assert.deepEqual(expense.read(backup.systems(to)), data);
  expense.write(backup.systems(to), { entries: [], notes: data.notes });
  assert.deepEqual(expense.read(backup.systems(to)).notes, data.notes);
});
test('지원하지 않는 버전과 손상된 기존 데이터를 덮어쓰지 않는다', () => {
  const saved = storage(), systems = backup.systems(saved);
  for (const value of [{ version: 5, data: { future: true } }, { version: 1, data: { entries: [{ ...legacyEntry(), amount: -1 }] } }, { version: 2, data: { entries: [entry(-1)], notes: [] } }, { version: 3, data: { entries: [entry(-1)], notes: [] } }]) {
    systems.set(expense.ID, value.data, value.version); const before = saved.getItem(backup.SYSTEMS_STORAGE);
    assert.throws(() => expense.write(systems, { entries: [], notes: [] }));
    assert.equal(saved.getItem(backup.SYSTEMS_STORAGE), before);
  }
});
test('시작·종료 잔액 계산은 증가한 잔액을 수익으로 처리하고 잘못된 잔액을 거부한다', () => {
  assert.equal(expense.balanceCost(500000000, 376543211), 123456789);
  assert.equal(expense.balanceCost(0, 0), 0);
  assert.equal(expense.balanceCost(Number.MAX_SAFE_INTEGER, 0), Number.MAX_SAFE_INTEGER);
  assert.equal(expense.balanceCost(100, 101), -1);
  for (const [start, end] of [[NaN, 0], [0, NaN], [-1, 0], [1.5, 0], [Number.MAX_SAFE_INTEGER + 1, 0]]) assert(Number.isNaN(expense.balanceCost(start, end)));
  const item = { name: '잔액 차이', price: 123456789, balance: { start: 500000000, end: 376543211 } };
  assert(expense.validEntry({ ...entry(), items: [item] }));
  assert(!expense.validEntry({ ...entry(), items: [{ ...item, price: 123456788 }] }));
});
test('버전 2 일기·메모를 유지하고 잔액 계산 방식을 백업에 보존한다', () => {
  const from = storage(), to = storage(), systems = backup.systems(from);
  const oldData = { entries: [entry()], notes: [{ date: '2026-10-13', text: '기존 메모' }] };
  systems.set(expense.ID, oldData, 2);
  assert.deepEqual(expense.read(systems), oldData);
  const data = expense.read(systems);
  data.entries[0].items.push({ name: '스타포스', price: 300, balance: { start: 1000, end: 700 } });
  expense.write(systems, data);
  backup.restore(to, backup.parse(backup.create(from, [])));
  assert.deepEqual(expense.read(backup.systems(to)), data);
});

test('수익과 소비를 따로 합산하고 순수익을 계산한다', () => {
  const mixed = { ...entry(), category: '도박', items: [{ name: '참가', price: 100 }, { name: '수익', price: -250 }] };
  assert(expense.validEntry(mixed));
  assert.deepEqual(expense.totals([mixed, entry(20)]), { expense: 120n, income: 250n, net: 130n });
  assert.equal(expense.sum([mixed, entry(20)]), -130n);
  assert.equal(expense.periodTotal([mixed], '2026-10-13', '2026-10-13'), -150n);
  assert.deepEqual(expense.topCategories([mixed], '2026-10'), [{ category: '도박', total: 100n }]);
});

test('버전 3 소비는 보존하고 직접·잔액 수익을 버전 4 백업으로 왕복한다', () => {
  const from = storage(), to = storage(), systems = backup.systems(from);
  systems.set(expense.ID, { entries: [entry()], notes: [] }, 3);
  const before = from.getItem(backup.SYSTEMS_STORAGE), data = expense.read(systems);
  assert.equal(from.getItem(backup.SYSTEMS_STORAGE), before);
  data.entries.push({ ...entry(-250), id: 'sale', category: '아이템 판매' });
  data.entries.push({ ...entry(), id: 'balance-profit', items: [{ name: '잠재 판매', price: -200, balance: { start: 100, end: 300 } }] });
  assert(!expense.validData(data, 3));
  assert(!expense.validEntry({ ...data.entries[2], items: [{ name: '불일치', price: -201, balance: { start: 100, end: 300 } }] }));
  expense.write(systems, data);
  assert.equal(systems.get(expense.ID).version, 4);
  backup.restore(to, backup.parse(backup.create(from, [])));
  assert.deepEqual(expense.read(backup.systems(to)), data);
});
