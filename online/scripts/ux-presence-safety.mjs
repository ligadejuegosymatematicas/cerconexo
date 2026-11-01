import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startUX} from './ux-local.mjs';
import {SocketClient} from './socket-client.mjs';
import {eventually} from './runtime.mjs';
const site=await startUX({port:8819,apiPort:8824}),clients=[],report={ok:false,checks:[]};
const token=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const code=[...crypto.getRandomValues(new Uint8Array(10))].map(b=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b&31]).join(''),credentials=[token(),token()];
async function post(path,body,credential){const r=await fetch(site.api+path,{method:'POST',headers:{origin:site.origin,'content-type':'application/json',...(credential?{authorization:'Bearer '+credential}:{})},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();}
async function connect(i){const c=await new SocketClient(site.api,code,credentials[i],{},undefined,site.origin).connect();clients.push(c);return c;}
async function control(c,extra={}){const n=c.messages.length,requestId=crypto.randomUUID();c.ws.send(JSON.stringify({type:'view-away',roomId:code,protocolVersion:1,requestId,...extra}));await eventually(()=>c.messages.slice(n).some(m=>m.type==='view-left'||m.type==='error'),'Sin respuesta de presencia');return c.messages.slice(n).find(m=>m.type==='view-left'||m.type==='error');}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
try{
  await post('/api/rooms',{code,credential:credentials[0],name:'Ana',mode:'classic',policy:'piece',players:2});const a=await connect(0),joined=await post(`/api/rooms/${code}/join`,{name:'Beto',credential:credentials[1]});await a.command('admit',{playerId:joined.state.self.id,seat:'B'});const b=await connect(1);
  await a.command('ready',{ready:true});await eventually(()=>a.state.revision===b.state.revision,'Revisión pendiente');await b.command('ready',{ready:true});await eventually(()=>a.state.revision===b.state.revision,'Revisión pendiente');await a.command('start');await eventually(()=>a.state.status==='active','No comenzó');await a.command('classic.step',{to:9,matchId:a.state.matchId});const board=structuredClone(a.state.classic),id=a.state.self.id;
  const forged=await control(a,{playerId:b.state.self.id});assert.equal(forged.error.code,'MESSAGE');assert.ok(a.state.participants.find(p=>p.id===id).online);report.checks.push('Salida rechaza identidad ajena y parámetros adicionales');
  assert.equal((await control(a)).type,'view-left');for(let i=0;i<3;i++)assert.equal((await control(a)).type,'view-left');const start=(await post(`/api/rooms/${code}/resume`,{},credentials[1])).state;await sleep(1100);const away=(await post(`/api/rooms/${code}/resume`,{},credentials[1])).state;
  assert.equal(away.clock.graceUntil,null);assert.ok(away.clock.remainingMs.A<start.clock.remainingMs.A-900);assert.deepEqual(away.classic,board);assert.equal(away.clock.graceUsedMs[id],0);report.checks.push('Repetir salida autenticada no pausa, no restaura tiempo ni mueve el tablero');
  const recovered=await connect(0);await eventually(()=>a.messages.some(m=>m.type==='session-replaced'),'Conexión anterior no fue invalidada');assert.equal(recovered.state.self.id,id);assert.deepEqual(recovered.state.classic,board);report.checks.push('Recuperar en otra conexión conserva identidad y paso e invalida la conexión anterior');
  await recovered.abort();await sleep(1100);const lost=(await post(`/api/rooms/${code}/resume`,{},credentials[1])).state;assert.ok(lost.clock.graceUntil>lost.serverNow);assert.ok(lost.clock.graceUsedMs[id]>0);
  const again=await connect(0),used=again.state.clock.graceUsedMs[id];assert.ok(used>=lost.clock.graceUsedMs[id]);await control(again);await sleep(300);const final=(await post(`/api/rooms/${code}/resume`,{},credentials[1])).state;assert.equal(final.clock.graceUsedMs[id],used);assert.equal(final.clock.graceUntil,null);assert.deepEqual(final.classic,board);report.checks.push('Pérdida real obtiene gracia normal; navegar después no devuelve ni amplía su presupuesto');report.ok=true;
}catch(e){report.error=e.stack??e.message;process.exitCode=1;}
finally{for(const c of clients){clearInterval(c.ping);c.ws?.terminate();}await site.stop();await writeFile(new URL('../evidence/ux-presence-safety.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
