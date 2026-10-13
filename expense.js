'use strict';
(() => {
  let data = { entries: [], notes: [] }, editable = true, editing = null;
  let expenseMonth = today.slice(0, 7), expenseDate = null, noteDate = null;
  const form = $('#expense-form'), controls = form.elements;
  // Stored prices remain positive for spending; a negative cost is income.
  const flowMoney = cost => {
    const value = BigInt(cost);
    return (value > 0n ? '- ' : value < 0n ? '+ ' : '') + mapleMoney(value < 0n ? -value : value);
  };
  const expensePager = MaplePagination.create($('#expense-records').closest('.records-panel'), '소비 기록', renderRecords);
  const examples = {
    '아이템 구매': ['구매한 장비·재료·아이템과 지불한 메소를 기록해주세요.', '예: 몽환의 벨트 구매'],
    '스타포스': ['강화한 장비와 목표 단계, 사용한 메소를 기록해주세요.', '예: 아케인 무기 17성 → 22성'],
    '주문서': ['주문서 작업이나 주문의 흔적에 사용한 메소를 기록해주세요.', '예: 장갑 주문서 작업'],
    '추가옵션': ['추가옵션 작업에 사용한 메소를 기록해주세요.', '예: 무기 추가옵션 재설정'],
    '잠재능력': ['잠재능력 재설정 비용 자체는 자동 산출하지 않아요. 실제 사용액을 입력하거나 시작·종료 메소로 계산해주세요.', '예: 상의 잠재능력 재설정'],
    '에디셔널 잠재능력': ['에디셔널 잠재능력 재설정 비용 자체는 자동 산출하지 않아요. 실제 사용액을 입력하거나 시작·종료 메소로 계산해주세요.', '예: 무기 에디셔널 재설정'],
    '익셉셔널': ['익셉셔널 강화에 사용한 비용을 기록해주세요.', '예: 익셉셔널 강화 작업'],
    '소울웨폰': ['소울 관련 아이템이나 작업에 사용한 메소를 기록해주세요.', '예: 무기 소울 작업'],
    '흔적복구': ['장비 흔적 복구에 사용한 메소를 기록해주세요.', '예: 파괴된 장비 복구'],
    '특수 스킬': ['특수 스킬 관련 작업에 사용한 메소를 기록해주세요.', '예: 특수 스킬 작업'],
    '반지 연마': ['반지 연마에 사용한 메소를 기록해주세요.', '예: 특수 스킬 반지 연마'],
    '소모품': ['포션·버프·소모성 아이템 구입 비용을 기록해주세요.', '예: 버프 소모품 구매'],
    '아이템 판매': ['', '예: 잠재능력 장비 판매'],
    '도박': ['', '예: 도박 결과'],
    '기타': ['그 밖에 사용한 메소와 내용을 자유롭게 기록해주세요.', '예: 기타 메소 사용']
  };
  const options = MapleExpense.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  controls.category.innerHTML = options;
  const costNotice = document.createElement('p');
  costNotice.className = 'expense-cost-notice';
  costNotice.textContent = '소비는 -, 수익은 +로 표시해요. 직접 입력 시 소비·수익을 선택하고, 잔액 계산은 종료 메소가 늘면 수익으로 기록해요.';
  $('#expense-item-rows').before(costNotice);
  try { data = MapleExpense.read(window.MapleSystems); }
  catch (error) {
    editable = false; $('#expense-warning').hidden = false;
    $('#expense-warning').textContent = error.message === 'version' ? '이 소비 기록은 새로운 버전에서 저장됐어요. 데이터를 보존하기 위해 편집을 중단했어요.' : '소비 기록을 읽지 못했어요. 기존 데이터는 보존됩니다. 백업 복원으로 복구해주세요.';
    for (const id of ['new-expense', 'expense-note', 'expense-save-note']) $(`#${id}`).disabled = true;
  }
  function persist(next) {
    if (!editable || !storageReady) { toast('데이터가 변경되었거나 저장할 수 없어요. 새로고침 후 확인해주세요.'); return false; }
    try { MapleExpense.write(window.MapleSystems, next); data = next; return true; }
    catch { toast('소비 일기를 저장하지 못했어요. 기존 데이터와 저장 공간을 확인해주세요.'); return false; }
  }
  const anchor = () => expenseDate || (expenseMonth === today.slice(0, 7) ? today : `${expenseMonth}-01`);
  const savedNote = date => data.notes.find(n => n.date === date)?.text || '';
  const noteDirty = () => noteDate && $('#expense-note').value !== savedNote(noteDate);
  function saveNote() {
    if (!noteDate) return false;
    const text = $('#expense-note').value, notes = data.notes.filter(n => n.date !== noteDate);
    if (text.trim()) notes.push({ date: noteDate, text });
    if (!persist({ ...data, notes })) return false;
    $('#expense-note').value = savedNote(noteDate);
    $('#expense-note-status').textContent = text.trim() ? '저장했어요' : '빈 메모로 저장했어요';
    renderCalendar(); return true;
  }
  function guardNavigation(action) {
    if (!noteDirty()) { action(); return; }
    confirmAction('작성한 메모를 저장할까요?', '날짜나 화면을 이동하기 전에 작성 중인 메모를 저장합니다. 취소하면 현재 화면에서 계속 작성할 수 있어요.', () => { if (saveNote()) action(); });
  }
  function renderNote() {
    const date = anchor();
    if (noteDate !== date) {
      noteDate = date; $('#expense-note').value = savedNote(date);
      $('#expense-note-status').textContent = savedNote(date) ? '저장된 메모' : '메모를 남겨보세요';
    }
    $('#expense-note-date').textContent = `${date.replaceAll('-', '. ')} · ${expenseDate ? '선택한 날' : date === today ? '오늘' : '이 달의 첫날'}`;
  }
  function renderSettlement() {
    const ranking = editable ? MapleExpense.topCategories(data.entries, expenseMonth) : [];
    for (let i = 1; i <= 3; i++) {
      const ranked = ranking[i - 1], label = $(`#expense-rank-${i}-category`), value = $(`#expense-rank-${i}-total`);
      label.textContent = `소비 ${i}위 · ${!editable ? '확인 필요' : ranked?.category || '기록 없음'}`;
      label.title = label.textContent;
      value.textContent = ranked ? mapleMoney(ranked.total) : '—';
      value.title = ranked ? `${ranked.total.toLocaleString('ko-KR')} 메소` : '';
    }
    const date = anchor(), week = mapleWeek(date), [year, monthNumber] = expenseMonth.split('-').map(Number);
    const end = localDate(new Date(year, monthNumber, 0));
    for (const [id, value] of [
      ['expense-day-total', MapleExpense.periodTotal(data.entries, date, date)],
      ['expense-week-total', MapleExpense.periodTotal(data.entries, week.start, week.end)],
      ['expense-month-total', MapleExpense.periodTotal(data.entries, `${expenseMonth}-01`, end)]
    ]) {
      $(`#${id}`).textContent = editable ? flowMoney(value) : '확인 필요';
      $(`#${id}`).title = editable ? `${value.toLocaleString('ko-KR')} 메소` : '';
    }
    $('#expense-day-label').textContent = `${date.replaceAll('-', '. ')} · ${expenseDate ? '선택한 날' : date === today ? '오늘' : '이 달의 첫날'}`;
    $('#expense-week-label').textContent = `${week.start.replaceAll('-', '. ')} ~ ${week.end.replaceAll('-', '. ')} · 목~수`;
    $('#expense-month-label').textContent = `${year}년 ${monthNumber}월 · 달력 기준`;
  }
  function renderCalendar() {
    const [year, monthNumber] = expenseMonth.split('-').map(Number), first = new Date(year, monthNumber - 1, 1);
    const start = new Date(year, monthNumber - 1, 1 - first.getDay());
    const days = Math.ceil((first.getDay() + new Date(year, monthNumber, 0).getDate()) / 7) * 7;
    const counts = new Map(); data.entries.forEach(e => counts.set(e.date, (counts.get(e.date) || 0) + 1));
    const notes = new Set(data.notes.filter(n => n.text.trim()).map(n => n.date));
    $('#expense-calendar-title').textContent = `${year}년 ${monthNumber}월`; $('#expense-clear-day').disabled = !expenseDate;
    $('#expense-calendar').innerHTML = Array.from({ length: days }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), key = localDate(date);
      const count = counts.get(key) || 0, hasNote = notes.has(key);
      return `<button type="button" data-expense-date="${key}" data-heat="${count >= 10 ? 5 : count >= 5 ? 4 : count >= 3 ? 3 : count}" class="${date.getMonth() !== first.getMonth() ? 'other-month ' : ''}${key === today ? 'is-today ' : ''}${key === expenseDate ? 'selected ' : ''}${count ? 'has-record ' : ''}${hasNote ? 'has-note' : ''}" title="${key} · 소비 ${count}건${hasNote ? ' · 메모 있음' : ''}" aria-label="${key}, 소비 ${count}건${hasNote ? ', 메모 있음' : ''}${key === today ? ', 오늘' : ''}" aria-pressed="${key === expenseDate}" ${!MapleExpense.validDate(key) ? 'disabled' : ''}>${date.getDate()}</button>`;
    }).join('');
  }
  function renderRecords() {
    const query = $('#expense-search').value.trim().toLocaleLowerCase();
    const list = data.entries.filter(e => e.date.startsWith(expenseMonth) && (!expenseDate || e.date === expenseDate) &&
      [e.character, e.category, e.memo, ...e.items.map(i => i.name)].join(' ').toLocaleLowerCase().includes(query));
    const sort = $('#expense-sort').value;
    list.sort((a, b) => sort === 'amount' ? (MapleExpense.amount(a) > MapleExpense.amount(b) ? -1 : MapleExpense.amount(a) < MapleExpense.amount(b) ? 1 : 0) : sort === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
    const pageRecords = expensePager.slice(list, JSON.stringify([expenseMonth, expenseDate, query, sort]));
    $('#expense-list-title').innerHTML = `${expenseDate ? `${Number(expenseDate.slice(5, 7))}월 ${Number(expenseDate.slice(8))}일의 소비 기록` : '이번 달의 소비 기록'} <span>${list.length}</span>`;
    $('#expense-records').innerHTML = list.length ? pageRecords.map(e => `<article class="record-card compact-record expense-card"><div class="card-heading"><div class="record-title"><span class="character-tag">${escapeHtml(e.character)}</span><h3>${escapeHtml(e.category)}</h3><time class="record-date" datetime="${e.date}">${e.date.replaceAll('-', '.')}</time></div><div class="card-actions"><button type="button" data-expense-edit="${escapeHtml(e.id)}">수정</button><button type="button" data-expense-delete="${escapeHtml(e.id)}">삭제</button></div></div><div class="loot-list">${e.items.map(i => `<div class="loot-row"><span class="loot-name">${escapeHtml(i.name)}</span><span class="loot-price expense-record-amount" data-flow="${i.price < 0 ? 'income' : i.price > 0 ? 'expense' : 'neutral'}">${flowMoney(i.price)}</span></div>`).join('')}</div><div class="card-totals"><span class="card-share"><strong class="expense-record-net" data-flow="${MapleExpense.amount(e) < 0n ? 'income' : MapleExpense.amount(e) > 0n ? 'expense' : 'neutral'}">${flowMoney(MapleExpense.amount(e))}</strong></span></div>${e.memo ? `<p class="record-memo">${escapeHtml(e.memo)}</p>` : ''}</article>`).join('') : `<div class="empty-state"><div class="empty-icon">▤</div><h3>${!editable ? '소비 기록을 확인해주세요' : query ? '검색한 소비 기록이 없어요' : expenseDate ? '이날의 소비 기록이 없어요' : '아직 이 달의 소비 기록이 없어요'}</h3><p>${!editable ? '위 안내를 확인한 뒤 백업을 복원해주세요.' : query ? '검색어를 바꿔 찾아보세요.' : '아이템 구매부터 강화까지,<br>사용한 메소를 일기로 남겨보세요.'}</p>${editable && !query ? '<button type="button" id="empty-expense">＋ 첫 소비 일기 쓰기</button>' : ''}</div>`;
    if ($('#empty-expense')) $('#empty-expense').onclick = () => openExpense();
  }
  function renderExpenses() { renderSettlement(); renderCalendar(); renderRecords(); renderNote(); }
  function updateCategory() {
    const [, placeholder] = examples[controls.category.value];
    form.querySelectorAll('.expense-item-name').forEach(input => input.placeholder = placeholder);
  }
  function priceValue(input) {
    const value = input.value.replaceAll(',', ''); return /^\d+$/.test(value) ? Number(value) : NaN;
  }
  function readItems() {
    return [...form.querySelectorAll('.expense-item-row')].map(row => {
      const name = row.querySelector('.expense-item-name').value.trim();
      const mode = row.querySelector('.expense-amount-mode').value;
      if (mode !== 'balance') return { name, price: priceValue(row.querySelector('.expense-item-price')) * (mode === 'income' ? -1 : 1) };
      const start = priceValue(row.querySelector('.expense-start-price')), end = priceValue(row.querySelector('.expense-end-price'));
      return { name, price: MapleExpense.balanceCost(start, end), balance: { start, end } };
    });
  }
  function updateFormTotal() {
    const items = readItems(), valid = items.length > 0 && items.every(i => Number.isSafeInteger(i.price));
    $('#expense-form-total').textContent = valid ? flowMoney(items.reduce((s, i) => s + BigInt(i.price), 0n)) : '금액을 입력해주세요';
  }
  function addExpenseItem(item = { name: '', price: '' }) {
    const rows = $('#expense-item-rows');
    if (rows.children.length >= 100) { toast('소비 항목은 최대 100개까지 기록할 수 있어요.'); return; }
    const row = document.createElement('div'); row.className = 'expense-item-row';
    const display = value => value === undefined || value === '' ? '' : value.toLocaleString('ko-KR');
    row.innerHTML = `<label>항목 이름<input class="expense-item-name" list="expense-item-suggestions" maxlength="100" value="${escapeHtml(item.name)}" required></label><label>금액 입력 방식<select class="expense-amount-mode" aria-label="금액 입력 방식"><option value="direct">소비액 직접 입력</option><option value="income">수익액 직접 입력</option><option value="balance">시작·종료 메소로 계산</option></select></label><button type="button" class="remove-item" aria-label="소비 항목 삭제">×</button><div class="expense-direct-fields"><label>사용한 금액 (메소)<input class="expense-item-price" type="text" inputmode="numeric" aria-label="사용한 금액 (메소)" placeholder="0" value="${display(item.price === '' ? '' : Math.abs(item.price))}" maxlength="30"></label></div><div class="expense-balance-fields" hidden><label>시작 메소<input class="expense-start-price" type="text" inputmode="numeric" aria-label="시작 메소" placeholder="시작할 때 보유한 메소" value="${display(item.balance?.start)}" maxlength="30"><span class="expense-balance-hint expense-start-hint" aria-live="polite"></span></label><label>종료 메소<input class="expense-end-price" type="text" inputmode="numeric" aria-label="종료 메소" placeholder="종료한 뒤 남은 메소" value="${display(item.balance?.end)}" maxlength="30"><span class="expense-balance-hint expense-end-hint" aria-live="polite"></span></label><p class="expense-balance-tip">수익·소비 = 종료 메소 − 시작 메소</p></div><span class="expense-price-hint" aria-live="polite"></span>`;
    const mode = row.querySelector('.expense-amount-mode'), direct = row.querySelector('.expense-item-price');
    const startInput = row.querySelector('.expense-start-price'), endInput = row.querySelector('.expense-end-price'), hint = row.querySelector('.expense-price-hint');
    mode.value = item.balance ? 'balance' : item.price < 0 ? 'income' : 'direct';
    function updateHint() {
      const balance = mode.value === 'balance';
      const start = priceValue(startInput), end = priceValue(endInput);
      for (const [value, selector] of [[start, '.expense-start-hint'], [end, '.expense-end-hint']]) {
        row.querySelector(selector).textContent = Number.isSafeInteger(value) && value >= 0 ? mapleMoney(value) : '';
      }
      endInput.setCustomValidity(endInput.value && (!Number.isSafeInteger(end) || end < 0) ? '금액은 안전한 범위의 0 이상 정수로 입력해주세요.' : '');
      const price = balance ? MapleExpense.balanceCost(start, end) : priceValue(direct) * (mode.value === 'income' ? -1 : 1);
      hint.dataset.flow = !Number.isSafeInteger(price) ? 'unknown' : price > 0 ? 'expense' : price < 0 ? 'income' : 'neutral';
      hint.textContent = Number.isSafeInteger(price) ? `${price < 0 ? '수익: ' : '소비: '}${flowMoney(price)}` : balance ? '시작·종료 메소를 입력해주세요.' : direct.value ? '금액을 확인해주세요.' : '';
    }
    function updateMode() {
      const balance = mode.value === 'balance';
      row.querySelector('.expense-direct-fields').hidden = balance;
      row.querySelector('.expense-direct-fields label').firstChild.textContent = mode.value === 'income' ? '번 금액 (메소)' : '사용한 금액 (메소)';
      direct.setAttribute('aria-label', mode.value === 'income' ? '번 금액 (메소)' : '사용한 금액 (메소)');
      row.querySelector('.expense-balance-fields').hidden = !balance;
      direct.disabled = balance; direct.required = !balance;
      for (const input of [startInput, endInput]) { input.disabled = !balance; input.required = balance; }
      updateHint(); updateFormTotal();
    }
    for (const input of [direct, startInput, endInput]) input.addEventListener('input', () => {
      const raw = input.value;
      if (/^[\d,]*$/.test(raw)) {
        const rightDigits = raw.slice(input.selectionStart ?? raw.length).replaceAll(',', '').length;
        input.value = raw.replaceAll(',', '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        let cursor = input.value.length;
        for (let left = rightDigits; cursor > 0 && left > 0; cursor--) if (input.value[cursor - 1] !== ',') left--;
        input.setSelectionRange(cursor, cursor);
      }
      const price = priceValue(input);
      input.setCustomValidity(!input.value || Number.isSafeInteger(price) && price >= 0 ? '' : '금액은 안전한 범위의 0 이상 정수로 입력해주세요.'); updateHint();
    });
    mode.addEventListener('change', updateMode);
    row.querySelector('button').onclick = () => { row.remove(); updateFormTotal(); };
    row.addEventListener('input', updateFormTotal);
    rows.append(row); updateMode(); updateCategory(); updateFormTotal();
  }
  function openExpense(entry) {
    if (!editable || !storageReady) { toast('새로고침 후 저장된 데이터를 확인해주세요.'); return; }
    editing = entry?.id || null; form.reset(); controls.date.value = entry?.date || anchor();
    controls.character.value = entry?.character || ''; controls.category.value = entry?.category || MapleExpense.categories[0]; controls.memo.value = entry?.memo || '';
    $('#expense-editor-title').textContent = entry ? '소비 일기 수정하기' : '새 소비 일기 쓰기';
    $('#expense-form-error').textContent = ''; $('#expense-item-rows').replaceChildren();
    const names = new Set([...records.map(r => r.character), ...data.entries.map(e => e.character)]);
    $('#expense-character-suggestions').innerHTML = [...names].map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
    const itemNames = new Set([...MapleContent.catalog.items, ...data.entries.flatMap(e => e.items.map(i => i.name))]);
    $('#expense-item-suggestions').innerHTML = [...itemNames].map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
    (entry?.items || [{ name: '', price: '' }]).forEach(addExpenseItem); $('#expense-editor').showModal();
  }
  controls.category.addEventListener('change', updateCategory); $('#add-expense-item').onclick = () => addExpenseItem();
  form.addEventListener('submit', event => {
    event.preventDefault();
    const entry = { id: editing || crypto.randomUUID(), date: controls.date.value, character: controls.character.value.trim(), category: controls.category.value, items: readItems(), memo: controls.memo.value.trim() };
    if (!MapleExpense.validEntry(entry)) { $('#expense-form-error').textContent = '날짜, 캐릭터, 소비 분류와 항목별 금액을 확인해주세요. 항목은 하나 이상 필요해요.'; return; }
    guardNavigation(() => {
      const entries = editing ? data.entries.map(e => e.id === editing ? entry : e) : [...data.entries, entry];
      if (!persist({ ...data, entries })) return;
      expenseMonth = entry.date.slice(0, 7); expenseDate = entry.date;
      $('#expense-search').value = '';
      $('#expense-editor').close(); renderExpenses(); toast('소비 일기를 저장했어요.');
    });
  });
  for (const id of ['close-expense', 'cancel-expense']) $(`#${id}`).onclick = () => $('#expense-editor').close();
  $('#new-expense').onclick = () => openExpense();
  $('#expense-records').addEventListener('click', event => {
    const edit = event.target.closest('[data-expense-edit]'), remove = event.target.closest('[data-expense-delete]');
    if (edit) openExpense(data.entries.find(e => e.id === edit.dataset.expenseEdit));
    if (remove) confirmAction('이 소비 일기를 삭제할까요?', '삭제한 일기는 되돌릴 수 없어요. 날짜별 메모는 유지됩니다. 필요한 기록은 먼저 백업해주세요.', () => {
      if (persist({ ...data, entries: data.entries.filter(e => e.id !== remove.dataset.expenseDelete) })) { renderExpenses(); toast('소비 일기를 삭제했어요.'); }
    }, true);
  });
  function setDate(date) {
    if (!MapleExpense.validDate(date)) return;
    guardNavigation(() => { expenseDate = date; expenseMonth = date.slice(0, 7); renderExpenses(); });
  }
  $('#expense-calendar').addEventListener('click', event => { const button = event.target.closest('[data-expense-date]'); if (button) setDate(button.dataset.expenseDate); });
  $('#expense-clear-day').onclick = () => guardNavigation(() => { expenseDate = null; renderExpenses(); });
  $('#expense-today').onclick = () => setDate(today);
  $('#expense-calendar-title').onclick = () => openMonthPicker(new Date(`${expenseMonth}-01T12:00:00`), nextMonth => {
    guardNavigation(() => { expenseMonth = localDate(nextMonth).slice(0, 7); expenseDate = null; renderExpenses(); });
  });
  function changeMonth(offset) {
    const date = new Date(`${expenseMonth}-01T12:00:00`); date.setMonth(date.getMonth() + offset);
    if (date.getFullYear() < 1900 || date.getFullYear() > 9999) return;
    guardNavigation(() => { expenseMonth = localDate(date).slice(0, 7); expenseDate = null; renderExpenses(); });
  }
  function changeDay(offset) { const date = new Date(`${anchor()}T12:00:00`); date.setDate(date.getDate() + offset); setDate(localDate(date)); }
  $('#expense-prev').onclick = () => changeMonth(-1); $('#expense-next').onclick = () => changeMonth(1);
  $('#expense-prev-day').onclick = () => changeDay(-1); $('#expense-next-day').onclick = () => changeDay(1);
  $('#expense-note').addEventListener('input', () => { $('#expense-note-status').textContent = noteDirty() ? '저장하지 않은 메모' : '저장된 메모'; });
  $('#expense-save-note').onclick = saveNote;
  window.addEventListener('beforeunload', event => { if (noteDirty()) { event.preventDefault(); event.returnValue = ''; } });
  for (const id of ['expense-search', 'expense-sort']) $(`#${id}`).addEventListener(id === 'expense-search' ? 'input' : 'change', renderRecords);
  const diaryScrollPositions = { boss: 0, expense: 0 };
  function switchDiary(expense) {
    const scrollArea = $('.diary-scroll');
    const currentDiary = $('#boss-view').hidden ? 'expense' : 'boss';
    const nextDiary = expense ? 'expense' : 'boss';
    if (currentDiary === nextDiary) return;
    diaryScrollPositions[currentDiary] = scrollArea.scrollTop;
    $('#boss-view').hidden = expense; $('#expense-view').hidden = !expense;
    for (const [id, active] of [['nav-boss', !expense], ['nav-expense', expense]]) {
      $(`#${id}`).classList.toggle('is-active', active);
      if (active) $(`#${id}`).setAttribute('aria-current', 'page'); else $(`#${id}`).removeAttribute('aria-current');
    }
    $('.breadcrumb').innerHTML = `나의 기록 <span>/</span> ${expense ? '소비 일기' : '보스 일기'}`;
    scrollArea.setAttribute('aria-label', expense ? '소비 일기 화면' : '보스 일기 화면');
    document.title = `메이플로그 · 나의 ${expense ? '소비' : '보스'} 일기`; if (expense) renderExpenses();
    scrollArea.scrollTop = diaryScrollPositions[nextDiary];
  }
  $('#nav-boss').onclick = () => guardNavigation(() => switchDiary(false)); $('#nav-expense').onclick = () => guardBossNote(() => switchDiary(true));
  renderExpenses();
})();
