import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTests } from '../src/runner.mjs';

test('secondary metadata failures do not override timeout or cancellation exit codes',async()=>{
  for(const kind of ['timeout','cancel']){
    const cwd=await mkdtemp(join(tmpdir(),'brief-combined-'));
    const logs=await mkdtemp(join(tmpdir(),'brief-combined-logs-'));
    await writeFile(join(cwd,'package.json'),JSON.stringify({type:'module'}));
    await writeFile(join(cwd,'case.test.js'),`import test from'node:test';import{rmSync,mkdirSync,writeFileSync}from'node:fs';test('active after metadata corruption',async()=>{rmSync(${JSON.stringify(join(logs,'command.json'))});mkdirSync(${JSON.stringify(join(logs,'command.json'))});writeFileSync('ready','1');await new Promise(r=>setTimeout(r,30000));});`);
    const controller=new AbortController();
    try{
      const promise=runTests({cwd,files:['case.test.js'],logDirectory:logs,timeoutMs:kind==='timeout'?3000:10000,signal:controller.signal});
      let ready=false;const deadline=Date.now()+8000;
      while(Date.now()<deadline){try{await readFile(join(cwd,'ready'));ready=true;break;}catch{await new Promise(r=>setTimeout(r,25));}}
      assert.equal(ready,true);
      if(kind==='cancel')controller.abort('SIGTERM');
      const result=await promise;
      assert.equal(result.ok,false);assert.equal(result.exitCode,kind==='timeout'?124:143);
      assert.match(result.summary,/Final metadata log write failure/);assert.equal(result.logsDir,logs);
      assert.match(result.summary,kind==='timeout'?/exit=124.*timeout/:/exit=143/);
    }finally{controller.abort();await rm(cwd,{recursive:true,force:true});await rm(logs,{recursive:true,force:true});}
  }
});
