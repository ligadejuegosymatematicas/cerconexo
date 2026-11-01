// Integration only: Local/CPU listeners and save formats remain official.
const dialog = document.getElementById('newDialog'), online = dialog?.querySelector('[data-online-control]');
if (online) {
  const find = selector => dialog.querySelector(selector), start = find('#startLocal'), players = find('[data-online-players]');
  let selected = false, warning = false, previousLabel = '';
  function describe() {
    const count = Number(find('[name=onlinePlayers]:checked').value), policy = find('[name=turnMode]:checked').value;
    find('[data-online-help]').textContent = count === 2 ? 'Cada persona controla las dos fichas de su equipo. Ocho minutos por equipo.'
      : policy === 'team' ? 'Cada persona controla su ficha. La primera selección válida reserva el turno hasta construir el muro; el compañero espera.' : 'Cada persona controla una ficha. Orden A1 → B1 → A2 → B2, omitiendo fichas aseguradas.';
  }
  document.addEventListener('click', event => {
    if (!dialog.contains(event.target)) return;
    if (event.target.closest('[data-online-control]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!selected) { warning = find('#replaceWarning').hidden; previousLabel = start.textContent; }
      selected = true; dialog.dataset.online = 'true'; dialog.dataset.selectorControl = 'online';
      for (const button of dialog.querySelectorAll('[data-control]')) button.setAttribute('aria-pressed', 'false');
      online.setAttribute('aria-pressed', 'true'); find('#cpuOptions').hidden = true; players.hidden = false;
      find('#replaceWarning').hidden = true; find('#localDescription').textContent = 'Partida compartida desde distintos dispositivos. Tu guardado Local/CPU se conserva.';
      start.textContent = 'Continuar Online'; describe();
    } else if (event.target.closest('[data-control]')) {
      if (selected) { find('#replaceWarning').hidden = warning; if (previousLabel) start.textContent = previousLabel; }
      selected = false; dialog.dataset.online = 'false'; online.setAttribute('aria-pressed', 'false'); players.hidden = true;
    } else if (selected && event.target.closest('#startLocal')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const target = new URL('./', import.meta.url); target.searchParams.set('players', find('[name=onlinePlayers]:checked').value); target.searchParams.set('policy', find('[name=turnMode]:checked').value);
      location.assign(target.href);
    }
  }, true);
  dialog.addEventListener('change', describe);
  new MutationObserver(() => { if (dialog.open && dialog.dataset.selectorControl !== 'online') { selected = false; dialog.dataset.online = 'false'; online.setAttribute('aria-pressed', 'false'); players.hidden = true; } }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
}
