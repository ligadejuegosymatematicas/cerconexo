/** Servidor de comprobación: sirve exclusivamente docs/ bajo /cerconexo/. */
import http from 'node:http';
import {readFile} from 'node:fs/promises';

export const rootURL=new URL('../',import.meta.url);
export const prefix='/cerconexo/';
export async function publicFiles(){
  return [...JSON.parse(await readFile(new URL('scripts/pages-files.json',rootURL),'utf8')),'.nojekyll'];
}
export async function startPagesServer({entry='clasico/'}={}){
  const allowed=new Set(await publicFiles());
  const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname===prefix.slice(0,-1)){res.writeHead(301,{Location:prefix});res.end();return;}
    if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
    let name=pathname.slice(prefix.length)||'index.html';
    if(!name.endsWith('/')&&allowed.has(name+'/index.html')){res.writeHead(301,{Location:pathname+'/'});res.end();return;}
    if(name.endsWith('/'))name+='index.html';
    if(!allowed.has(name)){res.writeHead(404);res.end();return;}
    try{
      const data=await readFile(new URL(`docs/${name}`,rootURL));
      const extension=name.slice(name.lastIndexOf('.'));
      res.writeHead(200,{'Content-Type':types[extension]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,url:origin+prefix+entry,homeURL:origin+prefix,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
