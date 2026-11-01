import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startUX} from './ux-local.mjs';
import {legacySource} from './ux-legacy-source.mjs';
import {SocketClient} from './socket-client.mjs';
import {eventually} from './runtime.mjs';
import {applyTurn,legalActors,wallOptions,territory} from '../../src/engine.mjs';
const stateDir=fileURLToPath(new URL('../.state/ux-compat-'+Date.now()+'/',import.meta.url));
const options={stateDir,port:8817,apiPort:8822},legacy=await legacySource(),report={ok:false,checks:[],external:[],errors:[]};
let site=await startUX({...options,worker:legacy.worker}),browser;const sockets=[],contexts=[];
const token=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
function code(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return[...crypto.getRandomValues(new Uint8Array(10))].map(b=>a[b&31]).join('');}
async function post(path,body,status=200){const r=await fetch(site.api+path,{method:'POST',headers:{origin:site.origin,'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status);return r.json();}
const view=p=>p.locator('#publicState').textContent().then(JSON.parse);
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
try{
  const gameCode=code(),credentials=Array.from({length:4},token),registration={code:gameCode,credential:credentials[0],name:'Ana',mode:'classic',policy:'team',players:4};await post('/api/rooms',registration,201);
  sockets.push(await new SocketClient(site.api,gameCode,credentials[0],{},undefined,site.origin).connect());
  for(let i=1;i<4;i++){const joined=await post(`/api/rooms/${gameCode}/join`,{name:'Persona '+(i+1),credential:credentials[i]});await sockets[0].command('admit',{playerId:joined.state.self.id,seat:['A1','B1','A2','B2'][i]});sockets.push(await new SocketClient(site.api,gameCode,credentials[i],{},undefined,site.origin).connect());}
  const same=()=>sockets.every(c=>c.state.revision===sockets[0].state.revision);
  for(const c of sockets){await eventually(same,'Lobby antiguo divergente');await c.command('ready',{ready:true});}await eventually(same,'Preparación antigua divergente');await sockets[0].command('start');await eventually(()=>sockets.every(c=>c.state.status==='active'),'No inició el servidor antiguo');
  await sockets[0].command('classic.select',{actor:'A1',matchId:sockets[0].state.matchId});
  const partial=sockets[0].envelope('classic.step',{to:9,matchId:sockets[0].state.matchId});assert.equal((await sockets[0].request(partial)).type,'ack');const before=structuredClone(sockets[0].state);
  const lobbyCode=code(),lobbyCredential=token(),lobbyRegistration={code:lobbyCode,credential:lobbyCredential,name:'Sala anterior',mode:'classic',policy:'team',players:4};await post('/api/rooms',lobbyRegistration,201);
  const pendingCredential=token(),pending=await post(`/api/rooms/${lobbyCode}/join`,{name:'Solicitud anterior',credential:pendingCredential});
  for(const c of sockets)await c.close();await site.stop();site=await startUX(options);
  // The original creation receipt remains idempotent even though its policy is retired.
  const retried=await post('/api/rooms',lobbyRegistration,201);assert.equal(retried.state.self.host,true);assert.equal(retried.state.config.policy,'team');
  const denied=await post('/api/rooms',{...lobbyRegistration,code:code(),credential:token()},409);assert.equal(denied.error.code,'CONFIG_RETIRED');report.checks.push('Servidor rechaza nuevas 2 vs. 2/equipo; reintento antiguo conserva su sala');
  browser=await chromium.launch({channel:'msedge',headless:true});const pages=[];let duplicates=0;
  for(let i=0;i<4;i++){
    const c=await browser.newContext({viewport:{width:i===0?390:1440,height:i===0?844:1000},hasTouch:i===0,isMobile:i===0,reducedMotion:'reduce'});contexts.push(c);
    await c.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();report.external.push(r.request().url());return r.abort();});
    await c.addInitScript(({code,credential,pending})=>localStorage.setItem('cerconexo-m6-session-v1:1:'+code,JSON.stringify({code,credential,pending})),{code:gameCode,credential:credentials[i],pending:i===0?partial:null});
    const p=await c.newPage();pages.push(p);p.on('pageerror',e=>report.errors.push(e.message));p.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{if(JSON.parse(String(payload)).duplicate)duplicates++;}catch{}}));await p.goto(site.entry+'?room='+gameCode);await p.locator('[data-classic-connection][data-phase=connected]').waitFor();
  }
  await eventually(async()=>(await Promise.all(pages.map(view))).every(s=>s.participants.every(p=>p.online)),'No se recuperaron los cuatro participantes');
  for(const p of pages){const s=await view(p);assert.deepEqual(s.classic,before.classic);assert.equal(s.config.policy,'team');assert.ok(s.clock.remainingMs.A<=before.clock.remainingMs.A);}assert.ok(duplicates>0);report.checks.push('Reinicio real desde 0eb4d27 recupera paso parcial, cuatro identidades y recibo sin duplicación');
  let expected=before.classic.game,turns=0;
  while(!expected.over){
    assert.ok(turns++<100);const all=await Promise.all(pages.map(view)),s=all[0],actor=s.classic.draft.actor??legalActors(expected)[0];
    const index=all.findIndex(v=>v.self.controlledPieces.includes(actor)),p=pages[index];
    if(!s.classic.draft.actor){await p.locator(`[data-actor=${actor}] .actor-hit`).click();await eventually(async()=>(await view(p)).classic.draft.actor===actor,'Selección no confirmada');}
    const snapshot=await view(p),path=snapshot.classic.draft.path,wall=wallOptions(expected,path.at(-1))[turns%wallOptions(expected,path.at(-1)).length];
    expected=applyTurn(expected,{actor,path,to:wall});await p.locator(`[data-wall="${wall}"] .wall-hit`).click();
    await eventually(async()=>(await Promise.all(pages.map(view))).every(v=>JSON.stringify(v.classic.game)===JSON.stringify(expected)),'Tableros antiguos no convergen');
  }
  for(const p of pages){const s=await view(p);assert.equal(s.outcome.reason,'territory');assert.deepEqual(s.outcome.score,territory(expected).score);assert.equal(s.features.rematch,false);assert.equal(await p.locator('[data-classic-propose-rematch]').isVisible(),false);assert.equal(await p.locator('[data-classic-new-room]').isVisible(),true);}
  report.checks.push('Partida antigua finaliza con puntuación oficial; no permite revancha y ofrece nueva sala');report.legacyTurns=expected.moves;
  await pages[0].screenshot({path:new URL('../evidence/ux-legacy-final-mobile.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  const lobby=await browser.newContext({viewport:{width:390,height:844}});contexts.push(lobby);await lobby.addInitScript(({code,credential})=>localStorage.setItem('cerconexo-m6-session-v1:1:'+code,JSON.stringify({code,credential})),{code:lobbyCode,credential:lobbyCredential});const p=await lobby.newPage();await p.goto(site.entry+'?room='+lobbyCode);await p.locator('#connection[data-phase=connected]').waitFor();assert.equal(await p.locator('#retiredNotice').isVisible(),true);assert.equal(await p.locator('#startButton').isVisible(),false);
  const requestAgain=await post(`/api/rooms/${lobbyCode}/join`,{name:'Solicitud anterior',credential:pendingCredential});assert.equal(requestAgain.state.self.id,pending.state.self.id);report.checks.push('Lobby antiguo y solicitud pendiente recuperables sin cambiar configuración ni perder acceso');
  assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.error=e.stack??e.message;process.exitCode=1;}
finally{for(const c of contexts)await c.close();for(const s of sockets){clearInterval(s.ping);s.ws?.terminate();}await browser?.close();await site.stop();await writeFile(new URL('../evidence/ux-compatibility-browser.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
