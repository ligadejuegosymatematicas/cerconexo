// Local/CPU keep their official selectors and save formats. Online is configured
// only in Create room, never in this modal or the invitation flow.
const dialog = document.getElementById('newDialog'), online = dialog?.querySelector('[data-online-control]');
if (online) {
  const start = dialog.querySelector('#startLocal'), columns = dialog.querySelector('.selector-columns');
  let selected = false, warning = false, label = '';
  function reset() {
    if (selected) { dialog.querySelector('#replaceWarning').hidden = warning; start.textContent = label; }
    selected = false; dialog.dataset.online = 'false'; online.setAttribute('aria-pressed','false'); columns.hidden = false;
  }
  document.addEventListener('click', event => {
    if (!dialog.contains(event.target)) return;
    if (event.target.closest('[data-online-control]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!selected) { warning = dialog.querySelector('#replaceWarning').hidden; label = start.textContent; }
      selected = true; dialog.dataset.online = 'true'; dialog.dataset.selectorControl = 'online';
      for (const b of dialog.querySelectorAll('[data-control]')) b.setAttribute('aria-pressed','false');
      online.setAttribute('aria-pressed','true'); columns.hidden = true;
      dialog.querySelector('#replaceWarning').hidden = true;
      dialog.querySelector('#localDescription').textContent = 'Crea una sala o únete con una invitación.';
      start.textContent = 'Continuar';
    } else if (event.target.closest('[data-control]')) reset();
    else if (selected && event.target.closest('#startLocal')) {
      event.preventDefault(); event.stopImmediatePropagation(); location.assign(new URL('./',import.meta.url).href);
    }
  }, true);
  new MutationObserver(() => { if (dialog.open && dialog.dataset.selectorControl !== 'online') reset(); }).observe(dialog,{attributes:true,attributeFilter:['open']});
}
