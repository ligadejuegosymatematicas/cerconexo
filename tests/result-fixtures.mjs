import {initialState,wallKey,applyTurn} from '../src/engine.mjs';
import {enclose,finishFixture} from './territory-fixtures.mjs';

// Regiones conectadas por el recorrido serpenteante; la única abertura A/B
// se cierra mediante una jugada legal, sin modificar el motor para las pruebas.
export function resultFixture({A=28,B=16,pockets=false}={}){
  const order=Array.from({length:49},(_,i)=>Math.floor(i/7)*7+(Math.floor(i/7)%2?6-i%7:i%7));
  const a=order.slice(0,A),b=order.slice(A,A+B),empty=order.slice(A+B);
  const from=a.at(-1),to=b[0],gap=wallKey(from,to),before=initialState();
  enclose(before,a,gap);enclose(before,b,gap);enclose(before,empty);
  for(const p of before.pieces)p.pos={A1:from,A2:a[0],B1:to,B2:b.at(-1)}[p.id];
  if(pockets){
    for(const p of before.pieces)p.pos={A1:a[0],A2:from,B1:b.at(-1),B2:to}[p.id];
    enclose(before,[a[0]]);enclose(before,[b.at(-1)]);
  }
  finishFixture(before);
  return {before,after:applyTurn(before,{actor:before.currentActor,path:[from],to}),to};
}
