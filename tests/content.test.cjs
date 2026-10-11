const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { validate, generate } = require('../scripts/build-content.cjs');
const bundled = require('../content/catalog.json');

test('설치 파일에 보스 목록을 포함해 네트워크와 사용자 저장소 없이 읽는다', () => {
  const context = vm.createContext({});
  vm.runInContext(generate(bundled), context);
  assert.equal(context.MapleContent.catalog.bosses.length, bundled.bosses.length);
  assert.equal(context.MapleContent.catalog.version, bundled.version);
});
test('새 설치 목록은 이전 콘텐츠 캐시와 관계없이 적용된다', () => {
  const newer = { ...bundled, bosses: [...bundled.bosses, ['새 보스', ['새 난이도']]], items: ['새 아이템'] };
  const context = vm.createContext({});
  vm.runInContext(generate(bundled), context);
  vm.runInContext(generate(newer), context);
  assert.equal(context.MapleContent.catalog.bosses.at(-1)[0], '새 보스');
  assert.equal(context.MapleContent.catalog.items[0], '새 아이템');
});
test('잘못된 보스 목록은 설치 파일 생성 전에 거부한다', () => {
  for (const bad of [{ ...bundled, bosses: [] }, { ...bundled, schemaVersion: 2 }, { ...bundled, updatedAt: '2026-02-30' }, { ...bundled, bosses: [['custom', ['노멀']]] }, { ...bundled, items: ['중복', '중복'] }]) assert.throws(() => validate(bad));
});
