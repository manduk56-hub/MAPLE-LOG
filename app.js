'use strict';
const $ = selector => document.querySelector(selector);
if (location.protocol === 'maplelog:') {
  $('.local-label').innerHTML = '<span></span> 이 PC에 자동 저장';
  $('.header-right').innerHTML = '메이플로그 데스크톱 <span class="avatar">M</span>';
}
const STORAGE = 'maplelog.records.v1';
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = localDate();
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = null;
let records = [];
let editingId = null;
let storageReady = true;
let toastTimer;
const money = value => `${new Intl.NumberFormat('ko-KR').format(value)} 메소`;
const compact = value => value >= 100000000 ? `${+(value / 100000000).toFixed(2)}억` : value >= 10000 ? `${+(value / 10000).toFixed(1)}만` : new Intl.NumberFormat('ko-KR').format(value);
// 한국 메이플스토리 공식 보스 가이드 기준. 저장 형식은 기존의 '난이도 보스명'을 유지한다.
const BOSS_CATALOG = [
  ['스우', ['노멀', '하드', '익스트림']],
  ['데미안', ['노멀', '하드']],
  ['가디언 엔젤 슬라임', ['노멀', '카오스']],
  ['루시드', ['이지', '노멀', '하드']],
  ['윌', ['이지', '노멀', '하드']],
  ['더스크', ['노멀', '카오스']],
  ['진 힐라', ['노멀', '하드']],
  ['친위대장 듄켈', ['노멀', '하드']],
  ['검은 마법사', ['하드', '익스트림']],
  ['선택받은 세렌', ['노멀', '하드', '익스트림']],
  ['감시자 칼로스', ['이지', '노멀', '카오스', '익스트림']],
  ['최초의 대적자', ['이지', '노멀', '하드', '익스트림']],
  ['카링', ['이지', '노멀', '하드', '익스트림']],
  ['벨로나', ['이지', '노멀', '하드']],
  ['찬란한 흉성', ['노멀', '하드']],
  ['림보', ['노멀', '하드']],
  ['발드릭스', ['노멀', '하드']],
  ['유피테르', ['노멀', '하드']]
];
const BOSS_ALIASES = { '듄켈': '친위대장 듄켈', '세렌': '선택받은 세렌', '칼로스': '감시자 칼로스', '반 레온': '반레온', '블러디 퀸': '블러디퀸' };
function parseBoss(value) {
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
  const custom = form.elements.boss.value === 'custom';
  const difficulties = BOSS_CATALOG.find(([name]) => name === form.elements.boss.value)?.[1] || [];
  form.elements.difficulty.innerHTML = '<option value="">난이도 선택</option>' + difficulties.map(d => `<option value="${d}">${d}</option>`).join('');
  form.elements.difficulty.value = difficulties.includes(value) ? value : '';
  form.elements.difficulty.disabled = !difficulties.length;
  form.elements.difficulty.required = !custom;
  $('#custom-boss-field').hidden = !custom;
  form.elements.customBoss.disabled = !custom;
  form.elements.customBoss.required = custom;
}
function selectedBossName(form) {
  if (form.elements.boss.value === 'custom') return form.elements.customBoss.value.trim();
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
    const count = counts.get(key) || 0;
    return `<button type="button" data-date="${key}" data-record-count="${count}" data-heat="${count >= 10 ? 5 : count >= 5 ? 4 : count >= 3 ? 3 : count}" class="${date.getMonth() !== month.getMonth() ? 'other-month ' : ''}${key === today ? 'is-today ' : ''}${key === selectedDate ? 'selected ' : ''}${count ? 'has-record' : ''}" title="${key} · 기록 ${count}개" aria-label="${key}, 기록 ${count}개${key === today ? ', 오늘' : ''}" aria-pressed="${key === selectedDate}">${date.getDate()}</button>`;
  }).join('');
}
function renderRecords() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  const all = monthRecords();
  $('#stat-runs').innerHTML = `${all.length} <small>회</small>`;
  $('#stat-items').innerHTML = `${all.reduce((sum, r) => sum + r.items.length, 0)} <small>개</small>`;
  const sum = all.reduce((s, r) => s + BigInt(total(r)), 0n);
  $('#stat-value').innerHTML = `${compact(Number(sum))} <small>메소</small>`;
  $('#stat-value').title = `${sum.toLocaleString('ko-KR')} 메소`;
  let filtered = all.filter(r => (!selectedDate || r.date === selectedDate) && [r.boss, r.character, r.party, r.memo, ...r.items.map(i => i.name)].join(' ').toLocaleLowerCase().includes(query));
  const sort = $('#sort').value;
  filtered.sort((a, b) => sort === 'value' ? total(b) - total(a) : sort === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  $('#list-title').innerHTML = `${selectedDate ? `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8))}일의 기록` : '이번 달의 기록'} <span>${filtered.length}</span>`;
  $('#clear-day').hidden = !selectedDate;
  $('#list-subtitle').textContent = selectedDate ? '그날 함께한 모험을 다시 펼쳐보세요' : '당신의 행운이 쌓이는 곳';
  if (!filtered.length) {
    $('#records').innerHTML = `<div class="empty-state"><div class="empty-icon">▤</div><h3>${query ? '검색한 기록이 없어요' : '아직 펼치지 않은 모험 이야기'}</h3><p>${query ? '다른 보스, 캐릭터, 아이템 이름으로 찾아보세요.' : '보스를 함께한 순간, 반가웠던 득템.<br>첫 번째 일기에 그날의 이야기를 담아보세요.'}</p>${query ? '' : '<button id="empty-new">＋ 첫 기록 남기기</button>'}</div>`;
    if ($('#empty-new')) $('#empty-new').addEventListener('click', () => openEditor());
    return;
  }
  $('#records').innerHTML = filtered.map(r => `<article class="record-card"><div class="card-heading"><div><div class="record-date">${r.date.replaceAll('-', '. ')}</div><h3>${escapeHtml(r.boss)}</h3></div><div class="card-actions"><button data-edit="${escapeHtml(r.id)}">수정</button><button data-delete="${escapeHtml(r.id)}">삭제</button></div></div><div class="card-party"><span class="character-tag">${escapeHtml(r.character)}</span>${r.party ? `함께한 파티 · ${escapeHtml(r.party)}` : '나 홀로 모험'}</div><div class="loot-list"><div class="loot-heading"><span>획득 아이템</span><span>당시 가격 (메소)</span></div>${r.items.length ? r.items.map(i => `<div class="loot-row"><span class="loot-gem">◇</span><span class="loot-name">${escapeHtml(i.name)}</span><span class="loot-price">${money(i.price)}</span></div>`).join('') : '<div class="loot-row"><span class="loot-name optional">획득 아이템 없이 모험을 기록했어요.</span></div>'}</div><div class="card-totals"><span>아이템 총액 <strong>${money(total(r))}</strong></span><span>${r.split}명 분배 · 1인당 <strong>${money(Math.floor(total(r) / r.split))}</strong></span></div>${r.memo ? `<p class="record-memo">${escapeHtml(r.memo)}</p>` : ''}</article>`).join('');
}
function render() { renderCalendar(); renderRecords(); }
function mapleMoney(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '금액을 확인해주세요';
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
function updatePriceHint(input) {
  const text = input.value.replaceAll(',', '');
  input.closest('.item-row').querySelector('.item-price-hint').textContent = text ? (/^\d+$/.test(text) ? `(${mapleMoney(Number(text))})` : '금액을 확인해주세요') : '';
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
  row.innerHTML = `<label>아이템 이름<input class="item-name" maxlength="100" placeholder="예: 몽환의 벨트" value="${escapeHtml(item.name)}" required></label><label>당시 가격 (메소)<input class="item-price" type="text" inputmode="numeric" placeholder="0" value="${escapeHtml(item.price === '' ? '' : new Intl.NumberFormat('ko-KR').format(item.price))}" required></label><button class="remove-item" type="button" aria-label="아이템 삭제">×</button><span class="item-price-hint" aria-live="polite"></span>`;
  updatePriceHint(row.querySelector('.item-price'));
  row.querySelector('.item-price').addEventListener('input', event => formatItemPrice(event.target));
  row.querySelector('button').addEventListener('click', () => { row.remove(); updateTotal(); });
  row.addEventListener('input', updateTotal); $('#item-rows').append(row);
}
function readItems() { return Array.from(document.querySelectorAll('.item-row')).map(row => ({ name: row.querySelector('.item-name').value.trim(), price: Number(row.querySelector('.item-price').value.replaceAll(',', '')) })); }
function updateTotal() { const sum = readItems().reduce((s, i) => s + (Number.isFinite(i.price) ? i.price : 0), 0); $('#form-total').textContent = mapleMoney(sum); $('#form-share').textContent = mapleMoney(Math.floor(sum / Math.max(1, Number($('#record-form').elements.split.value)))); $('#form-total').title = money(sum); }
function openEditor(record) {
  const form = $('#record-form'); form.reset(); editingId = record?.id || null;
  $('#editor-title').textContent = record ? '일기 수정하기' : '새 일기 쓰기';
  for (const field of ['date', 'character', 'party', 'split', 'memo']) form.elements[field].value = record ? record[field] : ({ date: selectedDate || today, split: 1 }[field] || '');
  const bossSelection = record ? parseBoss(record.boss) : { boss: '', difficulty: '', custom: '' };
  form.elements.boss.value = bossSelection.boss;
  updateBossDifficulty(bossSelection.difficulty);
  // Older records without a difficulty remain editable without guessing their difficulty.
  if (record && bossSelection.boss !== 'custom' && !bossSelection.difficulty) {
    form.elements.boss.value = 'custom'; updateBossDifficulty();
    bossSelection.custom = record.boss;
  }
  form.elements.customBoss.value = bossSelection.custom;
  if (!record && records.length) form.elements.character.value = records[records.length - 1].character;
  $('#item-rows').innerHTML = ''; if (record) record.items.forEach(addItem); else addItem();
  $('#form-error').textContent = ''; updateTotal(); $('#editor').showModal();
}
function confirmAction(title, message, callback) {
  $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
  $('#confirm-ok').onclick = () => { $('#confirm-dialog').close(); callback(); };
  $('#confirm-dialog').showModal();
}
document.querySelectorAll('[data-shortcut]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.shortcut).click()));
$('#new-record').addEventListener('click', () => openEditor());
$('#close-editor').onclick = $('#cancel-editor').onclick = () => $('#editor').close();
$('#confirm-cancel').onclick = () => $('#confirm-dialog').close();
$('#add-item').onclick = () => addItem();
$('#record-form').elements.boss.innerHTML = '<option value="">보스 선택</option>' + BOSS_CATALOG.map(([name]) => `<option value="${name}">${name}</option>`).join('') + '<option value="custom">직접 입력</option>';
$('#record-form').elements.boss.addEventListener('change', () => updateBossDifficulty());
$('#record-form').elements.split.addEventListener('input', updateTotal);
$('#record-form').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget;
  const record = { id: editingId || crypto.randomUUID(), date: form.elements.date.value, boss: selectedBossName(form), character: form.elements.character.value.trim(), party: form.elements.party.value.trim(), split: Number(form.elements.split.value), memo: form.elements.memo.value.trim(), items: readItems() };
  if (!validRecord(record)) { $('#form-error').textContent = '입력 내용을 확인해주세요. 이름은 공백일 수 없으며 합계는 안전한 정수 범위여야 합니다.'; return; }
  const next = editingId ? records.map(r => r.id === editingId ? record : r) : [...records, record];
  if (!save(next)) return;
  month = new Date(`${record.date.slice(0, 7)}-01T12:00:00`); selectedDate = record.date; $('#search').value = ''; render(); $('#editor').close(); toast('그날의 모험을 저장했어요.');
});
$('#calendar').addEventListener('click', event => { const button = event.target.closest('[data-date]'); if (!button) return; selectedDate = button.dataset.date === selectedDate ? null : button.dataset.date; if (selectedDate) month = new Date(`${selectedDate.slice(0, 7)}-01T12:00:00`); render(); });
function changeMonth(amount) { const next = new Date(month.getFullYear(), month.getMonth() + amount, 1); if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return; month = next; selectedDate = null; render(); }
function renderMonthPicker() {
  const year = Number($('#picker-year').value);
  $('#picker-months').innerHTML = Array.from({ length: 12 }, (_, i) => {
    const active = year === month.getFullYear() && i === month.getMonth();
    return `<button type="button" data-month="${i}" aria-pressed="${active}" class="${active ? 'active' : ''}">${i + 1}월</button>`;
  }).join('');
  $('#prev-year').disabled = year <= 1900;
  $('#next-year').disabled = year >= 9999;
}
$('#calendar-title').onclick = () => {
  $('#picker-year').value = month.getFullYear();
  renderMonthPicker();
  $('#month-picker').showModal();
};
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
  month = new Date(Number($('#picker-year').value), Number(button.dataset.month), 1);
  selectedDate = null;
  render();
  $('#month-picker').close();
});
$('#prev-month').onclick = () => changeMonth(-1); $('#next-month').onclick = () => changeMonth(1);
$('#today').onclick = () => { month = new Date(`${today.slice(0, 7)}-01T12:00:00`); selectedDate = today; render(); };
$('#clear-day').onclick = () => { selectedDate = null; render(); };
$('#search').addEventListener('input', renderRecords); $('#sort').addEventListener('change', renderRecords);
$('#records').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit]'); const remove = event.target.closest('[data-delete]');
  if (edit) openEditor(records.find(r => r.id === edit.dataset.edit));
  if (remove) confirmAction('이 일기를 삭제할까요?', '삭제한 기록은 되돌릴 수 없어요. 필요한 기록은 먼저 백업해주세요.', () => { if (save(records.filter(r => r.id !== remove.dataset.delete))) { render(); toast('일기를 삭제했어요.'); } });
});
$('#export').onclick = () => {
  if (!storageReady) { toast('기록을 읽을 수 없어 백업을 만들지 못했어요.'); return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'maplelog', version: 2, exportedAt: new Date().toISOString(), records }, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `메이플로그-${today}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('기록 백업을 다운로드했어요.');
};
$('#import').onclick = () => $('#import-file').click();
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 10000000) throw new Error('size');
    const data = JSON.parse(await file.text());
    if (data.app !== 'maplelog' || ![1, 2].includes(data.version) || !Array.isArray(data.records) || data.records.length > 20000 || !data.records.every(validRecord) || new Set(data.records.map(r => r.id)).size !== data.records.length) throw new Error('format');
    confirmAction('백업을 복원할까요?', `${data.records.length}개의 기록으로 현재 기록 전체를 교체합니다. 현재 기록이 필요하면 먼저 백업해주세요.`, () => {
      const previous = storageReady; storageReady = true;
      if (save(normalizeRecords(data.records))) { selectedDate = null; $('#search').value = ''; if (records.length) { const latest = records.map(r => r.date).sort().at(-1); month = new Date(`${latest.slice(0, 7)}-01T12:00:00`); } render(); toast('백업을 복원했어요.'); } else storageReady = previous;
    });
  } catch (error) { toast('유효한 메이플로그 백업 파일이 아니에요.'); }
});
window.addEventListener('storage', event => { if (event.key === STORAGE) { toast('다른 탭에서 기록이 변경됐어요. 새로고침 후 계속해주세요.'); storageReady = false; } });
render();
