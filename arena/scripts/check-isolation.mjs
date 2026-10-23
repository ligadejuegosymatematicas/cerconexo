import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const baseline='c4be59597f38fa2fa1d1f7c11ea87e177873948c';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=git('ls-tree','-r','--name-only',baseline).split('\n').filter(p=>p!=='.gitignore');
const hashes={};
for(const file of files){
  const actual=fs.readFileSync(path.join(root,file));
  const original=execFileSync('git',['show',`${baseline}:${file}`],{cwd:root,maxBuffer:10*1024*1024});
  assert.deepEqual(actual,original,`Premium fue modificado: ${file}`);hashes[file]=hash(actual);
}
assert.equal(git('rev-parse','--abbrev-ref','HEAD'),'desarrollo');
assert.equal(git('rev-parse','main'),'2ece078f5b2563c35016ade18327e75daa4b2f55');
const changes=git('diff','--name-only',baseline).split('\n').filter(Boolean);
assert.ok(changes.every(p=>p==='.gitignore'||p.startsWith('arena/')),'Cambio fuera de Arena');
const publicFiles=JSON.parse(fs.readFileSync(path.join(root,'scripts/pages-files.json'),'utf8'));
assert.ok(publicFiles.every(p=>!p.startsWith('arena/')));
const proof={ok:true,baseline,checkedPremiumFiles:files.length,localMain:git('rev-parse','main'),publicResources:publicFiles.length+1,hashes};
fs.mkdirSync(path.join(root,'arena/evidence'),{recursive:true});fs.writeFileSync(path.join(root,'arena/evidence/premium-isolation.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({ok:true,checkedPremiumFiles:files.length,publicResources:proof.publicResources,engineSha256:hashes['src/engine.mjs'],localMain:proof.localMain},null,2));
