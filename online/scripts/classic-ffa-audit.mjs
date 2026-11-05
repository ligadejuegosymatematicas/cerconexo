import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),base='99156eb3b61142e32f9749189f72d0e12f3cf9e8';
const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root,windowsHide:true});
assert.equal(git('branch','--show-current').toString().trim(),'m6-clasico-ffa');
assert.equal(git('merge-base','HEAD',base).toString().trim(),base);
const native=git('ls-tree','-r','--name-only',base,'--','src','arena/src','arena/assets').toString().trim().split(/\r?\n/);
for(const file of native)assert.deepEqual(await readFile(new URL(file,root)),git('show',base+':'+file),file);
const frozen=JSON.parse(await readFile(new URL('scripts/frozen-files.json',root)));
for(const[file,hash]of Object.entries(frozen.files))assert.equal(createHash('sha256').update(await readFile(new URL(file,root))).digest('hex'),hash,file);
const configs=git('ls-tree','-r','--name-only',base,'--','online').toString().trim().split(/\r?\n/).filter(file=>/wrangler.*\.jsonc$|package(?:-lock)?\.json$/.test(file));
for(const file of [...configs,'.github/workflows/verificar.yml'])assert.deepEqual(await readFile(new URL(file,root)),git('show',base+':'+file),file);
const publication=process.argv.includes('--publication');
const config=await import('../config.mjs');assert.equal(config.CLASSIC_FFA_ENABLED,publication);
assert.equal(config.ARENA_DUO_ENABLED,true);assert.equal(config.ARENA_1V1_ENABLED,true);assert.equal(config.ARENA_FFA_ENABLED,true);
const files=JSON.parse(await readFile(new URL('scripts/pages-files.json',root))),all=['.nojekyll',...files];
assert.equal(new Set(all).size,all.length);
for(const file of files){
  assert.ok(!/node_modules|\.state|\.env|wrangler|online\/(src|scripts|tests|evidence)\//.test(file),file);
  const bytes=await readFile(new URL(file,root));assert.deepEqual(await readFile(new URL('docs/'+file,root)),bytes,file);
  if(/\.(mjs|html|css)$/.test(file))assert.doesNotMatch(bytes.toString(),/PILOT_ADMISSION|BETA_OPERATOR|CF_API_TOKEN|CLOUDFLARE_API_TOKEN|BEGIN (?:RSA |EC )?PRIVATE KEY/,file);
}
async function tree(dir,prefix=''){const names=[];for(const item of await readdir(dir,{withFileTypes:true})){const name=prefix+item.name;if(item.isDirectory())names.push(...await tree(new URL(item.name+'/',dir),name+'/'));else names.push(name);}return names;}
assert.deepEqual((await tree(new URL('docs/',root))).sort(),all.sort());
const tracked=git('ls-files','--cached','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
assert.ok(tracked.every(n=>!/^online\/(node_modules|\.state|\.wrangler|evidence|\.env|\.dev\.vars)(\/|$)/.test(n)));
const report={ok:true,base,branch:'m6-clasico-ffa',protected:Object.keys(frozen.files).length,nativeFilesByteIdentical:native.length,
  cloudflareConfigurationsByteIdentical:configs,publicInventory:all.length,noRuntimeOrSecretsInPublicInventory:true,
  newModePubliclyDisabled:!publication,publishedModesEnabled:true,networkRequests:0};
await mkdir(new URL('../evidence/classic-ffa/',import.meta.url),{recursive:true});
await writeFile(new URL('../evidence/classic-ffa/audit.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
