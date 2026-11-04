import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { eventually } from './runtime.mjs';
const online=fileURLToPath(new URL('../',import.meta.url)),repo=path.dirname(online);
export async function startUX({port=8815,apiPort=8820,arena1v1=false,arenaFfa=false,stateDir=path.join(online,'.state/ux-local'),worker=path.join(online,'src/worker.mjs')}={}) {
  await mkdir(stateDir,{recursive:true});
  const origin=`http://127.0.0.1:${port}`,api=`http://127.0.0.1:${apiPort}`;
  const config={name:'cerconexo-ux-local',main:worker,compatibility_date:'2026-10-23',workers_dev:false,preview_urls:false,send_metrics:false,durable_objects:{bindings:[{name:'ROOMS',class_name:'Room'},{name:'ADMISSION',class_name:'AdmissionGate'}]},migrations:[{tag:'ux-local-1',new_sqlite_classes:['Room','AdmissionGate']}],vars:{LOCAL_DEMO:'true',ARENA_DUO_ENABLED:'true',ARENA_1V1_ENABLED:String(arena1v1),ARENA_FFA_ENABLED:String(arenaFfa),ALLOWED_ORIGINS:origin+','+api}};
  const configPath=path.join(stateDir,'wrangler.jsonc');await writeFile(configPath,JSON.stringify(config));
  const env={...process.env,CI:'1',NODE_USE_SYSTEM_CA:'1',WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:path.join(stateDir,'config'),WRANGLER_LOG_PATH:path.join(stateDir,'logs')};
  for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CLOUDFLARE_ACCOUNT_ID'])delete env[key];
  const child=spawn(process.execPath,[path.join(online,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',configPath,'--local','--ip','127.0.0.1','--port',String(apiPort),'--inspector-port',String(apiPort+1000),'--persist-to',path.join(stateDir,'sqlite')],{cwd:stateDir,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let log='';child.stdout.on('data',d=>{log+=d;});child.stderr.on('data',d=>{log+=d;});
  const allowed=new Set(['.nojekyll',...JSON.parse(await readFile(path.join(repo,'scripts/pages-files.json'),'utf8'))]);
  const types={html:'text/html; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css',png:'image/png',webp:'image/webp'};
  const server=http.createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,origin).pathname;
    if(pathname==='/'){res.writeHead(302,{location:'/cerconexo/'});res.end();return;}
    if(!pathname.startsWith('/cerconexo/')){res.writeHead(404);res.end();return;}
    let name=pathname.slice('/cerconexo/'.length);if(!name||name.endsWith('/'))name+='index.html';
    if(!allowed.has(name)){res.writeHead(404);res.end();return;}
    const body=name==='online/config.mjs'?Buffer.from(`export const API_BASE = ${JSON.stringify(api)};\nexport const ARENA_DUO_ENABLED=true;\nexport const ARENA_1V1_ENABLED=${arena1v1};\nexport const ARENA_FFA_ENABLED=${arenaFfa};\n`):await readFile(path.join(repo,'docs',name));
    res.writeHead(200,{'content-type':types[name.split('.').at(-1)]??'application/octet-stream','cache-control':'no-store'});res.end(body);
  }catch{res.writeHead(500);res.end('No se pudo cargar el recurso local.');}});
  const stop=async()=>{
    await new Promise(resolve=>server.listening?server.close(resolve):resolve());
    if(child.exitCode===null){const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});await new Promise(resolve=>killer.once('exit',resolve));}
    await writeFile(path.join(stateDir,'runtime.log'),log);
  };
  try{await eventually(async()=>{if(child.exitCode!==null)throw Object.assign(new Error('El servidor local terminó.'),{fatal:true});return (await fetch(api+'/api/health',{signal:AbortSignal.timeout(30000)})).ok;},'No inició workerd local',90000);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(e){await stop();throw e;}
  return{origin,api,entry:origin+'/cerconexo/online/',base:origin+'/cerconexo',stateDir,stop};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const site=await startUX({arena1v1:process.argv.includes('--arena-1v1')||process.argv.includes('--arena-ffa'),arenaFfa:process.argv.includes('--arena-ffa')});console.log('Candidata local: '+site.base+'/');console.log('Solo loopback; SQLite aislado. No conecta con Cloudflare público.');
  for(const event of ['SIGINT','SIGTERM'])process.once(event,async()=>{await site.stop();process.exit();});
}
