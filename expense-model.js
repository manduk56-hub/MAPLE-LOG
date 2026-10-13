'use strict';
const MapleExpense = (() => {
  const ID = 'expense-diary';
  const VERSION = 4;
  const legacyCategories = ['장비 구매', '스타포스', '주문서', '추가옵션', '잠재능력', '에디셔널 잠재능력', '익셉셔널', '소울웨폰', '흔적복구', '반지 연마', '소모품', '기타'];
  const oldCategories = ['아이템 구매', '스타포스', '주문서', '추가옵션', '잠재능력', '에디셔널 잠재능력', '익셉셔널', '소울웨폰', '흔적복구', '특수 스킬', '반지 연마', '소모품', '기타'];
  const categories = [...oldCategories.slice(0, -1), '아이템 판매', '도박', '기타'];
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
    const d = new Date(`${value}T12:00:00`);
    return !isNaN(d) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === value;
  }
  function validBase(e) {
    return !!e && typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 100 && validDate(e.date) &&
      typeof e.character === 'string' && !!e.character.trim() && e.character.length <= 80 &&
      typeof e.memo === 'string' && e.memo.length <= 2000;
  }
  function validLegacyEntry(e) {
    return validBase(e) && typeof e.name === 'string' && !!e.name.trim() && e.name.length <= 100 &&
      legacyCategories.includes(e.category) && Number.isSafeInteger(e.amount) && e.amount >= 0;
  }
  const amount = e => e.items.reduce((s, item) => s + BigInt(item.price), 0n);
  function balanceCost(start, end) {
    if (![start, end].every(value => Number.isSafeInteger(value) && value >= 0)) return NaN;
    return start - end;
  }
  function validEntry(e, version = VERSION) {
    return validBase(e) && (version < 4 ? oldCategories : categories).includes(e.category) && Array.isArray(e.items) && e.items.length >= 1 && e.items.length <= 100 &&
      e.items.every(item => item && typeof item.name === 'string' && !!item.name.trim() && item.name.length <= 100 &&
        Number.isSafeInteger(item.price) && (version >= 4 || item.price >= 0) &&
        (item.balance === undefined || (item.balance && balanceCost(item.balance.start, item.balance.end) === item.price)));
  }
  function validData(data, version = VERSION) {
    if (![1, 2, 3, VERSION].includes(version) || !data || !Array.isArray(data.entries) || data.entries.length > 20000 ||
      !data.entries.every(e => version === 1 ? validLegacyEntry(e) : validEntry(e, version)) || new Set(data.entries.map(e => e.id)).size !== data.entries.length) return false;
    return version === 1 || (Array.isArray(data.notes) && data.notes.length <= 20000 &&
      data.notes.every(note => note && validDate(note.date) && typeof note.text === 'string' && note.text.length <= 2000) &&
      new Set(data.notes.map(n => n.date)).size === data.notes.length);
  }
  function migrate(data, version) {
    if (!validData(data, version)) throw new Error('data');
    if (version >= 2) return JSON.parse(JSON.stringify(data));
    return { entries: data.entries.map(({ name, amount, ...entry }) => ({ ...entry,
      category: entry.category === '장비 구매' ? '아이템 구매' : entry.category, items: [{ name, price: amount }] })), notes: [] };
  }
  function read(systems) {
    const saved = systems.get(ID);
    if (!saved) return { entries: [], notes: [] };
    if (![1, 2, 3, VERSION].includes(saved.version)) throw new Error('version');
    return migrate(saved.data, saved.version);
  }
  function write(systems, data) {
    // Recheck before every mutation so a newly restored future version stays intact.
    read(systems);
    if (!validData(data)) throw new Error('data');
    systems.set(ID, data, VERSION);
  }
  const sum = entries => entries.reduce((s, e) => s + amount(e), 0n);
  function totals(entries) {
    let expense = 0n, income = 0n;
    for (const e of entries) for (const item of e.items) {
      const price = BigInt(item.price);
      if (price > 0n) expense += price; else income -= price;
    }
    return { expense, income, net: income - expense };
  }
  const periodTotal = (entries, start, end) => sum(entries.filter(e => e.date >= start && e.date <= end));
  function topCategories(entries, month) {
    const totals = new Map();
    for (const entry of entries) {
      if (entry.date.slice(0, 7) !== month) continue;
      totals.set(entry.category, (totals.get(entry.category) || 0n) + entry.items.reduce((s, item) => s + (item.price > 0 ? BigInt(item.price) : 0n), 0n));
    }
    return [...totals].filter(([, total]) => total > 0n)
      .sort(([a, x], [b, y]) => x === y ? categories.indexOf(a) - categories.indexOf(b) : x > y ? -1 : 1)
      .slice(0, 3).map(([category, total]) => ({ category, total }));
  }
  return { ID, VERSION, categories, validDate, validEntry, validData, migrate, read, write, balanceCost, amount, sum, totals, periodTotal, topCategories };
})();
if (typeof module !== 'undefined') module.exports = MapleExpense;
