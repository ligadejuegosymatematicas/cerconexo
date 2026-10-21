import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine.mjs';
import * as classic from './classic-engine-v2.mjs';
import {TEAM_TURNS,PIECE_TURNS,turnMode} from '../src/turnPolicies.mjs';
import {beginDraft,selectDraft} from '../src/turnDraft.mjs';
import {finishFixture} from './territory-fixtures.mjs';
import {participationFixture,directDuelFixture} from './participation-fixtures.mjs';
import {resultFixture} from './result-fixtures.mjs';
import {deriveTerritoryEvents} from '../src/territoryEvents.mjs';
import {recentParticipationPresentation} from '../src/matchup.mjs';
import {finalRegions} from '../src/explorationData.mjs';

const asTeam=game=>finishFixture({...structuredClone(game),turnMode:TEAM_TURNS});
const turn=(game,actor,to,path=[engine.pieceById(game,actor).pos])=>({actor,path,to});
function choices(api,game,actor){
  const paths=[[api.pieceById(game,actor).pos]];
  for(let i=0;i<paths.length;i++)if(paths[i].length<3)for(const to of api.availableMoves(game,actor,paths[i].at(-1)))paths.push([...paths[i],to]);
  return paths.flatMap(path=>api.wallOptions(game,path.at(-1)).map(to=>({actor,path,to})));
}
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};

test('M1: equivalencia clásica determinista de partidas completas, jugadas legales y estados',()=>{
  for(let seed=1;seed<=24;seed++){
    let old=classic.initialState(),game=engine.initialState();const random=rng(seed);
    while(!old.over){
      assert.deepEqual(game,old);assert.equal(engine.verifyState(game),true);
      assert.deepEqual(engine.regions(game),classic.regions(old));assert.deepEqual(engine.territory(game),classic.territory(old));
      assert.deepEqual(engine.activeIds(game),classic.activeIds(old));
      const possible=choices(engine,game,game.currentActor);assert.deepEqual(possible,choices(classic,old,old.currentActor));
      const action=possible[random()%possible.length];game=engine.applyTurn(game,action);old=classic.applyTurn(old,action);
    }
    assert.deepEqual(game,old);assert.ok(game.moves<=84);assert.equal(turnMode(game),PIECE_TURNS);
  }
});

test('M1: estados clásicos antiguos siguen válidos sin migración ni campo de modalidad',()=>{
  for(const old of [classic.initialState(),participationFixture().after,directDuelFixture().after,resultFixture().after]){
    const saved=JSON.stringify(old),game=JSON.parse(saved);assert.equal(engine.verifyState(game),true);
    assert.equal(turnMode(game),PIECE_TURNS);assert.equal(JSON.stringify(game),saved);
  }
  assert.throws(()=>engine.initialState({turnMode:'cpu'}));assert.equal(engine.verifyState({...classic.initialState(),turnMode:'online'}),false);
});

test('M1: clásico conserva orden y redistribuciones de las cuatro fichas',()=>{
  let game=engine.initialState();const actors=[];
  for(let i=0;i<8;i++){actors.push(game.currentActor);game=engine.applyTurn(game,choices(engine,game,game.currentActor)[0]);}
  assert.deepEqual(actors,['A1','B1','A2','B2','A1','B1','A2','B2']);
  for(const team of ['A','B'])for(const number of [1,2]){
    const game=participationFixture({team}).before;
    if(number===2){const a=engine.pieceById(game,team+'1'),b=engine.pieceById(game,team+'2');[a.pos,b.pos]=[b.pos,a.pos];game.lastActed[team]=team+'1';finishFixture(game);}
    const action=turn(game,team+number,team==='A'?15:19),next=engine.applyTurn(game,action);
    assert.deepEqual(next,classic.applyTurn(game,action));assert.equal(engine.chooseActor(next,team),team+(number===1?2:1));
  }
});

test('M1: A y B eligen libremente, incluso repitiendo su ficha en turnos sucesivos',()=>{
  let game=engine.initialState({turnMode:TEAM_TURNS});const before=JSON.stringify(game);
  assert.deepEqual(engine.legalActors(game),['A1','A2']);assert.equal(game.currentActor,null);
  assert.deepEqual(beginDraft(game),{actor:null,path:[]});assert.equal(JSON.stringify(game),before);
  for(const actor of ['A1','B2','A1','B1','A2','B2']){
    assert.ok(engine.legalActors(game).includes(actor));const team=actor[0];
    const next=engine.applyTurn(game,choices(engine,game,actor)[0]);assert.equal(next.lastMove.actor,actor);
    assert.equal(next.moves,game.moves+1);assert.equal(next.walls.length,game.walls.length+1);
    assert.equal(next.turnTeam,team==='A'?'B':'A');assert.equal(engine.verifyState(next),true);game=next;
  }
});

test('M1: ficha rival o asegurada rechazada por el motor, sin alterar el estado',()=>{
  const game=engine.initialState({turnMode:TEAM_TURNS}),saved=JSON.stringify(game);
  assert.throws(()=>engine.applyTurn(game,turn(game,'B1',5)),/equipo A/);
  assert.throws(()=>selectDraft(game,beginDraft(game),'B2'));
  const secured=asTeam(participationFixture().after);secured.turnTeam='A';finishFixture(secured);
  assert.deepEqual(engine.legalActors(secured),['A2']);assert.equal(secured.currentActor,'A2');
  assert.throws(()=>engine.applyTurn(secured,turn(secured,'A1',15)),/activa/);
  assert.equal(beginDraft(secured).actor,'A2');assert.equal(JSON.stringify(game),saved);
});

