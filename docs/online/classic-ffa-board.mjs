import {createBoardView} from '../src/boardView.mjs';
import {ffaTerritory, ffaActiveIds} from './classic-ffa.mjs';

// Reuse the official SVG, targets, keyboard support and wall geometry intact.
// Correct only its two-team presentation; legal interactions are generic 7×7.
export function createClassicFfaBoard(board) {
  const view = createBoardView(board);
  return {...view, render(game, draft, options) {
    view.render(game, draft, options);
    const active = new Set(ffaActiveIds(game));
    for (const region of ffaTerritory(game).components) for (const cell of region.cells) {
      const node = view.cell(cell);
      node.dataset.territory = region.type;
      node.setAttribute('fill', region.type === 'empty' ? 'url(#empty-region)' : region.type === 'mixed' ? 'var(--neutral)' : `var(--territory-${region.type.toLowerCase()})`);
    }
    for (const node of board.querySelectorAll('[data-piece]')) {
      const piece = game.pieces.find(p => p.id === node.dataset.piece);
      if (!piece) {node.remove(); continue;}
      const secured = !active.has(piece.id);
      node.classList.toggle('token-isolated', secured);
      node.querySelector('.marker-check').style.display = secured ? '' : 'none';
      node.querySelector('.token-body').setAttribute('fill', `var(--${piece.team.toLowerCase()})`);
      node.setAttribute('aria-label', `${piece.id}${secured ? ', territorio asegurado' : piece.id === draft.actor ? ', su turno' : ''}`);
    }
  }};
}
