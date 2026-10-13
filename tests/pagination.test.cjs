const test = require('node:test');
const assert = require('node:assert/strict');
const { pageOf } = require('../pagination.js');
const list = Array.from({ length: 22 }, (_, i) => i + 1);
test('5개·10개 페이지의 경계와 전체 보기를 유지한다', () => {
  assert.deepEqual(pageOf(list, 1, 5).items, [1, 2, 3, 4, 5]);
  assert.deepEqual(pageOf(list, 5, 5).items, [21, 22]);
  assert.equal(pageOf(list, 3, 10).pages, 3);
  assert.deepEqual(pageOf(list, 3, 10).items, [21, 22]);
  assert.deepEqual(pageOf(list, 8, 'all').items, list);
  assert.equal(pageOf(list, 8, 'all').page, 1);
});
test('삭제나 검색으로 기록 수가 줄어도 빈 마지막 페이지에 남지 않는다', () => {
  assert.equal(pageOf(list.slice(0, 6), 5, 5).page, 2);
  assert.deepEqual(pageOf([], 9, 5), { page: 1, pages: 1, start: 0, end: 0, total: 0, items: [] });
  assert.equal(pageOf(list, -1, 5).page, 1);
});