test('M1: selección y cambio descartan solo el recorrido provisional, no consumen ni guardan turno',()=>{
  const game=engine.initialState({turnMode:TEAM_TURNS}),saved=JSON.stringify(game),empty=beginDraft(game);
  const a=selectDraft(game,empty,'A1');a.path.push(9,16);
  const b=selectDraft(game,a,'A2');assert.deepEqual(b,{actor:'A2',path:[40]});
  assert.deepEqual(a.path,[8,9,16]);assert.equal(selectDraft(game,b,'A2'),b);
  assert.equal(JSON.stringify(game),saved);assert.deepEqual(beginDraft(JSON.parse(saved)),empty);
});

test('M1: cero, uno, dos pasos, giro, retorno y muro obligatorio comparten las reglas',()=>{
  for(const path of [[8],[8,9],[8,9,16],[8,9,8]]){
    const game=engine.initialState({turnMode:TEAM_TURNS}),to=engine.wallOptions(game,path.at(-1))[0];
    const next=engine.applyTurn(game,{actor:'A1',path,to});assert.equal(next.pieces[0].pos,path.at(-1));assert.equal(next.moves,1);
  }
  const game=engine.initialState({turnMode:TEAM_TURNS});
  for(const action of [{actor:'A1',path:[],to:1},{actor:'A1',path:[8,10],to:11},{actor:'A1',path:[8,9,16,23],to:24},{actor:'A1',path:[8],to:48}])assert.throws(()=>engine.applyTurn(game,action));
  const next=engine.applyTurn(game,turn(game,'A1',9));assert.throws(()=>engine.applyTurn(next,turn(next,'A1',15)));
});

test('M1: ambos equipos autoeligen la única ficha y anuncian disponibilidad sin alternancia',()=>{
  for(const team of ['A','B']){
    const before=asTeam(participationFixture({team}).before),after=engine.applyTurn(before,turn(before,team+'1',team==='A'?15:19));
    const event=deriveTerritoryEvents(before,after),data=recentParticipationPresentation(event.participation,{mode:TEAM_TURNS});
    assert.equal(engine.chooseActor(after,team),team+'2');assert.equal(beginDraft({...after,turnTeam:team,currentActor:team+'2'}).actor,team+'2');
    assert.equal(data.detail,`${team}2 será la única ficha disponible del equipo ${team}.`);assert.doesNotMatch(data.announcement,/jugará todos|altern/);
    assert.deepEqual(engine.territory(after),classic.territory(after));
  }
});

test('M1: aislamiento simultáneo, 1 vs. 1 y final no crean turnos imposibles',()=>{
  const before=asTeam(directDuelFixture().before),after=engine.applyTurn(before,turn(before,'A1',9));
  assert.deepEqual([...engine.activeIds(after)],['A2','B2']);assert.equal(after.currentActor,'B2');
  const event=deriveTerritoryEvents(before,after),view=recentParticipationPresentation(event.participation,{mode:TEAM_TURNS});
  assert.equal(view.detail,'Únicas fichas disponibles: A2 (equipo A) y B2 (equipo B).');assert.equal(engine.verifyState(after),true);
  assert.equal(recentParticipationPresentation(deriveTerritoryEvents(after,after).participation,{mode:TEAM_TURNS}),null);
});

test('M1: victoria A/B/empate, vacías y exploración mantienen puntuación y persistencia',()=>{
  for(const options of [{A:28,B:16},{A:16,B:28},{A:23,B:23},{A:25,B:24}]){
    const fixture=resultFixture(options),before=asTeam(fixture.before),last=fixture.after.lastMove;
    const game=engine.applyTurn(before,{actor:last.actor,path:last.path,to:last.wall[1]}),saved=JSON.stringify(game),model=finalRegions(game);
    assert.equal(game.winner,fixture.after.winner);assert.deepEqual(engine.territory(game),engine.territory(fixture.after));
    assert.equal(model.score.A+model.score.B+model.score.empty,49);assert.deepEqual(engine.legalActors(game),[]);
    assert.equal(engine.verifyState(JSON.parse(saved)),true);assert.equal(turnMode(JSON.parse(saved)),TEAM_TURNS);
    assert.throws(()=>engine.applyTurn(game,{actor:'A1',path:[8],to:9}),/terminó/);assert.equal(JSON.stringify(game),saved);
  }
});

test('M1: partidas por equipo completas conservan invariantes, legalidad y formato de guardado',()=>{
  for(let seed=1;seed<=24;seed++){
    let game=engine.initialState({turnMode:TEAM_TURNS});const random=rng(seed);
    while(!game.over){
      assert.equal(engine.verifyState(game),true);const actors=engine.legalActors(game),actor=actors[random()%actors.length],moves=choices(engine,game,actor);
      const previousTeam=game.turnTeam;game=engine.applyTurn(game,moves[random()%moves.length]);
      assert.deepEqual(engine.territory(game),classic.territory(game));const {score}=engine.territory(game);assert.equal(score.A+score.B+score.mixed+score.empty,49);
      if(!game.over)assert.notEqual(game.turnTeam,previousTeam);game=JSON.parse(JSON.stringify(game));
    }
    assert.equal(engine.verifyState(game),true);assert.equal(engine.territory(game).score.mixed,0);assert.ok(game.moves<=84);
  }
});
