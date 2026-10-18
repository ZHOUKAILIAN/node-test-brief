import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTests } from '../src/runner.mjs';

test('infrastructure diagnostics survive truncation of many long test failures',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'brief-priority-'));
  const logs=await mkdtemp(join(tmpdir(),'brief-priority-logs-'));
  await writeFile(join(cwd,'package.json'),JSON.stringify({type:'module'}));
  await writeFile(join(cwd,'case.test.js'),`import test from'node:test';import{rmSync,mkdirSync}from'node:fs';rmSync(${JSON.stringify(join(logs,'command.json'))});mkdirSync(${JSON.stringify(join(logs,'command.json'))});for(let i=0;i<12;i++)test('long failure '+i,()=>{throw new Error('x'.repeat(12000))});`);
  try{
    const r=await runTests({cwd,files:['case.test.js'],logDirectory:logs});
    assert.equal(r.ok,false);assert.notEqual(r.exitCode,0);assert.equal(r.report.failed,12);
    assert.ok(r.summary.length<=8000);assert.match(r.summary,/summary budget reached/);
    assert.match(r.summary,/Final metadata log write failure/);assert.ok(r.summary.includes(logs));
    assert.ok(r.summary.indexOf('Final metadata log write failure')<r.summary.indexOf('\nFAIL long failure'));
  }finally{await rm(cwd,{recursive:true,force:true});await rm(logs,{recursive:true,force:true});}
});
