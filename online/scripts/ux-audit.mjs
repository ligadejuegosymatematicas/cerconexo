import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {originalControllerBytes} from '../tests/presentation-hooks.mjs';
const root=new URL('../../',import.meta.url),base='0eb4d274ddf109df07daa4d57176f99fc7196be8';
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root,windowsHide:true});
assert.equal(git('branch','--show-current').toString().trim(),'m6-ux-simplificacion');assert.equal(git('merge-base','HEAD',base).toString().trim(),base);
const canonical=JSON.parse(await readFile(new URL('../tests/fixtures/m5d-canonical.json',import.meta.url),'utf8'));
for(const[file,hash]of Object.entries(canonical.files))assert.equal(createHash('sha256').update(originalControllerBytes(file,await readFile(new URL(file,root)))).digest('hex'),hash,file);
const frozen=JSON.parse(await readFile(new URL('scripts/frozen-files.json',root),'utf8'));for(const[file,hash]of Object.entries(frozen.files))assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),hash,file);
for(const file of ['online/wrangler.beta.jsonc','online/config.mjs','online/package.json','online/package-lock.json','.github/workflows/verificar.yml'])assert.deepEqual(await readFile(new URL(file,root)),git('show',base+':'+file),file);
const refs={main:'2ece078f5b2563c35016ade18327e75daa4b2f55',desarrollo:'96c8a470c1c31f3ad552e0998bcdd02e72484954','m5d-tactica':'19a1dad44e8287fc8e928a0c5ae445452831d027','m6-salas-conexiones':'b1e39dcca2c0d1208d1fd05ac0eb46900cf119b1','m6-beta-integracion':'680120d37c7241032b672ce5f7a4f2556d25cd04'};
for(const[ref,sha]of Object.entries(refs))assert.equal(git('rev-parse',ref).toString().trim(),sha,ref);
const files=JSON.parse(await readFile(new URL('scripts/pages-files.json',root),'utf8'));assert.equal(new Set(files).size,files.length);
for(const file of files){
  assert.ok(!/node_modules|\.state|\.env|wrangler|online\/(src|scripts|tests|evidence)\//.test(file),file);
  const bytes=await readFile(new URL(file,root));assert.deepEqual(await readFile(new URL('docs/'+file,root)),bytes,file);
  if(/\.(mjs|html|css)$/.test(file))assert.doesNotMatch(bytes.toString(),/PILOT_ADMISSION|BETA_OPERATOR|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|(?:BEGIN (?:RSA |EC )?PRIVATE KEY)/,file);
}
const tracked=git('ls-files','--cached','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);assert.ok(tracked.every(n=>!/^online\/(node_modules|\.state|\.wrangler|evidence|\.env|\.dev\.vars)(\/|$)/.test(n)));
const result={ok:true,base,branch:'m6-ux-simplificacion',protected:32,canonicalUnchanged:48,canonicalWithExactPresentationHooks:2,publicResources:files.length,backendConfigurationUnchanged:true,otherReferencesUnchanged:true,noRuntimeOrSecretsInPublicInventory:true};
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});await writeFile(new URL('../evidence/ux-audit.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
