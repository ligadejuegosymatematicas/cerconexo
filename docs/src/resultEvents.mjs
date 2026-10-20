import {territory} from './engine.mjs';

// Traduce el resultado oficial. No decide el ganador ni vuelve a contar regiones.
export function finalPresentation(game,score=territory(game).score){
  if(!game.over)return null;
  const draw=game.winner==='Empate',winner=game.winner;
  const difference=Math.abs(score.A-score.B);
  const title=draw?'¡EMPATE!':`¡VICTORIA DEL EQUIPO ${winner}!`;
  const subtitle=draw?'Ambos equipos aseguraron la misma cantidad de casillas':
    `El equipo ${winner==='A'?'naranja':'celeste'} aseguró más casillas`;
  const detail=draw?`Ambos equipos aseguraron ${score.A} ${score.A===1?'casilla':'casillas'}`:
    `El equipo ${winner} gana por ${difference} ${difference===1?'casilla':'casillas'}`;
  return {winner,draw,title,subtitle,detail,difference,score:{A:score.A,B:score.B,empty:score.empty},
    announcement:`Partida finalizada. ${draw?'Empate':`Victoria del equipo ${winner}`}. Equipo A: ${score.A} casillas. Equipo B: ${score.B} casillas. Casillas vacías: ${score.empty}.`};
}
