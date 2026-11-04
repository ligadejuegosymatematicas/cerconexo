import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {originalMedalControllerBytes} from '../tests/presentation-hooks.mjs';
const root=new URL('../../',import.meta.url),base='d3ccc84e4b3b91287124ed3419cb7ec294ac2bbe';
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root,windowsHide:true});
assert.equal(git('branch','--show-current').toString().trim(),'m6-arena-duo');
assert.equal(git('merge-base','HEAD',base).toString().trim(),base);
const canonical=JSON.parse(await readFile(new URL('../tests/fixtures/m5d-canonical.json',import.meta.url)));
for(const file of Object.keys(canonical.files))assert.deepEqual(originalMedalControllerBytes(file,await readFile(new URL(file,root))),git('show',base+':'+file),file);
const frozen=JSON.parse(await readFile(new URL('scripts/frozen-files.json',root)));
for(const[file,hash]of Object.entries(frozen.files))assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),hash,file);
for(const file of ['online/wrangler.beta.jsonc','online/package.json','online/package-lock.json','.github/workflows/verificar.yml'])assert.deepEqual(await readFile(new URL(file,root)),git('show',base+':'+file),file);
const config=await readFile(new URL('online/config.mjs',root),'utf8');
assert.equal(config,git('show',base+':online/config.mjs').toString()+'// Merge the Pages release only once the public backend advertises duo-online.\nexport const ARENA_DUO_ENABLED = true;\n');
const files=JSON.parse(await readFile(new URL('scripts/pages-files.json',root))),all=['.nojekyll',...files];
assert.equal(new Set(all).size,all.length);assert.equal(all.length,83);
for(const file of files){
  assert.ok(!/node_modules|\.state|\.env|wrangler|online\/(src|scripts|tests|evidence)\//.test(file),file);
  const bytes=await readFile(new URL(file,root));assert.deepEqual(await readFile(new URL('docs/'+file,root)),bytes,file);
  if(/\.(mjs|html|css)$/.test(file))assert.doesNotMatch(bytes.toString(),/PILOT_ADMISSION|BETA_OPERATOR|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|BEGIN (?:RSA |EC )?PRIVATE KEY/,file);
}
async function tree(dir,prefix=''){const names=[];for(const item of await readdir(dir,{withFileTypes:true})){const name=prefix+item.name;if(item.isDirectory())names.push(...await tree(new URL(item.name+'/',dir),name+'/'));else names.push(name);}return names;}
assert.deepEqual((await tree(new URL('docs/',root))).sort(),all.sort());
const tracked=git('ls-files','--cached','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
assert.ok(tracked.every(n=>!/^online\/(node_modules|\.state|\.wrangler|evidence|\.env|\.dev\.vars)(\/|$)/.test(n)));
const result={ok:true,base,branch:'m6-arena-duo',protected:Object.keys(frozen.files).length,canonicalVerified:Object.keys(canonical.files).length,canonicalWithMedalHooks:1,publicResources:all.length,cloudflareConfigurationUnchanged:true,arenaReleaseFlag:true,noRuntimeOrSecretsInPublicInventory:true};
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});await writeFile(new URL('../evidence/arena-audit.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
