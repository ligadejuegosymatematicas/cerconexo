// Bounded smoke check against a local SQLite namespace. Never calls Cloudflare.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {startUX} from './ux-local.mjs';
import {SocketClient} from './socket-client.mjs';
import {eventually} from './runtime.mjs';
import {availableMoves} from '../../src/engine.mjs';
import {legalArenaActions} from '../../arena/src/engine.mjs';
const legacyIndex=process.argv.indexOf('--legacy-worker');
const options={port:8852,apiPort:8853,classicFfa:true,arena1v1:true,arenaFfa:true,
  stateDir:fileURLToPath(new URL('../.state/classic-ffa-compatibility/',import.meta.url))};
let site,deadline;const sockets=[],records=[],report={ok:false,localOnly:true,legacyWorker:legacyIndex>=0,cases:[]};
const features=['rematch-v1','classic-config-v2','arena-duo-v1','arena-1v1-v1','arena-ffa-v1','classic-ffa-v1'];
async function post(path,data,credential){
  const response=await fetch(site.api+path,{method:'POST',headers:{'content-type':'application/json',origin:site.origin,...(credential?{authorization:'Bearer '+credential}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});
  const result=await response.json();assert.equal(response.ok,true,JSON.stringify(result.error));return result.state;
}
const freshToken=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const freshCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(10)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n&31]).join('');
async function connect(record){
  record.clients=[];
  for(const token of record.tokens){const c=await new SocketClient(site.api,record.code,token,{},features,site.origin).connect();record.clients.push(c);sockets.push(c);}
}
async function move(record){
  const state=record.clients[0].state,index=record.clients.findIndex(c=>state.decision.eligible.includes(c.state.self.id)),c=record.clients[index];
  await c.sync();
  if(state.classic){
    const g=c.state.classic.game;
    if(c.state.decision.selecting)await c.command('classic.select',{actor:c.state.self.controlledPieces[0],matchId:c.state.matchId});
    const actor=c.state.classic.draft.actor,to=availableMoves(g,actor,c.state.classic.draft.path.at(-1))[0];
    await c.command('classic.step',{to,matchId:c.state.matchId});
  }else{
    if(c.state.decision.selecting){const a=legalArenaActions(c.state.arena.game).find(a=>a.type==='select');await c.command('arena.action',{action:a,matchId:c.state.matchId});}
    const a=legalArenaActions(c.state.arena.game).find(a=>a.type==='move');assert.ok(a);
    await c.command('arena.action',{action:a,matchId:c.state.matchId});
  }
  await c.sync();record.before=c.state;
}
try{
  deadline=setTimeout(()=>{for(const c of sockets)c.ws?.terminate();},150000);
  site=await startUX({...options,...(legacyIndex<0?{}:{worker:process.argv[legacyIndex+1]})});
  for(const [mode,players,policy] of [['classic',2,'piece'],['classic',2,'team'],['classic',4,'piece'],['arena-duo',2,'piece'],['arena-duo',2,'team'],['arena-duo',4,'piece'],['arena-ffa',4,'piece']]){
    const r={mode,players,policy,code:freshCode(),tokens:Array.from({length:players},freshToken)};records.push(r);
    await post('/api/rooms',{code:r.code,name:'Prueba A',credential:r.tokens[0],mode,players,policy});
    for(let i=1;i<players;i++)await post(`/api/rooms/${r.code}/join`,{name:'Prueba '+i,credential:r.tokens[i]});
    await connect(r);
    for(let i=1;i<players;i++)await r.clients[0].command('admit',{playerId:r.clients[i].state.self.id,seat:r.clients[0].state.config.seats[i]});
    for(const c of r.clients){await c.sync();await c.command('ready',{ready:true});}
    await r.clients[0].sync();await r.clients[0].command('start');
    await eventually(()=>r.clients.every(c=>c.state.status==='active'),'No comenzó sala compatible',8000);
    await move(r);
  }
  for(const c of sockets)await c.close();await site.stop();site=await startUX(options);
  for(const r of records){
    await connect(r);for(const c of r.clients){await c.sync();
      assert.deepEqual(c.state.classic??c.state.arena,r.before.classic??r.before.arena);
      assert.deepEqual(c.state.participants.map(p=>[p.id,p.seat]),r.before.participants.map(p=>[p.id,p.seat]));
      for(const team of c.state.config.teams)assert.ok(c.state.clock.remainingMs[team]<=r.before.clock.remainingMs[team]);
    }
    const c=r.clients.find(c=>c.state.canDecide);assert.ok(c);
    if(c.state.classic){const to=Number(c.state.classic.draft.path.at(-1));
      const {wallOptions}=await import('../../src/engine.mjs');await c.command('classic.wall',{to:wallOptions(c.state.classic.game,to)[0],matchId:c.state.matchId});
    }else{const action=legalArenaActions(c.state.arena.game).find(a=>a.type==='wall');assert.ok(action);await c.command('arena.action',{action,matchId:c.state.matchId});}
    report.cases.push({mode:r.mode,players:r.players,policy:r.policy,partialRecovered:true,identityPreserved:true,clockNeverRefunded:true,continued:true});
  }
  report.ok=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
  clearTimeout(deadline);for(const c of sockets){clearInterval(c.ping);c.ws?.terminate();}await site?.stop();
  await mkdir(new URL('../evidence/classic-ffa/',import.meta.url),{recursive:true});
  await writeFile(new URL('../evidence/classic-ffa/compatibility.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
