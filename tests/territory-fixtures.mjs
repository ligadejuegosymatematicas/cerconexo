import {initialState,adjacent,wallKey,finished,chooseActor,territory,applyTurn,verifyState} from '../src/engine.mjs';

export function finishFixture(game){
  game.moves=game.walls.length;game.over=finished(game);
  game.currentActor=game.over?null:chooseActor(game,game.turnTeam);
  if(game.over){const {score}=territory(game);game.winner=score.A===score.B?'Empate':score.A>score.B?'A':'B';}
  if(!verifyState(game))throw Error('Fixture inválida');
  return game;
}
export function enclose(game,cells,gap=null){
  const inside=new Set(cells),walls=new Set(game.walls);
  for(const cell of cells)for(const to of adjacent(cell)){
    const key=wallKey(cell,to);
    if(!inside.has(to)&&key!==gap)walls.add(key);
  }
  game.walls=[...walls];return game;
}
export function conquestFixture({owner='A',rival=false,both=false}={}){
  const game=initialState(),cells=Array.from({length:21},(_,i)=>i).filter(i=>i%7<4);
  enclose(game,cells,wallKey(17,18));
  const positions=owner==='A'?{A1:17,A2:both?8:40,B1:12,B2:36}:{A1:18,A2:40,B1:17,B2:36};
  for(const p of game.pieces)p.pos=positions[p.id];
  game.turnTeam=rival||owner==='A'?'A':'B';finishFixture(game);
  const to=rival?17:18;
  const actor=game.currentActor,path=[game.pieces.find(p=>p.id===actor).pos];
  return {before:game,after:applyTurn(game,{actor,path,to}),to,cells};
}
export function emptyFixture(){
  const game=initialState();game.pieces[0].pos=1;
  enclose(game,[0],wallKey(0,1));finishFixture(game);
  return {before:game,after:applyTurn(game,{actor:'A1',path:[1],to:0}),to:0};
}
export function sharedFixture(){
  const game=initialState();
  enclose(game,Array.from({length:21},(_,i)=>i),wallKey(17,24));
  for(const p of game.pieces)p.pos={A1:17,B1:12,A2:40,B2:36}[p.id];
  finishFixture(game);
  return {before:game,after:applyTurn(game,{actor:'A1',path:[17],to:24}),to:24};
}
