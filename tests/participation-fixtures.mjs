import {initialState,wallKey,applyTurn} from '../src/engine.mjs';
import {enclose,finishFixture} from './territory-fixtures.mjs';

// Dos bolsillos de una casilla conectados por un único borde a la región mixta.
export function participationFixture({team='A',alreadyA=false}={}){
  const before=initialState();
  enclose(before,[8],team==='A'?wallKey(8,15):null);
  if(team==='B')enclose(before,[12],wallKey(12,19));
  if(!alreadyA&&team==='B')before.walls=before.walls.filter(key=>!['1-8','7-8','8-9','8-15'].includes(key));
  before.turnTeam=team;finishFixture(before);
  const actor=before.currentActor,to=team==='A'?15:19,path=[before.pieces.find(p=>p.id===actor).pos];
  return {before,after:applyTurn(before,{actor,path,to}),to};
}
export function directDuelFixture(){
  // A1/B1 comparten un bolsillo de dos casillas; A2/B2 siguen en la otra componente.
  // El muro entre las dos primeras asegura ambas fichas sin finalizar la partida.
  const before=initialState();before.pieces.find(p=>p.id==='B1').pos=9;
  enclose(before,[8,9]);finishFixture(before);
  return {before,after:applyTurn(before,{actor:'A1',path:[8],to:9}),to:9};
}
