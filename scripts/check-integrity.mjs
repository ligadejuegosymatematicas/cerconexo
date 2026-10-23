import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const reference=JSON.parse(await readFile(new URL('scripts/frozen-files.json',root),'utf8'));
for(const [name,expected] of Object.entries(reference.files)){
  const hash=createHash('sha256').update(await readFile(new URL(name,root))).digest('hex');
  assert.equal(hash,expected,`Módulo protegido modificado: ${name}`);
}
console.log(JSON.stringify({ok:true,baseline:reference.baseline,protectedFiles:Object.keys(reference.files).length,
  classicEngine:reference.files['src/engine.mjs'],arenaEngine:reference.files['arena/src/engine.mjs']},null,2));
