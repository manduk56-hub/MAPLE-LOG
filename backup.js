'use strict';
// Additional systems share this store; the existing boss diary storage key stays intact.
const MapleBackup = (() => {
  const SYSTEMS_STORAGE = 'maplelog.systems.v1';
  const BOSS_STORAGE = 'maplelog.records.v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  function validSystems(systems) {
    return systems && typeof systems === 'object' && !Array.isArray(systems) &&
      Object.entries(systems).every(([id, entry]) => /^[a-z][a-z0-9-]{0,63}$/.test(id) &&
        entry && Number.isSafeInteger(entry.version) && entry.version >= 1 && Object.hasOwn(entry, 'data'));
  }
  function readSystems(storage) {
    const systems = JSON.parse(storage.getItem(SYSTEMS_STORAGE) || '{}');
    if (!validSystems(systems) || Object.hasOwn(systems, 'boss-diary')) throw new Error('Invalid systems');
    return systems;
  }
  function create(storage, records) {
    return { app: 'maplelog', version: 3, exportedAt: new Date().toISOString(),
      systems: { ...readSystems(storage), 'boss-diary': { version: 2, data: clone(records) } } };
  }
  function parse(data) {
    if (!data || data.app !== 'maplelog') throw new Error('Invalid backup');
    if ([1, 2].includes(data.version) && Array.isArray(data.records)) {
      return { 'boss-diary': { version: data.version, data: clone(data.records) } };
    }
    if (data.version !== 3 || !validSystems(data.systems) || !Object.keys(data.systems).length) throw new Error('Invalid backup');
    return clone(data.systems);
  }
  function restore(storage, systems) {
    if (!validSystems(systems)) throw new Error('Invalid systems');
    const extra = { ...systems }; delete extra['boss-diary'];
    // An old diary-only backup leaves newer systems alone. Unknown systems are retained too.
    const changes = [];
    if (Object.keys(extra).length) changes.push([SYSTEMS_STORAGE, JSON.stringify({ ...readSystems(storage), ...extra })]);
    if (Object.hasOwn(systems, 'boss-diary')) changes.push([BOSS_STORAGE, JSON.stringify(systems['boss-diary'].data)]);
    const previous = changes.map(([key]) => [key, storage.getItem(key)]);
    const written = [];
    try {
      for (const [key, value] of changes) { storage.setItem(key, value); written.push(key); }
    } catch (error) {
      for (const [key, value] of previous.reverse()) {
        if (written.includes(key)) { if (value === null) storage.removeItem(key); else storage.setItem(key, value); }
      }
      throw error;
    }
  }
  function systems(storage) {
    return Object.freeze({
      get(id) { const saved = readSystems(storage); return Object.hasOwn(saved, id) ? clone(saved[id]) : null; },
      set(id, data, version = 1) {
        if (id === 'boss-diary') throw new Error('Use the diary save function');
        const next = { ...readSystems(storage), [id]: { version, data: clone(data) } };
        if (!validSystems(next)) throw new Error('Invalid system');
        storage.setItem(SYSTEMS_STORAGE, JSON.stringify(next));
      }
    });
  }
  return { SYSTEMS_STORAGE, create, parse, restore, systems };
})();
if (typeof module !== 'undefined') module.exports = MapleBackup;
