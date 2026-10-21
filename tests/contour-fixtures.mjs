import {initialState} from '../src/engine.mjs';
import {enclose,finishFixture} from './territory-fixtures.mjs';

export const contourShapes={
  small:[8],rectangle:[8,9,15,16],L:[8,15,22,23,24],
  irregular:[8,9,10,15,22,23,24,25,32],
  hole:[16,17,18,23,25,30,31,32],
  large:Array.from({length:49},(_,i)=>i).filter(i=>i!==12&&i!==36)
};

export function contourFixture(name){
  const cells=contourShapes[name],game=initialState();enclose(game,cells);
  game.pieces.find(p=>p.id==='A1').pos=cells[0];
  game.pieces.find(p=>p.id==='A2').pos=cells.length===1?40:cells.at(-1);
  if(cells.length===1)enclose(game,[40]);
  return finishFixture(game);
}
