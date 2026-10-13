'use strict';
const MaplePagination = (() => {
  function pageOf(list, requestedPage, size) {
    const pageSize = [5, 10].includes(size) ? size : list.length || 1;
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    const page = Math.max(1, Math.min(pages, Number.isInteger(requestedPage) ? requestedPage : 1));
    const offset = (page - 1) * pageSize;
    return { page, pages, start: list.length ? offset + 1 : 0, end: Math.min(offset + pageSize, list.length), total: list.length, items: list.slice(offset, offset + pageSize) };
  }
  function create(panel, label, redraw) {
    let page = 1, size = 5, lastKey = null;
    const top = document.createElement('div'), bottom = document.createElement('nav');
    top.className = 'record-pagination'; bottom.className = 'record-pagination record-pagination-bottom';
    bottom.setAttribute('aria-label', `${label} 페이지 이동`);
    top.innerHTML = `<div class="pagination-options"><label>표시 개수 <select aria-label="${label} 표시 개수"><option value="5">5개씩 보기</option><option value="10">10개씩 보기</option><option value="all">전체 보기</option></select></label></div><div class="pagination-status" aria-live="polite"></div><div class="pagination-top-actions"></div>`;
    panel.querySelector('.filters, .expense-filters').after(top); panel.append(bottom);
    top.querySelector('select').onchange = event => { size = event.target.value === 'all' ? 'all' : Number(event.target.value); page = 1; redraw(); };
    const sortSelect = panel.querySelector('#sort, #expense-sort');
    if (sortSelect) top.querySelector('.pagination-options').append(sortSelect);
    function navigate(event) {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      page = Number(button.dataset.page); redraw(); panel.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    top.addEventListener('click', navigate); bottom.addEventListener('click', navigate);
    function button(text, target, disabled = false, current = false) {
      const arrow = text === '이전' || text === '다음';
      return `<button type="button" data-page="${target}" ${arrow ? `class="pagination-arrow" aria-label="${text} 페이지" title="${text} 페이지"` : ''} ${disabled ? 'disabled' : ''} ${current ? 'aria-current="page"' : ''}>${arrow ? `<span aria-hidden="true">${text === '이전' ? '‹' : '›'}</span>` : text}</button>`;
    }
    return {
      slice(list, key) {
        if (key !== lastKey) { page = 1; lastKey = key; }
        const view = pageOf(list, page, size); page = view.page;
        top.querySelector('.pagination-status').textContent = `${view.start}–${view.end} / ${view.total}개 · ${page}/${view.pages} 페이지`;
        top.querySelector('.pagination-top-actions').innerHTML = button('이전', page - 1, page === 1) + button('다음', page + 1, page === view.pages);
        const from = Math.max(1, page - 2), to = Math.min(view.pages, page + 2);
        let numbers = '';
        if (from > 1) numbers += button('1', 1) + (from > 2 ? '<span aria-hidden="true">…</span>' : '');
        for (let n = from; n <= to; n++) numbers += button(String(n), n, false, n === page);
        if (to < view.pages) numbers += (to < view.pages - 1 ? '<span aria-hidden="true">…</span>' : '') + button(String(view.pages), view.pages);
        bottom.hidden = view.pages === 1;
        bottom.innerHTML = button('이전', page - 1, page === 1) + numbers + button('다음', page + 1, page === view.pages);
        return view.items;
      }
    };
  }
  return { pageOf, create };
})();
if (typeof module !== 'undefined') module.exports = MaplePagination;
