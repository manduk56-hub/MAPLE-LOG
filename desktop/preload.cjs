'use strict';
const { ipcRenderer } = require('electron');
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('focusin', event => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    if (field instanceof HTMLInputElement && !['text', 'search'].includes(field.type)) return;
    if (['numeric', 'decimal'].includes(field.inputMode) || field.classList.contains('item-price')) return;
    field.lang = 'ko';
    ipcRenderer.send('maplelog:korean-input');
  });
});
