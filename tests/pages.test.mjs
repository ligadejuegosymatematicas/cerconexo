import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rootURL,prefix,publicFiles,startPagesServer} from './pages-server.mjs';

test('Pages contiene solo la lista pública y conserva idénticos HTML, motor, interfaz y recursos',async()=>{
  const expected=(await publicFiles()).sort();
  // Comparación portable: recorrido explícito por los directorios del paquete.
  async function names(base=''){
    const output=[];
    for(const entry of await readdir(new URL(`docs/${base}`,rootURL),{withFileTypes:true})){
      if(entry.isDirectory())output.push(...await names(`${base}${entry.name}/`));
      else{assert.ok(entry.isFile(),'No publicar enlaces');output.push(base+entry.name);}
    }
    return output;
  }
  assert.deepEqual((await names()).sort(),expected);
  for(const name of expected){
    const data=await readFile(new URL(`docs/${name}`,rootURL));
    if(name==='.nojekyll')assert.equal(data.length,0);
    else assert.deepEqual(data,await readFile(new URL(name,rootURL)),name);
  }
  const engine=await readFile(new URL('src/engine.mjs',rootURL));
  assert.equal(createHash('sha256').update(engine).digest('hex'),'48dc06147f1bd0643d9a75ff828566f9f1517f4b24792ff352ca9c2cf1cb6b4b');
});

test('Raíz /cerconexo/, recursos y módulos se sirven con MIME correcto y sin rutas al dominio raíz',async()=>{
  const site=await startPagesServer();
  try{
    const response=await fetch(site.url);
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
    const html=await response.text();
    assert.equal(html,await readFile(new URL('index.html',rootURL),'utf8'));
    const files=new Set(await publicFiles());
    for(const name of files){
      const result=await fetch(site.url+name);assert.equal(result.status,200,name);
      if(name.endsWith('.mjs'))assert.match(result.headers.get('content-type'),/javascript/);
      if(name.endsWith('.css'))assert.match(result.headers.get('content-type'),/text\/css/);
      if(name.endsWith('.png'))assert.equal(result.headers.get('content-type'),'image/png');
    }
    const references=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>['index.html',m[1]]);
    for(const name of files){
      if(!name.endsWith('.mjs')&&!name.endsWith('.css'))continue;
      const source=await readFile(new URL(`docs/${name}`,rootURL),'utf8');
      if(name.endsWith('.mjs'))for(const match of source.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm))references.push([name,match[1]]);
      else for(const match of source.matchAll(/url\(\s*['"]?([^'"\s)]+)/g))if(!match[1].startsWith('#'))references.push([name,match[1]]);
    }
    for(const [from,reference] of references){
      assert.ok(reference.startsWith('./')||reference.startsWith('../'),`Ruta no relativa en ${from}: ${reference}`);
      const resolved=new URL(reference,site.url+from);
      assert.ok(resolved.href.startsWith(site.url),`Recurso fuera de ${prefix}`);
      assert.equal((await fetch(resolved)).status,200,resolved.href);
    }
    for(const internal of ['README.md','PUBLICACION.md','BRIEF_TECNICO_CERCONEXO_CODEX_v1.md','validation/','tests/engine.test.mjs','scripts/build_pages.py'])assert.equal((await fetch(site.url+internal)).status,404,internal);
    assert.equal((await fetch(site.origin+'/src/app.mjs')).status,404);
    assert.equal((await fetch(site.origin+'/cerconexo')).url,site.url);
  }finally{await site.close();}
});
