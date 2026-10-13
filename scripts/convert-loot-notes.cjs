'use strict';
// Preserve source amounts; only finalize records using explicitly confirmed settings.
const fs = require('node:fs');
const path = require('node:path');
const [input, output = 'imports/loot-notes-draft.json', settingsFile] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/convert-loot-notes.cjs <notes.txt> [output.json] [settings.json]');
const settings = settingsFile ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
const catalog = require('../content/catalog.json').bosses;
const aliases = { 세렌: '선택받은 세렌', 칼로스: '감시자 칼로스', 대적자: '최초의 대적자', 흉성: '찬란한 흉성', 검은마법사: '검은 마법사' };
const entries = [];
let section = null;
const lines = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
for (const [index, raw] of lines.entries()) {
  const line = raw.trim();
  if (!line) continue;
  if (/^\d+월$/.test(line)) { section = Number(line.slice(0, -1)); continue; }
  const match = line.match(/^(.+?)\s*-\s*(\d{1,2})\/(\d{1,3})\s+(\d+)억(?:(\d+)천)?\s*\[([^\]]+?)\]?\s*\/\s*((?:(?:노말|노멀|하드|카오스|익스트림)\s+\S+|노흉|발드릭스))$/);
  if (!match) throw new Error(`Unparsed line ${index + 1}: ${line}`);
  const [, item, monthText, dayText, eok, thousand, names, bossText] = match;
  const month = Number(monthText), day = Number(dayText);
  if (month !== section || month < 1 || month > 12 || day < 1 || day > new Date(2000, month, 0).getDate()) throw new Error(`Invalid date on line ${index + 1}`);
  const price = Number(eok) * 100000000 + Number(thousand || 0) * 10000000;
  if (!Number.isSafeInteger(price)) throw new Error(`Invalid amount on line ${index + 1}`);
  const participants = names.split(/[,/]/).map(name => name.trim()).filter(Boolean);
  const issues = [];
  let boss = null, difficulty = null;
  if (bossText === '노흉') {
    boss = '찬란한 흉성'; issues.push('노흉이 노멀 찬란한 흉성인지 확인');
  } else {
    const bossMatch = bossText.match(/^(노말|노멀|하드|카오스|익스트림)\s+(.+)$/);
    const name = bossMatch ? bossMatch[2] : bossText;
    boss = aliases[name] || name;
    difficulty = bossMatch ? bossMatch[1].replace('노말', '노멀') : null;
    const allowed = catalog.find(([name]) => name === boss)?.[1];
    if (!allowed) issues.push('프로그램 보스 목록에 없는 보스');
    if (!difficulty) issues.push('난이도 확인 필요');
    else if (!allowed?.includes(difficulty)) issues.push('프로그램에 없는 난이도: 원문 의미 확인 필요');
  }
  const override = settings.bossOverrides?.[bossText];
  if (override) {
    boss = override.boss; difficulty = override.difficulty;
    issues.length = 0;
    if (!catalog.some(([name, difficulties]) => name === boss && difficulties.includes(difficulty))) throw new Error(`Invalid boss override: ${bossText}`);
  }
  entries.push({
    sourceLine: index + 1, sourceText: raw, month, day,
    date: settings.year ? `${settings.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null,
    item: item.trim().replace('컨티뉴어스링', '컨티뉴어스 링'),
    amountMeso: price, amountBasis: settings.amountBasis || 'unconfirmed',
    participantsText: names.trim(), participants,
    character: settings.firstParticipantIsCharacter ? participants[0] : null,
    party: settings.firstParticipantIsCharacter ? participants.slice(1).join(', ') : null,
    split: settings.splitByParticipantCount ? participants.length : null,
    bossText, boss, difficulty, issues,
    corrections: [
      ...(dayText.length > 2 ? [`${monthText}/${dayText} → ${month}/${day}`] : []),
      ...(!line.includes(']') ? ['닫는 대괄호 누락 보완'] : []),
      ...(item.includes('컨티뉴어스링') ? ['컨티뉴어스링 → 컨티뉴어스 링'] : [])
    ]
  });
}
const months = [...new Set(entries.map(entry => entry.month))].sort((a, b) => a - b).map(month => ({
  month, itemCount: entries.filter(entry => entry.month === month).length,
  amountMeso: entries.filter(entry => entry.month === month).reduce((sum, entry) => sum + entry.amountMeso, 0)
}));
const result = {
  format: 'maplelog-loot-notes-draft', version: 1, status: 'awaiting-clarification',
  source: path.basename(input),
  pending: ['기록 연도', '첫 이름이 내 캐릭터인지', '쉼표와 슬래시 의미 및 분배 인원', '판매 수수료 차감 여부 및 수수료율'],
  summary: { itemCount: entries.length, amountMeso: entries.reduce((sum, entry) => sum + entry.amountMeso, 0), months },
  entries
};
result.pending = [
  ...(!settings.year ? ['기록 연도'] : []),
  ...(!settings.firstParticipantIsCharacter ? ['첫 이름이 내 캐릭터인지'] : []),
  ...(!settings.splitByParticipantCount ? ['분배 인원'] : []),
  ...(!settings.amountBasis ? ['가격 기준'] : []),
  ...(entries.some(e => e.issues.length) ? ['보스 난이도 확인'] : [])
];
const ready = !result.pending.length;
result.status = ready ? 'confirmed' : 'awaiting-clarification';
if (ready) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = JSON.stringify([entry.date, entry.boss, entry.difficulty, entry.character, entry.party, entry.split]);
    if (!grouped.has(key)) grouped.set(key, { id: `loot-notes-${entry.date}-${entry.sourceLine}`,
      date: entry.date, boss: `${entry.difficulty} ${entry.boss}`, character: entry.character,
      party: entry.party, split: entry.split, items: [], sourceLines: [] });
    const record = grouped.get(key);
    record.items.push({ name: entry.item, price: entry.amountMeso });
    record.sourceLines.push(entry.sourceLine);
  }
  result.records = [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ sourceLines, ...record }) => ({
    ...record, memo: `경매장 등록가 기준, 수수료 미차감. 원문: ${path.basename(input)} ${sourceLines.join(', ')}행.`
  }));
  result.summary.recordCount = result.records.length;
}
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
const csv = [['원문행', '월', '일', '아이템', '원문금액(메소)', '명단원문', '분리한명단', '보스', '난이도', '확인사항'],
  ...entries.map(e => [e.sourceLine, e.month, e.day, e.item, e.amountMeso, e.participantsText, e.participants.join(', '), e.boss, e.difficulty || '', e.issues.join('; ')])]
  .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
fs.writeFileSync(output.replace(/\.json$/, '') + '.csv', '\uFEFF' + csv + '\r\n', 'utf8');
if (ready) {
  const backup = { app: 'maplelog', version: 3, exportedAt: new Date().toISOString(),
    systems: { 'boss-diary': { version: 2, data: result.records } } };
  fs.writeFileSync(output.replace(/\.json$/, '') + '-복원.json', JSON.stringify(backup, null, 2) + '\n', 'utf8');
}
console.log(JSON.stringify({ output, summary: result.summary, issues: entries.filter(e => e.issues.length).map(e => ({ line: e.sourceLine, text: e.sourceText, issues: e.issues })) }, null, 2));
