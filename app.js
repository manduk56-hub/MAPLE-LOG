'use strict';
const $ = selector => document.querySelector(selector);
if (location.protocol === 'maplelog:') {
  $('.local-label').innerHTML = '<span></span> 이 PC에 자동 저장';
  $('.header-right').innerHTML = '메이플로그 데스크톱 <span class="avatar">M</span>';
}
const STORAGE = 'maplelog.records.v1';
window.MapleSystems = MapleBackup.systems(localStorage);
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = localDate();
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = null;
let records = [];
let editingId = null;
let storageReady = true;
let toastTimer;
const bossPager = MaplePagination.create($('#records').closest('.records-panel'), '수익 기록', renderRecords);
const money = value => mapleMoney(value);
// 한국 메이플스토리 공식 보스 가이드 기준. 저장 형식은 기존의 '난이도 보스명'을 유지한다.
const BOSS_CATALOG = MapleContent.catalog.bosses;
const BOSS_ALIASES = { '듄켈': '친위대장 듄켈', '세렌': '선택받은 세렌', '칼로스': '감시자 칼로스', '반 레온': '반레온', '블러디 퀸': '블러디퀸' };
let preservedBossName = '';
function parseBoss(value) {
  for (const [boss, difficulties] of BOSS_CATALOG) {
    for (const difficulty of difficulties) {
      if (value.trim() === `${difficulty} ${boss}`) return { boss, difficulty, custom: '' };
    }
  }
  const match = value.trim().match(/^(이지|노멀|노말|하드|카오스|익스트림)\s+(.+)$/);
  const name = match ? match[2] : value.trim();
  const boss = BOSS_ALIASES[name] || name;
  const entry = BOSS_CATALOG.find(([name]) => name === boss);
  const difficulty = match ? match[1].replace('노말', '노멀') : '';
  if (!entry || (difficulty && !entry[1].includes(difficulty))) return { boss: 'custom', difficulty: '', custom: value };
  return { boss, difficulty, custom: '' };
}
function updateBossDifficulty(value = '') {
  const form = $('#record-form');
  const legacy = form.elements.boss.value === 'legacy';
  const difficulties = BOSS_CATALOG.find(([name]) => name === form.elements.boss.value)?.[1] || [];
  form.elements.difficulty.innerHTML = '<option value="">난이도 선택</option>' + difficulties.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  form.elements.difficulty.value = difficulties.includes(value) ? value : '';
  form.elements.difficulty.disabled = !difficulties.length;
  form.elements.difficulty.required = !legacy;
}
function selectedBossName(form) {
  if (form.elements.boss.value === 'legacy') return preservedBossName;
  const entry = BOSS_CATALOG.find(([name]) => name === form.elements.boss.value);
  return entry?.[1].includes(form.elements.difficulty.value) ? `${form.elements.difficulty.value} ${entry[0]}` : '';
}
const total = record => record.items.reduce((sum, item) => sum + (item.quantity ?? 1) * item.price, 0);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
function validRecord(record) {
  if (!record || typeof record.id !== 'string' || !record.id || typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return false;
  const parsed = new Date(`${record.date}T12:00:00`);
  if (isNaN(parsed) || localDate(parsed) !== record.date || record.date < '1900-01-01' || record.date > '9999-12-31') return false;
  if (![record.boss, record.character].every(v => typeof v === 'string' && v.trim() && v.length <= 80)) return false;
  if (typeof record.party !== 'string' || record.party.length > 1000 || typeof record.memo !== 'string' || record.memo.length > 2000) return false;
  if (!Number.isInteger(record.split) || record.split < 1 || record.split > 100 || !Array.isArray(record.items) || record.items.length > 100) return false;
  if (!record.items.every(item => item && typeof item.name === 'string' && item.name.trim() && item.name.length <= 100 && (item.quantity === undefined || (Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 9999)) && Number.isSafeInteger(item.price) && item.price >= 0 && item.price <= Number.MAX_SAFE_INTEGER)) return false;
  return Number.isSafeInteger(total(record));
}
function normalizeRecords(list) {
  return list.map(record => ({ ...record, items: record.items.map(item => ({ name: item.name, price: item.price * (item.quantity ?? 1) })) }));
}
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]');
  if (!Array.isArray(saved) || !saved.every(validRecord) || new Set(saved.map(r => r.id)).size !== saved.length) throw new Error('Invalid data');
  records = normalizeRecords(saved);
} catch (error) { storageReady = false; toast('저장된 기록을 읽지 못했어요. 기존 데이터는 보존되며, 백업 복원으로 복구할 수 있어요.'); }
function save(next) {
  if (!storageReady) { toast('기존 데이터를 보호하기 위해 저장을 중단했어요. 백업을 복원해주세요.'); return false; }
  try { localStorage.setItem(STORAGE, JSON.stringify(next)); records = next; return true; }
  catch (error) { toast('저장 공간이 부족하거나 브라우저 저장이 차단되어 있어요. 백업 후 다시 시도해주세요.'); return false; }
}
const BOSS_NOTES_ID = 'boss-notes';
let bossNotes = [], bossNotesReady = true, bossNoteDate = null;
function readBossNotes() {
  const saved = window.MapleSystems.get(BOSS_NOTES_ID);
  if (!saved) return [];
  if (saved.version !== 1) throw new Error('version');
  const notes = saved.data?.notes;
  if (!Array.isArray(notes) || notes.length > 20000 || new Set(notes.map(n => n?.date)).size !== notes.length ||
    !notes.every(n => n && MapleExpense.validDate(n.date) && typeof n.text === 'string' && n.text.length <= 2000)) throw new Error('data');
  return notes;
}
try { bossNotes = readBossNotes(); }
catch { bossNotesReady = false; $('#boss-note').disabled = true; $('#boss-save-note').disabled = true; }
const savedBossNote = date => bossNotes.find(n => n.date === date)?.text || '';
const bossNoteDirty = () => bossNoteDate && $('#boss-note').value !== savedBossNote(bossNoteDate);
function renderBossNote() {
  const viewedMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const date = selectedDate || (viewedMonth === today.slice(0, 7) ? today : `${viewedMonth}-01`);
  if (bossNoteDate !== date) {
    bossNoteDate = date; $('#boss-note').value = savedBossNote(date);
    $('#boss-note-status').textContent = !bossNotesReady ? '메모를 읽지 못했어요. 백업을 확인해주세요.' : savedBossNote(date) ? '저장된 메모' : '메모를 남겨보세요';
  }
  $('#boss-note-date').textContent = `${date.replaceAll('-', '. ')} · ${selectedDate ? '선택한 날' : date === today ? '오늘' : '이 달의 첫날'}`;
}
function saveBossNote() {
  if (!bossNotesReady || !bossNoteDate) return false;
  const text = $('#boss-note').value;
  try {
    const current = readBossNotes();
    if (JSON.stringify(current) !== JSON.stringify(bossNotes)) throw new Error('changed');
    const notes = bossNotes.filter(n => n.date !== bossNoteDate);
    if (text.trim()) notes.push({ date: bossNoteDate, text });
    if (notes.length > 20000 || text.length > 2000) throw new Error('data');
    window.MapleSystems.set(BOSS_NOTES_ID, { notes }, 1);
    bossNotes = notes; $('#boss-note').value = savedBossNote(bossNoteDate);
    $('#boss-note-status').textContent = text.trim() ? '저장했어요' : '빈 메모로 저장했어요';
    renderCalendar(); return true;
  } catch { toast('메모를 저장하지 못했어요. 백업과 저장 공간을 확인한 뒤 새로고침해주세요.'); return false; }
}
function guardBossNote(action) {
  if (!bossNoteDirty()) { action(); return; }
  confirmAction('작성한 메모를 저장할까요?', '날짜나 화면을 이동하기 전에 메모를 저장합니다. 취소하면 현재 화면에서 계속 작성할 수 있어요.', () => { if (saveBossNote()) action(); });
}
$('#boss-note').addEventListener('input', () => { $('#boss-note-status').textContent = bossNoteDirty() ? '저장하지 않은 메모' : '저장된 메모'; });
$('#boss-save-note').onclick = saveBossNote;
window.addEventListener('beforeunload', event => { if (bossNoteDirty()) { event.preventDefault(); event.returnValue = ''; } });
function monthRecords() { return records.filter(r => r.date.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`)); }
function renderCalendar() {
  $('#calendar-title').textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const days = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
  const counts = new Map();
  records.forEach(record => counts.set(record.date, (counts.get(record.date) || 0) + 1));
  $('#calendar').innerHTML = Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localDate(date);
    const count = counts.get(key) || 0, hasNote = bossNotes.some(n => n.date === key && n.text.trim());
    return `<button type="button" data-date="${key}" data-record-count="${count}" data-heat="${count >= 10 ? 5 : count >= 5 ? 4 : count >= 3 ? 3 : count}" class="${date.getMonth() !== month.getMonth() ? 'other-month ' : ''}${key === today ? 'is-today ' : ''}${key === selectedDate ? 'selected ' : ''}${count ? 'has-record ' : ''}${hasNote ? 'has-note' : ''}" title="${key} · 기록 ${count}개${hasNote ? ' · 메모 있음' : ''}" aria-label="${key}, 기록 ${count}개${hasNote ? ', 메모 있음' : ''}${key === today ? ', 오늘' : ''}" aria-pressed="${key === selectedDate}">${date.getDate()}</button>`;
  }).join('');
}
function renderRecordCard(r) {
  const loot = r.items.length ? r.items.map(i => `<div class="loot-row"><span class="loot-name">${escapeHtml(i.name)}</span><span class="loot-price" title="당시 가격 (메소)">${money(i.price)}</span></div>`).join('') : '<div class="loot-row"><span class="loot-name optional">획득 아이템 없음</span></div>';
  return `<article class="record-card compact-record">
    <div class="card-heading"><div class="record-title"><span class="character-tag">${escapeHtml(r.character)}</span>${r.party ? `<span class="card-party"><span class="party-names">${escapeHtml(r.party)}</span></span>` : ''}<h3>${escapeHtml(r.boss)}</h3><time class="record-date" datetime="${r.date}">${r.date.replaceAll('-', '.')}</time></div><div class="card-actions"><button data-edit="${escapeHtml(r.id)}">수정</button><button data-delete="${escapeHtml(r.id)}">삭제</button></div></div>
    <div class="loot-list">${loot}</div>
    <div class="card-totals">${r.items.length > 1 ? `<span>총액 <strong>${money(total(r))}</strong></span>` : ''}<span class="card-share">${r.split}명 · 내 몫 <strong>${money(Math.floor(total(r) / r.split))}</strong></span></div>
    ${r.memo ? `<p class="record-memo">${escapeHtml(r.memo)}</p>` : ''}
  </article>`;
}
function renderRecords() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  const all = monthRecords();
  $('#stat-runs').innerHTML = `${all.length} <small>회</small>`;
  $('#stat-items').innerHTML = `${all.reduce((sum, r) => sum + r.items.length, 0)} <small>개</small>`;
  const sum = all.reduce((s, r) => s + BigInt(total(r)), 0n);
  $('#stat-value').textContent = mapleMoney(sum);
  $('#stat-value').title = `${sum.toLocaleString('ko-KR')} 메소`;
  renderIncome();
  let filtered = all.filter(r => {
    return (!selectedDate || r.date === selectedDate) &&
      [r.boss, r.character, r.party, r.memo, ...r.items.map(i => i.name)].join(' ').toLocaleLowerCase().includes(query);
  });
  const sort = $('#sort').value;
  filtered.sort((a, b) => sort === 'value' ? total(b) - total(a) : sort === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const pageRecords = bossPager.slice(filtered, JSON.stringify([month.getFullYear(), month.getMonth(), selectedDate, query, sort]));
  $('#list-title').innerHTML = `${selectedDate ? `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8))}일의 수익 기록` : '이번 달의 수익 기록'} <span>${filtered.length}</span>`;
  $('#clear-day').disabled = !selectedDate;
  if (!filtered.length) {
    const searching = query;
    $('#records').innerHTML = `<div class="empty-state"><div class="empty-icon">▤</div><h3>${searching ? '검색한 기록이 없어요' : '아직 펼치지 않은 모험 이야기'}</h3><p>${searching ? '다른 검색어로 찾아보세요.' : '보스를 함께한 순간, 반가웠던 득템.<br>첫 번째 일기에 그날의 이야기를 담아보세요.'}</p>${searching ? '' : '<button id="empty-new">＋ 첫 기록 남기기</button>'}</div>`;
    if ($('#empty-new')) $('#empty-new').addEventListener('click', () => openEditor());
    return;
  }
  $('#records').innerHTML = pageRecords.map(renderRecordCard).join('');
}
function render() { renderCalendar(); renderRecords(); renderBossNote(); }
function mapleMoney(value) {
  if ((typeof value !== 'bigint' && !Number.isSafeInteger(value)) || value < 0) return '금액을 확인해주세요';
  let remaining = BigInt(value);
  const parts = [];
  for (const [unit, label] of [[1000000000000n, '조'], [100000000n, '억'], [10000n, '만']]) {
    const amount = remaining / unit;
    if (amount) parts.push(`${amount}${label}`);
    remaining %= unit;
  }
  if (remaining || !parts.length) parts.push(String(remaining));
  return `${parts.join(' ')} 메소`;
}
function mapleWeek(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 3) % 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: localDate(start), end: localDate(end) };
}
function periodIncome(list, start, end, basis = 'share') {
  return list.filter(r => r.date >= start && r.date <= end).reduce((sum, r) => sum + (basis === 'total' ? BigInt(total(r)) : BigInt(total(r)) / BigInt(r.split)), 0n);
}
function renderIncome() {
  const anchor = selectedDate || today;
  const week = mapleWeek(anchor);
  const basis = $('#income-basis').value;
  const daily = periodIncome(records, anchor, anchor, basis);
  const weekly = periodIncome(records, week.start, week.end, basis);
  const monthStart = localDate(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = localDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const monthly = periodIncome(records, monthStart, monthEnd, basis);
  $('#income-day-label').textContent = `${anchor.replaceAll('-', '. ')} · ${selectedDate ? '선택한 날' : '오늘'}`;
  $('#income-week-label').textContent = `${week.start.replaceAll('-', '. ')} ~ ${week.end.replaceAll('-', '. ')} · 목~수`;
  $('#income-month-label').textContent = `${month.getFullYear()}년 ${month.getMonth() + 1}월 · 달력 기준`;
  for (const [selector, value] of [['#income-day', daily], ['#income-week', weekly], ['#income-month', monthly]]) {
    $(selector).textContent = mapleMoney(value);
    $(selector).title = `${value.toLocaleString('ko-KR')} 메소`;
  }
}
function itemPrice(input) {
  if (input.value === input.dataset.formattedPrice) return Number(input.dataset.rawPrice);
  const text = input.value.replaceAll(',', '');
  return /^\d*$/.test(text) ? Number(text) : NaN;
}
function showPriceUnits(input) {
  if (!input.value.trim()) return;
  const value = itemPrice(input);
  if (!Number.isSafeInteger(value) || value < 0) return;
  input.dataset.rawPrice = String(value);
  input.dataset.formattedPrice = mapleMoney(value);
  input.value = input.dataset.formattedPrice;
}
function updatePriceHint(input) {
  input.closest('.item-row').querySelector('.item-price-hint').textContent = input.value.trim() ? mapleMoney(itemPrice(input)) : '';
}
function formatItemPrice(input) {
  if (!/^[0-9,]*$/.test(input.value)) {
    input.setCustomValidity('가격은 0 이상의 정수로 입력해주세요.');
    updatePriceHint(input);
    return;
  }
  input.setCustomValidity('');
  const raw = input.value;
  const digits = raw.replaceAll(',', '').replace(/^0+(?=\d)/, '');
  const rightDigits = raw.slice(input.selectionStart ?? raw.length).replaceAll(',', '').length;
  input.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let cursor = input.value.length;
  for (let remaining = rightDigits; cursor > 0 && remaining > 0; cursor--) {
    if (input.value[cursor - 1] !== ',') remaining--;
  }
  input.setSelectionRange(cursor, cursor);
  updatePriceHint(input);
}
function addItem(item = { name: '', price: '' }) {
  if ($('#item-rows').children.length >= 100) { toast('아이템은 최대 100종류까지 기록할 수 있어요.'); return; }
  const row = document.createElement('div'); row.className = 'item-row';
  row.innerHTML = `<label>아이템 이름<input class="item-name" list="item-suggestions" maxlength="100" placeholder="예: 몽환의 벨트" value="${escapeHtml(item.name)}" required></label><label>당시 가격 (메소)<input class="item-price" type="text" inputmode="numeric" placeholder="0" value="${escapeHtml(item.price === '' ? '' : new Intl.NumberFormat('ko-KR').format(item.price))}" required></label><button class="remove-item" type="button" aria-label="아이템 삭제">×</button><span class="item-price-hint" aria-live="polite"></span>`;
  updatePriceHint(row.querySelector('.item-price'));
  showPriceUnits(row.querySelector('.item-price'));
  row.querySelector('.item-price').addEventListener('focus', event => {
    const input = event.target;
    if (input.value === input.dataset.formattedPrice) input.value = new Intl.NumberFormat('ko-KR').format(itemPrice(input));
  });
  row.querySelector('.item-price').addEventListener('input', event => formatItemPrice(event.target));
  row.querySelector('.item-price').addEventListener('blur', event => showPriceUnits(event.target));
  row.querySelector('button').addEventListener('click', () => { row.remove(); updateTotal(); });
  row.addEventListener('input', updateTotal); $('#item-rows').append(row);
}
function readItems() { return Array.from(document.querySelectorAll('.item-row')).map(row => ({ name: row.querySelector('.item-name').value.trim(), price: itemPrice(row.querySelector('.item-price')) })); }
function updateTotal() { const sum = readItems().reduce((s, i) => s + (Number.isFinite(i.price) ? i.price : 0), 0); const split = Number($('#record-form').elements.split.value); $('#form-total').textContent = mapleMoney(sum); $('#form-share').textContent = Number.isInteger(split) && split >= 1 && split <= 100 ? mapleMoney(Math.floor(sum / split)) : '인원을 입력해주세요'; $('#form-total').title = money(sum); }
function openEditor(record) {
  refreshItemSuggestions();
  refreshCharacterSuggestions();
  const form = $('#record-form'); form.reset(); editingId = record?.id || null;
  preservedBossName = '';
  refreshBossOptions();
  $('#editor-title').textContent = record ? '일기 수정하기' : '새 일기 쓰기';
  for (const field of ['date', 'character', 'party', 'split', 'memo']) form.elements[field].value = record ? record[field] : ({ date: selectedDate || today }[field] || '');
  const bossSelection = record ? parseBoss(record.boss) : { boss: '', difficulty: '', custom: '' };
  // Preserve old names without offering a free-text input for new records.
  if (record && (bossSelection.boss === 'custom' || !bossSelection.difficulty)) {
    preservedBossName = record.boss;
    form.elements.boss.insertAdjacentHTML('beforeend', `<option value="legacy">기존 기록: ${escapeHtml(record.boss)}</option>`);
    form.elements.boss.value = 'legacy';
  } else {
    form.elements.boss.value = bossSelection.boss;
  }
  updateBossDifficulty(bossSelection.difficulty);
  if (!record && records.length) form.elements.character.value = records[records.length - 1].character;
  $('#item-rows').innerHTML = ''; if (record) record.items.forEach(addItem); else addItem();
  $('#form-error').textContent = ''; updateTotal(); $('#editor').showModal();
}
function confirmAction(title, message, callback, destructive = false) {
  $('#confirm-dialog').classList.toggle('destructive-confirm', destructive);
  $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
  $('#confirm-ok').onclick = () => { $('#confirm-dialog').close(); callback(); };
  $('#confirm-dialog').showModal();
}
document.querySelectorAll('[data-shortcut]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.shortcut).click()));
$('#new-record').addEventListener('click', () => openEditor());
$('#close-editor').onclick = $('#cancel-editor').onclick = () => $('#editor').close();
$('#confirm-cancel').onclick = () => $('#confirm-dialog').close();
$('#add-item').onclick = () => addItem();
function refreshBossOptions() {
  const option = ([name]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
  const monthly = BOSS_CATALOG.filter(([name]) => name === '검은 마법사');
  $('#record-form').elements.boss.innerHTML = '<option value="">보스 선택</option>' + BOSS_CATALOG.filter(([name]) => name !== '검은 마법사').map(option).join('') + (monthly.length ? `<option disabled value="monthly-divider">──── 월간 보스 ────</option>${monthly.map(option).join('')}` : '');
}
refreshBossOptions();
$('#record-form').elements.boss.addEventListener('change', () => updateBossDifficulty());
$('#record-form').elements.split.addEventListener('input', updateTotal);
$('#income-basis').addEventListener('change', renderIncome);
$('#record-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  const record = { id: editingId || crypto.randomUUID(), date: form.elements.date.value, boss: selectedBossName(form), character: form.elements.character.value.trim(), party: form.elements.party.value.trim(), split: Number(form.elements.split.value), memo: form.elements.memo.value.trim(), items: readItems() };
  if (!validRecord(record)) { $('#form-error').textContent = '입력 내용을 확인해주세요. 이름은 공백일 수 없으며 합계는 안전한 정수 범위여야 합니다.'; return; }
  const next = editingId ? records.map(r => r.id === editingId ? record : r) : [...records, record];
  if (!save(next)) return;
  $('#editor').close(); toast('그날의 모험을 저장했어요.');
  guardBossNote(() => { month = new Date(`${record.date.slice(0, 7)}-01T12:00:00`); selectedDate = record.date; $('#search').value = ''; render(); });
});
$('#calendar').addEventListener('click', event => { const button = event.target.closest('[data-date]'); if (!button) return; guardBossNote(() => { selectedDate = button.dataset.date === selectedDate ? null : button.dataset.date; if (selectedDate) month = new Date(`${selectedDate.slice(0, 7)}-01T12:00:00`); render(); }); });
function changeMonth(amount) { const next = new Date(month.getFullYear(), month.getMonth() + amount, 1); if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return; guardBossNote(() => { month = next; selectedDate = null; render(); }); }
function changeDay(amount) {
  const anchor = new Date(`${selectedDate || today}T12:00:00`);
  const next = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + amount, 12);
  if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
  guardBossNote(() => { selectedDate = localDate(next); month = new Date(next.getFullYear(), next.getMonth(), 1); render(); });
}
let pickerMonth = null, onPickerMonth = null;
function renderMonthPicker() {
  const year = Number($('#picker-year').value);
  $('#picker-months').innerHTML = Array.from({ length: 12 }, (_, i) => {
    const active = year === pickerMonth.getFullYear() && i === pickerMonth.getMonth();
    return `<button type="button" data-month="${i}" aria-pressed="${active}" class="${active ? 'active' : ''}">${i + 1}월</button>`;
  }).join('');
  $('#prev-year').disabled = year <= 1900;
  $('#next-year').disabled = year >= 9999;
}
function openMonthPicker(currentMonth, onSelect) {
  pickerMonth = currentMonth;
  onPickerMonth = onSelect;
  $('#picker-year').value = currentMonth.getFullYear();
  renderMonthPicker();
  $('#month-picker').showModal();
}
$('#calendar-title').onclick = () => openMonthPicker(month, nextMonth => {
  guardBossNote(() => { month = nextMonth; selectedDate = null; render(); });
});
$('#close-month-picker').onclick = () => $('#month-picker').close();
$('#picker-year').addEventListener('input', renderMonthPicker);
function changePickerYear(amount) {
  const input = $('#picker-year');
  if (!input.reportValidity()) return;
  input.value = Math.min(9999, Math.max(1900, Number(input.value) + amount));
  renderMonthPicker();
}
$('#prev-year').onclick = () => changePickerYear(-1);
$('#next-year').onclick = () => changePickerYear(1);
$('#picker-months').addEventListener('click', event => {
  const button = event.target.closest('[data-month]');
  if (!button || !$('#picker-year').reportValidity()) return;
  const nextMonth = new Date(Number($('#picker-year').value), Number(button.dataset.month), 1);
  $('#month-picker').close();
  onPickerMonth(nextMonth);
});
$('#prev-month').onclick = () => changeMonth(-1); $('#next-month').onclick = () => changeMonth(1);
$('#prev-day').onclick = () => changeDay(-1); $('#next-day').onclick = () => changeDay(1);
$('#today').onclick = () => guardBossNote(() => { month = new Date(`${today.slice(0, 7)}-01T12:00:00`); selectedDate = today; render(); });
$('#clear-day').onclick = () => guardBossNote(() => { selectedDate = null; render(); });
$('#search').addEventListener('input', renderRecords); $('#sort').addEventListener('change', renderRecords);
$('#records').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit]'); const remove = event.target.closest('[data-delete]');
  if (edit) openEditor(records.find(r => r.id === edit.dataset.edit));
  if (remove) confirmAction('이 일기를 삭제할까요?', '삭제한 기록은 되돌릴 수 없어요. 필요한 기록은 먼저 백업해주세요.', () => { if (save(records.filter(r => r.id !== remove.dataset.delete))) { render(); toast('일기를 삭제했어요.'); } }, true);
});
$('#export').onclick = () => {
  if (!storageReady) { toast('기록을 읽을 수 없어 백업을 만들지 못했어요.'); return; }
  let backup;
  try { backup = MapleBackup.create(localStorage, records); }
  catch (error) { toast('저장된 시스템 데이터를 읽지 못해 백업을 만들지 못했어요.'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `메이플로그-${today}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('기록 백업을 다운로드했어요.');
};
$('#import').onclick = () => $('#import-file').click();
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 10000000) throw new Error('size');
    const data = JSON.parse(await file.text());
    const systems = MapleBackup.parse(data);
    const diary = systems['boss-diary'];
    const expense = systems[MapleExpense.ID];
    if (expense && [1, 2, 3, MapleExpense.VERSION].includes(expense.version) && !MapleExpense.validData(expense.data, expense.version)) throw new Error('expense-format');
    if (diary) {
      if (![1, 2].includes(diary.version) || !Array.isArray(diary.data) || diary.data.length > 20000 || !diary.data.every(validRecord) || new Set(diary.data.map(r => r.id)).size !== diary.data.length) throw new Error('format');
      diary.data = normalizeRecords(diary.data); diary.version = 2;
    }
    const description = `${diary ? `보스 일기 ${diary.data.length}개와 ` : ''}백업에 포함된 시스템 데이터를 교체합니다. 파일에 없는 시스템은 그대로 유지합니다. 현재 데이터가 필요하면 먼저 백업해주세요.`;
    confirmAction('백업을 복원할까요?', description, () => {
      try { MapleBackup.restore(localStorage, systems); }
      catch (error) { toast('백업을 저장하지 못했어요. 저장 공간과 기존 데이터를 확인해주세요.'); return; }
      // Reload so every system reads the restored data, including systems added later.
      location.reload();
    });
  } catch (error) { toast('유효한 메이플로그 백업 파일이 아니에요.'); }
});
window.addEventListener('storage', event => { if (event.key === STORAGE || event.key === MapleBackup.SYSTEMS_STORAGE || event.key === null) { toast('다른 탭에서 데이터가 변경됐어요. 새로고침 후 계속해주세요.'); storageReady = false; } });
render();
function refreshItemSuggestions() {
  const items = new Set([...MapleContent.catalog.items, ...records.flatMap(r => r.items.map(i => i.name))]);
  $('#item-suggestions').innerHTML = [...items].sort().map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}
