import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Huellas del texto reglamentario publicado en 0b7f046, sin etiquetas ni espacios de formato.
const normalize=s=>s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
for(const [mode,file,pattern,expected] of [
 ['Clásico','clasico/index.html',/<dialog id="completeRules"[\s\S]*?(<ol>[\s\S]*?<\/ol>)/,'dc618d55c226b503d0f2b0350001073ee4ff81c1dcf1c30d667ff94c432c2b4d'],
 ['Arena','arena/index.html',/<div class="dialog-body rules-content">([\s\S]*?)<\/div><\/dialog>/,'b058de25f5798d9a8533f20c458bbc923a1dedb5e1eb0650a30c003896a1d927']
])test(`M4.1: reglamento completo de ${mode} conserva todo el texto publicado`,async()=>{
 const html=await readFile(new URL('../'+file,import.meta.url),'utf8'),rules=html.match(pattern)?.[1];assert.ok(rules);
 assert.equal(createHash('sha256').update(normalize(rules)).digest('hex'),expected);
 const doc=await readFile(new URL('../REGLAMENTO.md',import.meta.url),'utf8');
 for(const sentence of normalize(rules).split(/(?<=\.) /).filter(s=>s.length>40))assert.ok(normalize(doc).includes(sentence),sentence);
});
