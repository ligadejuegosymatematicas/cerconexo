import { RegionInspection, regionDescription, regionAnnotation, regionBoundary } from '../arena/src/regionInspection.mjs';

export function createFinalInspection({ board, info }) {
  const ns = 'http://www.w3.org/2000/svg', model = new RegionInspection();
  const element = (tag, attrs) => { const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };
  const shade = element('g', { class: 'live-inspection', 'pointer-events': 'none' });
  const counter = element('g', { class: 'live-inspection', 'pointer-events': 'none', 'aria-hidden': 'true' });
  const targets = element('g', { class: 'live-targets', 'data-final-inspection': '' });
  board.insertBefore(shade, board.querySelector('[data-edge]')); board.append(counter, targets);
  let signature = '', pieces = [], timeout = false;
  function paint() {
    shade.replaceChildren(); counter.replaceChildren(); targets.replaceChildren(); info.hidden = !model.enabled;
    if (!model.enabled) { board.setAttribute('aria-label', 'Tablero Cerconexo de siete por siete casillas'); return; }
    board.setAttribute('aria-label', 'Inspección de regiones del tablero final');
    const selected = model.selected;
    info.textContent = regionDescription(selected);
    if (selected) {
      const owner = ['A', 'B', 'C', 'D'].includes(selected.type) ? selected.type : null;
      info.textContent += owner ? ` · Aporta ${selected.cells.length} puntos al equipo ${owner}.` : ` · Aporta 0 puntos territoriales.${timeout ? ' La victoria se decidió por tiempo.' : ''}`;
      for (const cell of selected.cells) shade.append(element('rect', { x: 60 + cell % 7 * 80, y: 60 + Math.floor(cell / 7) * 80, width: 80, height: 80, class: 'region-shade', 'data-inspected-cell': cell }));
      shade.append(element('path', { d: regionBoundary(selected.cells, 7).map(([x, y, u, v]) => `M${60 + x * 80} ${60 + y * 80}L${60 + u * 80} ${60 + v * 80}`).join(''), class: 'region-boundary' }));
      const anchor = regionAnnotation(selected, 7, { occupied: pieces.map(p => p.pos) });
      const group = element('g', { class: 'region-count', 'data-anchor': anchor.cell }), x = 60 + anchor.x * 80, y = 60 + anchor.y * 80;
      group.append(element('rect', { x: x - 23, y: y - 15, width: 46, height: 30, rx: 7 }));
      const text = element('text', { x, y }); text.textContent = anchor.count; group.append(text); counter.append(group);
    }
    for (let cell = 0; cell < 49; cell++) targets.append(element('rect', { x: 60 + cell % 7 * 80, y: 60 + Math.floor(cell / 7) * 80, width: 80, height: 80, fill: 'transparent',
      role: 'button', tabindex: cell === model.focusCell ? 0 : -1, 'data-inspect': cell,
      'aria-pressed': String(!!selected && selected === model.components[model.byCell.get(cell)]),
      'aria-label': `Fila ${Math.floor(cell / 7) + 1}, columna ${cell % 7 + 1}. ${regionDescription(model.components[model.byCell.get(cell)])}` }));
  }
  const click = event => { const cell = event.target.dataset.inspect; if (cell !== undefined) { model.select(+cell); paint(); } };
  const key = event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); model.moveFocus(event.key); }
    else if (['Enter', ' '].includes(event.key) && !event.repeat) { event.preventDefault(); event.stopPropagation(); model.select(+event.target.dataset.inspect); }
    else return;
    paint(); targets.querySelector(`[data-inspect="${model.focusCell}"]`)?.focus({ preventScroll: true });
  };
  targets.addEventListener('click', click); targets.addEventListener('keydown', key);
  return {
    update(classic, finished, outcome) {
      const next = JSON.stringify([classic.territory.components, finished, outcome?.reason]);
      if (next === signature) return; signature = next;
      model.update(classic.territory.components.map(c => ({ ...c, type: c.type === 'mixed' ? 'shared' : c.type })), 7);
      model.enabled = finished; timeout = outcome?.reason === 'timeout';
      pieces = classic.game.pieces.map(p => ({ ...p, pos: p.id === classic.draft.actor ? classic.draft.path.at(-1) : p.pos }));
      if (!finished) model.reset(); paint();
    },
    destroy() { targets.removeEventListener('click', click); targets.removeEventListener('keydown', key); shade.remove(); counter.remove(); targets.remove(); }
  };
}
