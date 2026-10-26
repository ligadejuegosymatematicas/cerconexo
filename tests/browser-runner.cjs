const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/integration/suites');fs.mkdirSync(out,{recursive:true});
const all=['pages','phase2a','phase2b','phase3a','phase3b','phase4','phase5a','phase5b','modes','committed','m2','m2-review','selector-final'].map(n=>'tests/'+n+'.browser.cjs').concat(['arena/tests/browser.cjs','arena/tests/m3b.browser.cjs','tests/unified.browser.cjs','tests/platform.browser.cjs','tests/m4.browser.cjs','tests/m41.browser.cjs','tests/m42.browser.cjs']);
all.push('arena/tests/cpu.browser.cjs');
const files=process.argv.slice(2).length?process.argv.slice(2):all;
(async()=>{const summary=path.join(out,'summary.json');
 const previous=fs.existsSync(summary)?JSON.parse(fs.readFileSync(summary,'utf8')):[];
 const report=previous.filter(r=>!files.includes(r.file));for(const file of files){
  const name=file.replaceAll('/','-').replace(/\.cjs$/,''),start=Date.now();
  const log=fs.createWriteStream(path.join(out,name+'.log'));
  const child=spawn(process.execPath,[file],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});await new Promise(r=>log.end(r));
  report.push({file,code,seconds:Math.round((Date.now()-start)/100)/10});console.log(`${code===0?'PASS':'FAIL'} ${file} (${report.at(-1).seconds}s)`);
  report.sort((a,b)=>all.indexOf(a.file)-all.indexOf(b.file));fs.writeFileSync(summary,JSON.stringify(report,null,2));
  if(code!==0)console.error(fs.readFileSync(path.join(out,name+'.log'),'utf8').slice(-6000));
 }if(report.some(r=>r.code!==0))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