function refreshCharacterSuggestions() {
  const names = new Set(records.map(record => record.character.trim()).filter(Boolean));
  $('#character-suggestions').innerHTML = [...names].sort((a, b) => a.localeCompare(b, 'ko')).map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function mesoPeriod(period, date) {
  if (period === 'all') return { start: '1900-01-01', end: '9999-12-31', label: '전체 기간' };
  if (period === 'week') {
    const week = mapleWeek(date);
    return { ...week, label: `${week.start} ~ ${week.end} · 목~수` };
  }
  if (period === 'month') {
    const [year, month] = date.split('-').map(Number);
    return { start: `${date.slice(0, 7)}-01`, end: localDate(new Date(year, month, 0)), label: `${year}년 ${month}월` };
  }
  return { start: date, end: date, label: date };
}
function mesoAggregate(bosses, entries, start, end) {
  const inPeriod = r => r.date >= start && r.date <= end;
  const runs = bosses.filter(inPeriod), spending = entries.filter(inPeriod);
  const cash = MapleExpense.totals(spending);
  const income = periodIncome(runs, start, end) + cash.income;
  const categories = new Map();
  for (const entry of spending) {
    const amount = entry.items.reduce((sum, item) => sum + (item.price > 0 ? BigInt(item.price) : 0n), 0n);
    categories.set(entry.category, (categories.get(entry.category) || 0n) + amount);
  }
  const ranking = [...categories].filter(([, amount]) => amount > 0n)
    .sort(([a, x], [b, y]) => x === y ? MapleExpense.categories.indexOf(a) - MapleExpense.categories.indexOf(b) : x > y ? -1 : 1)
    .slice(0, 3);
  return { runs: runs.length, items: runs.reduce((sum, r) => sum + r.items.length, 0), income, expense: cash.expense, ranking };
}
let mesoSummaryPeriod = 'all';
function renderMesoSummary() {
  let entries = null;
  try {
    if (!storageReady) throw new Error('boss-data');
    entries = MapleExpense.read(window.MapleSystems).entries;
  } catch { /* Preserve unreadable records and never present partial totals. */ }
  const date = $('#meso-summary-date').value;
  $('#meso-summary-date').disabled = mesoSummaryPeriod === 'all';
  for (const button of document.querySelectorAll('[data-meso-period]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mesoPeriod === mesoSummaryPeriod));
  }
  $('#meso-summary-panels').innerHTML = [['day', '일 정산'], ['week', '주 정산'], ['month', '월 정산'], ['all', '전체 기간 정산']].filter(([period]) => period === mesoSummaryPeriod).map(([period, title]) => {
    const range = mesoPeriod(period, date);
    const result = entries === null ? null : mesoAggregate(records, entries, range.start, range.end);
    const net = result ? result.income - result.expense : null;
    const balance = net === null ? 'unknown' : net > 0n ? 'positive' : net < 0n ? 'negative' : 'zero';
    const ranks = Array.from({ length: 3 }, (_, i) => {
      const rank = result?.ranking[i];
      return `<li><span><b>${i + 1}위</b> ${escapeHtml(result ? rank?.[0] || '기록 없음' : '확인 필요')}</span><strong>${rank ? mapleMoney(rank[1]) : '—'}</strong></li>`;
    }).join('');
    const cashCard = (key, label, value) => `<article class="meso-money-card ${key}" data-balance="${balance}"><p><img src="assets/meso.png" alt="">${label}</p><strong>${value}</strong></article>`;
    return `<section class="meso-period-panel" aria-label="${title}">
      <div class="meso-period-heading"><h3>${title}</h3><span>${range.label}</span></div>
      <div class="meso-period-content"><div class="meso-period-left">
        <article class="meso-count"><img src="assets/boss-count.png" alt=""><div><p>잡은 보스 수</p><strong>${result ? result.runs.toLocaleString('ko-KR') + ' 회' : '확인 필요'}</strong></div></article>
        <article class="meso-count"><img src="assets/item-count.png" alt=""><div><p>획득 아이템 수</p><strong>${result ? result.items.toLocaleString('ko-KR') + ' 개' : '확인 필요'}</strong></div></article>
        <div class="meso-period-ranking"><h4>소비량 1~3위</h4><ol>${ranks}</ol></div>
      </div><div class="meso-period-money">
        ${cashCard('income', '총수익', result ? mapleMoney(result.income) : '확인 필요')}
        ${cashCard('expense', '총소비량', result ? mapleMoney(result.expense) : '확인 필요')}
        ${cashCard('net', '순수익', net === null ? '확인 필요' : (net > 0n ? '+ ' : net < 0n ? '− ' : '') + mapleMoney(net < 0n ? -net : net))}
      </div></div></section>`;
  }).join('');
}
$('#open-meso-summary').addEventListener('click', () => {
  if (!$('#meso-summary-date').value) $('#meso-summary-date').value = today;
  renderMesoSummary();
  $('#meso-summary-dialog').showModal();
});
$('#meso-summary-date').addEventListener('change', () => {
  if (!MapleExpense.validDate($('#meso-summary-date').value)) $('#meso-summary-date').value = today;
  renderMesoSummary();
});
$('#meso-summary-periods').addEventListener('click', event => {
  const button = event.target.closest('[data-meso-period]');
  if (!button) return;
  mesoSummaryPeriod = button.dataset.mesoPeriod;
  renderMesoSummary();
});
$('#close-meso-summary').addEventListener('click', () => $('#meso-summary-dialog').close());
