const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const { mapleMoney, mapleWeek, periodIncome } = vm.runInNewContext(source.slice(source.indexOf('function mapleMoney'), source.indexOf('function renderIncome')) + '\n({mapleMoney,mapleWeek,periodIncome})', {localDate, total: r => r.items.reduce((s, i) => s + i.price, 0)});
test('금액을 반올림하거나 축약하지 않고 마지막 메소까지 표시한다', () => {
  assert.equal(mapleMoney(111111111), '1억 1111만 1111 메소');
  assert.equal(mapleMoney(5000000000), '50억 메소');
  assert.equal(mapleMoney(0), '0 메소');
  assert.equal(mapleMoney(9007199254740993n), '9007조 1992억 5474만 993 메소');
});
test('목요일 시작과 수요일 종료는 월·연도 경계를 넘어 유지된다', () => {
  for (const day of ['2026-10-08','2026-10-11','2026-10-14']) {
    assert.equal(mapleWeek(day).start, '2026-10-08');
    assert.equal(mapleWeek(day).end, '2026-10-14');
  }
  assert.equal(mapleWeek('2026-10-15').start, '2026-10-15');
  assert.equal(mapleWeek('2027-01-01').start, '2026-12-31');
  assert.equal(mapleWeek('2027-01-01').end, '2027-01-06');
});
test('일별·주별 수익은 해당 기간만 포함하고 내 몫은 기록별 나머지를 버린다', () => {
  const rows = ['2026-10-07','2026-10-08','2026-10-11','2026-10-14','2026-10-15'].map(date => ({date, split:3, items:[{price:10}]}));
  assert.equal(periodIncome(rows,'2026-10-08','2026-10-14'),9n);
  assert.equal(periodIncome(rows,'2026-10-11','2026-10-11'),3n);
  assert.equal(periodIncome(rows,'2026-10-08','2026-10-14','total'),30n);
  assert.equal(periodIncome([], '2026-10-08','2026-10-14'),0n);
  const large = [1,2].map(() => ({date:'2026-10-11',split:1,items:[{price:Number.MAX_SAFE_INTEGER}]}));
  assert.equal(periodIncome(large,'2026-10-08','2026-10-14'),18014398509481982n);
});
