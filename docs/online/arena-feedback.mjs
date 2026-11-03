import { POWER_LABELS } from '../arena/src/config.mjs';
import { arenaCpuPresentation } from '../arena/src/cpuPresentation.mjs';
import { powerIcon } from '../arena/src/powerMedals.mjs';
import { FINAL_COLORS } from '../src/finalPresentation.mjs';

export function arenaFeedback(previous, next, connected) {
  if (!connected || previous?.status !== 'active' || previous.matchId !== next.matchId) return null;
  const before = previous.arena.game;
  const after = next.arena.game;
  if (after.revision !== before.revision + 1) return null;

  const event = after.lastEvents.find(entry => entry.type === 'action' || entry.type === 'discard');
  if (!event) return null;
  const action = event.type === 'discard' ? event : { type: event.action, to: event.to };
  const steps = arenaCpuPresentation(before, after, action);
  const previousView = previous.arena.territory;
  const nextView = next.arena.territory;
  const territory = nextView.byCell.flatMap((component, cell) => {
    const from = previousView.components[previousView.byCell[cell]].type;
    const to = nextView.components[component].type;
    return from === to ? [] : [{ cell, to }];
  });
  return {
    revision: after.revision,
    action: action.type,
    text: steps.map(step => step.text).join(' '),
    power: Object.hasOwn(POWER_LABELS, action.type) ? action.type : null,
    origin: before.pieces.find(piece => piece.id === event.actor)?.pos,
    destination: action.to,
    pieces: after.lastEvents.filter(entry => ['secured', 'reactivated'].includes(entry.type))
      .map(entry => ({ ...entry, cell: after.pieces.find(piece => piece.id === entry.actor).pos })),
    territory,
  };
}

export function mountArenaFeedback(board, notice, { point, edge }) {
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('pointer-events', 'none');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  let effect;

  function clearLayer() {
    effect?.cancel();
    effect = undefined;
    layer.remove();
    layer.replaceChildren();
  }

  function clear() {
    clearTimeout(timer);
    clearLayer();
    notice.hidden = true;
    notice.textContent = '';
    delete notice.dataset.actionRevision;
  }

  function restoreLayer() {
    if (layer.childElementCount) board.append(layer);
  }

  function shape(tag, attributes) {
    const node = document.createElementNS(layer.namespaceURI, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    layer.append(node);
    return node;
  }

  function show(feedback) {
    clear();
    notice.dataset.actionRevision = feedback.revision;
    notice.textContent = feedback.text;
    notice.hidden = false;
    for (const { cell, to } of feedback.territory) {
      const { x, y } = point(cell);
      shape('rect', { x: x - 47, y: y - 47, width: 94, height: 94,
        fill: 'none', stroke: FINAL_COLORS[to] ?? '#475569', 'stroke-width': 5 });
    }
    for (const { cell, team, type } of feedback.pieces) {
      const { x, y } = point(cell);
      shape('circle', { cx: x, cy: y, r: 43, fill: 'none', stroke: FINAL_COLORS[team],
        'stroke-width': 7, 'stroke-dasharray': type === 'reactivated' ? '9 5' : 'none' });
    }
    if (['wall', 'extraWall', 'demolition'].includes(feedback.action)) {
      const { x1, y1, x2, y2 } = edge(feedback.origin, feedback.destination);
      const demolition = feedback.action === 'demolition';
      shape('line', { x1, y1, x2, y2, stroke: demolition ? '#a24532' : '#a46a06',
        'stroke-width': 10, 'stroke-dasharray': demolition ? '12 6' : 'none' });
    }
    if (feedback.power) {
      const { x, y } = point(feedback.destination);
      const left = Math.min(842, x + 14);
      const top = Math.max(4, y - 66);
      shape('rect', { x: left, y: top, width: 54, height: 54, rx: 10, fill: '#102a43', stroke: '#ffd166', 'stroke-width': 2 });
      shape('g', {}).innerHTML = powerIcon(feedback.power, { x: left + 7, y: top + 7, size: 40 });
    }
    restoreLayer();
    if (layer.isConnected && !motion.matches) effect = layer.animate?.(
      [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: 750, fill: 'forwards' }
    );
    timer = setTimeout(clearLayer, 800);
  }

  return { show, clear, restoreLayer };
}
