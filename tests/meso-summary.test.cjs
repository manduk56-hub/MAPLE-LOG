const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const total = r => r.items.reduce((s, i) => s + i.price, 0);
const functions = source.slice(source.indexOf('function mapleWeek'), source.indexOf('function renderIncome')) + source.slice(source.indexOf('function mesoPeriod'), source.indexOf('function renderMesoSummary'));
const { mesoPeriod, mesoAggregate } = vm.runInNewContext(functions + '\n({mesoPeriod,mesoAggregate})', { localDate, total, MapleExpense: require('../expense-model.js') });

test('일·주·월·전체 범위와 윤년·연도 경계를 계산한다', () => {
  assert.equal(mesoPeriod('day', '2027-01-01').start, '2027-01-01');
  assert.equal(mesoPeriod('week', '2027-01-01').start, '2026-12-31');
  assert.equal(mesoPeriod('week', '2027-01-01').end, '2027-01-06');
  assert.equal(mesoPeriod('month', '2024-02-12').end, '2024-02-29');
  assert.equal(mesoPeriod('all', '2027-01-01').end, '9999-12-31');
});
test('모든 캐릭터의 처치·획득 수와 분배 수익, 지출만의 분류 순위를 집계한다', () => {
  const bosses = [
    { date: '2026-10-08', split: 3, items: [{ price: 10 }, { price: 1 }] },
    { date: '2026-10-14', split: 1, items: [] },
    { date: '2026-10-15', split: 1, items: [{ price: 999 }] }
  ];
  const entries = [
    { date: '2026-10-08', category: '스타포스', items: [{ price: 100 }, { price: -200 }] },
    { date: '2026-10-09', category: '아이템 구매', items: [{ price: 100 }] },
    { date: '2026-10-10', category: '주문서', items: [{ price: 20 }] },
    { date: '2026-10-14', category: '도박', items: [{ price: 30 }] },
    { date: '2026-10-15', category: '기타', items: [{ price: 999 }] }
  ];
  const result = mesoAggregate(bosses, entries, '2026-10-08', '2026-10-14');
  assert.equal(result.runs, 2);
  assert.equal(result.items, 2);
  assert.equal(result.income, 203n);
  assert.equal(result.expense, 250n);
  assert.equal(JSON.stringify(result.ranking.map(([name]) => name)), JSON.stringify(['아이템 구매', '스타포스', '도박']));
  assert.equal(mesoAggregate(bosses, entries, '1900-01-01', '9999-12-31').runs, 3);
});
test('빈 기록과 안전 정수 범위를 넘는 누적 금액도 정확하다', () => {
  assert.equal(mesoAggregate([], [], '1900-01-01', '9999-12-31').ranking.length, 0);
  const bosses = [1, 2].map(() => ({ date: '2026-10-14', split: 1, items: [{ price: Number.MAX_SAFE_INTEGER }] }));
  assert.equal(mesoAggregate(bosses, [], '2026-10-14', '2026-10-14').income, 18014398509481982n);
});
